import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => {
  const prismaMock = {
    clinicalRule: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      // Jamais utilisés par une révision — leur absence d'appel est un
      // invariant testé (append-only : on ne modifie RIEN en place).
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    supplementSourceReference: { findUnique: vi.fn() },
    supplementIngredientForme: { findUnique: vi.fn() },
    clinicalCriterion: { findUnique: vi.fn() },
    // `rag_corpus_claims` est SQL-brut hors `schema.prisma` : la validité du
    // claim fondateur se lit en requête brute ([[D-140]]).
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { getServerSession: vi.fn(), prisma: prismaMock };
});

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/regles/revision';

const ORIGINE = {
  id: 'regle_1',
  intentTagId: 'tag_sommeil',
  ingredientId: 'ing_mag',
  typeRegle: 'recommande',
  poids: 7,
};

const CREEE = {
  id: 'regle_2',
  typeRegle: 'recommande',
  poids: 7,
  justification: 'Justification révisée.',
  doseCibleBasse: null,
  doseCibleHaute: null,
  gradePreuveScientifique: 'fort',
  claimId: 'WN-CL-2026-001',
  versionClaim: 'v1.0',
  versionRegle: 3,
  actif: true,
  creeLe: new Date('2026-07-24T10:00:00.000Z'),
  validePar: null,
  valideLe: null,
  intentTagId: 'tag_sommeil',
  ingredientId: 'ing_mag',
  intentTag: { id: 'tag_sommeil', code: 'sommeil_fragmente', labelFr: 'Sommeil fragmenté', categorie: 'sommeil' },
  ingredient: { id: 'ing_mag', code: 'magnesium', nomFr: 'Magnésium' },
  formePreferee: null,
  sourceReference: { id: 'src_1', citation: 'Revue Micronutrition, 2024', lienUrl: null },
};

const CORPS = {
  regleId: 'regle_1',
  gradePreuveScientifique: 'fort',
  justification: 'Justification révisée.',
  sourceReferenceId: 'src_1',
  claimId: 'WN-CL-2026-001',
  versionClaim: 'v1.0',
};

function requete(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/praticien/regles/revision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    prisma.clinicalRule.findUnique.mockResolvedValue(ORIGINE);
    prisma.clinicalRule.findFirst.mockResolvedValue(null);
    prisma.clinicalRule.aggregate.mockResolvedValue({ _max: { versionRegle: 2 } });
    prisma.clinicalRule.create.mockResolvedValue(CREEE);
    prisma.supplementSourceReference.findUnique.mockResolvedValue({ id: 'src_1', actif: true });
    // Le claim du corps de révision est VALIDE au corpus, sauf mention contraire.
    prisma.$queryRaw.mockResolvedValue([
      { claim_id: 'WN-CL-2026-001', version_claim: 'v1.0' },
    ]);
  });

  it('exige une session et le drapeau C4', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST(requete(CORPS))).status).toBe(401);

    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    delete process.env.WN_C4_ENABLED;
    expect((await POST(requete(CORPS))).status).toBe(404);
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('crée la version suivante EN BROUILLON — sans jamais éditer la règle d’origine', async () => {
    const reponse = await POST(requete(CORPS));
    expect(reponse.status).toBe(201);
    const json = await reponse.json();
    expect(json.ok).toBe(true);
    expect(json.regle.versionRegle).toBe(3);
    expect(json.regle.statut).toBe('brouillon');

    // Nouvelle ligne : versionRegle = max(lignée) + 1, lignée héritée de
    // l'origine, poids repris à défaut, aucune signature posée.
    expect(prisma.clinicalRule.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.clinicalRule.create.mock.calls[0][0];
    expect(data).toMatchObject({
      intentTagId: 'tag_sommeil',
      ingredientId: 'ing_mag',
      typeRegle: 'recommande',
      versionRegle: 3,
      poids: 7,
      gradePreuveScientifique: 'fort',
      actif: true,
    });
    expect(data.validePar).toBeUndefined();
    expect(data.valideLe).toBeUndefined();

    // Append-only : AUCUNE écriture sur une ligne existante, dans la
    // transaction ou hors d'elle.
    expect(prisma.clinicalRule.update).not.toHaveBeenCalled();
    expect(prisma.clinicalRule.updateMany).not.toHaveBeenCalled();
    // Le tout se joue dans une transaction (lecture du plafond + création).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuse une révision quand un brouillon existe déjà dans la lignée', async () => {
    prisma.clinicalRule.findFirst.mockResolvedValue({ id: 'regle_brouillon' });
    const reponse = await POST(requete(CORPS));
    expect(reponse.status).toBe(409);
    expect((await reponse.json()).reason).toBe('brouillon_existant');
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('répond 404 sur une règle d’origine introuvable', async () => {
    prisma.clinicalRule.findUnique.mockResolvedValue(null);
    expect((await POST(requete(CORPS))).status).toBe(404);
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('applique les mêmes exigences de contenu que la création', async () => {
    expect((await POST(requete({ ...CORPS, gradePreuveScientifique: 'A' }))).status).toBe(400);
    expect((await POST(requete({ ...CORPS, justification: '' }))).status).toBe(400);
    expect((await POST(requete({ ...CORPS, sourceReferenceId: '' }))).status).toBe(400);
    // Le claim fondateur en fait partie ([[D-140]]) : une révision est une
    // réécriture COMPLÈTE, elle ne peut pas perdre en route ce que la base
    // exige — et perdre le claim ferait naître une règle sans fondement.
    expect((await POST(requete({ ...CORPS, claimId: '' }))).status).toBe(400);
    expect((await POST(requete({ ...CORPS, versionClaim: '' }))).status).toBe(400);
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  // Le claim se vérifie AVANT la transaction : rien ne s'ouvre pour une
  // révision qui ne peut pas aboutir.
  it('refuse un claim que le corpus ne valide pas, sans ouvrir de transaction', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const reponse = await POST(requete(CORPS));
    expect(reponse.status).toBe(422);
    expect((await reponse.json()).reason).toBe('claim_non_valide');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  // ── Les conditions, sur le chemin de RÉVISION ([[D-142]]) ─────────────────
  // Le formulaire n'envoyait aucune condition et la route écrivait l'ancien
  // champ : réviser une règle conditionnée à un critère la rendait
  // INCONDITIONNELLE, en silence. Le praticien croyait corriger une
  // justification ; il retirait une garde clinique.
  it('écrit le critère de la révision dans sa COLONNE, jamais dans l’ancien champ', async () => {
    prisma.clinicalCriterion.findUnique.mockResolvedValue({ id: 'crit_1', actif: true });
    await POST(requete({ ...CORPS, conditionCritereId: 'crit_1' }));
    const { data } = prisma.clinicalRule.create.mock.calls[0][0];
    expect(data.conditionCritereId).toBe('crit_1');
    expect(data).not.toHaveProperty('conditionSupplementaire');
  });

  // Une révision est une réécriture COMPLÈTE : ne pas renvoyer la condition la
  // retire. C'est le comportement voulu — mais il doit être un CHOIX du
  // praticien, pas un effet de bord du formulaire, qui la reprend désormais.
  it('retire la condition quand la révision n’en renvoie aucune', async () => {
    await POST(requete(CORPS));
    const { data } = prisma.clinicalRule.create.mock.calls[0][0];
    expect(data.conditionCritereId).toBeNull();
    expect(data.conditionBiologie).toBeUndefined();
  });

  it('refuse une condition biologique que le moteur jugerait illisible', async () => {
    const reponse = await POST(requete({
      ...CORPS,
      conditionBiologie: { type: 'biologie', cible: '  ' },
    }));
    expect(reponse.status).toBe(400);
    expect((await reponse.json()).reason).toBe('condition_biologie_invalide');
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('écrit le claim sur la version révisée', async () => {
    await POST(requete({ ...CORPS, claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' }));
    expect(prisma.clinicalRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' }),
      }),
    );
  });

  it('refuse une forme préférée hors de l’ingrédient de la lignée', async () => {
    prisma.supplementIngredientForme.findUnique.mockResolvedValue({
      id: 'forme_x',
      actif: true,
      ingredientId: 'ing_autre',
    });
    const reponse = await POST(requete({ ...CORPS, formePrefereeId: 'forme_x' }));
    expect(reponse.status).toBe(422);
    expect((await reponse.json()).reason).toBe('forme_invalide');
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });
});
