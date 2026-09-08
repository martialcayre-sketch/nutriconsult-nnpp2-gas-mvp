import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    trustAdverseEffectReport: { findMany: vi.fn() },
    trustPrivacyIncident: { findMany: vi.fn() },
    trustRightsRequest: { findMany: vi.fn() },
    syntheseIA: { findMany: vi.fn(), groupBy: vi.fn() },
    assignation: { findMany: vi.fn() },
    questionnaireReponse: { findMany: vi.fn(), groupBy: vi.fn() },
    questionnaireLecturePraticien: { groupBy: vi.fn() },
    protocolCheckin: { findMany: vi.fn() },
    assessmentEpisode: { findMany: vi.fn() },
    rendezVous: { findMany: vi.fn() },
    patient: { findMany: vi.fn() },
    filCardRejection: { findMany: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { GET } from './route';
import { bornesJourParis } from '@/lib/fil/fuseau';

// L'accueil praticien (SP-FIL LOT-01) n'avait aucun test de route. Les gardes
// vérifiées ici sont celles dont dépend l'honnêteté du Fil : une session
// absente ne doit jamais produire un fil vide (« rien à traiter » serait faux),
// et un patient inactif ne doit jamais réapparaître dans les cartes.

describe('GET /api/praticien/fil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.trustAdverseEffectReport.findMany.mockResolvedValue([]);
    prisma.trustPrivacyIncident.findMany.mockResolvedValue([]);
    prisma.trustRightsRequest.findMany.mockResolvedValue([]);
    prisma.syntheseIA.findMany.mockResolvedValue([]);
    prisma.syntheseIA.groupBy.mockResolvedValue([]);
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    prisma.questionnaireReponse.groupBy.mockResolvedValue([]);
    prisma.questionnaireLecturePraticien.groupBy.mockResolvedValue([]);
    prisma.protocolCheckin.findMany.mockResolvedValue([]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([]);
    prisma.rendezVous.findMany.mockResolvedValue([]);
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.filCardRejection.findMany.mockResolvedValue([]);
  });

  it('sans session : 401 et `unavailable`, jamais un fil vide silencieux', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const payload = await res.json();
    expect(payload.unavailable).toBe(true);
    expect(prisma.assignation.findMany).not.toHaveBeenCalled();
  });

  it('aucune matière : 200 avec un fil vide et sans drapeau d’indisponibilité', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.cartes).toEqual([]);
    expect(payload.unavailable).toBeUndefined();
  });

  it('un patient inactif ne produit aucune carte', async () => {
    prisma.syntheseIA.findMany.mockResolvedValue([
      { idSynthese: 'SYN_1', idPatient: 'PAT_INACTIF', dateGeneration: new Date() },
    ]);
    // Le second appel ne remonte que les patients actifs : la carte doit
    // disparaître plutôt que d'afficher un patient sans nom.
    prisma.patient.findMany.mockResolvedValue([]);
    const res = await GET();
    const payload = await res.json();
    expect(payload.cartes).toEqual([]);
  });

  it('une synthèse en brouillon d’un patient actif produit une carte sourcée', async () => {
    prisma.syntheseIA.findMany.mockResolvedValue([
      { idSynthese: 'SYN_1', idPatient: 'PAT_SEED_01', dateGeneration: new Date('2026-07-20T09:00:00.000Z') },
    ]);
    prisma.patient.findMany.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' },
    ]);
    const res = await GET();
    const payload = await res.json();
    expect(payload.cartes.length).toBeGreaterThan(0);
    const carte = payload.cartes[0];
    expect(carte.patient).toContain('Sophie');
    // Chaque carte porte son « pourquoi maintenant » et une action explicite.
    expect(carte.pourquoi).toBeTruthy();
    expect(carte.href).toBeTruthy();
    expect(carte.actionLabel).toBeTruthy();
    // Prérequis de G1 : la carte agrégée est identifiée par patient + date de
    // référence (la synthèse la plus récente).
    expect(carte.cle).toBe('synthese_a_valider:agregat:PAT_SEED_01:2026-07-20T09:00:00.000Z');
  });

  // Le bug rapporté : l'inbox retire une réponse dès sa lecture confirmée,
  // et sans synthèse générée, le patient devenait invisible partout.
  it('un questionnaire lu sans synthèse générée produit une carte « à générer »', async () => {
    prisma.patient.findMany.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' },
    ]);
    prisma.questionnaireLecturePraticien.groupBy.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', _max: { luLe: new Date('2026-07-20T09:00:00.000Z') } },
    ]);

    const payload = await (await GET()).json();
    const carte = payload.cartes.find((c: { type: string }) => c.type === 'synthese_a_generer');
    expect(carte).toBeDefined();
    expect(carte.patient).toContain('Sophie');
    expect(carte.href).toBe('/dashboard/synthese?idPatient=PAT_SEED_01');
    expect(carte.cle).toBe('synthese_a_generer:agregat:PAT_SEED_01:2026-07-20T09:00:00.000Z');
  });

  it('une synthèse déjà générée après la lecture écarte la carte « à générer »', async () => {
    prisma.patient.findMany.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' },
    ]);
    prisma.questionnaireLecturePraticien.groupBy.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', _max: { luLe: new Date('2026-07-18T09:00:00.000Z') } },
    ]);
    prisma.syntheseIA.groupBy.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', _max: { dateGeneration: new Date('2026-07-19T09:00:00.000Z') } },
    ]);

    const payload = await (await GET()).json();
    expect(payload.cartes.some((c: { type: string }) => c.type === 'synthese_a_generer')).toBe(false);
  });

  // Sans l'identifiant dans le `select`, la clé vaudrait silencieusement
  // « …:undefined » : toutes les cartes d'un même type se confondraient, et un
  // refus persisté en emporterait d'autres. Le contrat se vérifie ici, à
  // l'endroit où il peut être cassé par inadvertance.
  it('chaque requête du Fil sélectionne l’identifiant de sa ligne source', async () => {
    await GET();
    const selectDe = (mock: { mock: { calls: { select?: Record<string, boolean> }[][] } }) =>
      mock.mock.calls[0][0].select ?? {};

    expect(selectDe(prisma.trustAdverseEffectReport.findMany).id).toBe(true);
    expect(selectDe(prisma.trustPrivacyIncident.findMany).id).toBe(true);
    expect(selectDe(prisma.trustRightsRequest.findMany).id).toBe(true);
    expect(selectDe(prisma.syntheseIA.findMany).idSynthese).toBe(true);
    expect(selectDe(prisma.assignation.findMany).idAssignation).toBe(true);
    expect(selectDe(prisma.protocolCheckin.findMany).id).toBe(true);
  });

  it('remonte les brouillons IA et praticien à valider', async () => {
    await GET();
    expect(prisma.syntheseIA.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { statut: { in: ['Brouillon_IA', 'Brouillon_Praticien'] } },
    }));
  });

  // Jalon J21 = check-in J21 soumis MOINS épisode J21 consigné.
  it('un check-in J21 sans épisode J21 produit une carte jalon', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.protocolCheckin.findMany.mockResolvedValue([
      { id: 'CHK_J21', idPatient: 'PAT_SEED_01', reponses: {}, soumisLe: new Date('2026-07-14T08:00:00.000Z') },
    ]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([]); // aucune décision consignée
    // momentumJalonsParPatient relit épisodes + réponses : rien de mesuré.
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);

    const payload = await (await GET()).json();
    const jalon = payload.cartes.find((c: { type: string }) => c.type === 'jalon_j21');
    expect(jalon).toBeDefined();
    expect(jalon.cle).toBe('jalon_j21:CHK_J21');
    expect(jalon.titre).toContain('Jalon J21');
  });

  it('un rendez-vous du jour produit une carte consultation vers le pré-vol', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    // Milieu du jour civil de Paris courant : toujours dans la fenêtre, quelle
    // que soit l'heure UTC d'exécution du test (le constructeur borne au jour
    // de Paris, pas au futur).
    const { debut } = bornesJourParis(new Date());
    const midiParis = new Date(debut.getTime() + 12 * 60 * 60 * 1000);
    prisma.rendezVous.findMany.mockResolvedValue([
      { id: 'RDV_1', idPatient: 'PAT_SEED_01', dateHeure: midiParis },
    ]);
    const payload = await (await GET()).json();
    const consultation = payload.cartes.find((c: { type: string }) => c.type === 'consultation_prevue');
    expect(consultation).toBeDefined();
    expect(consultation.cle).toBe('consultation_prevue:RDV_1');
    expect(consultation.href).toContain('/dashboard/copilote?idPatient=PAT_SEED_01');
  });

  // Le mock portait `[{ idPatient }]` SANS DATE : il affirmait qu'un épisode
  // J21 quelconque suffit à écarter le point d'étape — la règle que [[D-151]]
  // corrige. Il porte désormais un `confirmedAt` POSTÉRIEUR à la soumission,
  // seul cas où l'écartement est vrai.
  it('un point d’étape J21 tranché par un épisode POSTÉRIEUR ne produit aucune carte jalon', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.protocolCheckin.findMany.mockResolvedValue([
      { id: 'CHK_J21', idPatient: 'PAT_SEED_01', reponses: {}, soumisLe: new Date('2026-07-14T08:00:00.000Z') },
    ]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', confirmedAt: new Date('2026-07-16T08:00:00.000Z') },
    ]);

    const payload = await (await GET()).json();
    expect(payload.cartes.some((c: { type: string }) => c.type === 'jalon_j21')).toBe(false);
  });

  // Le défaut `A04` vu de bout en bout : un épisode J21 ANTÉRIEUR au point
  // d'étape ne tranche rien, et la carte doit rester.
  it('un épisode J21 ANTÉRIEUR au point d’étape laisse la carte jalon', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.protocolCheckin.findMany.mockResolvedValue([
      { id: 'CHK_J21', idPatient: 'PAT_SEED_01', reponses: {}, soumisLe: new Date('2026-07-14T08:00:00.000Z') },
    ]);
    prisma.assessmentEpisode.findMany.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', confirmedAt: new Date('2026-07-02T08:00:00.000Z') },
    ]);

    const payload = await (await GET()).json();
    expect(payload.cartes.some((c: { type: string }) => c.type === 'jalon_j21')).toBe(true);
  });

  const CLE_SYNTHESE = 'synthese_a_valider:agregat:PAT_SEED_01:2026-07-20T09:00:00.000Z';
  function mockSyntheseSophie() {
    prisma.syntheseIA.findMany.mockResolvedValue([
      { idSynthese: 'SYN_1', idPatient: 'PAT_SEED_01', dateGeneration: new Date('2026-07-20T09:00:00.000Z') },
    ]);
    prisma.patient.findMany.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' },
    ]);
  }

  // G1 : le refus persiste côté serveur, il ne dépend pas de l'écran.
  it('une carte refusée ne réapparaît pas au chargement suivant', async () => {
    mockSyntheseSophie();
    prisma.filCardRejection.findMany.mockResolvedValue([
      {
        id: 'r1',
        carteCle: CLE_SYNTHESE,
        refusee: true,
        supersedesRejectionId: null,
        refuseLe: new Date(),
      },
    ]);

    const payload = await (await GET()).json();
    expect(payload.cartes).toEqual([]);
  });

  it('un refus annulé laisse la carte revenir', async () => {
    mockSyntheseSophie();
    prisma.filCardRejection.findMany.mockResolvedValue([
      { id: 'r1', carteCle: CLE_SYNTHESE, refusee: true, supersedesRejectionId: null, refuseLe: new Date('2026-07-20T10:00:00.000Z') },
      { id: 'r2', carteCle: CLE_SYNTHESE, refusee: false, supersedesRejectionId: 'r1', refuseLe: new Date('2026-07-20T10:05:00.000Z') },
    ]);

    const payload = await (await GET()).json();
    expect(payload.cartes.map((c: { cle: string }) => c.cle)).toEqual([CLE_SYNTHESE]);
  });

  it('une panne de lecture est annoncée, jamais présentée comme un fil vide', async () => {
    prisma.assignation.findMany.mockRejectedValue(new Error('base indisponible'));
    const res = await GET();
    const payload = await res.json();
    expect(payload.unavailable).toBe(true);
    expect(payload.cartes).toEqual([]);
  });
});
