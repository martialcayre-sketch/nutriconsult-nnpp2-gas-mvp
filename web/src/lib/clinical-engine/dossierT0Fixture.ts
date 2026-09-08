import { CATALOGUE_DEFINITIONS } from '../bibliotheque';
import { RIDEAU_T0 } from './preconditionsT0';

/**
 * Dossier de référence qui PASSE les préconditions T0 ([[D-052]]).
 *
 * Partagé par les bancs des trois routes concernées : sans lui, chacune
 * décrirait « un dossier confirmable » à sa façon, et une condition qui
 * changerait devrait être retrouvée dans trois fixtures divergentes.
 *
 * Les réponses brutes sont DÉRIVÉES DU CATALOGUE plutôt qu'écrites à la main :
 * une définition qui gagne ou perd un item ne doit pas rendre un banc vert par
 * accident.
 */
export function reponsesCompletes(idQuestionnaire: string): Record<string, unknown> {
  const definition = CATALOGUE_DEFINITIONS[idQuestionnaire];
  if (!definition) throw new Error(`Définition absente du catalogue : ${idQuestionnaire}`);
  const brutes: Record<string, unknown> = {};
  for (const section of (definition as { sections?: unknown[] }).sections ?? []) {
    for (const question of ((section as { questions?: unknown[] }).questions ?? [])) {
      const q = question as { id: string; min?: number; options?: { v: number }[] };
      brutes[q.id] = q.options?.[0]?.v ?? q.min ?? 1;
    }
  }
  return brutes;
}

export const DATE_RIDEAU_FIXTURE = new Date('2026-01-01T00:00:00.000Z');

/**
 * CAS DE RÉFÉRENCE DU LOT-04 — `Q_MOD_03` avec deux axes en bande haute.
 *
 * POURQUOI IL FALLAIT UNE VARIANTE. `reponsesCompletes` met TOUS les items au
 * minimum : sur une échelle de plainte dont 1 est l'absence de trouble, cela
 * décrit un patient sans aucune plainte, et aucune règle de priorité ne peut s'y
 * déclencher. La fixture partagée reste donc ce qu'elle est — un dossier qui
 * PASSE les préconditions — et le cas de référence clinique est écrit ici, à
 * côté, plutôt que d'être obtenu en tordant l'autre.
 *
 * Les valeurs citent les bandes publiées par `questions.ts` : 8 est dans
 * « Intensité élevée » (7-8), 9 dans « Intensité très élevée » (9-10), et les
 * cinq autres domaines restent dans « Intensité faible ou absente » (1-3). Le
 * surpoids est délibérément AU-DESSUS de la digestion : c'est ce qui rend le
 * classement observable — sans cet écart, le départage se ferait sur la priorité
 * intrinsèque de la table et le banc ne dirait rien de la plainte dominante.
 */
export const PLAINTES_DIGESTIF_ET_PONDERAL: Record<string, number> = {
  Q001: 2, // Fatigue
  Q002: 2, // Douleurs
  Q003: 8, // Digestion — « Intensité élevée »
  Q004: 9, // Surpoids — « Intensité très élevée », plainte dominante
  Q005: 2, // Insomnie
  Q006: 2, // Moral
  Q007: 1, // Mobilité
};

/**
 * Les quatre instruments du rideau, cotables, au statut par défaut.
 *
 * `plaintes` remplace les réponses de `Q_MOD_03` — le canal de plainte du
 * LOT-04. Absent, le comportement est strictement celui d'avant.
 */
export function passationsRideauT0(
  dateReponse: Date = DATE_RIDEAU_FIXTURE,
  plaintes?: Record<string, number>,
) {
  return RIDEAU_T0.map(idQuestionnaire => ({
    idQuestionnaire,
    dateReponse,
    scoresJson: {
      rawAnswers: plaintes && idQuestionnaire === 'Q_MOD_03'
        ? plaintes
        : reponsesCompletes(idQuestionnaire),
    },
    statutValidite: 'VALID',
  }));
}

/**
 * Les mêmes passations, sous la forme que lit `loadRuntimeInputs` (donc avec
 * `idReponse`) — c'est-à-dire les entrées de la chaîne C1.
 *
 * DEUX LECTURES DISTINCTES, UNE SEULE VÉRITÉ. Le cockpit lit les passations deux
 * fois : une fois pour composer l'ÉPISODE (avec `idReponse`), une fois pour
 * évaluer les PRÉCONDITIONS (sans). Le recalcul serveur relit la première.
 * Dériver les deux du même appel garantit qu'un banc ne décrive pas un dossier
 * qui confirme sur des données et se recalcule sur d'autres.
 *
 * Trié par `idReponse` : c'est l'ordre que la route demande à Prisma, et un mock
 * qui rendrait un autre ordre éprouverait un cas qui n'existe pas.
 */
export function reponsesRuntimeRideauT0(
  dateReponse: Date = DATE_RIDEAU_FIXTURE,
  plaintes?: Record<string, number>,
) {
  return passationsRideauT0(dateReponse, plaintes)
    .map(passation => ({ ...passation, idReponse: `REP_${passation.idQuestionnaire}` }))
    .sort((gauche, droite) => gauche.idReponse.localeCompare(droite.idReponse));
}

/** Synthèse validée, postérieure au rideau ci-dessus. */
export const SYNTHESE_VALIDEE_FIXTURE = {
  statut: 'Validee_Praticien',
  dateValidation: new Date('2026-01-02T00:00:00.000Z'),
};

/** Consultation validée portant un motif principal non vide. */
export const CONSULTATION_VALIDEE_FIXTURE = {
  anamnese: { motif_principal: 'Fatigue persistante depuis six mois.' },
};

/**
 * Le SECOND RIDEAU du dossier de référence ([[D-157]]) — assigné APRÈS la
 * validation de la synthèse, et rendu.
 *
 * La date est postérieure à `SYNTHESE_VALIDEE_FIXTURE.dateValidation` d'un
 * jour, et c'est la seule chose qui compte : la borne du second rideau est cette
 * validation-là. Un instrument HORS `RIDEAU_T0` — le second rideau explore ce
 * que le premier a fait apparaître, il ne le repasse pas.
 */
export const DATE_SECOND_RIDEAU_FIXTURE = new Date('2026-01-03T00:00:00.000Z');

export const SECOND_RIDEAU_RENDU_FIXTURE = [
  {
    idQuestionnaire: 'Q_GAS_01',
    titre: 'Confort digestif',
    dateAssignation: DATE_SECOND_RIDEAU_FIXTURE,
    statut: 'Complété',
  },
];
