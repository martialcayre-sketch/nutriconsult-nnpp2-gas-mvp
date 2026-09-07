import { prisma } from '../prisma';
import { claimsValidesAuCorpus, cleClaim, type ReferenceClaim } from '@/lib/rag/claims/validite';
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
 * `claimsValidesParRegle` SE DÉRIVE DÉSORMAIS, et c'est ce que [[D-140]] a
 * ouvert. La carte restait vide faute de lien : `clinical_rules` n'avait aucun
 * champ pour nommer un claim, et le refus `claims_non_valides` — vérifié EN
 * PREMIER par le moteur — fermait donc toute règle, en donnant pour motif que
 * « les claims cités » n'étaient pas valides alors qu'aucun n'était cité. La
 * règle porte maintenant son claim fondateur, et cette lecture répond à la
 * question réelle : ce claim-là est-il VALIDE au corpus ?
 *
 * UN ENTRANT NE SE DÉRIVE TOUJOURS PAS, et il est rendu FERMÉ plutôt
 * qu'inventé — l'absence d'information ne vaut jamais autorisation (`DC-24`,
 * [[D-056]] arbitrage 2) :
 *
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
  /**
   * Les règles que la résolution SERT, avec le claim que chacune nomme
   * ([[D-140]]). Passées par l'appelant plutôt que relues ici : la résolution
   * vient de lire ces lignes, et une seconde lecture pourrait rendre autre
   * chose — le verdict porterait alors sur des règles qui ne sont pas celles
   * servies.
   */
  regles: readonly { regleId: string; claim: ReferenceClaim | null }[] = [],
): Promise<CatalogueDecision> {
  const [publie, { seuils, alertes }, constats, claims] = await Promise.all([
    catalogueAlertesPublie(),
    lireSeuilsEtAlertes(ingredientIds),
    lireConstatsCriteres(dossier),
    lireClaimsValides(regles),
  ]);
  return {
    catalogueAlertesPublie: publie,
    alertesParIngredient: alertes,
    seuilsParIngredient: seuils,
    claimsValidesParRegle: claims,
    declencheur: [],
    constatsParCritere: constats,
  };
}

/**
 * `regleId` → son claim fondateur est-il VALIDE au corpus ? ([[D-140]])
 *
 * TOUTES LES RÈGLES SONT INSCRITES, y compris celles qui échouent : une clé
 * absente et un `false` se liraient pareil au moteur (`… ?? false`), mais pas à
 * la relecture. Une règle qui ne nomme aucun claim vaut `false` — sans que le
 * moteur ait à le déduire d'un trou dans la carte.
 */
async function lireClaimsValides(
  regles: readonly { regleId: string; claim: ReferenceClaim | null }[],
): Promise<ReadonlyMap<string, boolean>> {
  const carte = new Map<string, boolean>();
  if (regles.length === 0) return carte;

  const valides = await claimsValidesAuCorpus(
    regles
      .map((regle) => regle.claim)
      .filter((claim): claim is ReferenceClaim => claim !== null),
  );
  for (const regle of regles) {
    carte.set(regle.regleId, regle.claim !== null && valides.has(cleClaim(regle.claim)));
  }
  return carte;
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
