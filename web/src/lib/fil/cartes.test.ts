import { describe, expect, it } from 'vitest';
import {
  cartesAssignationsEnRetard,
  cartesConsultationsPrevues,
  cartesJalons,
  cartesReprise,
  cartesSignalementsTrust,
  cartesT0AConfirmer,
  cartesSynthesesAGenerer,
  cartesSynthesesAValider,
  construireFil,
  indexCarteImminente,
  resumeFil,
} from './cartes';

// Patients fictifs autorisés uniquement (CLAUDE.md).
const NOMS = new Map([
  ['P-SOPHIE', 'Sophie Nicola'],
  ['P-JENNIFER', 'Jennifer Martin'],
  ['P-MICHEL', 'Michel Dogné'],
]);

const MAINTENANT = new Date('2026-07-15T10:00:00');

describe('cartesSynthesesAValider', () => {
  it('trie par date décroissante et pointe vers la page synthèse', () => {
    const cartes = cartesSynthesesAValider(
      [
        { idSynthese: 'SYN_1', idPatient: 'P-SOPHIE', dateGeneration: new Date('2026-07-10T09:00:00') },
        { idSynthese: 'SYN_2', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-14T09:00:00') },
      ],
      NOMS,
    );
    expect(cartes.map(c => c.patient)).toEqual(['Jennifer Martin', 'Sophie Nicola']);
    expect(cartes[0].href).toBe('/dashboard/synthese');
    expect(cartes[0].pourquoi).toContain('validation');
  });

  it('agrège les synthèses d’un même patient en une carte « N relectures en attente »', () => {
    const cartes = cartesSynthesesAValider(
      [
        { idSynthese: 'SYN_1', idPatient: 'P-SOPHIE', dateGeneration: new Date('2026-07-10T09:00:00') },
        { idSynthese: 'SYN_2', idPatient: 'P-SOPHIE', dateGeneration: new Date('2026-07-14T09:00:00') },
        { idSynthese: 'SYN_3', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-12T09:00:00') },
      ],
      NOMS,
    );
    expect(cartes).toHaveLength(2);
    expect(cartes[0].patient).toBe('Sophie Nicola');
    expect(cartes[0].titre).toBe('2 relectures en attente');
    expect(cartes[0].nbElements).toBe(2);
    // La date de référence est la synthèse la plus récente du patient.
    expect(cartes[0].pourquoi).toContain('14 juillet');
    expect(cartes[1].titre).toBe('1 relecture en attente');
  });

  it('une nouvelle synthèse change la clé de l’agrégat — la carte écartée revient', () => {
    const avant = cartesSynthesesAValider(
      [{ idSynthese: 'SYN_1', idPatient: 'P-SOPHIE', dateGeneration: new Date('2026-07-10T09:00:00') }],
      NOMS,
    );
    const apres = cartesSynthesesAValider(
      [
        { idSynthese: 'SYN_1', idPatient: 'P-SOPHIE', dateGeneration: new Date('2026-07-10T09:00:00') },
        { idSynthese: 'SYN_2', idPatient: 'P-SOPHIE', dateGeneration: new Date('2026-07-15T09:00:00') },
      ],
      NOMS,
    );
    expect(apres[0].cle).not.toBe(avant[0].cle);
    // Sans fait nouveau, la clé ne bouge pas : le refus persiste.
    const relecture = cartesSynthesesAValider(
      [{ idSynthese: 'SYN_1', idPatient: 'P-SOPHIE', dateGeneration: new Date('2026-07-10T09:00:00') }],
      NOMS,
    );
    expect(relecture[0].cle).toBe(avant[0].cle);
  });
});

describe('cartesSynthesesAGenerer', () => {
  it('signale un patient lu sans aucune synthèse générée', () => {
    const cartes = cartesSynthesesAGenerer(
      [{ idPatient: 'P-SOPHIE', derniereLecture: new Date('2026-07-14T09:00:00') }],
      new Map(),
      NOMS,
    );
    expect(cartes).toHaveLength(1);
    expect(cartes[0].patient).toBe('Sophie Nicola');
    expect(cartes[0].titre).toBe('Synthèse à générer');
    expect(cartes[0].href).toBe('/dashboard/synthese?idPatient=P-SOPHIE');
    expect(cartes[0].pourquoi).toContain('14 juillet');
  });

  it('écarte un patient dont la synthèse la plus récente couvre déjà la lecture', () => {
    const cartes = cartesSynthesesAGenerer(
      [{ idPatient: 'P-SOPHIE', derniereLecture: new Date('2026-07-10T09:00:00') }],
      new Map([['P-SOPHIE', new Date('2026-07-12T09:00:00')]]),
      NOMS,
    );
    expect(cartes).toEqual([]);
  });

  it('fait revenir la carte quand une nouvelle lecture suit la dernière synthèse', () => {
    const cartes = cartesSynthesesAGenerer(
      [{ idPatient: 'P-SOPHIE', derniereLecture: new Date('2026-07-15T09:00:00') }],
      new Map([['P-SOPHIE', new Date('2026-07-12T09:00:00')]]),
      NOMS,
    );
    expect(cartes).toHaveLength(1);
  });
});

describe('resumeFil', () => {
  it('résume par type dans l’ordre du Fil, consultations en tête, en comptant les agrégats', () => {
    const fil = construireFil({
      consultations: [{ id: 'RDV_1', idPatient: 'P-SOPHIE', dateHeure: new Date('2026-07-15T11:00:00') }],
      signalements: [{ id: 'SIG_1', idPatient: 'P-MICHEL', kind: 'demande_droit', soumisLe: new Date('2026-07-15T09:00:00') }],
      syntheses: [
        { idSynthese: 'SYN_1', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-13T09:00:00') },
        { idSynthese: 'SYN_2', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-14T09:00:00') },
      ],
      jalons: [
        { idCheckin: 'CHK_1', idPatient: 'P-SOPHIE', soumisLe: new Date('2026-07-14T08:00:00') },
      ],
      assignations: [
        { idAssignation: 'ASG_1', idPatient: 'P-MICHEL', titre: 'Mode de vie', dateLimite: '2026-07-01', statut: 'En attente' },
      ],
      activites: [],
      noms: NOMS,
      maintenant: MAINTENANT,
    });
    // Consultations en tête (maquette « 3 consultations · … ») ; 2 synthèses
    // agrégées comptent bien pour 2 relectures.
    expect(resumeFil(fil)).toBe('1 consultation · 1 signalement · 2 relectures · 1 jalon · 1 retard');
  });

  it('rend une chaîne vide pour un fil vide', () => {
    expect(resumeFil([])).toBe('');
  });
});

describe('indexCarteImminente', () => {
  it('désigne la tête du Fil, ou rien si le Fil est vide', () => {
    const fil = construireFil({
      syntheses: [{ idSynthese: 'SYN_1', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-14T09:00:00') }],
      assignations: [],
      activites: [],
      noms: NOMS,
      maintenant: MAINTENANT,
    });
    expect(indexCarteImminente(fil)).toBe(0);
    expect(indexCarteImminente([])).toBe(-1);
  });

  it('préfère la consultation à venir la plus proche quand `maintenant` est fourni', () => {
    const fil = construireFil({
      signalements: [{ id: 'SIG_1', idPatient: 'P-MICHEL', kind: 'demande_droit', soumisLe: new Date('2026-07-15T09:00:00') }],
      consultations: [
        { id: 'RDV_TARD', idPatient: 'P-JENNIFER', dateHeure: new Date('2026-07-15T16:00:00') },
        { id: 'RDV_TOT', idPatient: 'P-SOPHIE', dateHeure: new Date('2026-07-15T11:00:00') },
      ],
      syntheses: [],
      assignations: [],
      activites: [],
      noms: NOMS,
      maintenant: MAINTENANT,
    });
    // Le signalement est en tête de l'ordre, mais l'imminente est la
    // consultation à venir la plus proche (11:00), pas l'index 0.
    const idx = indexCarteImminente(fil, MAINTENANT);
    expect(fil[idx].cle).toBe('consultation_prevue:RDV_TOT');
  });

  it('sans consultation à venir, retombe sur la tête du Fil', () => {
    const fil = construireFil({
      signalements: [{ id: 'SIG_1', idPatient: 'P-MICHEL', kind: 'demande_droit', soumisLe: new Date('2026-07-15T09:00:00') }],
      // consultation déjà passée aujourd'hui (08:00 < 10:00)
      consultations: [{ id: 'RDV_PASSE', idPatient: 'P-SOPHIE', dateHeure: new Date('2026-07-15T08:00:00') }],
      syntheses: [],
      assignations: [],
      activites: [],
      noms: NOMS,
      maintenant: MAINTENANT,
    });
    expect(indexCarteImminente(fil, MAINTENANT)).toBe(0);
  });
});

describe('cartesConsultationsPrevues', () => {
  it('ne retient que les rendez-vous du jour civil, triés par heure, vers le pré-vol', () => {
    const cartes = cartesConsultationsPrevues(
      [
        { id: 'RDV_2', idPatient: 'P-MICHEL', dateHeure: new Date('2026-07-15T14:30:00') },
        { id: 'RDV_1', idPatient: 'P-SOPHIE', dateHeure: new Date('2026-07-15T09:00:00') },
        { id: 'RDV_DEMAIN', idPatient: 'P-JENNIFER', dateHeure: new Date('2026-07-16T09:00:00') },
      ],
      NOMS,
      MAINTENANT,
    );
    expect(cartes).toHaveLength(2); // le RDV de demain est écarté
    expect(cartes.map(c => c.patient)).toEqual(['Sophie Nicola', 'Michel Dogné']);
    expect(cartes[0].titre).toBe('Pré-vol prêt');
    expect(cartes[0].href).toBe('/dashboard/copilote?idPatient=P-SOPHIE');
    expect(cartes[0].actionLabel).toBe('Ouvrir le pré-vol');
    expect(cartes[0].cle).toBe('consultation_prevue:RDV_1');
  });

  it('annonce « dans X min » à l’approche, l’heure sinon', () => {
    const [imminente] = cartesConsultationsPrevues(
      [{ id: 'RDV_1', idPatient: 'P-SOPHIE', dateHeure: new Date('2026-07-15T10:30:00') }],
      NOMS,
      MAINTENANT, // 10:00
    );
    expect(imminente.pourquoi).toBe('Consultation dans 30 min.');

    const [lointaine] = cartesConsultationsPrevues(
      [{ id: 'RDV_2', idPatient: 'P-MICHEL', dateHeure: new Date('2026-07-15T16:00:00') }],
      NOMS,
      MAINTENANT,
    );
    expect(lointaine.pourquoi).toContain('Consultation à');
  });
});

describe('cartesJalons', () => {
  it('cite la date du check-in J21 et l’action observée, sans momentum si absent', () => {
    const cartes = cartesJalons(
      [{ idCheckin: 'CHK_1', idPatient: 'P-SOPHIE', soumisLe: new Date('2026-07-14T08:00:00'), adhesion: 'Tous les jours' }],
      NOMS,
    );
    expect(cartes).toHaveLength(1);
    expect(cartes[0].type).toBe('jalon_j21');
    expect(cartes[0].patient).toBe('Sophie Nicola');
    expect(cartes[0].titre).toBe('Jalon J21 atteint — décision attendue');
    expect(cartes[0].pourquoi).toContain('Check-in J21 reçu le 14 juillet');
    expect(cartes[0].pourquoi).toContain('Tous les jours');
    expect(cartes[0].pourquoi).not.toContain('Momentum');
    expect(cartes[0].cle).toBe('jalon_j21:CHK_1');
  });

  it('cite le momentum seulement quand il existe (jamais un 0)', () => {
    const [hausse] = cartesJalons(
      [{ idCheckin: 'CHK_1', idPatient: 'P-SOPHIE', soumisLe: new Date('2026-07-14T08:00:00'), momentum: { tendance: 'hausse', delta: 1.4 } }],
      NOMS,
    );
    expect(hausse.pourquoi).toContain('Momentum en hausse de 1.4');

    const [stable] = cartesJalons(
      [{ idCheckin: 'CHK_2', idPatient: 'P-MICHEL', soumisLe: new Date('2026-07-14T08:00:00'), momentum: { tendance: 'stable', delta: 0 } }],
      NOMS,
    );
    expect(stable.pourquoi).toContain('Momentum stable');
  });
});

describe('cartesAssignationsEnRetard', () => {
  it('ne retient que les assignations non complétées dont la limite est dépassée', () => {
    const cartes = cartesAssignationsEnRetard(
      [
        { idAssignation: 'ASG_1', idPatient: 'P-MICHEL', titre: 'Mode de vie SIIN', dateLimite: '2026-07-10', statut: 'En attente' },
        { idAssignation: 'ASG_2', idPatient: 'P-SOPHIE', titre: 'Plaintes', dateLimite: '2026-07-10', statut: 'Complété' },
        { idAssignation: 'ASG_3', idPatient: 'P-JENNIFER', titre: 'Alimentaire', dateLimite: '2026-07-20', statut: 'En attente' },
        { idAssignation: 'ASG_4', idPatient: 'P-JENNIFER', titre: 'DNSM', dateLimite: null, statut: 'En attente' },
      ],
      NOMS,
      MAINTENANT,
    );
    expect(cartes).toHaveLength(1);
    expect(cartes[0].patient).toBe('Michel Dogné');
    expect(cartes[0].pourquoi).toContain('5 jours');
    expect(cartes[0].href).toBe('/dashboard/patients/P-MICHEL');
  });

  it('ignore les dates limites invalides', () => {
    const cartes = cartesAssignationsEnRetard(
      [{ idAssignation: 'ASG_5', idPatient: 'P-MICHEL', titre: 'Q', dateLimite: 'hier', statut: 'En attente' }],
      NOMS,
      MAINTENANT,
    );
    expect(cartes).toHaveLength(0);
  });
});

describe('cartesReprise', () => {
  it('signale les patients inactifs depuis plus de six mois, sans pack', () => {
    const cartes = cartesReprise(
      [
        { idPatient: 'P-SOPHIE', derniereReponse: new Date('2025-09-01T08:00:00') },
        { idPatient: 'P-JENNIFER', derniereReponse: new Date('2026-07-01T08:00:00') },
      ],
      NOMS,
      MAINTENANT,
    );
    expect(cartes).toHaveLength(1);
    expect(cartes[0].patient).toBe('Sophie Nicola');
    expect(cartes[0].pourquoi).toContain('mois');
    expect(cartes[0].actionLabel).toBe('Ouvrir la fiche');
  });
});

describe('cartesSignalementsTrust', () => {
  it('mène vers la page Confiance & droits avec le bon libellé', () => {
    const cartes = cartesSignalementsTrust(
      [{ id: 'SIG_1', idPatient: 'P-JENNIFER', kind: 'effet_indesirable', soumisLe: new Date('2026-07-15T09:00:00') }],
      NOMS,
    );
    expect(cartes).toHaveLength(1);
    expect(cartes[0].titre).toBe('Effet indésirable suspecté');
    expect(cartes[0].href).toBe('/dashboard/droits');
    expect(cartes[0].patient).toBe('Jennifer Martin');
  });
});

describe('construireFil', () => {
  it('place les signalements en tête du Fil', () => {
    const fil = construireFil({
      signalements: [{ id: 'SIG_2', idPatient: 'P-MICHEL', kind: 'demande_droit', soumisLe: new Date('2026-07-15T09:00:00') }],
      syntheses: [{ idSynthese: 'SYN_2', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-14T09:00:00') }],
      assignations: [],
      activites: [],
      noms: NOMS,
      maintenant: MAINTENANT,
    });
    expect(fil.map(c => c.type)).toEqual(['signalement_trust', 'synthese_a_valider']);
  });

  it('ordonne le Fil : consultations après signalements, puis synthèses (à valider, à générer), jalons, retards, reprises', () => {
    const fil = construireFil({
      signalements: [{ id: 'SIG_1', idPatient: 'P-MICHEL', kind: 'demande_droit', soumisLe: new Date('2026-07-15T09:00:00') }],
      consultations: [{ id: 'RDV_1', idPatient: 'P-SOPHIE', dateHeure: new Date('2026-07-15T11:00:00') }],
      syntheses: [{ idSynthese: 'SYN_2', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-14T09:00:00') }],
      lectures: [{ idPatient: 'P-MICHEL', derniereLecture: new Date('2026-07-15T08:00:00') }],
      jalons: [{ idCheckin: 'CHK_1', idPatient: 'P-SOPHIE', soumisLe: new Date('2026-07-14T08:00:00') }],
      assignations: [
        { idAssignation: 'ASG_6', idPatient: 'P-MICHEL', titre: 'Mode de vie', dateLimite: '2026-07-01', statut: 'En attente' },
      ],
      activites: [{ idPatient: 'P-SOPHIE', derniereReponse: new Date('2025-08-01T08:00:00') }],
      noms: NOMS,
      maintenant: MAINTENANT,
    });
    expect(fil.map(c => c.type)).toEqual([
      'signalement_trust',
      'consultation_prevue',
      'synthese_a_valider',
      'synthese_a_generer',
      'jalon_j21',
      'assignation_en_retard',
      'reprise',
    ]);
  });
});

// Prérequis de G1 (refus persisté) : sans identité de carte, on ne peut pas
// dire ce qui a été refusé. Ces tests protègent la propriété dont dépendra le
// refus — une clé ancrée sur la ligne source, donc stable dans le temps et
// distincte entre deux cartes jumelles.
describe('identité des cartes (clé)', () => {
  it('deux cartes de même type, même patient et même instant restent distinctes', () => {
    const memeInstant = new Date('2026-07-14T08:00:00');
    const cartes = cartesSignalementsTrust(
      [
        { id: 'SIG_A', idPatient: 'P-SOPHIE', kind: 'effet_indesirable', soumisLe: memeInstant },
        { id: 'SIG_B', idPatient: 'P-SOPHIE', kind: 'effet_indesirable', soumisLe: memeInstant },
      ],
      NOMS,
    );
    // C'est exactement ce qu'une clé « type + patient + date » aurait confondu.
    expect(new Set(cartes.map(c => c.cle)).size).toBe(2);
  });

  it('la clé ne bouge pas d’une ouverture du Fil à l’autre', () => {
    const entree = {
      syntheses: [{ idSynthese: 'SYN_9', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-14T09:00:00') }],
      assignations: [
        { idAssignation: 'ASG_9', idPatient: 'P-MICHEL', titre: 'Mode de vie', dateLimite: '2026-07-01', statut: 'En attente' },
      ],
      activites: [{ idPatient: 'P-SOPHIE', derniereReponse: new Date('2025-08-01T08:00:00') }],
      noms: NOMS,
      maintenant: MAINTENANT,
    };

    const matin = construireFil(entree);
    // Le lendemain : mêmes données sources, Fil rouvert. Un refus déposé la
    // veille doit encore désigner les mêmes cartes.
    const lendemain = construireFil({ ...entree, maintenant: new Date('2026-07-16T10:00:00') });

    expect(lendemain.map(c => c.cle)).toEqual(matin.map(c => c.cle));
  });

  it('toute carte du Fil porte une clé non vide, préfixée par son type', () => {
    const fil = construireFil({
      signalements: [{ id: 'SIG_9', idPatient: 'P-MICHEL', kind: 'demande_droit', soumisLe: new Date('2026-07-15T09:00:00') }],
      syntheses: [{ idSynthese: 'SYN_9', idPatient: 'P-JENNIFER', dateGeneration: new Date('2026-07-14T09:00:00') }],
      jalons: [{ idCheckin: 'CHK_9', idPatient: 'P-SOPHIE', soumisLe: new Date('2026-07-14T08:00:00') }],
      assignations: [
        { idAssignation: 'ASG_9', idPatient: 'P-MICHEL', titre: 'Mode de vie', dateLimite: '2026-07-01', statut: 'En attente' },
      ],
      activites: [{ idPatient: 'P-SOPHIE', derniereReponse: new Date('2025-08-01T08:00:00') }],
      noms: NOMS,
      maintenant: MAINTENANT,
    });

    expect(fil).toHaveLength(5);
    for (const carte of fil) {
      expect(carte.cle.startsWith(`${carte.type}:`)).toBe(true);
      expect(carte.cle.length).toBeGreaterThan(carte.type.length + 1);
    }
    expect(new Set(fil.map(c => c.cle)).size).toBe(fil.length);
  });

  it('la carte agrégée `reprise` garde sa clé tant que le patient reste inactif', () => {
    const activites = [{ idPatient: 'P-SOPHIE', derniereReponse: new Date('2025-09-01T08:00:00') }];
    const juillet = cartesReprise(activites, NOMS, MAINTENANT);
    const aout = cartesReprise(activites, NOMS, new Date('2026-08-15T10:00:00'));

    // Le « il y a N mois » change, la clé non : c'est la date de référence qui
    // l'ancre, pas l'ancienneté calculée.
    expect(aout[0].pourquoi).not.toBe(juillet[0].pourquoi);
    expect(aout[0].cle).toBe(juillet[0].cle);
  });
});

// ---------------------------------------------------------------------------
// M08 / D-150 — « ce dossier attend son T0 ».
//
// Production au 2026-09-08 : quatre épisodes T0, quatre patients, confirmés en
// moyenne 43 jours après leur `targetAt` (27 à 56 jours). La tolérance est de
// ±8 jours. AUCUN des quatre n'est dans la fenêtre.
// ---------------------------------------------------------------------------
describe('cartesT0AConfirmer', () => {
  const RIDEAU = ['Q_MOD_03', 'Q_MOD_01', 'Q_INF_03', 'Q_ALI_01'];
  const T0 = new Date('2026-06-01T09:00:00');

  function rideauComplet(idPatient: string, statutValidite: string | null = null) {
    return RIDEAU.map((idQuestionnaire, i) => ({
      idPatient,
      idQuestionnaire,
      dateReponse: new Date(T0.getTime() + i * 60_000),
      statutValidite,
    }));
  }

  it('rideau complet et aucun épisode T0 : une carte, datée de la première passation du dossier', () => {
    const cartes = cartesT0AConfirmer(
      rideauComplet('P-SOPHIE'),
      new Map([['P-SOPHIE', T0]]),
      new Set<string>(),
      4,
      NOMS,
      MAINTENANT,
    );
    expect(cartes).toHaveLength(1);
    expect(cartes[0].type).toBe('t0_a_confirmer');
    expect(cartes[0].patient).toBe('Sophie Nicola');
    expect(cartes[0].date).toBe(T0.toISOString());
  });

  // RÉÉCRIT PAR [[D-156]], ET NON AJUSTÉ. Ce banc figeait deux phrases devenues
  // fausses le jour où l'ancre initiale a cessé d'avoir une borne haute : le
  // « dépassement de la fenêtre » ne gouverne plus rien pour un T0, et les
  // réponses tardives ne sont plus « à réinclure une à une ». Le DÉLAI, lui,
  // reste le signal que [[D-150]] a mesuré — il est simplement dit pour ce
  // qu'il est.
  it('le délai d’attente est compté et dit, sans emprunter à la tolérance', () => {
    const cartes = cartesT0AConfirmer(
      rideauComplet('P-SOPHIE'), new Map([['P-SOPHIE', T0]]), new Set<string>(), 4, NOMS, MAINTENANT,
    );
    // 2026-06-01 -> 2026-07-15 = 44 jours depuis la première passation.
    expect(cartes[0].pourquoi).toContain('44 jours');
    expect(cartes[0].pourquoi).toContain('Toutes les réponses du dossier entreront');
    expect(cartes[0].pourquoi).not.toContain('réincluses');
    expect(cartes[0].pourquoi).not.toContain('tolérance');
  });

  it('un dossier récent obtient le même texte : la carte ne connaît plus de seuil', () => {
    const recent = new Date(MAINTENANT.getTime() - 2 * 24 * 60 * 60 * 1000);
    const cartes = cartesT0AConfirmer(
      rideauComplet('P-SOPHIE'), new Map([['P-SOPHIE', recent]]), new Set<string>(), 4, NOMS, MAINTENANT,
    );
    expect(cartes[0].pourquoi).toContain('2 jours');
    expect(cartes[0].pourquoi).not.toContain('dépassée');
  });

  it('un épisode T0 déjà consigné retire la carte', () => {
    const cartes = cartesT0AConfirmer(
      rideauComplet('P-SOPHIE'), new Map([['P-SOPHIE', T0]]), new Set(['P-SOPHIE']), 4, NOMS, MAINTENANT,
    );
    expect(cartes).toEqual([]);
  });

  it('un rideau incomplet n’appelle rien : la carte ne réclame pas ce qui manque encore', () => {
    const cartes = cartesT0AConfirmer(
      rideauComplet('P-SOPHIE').slice(0, 3), new Map([['P-SOPHIE', T0]]), new Set<string>(), 4, NOMS, MAINTENANT,
    );
    expect(cartes).toEqual([]);
  });

  // La carte ne dit jamais « confirmable » : les préconditions dures (anamnèse,
  // synthèse validée) s'évaluent par dossier et gardent leur propre écran.
  it('la carte appelle, elle ne promet pas que la confirmation aboutira', () => {
    const cartes = cartesT0AConfirmer(
      rideauComplet('P-SOPHIE'), new Map([['P-SOPHIE', T0]]), new Set<string>(), 4, NOMS, MAINTENANT,
    );
    expect(cartes[0].pourquoi).not.toMatch(/confirmable|vous pouvez confirmer/i);
    expect(cartes[0].actionLabel).toBe('Ouvrir la fiche');
  });

  it('le plus en retard passe devant', () => {
    const vieux = new Date('2026-05-01T09:00:00');
    const cartes = cartesT0AConfirmer(
      [...rideauComplet('P-SOPHIE'), ...rideauComplet('P-MICHEL')],
      new Map([['P-SOPHIE', T0], ['P-MICHEL', vieux]]),
      new Set<string>(),
      4,
      NOMS,
      MAINTENANT,
    );
    expect(cartes.map(c => c.idPatient)).toEqual(['P-MICHEL', 'P-SOPHIE']);
  });

  // Le filtre de validité est GATÉ : drapeau éteint, une passation INVALID
  // compte encore — `validite.ts` l'exige, le LOT-00 s'étant engagé à ne rien
  // faire disparaître tant que le drapeau ne l'autorise pas ([[D-146]]).
  it('drapeau allumé, une passation retirée ne complète plus le rideau', () => {
    process.env.WN_ENABLE_VALIDITE_PASSATIONS = '1';
    try {
      const passations = rideauComplet('P-SOPHIE');
      passations[0].statutValidite = 'INVALID';
      const cartes = cartesT0AConfirmer(
        passations, new Map([['P-SOPHIE', T0]]), new Set<string>(), 4, NOMS, MAINTENANT,
      );
      expect(cartes).toEqual([]);
    } finally {
      delete process.env.WN_ENABLE_VALIDITE_PASSATIONS;
    }
  });

  it('drapeau éteint, la même passation compte encore : rien ne disparaît sans le drapeau', () => {
    const passations = rideauComplet('P-SOPHIE');
    passations[0].statutValidite = 'INVALID';
    const cartes = cartesT0AConfirmer(
      passations, new Map([['P-SOPHIE', T0]]), new Set<string>(), 4, NOMS, MAINTENANT,
    );
    expect(cartes).toHaveLength(1);
  });
});
