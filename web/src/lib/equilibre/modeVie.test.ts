import { describe, expect, it } from 'vitest';
import { Q_MOD_01 } from '@/lib/questionnaires/mode-de-vie';
import type { ReponseBrute } from './depuisPrisma';
import { construireModeVieDate } from './modeVie';

// Fixtures synthétiques (patients fictifs seulement) : les réponses brutes
// sont dérivées du catalogue lui-même — si la grille Q_MOD_01 évolue, le test
// suit, il ne fige aucun référentiel recopié.

type SousScoreCatalogue = { id: string; label: string; items: string[]; max: number };

const SOUS_SCORES = (Q_MOD_01 as { scoring: { subScores: SousScoreCatalogue[] } }).scoring.subScores;

function reponsesToutesA(valeur: number): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const sous of SOUS_SCORES) for (const item of sous.items) answers[item] = valeur;
  return answers;
}

function ligne(dateIso: string, rawAnswers: Record<string, number> | null): ReponseBrute {
  return {
    statutValidite: null,
    idQuestionnaire: 'Q_MOD_01',
    dateReponse: new Date(dateIso),
    scoresJson: rawAnswers ? { rawAnswers } : { total: 12 },
  };
}

describe('construireModeVieDate (SP-TRAJ LOT-02)', () => {
  it('sans réponse exploitable : null — jamais un 0 (A8-2)', () => {
    expect(construireModeVieDate([])).toBeNull();
    // Une ligne sans rawAnswers (seed historique) est ignorée, pas recalculée.
    expect(construireModeVieDate([ligne('2026-06-01T00:00:00.000Z', null)])).toBeNull();
  });

  it('rejoue le moteur : 7 domaines, max du catalogue, zones du référentiel', () => {
    const etat = construireModeVieDate([ligne('2026-06-01T00:00:00.000Z', reponsesToutesA(0))]);
    expect(etat).not.toBeNull();
    expect(etat!.domaines.map((d) => d.id)).toEqual(SOUS_SCORES.map((s) => s.id));
    expect(etat!.domaines.map((d) => d.max)).toEqual(SOUS_SCORES.map((s) => s.max));
    for (const domaine of etat!.domaines) {
      // Tout à zéro → zone basse du référentiel, en toutes lettres.
      expect(domaine.total).toBe(0);
      expect(domaine.interpretation?.color).toBe('danger');
      // Les zones affichées sont celles du catalogue, jamais recopiées.
      expect(domaine.zones.length).toBeGreaterThanOrEqual(3);
      expect(domaine.zones[0].min).toBe(0);
    }
  });

  it('dateLimite : l’état daté ignore les réponses postérieures', () => {
    const reponses = [
      ligne('2026-06-01T00:00:00.000Z', reponsesToutesA(0)),
      // Réévaluation ultérieure : sommeil remonté à 12 (zone « insuffisant »).
      ligne('2026-07-01T00:00:00.000Z', { ...reponsesToutesA(0), SOMMEIL_Q005: 12 }),
    ];

    const avant = construireModeVieDate(reponses, new Date('2026-06-15T00:00:00.000Z'));
    const apres = construireModeVieDate(reponses);
    const sommeilAvant = avant!.domaines.find((d) => d.id === 'SOMMEIL')!;
    const sommeilApres = apres!.domaines.find((d) => d.id === 'SOMMEIL')!;

    expect(sommeilAvant.total).toBe(0);
    expect(sommeilApres.total).toBe(12);
    expect(sommeilApres.interpretation?.color).toBe('warning');
  });

  it('l’interprétation est celle du moteur, passée telle quelle — y compris son absence sur un trou de grille', () => {
    // SOMMEIL à 9 : entre la zone 0-8 et la zone 10-14 de la grille SIIN.
    //
    // Cette assertion disait `{ label: 'Sommeil satisfaisant', color: 'success' }`
    // jusqu'au 2026-07-29 : le moteur retombait sur la DERNIÈRE zone écrite, la
    // rassurante, pour un score qui se situe entre « non réparateur » et
    // « insuffisant ». Elle documentait donc un défaut du moteur, corrigé depuis —
    // un score sans zone rend maintenant `null`.
    //
    // Ce que le test vérifie n'a pas changé : cette lib passe l'interprétation du
    // moteur telle quelle et n'en juge jamais. Elle passe aussi son absence.
    const etat = construireModeVieDate([
      ligne('2026-06-01T00:00:00.000Z', { ...reponsesToutesA(0), SOMMEIL_Q005: 9 }),
    ]);
    const sommeil = etat!.domaines.find((d) => d.id === 'SOMMEIL')!;
    expect(sommeil.total).toBe(9);
    expect(sommeil.interpretation).toBeNull();
  });
});
