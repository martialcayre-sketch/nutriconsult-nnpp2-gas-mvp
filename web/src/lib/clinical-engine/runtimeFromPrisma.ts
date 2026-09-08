import { joursDepuisAncre } from '../protocol/fenetreJalon';
import { estAncreDeCycle, estAncreInitiale, estJalonMomentum, indexDeCycle } from '../protocol/cycles';
import type { JalonMomentum } from '../equilibre/types';
import { proposeAssessmentEpisode } from './assessmentEpisode';
import { canonicalSha256 } from './canonical';
import { lireEtatPopulation, type EtatPopulation } from '../consultation/etatPopulation';
import { signauxDeclares } from './safetyFindings';
import type {
  PatientContext,
  ProposedAssessmentEpisode,
  QuestionnaireResponseInput,
} from './types';

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Les jalons que le runtime sert par défaut, dans l'ordre du PREMIER cycle.
 * Ce n'est plus la liste de ce qui est acceptable — `estJalonMomentum` l'est —
 * mais un ordre d'affichage : la série des ancres est ouverte depuis `D-113`.
 */
export const JALONS_RUNTIME = ['T0', 'J21', 'J42', 'J90'] as const satisfies readonly JalonMomentum[];

export type RuntimePatientRow = {
  idPatient: string;
  createdAt: Date;
};

export type RuntimeResponseRow = {
  idReponse: string;
  idQuestionnaire: string;
  dateReponse: Date;
  scoresJson: unknown;
};

export type RuntimeConsultationRow = {
  anamnese: unknown;
} | null;

export type RuntimeInputs = {
  patient: RuntimePatientRow;
  responses: QuestionnaireResponseInput[];
  patientContext: PatientContext;
  /**
   * Les signaux d'alerte déclarés, bruts — entrée du producteur de constats de
   * sécurité ([[D-099]], LOT-04).
   *
   * LU ICI, ET PAS AILLEURS, parce qu'ici est le seul endroit que le cockpit et
   * `verifierChaineC1` traversent tous les deux : leur JSDoc respective dit
   * qu'une lecture divergente ferait 409 sur une carte honnête, et un signal
   * de sécurité lu d'un côté seulement produirait exactement cela.
   */
  signauxAlerte: string[];
  /**
   * L'état de population déclaré par le patient ([[D-101]], LOT-05).
   *
   * LU ICI POUR LA MÊME RAISON QUE `signauxAlerte`, et elle vaut d'être répétée
   * plutôt que déduite : le cockpit et `verifierChaineC1` traversent tous deux
   * cette fonction, et eux seuls. Un état lu d'un côté seulement ferait
   * diverger la gate de population, donc l'ordre des candidats, donc l'empreinte
   * de la carte — c'est-à-dire un 409 sur une carte honnête.
   *
   * JAMAIS OPTIONNEL, ET JAMAIS PARTIEL : `lireEtatPopulation` rend toujours
   * les sept critères, `inconnu` compris. Un état absent du type laisserait un
   * appelant construire la chaîne sans lui, et « je n'ai pas regardé »
   * redeviendrait « rien à signaler » (`DC-24`).
   */
  etatPopulation: EtatPopulation;
};

export type RuntimeEpisodeProposal = {
  proposal: ProposedAssessmentEpisode;
  proposalHash: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean))].sort();
}

/**
 * Le jalon reçu de l'extérieur est-il un jalon que la chaîne sait traiter ?
 *
 * L'APPARTENANCE À UNE LISTE FERMÉE NE SUFFIT PLUS : `T1` est une ancre valide
 * et n'appartient à aucune liste connue d'avance. Cette porte dit la FORME —
 * une ancre bien écrite, ou l'un des trois jalons de mesure. Elle ne dit RIEN
 * du droit de poser cette ancre-là sur ce dossier-là : c'est `ancreRecevable`,
 * appliqué en aval avec les ancres déjà posées sous les yeux.
 */
export function isRuntimeMilestone(value: unknown): value is JalonMomentum {
  return typeof value === 'string' && estJalonMomentum(value);
}

export function adaptRuntimeInputs(
  patient: RuntimePatientRow,
  responseRows: RuntimeResponseRow[],
  consultation: RuntimeConsultationRow,
): RuntimeInputs {
  const responses = responseRows
    .map((row): QuestionnaireResponseInput => ({
      responseId: row.idReponse,
      questionnaireId: row.idQuestionnaire,
      observedAt: row.dateReponse.toISOString(),
      scoresJson: row.scoresJson,
      // Le schéma actuel ne stocke aucune version de scoring fiable.
      scoreVersion: null,
    }))
    .sort((left, right) => (
      left.observedAt.localeCompare(right.observedAt)
      || left.responseId.localeCompare(right.responseId)
    ));

  const anamnese = asRecord(consultation?.anamnese);
  const patientContext: PatientContext = {
    mainReason: optionalText(anamnese.motif_principal),
    priorityGoal: optionalText(anamnese.objectif_prioritaire),
    expectations: stringList(anamnese.attentes),
    // Aucun champ canonique de contraintes n'existe dans l'anamnèse actuelle.
    constraints: [],
  };

  return {
    patient,
    responses,
    patientContext,
    signauxAlerte: signauxDeclares(anamnese),
    etatPopulation: lireEtatPopulation(anamnese),
  };
}

/**
 * L'ancre du cycle courant, telle que l'appelant l'a lue en base : son NOM,
 * qui identifie le cycle, ET sa date de confirmation, qui ancre la fenêtre.
 *
 * Les deux, et non plus la seule date : l'identifiant d'un épisode de MESURE
 * doit porter le cycle, faute de quoi deux cycles partagent une ligne — voir
 * `identifiantEpisode`.
 */
export type AncreCycleCourant = {
  ancre: string;
  confirmedAt: string;
};

/**
 * L'IDENTIFIANT D'UN ÉPISODE RUNTIME — IL DOIT PORTER LE CYCLE.
 *
 * Il valait `runtime-episode-<patient>-<jalon>`. Tant qu'un dossier n'avait
 * qu'un seul cycle, cette forme était unique. Elle a cessé de l'être le jour
 * où `D-113` a fait de l'ouverture d'un `T1` un geste offert : le `J21` du
 * deuxième cycle prenait le MÊME identifiant que celui du premier, donc la
 * même clé primaire — et les deux points de persistance écrivent par
 * `upsert(..., update: {})`. La confirmation du second n'écrivait RIEN, sous
 * une réponse `ok: true`, et le `protocol_drafts` du cycle 2 référençait
 * l'épisode du cycle 1. Le cycle que cette PR permet d'ouvrir était un cycle
 * dont aucune mesure n'aurait jamais pu être confirmée.
 *
 * UNE ANCRE NE PREND PAS LE PRÉFIXE : son nom EST celui de son cycle, et
 * `T1` ne collisionne pas avec `T0`. Un jalon de mesure, lui, prend le nom de
 * l'ancre de son cycle. Sans aucune ancre confirmée, la forme historique est
 * conservée : il n'y a alors aucun cycle dont se distinguer.
 *
 * AFFIRMATION PÉRIMÉE, CORRIGÉE : ce commentaire disait `assessment_episodes`
 * VIDE en production (constat par conteneur du 2026-08-26). Elle ne l'est plus
 * — 4 lignes au 2026-09-06. Le renommage décrit ici reste sans effet sur
 * l'existant, mais on ne peut plus s'appuyer sur la vacuité de la table :
 * toute écriture y rencontre désormais des lignes réelles (`D-129`).
 */
function identifiantEpisode(
  idPatient: string,
  milestone: JalonMomentum,
  ancreCycle: AncreCycleCourant | null,
): string {
  if (estAncreDeCycle(milestone) || !ancreCycle || !estAncreDeCycle(ancreCycle.ancre)) {
    return `runtime-episode-${idPatient}-${milestone}`;
  }
  return `runtime-episode-${idPatient}-${ancreCycle.ancre}-${milestone}`;
}

/**
 * La date depuis laquelle la fenêtre de l'épisode se compte.
 *
 * TROIS CAS, ET LE TROISIÈME EST NÉ AVEC `D-113`.
 *
 * 1. Jalon de MESURE : l'ancre du cycle courant, fournie par l'appelant.
 * 2. `T0` — la toute première ancre : la PREMIÈRE réponse du dossier. C'est le
 *    repli historique, inchangé ; sans aucune réponse, la date de création du
 *    dossier stabilise l'enveloppe vide, sans devenir une mesure.
 *    L'ANCRE N'A PAS BOUGÉ AVEC [[D-156]], et il faut le lire ainsi : c'est la
 *    borne HAUTE de son INCLUSION qui tombe (`estAncreInitiale` ci-dessous), pas
 *    sa date de référence. `targetAt` reste ce que `D-052` §3 et `D-150` §4 ont
 *    signé — la carte du Fil date le même instant que l'épisode qu'elle appelle.
 * 3. `T1`, `T2`, … — une ancre qui ROUVRE un suivi : la réponse la plus
 *    RÉCENTE. Reprendre la première réponse du dossier, comme au cas 2, aurait
 *    centré la fenêtre du nouveau cycle sur un état vieux de plusieurs mois :
 *    aucune des mesures qui motivent la reprise n'y serait entrée, et l'épisode
 *    d'ouverture aurait été confirmé vide.
 *
 * AUCUNE HORLOGE ICI, ET CE N'EST PAS UN DÉTAIL : `targetAt` entre dans
 * `proposalHash`, que le POST recalcule pour le comparer à celui du GET. Une
 * date « maintenant » rendrait tout épisode d'ouverture périmé à la seconde,
 * avec un 409 impossible à résorber.
 */
function dateDeReference(
  inputs: RuntimeInputs,
  milestone: JalonMomentum,
  ancreCycle: AncreCycleCourant | null,
): string {
  const repliDossier = inputs.patient.createdAt.toISOString();
  if (!estAncreDeCycle(milestone)) {
    return ancreCycle?.confirmedAt ?? inputs.responses[0]?.observedAt ?? repliDossier;
  }
  if ((indexDeCycle(milestone) ?? 0) === 0) {
    return inputs.responses[0]?.observedAt ?? repliDossier;
  }
  return inputs.responses.at(-1)?.observedAt ?? repliDossier;
}

export function proposeRuntimeEpisode(
  inputs: RuntimeInputs,
  milestone: JalonMomentum,
  /**
   * Ancre du cycle courant : `confirmedAt` de l'ancre confirmée du cycle en
   * cours — LA MÊME ancre que la trajectoire (LOT-08, A8-1) et que
   * `resoudreJalonDu`. Sans elle, la fenêtre d'un J21 se calculait depuis la
   * première réponse du dossier : dès que la confirmation de l'ancre suivait
   * cette réponse de plus de 16 jours, le jalon proposé à l'écran et l'épisode
   * construit ici étaient DISJOINTS (revue LOT-07, B2). L'appelant la fournit
   * pour tout jalon de MESURE quand un cycle est ouvert ; `null` = repli.
   *
   * Elle porte aussi le NOM de l'ancre, qui entre dans l'identifiant de
   * l'épisode : sans lui, deux cycles se partagent une clé primaire
   * (`identifiantEpisode`).
   */
  ancreCycle: AncreCycleCourant | null = null,
): RuntimeEpisodeProposal {
  const targetAt = new Date(
    new Date(dateDeReference(inputs, milestone, ancreCycle)).getTime()
    + joursDepuisAncre(milestone) * JOUR_MS,
  ).toISOString();
  const proposal = proposeAssessmentEpisode({
    assessmentEpisodeId: identifiantEpisode(inputs.patient.idPatient, milestone, ancreCycle),
    patientId: inputs.patient.idPatient,
    milestone,
    targetAt,
    responses: inputs.responses,
    inclusion: estAncreInitiale(milestone) ? 'etat_entree' : 'fenetre',
  });
  const proposalHash = canonicalSha256({
    patientId: inputs.patient.idPatient,
    milestone,
    targetAt,
    responses: inputs.responses,
    patientContext: inputs.patientContext,
    inWindowResponseIds: proposal.inWindowResponseIds,
    outOfWindowResponseIds: proposal.outOfWindowResponseIds,
  });
  return { proposal, proposalHash };
}
