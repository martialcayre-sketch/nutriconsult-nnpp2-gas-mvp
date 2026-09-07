import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    assignation: { create: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/ids', () => ({ createPublicId: (prefix: string) => `${prefix}_TEST_12345678` }));

import { AGENDA_ALI_ID } from '@/lib/agenda-alimentaire/types';
import { AGENDA_SOMMEIL_ID } from '@/lib/agenda-sommeil/types';
import {
  assignPackToPatient,
  DELAI_PACK_BASE_JOURS,
  echeancePackBase,
  qidsConsultation,
  qidsSuspendus,
  QIDS_SANS_DATE_LIMITE,
} from './assignBasePack';

// Ce chemin est le plus sensible des trois points d'assignation : il part de
// l'onboarding portail (`api/portail/valider`), donc sans clic praticien sur le
// questionnaire lui-même. Un pack enregistré en base peut contenir un qid
// depuis suspendu — rien ne l'en retire — d'où le filtre à la création.
describe('assignPackToPatient — instruments suspendus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.assignation.create.mockResolvedValue({});
    // Dédup : aucune assignation ouverte par défaut ; la transaction
    // interactive passe le client mocké lui-même comme tx.
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
  });

  async function assigner(qids: string[]) {
    return assignPackToPatient({
      idPatientBusiness: 'PAT_TEST',
      emailPatient: 'sophie.nicola@example.test',
      qids,
      packNom: 'Pack test',
    });
  }

  it('crée les assignations des instruments actifs', async () => {
    const { cree } = await assigner(['Q_NEU_03']);
    expect(cree).toHaveLength(1);
    expect(prisma.assignation.create).toHaveBeenCalledOnce();
  });

  // L'instrument témoin était `Q_SOM_07` jusqu'au 2026-07-31 ; il a été
  // reconstruit depuis sa source et rouvert, donc il ne témoigne plus de rien
  // ici. `Q_FIB_03` (ELFE) le remplace : suspendu depuis toujours, et le seul
  // dont l'arbitrage du 2026-07-31 a explicitement décidé qu'il le RESTE — son
  // usage ne coûte rien à personne, sa reconstruction ne servirait aujourd'hui
  // aucun usage.
  it('écarte un instrument suspendu sans faire échouer le reste du pack', async () => {
    const { cree } = await assigner(['Q_NEU_03', 'Q_FIB_03']);
    expect(cree).toHaveLength(1);
    expect(prisma.assignation.create).toHaveBeenCalledOnce();
    const arg = prisma.assignation.create.mock.calls[0][0] as { data: { idQuestionnaire: string } };
    expect(arg.data.idQuestionnaire).toBe('Q_NEU_03');
  });

  // `qidsSuspendus` est ce que la route journalise : sans elle, l'amputation du
  // pack de base serait invisible — ce chemin n'a aucun praticien pour lire un
  // écart de comptage. La fonction est ici, la trace dans `api/portail/valider`.
  it('expose les qids écartés, pour que l’appelant puisse les tracer', () => {
    expect(qidsSuspendus(['Q_NEU_03', 'Q_FIB_03'])).toEqual(['Q_FIB_03']);
    expect(qidsSuspendus(['Q_NEU_03'])).toEqual([]);
  });

  // La ceinture « consultation » ([[D-066]], revue MIN-3) : le pack de base est
  // l'envoi de routine par excellence — un MMSE ACTIF entré dans sa composition
  // ne doit jamais partir à l'onboarding, et l'écartement doit être traçable.
  it('écarte un instrument de consultation ACTIF sans faire échouer le reste du pack', async () => {
    const { cree } = await assigner(['Q_NEU_03', 'Q_GEO_04']);
    expect(cree).toHaveLength(1);
    expect(prisma.assignation.create).toHaveBeenCalledOnce();
    const arg = prisma.assignation.create.mock.calls[0][0] as { data: { idQuestionnaire: string } };
    expect(arg.data.idQuestionnaire).toBe('Q_NEU_03');
    // Et l'appelant peut le tracer — le pendant de `qidsSuspendus`.
    expect(qidsConsultation(['Q_NEU_03', 'Q_GEO_04'])).toEqual(['Q_GEO_04']);
  });

  // Idempotence onboarding : un qid déjà porté par une assignation ouverte est
  // ignoré — une revalidation ne double pas le pack de base.
  it('écarte un questionnaire déjà assigné (ouvert) et le REND à l’appelant', async () => {
    prisma.assignation.findMany.mockResolvedValue([{ idQuestionnaire: 'Q_NEU_03' }]);
    const { cree, dejaOuverts } = await assigner(['Q_NEU_03', 'Q_SOM_06']);
    expect(cree).toHaveLength(1);
    expect(dejaOuverts).toEqual(['Q_NEU_03']);
    expect(prisma.assignation.create).toHaveBeenCalledOnce();
    const arg = prisma.assignation.create.mock.calls[0][0] as { data: { idQuestionnaire: string } };
    expect(arg.data.idQuestionnaire).toBe('Q_SOM_06');
  });

  it('la dédup exclut les statuts terminaux — repassation possible, statut inconnu bloquant', async () => {
    await assigner(['Q_NEU_03']);
    const whereDedup = prisma.assignation.findMany.mock.calls[0][0] as {
      where: { statut: { notIn: string[] } };
    };
    expect(whereDedup.where.statut.notIn).toEqual(['Complété', 'Annulée']);
  });

  it('n’écrit rien si le pack ne contient que des instruments suspendus', async () => {
    const { cree } = await assigner(['Q_FIB_03']);
    expect(cree).toHaveLength(0);
    expect(prisma.assignation.create).not.toHaveBeenCalled();
  });

  it('un pack vide ne prend ni transaction ni verrou', async () => {
    const { cree, dejaOuverts } = await assigner([]);
    expect(cree).toHaveLength(0);
    expect(dejaOuverts).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('echeancePackBase', () => {
  it('rend la date du cabinet plus le délai, un jour ordinaire', () => {
    expect(echeancePackBase(new Date('2026-09-07T10:00:00.000Z'))).toBe('2026-10-07');
  });

  it('ancre sur le JOUR DE PARIS, pas sur la date UTC', () => {
    // 22 h 30 UTC = 00 h 30 le lendemain à Paris. Le raccourci
    // `now.toISOString().slice(0, 10)` daterait l'échéance de la veille : une
    // validation faite en fin de soirée perdrait un jour.
    expect(echeancePackBase(new Date('2026-09-07T22:30:00.000Z'))).toBe('2026-10-08');
  });

  it('ne perd pas un jour quand la fenêtre franchit le changement d’heure', () => {
    // Du 21 octobre au 20 novembre : l'heure d'hiver tombe entre les deux.
    // `now.getTime() + N * 86_400_000` rendrait le 19.
    expect(echeancePackBase(new Date('2026-10-20T22:30:00.000Z'))).toBe('2026-11-20');
  });

  it('porte le délai de la fenêtre « nouveaux patients »', () => {
    // VALEUR NON INVENTÉE, ET NON PARTAGEABLE : c'est `FENETRE_JOURS` de
    // `api/praticien/nouveaux-patients`, que Next.js interdit d'exporter depuis
    // un `route.ts`. Les deux constantes doivent bouger ensemble, à la main ;
    // cette assertion est la seule chose qui rattrape leur désynchronisation.
    expect(DELAI_PACK_BASE_JOURS).toBe(30);
  });
});

describe('assignPackToPatient — les agendas ne reçoivent jamais d’échéance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.assignation.create.mockResolvedValue({});
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
  });

  async function assignerAvecEcheance(qids: string[]) {
    return assignPackToPatient({
      idPatientBusiness: 'PAT_TEST',
      emailPatient: 'sophie.nicola@example.test',
      qids,
      packNom: 'Pack test',
      options: { dateLimite: '2026-10-07' },
    });
  }

  /** Retrouve une création par son instrument — jamais par son rang. */
  function creation(idQuestionnaire: string) {
    const appels = prisma.assignation.create.mock.calls as Array<
      [{ data: { idQuestionnaire: string; dateLimite: string | null } }]
    >;
    return appels.find(c => c[0].data.idQuestionnaire === idQuestionnaire)?.[0].data;
  }

  it('un questionnaire ordinaire reçoit l’échéance du pack', async () => {
    await assignerAvecEcheance(['Q_NEU_03']);
    expect(creation('Q_NEU_03')?.dateLimite).toBe('2026-10-07');
  });

  it('l’agenda du sommeil ne la reçoit pas, dans le même pack', async () => {
    // Sa fenêtre de 21 nuits est ancrée sur la PREMIÈRE SAISIE, pas sur
    // l'assignation : une échéance de pack ne la borne pas, elle la tronque.
    // Et `isDeadlineExpired` fermerait AUSSI la relance praticien — le seul
    // geste de rattrapage.
    await assignerAvecEcheance(['Q_NEU_03', 'Q_SOM_09']);
    expect(creation('Q_NEU_03')?.dateLimite).toBe('2026-10-07');
    expect(creation('Q_SOM_09')?.dateLimite).toBeNull();
  });

  it('l’agenda alimentaire est exempté lui aussi, drapeau ou pas', () => {
    // PAS PAR LE CHEMIN D'ASSIGNATION, ET C'EST LA RAISON DE L'EXPORT.
    // `Q_ALI_09` est dans `IDS_SUSPENDUS` tant que son drapeau est éteint : il
    // n'est jamais créé, donc aucun banc passant par `assignPackToPatient` ne
    // peut rougir si on le retire du Set. L'assertion porte sur l'appartenance,
    // seule chose qui tienne avant l'allumage — et qui vaudra encore après.
    expect(QIDS_SANS_DATE_LIMITE.has(AGENDA_ALI_ID)).toBe(true);
    expect(QIDS_SANS_DATE_LIMITE.has(AGENDA_SOMMEIL_ID)).toBe(true);
  });
});
