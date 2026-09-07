import { prisma } from '../prisma';
import type {
  AlerteSecuriteJointe,
  SeuilFonctionnelSource,
} from './types';
import type { OrigineDeclencheur } from './decisionAvantBiologie';

// LE CONTEXTE QUE LE MOTEUR C4 EXIGE, LU EN BASE — [[D-133]].
//
// MODULE À PART, même séparation que `selectionPrioritePrisma` : ce qui DÉCIDE
// (`decisionAvantBiologie.ts`) reste pur et s'éprouve sans PostgreSQL ; ce qui
// LIT vit ici. Le moteur n'avait aucun appelant en production — son seul
// importeur était son propre banc — et c'est cette lecture qui lui en donne un.
//
// TROIS ENTRANTS SE DÉRIVENT DE LA BASE, DEUX NON, ET LA DIFFÉRENCE EST DITE.

/** Ce que `deciderIntentionsAvantBiologie` attend en second argument. */
export type CatalogueDecision = {
  catalogueAlertesPublie: boolean;
  alertesParIngredient: ReadonlyMap<string, readonly AlerteSecuriteJointe[]>;
  seuilsParIngredient: ReadonlyMap<string, readonly SeuilFonctionnelSource[]>;
  claimsValidesParRegle: ReadonlyMap<string, boolean>;
  declencheur: readonly OrigineDeclencheur[];
  /**
   * `critereId` → constat posé sur le dossier. Une clé ABSENTE signifie
   * « personne ne s'est prononcé » ; `false` signifie « constaté absent ».
   * Les deux refusent, et le moteur ne les dit pas de la même façon.
   */
  constatsParCritere: ReadonlyMap<string, boolean>;
};

/**
 * LE CATALOGUE D'ALERTES EST-IL PUBLIÉ ? Garde au niveau CATALOGUE, jamais au
 * niveau ingrédient ([[D-056]] arbitrage 2) : qu'un ingrédient ne porte aucune
 * alerte est le cas normal et ne prouve rien ; ce qui fait preuve, c'est que le
 * catalogue EXISTE. Une seule alerte active suffit donc à le publier, et zéro
 * le laisse fermé — « aucune alerte » ne serait pas un constat, seulement une
 * absence d'examen.
 */
async function catalogueAlertesPublie(): Promise<boolean> {
  return (await prisma.supplementSafetyAlert.count({ where: { actif: true } })) > 0;
}

/**
 * Les seuils actifs, indexés par ingrédient — et les alertes qu'ils portent.
 *
 * UNE ALERTE N'ATTEINT UN INGRÉDIENT QUE PAR UN SEUIL (`safetyAlertId`) : le
 * schéma ne relie pas directement `supplement_safety_alerts` à un ingrédient.
 * Tant qu'aucun seuil n'est publié, aucune alerte n'est donc « active sur »
 * quoi que ce soit — ce qui n'empêche pas le catalogue d'être publié, et c'est
 * exactement la distinction que `D-056` arbitrage 2 pose.
 */
async function lireSeuilsEtAlertes(ingredientIds: readonly string[]): Promise<{
  seuils: Map<string, SeuilFonctionnelSource[]>;
  alertes: Map<string, AlerteSecuriteJointe[]>;
}> {
  const seuils = new Map<string, SeuilFonctionnelSource[]>();
  const alertes = new Map<string, AlerteSecuriteJointe[]>();
  if (ingredientIds.length === 0) return { seuils, alertes };

  const lignes = await prisma.ingredientFunctionalThreshold.findMany({
    where: { actif: true, ingredientId: { in: [...ingredientIds] } },
    select: {
      id: true,
      ingredientId: true,
      seuilDoseBasse: true,
      seuilDoseHaute: true,
      unite: true,
      basculeRisque: true,
      safetyAlertId: true,
      gradePreuveScientifique: true,
      categorieFonctionnelle: { select: { id: true, code: true, labelFr: true } },
      safetyAlert: { select: { id: true, code: true, messageFr: true, niveauAlerte: true, actif: true } },
      sourceReference: { select: { id: true, citation: true, lienUrl: true } },
    },
  });

  for (const ligne of lignes) {
    // `Decimal | number | null` selon l'adaptateur : on normalise en nombre,
    // jamais en chaîne — le moteur compare des nombres.
    const nombre = (valeur: unknown): number | null =>
      valeur === null || valeur === undefined ? null : Number(valeur);
    const alerteJointe: AlerteSecuriteJointe | null = ligne.safetyAlert && ligne.safetyAlert.actif
      ? {
          id: ligne.safetyAlert.id,
          code: ligne.safetyAlert.code,
          messageFr: ligne.safetyAlert.messageFr,
          niveauAlerte: ligne.safetyAlert.niveauAlerte,
        }
      : null;
    const seuil: SeuilFonctionnelSource = {
      id: ligne.id,
      ingredientId: ligne.ingredientId,
      seuilDoseBasse: nombre(ligne.seuilDoseBasse),
      seuilDoseHaute: nombre(ligne.seuilDoseHaute),
      unite: ligne.unite,
      basculeRisque: ligne.basculeRisque,
      safetyAlertId: ligne.safetyAlertId,
      gradePreuveScientifique: ligne.gradePreuveScientifique,
      categorieFonctionnelle: ligne.categorieFonctionnelle,
      safetyAlert: alerteJointe,
      sourceReference: ligne.sourceReference,
    };
    const listeSeuils = seuils.get(ligne.ingredientId) ?? [];
    listeSeuils.push(seuil);
    seuils.set(ligne.ingredientId, listeSeuils);

    // UNE ALERTE N'EST « ACTIVE SUR L'INGRÉDIENT » QUE PAR UN SEUIL QUI BASCULE.
    // `basculeRisque` est le champ qui le dit ; sans lui, toute alerte citée par
    // un seuil, fût-ce à titre documentaire, refuserait l'ingrédient entier.
    if (alerteJointe && ligne.basculeRisque) {
      const listeAlertes = alertes.get(ligne.ingredientId) ?? [];
      listeAlertes.push(alerteJointe);
      alertes.set(ligne.ingredientId, listeAlertes);
    }
  }
  return { seuils, alertes };
}

/**
 * Le contexte de décision d'une résolution, lu en base.
 *
 * DEUX ENTRANTS NE SE DÉRIVENT PAS, et ils sont rendus FERMÉS plutôt
 * qu'inventés — l'absence d'information ne vaut jamais autorisation (`DC-24`,
 * [[D-056]] arbitrage 2) :
 *
 *  - `claimsValidesParRegle` reste VIDE, donc `false` pour chaque règle. Le
 *    schéma ne relie `ClinicalRule` à AUCUN claim : `claim_id` existe côté
 *    biologie (`biology_functional_ranges`), jamais ici, et la source d'une
 *    règle est une citation bibliographique, pas un identifiant de corpus. Le
 *    refus `claims_non_valides` dit donc une chose vraie — rien n'établit la
 *    validité de ces claims — et il la dira tant que le lien n'existera pas.
 *    Dette nommée à [[D-133]].
 *  - `declencheur` reste VIDE hors dossier : le déclencheur est un tableau
 *    clinique (besoin dégradé + plainte + anamnèse) qui appartient à un
 *    patient. L'atelier n'en a pas. Le fabriquer donnerait à lire « tableau
 *    complet » là où personne n'a été examiné.
 *
 * `constatsParCritere` suit la même règle et pour la même raison ([[D-138]]) :
 * un critère est constaté SUR UN DOSSIER, par un praticien qui signe. Sans
 * dossier — c'est le cas de la prévisualisation de l'atelier —, la carte reste
 * vide et toute règle conditionnée à un critère se voit refusée
 * `condition_critere_non_constate`. Ce n'est pas une limite du moteur : c'est
 * le verdict juste. Une règle à critère ne peut rien produire là où personne
 * n'a rien constaté.
 */
export async function lireCatalogueDecision(
  ingredientIds: readonly string[],
  /**
   * Le dossier sur lequel la décision porte, quand il y en a un. Absent en
   * prévisualisation d'atelier — et c'est alors le fait qui compte, pas un
   * défaut d'appel.
   */
  dossier?: { idPatient: string; critereIds: readonly string[] },
): Promise<CatalogueDecision> {
  const [publie, { seuils, alertes }, constats] = await Promise.all([
    catalogueAlertesPublie(),
    lireSeuilsEtAlertes(ingredientIds),
    lireConstatsCriteres(dossier),
  ]);
  return {
    catalogueAlertesPublie: publie,
    alertesParIngredient: alertes,
    seuilsParIngredient: seuils,
    claimsValidesParRegle: new Map(),
    declencheur: [],
    constatsParCritere: constats,
  };
}

/**
 * Les constats posés sur CE dossier, pour les seuls critères que la résolution
 * touche — jamais la table entière ([[D-138]]).
 *
 * L'absence de ligne n'est pas transformée en `false` : elle reste une absence,
 * et le moteur la distingue d'un constat d'absence. C'est tout l'objet des deux
 * causes de refus séparées.
 */
async function lireConstatsCriteres(
  dossier?: { idPatient: string; critereIds: readonly string[] },
): Promise<ReadonlyMap<string, boolean>> {
  if (!dossier || dossier.critereIds.length === 0) return new Map();
  const lignes = await prisma.critereDossierConstate.findMany({
    where: { idPatient: dossier.idPatient, critereId: { in: [...dossier.critereIds] } },
    select: { critereId: true, present: true },
  });
  return new Map(lignes.map((ligne) => [ligne.critereId, ligne.present]));
}
