// Sentinelle de cumul C4B : détection déterministe des cumuls de substance et
// des dépassements de seuils fonctionnels. Elle PRODUIT des candidats de
// `ProtocolReviewFlag` (objets) — elle n'écrit rien en base dans cette tranche.
// Décision actée n°9 : jamais de somme ni de maximum automatique des doses ;
// le candidat expose les doses en présence, le praticien arbitre.
import { prisma } from '@/lib/prisma';
import { isC4Enabled } from './featureFlag';
import { collecterOccurrences, sentinelleADeQuoiConclure } from './sentinelleCore';
import {
  C4B_SENTINELLE_VERSION,
  parseGradePreuveScientifique,
  type CandidatProtocolReviewFlag,
  type DoseEnPresence,
  type IngredientResolu,
  type ResolutionIntentions,
  type SeuilFonctionnelSource,
} from './types';

// Réexport : `sentinelleADeQuoiConclure` vit dans le noyau pur, mais reste
// importable depuis ce module — les appelants existants ne changent pas.
export { sentinelleADeQuoiConclure };

function comparerTexte(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatPlageDose(basse: number | null, haute: number | null): string {
  if (basse === null && haute === null) return 'dose cible non renseignée';
  if (basse !== null && haute !== null) {
    return basse === haute ? `dose cible ${basse}` : `dose cible ${basse} à ${haute}`;
  }
  if (basse !== null) return `dose cible à partir de ${basse}`;
  return `dose cible jusqu'à ${haute}`;
}

function decrireDoses(occurrences: readonly DoseEnPresence[]): string {
  return occurrences
    .map(occurrence =>
      `${occurrence.intentionCode} — ${formatPlageDose(occurrence.doseCibleBasse, occurrence.doseCibleHaute)}`)
    .join(' ; ');
}

// Même ingrédient atteint par plusieurs intentions/règles d'une même
// sélection → candidat `cumul_substance`. Les doses sont exposées telles
// quelles : jamais de somme, jamais de maximum (décision actée n°9).
export function detecterCumulSubstance(
  resolution: ResolutionIntentions,
): CandidatProtocolReviewFlag[] {
  return [...collecterOccurrences(resolution).values()]
    .filter(entree => entree.occurrences.length >= 2)
    .sort((left, right) => comparerTexte(left.ingredient.code, right.ingredient.code))
    .map(({ ingredient, occurrences }) => ({
      contractVersion: C4B_SENTINELLE_VERSION,
      typeFlag: 'cumul_substance' as const,
      statutPropose: 'ouvert' as const,
      // AUCUN NIVEAU, parce qu'aucun ne serait fondé ([[D-143]]). Ce champ
      // portait `'orange'` en dur pour TOUT candidat de cumul : une gradation
      // clinique que rien ne source, écrite dans du code servi. Un cumul de
      // substance est un fait constaté ; sa gravité est un jugement, et
      // personne ne l'a rendu (`DC-19`, `DC-20`).
      niveauAlerte: null,
      ingredient,
      ingredientsConcernes: [ingredient.code],
      dosesEnPresence: occurrences,
      seuil: null,
      alerteSecurite: null,
      message:
        `Cumul de substance : « ${ingredient.nomFr} » est visé par `
        + `${occurrences.length} règles de la sélection. Doses en présence : `
        + `${decrireDoses(occurrences)}. Aucune somme ni maximum automatique — `
        + `le praticien arbitre.`,
      suggestionAction:
        `Examiner les doses en présence pour « ${ingredient.nomFr} » et arbitrer ; `
        + `le moteur signale, il ne calcule ni somme ni maximum.`,
    }));
}

// Dépassement d'un seuil fonctionnel : comparaison règle par règle (chaque
// borne de dose cible, individuellement) contre le seuil haut — jamais de
// cumul calculé. Si `basculeRisque`, l'alerte de sécurité est jointe via
// `safetyAlertId` ; son niveau n'est jamais copié côté seuil (décision n°6).
export function detecterDepassementsSeuils(
  resolution: ResolutionIntentions,
  seuils: readonly SeuilFonctionnelSource[],
): CandidatProtocolReviewFlag[] {
  const parIngredient = collecterOccurrences(resolution);
  const candidats: CandidatProtocolReviewFlag[] = [];
  const seuilsOrdonnes = [...seuils].sort((left, right) =>
    comparerTexte(left.ingredientId, right.ingredientId) || comparerTexte(left.id, right.id));

  for (const seuil of seuilsOrdonnes) {
    if (seuil.seuilDoseHaute === null) continue;
    const seuilHaut = seuil.seuilDoseHaute;
    const entree = parIngredient.get(seuil.ingredientId);
    if (!entree) continue;
    const depassements = entree.occurrences.filter(occurrence =>
      (occurrence.doseCibleBasse !== null && occurrence.doseCibleBasse > seuilHaut)
      || (occurrence.doseCibleHaute !== null && occurrence.doseCibleHaute > seuilHaut));
    if (depassements.length === 0) continue;

    const alerteSecurite = seuil.basculeRisque ? seuil.safetyAlert : null;
    candidats.push({
      contractVersion: C4B_SENTINELLE_VERSION,
      typeFlag: 'depassement_seuil',
      statutPropose: 'ouvert',
      // Le niveau vient de l'alerte jointe quand la bascule de risque est
      // active — jamais d'un niveau recopié côté seuil (décision actée n°6),
      // et JAMAIS d'un repli fabriqué ([[D-143]]) : sans alerte jointe, il n'y
      // a pas de niveau, et `'orange'` n'était pas une valeur par défaut mais
      // une invention. Un dépassement de seuil sans alerte reste un
      // dépassement — c'est le fait qui alerte, pas une couleur.
      niveauAlerte: alerteSecurite ? alerteSecurite.niveauAlerte : null,
      ingredient: entree.ingredient,
      ingredientsConcernes: [entree.ingredient.code],
      dosesEnPresence: depassements,
      seuil: {
        id: seuil.id,
        categorieFonctionnelle: seuil.categorieFonctionnelle,
        seuilDoseBasse: seuil.seuilDoseBasse,
        seuilDoseHaute: seuil.seuilDoseHaute,
        unite: seuil.unite,
        basculeRisque: seuil.basculeRisque,
        safetyAlertId: seuil.safetyAlertId,
        gradePreuve: parseGradePreuveScientifique(seuil.gradePreuveScientifique),
        source: seuil.sourceReference,
      },
      alerteSecurite,
      message:
        `Dépassement de seuil fonctionnel : « ${entree.ingredient.nomFr} » — au moins `
        + `une dose cible dépasse le seuil haut de ${seuilHaut} ${seuil.unite} `
        + `(catégorie « ${seuil.categorieFonctionnelle.labelFr} »). Doses concernées : `
        + `${decrireDoses(depassements)}. Comparaison règle par règle, sans somme.`
        + (alerteSecurite ? ` Alerte de sécurité jointe : ${alerteSecurite.messageFr}` : ''),
      suggestionAction: alerteSecurite
        ? 'Examiner l\'alerte de sécurité jointe et arbitrer — à discuter avec le médecin traitant si nécessaire.'
        : 'Vérifier la dose cible face au seuil fonctionnel et arbitrer.',
    });
  }
  return candidats;
}

// Évaluation complète : cumuls d'abord, dépassements de seuils ensuite —
// ordre déterministe. Lecture seule (les seuils actifs des ingrédients en
// présence), aucun flag écrit en base dans cette tranche.
export async function evaluerSentinelle(
  resolution: ResolutionIntentions,
): Promise<CandidatProtocolReviewFlag[]> {
  if (!isC4Enabled()) {
    throw new Error(
      'Rayon compléments désactivé : WN_C4_ENABLED doit valoir « true » (fail-closed).',
    );
  }
  const ingredientIds = [...collecterOccurrences(resolution).keys()];
  if (ingredientIds.length === 0) return [];

  const seuils: SeuilFonctionnelSource[] = await prisma.ingredientFunctionalThreshold.findMany({
    where: { ingredientId: { in: ingredientIds }, actif: true },
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
      safetyAlert: { select: { id: true, code: true, messageFr: true, niveauAlerte: true } },
      sourceReference: { select: { id: true, citation: true, lienUrl: true } },
    },
  });

  return [
    ...detecterCumulSubstance(resolution),
    ...detecterDepassementsSeuils(resolution, seuils),
  ];
}
