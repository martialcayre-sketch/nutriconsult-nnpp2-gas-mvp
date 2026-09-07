import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    clinicalRule: { updateMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/regles/desactivation';

const DESACTIVEE = {
  id: 'regle_2',
  typeRegle: 'recommande',
  poids: 1,
  justification: 'Justification sourcée.',
  doseCibleBasse: null,
  doseCibleHaute: null,
  gradePreuveScientifique: 'modere',
  versionRegle: 2,
  actif: false,
  creeLe: new Date('2026-07-20T10:00:00.000Z'),
  validePar: 'praticien@wellneuro.fr',
  valideLe: new Date('2026-07-21T00:00:00.000Z'),
  intentTagId: 'tag_sommeil',
  ingredientId: 'ing_mag',
  intentTag: { id: 'tag_sommeil', code: 'sommeil_fragmente', labelFr: 'Sommeil fragmenté', categorie: 'sommeil' },
  ingredient: { id: 'ing_mag', code: 'magnesium', nomFr: 'Magnésium' },
  formePreferee: null,
  sourceReference: { id: 'src_1', citation: 'Revue Micronutrition, 2024', lienUrl: null },
};

const CORPS = {
  regleId: 'regle_2',
  statutAttendu: 'validee',
  raison: 'Source supersédée par une méta-analyse plus récente.',
};

function requete(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/praticien/regles/desactivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.clinicalRule.updateMany.mockResolvedValue({ count: 1 });
    prisma.clinicalRule.findUnique.mockResolvedValue(DESACTIVEE);
  });

  it('exige une session avec e-mail et le drapeau C4', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST(requete(CORPS))).status).toBe(401);

    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    delete process.env.WN_C4_ENABLED;
    expect((await POST(requete(CORPS))).status).toBe(404);
    expect(prisma.clinicalRule.updateMany).not.toHaveBeenCalled();
  });

  it('exige une raison — une désactivation est un acte, pas un ménage', async () => {
    const sans = await POST(requete({ ...CORPS, raison: '   ' }));
    expect(sans.status).toBe(422);
    expect((await sans.json()).reason).toBe('raison_requise');
    expect(prisma.clinicalRule.updateMany).not.toHaveBeenCalled();
  });

  it('désactive une version validée par écriture CONDITIONNELLE (seul actif change)', async () => {
    const reponse = await POST(requete(CORPS));
    expect(reponse.status).toBe(200);
    const json = await reponse.json();
    expect(json.ok).toBe(true);
    expect(json.regle.statut).toBe('desactivee');
    // La signature de la version désactivée n'est PAS effacée (audit).
    expect(json.regle.validePar).toBe('praticien@wellneuro.fr');

    expect(prisma.clinicalRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'regle_2', actif: true, validePar: { not: null } },
      data: { actif: false },
    });
  });

  it('désactive un brouillon avec la garde d’état correspondante (signature nulle)', async () => {
    prisma.clinicalRule.findUnique.mockResolvedValue({
      ...DESACTIVEE,
      validePar: null,
      valideLe: null,
    });
    const reponse = await POST(
      requete({ ...CORPS, statutAttendu: 'brouillon', raison: 'Brouillon ouvert par erreur.' }),
    );
    expect(reponse.status).toBe(200);
    expect(prisma.clinicalRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'regle_2', actif: true, validePar: null },
      data: { actif: false },
    });
  });

  it('refuse de désactiver une règle déjà désactivée', async () => {
    const reponse = await POST(requete({ ...CORPS, statutAttendu: 'desactivee' }));
    expect(reponse.status).toBe(409);
    expect((await reponse.json()).reason).toBe('transition_invalide');
    expect(prisma.clinicalRule.updateMany).not.toHaveBeenCalled();
  });

  it('répond 409 etat_divergent quand l’état vu à l’écran a bougé, 404 si la règle a disparu', async () => {
    prisma.clinicalRule.updateMany.mockResolvedValue({ count: 0 });

    const divergent = await POST(requete(CORPS));
    expect(divergent.status).toBe(409);
    expect((await divergent.json()).reason).toBe('etat_divergent');

    prisma.clinicalRule.findUnique.mockResolvedValue(null);
    const disparue = await POST(requete(CORPS));
    expect(disparue.status).toBe(404);
    expect((await disparue.json()).reason).toBe('regle_introuvable');
  });
});
