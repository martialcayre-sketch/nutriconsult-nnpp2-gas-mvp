// Atelier de règles cliniques (C4, LOT-03b) — gouvernance versionnée des
// `ClinicalRule`, PRATICIEN SEUL. Pendant de l'Atelier corpus pour le
// référentiel du moteur d'intention clinique.
//
// Machine à états d'une LIGNE de règle — le contenu d'une ligne ne s'édite
// JAMAIS en place (décision actée n°5, versioning append-only) :
//
//   création ────────────────► brouillon  (validePar/valideLe nuls, actif=true,
//                                          versionRegle=1 — lignée neuve)
//   brouillon ──validation───► validée    (signature posée : validePar = e-mail
//                                          praticien de session, valideLe = date ;
//                                          les versions VALIDÉES antérieures de la
//                                          lignée passent actif=false dans la
//                                          MÊME transaction)
//   brouillon ──désactivation► désactivée (abandon d'un brouillon, raison exigée)
//   validée ──révision───────► nouvelle ligne brouillon versionRegle+1 ;
//                              l'ancienne reste active ET validée jusqu'à
//                              validation de la nouvelle
//   validée ──désactivation──► désactivée (retrait, raison exigée)
//   désactivée : état TERMINAL d'une ligne — la lignée continue par révision.
//
// La lignée n'a pas d'identifiant propre dans le schéma V1 : elle est le
// triplet (intention, ingrédient, type de règle) — même clé que la résolution
// C4B (`resolution.ts`, `cleLignee`).
import { parseGradePreuveScientifique, type GradePreuveScientifique } from './types';

// ─── Statut d'une ligne ─────────────────────────────────────────────────────

export const STATUTS_REGLE = ['brouillon', 'validee', 'desactivee'] as const;
export type StatutRegle = (typeof STATUTS_REGLE)[number];

export function estStatutRegle(value: string): value is StatutRegle {
  return (STATUTS_REGLE as readonly string[]).includes(value);
}

/** Statut dérivé — jamais stocké : (actif, signature) suffisent. */
export function statutRegle(ligne: {
  actif: boolean;
  validePar: string | null;
  valideLe: Date | string | null;
}): StatutRegle {
  if (!ligne.actif) return 'desactivee';
  return ligne.validePar !== null && ligne.valideLe !== null ? 'validee' : 'brouillon';
}

/** Filtres Prisma d'un statut dérivé — MÊME périmètre que `statutRegle`. */
export const FILTRE_PAR_STATUT: Record<StatutRegle, Record<string, unknown>> = {
  brouillon: { actif: true, validePar: null },
  validee: { actif: true, validePar: { not: null } },
  desactivee: { actif: false },
};

// ─── Bornes et formats ──────────────────────────────────────────────────────

/** Codes du vocabulaire gouverné et types de règle : snake_case borné. */
export const CODE_GOUVERNE_RE = /^[a-z][a-z0-9_]{1,63}$/;
export const LIMITE_PAGE_MAX = 100;
export const JUSTIFICATION_MAX = 4000;
export const RAISON_MAX = 2000;
export const LABEL_MAX = 200;
export const CATEGORIE_MAX = 100;

/**
 * Bornes d'une référence source ([[D-131]]). Une citation est un texte
 * bibliographique — plus long qu'un libellé de vocabulaire, borné tout de même :
 * la colonne est libre en base, et une citation de dix mille signes ne se relit
 * pas dans la liste déroulante où la règle vient la choisir.
 */
export const CITATION_MAX = 1000;
export const LIEN_URL_MAX = 2000;

/**
 * Bornes des deux autres référentiels gouvernés à la main ([[D-132]]) :
 * catégories fonctionnelles et alertes de sécurité.
 *
 * `NIVEAU_ALERTE_MAX` borne un champ dont AUCUNE échelle n'est définie : la
 * colonne est un `TEXT` sans `CHECK`, et le moteur de décision ignore le
 * niveau — toute alerte active refuse, quel qu'il soit. Fixer ici une échelle
 * (« orange », « rouge »…) serait inventer une gradation clinique que rien ne
 * source. La dette est nommée à [[D-132]] plutôt que comblée au jugé.
 */
export const DESCRIPTION_MAX = 1000;
export const MESSAGE_ALERTE_MAX = 1000;
export const NIVEAU_ALERTE_MAX = 50;

/**
 * Borne du nombre d'ingrédients servis par le vocabulaire de l'atelier (C4-1c),
 * le référentiel Compl'Alim en versant ~2 000 d'un coup. Non réglable par le
 * client. Elle vit ICI et non dans la route : Next.js refuse tout export de
 * valeur hors de sa liste blanche dans un `route.ts`, et `tsc --noEmit` ne le
 * voit pas — seul `next build` le rejette.
 */
export const INGREDIENTS_MAX = 50;

/** Longueur retenue d'une recherche d'ingrédient (le surplus est coupé). */
export const REQUETE_INGREDIENT_MAX = 200;

// ─── Sélections Prisma partagées ────────────────────────────────────────────

export const SELECTION_REGLE = {
  id: true,
  typeRegle: true,
  poids: true,
  justification: true,
  conditionSupplementaire: true,
  doseCibleBasse: true,
  doseCibleHaute: true,
  gradePreuveScientifique: true,
  versionRegle: true,
  actif: true,
  creeLe: true,
  validePar: true,
  valideLe: true,
  intentTagId: true,
  ingredientId: true,
  intentTag: { select: { id: true, code: true, labelFr: true, categorie: true } },
  ingredient: { select: { id: true, code: true, nomFr: true } },
  formePreferee: { select: { id: true, code: true, labelFr: true } },
  sourceReference: { select: { id: true, citation: true, lienUrl: true } },
} as const;

export const SELECTION_LIGNEE = {
  id: true,
  versionRegle: true,
  gradePreuveScientifique: true,
  justification: true,
  validePar: true,
  valideLe: true,
  creeLe: true,
  actif: true,
  intentTagId: true,
  ingredientId: true,
  typeRegle: true,
} as const;

type LigneRegleAtelier = {
  id: string;
  typeRegle: string;
  poids: number;
  justification: string;
  conditionSupplementaire: unknown;
  doseCibleBasse: number | null;
  doseCibleHaute: number | null;
  gradePreuveScientifique: string;
  versionRegle: number;
  actif: boolean;
  creeLe: Date;
  validePar: string | null;
  valideLe: Date | null;
  intentTagId: string;
  ingredientId: string;
  intentTag: { id: string; code: string; labelFr: string; categorie: string };
  ingredient: { id: string; code: string; nomFr: string };
  formePreferee: { id: string; code: string; labelFr: string } | null;
  sourceReference: { id: string; citation: string; lienUrl: string | null };
};

type LigneLignee = {
  id: string;
  versionRegle: number;
  gradePreuveScientifique: string;
  justification: string;
  validePar: string | null;
  valideLe: Date | null;
  creeLe: Date;
  actif: boolean;
  intentTagId: string;
  ingredientId: string;
  typeRegle: string;
};

// ─── Types API (miroir de la sélection, dates ISO) ──────────────────────────

export type VersionLignee = {
  id: string;
  versionRegle: number;
  statut: StatutRegle;
  gradePreuve: GradePreuveScientifique;
  justification: string;
  validePar: string | null;
  valideLe: string | null;
  creeLe: string;
};

export type RegleAtelier = {
  id: string;
  statut: StatutRegle;
  versionRegle: number;
  typeRegle: string;
  poids: number;
  intention: { id: string; code: string; labelFr: string; categorie: string };
  ingredient: { id: string; code: string; nomFr: string };
  formePreferee: { id: string; code: string; labelFr: string } | null;
  doseCibleBasse: number | null;
  doseCibleHaute: number | null;
  gradePreuve: GradePreuveScientifique;
  justification: string;
  conditionSupplementaire: unknown;
  source: { id: string; citation: string; lienUrl: string | null };
  creeLe: string;
  validePar: string | null;
  valideLe: string | null;
  /** Versions ANTÉRIEURES ou parallèles de la même lignée (desc), sans la ligne elle-même. */
  lignee: VersionLignee[];
};

export function cleLigneeRegle(ligne: {
  intentTagId: string;
  ingredientId: string;
  typeRegle: string;
}): string {
  return `${ligne.intentTagId}::${ligne.ingredientId}::${ligne.typeRegle}`;
}

export function serialiserVersionLignee(ligne: LigneLignee): VersionLignee {
  return {
    id: ligne.id,
    versionRegle: ligne.versionRegle,
    statut: statutRegle(ligne),
    gradePreuve: parseGradePreuveScientifique(ligne.gradePreuveScientifique),
    justification: ligne.justification,
    validePar: ligne.validePar,
    valideLe: ligne.valideLe ? ligne.valideLe.toISOString() : null,
    creeLe: ligne.creeLe.toISOString(),
  };
}

export function serialiserRegle(ligne: LigneRegleAtelier, lignee: LigneLignee[]): RegleAtelier {
  return {
    id: ligne.id,
    statut: statutRegle(ligne),
    versionRegle: ligne.versionRegle,
    typeRegle: ligne.typeRegle,
    poids: ligne.poids,
    intention: ligne.intentTag,
    ingredient: ligne.ingredient,
    formePreferee: ligne.formePreferee,
    doseCibleBasse: ligne.doseCibleBasse,
    doseCibleHaute: ligne.doseCibleHaute,
    gradePreuve: parseGradePreuveScientifique(ligne.gradePreuveScientifique),
    justification: ligne.justification,
    conditionSupplementaire: ligne.conditionSupplementaire ?? null,
    source: ligne.sourceReference,
    creeLe: ligne.creeLe.toISOString(),
    validePar: ligne.validePar,
    valideLe: ligne.valideLe ? ligne.valideLe.toISOString() : null,
    lignee: lignee
      .filter((version) => version.id !== ligne.id)
      .sort((left, right) => right.versionRegle - left.versionRegle
        || right.creeLe.getTime() - left.creeLe.getTime()
        || (left.id < right.id ? 1 : -1))
      .map(serialiserVersionLignee),
  };
}

// ─── Validation du contenu d'une règle (création et révision) ───────────────

/** Contenu normalisé prêt pour un `create` — `poids` nul = « à défaut ». */
export type ContenuRegle = {
  formePrefereeId: string | null;
  doseCibleBasse: number | null;
  doseCibleHaute: number | null;
  gradePreuveScientifique: GradePreuveScientifique;
  justification: string;
  sourceReferenceId: string;
  poids: number | null;
  conditionSupplementaire: { critereId: string } | null;
};

export type VerdictContenu =
  | { ok: true; contenu: ContenuRegle }
  | { ok: false; reason: string; message: string };

function texteOptionnel(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function doseOptionnelle(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const nombre = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(nombre) || nombre < 0) return undefined; // invalide
  return nombre;
}

/**
 * Valide les champs de CONTENU communs à la création et à la révision.
 * Purement syntaxique : l'existence des référentiels (source, forme, critère)
 * reste vérifiée par les routes contre la base.
 */
export function validerContenuRegle(body: {
  formePrefereeId?: unknown;
  doseCibleBasse?: unknown;
  doseCibleHaute?: unknown;
  gradePreuveScientifique?: unknown;
  justification?: unknown;
  sourceReferenceId?: unknown;
  poids?: unknown;
  conditionSupplementaire?: unknown;
}): VerdictContenu {
  const sourceReferenceId = texteOptionnel(body.sourceReferenceId);
  if (!sourceReferenceId) {
    return {
      ok: false,
      reason: 'source_requise',
      message: 'La source est obligatoire — une règle sans source ne peut pas exister.',
    };
  }

  const justification = texteOptionnel(body.justification);
  if (!justification || justification.length > JUSTIFICATION_MAX) {
    return {
      ok: false,
      reason: 'justification_requise',
      message: `La justification est obligatoire (${JUSTIFICATION_MAX} caractères au plus).`,
    };
  }

  // Échelle GRADE seule — `parseGradePreuveScientifique` refuse explicitement
  // A/B/C/D (échelle du moteur d'équilibre) avec un message qui l'explique.
  let gradePreuveScientifique: GradePreuveScientifique;
  try {
    gradePreuveScientifique = parseGradePreuveScientifique(
      typeof body.gradePreuveScientifique === 'string' ? body.gradePreuveScientifique : '',
    );
  } catch (err) {
    return {
      ok: false,
      reason: 'grade_invalide',
      message: err instanceof TypeError ? err.message : 'Grade de preuve scientifique invalide.',
    };
  }

  const doseCibleBasse = doseOptionnelle(body.doseCibleBasse);
  const doseCibleHaute = doseOptionnelle(body.doseCibleHaute);
  if (doseCibleBasse === undefined || doseCibleHaute === undefined) {
    return {
      ok: false,
      reason: 'doses_invalides',
      message: 'Les doses cibles doivent être des nombres positifs.',
    };
  }
  if (doseCibleBasse !== null && doseCibleHaute !== null && doseCibleBasse > doseCibleHaute) {
    return {
      ok: false,
      reason: 'doses_invalides',
      message: 'La dose cible basse ne peut pas dépasser la dose cible haute.',
    };
  }

  let poids: number | null = null;
  if (body.poids !== undefined && body.poids !== null && body.poids !== '') {
    const nombre = typeof body.poids === 'number' ? body.poids : Number(body.poids);
    if (!Number.isInteger(nombre) || nombre < 1 || nombre > 1000) {
      return {
        ok: false,
        reason: 'poids_invalide',
        message: 'Le poids doit être un entier entre 1 et 1000.',
      };
    }
    poids = nombre;
  }

  // Décision actée n°4 : la condition supplémentaire référence un critère du
  // vocabulaire gouverné (`clinical_criteria`), jamais une chaîne libre.
  let conditionSupplementaire: { critereId: string } | null = null;
  if (body.conditionSupplementaire !== undefined && body.conditionSupplementaire !== null) {
    const condition = body.conditionSupplementaire;
    const critereId =
      typeof condition === 'object' && !Array.isArray(condition)
        ? texteOptionnel((condition as { critereId?: unknown }).critereId)
        : null;
    if (!critereId) {
      return {
        ok: false,
        reason: 'condition_invalide',
        message:
          'La condition supplémentaire doit référencer un critère du vocabulaire gouverné '
          + '({ critereId }), jamais une chaîne libre.',
      };
    }
    conditionSupplementaire = { critereId };
  }

  return {
    ok: true,
    contenu: {
      formePrefereeId: texteOptionnel(body.formePrefereeId),
      doseCibleBasse,
      doseCibleHaute,
      gradePreuveScientifique,
      justification,
      sourceReferenceId,
      poids,
      conditionSupplementaire,
    },
  };
}
