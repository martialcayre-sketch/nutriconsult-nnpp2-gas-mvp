import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NouveauxPatientsApiResponse } from './route';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findMany: vi.fn() },
    correspondancePatient: { findMany: vi.fn() },
    portailMagicLink: { findMany: vi.fn() },
    portailConnexionGoogle: { findMany: vi.fn() },
    consultation: { findMany: vi.fn() },
    assignation: { groupBy: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { GET } from './route';

const CREE_LE = new Date('2026-09-01T08:00:00.000Z');
const REVOQUE_LE = new Date('2026-09-02T14:00:00.000Z');

function patient(over: Record<string, unknown> = {}) {
  return {
    idPatient: 'PAT_1',
    prenom: 'Sophie',
    nom: 'Nicola',
    createdAt: CREE_LE,
    accessTokenRevoked: false,
    sessionsInvalidesAvant: null,
    ...over,
  };
}

/** Accès envoyé et abouti — sans quoi toute ligne s'arrête à la première porte
 * et ne dit plus rien de l'entrée au portail. */
function accesEnvoye() {
  prisma.correspondancePatient.findMany.mockResolvedValue([
    { idPatient: 'PAT_1', statut: 'Envoye', enregistreLe: CREE_LE },
  ]);
}

function vide() {
  prisma.correspondancePatient.findMany.mockResolvedValue([]);
  prisma.portailMagicLink.findMany.mockResolvedValue([]);
  prisma.portailConnexionGoogle.findMany.mockResolvedValue([]);
  prisma.consultation.findMany.mockResolvedValue([]);
  prisma.assignation.groupBy.mockResolvedValue([]);
}

async function lignes(): Promise<NouveauxPatientsApiResponse['lignes']> {
  const json = (await (await GET()).json()) as NouveauxPatientsApiResponse;
  return json.lignes;
}

describe('GET /api/praticien/nouveaux-patients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findMany.mockResolvedValue([patient()]);
    vide();
  });

  it('refuse sans session, sans se présenter comme une patientèle vide', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET();
    const json = (await res.json()) as NouveauxPatientsApiResponse;
    expect(res.status).toBe(401);
    expect(json.unavailable).toBe(true);
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('scope la lecture au praticien en session et à la fenêtre glissante', async () => {
    await GET();
    const where = prisma.patient.findMany.mock.calls[0][0].where;
    expect(where.praticienEmail).toEqual({ equals: 'p@wellneuro.fr', mode: 'insensitive' });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    // Aucune adresse e-mail patient ne remonte : l'encart identifie, il ne
    // republie pas un contact que le dossier porte déjà.
    expect(prisma.patient.findMany.mock.calls[0][0].select.email).toBeUndefined();
  });

  it('un envoi en Erreur suivi d’un Envoye est un incident résolu, pas un blocage', async () => {
    prisma.correspondancePatient.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', statut: 'Erreur', enregistreLe: new Date('2026-09-01T08:01:00.000Z') },
      { idPatient: 'PAT_1', statut: 'Envoye', enregistreLe: new Date('2026-09-01T08:05:00.000Z') },
    ]);
    const [ligne] = await lignes();
    expect(ligne.accesEnEchec).toBe(false);
    expect(ligne.etape).toBe('jamais_connecte');
  });

  it('un Envoye suivi d’une Erreur laisse le dossier en échec d’envoi', async () => {
    prisma.correspondancePatient.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', statut: 'Envoye', enregistreLe: new Date('2026-09-01T08:01:00.000Z') },
      { idPatient: 'PAT_1', statut: 'Erreur', enregistreLe: new Date('2026-09-01T08:05:00.000Z') },
    ]);
    const [ligne] = await lignes();
    expect(ligne.accesEnEchec).toBe(true);
    expect(ligne.etape).toBe('acces_non_envoye');
  });

  it('ne lit que les liens magiques CONSOMMÉS et les connexions Google abouties', async () => {
    await GET();
    expect(prisma.portailMagicLink.findMany.mock.calls[0][0].where.consommeLe).toEqual({ not: null });
    expect(prisma.portailConnexionGoogle.findMany.mock.calls[0][0].where.issue).toBe('consomme');
  });

  it('retient la PREMIÈRE entrée au portail, quel que soit le chemin', async () => {
    prisma.correspondancePatient.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', statut: 'Envoye', enregistreLe: CREE_LE },
    ]);
    prisma.portailMagicLink.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', consommeLe: new Date('2026-09-03T10:00:00.000Z') },
    ]);
    // Google est arrivé AVANT le lien magique : c'est lui la première entrée.
    prisma.portailConnexionGoogle.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', creeLe: new Date('2026-09-02T10:00:00.000Z') },
    ]);
    const [ligne] = await lignes();
    expect(ligne.connecteLe).toBe('2026-09-02T10:00:00.000Z');
  });

  it('validée avec assignations : dossier complet', async () => {
    prisma.correspondancePatient.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', statut: 'Envoye', enregistreLe: CREE_LE },
    ]);
    prisma.portailMagicLink.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', consommeLe: new Date('2026-09-02T10:00:00.000Z') },
    ]);
    prisma.consultation.findMany.mockResolvedValue([{ idPatient: 'PAT_1' }]);
    prisma.assignation.groupBy.mockResolvedValue([{ idPatient: 'PAT_1', _count: { _all: 5 } }]);
    const [ligne] = await lignes();
    expect(ligne.etape).toBe('complet');
    expect(ligne.nbAssignations).toBe(5);
  });

  it('la date qu’une RÉVOCATION pose sur un lien n’est pas une entrée au portail', async () => {
    // Révoquer date les liens encore en vol pour les refuser ; le dossier a été
    // rouvert depuis (`accessTokenRevoked: false`) et le patient n'est toujours
    // jamais entré. Lire ce tampon comme une connexion le faisait basculer en
    // « Onboarding à finir ».
    prisma.patient.findMany.mockResolvedValue([
      patient({ sessionsInvalidesAvant: REVOQUE_LE }),
    ]);
    accesEnvoye();
    prisma.portailMagicLink.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', consommeLe: REVOQUE_LE },
    ]);
    const [ligne] = await lignes();
    expect(ligne.connecteLe).toBeNull();
    expect(ligne.etape).toBe('jamais_connecte');
  });

  it('une entrée réelle antérieure à la révocation reste une entrée', async () => {
    prisma.patient.findMany.mockResolvedValue([
      patient({ sessionsInvalidesAvant: REVOQUE_LE }),
    ]);
    accesEnvoye();
    prisma.portailMagicLink.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', consommeLe: new Date('2026-09-01T09:00:00.000Z') },
      { idPatient: 'PAT_1', consommeLe: REVOQUE_LE },
    ]);
    const [ligne] = await lignes();
    expect(ligne.connecteLe).toBe('2026-09-01T09:00:00.000Z');
    expect(ligne.etape).toBe('onboarding_a_finir');
  });

  it('après une réouverture, une entrée POSTÉRIEURE à la révocation compte bien', async () => {
    // LE BANC QUI DISTINGUE `===` DE `>=`. Les deux autres passent avec l'un
    // comme avec l'autre ; celui-ci seul refuse le second, qui jetterait
    // l'entrée réelle que la réouverture vient de rendre possible — soit
    // exactement le cas que ce correctif existe pour préserver. Relevé par la
    // revue adversariale de la PR #889.
    prisma.patient.findMany.mockResolvedValue([patient({ sessionsInvalidesAvant: REVOQUE_LE })]);
    accesEnvoye();
    prisma.portailMagicLink.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', consommeLe: REVOQUE_LE },
      { idPatient: 'PAT_1', consommeLe: new Date('2026-09-03T10:00:00.000Z') },
    ]);
    const [ligne] = await lignes();
    expect(ligne.connecteLe).toBe('2026-09-03T10:00:00.000Z');
    expect(ligne.etape).toBe('onboarding_a_finir');
  });

  it('un accès révoqué se nomme, il ne se déguise pas en mise en service', async () => {
    prisma.patient.findMany.mockResolvedValue([
      patient({ accessTokenRevoked: true, sessionsInvalidesAvant: REVOQUE_LE }),
    ]);
    accesEnvoye();
    prisma.portailMagicLink.findMany.mockResolvedValue([
      { idPatient: 'PAT_1', consommeLe: REVOQUE_LE },
    ]);
    const [ligne] = await lignes();
    expect(ligne.etape).toBe('acces_revoque');
    expect(ligne.libelle).toBe('Accès révoqué');
  });

  it('aucun dossier récent : aucune lecture d’agrégat n’est lancée', async () => {
    prisma.patient.findMany.mockResolvedValue([]);
    const json = (await (await GET()).json()) as NouveauxPatientsApiResponse;
    expect(json).toEqual({ ok: true, lignes: [], fenetreJours: 30 });
    expect(prisma.assignation.groupBy).not.toHaveBeenCalled();
  });

  it('une panne de lecture se dit, elle ne rend pas une liste vide', async () => {
    prisma.patient.findMany.mockRejectedValue(new Error('base indisponible'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await GET();
    const json = (await res.json()) as NouveauxPatientsApiResponse;
    expect(res.status).toBe(500);
    expect(json.unavailable).toBe(true);
    expect(json.ok).toBe(false);
  });
});
