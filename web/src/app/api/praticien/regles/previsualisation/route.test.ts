import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, resoudreIntentions, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resoudreIntentions: vi.fn(),
  // Le contexte de décision se LIT en base ([[D-133]]) : catalogue d'alertes
  // publié ou non, seuils actifs de l'ingrédient. Les doubles rendent l'état de
  // la production — les deux tables sont vides.
  prisma: {
    supplementSafetyAlert: { count: vi.fn() },
    ingredientFunctionalThreshold: { findMany: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/supplement-library/resolution', () => ({ resoudreIntentions }));

import { POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/regles/previsualisation';

const RESOLUTION = {
  contractVersion: 'c4b-resolution-v1',
  intentions: [],
  codesInconnus: ['code_inconnu'],
  aucunScoreAgrege: true,
};

function requete(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/praticien/regles/previsualisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    resoudreIntentions.mockResolvedValue(RESOLUTION);
    // L'état de la production : catalogue d'alertes non publié, aucun seuil.
    prisma.supplementSafetyAlert.count.mockResolvedValue(0);
    prisma.ingredientFunctionalThreshold.findMany.mockResolvedValue([]);
  });

  it('exige une session et le drapeau C4 — fail-closed avant toute résolution', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST(requete({ codes: ['sommeil_fragmente'] }))).status).toBe(401);

    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    delete process.env.WN_C4_ENABLED;
    expect((await POST(requete({ codes: ['sommeil_fragmente'] }))).status).toBe(404);
    expect(resoudreIntentions).not.toHaveBeenCalled();
  });

  it('appelle la résolution AVEC inclureNonValidees — prévisualisation d’atelier seulement', async () => {
    const reponse = await POST(requete({ codes: ['sommeil_fragmente', 'stress_chronique'] }));
    expect(reponse.status).toBe(200);
    const json = await reponse.json();
    expect(json.ok).toBe(true);
    expect(json.resolution).toEqual(RESOLUTION);
    // LE contrat de cette route : les brouillons sortent, marqués — c'est la
    // seule surface autorisée à passer inclureNonValidees: true.
    expect(resoudreIntentions).toHaveBeenCalledWith(
      ['sommeil_fragmente', 'stress_chronique'],
      { inclureNonValidees: true },
    );
  });

  it('borne les codes (1 à 20, chaînes non vides)', async () => {
    expect((await POST(requete({ codes: [] }))).status).toBe(400);
    expect((await POST(requete({ codes: ['   '] }))).status).toBe(400);
    expect((await POST(requete({ codes: 'sommeil' }))).status).toBe(400);
    expect(
      (await POST(requete({ codes: Array.from({ length: 21 }, (_, i) => `code_${i}`) }))).status,
    ).toBe(400);
    expect(resoudreIntentions).not.toHaveBeenCalled();
  });

  it('répond 500 sans détail interne sur une exception de résolution', async () => {
    resoudreIntentions.mockRejectedValue(new Error('timeout base'));
    const reponse = await POST(requete({ codes: ['sommeil_fragmente'] }));
    expect(reponse.status).toBe(500);
    expect((await reponse.json()).error).toBe('Erreur technique.');
  });

  // ── LE MOTEUR A ENFIN UN APPELANT (`D-133`) ────────────────────────────────
  //
  // `deciderIntentionsAvantBiologie` n'était importé que par son propre banc.
  // Ici il tourne sur une vraie résolution, avec un contexte LU en base — et
  // rend ce qui est vrai aujourd'hui : le catalogue de décision est vide, donc
  // rien n'a été examiné, ce qui n'est PAS un feu vert.
  it('sert le verdict du moteur, et sur un catalogue vide c’est la sentinelle', async () => {
    const res = await POST(requete({ codes: ['sommeil_fragmente'] }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      verdicts: { verdict: string; cause?: string; motif: string }[];
    };
    expect(payload.verdicts).toHaveLength(1);
    expect(payload.verdicts[0].verdict).toBe('refus');
    expect(payload.verdicts[0].cause).toBe('catalogue_decision_vide');
    // Le motif dit la différence que tout ce rayon défend : « rien n'a été
    // examiné » n'est pas « aucune intention indiquée ».
    expect(payload.verdicts[0].motif).toContain('n’est pas un feu vert');
  });

  it('ne lit le contexte que sur les ingrédients que la résolution touche', async () => {
    await POST(requete({ codes: ['sommeil_fragmente'] }));
    // Résolution sans intention ⇒ aucun ingrédient ⇒ aucune lecture de seuils.
    expect(prisma.ingredientFunctionalThreshold.findMany).not.toHaveBeenCalled();
  });

});
