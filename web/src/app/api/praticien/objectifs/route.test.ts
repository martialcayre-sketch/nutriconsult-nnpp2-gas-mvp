import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn() },
    consultation: { findFirst: vi.fn() },
    objectifNegocie: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      // `update` et `delete` sont moqués EXPRÈS, alors que la route ne les
      // appelle jamais : sans eux, l'assertion « append-only » ne pourrait pas
      // être écrite — un mock absent lèverait au lieu de compter zéro.
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    // Le geste de ratification appartient au patient (LOT-06). Les écritures
    // sont moquées pour prouver que cette route ne les emprunte jamais.
    ratificationObjectif: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    // Alliance 6.0-B, LOT-04 : l'amendement est LU ici et jamais écrit —
    // l'écrivain unique est le portail. `create` est moqué EXPRÈS pour que
    // l'assertion « cette route ne l'écrit pas » compte zéro au lieu de lever.
    amendementObjectif: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    // LECTURE SEULE depuis cette route (6.0-B, LOT-05) : `create` est moqué
    // expressément bien que jamais appelé — sans lui, l'assertion « la route
    // praticien n'écrit pas cette table » lèverait au lieu de compter zéro.
    reponseJalonObjectif: { findMany: vi.fn(), create: vi.fn() },
    journalAccesDossier: { create: vi.fn(), deleteMany: vi.fn() },
    // Alliance 6.0-B, LOT-03 : la reprise d'une proposition. `update` et
    // `delete` sont moqués EXPRÈS alors que la route ne les appelle jamais —
    // sans eux, l'assertion « append-only » ne pourrait pas être écrite.
    propositionObjectif: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    dispositionProposition: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    // Le vrai `$transaction` exécute la liste ATOMIQUEMENT ; le mock la résout
    // simplement — ce qu'on éprouve ici, c'est que les deux écritures partent
    // ENSEMBLE, pas la sémantique transactionnelle de PostgreSQL.
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));

// [[D-153]] — l'envoyeur est moqué : ce banc éprouve QUI est notifié et QUAND,
// pas le SMTP. Le contenu du gabarit est tenu par `registreGabarits.test.ts`
// (hash-lock), et le triplet Envoye/Non_envoye/Erreur par `email.test.ts`.
const sendObjectifProposeEmail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/consultation/email', () => ({ sendObjectifProposeEmail }));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { GET, POST } from './route';
import {
  LONGUEUR_MAX_ENONCE,
  LONGUEUR_MAX_MOTIF,
  LONGUEUR_MAX_PRIORITE,
  LONGUEUR_MAX_REFORMULATION,
  TOLERANCE_FUSEAU_MS,
} from '@/lib/praticien/objectifNegocie';

const URL_BASE = 'http://localhost/api/praticien/objectifs';

function getRequest(query = 'idPatient=PAT_TEST'): Request {
  return new Request(`${URL_BASE}?${query}`);
}

function postRequest(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const corps = (partiel: Record<string, unknown> = {}) => ({
  idPatient: 'PAT_TEST',
  enoncePatient: 'Je voudrais dormir sans me réveiller à trois heures.',
  ...partiel,
});

const ligneLue = (partiel: Record<string, unknown> = {}) => ({
  id: 'OBJ_1',
  enoncePatient: 'Je voudrais dormir sans me réveiller à trois heures.',
  reformulationPraticien: null,
  priorite: null,
  nonTraiteMotif: null,
  nonTraiteDepuisLe: null,
  negocieLe: null,
  creeLe: new Date('2026-08-20T09:00:00.000Z'),
  supersedesObjectifId: null,
  ...partiel,
});

async function corpsDe(reponse: Response) {
  return (await reponse.json()) as Record<string, unknown>;
}

describe('/api/praticien/objectifs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    // Une seule fixture patient : la garde d'appartenance et le contrôle de
    // clôture lisent tous deux `patient.findUnique`.
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'praticien@wellneuro.fr',
      actif: true,
      suiviClotureLe: null,
      email: 'sophie.nicola@fictif.wellneuro.fr',
      prenom: 'Sophie',
    });
    sendObjectifProposeEmail.mockReset();
    sendObjectifProposeEmail.mockResolvedValue('Envoye');
    prisma.consultation.findFirst.mockResolvedValue(null);
    prisma.objectifNegocie.findMany.mockResolvedValue([]);
    prisma.objectifNegocie.findUnique.mockResolvedValue(null);
    prisma.objectifNegocie.findFirst.mockResolvedValue(null);
    prisma.ratificationObjectif.findMany.mockResolvedValue([]);
    prisma.amendementObjectif.findMany.mockResolvedValue([]);
    prisma.amendementObjectif.findUnique.mockResolvedValue(null);
    prisma.reponseJalonObjectif.findMany.mockResolvedValue([]);
    prisma.propositionObjectif.findMany.mockResolvedValue([]);
    prisma.dispositionProposition.findMany.mockResolvedValue([]);
    prisma.dispositionProposition.create.mockResolvedValue({ id: 'DIS_NEUVE' });
    prisma.objectifNegocie.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'OBJ_NEUF',
        enoncePatient: data.enoncePatient,
        reformulationPraticien: data.reformulationPraticien ?? null,
        priorite: data.priorite ?? null,
        nonTraiteMotif: data.nonTraiteMotif ?? null,
        nonTraiteDepuisLe: data.nonTraiteDepuisLe ?? null,
        negocieLe: data.negocieLe ?? null,
        supersedesObjectifId: data.supersedesObjectifId ?? null,
        sourcePropositionId: data.sourcePropositionId ?? null,
        // La base pose le présent : le mock reflète ce contrat, pas l'appelant.
        creeLe: new Date('2026-08-22T09:00:00.000Z'),
      }),
    );
  });

  // ── Droits ────────────────────────────────────────────────────────────────

  it('exige une session, au GET comme au POST', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET(getRequest())).status).toBe(401);
    expect((await POST(postRequest(corps()))).status).toBe(401);
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    // Aucune session : rien n'a été lu, donc rien à journaliser.
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('refuse le dossier d’un autre praticien, sans écrire ni journaliser', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'autre@wellneuro.fr',
      actif: true,
      suiviClotureLe: null,
    });
    expect((await GET(getRequest())).status).toBe(403);
    expect((await POST(postRequest(corps()))).status).toBe(403);
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    // Un refus ne se journalise pas : la ligne nommerait un dossier non lu.
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('répond 404 sur un patient inconnu', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    expect((await GET(getRequest())).status).toBe(404);
    expect((await POST(postRequest(corps()))).status).toBe(404);
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
  });

  it('valide l’identifiant patient avant de toucher la base', async () => {
    expect((await GET(getRequest('idPatient='))).status).toBe(400);
    expect((await GET(getRequest('idPatient=PAT%20TEST'))).status).toBe(400);
    expect((await POST(postRequest(corps({ idPatient: '' })))).status).toBe(400);
    expect((await POST(postRequest(corps({ idPatient: 'PAT TEST' })))).status).toBe(400);
    // La garde d'appartenance JOURNALISE : la tester après le format ferait
    // consigner un accès qui n'a pas eu lieu.
    expect(prisma.patient.findUnique).not.toHaveBeenCalled();
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('le GET journalise EXACTEMENT une fois, sous le gabarit littéral ; le POST jamais', async () => {
    expect((await GET(getRequest())).status).toBe(200);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledWith({
      data: {
        idPatient: 'PAT_TEST',
        praticienEmail: 'praticien@wellneuro.fr',
        route: '/api/praticien/objectifs',
        methode: 'GET',
      },
    });

    // Une écriture laisse déjà sa propre trace datée et attribuée (GD-1).
    prisma.journalAccesDossier.create.mockClear();
    expect((await POST(postRequest(corps()))).status).toBe(201);
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('journalise le gabarit, jamais l’URL reçue', async () => {
    await GET(getRequest('idPatient=PAT_TEST&sonde=valeur-indiscrete'));
    const data = prisma.journalAccesDossier.create.mock.calls[0][0].data;
    expect(data.route).toBe('/api/praticien/objectifs');
    expect(JSON.stringify(data)).not.toContain('sonde');
  });

  it('refuse toute écriture dans un dossier clos (le refus vit dans la route, pas dans l’écran)', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'praticien@wellneuro.fr',
      actif: true,
      suiviClotureLe: new Date('2026-08-01T00:00:00.000Z'),
    });
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('dossier_cloture');
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    // La lecture, elle, reste ouverte : un dossier clos se relit.
    expect((await GET(getRequest())).status).toBe(200);
  });

  // ── Le cœur du lot : deux dates ───────────────────────────────────────────

  it('écrit un objectif sans JAMAIS transmettre la date d’écriture (G4)', async () => {
    const res = await POST(postRequest(corps({ negocieLe: '2026-08-20' })));
    const payload = await res.json();

    expect(res.status).toBe(201);
    const data = prisma.objectifNegocie.create.mock.calls[0][0].data;
    // La date d'ÉVÉNEMENT est une donnée portée par l'appelant…
    expect(data.negocieLe.toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(data.praticienEmail).toBe('praticien@wellneuro.fr');
    // …la date d'ENREGISTREMENT ne part pas de l'application : `cree_le` est
    // posé par la base. C'est ce qui rend la ligne inantidatable.
    expect(data).not.toHaveProperty('creeLe');
    expect(data).not.toHaveProperty('cree_le');
    // Et les deux restent distinctes dans ce qui est rendu.
    expect(payload.objectif.negocieLe).toBe('2026-08-20T00:00:00.000Z');
    expect(payload.objectif.creeLe).toBe('2026-08-22T09:00:00.000Z');
  });

  // ── Validation d'entrée ───────────────────────────────────────────────────

  it('rend 400 — jamais 500 — sur un corps dont les champs ne sont pas des chaînes', async () => {
    const res = await POST(postRequest({ idPatient: 'PAT_TEST', enoncePatient: 123 }));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('enonce_absent');

    expect((await POST(postRequest({ idPatient: 42, enoncePatient: 'Texte.' }))).status).toBe(400);
    expect((await POST(postRequest(corps({ supersedesObjectifId: { ruse: true } })))).status).toBe(400);
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
  });

  it('refuse chaque borne de longueur, sans rien tronquer', async () => {
    const cas: [Record<string, unknown>, string][] = [
      [{ enoncePatient: 'a'.repeat(LONGUEUR_MAX_ENONCE + 1) }, 'enonce_trop_long'],
      [{ reformulationPraticien: 'a'.repeat(LONGUEUR_MAX_REFORMULATION + 1) }, 'reformulation_trop_longue'],
      [{ priorite: 'a'.repeat(LONGUEUR_MAX_PRIORITE + 1) }, 'priorite_trop_longue'],
      [
        { nonTraiteMotif: 'a'.repeat(LONGUEUR_MAX_MOTIF + 1), nonTraiteDepuisLe: '2026-08-01' },
        'motif_trop_long',
      ],
    ];
    for (const [partiel, raison] of cas) {
      const res = await POST(postRequest(corps(partiel)));
      expect(res.status).toBe(400);
      expect((await res.json()).reason).toBe(raison);
    }
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
  });

  it('refuse une date d’événement future au-delà de la tolérance de fuseau', async () => {
    const loin = new Date(Date.now() + TOLERANCE_FUSEAU_MS + 60 * 60 * 1000).toISOString();
    const res = await POST(postRequest(corps({ negocieLe: loin })));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('date_future');

    // …mais accepte la date du jour lue minuit UTC (la tolérance sert à ça).
    const dansUneHeure = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect((await POST(postRequest(corps({ negocieLe: dansUneHeure })))).status).toBe(201);
  });

  it('refuse une date d’événement illisible', async () => {
    const res = await POST(postRequest(corps({ negocieLe: 'hier' })));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('date_invalide');
  });

  it('refuse un « non traité pour l’instant » dépareillé (motif sans date, date sans motif)', async () => {
    const sansDate = await POST(postRequest(corps({ nonTraiteMotif: 'La priorité est ailleurs.' })));
    expect(sansDate.status).toBe(400);
    expect((await sansDate.json()).reason).toBe('non_traite_incomplet');

    const sansMotif = await POST(postRequest(corps({ nonTraiteDepuisLe: '2026-08-01' })));
    expect(sansMotif.status).toBe(400);
    expect((await sansMotif.json()).reason).toBe('non_traite_incomplet');

    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
  });

  // ── Révision : append-only ────────────────────────────────────────────────

  it('reformule par une NOUVELLE ligne chaînée — jamais par un update ni un delete', async () => {
    prisma.objectifNegocie.findUnique.mockResolvedValue({
      idPatient: 'PAT_TEST',
      enoncePatient: 'Je voudrais dormir sans me réveiller à trois heures.',
    });

    const res = await POST(
      postRequest(
        corps({
          supersedesObjectifId: 'OBJ_1',
          enoncePatient: 'Énoncé réécrit par l’appelant.',
          reformulationPraticien: 'Sommeil fragmenté en seconde partie de nuit.',
        }),
      ),
    );
    expect(res.status).toBe(201);

    const data = prisma.objectifNegocie.create.mock.calls[0][0].data;
    expect(data.supersedesObjectifId).toBe('OBJ_1');
    // L'énoncé vient de la CIBLE VÉRIFIÉE, jamais du corps : sinon on ferait
    // dire au patient, ligne après ligne, autre chose que ce qu'il a dit.
    expect(data.enoncePatient).toBe('Je voudrais dormir sans me réveiller à trois heures.');
    expect(prisma.objectifNegocie.update).not.toHaveBeenCalled();
    expect(prisma.objectifNegocie.updateMany).not.toHaveBeenCalled();
    expect(prisma.objectifNegocie.delete).not.toHaveBeenCalled();
    expect(prisma.objectifNegocie.deleteMany).not.toHaveBeenCalled();
  });

  it('rend le MÊME 404 pour une cible inexistante et pour une cible d’un autre dossier', async () => {
    prisma.objectifNegocie.findUnique.mockResolvedValue(null);
    const absente = await POST(postRequest(corps({ supersedesObjectifId: 'OBJ_FANTOME' })));

    prisma.objectifNegocie.findUnique.mockResolvedValue({
      idPatient: 'PAT_AUTRE',
      enoncePatient: 'Énoncé d’un autre dossier.',
    });
    const etrangere = await POST(postRequest(corps({ supersedesObjectifId: 'OBJ_AUTRE' })));

    expect(absente.status).toBe(404);
    expect(etrangere.status).toBe(404);
    // Même réponse, même message : la route n'est pas un oracle d'existence.
    expect(await absente.json()).toEqual(await etrangere.json());
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
  });

  it('refuse 409 une cible déjà reformulée, plutôt que de scinder la chaîne', async () => {
    prisma.objectifNegocie.findUnique.mockResolvedValue({
      idPatient: 'PAT_TEST',
      enoncePatient: 'Je voudrais dormir sans me réveiller à trois heures.',
    });
    prisma.objectifNegocie.findFirst.mockResolvedValue({ id: 'OBJ_2' });

    const res = await POST(postRequest(corps({ supersedesObjectifId: 'OBJ_1' })));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('objectif_supplante');
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
  });

  it('n’expose ni PATCH ni DELETE : il n’existe aucun verbe pour écraser', async () => {
    const handlers = await import('./route');
    expect(handlers).not.toHaveProperty('PATCH');
    expect(handlers).not.toHaveProperty('DELETE');
    expect(handlers).not.toHaveProperty('PUT');
  });

  // ── Lecture ───────────────────────────────────────────────────────────────

  it('rend les têtes de chaîne ET la trajectoire complète de chacune', async () => {
    prisma.objectifNegocie.findMany.mockResolvedValue([
      ligneLue({
        id: 'OBJ_2',
        supersedesObjectifId: 'OBJ_1',
        reformulationPraticien: 'Sommeil fragmenté.',
        creeLe: new Date('2026-08-21T09:00:00.000Z'),
      }),
      ligneLue({ id: 'OBJ_1', creeLe: new Date('2026-08-20T09:00:00.000Z') }),
    ]);

    const payload = await (await GET(getRequest())).json();
    expect(payload.objectifs.map((o: { id: string }) => o.id)).toEqual(['OBJ_2']);
    // La version supplantée n'est pas perdue : elle vit dans la trajectoire.
    expect(payload.trajectoires).toHaveLength(1);
    expect(payload.trajectoires[0].idObjectif).toBe('OBJ_2');
    expect(payload.trajectoires[0].lignes.map((l: { id: string }) => l.id)).toEqual(['OBJ_2', 'OBJ_1']);
  });

  it('rend TOUTES les têtes quand deux reformulations concurrentes ont scindé la chaîne', async () => {
    prisma.objectifNegocie.findMany.mockResolvedValue([
      ligneLue({ id: 'OBJ_3', supersedesObjectifId: 'OBJ_1', creeLe: new Date('2026-08-21T09:00:01.000Z') }),
      ligneLue({ id: 'OBJ_2', supersedesObjectifId: 'OBJ_1', creeLe: new Date('2026-08-21T09:00:00.000Z') }),
      ligneLue({ id: 'OBJ_1', creeLe: new Date('2026-08-20T09:00:00.000Z') }),
    ]);

    const payload = await (await GET(getRequest())).json();
    expect(payload.objectifs.map((o: { id: string }) => o.id)).toEqual(['OBJ_3', 'OBJ_2']);
  });

  it('sans aucune ligne de ratification, l’état est « en attente » — jamais « non ratifié »', async () => {
    prisma.objectifNegocie.findMany.mockResolvedValue([ligneLue()]);
    prisma.ratificationObjectif.findMany.mockResolvedValue([]);

    const payload = await (await GET(getRequest())).json();
    expect(payload.ratifications).toEqual({ OBJ_1: 'en_attente' });
    // Lecture seule : aucune écriture sur le geste du patient (LOT-06).
    expect(prisma.ratificationObjectif.create).not.toHaveBeenCalled();
    expect(prisma.ratificationObjectif.deleteMany).not.toHaveBeenCalled();
  });

  it('retient le dernier geste de ratification, jamais un décompte', async () => {
    prisma.objectifNegocie.findMany.mockResolvedValue([ligneLue()]);
    prisma.ratificationObjectif.findMany.mockResolvedValue([
      { id: 'R1', idObjectif: 'OBJ_1', sens: 'ratifie', creeLe: new Date('2026-08-20T10:00:00.000Z') },
      { id: 'R2', idObjectif: 'OBJ_1', sens: 'ratifie', creeLe: new Date('2026-08-20T11:00:00.000Z') },
      { id: 'R3', idObjectif: 'OBJ_1', sens: 'conteste', creeLe: new Date('2026-08-21T11:00:00.000Z') },
    ]);

    const payload = await (await GET(getRequest())).json();
    expect(payload.ratifications).toEqual({ OBJ_1: 'conteste' });
  });

  it('distingue « aucune consultation validée » de « champ non renseigné » (DC-24)', async () => {
    const sansConsultation = await (await GET(getRequest())).json();
    expect(sansConsultation.ancrage).toEqual({
      consultationValidee: false,
      motifPrincipal: null,
      objectifPrioritaire: null,
      attentes: [],
    });

    prisma.consultation.findFirst.mockResolvedValue({
      anamnese: { motif_principal: '  Fatigue persistante.  ', attentes: ['Améliorer le sommeil'] },
    });
    const avecConsultation = await (await GET(getRequest())).json();
    expect(avecConsultation.ancrage).toEqual({
      consultationValidee: true,
      motifPrincipal: 'Fatigue persistante.',
      // La consultation existe, le champ est vide : ce n'est pas la même chose.
      objectifPrioritaire: null,
      attentes: ['Améliorer le sommeil'],
    });
  });

  it('lit les trois champs d’ancrage, et seulement eux', async () => {
    prisma.consultation.findFirst.mockResolvedValue({
      anamnese: {
        motif_principal: 'Fatigue persistante.',
        objectif_prioritaire: 'Retrouver de l’énergie le matin.',
        attentes: ['Améliorer le sommeil', 'Améliorer l’énergie'],
        poids_actuel: '68',
      },
    });
    const payload = await (await GET(getRequest())).json();
    expect(payload.ancrage).toEqual({
      consultationValidee: true,
      motifPrincipal: 'Fatigue persistante.',
      objectifPrioritaire: 'Retrouver de l’énergie le matin.',
      attentes: ['Améliorer le sommeil', 'Améliorer l’énergie'],
    });
    // Le reste de l'anamnèse ne traverse pas cette route.
    expect(JSON.stringify(payload.ancrage)).not.toContain('68');
  });

  it('ne lit que la consultation VALIDÉE du dossier', async () => {
    await GET(getRequest());
    expect(prisma.consultation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idPatient: 'PAT_TEST', statut: 'validee' } }),
    );
  });
  // ── Constats de revue (2026-08-22) ────────────────────────────────────────

  it.each([
    ['null', null],
    ['un nombre', 42],
    ['une chaîne', '"texte"'],
    ['un tableau', []],
  ])('POST : un corps JSON valide mais qui n’est pas un objet (%s) rend 400, jamais 500', async (_nom, charge) => {
    // `null`, `42`, `"texte"` et `[]` sont du JSON VALIDE : `req.json()` ne
    // lève pas. Avant correction, `body.idPatient` levait sur `null` et la
    // route rendait 500 — AVANT la garde, donc sans aucune session.
    getServerSession.mockResolvedValue(null);
    const reponse = await POST(postRequest(charge));

    expect(reponse.status).toBe(400);
    await expect(reponse.json()).resolves.toMatchObject({ ok: false, reason: 'invalid' });
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
  });

  it('GET : les attentes non textuelles de l’anamnèse sont écartées, jamais devinées', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({ idPatient: 'PAT_TEST', praticienEmail: 'praticien@wellneuro.fr' });
    prisma.consultation.findFirst.mockResolvedValue({
      anamnese: { motif_principal: 'Sommeil', attentes: ['dormir', 42, null, '   ', 'récupérer'] },
    });

    const reponse = await GET(getRequest());
    const donnees = await reponse.json();

    expect(donnees.ancrage.attentes).toEqual(['dormir', 'récupérer']);
  });
  // ── JOURNALISATION SÛRE (dette nommée par la revue du LOT-04) ─────────────

  describe('les exceptions ne recopient jamais le dossier en logs', () => {
    it('une erreur Prisma est CAVIARDÉE — ni énoncé, ni reformulation, ni e-mail', async () => {
      const espion = vi.spyOn(console, 'error').mockImplementation(() => {});

      const fuite = new Error(
        'Invalid `prisma.objectifNegocie.create()` — data: { enoncePatient: ' +
          '"je dors trois heures par nuit depuis mon licenciement", praticienEmail: ' +
          '"praticien@wellneuro.fr" }',
      );
      fuite.name = 'PrismaClientValidationError';
      prisma.objectifNegocie.findMany.mockRejectedValue(fuite);

      const reponse = await GET(getRequest());
      expect(reponse.status).toBe(500);

      const trace = espion.mock.calls.map((appel) => appel.join(' ')).join(' ');
      expect(trace).toContain('PrismaClientValidationError');
      expect(trace).not.toContain('licenciement');
      expect(trace).not.toContain('praticien@wellneuro.fr');
      espion.mockRestore();
    });

    it('une erreur ordinaire garde son message — il ne porte aucun payload', async () => {
      const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
      prisma.objectifNegocie.findMany.mockRejectedValue(new Error('connexion interrompue'));

      const reponse = await GET(getRequest());
      expect(reponse.status).toBe(500);
      expect(espion.mock.calls.map((appel) => appel.join(' ')).join(' ')).toContain(
        'connexion interrompue',
      );
      espion.mockRestore();
    });
  });
  // ── La reprise d'une proposition (Alliance 6.0-B, LOT-03) ─────────────────

  describe('reprise d’une proposition', () => {
    const PROPOSITION = () => ({
      id: 'PROP_1',
      fragments: [
        { texte: 'Explorer le sommeil', source: { nature: 'regle_signee', regle: 'PRIO-SOM-01' } },
        {
          texte: 'Je me réveille à trois heures toutes les nuits.',
          source: { nature: 'anamnese', champ: 'motif_principal' },
        },
      ],
      hashSources: 'a'.repeat(64),
      assembleeLe: new Date('2026-08-25T09:00:00.000Z'),
      creeLe: new Date('2026-08-25T09:00:00.000Z'),
    });

    const corpsReprise = (partiel: Record<string, unknown> = {}) => ({
      idPatient: 'PAT_TEST',
      // L'appelant a beau l'écrire, il ne sera pas lu : la route recopie le
      // fragment. Le laisser dans le corps est délibéré — c'est le scénario à
      // éprouver, pas un oubli.
      enoncePatient: 'Texte que l’écran a inventé.',
      reformulationPraticien: 'Sommeil fragmenté en seconde partie de nuit.',
      sourcePropositionId: 'PROP_1',
      sourceFragmentIndex: 1,
      ...partiel,
    });

    beforeEach(() => {
      // Le drapeau garde la reprise depuis le LOT-03 : les cas qui l'exercent
      // l'allument, et deux cas dédiés vérifient les deux fermetures.
      vi.stubEnv('WN_OBJECTIF_PROPOSE', 'true');
      vi.stubEnv('WN_OBJECTIF_PROPOSE_PATIENTS', '');
      prisma.propositionObjectif.findMany.mockResolvedValue([PROPOSITION()]);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('RECOPIE l’énoncé depuis le fragment cité, jamais depuis le corps', async () => {
      const reponse = await POST(postRequest(corpsReprise()));
      expect(reponse.status).toBe(201);

      const { data } = prisma.objectifNegocie.create.mock.calls[0][0];
      expect(data.enoncePatient).toBe('Je me réveille à trois heures toutes les nuits.');
      expect(data.sourcePropositionId).toBe('PROP_1');
      // La reformulation, elle, appartient au praticien : elle vient bien du corps.
      expect(data.reformulationPraticien).toBe('Sommeil fragmenté en seconde partie de nuit.');
    });

    it('écrit l’objectif ET le geste dans UNE SEULE transaction', async () => {
      await POST(postRequest(corpsReprise()));
      // Écrire l'un sans l'autre laisserait soit une reprise sans objectif,
      // soit un objectif se réclamant d'une proposition encore servie comme
      // vivante.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);

      const { data } = prisma.dispositionProposition.create.mock.calls[0][0];
      expect(data).toEqual({
        idPatient: 'PAT_TEST',
        idProposition: 'PROP_1',
        praticienEmail: 'praticien@wellneuro.fr',
        geste: 'reprise',
        // ARBITRAGE 3 du LOT-02 : une reprise ne porte aucun motif d'écart.
        motif: null,
      });
    });

    it('un objectif ORDINAIRE ne passe pas par la transaction et n’écrit aucun geste', async () => {
      await POST(postRequest(corps()));
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.dispositionProposition.create).not.toHaveBeenCalled();
      const { data } = prisma.objectifNegocie.create.mock.calls[0][0];
      expect(data.sourcePropositionId).toBeNull();
    });

    it('REFUSE un fragment qui n’est pas un verbatim d’anamnèse — 422', async () => {
      // LE CŒUR DU LOT. Le libellé d'une règle signée est une parole de la
      // machine ; le déposer dans `enoncePatient` ferait dire au patient ce
      // qu'il n'a pas dit, avec l'apparence d'une citation (`D-094`).
      const reponse = await POST(postRequest(corpsReprise({ sourceFragmentIndex: 0 })));
      expect(reponse.status).toBe(422);
      expect(await corpsDe(reponse)).toMatchObject({ reason: 'fragment_non_citable' });
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
      expect(prisma.dispositionProposition.create).not.toHaveBeenCalled();
    });

    it('refuse un indice de fragment absent, hors bornes ou non entier — 400', async () => {
      for (const index of [undefined, -1, 1.5, 9, '1', null]) {
        vi.clearAllMocks();
        prisma.patient.findUnique.mockResolvedValue({
          praticienEmail: 'praticien@wellneuro.fr',
          actif: true,
          suiviClotureLe: null,
        });
        prisma.propositionObjectif.findMany.mockResolvedValue([PROPOSITION()]);
        prisma.dispositionProposition.findMany.mockResolvedValue([]);
        const reponse = await POST(postRequest(corpsReprise({ sourceFragmentIndex: index })));
        expect(reponse.status).toBe(400);
        expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
      }
    });

    it('rend 404 sur une proposition inconnue OU d’un autre dossier — même réponse', async () => {
      prisma.propositionObjectif.findMany.mockResolvedValue([]);
      const reponse = await POST(postRequest(corpsReprise()));
      expect(reponse.status).toBe(404);
      expect(await corpsDe(reponse)).toMatchObject({ reason: 'proposition_introuvable' });
      // La lecture est SCOPÉE AU DOSSIER : sans `idPatient`, l'index
      // `(id_patient, cree_le)` ne peut pas être emprunté.
      expect(prisma.propositionObjectif.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idPatient: 'PAT_TEST' } }),
      );
    });

    it('rend 409 sur une proposition CADUQUE — les sources ont bougé', async () => {
      prisma.propositionObjectif.findMany.mockResolvedValue([
        PROPOSITION(),
        { ...PROPOSITION(), id: 'PROP_NEUVE', assembleeLe: new Date('2026-08-25T10:00:00.000Z') },
      ]);
      const reponse = await POST(postRequest(corpsReprise()));
      expect(reponse.status).toBe(409);
      expect(await corpsDe(reponse)).toMatchObject({ reason: 'proposition_caduque' });
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });

    it('rend 409 sur une proposition DÉJÀ disposée — reprise comme écartée', async () => {
      for (const geste of ['reprise', 'ecartee']) {
        vi.clearAllMocks();
        prisma.patient.findUnique.mockResolvedValue({
          praticienEmail: 'praticien@wellneuro.fr',
          actif: true,
          suiviClotureLe: null,
        });
        prisma.propositionObjectif.findMany.mockResolvedValue([PROPOSITION()]);
        prisma.dispositionProposition.findMany.mockResolvedValue([
          { id: 'DIS_1', idProposition: 'PROP_1', geste, creeLe: new Date('2026-08-25T09:30:00.000Z') },
        ]);
        const reponse = await POST(postRequest(corpsReprise()));
        expect(reponse.status).toBe(409);
        expect(await corpsDe(reponse)).toMatchObject({ reason: 'proposition_disposee' });
        expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
      }
    });

    it('refuse de cumuler une révision et une reprise — 400', async () => {
      // Reformuler un objectif issu d'une proposition ne la reprend pas une
      // seconde fois : le lien appartient à la version d'origine. Les cumuler
      // ferait compter deux reprises là où le praticien n'en a fait qu'une, et
      // le bilan du LOT-06 lit précisément ces gestes.
      const reponse = await POST(
        postRequest(corpsReprise({ supersedesObjectifId: 'OBJ_1' })),
      );
      expect(reponse.status).toBe(400);
      expect(await corpsDe(reponse)).toMatchObject({ reason: 'reprise_sur_revision' });
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });

    it('est gardée par le drapeau, alors que l’objectif ordinaire ne l’est pas', async () => {
      // B1, relevé en revue. Sans cette garde, éteindre `WN_OBJECTIF_PROPOSE`
      // — la seule manette de réversibilité de `D-094` — laissait un onglet
      // resté ouvert continuer d'écrire des reprises, et le matériau du bilan
      // LOT-06 se remplir sur un dossier officiellement retiré.
      vi.stubEnv('WN_OBJECTIF_PROPOSE', '');
      const refus = await POST(postRequest(corpsReprise()));
      expect(refus.status).toBe(503);
      expect(await corpsDe(refus)).toMatchObject({ reason: 'feature_disabled' });
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();

      // ET L'OBJECTIF ORDINAIRE PASSE TOUJOURS : c'est une surface de 6.0-A,
      // que ce lot n'a pas à fermer.
      expect((await POST(postRequest(corps()))).status).toBe(201);
    });

    it('le repli par dossier ferme la reprise, sans dire que c’est le repli', async () => {
      vi.stubEnv('WN_OBJECTIF_PROPOSE_PATIENTS', 'PAT_AUTRE');
      const refus = await POST(postRequest(corpsReprise()));
      expect(refus.status).toBe(503);
      // MÊME réponse que le drapeau : les distinguer dirait à l'appelant qu'un
      // dossier a été retiré du périmètre, ce qui ne le regarde pas.
      expect(await corpsDe(refus)).toMatchObject({ reason: 'feature_disabled' });
    });

    it('refuse un fragment mal formé sans jamais le compléter', async () => {
      // Les trois branches que l'indice seul ne couvrait pas : `fragments` qui
      // n'est pas un tableau, une source absente, un texte vide sur un
      // fragment pourtant d'anamnèse. Rien n'est deviné.
      const malformes = [
        { fragments: 'pas un tableau' },
        { fragments: [{ texte: 'x' }, { texte: 'Des mots sans provenance' }] },
        { fragments: [{ texte: 'x' }, { texte: '   ', source: { nature: 'anamnese' } }] },
      ];
      for (const surcharge of malformes) {
        vi.clearAllMocks();
        prisma.patient.findUnique.mockResolvedValue({
          praticienEmail: 'praticien@wellneuro.fr',
          actif: true,
          suiviClotureLe: null,
        });
        prisma.dispositionProposition.findMany.mockResolvedValue([]);
        prisma.propositionObjectif.findMany.mockResolvedValue([{ ...PROPOSITION(), ...surcharge }]);
        const reponse = await POST(postRequest(corpsReprise()));
        expect([400, 422]).toContain(reponse.status);
        expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
      }
    });

    it('n’emprunte aucune écriture destructrice sur les tables 6.0-B', async () => {
      await POST(postRequest(corpsReprise()));
      for (const mock of [
        prisma.propositionObjectif.update,
        prisma.propositionObjectif.deleteMany,
        prisma.dispositionProposition.update,
        prisma.dispositionProposition.deleteMany,
      ]) {
        expect(mock).not.toHaveBeenCalled();
      }
    });
  });

  // ── La citation d'un amendement (Alliance 6.0-B, LOT-04, D-110) ───────────

  describe('citer les mots du patient', () => {
    const TEXTE_PATIENT = 'Ce que je veux, c’est tenir debout jusqu’au dîner.';

    const corpsCitation = (partiel: Record<string, unknown> = {}) => ({
      idPatient: 'PAT_TEST',
      // Écrit par l'appelant, JAMAIS lu : la route recopie l'amendement.
      enoncePatient: 'Texte que l’écran a inventé.',
      reformulationPraticien: 'Fatigue de fin d’après-midi, pas un trouble du sommeil.',
      supersedesObjectifId: 'OBJ_1',
      amendementCiteId: 'AME_1',
      ...partiel,
    });

    beforeEach(() => {
      prisma.objectifNegocie.findUnique.mockResolvedValue({
        idPatient: 'PAT_TEST',
        enoncePatient: 'Je voudrais dormir sans me réveiller à trois heures.',
      });
      prisma.objectifNegocie.findMany.mockResolvedValue([
        { id: 'OBJ_1', supersedesObjectifId: null, creeLe: new Date('2026-08-20T09:00:00.000Z') },
      ]);
      prisma.amendementObjectif.findUnique.mockResolvedValue({
        idPatient: 'PAT_TEST',
        idObjectif: 'OBJ_1',
        texte: TEXTE_PATIENT,
      });
    });

    it('L’ÉNONCÉ EST RECOPIÉ DE L’AMENDEMENT, jamais pris du corps', async () => {
      const reponse = await POST(postRequest(corpsCitation()));
      expect(reponse.status).toBe(201);
      const { data } = prisma.objectifNegocie.create.mock.calls[0][0];
      expect(data.enoncePatient).toBe(TEXTE_PATIENT);
      expect(data.supersedesObjectifId).toBe('OBJ_1');
      // La version précédente n'est pas touchée : append-only.
      expect(prisma.objectifNegocie.update).not.toHaveBeenCalled();
    });

    it('N’ÉCRIT JAMAIS dans la table des amendements — citer, c’est lire', async () => {
      await POST(postRequest(corpsCitation()));
      expect(prisma.amendementObjectif.create).not.toHaveBeenCalled();
      expect(prisma.amendementObjectif.deleteMany).not.toHaveBeenCalled();
    });

    it('refuse une citation SANS version à reformuler — deux têtes seraient créées', async () => {
      const reponse = await POST(
        postRequest(corpsCitation({ supersedesObjectifId: null })),
      );
      expect(reponse.status).toBe(400);
      expect((await corpsDe(reponse)).reason).toBe('amendement_sans_revision');
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });

    it('refuse de cumuler une proposition et un amendement — un énoncé a UNE source', async () => {
      const reponse = await POST(
        postRequest(corpsCitation({ sourcePropositionId: 'PROP_1' })),
      );
      expect(reponse.status).toBe(400);
      expect((await corpsDe(reponse)).reason).toBe('citation_double');
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });

    it('amendement inexistant ou d’un AUTRE dossier : MÊME 404, MÊME message', async () => {
      prisma.amendementObjectif.findUnique.mockResolvedValue(null);
      const inexistant = await POST(postRequest(corpsCitation()));
      expect(inexistant.status).toBe(404);
      const message = (await corpsDe(inexistant)).error;

      prisma.amendementObjectif.findUnique.mockResolvedValue({
        idPatient: 'PAT_AUTRE',
        idObjectif: 'OBJ_1',
        texte: TEXTE_PATIENT,
      });
      const autre = await POST(postRequest(corpsCitation()));
      expect(autre.status).toBe(404);
      expect((await corpsDe(autre)).error).toBe(message);
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });

    it('refuse en 409 un amendement portant sur une AUTRE chaîne du dossier', async () => {
      prisma.amendementObjectif.findUnique.mockResolvedValue({
        idPatient: 'PAT_TEST',
        idObjectif: 'OBJ_AILLEURS',
        texte: TEXTE_PATIENT,
      });
      const reponse = await POST(postRequest(corpsCitation()));
      expect(reponse.status).toBe(409);
      expect((await corpsDe(reponse)).reason).toBe('amendement_hors_chaine');
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });

    it('accepte un amendement écrit sur une version ANTÉRIEURE de la même chaîne', async () => {
      // Le patient a écrit sur `v1`, le praticien a reformulé en `v2` sans
      // l'intégrer, il l'intègre maintenant. Sa parole n'a pas cessé de
      // concerner cet objectif parce qu'une version s'est intercalée.
      prisma.objectifNegocie.findUnique.mockResolvedValue({
        idPatient: 'PAT_TEST',
        enoncePatient: 'Reformulation intermédiaire.',
      });
      prisma.objectifNegocie.findMany.mockResolvedValue([
        { id: 'OBJ_0', supersedesObjectifId: null, creeLe: new Date('2026-08-19T09:00:00.000Z') },
        { id: 'OBJ_1', supersedesObjectifId: 'OBJ_0', creeLe: new Date('2026-08-20T09:00:00.000Z') },
      ]);
      prisma.amendementObjectif.findUnique.mockResolvedValue({
        idPatient: 'PAT_TEST',
        idObjectif: 'OBJ_0',
        texte: TEXTE_PATIENT,
      });
      const reponse = await POST(postRequest(corpsCitation()));
      expect(reponse.status).toBe(201);
      const { data } = prisma.objectifNegocie.create.mock.calls[0][0];
      expect(data.enoncePatient).toBe(TEXTE_PATIENT);
    });

    it('une référence hors bornes est refusée en 400, sans lire la table', async () => {
      const reponse = await POST(postRequest(corpsCitation({ amendementCiteId: 'x'.repeat(65) })));
      expect(reponse.status).toBe(400);
      expect(prisma.amendementObjectif.findUnique).not.toHaveBeenCalled();
    });

    it('refuse une référence non textuelle en 400', async () => {
      for (const amendementCiteId of [42, [], {}, true]) {
        const reponse = await POST(postRequest(corpsCitation({ amendementCiteId })));
        expect(reponse.status).toBe(400);
      }
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });

    it('LA CITATION RESTE OUVERTE DRAPEAU ÉTEINT — choix assumé, épinglé ici', async () => {
      // `WN_DOSSIER_DEUX_VOIX` garde la surface du PATIENT. Ce qui est déjà
      // écrit est une pièce du dossier, et reformuler un objectif n'a jamais été
      // sous drapeau. Si ce cas devient rouge un jour, c'est une décision à
      // prendre — pas un réglage à ajuster.
      vi.stubEnv('WN_DOSSIER_DEUX_VOIX', '');
      const reponse = await POST(postRequest(corpsCitation()));
      expect(reponse.status).toBe(201);
      const { data } = prisma.objectifNegocie.create.mock.calls[0][0];
      expect(data.enoncePatient).toBe(TEXTE_PATIENT);
    });

    it('et le GET sert les mots du patient, drapeau éteint aussi', async () => {
      // Les masquer rendrait le praticien aveugle à une pièce réelle du dossier.
      vi.stubEnv('WN_DOSSIER_DEUX_VOIX', '');
      prisma.amendementObjectif.findMany.mockResolvedValue([
        {
          id: 'AME_1',
          idObjectif: 'OBJ_1',
          texte: TEXTE_PATIENT,
          creeLe: new Date('2026-08-25T12:00:00.000Z'),
        },
      ]);
      const charge = await corpsDe(await GET(getRequest()));
      expect(charge.amendements).toHaveLength(1);
    });

    it('une version DÉJÀ REFORMULÉE reste refusée — la citation ne contourne pas la garde', async () => {
      prisma.objectifNegocie.findFirst.mockResolvedValue({ id: 'OBJ_2' });
      const reponse = await POST(postRequest(corpsCitation()));
      expect(reponse.status).toBe(409);
      expect((await corpsDe(reponse)).reason).toBe('objectif_supplante');
      expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    });
  });

  // ── Le GET sert les amendements (Alliance 6.0-B, LOT-04) ──────────────────

  describe('GET — les mots du patient au cockpit', () => {
    it('sert les amendements tels quels, sans décompte ni résumé', async () => {
      prisma.objectifNegocie.findMany.mockResolvedValue([ligneLue({ sourcePropositionId: null })]);
      prisma.amendementObjectif.findMany.mockResolvedValue([
        {
          id: 'AME_1',
          idObjectif: 'OBJ_1',
          texte: 'Tenir debout jusqu’au dîner.',
          creeLe: new Date('2026-08-25T12:00:00.000Z'),
        },
      ]);
      const charge = await corpsDe(await GET(getRequest()));
      expect(charge.amendements).toEqual([
        {
          id: 'AME_1',
          idObjectif: 'OBJ_1',
          texte: 'Tenir debout jusqu’au dîner.',
          creeLe: '2026-08-25T12:00:00.000Z',
        },
      ]);
    });

    it('l’état dérivé lit LES DEUX TABLES — « dit autrement » l’emporte s’il est le dernier', async () => {
      prisma.objectifNegocie.findMany.mockResolvedValue([ligneLue({ sourcePropositionId: null })]);
      prisma.ratificationObjectif.findMany.mockResolvedValue([
        {
          id: 'RAT_1',
          idObjectif: 'OBJ_1',
          sens: 'ratifie',
          creeLe: new Date('2026-08-24T12:00:00.000Z'),
        },
      ]);
      prisma.amendementObjectif.findMany.mockResolvedValue([
        {
          id: 'AME_1',
          idObjectif: 'OBJ_1',
          texte: 'Tenir debout jusqu’au dîner.',
          creeLe: new Date('2026-08-25T12:00:00.000Z'),
        },
      ]);
      const charge = await corpsDe(await GET(getRequest()));
      expect(charge.ratifications).toEqual({ OBJ_1: 'dit_autrement' });
    });
  });

  // ── LE RÉCIT D'ÉTAPE (6.0-B, LOT-05) ──────────────────────────────────────

  describe('les réponses d’étape sont SERVIES, jamais écrites ici', () => {
    const ETAPE = {
      id: 'REP_1',
      idObjectif: 'OBJ_1',
      jalon: 'J21',
      texte: 'Je tiens trois soirs sur sept.',
      eva: 6,
      creeLe: new Date('2026-08-26T12:00:00.000Z'),
    };

    beforeEach(() => {
      prisma.objectifNegocie.findMany.mockResolvedValue([ligneLue({ sourcePropositionId: null })]);
    });

    /** Le corps servi est typé `Record<string, unknown>` : on nomme la lecture
     *  plutôt que de la répéter à chaque assertion. */
    const servies = (charge: Record<string, unknown>) =>
      charge.reponsesJalon as { eva: number | null }[];

    it('sert la ligne telle quelle, EVA comprise, sans rien écrire', async () => {
      prisma.reponseJalonObjectif.findMany.mockResolvedValue([ETAPE]);

      const charge = await corpsDe(await GET(getRequest()));
      expect(charge.reponsesJalon).toEqual([
        {
          id: 'REP_1',
          idObjectif: 'OBJ_1',
          jalon: 'J21',
          texte: 'Je tiens trois soirs sur sept.',
          eva: 6,
          creeLe: '2026-08-26T12:00:00.000Z',
        },
      ]);
      // `reponduLe` est une colonne de DÉCLARATION, nulle par construction :
      // la servir inviterait un écran à la combler par `creeLe`.
      expect(Object.keys(servies(charge)[0])).not.toContain('reponduLe');
      expect(prisma.reponseJalonObjectif.create).not.toHaveBeenCalled();
    });

    it('UN `eva` NUL TRAVERSE LA ROUTE INTACT — jamais replié sur zéro', async () => {
      prisma.reponseJalonObjectif.findMany.mockResolvedValue([{ ...ETAPE, eva: null }]);

      const charge = await corpsDe(await GET(getRequest()));
      expect(servies(charge)[0].eva).toBeNull();
    });

    it('un `eva` à zéro reste zéro — c’est une réponse, pas une absence', async () => {
      prisma.reponseJalonObjectif.findMany.mockResolvedValue([{ ...ETAPE, eva: 0 }]);

      const charge = await corpsDe(await GET(getRequest()));
      expect(servies(charge)[0].eva).toBe(0);
    });

    it('les réponses d’étape N’ENTRENT PAS dans l’état de ratification', async () => {
      // Dire où l'on en est n'est ni ratifier, ni contester, ni reformuler.
      prisma.reponseJalonObjectif.findMany.mockResolvedValue([ETAPE]);
      prisma.ratificationObjectif.findMany.mockResolvedValue([]);
      prisma.amendementObjectif.findMany.mockResolvedValue([]);

      const charge = await corpsDe(await GET(getRequest()));
      expect(charge.ratifications).toEqual({ OBJ_1: 'en_attente' });
    });
  });
});

// ---------------------------------------------------------------------------
// M02 / D-153 — l'objectif rédigé atteint le patient.
//
// Mesure de production du 2026-09-08 : 4 propositions, 1 objectif négocié, et
// 0 ratification, 0 amendement, 0 réponse de jalon — les trois drapeaux de la
// chaîne étant pourtant posés (`WN_OBJECTIF_PROPOSE`, `WN_DOSSIER_DEUX_VOIX`,
// `WN_CE_QUI_COMPTE` tous à `true`). Le retour spontané au portail, seul chemin
// jusqu'ici, est démenti par ces chiffres.
// ---------------------------------------------------------------------------
describe('/api/praticien/objectifs — notification du patient (M02, D-153)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'praticien@wellneuro.fr',
      actif: true,
      suiviClotureLe: null,
      email: 'sophie.nicola@fictif.wellneuro.fr',
      prenom: 'Sophie',
    });
    prisma.consultation.findFirst.mockResolvedValue(null);
    prisma.objectifNegocie.findMany.mockResolvedValue([]);
    prisma.objectifNegocie.findUnique.mockResolvedValue(null);
    prisma.objectifNegocie.findFirst.mockResolvedValue(null);
    prisma.ratificationObjectif.findMany.mockResolvedValue([]);
    prisma.amendementObjectif.findMany.mockResolvedValue([]);
    prisma.reponseJalonObjectif.findMany.mockResolvedValue([]);
    prisma.propositionObjectif.findMany.mockResolvedValue([]);
    prisma.dispositionProposition.findMany.mockResolvedValue([]);
    prisma.objectifNegocie.create.mockResolvedValue(ligneLue({ id: 'OBJ_NEUF' }));
    sendObjectifProposeEmail.mockReset();
    sendObjectifProposeEmail.mockResolvedValue('Envoye');
  });

  it('un objectif écrit notifie le patient, par son adresse de dossier', async () => {
    expect((await POST(postRequest(corps()))).status).toBe(201);
    expect(sendObjectifProposeEmail).toHaveBeenCalledTimes(1);
    expect(sendObjectifProposeEmail).toHaveBeenCalledWith(
      'sophie.nicola@fictif.wellneuro.fr',
      'Sophie',
      'PAT_TEST',
    );
  });

  // L'énoncé porte les mots du patient sur ce qui l'amène : le contenu le plus
  // nominatif du dossier. Il ne franchit pas la frontière de l'e-mail.
  it('l’énoncé de l’objectif ne franchit pas la frontière de l’e-mail', async () => {
    await POST(postRequest(corps()));
    const args = JSON.stringify(sendObjectifProposeEmail.mock.calls[0]);
    expect(args).not.toContain('dormir');
    expect(args).not.toContain('trois heures');
  });

  // CES DEUX BANCS ONT ÉTÉ RÉÉCRITS. Ils affirmaient d'abord « le dossier clos
  // ne reçoit rien » en s'appuyant sur un contrôle placé dans la notification —
  // et ils passaient pour la MAUVAISE raison : le POST refuse 409 bien avant,
  // si bien que supprimer ce contrôle ne les faisait pas rougir. Le mutant l'a
  // montré. Ils éprouvent désormais la vraie porte : le refus d'entrée, avant
  // toute écriture, donc avant tout envoi.
  it('un dossier CLOS est refusé à l’entrée : ni écriture, ni envoi', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'praticien@wellneuro.fr',
      actif: true,
      suiviClotureLe: new Date('2026-08-01T00:00:00.000Z'),
      email: 'sophie.nicola@fictif.wellneuro.fr',
      prenom: 'Sophie',
    });
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(409);
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    expect(sendObjectifProposeEmail).not.toHaveBeenCalled();
  });

  it('un dossier DÉSACTIVÉ est refusé de la même façon', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'praticien@wellneuro.fr',
      actif: false,
      suiviClotureLe: null,
      email: 'sophie.nicola@fictif.wellneuro.fr',
      prenom: 'Sophie',
    });
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(409);
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    expect(sendObjectifProposeEmail).not.toHaveBeenCalled();
  });

  it('un dossier sans adresse n’émet aucun envoi', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'praticien@wellneuro.fr',
      actif: true,
      suiviClotureLe: null,
      email: null,
      prenom: 'Sophie',
    });
    await POST(postRequest(corps()));
    expect(sendObjectifProposeEmail).not.toHaveBeenCalled();
  });

  // LE POINT LE PLUS IMPORTANT DU LOT. L'objectif est DÉJÀ écrit quand l'envoi
  // a lieu : un relais SMTP en panne ne doit pas transformer une écriture
  // réussie en 500, ni faire croire au praticien qu'il doit recommencer.
  // L'échec est journalisé par l'envoyeur (donc visible sur la fiche depuis
  // D-148), puis absorbé.
  it('un envoi qui échoue n’annule pas l’écriture : la réponse reste 201', async () => {
    sendObjectifProposeEmail.mockRejectedValue(new Error('550 relais refusé'));
    const res = await POST(postRequest(corps()));
    expect(res.status).toBe(201);
    expect((await corpsDe(res)).ok).toBe(true);
    expect(prisma.objectifNegocie.create).toHaveBeenCalledTimes(1);
  });

  it('un refus AVANT écriture ne notifie personne', async () => {
    // Énoncé vide : la préparation refuse, rien n'est écrit — donc rien ne part.
    const res = await POST(postRequest(corps({ enoncePatient: '   ' })));
    expect(res.status).toBe(400);
    expect(prisma.objectifNegocie.create).not.toHaveBeenCalled();
    expect(sendObjectifProposeEmail).not.toHaveBeenCalled();
  });
});
