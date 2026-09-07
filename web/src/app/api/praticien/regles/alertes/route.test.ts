import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: { supplementSafetyAlert: { create: vi.fn(), findMany: vi.fn() } },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { MESSAGE_ALERTE_MAX, NIVEAU_ALERTE_MAX } from '@/lib/supplement-library/gouvernance';
import { GET, POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/regles/alertes';

function requete(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ALERTE = {
  code: 'levure_riz_rouge',
  messageFr: 'Monacoline K : interaction avec les statines, avis ANSES 2014.',
  niveauAlerte: 'orange',
};

describe('POST /api/praticien/regles/alertes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.supplementSafetyAlert.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'alerte_1', ...data }),
    );
  });

  it('refuse sans session, et drapeau éteint, sans rien écrire', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST(requete(ALERTE))).status).toBe(401);

    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    delete process.env.WN_C4_ENABLED;
    const res = await POST(requete(ALERTE));
    expect(res.status).toBe(404);
    expect(prisma.supplementSafetyAlert.create).not.toHaveBeenCalled();
  });

  it('crée l’alerte, champs détourés', async () => {
    const res = await POST(requete({
      code: '  levure_riz_rouge  ', messageFr: `  ${ALERTE.messageFr}  `, niveauAlerte: ' orange ',
    }));
    expect(res.status).toBe(201);
    expect(prisma.supplementSafetyAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: ALERTE }),
    );
  });

  // LE MESSAGE EST SERVI TEL QUEL AU PRATICIEN quand l'alerte refuse : une
  // alerte sans message refuserait sans dire quoi.
  it('refuse une alerte sans message', async () => {
    for (const messageFr of ['', '   ', undefined, 'a'.repeat(MESSAGE_ALERTE_MAX + 1)]) {
      const res = await POST(requete({ ...ALERTE, messageFr }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { reason: string }).reason).toBe('message_requis');
    }
    expect(prisma.supplementSafetyAlert.create).not.toHaveBeenCalled();
  });

  // LE NIVEAU EST EXIGÉ, PAS CONTRAINT : aucune échelle n'est définie dans le
  // dépôt, et en poser une ici inventerait une gradation clinique. Le banc
  // épingle donc l'exigence, jamais une liste de valeurs.
  it('exige un niveau non vide, sans imposer d’échelle', async () => {
    const vide = await POST(requete({ ...ALERTE, niveauAlerte: '  ' }));
    expect(vide.status).toBe(400);
    expect(((await vide.json()) as { reason: string }).reason).toBe('niveau_requis');

    const trop = await POST(requete({ ...ALERTE, niveauAlerte: 'a'.repeat(NIVEAU_ALERTE_MAX + 1) }));
    expect(trop.status).toBe(400);
    expect(((await trop.json()) as { reason: string }).reason).toBe('niveau_requis');

    // Une valeur hors du seul mot qu'on croise dans le code passe : c'est le
    // point — la route ne prétend pas connaître l'échelle.
    expect((await POST(requete({ ...ALERTE, niveauAlerte: 'vigilance renforcée' }))).status).toBe(201);
  });

  it('refuse un code hors vocabulaire gouverné, et traduit le doublon en 409', async () => {
    const mauvais = await POST(requete({ ...ALERTE, code: 'Levure-Riz-Rouge' }));
    expect(mauvais.status).toBe(400);
    expect(((await mauvais.json()) as { reason: string }).reason).toBe('code_invalide');

    prisma.supplementSafetyAlert.create.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 'P2002' }),
    );
    const doublon = await POST(requete(ALERTE));
    expect(doublon.status).toBe(409);
    expect(((await doublon.json()) as { reason: string }).reason).toBe('code_deja_pris');
  });

  // UNE ALERTE NAÎT ACTIVE, et rien ici ne la retire : la retirer est un geste
  // distinct, qui demande sa propre trace.
  it('n’accepte pas `actif` du client', async () => {
    await POST(requete({ ...ALERTE, actif: false }));
    const data = prisma.supplementSafetyAlert.create.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['code', 'messageFr', 'niveauAlerte']);
  });

  // Le GET n'est pas qu'une commodité : c'est par lui que le praticien constate
  // que le catalogue EXISTE — et c'est ce constat que
  // `deciderIntentionAvantBiologie` exige avant de proposer quoi que ce soit.
  it('GET ne sert que les alertes ACTIVES, et suit les mêmes portes', async () => {
    prisma.supplementSafetyAlert.findMany.mockResolvedValue([]);
    expect((await GET()).status).toBe(200);
    expect(prisma.supplementSafetyAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actif: true }, orderBy: { code: 'asc' } }),
    );

    getServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    delete process.env.WN_C4_ENABLED;
    expect((await GET()).status).toBe(404);
  });
});
