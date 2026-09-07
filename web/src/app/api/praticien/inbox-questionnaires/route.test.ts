import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findMany: vi.fn(), findFirst: vi.fn() },
    questionnaireReponse: { findMany: vi.fn() },
    questionnaireLecturePraticien: { findMany: vi.fn(), createMany: vi.fn() },
    consultation: { groupBy: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { GET, POST } from './route';

function getRequest(path = '/api/praticien/inbox-questionnaires') {
  return new Request(`http://test.local${path}`);
}

describe('GET /api/praticien/inbox-questionnaires', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.patient.findFirst.mockResolvedValue({ idPatient: 'PAT_SEED_01' });
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    prisma.questionnaireLecturePraticien.findMany.mockResolvedValue([]);
    prisma.questionnaireLecturePraticien.createMany.mockResolvedValue({ count: 0 });
    prisma.consultation.groupBy.mockResolvedValue([]);
  });

  it('sans session : 401 et `unavailable`', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).unavailable).toBe(true);
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('sans patient actif : inbox vide, sans lecture des réponses', async () => {
    const payload = await (await GET(getRequest())).json();
    expect(payload.lignes).toEqual([]);
    expect(prisma.questionnaireReponse.findMany).not.toHaveBeenCalled();
  });

  it('groupe par patient et écarte ce qui précède la dernière consultation validée', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      { idReponse: 'R1', idPatient: 'PAT_SEED_01', titre: 'Ancien', dateReponse: new Date('2026-07-10T08:00:00.000Z') },
      { idReponse: 'R2', idPatient: 'PAT_SEED_01', titre: 'Récent', dateReponse: new Date('2026-07-15T08:00:00.000Z') },
    ]);
    prisma.consultation.groupBy.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', _max: { dateValidation: new Date('2026-07-14T12:00:00.000Z') } },
    ]);
    const payload = await (await GET(getRequest())).json();
    expect(payload.lignes).toHaveLength(1);
    expect(payload.lignes[0].nb).toBe(1);
    expect(payload.lignes[0].titres).toEqual(['Récent']);
  });

  it('borne la lecture des patients au praticien en session', async () => {
    await GET(getRequest());
    const where = prisma.patient.findMany.mock.calls[0][0].where;
    expect(where.actif).toBe(true);
    expect(where.praticienEmail).toEqual({ equals: 'p@wellneuro.fr', mode: 'insensitive' });
  });

  it('retire de la liste les réponses déjà confirmées lues', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      { idReponse: 'R_LUE', idPatient: 'PAT_SEED_01', titre: 'Sommeil', dateReponse: new Date('2026-07-15T08:00:00.000Z') },
      { idReponse: 'R_NEUVE', idPatient: 'PAT_SEED_01', titre: 'Plaintes', dateReponse: new Date('2026-07-16T08:00:00.000Z') },
    ]);
    prisma.questionnaireLecturePraticien.findMany.mockResolvedValue([{ idReponse: 'R_LUE' }]);
    const payload = await (await GET(getRequest())).json();
    expect(payload.lignes[0].nb).toBe(1);
    expect(payload.lignes[0].titres).toEqual(['Plaintes']);
  });

  it('le détail patient renvoie les réponses brutes et scores en attente', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      {
        idReponse: 'R1',
        idPatient: 'PAT_SEED_01',
        idAssignation: 'ASS1',
        idQuestionnaire: 'Q_NEU_06',
        titre: 'Questionnaire sommeil',
        dateReponse: new Date('2026-07-15T08:00:00.000Z'),
        scoresJson: { total: 7, rawAnswers: { MM1: 2 } },
        scorePrincipal: 7,
        interpretation: 'Vigilance',
      },
    ]);
    const res = await GET(getRequest('/api/praticien/inbox-questionnaires?idPatient=PAT_SEED_01'));
    const payload = await res.json();
    expect(payload.patient.nom).toBe('Sophie Nicola');
    expect(payload.reponses[0].rawAnswers).toEqual({ MM1: 2 });
    expect(payload.reponses[0].scorePrincipal).toBe(7);
    expect(payload.reponses[0].reponsesLisibles).toEqual([
      // Libellés du MMT reconstruit depuis sa source le 2026-07-31 : le servi
      // porte désormais les épreuves administrées, cotées 0-2 dans le sens des
      // troubles. `MM1 = 2` se lit donc « Inexacte ou pas de réponse », et non
      // plus « Rarement » sur une échelle 0-3 de sens inverse.
      expect.objectContaining({
        idQuestion: 'MM1',
        libelleQuestion: '« Quel âge avez-vous ? » (si la réponse est une année, redemandez : « Cela vous fait quel âge ? »)',
        libelleReponse: 'Inexacte ou pas de réponse',
        valeurBrute: '2',
      }),
    ]);
  });

  it('le détail rend le statut de validité RÉEL, jamais un « VALID » de repli', async () => {
    // LE DÉFAUT : les deux champs étaient sélectionnés en base ET recopiés à la
    // sortie, mais ne traversaient pas la normalisation intermédiaire. Ils
    // retombaient donc systématiquement sur `'VALID'` — et le bandeau
    // « Retirée du raisonnement clinique » ne pouvait JAMAIS s'afficher. Une
    // passation que le praticien avait retirée lui revenait valide, avec son
    // bouton « Retirer » intact.
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      {
        idReponse: 'R1',
        idPatient: 'PAT_SEED_01',
        idAssignation: 'ASS1',
        idQuestionnaire: 'Q_NEU_06',
        titre: 'Questionnaire sommeil',
        dateReponse: new Date('2026-07-15T08:00:00.000Z'),
        scoresJson: { total: 7 },
        scorePrincipal: 7,
        interpretation: 'Vigilance',
        statutValidite: 'INVALID',
        motifInvalidation: 'Passation interrompue',
      },
    ]);
    const payload = await (await GET(getRequest('/api/praticien/inbox-questionnaires?idPatient=PAT_SEED_01'))).json();
    expect(payload.reponses[0].statutValidite).toBe('INVALID');
    expect(payload.reponses[0].motifInvalidation).toBe('Passation interrompue');
  });

  it('la liste compte ce que l’ancre a écarté, au lieu de le taire', async () => {
    // L'accueil affirmait « tout a été vu en consultation » sur la foi d'un
    // geste du PATIENT. Il dit désormais combien de réponses il a retirées, et
    // depuis quelle consultation.
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.consultation.groupBy.mockResolvedValue([
      { idPatient: 'PAT_SEED_01', _max: { dateValidation: new Date('2026-07-20T10:00:00.000Z') } },
    ]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      {
        idReponse: 'R1',
        idPatient: 'PAT_SEED_01',
        titre: 'Questionnaire sommeil',
        dateReponse: new Date('2026-07-15T08:00:00.000Z'),
      },
    ]);
    const payload = await (await GET(getRequest('/api/praticien/inbox-questionnaires'))).json();
    expect(payload.lignes).toEqual([]);
    expect(payload.ecartees).toEqual([
      {
        idPatient: 'PAT_SEED_01',
        patient: 'Sophie Nicola',
        nb: 1,
        ancre: '2026-07-20T10:00:00.000Z',
      },
    ]);
  });

  it('le détail retire score et interprétation d’une passation non interprétable, et garde les réponses', async () => {
    // Le Fil est l'écran où le praticien DÉCOUVRE la passation : c'est là que
    // « Fatigue notable » se lisait pour la première fois sur une somme sans
    // inversion d'items. Les réponses brutes et leur relecture item par item
    // restent — ce que le patient a répondu est vrai, la lecture ne l'était pas.
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      {
        idReponse: 'R_SOM07',
        idPatient: 'PAT_SEED_01',
        idAssignation: 'ASS1',
        idQuestionnaire: 'Q_SOM_07',
        titre: 'MFI-20 — Échelle multidimensionnelle de fatigue',
        dateReponse: new Date('2026-07-21T08:00:00.000Z'),
        scoresJson: {
          type: 'sum',
          total: 45,
          maxTotal: 80,
          interpretation: { label: 'Fatigue notable' },
          rawAnswers: { M1: 2 },
        },
        scorePrincipal: 45,
        interpretation: 'Fatigue notable',
      },
    ]);
    const payload = await (await GET(getRequest('/api/praticien/inbox-questionnaires?idPatient=PAT_SEED_01'))).json();
    const reponse = payload.reponses[0];
    expect(reponse.nonInterpretable).toBeTruthy();
    expect(reponse.scorePrincipal).toBeNull();
    expect(reponse.interpretation).toBe('');
    expect(reponse.subScoreRanges).toBeNull();
    expect(reponse.scoresParsed).toEqual({ rawAnswers: { M1: 2 } });
    // Conservé, et c'est le point : marquer n'est pas effacer.
    expect(reponse.rawAnswers).toEqual({ M1: 2 });
    expect(reponse.titre).toBe('MFI-20 — Échelle multidimensionnelle de fatigue');
  });

  it('le détail laisse intact un instrument courant (contrôle négatif)', async () => {
    prisma.patient.findMany.mockResolvedValue([{ idPatient: 'PAT_SEED_01', prenom: 'Sophie', nom: 'Nicola' }]);
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      {
        idReponse: 'R1',
        idPatient: 'PAT_SEED_01',
        idAssignation: 'ASS1',
        idQuestionnaire: 'Q_NEU_06',
        titre: 'Questionnaire sommeil',
        dateReponse: new Date('2026-07-15T08:00:00.000Z'),
        scoresJson: { total: 7, rawAnswers: { MM1: 2 } },
        scorePrincipal: 7,
        interpretation: 'Vigilance',
      },
    ]);
    const payload = await (await GET(getRequest('/api/praticien/inbox-questionnaires?idPatient=PAT_SEED_01'))).json();
    expect(payload.reponses[0].nonInterpretable).toBeNull();
    expect(payload.reponses[0].scorePrincipal).toBe(7);
    expect(payload.reponses[0].interpretation).toBe('Vigilance');
  });

  it('POST confirme la lecture des réponses encore en attente du patient scopé', async () => {
    prisma.questionnaireReponse.findMany.mockResolvedValue([
      { idReponse: 'R1', idPatient: 'PAT_SEED_01', titre: 'Sommeil', dateReponse: new Date('2026-07-15T08:00:00.000Z') },
    ]);
    const res = await POST(new Request('http://test.local/api/praticien/inbox-questionnaires', {
      method: 'POST',
      body: JSON.stringify({ idPatient: 'PAT_SEED_01', idsReponses: ['R1'] }),
    }));
    expect(res.status).toBe(200);
    expect(prisma.questionnaireLecturePraticien.createMany).toHaveBeenCalledWith({
      data: [{ idReponse: 'R1', idPatient: 'PAT_SEED_01', praticienEmail: 'p@wellneuro.fr' }],
      skipDuplicates: true,
    });
  });
});
