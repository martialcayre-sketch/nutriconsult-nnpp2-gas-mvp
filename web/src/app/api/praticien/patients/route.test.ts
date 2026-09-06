import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    portailMagicLink: { updateMany: vi.fn() },
    $transaction: vi.fn(),
    assignation: { findMany: vi.fn(), count: vi.fn() },
    questionnaireReponse: { findMany: vi.fn() },
    agendaAlimentaireJour: { findMany: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { GET, PATCH } from './route';

function get(query = ''): Request {
  return new Request(`http://localhost/api/praticien/patients${query ? `?${query}` : ''}`);
}

function patch(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/praticien/patients', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Régression E7 — cette route renvoyait tous les patients de la base (e-mail,
// téléphone inclus) et laissait PATCH muter n'importe lequel, sans
// vérifier l'appartenance au praticien en session. Garde ajoutée 2026-07-21.
describe('GET /api/praticien/patients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.patient.count.mockResolvedValue(0);
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.assignation.count.mockResolvedValue(0);
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([]);
  });

  it('refuse sans session (401)', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('liste non paginée : scope patients et assignations au praticien en session', async () => {
    await GET(get());
    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: { praticienEmail: { equals: 'p@wellneuro.fr', mode: 'insensitive' } },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patient: { praticienEmail: { equals: 'p@wellneuro.fr', mode: 'insensitive' } } } })
    );
  });

  // Sans ce champ, l'écran ne peut pas distinguer un dossier clos d'un dossier
  // désactivé : le premier conserve la lecture, le second la perd.
  it('expose l’état de clôture du suivi, en ISO ou null', async () => {
    prisma.patient.findMany.mockResolvedValue([
      {
        idPatient: 'PAT_SEED_03',
        email: 'michel.dogne@fictif.wellneuro.fr',
        prenom: 'Michel',
        nom: 'Dogné',
        telephone: null,
        actif: true,
        suiviClotureLe: new Date('2026-07-21T10:00:00.000Z'),
      },
      {
        idPatient: 'PAT_SEED_01',
        email: 'sophie.nicola@fictif.wellneuro.fr',
        prenom: 'Sophie',
        nom: 'Nicola',
        telephone: null,
        actif: true,
        suiviClotureLe: null,
      },
    ]);
    const json = (await (await GET(get())).json()) as {
      patients: { idPatient: string; suiviClotureLe: string | null }[];
    };
    expect(json.patients[0].suiviClotureLe).toBe('2026-07-21T10:00:00.000Z');
    expect(json.patients[1].suiviClotureLe).toBeNull();
  });

  it('liste paginée : scope aussi le where de recherche', async () => {
    await GET(get('page=1&search=Nicola'));
    const where = prisma.patient.findMany.mock.calls[0][0].where;
    expect(where.praticienEmail).toEqual({ equals: 'p@wellneuro.fr', mode: 'insensitive' });
    expect(where.OR).toBeDefined();
    expect(prisma.patient.count).toHaveBeenCalledWith({ where });
  });
});

// `aPassation` doit porter les DEUX branches de construction de réponse : la
// paginée (page= présent) et la non paginée (comportement historique). C'est
// l'erreur naturelle ici — n'en traiter qu'une — d'où deux tests jumeaux,
// un par branche, plutôt qu'un seul.
describe('GET /api/praticien/patients — aPassation (LOT-07)', () => {
  const ASSIGNATION_AVEC_REPONSE = {
    idAssignation: 'ASS_AVEC_REPONSE',
    idPatient: 'PAT001',
    emailPatient: 'a@wellneuro.fr',
    idQuestionnaire: 'Q_ALI_09',
    titre: 'Agenda',
    dateAssignation: new Date('2026-08-01T00:00:00.000Z'),
    statut: 'En attente',
    statutReponses: 'deverrouille',
    correctionCommentaire: null,
    correctionDemandeeDate: null,
  };
  const ASSIGNATION_SANS_REPONSE = {
    ...ASSIGNATION_AVEC_REPONSE,
    idAssignation: 'ASS_SANS_REPONSE',
    statutReponses: 'non_rempli',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.patient.count.mockResolvedValue(0);
    prisma.assignation.findMany.mockResolvedValue([ASSIGNATION_AVEC_REPONSE, ASSIGNATION_SANS_REPONSE]);
    prisma.assignation.count.mockResolvedValue(2);
    // Une seule ligne pour ASS_AVEC_REPONSE : c'est l'EXISTENCE qui compte.
    prisma.questionnaireReponse.findMany.mockResolvedValue([{ idAssignation: 'ASS_AVEC_REPONSE' }]);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([]);
  });

  it('branche non paginée : porte aPassation correctement sur les deux lignes', async () => {
    const json = (await (await GET(get())).json()) as {
      assignations: { idAssignation: string; aPassation?: boolean }[];
    };
    expect(prisma.questionnaireReponse.findMany).toHaveBeenCalledWith({
      where: { idAssignation: { in: ['ASS_AVEC_REPONSE', 'ASS_SANS_REPONSE'] } },
      select: { idAssignation: true },
      distinct: ['idAssignation'],
    });
    expect(json.assignations.find(a => a.idAssignation === 'ASS_AVEC_REPONSE')?.aPassation).toBe(true);
    expect(json.assignations.find(a => a.idAssignation === 'ASS_SANS_REPONSE')?.aPassation).toBe(false);
  });

  it('branche paginée : porte aPassation correctement sur les deux lignes', async () => {
    const json = (await (await GET(get('page=1'))).json()) as {
      assignations: { idAssignation: string; aPassation?: boolean }[];
    };
    expect(json.assignations.find(a => a.idAssignation === 'ASS_AVEC_REPONSE')?.aPassation).toBe(true);
    expect(json.assignations.find(a => a.idAssignation === 'ASS_SANS_REPONSE')?.aPassation).toBe(false);
  });

  // Contrôle négatif : sans assignation, la requête `questionnaireReponse` ne
  // part pas — `in: []` interrogerait la base pour rien.
  it('aucune assignation : n’émet pas de requête questionnaireReponse', async () => {
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.assignation.count.mockResolvedValue(0);
    await GET(get());
    expect(prisma.questionnaireReponse.findMany).not.toHaveBeenCalled();
  });
});

// `nbJourneesAgenda` (LOT-08) : tri-état — `null` pour une assignation qui
// n'est pas un agenda alimentaire, `0` pour un agenda sans journée notée, un
// entier sinon. Comme `aPassation`, les DEUX branches (paginée et non
// paginée) doivent le porter — même leçon LOT-07, même fichier.
describe('GET /api/praticien/patients — nbJourneesAgenda (LOT-08)', () => {
  const ASSIGNATION_AGENDA_AVEC_JOURS = {
    idAssignation: 'ASS_AGENDA_AVEC_JOURS',
    idPatient: 'PAT001',
    emailPatient: 'a@wellneuro.fr',
    idQuestionnaire: 'Q_ALI_09',
    titre: 'Agenda alimentaire — 21 jours',
    dateAssignation: new Date('2026-08-01T00:00:00.000Z'),
    statut: 'En attente',
    statutReponses: 'deverrouille',
    correctionCommentaire: null,
    correctionDemandeeDate: null,
  };
  const ASSIGNATION_AGENDA_SANS_JOUR = {
    ...ASSIGNATION_AGENDA_AVEC_JOURS,
    idAssignation: 'ASS_AGENDA_SANS_JOUR',
  };
  const ASSIGNATION_NON_AGENDA = {
    ...ASSIGNATION_AGENDA_AVEC_JOURS,
    idAssignation: 'ASS_NON_AGENDA',
    idQuestionnaire: 'Q_NEU_03',
    titre: 'Autre questionnaire',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.patient.count.mockResolvedValue(0);
    prisma.assignation.findMany.mockResolvedValue([
      ASSIGNATION_AGENDA_AVEC_JOURS,
      ASSIGNATION_AGENDA_SANS_JOUR,
      ASSIGNATION_NON_AGENDA,
    ]);
    prisma.assignation.count.mockResolvedValue(3);
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    // Trois lignes en base pour ASS_AGENDA_AVEC_JOURS : deux dates distinctes,
    // dont une CORRIGÉE (deux lignes, une seule date — `supersedesJourId`
    // chaîne la correction). Le compte attendu est 2, pas 3 : des DATES, pas
    // des écritures.
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([
      { idAssignation: 'ASS_AGENDA_AVEC_JOURS', dateJour: '2026-08-01' },
      { idAssignation: 'ASS_AGENDA_AVEC_JOURS', dateJour: '2026-08-02' },
    ]);
  });

  it('branche non paginée : entier sur un agenda avec journées, 0 sans journée, null hors agenda', async () => {
    const json = (await (await GET(get())).json()) as {
      assignations: { idAssignation: string; nbJourneesAgenda?: number | null }[];
    };
    expect(json.assignations.find(a => a.idAssignation === 'ASS_AGENDA_AVEC_JOURS')?.nbJourneesAgenda).toBe(2);
    expect(json.assignations.find(a => a.idAssignation === 'ASS_AGENDA_SANS_JOUR')?.nbJourneesAgenda).toBe(0);
    expect(json.assignations.find(a => a.idAssignation === 'ASS_NON_AGENDA')?.nbJourneesAgenda).toBeNull();
  });

  it('branche paginée : porte le même tri-état', async () => {
    const json = (await (await GET(get('page=1'))).json()) as {
      assignations: { idAssignation: string; nbJourneesAgenda?: number | null }[];
    };
    expect(json.assignations.find(a => a.idAssignation === 'ASS_AGENDA_AVEC_JOURS')?.nbJourneesAgenda).toBe(2);
    expect(json.assignations.find(a => a.idAssignation === 'ASS_AGENDA_SANS_JOUR')?.nbJourneesAgenda).toBe(0);
    expect(json.assignations.find(a => a.idAssignation === 'ASS_NON_AGENDA')?.nbJourneesAgenda).toBeNull();
  });

  // Une journée corrigée porte deux lignes pour une seule date : comptée UNE
  // fois. Vérifié séparément de la lecture du DTO ci-dessus, sur la forme
  // exacte de la requête groupée.
  it('une journée corrigée (deux lignes, une date) est comptée une seule fois', async () => {
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([
      { idAssignation: 'ASS_AGENDA_AVEC_JOURS', dateJour: '2026-08-01' },
      { idAssignation: 'ASS_AGENDA_AVEC_JOURS', dateJour: '2026-08-01' },
    ]);
    const json = (await (await GET(get())).json()) as {
      assignations: { idAssignation: string; nbJourneesAgenda?: number | null }[];
    };
    expect(json.assignations.find(a => a.idAssignation === 'ASS_AGENDA_AVEC_JOURS')?.nbJourneesAgenda).toBe(1);
  });

  // Une seule requête groupée pour toute la page, jamais un `count` par ligne
  // — même défaut que celui payé sur `aPassation` (LOT-07).
  it('une seule requête groupée pour toute la page, pas une par assignation', async () => {
    await GET(get());
    expect(prisma.agendaAlimentaireJour.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.agendaAlimentaireJour.findMany).toHaveBeenCalledWith({
      where: { idAssignation: { in: ['ASS_AGENDA_AVEC_JOURS', 'ASS_AGENDA_SANS_JOUR'] } },
      select: { idAssignation: true, dateJour: true },
      distinct: ['idAssignation', 'dateJour'],
    });
  });

  // Contrôle négatif, symétrique de celui d'`aPassation` : sans aucune
  // assignation d'agenda alimentaire dans la page, la requête ne part pas.
  it('aucune assignation d’agenda alimentaire : n’émet pas de requête agendaAlimentaireJour', async () => {
    prisma.assignation.findMany.mockResolvedValue([ASSIGNATION_NON_AGENDA]);
    prisma.assignation.count.mockResolvedValue(1);
    await GET(get());
    expect(prisma.agendaAlimentaireJour.findMany).not.toHaveBeenCalled();
  });
});

// Le filtre par statut vivait côté client, appliqué APRÈS la troncature à 40.
// Filtrer une liste déjà tronquée ne cache pas des lignes en trop : il en cache
// en moins, et sans le dire. Au 2026-07-29, 8 assignations « En attente »
// tombaient hors des 40 plus récentes — invisibles ET inannulables.
describe('GET /api/praticien/patients — filtre de statut des assignations', () => {
  const portee = { praticienEmail: { equals: 'p@wellneuro.fr', mode: 'insensitive' } };

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.patient.count.mockResolvedValue(0);
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.assignation.count.mockResolvedValue(0);
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([]);
  });

  // LE test du défaut. Sans filtre serveur, la requête ne porte que la portée
  // praticien et le plafond : une ligne au-delà du 40ᵉ rang ne peut PAS être
  // rendue, quel que soit ce que le client fera de la réponse.
  it('descend le statut jusqu’au where Prisma, et non au client', async () => {
    await GET(get('statut=En%20attente'));
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patient: portee, statut: 'En attente' }, take: 40 })
    );
  });

  it('applique le même where au compte qu’à la liste', async () => {
    await GET(get('statut=Complété'));
    const whereListe = prisma.assignation.findMany.mock.calls[0][0].where;
    expect(prisma.assignation.count).toHaveBeenCalledWith({ where: whereListe });
  });

  // « 40 sur 48 » ne veut rien dire si le compte porte sur un autre ensemble
  // que les lignes affichées.
  it('rend le total en base et le plafond, pour que la surface puisse dire qu’elle tronque', async () => {
    prisma.assignation.count.mockResolvedValue(48);
    const res = await GET(get('statut=Complété'));
    const json = await res.json();
    expect(json.assignationsMeta).toEqual({
      total: 48,
      plafond: 40,
      statut: 'Complété',
      statutReponses: null,
      idPatient: null,
    });
  });

  // Un 400 sur un paramètre d'affichage priverait le praticien de sa liste
  // entière pour une faute de frappe dans une URL : on ignore, on ne rejette pas.
  it('ignore un statut hors registre au lieu de rejeter la requête', async () => {
    const res = await GET(get('statut=Brouillon'));
    expect(res.status).toBe(200);
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patient: portee } })
    );
  });

  it('sans paramètre, ne filtre rien — comportement historique inchangé', async () => {
    await GET(get());
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patient: portee } })
    );
  });

  // Le filtre s'AJOUTE à la garde de portée, il ne la remplace pas : aucun
  // statut demandé ne doit ouvrir les assignations d'un autre praticien.
  it('ne desserre jamais la portée praticien', async () => {
    await GET(get('page=1&statut=Annulée'));
    const where = prisma.assignation.findMany.mock.calls[0][0].where;
    expect(where.patient).toEqual(portee);
    expect(where.statut).toBe('Annulée');
  });

  it('filtre aussi dans la branche paginée', async () => {
    prisma.assignation.count.mockResolvedValue(12);
    const res = await GET(get('page=2&statut=En%20attente'));
    const json = await res.json();
    expect(json.assignationsMeta.total).toBe(12);
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patient: portee, statut: 'En attente' } })
    );
  });
});

// Même défaut, autre colonne et autre surface : `FichePatientPanel` filtrait
// `modification_demandee` ET le dossier en mémoire, après la même troncature à
// 40 — sur les assignations de TOUS les patients. Le tri étant `dateAssignation
// desc`, ce sont les dossiers anciens, ceux qu'on corrige le plus tard, qui
// tombaient hors fenêtre : la demande n'apparaissait nulle part et n'était donc
// jamais débloquée.
describe('GET /api/praticien/patients — filtre par dossier et statut de réponse', () => {
  const portee = { praticienEmail: { equals: 'p@wellneuro.fr', mode: 'insensitive' } };

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.patient.count.mockResolvedValue(0);
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.assignation.count.mockResolvedValue(0);
    prisma.questionnaireReponse.findMany.mockResolvedValue([]);
    prisma.agendaAlimentaireJour.findMany.mockResolvedValue([]);
  });

  // LE test du défaut : sans ces deux clés dans le `where`, aucune ligne au-delà
  // du 40ᵉ rang ne peut être rendue, quoi que le client en fasse ensuite.
  it('descend le dossier ET le statut de réponse jusqu’au where Prisma', async () => {
    await GET(get('idPatient=PAT001&statutReponses=modification_demandee'));
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patient: portee, statutReponses: 'modification_demandee', idPatient: 'PAT001' },
        take: 40,
      })
    );
  });

  it('applique le même where au compte qu’à la liste', async () => {
    await GET(get('idPatient=PAT001&statutReponses=modification_demandee'));
    const whereListe = prisma.assignation.findMany.mock.calls[0][0].where;
    expect(prisma.assignation.count).toHaveBeenCalledWith({ where: whereListe });
  });

  // L'écho permet au client de vérifier que sa demande a été honorée avant de
  // conclure quoi que ce soit sur la troncature.
  it('écho les deux filtres appliqués dans assignationsMeta', async () => {
    prisma.assignation.count.mockResolvedValue(3);
    const res = await GET(get('idPatient=PAT001&statutReponses=modification_demandee'));
    const json = await res.json();
    expect(json.assignationsMeta).toEqual({
      total: 3,
      plafond: 40,
      statut: null,
      statutReponses: 'modification_demandee',
      idPatient: 'PAT001',
    });
  });

  it('ignore un statut de réponse hors registre au lieu de rejeter la requête', async () => {
    const res = await GET(get('statutReponses=brouillon'));
    expect(res.status).toBe(200);
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patient: portee } })
    );
  });

  // Contrairement aux statuts, un idPatient inconnu n'est PAS ignoré : l'ignorer
  // rendrait les assignations de TOUS les patients à un appelant qui en demande
  // un seul, et la fiche afficherait les demandes de correction d'un autre
  // dossier. Une valeur qui ne correspond à rien rend une liste vide.
  it('n’ignore jamais un idPatient : une valeur inconnue filtre au lieu d’ouvrir', async () => {
    await GET(get('idPatient=PAT_INEXISTANT'));
    const where = prisma.assignation.findMany.mock.calls[0][0].where;
    expect(where.idPatient).toBe('PAT_INEXISTANT');
  });

  it('sans paramètre, ne filtre rien — comportement historique inchangé', async () => {
    await GET(get());
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patient: portee } })
    );
  });

  // Les filtres s'AJOUTENT à la garde de portée. Demander le dossier d'un autre
  // praticien ne doit rien ouvrir : le `where` reste une conjonction.
  it('ne desserre jamais la portée praticien', async () => {
    await GET(get('idPatient=PAT_AUTRE_PRATICIEN&statutReponses=verrouille'));
    const where = prisma.assignation.findMany.mock.calls[0][0].where;
    expect(where.patient).toEqual(portee);
    expect(where.idPatient).toBe('PAT_AUTRE_PRATICIEN');
  });

  it('filtre aussi dans la branche paginée', async () => {
    await GET(get('page=1&idPatient=PAT001&statutReponses=modification_demandee'));
    expect(prisma.assignation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patient: portee, statutReponses: 'modification_demandee', idPatient: 'PAT001' },
      })
    );
  });

  // Les quatre valeurs qu'écrit le code : défaut du schéma, soumission patient,
  // demande de correction, déblocage praticien. Vérifié en base le 2026-07-29 :
  // aucune ligne hors de cette liste.
  it('accepte les quatre statuts de réponse que le code écrit', async () => {
    for (const valeur of ['non_rempli', 'verrouille', 'modification_demandee', 'deverrouille']) {
      vi.clearAllMocks();
      prisma.assignation.findMany.mockResolvedValue([]);
      prisma.assignation.count.mockResolvedValue(0);
      prisma.patient.findMany.mockResolvedValue([]);
      await GET(get(`statutReponses=${valeur}`));
      const where = prisma.assignation.findMany.mock.calls[0][0].where;
      expect(where.statutReponses).toBe(valeur);
    }
  });
});

describe('PATCH /api/praticien/patients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    prisma.patient.findUnique.mockResolvedValue({ idPatient: 'PAT001', praticienEmail: 'p@wellneuro.fr' });
    prisma.patient.update.mockResolvedValue({});
    prisma.portailMagicLink.updateMany.mockResolvedValue({ count: 0 });
    // Forme TABLEAU : Prisma reçoit le résultat des constructeurs, déjà
    // évalués. Les deux écritures sont donc bien appelées pour bâtir le
    // tableau, et les compteurs d'appel des bancs existants restent justes.
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  });

  it('désactiver ferme les liens encore en vol, dans la même transaction', async () => {
    const res = await PATCH(patch({ idPatient: 'PAT001', actif: 'NON' }));
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const arg = prisma.portailMagicLink.updateMany.mock.calls[0][0];
    expect(arg.where.idPatient).toBe('PAT001');
    // Les deux filtres portent le sens : on ne ferme QUE ce qui est encore
    // ouvert, et on ne rallonge jamais un lien.
    expect(arg.where.consommeLe).toBeNull();
    expect(arg.where.expireLe.gt).toBeInstanceOf(Date);
    expect(arg.data.expireLe).toEqual(arg.where.expireLe.gt);
  });

  // ★ LE BANC DÉCISIF. Il ne garde pas ce que le correctif fait, mais ce qu'il
  // s'INTERDIT : devenir un second écrivain de `sessionsInvalidesAvant` ou un
  // troisième de `consommeLe`. Recopier la transaction de révocation — le
  // réflexe naturel, et la première conception proposée — rouvrirait le défaut
  // que la PR #889 vient de fermer, puisque `nouveaux-patients` distingue un
  // tampon de fermeture d'une vraie entrée par une ÉGALITÉ STRICTE entre ces
  // deux colonnes. Ce banc rougit sur ce correctif-là, et sur lui seul.
  it('la désactivation n’écrit NI la révocation, NI une date de consommation', async () => {
    await PATCH(patch({ idPatient: 'PAT001', actif: 'NON' }));
    for (const [appel] of prisma.patient.update.mock.calls) {
      expect(appel.data).not.toHaveProperty('accessTokenRevoked');
      expect(appel.data).not.toHaveProperty('sessionsInvalidesAvant');
    }
    for (const [appel] of prisma.portailMagicLink.updateMany.mock.calls) {
      expect(appel.data).not.toHaveProperty('consommeLe');
    }
  });

  it('réactiver et corriger un téléphone ne touchent aucun lien', async () => {
    await PATCH(patch({ idPatient: 'PAT001', actif: 'OUI' }));
    await PATCH(patch({ idPatient: 'PAT001', telephone: '0600000000' }));
    expect(prisma.portailMagicLink.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.patient.update).toHaveBeenCalledTimes(2);
  });

  it('patient d’un autre praticien : 403, aucune écriture', async () => {
    prisma.patient.findUnique.mockResolvedValue({ idPatient: 'PAT001', praticienEmail: 'autre@wellneuro.fr' });
    const res = await PATCH(patch({ idPatient: 'PAT001', actif: 'NON' }));
    expect(res.status).toBe(403);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('patient accessible : autorise la modification', async () => {
    const res = await PATCH(patch({ idPatient: 'PAT001', actif: 'NON' }));
    expect(res.status).toBe(200);
    expect(prisma.patient.update).toHaveBeenCalledOnce();
  });

  // La forme `/^PAT\d+$/` rejetait les identifiants à tiret bas, dont le
  // patient fictif `PAT_SEED_03` : « Modifier » était inopérant sur le dossier
  // de seed, et le menu de LOT-01b passe par cette même route pour activer et
  // désactiver un dossier.
  it('accepte un identifiant à tiret bas (PAT_SEED_03)', async () => {
    prisma.patient.findUnique.mockResolvedValue({ idPatient: 'PAT_SEED_03', praticienEmail: 'p@wellneuro.fr' });
    const res = await PATCH(patch({ idPatient: 'PAT_SEED_03', actif: 'OUI' }));
    expect(res.status).toBe(200);
    expect(prisma.patient.update).toHaveBeenCalledOnce();
  });

  // L'alphabet élargi ne doit pas devenir un contournement : l'appartenance
  // reste vérifiée, y compris sur les identifiants à tiret bas.
  it('un identifiant à tiret bas d’un autre praticien reste refusé (403)', async () => {
    prisma.patient.findUnique.mockResolvedValue({ idPatient: 'PAT_SEED_03', praticienEmail: 'autre@wellneuro.fr' });
    const res = await PATCH(patch({ idPatient: 'PAT_SEED_03', actif: 'NON' }));
    expect(res.status).toBe(403);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('refuse toujours un identifiant hors alphabet (400, aucune écriture)', async () => {
    const res = await PATCH(patch({ idPatient: 'PAT001; DROP', actif: 'NON' }));
    expect(res.status).toBe(400);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });
});

// Il n'y a PAS de handler `DELETE` sur cette route, et ce test est là pour que
// son absence échoue en CI si on le réintroduit. Le verbe existait, n'écrivait
// que `actif: false`, et voisinerait aujourd'hui un effacement qui détruit
// vraiment : un lecteur pressé confondrait les deux. Désactiver passe par
// `PATCH { actif: 'NON' }`, effacer par `POST …/cycle-de-vie`. Un commentaire
// seul n'aurait pas résisté au réflexe REST — celui-ci, si.
describe('DELETE /api/praticien/patients', () => {
  it('n’existe pas : Next répond 405 en l’absence de handler', async () => {
    const handlers = await import('./route');
    expect('DELETE' in handlers).toBe(false);
  });
});
