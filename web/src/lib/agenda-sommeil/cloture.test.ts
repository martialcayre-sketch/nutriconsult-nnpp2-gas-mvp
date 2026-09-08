import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    assignation: { findUnique: vi.fn(), update: vi.fn() },
    questionnaireReponse: { findFirst: vi.fn(), create: vi.fn() },
    agendaSommeilNuit: { findMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { cloturerAgenda } from './cloture';

const ASS = {
  idAssignation: 'ASS_AGD',
  idPatient: 'PAT_1',
  emailPatient: 'p@example.test',
  idQuestionnaire: 'Q_SOM_09',
  titre: 'Agenda du sommeil — 21 nuits',
  statutReponses: 'non_rempli',
};

function nuitRow(dateNuit: string, over: Record<string, unknown> = {}) {
  return {
    id: `n_${dateNuit}`,
    idPatient: ASS.idPatient,
    idAssignation: ASS.idAssignation,
    dateNuit,
    reponses: {
      contractVersion: 'agenda-sommeil-v2',
      heureCoucher: '23:00',
      heureLever: '07:00',
      latence: 'lt15',
      qualite: 4,
      reveils: { dureeTotale: 'aucun' },
      aideSommeil: 'aucune',
      extinctionImmediate: true,
      leverImmediat: true,
      ...over,
    },
    canal: 'portail',
    supersedesNuitId: null,
    soumisLe: new Date(`${dateNuit}T07:00:00.000Z`),
  };
}

// 2026-07-06 est un lundi : quatorze nuits consécutives couvrent donc quatre
// matins de week-end, condition de l'indice composite (cf. `couvertureSuffisante`).
const LUNDI = '2026-07-06';

function nuitsConsecutives(n: number, depuis = LUNDI) {
  return Array.from({ length: n }, (_, i) => {
    const [a, m, j] = depuis.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j + i));
    const p = (x: number) => String(x).padStart(2, '0');
    return nuitRow(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`);
  });
}

// $transaction exécute le callback avec un tx dont le verrou de ligne
// (SELECT … FOR UPDATE, via $queryRaw) reflète le statut courant de
// l'assignation — c'est ce verrou qui sérialise les clôtures concurrentes.
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

describe('cloturerAgenda', () => {
  it('refuse de clôturer une assignation annulée (Fil A), sans rien créer', async () => {
    // La clôture est le chemin UNIQUE de production des agrégats (patient comme
    // praticien) : un agenda annulé ne doit pas y fabriquer de QuestionnaireReponse
    // ni repasser `statut` à 'Complété', ce qui écraserait l'annulation.
    prisma.assignation.findUnique.mockResolvedValue({ ...ASS, statut: 'Annulée' });
    await expect(cloturerAgenda({ idAssignation: 'ASS_AGD' })).rejects.toThrow(/annulé/);
    expect(prisma.questionnaireReponse.create).not.toHaveBeenCalled();
  });

  it('crée une réponse scorée et verrouille l’assignation (14 nuits, week-end couvert)', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaSommeilNuit.findMany.mockResolvedValue(nuitsConsecutives(14));
    mockTransaction('non_rempli');

    const res = await cloturerAgenda({ idAssignation: 'ASS_AGD' });

    expect(res.dejaCloture).toBe(false);
    expect(res.nbNuits).toBe(14);
    expect(prisma.questionnaireReponse.create).toHaveBeenCalledTimes(1);
    const data = prisma.questionnaireReponse.create.mock.calls[0][0].data;
    expect(data.idQuestionnaire).toBe('Q_SOM_09');
    expect(data.scoresJson.rawAnswers.AGD_NB_NUITS).toBe(14);
    expect(data.scoresJson.rawAnswers.AGD_NB_NUITS_WE).toBe(4);
    expect(typeof data.scoresJson.total).toBe('number');
    expect(typeof data.scorePrincipal).toBe('number');
    expect(prisma.assignation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statutReponses: 'verrouille' }) }),
    );
  });

  // [[D-152]] — la passation vaut pour la PÉRIODE OBSERVÉE, pas pour le geste.
  // Mesuré en production le 2026-09-08 : une nuit unique du 29 juillet portait
  // la date du 29 août, soit 31 jours d'écart pour une tolérance de jalon de 8.
  it('la passation est datée de la DERNIÈRE nuit mesurée, pas de la clôture', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaSommeilNuit.findMany.mockResolvedValue(nuitsConsecutives(14));
    mockTransaction('non_rempli');

    await cloturerAgenda({ idAssignation: 'ASS_AGD' });

    // 14 nuits depuis le lundi 2026-07-06 → dernière nuit le 2026-07-19.
    const data = prisma.questionnaireReponse.create.mock.calls[0][0].data;
    expect((data.dateReponse as Date).toISOString()).toBe('2026-07-19T00:00:00.000Z');
    // Le geste de clôture, lui, date bien du présent : il verrouille
    // l'assignation, il ne date pas la mesure.
    const maj = prisma.assignation.update.mock.calls[0][0].data;
    expect((maj.dateDerniereModification as Date).getTime())
      .toBeGreaterThan(new Date('2026-07-19T00:00:00.000Z').getTime());
  });

  it('produit une réponse non scorée sous le seuil d’agrégation (scored:false, jamais un 0)', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaSommeilNuit.findMany.mockResolvedValue(nuitsConsecutives(2));
    mockTransaction('non_rempli');

    await cloturerAgenda({ idAssignation: 'ASS_AGD' });

    const data = prisma.questionnaireReponse.create.mock.calls[0][0].data;
    expect(data.scoresJson.scored).toBe(false);
    expect(data.scoresJson.rawAnswers.AGD_NB_NUITS).toBe(2);
    expect(data.scorePrincipal).toBeNull();
  });

  it('agrège sans produire d’indice quand la couverture week-end manque', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    // Quatorze nuits, mais aucune de week-end : les moyennes existent, l'indice
    // non — la régularité serait excellente et fausse.
    const ouvrables: ReturnType<typeof nuitRow>[] = [];
    for (let i = 0; ouvrables.length < 14; i += 1) {
      const [a, m, j] = LUNDI.split('-').map(Number);
      const d = new Date(Date.UTC(a, m - 1, j + i));
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      const p = (x: number) => String(x).padStart(2, '0');
      ouvrables.push(nuitRow(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`));
    }
    prisma.agendaSommeilNuit.findMany.mockResolvedValue(ouvrables);
    mockTransaction('non_rempli');

    await cloturerAgenda({ idAssignation: 'ASS_AGD' });

    const data = prisma.questionnaireReponse.create.mock.calls[0][0].data;
    expect(data.scoresJson.rawAnswers.AGD_NB_NUITS).toBe(14);
    expect(data.scoresJson.rawAnswers.AGD_TST_MOY).toBe(472); // agrégats produits
    expect(data.scoresJson.scored).toBe(false); // mais pas d'indice global
    expect(data.scorePrincipal).toBeNull();
  });

  it('est idempotente : un agenda déjà clôturé renvoie la réponse existante sans en créer', async () => {
    prisma.assignation.findUnique.mockResolvedValue({ ...ASS, statutReponses: 'verrouille' });
    prisma.questionnaireReponse.findFirst.mockResolvedValue({
      idReponse: 'REP_EXIST',
      scoresJson: { rawAnswers: { AGD_NB_NUITS: 7 } },
    });

    const res = await cloturerAgenda({ idAssignation: 'ASS_AGD' });

    expect(res.dejaCloture).toBe(true);
    expect(res.idReponse).toBe('REP_EXIST');
    expect(res.nbNuits).toBe(7);
    expect(prisma.questionnaireReponse.create).not.toHaveBeenCalled();
  });

  it('course concurrente : si une autre clôture a verrouillé pendant le calcul, ne crée pas de doublon', async () => {
    // L'assignation était non verrouillée au démarrage (chemin idempotent initial
    // non pris), mais une clôture concurrente a commité entre-temps : le verrou
    // de ligne (FOR UPDATE) lit alors 'verrouille' DANS la transaction → on
    // renvoie la réponse gagnante, sans créer de seconde QuestionnaireReponse.
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaSommeilNuit.findMany.mockResolvedValue([
      nuitRow('2026-07-10'),
      nuitRow('2026-07-11'),
      nuitRow('2026-07-12'),
      nuitRow('2026-07-13'),
      nuitRow('2026-07-14'),
    ]);
    mockTransaction('verrouille');
    prisma.questionnaireReponse.findFirst.mockResolvedValue({ idReponse: 'REP_GAGNANT' });

    const res = await cloturerAgenda({ idAssignation: 'ASS_AGD' });

    expect(res.dejaCloture).toBe(true);
    expect(res.idReponse).toBe('REP_GAGNANT');
    expect(prisma.questionnaireReponse.create).not.toHaveBeenCalled();
    expect(prisma.assignation.update).not.toHaveBeenCalled();
  });

  it('refuse une assignation qui n’est pas un agenda', async () => {
    prisma.assignation.findUnique.mockResolvedValue({ ...ASS, idQuestionnaire: 'Q_SOM_01' });
    await expect(cloturerAgenda({ idAssignation: 'ASS_AGD' })).rejects.toThrow(TypeError);
  });

  it('refuse de clôturer un agenda sans aucune nuit', async () => {
    prisma.assignation.findUnique.mockResolvedValue(ASS);
    prisma.agendaSommeilNuit.findMany.mockResolvedValue([]);
    await expect(cloturerAgenda({ idAssignation: 'ASS_AGD' })).rejects.toThrow(/aucune nuit/i);
  });
});
