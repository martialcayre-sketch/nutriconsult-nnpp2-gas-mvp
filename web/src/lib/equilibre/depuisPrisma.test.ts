import { describe, it, expect } from 'vitest';
import {
  construireHistoriqueEquilibre,
  construireReponsesParQuestionnaire,
  resoudreDateT0,
} from './depuisPrisma';
import type { ReponseBrute } from './depuisPrisma';

describe('depuisPrisma — adaptateur Prisma → moteur équilibre', () => {
  const dateAncienne = new Date('2026-01-01T00:00:00.000Z');
  const dateRecente = new Date('2026-01-15T00:00:00.000Z');
  // PSS-10 complet (items 1-5, total 26/50) : source vivante du besoin 9, donc
  // produit un scoreGlobal non-null. Le Pichot servait ici avant v4 ; il n'est
  // plus source de Mon équilibre et ne produirait plus aucune couverture.
  const RAW_ANSWERS_Q_STR_02 = {
    P1: '2', P2: '2', P3: '3', P4: '3', P5: '3',
    P6: '2', P7: '3', P8: '3', P9: '2', P10: '3',
  };

  it('deux réponses au même questionnaire → seule la plus récente est retenue', () => {
    const dedoublonnees = construireReponsesParQuestionnaire([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateAncienne, scoresJson: { rawAnswers: { P1: '4' } } },
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateRecente, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 } },
    ]);
    expect(dedoublonnees.Q_STR_02?.P1).toBe('2');
  });

  // GARDE LONGITUDINALE (LOT-00) — une re-mesure ne périme pas la mesure de
  // départ. Ce banc échouerait si un futur lot posait SUPERSEDED automatiquement
  // sur la passation précédente à chaque re-passation : l'ancre T0 sauterait à
  // la date de la re-mesure, et le momentum n'aurait plus de point de départ.
  // SUPERSEDED reste un geste praticien de REMPLACEMENT d'une passation fautive.
  it('une re-passation ne périme pas la précédente : T0 reste ancré à la première', () => {
    process.env.WN_ENABLE_VALIDITE_PASSATIONS = '1';
    try {
      const reponses: ReponseBrute[] = [
        { idQuestionnaire: 'Q_STR_02', dateReponse: dateAncienne, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 }, statutValidite: 'VALID' },
        { idQuestionnaire: 'Q_STR_02', dateReponse: dateRecente, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 }, statutValidite: 'VALID' },
      ];
      expect(resoudreDateT0(reponses)?.getTime()).toBe(dateAncienne.getTime());
    } finally {
      delete process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    }
  });

  it('une passation remplacée (SUPERSEDED) sort de l’ancre T0, drapeau allumé', () => {
    process.env.WN_ENABLE_VALIDITE_PASSATIONS = '1';
    try {
      const reponses: ReponseBrute[] = [
        { idQuestionnaire: 'Q_STR_02', dateReponse: dateAncienne, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 }, statutValidite: 'SUPERSEDED' },
        { idQuestionnaire: 'Q_STR_02', dateReponse: dateRecente, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 }, statutValidite: 'VALID' },
      ];
      expect(resoudreDateT0(reponses)?.getTime()).toBe(dateRecente.getTime());
    } finally {
      delete process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    }
  });

  it('réponse sans rawAnswers exploitable doit être ignorée', () => {
    const sansRawAnswers = construireReponsesParQuestionnaire([
      { statutValidite: null, idQuestionnaire: 'Q_STR_01', dateReponse: dateRecente, scoresJson: { A: { total: 16 }, global: 32 } },
    ]);
    expect(sansRawAnswers.Q_STR_01).toBeUndefined();
  });

  it('une réponse postérieure à dateLimite ne doit pas être incluse', () => {
    const avecDateLimite = construireReponsesParQuestionnaire(
      [{ statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateRecente, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 } }],
      dateAncienne
    );
    expect(avecDateLimite.Q_STR_02).toBeUndefined();
  });

  it('resoudreDateT0 doit être la plus ancienne réponse, pas la plus récente', () => {
    const result = resoudreDateT0([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateRecente, scoresJson: {} },
      { statutValidite: null, idQuestionnaire: 'Q_STR_01', dateReponse: dateAncienne, scoresJson: {} },
    ]);
    expect(result?.getTime()).toBe(dateAncienne.getTime());
  });

  it('resoudreDateT0 doit être null sans aucune réponse', () => {
    expect(resoudreDateT0([])).toBeNull();
  });

  it('construireHistoriqueEquilibre doit ommettre les jalons futurs', () => {
    const dateT0Future = new Date();
    const historiqueFutur = construireHistoriqueEquilibre([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateT0Future, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 } },
    ]);
    expect(historiqueFutur.length).toBeLessThanOrEqual(1);
  });

  it('ancreT0 explicite (LOT-08) ancre les jalons sur cette date, pas sur la 1re réponse', () => {
    const premiereReponse = new Date('2026-01-10T00:00:00.000Z');
    const reponses = [
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: premiereReponse, scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02 } },
    ];

    // T0 global = 2026-01-10 → une lecture T0 datée du 2026-01-10 existe.
    const global = construireHistoriqueEquilibre(reponses);
    expect(global.some((l) => l.date.getTime() === premiereReponse.getTime())).toBe(true);

    // Ancre T0 antérieure = 2026-01-01 → aucune réponse ≤ T0 ni ≤ J21(2026-01-22)?
    // La réponse du 2026-01-10 est connue dès J21 (2026-01-22) → 1re lecture = J21,
    // jamais une lecture au 2026-01-01 (jalon T0 sans couverture, omis).
    const ancre = new Date('2026-01-01T00:00:00.000Z');
    const ancree = construireHistoriqueEquilibre(reponses, ancre);
    expect(ancree.some((l) => l.date.getTime() === ancre.getTime())).toBe(false);
    expect(ancree.length).toBeGreaterThan(0);
    expect(ancree[0].date.getTime()).toBe(new Date('2026-01-22T00:00:00.000Z').getTime());
  });
});

// Constat F1 de l'audit de la chaîne trajectoire (2026-07-27) : sans règle de
// nouveauté, un patient ayant répondu une seule fois obtenait quatre lectures
// identiques datées T0/J21/J42/J90, un delta de 0 et une tendance « stable ».
// Les frontières A6-R2 et A8-2 l'interdisent : un jalon sans mesure est « non
// mesuré », jamais un 0. Ces cas reprennent les sondes de l'audit.
describe('construireHistoriqueEquilibre — règle de nouveauté (lot 1, F1)', () => {
  const JOUR_MS = 24 * 60 * 60 * 1000;
  const RAW_T0 = {
    P1: '2', P2: '2', P3: '3', P4: '3', P5: '3',
    P6: '2', P7: '3', P8: '3', P9: '2', P10: '3',
  };
  const RAW_J21 = {
    P1: '1', P2: '1', P3: '2', P4: '2', P5: '2',
    P6: '1', P7: '2', P8: '2', P9: '1', P10: '2',
  };

  // T0 assez ancien pour que les quatre jalons soient atteints.
  const dateT0 = new Date(Date.now() - 120 * JOUR_MS);

  it('une seule réponse puis silence : une seule lecture, pas quatre', () => {
    const historique = construireHistoriqueEquilibre([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateT0, scoresJson: { rawAnswers: RAW_T0 } },
    ]);

    expect(historique).toHaveLength(1);
    expect(historique[0].date.getTime()).toBe(dateT0.getTime());
  });

  it('une réponse nouvelle à J21 : deux lectures, et la seconde est datée J21', () => {
    const dateJ21 = new Date(dateT0.getTime() + 21 * JOUR_MS);
    const historique = construireHistoriqueEquilibre([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateT0, scoresJson: { rawAnswers: RAW_T0 } },
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateJ21, scoresJson: { rawAnswers: RAW_J21 } },
    ]);

    expect(historique).toHaveLength(2);
    expect(historique[1].date.getTime()).toBe(dateJ21.getTime());
    // J42 et J90 sont passés mais rien de nouveau n'est arrivé : aucune lecture.
    expect(historique.some((l) => l.date.getTime() > dateJ21.getTime())).toBe(false);
  });

  // Défaut trouvé par la revue adversariale du 2026-07-28 : filtrer sur la
  // seule présence de `rawAnswers` laissait 53 questionnaires du catalogue
  // rouvrir un jalon sans rien changer à l'indice — « stable, écart 0 » revenait
  // par la porte de service. Le prédicat porte donc sur les sources réellement
  // agrégées par le moteur.
  it('une passation hors mapping des besoins ne rouvre pas de jalon', () => {
    // Q_SOM_06 (fatigue de Pichot) : exploitable, mais retiré des sources en v4.
    const historique = construireHistoriqueEquilibre([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateT0, scoresJson: { rawAnswers: RAW_T0 } },
      {
        statutValidite: null,
        idQuestionnaire: 'Q_SOM_06',
        dateReponse: new Date(dateT0.getTime() + 21 * JOUR_MS),
        scoresJson: { rawAnswers: { F1: '3', F2: '3', F3: '2', F4: '2', F5: '3', F6: '2', F7: '3', F8: '2' } },
      },
    ]);

    expect(historique).toHaveLength(1);
  });

  it('une réponse nouvelle mais inexploitable ne rouvre pas de jalon', () => {
    // Sans `rawAnswers`, la ligne est ignorée par le moteur : la compter comme
    // nouveauté ré-émettrait la lecture précédente à l'identique.
    const historique = construireHistoriqueEquilibre([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateT0, scoresJson: { rawAnswers: RAW_T0 } },
      {
        statutValidite: null,
        idQuestionnaire: 'Q_SOM_01',
        dateReponse: new Date(dateT0.getTime() + 21 * JOUR_MS),
        scoresJson: { global: 12 },
      },
    ]);

    expect(historique).toHaveLength(1);
  });

  it('une valeur inchangée reste une mesure : la règle porte sur la réponse, pas sur le score', () => {
    // Même questionnaire, mêmes réponses, mais une passation réellement refaite
    // à J21 — c'est une mesure stable, pas un silence. Elle doit être servie.
    const dateJ21 = new Date(dateT0.getTime() + 21 * JOUR_MS);
    const historique = construireHistoriqueEquilibre([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateT0, scoresJson: { rawAnswers: RAW_T0 } },
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: dateJ21, scoresJson: { rawAnswers: RAW_T0 } },
    ]);

    expect(historique).toHaveLength(2);
    expect(historique[0].valeur).toBe(historique[1].valeur);
  });
});
