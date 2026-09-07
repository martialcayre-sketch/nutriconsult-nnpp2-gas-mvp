// Domaine « rayon compléments » (campagne C4) — types internes.
// Doctrine (docs/claude/MOTEUR_INTENTION_CLINIQUE_CONTEXTE.md) : le LLM comprend
// l'intention, le moteur déterministe SIGNALE, le praticien décide. Aucun score
// agrégé, aucun tri « meilleur choix », aucune somme automatique de doses.
import type { ReferenceClaim } from '@/lib/rag/claims/validite';

export type { ReferenceClaim };

export const C4B_RESOLUTION_VERSION = 'c4b-resolution-v1' as const;
export const C4B_SENTINELLE_VERSION = 'c4b-sentinelle-v1' as const;
export const C4_TABLEAU_COMPATIBILITE_VERSION = 'c4-tableau-compatibilite-v1' as const;

// Échelle GRADE (`grade_preuve_scientifique`) — décision actée n°1 : ne JAMAIS
// la confondre avec l'échelle A/B/C/D du moteur d'équilibre (provenance d'une
// donnée patient). `parseGradePreuveScientifique` refuse explicitement A/B/C/D.
export const GRADES_PREUVE_SCIENTIFIQUE = [
  'fort',
  'modere',
  'faible',
  'usage_traditionnel',
] as const;
export type GradePreuveScientifique = (typeof GRADES_PREUVE_SCIENTIFIQUE)[number];

const LABELS_GRADE_PREUVE: Record<GradePreuveScientifique, string> = {
  fort: 'Fort',
  modere: 'Modéré',
  faible: 'Faible',
  usage_traditionnel: 'Usage traditionnel',
};

function normaliserGrade(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseGradePreuveScientifique(value: string): GradePreuveScientifique {
  const normalized = normaliserGrade(value);
  if ((GRADES_PREUVE_SCIENTIFIQUE as readonly string[]).includes(normalized)) {
    return normalized as GradePreuveScientifique;
  }
  if (/^[abcd]$/.test(normalized)) {
    throw new TypeError(
      `Grade de preuve « ${value} » refusé : « ${normalized.toUpperCase()} » appartient à `
        + `l'échelle A/B/C/D du moteur d'équilibre (provenance d'une donnée patient), `
        + `jamais à l'échelle GRADE (${GRADES_PREUVE_SCIENTIFIQUE.join(' / ')}) du moteur `
        + `d'intention clinique. Les deux échelles ne doivent jamais être confondues.`,
    );
  }
  throw new TypeError(
    `Grade de preuve scientifique inconnu : « ${value} ». Valeurs admises `
      + `(échelle GRADE) : ${GRADES_PREUVE_SCIENTIFIQUE.join(', ')}.`,
  );
}

export function labelGradePreuve(grade: GradePreuveScientifique): string {
  return LABELS_GRADE_PREUVE[grade];
}

// ─── Résolution C4B ─────────────────────────────────────────────────────────

export type IngredientResolu = { id: string; code: string; nomFr: string };
export type FormeResolue = { id: string; code: string; labelFr: string };
export type SourceResolue = { id: string; citation: string; lienUrl: string | null };

/** Un mot du vocabulaire gouverné (`clinical_criteria`), résolu. */
export type CritereResolu = {
  critereId: string;
  code: string;
  labelFr: string;
};

export type RegleResolue = {
  regleId: string;
  versionRegle: number;
  typeRegle: string;
  ingredient: IngredientResolu;
  formePreferee: FormeResolue | null;
  doseCibleBasse: number | null;
  doseCibleHaute: number | null;
  gradePreuve: GradePreuveScientifique;
  justification: string;
  /** Condition biologique, seule nature que `lireConditionBiologique` lit. */
  conditionBiologie: unknown;
  /**
   * Critère gouverné auquel la règle est conditionnée, résolu (code et libellé
   * joints) pour qu'un refus puisse le NOMMER au praticien plutôt que de citer
   * un identifiant. `null` = règle non conditionnée à un critère.
   */
  conditionCritere: CritereResolu | null;
  /**
   * Le claim du corpus qui FONDE la règle ([[D-140]]) — la base l'exige
   * (`claim_id`/`version_claim` NOT NULL depuis
   * `20260907210000_regle_claim_obligatoire`).
   *
   * `null` RESTE POSSIBLE ICI, et ce n'est pas une contradiction : le code se
   * déploie AVANT que la migration de resserrement soit approuvée ([[D-087]]),
   * et une ligne lue dans cette fenêtre pourrait n'en porter aucun. Le moteur
   * refuse alors — il ne suppose pas. Ce que le type dit, c'est exactement ce
   * que la lecture peut rencontrer.
   */
  claim: ReferenceClaim | null;
  source: SourceResolue;
  creeLe: string;
  validePar: string | null;
  valideLe: string | null;
  // Motif barrière D-003 : rien d'actionnable sans validation praticien
  // signée. `false` ne peut apparaître qu'en prévisualisation atelier
  // (option `inclureNonValidees`), jamais sur un chemin protocole/patient.
  regleValidee: boolean;
};

export type IntentionResolue = {
  intention: { id: string; code: string; labelFr: string; categorie: string };
  regles: RegleResolue[];
};

export type ResolutionIntentions = {
  contractVersion: typeof C4B_RESOLUTION_VERSION;
  // Ordre neutre documenté : les intentions suivent l'ordre de la sélection du
  // praticien ; les règles sont triées alphabétiquement (code ingrédient, puis
  // type de règle, puis identifiant). Aucune notion de « meilleur choix ».
  intentions: IntentionResolue[];
  // Codes demandés sans correspondance active (inconnus ou désactivés).
  codesInconnus: string[];
  aucunScoreAgrege: true;
};

// ─── Sentinelle de cumul ────────────────────────────────────────────────────

export type DoseEnPresence = {
  intentionCode: string;
  intentionLabelFr: string;
  regleId: string;
  versionRegle: number;
  doseCibleBasse: number | null;
  doseCibleHaute: number | null;
};

export type AlerteSecuriteJointe = {
  id: string;
  code: string;
  messageFr: string;
  niveauAlerte: string;
};

export type CategorieFonctionnelleResolue = { id: string; code: string; labelFr: string };

// Ligne `ingredient_functional_thresholds` telle que lue (jointures comprises).
// Décision actée n°6 : le niveau d'alerte n'existe que sur l'alerte jointe via
// `safetyAlertId` — jamais de copie locale côté seuil.
export type SeuilFonctionnelSource = {
  id: string;
  ingredientId: string;
  seuilDoseBasse: number | null;
  seuilDoseHaute: number | null;
  unite: string;
  basculeRisque: boolean;
  safetyAlertId: string | null;
  gradePreuveScientifique: string;
  categorieFonctionnelle: CategorieFonctionnelleResolue;
  safetyAlert: AlerteSecuriteJointe | null;
  sourceReference: SourceResolue;
};

export type SeuilFonctionnelExpose = {
  id: string;
  categorieFonctionnelle: CategorieFonctionnelleResolue;
  seuilDoseBasse: number | null;
  seuilDoseHaute: number | null;
  unite: string;
  basculeRisque: boolean;
  safetyAlertId: string | null;
  gradePreuve: GradePreuveScientifique;
  source: SourceResolue;
};

// Candidat de `ProtocolReviewFlag` : produit par la sentinelle, jamais écrit en
// base dans cette tranche. Le praticien arbitre (décision actée n°9) — le
// candidat expose les doses en présence, jamais leur somme ni leur maximum.
export type CandidatProtocolReviewFlag = {
  contractVersion: typeof C4B_SENTINELLE_VERSION;
  typeFlag: 'cumul_substance' | 'depassement_seuil';
  statutPropose: 'ouvert';
  /**
   * Le niveau de l'alerte de sécurité JOINTE, quand il y en a une — `null`
   * sinon, et `null` est la réponse juste ([[D-143]]).
   *
   * Ce champ portait `'orange'` en dur : inconditionnellement pour un cumul de
   * substance, et en repli pour un dépassement sans alerte jointe. Aucune
   * échelle de gradation n'est fondée dans le dépôt — `niveau_alerte` est un
   * `TEXT` sans `CHECK`, saisi librement à l'atelier, et aucune décision
   * clinique ne le lit. Écrire une couleur par défaut, c'était inventer la
   * gradation que [[D-132]] refuse justement d'inventer.
   *
   * L'ABSENCE N'AFFAIBLIT RIEN : ce qui alerte est le FAIT — un cumul constaté,
   * un seuil dépassé —, jamais l'étiquette posée dessus. Le jour où une échelle
   * sera fondée, elle remplira ce champ ; d'ici là il dit la vérité, qui est
   * qu'on ne sait pas.
   */
  niveauAlerte: string | null;
  ingredient: IngredientResolu;
  ingredientsConcernes: string[];
  dosesEnPresence: DoseEnPresence[];
  seuil: SeuilFonctionnelExpose | null;
  alerteSecurite: AlerteSecuriteJointe | null;
  message: string;
  suggestionAction: string;
};

// ─── Tableau de compatibilité (4 lignes actées) ─────────────────────────────

export type ValeurQualiteFormulation =
  | 'bien_documentee'
  | 'partielle'
  | 'lacunaire'
  | 'non_evaluee';

export type ValeurCompatibiliteProtocole =
  | 'compatible'
  | 'compatible_avec_vigilance'
  | 'vigilance_requise'
  | 'non_evaluee';

export type TableauCompatibilite = {
  contractVersion: typeof C4_TABLEAU_COMPATIBILITE_VERSION;
  aucunScoreGlobal: true;
  qualiteFormulation: { valeur: ValeurQualiteFormulation; justification: string };
  compatibiliteProtocole: { valeur: ValeurCompatibiliteProtocole; justification: string };
  donneesManquantes: {
    valeur: 'liste_explicite' | 'non_evaluee';
    elements: string[];
    justification: string;
  };
  derniereRevue: { valeur: 'datee' | 'non_evaluee'; date: string | null; justification: string };
};
