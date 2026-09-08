import { TOLERANCE_JOURS_JALON } from '../equilibre/constants';
import type {
  AssessmentResponseRef,
  ConfirmedAssessmentEpisode,
  PreconditionOverride,
  ProposedAssessmentEpisode,
  QuestionnaireResponseInput,
  SourceDateRange,
} from './types';
import type { JalonMomentum } from '../equilibre/types';

const JOUR_MS = 24 * 60 * 60 * 1000;

function isoDate(value: string, field: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError(`${field} doit être une date ISO canonique valide.`);
  }
  return date.toISOString();
}

function toRef(response: QuestionnaireResponseInput): AssessmentResponseRef {
  if (!response.responseId.trim() || !response.questionnaireId.trim()) {
    throw new TypeError('Chaque réponse doit avoir un identifiant et un questionnaire.');
  }
  return {
    responseId: response.responseId,
    questionnaireId: response.questionnaireId,
    observedAt: isoDate(response.observedAt, 'observedAt'),
    scoreVersion: response.scoreVersion,
  };
}

function dateRange(refs: AssessmentResponseRef[]): SourceDateRange | null {
  if (refs.length === 0) return null;
  const dates = refs.map(ref => ref.observedAt).sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}

/**
 * Comment l'épisode choisit les réponses qu'il embarque.
 *
 * `fenetre` — la règle historique, et celle de TOUT jalon de mesure : `targetAt`
 * ± `TOLERANCE_JOURS_JALON`. Un J21 mesure un instant, et ce qui est arrivé
 * trois semaines plus tard n'en fait pas partie.
 *
 * `etat_entree` — la borne haute tombe : tout ce qui est arrivé DEPUIS l'entrée
 * du dossier entre. Réservé à l'ancre initiale, dont l'objet n'est pas de
 * mesurer un instant mais de constater un ÉTAT DE DÉPART, lequel se constitue
 * en plusieurs temps ([[D-156]]).
 *
 * La borne basse reste `targetAt - tolérance` dans les deux modes : elle ne
 * refuse rien sur une ancre initiale (`targetAt` EST la première réponse), et
 * elle garde son sens le jour où un appelant l'emploierait autrement.
 */
export type ModeInclusionEpisode = 'fenetre' | 'etat_entree';

export function proposeAssessmentEpisode(input: {
  assessmentEpisodeId: string;
  patientId: string;
  milestone: JalonMomentum;
  targetAt: string;
  responses: QuestionnaireResponseInput[];
  /** Défaut `fenetre` : le mode élargi se DEMANDE, il ne se déduit pas d'ici. */
  inclusion?: ModeInclusionEpisode;
}): ProposedAssessmentEpisode {
  if (!input.assessmentEpisodeId.trim() || !input.patientId.trim()) {
    throw new TypeError('assessmentEpisodeId et patientId sont requis.');
  }
  const targetAt = isoDate(input.targetAt, 'targetAt');
  const targetMs = new Date(targetAt).getTime();
  const toleranceMs = TOLERANCE_JOURS_JALON * JOUR_MS;
  const candidateResponses = input.responses.map(toRef).sort((a, b) => a.responseId.localeCompare(b.responseId));
  if (new Set(candidateResponses.map(ref => ref.responseId)).size !== candidateResponses.length) {
    throw new TypeError('Les identifiants de réponse doivent être uniques.');
  }

  const etatEntree = input.inclusion === 'etat_entree';
  const debutMs = targetMs - toleranceMs;
  const finMs = targetMs + toleranceMs;
  const inWindowResponseIds = candidateResponses
    .filter(ref => {
      const observeMs = new Date(ref.observedAt).getTime();
      if (observeMs < debutMs) return false;
      return etatEntree || observeMs <= finMs;
    })
    .map(ref => ref.responseId);
  const inWindow = new Set(inWindowResponseIds);
  const outOfWindowResponseIds = candidateResponses.filter(ref => !inWindow.has(ref.responseId)).map(ref => ref.responseId);
  const includedRefs = candidateResponses.filter(ref => inWindow.has(ref.responseId));
  const plageIncluse = dateRange(includedRefs);

  return {
    assessmentEpisodeId: input.assessmentEpisodeId,
    patientId: input.patientId,
    milestone: input.milestone,
    targetAt,
    window: {
      start: new Date(debutMs).toISOString(),
      // EN MODE `etat_entree`, LA BORNE HAUTE EST LA DERNIÈRE RÉPONSE INCLUSE,
      // JAMAIS UNE HORLOGE. `targetAt` et les identifiants inclus entrent dans
      // `proposalHash`, que le POST recompare à celui du GET : une borne
      // « maintenant » périmerait la proposition à la seconde, avec un 409
      // impossible à résorber (même raison qu'en tête de `dateDeReference`).
      // Sans aucune réponse, la fenêtre nominale stabilise l'enveloppe vide.
      end: etatEntree
        ? (plageIncluse?.max ?? new Date(finMs).toISOString())
        : new Date(finMs).toISOString(),
      toleranceDays: TOLERANCE_JOURS_JALON,
    },
    candidateResponses,
    inWindowResponseIds,
    outOfWindowResponseIds,
    includedResponseIds: inWindowResponseIds,
    sourceDateRange: plageIncluse,
    status: 'proposed',
  };
}

/**
 * `preconditionOverrides` est OPTIONNEL et n'est posé que s'il y a quelque
 * chose à tracer : un tableau vide serait un champ de plus dans le payload et
 * dans son empreinte, pour dire qu'il ne s'est rien passé ([[D-052]]).
 *
 * Cette fonction ne VÉRIFIE pas les préconditions — elle n'a ni dossier ni
 * session. Elle transporte la trace que l'appelant a constituée côté serveur.
 */
export function confirmAssessmentEpisode(
  proposal: ProposedAssessmentEpisode,
  includedResponseIds: string[],
  confirmedAt: string,
  preconditionOverrides?: PreconditionOverride[]
): ConfirmedAssessmentEpisode {
  const candidates = new Map(proposal.candidateResponses.map(ref => [ref.responseId, ref]));
  const uniqueIds = [...new Set(includedResponseIds)].sort();
  const unknown = uniqueIds.filter(id => !candidates.has(id));
  if (unknown.length > 0) throw new TypeError(`Réponse inconnue dans la confirmation : ${unknown.join(', ')}.`);
  const includedRefs = uniqueIds.map(id => candidates.get(id)!);

  for (const override of preconditionOverrides ?? []) {
    if (!override.conditionId.trim() || !override.motif.trim() || !override.decidePar.trim()) {
      throw new TypeError('Un contournement de précondition exige une condition, un motif et un auteur.');
    }
    isoDate(override.decideLe, 'decideLe');
  }

  return {
    ...proposal,
    status: 'confirmed',
    includedResponseIds: uniqueIds,
    sourceDateRange: dateRange(includedRefs),
    confirmedAt: isoDate(confirmedAt, 'confirmedAt'),
    ...(preconditionOverrides && preconditionOverrides.length > 0
      ? { preconditionOverrides }
      : {}),
  };
}
