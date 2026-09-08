import { describe, expect, it } from 'vitest';
import { adaptRuntimeInputs, proposeRuntimeEpisode } from './runtimeFromPrisma';

const patient = { idPatient: 'PAT_TEST', createdAt: new Date('2026-01-01T00:00:00.000Z') };

describe('runtime clinique depuis Prisma', () => {
  it('adapte les réponses et le contexte sans inventer de version ni contrainte', () => {
    const scoresJson = { total: 3 };
    const result = adaptRuntimeInputs(patient, [
      { idReponse: 'REP_2', idQuestionnaire: 'Q_2', dateReponse: new Date('2026-01-02T00:00:00.000Z'), scoresJson },
      { idReponse: 'REP_1', idQuestionnaire: 'Q_1', dateReponse: new Date('2026-01-01T00:00:00.000Z'), scoresJson: {} },
    ], {
      anamnese: {
        motif_principal: ' Fatigue ',
        objectif_prioritaire: ' Énergie ',
        attentes: ['Sommeil', 'Énergie', 'Sommeil'],
        contraintes: ['champ non canonique'],
      },
    });

    expect(result.responses.map(response => response.responseId)).toEqual(['REP_1', 'REP_2']);
    expect(result.responses[1]).toMatchObject({ scoresJson, scoreVersion: null });
    expect(result.patientContext).toEqual({
      mainReason: 'Fatigue', priorityGoal: 'Énergie', expectations: ['Sommeil', 'Énergie'], constraints: [],
    });
    expect(JSON.stringify(result.responses)).not.toContain('rawAnswers');
  });

  it('propose chaque jalon depuis le premier T0 et produit un hash stable', () => {
    const inputs = adaptRuntimeInputs(patient, [
      { idReponse: 'REP_T0', idQuestionnaire: 'Q_1', dateReponse: new Date('2026-01-01T00:00:00.000Z'), scoresJson: {} },
      { idReponse: 'REP_J21', idQuestionnaire: 'Q_2', dateReponse: new Date('2026-01-22T00:00:00.000Z'), scoresJson: {} },
    ], null);

    const first = proposeRuntimeEpisode(inputs, 'J21');
    const second = proposeRuntimeEpisode(inputs, 'J21');
    expect(first).toEqual(second);
    expect(first.proposal.targetAt).toBe('2026-01-22T00:00:00.000Z');
    expect(first.proposal.inWindowResponseIds).toEqual(['REP_J21']);
  });

  // [[D-156]] — LA MESURE QUI A MOTIVÉ CE LOT : les QUATRE T0 confirmés en
  // production embarquaient CHACUN la totalité des réponses du dossier, alors
  // que 5 à 17 d'entre elles étaient hors de la fenêtre ±8 j. Le praticien les
  // rouvrait donc une à une, à chaque fois, sans exception. La fenêtre haute ne
  // protégeait rien : elle faisait un travail manuel obligatoire.
  describe('ancre initiale : la fenêtre couvre tout l’état d’entrée', () => {
    const inputs = adaptRuntimeInputs(patient, [
      { idReponse: 'REP_RIDEAU_1', idQuestionnaire: 'Q_1', dateReponse: new Date('2026-01-01T00:00:00.000Z'), scoresJson: {} },
      // Second rideau, assigné après la synthèse : 40 jours plus tard, très
      // au-delà des ±8 j.
      { idReponse: 'REP_RIDEAU_2', idQuestionnaire: 'Q_2', dateReponse: new Date('2026-02-10T00:00:00.000Z'), scoresJson: {} },
    ], null);

    it('`T0` embarque le second rideau sans réinclusion manuelle', () => {
      const { proposal } = proposeRuntimeEpisode(inputs, 'T0');
      expect(proposal.inWindowResponseIds).toEqual(['REP_RIDEAU_1', 'REP_RIDEAU_2']);
      expect(proposal.outOfWindowResponseIds).toEqual([]);
      // L'ancre ne bouge pas : `targetAt` reste la première réponse du dossier
      // (`D-052` §3, `D-150` §4) — c'est la borne HAUTE qui tombe, pas l'ancre.
      expect(proposal.targetAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('`T1` ne l’embarque pas : rouvrir un suivi n’est pas constater une entrée', () => {
      const { proposal } = proposeRuntimeEpisode(inputs, 'T1');
      // Ancre de réouverture : fenêtrée sur la réponse la plus RÉCENTE, ±8 j.
      expect(proposal.targetAt).toBe('2026-02-10T00:00:00.000Z');
      expect(proposal.outOfWindowResponseIds).toEqual(['REP_RIDEAU_1']);
    });

    it('`J21` ne l’embarque pas non plus : un jalon de mesure mesure un instant', () => {
      const { proposal } = proposeRuntimeEpisode(inputs, 'J21', { ancre: 'T0', confirmedAt: '2026-01-01T00:00:00.000Z' });
      // Fenêtré au 22 janvier ±8 j : les DEUX réponses en sortent, celle du
      // second rideau comprise. La borne haute ouverte ne fuit pas hors de
      // l'ancre initiale — c'est tout l'objet de `estAncreInitiale`.
      expect(proposal.inWindowResponseIds).toEqual([]);
      expect(proposal.outOfWindowResponseIds).toContain('REP_RIDEAU_2');
    });

    it('deux appels rendent la même proposition — aucune horloge dans la borne haute', () => {
      expect(proposeRuntimeEpisode(inputs, 'T0')).toEqual(proposeRuntimeEpisode(inputs, 'T0'));
    });
  });

  // CE BANC DÉFEND UNE CLÉ PRIMAIRE (`D-113`, revue P0-1). L'identifiant valait
  // `runtime-episode-<patient>-<jalon>` : le `J21` du deuxième cycle y prenait
  // le MÊME identifiant que celui du premier. Les deux points de persistance
  // écrivent par `upsert(..., update: {})` — la confirmation du second
  // n'écrivait RIEN, sous une réponse `ok: true`, et le protocole du cycle 2
  // référençait l'épisode du cycle 1.
  describe('identifiant d’épisode', () => {
    const inputs = adaptRuntimeInputs(patient, [
      { idReponse: 'REP_1', idQuestionnaire: 'Q_1', dateReponse: new Date('2026-01-01T00:00:00.000Z'), scoresJson: {} },
    ], null);

    it('distingue deux cycles sur un même jalon de mesure', () => {
      const cycle0 = proposeRuntimeEpisode(inputs, 'J21', { ancre: 'T0', confirmedAt: '2026-01-01T00:00:00.000Z' });
      const cycle1 = proposeRuntimeEpisode(inputs, 'J21', { ancre: 'T1', confirmedAt: '2026-06-01T00:00:00.000Z' });
      expect(cycle0.proposal.assessmentEpisodeId).toBe('runtime-episode-PAT_TEST-T0-J21');
      expect(cycle1.proposal.assessmentEpisodeId).toBe('runtime-episode-PAT_TEST-T1-J21');
      expect(cycle0.proposal.assessmentEpisodeId).not.toBe(cycle1.proposal.assessmentEpisodeId);
    });

    it('laisse une ancre sans préfixe : son nom EST son cycle', () => {
      expect(proposeRuntimeEpisode(inputs, 'T0').proposal.assessmentEpisodeId)
        .toBe('runtime-episode-PAT_TEST-T0');
      expect(proposeRuntimeEpisode(inputs, 'T1').proposal.assessmentEpisodeId)
        .toBe('runtime-episode-PAT_TEST-T1');
    });

    it('garde la forme historique quand aucun cycle n’est ouvert', () => {
      expect(proposeRuntimeEpisode(inputs, 'J21').proposal.assessmentEpisodeId)
        .toBe('runtime-episode-PAT_TEST-J21');
    });

    it('ne change pas le hash de proposition : l’identifiant n’y entre pas', () => {
      const sans = proposeRuntimeEpisode(inputs, 'J21', { ancre: 'T0', confirmedAt: '2026-01-01T00:00:00.000Z' });
      const avec = proposeRuntimeEpisode(inputs, 'J21', { ancre: 'T9', confirmedAt: '2026-01-01T00:00:00.000Z' });
      expect(avec.proposalHash).toBe(sans.proposalHash);
    });
  });

  it('autorise une proposition vide stable sans transformer la date dossier en mesure', () => {
    const inputs = adaptRuntimeInputs(patient, [], null);
    const result = proposeRuntimeEpisode(inputs, 'T0');
    expect(result.proposal.candidateResponses).toEqual([]);
    expect(result.proposal.sourceDateRange).toBeNull();
    expect(result.proposalHash).toHaveLength(64);
  });
});
