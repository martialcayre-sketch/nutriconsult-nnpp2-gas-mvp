import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    assignation: { findUnique: vi.fn(), update: vi.fn() },
    questionnaireReponse: { findFirst: vi.fn(), create: vi.fn() },
    agendaAlimentaireJour: { findMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));

import {
  cloturerAgendaAli,
  pseudoItemAgendaAli,
  rawAnswersDepuisAgregats,
  PSEUDO_ITEM_NB_JOURS,
} from './cloture';
import { calculerAgregatsAli, type JourAgregable } from './agregats';

const ASS = {
  idAssignation: 'ASS_AGA',
  idPatient: 'PAT_1',
  emailPatient: 'p@example.test',
  idQuestionnaire: 'Q_ALI_09',
  titre: 'Agenda alimentaire — 21 jours',
  statut: 'Envoyé',
  statutReponses: 'non_rempli',
};

function jourRow(dateJour: string, over: Record<string, unknown> = {}) {
  return {
    id: `j_${dateJour}`,
    idPatient: ASS.idPatient,
    idAssignation: ASS.idAssignation,
    dateJour,
    reponses: {
      contractVersion: 'agenda-alimentaire-v1',
      prises: [
        { heure: '08:00', nature: 'repas' },
        { heure: '12:30', nature: 'repas' },
        { heure: '19:30', nature: 'repas' },
      ],
      premierePriseProteines: true,
      soirPlusCopieux: false,
      legumesDeuxPrises: true,
      fruitsOuOleagineux: true,
      ultraTransformes: false,
      ...over,
    },
    canal: 'portail',
    supersedesJourId: null,
    soumisLe: new Date(`${dateJour}T20:00:00.000Z`),
  };
}

// 2026-07-06 est un lundi : sept jours consécutifs couvrent un week-end entier,
// au-dessus de `MIN_JOURS_AGREGATS` — les agrégats se calculent.
const LUNDI = '2026-07-06';

function joursConsecutifs(n: number, depuis = LUNDI) {
  return Array.from({ length: n }, (_, i) => {
    const [a, m, j] = depuis.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j + i));
    const p = (x: number) => String(x).padStart(2, '0');
    return jourRow(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`);
  });
}

function mockTransaction(statutVerrou: string) {
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: vi.fn().mockResolvedValue([{ statutReponses: statutVerrou }]),
      assignation: { update: prisma.assignation.update },
      questionnaireReponse: {
        findFirst: prisma.questionnaireReponse.findFirst,
        create: prisma.questionnaireReponse.create,
      },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// La liste D-039, ÉCRITE À LA MAIN — jamais dérivée du module testé, sans quoi
// elle bougerait avec lui et ne prouverait rien. Un agrégat ajouté au domaine
// sans passer ici rougit ce banc : c'est le refus de la curation silencieuse,
// dans les deux sens (clé nouvelle non consignée, clé renommée en silence).
const PSEUDO_ITEMS_D039 = [
  'AGA_NB_JOURS',
  'AGA_NB_JOURS_WEEK_END',
  'AGA_NB_JOURS_SANS_PRISE',
  'AGA_NB_JOURS_AVEC_PRISES',
  'AGA_NB_JOURS_FENETRE_CONNUE',
  'AGA_NB_PAIRES_JEUNE',
  'AGA_NB_JOURS_PROTEINES_CONNU',
  'AGA_NB_JOURS_CONTENU_CONNU',
  'AGA_NB_JOURS_SOIR_CONNU',
  'AGA_JEUNE_MEDIAN',
  'AGA_FENETRE_ALI_MOYENNE',
  'AGA_REGULARITE_PREMIERE_ECART_TYPE',
  'AGA_REGULARITE_DERNIERE_ECART_TYPE',
  'AGA_NB_PRISES_MOYEN',
  'AGA_NB_REPAS_MOYEN',
  'AGA_NB_HORS_REPAS_MOYEN',
  'AGA_FREQ_HORS_REPAS_SEM',
  'AGA_FREQ_MOINS_DEUX_REPAS_SEM',
  'AGA_FREQ_PROTEINES_MATIN_SEM',
  'AGA_FREQ_LEGUMES_SEM',
  'AGA_FREQ_FRUITS_SEM',
  'AGA_FREQ_ULTRA_TRANSFORMES_SEM',
  'AGA_FREQ_SOIR_COPIEUX_SEM',
] as const;

describe('pseudoItemAgendaAli', () => {
  it('dérive le SNAKE_CASE majuscule préfixé, attendus écrits à la main', () => {
    expect(pseudoItemAgendaAli('nbJours')).toBe('AGA_NB_JOURS');
    expect(pseudoItemAgendaAli('jeuneMedian')).toBe('AGA_JEUNE_MEDIAN');
    expect(pseudoItemAgendaAli('freqProteinesMatinSem')).toBe('AGA_FREQ_PROTEINES_MATIN_SEM');
    expect(pseudoItemAgendaAli('regularitePremiereEcartType')).toBe('AGA_REGULARITE_PREMIERE_ECART_TYPE');
  });

  it('le compteur de repli porte le même nom que l’agrégat nbJours — les deux chemins écrivent la même clé', () => {
    expect(PSEUDO_ITEM_NB_JOURS).toBe(pseudoItemAgendaAli('nbJours'));
  });
});

describe('rawAnswersDepuisAgregats — la totalité D-039, rien de moins, rien de plus', () => {
  it('transmet exactement la liste consignée, en bijection avec les agrégats calculés', () => {
    // Le littéral de fixture élargit `nature` en string — la forme est bien
    // celle de `JourAgregable`, le cast ne fait que le dire au compilateur.
    const agregats = calculerAgregatsAli(joursConsecutifs(7) as unknown as JourAgregable[]);
    expect(agregats).not.toBeNull();
    const raw = rawAnswersDepuisAgregats(agregats, 7);
    expect(Object.keys(raw).sort()).toEqual([...PSEUDO_ITEMS_D039].sort());
    // Et chaque valeur est celle du domaine, pas une copie retravaillée.
    expect(raw.AGA_NB_JOURS).toBe(agregats!.nbJours);
    expect(raw.AGA_JEUNE_MEDIAN).toBe(agregats!.jeuneMedian);
  });

  it('sous le seuil de couverture, transmet au moins le compte de journées — jamais un zéro fabriqué', () => {
    const raw = rawAnswersDepuisAgregats(null, 3);
    expect(raw).toEqual({ AGA_NB_JOURS: 3 });
  });

  it('une métrique non couverte reste null jusque dans rawAnswers', () => {
    // Journées sans aucune prise : les grandeurs horaires n'ont pas de
    // dénominateur — null, pas 0 (un 0 dirait « fenêtre nulle », pas « inconnu »).
    const jours = joursConsecutifs(7).map((j) => ({
      ...j,
      reponses: {
        contractVersion: 'agenda-alimentaire-v1',
        aucunePrise: true,
        legumesDeuxPrises: null,
        fruitsOuOleagineux: null,
        ultraTransformes: null,
      },
    }));
    const agregats = calculerAgregatsAli(jours as never);
    expect(agregats).not.toBeNull();
    const raw = rawAnswersDepuisAgregats(agregats, 7);
    expect(raw.AGA_JEUNE_MEDIAN).toBeNull();
    expect(raw.AGA_FENETRE_ALI_MOYENNE).toBeNull();
  });
});

describe('cloturerAgendaAli', () => {
  it('refuse une assignation annulée, sans rien créer', async () => {
    prisma.assignation.findUnique.mockResolvedValue({ ...ASS, statut: 'Annulée' });
    await expect(cloturerAgendaAli({ idAssignation: 'ASS_AGA' })).rejects.toThrow(/annulé/);
    expect(prisma.questionnaireReponse.create).not.toHaveBeenCalled();
  });

  it('refuse une assignation qui n’est pas un agenda alimentaire', async () => {
    prisma.assignation.findUnique.mockResolvedValue({ ...ASS, idQuestionnaire: 'Q_SOM_09' });
    await expect(cloturerAgendaAli({ idAssignation: 'ASS_AGA' })).rejects.toThrow(/pas un agenda alimentaire/);
  });

  it('refuse de clôturer par-dessus des lignes en quarantaine, en les nommant', async () => {
    const jours = joursConsecutifs(7);
    // Une ligne au contrat inconnu part en quarantaine à la lecture.
    jours.push(jourRow('2026-07-13', { contractVersion: 'contrat-inconnu' }));
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue(jours);
    await expect(cloturerAgendaAli({ idAssignation: 'ASS_AGA' })).rejects.toThrow(/quarantaine[\s\S]*2026-07-13/);
    expect(prisma.questionnaireReponse.create).not.toHaveBeenCalled();
  });

  it('refuse un recueil vide', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([]);
    await expect(cloturerAgendaAli({ idAssignation: 'ASS_AGA' })).rejects.toThrow(/Aucune journée/);
  });

  // [[D-152]] — le jumeau sommeil porte la même règle : la passation date de la
  // période observée, pas du geste. Le banc la tient aux DEUX endroits, sinon
  // l'un des deux agendas dériverait sans que rien ne rougisse.
  it('la passation est datée du DERNIER jour mesuré, pas de la clôture', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue(joursConsecutifs(7));
    mockTransaction('non_rempli');

    await cloturerAgendaAli({ idAssignation: 'ASS_AGA' });

    // 7 jours depuis le lundi 2026-07-06 → dernier jour le 2026-07-12.
    const data = prisma.questionnaireReponse.create.mock.calls[0][0].data;
    expect((data.dateReponse as Date).toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('crée une réponse standard NON scorée et verrouille l’assignation (7 jours)', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue(joursConsecutifs(7));
    mockTransaction('non_rempli');

    const res = await cloturerAgendaAli({ idAssignation: 'ASS_AGA' });

    expect(res.dejaCloture).toBe(false);
    expect(res.nbJours).toBe(7);
    expect(prisma.questionnaireReponse.create).toHaveBeenCalledTimes(1);
    const data = prisma.questionnaireReponse.create.mock.calls[0][0].data;
    expect(data.idQuestionnaire).toBe('Q_ALI_09');
    // Transmettre n'est pas coter (D-039) : type journal, scored:false, aucun
    // score principal, aucune interprétation fabriquée.
    expect(data.scoresJson.type).toBe('journal');
    expect(data.scoresJson.scored).toBe(false);
    expect(data.scorePrincipal).toBeNull();
    expect(data.interpretation).toBeNull();
    expect(Object.keys(data.scoresJson.rawAnswers).sort()).toEqual([...PSEUDO_ITEMS_D039].sort());
    expect(data.scoresJson.rawAnswers.AGA_NB_JOURS).toBe(7);
    expect(prisma.assignation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statutReponses: 'verrouille' }) }),
    );
  });

  it('sous le seuil d’agrégation, transmet le compte seul — réponse toujours non scorée', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue(joursConsecutifs(3));
    mockTransaction('non_rempli');

    const res = await cloturerAgendaAli({ idAssignation: 'ASS_AGA' });

    expect(res.nbJours).toBe(3);
    const data = prisma.questionnaireReponse.create.mock.calls[0][0].data;
    expect(data.scoresJson.rawAnswers).toEqual({ AGA_NB_JOURS: 3 });
    expect(data.scoresJson.scored).toBe(false);
  });

  it('ne compte qu’une fois une journée corrigée (chaîne supersedesJourId)', async () => {
    const jours = joursConsecutifs(7);
    const correction = { ...jourRow(LUNDI), id: 'j_corr', supersedesJourId: `j_${LUNDI}`, soumisLe: new Date(`${LUNDI}T22:00:00.000Z`) };
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([...jours, correction]);
    mockTransaction('non_rempli');

    const res = await cloturerAgendaAli({ idAssignation: 'ASS_AGA' });
    expect(res.nbJours).toBe(7);
  });

  it('est idempotente : déjà verrouillée, renvoie la réponse existante sans en créer', async () => {
    prisma.assignation.findUnique.mockResolvedValue({ ...ASS, statutReponses: 'verrouille' });
    prisma.questionnaireReponse.findFirst.mockResolvedValue({
      idReponse: 'REP_EXISTANTE',
      scoresJson: { rawAnswers: { AGA_NB_JOURS: 7 } },
    });

    const res = await cloturerAgendaAli({ idAssignation: 'ASS_AGA' });

    expect(res).toEqual({ idReponse: 'REP_EXISTANTE', titre: ASS.titre, nbJours: 7, dejaCloture: true });
    expect(prisma.questionnaireReponse.create).not.toHaveBeenCalled();
  });

  it('sous verrou concurrent, retombe sur la réponse déjà produite (aucun doublon)', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue(joursConsecutifs(7));
    mockTransaction('verrouille');
    prisma.questionnaireReponse.findFirst.mockResolvedValue({ idReponse: 'REP_CONCURRENTE' });

    const res = await cloturerAgendaAli({ idAssignation: 'ASS_AGA' });

    expect(res.dejaCloture).toBe(true);
    expect(res.idReponse).toBe('REP_CONCURRENTE');
    expect(prisma.questionnaireReponse.create).not.toHaveBeenCalled();
  });
});
