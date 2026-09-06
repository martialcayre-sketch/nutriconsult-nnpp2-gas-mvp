import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn() },
    biologyAnalyte: { findUnique: vi.fn() },
    resultatBiologique: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    journalAccesDossier: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { GET, POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/biologie/resultats';
const PRATICIEN = 'praticien@wellneuro.fr';

function getRequest(idPatient: string): Request {
  return new Request(`${URL_BASE}?idPatient=${idPatient}`);
}

function postRequest(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const LIGNE_CONSIGNEE = {
  id: 'res1',
  analyteCode: 'BIO_FERRITINE',
  valeur: 42.5,
  unite: 'µg/L',
  preleveLe: new Date('2026-09-01T08:00:00.000Z'),
  source: 'saisie_praticien',
  saisiLe: new Date('2026-09-01T09:00:00.000Z'),
  supersedesResultatId: null,
  // La RELATION rend l'unité COURANTE du catalogue — ici inchangée.
  analyte: { libelle: 'Ferritine', unite: 'µg/L' },
};

/** La correction de `res1` : même analyte, même prélèvement, valeur neuve. */
const LIGNE_CORRECTION = {
  ...LIGNE_CONSIGNEE,
  id: 'res2',
  valeur: 45.5,
  saisiLe: new Date('2026-09-02T09:00:00.000Z'),
  supersedesResultatId: 'res1',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WN_CB_ENABLED = 'true';
  process.env.WN_CB_RESULTS_ENABLED = 'true';
  getServerSession.mockResolvedValue({ user: { email: PRATICIEN } });
  prisma.patient.findUnique.mockResolvedValue({
    praticienEmail: PRATICIEN,
    actif: true,
    suiviClotureLe: null,
  });
  prisma.biologyAnalyte.findUnique.mockResolvedValue({
    code: 'BIO_FERRITINE',
    libelle: 'Ferritine',
    unite: 'µg/L',
    actif: true,
  });
  prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE]);
  // Par défaut : aucune cible de correction, aucune ligne supplantée.
  prisma.resultatBiologique.findFirst.mockResolvedValue(null);
  prisma.resultatBiologique.create.mockResolvedValue(LIGNE_CONSIGNEE);
});

afterEach(() => {
  delete process.env.WN_CB_ENABLED;
  delete process.env.WN_CB_RESULTS_ENABLED;
});

describe('drapeau étage 2 — fail-closed des DEUX côtés (D-081, D-122 §2)', () => {
  it('GET : drapeau résultats absent → 503, rien n’est lu ni journalisé', async () => {
    delete process.env.WN_CB_RESULTS_ENABLED;
    const response = await GET(getRequest('PAT1'));
    expect(response.status).toBe(503);
    expect(prisma.resultatBiologique.findMany).not.toHaveBeenCalled();
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('POST : le rayon seul ne suffit pas — il faut les DEUX drapeaux', async () => {
    delete process.env.WN_CB_RESULTS_ENABLED;
    const response = await POST(postRequest({ idPatient: 'PAT1' }));
    expect(response.status).toBe(503);
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('POST : le drapeau résultats sans le rayon ne suffit pas non plus', async () => {
    delete process.env.WN_CB_ENABLED;
    const response = await POST(postRequest({ idPatient: 'PAT1' }));
    expect(response.status).toBe(503);
  });
});

describe('GET — la série du dossier, journalisée (GD-1)', () => {
  it('rend la série avec libellé, unité et horodatage ISO', async () => {
    const response = await GET(getRequest('PAT1'));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.resultats).toEqual([
      {
        id: 'res1',
        analyteCode: 'BIO_FERRITINE',
        analyteLibelle: 'Ferritine',
        valeur: 42.5,
        unite: 'µg/L',
        uniteCatalogue: 'µg/L',
        preleveLe: '2026-09-01T08:00:00.000Z',
        source: 'saisie_praticien',
        saisiLe: '2026-09-01T09:00:00.000Z',
        supersedesResultatId: null,
        corrigeeParId: null,
      },
    ]);
  });

  it('l’unité COURANTE du catalogue est rendue même pour un analyte RETIRÉ', async () => {
    // La route du catalogue ne sert que les analytes actifs : l'écran ne
    // pouvait donc pas comparer les unités là où le catalogue a justement
    // bougé (contre-revue du 2026-09-06, m17). La RELATION, elle, n'est pas
    // filtrée par `actif` — c'est par elle que l'unité courante arrive.
    prisma.resultatBiologique.findMany.mockResolvedValue([
      { ...LIGNE_CONSIGNEE, unite: 'mg/L', analyte: { libelle: 'Ferritine', unite: 'µg/L' } },
    ]);
    const payload = await (await GET(getRequest('PAT1'))).json();
    expect(payload.resultats[0].unite).toBe('mg/L');
    expect(payload.resultats[0].uniteCatalogue).toBe('µg/L');
  });

  it('la relation lue porte le LIBELLÉ et l’UNITÉ : perdre l’unité rendrait l’alerte muette', async () => {
    await GET(getRequest('PAT1'));
    expect(prisma.resultatBiologique.findMany.mock.calls[0][0].select.analyte).toEqual({
      select: { libelle: true, unite: true },
    });
  });

  it('la série est rendue ENTIÈRE, corrigée comprise, et le SERVEUR dit laquelle fait foi', async () => {
    prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE, LIGNE_CORRECTION]);
    const payload = await (await GET(getRequest('PAT1'))).json();
    // Filtrer la ligne corrigée effacerait la trace de l'erreur (DC-30).
    expect(payload.resultats).toHaveLength(2);
    expect(payload.resultats[0]).toMatchObject({ id: 'res1', corrigeeParId: 'res2' });
    expect(payload.resultats[1]).toMatchObject({
      id: 'res2',
      supersedesResultatId: 'res1',
      corrigeeParId: null,
    });
  });

  it('sur une FOURCHE, UNE SEULE ligne reste courante — les deux branches ne font pas foi ensemble', async () => {
    const autre = {
      ...LIGNE_CORRECTION,
      id: 'res3',
      valeur: 46,
      saisiLe: new Date('2026-09-03T09:00:00.000Z'),
    };
    prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE, LIGNE_CORRECTION, autre]);
    const payload = await (await GET(getRequest('PAT1'))).json();
    // La branche PERDANTE (`res2`) n'est supplantée par personne au sens du
    // chaînage, et sortait pourtant courante avant la contre-revue (M1) :
    // deux valeurs faisaient foi pour la même mesure.
    const courantes = payload.resultats.filter(
      (r: { corrigeeParId: string | null }) => r.corrigeeParId === null,
    );
    expect(courantes.map((r: { id: string }) => r.id)).toEqual(['res3']);
    expect(payload.resultats[0].corrigeeParId).toBe('res3');
    expect(payload.resultats[1].corrigeeParId).toBe('res3');
  });

  it('la lecture est bornée AU DOSSIER : un refactor qui perd le `where` servirait tout le monde', async () => {
    await GET(getRequest('PAT1'));
    expect(prisma.resultatBiologique.findMany.mock.calls[0][0].where).toEqual({
      idPatient: 'PAT1',
    });
  });

  it('une lecture qui lève ne journalise JAMAIS le détail de l’erreur', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.resultatBiologique.findMany.mockRejectedValue(
      Object.assign(new Error('Invalid value: 42.5 µg/L pour PAT1'), {
        name: 'PrismaClientValidationError',
      }),
    );
    const response = await GET(getRequest('PAT1'));
    expect(response.status).toBe(500);
    const journalise = spy.mock.calls.flat().join(' ');
    expect(journalise).not.toContain('42.5');
    expect(journalise).not.toContain('PAT1');
    spy.mockRestore();
  });

  it('lire des données de santé nommées journalise l’accès une fois', async () => {
    await GET(getRequest('PAT1'));
    expect(prisma.journalAccesDossier.create).toHaveBeenCalledTimes(1);
  });

  it('le POST, lui, ne journalise PAS : il ne lit rien du dossier (GD-1 sans fausse ligne)', async () => {
    await POST(postRequest({
      idPatient: 'PAT1', analyteCode: 'BIO_FERRITINE', valeur: 42.5,
      preleveLe: '2026-09-01T08:00:00.000Z',
    }));
    // L'écriture est tracée par la ligne consignée (saisi_par, saisi_le) —
    // une entrée de journal de LECTURE serait un accès qui n'a pas eu lieu.
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('sans session : 401', async () => {
    getServerSession.mockResolvedValue(null);
    const response = await GET(getRequest('PAT1'));
    expect(response.status).toBe(401);
  });
});

describe('POST — la saisie praticien, bornée par le serveur', () => {
  const SAISIE = {
    idPatient: 'PAT1',
    analyteCode: 'BIO_FERRITINE',
    valeur: 42.5,
    preleveLe: '2026-09-01T08:00:00.000Z',
  };

  it('consigne avec l’unité DE L’ANALYTE, la source et l’auteur posés serveur', async () => {
    const response = await POST(postRequest({ ...SAISIE, unite: 'mg/dL', source: 'import_labo', saisiPar: 'intrus@x.fr' }));
    expect(response.status).toBe(201);
    const data = prisma.resultatBiologique.create.mock.calls[0][0].data;
    // L'unité vient du catalogue — celle du client est ignorée (concordance
    // par construction, frontière PR #838).
    expect(data.unite).toBe('µg/L');
    expect(data.source).toBe('saisie_praticien');
    expect(data.saisiPar).toBe(PRATICIEN);
  });

  it('analyte inconnu au catalogue : 409, rien n’est consigné', async () => {
    prisma.biologyAnalyte.findUnique.mockResolvedValue(null);
    const response = await POST(postRequest(SAISIE));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('analyte_inconnu');
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('analyte inactif : 409 — pas de nouvelle mesure sur une fiche retirée', async () => {
    prisma.biologyAnalyte.findUnique.mockResolvedValue({
      code: 'BIO_FERRITINE', libelle: 'Ferritine', unite: 'µg/L', actif: false,
    });
    const response = await POST(postRequest(SAISIE));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('analyte_inactif');
  });

  it('une valeur en CHAÎNE (« 42.5 ») est refusée au niveau route : 400', async () => {
    const response = await POST(postRequest({ ...SAISIE, valeur: '42.5' }));
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('valeur_invalide');
  });

  it('une valeur au-delà de la capacité DECIMAL(65,30) : 400 motivé, jamais un 500 opaque', async () => {
    const response = await POST(postRequest({ ...SAISIE, valeur: 1e40 }));
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('valeur_hors_capacite');
  });

  it('un analyte sans unité au catalogue se consigne SANS unité — jamais une unité inventée', async () => {
    prisma.biologyAnalyte.findUnique.mockResolvedValue({
      code: 'BIO_NFS', libelle: 'NFS', unite: null, actif: true,
    });
    const response = await POST(postRequest({ ...SAISIE, analyteCode: 'BIO_NFS' }));
    expect(response.status).toBe(201);
    expect(prisma.resultatBiologique.create.mock.calls[0][0].data.unite).toBeNull();
  });

  it('date de prélèvement future (au-delà de 24 h) : 400 motivé', async () => {
    const futur = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const response = await POST(postRequest({ ...SAISIE, preleveLe: futur }));
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('date_future');
  });

  it('doublon exact (patient, analyte, horodatage) : 409 propre, l’heure est nommée', async () => {
    prisma.resultatBiologique.create.mockRejectedValue(
      Object.assign(new Error('doublon'), { code: 'P2002' }),
    );
    const response = await POST(postRequest(SAISIE));
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reason).toBe('doublon_mesure');
    expect(payload.error).toContain('l’heure');
  });

  it('dossier clos : refusé dans la route, rien n’est consigné', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: PRATICIEN,
      actif: false,
      suiviClotureLe: '2026-08-01T00:00:00.000Z',
    });
    const response = await POST(postRequest(SAISIE));
    expect(response.status).toBe(409);
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('un corps JSON `null` est un 400, jamais un 500 pré-auth', async () => {
    const response = await POST(postRequest(null));
    expect(response.status).toBe(400);
  });

  it('patient d’un autre praticien : 403, l’analyte n’est même pas lu', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'autre@wellneuro.fr',
      actif: true,
      suiviClotureLe: null,
    });
    const response = await POST(postRequest(SAISIE));
    expect(response.status).toBe(403);
    expect(prisma.biologyAnalyte.findUnique).not.toHaveBeenCalled();
  });

  it('sans chaîne, la ligne consignée porte `supersedesResultatId: null` — elle reste sous l’unicité', async () => {
    await POST(postRequest(SAISIE));
    expect(prisma.resultatBiologique.create.mock.calls[0][0].data.supersedesResultatId).toBeNull();
    // Aucune cible à chercher : la saisie neuve ne lit pas la série.
    expect(prisma.resultatBiologique.findFirst).not.toHaveBeenCalled();
  });

  it('une consignation qui lève ne journalise JAMAIS la valeur mesurée', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.resultatBiologique.create.mockRejectedValue(
      Object.assign(new Error('Invalid value: 42.5 µg/L'), {
        name: 'PrismaClientValidationError',
      }),
    );
    const response = await POST(postRequest(SAISIE));
    expect(response.status).toBe(500);
    const journalise = spy.mock.calls.flat().join(' ');
    expect(journalise).not.toContain('42.5');
    spy.mockRestore();
  });

  it('une valeur levée NON-OBJET (`throw null`) ne casse pas le gestionnaire d’erreur', async () => {
    // `signature()` lisait `.code` sans garde : sur `null`, elle levait DANS le
    // `catch`, la réponse `server_error` n'était jamais construite et la route
    // rendait un 500 hors contrat (contre-revue du 2026-09-06, m12).
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.resultatBiologique.create.mockRejectedValue(null);
    const response = await POST(postRequest(SAISIE));
    expect(response.status).toBe(500);
    expect((await response.json()).reason).toBe('server_error');
    spy.mockRestore();
  });
});

describe('POST — la correction d’une mesure (D-124) : une ligne de plus, jamais un update', () => {
  const CIBLE = {
    id: 'res1',
    analyteCode: 'BIO_FERRITINE',
    preleveLe: new Date('2026-09-01T08:00:00.000Z'),
    source: 'saisie_praticien',
  };
  const CORRECTION = { idPatient: 'PAT1', supersedesResultatId: 'res1', valeur: 45.5 };

  /** Cible trouvée, et TÊTE de son fil relu : le chemin nominal. */
  function cibleCorrigible() {
    prisma.resultatBiologique.findFirst.mockResolvedValueOnce(CIBLE);
    // Le fil entier : `res1` seule, donc `res1` fait foi.
    prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE]);
    prisma.resultatBiologique.create.mockResolvedValue(LIGNE_CORRECTION);
  }

  it('consigne une LIGNE chaînée — la route n’expose ni update ni delete', async () => {
    cibleCorrigible();
    const response = await POST(postRequest(CORRECTION));
    expect(response.status).toBe(201);
    const data = prisma.resultatBiologique.create.mock.calls[0][0].data;
    expect(data.supersedesResultatId).toBe('res1');
    expect(data.valeur).toBe(45.5);
  });

  it('l’analyte et la date VIENNENT DE LA CIBLE : ceux du corps sont ignorés', async () => {
    cibleCorrigible();
    // Client hostile : il tente de déplacer la mesure sur un autre analyte et
    // une autre date sous couvert de « correction ».
    await POST(
      postRequest({
        ...CORRECTION,
        analyteCode: 'BIO_AUTRE',
        preleveLe: '2026-01-01T00:00:00.000Z',
      }),
    );
    const data = prisma.resultatBiologique.create.mock.calls[0][0].data;
    expect(data.analyteCode).toBe('BIO_FERRITINE');
    expect(data.preleveLe).toEqual(new Date('2026-09-01T08:00:00.000Z'));
    expect(prisma.biologyAnalyte.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'BIO_FERRITINE' } }),
    );
  });

  it('la cible se cherche DANS LE DOSSIER : existence et appartenance en une requête', async () => {
    cibleCorrigible();
    await POST(postRequest(CORRECTION));
    expect(prisma.resultatBiologique.findFirst.mock.calls[0][0].where).toEqual({
      id: 'res1',
      idPatient: 'PAT1',
    });
  });

  it('cible introuvable (ou d’un autre dossier) : 409, rien n’est consigné, rien ne fuite', async () => {
    prisma.resultatBiologique.findFirst.mockResolvedValue(null);
    const response = await POST(postRequest(CORRECTION));
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reason).toBe('correction_cible_inconnue');
    expect(payload.error).not.toMatch(/autre dossier|autre patient/i);
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('cible DÉJÀ corrigée : 409 — on corrige la version qui fait foi, pas une dépassée', async () => {
    prisma.resultatBiologique.findFirst.mockResolvedValueOnce(CIBLE);
    prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE, LIGNE_CORRECTION]);
    const response = await POST(postRequest(CORRECTION));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('correction_deja_corrigee');
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('la tête de fil se cherche sur le FIL ENTIER, pas sur le seul successeur direct', async () => {
    cibleCorrigible();
    await POST(postRequest(CORRECTION));
    // La clé du fil, servie par `cb_resultat_bio_serie_idx` : une correction
    // héritant de l'analyte et de la date de sa cible, le fil y tient entier.
    expect(prisma.resultatBiologique.findMany.mock.calls[0][0].where).toEqual({
      idPatient: 'PAT1',
      analyteCode: 'BIO_FERRITINE',
      preleveLe: new Date('2026-09-01T08:00:00.000Z'),
    });
  });

  it('la BRANCHE PERDANTE d’une fourche ne se corrige pas : elle ne fait pas foi', async () => {
    // Le défaut que la garde « successeur direct » laissait passer : sur une
    // fourche préexistante, la perdante n'est supplantée par PERSONNE au sens
    // du chaînage — elle passait la garde, et la corriger faisait basculer
    // l'autorité en silence vers la branche qui avait perdu (contre-revue du
    // 2026-09-06, m13). La route et l'écran doivent dire la même chose.
    const perdante = {
      ...LIGNE_CORRECTION,
      id: 'resA',
      saisiLe: new Date('2026-09-02T09:00:00.000Z'),
    };
    const gagnante = {
      ...LIGNE_CORRECTION,
      id: 'resB',
      saisiLe: new Date('2026-09-02T10:00:00.000Z'),
    };
    prisma.resultatBiologique.findFirst.mockResolvedValueOnce({ ...CIBLE, id: 'resA' });
    prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE, perdante, gagnante]);
    const response = await POST(
      postRequest({ ...CORRECTION, supersedesResultatId: 'resA' }),
    );
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reason).toBe('correction_deja_corrigee');
    // Le message NOMME UN ÉTAT : personne n'a corrigé `resA` — `resB` est sa
    // SŒUR. Dire « a déjà été corrigée » serait faux ici (m15).
    expect(payload.error).not.toMatch(/a déjà été corrigée/);
    expect(payload.error).toMatch(/ne fait plus foi/);
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('… mais la branche GAGNANTE de cette même fourche, elle, se corrige', async () => {
    // Le pendant du banc précédent : la garde élargie doit refuser la perdante
    // SANS enfermer la mesure — sinon une fourche la rendrait incorrigible.
    const perdante = {
      ...LIGNE_CORRECTION,
      id: 'resA',
      saisiLe: new Date('2026-09-02T09:00:00.000Z'),
    };
    const gagnante = {
      ...LIGNE_CORRECTION,
      id: 'resB',
      saisiLe: new Date('2026-09-02T10:00:00.000Z'),
    };
    prisma.resultatBiologique.findFirst.mockResolvedValueOnce({ ...CIBLE, id: 'resB' });
    prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE, perdante, gagnante]);
    prisma.resultatBiologique.create.mockResolvedValue(LIGNE_CORRECTION);
    const response = await POST(postRequest({ ...CORRECTION, supersedesResultatId: 'resB' }));
    expect(response.status).toBe(201);
    expect(prisma.resultatBiologique.create.mock.calls[0][0].data.supersedesResultatId).toBe(
      'resB',
    );
  });

  it('un analyte RETIRÉ du catalogue n’enferme pas une valeur fausse : la correction passe', async () => {
    cibleCorrigible();
    prisma.biologyAnalyte.findUnique.mockResolvedValue({
      code: 'BIO_FERRITINE',
      libelle: 'Ferritine',
      unite: 'µg/L',
      actif: false,
    });
    const response = await POST(postRequest(CORRECTION));
    expect(response.status).toBe(201);
  });

  it('… alors qu’une mesure NEUVE sur ce même analyte retiré reste refusée', async () => {
    prisma.biologyAnalyte.findUnique.mockResolvedValue({
      code: 'BIO_FERRITINE',
      libelle: 'Ferritine',
      unite: 'µg/L',
      actif: false,
    });
    const response = await POST(
      postRequest({
        idPatient: 'PAT1',
        analyteCode: 'BIO_FERRITINE',
        valeur: 42.5,
        preleveLe: '2026-09-01T08:00:00.000Z',
      }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('analyte_inactif');
  });

  it('la valeur reste validée : une chaîne est refusée en correction comme en saisie', async () => {
    cibleCorrigible();
    const response = await POST(postRequest({ ...CORRECTION, valeur: '45.5' }));
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('valeur_invalide');
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('dossier clos : la correction est refusée AVANT toute lecture de la série', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: PRATICIEN,
      actif: false,
      suiviClotureLe: '2026-08-01T00:00:00.000Z',
    });
    const response = await POST(postRequest(CORRECTION));
    expect(response.status).toBe(409);
    expect(prisma.resultatBiologique.findFirst).not.toHaveBeenCalled();
  });

  it('patient d’un autre praticien : 403, la série n’est même pas approchée', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      praticienEmail: 'autre@wellneuro.fr',
      actif: true,
      suiviClotureLe: null,
    });
    const response = await POST(postRequest(CORRECTION));
    expect(response.status).toBe(403);
    expect(prisma.resultatBiologique.findFirst).not.toHaveBeenCalled();
  });

  it('une correction ne peut pas s’antidater : ni `saisiLe` ni `saisiPar` ne viennent du corps', async () => {
    cibleCorrigible();
    await POST(
      postRequest({
        ...CORRECTION,
        saisiLe: '2020-01-01T00:00:00.000Z',
        saisiPar: 'intrus@x.fr',
        source: 'import_labo',
      }),
    );
    const data = prisma.resultatBiologique.create.mock.calls[0][0].data;
    // `saisi_le` n'est PAS écrit : la valeur par défaut de la BASE fait foi.
    expect(data).not.toHaveProperty('saisiLe');
    expect(data.saisiPar).toBe(PRATICIEN);
    expect(data.source).toBe('saisie_praticien');
  });

  it('corriger ne journalise pas un accès : la lecture de la cible ne dérive aucun contenu', async () => {
    cibleCorrigible();
    await POST(postRequest(CORRECTION));
    expect(prisma.journalAccesDossier.create).not.toHaveBeenCalled();
  });

  it('une chaîne BLANCHE est un refus, jamais une bascule silencieuse en saisie neuve', async () => {
    // Le défaut nommé par la contre-revue (m3) : le client croyait corriger et
    // posait une mesure NEUVE, avec l'analyte et la date qu'il avait envoyés.
    const response = await POST(
      postRequest({
        idPatient: 'PAT1',
        analyteCode: 'BIO_FERRITINE',
        valeur: 42.5,
        preleveLe: '2026-09-01T08:00:00.000Z',
        supersedesResultatId: '   ',
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('correction_cible_invalide');
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('une chaîne NON textuelle est un refus, et ne part jamais en requête', async () => {
    const response = await POST(
      postRequest({
        idPatient: 'PAT1',
        analyteCode: 'BIO_FERRITINE',
        valeur: 42.5,
        preleveLe: '2026-09-01T08:00:00.000Z',
        supersedesResultatId: { $ne: null },
      }),
    );
    expect(response.status).toBe(400);
    expect(prisma.resultatBiologique.findFirst).not.toHaveBeenCalled();
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('une chaîne démesurée est bornée comme l’est `idPatient` — elle ne part pas en requête', async () => {
    const response = await POST(
      postRequest({ ...CORRECTION, supersedesResultatId: 'x'.repeat(65) }),
    );
    expect(response.status).toBe(400);
    expect(prisma.resultatBiologique.findFirst).not.toHaveBeenCalled();
  });

  it('`null` explicite vaut ABSENCE de chaîne : c’est la valeur d’une saisie neuve', async () => {
    const response = await POST(
      postRequest({
        idPatient: 'PAT1',
        analyteCode: 'BIO_FERRITINE',
        valeur: 42.5,
        preleveLe: '2026-09-01T08:00:00.000Z',
        supersedesResultatId: null,
      }),
    );
    expect(response.status).toBe(201);
    expect(prisma.resultatBiologique.create.mock.calls[0][0].data.supersedesResultatId).toBeNull();
  });

  it('une mesure d’IMPORT LABORATOIRE ne se corrige pas par une saisie praticien', async () => {
    prisma.resultatBiologique.findFirst.mockResolvedValueOnce({
      ...CIBLE,
      source: 'import_labo',
    });
    const response = await POST(postRequest(CORRECTION));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('correction_source_labo');
    expect(prisma.resultatBiologique.create).not.toHaveBeenCalled();
  });

  it('corriger une CORRECTION est légitime : c’est elle la tête de fil', async () => {
    prisma.resultatBiologique.findFirst.mockResolvedValueOnce({ ...CIBLE, id: 'res2' });
    // Le fil : `res2` supplante `res1`, donc `res2` fait foi.
    prisma.resultatBiologique.findMany.mockResolvedValue([LIGNE_CONSIGNEE, LIGNE_CORRECTION]);
    prisma.resultatBiologique.create.mockResolvedValue(LIGNE_CORRECTION);
    const response = await POST(
      postRequest({ ...CORRECTION, supersedesResultatId: 'res2' }),
    );
    expect(response.status).toBe(201);
    expect(prisma.resultatBiologique.create.mock.calls[0][0].data.supersedesResultatId).toBe('res2');
  });
});
