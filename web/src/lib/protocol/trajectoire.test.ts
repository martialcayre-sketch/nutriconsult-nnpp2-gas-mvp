import { describe, expect, it } from 'vitest';
import {
  construireTrajectoire,
  rattacherReperesAuxCycles,
  resoudreComparaison,
  type TrajectoireCycle,
  type TrajectoireEpisode,
} from './trajectoire';
import type { AncreCycle } from './cycles';

// Même fixture rawAnswers que depuisPrisma.test.ts : PSS-10 complet, source
// vivante du besoin 9, donc scoreGlobal non-null (le Pichot ne l'est plus en v4).
const RAW = {
  P1: '2', P2: '2', P3: '3', P4: '3', P5: '3',
  P6: '2', P7: '3', P8: '3', P9: '2', P10: '3',
};
const reponse = (iso: string, statutValidite: string | null = null) => ({
  idQuestionnaire: 'Q_STR_02',
  dateReponse: new Date(iso),
  scoresJson: { rawAnswers: RAW },
  // Défaut `null` : la fixture ne porte aucun jugement de validité, ce qui est
  // le cas de la quasi-totalité des cas de ce banc. Le paramètre existe pour
  // que les cas qui VEULENT une passation retirée puissent le dire.
  statutValidite,
});
// `cycleId` / `versionScore` sont stockés depuis le gate G2 : par défaut la
// fixture représente une ligne écrite APRÈS le gate (cycle = son propre id,
// version figée). Les cas hérités passent explicitement null.
const t0 = (
  id: string,
  iso: string,
  overrides: Partial<Pick<TrajectoireEpisode, 'cycleId' | 'versionScore' | 'milestone'>> = {},
): TrajectoireEpisode => ({
  id,
  // `T0` par défaut ; les cas multi-cycles passent l'ancre de leur rang, une
  // ancre ne se déplaçant plus depuis `D-113`.
  milestone: overrides.milestone ?? 'T0',
  confirmedAt: new Date(iso),
  cycleId: overrides.cycleId === undefined ? id : overrides.cycleId,
  versionScore: overrides.versionScore === undefined ? 'v1' : overrides.versionScore,
});

describe('construireTrajectoire (C2B LOT-09)', () => {
  it('aucun épisode → aucun cycle, comparaison indisponible', () => {
    const tr = construireTrajectoire({ episodes: [], reponses: [] });
    expect(tr.cycles).toHaveLength(0);
    expect(tr.comparaison).toEqual({ disponible: false, raison: 'aucun_cycle' });
  });

  // Ce cas asseyait le constat F1 au lieu de le prévenir : une réponse unique à
  // T0 produisait J21/J42/J90 « mesurés » à la valeur de T0 et un momentum
  // « stable (écart 0) ». Depuis le lot 1, un jalon sans réponse nouvelle est
  // non mesuré (A8-2) et le momentum reste null faute de seconde lecture.
  it('un cycle T0 sans réponse ultérieure → T0 seul mesuré, aucun momentum (F1)', () => {
    const tr = construireTrajectoire({
      episodes: [t0('ep_T0', '2026-01-01T00:00:00.000Z')],
      reponses: [reponse('2026-01-01T00:00:00.000Z')],
    });
    expect(tr.cycles).toHaveLength(1);
    const cycle = tr.cycles[0];
    // T0 mesuré (réponse ≤ T0) → valeur non-null.
    expect(cycle.jalons.find((j) => j.jalon === 'T0')?.mesure).toBe(true);
    for (const jalon of ['J21', 'J42', 'J90'] as const) {
      expect(cycle.jalons.find((j) => j.jalon === jalon)?.mesure).toBe(false);
      expect(cycle.jalons.find((j) => j.jalon === jalon)?.valeur).toBeNull();
    }
    expect(cycle.momentum).toBeNull();
    expect(cycle.versionScore).toBe('v1');
    expect(tr.comparaison).toEqual({ disponible: false, raison: 'un_seul_cycle' });
  });

  it('une réponse nouvelle à J21 → J21 mesuré et momentum calculé', () => {
    const tr = construireTrajectoire({
      episodes: [t0('ep_T0', '2026-01-01T00:00:00.000Z')],
      reponses: [reponse('2026-01-01T00:00:00.000Z'), reponse('2026-01-22T00:00:00.000Z')],
    });
    const cycle = tr.cycles[0];
    expect(cycle.jalons.find((j) => j.jalon === 'J21')?.mesure).toBe(true);
    expect(cycle.momentum).not.toBeNull();
    // Aucune réponse après J21 : les jalons suivants restent non mesurés.
    expect(cycle.jalons.find((j) => j.jalon === 'J42')?.mesure).toBe(false);
  });

  // ── A03 : le statut de validité doit atteindre le moteur ───────────────
  //
  // Ces deux cas sont la CONTREPARTIE du correctif. Le moteur portait déjà le
  // filtre ; ce sont les adaptateurs qui l'affamaient en perdant le champ, et
  // le type optionnel faisait passer cet oubli pour un « VALID ». Sans ces cas,
  // rien ne distinguerait un filtre qui marche d'un filtre jamais atteint.

  it('une passation RETIRÉE ne mesure pas son jalon et n’ouvre aucun momentum (A03)', () => {
    const initial = process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    process.env.WN_ENABLE_VALIDITE_PASSATIONS = '1';
    try {
      const tr = construireTrajectoire({
        episodes: [t0('ep_T0', '2026-01-01T00:00:00.000Z')],
        reponses: [
          reponse('2026-01-01T00:00:00.000Z'),
          // Exactement le cas du test précédent, à ceci près : le praticien a
          // retiré cette passation du raisonnement.
          reponse('2026-01-22T00:00:00.000Z', 'INVALID'),
        ],
      });
      const cycle = tr.cycles[0];
      expect(cycle.jalons.find((j) => j.jalon === 'J21')?.mesure).toBe(false);
      expect(cycle.momentum, 'une passation retirée a produit un momentum').toBeNull();
    } finally {
      if (initial === undefined) delete process.env.WN_ENABLE_VALIDITE_PASSATIONS;
      else process.env.WN_ENABLE_VALIDITE_PASSATIONS = initial;
    }
  });

  it('drapeau ÉTEINT : la même passation retirée compte encore — le filtre est gardé', () => {
    // La contrepartie de la contrepartie. Sans ce cas, le précédent pourrait
    // passer au vert pour une raison sans rapport avec le statut.
    const initial = process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    delete process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    try {
      const tr = construireTrajectoire({
        episodes: [t0('ep_T0', '2026-01-01T00:00:00.000Z')],
        reponses: [
          reponse('2026-01-01T00:00:00.000Z'),
          reponse('2026-01-22T00:00:00.000Z', 'INVALID'),
        ],
      });
      expect(tr.cycles[0].jalons.find((j) => j.jalon === 'J21')?.mesure).toBe(true);
    } finally {
      if (initial !== undefined) process.env.WN_ENABLE_VALIDITE_PASSATIONS = initial;
    }
  });

  it('jalon sans couverture → « non mesuré », jamais un 0 (A8-2)', () => {
    // Réponse au 2026-02-01 : le jalon T0 (2026-01-01) n'a aucune couverture.
    const tr = construireTrajectoire({
      episodes: [t0('ep_T0', '2026-01-01T00:00:00.000Z')],
      reponses: [reponse('2026-02-01T00:00:00.000Z')],
    });
    const jalonT0 = tr.cycles[0].jalons.find((j) => j.jalon === 'T0');
    expect(jalonT0?.mesure).toBe(false);
    expect(jalonT0?.valeur).toBeNull();
  });

  it('deux cycles même version → comparaison disponible (A8-5-ii)', () => {
    const tr = construireTrajectoire({
      episodes: [
        t0('ep_a', '2026-01-01T00:00:00.000Z'),
        t0('ep_b', '2026-03-01T00:00:00.000Z', { milestone: 'T1' }),
      ],
      reponses: [reponse('2026-01-01T00:00:00.000Z')],
    });
    expect(tr.cycles).toHaveLength(2);
    expect(tr.comparaison.disponible).toBe(true);
    expect(tr.comparaison.raison).toBe('comparable');
  });

  it('garde A8-3 : deux cycles de versionScore différents → « non comparable »', () => {
    const cycle = (id: string, versionScore: string | null): TrajectoireCycle => ({
      cycleId: id,
      ancre: 'T0',
      dateAncre: '2026-01-01T00:00:00.000Z',
      versionScore,
      jalons: [],
      momentum: null,
      momentumParBesoin: [],
    });
    expect(resoudreComparaison([cycle('a', 'v1'), cycle('b', 'v2')])).toEqual({
      disponible: false,
      raison: 'versions_differentes',
    });
    expect(resoudreComparaison([cycle('a', 'v1'), cycle('b', 'v1')])).toEqual({
      disponible: true,
      raison: 'comparable',
    });
    // Gate G2 : une version inconnue n'est JAMAIS assimilée à la version
    // courante — sinon la garde A8-3 redevient indéclenchable.
    expect(resoudreComparaison([cycle('a', 'v1'), cycle('b', null)])).toEqual({
      disponible: false,
      raison: 'version_inconnue',
    });
    expect(resoudreComparaison([cycle('a', null), cycle('b', null)])).toEqual({
      disponible: false,
      raison: 'version_inconnue',
    });
  });

  it('gate G2 : la version LUE sur l’épisode fait foi, pas la constante courante', () => {
    const tr = construireTrajectoire({
      episodes: [
        t0('ep_a', '2026-01-01T00:00:00.000Z', { versionScore: 'v1' }),
        t0('ep_b', '2026-03-01T00:00:00.000Z', { versionScore: 'v2' }),
      ],
      reponses: [reponse('2026-01-01T00:00:00.000Z')],
    });
    expect(tr.cycles.map((c) => c.versionScore)).toEqual(['v1', 'v2']);
    expect(tr.comparaison).toEqual({ disponible: false, raison: 'versions_differentes' });
  });

  it('momentum par besoin : servi sur un versionScore stocké ANCIEN — l’état réel de la base', () => {
    // Revue LOT-07 (B1) : une garde comparant la version figée sur l'épisode
    // (ici « v1 », comme tout le stock antérieur au bump v14/v15) à la
    // constante courante affichait « non re-mesuré » sur des besoins
    // effectivement re-mesurés deux fois. Les deux lectures sont recalculées
    // par le moteur courant : le momentum se rend, quelle que soit l'étiquette.
    const tr = construireTrajectoire({
      episodes: [t0('ep_a', '2026-01-01T00:00:00.000Z', { versionScore: 'v1' })],
      reponses: [reponse('2026-01-01T00:00:00.000Z'), reponse('2026-01-20T00:00:00.000Z')],
      avecMomentumParBesoin: true,
    });
    const besoin9 = tr.cycles[0].momentumParBesoin.find((ligne) => ligne.besoin === 9);
    expect(besoin9).toBeTruthy();
    expect(besoin9).toMatchObject({ mesure: true });
    expect(besoin9?.delta).not.toBeNull();
  });

  it('momentum par besoin : OPT-IN — sans le drapeau, aucun calcul et un tableau vide', () => {
    // Revue LOT-07 (Mo3) : le chargement cabinet et la carte de Fil ne lisent
    // pas ce champ — ils ne doivent pas payer un recalcul d'équilibre par
    // jalon pour chaque patient du praticien.
    const tr = construireTrajectoire({
      episodes: [t0('ep_a', '2026-01-01T00:00:00.000Z')],
      reponses: [reponse('2026-01-01T00:00:00.000Z'), reponse('2026-01-20T00:00:00.000Z')],
    });
    expect(tr.cycles[0].momentumParBesoin).toEqual([]);
  });

  it('gate G2 : ligne héritée sans version stockée → cycle « version inconnue »', () => {
    const tr = construireTrajectoire({
      episodes: [t0('ep_legacy', '2026-01-01T00:00:00.000Z', { cycleId: null, versionScore: null })],
      reponses: [reponse('2026-01-01T00:00:00.000Z')],
    });
    expect(tr.cycles[0].versionScore).toBeNull();
    // Sans cycleId stocké, le cycle d'un T0 reste identifié par son propre id.
    expect(tr.cycles[0].cycleId).toBe('ep_legacy');
    expect(tr.index[0].cycleId).toBeNull();
  });
});

describe('rattacherReperesAuxCycles (index navigable)', () => {
  const cycle = (id: string, dateAncre: string, ancre: AncreCycle = 'T0'): TrajectoireCycle => ({
    cycleId: id,
    ancre,
    dateAncre,
    versionScore: 'v1',
    jalons: [],
    momentum: null,
    momentumParBesoin: [],
  });

  it('rattache chaque repère au dernier T0 antérieur ou égal', () => {
    const reperes = rattacherReperesAuxCycles(
      [
        { milestone: 'T0', date: '2026-01-01T00:00:00.000Z', cycleId: null },
        { milestone: 'J21', date: '2026-01-22T00:00:00.000Z', cycleId: null },
        { milestone: 'T0', date: '2026-03-01T00:00:00.000Z', cycleId: null },
        { milestone: 'J21', date: '2026-03-22T00:00:00.000Z', cycleId: null },
      ],
      [cycle('ep_a', '2026-01-01T00:00:00.000Z'), cycle('ep_b', '2026-03-01T00:00:00.000Z')],
    );
    expect(reperes.map((r) => r.cycleId)).toEqual(['ep_a', 'ep_a', 'ep_b', 'ep_b']);
  });

  it('un repère antérieur à tout T0 reste non rattaché, jamais rangé dans le premier cycle', () => {
    const reperes = rattacherReperesAuxCycles(
      [{ milestone: 'J21', date: '2025-12-01T00:00:00.000Z', cycleId: null }],
      [cycle('ep_a', '2026-01-01T00:00:00.000Z')],
    );
    expect(reperes[0].cycleId).toBeNull();
  });

  it('ne rattache jamais un repère à un cycle postérieur', () => {
    const reperes = rattacherReperesAuxCycles(
      [{ milestone: 'J21', date: '2026-02-01T00:00:00.000Z', cycleId: null }],
      [cycle('ep_b', '2026-03-01T00:00:00.000Z'), cycle('ep_a', '2026-01-01T00:00:00.000Z')],
    );
    // Ordre d'entrée volontairement non chronologique : le rattachement ne doit
    // pas dépendre de l'ordre du tableau de cycles.
    expect(reperes[0].cycleId).toBe('ep_a');
  });

  it('date illisible → repère non rattaché plutôt qu’une affectation devinée', () => {
    const reperes = rattacherReperesAuxCycles(
      [{ milestone: 'T0', date: 'pas-une-date', cycleId: null }],
      [cycle('ep_a', '2026-01-01T00:00:00.000Z')],
    );
    expect(reperes[0].cycleId).toBeNull();
  });

  it('gate G2 : le cycleId STOCKÉ prime sur le rattachement par date', () => {
    const reperes = rattacherReperesAuxCycles(
      // Repère postérieur au T0 de ep_b, mais rattaché en base à ep_a : la
      // donnée stockée fait foi, le repli par date ne la corrige pas.
      [{ milestone: 'J21', date: '2026-03-22T00:00:00.000Z', cycleId: 'ep_a' }],
      [cycle('ep_a', '2026-01-01T00:00:00.000Z'), cycle('ep_b', '2026-03-01T00:00:00.000Z')],
    );
    expect(reperes[0].cycleId).toBe('ep_a');
  });

  it('aucun cycle → aucun rattachement, mais les repères restent listés', () => {
    const reperes = rattacherReperesAuxCycles([{ milestone: 'T0', date: '2026-01-01T00:00:00.000Z', cycleId: null }], []);
    expect(reperes).toHaveLength(1);
    expect(reperes[0].cycleId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// `D-113` — deux cycles nommés : aucune ancre ne se déplace.
// ---------------------------------------------------------------------------
describe('construireTrajectoire — cycles nommés T0/T1 (`D-113`)', () => {
  it('LE DÉFAUT QUE LA DÉCISION SUPPRIME : ouvrir un second cycle ne déplace plus l’ancre du premier', () => {
    // Cycle 1 ancré le 1er janvier, avec une re-mesure à J21 (22 janvier).
    // Cycle 2 ouvert le 1er mars. Avant `D-113`, les DEUX portaient `T0` et la
    // lecture retenait « le plus récent » : le cycle de janvier était relu
    // depuis le 1er mars, et son J21 mesuré disparaissait.
    const tr = construireTrajectoire({
      episodes: [
        t0('ep_a', '2026-01-01T00:00:00.000Z'),
        t0('ep_b', '2026-03-01T00:00:00.000Z', { milestone: 'T1' }),
      ],
      reponses: [reponse('2026-01-01T00:00:00.000Z'), reponse('2026-01-22T00:00:00.000Z')],
    });

    expect(tr.cycles.map((c) => c.ancre)).toEqual(['T0', 'T1']);
    const premier = tr.cycles[0];
    expect(premier.dateAncre).toBe('2026-01-01T00:00:00.000Z');
    expect(premier.jalons.find((j) => j.jalon === 'T0')?.mesure).toBe(true);
    expect(premier.jalons.find((j) => j.jalon === 'J21')?.mesure).toBe(true);
    expect(premier.momentum).not.toBeNull();
  });

  it('chaque cycle porte SON ancre en tête de ses jalons', () => {
    const tr = construireTrajectoire({
      episodes: [
        t0('ep_a', '2026-01-01T00:00:00.000Z'),
        t0('ep_b', '2026-03-01T00:00:00.000Z', { milestone: 'T1' }),
      ],
      reponses: [reponse('2026-01-01T00:00:00.000Z')],
    });
    expect(tr.cycles[0].jalons.map((j) => j.jalon)).toEqual(['T0', 'J21', 'J42', 'J90']);
    expect(tr.cycles[1].jalons.map((j) => j.jalon)).toEqual(['T1', 'J21', 'J42', 'J90']);
  });

  it('l’ancre n’entre jamais dans son propre momentum', () => {
    // Une seule réponse, à l'ancre du deuxième cycle : le momentum d'un cycle
    // est ancre → dernier jalon de MESURE. Sans jalon de mesure, il est null —
    // jamais un « stable (écart 0) » fabriqué en comparant l'ancre à elle-même.
    const tr = construireTrajectoire({
      episodes: [t0('ep_b', '2026-03-01T00:00:00.000Z', { milestone: 'T1' })],
      reponses: [reponse('2026-03-01T00:00:00.000Z')],
    });
    expect(tr.cycles[0].jalons.find((j) => j.jalon === 'T1')?.mesure).toBe(true);
    expect(tr.cycles[0].momentum).toBeNull();
  });

  it('ordonne les cycles par RANG, pas par date de confirmation', () => {
    // `T1` confirmé AVANT `T0` — reprise manuelle, ligne ressaisie. L'ordre
    // suit le nom, qui identifie le cycle.
    const tr = construireTrajectoire({
      episodes: [
        t0('ep_b', '2026-01-01T00:00:00.000Z', { milestone: 'T1' }),
        t0('ep_a', '2026-03-01T00:00:00.000Z'),
      ],
      reponses: [],
    });
    expect(tr.cycles.map((c) => c.ancre)).toEqual(['T0', 'T1']);
  });

  it('SIGNALE la discordance rang/date sans la corriger (DC-30)', () => {
    const discordant = construireTrajectoire({
      episodes: [
        t0('ep_b', '2026-01-01T00:00:00.000Z', { milestone: 'T1' }),
        t0('ep_a', '2026-03-01T00:00:00.000Z'),
      ],
      reponses: [],
    });
    expect(discordant.discordanceOrdreCycles).toBe(true);

    const coherent = construireTrajectoire({
      episodes: [
        t0('ep_a', '2026-01-01T00:00:00.000Z'),
        t0('ep_b', '2026-03-01T00:00:00.000Z', { milestone: 'T1' }),
      ],
      reponses: [],
    });
    expect(coherent.discordanceOrdreCycles).toBe(false);
  });

  it('une ligne de jalon inconnue n’ouvre aucun cycle', () => {
    // `TA` n'est pas une ancre : rien en base ne l'interdit (dette nommée par
    // `D-113`), et la lecture ne doit pas en fabriquer un cycle.
    const tr = construireTrajectoire({
      episodes: [
        { id: 'ep_x', milestone: 'TA' as never, confirmedAt: new Date('2026-01-01T00:00:00.000Z'), cycleId: null, versionScore: 'v1' },
      ],
      reponses: [reponse('2026-01-01T00:00:00.000Z')],
    });
    expect(tr.cycles).toHaveLength(0);
  });
});
