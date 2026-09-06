import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn() },
    ciqualNutrientValue: { findMany: vi.fn() },
    // Préconditions de confirmation T0 (D-052) : lues APRÈS la garde
    // d'appartenance, avant toute écriture.
    questionnaireReponse: { findMany: vi.fn() },
    consultation: { findFirst: vi.fn() },
    syntheseIA: { findFirst: vi.fn() },
    assessmentEpisode: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    protocolDraft: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    arbitrageBiologique: { findMany: vi.fn() },
    // Sélection praticien d'une priorité (`D-127`) : relue par le recalcul
    // serveur, qui ne réinjecte plus la valeur soumise.
    decisionPrioritySelection: { findMany: vi.fn() },
    journalAccesDossier: { create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { buildProtocolDraft } from '@/lib/clinical-engine/protocolDraft';
import type { ProtocolAction } from '@/lib/clinical-engine/types';
import { deriveProtocolDraftId, deriveVersionId } from '@/lib/protocol/versioning';
import { SYNTHESE_VALIDEE_FIXTURE } from '@/lib/clinical-engine/dossierT0Fixture';
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
import { GET, POST } from './route';
import { canonicalSha256 } from '@/lib/clinical-engine/canonical';
import type { FoodCompassActionRef } from '@/lib/food-compass';
import { buildPractitionerFoodCompassReference } from '@/lib/food-compass/practitionerReference';

const VALUES: Record<string, number> = {
  '25000': 23.3, '31000': 0.31, '32000': 0, '34100': 0,
  '40302': 3.06, '40303': 5.31, '40304': 5.1, '41833': 0.18,
  '42053': 0.67, '42263': 1, '10004': 0.88, '10110': 300,
  '10120': 38.5, '10150': 306, '10190': 368, '10200': 333,
};
const MG_CODES = new Set(['10110', '10120', '10150', '10190', '10200']);

function ciqualRows() {
  return Object.entries(VALUES).map(([nutrientCode, value]) => ({
    id: `row-${nutrientCode}`,
    ciqualCode: '26034', nutrientCode, value, valueStatus: 'exact' as const,
    unit: (MG_CODES.has(nutrientCode) ? 'mg/100 g' : 'g/100 g') as 'mg/100 g' | 'g/100 g',
    datasetVersion: 'ciqual-2025-v1',
    sourceRef: 'doi:10.57745/RDMHWY#compo_2025_11_03.xml',
    sourceHash: '2da725585946434df320d8041631998b',
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
  }));
}

// UNE CHAÎNE C1 RÉELLE, ET PLUS UNE CARTE FORGÉE ([[D-054]], arbitrage 5).
//
// Ce banc postait jusqu'ici `{decisionCardId: 'DEC_1', inputHash: 'HASH_DEC'}` —
// une carte que rien ne rattachait au dossier, et qui passait. C'était la
// démonstration du trou que le recalcul serveur referme : la fixture ne peut plus
// être forgée, elle doit être ce que le serveur sait reproduire.
//
// LA TABLE DES PRIORITÉS EST SIGNÉE POUR CE BANC (et remise dans son état livré
// après chaque cas) : sans candidat ni abstention levée, aucun protocole n'est
// constructible — c'est justement l'état de la production d'aujourd'hui.
signerTablePriorites();
const reference = chaineC1DeReference({ selection: CANDIDAT_RANG_1 });
const referenceAutrePriorite = chaineC1DeReference({ selection: CANDIDAT_RANG_2 });
retablirTablePriorites();

const episode = reference.episode;
const decisionCard = reference.decisionCard;
const decisionCardId = decisionCard.decisionCardId;

const action: ProtocolAction = {
  actionId: 'A1',
  type: 'food',
  title: 'Petit-déjeuner protéiné',
  idealPlan: 'Chaque matin',
  minimalPlan: 'Trois matins',
  rescuePlan: 'Un fruit',
  limitations: [],
};

const submission = {
  purpose: 'Stabiliser le matin',
  followUpCriterion: 'Réveils nocturnes < 2 par nuit à J21',
  actions: [action],
  therapeuticLoad: { level: 'light', source: 'practitioner', justification: null } as const,
};

// Version active préexistante, au MÊME contenu clinique que `submission`.
const activeDraft = buildProtocolDraft({
  protocolDraftId: deriveProtocolDraftId(decisionCardId),
  decisionCard,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  purpose: submission.purpose,
  followUpCriterion: submission.followUpCriterion,
  therapeuticLoad: submission.therapeuticLoad,
  actions: submission.actions,
  review: { reviewedAt: '2026-01-02T00:00:00.000Z', reviewerRole: 'practitioner', confirmation: 'content_reviewed' },
});
const activeRow = {
  id: deriveVersionId(deriveProtocolDraftId(decisionCardId), activeDraft.inputHash),
  inputHash: activeDraft.inputHash,
  supersedesDraftId: null,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  payload: activeDraft,
};

function c5Ref(): FoodCompassActionRef {
  const reference = buildPractitionerFoodCompassReference({
    ciqualCode: '26034',
    foodLabel: 'Sardine',
    rows: ciqualRows(),
    activeProtocol: activeDraft,
  }).actionRef;
  if (!reference) throw new Error('Fixture C5 calculable attendue.');
  return reference;
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/praticien/protocoles/versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/praticien/protocoles/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
    process.env.WN_C5_ENABLED = 'false';
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'praticien@wellneuro.fr' });
    // Dossier qui PASSE les préconditions T0 (D-052) ET dont la chaîne C1 se
    // recalcule à l'identique (D-054) : les deux lectures partent des mêmes
    // passations, et l'anamnèse est celle qui a produit `patientContext`.
    prisma.questionnaireReponse.findMany.mockResolvedValue(passationsC1Fixture());
    prisma.consultation.findFirst.mockResolvedValue(ANAMNESE_C1_FIXTURE);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.ciqualNutrientValue.findMany.mockResolvedValue(ciqualRows());
    // Aucun arbitrage biologique par défaut : la garde LOT-06 ne mord que sur
    // une résolution d'intention `conditionnelle_biologie`.
    prisma.arbitrageBiologique.findMany.mockResolvedValue([]);
    // LA SÉLECTION PRATICIEN EST PERSISTÉE (`D-127`), et le banc décrit
    // désormais un dossier où elle a réellement été posée. Depuis §1bis le
    // recalcul serveur ne réinjecte plus la sélection du corps de requête : il
    // la RELIT ICI. Rendre `[]` ferait recalculer une carte SANS sélection,
    // donc 409 sur toutes les écritures — un refus juste, mais qui décrirait un
    // dossier où personne n'a choisi. Les cas qui veulent CE dossier-là posent
    // `[]` eux-mêmes.
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([
      ligneSelectionDeFixture(CANDIDAT_RANG_1),
    ]);
    // Contenu de la version active (GET) : nul par défaut, l'historique reste servi.
    prisma.protocolDraft.findUnique.mockResolvedValue(null);
    signerTablePriorites();
    // Défaut honnête : aucune ligne d'épisode en base. `vi.clearAllMocks()` vide
    // les appels mais GARDE les implémentations — sans ce reset, un banc qui
    // pose une ligne divergente la laisse fuir sur tous les suivants.
    prisma.assessmentEpisode.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    retablirTablePriorites();
  });

  // PRÉCONDITIONS T0 (D-052) : le seul point de persistance réellement appelé
  // par l'application. Refus AVANT la lecture du fil de versions.
  it('refuse la persistance d’un T0 sans premier rideau, sans lire le fil (422)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    const res = await POST(postRequest({ episode, decisionCard, submission }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'preconditions_non_remplies' });
    expect(prisma.protocolDraft.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un praticien non authentifié (401)', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ episode, decisionCard, submission }));
    expect(res.status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse l’écriture sur le patient d’un autre praticien (403)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'autre@wellneuro.fr' });
    const res = await POST(postRequest({ episode, decisionCard, submission }));
    expect(res.status).toBe(403);
    // Corps 403 historique préservé à l'octet malgré le ralliement à la garde.
    expect(await res.json()).toEqual({
      ok: false,
      reason: 'forbidden',
      error: 'Patient non accessible pour ce praticien.',
    });
    expect(prisma.protocolDraft.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('crée la première version avec supersedes null', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    const res = await POST(postRequest({ episode, decisionCard, submission }));
    const json = (await res.json()) as { ok: boolean; unchanged: boolean; supersedesDraftId: string | null; versionId: string };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.unchanged).toBe(false);
    expect(json.supersedesDraftId).toBeNull();
    expect(json.versionId.startsWith(`${deriveProtocolDraftId(decisionCardId)}#`)).toBe(true);
    expect(prisma.protocolDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: json.versionId },
        create: expect.objectContaining({ idPatient: 'PAT_1', supersedesDraftId: null, status: 'practitioner_reviewed' }),
      }),
    );
    // Une écriture laisse déjà sa propre trace datée et attribuée (GD-1).
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('crée une nouvelle version chaînée sur changement clinique', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    const res = await POST(
      postRequest({
        episode,
        decisionCard,
        submission: { ...submission, purpose: 'Objectif révisé' },
      }),
    );
    const json = (await res.json()) as { unchanged: boolean; supersedesDraftId: string | null };
    expect(res.status).toBe(200);
    expect(json.unchanged).toBe(false);
    expect(json.supersedesDraftId).toBe(activeRow.id);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('est idempotent quand le contenu clinique est inchangé (no-op)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    const res = await POST(postRequest({ episode, decisionCard, submission }));
    const json = (await res.json()) as { unchanged: boolean; versionId: string };
    expect(res.status).toBe(200);
    expect(json.unchanged).toBe(true);
    expect(json.versionId).toBe(activeRow.id);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejette une version périmée (409 version_stale)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    const res = await POST(
      postRequest({ episode, decisionCard, submission, baseVersionId: 'une_autre_version' }),
    );
    const json = (await res.json()) as { reason: string };
    expect(res.status).toBe(409);
    expect(json.reason).toBe('version_stale');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejette un épisode non confirmé (400)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const res = await POST(postRequest({ episode: { ...episode, status: 'proposed' }, decisionCard, submission }));
    const json = (await res.json()) as { reason: string };
    expect(res.status).toBe(400);
    expect(json.reason).toBe('not_confirmed');
  });

  it('rejette une soumission cliniquement invalide (400 draft_invalid)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    const res = await POST(
      postRequest({ episode, decisionCard, submission: { ...submission, actions: [] } }),
    );
    const json = (await res.json()) as { reason: string };
    expect(res.status).toBe(400);
    expect(json.reason).toBe('draft_invalid');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('insère manuellement une référence C5 dans une nouvelle version V2', async () => {
    process.env.WN_C5_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    const res = await POST(postRequest({
      episode, decisionCard,
      submission: {
        ...submission,
        actions: [{ ...action, title: 'Sardine', foodCompassRef: c5Ref() }],
      },
      baseVersionId: activeRow.id,
    }));
    expect(res.status).toBe(200);
    expect(prisma.protocolDraft.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        contractVersion: 'c1-protocol-draft-v2',
        payload: expect.objectContaining({
          version: 'c1-protocol-draft-v2',
          actions: [expect.objectContaining({ foodCompassRef: expect.objectContaining({ foodRef: 'ciqual-2025-v1:26034' }) })],
        }),
      }),
    }));
  });

  it('refuse une référence C5 sémantiquement forgée même si son hash public est cohérent', async () => {
    process.env.WN_C5_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    const validRef = c5Ref();
    const forgedInput = { ...validRef, intrinsicProfileHash: 'profil-forgé' };
    const { refHash: _oldHash, ...forgedHashInput } = forgedInput;
    const forgedRef = { ...forgedInput, refHash: canonicalSha256(forgedHashInput) };
    const res = await POST(postRequest({
      episode, decisionCard,
      submission: { ...submission, actions: [{ ...action, foodCompassRef: forgedRef }] },
      baseVersionId: activeRow.id,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: 'draft_invalid' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('échoue en 503 sans écrire si le référentiel C5 est incomplet', async () => {
    process.env.WN_C5_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    prisma.ciqualNutrientValue.findMany.mockResolvedValue(ciqualRows().slice(0, 15));
    const res = await POST(postRequest({
      episode, decisionCard,
      submission: { ...submission, actions: [{ ...action, foodCompassRef: c5Ref() }] },
      baseVersionId: activeRow.id,
    }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'reference_incomplete' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse une référence C5 si la priorité cible diffère de la source', async () => {
    process.env.WN_C5_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    // UNE SECONDE CHAÎNE RÉELLE, et non une carte retouchée : le praticien a
    // sélectionné l'AUTRE candidat classé, ce que le recalcul serveur reproduit
    // sans broncher. C'est bien la garde C5 qui doit refuser, pas la garde
    // d'intégrité — une carte forgée rendrait ce cas vert pour la mauvaise
    // raison, désormais en 409.
    const changedPriorityCard = referenceAutrePriorite.decisionCard;
    // Ce cas décrit un praticien qui a retenu l'AUTRE candidat : la base doit
    // porter CETTE sélection-là, sinon le recalcul rendrait 409 et le cas
    // passerait au vert pour la mauvaise raison — c'est la garde C5 qu'il vise.
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([
      ligneSelectionDeFixture(CANDIDAT_RANG_2),
    ]);
    const res = await POST(postRequest({
      episode, decisionCard: changedPriorityCard,
      submission: { ...submission, actions: [{ ...action, foodCompassRef: c5Ref() }] },
      baseVersionId: activeRow.id,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: 'draft_invalid' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // TEST D'INTRUSION — [[D-054]], arbitrage 5. Une carte de décision fabriquée
  // côté client est rejetée par le recalcul serveur, quelle que soit sa
  // cohérence interne.
  it('refuse une carte de décision forgée (409 chaine_c1_divergente)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    // L'ABSTENTION EST LE CHAMP QUI COMPTE : c'est lui qui débloque la décision,
    // et il est ici RÉÉCRIT sur une chaîne dont le serveur sait qu'elle ne le
    // porte pas. Le reste de la carte est authentique — c'est ce qui rend le cas
    // discriminant : une garde qui ne contrôlerait que la structure passerait.
    retablirTablePriorites();
    const honnete = chaineC1DeReference({ selection: null });
    signerTablePriorites();
    const forgee = {
      ...honnete.decisionCard,
      abstention: { status: 'not_required' as const, ruleIds: [], limitations: [] },
      priorityCandidates: reference.decisionCard.priorityCandidates,
      selectedMainPriority: reference.decisionCard.selectedMainPriority,
    };
    const res = await POST(postRequest({ episode: honnete.episode, decisionCard: forgee, submission }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'chaine_c1_divergente' });
    expect(prisma.protocolDraft.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // LE CŒUR DE LA GARDE, ET LE DÉFAUT QUE LA REVUE DU 2026-08-12 A TROUVÉ.
  //
  // Le cas précédent passe au vert pour une raison ANNEXE : la carte y est
  // fabriquée table non signée puis soumise table signée, si bien que le
  // recalcul diverge de toute façon. Il ne dit RIEN du cas qui compte — une
  // carte fabriquée et soumise dans le MÊME état de table, dont seul le CONTENU
  // clinique est réécrit. Les trois comparaisons d'empreintes ne le voyaient
  // pas : elles confrontaient le recalcul aux nombres DÉCLARÉS par le client,
  // jamais au contenu qu'il envoyait.
  it('refuse un contenu clinique réécrit sous des empreintes honnêtes (409)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    // EMPREINTES INTACTES, CONTENU RÉÉCRIT : la carte se présente comme celle
    // que le serveur a émise, et ment sur ce qu'elle contient.
    const forgee = {
      ...decisionCard,
      limitations: ['Rien à signaler sur ce dossier.'],
      abstention: { status: 'not_required' as const, ruleIds: [], limitations: [] },
    };
    const res = await POST(postRequest({ episode, decisionCard: forgee, submission }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'chaine_c1_divergente' });
    expect(prisma.protocolDraft.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // La variante qui referme la porte de service : le fraudeur RECALCULE
  // l'empreinte de son contenu réécrit, si bien que la carte se recoupe
  // parfaitement elle-même. Seule la confrontation au recalcul DEPUIS LA BASE
  // l'attrape.
  it('refuse un contenu réécrit dont l’empreinte a été refaite (409)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    const { decisionCardId, inputHash: _ancienne, ...contenu } = decisionCard;
    const contenuReecrit = { ...contenu, limitations: ['Rien à signaler sur ce dossier.'] };
    const forgee = { decisionCardId, ...contenuReecrit, inputHash: canonicalSha256(contenuReecrit) };
    const res = await POST(postRequest({ episode, decisionCard: forgee, submission }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'chaine_c1_divergente' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // Le second mode de divergence, et il n'est pas frauduleux : le dossier a
  // bougé depuis que la carte a été préparée. Le client traite déjà ce 409 en
  // rechargeant.
  it('refuse une carte préparée sur un dossier qui a changé (409)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    prisma.questionnaireReponse.findMany.mockResolvedValue(
      passationsC1Fixture().map(ligne => (
        ligne.idQuestionnaire === 'Q_MOD_03'
          ? { ...ligne, scoresJson: { rawAnswers: { ...ligne.scoresJson.rawAnswers, Q003: 3 } } }
          : ligne
      )),
    );
    const res = await POST(postRequest({ episode, decisionCard, submission }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'chaine_c1_divergente' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse une insertion C5 si le flag est désactivé', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([activeRow]);
    const res = await POST(postRequest({
      episode, decisionCard,
      submission: { ...submission, actions: [{ ...action, foodCompassRef: c5Ref() }] },
      baseVersionId: activeRow.id,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: 'draft_invalid' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/praticien/protocoles/versions', () => {
  it('refuse la lecture du patient d’un autre praticien (403)', async () => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'autre@wellneuro.fr' });
    const req = new Request(`http://localhost/api/praticien/protocoles/versions?idPatient=PAT_1&decisionCardId=${decisionCardId}`);
    const res = await GET(req);
    expect(res.status).toBe(403);
    // Corps 403 historique préservé à l'octet malgré le ralliement à la garde.
    expect(await res.json()).toEqual({
      ok: false,
      reason: 'forbidden',
      error: 'Patient non accessible pour ce praticien.',
    });
    expect(prisma.protocolDraft.findMany).not.toHaveBeenCalled();
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('un GET accessible journalise l’accès au gabarit littéral (G-TRUST-04)', async () => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'praticien@wellneuro.fr' });
    // Dossier qui PASSE les préconditions T0 (D-052) : les cas de refus les
    // posent explicitement.
    prisma.questionnaireReponse.findMany.mockResolvedValue(passationsC1Fixture());
    prisma.consultation.findFirst.mockResolvedValue(ANAMNESE_C1_FIXTURE);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    const req = new Request(`http://localhost/api/praticien/protocoles/versions?idPatient=PAT_1&decisionCardId=${decisionCardId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledWith({
      data: {
        idPatient: 'PAT_1',
        praticienEmail: 'praticien@wellneuro.fr',
        route: '/api/praticien/protocoles/versions',
        methode: 'GET',
      },
    });
  });
});
