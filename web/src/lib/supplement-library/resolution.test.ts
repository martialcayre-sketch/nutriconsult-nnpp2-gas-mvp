import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    clinicalIntentTag: { findMany: vi.fn() },
    clinicalRule: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { resoudreIntentions } from './resolution';

const tagSommeil = {
  id: 'tag_sommeil', code: 'sommeil_fragmente', labelFr: 'Sommeil fragmenté', categorie: 'sommeil',
};
const tagStress = {
  id: 'tag_stress', code: 'stress_chronique', labelFr: 'Stress chronique', categorie: 'stress',
};

function regle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'regle_mag_1',
    intentTagId: 'tag_sommeil',
    typeRegle: 'recommande',
    justification: 'Justification sourcée.',
    conditionSupplementaire: null,
    conditionBiologie: null,
    conditionCritere: null,
    claimId: 'WN-CL-2026-001',
    versionClaim: 'v1.0',
    doseCibleBasse: 100,
    doseCibleHaute: 300,
    gradePreuveScientifique: 'modere',
    versionRegle: 1,
    creeLe: new Date('2026-07-01T00:00:00.000Z'),
    validePar: 'praticien@wellneuro.fr',
    valideLe: new Date('2026-07-02T00:00:00.000Z'),
    ingredient: { id: 'ing_mag', code: 'magnesium', nomFr: 'Magnésium' },
    formePreferee: { id: 'forme_bisg', code: 'bisglycinate', labelFr: 'Bisglycinate' },
    sourceReference: { id: 'src_1', citation: 'Revue Micronutrition, 2024', lienUrl: null },
    ...overrides,
  };
}

describe('resoudreIntentions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    prisma.clinicalIntentTag.findMany.mockResolvedValue([]);
    prisma.clinicalRule.findMany.mockResolvedValue([]);
  });

  it('refuse toute résolution quand le drapeau C4 est absent ou faux (fail-closed)', async () => {
    delete process.env.WN_C4_ENABLED;
    await expect(resoudreIntentions(['sommeil_fragmente'])).rejects.toThrow(/WN_C4_ENABLED/);
    process.env.WN_C4_ENABLED = 'false';
    await expect(resoudreIntentions(['sommeil_fragmente'])).rejects.toThrow(/WN_C4_ENABLED/);
    expect(prisma.clinicalIntentTag.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalRule.findMany).not.toHaveBeenCalled();
  });

  it('ne requête rien pour une sélection vide', async () => {
    const resolution = await resoudreIntentions(['', '   ']);
    expect(resolution).toEqual({
      contractVersion: 'c4b-resolution-v1',
      intentions: [],
      codesInconnus: [],
      aucunScoreAgrege: true,
    });
    expect(prisma.clinicalIntentTag.findMany).not.toHaveBeenCalled();
  });

  it('déduplique les codes, ne lit que les intentions actives et avoue les codes inconnus', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    const resolution = await resoudreIntentions([
      'sommeil_fragmente', 'sommeil_fragmente', 'intention_inconnue',
    ]);
    expect(prisma.clinicalIntentTag.findMany).toHaveBeenCalledWith({
      where: { code: { in: ['sommeil_fragmente', 'intention_inconnue'] }, actif: true },
      select: { id: true, code: true, labelFr: true, categorie: true },
    });
    expect(resolution.codesInconnus).toEqual(['intention_inconnue']);
    expect(resolution.intentions).toHaveLength(1);
    expect(resolution.intentions[0].intention.code).toBe('sommeil_fragmente');
  });

  it('ne lit que les règles actives et ne sert que la dernière version active par lignée', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([
      regle({ id: 'regle_mag_v2', versionRegle: 2 }),
      regle({ id: 'regle_mag_v3', versionRegle: 3, doseCibleHaute: 200 }),
    ]);
    const resolution = await resoudreIntentions(['sommeil_fragmente']);
    expect(prisma.clinicalRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        intentTagId: { in: ['tag_sommeil'] },
        actif: true,
        validePar: { not: null },
        valideLe: { not: null },
      },
    }));
    expect(resolution.intentions[0].regles).toHaveLength(1);
    expect(resolution.intentions[0].regles[0]).toMatchObject({
      regleId: 'regle_mag_v3',
      versionRegle: 3,
      doseCibleHaute: 200,
      gradePreuve: 'modere',
    });
  });

  it('expose ingrédient, forme préférée, doses cibles, justification et source', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([regle()]);
    const [resolue] = (await resoudreIntentions(['sommeil_fragmente'])).intentions[0].regles;
    expect(resolue).toEqual({
      regleId: 'regle_mag_1',
      versionRegle: 1,
      typeRegle: 'recommande',
      ingredient: { id: 'ing_mag', code: 'magnesium', nomFr: 'Magnésium' },
      formePreferee: { id: 'forme_bisg', code: 'bisglycinate', labelFr: 'Bisglycinate' },
      doseCibleBasse: 100,
      doseCibleHaute: 300,
      gradePreuve: 'modere',
      justification: 'Justification sourcée.',
      conditionSupplementaire: null,
    conditionBiologie: null,
    conditionCritere: null,
      claim: { claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' },
      source: { id: 'src_1', citation: 'Revue Micronutrition, 2024', lienUrl: null },
      creeLe: '2026-07-01T00:00:00.000Z',
      validePar: 'praticien@wellneuro.fr',
      valideLe: '2026-07-02T00:00:00.000Z',
      regleValidee: true,
    });
  });

  // [[D-140]] — le COUPLE fait l'identité d'un claim. Une moitié seule ne
  // désigne rien d'unique au corpus : la référence est rendue ABSENTE, jamais
  // complétée. Le moteur refusera alors `claim_absent`, ce qui est le verdict
  // juste ; recopier `claimId` seul laisserait croire à un claim identifiable.
  it.each([
    ['claim sans version', { claimId: 'WN-CL-2026-001', versionClaim: null }],
    ['version sans claim', { claimId: null, versionClaim: 'v1.0' }],
    ['ni l’un ni l’autre', { claimId: null, versionClaim: null }],
  ])('rend une référence de claim dépareillée ABSENTE (%s)', async (_libelle, moities) => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([regle(moities)]);
    const [resolue] = (await resoudreIntentions(['sommeil_fragmente'])).intentions[0].regles;
    expect(resolue.claim).toBeNull();
  });

  it('exclut par défaut une règle active jamais validée (motif barrière D-003)', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([
      regle(),
      // Garde défensive : même si la requête laissait passer un brouillon,
      // il resterait exclu de la sélection par défaut.
      regle({
        id: 'regle_brouillon', versionRegle: 4, validePar: null, valideLe: null,
        ingredient: { id: 'ing_zinc', code: 'zinc', nomFr: 'Zinc' },
      }),
    ]);
    const resolution = await resoudreIntentions(['sommeil_fragmente']);
    expect(prisma.clinicalRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        intentTagId: { in: ['tag_sommeil'] },
        actif: true,
        validePar: { not: null },
        valideLe: { not: null },
      },
    }));
    expect(resolution.intentions[0].regles.map(r => r.regleId)).toEqual(['regle_mag_1']);
    expect(resolution.intentions[0].regles[0].regleValidee).toBe(true);
  });

  it('la dernière version validée reste servie même si une version brouillon plus récente existe', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([
      regle({ id: 'regle_mag_v2', versionRegle: 2 }),
      regle({ id: 'regle_mag_v3_brouillon', versionRegle: 3, validePar: null, valideLe: null }),
    ]);
    const resolution = await resoudreIntentions(['sommeil_fragmente']);
    // Le filtre s'applique AVANT la sélection de lignée : le brouillon v3 ne
    // masque pas la dernière version validée v2.
    expect(resolution.intentions[0].regles.map(r => r.regleId)).toEqual(['regle_mag_v2']);
  });

  it('n\'inclut les règles non validées que sur option explicite, marquées regleValidee: false', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([
      regle(),
      regle({
        id: 'regle_brouillon', validePar: null, valideLe: null,
        ingredient: { id: 'ing_zinc', code: 'zinc', nomFr: 'Zinc' },
      }),
    ]);
    const resolution = await resoudreIntentions(['sommeil_fragmente'], { inclureNonValidees: true });
    // Option de prévisualisation atelier : la requête ne filtre plus sur la validation.
    expect(prisma.clinicalRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { intentTagId: { in: ['tag_sommeil'] }, actif: true },
    }));
    expect(resolution.intentions[0].regles.map(r => [r.regleId, r.regleValidee])).toEqual([
      ['regle_mag_1', true],
      ['regle_brouillon', false],
    ]);
  });

  it('garde un ordre neutre : intentions dans l\'ordre demandé, règles alphabétiques par ingrédient', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil, tagStress]);
    prisma.clinicalRule.findMany.mockResolvedValue([
      regle({
        id: 'regle_zinc', intentTagId: 'tag_stress', gradePreuveScientifique: 'fort',
        ingredient: { id: 'ing_zinc', code: 'zinc', nomFr: 'Zinc' },
      }),
      regle({
        id: 'regle_ashwagandha', intentTagId: 'tag_stress', gradePreuveScientifique: 'faible',
        ingredient: { id: 'ing_ashw', code: 'ashwagandha', nomFr: 'Ashwagandha' },
      }),
    ]);
    const resolution = await resoudreIntentions(['stress_chronique', 'sommeil_fragmente']);
    expect(resolution.intentions.map(entree => entree.intention.code))
      .toEqual(['stress_chronique', 'sommeil_fragmente']);
    // Le grade « fort » du zinc ne le fait pas remonter : ordre alphabétique.
    expect(resolution.intentions[0].regles.map(r => r.ingredient.code))
      .toEqual(['ashwagandha', 'zinc']);
  });

  it('ne produit aucun score agrégé ni champ de classement', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([regle()]);
    const resolution = await resoudreIntentions(['sommeil_fragmente']);
    expect(resolution.aucunScoreAgrege).toBe(true);
    expect(JSON.stringify(resolution))
      .not.toMatch(/"(score|scoreAgrege|poids|rang|classement|meilleurChoix)":/i);
  });

  it('refuse l\'échelle A/B/C/D du moteur d\'équilibre — jamais mélangée à l\'échelle GRADE', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([regle({ gradePreuveScientifique: 'B' })]);
    await expect(resoudreIntentions(['sommeil_fragmente'])).rejects.toThrow(/A\/B\/C\/D/);
  });

  it('refuse un grade de preuve hors échelle GRADE', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([regle({ gradePreuveScientifique: 'tres_fort' })]);
    await expect(resoudreIntentions(['sommeil_fragmente'])).rejects.toThrow(/échelle GRADE/);
  });

  it('normalise un grade accentué vers son code canonique', async () => {
    prisma.clinicalIntentTag.findMany.mockResolvedValue([tagSommeil]);
    prisma.clinicalRule.findMany.mockResolvedValue([regle({ gradePreuveScientifique: 'Modéré' })]);
    const resolution = await resoudreIntentions(['sommeil_fragmente']);
    expect(resolution.intentions[0].regles[0].gradePreuve).toBe('modere');
  });
});
