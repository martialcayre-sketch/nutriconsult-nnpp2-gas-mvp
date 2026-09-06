import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma, writes } = vi.hoisted(() => {
  const writes = {
    patientUpdate: vi.fn(),
    responseCreate: vi.fn(),
    consultationUpdate: vi.fn(),
  };
  return {
    getServerSession: vi.fn(),
    writes,
    prisma: {
      patient: { findUnique: vi.fn(), findFirst: vi.fn(), update: writes.patientUpdate },
      questionnaireReponse: { findMany: vi.fn(), create: writes.responseCreate },
      consultation: { findFirst: vi.fn(), update: writes.consultationUpdate },
      // `findMany` : lecture d'un état passé (SP-TT). `findFirst` : ancre du
      // cycle courant pour les jalons post-T0 (revue LOT-07, B2).
      // `findUnique` : rejeu d'un épisode persisté par le GET (`D-118`) ;
      // `upsert` : persistance de l'épisode à la confirmation (`D-118`).
      assessmentEpisode: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
      // Sélection praticien d'une priorité (`D-127`) : relue aux DEUX sites de
      // construction de carte. Vide par défaut ⇒ `selectionPraticien: null`,
      // c'est-à-dire l'état d'un dossier où personne n'a encore choisi.
      decisionPrioritySelection: { findMany: vi.fn() },
      // Préconditions de confirmation T0 (D-052).
      syntheseIA: { findFirst: vi.fn() },
      // Journal des accès (G-TRUST-04) : écriture d'audit, pas clinique.
      journalAccesDossier: { create: vi.fn(), deleteMany: vi.fn() },
    },
  };
});

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import {
  CONSULTATION_VALIDEE_FIXTURE,
  DATE_RIDEAU_FIXTURE,
  PLAINTES_DIGESTIF_ET_PONDERAL,
  SYNTHESE_VALIDEE_FIXTURE,
  passationsRideauT0,
  reponsesRuntimeRideauT0,
} from '@/lib/clinical-engine/dossierT0Fixture';
import { canonicalSha256 } from '@/lib/clinical-engine/canonical';
import { PRIORITY_RULES_METADATA } from '@/lib/clinical/priorityRulesV1';
import { GET, POST } from './route';

const patient = { idPatient: 'PAT_TEST', createdAt: new Date('2026-01-01T00:00:00.000Z') };
const rawAnswers = { P1: '2', P2: '2', P3: '1', P4: '1', P5: '1', P6: '1', P7: '1', P8: '1' };

// DEUX LECTURES DISTINCTES DES PASSATIONS, et le mock les distingue comme la
// route les distingue (D-052) : `loadRuntimeInputs` compose l'ÉPISODE (il
// sélectionne `idReponse`), `chargerEntreesPreconditionsT0` évalue les
// PRÉCONDITIONS (il ne le sélectionne pas). Les garder séparées permet de
// décrire un dossier qui confirme sans gonfler la proposition d'épisode.
/** Branche les deux lectures : l'épisode sur `rows`, les préconditions sur `dossier`. */
function brancherPassations(rows: unknown[], dossier: unknown[] = passationsRideauT0()) {
  prisma.questionnaireReponse.findMany.mockImplementation((args?: { select?: Record<string, unknown> }) =>
    Promise.resolve(args?.select?.idReponse ? rows : dossier));
}

const responses = [
  {
    idReponse: 'REP_T0', idQuestionnaire: 'Q_SOM_06',
    dateReponse: new Date('2026-01-01T00:00:00.000Z'), scoresJson: { rawAnswers },
  },
  {
    idReponse: 'REP_J21', idQuestionnaire: 'Q_SOM_06',
    dateReponse: new Date('2026-01-22T00:00:00.000Z'), scoresJson: { rawAnswers },
  },
];

function getRequest(query = 'idPatient=PAT_TEST'): Request {
  return new Request(`http://localhost/api/praticien/cockpit?${query}`);
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/praticien/cockpit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function proposal(milestone: 'T0' | 'J21' = 'T0') {
  const response = await GET(getRequest(`idPatient=PAT_TEST&milestone=${milestone}`));
  return response.json() as Promise<{ proposalHash: string; proposal: { inWindowResponseIds: string[] } }>;
}

describe('/api/praticien/cockpit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findFirst.mockResolvedValue(patient);
    // Aucune sélection praticien par défaut (`D-127`).
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    // Aucune ancre confirmée par défaut. Depuis `D-113` la lecture des ancres
    // passe par `findMany` + filtre de forme : `findFirst` sur `milestone:
    // 'T0'` ne voyait pas les cycles rouverts.
    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
    // Aucun épisode persisté par défaut (`D-118`) : le GET sert la proposition,
    // le POST écrit sa première ligne.
    prisma.assessmentEpisode.findUnique.mockResolvedValue(null);
    prisma.assessmentEpisode.upsert.mockResolvedValue({});
    brancherPassations(responses);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.consultation.findFirst.mockResolvedValue({
      anamnese: { motif_principal: 'Fatigue', objectif_prioritaire: 'Énergie', attentes: ['Comprendre'] },
    });
  });

  it('exige une session et valide patient et jalon', async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest())).status).toBe(401);
    expect((await GET(getRequest('idPatient=&milestone=T0'))).status).toBe(400);
    expect((await GET(getRequest('idPatient=PAT_TEST&milestone=J7'))).status).toBe(400);
  });

  it('répond 404 pour un patient absent sans charger ses données liées', async () => {
    prisma.patient.findFirst.mockResolvedValueOnce(null);
    const response = await GET(getRequest());
    expect(response.status).toBe(404);
    expect(prisma.questionnaireReponse.findMany).not.toHaveBeenCalled();
    expect(prisma.consultation.findFirst).not.toHaveBeenCalled();
    // Un refus ne se journalise jamais : la ligne nommerait un dossier non lu.
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('GET accessible journalise la lecture au gabarit littéral (G-TRUST-04)', async () => {
    await GET(getRequest());
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledWith({
      data: {
        idPatient: 'PAT_TEST',
        praticienEmail: 'praticien@wellneuro.fr',
        route: '/api/praticien/cockpit',
        methode: 'GET',
      },
    });
  });

  it('propose T0 par défaut et J21 sur demande avec réponses dans et hors fenêtre', async () => {
    const t0Response = await GET(getRequest());
    const t0 = await t0Response.json();
    expect(t0Response.status).toBe(200);
    expect(t0).toMatchObject({
      status: 'proposal_required',
      proposal: { milestone: 'T0', inWindowResponseIds: ['REP_T0'], outOfWindowResponseIds: ['REP_J21'] },
    });
    expect(t0.proposalHash).toHaveLength(64);

    const j21 = await proposal('J21');
    expect(j21.proposal.inWindowResponseIds).toEqual(['REP_J21']);
  });

  it('fenêtre un jalon de mesure sur l’ANCRE CONFIRMÉE, jamais sur la première réponse (B2)', async () => {
    // Première réponse le 1er janvier, ancre confirmée le 20 : la fenêtre du
    // J21 se calcule depuis le 20 (l'ancre de la trajectoire et de
    // `resoudreJalonDu`), pas depuis le 1er — sinon le jalon proposé à
    // l'écran et l'épisode construit ici sont disjoints dès 16 jours d'écart.
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      { id: 'EPI_T0', cycleId: 'EPI_T0', milestone: 'T0', confirmedAt: new Date('2026-01-20T00:00:00.000Z') },
    ]);
    const response = await GET(getRequest('idPatient=PAT_TEST&milestone=J21'));
    const payload = await response.json();
    expect(payload.proposal.targetAt).toBe('2026-02-10T00:00:00.000Z'); // 20 janv. + 21 j
    expect(prisma.assessmentEpisode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ milestone: { startsWith: 'T' } }) }),
    );
  });

  it('le J21 d’un cycle ROUVERT se compte depuis le T1, jamais depuis le T0 (`D-113`)', async () => {
    // Deux ancres : le premier cycle en janvier, le second en mars. La lecture
    // retenait « le T0 le plus récent » — il n'y en a qu'un, et c'est celui de
    // janvier : le J21 du deuxième cycle aurait été fenêtré deux mois trop tôt.
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      { id: 'EPI_T0', cycleId: 'EPI_T0', milestone: 'T0', confirmedAt: new Date('2026-01-20T00:00:00.000Z') },
      { id: 'EPI_T1', cycleId: 'EPI_T1', milestone: 'T1', confirmedAt: new Date('2026-03-20T00:00:00.000Z') },
    ]);
    const response = await GET(getRequest('idPatient=PAT_TEST&milestone=J21'));
    const payload = await response.json();
    expect(payload.proposal.targetAt).toBe('2026-04-10T00:00:00.000Z'); // 20 mars + 21 j
  });

  it('une ancre, elle, ne consulte aucune autre ancre pour se fenêtrer', async () => {
    await proposal('T0');
    // Une seule lecture, celle de la garde de recevabilité — jamais pour
    // calculer une fenêtre : une ancre est le jour 0 de son propre cycle.
    expect(prisma.assessmentEpisode.findMany).not.toHaveBeenCalled();
  });

  it('autorise une proposition vide', async () => {
    brancherPassations([]);
    const response = await GET(getRequest());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.proposal.candidateResponses).toEqual([]);
    expect(payload.proposal.sourceDateRange).toBeNull();
  });

  it('confirme explicitement puis construit une chaîne prudente et versionnée', async () => {
    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ready');
    expect(payload.snapshot.patientContext).toMatchObject({ mainReason: 'Fatigue', priorityGoal: 'Énergie' });
    expect(payload.snapshot.versions.snapshotSchema).toBe('c1-clinical-snapshot-v1');
    expect(payload.snapshot.versions.questionnaireScoring[0].version).toBeNull();
    // TABLE DES PRIORITÉS SIGNÉE depuis [[D-061]] : ce cas décrit toujours ce
    // que la production sert, mais la production a changé. L'abstention n'est
    // plus « non évaluée » faute de règle signée — elle est ÉVALUÉE, et elle
    // répond `required` sur ce dossier. La chaîne reste prudente, pour une
    // raison désormais motivée au lieu d'être un défaut de verrou.
    expect(payload.review.abstention.status).toBe('required');
    expect(payload.decisionCard).toMatchObject({
      priorityCandidates: [], proposedMainPriorityId: null, selectedMainPriority: null,
      abstention: { status: 'required' },
    });
    expect(payload.decisionCard.limitations).toContain(
      'Aucune priorité ne peut être proposée avant une évaluation explicite de l’abstention et la revue des bloqueurs.'
    );
    // Le canal de plainte n'est pas dans cet épisode (une seule passation
    // `Q_SOM_06`) : `null`, jamais une plainte inventée à partir de rien.
    expect(payload.plainteDominante).toBeNull();
  });

  it('accepte une correction explicite hors fenêtre et refuse un identifiant inconnu', async () => {
    const proposed = await proposal();
    const corrected = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: ['REP_J21'], proposalHash: proposed.proposalHash,
    }));
    expect(corrected.status).toBe(200);
    expect((await corrected.json()).snapshot.assessmentEpisode.includedResponseIds).toEqual(['REP_J21']);

    const unknown = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: ['REP_INCONNUE'], proposalHash: proposed.proposalHash,
    }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ status: 'unavailable', reason: 'invalid_payload' });
  });

  it('refuse une proposition périmée et un payload invalide', async () => {
    const stale = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: [], proposalHash: 'hash-obsolete',
    }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ status: 'unavailable', reason: 'proposal_stale' });

    const invalid = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'J7', includedResponseIds: [], proposalHash: 'x',
    }));
    expect(invalid.status).toBe(400);
  });

  it('invalide la proposition si le contenu clinique change à identifiants constants', async () => {
    const proposed = await proposal();
    prisma.questionnaireReponse.findMany.mockResolvedValueOnce([
      { ...responses[0], scoresJson: { rawAnswers: { ...rawAnswers, P1: '3' } } },
      responses[1],
    ]);
    const responseChanged = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: ['REP_T0'], proposalHash: proposed.proposalHash,
    }));
    expect(responseChanged.status).toBe(409);

    const proposedAgain = await proposal();
    prisma.consultation.findFirst.mockResolvedValueOnce({
      anamnese: { motif_principal: 'Motif corrigé', objectif_prioritaire: 'Énergie', attentes: ['Comprendre'] },
    });
    const contextChanged = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: ['REP_T0'], proposalHash: proposedAgain.proposalHash,
    }));
    expect(contextChanged.status).toBe(409);
  });

  // PRÉCONDITIONS T0 (D-052) — critère 1 du Lot C : le refus est porté par
  // l'API, pas seulement par l'écran.
  it('refuse un T0 sans premier rideau, et nomme ce qui manque', async () => {
    brancherPassations(responses, []);
    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    const payload = await response.json();
    expect(response.status).toBe(422);
    expect(payload).toMatchObject({ status: 'unavailable', reason: 'preconditions_non_remplies' });
    expect(payload.error).toContain('Q_MOD_03');
  });

  it('refuse un T0 dont l’anamnèse validée ne porte pas de motif', async () => {
    prisma.consultation.findFirst.mockResolvedValue({ anamnese: {} });
    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('motif principal');
  });

  it('refuse un T0 dont la synthèse validée est antérieure au rideau', async () => {
    prisma.syntheseIA.findFirst.mockResolvedValue({
      statut: 'Validee_Praticien', dateValidation: new Date('2025-01-01T00:00:00.000Z'),
    });
    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('antérieure');
  });

  // Les jalons de suivi ne sont pas gouvernés par cette porte : le lot pose les
  // préconditions du point d'entrée, il ne touche pas aux jalons.
  it('ne pose aucune précondition sur un jalon de suivi (J21)', async () => {
    brancherPassations(responses, []);
    const proposed = await proposal('J21');
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'J21',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    expect(response.status).toBe(200);
  });

  it('la checklist voyage avec la proposition, jamais en lecture d’un état passé', async () => {
    const present = await (await GET(getRequest())).json();
    expect(present.preconditions.bloquant).toBe(false);
    expect(present.preconditions.dures).toHaveLength(3);

    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
    // Le 400 « date inconnue » rendrait ce cas vert pour la mauvaise raison :
    // on exige une lecture passée RÉUSSIE, sans checklist.
    const reponsePassee = await GET(getRequest('idPatient=PAT_TEST&asOf=2026-01-01'));
    expect(reponsePassee.status).toBe(200);
    const passe = await reponsePassee.json();
    expect(passe.asOf).not.toBeNull();
    expect(passe.preconditions).toBeUndefined();
  });

  it('n’écrit que l’épisode — jamais le patient, les réponses ni la consultation', async () => {
    // Le journal des accès (G-TRUST-04) écrit sur le GET — écriture d'audit,
    // hors périmètre de cette assertion qui protège l'état clinique. Depuis
    // `D-118`, le POST écrit UNE chose : l'épisode confirmé. Cette assertion
    // borne la persistance à cette seule table — c'est elle qui rougirait si
    // la confirmation se mettait à toucher au dossier lui-même.
    await GET(getRequest());
    const proposed = await proposal();
    await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: ['REP_T0'], proposalHash: proposed.proposalHash,
    }));
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledTimes(1);
    expect(writes.patientUpdate).not.toHaveBeenCalled();
    expect(writes.responseCreate).not.toHaveBeenCalled();
    expect(writes.consultationUpdate).not.toHaveBeenCalled();
  });

  it('le POST (confirmation) ne journalise pas — GD-1 ne porte que sur les GET', async () => {
    const proposed = await proposal();
    prisma.journalAccesDossier.create.mockClear();
    await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: ['REP_T0'], proposalHash: proposed.proposalHash,
    }));
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });
});

describe('/api/praticien/cockpit — lecture d’un état passé (SP-TT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findFirst.mockResolvedValue(patient);
    // Aucune sélection praticien par défaut (`D-127`).
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    brancherPassations(responses);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.consultation.findFirst.mockResolvedValue({ anamnese: {} });
    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
  });

  it('sans `asOf`, rien ne change : la lecture reste au présent', async () => {
    const res = await GET(getRequest('idPatient=PAT_TEST'));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.asOf ?? null).toBeNull();
    // Les épisodes ne sont même pas lus tant qu'aucune date n'est demandée.
    expect(prisma.assessmentEpisode.findMany).not.toHaveBeenCalled();
    expect(payload.proposal.candidateResponses).toHaveLength(2);
  });

  it('à un repère connu, aucune donnée postérieure ne subsiste', async () => {
    const res = await GET(getRequest('idPatient=PAT_TEST&asOf=2026-01-01T00:00:00.000Z'));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.asOf).toBe('2026-01-01T00:00:00.000Z');
    // La réponse du 22/01 n'existait pas le 01/01 : elle ne doit pas apparaître.
    expect(payload.proposal.candidateResponses).toHaveLength(1);
  });

  it('une date arbitraire est refusée, jamais ramenée au présent en silence', async () => {
    const res = await GET(getRequest('idPatient=PAT_TEST&asOf=2026-01-15T00:00:00.000Z'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('invalid_payload');
    // Le dossier a été résolu et ses données lues avant le refus de date :
    // la lecture est journalisée (même principe que le 422 de booklet).
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledTimes(1);
  });

  it('une date illisible est refusée', async () => {
    const res = await GET(getRequest('idPatient=PAT_TEST&asOf=hier'));
    expect(res.status).toBe(400);
  });

  it('aucune écriture n’est possible en mode passé', async () => {
    const res = await POST(
      new Request('http://localhost/api/praticien/cockpit?asOf=2026-01-01T00:00:00.000Z', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: 'PAT_TEST', milestone: 'T0' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/état passé/);
    // Le refus intervient AVANT toute lecture, donc avant toute écriture.
    expect(prisma.patient.findFirst).not.toHaveBeenCalled();
  });
});

// LA LIAISON ROUTE → SERVICE — [[D-050]].
//
// Le banc de `ClinicalRuntimeSection` garde le maillon composant ← réponse,
// mais il mocke `fetch` : il ne dit rien de ce que la ROUTE met dans cette
// réponse. Un `contradictions: []` codé en dur ici compilerait et laisserait
// tous les autres bancs verts — c'est précisément le défaut que le câblage
// prétend fermer, d'un cran en amont.
describe('/api/praticien/cockpit — les constats déterministes traversent la route', () => {
  // Dossier confirmable : sans lui, ce bloc héritait des mocks du describe
  // précédent (anamnèse vide), que les préconditions T0 refusent désormais.
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findFirst.mockResolvedValue(patient);
    // Aucune sélection praticien par défaut (`D-127`).
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    brancherPassations(responses);
    prisma.consultation.findFirst.mockResolvedValue(CONSULTATION_VALIDEE_FIXTURE);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
  });

  it('propage ce que le service rend, sans le filtrer ni le reconstruire', async () => {
    const constat = {
      id: 'C-STR',
      forme: 'DISCORDANCE' as const,
      description: 'Une contradiction que le praticien doit voir.',
      actionSuggeree: 'Clarifier en entretien.',
      hypotheses: [],
      limitations: [],
      passations: [{ idQuestionnaire: 'Q_MOD_01', date: '2026-03-12', dateLisible: '12/03/2026' }],
      ecartJours: null,
      claims: [{ claimId: 'WN-CL-0238-002', versionClaim: 'v1.0' }],
      importance: 'useful_not_urgent' as const,
      resolution: { statut: 'ouverte' as const },
      regleId: 'C-STR',
    };
    const service = await import('@/lib/clinical/contradictionsService');
    const espion = vi.spyOn(service, 'contradictionsPourPatient').mockResolvedValue([constat]);

    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
      // Une contradiction ouverte est une condition SOUPLE (D-052) : elle
      // n'interdit pas la confirmation, elle exige un motif écrit.
      overrides: [{ conditionId: 'contradictions_ouvertes', motif: 'Vue en entretien.' }],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Le contournement est tracé dans l'épisode, auteur et horodatage posés
    // par le serveur.
    expect(payload.snapshot.assessmentEpisode.preconditionOverrides).toMatchObject([
      { conditionId: 'contradictions_ouvertes', motif: 'Vue en entretien.', decidePar: 'praticien@wellneuro.fr' },
    ]);
    // Le service est appelé POUR CE PATIENT — pas pour un autre, pas sans
    // argument : c'est ce qui distingue une propagation d'un décor.
    expect(espion).toHaveBeenCalledWith('PAT_TEST');
    // DEUX APPELS, ET IL FAUT SAVOIR LEQUEL EST LEQUEL ([[D-103]]) : le premier
    // vient de `preconditionsT0Prisma`, à UN argument — il n'évalue aucun
    // conflit de sources, délibérément. Le second est celui de la route, à deux.
    // Sans cette distinction, l'assertion ci-dessus était satisfaite par le
    // premier appel et ne disait rien de ce que la route transmet.
    expect(espion.mock.calls.at(-1)).toEqual(['PAT_TEST', []]);
    expect(espion.mock.calls[0]).toEqual(['PAT_TEST']);
    expect(payload.contradictions).toEqual([constat]);
    espion.mockRestore();
  });

  it('verrou fermé (table non signée) ⇒ la route rend une liste vide', async () => {
    // L'état réel du dépôt : le service n'est pas doublé ici, c'est le vrai
    // double verrou qui répond. Sans ce cas, le banc précédent prouverait la
    // propagation sans rien dire de ce qui sort en production.
    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));

    expect((await response.json()).contradictions).toEqual([]);
  });

  // ── La dérivation des claims cités ([[D-103]]) ────────────────────────────
  // Relevé en revue : l'affirmation « verrou fermé, la route ne fait aucune
  // requête de plus qu'avant » n'était prouvée par rien, et retirer le garde
  // `conflitsSourcesActifs()` laissait tous les bancs du lot verts.

  // VERROU FERMÉ ICI PAR LE DRAPEAU, pas par la signature — précisé après
  // [[D-104]] : le registre du dépôt est désormais SIGNÉ, et ce banc ne pose
  // jamais `WN_ENABLE_CONTRADICTIONS_NNPP2`. Il continue d'éprouver ce qu'il
  // doit — verrou fermé ⇒ aucune dérivation — mais par l'autre terme du ET, et
  // le dire évite de le lire comme une preuve sur la signature.
  it('verrou fermé ⇒ la proposition de bilan n’est PAS dérivée', async () => {
    const bio = await import('@/lib/biology-library/propositionService');
    const espionBio = vi.spyOn(bio, 'claimsCitesParLaPropositionBilan');

    const proposed = await proposal();
    await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));

    // C'est le coût du lot sur le chemin chaud : nul jusqu'à la signature.
    expect(espionBio).not.toHaveBeenCalled();
    espionBio.mockRestore();
  });

  // UNE VIGILANCE INFORMATIVE NE DOIT PAS ÉTEINDRE LA CONFIRMATION D'ÉPISODE.
  // Sans le `catch` de la route, une panne de cette dérivation — catalogue mal
  // formé, timeout base — rendait un 500 sur le chemin principal.
  it('registre signé mais dérivation en panne ⇒ 200, sans conflit', async () => {
    const service = await import('@/lib/clinical/contradictionsService');
    const bio = await import('@/lib/biology-library/propositionService');
    const espionVerrou = vi.spyOn(service, 'conflitsSourcesActifs').mockReturnValue(true);
    const espionBio = vi
      .spyOn(bio, 'claimsCitesParLaPropositionBilan')
      .mockRejectedValue(new Error('catalogue indisponible'));

    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).contradictions).toEqual([]);
    expect(espionBio).toHaveBeenCalled();
    espionVerrou.mockRestore();
    espionBio.mockRestore();
  });

  it('registre signé ⇒ les claims cités descendent au service', async () => {
    const service = await import('@/lib/clinical/contradictionsService');
    const bio = await import('@/lib/biology-library/propositionService');
    const cites = [{ claimId: 'WN-CL-0312-018', versionClaim: 'v1.0' }];
    const espionVerrou = vi.spyOn(service, 'conflitsSourcesActifs').mockReturnValue(true);
    const espionBio = vi
      .spyOn(bio, 'claimsCitesParLaPropositionBilan')
      .mockResolvedValue(cites);
    const espionService = vi
      .spyOn(service, 'contradictionsPourPatient')
      .mockResolvedValue([]);

    const proposed = await proposal();
    await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));

    // Le dernier appel est celui de la route ; le premier vient des
    // préconditions T0, qui n'évaluent aucun conflit.
    expect(espionService.mock.calls.at(-1)).toEqual(['PAT_TEST', cites]);
    espionVerrou.mockRestore();
    espionBio.mockRestore();
    espionService.mockRestore();
  });
});

// LE CRITÈRE CENTRAL DU LOT-04 ([[D-054]]) : « plus aucun `not_evaluated` après
// confirmation T0 » — QUAND la table des priorités est signée.
//
// LES DEUX POSITIONS DU VERROU SONT ÉPROUVÉES, et c'est le point : le describe
// précédent décrit la production d'aujourd'hui (table non signée, décision
// suspendue), celui-ci décrit ce que la signature praticien déclenchera. Un banc
// qui n'éprouverait que la position ouverte laisserait le merge sans garde ; un
// banc qui n'éprouverait que la fermée laisserait le lot sans preuve.
describe('/api/praticien/cockpit — chaîne C1 rebranchée, table signée', () => {
  const runtimeGolden = reponsesRuntimeRideauT0(DATE_RIDEAU_FIXTURE, PLAINTES_DIGESTIF_ET_PONDERAL);
  const dossierGolden = passationsRideauT0(DATE_RIDEAU_FIXTURE, PLAINTES_DIGESTIF_ET_PONDERAL);

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findFirst.mockResolvedValue(patient);
    // Aucune sélection praticien par défaut (`D-127`).
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    brancherPassations(runtimeGolden, dossierGolden);
    prisma.consultation.findFirst.mockResolvedValue({
      anamnese: {
        motif_principal: 'Ballonnements et prise de poids depuis un an.',
        objectif_prioritaire: 'Retrouver un confort digestif',
      },
    });
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    PRIORITY_RULES_METADATA.validationExterne = true;
    PRIORITY_RULES_METADATA.dateValidation = '2026-08-12T00:00:00.000Z';
  });

  afterEach(() => {
    PRIORITY_RULES_METADATA.validationExterne = false;
    PRIORITY_RULES_METADATA.dateValidation = null;
  });

  async function confirmer(overrides: unknown[] = []) {
    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
      overrides,
    }));
    return { statut: response.status, payload: await response.json() };
  }

  it('l’abstention est évaluée, et deux priorités justifiées sont proposées', async () => {
    const { statut, payload } = await confirmer();
    expect(statut).toBe(200);
    expect(payload.review.abstention.status).toBe('not_required');
    expect(payload.decisionCard.abstention.status).not.toBe('not_evaluated');
    expect(payload.decisionCard.priorityCandidates.map((c: { ruleId: string }) => c.ruleId))
      .toEqual(['PRIO-PON-01', 'PRIO-DIG-01']);
    // La sélection reste un geste praticien : la route en PROPOSE une, elle n'en
    // sélectionne aucune.
    expect(payload.decisionCard.proposedMainPriorityId).toBe('priority:PRIO-PON-01');
    expect(payload.decisionCard.selectedMainPriority).toBeNull();
  });

  it('la plainte dominante et l’objectif prioritaire traversent la route', async () => {
    const { payload } = await confirmer();
    expect(payload.plainteDominante).toEqual({
      domaine: 'surpoids', libelle: 'Surpoids', valeur: 9, bande: 'Intensité très élevée',
    });
    // L'objectif prioritaire voyage dans le snapshot, où il est haché : l'écran
    // le lit là, jamais dans un champ recalculé côté navigateur.
    expect(payload.snapshot.patientContext.priorityGoal).toBe('Retrouver un confort digestif');
  });

  // ÉCART DU LOT, ÉPROUVÉ PLUTÔT QU'AFFIRMÉ ([[D-054]], arbitrage 4). Le critère
  // « stress au mieux mineur si C-STR ouvert » est tenu PAR CONSTRUCTION : la V1
  // ne porte aucune règle d'axe stress et aucun pont ne relie les règles d'arrêt
  // aux priorités. Une contradiction ouverte ne fait donc apparaître aucune
  // priorité de stress — ni en tête, ni ailleurs.
  it('une contradiction de stress ouverte ne produit aucune priorité de stress', async () => {
    const service = await import('@/lib/clinical/contradictionsService');
    const espion = vi.spyOn(service, 'contradictionsPourPatient').mockResolvedValue([{
      id: 'C-STR',
      forme: 'DISCORDANCE' as const,
      description: 'Une contradiction que le praticien doit voir.',
      actionSuggeree: 'Clarifier en entretien.',
      hypotheses: [], limitations: [],
      passations: [{ idQuestionnaire: 'Q_MOD_01', date: '2026-03-12', dateLisible: '12/03/2026' }],
      ecartJours: null,
      claims: [{ claimId: 'WN-CL-0238-002', versionClaim: 'v1.0' }],
      importance: 'useful_not_urgent' as const,
      resolution: { statut: 'ouverte' as const },
      regleId: 'C-STR',
    }]);

    // Une contradiction ouverte est une condition SOUPLE : elle exige un motif,
    // elle n'interdit pas la confirmation.
    const { statut, payload } = await confirmer([
      { conditionId: 'contradictions_ouvertes', motif: 'Vue en entretien.' },
    ]);
    expect(statut).toBe(200);
    expect(espion).toHaveBeenCalledWith('PAT_TEST');
    expect(payload.contradictions).toHaveLength(1);
    for (const candidat of payload.decisionCard.priorityCandidates) {
      expect(candidat.ruleId).not.toMatch(/STR/);
      expect(String(candidat.label).toLowerCase()).not.toContain('stress');
    }
    espion.mockRestore();
  });

  // Un dossier dont le canal de plainte est retiré de l'épisode : la table ne
  // peut RIEN évaluer, et l'absence ne devient pas une normalité (`DC-24`).
  it('canal de plainte hors épisode ⇒ abstention requise, décision toujours bloquée', async () => {
    const proposed = await proposal();
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds.filter(id => id !== 'REP_Q_MOD_03'),
      proposalHash: proposed.proposalHash,
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.review.abstention.status).toBe('required');
    expect(payload.decisionCard.priorityCandidates).toEqual([]);
    expect(payload.plainteDominante).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// `D-113` — ouvrir un cycle est un acte gardé, quel que soit son rang.
// ---------------------------------------------------------------------------
describe('/api/praticien/cockpit — ouverture d’un cycle (`D-113`)', () => {
  const t0Pose = {
    id: 'EPI_T0', cycleId: 'EPI_T0', milestone: 'T0',
    confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findFirst.mockResolvedValue(patient);
    // Aucune sélection praticien par défaut (`D-127`).
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([t0Pose]);
    brancherPassations(responses);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.consultation.findFirst.mockResolvedValue({
      anamnese: { motif_principal: 'Fatigue', objectif_prioritaire: 'Énergie', attentes: ['Comprendre'] },
    });
  });

  async function propositionAncre(milestone: string) {
    const response = await GET(getRequest(`idPatient=PAT_TEST&milestone=${milestone}`));
    return response.json() as Promise<{ proposalHash: string; proposal: { inWindowResponseIds: string[] } }>;
  }

  it('accepte `T1` comme jalon : la porte de forme n’est plus une liste fermée', async () => {
    const response = await GET(getRequest('idPatient=PAT_TEST&milestone=T1'));
    expect(response.status).toBe(200);
    expect((await response.json()).proposal.milestone).toBe('T1');
  });

  it('REFUSE `T01` et `TA` — deux écritures d’un même cycle, ou un nom que rien ne relit', async () => {
    for (const forme of ['T01', 'TA', 'T']) {
      expect((await GET(getRequest(`idPatient=PAT_TEST&milestone=${forme}`))).status).toBe(400);
    }
  });

  it('LE RIDEAU D’ENTRÉE VAUT POUR TOUTE ANCRE, pas seulement pour `T0` ([[D-052]])', async () => {
    // « Point d'entrée » se lisait `=== 'T0'`. Ouvrir un deuxième cycle est le
    // même acte : sans cette extension, `T1` aurait été un chemin d'ancrage
    // sans rideau.
    brancherPassations(responses, []);
    const proposed = await propositionAncre('T1');
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T1',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'preconditions_non_remplies' });
  });

  it('REFUSE une ancre dont le rang saute — le `milestone` vient du navigateur', async () => {
    const proposed = await propositionAncre('T7');
    const response = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T7',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('sous ce nom');
  });

  it('la fenêtre d’une ancre qui ROUVRE un suivi se centre sur la dernière réponse', async () => {
    // `T0` se centre sur la PREMIÈRE réponse du dossier — un dossier qui
    // s'ouvre. `T1` sur la DERNIÈRE : reprendre la première aurait centré la
    // fenêtre du nouveau cycle sur un état vieux de plusieurs mois, et
    // l'épisode d'ouverture aurait été confirmé vide.
    const ancre = await propositionAncre('T1');
    expect(ancre.proposal.inWindowResponseIds).toEqual(['REP_J21']);

    const premiere = await propositionAncre('T0');
    expect(premiere.proposal.inWindowResponseIds).toEqual(['REP_T0']);
  });
});

// D-118 — L'ÉPISODE CONFIRMÉ SE PERSISTE À LA CONFIRMATION, ET LE GET LE REJOUE.
//
// Ce que ce banc éprouve, dans l'ordre du défaut d'origine : un praticien
// confirmait T0 le matin, rechargeait la page, et l'écran affichait « en
// attente » sur un acte déjà posé. Le POST écrit désormais (3e point de
// persistance), le GET sait rejouer — et le rejeu reproduit EXACTEMENT la
// carte d'origine, identifiants compris, sinon versions/diffusion/check-ins
// perdraient leur fil.
describe('/api/praticien/cockpit — persistance et rejeu de l’épisode (`D-118`)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findFirst.mockResolvedValue(patient);
    // Aucune sélection praticien par défaut (`D-127`).
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
    prisma.assessmentEpisode.findUnique.mockResolvedValue(null);
    prisma.assessmentEpisode.upsert.mockResolvedValue({});
    brancherPassations(responses);
    prisma.syntheseIA.findFirst.mockResolvedValue(SYNTHESE_VALIDEE_FIXTURE);
    prisma.consultation.findFirst.mockResolvedValue({
      anamnese: { motif_principal: 'Fatigue', objectif_prioritaire: 'Énergie', attentes: ['Comprendre'] },
    });
  });

  async function confirmerT0() {
    const proposed = await proposal();
    return POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
  }

  it('le POST persiste l’épisode confirmé — l’ancre ouvre son propre cycle (gate G2)', async () => {
    const res = await confirmerT0();
    expect(res.status).toBe(200);
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledTimes(1);
    const args = prisma.assessmentEpisode.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'runtime-episode-PAT_TEST-T0' });
    // Idempotence des points de persistance : une ligne posée ne se réécrit pas.
    expect(args.update).toEqual({});
    expect(args.create.milestone).toBe('T0');
    expect(args.create.cycleId).toBe('runtime-episode-PAT_TEST-T0');
    // Le blob se recoupe : c'est ce qui rend le rejeu vérifiable.
    expect(args.create.payloadHash).toBe(canonicalSha256(args.create.payload));
  });

  it('refuse d’écrire une ancre déjà posée sous un autre épisode (N1.1, 3e point)', async () => {
    const proposed = await proposal();
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      { id: 'EPISODE_ETRANGER', cycleId: null, confirmedAt: new Date('2026-01-05T00:00:00.000Z'), milestone: 'T0' },
    ]);
    const res = await POST(postRequest({
      idPatient: 'PAT_TEST', milestone: 'T0',
      includedResponseIds: proposed.proposal.inWindowResponseIds,
      proposalHash: proposed.proposalHash,
    }));
    expect(res.status).toBe(422);
    const payload = await res.json();
    expect(payload.reason).toBe('preconditions_non_remplies');
    expect(payload.error).toContain('sous un autre épisode');
    expect(prisma.assessmentEpisode.upsert).not.toHaveBeenCalled();
  });

  it('le GET rejoue l’épisode persisté : même carte, mêmes identifiants, marqueur `rejoue`', async () => {
    const post = await confirmerT0();
    const postPayload = await post.json();
    const create = prisma.assessmentEpisode.upsert.mock.calls[0][0].create;
    prisma.assessmentEpisode.findUnique.mockResolvedValue({
      payload: create.payload, payloadHash: create.payloadHash,
    });
    const get = await GET(getRequest('idPatient=PAT_TEST&milestone=T0'));
    const payload = await get.json();
    expect(payload.status).toBe('ready');
    expect(payload.rejoue).toBe(true);
    // Les identifiants d'enveloppe sont CEUX D'ORIGINE — versions, diffusion et
    // check-ins sont retrouvés par `decisionCardId`, un rejeu qui en changerait
    // orphelinerait tout le fil.
    expect(payload.decisionCard.decisionCardId).toBe(postPayload.decisionCard.decisionCardId);
    // Même horodatage (celui de la confirmation) ⇒ mêmes empreintes : le rejeu
    // est la carte d'origine, pas une réédition.
    expect(payload.decisionCard.inputHash).toBe(postPayload.decisionCard.inputHash);
    // Un GET ne réécrit rien.
    expect(prisma.assessmentEpisode.upsert).toHaveBeenCalledTimes(1);
  });

  it('un POST qui rend `ready` ne pose jamais le marqueur `rejoue`', async () => {
    const post = await confirmerT0();
    expect('rejoue' in (await post.json())).toBe(false);
  });

  // ── LA PÉREMPTION D'UNE SÉLECTION, JUSQU'À L'ÉCRAN ([[D-127]] §11) ─────────
  //
  // La carte servie après un écart est celle construite SANS la sélection :
  // elle est en tout point indiscernable de celle d'un dossier où personne n'a
  // jamais choisi. Sans ce drapeau, un acte praticien cesse d'être servi en
  // silence — le défaut que `D-127` avait nommé sans le traiter.
  const selectionPerimee = [{
    id: 'SEL_1',
    candidateId: 'priority:REGLE_QUI_NE_SE_DECLENCHE_PLUS',
    rationale: 'Motif consigné à l’époque du choix.',
    selectedAt: new Date('2026-01-03T00:00:00.000Z'),
    supersedesSelectionId: null,
  }];

  it('le GET rejoue en SIGNALANT la sélection écartée, sans lâcher l’épisode confirmé', async () => {
    await confirmerT0();
    const create = prisma.assessmentEpisode.upsert.mock.calls[0][0].create;
    prisma.assessmentEpisode.findUnique.mockResolvedValue({
      payload: create.payload, payloadHash: create.payloadHash,
    });
    prisma.decisionPrioritySelection.findMany.mockResolvedValue(selectionPerimee);

    const payload = await (await GET(getRequest('idPatient=PAT_TEST&milestone=T0'))).json();
    // L'épisode CONFIRMÉ reste servi : une sélection périmée ne le renvoie pas
    // au formulaire, ce qui serait exactement la régression fermée par `D-118`.
    expect(payload.status).toBe('ready');
    expect(payload.rejoue).toBe(true);
    expect(payload.selectionEcartee).toBe(true);
    // Et la carte, elle, ne porte rien : c'est bien la SÉLECTION qui est
    // écartée, pas la chaîne.
    expect(payload.decisionCard.selectedMainPriority).toBeNull();
  });

  // Le POST le signale AUSSI : une re-confirmation du même épisode passe par
  // lui, et servir « prêt » sans le constat ferait disparaître la phrase au
  // premier re-clic.
  it('le POST signale lui aussi la sélection écartée', async () => {
    prisma.decisionPrioritySelection.findMany.mockResolvedValue(selectionPerimee);
    const payload = await (await confirmerT0()).json();
    expect(payload.status).toBe('ready');
    expect(payload.selectionEcartee).toBe(true);
  });

  it('aucune réponse ordinaire ne porte le drapeau de péremption', async () => {
    const post = await confirmerT0();
    expect('selectionEcartee' in (await post.json())).toBe(false);
    const create = prisma.assessmentEpisode.upsert.mock.calls[0][0].create;
    prisma.assessmentEpisode.findUnique.mockResolvedValue({
      payload: create.payload, payloadHash: create.payloadHash,
    });
    const get = await (await GET(getRequest('idPatient=PAT_TEST&milestone=T0'))).json();
    expect(get.rejoue).toBe(true);
    expect('selectionEcartee' in get).toBe(false);
  });

  it('ne rejoue pas un dossier dont le socle a bougé : la proposition reprend la main', async () => {
    await confirmerT0();
    const create = prisma.assessmentEpisode.upsert.mock.calls[0][0].create;
    // La fenêtre persistée ne correspond plus à la proposition recalculée —
    // l'empreinte du blob, elle, reste valide : c'est bien le SOCLE qui rejette.
    const altere = {
      ...(create.payload as Record<string, unknown>),
      window: { ...(create.payload as { window: object }).window, toleranceDays: 99 },
    };
    prisma.assessmentEpisode.findUnique.mockResolvedValue({
      payload: altere, payloadHash: canonicalSha256(altere),
    });
    const get = await GET(getRequest('idPatient=PAT_TEST&milestone=T0'));
    expect((await get.json()).status).toBe('proposal_required');
  });

  it('ne rejoue pas un payload qui ne se recoupe pas avec son empreinte (intégrité)', async () => {
    await confirmerT0();
    const create = prisma.assessmentEpisode.upsert.mock.calls[0][0].create;
    prisma.assessmentEpisode.findUnique.mockResolvedValue({
      payload: { ...(create.payload as Record<string, unknown>), confirmedAt: '2027-01-01T00:00:00.000Z' },
      payloadHash: create.payloadHash,
    });
    const get = await GET(getRequest('idPatient=PAT_TEST&milestone=T0'));
    expect((await get.json()).status).toBe('proposal_required');
  });

  it('la lecture datée (`asOf`) ne rejoue jamais : le passé se recompose, il ne se sanctionne pas', async () => {
    await confirmerT0();
    prisma.assessmentEpisode.findUnique.mockClear();
    const res = await GET(getRequest('idPatient=PAT_TEST&asOf=2026-01-01T00:00:00.000Z'));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('proposal_required');
    expect(prisma.assessmentEpisode.findUnique).not.toHaveBeenCalled();
  });
});
