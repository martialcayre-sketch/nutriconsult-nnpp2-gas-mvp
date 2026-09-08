import { describe, expect, it } from 'vitest';
import { confirmAssessmentEpisode, proposeAssessmentEpisode } from './assessmentEpisode';
import type { QuestionnaireResponseInput } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const target = new Date('2026-01-22T00:00:00.000Z');

function response(responseId: string, offsetDays: number): QuestionnaireResponseInput {
  return {
    responseId,
    questionnaireId: 'Q_SOM_06',
    observedAt: new Date(target.getTime() + offsetDays * DAY_MS).toISOString(),
    scoresJson: { rawAnswers: { P1: '1' } },
    scoreVersion: null,
  };
}

describe('AssessmentEpisode', () => {
  it.each(['T0', 'J21', 'J42', 'J90'] as const)('propose un épisode %s avec les bornes ±8 jours incluses', milestone => {
    const episode = proposeAssessmentEpisode({
      assessmentEpisodeId: `episode-${milestone}`,
      patientId: 'patient-test',
      milestone,
      targetAt: target.toISOString(),
      responses: [response('borne-moins', -8), response('borne-plus', 8), response('hors', 9)],
    });

    expect(episode.status).toBe('proposed');
    expect(episode.window.toleranceDays).toBe(8);
    expect(episode.inWindowResponseIds).toEqual(['borne-moins', 'borne-plus']);
    expect(episode.outOfWindowResponseIds).toEqual(['hors']);
  });

  // [[D-156]] — l'ancre initiale constate un ÉTAT DE DÉPART, qui se constitue
  // en plusieurs temps (premier rideau, puis second rideau assigné après la
  // synthèse). La borne HAUTE tombe ; la borne basse reste.
  it('mode `etat_entree` : la borne haute tombe, la borne basse tient', () => {
    const episode = proposeAssessmentEpisode({
      assessmentEpisodeId: 'episode-T0',
      patientId: 'patient-test',
      milestone: 'T0',
      targetAt: target.toISOString(),
      responses: [response('avant', -9), response('borne-moins', -8), response('tard', 40)],
      inclusion: 'etat_entree',
    });

    expect(episode.inWindowResponseIds).toEqual(['borne-moins', 'tard']);
    expect(episode.outOfWindowResponseIds).toEqual(['avant']);
    // La borne haute est la DERNIÈRE RÉPONSE INCLUSE, jamais une horloge : deux
    // appels sur les mêmes entrées doivent rendre la même empreinte.
    expect(episode.window.end).toBe(response('tard', 40).observedAt);
    expect(episode.window.start).toBe(new Date(target.getTime() - 8 * DAY_MS).toISOString());
  });

  it('mode `etat_entree` sans aucune réponse : la fenêtre nominale stabilise l’enveloppe vide', () => {
    const episode = proposeAssessmentEpisode({
      assessmentEpisodeId: 'episode-T0',
      patientId: 'patient-test',
      milestone: 'T0',
      targetAt: target.toISOString(),
      responses: [],
      inclusion: 'etat_entree',
    });

    expect(episode.window.end).toBe(new Date(target.getTime() + 8 * DAY_MS).toISOString());
    expect(episode.includedResponseIds).toEqual([]);
  });

  it('permet au praticien de corriger la composition avec une réponse hors fenêtre', () => {
    const proposal = proposeAssessmentEpisode({
      assessmentEpisodeId: 'episode-j21',
      patientId: 'patient-test',
      milestone: 'J21',
      targetAt: target.toISOString(),
      responses: [response('dans', 0), response('hors', 9)],
    });
    const confirmed = confirmAssessmentEpisode(proposal, ['hors'], '2026-01-23T00:00:00.000Z');

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.includedResponseIds).toEqual(['hors']);
    expect(confirmed.sourceDateRange?.min).toBe(response('hors', 9).observedAt);
  });

  it('rejette une réponse inconnue lors de la confirmation', () => {
    const proposal = proposeAssessmentEpisode({
      assessmentEpisodeId: 'episode-j21',
      patientId: 'patient-test',
      milestone: 'J21',
      targetAt: target.toISOString(),
      responses: [response('connue', 0)],
    });

    expect(() => confirmAssessmentEpisode(proposal, ['inconnue'], target.toISOString())).toThrow('Réponse inconnue');
  });

  it('rejette une date parseable mais non ISO canonique', () => {
    expect(() => proposeAssessmentEpisode({
      assessmentEpisodeId: 'episode-t0', patientId: 'patient-test', milestone: 'T0',
      targetAt: '2026-01-22', responses: [],
    })).toThrow('ISO canonique');
  });
});
