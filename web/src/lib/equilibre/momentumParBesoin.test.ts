import { describe, expect, it } from 'vitest';

import {
  BANDES_DE_BRUIT,
  bandePourBesoin,
  calculerMomentumParBesoin,
  construireHistoriqueParBesoin,
  MOMENTUM_PAR_BESOIN_VERSION,
  type BandesMetadata,
  type LectureBesoin,
} from './momentumParBesoin';

// Ce que cette matrice défend (`D-058`) : sur le dépôt d'aujourd'hui — aucune
// bande de bruit publiée — le momentum par besoin rend le delta et NE LE
// QUALIFIE PAS. Et un besoin non re-mesuré n'a pas de momentum : ni zéro, ni
// « stable », ni silence.

const lecture = (jalon: LectureBesoin['jalon'], couverture: number): LectureBesoin => ({
  jalon,
  date: new Date(`2026-01-0${jalon === 'T0' ? 1 : 2}T00:00:00.000Z`),
  couverture,
});

function momentum(series: Map<number, LectureBesoin[]>, metadata?: BandesMetadata) {
  return calculerMomentumParBesoin({ series, metadata });
}

/** La ligne d'un besoin précis — la sortie nomme TOUS les besoins mesurables. */
function ligneBesoin(
  besoin: number,
  series: Map<number, LectureBesoin[]>,
  metadata?: BandesMetadata,
) {
  const resultat = momentum(series, metadata).find(r => r.besoin === besoin);
  if (!resultat) throw new Error(`besoin ${besoin} absent de la sortie`);
  return resultat;
}

const BANDE_PUBLIEE: BandesMetadata = {
  version: MOMENTUM_PAR_BESOIN_VERSION,
  publiee: true,
  datePublication: '2026-09-01',
  bandes: [{ besoin: 4, ecartMinimal: 5, source: 'fidélité test-retest fixture' }],
};

describe('Bandes de bruit — la table est vide et non publiée', () => {
  it('la table livrée n’est pas publiée et ne contient rien', () => {
    // L'état du dépôt. Ce banc rougit le jour où quelqu'un publie une bande
    // sans passer par une décision — c'est exactement ce qu'il garde.
    expect(BANDES_DE_BRUIT.publiee).toBe(false);
    expect(BANDES_DE_BRUIT.bandes).toHaveLength(0);
    expect(BANDES_DE_BRUIT.datePublication).toBeNull();
  });

  it('aucune bande n’est utilisable tant que la table n’est pas publiée', () => {
    // Même si quelqu'un ajoutait une entrée sans lever `publiee` : la table
    // non publiée ne rend rien, comme une table clinique non signée.
    expect(bandePourBesoin(4, {
      ...BANDE_PUBLIEE, publiee: false,
    })).toBeNull();
  });
});

describe('Momentum par besoin — ce qui n’est pas mesuré n’a pas de momentum', () => {
  it('un besoin à une seule lecture n’a PAS de momentum — ni 0, ni « stable »', () => {
    const resultat = ligneBesoin(4, new Map([[4, [lecture('T0', 60)]]]));
    expect(resultat.mesure).toBe(false);
    expect(resultat.delta).toBeNull();
    expect(resultat.qualification).toBeNull();
    expect(resultat.motif).toContain('n’est pas une stabilité');
  });

  it('le motif nomme le jalon réellement lu — jamais « T0 » pour une série qui commence à J21', () => {
    // Revue LOT-07 (M5) : un patient sans lecture au T0 rendait « non
    // re-mesuré depuis le T0 » avec un départ à J21 — un T0 jamais lu, nommé.
    const resultat = ligneBesoin(4, new Map([[4, [lecture('J21', 60)]]]));
    expect(resultat.mesure).toBe(false);
    expect(resultat.motif).toContain('J21');
    expect(resultat.motif).not.toContain('T0');
  });

  it('un besoin re-mesuré rend son delta factuel', () => {
    const resultat = ligneBesoin(4, new Map([[4, [lecture('T0', 60), lecture('J21', 72)]]]));
    expect(resultat.mesure).toBe(true);
    expect(resultat.delta).toBe(12);
  });

  it('aucun arrondi n’écrase un mouvement réel sous le centième', () => {
    // Revue LOT-07 (M4) : `Math.round(x*100)/100` était un nombre technique
    // non déclaré (`DC-20`) qui rendait « écart 0 » tout mouvement < 0,005
    // sur l'échelle de couverture 0–1. Le delta est la soustraction brute.
    const resultat = ligneBesoin(4, new Map([[4, [lecture('T0', 0.5), lecture('J21', 0.503)]]]));
    expect(resultat.delta).not.toBe(0);
    expect(resultat.delta).toBeCloseTo(0.003, 10);
  });

  it('un besoin re-mesuré à l’identique rend un delta de 0 — et ce n’est pas « stable »', () => {
    // LE PIÈGE que `D-058` nomme : le scalaire existant appelle « stable » un
    // delta exactement nul. Ici, 0 est un delta comme un autre, et il n'est pas
    // qualifié tant qu'aucune bande ne dit ce que 0 vaut.
    const resultat = ligneBesoin(4, new Map([[4, [lecture('T0', 60), lecture('J21', 60)]]]));
    expect(resultat.mesure).toBe(true);
    expect(resultat.delta).toBe(0);
    expect(resultat.qualification).toBeNull();
  });

  it('rend les besoins dans un ordre déterministe', () => {
    const resultats = momentum(new Map([
      [9, [lecture('T0', 40), lecture('J21', 45)]],
      [1, [lecture('T0', 50), lecture('J21', 55)]],
    ]));
    const besoins = resultats.map(r => r.besoin);
    expect(besoins).toEqual([...besoins].sort((gauche, droite) => gauche - droite));
    expect(resultats.filter(r => r.mesure).map(r => r.besoin)).toEqual([1, 9]);
  });

  it('un besoin JAMAIS lu est nommé — jamais une absence silencieuse', () => {
    // « Ni zéro, ni stable, ni absence silencieuse » (`D-058`, arbitrage 2).
    // Relevé en revue Copilot : itérer sur les seules séries rendait ce cas
    // inatteignable — un besoin jamais lu disparaissait de la sortie, le
    // silence que ce module existe pour fermer, recréé un cran plus haut.
    const resultats = momentum(new Map());
    const besoin4 = resultats.find(r => r.besoin === 4);
    expect(besoin4).toMatchObject({ mesure: false, delta: null, qualification: null });
    expect(besoin4?.motif).toContain('sans lecture');
    // Un besoin sans source vivante (besoin 2, retiré en v4) n'est PAS listé :
    // aucune mesure n'en est possible, le nommer n'informerait rien.
    expect(resultats.some(r => r.besoin === 2)).toBe(false);
  });
});

describe('Momentum par besoin — sans bande publiée, rien n’est qualifié', () => {
  it('ne qualifie AUCUN besoin sur la table livrée', () => {
    const resultats = momentum(new Map([
      [1, [lecture('T0', 50), lecture('J21', 51)]],
      [4, [lecture('T0', 60), lecture('J21', 90)]],
    ]));
    expect(resultats.every(r => r.qualification === null)).toBe(true);
  });

  it('donne un motif, pas un silence — y compris sur un écart énorme', () => {
    const resultat = ligneBesoin(4, new Map([[4, [lecture('T0', 10), lecture('J21', 95)]]]));
    expect(resultat.delta).toBe(85);
    expect(resultat.motif).toContain('aucune bande de bruit n’est publiée');
  });

  it('qualifie de part et d’autre de la borne dès qu’une bande est publiée', () => {
    // Le mécanisme est prouvé ici, en fixture ; la table de production reste
    // vide. C'est le même partage que pour les tables cliniques non signées.
    const petit = ligneBesoin(4, new Map([[4, [lecture('T0', 60), lecture('J21', 63)]]]), BANDE_PUBLIEE);
    expect(petit).toMatchObject({ delta: 3, qualification: 'dans_la_bande' });

    const grand = ligneBesoin(4, new Map([[4, [lecture('T0', 60), lecture('J21', 70)]]]), BANDE_PUBLIEE);
    expect(grand).toMatchObject({ delta: 10, qualification: 'au_dessus_de_la_bande' });
  });

  it('une bande publiée ne couvrant PAS le besoin ne qualifie pas ce besoin', () => {
    const resultat = ligneBesoin(1, new Map([[1, [lecture('T0', 60), lecture('J21', 70)]]]), BANDE_PUBLIEE);
    expect(resultat.qualification).toBeNull();
  });
});

describe('Momentum par besoin — pas de garde de version INTRA-cycle', () => {
  // Revue LOT-07 (B1) : les deux lectures d'une série sont toujours
  // recalculées par le moteur COURANT — il n'existe aucun chemin où deux
  // versions se soustraient. Une garde comparant l'étiquette figée sur
  // l'épisode à la constante courante aurait affiché « non re-mesuré » sur
  // tout cycle antérieur au dernier bump de version, pour des besoins
  // effectivement re-mesurés. La garde A8-3 (inter-cycles) vit dans
  // `resoudreComparaison` de trajectoire.ts, pas ici.
  it('un besoin re-mesuré rend son momentum quel que soit le versionScore stocké sur l’épisode', () => {
    // L'appel ne porte AUCUNE version : le type l'interdit désormais. Ce banc
    // fige que la signature ne réintroduit pas l'interrupteur.
    const resultat = ligneBesoin(4, new Map([[4, [lecture('T0', 60), lecture('J21', 72)]]]));
    expect(resultat).toMatchObject({ mesure: true, delta: 12 });
  });
});

describe('Historique par besoin — la règle de nouveauté vaut au grain du besoin', () => {
  // Reprise des sondes F1 de l'audit trajectoire (2026-07-27), un cran plus
  // bas : sans nouveauté PAR BESOIN, un patient ayant répondu une seule fois
  // au PSS-10 obtenait des lectures identiques à chaque jalon pour le besoin 9
  // — « mesure : vrai, delta : 0 » sans qu'aucune re-mesure ait eu lieu.
  // Défaut trouvé en branchant le module, avant tout consommateur.

  // PSS-10 complet : source vivante du besoin 9 — la même fixture que le banc
  // du scalaire (`depuisPrisma.test.ts`).
  const RAW_PSS10_T0 = {
    P1: '2', P2: '2', P3: '3', P4: '3', P5: '3',
    P6: '2', P7: '3', P8: '3', P9: '2', P10: '3',
  };
  const RAW_PSS10_J21 = {
    P1: '1', P2: '1', P3: '2', P4: '2', P5: '2',
    P6: '1', P7: '2', P8: '2', P9: '1', P10: '2',
  };
  const BESOIN_STRESS = 9;
  const T0 = new Date('2026-01-01T00:00:00.000Z');
  const MAINTENANT = new Date('2026-04-15T00:00:00.000Z'); // tous les jalons atteints

  it('une seule passation ⇒ UNE lecture, jamais quatre copies', () => {
    const series = construireHistoriqueParBesoin([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: T0, scoresJson: { rawAnswers: RAW_PSS10_T0 } },
    ], T0, MAINTENANT);
    expect(series.get(BESOIN_STRESS) ?? []).toHaveLength(1);
  });

  it('…et donc aucun momentum : le besoin n’a pas été re-mesuré', () => {
    const series = construireHistoriqueParBesoin([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: T0, scoresJson: { rawAnswers: RAW_PSS10_T0 } },
    ], T0, MAINTENANT);
    const resultat = calculerMomentumParBesoin({ series })
      .find(r => r.besoin === BESOIN_STRESS);
    expect(resultat).toMatchObject({ mesure: false, delta: null });
  });

  it('une re-passation rouvre le jalon du besoin, et le delta est réel', () => {
    const series = construireHistoriqueParBesoin([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: T0, scoresJson: { rawAnswers: RAW_PSS10_T0 } },
      {
        statutValidite: null,
        idQuestionnaire: 'Q_STR_02',
        dateReponse: new Date('2026-01-20T00:00:00.000Z'),
        scoresJson: { rawAnswers: RAW_PSS10_J21 },
      },
    ], T0, MAINTENANT);
    const serie = series.get(BESOIN_STRESS) ?? [];
    expect(serie).toHaveLength(2);
    const resultat = calculerMomentumParBesoin({ series })
      .find(r => r.besoin === BESOIN_STRESS);
    expect(resultat?.mesure).toBe(true);
    expect(resultat?.delta).not.toBe(0);
    // Sans bande publiée, même un delta réel n'est pas qualifié.
    expect(resultat?.qualification).toBeNull();
  });

  it('drapeau de validité allumé : une passation INVALID ne rouvre pas un jalon', () => {
    // Même sémantique que la règle globale du scalaire, PAR CONSTRUCTION : le
    // filtre est `filtrerPassationsExploitables`, gaté par
    // `WN_ENABLE_VALIDITE_PASSATIONS`. Drapeau éteint — l'état de production —
    // aucune ligne ne disparaît (engagement du LOT-00) ; ce banc prouve le
    // mécanisme drapeau allumé, et le suivant fige le comportement éteint.
    process.env.WN_ENABLE_VALIDITE_PASSATIONS = '1';
    try {
      const series = construireHistoriqueParBesoin([
        { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: T0, scoresJson: { rawAnswers: RAW_PSS10_T0 } },
        {
          idQuestionnaire: 'Q_STR_02',
          dateReponse: new Date('2026-01-20T00:00:00.000Z'),
          scoresJson: { rawAnswers: RAW_PSS10_J21 },
          statutValidite: 'INVALID',
        },
      ], T0, MAINTENANT);
      expect(series.get(BESOIN_STRESS) ?? []).toHaveLength(1);
    } finally {
      delete process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    }
  });

  it('drapeau éteint : la ligne INVALID reste lue — comme partout ailleurs', () => {
    // L'état de production. Diverger ici du scalaire aurait fait disparaître
    // une ligne que le LOT-00 s'est engagé à transmettre.
    delete process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    const series = construireHistoriqueParBesoin([
      { statutValidite: null, idQuestionnaire: 'Q_STR_02', dateReponse: T0, scoresJson: { rawAnswers: RAW_PSS10_T0 } },
      {
        idQuestionnaire: 'Q_STR_02',
        dateReponse: new Date('2026-01-20T00:00:00.000Z'),
        scoresJson: { rawAnswers: RAW_PSS10_J21 },
        statutValidite: 'INVALID',
      },
    ], T0, MAINTENANT);
    expect(series.get(BESOIN_STRESS) ?? []).toHaveLength(2);
  });
});

