// Moteur déterministe de résolution C4B : codes d'intention clinique →
// règles actives (dernière version active par lignée de règle), avec
// ingrédient, forme préférée, doses cibles, grade de preuve (échelle GRADE),
// justification et source. Lecture seule — le moteur SIGNALE, ne décide jamais.
import { prisma } from '@/lib/prisma';
import { isC4Enabled } from './featureFlag';
import {
  C4B_RESOLUTION_VERSION,
  parseGradePreuveScientifique,
  type IntentionResolue,
  type RegleResolue,
  type ResolutionIntentions,
} from './types';

function comparerTexte(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type LigneRegle = {
  id: string;
  intentTagId: string;
  typeRegle: string;
  justification: string;
  conditionSupplementaire: unknown;
  conditionBiologie: unknown;
  conditionCritere: { id: string; code: string; labelFr: string } | null;
  // NULLABLES ICI ALORS QUE LA BASE LES EXIGE ([[D-140]]) : le code se déploie
  // avant que le resserrement soit approuvé ([[D-087]]), et une ligne lue dans
  // cette fenêtre pourrait n'en porter aucun. Typer `string` masquerait ce cas
  // au lieu de le traiter — le moteur refuserait alors sur un `undefined`
  // silencieux plutôt que sur un verdict nommé.
  claimId: string | null;
  versionClaim: string | null;
  doseCibleBasse: number | null;
  doseCibleHaute: number | null;
  gradePreuveScientifique: string;
  versionRegle: number;
  creeLe: Date;
  validePar: string | null;
  valideLe: Date | null;
  ingredient: { id: string; code: string; nomFr: string };
  formePreferee: { id: string; code: string; labelFr: string } | null;
  sourceReference: { id: string; citation: string; lienUrl: string | null };
};

// Décision actée n°5 : les règles sont append-only — toute édition crée une
// nouvelle ligne (`versionRegle` incrémenté), l'ancienne passe `actif = false`.
// Le schéma V1 ne porte pas d'identifiant de lignée : la lignée est identifiée
// par (intention, ingrédient, type de règle). Si plusieurs lignes actives
// coexistent dans une même lignée (état transitoire ou anomalie), seule la
// dernière version est servie — départage déterministe par version, puis date
// de création, puis identifiant.
function cleLignee(regle: LigneRegle): string {
  return `${regle.intentTagId}::${regle.ingredient.id}::${regle.typeRegle}`;
}

function gagne(candidate: LigneRegle, tenante: LigneRegle): boolean {
  if (candidate.versionRegle !== tenante.versionRegle) {
    return candidate.versionRegle > tenante.versionRegle;
  }
  if (candidate.creeLe.getTime() !== tenante.creeLe.getTime()) {
    return candidate.creeLe.getTime() > tenante.creeLe.getTime();
  }
  return comparerTexte(candidate.id, tenante.id) > 0;
}

function estValidee(regle: LigneRegle): boolean {
  return regle.validePar !== null && regle.valideLe !== null;
}

function versRegleResolue(regle: LigneRegle): RegleResolue {
  return {
    regleId: regle.id,
    versionRegle: regle.versionRegle,
    typeRegle: regle.typeRegle,
    ingredient: regle.ingredient,
    formePreferee: regle.formePreferee,
    doseCibleBasse: regle.doseCibleBasse,
    doseCibleHaute: regle.doseCibleHaute,
    gradePreuve: parseGradePreuveScientifique(regle.gradePreuveScientifique),
    justification: regle.justification,
    conditionSupplementaire: regle.conditionSupplementaire ?? null,
    conditionBiologie: regle.conditionBiologie ?? null,
    conditionCritere: regle.conditionCritere
      ? {
          critereId: regle.conditionCritere.id,
          code: regle.conditionCritere.code,
          labelFr: regle.conditionCritere.labelFr,
        }
      : null,
    // Le COUPLE fait l'identité d'un claim : une moitié seule ne désigne rien
    // d'unique dans `rag_corpus_claims`. Une référence dépareillée est donc
    // rendue ABSENTE, pas complétée — la moitié manquante ne s'invente pas.
    claim: regle.claimId !== null && regle.versionClaim !== null
      ? { claimId: regle.claimId, versionClaim: regle.versionClaim }
      : null,
    source: regle.sourceReference,
    creeLe: regle.creeLe.toISOString(),
    validePar: regle.validePar,
    valideLe: regle.valideLe ? regle.valideLe.toISOString() : null,
    regleValidee: estValidee(regle),
  };
}

// Motif barrière D-003 (décision actée par revue, PR #333) : par défaut, seules
// les règles actives ET validées (`validePar` et `valideLe` non nuls) sont
// servies — rien d'actionnable sans validation praticien signée.
// `inclureNonValidees` est réservée au futur atelier de règles
// (prévisualisation) et ne doit JAMAIS alimenter un chemin protocole/patient ;
// chaque règle non validée sort alors marquée `regleValidee: false`.
export async function resoudreIntentions(
  codesIntentions: readonly string[],
  options: { inclureNonValidees?: boolean } = {},
): Promise<ResolutionIntentions> {
  if (!isC4Enabled()) {
    throw new Error(
      'Rayon compléments désactivé : WN_C4_ENABLED doit valoir « true » (fail-closed).',
    );
  }
  const codes = [...new Set(codesIntentions.map(code => code.trim()).filter(Boolean))];
  if (codes.length === 0) {
    return {
      contractVersion: C4B_RESOLUTION_VERSION,
      intentions: [],
      codesInconnus: [],
      aucunScoreAgrege: true,
    };
  }

  const intentions = await prisma.clinicalIntentTag.findMany({
    where: { code: { in: codes }, actif: true },
    select: { id: true, code: true, labelFr: true, categorie: true },
  });
  const intentionsParCode = new Map(intentions.map(intention => [intention.code, intention]));
  const codesInconnus = codes.filter(code => !intentionsParCode.has(code));

  const inclureNonValidees = options.inclureNonValidees === true;
  const regles: LigneRegle[] = intentions.length === 0
    ? []
    : await prisma.clinicalRule.findMany({
      where: {
        intentTagId: { in: intentions.map(intention => intention.id) },
        actif: true,
        ...(inclureNonValidees ? {} : { validePar: { not: null }, valideLe: { not: null } }),
      },
      select: {
        id: true,
        intentTagId: true,
        typeRegle: true,
        justification: true,
        conditionSupplementaire: true,
        conditionBiologie: true,
        // Le critère est JOINT, pas seulement son identifiant : un refus doit
        // pouvoir NOMMER le critère au praticien ([[D-138]]).
        conditionCritere: { select: { id: true, code: true, labelFr: true } },
        // Le claim fondateur ([[D-140]]) : sa VALIDITÉ se lit au corpus
        // (`lireCatalogueDecision`), sa RÉFÉRENCE se lit ici — pour que le
        // refus puisse nommer le claim en cause.
        claimId: true,
        versionClaim: true,
        doseCibleBasse: true,
        doseCibleHaute: true,
        gradePreuveScientifique: true,
        versionRegle: true,
        creeLe: true,
        validePar: true,
        valideLe: true,
        ingredient: { select: { id: true, code: true, nomFr: true } },
        formePreferee: { select: { id: true, code: true, labelFr: true } },
        sourceReference: { select: { id: true, citation: true, lienUrl: true } },
      },
    });

  // Garde défensive doublant le filtre de la requête : une règle jamais
  // validée n'entre pas dans la sélection par défaut, et la « dernière
  // version active par lignée » se choisit APRÈS ce filtre — une version
  // brouillon ne doit jamais masquer la dernière version validée.
  const reglesRetenues = regles.filter(regle => inclureNonValidees || estValidee(regle));

  const derniereParLignee = new Map<string, LigneRegle>();
  for (const regle of reglesRetenues) {
    const cle = cleLignee(regle);
    const tenante = derniereParLignee.get(cle);
    if (!tenante || gagne(regle, tenante)) derniereParLignee.set(cle, regle);
  }

  // Ordre neutre documenté : intentions dans l'ordre de la sélection du
  // praticien ; règles triées alphabétiquement (code ingrédient, type de
  // règle, identifiant). Aucun tri « meilleur choix », aucun score agrégé.
  const intentionsResolues: IntentionResolue[] = codes
    .map(code => intentionsParCode.get(code))
    .filter((intention): intention is NonNullable<typeof intention> => Boolean(intention))
    .map(intention => ({
      intention,
      regles: [...derniereParLignee.values()]
        .filter(regle => regle.intentTagId === intention.id)
        .sort((left, right) =>
          comparerTexte(left.ingredient.code, right.ingredient.code)
          || comparerTexte(left.typeRegle, right.typeRegle)
          || comparerTexte(left.id, right.id))
        .map(versRegleResolue),
    }));

  return {
    contractVersion: C4B_RESOLUTION_VERSION,
    intentions: intentionsResolues,
    codesInconnus,
    aucunScoreAgrege: true,
  };
}
