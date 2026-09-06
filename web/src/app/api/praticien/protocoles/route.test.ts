import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn() },
    // Préconditions de confirmation T0 (D-052) : lues APRÈS la garde
    // d'appartenance, avant toute écriture.
    questionnaireReponse: { findMany: vi.fn() },
    consultation: { findFirst: vi.fn() },
    syntheseIA: { findFirst: vi.fn() },
    assessmentEpisode: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    protocolDraft: { upsert: vi.fn(), findMany: vi.fn() },
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

import { VERSION_SCORE_EQUILIBRE } from '@/lib/equilibre/constants';
import { SYNTHESE_VALIDEE_FIXTURE } from '@/lib/clinical-engine/dossierT0Fixture';
import {
  ANAMNESE_C1_FIXTURE,
  ANAMNESE_C1_FIXTURE_AVEC_SIGNAL,
  CANDIDAT_RANG_1,
  chaineC1DeReference,
  ligneSelectionDeFixture,
  HORODATAGE_C1_FIXTURE,
  passationsC1Fixture,
  retablirTablePriorites,
  signerTablePriorites,
} from '@/lib/clinical-engine/chaineC1Fixture';
import type { ConfirmedAssessmentEpisode, DecisionCard } from '@/lib/clinical-engine/types';
import { canonicalSha256 } from '@/lib/clinical-engine/canonical';
import { GET, POST } from './route';

// UNE CHAÎNE C1 RÉELLE, ET PLUS UNE CARTE FORGÉE ([[D-054]], arbitrage 5).
//
// Ce banc postait `{decisionCardId: 'DEC_1', inputHash: 'HASH_DEC'}` : une carte
// que rien ne rattachait au dossier, et qui passait. C'est le trou que le
// recalcul serveur referme, sur CETTE route aussi — un fail-closed écrit dans
// une seule des deux routes est un fail-closed qu'on peut oublier de corriger
// dans l'autre.
signerTablePriorites();
const reference = chaineC1DeReference({ selection: CANDIDAT_RANG_1 });
retablirTablePriorites();

const episode = reference.episode;
const decisionCard = reference.decisionCard;

/**
 * Un constat de contradiction MINIMAL MAIS SINCÈRE sur les champs que la
 * checklist recopie (`D-119` : `description` + `passations`). L'ancien
 * `[{ id: 'C-STR' }] as never` mentait au type — et le chargeur des
 * préconditions, qui recopie désormais les constats au lieu de les compter,
 * plantait sur `passations.map` d'un objet qui n'en avait pas.
 */
const CONSTAT_C_STR = {
  id: 'C-STR',
  description: 'Stress déclaré discordant entre instruments.',
  passations: [{ idQuestionnaire: 'Q_MOD_01', date: '2026-03-12', dateLisible: '12/03/2026' }],
} as never;

/**
 * Le protocole relu qui accompagne une carte.
 *
 * Objet littéral, comme avant : cette route ne CONSTRUIT pas le protocole, elle
 * en vérifie l'ancrage (`decisionCardId` et `decisionCardInputHash`). Le dériver
 * de la carte est ce qui garde la fixture cohérente quand la carte change.
 */
function draftPour(carte: DecisionCard) {
  return {
    protocolDraftId: 'DRA_1',
    decisionCardId: carte.decisionCardId,
    decisionCardInputHash: carte.inputHash,
    selectedPriorityId: carte.selectedMainPriority?.candidateId ?? CANDIDAT_RANG_1,
    status: 'practitioner_reviewed',
    version: 'c1-protocol-draft-v1',
    inputHash: 'HASH_DRAFT',
    updatedAt: '2026-01-03T00:00:00.000Z',
  };
}

/**
 * La chaîne complète pour un épisode VARIANT (contournement tracé, jalon de
 * suivi). L'épisode entre dans les trois empreintes : le retoucher sans
 * reconstruire la carte produirait un 409 — ce que la garde doit faire, mais pas
 * ce que ces cas-là décrivent.
 */
function chainePour(episodeVariant: ConfirmedAssessmentEpisode) {
  const chaine = chaineC1DeReference({ selection: CANDIDAT_RANG_1, episode: episodeVariant });
  return { episode: episodeVariant, decisionCard: chaine.decisionCard, draft: draftPour(chaine.decisionCard) };
}

const draft = draftPour(decisionCard);

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/praticien/protocoles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/praticien/protocoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
    // LA SÉLECTION PRATICIEN EST PERSISTÉE (`D-127`), et le banc décrit
    // désormais un dossier où elle a réellement été posée. Depuis §1bis le
    // recalcul serveur ne réinjecte plus la sélection du corps de requête : il
    // la RELIT ICI. Rendre `[]` ferait recalculer une carte SANS sélection,
    // donc 409 sur toutes les écritures — un refus juste, mais qui décrirait un
    // dossier où personne n'a choisi.
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([
      ligneSelectionDeFixture(CANDIDAT_RANG_1),
    ]);
    // Par défaut, le patient appartient au praticien en session (garde d'appartenance).
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'praticien@wellneuro.fr' });
    // Dossier qui PASSE les préconditions T0 (D-052) ET dont la chaîne C1 se
    // recalcule à l'identique (D-054) : les cas de refus les posent
    // explicitement.
    prisma.questionnaireReponse.findMany.mockResolvedValue(passationsC1Fixture());
    prisma.consultation.findFirst.mockResolvedValue(ANAMNESE_C1_FIXTURE);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    signerTablePriorites();
    // Défaut honnête : aucune ligne d'épisode en base. `vi.clearAllMocks()` vide
    // les appels mais GARDE les implémentations — sans ce reset, un banc qui
    // pose une ligne divergente la laisse fuir sur tous les suivants.
    prisma.assessmentEpisode.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    retablirTablePriorites();
  });

  // `D-129` — CETTE ROUTE N'EST PAS L'ÉCRIVAIN DE L'ACTE : elle reçoit
  // l'épisode du navigateur. Son `upsert(..., update: {})` avalait donc une
  // divergence en SILENCE, sous une réponse `ok: true` — un épisode périmé
  // citait la ligne d'un autre contenu, et le praticien n'en savait rien.
  //
  // Ce banc rougit sur l'ancienne forme, qui rendait 200 sans rien écrire.
  it('refuse un épisode divergent de la ligne enregistrée, au lieu de l’avaler (422)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.assessmentEpisode.findUnique.mockResolvedValue({
      payloadHash: 'empreinte-dune-autre-mesure',
    });
    const res = await POST(postRequest({ episode, decisionCard, draft }));
    expect(res.status).toBe(422);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un praticien non authentifié (401)', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ episode, decisionCard, draft }));
    expect(res.status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // PRÉCONDITIONS T0 (D-052). La base est gardée ici POUR CE QUI ARRIVE DU
  // NAVIGATEUR — le cockpit, troisième point de persistance depuis D-118,
  // construit sa trace côté serveur et porte ses propres gardes.
  it('refuse la persistance d’un T0 sans premier rideau, sans rien écrire (422)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    const res = await POST(postRequest({ episode, decisionCard, draft }));
    expect(res.status).toBe(422);
    expect((await res.json())).toMatchObject({ ok: false, reason: 'preconditions_non_remplies' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // Le refus se pose APRÈS la garde d'appartenance : on ne lit pas le dossier
  // d'un patient qu'on n'a pas prouvé sien.
  it('un patient d’un autre praticien sort en 404 avant toute lecture de dossier', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'autre@wellneuro.fr' });
    const res = await POST(postRequest({ episode, decisionCard, draft }));
    expect(res.status).toBe(404);
    expect(prisma.questionnaireReponse.findMany).not.toHaveBeenCalled();
  });

  // LE DÉFAUT TROUVÉ EN REVUE LE 2026-08-12 : l'épisode arrive du NAVIGATEUR, et
  // une première rédaction de ce banc postait un `preconditionOverrides`
  // fabriqué à la main sur un dossier SANS condition souple en défaut, en
  // exigeant un 200. Il consacrait ce que D-052 interdit.
  it('refuse un contournement qui ne correspond à aucune condition en défaut', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const forge = {
      ...episode,
      preconditionOverrides: [{
        conditionId: 'contradictions_ouvertes',
        motif: 'Motif inventé.',
        decidePar: 'praticien@wellneuro.fr',
        decideLe: HORODATAGE_C1_FIXTURE,
      }],
    };
    const res = await POST(postRequest({ episode: forge, decisionCard, draft }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('sans objet');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // CONTRE-REVUE ADVERSE DU 2026-08-27, affirmation `N1.8` RÉFUTÉE.
  //
  // `decideLe` n'était vérifié que comme ISO LISIBLE. Le commentaire de la
  // garde décrivait pourtant déjà le risque qu'il ne fermait pas — « le dater
  // à volonté, dans la seule ligne qui en fera foi pour toujours ». Une date
  // arbitraire, syntaxiquement valide, était acceptée et persistée.
  it('refuse un contournement daté autrement que la confirmation de l’épisode', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const service = await import('@/lib/clinical/contradictionsService');
    const espion = vi.spyOn(service, 'contradictionsPourPatient')
      .mockResolvedValue([CONSTAT_C_STR] as never);
    try {
      const antidate = {
        ...episode,
        preconditionOverrides: [{
          conditionId: 'contradictions_ouvertes',
          motif: 'Vue en entretien.',
          decidePar: 'praticien@wellneuro.fr',
          // Lisible, plausible, et pourtant choisie : deux ans avant la
          // confirmation de l'épisode.
          decideLe: '2024-01-03T00:00:00.000Z',
        }],
      };
      const res = await POST(postRequest({ episode: antidate, decisionCard, draft }));
      expect(res.status).toBe(422);
      expect((await res.json()).error).toContain('datée de la confirmation');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    } finally {
      espion.mockRestore();
    }
  });

  it('refuse un contournement attribué à un autre praticien', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const service = await import('@/lib/clinical/contradictionsService');
    const espion = vi.spyOn(service, 'contradictionsPourPatient')
      .mockResolvedValue([CONSTAT_C_STR] as never);
    const usurpe = {
      ...episode,
      preconditionOverrides: [{
        conditionId: 'contradictions_ouvertes',
        motif: 'Vue en entretien.',
        decidePar: 'quelquun.dautre@wellneuro.fr',
        decideLe: HORODATAGE_C1_FIXTURE,
      }],
    };
    const res = await POST(postRequest({ episode: usurpe, decisionCard, draft }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('auteur de la session');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    espion.mockRestore();
  });

  it('refuse un contournement daté n’importe comment', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const service = await import('@/lib/clinical/contradictionsService');
    const espion = vi.spyOn(service, 'contradictionsPourPatient')
      .mockResolvedValue([CONSTAT_C_STR] as never);
    const res = await POST(postRequest({
      episode: {
        ...episode,
        preconditionOverrides: [{
          conditionId: 'contradictions_ouvertes', motif: 'Vue en entretien.',
          decidePar: 'praticien@wellneuro.fr', decideLe: 'hier',
        }],
      },
      decisionCard, draft,
    }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('date invalide');
    espion.mockRestore();
  });

  // Critère 2 du Lot C : sur une condition RÉELLEMENT en défaut et un
  // contournement conforme, la justification est relisible dans le payload.
  it('la justification d’un contournement légitime voyage jusqu’au payload persisté', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const service = await import('@/lib/clinical/contradictionsService');
    const espion = vi.spyOn(service, 'contradictionsPourPatient')
      .mockResolvedValue([CONSTAT_C_STR] as never);
    const contourne = {
      ...episode,
      preconditionOverrides: [{
        conditionId: 'contradictions_ouvertes',
        motif: 'Discordance reprise en entretien.',
        decidePar: 'praticien@wellneuro.fr',
        decideLe: HORODATAGE_C1_FIXTURE,
      }],
    };
    // La trace de contournement fait PARTIE de l'épisode, donc des trois
    // empreintes : la carte est reconstruite sur cet épisode-ci, sans quoi le
    // recalcul serveur rendrait 409 — à raison.
    const res = await POST(postRequest(chainePour(contourne)));
    expect(res.status).toBe(200);
    const upsert = prisma.assessmentEpisode.upsert.mock.calls[0][0] as {
      create: { payload: { preconditionOverrides?: { motif: string }[] } };
    };
    expect(upsert.create.payload.preconditionOverrides).toMatchObject([
      { conditionId: 'contradictions_ouvertes', motif: 'Discordance reprise en entretien.' },
    ]);
    espion.mockRestore();
  });

  // B3 de la revue : la porte s'indexait sur le `milestone` DÉCLARÉ. Déclarer
  // J21 la désactivait, et l'upsert `update: {}` squattait définitivement
  // l'identifiant T0 du patient avec une ligne de suivi.
  it('un jalon déclaré ne désactive pas la porte d’un épisode T0', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    const res = await POST(postRequest({
      episode: { ...episode, assessmentEpisodeId: 'runtime-episode-PAT_1-T0', milestone: 'J21' },
      decisionCard,
      draft: { ...draft, protocolDraftId: 'DRA_1' },
    }));
    expect(res.status).toBe(422);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // B4 : la lecture doit porter le filtre de statut, sinon une régénération de
  // synthèse bloque le T0 avec un message faux.
  it('ne lit que les synthèses validées', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    await POST(postRequest({ episode, decisionCard, draft }));
    expect(prisma.syntheseIA.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idPatient: 'PAT_1', statut: { in: ['Validee_Praticien', 'Corrigee_Praticien'] } },
      }),
    );
  });

  // LE TOUR DU VÉRIFICATEUR, ÉPROUVÉ SUR UN DOSSIER PORTANT UN SIGNAL —
  // [[D-107]], dette nommée au LOT-04.
  //
  // `refusChaineC1` relit le dossier et RECALCULE la chaîne pour la confronter à
  // celle que le client soumet. Ses deux lectures doivent produire le même objet
  // **y compris quand un signal de sécurité entre dans le calcul** : un red flag
  // retire des candidats (`DC-12`), donc une divergence sur ce chemin ferait
  // diverger la carte entière — et le refus tomberait sur un dossier honnête.
  // Le code des deux lectures avait été vérifié ligne à ligne en revue ; aucun
  // banc ne le tenait, faute de dossier portant un signal.
  it('accepte une chaîne construite sur un dossier PORTANT un signal d’alerte', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    // Les DEUX côtés lisent la même anamnèse : le serveur par son mock Prisma,
    // le client en construisant sa chaîne dessus. Si les lectures divergeaient,
    // le vérificateur rendrait 409 — c'est précisément ce que ce cas surveille.
    prisma.consultation.findFirst.mockResolvedValue(ANAMNESE_C1_FIXTURE_AVEC_SIGNAL);
    // AUCUNE SÉLECTION, et ce n'est pas une commodité de banc : sur un dossier
    // portant un signal, `buildDecisionCard` REFUSE toute priorité sélectionnée
    // (« Une priorité ne peut être sélectionnée avant la levée des bloqueurs »).
    // C'est `DC-12` qui mord — le red flag retire le candidat au lieu de
    // coexister avec lui. Le vérificateur doit donc accepter une chaîne
    // légitimement DÉPOURVUE de sélection, et c'est ce que ce cas garde.
    //
    // LA BASE EST VIDÉE EXPLICITEMENT (`D-127`) : personne n'a rien sélectionné
    // sur ce dossier. Sans cette ligne, le cas passerait quand même — le repli
    // de `construireChaineC1Tolerante` écarterait la sélection de fixture — mais
    // il éprouverait le REPLI au lieu de ce qu'il annonce. Un vert obtenu par un
    // autre mécanisme que celui qu'on décrit ne garde rien. La péremption a son
    // propre banc, dans `selectionPrioritePrisma.test.ts`.
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    const chaine = chaineC1DeReference({ anamnese: ANAMNESE_C1_FIXTURE_AVEC_SIGNAL });

    const res = await POST(postRequest({
      episode: chaine.episode,
      decisionCard: chaine.decisionCard,
      draft: draftPour(chaine.decisionCard),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('persiste épisode confirmé + protocole relu (idempotent par id de contrat)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const res = await POST(postRequest({ episode, decisionCard, draft }));
    const json = (await res.json()) as { ok: boolean; protocolDraftId?: string };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.protocolDraftId).toBe('DRA_1');
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: episode.assessmentEpisodeId } }),
    );
    expect(prisma.protocolDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'DRA_1' },
        create: expect.objectContaining({
          idPatient: 'PAT_1',
          // Les ancres de provenance sont désormais celles du RECALCUL serveur,
          // et non deux chaînes littérales : c'est tout l'objet de [[D-054]].
          snapshotInputHash: decisionCard.snapshotInputHash,
          reviewInputHash: decisionCard.reviewInputHash,
          contractVersion: 'c1-protocol-draft-v1',
        }),
      }),
    );
    // Le POST ne journalise pas (GD-1) : l'écriture laisse déjà sa trace.
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  // Gate G2 — identité de cycle estampillée à l'écriture.
  it('une ancre ouvre son propre cycle', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    await POST(postRequest({ episode, decisionCard, draft }));
    // Les ancres SONT lues, même pour une ancre : depuis `D-113`, la même
    // lecture sert la garde de recevabilité du nom de cycle.
    expect(prisma.assessmentEpisode.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          cycleId: episode.assessmentEpisodeId, versionScore: VERSION_SCORE_EQUILIBRE,
        }),
      }),
    );
  });

  it('un jalon de mesure rejoint le cycle du rang le plus haut déjà ouvert', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      { id: 'EPI_T0_A', cycleId: 'EPI_T0_A', milestone: 'T0', confirmedAt: new Date('2025-11-01T00:00:00.000Z') },
      { id: 'EPI_T0_B', cycleId: 'EPI_T0_B', milestone: 'T1', confirmedAt: new Date('2026-01-01T00:00:00.000Z') },
      // Ancre postérieure au jalon : ne doit jamais l'absorber.
      { id: 'EPI_T0_C', cycleId: 'EPI_T0_C', milestone: 'T2', confirmedAt: new Date('2026-06-01T00:00:00.000Z') },
    ]);
    await POST(postRequest(
      chainePour({ ...episode, assessmentEpisodeId: 'EPI_J21', milestone: 'J21' }),
    ));
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ cycleId: 'EPI_T0_B' }) }),
    );
  });

  it('un jalon sans aucune ancre antérieure reste non rattaché (cycleId null)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      { id: 'EPI_T0_C', cycleId: 'EPI_T0_C', milestone: 'T0', confirmedAt: new Date('2026-06-01T00:00:00.000Z') },
    ]);
    await POST(postRequest(
      chainePour({ ...episode, assessmentEpisodeId: 'EPI_J21', milestone: 'J21' }),
    ));
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ cycleId: null }) }),
    );
  });

  it('rejette une chaîne de provenance incohérente (400)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const res = await POST(
      postRequest({ episode, decisionCard, draft: { ...draft, decisionCardInputHash: 'AUTRE' } }),
    );
    const json = (await res.json()) as { reason?: string };
    expect(res.status).toBe(400);
    expect(json.reason).toBe('provenance_mismatch');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejette un protocole non relu (400)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const res = await POST(postRequest({ episode, decisionCard, draft: { ...draft, status: 'draft' } }));
    const json = (await res.json()) as { reason?: string };
    expect(res.status).toBe(400);
    expect(json.reason).toBe('not_reviewed');
  });

  // TEST D'INTRUSION — [[D-054]], arbitrage 5. LES DEUX ROUTES, jamais une
  // seule : c'est la raison d'être du helper partagé.
  it('refuse une carte de décision forgée (409 chaine_c1_divergente)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    // Chaîne honnête produite TABLE NON SIGNÉE — donc `not_evaluated`, décision
    // bloquée : exactement ce que la production sert aujourd'hui. La carte est
    // ensuite réécrite pour se déclarer débloquée.
    retablirTablePriorites();
    const honnete = chaineC1DeReference({ selection: null });
    const forgee = {
      ...honnete.decisionCard,
      abstention: { status: 'not_required' as const, ruleIds: [], limitations: [] },
      priorityCandidates: decisionCard.priorityCandidates,
      selectedMainPriority: decisionCard.selectedMainPriority,
    };
    const res = await POST(postRequest({
      episode: honnete.episode, decisionCard: forgee, draft: draftPour(forgee),
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'chaine_c1_divergente' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // LES DEUX MÊMES INTRUSIONS SUR CETTE ROUTE, jamais une seule : c'est la
  // raison d'être du helper partagé, et le défaut relevé en revue portait sur
  // les deux points de persistance.
  it('refuse un contenu clinique réécrit sous des empreintes honnêtes (409)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const forgee = {
      ...decisionCard,
      limitations: ['Rien à signaler sur ce dossier.'],
      abstention: { status: 'not_required' as const, ruleIds: [], limitations: [] },
    };
    const res = await POST(postRequest({ episode, decisionCard: forgee, draft: draftPour(forgee) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'chaine_c1_divergente' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un contenu réécrit dont l’empreinte a été refaite (409)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const { decisionCardId, inputHash: _ancienne, ...contenu } = decisionCard;
    const contenuReecrit = { ...contenu, limitations: ['Rien à signaler sur ce dossier.'] };
    const forgee = { decisionCardId, ...contenuReecrit, inputHash: canonicalSha256(contenuReecrit) };
    const res = await POST(postRequest({ episode, decisionCard: forgee, draft: draftPour(forgee) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'chaine_c1_divergente' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejette un épisode non confirmé (400)', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    const res = await POST(postRequest({ episode: { ...episode, status: 'proposed' }, decisionCard, draft }));
    const json = (await res.json()) as { reason?: string };
    expect(res.status).toBe(400);
    expect(json.reason).toBe('not_confirmed');
  });
});

describe('GET /api/praticien/protocoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'praticien@wellneuro.fr' });
    // Dossier qui PASSE les préconditions T0 (D-052) : les cas de refus les
    // posent explicitement.
    prisma.questionnaireReponse.findMany.mockResolvedValue(passationsC1Fixture());
    prisma.consultation.findFirst.mockResolvedValue(ANAMNESE_C1_FIXTURE);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
  });

  it('refuse un praticien non authentifié (401)', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/praticien/protocoles?idPatient=PAT_1'));
    expect(res.status).toBe(401);
  });

  it('liste les protocoles persistés, bornés à l’idPatient demandé', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.protocolDraft.findMany.mockResolvedValue([
      {
        id: 'DRA_1',
        decisionCardId: 'DEC_1',
        status: 'practitioner_reviewed',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        reviewedAt: new Date('2026-01-03T00:00:00.000Z'),
        episode: { milestone: 'T0' },
      },
    ]);
    const res = await GET(new Request('http://localhost/api/praticien/protocoles?idPatient=PAT_1'));
    const json = (await res.json()) as {
      ok: boolean;
      protocoles: Array<{ versionId: string; protocolDraftId: string; milestone: string }>;
    };
    expect(res.status).toBe(200);
    expect(json.protocoles[0]).toMatchObject({
      versionId: 'DRA_1',
      protocolDraftId: 'proto_DEC_1',
      milestone: 'T0',
    });
    // La requête est bornée à l'idPatient ET scopée au praticien en session.
    // Elle exclut aussi les instantanés du carnet alimentaire : ils partagent
    // `protocol_drafts` sans être des versions de protocole, et le patient en
    // écrit lui-même depuis le lot 2.
    expect(prisma.protocolDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idPatient: 'PAT_1',
          patient: { praticienEmail: { equals: 'praticien@wellneuro.fr', mode: 'insensitive' } },
          contractVersion: { not: 'ja-food-observation-v1' },
        },
      }),
    );
    // Liste non vide = appartenance prouvée : lecture journalisée (G-TRUST-04).
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledWith({
      data: {
        idPatient: 'PAT_1',
        praticienEmail: 'praticien@wellneuro.fr',
        route: '/api/praticien/protocoles',
        methode: 'GET',
      },
    });
  });

  it('ne remonte rien pour le patient d’un autre praticien', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'autre@wellneuro.fr' } });
    // Le scope est porté par la requête : la base ne rend aucune ligne.
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    const res = await GET(new Request('http://localhost/api/praticien/protocoles?idPatient=PAT_1'));
    const json = (await res.json()) as { ok: boolean; protocoles: unknown[] };
    expect(res.status).toBe(200);
    expect(json.protocoles).toEqual([]);
    expect(prisma.protocolDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patient: { praticienEmail: { equals: 'autre@wellneuro.fr', mode: 'insensitive' } },
        }),
      }),
    );
    // Liste vide : dossier non prouvé accessible → pas de journalisation
    // (limite assumée, LOT-00).
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// `D-113` — le point de persistance garde le NOM du cycle, pas seulement son
// contenu. La colonne `milestone` n'a aucun CHECK : ce refus est le seul.
// ---------------------------------------------------------------------------
describe('POST /api/praticien/protocoles — recevabilité de l’ancre (`D-113`)', () => {
  const ancre = (id: string, milestone: string, iso: string) => ({
    id, cycleId: id, milestone, confirmedAt: new Date(iso),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    prisma.patient.findUnique.mockResolvedValue({ praticienEmail: 'praticien@wellneuro.fr' });
    prisma.questionnaireReponse.findMany.mockResolvedValue(passationsC1Fixture());
    prisma.consultation.findFirst.mockResolvedValue(ANAMNESE_C1_FIXTURE);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.protocolDraft.findMany.mockResolvedValue([]);
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    signerTablePriorites();
  });

  afterEach(() => {
    retablirTablePriorites();
  });

  it('REFUSE une ancre dont le rang saute, et n’écrit rien', async () => {
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      ancre('EPI_T0', 'T0', '2026-01-01T00:00:00.000Z'),
    ]);
    const res = await POST(postRequest(
      chainePour({ ...episode, assessmentEpisodeId: 'EPI_T7', milestone: 'T7' as never }),
    ));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('T7');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('REFUSE un jalon d’une forme que rien ne relit', async () => {
    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
    const res = await POST(postRequest(
      chainePour({ ...episode, assessmentEpisodeId: 'EPI_TA', milestone: 'TA' as never }),
    ));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('Jalon inconnu');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ACCEPTE l’ancre suivante, qui ouvre son propre cycle', async () => {
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      ancre('EPI_T0', 'T0', '2026-01-01T00:00:00.000Z'),
    ]);
    const res = await POST(postRequest(
      chainePour({ ...episode, assessmentEpisodeId: 'EPI_T1', milestone: 'T1' as never }),
    ));
    expect(res.status).toBe(200);
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ milestone: 'T1', cycleId: 'EPI_T1' }) }),
    );
  });

  it('LE RIDEAU D’ENTRÉE VAUT AUSSI POUR `T1` ([[D-052]])', async () => {
    // La porte lisait le suffixe `-(T0|J21|J42|J90)` de l'identifiant : `-T1`
    // n'y correspondait pas, la fonction retombait sur le champ déclaré, et un
    // `T1` annoncé `J21` désactivait le rideau.
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      ancre('EPI_T0', 'T0', '2026-01-01T00:00:00.000Z'),
    ]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    const res = await POST(postRequest(
      chainePour({ ...episode, assessmentEpisodeId: 'runtime-episode-PAT_TEST-T1', milestone: 'T1' as never }),
    ));
    expect(res.status).toBe(422);
    expect((await res.json()).reason).toBe('preconditions_non_remplies');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // REVUE P0-2 : l'écart identifiant ↔ jalon déclaré n'était fermé que dans un
  // sens. Le suffixe primait, donc déclarer `T1` sur l'identifiant d'un `J21`
  // faisait rendre `J21` : le rideau `D-052` ne s'évaluait PAS, et c'est
  // pourtant `milestone: 'T1'` qui partait en base et s'y relisait comme une
  // ancre. Un cycle s'ouvrait sans rideau d'entrée.
  it('REFUSE un épisode qui se contredit, dans les DEUX sens', async () => {
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      ancre('EPI_T0', 'T0', '2026-01-01T00:00:00.000Z'),
    ]);

    const ancreAnnonceeSurUnJalon = await POST(postRequest(
      chainePour({
        ...episode,
        assessmentEpisodeId: 'runtime-episode-PAT_TEST-T0-J21',
        milestone: 'T1' as never,
      }),
    ));
    expect(ancreAnnonceeSurUnJalon.status).toBe(422);
    expect((await ancreAnnonceeSurUnJalon.json()).error).toContain('incohérent');

    const jalonAnnonceSurUneAncre = await POST(postRequest(
      chainePour({
        ...episode,
        assessmentEpisodeId: 'runtime-episode-PAT_TEST-T0',
        milestone: 'J21' as never,
      }),
    ));
    expect(jalonAnnonceSurUneAncre.status).toBe(422);
    expect((await jalonAnnonceSurUneAncre.json()).error).toContain('incohérent');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ACCEPTE le jalon de mesure d’un DEUXIÈME cycle, sur sa propre ligne', async () => {
    // La clé primaire de l'épisode porte désormais le cycle : le `J21` du
    // cycle 1 ne squatte plus celle du `J21` du cycle 0, que l'`upsert`
    // `update: {}` aurait laissée intacte sous une réponse `ok: true`.
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      ancre('EPI_T0', 'T0', '2025-06-01T00:00:00.000Z'),
      ancre('EPI_T1', 'T1', '2025-12-01T00:00:00.000Z'),
    ]);
    const res = await POST(postRequest(
      chainePour({
        ...episode,
        assessmentEpisodeId: 'runtime-episode-PAT_TEST-T1-J21',
        milestone: 'J21' as never,
      }),
    ));
    expect(res.status).toBe(200);
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'runtime-episode-PAT_TEST-T1-J21' },
        create: expect.objectContaining({ milestone: 'J21', cycleId: 'EPI_T1' }),
      }),
    );
  });
});
