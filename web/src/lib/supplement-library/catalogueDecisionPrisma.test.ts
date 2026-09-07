import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    supplementSafetyAlert: { count: vi.fn() },
    ingredientFunctionalThreshold: { findMany: vi.fn() },
    critereDossierConstate: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma }));

import { lireCatalogueDecision } from './catalogueDecisionPrisma';

const ALERTE = {
  id: 'alerte_1',
  code: 'levure_riz_rouge',
  messageFr: 'Monacoline K : interaction avec les statines.',
  niveauAlerte: 'orange',
  actif: true,
};

function seuil(over: Record<string, unknown> = {}) {
  return {
    id: 'seuil_1',
    ingredientId: 'ing_1',
    seuilDoseBasse: 100,
    seuilDoseHaute: 300,
    unite: 'mg',
    basculeRisque: false,
    safetyAlertId: null,
    gradePreuveScientifique: 'modere',
    categorieFonctionnelle: { id: 'cat_1', code: 'antioxydant', labelFr: 'Antioxydant' },
    safetyAlert: null,
    sourceReference: { id: 'src_1', citation: 'Revue, 2024', lienUrl: null },
    ...over,
  };
}

describe('lireCatalogueDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.supplementSafetyAlert.count.mockResolvedValue(0);
    prisma.ingredientFunctionalThreshold.findMany.mockResolvedValue([]);
    prisma.critereDossierConstate.findMany.mockResolvedValue([]);
  });

  // LA GARDE EST AU NIVEAU CATALOGUE, PAS INGRÉDIENT (`D-056` arbitrage 2) :
  // zéro alerte ne prouve rien sur un ingrédient, mais prouve que le catalogue
  // n'existe pas.
  it('ne publie le catalogue d’alertes que s’il en existe une active', async () => {
    expect((await lireCatalogueDecision([])).catalogueAlertesPublie).toBe(false);

    prisma.supplementSafetyAlert.count.mockResolvedValue(1);
    expect((await lireCatalogueDecision([])).catalogueAlertesPublie).toBe(true);
    expect(prisma.supplementSafetyAlert.count).toHaveBeenLastCalledWith({ where: { actif: true } });
  });

  it('ne lit aucun seuil quand la résolution ne touche aucun ingrédient', async () => {
    const catalogue = await lireCatalogueDecision([]);
    expect(prisma.ingredientFunctionalThreshold.findMany).not.toHaveBeenCalled();
    expect(catalogue.seuilsParIngredient.size).toBe(0);
  });

  it('indexe les seuils actifs par ingrédient, bornés aux ingrédients demandés', async () => {
    prisma.ingredientFunctionalThreshold.findMany.mockResolvedValue([seuil()]);
    const catalogue = await lireCatalogueDecision(['ing_1']);
    expect(prisma.ingredientFunctionalThreshold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actif: true, ingredientId: { in: ['ing_1'] } } }),
    );
    expect(catalogue.seuilsParIngredient.get('ing_1')).toHaveLength(1);
    expect(catalogue.seuilsParIngredient.get('ing_1')?.[0].unite).toBe('mg');
  });

  // UNE ALERTE N'EST « ACTIVE SUR L'INGRÉDIENT » QUE PAR UN SEUIL QUI BASCULE :
  // sans `basculeRisque`, une alerte citée à titre documentaire refuserait
  // l'ingrédient entier.
  it('ne rend l’alerte active que si le seuil bascule le risque', async () => {
    prisma.ingredientFunctionalThreshold.findMany.mockResolvedValue([
      seuil({ safetyAlertId: 'alerte_1', safetyAlert: ALERTE, basculeRisque: false }),
    ]);
    expect((await lireCatalogueDecision(['ing_1'])).alertesParIngredient.size).toBe(0);

    prisma.ingredientFunctionalThreshold.findMany.mockResolvedValue([
      seuil({ safetyAlertId: 'alerte_1', safetyAlert: ALERTE, basculeRisque: true }),
    ]);
    const catalogue = await lireCatalogueDecision(['ing_1']);
    expect(catalogue.alertesParIngredient.get('ing_1')?.[0].code).toBe('levure_riz_rouge');
  });

  it('ignore une alerte jointe DÉSACTIVÉE, même sur un seuil qui bascule', async () => {
    prisma.ingredientFunctionalThreshold.findMany.mockResolvedValue([
      seuil({
        safetyAlertId: 'alerte_1',
        safetyAlert: { ...ALERTE, actif: false },
        basculeRisque: true,
      }),
    ]);
    const catalogue = await lireCatalogueDecision(['ing_1']);
    expect(catalogue.alertesParIngredient.size).toBe(0);
    expect(catalogue.seuilsParIngredient.get('ing_1')?.[0].safetyAlert).toBeNull();
  });

  // LES DEUX ENTRANTS NON DÉRIVABLES SONT RENDUS FERMÉS, JAMAIS INVENTÉS.
  // `claimsValides` : aucun lien règle ↔ claim n'existe au schéma. `declencheur`
  // : le tableau clinique appartient à un dossier, et l'atelier n'en a pas.
  it('rend les deux entrants non dérivables FERMÉS', async () => {
    const catalogue = await lireCatalogueDecision(['ing_1']);
    expect(catalogue.claimsValidesParRegle.size).toBe(0);
    expect(catalogue.declencheur).toEqual([]);
  });

  // [[D-138]] — LES CONSTATS DE CRITÈRES : lus seulement s'il y a un DOSSIER.
  // Hors dossier (prévisualisation d'atelier), la carte reste vide et toute
  // règle à critère se voit refusée. Ce n'est pas une limite du moteur : c'est
  // le verdict juste, personne n'ayant rien constaté.
  describe('constats de critères', () => {
    it('ne lit RIEN hors dossier — l’atelier n’a pas de patient', async () => {
      const catalogue = await lireCatalogueDecision(['ing_1']);
      expect(prisma.critereDossierConstate.findMany).not.toHaveBeenCalled();
      expect(catalogue.constatsParCritere.size).toBe(0);
    });

    it('ne lit RIEN quand le dossier existe mais qu’aucune règle ne cite de critère', async () => {
      await lireCatalogueDecision(['ing_1'], { idPatient: 'PAT_1', critereIds: [] });
      expect(prisma.critereDossierConstate.findMany).not.toHaveBeenCalled();
    });

    // La requête est BORNÉE aux critères que la résolution touche, jamais la
    // table entière : un dossier n'a pas à être relu en entier pour trancher
    // deux règles.
    it('borne la lecture au dossier ET aux critères cités', async () => {
      await lireCatalogueDecision(['ing_1'], { idPatient: 'PAT_1', critereIds: ['crit_a', 'crit_b'] });
      expect(prisma.critereDossierConstate.findMany).toHaveBeenCalledWith({
        where: { idPatient: 'PAT_1', critereId: { in: ['crit_a', 'crit_b'] } },
        select: { critereId: true, present: true },
      });
    });

    // LE POINT QUI COMPTE : un constat d'ABSENCE reste `false` dans la carte,
    // il ne disparaît pas. C'est ce qui permet au moteur de distinguer « le
    // praticien a constaté que non » de « personne ne s'est prononcé ».
    it('conserve un constat d’absence, au lieu de l’effacer', async () => {
      prisma.critereDossierConstate.findMany.mockResolvedValue([
        { critereId: 'crit_a', present: false },
        { critereId: 'crit_b', present: true },
      ]);
      const catalogue = await lireCatalogueDecision(
        ['ing_1'],
        { idPatient: 'PAT_1', critereIds: ['crit_a', 'crit_b', 'crit_c'] },
      );
      expect(catalogue.constatsParCritere.get('crit_a')).toBe(false);
      expect(catalogue.constatsParCritere.get('crit_b')).toBe(true);
      // `crit_c` n'a AUCUNE ligne : il est absent de la carte, il n'y vaut pas
      // `false`. Les deux se disent différemment au praticien.
      expect(catalogue.constatsParCritere.has('crit_c')).toBe(false);
    });
  });
});
