// Règle de décision « compléments avant biologie » (LOT-05, `D-056`).
//
// Module PUR : il ne lit rien: la couche appelante lui passe ce qu'elle a lu du
// catalogue. Il rend un VERDICT motivé, jamais un booléen — un refus doit dire
// LEQUEL des obstacles il a rencontré (`CauseRefus` les énumère, et deux
// obstacles voisins ne se confondent jamais), et « pas d'obstacle constaté »
// n'est pas un motif de refus recevable (`DC-34`, `DC-35`).
//
// L'inversion qui fait tout l'objet du module (`D-056`, arbitrage 2) : les
// conditions négatives de la spec — « aucune alerte active », « seuils
// respectés » — seraient VRAIES PAR VACUITÉ sur la production d'aujourd'hui, où
// `supplement_safety_alerts` et `ingredient_functional_thresholds` comptent zéro
// ligne. Elles passeraient parce que rien n'a été examiné, non parce que le
// complément est sûr. Ici, l'absence d'information vaut refus (`DC-24`).

import { sentinelleADeQuoiConclure } from './sentinelleCore';
import type {
  AlerteSecuriteJointe,
  IngredientResolu,
  RegleResolue,
  ResolutionIntentions,
  SeuilFonctionnelSource,
} from './types';

export const C4_DECISION_AVANT_BIOLOGIE_VERSION = 'c4-decision-avant-biologie-v1' as const;

/**
 * Éléments qui peuvent concourir à un déclencheur. `score_dnst` y figure pour
 * pouvoir être REFUSÉ nommément : il n'est pas un déclencheur recevable, seul
 * ou accompagné (`DC-27` score ≠ diagnostic, `DC-28` un questionnaire isolé ne
 * suffit pas à conclure).
 */
export type OrigineDeclencheur = 'besoin_degrade' | 'plainte' | 'anamnese' | 'score_dnst';

const ORIGINES_CLINIQUES_REQUISES: readonly OrigineDeclencheur[] = [
  'besoin_degrade',
  'plainte',
  'anamnese',
];

export type CauseRefus =
  | 'catalogue_decision_vide'
  | 'regle_non_validee'
  | 'source_absente'
  // Les deux issues du CLAIM FONDATEUR ([[D-140]]), séparées pour la même
  // raison que les trois du critère : une règle qui ne nomme AUCUN claim et une
  // règle dont le claim n'est pas validé au corpus refusent toutes deux, mais
  // la première est une lacune de la règle et la seconde un état du corpus. Les
  // confondre ferait chercher le défaut au mauvais endroit.
  | 'claim_absent'
  | 'claims_non_valides'
  | 'catalogue_alertes_non_publie'
  | 'alerte_securite_active'
  | 'aucun_seuil_publie'
  | 'seuil_depasse'
  | 'condition_illisible'
  // Les trois issues d'une condition de CRITÈRE ([[D-138]]). Elles refusent
  // toutes, et elles ne disent pas la même chose : seule la première est une
  // dette (un geste manque), la deuxième est un constat clinique acquis, la
  // troisième est un défaut d'appelant.
  | 'condition_critere_non_constate'
  | 'condition_critere_non_remplie'
  | 'constat_critere_incoherent'
  | 'declencheur_insuffisant';

export type WaitForBiologie = { type: 'biologie'; cible: string; echeance?: string };

export type VerdictAvantBiologie =
  | {
      verdict: 'intention';
      contractVersion: typeof C4_DECISION_AVANT_BIOLOGIE_VERSION;
      statut: 'active' | 'conditionnelle_biologie';
      waitFor?: WaitForBiologie;
      ingredient: IngredientResolu;
      regleId: string;
      versionRegle: number;
      motif: string;
    }
  | {
      verdict: 'refus';
      contractVersion: typeof C4_DECISION_AVANT_BIOLOGIE_VERSION;
      cause: CauseRefus;
      ingredient: IngredientResolu | null;
      regleId: string | null;
      motif: string;
    };

/**
 * Ce que l'appelant doit avoir lu pour qu'une décision soit possible.
 *
 * `catalogueAlertesPublie` se garde au niveau CATALOGUE, pas au niveau
 * ingrédient : qu'un ingrédient ne porte aucune alerte est le cas normal et ne
 * prouve rien ; ce qui fait preuve, c'est que le catalogue d'alertes existe.
 * `seuilsActifs` se garde au niveau INGRÉDIENT : sans seuil publié, la borne de
 * dose portée par la règle n’est comparable à rien (`D-056`, arbitrage 2).
 */
export type ContexteDecision = {
  regle: RegleResolue;
  catalogueAlertesPublie: boolean;
  alertesActives: readonly AlerteSecuriteJointe[];
  seuilsActifs: readonly SeuilFonctionnelSource[];
  claimsValides: boolean;
  declencheur: readonly OrigineDeclencheur[];
  /**
   * Ce que l'appelant a LU dans `criteres_dossier_constates` pour le critère
   * porté par la règle — `null` quand AUCUNE ligne n'existe ([[D-138]]).
   *
   * Le champ est requis, y compris pour une règle sans condition de critère :
   * l'appelant doit avoir regardé. Un appelant qui ne lit pas passe `null`, ce
   * qui vaut « non constaté » et REFUSE — fail-closed, comme les autres
   * absences de ce module (`DC-24`). Le `critereId` y figure pour que le module
   * puisse VÉRIFIER que le constat porte bien sur le critère de la règle : un
   * constat d'un autre critère n'est pas un constat.
   */
  constatCritere: { critereId: string; present: boolean } | null;
};

function refus(
  cause: CauseRefus,
  motif: string,
  ingredient: IngredientResolu | null,
  regleId: string | null,
): VerdictAvantBiologie {
  return {
    verdict: 'refus',
    contractVersion: C4_DECISION_AVANT_BIOLOGIE_VERSION,
    cause,
    ingredient,
    regleId,
    motif,
  };
}

/**
 * Lecture de `conditionBiologie`, typée `unknown` en base ([[D-138]] : la
 * colonne ne porte plus QUE cette nature — la référence de critère a sa propre
 * colonne, et sa propre porte, plus haut dans la décision).
 *
 * Trois issues et trois seulement : absente (règle inconditionnelle), lisible
 * comme condition biologique, ou ILLISIBLE — et une condition illisible est un
 * refus, jamais une règle inconditionnelle. Se tromper de sens ici ferait naître
 * « active » une intention que sa règle voulait suspendre.
 */
function lireConditionBiologique(
  valeur: unknown,
): { forme: 'absente' } | { forme: 'biologie'; waitFor: WaitForBiologie } | { forme: 'illisible' } {
  if (valeur === null || valeur === undefined) return { forme: 'absente' };
  if (typeof valeur !== 'object' || Array.isArray(valeur)) return { forme: 'illisible' };
  const condition = valeur as Record<string, unknown>;
  if (condition.type !== 'biologie') return { forme: 'illisible' };
  const cible = condition.cible;
  if (typeof cible !== 'string' || !cible.trim()) return { forme: 'illisible' };
  const echeance = condition.echeance;
  if (echeance === undefined || echeance === null) {
    return { forme: 'biologie', waitFor: { type: 'biologie', cible: cible.trim() } };
  }
  if (typeof echeance !== 'string') return { forme: 'illisible' };
  const date = new Date(echeance);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== echeance) return { forme: 'illisible' };
  return { forme: 'biologie', waitFor: { type: 'biologie', cible: cible.trim(), echeance } };
}

/** Une borne de dose, prise individuellement, dépasse-t-elle le seuil haut ? */
function depasseSeuilHaut(regle: RegleResolue, seuil: SeuilFonctionnelSource): boolean {
  if (seuil.seuilDoseHaute === null) return false;
  const haut = seuil.seuilDoseHaute;
  return (regle.doseCibleBasse !== null && regle.doseCibleBasse > haut)
    || (regle.doseCibleHaute !== null && regle.doseCibleHaute > haut);
}

/**
 * Décide d'UNE règle. L'ordre des contrôles n'est pas indifférent : la
 * validation d'abord (barrière `D-003` — rien d'actionnable sans validation
 * praticien signée), la sécurité ensuite (`DC-12`, `DC-23` — un signal de
 * sécurité prime), le déclencheur clinique, puis les CONDITIONS portées par la
 * règle : le critère ([[D-138]]) avant la biologie, parce qu'une règle dont le
 * critère n'est pas rempli ne s'applique pas à ce dossier — il n'y a alors rien
 * à suspendre à un bilan.
 */
export function deciderIntentionAvantBiologie(contexte: ContexteDecision): VerdictAvantBiologie {
  const { regle } = contexte;
  const ingredient = regle.ingredient;

  // 1. Provenance certifiée (`DC-01`, `DC-02`).
  if (!regle.regleValidee || !regle.validePar || !regle.valideLe) {
    return refus(
      'regle_non_validee',
      `La règle « ${regle.regleId} » n’est pas validée par un praticien : aucune intention `
        + `ne peut en naître.`,
      ingredient,
      regle.regleId,
    );
  }
  if (!regle.source.citation.trim()) {
    return refus(
      'source_absente',
      `La règle « ${regle.regleId} » ne cite aucune source : une règle clinique sans `
        + `provenance ne s’applique pas.`,
      ingredient,
      regle.regleId,
    );
  }
  // Le claim FONDATEUR ([[D-140]]) : « une plage fonctionnelle sans claim validé
  // n'existe pas, donc n'est jamais servie » — l'invariant des plages
  // biologiques et des règles d'orientation, que `clinical_rules` était seule à
  // ne pas porter.
  const claim = regle.claim;
  if (claim === null) {
    return refus(
      'claim_absent',
      `La règle « ${regle.regleId} » ne nomme aucun claim fondateur : rien ne relie ce `
        + `qu’elle affirme au corpus validé.`,
      ingredient,
      regle.regleId,
    );
  }
  if (!contexte.claimsValides) {
    return refus(
      'claims_non_valides',
      `Le claim « ${claim.claimId} » (${claim.versionClaim}) qui fonde la règle `
        + `« ${regle.regleId} » n’est pas validé au corpus.`,
      ingredient,
      regle.regleId,
    );
  }

  // 2. Sécurité — l'absence d'information ne vaut jamais autorisation.
  if (!contexte.catalogueAlertesPublie) {
    return refus(
      'catalogue_alertes_non_publie',
      `Le catalogue d’alertes de sécurité n’est pas publié : « aucune alerte » ne serait `
        + `pas un constat, seulement une absence d’examen. Aucun complément ne peut être `
        + `proposé tant que ce catalogue n'existe pas.`,
      ingredient,
      regle.regleId,
    );
  }
  const alerte = contexte.alertesActives[0];
  if (alerte !== undefined) {
    return refus(
      'alerte_securite_active',
      `Alerte de sécurité active sur « ${ingredient.nomFr} » : ${alerte.messageFr}`,
      ingredient,
      regle.regleId,
    );
  }
  if (contexte.seuilsActifs.length === 0) {
    return refus(
      'aucun_seuil_publie',
      `Aucun seuil fonctionnel publié pour « ${ingredient.nomFr} » : la dose cible de la `
        + `règle n’est comparable à rien, donc « seuils respectés » ne peut pas être conclu.`,
      ingredient,
      regle.regleId,
    );
  }
  const seuilDepasse = contexte.seuilsActifs.find(seuil => depasseSeuilHaut(regle, seuil));
  if (seuilDepasse !== undefined) {
    return refus(
      'seuil_depasse',
      `La dose cible de la règle « ${regle.regleId} » dépasse le seuil haut publié pour `
        + `« ${ingredient.nomFr} » (${seuilDepasse.seuilDoseHaute} ${seuilDepasse.unite}, `
        + `catégorie « ${seuilDepasse.categorieFonctionnelle.labelFr} »).`,
      ingredient,
      regle.regleId,
    );
  }

  // 3. Déclencheur : un tableau clinique, jamais un score.
  const origines = new Set(contexte.declencheur);
  const manquantes = ORIGINES_CLINIQUES_REQUISES.filter(origine => !origines.has(origine));
  if (manquantes.length > 0) {
    const complementDnst = origines.has('score_dnst')
      ? ' Un axe DNST ne comble aucun de ces éléments : il n’est pas un déclencheur recevable.'
      : '';
    return refus(
      'declencheur_insuffisant',
      `Le tableau clinique est incomplet pour « ${ingredient.nomFr} » — manque : `
        + `${manquantes.join(', ')}.${complementDnst}`,
      ingredient,
      regle.regleId,
    );
  }

  // 4. Condition de CRITÈRE ([[D-138]]) — avant la biologie, parce qu'elle ne
  //    porte pas sur le même plan : une règle dont le critère n'est pas rempli
  //    NE S'APPLIQUE PAS à ce dossier, il n'y a donc rien à suspendre à un
  //    bilan. Un critère ne se calcule pas : il est constaté par un praticien
  //    qui le signe (rien dans le dépôt ne dit ce qu'un critère lit chez un
  //    patient — l'inventer serait inventer de la clinique, `DC-19`, `DC-20`).
  const critere = regle.conditionCritere;
  if (critere !== null) {
    const constat = contexte.constatCritere;
    if (constat === null) {
      return refus(
        'condition_critere_non_constate',
        `La règle « ${regle.regleId} » est conditionnée au critère « ${critere.labelFr} », `
          + `et ce critère n’a pas été constaté sur ce dossier. Une information absente n’est `
          + `pas une autorisation : le constat doit être posé — présent ou absent — avant `
          + `qu’une intention puisse en naître.`,
        ingredient,
        regle.regleId,
      );
    }
    if (constat.critereId !== critere.critereId) {
      return refus(
        'constat_critere_incoherent',
        `Le constat fourni porte sur un autre critère que celui de la règle `
          + `« ${regle.regleId} » : il ne peut pas en tenir lieu.`,
        ingredient,
        regle.regleId,
      );
    }
    if (!constat.present) {
      return refus(
        'condition_critere_non_remplie',
        `Le critère « ${critere.labelFr} », auquel la règle « ${regle.regleId} » est `
          + `conditionnée, a été constaté ABSENT sur ce dossier : la règle ne s’y applique pas.`,
        ingredient,
        regle.regleId,
      );
    }
  }

  // 5. Statut de naissance selon la condition BIOLOGIQUE portée par la règle.
  const condition = lireConditionBiologique(regle.conditionBiologie);
  if (condition.forme === 'illisible') {
    return refus(
      'condition_illisible',
      `La condition supplémentaire de la règle « ${regle.regleId} » est illisible : elle `
        + `n’est pas traitée comme une absence de condition.`,
      ingredient,
      regle.regleId,
    );
  }
  const commun = {
    verdict: 'intention' as const,
    contractVersion: C4_DECISION_AVANT_BIOLOGIE_VERSION,
    ingredient,
    regleId: regle.regleId,
    versionRegle: regle.versionRegle,
  };
  if (condition.forme === 'biologie') {
    return {
      ...commun,
      statut: 'conditionnelle_biologie',
      waitFor: condition.waitFor,
      motif: `Intention fondée sur la règle validée « ${regle.regleId} », suspendue à `
        + `« ${condition.waitFor.cible} » : provisoire jusqu'à l'arbitrage biologique.`,
    };
  }
  return {
    ...commun,
    statut: 'active',
    motif: `Intention fondée sur la règle validée « ${regle.regleId} » : règle `
      + `inconditionnelle, sécurité examinée, tableau clinique complet.`,
  };
}

/**
 * Décide sur une résolution entière.
 *
 * `sentinelleADeQuoiConclure` est la porte d'entrée et NON une seconde
 * primitive : elle dit déjà « aucune règle validée n'atteint le moindre
 * ingrédient », ce qui est l'état de la production tant que `clinical_rules` est
 * vide. Sans cette porte, la boucle rendrait `[]` — et `[]` se lirait « aucune
 * intention indiquée » là où il faut lire « rien n'a été examiné ».
 */
/**
 * Le constat à passer au moteur pour cette règle — `null` dès qu'il n'y a rien
 * à passer, ce qui vaut « non constaté » et refuse ([[D-138]]).
 *
 * `has` puis `get` plutôt qu'un `?? false` : une clé absente et un constat
 * d'absence ne sont pas la même chose, et les confondre ferait dire au moteur
 * « le praticien a constaté que non » là où personne ne s'est prononcé.
 */
function constatPour(
  regle: RegleResolue,
  constats: ReadonlyMap<string, boolean>,
): { critereId: string; present: boolean } | null {
  const critere = regle.conditionCritere;
  if (critere === null || !constats.has(critere.critereId)) return null;
  return { critereId: critere.critereId, present: constats.get(critere.critereId) === true };
}

export function deciderIntentionsAvantBiologie(
  resolution: ResolutionIntentions,
  catalogue: {
    catalogueAlertesPublie: boolean;
    alertesParIngredient: ReadonlyMap<string, readonly AlerteSecuriteJointe[]>;
    seuilsParIngredient: ReadonlyMap<string, readonly SeuilFonctionnelSource[]>;
    claimsValidesParRegle: ReadonlyMap<string, boolean>;
    declencheur: readonly OrigineDeclencheur[];
    constatsParCritere: ReadonlyMap<string, boolean>;
  },
): VerdictAvantBiologie[] {
  if (!sentinelleADeQuoiConclure(resolution)) {
    return [
      refus(
        'catalogue_decision_vide',
        'Aucune règle clinique validée n’atteint le moindre ingrédient : le catalogue de '
          + 'décision est vide. Rien n’a été examiné — ce n’est pas un feu vert.',
        null,
        null,
      ),
    ];
  }
  const verdicts: VerdictAvantBiologie[] = [];
  for (const { regles } of resolution.intentions) {
    for (const regle of regles) {
      if (!regle.regleValidee) continue;
      verdicts.push(deciderIntentionAvantBiologie({
        regle,
        catalogueAlertesPublie: catalogue.catalogueAlertesPublie,
        alertesActives: catalogue.alertesParIngredient.get(regle.ingredient.id) ?? [],
        seuilsActifs: catalogue.seuilsParIngredient.get(regle.ingredient.id) ?? [],
        claimsValides: catalogue.claimsValidesParRegle.get(regle.regleId) ?? false,
        declencheur: catalogue.declencheur,
        constatCritere: constatPour(regle, catalogue.constatsParCritere),
      }));
    }
  }
  return verdicts;
}
