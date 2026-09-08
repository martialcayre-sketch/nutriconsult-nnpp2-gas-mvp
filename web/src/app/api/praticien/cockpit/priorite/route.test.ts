import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn() },
    questionnaireReponse: { findMany: vi.fn() },
    consultation: { findFirst: vi.fn() },
    syntheseIA: { findFirst: vi.fn() },
    // Second rideau ([[D-157]]) : assignations du dossier, et ancre déjà
    // posée s'il y en a une (la borne haute de ce rideau).
    assignation: { findMany: vi.fn() },
    decisionPrioritySelection: { findMany: vi.fn(), create: vi.fn() },
    journalAccesDossier: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { SECOND_RIDEAU_RENDU_FIXTURE, SYNTHESE_VALIDEE_FIXTURE } from '@/lib/clinical-engine/dossierT0Fixture';
import {
  ANAMNESE_C1_FIXTURE,
  CANDIDAT_RANG_1,
  CANDIDAT_RANG_2,
  chaineC1DeReference,
  ligneSelectionDeFixture,
  passationsC1Fixture,
  retablirTablePriorites,
  signerTablePriorites,
} from '@/lib/clinical-engine/chaineC1Fixture';
import { POST } from './route';

// UNE CHAÎNE C1 RÉELLE, jamais une carte forgée ([[D-054]] arbitrage 5) : cette
// route appelle `refusChaineC1`, et une fixture inventée y rendrait 409 pour la
// mauvaise raison.
//
// LA CARTE SOUMISE EST CELLE D'UN DOSSIER SANS SÉLECTION (`selection: null`) —
// c'est l'état dans lequel un praticien vient CHOISIR. Le recalcul serveur relit
// la base, qui est vide par défaut : les deux se recoupent.
signerTablePriorites();
const reference = chaineC1DeReference({ selection: null });
const referenceAvecSelection = chaineC1DeReference({ selection: CANDIDAT_RANG_1 });
retablirTablePriorites();

const episode = reference.episode;
const decisionCard = reference.decisionCard;

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/praticien/cockpit/priorite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function corps(over: Record<string, unknown> = {}) {
  return {
    episode,
    decisionCard,
    candidateId: CANDIDAT_RANG_1,
    rationale: 'Plainte dominante pondérale, patient demandeur.',
    ...over,
  };
}

describe('POST /api/praticien/cockpit/priorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'praticien@wellneuro.fr' });
    prisma.questionnaireReponse.findMany.mockResolvedValue(passationsC1Fixture());
    prisma.consultation.findFirst.mockResolvedValue(ANAMNESE_C1_FIXTURE);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.assignation.findMany.mockResolvedValue(SECOND_RIDEAU_RENDU_FIXTURE);
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    prisma.decisionPrioritySelection.create.mockResolvedValue({
      id: 'SEL_1',
      supersedesSelectionId: null,
    });
    signerTablePriorites();
  });

  afterEach(() => {
    retablirTablePriorites();
  });

  it('refuse un praticien non authentifié (401) sans rien écrire', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(401);
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });

  it('refuse un patient d’un autre praticien (403) avant de lire le dossier', async () => {
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'autre@wellneuro.fr' });
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(403);
    expect(prisma.questionnaireReponse.findMany).not.toHaveBeenCalled();
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });

  // LE MOTIF EST LA DÉCISION, pas une note facultative : c'est ce que la version
  // de protocole citera. Les blancs seuls ne comptent pas — un motif fait
  // d'espaces se relit exactement comme un motif absent.
  it('refuse une sélection sans motif écrit, blancs compris (422)', async () => {
    for (const rationale of ['', '   ', '\t\n']) {
      const res = await POST(postRequest(corps({ rationale })));
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ reason: 'motif_requis' });
    }
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });

  it('refuse un motif au-delà de 2 000 caractères (422)', async () => {
    const res = await POST(postRequest(corps({ rationale: 'x'.repeat(2001) })));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'motif_trop_long' });
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });

  it('refuse un candidat qui ne figure pas parmi les candidates (422)', async () => {
    const res = await POST(postRequest(corps({ candidateId: 'priority:INVENTEE' })));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'candidat_inconnu' });
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });

  // TEST D'INTRUSION — la carte vient du navigateur, et une carte que le serveur
  // ne sait pas reproduire ne fait pas écrire.
  it('refuse une carte qui ne se recoupe pas avec le dossier (409)', async () => {
    const forgee = { ...decisionCard, limitations: ['Limitation inventée après coup.'] };
    const res = await POST(postRequest(corps({ decisionCard: forgee })));
    expect(res.status).toBe(409);
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });

  // LA GARDE QUI DIT « L'ÉCRAN TRAVAILLAIT SUR UN ÉTAT PÉRIMÉ ». Le praticien
  // soumet la carte SANS sélection qu'il a chargée, alors qu'une sélection a été
  // posée entre-temps : le recalcul relit la base et diverge. Sans le
  // déplacement de `D-127` §1bis, ce cas passait — le recalcul repartait de la
  // valeur soumise, donc de « aucune sélection ».
  it('refuse une carte chargée avant qu’une autre sélection soit posée (409)', async () => {
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([
      ligneSelectionDeFixture(CANDIDAT_RANG_1),
    ]);
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(409);
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });

  it('consigne la sélection : auteur et horodatage posés côté serveur', async () => {
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, selectionId: 'SEL_1' });

    const data = prisma.decisionPrioritySelection.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      idPatient: episode.patientId,
      decisionCardId: decisionCard.decisionCardId,
      decisionCardInputHash: decisionCard.inputHash,
      candidateId: CANDIDAT_RANG_1,
      rationale: 'Plainte dominante pondérale, patient demandeur.',
      selectedByEmail: 'praticien@wellneuro.fr',
      supersedesSelectionId: null,
    });
    // L'HORODATAGE N'EST PAS FOURNI : il reste le défaut de la base. Un client
    // qui daterait son propre acte pourrait l'antidater.
    expect(data.selectedAt).toBeUndefined();
    expect(data.selectedBy).toBeUndefined();
  });

  it('coupe les blancs autour du motif sans altérer le texte', async () => {
    await POST(postRequest(corps({ rationale: '  Sommeil d’abord.  ' })));
    expect(prisma.decisionPrioritySelection.create.mock.calls[0][0].data.rationale)
      .toBe('Sommeil d’abord.');
  });

  // CHANGER D'AVIS CHAÎNE, ne rature pas. La carte soumise porte alors la
  // sélection courante — c'est ce que le cockpit sert — et la base la porte
  // aussi : les deux se recoupent, et la nouvelle ligne pointe la précédente.
  it('chaîne une correction sur la sélection courante', async () => {
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([
      ligneSelectionDeFixture(CANDIDAT_RANG_1, 'SEL_ORIGINE'),
    ]);
    prisma.decisionPrioritySelection.create.mockResolvedValue({
      id: 'SEL_2',
      supersedesSelectionId: 'SEL_ORIGINE',
    });
    const res = await POST(postRequest(corps({
      decisionCard: referenceAvecSelection.decisionCard,
      episode: referenceAvecSelection.episode,
      candidateId: CANDIDAT_RANG_2,
      rationale: 'Le sommeil prime après relecture du J7.',
    })));
    expect(res.status).toBe(200);
    expect(prisma.decisionPrioritySelection.create.mock.calls[0][0].data.supersedesSelectionId)
      .toBe('SEL_ORIGINE');
  });

  // LA COURSE. Deux praticiens choisissent en même temps : la base refuse la
  // fourche (`D-127` §3bis) et la route traduit le `P2002` en « relisez », pas
  // en erreur serveur — refuser plutôt qu'élire, et le DIRE.
  it('traduit la course en 409 lisible plutôt qu’en 500', async () => {
    prisma.decisionPrioritySelection.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'selection_stale' });
  });

  it('refuse d’écrire à la suite d’un fil sans tête lisible (409)', async () => {
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([
      { ...ligneSelectionDeFixture(CANDIDAT_RANG_1, 'A'), supersedesSelectionId: 'B' },
      { ...ligneSelectionDeFixture(CANDIDAT_RANG_1, 'B'), supersedesSelectionId: 'A' },
    ]);
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'fil_illisible' });
    expect(prisma.decisionPrioritySelection.create).not.toHaveBeenCalled();
  });
});
