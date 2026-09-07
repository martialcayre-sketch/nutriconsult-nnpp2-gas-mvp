import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    clinicalRule: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    clinicalIntentTag: { findUnique: vi.fn() },
    supplementIngredient: { findUnique: vi.fn() },
    supplementIngredientForme: { findUnique: vi.fn() },
    supplementSourceReference: { findUnique: vi.fn() },
    clinicalCriterion: { findUnique: vi.fn() },
    // `rag_corpus_claims` est SQL-brut hors `schema.prisma` : la validité du
    // claim fondateur se lit en requête brute ([[D-140]]).
    $queryRaw: vi.fn(),
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { GET, POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/regles';

const LIGNE = {
  id: 'regle_1',
  typeRegle: 'recommande',
  poids: 1,
  justification: 'Justification sourcée.',
  conditionSupplementaire: null,
  doseCibleBasse: 100,
  doseCibleHaute: 300,
  gradePreuveScientifique: 'modere',
  claimId: 'WN-CL-2026-001',
  versionClaim: 'v1.0',
  versionRegle: 2,
  actif: true,
  creeLe: new Date('2026-07-20T10:00:00.000Z'),
  validePar: null,
  valideLe: null,
  intentTagId: 'tag_sommeil',
  ingredientId: 'ing_mag',
  intentTag: { id: 'tag_sommeil', code: 'sommeil_fragmente', labelFr: 'Sommeil fragmenté', categorie: 'sommeil' },
  ingredient: { id: 'ing_mag', code: 'magnesium', nomFr: 'Magnésium' },
  formePreferee: { id: 'forme_bisg', code: 'bisglycinate', labelFr: 'Bisglycinate' },
  sourceReference: { id: 'src_1', citation: 'Revue Micronutrition, 2024', lienUrl: null },
};

/** Version antérieure de la même lignée, validée puis supersédée (inactive). */
const LIGNEE_V1 = {
  id: 'regle_0',
  versionRegle: 1,
  gradePreuveScientifique: 'faible',
  justification: 'Ancienne justification.',
  validePar: 'praticien@wellneuro.fr',
  valideLe: new Date('2026-07-01T00:00:00.000Z'),
  creeLe: new Date('2026-06-20T00:00:00.000Z'),
  actif: false,
  intentTagId: 'tag_sommeil',
  ingredientId: 'ing_mag',
  typeRegle: 'recommande',
};

const CORPS_CREATION = {
  intentTagId: 'tag_sommeil',
  ingredientId: 'ing_mag',
  typeRegle: 'recommande',
  formePrefereeId: 'forme_bisg',
  doseCibleBasse: 100,
  doseCibleHaute: 300,
  gradePreuveScientifique: 'modere',
  justification: 'Justification sourcée.',
  sourceReferenceId: 'src_1',
  claimId: 'WN-CL-2026-001',
  versionClaim: 'v1.0',
};

function requetePost(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/praticien/regles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.clinicalRule.findMany.mockResolvedValue([]);
    prisma.clinicalRule.count.mockResolvedValue(0);
    prisma.clinicalIntentTag.findUnique.mockResolvedValue({ id: 'tag_sommeil', actif: true });
    prisma.supplementIngredient.findUnique.mockResolvedValue({ id: 'ing_mag', actif: true });
    prisma.supplementIngredientForme.findUnique.mockResolvedValue({
      id: 'forme_bisg',
      actif: true,
      ingredientId: 'ing_mag',
    });
    prisma.supplementSourceReference.findUnique.mockResolvedValue({ id: 'src_1', actif: true });
    // Le claim du corps de création est VALIDE au corpus, sauf mention contraire.
    prisma.$queryRaw.mockResolvedValue([
      { claim_id: 'WN-CL-2026-001', version_claim: 'v1.0' },
    ]);
    prisma.clinicalRule.create.mockResolvedValue(LIGNE);
  });

  it('exige une session (GET et POST)', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET(new Request(`${URL_BASE}?statut=brouillon`))).status).toBe(401);
    expect((await POST(requetePost(CORPS_CREATION))).status).toBe(401);
    expect(prisma.clinicalRule.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('répond 404 fail-closed quand WN_C4_ENABLED est éteint', async () => {
    delete process.env.WN_C4_ENABLED;
    const lecture = await GET(new Request(`${URL_BASE}?statut=brouillon`));
    expect(lecture.status).toBe(404);
    expect((await lecture.json()).reason).toBe('flag_eteint');
    expect((await POST(requetePost(CORPS_CREATION))).status).toBe(404);
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('liste les brouillons avec leur lignée et les compteurs', async () => {
    prisma.clinicalRule.findMany
      .mockResolvedValueOnce([LIGNE]) // page
      .mockResolvedValueOnce([LIGNEE_V1, { ...LIGNEE_V1, ...LIGNE, typeRegle: 'recommande' }]); // lignées
    prisma.clinicalRule.count
      .mockResolvedValueOnce(1) // total filtré
      .mockResolvedValueOnce(3) // brouillons
      .mockResolvedValueOnce(2) // validées
      .mockResolvedValueOnce(1); // désactivées

    const reponse = await GET(new Request(`${URL_BASE}?statut=brouillon&limit=20&offset=0`));
    expect(reponse.status).toBe(200);
    const json = await reponse.json();
    expect(json.ok).toBe(true);
    expect(json.total).toBe(1);
    expect(json.compteurs).toEqual({ brouillons: 3, validees: 2, desactivees: 1 });

    const [regle] = json.regles;
    expect(regle.statut).toBe('brouillon');
    expect(regle.versionRegle).toBe(2);
    expect(regle.gradePreuve).toBe('modere');
    expect(regle.intention.code).toBe('sommeil_fragmente');
    // La lignée accompagne la règle : la v1 supersédée, PAS la ligne elle-même.
    expect(regle.lignee).toHaveLength(1);
    expect(regle.lignee[0]).toMatchObject({
      versionRegle: 1,
      statut: 'desactivee',
      validePar: 'praticien@wellneuro.fr',
    });

    // Le filtre du statut « brouillon » = actif ET signature nulle.
    expect(prisma.clinicalRule.findMany.mock.calls[0][0].where).toMatchObject({
      actif: true,
      validePar: null,
    });
  });

  it('refuse statut, filtre et pagination invalides', async () => {
    expect((await GET(new Request(`${URL_BASE}?statut=publiee`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?intention=Pas%20Un%20Code`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?limit=0`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?limit=101`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?offset=-1`))).status).toBe(400);
  });

  it('crée une règle en BROUILLON, versionRegle = 1, sans signature', async () => {
    const reponse = await POST(requetePost(CORPS_CREATION));
    expect(reponse.status).toBe(201);
    const json = await reponse.json();
    expect(json.ok).toBe(true);

    expect(prisma.clinicalRule.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.clinicalRule.create.mock.calls[0][0];
    expect(data).toMatchObject({
      intentTagId: 'tag_sommeil',
      ingredientId: 'ing_mag',
      typeRegle: 'recommande',
      versionRegle: 1,
      actif: true,
      gradePreuveScientifique: 'modere',
      sourceReferenceId: 'src_1',
    });
    // Une règle NAÎT brouillon : la création ne pose jamais la signature.
    expect(data.validePar).toBeUndefined();
    expect(data.valideLe).toBeUndefined();
  });

  it('refuse l’échelle A/B/C/D — jamais confondue avec l’échelle GRADE', async () => {
    const reponse = await POST(requetePost({ ...CORPS_CREATION, gradePreuveScientifique: 'B' }));
    expect(reponse.status).toBe(400);
    const json = await reponse.json();
    expect(json.reason).toBe('grade_invalide');
    expect(json.error).toMatch(/moteur d.équilibre/);
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('exige justification et source', async () => {
    expect((await POST(requetePost({ ...CORPS_CREATION, justification: '  ' }))).status).toBe(400);
    expect((await POST(requetePost({ ...CORPS_CREATION, sourceReferenceId: '' }))).status).toBe(400);
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('refuse une forme préférée qui n’appartient pas à l’ingrédient', async () => {
    prisma.supplementIngredientForme.findUnique.mockResolvedValue({
      id: 'forme_bisg',
      actif: true,
      ingredientId: 'ing_autre',
    });
    const reponse = await POST(requetePost(CORPS_CREATION));
    expect(reponse.status).toBe(422);
    expect((await reponse.json()).reason).toBe('forme_invalide');
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  it('refuse des doses incohérentes (basse > haute)', async () => {
    const reponse = await POST(
      requetePost({ ...CORPS_CREATION, doseCibleBasse: 500, doseCibleHaute: 100 }),
    );
    expect(reponse.status).toBe(400);
    expect((await reponse.json()).reason).toBe('doses_invalides');
  });

  it('refuse un critère conditionnel inconnu ou inactif', async () => {
    prisma.clinicalCriterion.findUnique.mockResolvedValue(null);
    const inconnu = await POST(
      requetePost({ ...CORPS_CREATION, conditionCritereId: 'crit_x' }),
    );
    expect(inconnu.status).toBe(422);
    expect((await inconnu.json()).reason).toBe('critere_introuvable');
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  // ── Les deux conditions séparées, et ÉCRITES ([[D-142]]) ──────────────────
  // Le défaut que ces bancs ferment : les routes écrivaient l'ancien champ
  // `conditionSupplementaire`, que le moteur ne lit plus depuis `D-138`. Une
  // règle créée avec un critère naissait donc INCONDITIONNELLE à ses yeux.
  describe('conditions séparées', () => {
    it('écrit le critère dans sa COLONNE, jamais dans l’ancien champ', async () => {
      prisma.clinicalCriterion.findUnique.mockResolvedValue({ id: 'crit_1', actif: true });
      await POST(requetePost({ ...CORPS_CREATION, conditionCritereId: 'crit_1' }));
      const { data } = prisma.clinicalRule.create.mock.calls[0][0];
      expect(data.conditionCritereId).toBe('crit_1');
      expect(data).not.toHaveProperty('conditionSupplementaire');
    });

    it('écrit la condition biologique telle que le moteur la lira', async () => {
      await POST(requetePost({
        ...CORPS_CREATION,
        conditionBiologie: { type: 'biologie', cible: 'ferritine', echeance: '2026-03-01T00:00:00.000Z' },
      }));
      const { data } = prisma.clinicalRule.create.mock.calls[0][0];
      expect(data.conditionBiologie)
        .toEqual({ type: 'biologie', cible: 'ferritine', echeance: '2026-03-01T00:00:00.000Z' });
    });

    // LE POINT QUI COMPTE : la validation d'écriture est le lecteur MÊME du
    // moteur. Écrire ce qu'il appellerait « illisible » produirait une règle que
    // l'atelier accepte et que la décision refuse ensuite `condition_illisible`
    // — sans que l'écran permette de la corriger.
    it.each([
      ['cible vide', { type: 'biologie', cible: '   ' }],
      ['type inattendu', { type: 'clinique', cible: 'ferritine' }],
      ['échéance non ISO', { type: 'biologie', cible: 'ferritine', echeance: '2026-03-01' }],
      ['chaîne libre', 'quand la ferritine sera basse'],
    ])('refuse une condition biologique que le moteur jugerait illisible (%s)', async (_l, bio) => {
      const reponse = await POST(requetePost({ ...CORPS_CREATION, conditionBiologie: bio }));
      expect(reponse.status).toBe(400);
      expect((await reponse.json()).reason).toBe('condition_biologie_invalide');
      expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
    });

    it('accepte une règle sans aucune condition — les deux colonnes restent vides', async () => {
      await POST(requetePost(CORPS_CREATION));
      const { data } = prisma.clinicalRule.create.mock.calls[0][0];
      expect(data.conditionCritereId).toBeNull();
      expect(data.conditionBiologie).toBeUndefined();
    });
  });

  it('refuse de recréer une lignée existante : 409, la suite passe par une révision', async () => {
    prisma.clinicalRule.count.mockResolvedValue(2);
    const reponse = await POST(requetePost(CORPS_CREATION));
    expect(reponse.status).toBe(409);
    expect((await reponse.json()).reason).toBe('lignee_existante');
    expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
  });

  // ── Le claim fondateur ([[D-140]]) ────────────────────────────────────────
  // « Une plage fonctionnelle sans claim validé n'existe pas, donc n'est jamais
  // servie » : l'invariant des plages biologiques et des règles d'orientation,
  // que `clinical_rules` était seule à ne pas porter.
  describe('claim fondateur', () => {
    it.each([
      ['aucun des deux', {}],
      ['identifiant seul', { claimId: 'WN-CL-2026-001' }],
      ['version seule', { versionClaim: 'v1.0' }],
    ])('refuse une règle sans claim complet (%s)', async (_libelle, partiel) => {
      const { claimId: _c, versionClaim: _v, ...sansClaim } = CORPS_CREATION;
      const reponse = await POST(requetePost({ ...sansClaim, ...partiel }));
      expect(reponse.status).toBe(400);
      expect((await reponse.json()).reason).toBe('claim_requis');
      expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
    });

    // Le FORMAT est refusé sans interroger le corpus : une saisie manifestement
    // fausse ne mérite pas une requête, et le message dit quoi corriger.
    it.each([
      ['identifiant hors format', { claimId: 'CL-2026-001' }],
      ['version hors format', { versionClaim: 'premiere' }],
    ])('refuse un claim %s, sans interroger le corpus', async (_libelle, faux) => {
      const reponse = await POST(requetePost({ ...CORPS_CREATION, ...faux }));
      expect(reponse.status).toBe(400);
      expect((await reponse.json()).reason).toBe('claim_format_invalide');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
    });

    // BIEN FORMÉ NE VEUT PAS DIRE VALIDÉ : le corpus est la seule autorité.
    it('refuse un claim bien formé que le corpus ne valide pas', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const reponse = await POST(requetePost(CORPS_CREATION));
      expect(reponse.status).toBe(422);
      expect((await reponse.json()).reason).toBe('claim_non_valide');
      expect(prisma.clinicalRule.create).not.toHaveBeenCalled();
    });

    it('écrit le claim sur la règle créée', async () => {
      await POST(requetePost(CORPS_CREATION));
      expect(prisma.clinicalRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' }),
        }),
      );
    });
  });
});
