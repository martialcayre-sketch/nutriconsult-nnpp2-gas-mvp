import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma, sendPortailLinkEmail } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn(), update: vi.fn() },
    consultation: { findMany: vi.fn(), create: vi.fn() },
    journalAccesDossier: { create: vi.fn(), deleteMany: vi.fn() },
  },
  sendPortailLinkEmail: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/consultation/email', () => ({ sendPortailLinkEmail }));
vi.mock('@/lib/ids', () => ({ createPublicId: (prefix: string) => `${prefix}_TEST_12345678` }));

import { GET, POST } from './route';

const patient = {
  idPatient: 'PAT_1',
  praticienEmail: 'p@wellneuro.fr',
  email: 'sophie.nicola@example.test',
  prenom: 'Sophie',
  actif: true,
  accessTokenRevoked: true,
};

function getRequest(query = 'idPatient=PAT_1'): Request {
  return new Request(`http://localhost/api/praticien/consultations?${query}`);
}

function postRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/praticien/consultations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/praticien/consultations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.consultation.findMany.mockResolvedValue([]);
  });

  it('refuse sans session (401)', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(prisma.consultation.findMany).not.toHaveBeenCalled();
  });

  it('scope la recherche des consultations au praticien en session', async () => {
    await GET(getRequest());
    expect(prisma.consultation.findMany).toHaveBeenCalledWith({
      where: { idPatient: 'PAT_1', praticienEmail: 'p@wellneuro.fr' },
      orderBy: { createdAt: 'desc' },
    });
    // Liste vide : dossier non prouvé accessible → pas de journalisation
    // (limite assumée, LOT-00).
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('liste non vide → lecture journalisée au gabarit littéral (G-TRUST-04)', async () => {
    prisma.consultation.findMany.mockResolvedValue([
      {
        idConsultation: 'CONS_1',
        idPatient: 'PAT_1',
        motif: 'Suivi',
        statut: 'validee',
        dateValidation: new Date('2026-07-01T00:00:00.000Z'),
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledTimes(1);
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledWith({
      data: {
        idPatient: 'PAT_1',
        praticienEmail: 'p@wellneuro.fr',
        route: '/api/praticien/consultations',
        methode: 'GET',
      },
    });
  });
});

// Régression E8 — la plus grave des trois : sans garde, cette route levait la
// révocation d'accès d'un patient et envoyait le lien du portail, pour
// n'importe quel idPatient fourni. Garde d'appartenance ajoutée le 2026-07-21.
describe('POST /api/praticien/consultations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue(patient);
    prisma.consultation.create.mockResolvedValue({});
    sendPortailLinkEmail.mockResolvedValue('Envoye');
  });

  it('refuse sans session (401)', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(postRequest({ idPatient: 'PAT_1' }));
    expect(res.status).toBe(401);
  });

  it('patient d’un autre praticien : 403, aucune écriture, aucun e-mail envoyé', async () => {
    prisma.patient.findUnique.mockResolvedValue({ ...patient, praticienEmail: 'autre@wellneuro.fr' });
    const res = await POST(postRequest({ idPatient: 'PAT_1' }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { reason: string };
    expect(json.reason).toBe('forbidden');
    expect(prisma.patient.update).not.toHaveBeenCalled();
    expect(prisma.consultation.create).not.toHaveBeenCalled();
    expect(sendPortailLinkEmail).not.toHaveBeenCalled();
  });

  it('idPatient introuvable : 404, distinct du 403', async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ idPatient: 'PAT_INCONNU' }));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { reason: string };
    expect(json.reason).toBe('patient_not_found');
  });

  it('patient accessible : lève la révocation et envoie le lien (comportement inchangé pour le bon praticien)', async () => {
    const res = await POST(postRequest({ idPatient: 'PAT_1' }));
    expect(res.status).toBe(200);
    expect(prisma.patient.update).toHaveBeenCalledWith({
      where: { idPatient: 'PAT_1' },
      data: expect.objectContaining({ accessTokenRevoked: false }),
    });
    expect(sendPortailLinkEmail).toHaveBeenCalledOnce();
    // Le 4e argument porte le `Reply-To` : sans cette assertion, un
    // remaniement le perdrait sans qu'aucun banc ne rougisse, et le bouton
    // « Répondre » du patient viserait de nouveau `noreply@`.
    expect(sendPortailLinkEmail).toHaveBeenCalledWith(
      'sophie.nicola@example.test',
      'Sophie',
      'PAT_1',
      'p@wellneuro.fr',
    );
    // Le POST ne journalise pas (GD-1) : il laisse déjà une trace datée.
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  // Cette route CRÉE une consultation, réactive au besoin un jeton révoqué et
  // envoie un e-mail : soit exactement ce que la clôture de suivi interdit. Le
  // garde manquait ici alors qu'assignation, pack et envoi de booklet
  // l'avaient déjà — et le libellé de la clôture promet au praticien
  // qu'aucun document ne partira.
  it('un envoi mort ne s’annonce plus « envoyé » — la consultation est créée quand même', async () => {
    // LE DÉFAUT A05, EN UN CAS. Le `catch` avalait l'échec et la route rendait
    // `success: true` sans rien dire : l'écran affichait « lien d'accès envoyé
    // au patient » sur un e-mail qui n'était jamais parti.
    sendPortailLinkEmail.mockRejectedValueOnce(new Error('smtp down'));
    const res = await POST(postRequest({ idPatient: 'PAT_1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    // `success` ne parle QUE de l'écriture : la consultation existe.
    expect(json.success).toBe(true);
    expect(prisma.consultation.create).toHaveBeenCalledOnce();
    expect(json.envoi).toBe('echoue');
  });

  it('une messagerie non configurée se distingue d’un envoi mort', async () => {
    // Deux causes, deux gestes : réessayer n'a aucun sens quand aucun SMTP
    // n'est posé. La route rend le statut, elle ne le devine pas.
    sendPortailLinkEmail.mockResolvedValueOnce('Non_envoye');
    const res = await POST(postRequest({ idPatient: 'PAT_1' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.envoi).toBe('non_configure');
  });

  it('un envoi réussi le dit explicitement', async () => {
    const res = await POST(postRequest({ idPatient: 'PAT_1' }));
    const json = await res.json();
    expect(json.envoi).toBe('envoye');
  });

  it('dossier au suivi clôturé : 409, aucun e-mail, aucun jeton relevé', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      ...patient,
      suiviClotureLe: new Date('2026-07-21T10:00:00.000Z'),
    });
    const res = await POST(postRequest({ idPatient: 'PAT_1' }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { reason: string };
    // Distinct de `patient_not_found` : le dossier existe et vous est accessible.
    expect(json.reason).toBe('dossier_cloture');
    expect(prisma.patient.update).not.toHaveBeenCalled();
    expect(prisma.consultation.create).not.toHaveBeenCalled();
    expect(sendPortailLinkEmail).not.toHaveBeenCalled();
  });
});
