import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    supplementSafetyAlert: { count: vi.fn() },
    ingredientFunctionalThreshold: { findMany: vi.fn() },
    critereDossierConstate: { findMany: vi.fn() },
    // `rag_corpus_claims` est SQL-brut hors `schema.prisma` : la validité d'un
    // claim se lit en requête brute ([[D-140]]).
    $queryRaw: vi.fn(),
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
    prisma.$queryRaw.mockResolvedValue([]);
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

  // L'ENTRANT NON DÉRIVABLE QUI RESTE EST RENDU FERMÉ, JAMAIS INVENTÉ :
  // `declencheur` est un tableau clinique, il appartient à un dossier, et
  // l'atelier n'en a pas.
  it('rend le déclencheur FERMÉ hors dossier', async () => {
    expect((await lireCatalogueDecision(['ing_1'])).declencheur).toEqual([]);
  });

  // [[D-140]] — LA VALIDITÉ DES CLAIMS SE LIT AU CORPUS. La carte restait vide
  // faute de lien : `clinical_rules` n'avait aucun champ pour nommer un claim,
  // et le moteur — qui vérifie cet entrant EN PREMIER — refusait donc toute
  // règle. Elle se remplit désormais, et sur ce que la base dit.
  describe('claims fondateurs', () => {
    it('ne pose AUCUNE question au corpus quand aucune règle n’est servie', async () => {
      const catalogue = await lireCatalogueDecision(['ing_1']);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(catalogue.claimsValidesParRegle.size).toBe(0);
    });

    // Une règle sans claim vaut `false` EXPLICITEMENT. Le moteur lirait pareil
    // une clé absente (`… ?? false`), mais pas un relecteur : un trou dans la
    // carte se confondrait avec un oubli de lecture.
    it('inscrit `false` pour une règle qui ne nomme aucun claim, sans interroger le corpus', async () => {
      const catalogue = await lireCatalogueDecision(['ing_1'], undefined, [
        { regleId: 'regle_a', claim: null },
      ]);
      expect(catalogue.claimsValidesParRegle.get('regle_a')).toBe(false);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('inscrit `true` pour la seule règle dont le claim revient VALIDE', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { claim_id: 'WN-CL-2026-001', version_claim: 'v1.0' },
      ]);
      const catalogue = await lireCatalogueDecision(['ing_1'], undefined, [
        { regleId: 'regle_a', claim: { claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' } },
        { regleId: 'regle_b', claim: { claimId: 'WN-CL-2026-002', versionClaim: 'v1.0' } },
      ]);
      expect(catalogue.claimsValidesParRegle.get('regle_a')).toBe(true);
      // Absent de la réponse du corpus : refusé, sans qu'on cherche pourquoi.
      expect(catalogue.claimsValidesParRegle.get('regle_b')).toBe(false);
    });

    // LE POINT QUI COMPTE : la VERSION fait partie de l'identité. Le corpus
    // valide `v1.0` ; une règle qui repose sur `v2.0` du même claim ne repose
    // pas sur ce que le praticien a signé.
    it('ne valide pas une AUTRE version du même claim', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      const catalogue = await lireCatalogueDecision(['ing_1'], undefined, [
        { regleId: 'regle_a', claim: { claimId: 'WN-CL-2026-001', versionClaim: 'v2.0' } },
      ]);
      expect(catalogue.claimsValidesParRegle.get('regle_a')).toBe(false);
    });
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
