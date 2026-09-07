import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma, verifierAppartenancePatient, isC4Enabled } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    critereDossierConstate: { findMany: vi.fn(), upsert: vi.fn() },
    clinicalCriterion: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn() },
  },
  verifierAppartenancePatient: vi.fn(),
  isC4Enabled: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/praticien/appartenance', () => ({
  verifierAppartenancePatient,
  emailPraticien: () => 'praticien@wellneuro.fr',
}));
vi.mock('@/lib/supplement-library/featureFlag', () => ({ isC4Enabled }));

import { GET, POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/criteres-dossier';
const ID_PATIENT = 'PAT_SEED_03';

function lecture(params: Record<string, string> = {}): Request {
  const url = new URL(URL_BASE);
  for (const [cle, valeur] of Object.entries(params)) url.searchParams.set(cle, valeur);
  return new Request(url, { method: 'GET' });
}

function requete(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const LIGNE = {
  critereId: 'crit_isrs',
  present: true,
  note: null,
  constateLe: new Date('2026-09-07T10:00:00.000Z'),
  constatePar: 'praticien@wellneuro.fr',
  critere: { code: 'sous_isrs', labelFr: 'Sous ISRS' },
};

describe('/api/praticien/criteres-dossier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isC4Enabled.mockReturnValue(true);
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    verifierAppartenancePatient.mockResolvedValue('ok');
    prisma.patient.findUnique.mockResolvedValue({ actif: true, suiviClotureLe: null });
    prisma.clinicalCriterion.findUnique.mockResolvedValue({ id: 'crit_isrs', actif: true });
    prisma.critereDossierConstate.upsert.mockResolvedValue(LIGNE);
    prisma.critereDossierConstate.findMany.mockResolvedValue([LIGNE]);
  });

  // LE POINT QUI COMPTE LE PLUS. `present` ne se devine pas : un champ oublié,
  // une chaîne « false », un 0, ne doivent JAMAIS devenir un constat d'absence.
  // Un silence du client deviendrait sinon un fait clinique signé du praticien
  // (`DC-24`), et le moteur le lirait comme « le praticien a constaté que non ».
  describe('`present` ne se devine pas', () => {
    for (const [nom, valeur] of [
      ['absent', undefined],
      ['chaîne « true »', 'true'],
      ['chaîne « false »', 'false'],
      ['zéro', 0],
      ['nul', null],
    ] as const) {
      it(`refuse un \`present\` ${nom}`, async () => {
        const res = await POST(requete({ idPatient: ID_PATIENT, critereId: 'crit_isrs', present: valeur }));
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toMatchObject({ reason: 'present_requis' });
        expect(prisma.critereDossierConstate.upsert).not.toHaveBeenCalled();
      });
    }

    it('accepte `false` — un constat d’ABSENCE est un constat', async () => {
      prisma.critereDossierConstate.upsert.mockResolvedValue({ ...LIGNE, present: false });
      const res = await POST(requete({ idPatient: ID_PATIENT, critereId: 'crit_isrs', present: false }));
      expect(res.status).toBe(200);
      expect(prisma.critereDossierConstate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ present: false }) }),
      );
    });
  });

  // LE SIGNATAIRE VIENT DE LA SESSION, JAMAIS DU CLIENT — et le bloc `update`
  // le RÉÉCRIT : sans cela, re-constater laisserait la ligne attribuée au
  // premier praticien alors qu'un second l'a posée.
  it('signe avec l’e-mail de session, à la création comme à la mise à jour', async () => {
    await POST(requete({
      idPatient: ID_PATIENT, critereId: 'crit_isrs', present: true,
      constatePar: 'usurpateur@ailleurs.test', constateLe: '2020-01-01T00:00:00.000Z',
    }));
    const appel = prisma.critereDossierConstate.upsert.mock.calls[0][0];
    expect(appel.create.constatePar).toBe('praticien@wellneuro.fr');
    expect(appel.update.constatePar).toBe('praticien@wellneuro.fr');
    expect(appel.create).not.toHaveProperty('constateLe');
    expect(appel.update).not.toHaveProperty('constateLe');
  });

  it('vise UN constat par (dossier, critère)', async () => {
    await POST(requete({ idPatient: ID_PATIENT, critereId: 'crit_isrs', present: true }));
    expect(prisma.critereDossierConstate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idPatient_critereId: { idPatient: ID_PATIENT, critereId: 'crit_isrs' } },
      }),
    );
  });

  it('refuse un critère inconnu ou inactif — le vocabulaire est gouverné', async () => {
    prisma.clinicalCriterion.findUnique.mockResolvedValue({ id: 'crit_isrs', actif: false });
    const res = await POST(requete({ idPatient: ID_PATIENT, critereId: 'crit_isrs', present: true }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ reason: 'critere_introuvable' });
    expect(prisma.critereDossierConstate.upsert).not.toHaveBeenCalled();
  });

  it('refuse une note au-delà de 2 000 caractères — la borne du CHECK', async () => {
    const res = await POST(requete({
      idPatient: ID_PATIENT, critereId: 'crit_isrs', present: true, note: 'x'.repeat(2001),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ reason: 'note_trop_longue' });
  });

  it('refuse un dossier clos — la consignation se refuse dans la route', async () => {
    prisma.patient.findUnique.mockResolvedValue({ actif: false, suiviClotureLe: new Date() });
    const res = await POST(requete({ idPatient: ID_PATIENT, critereId: 'crit_isrs', present: true }));
    expect(res.status).toBe(409);
    expect(prisma.critereDossierConstate.upsert).not.toHaveBeenCalled();
  });

  it('refuse un dossier d’un autre praticien', async () => {
    verifierAppartenancePatient.mockResolvedValue('autre_praticien');
    expect((await POST(requete({ idPatient: ID_PATIENT, critereId: 'crit_isrs', present: true }))).status)
      .toBe(403);
    expect((await GET(lecture({ idPatient: ID_PATIENT }))).status).toBe(403);
  });

  it('se ferme sur le drapeau C4 éteint, en écriture comme en lecture', async () => {
    isC4Enabled.mockReturnValue(false);
    expect((await POST(requete({ idPatient: ID_PATIENT, critereId: 'crit_isrs', present: true }))).status)
      .toBe(404);
    expect((await GET(lecture({ idPatient: ID_PATIENT }))).status).toBe(404);
  });

  // UN RÉFÉRENTIEL QU'ON ÉCRIT SANS POUVOIR LE RELIRE N'EN EST PAS UN
  // ([[D-132]]) : sans lecture, un second constat partirait à l'aveugle contre
  // une ligne qu'on ne voit pas.
  it('relit les constats du dossier, critère nommé', async () => {
    const res = await GET(lecture({ idPatient: ID_PATIENT }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      constats: [{ critereId: 'crit_isrs', code: 'sous_isrs', labelFr: 'Sous ISRS', present: true }],
    });
    expect(prisma.critereDossierConstate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idPatient: ID_PATIENT } }),
    );
  });

  it('refuse un identifiant patient malformé', async () => {
    expect((await GET(lecture({ idPatient: 'PAT/../autre' }))).status).toBe(400);
  });
});
