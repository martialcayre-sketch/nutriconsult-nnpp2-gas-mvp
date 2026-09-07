import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks des dépendances de la route (auth, prisma, anthropic, observabilité).
// `@/lib/anthropic` instancie un client à l'import : stub obligatoire.
const findFirst = vi.fn();
const findUniquePatient = vi.fn();
const createJournal = vi.fn();
const deleteManyJournal = vi.fn();
const createBookletEnvoi = vi.fn();
// Le journal de correspondance — la LIGNE QUE LE PRATICIEN VOIT sur la fiche —
// n'était pas dans ce mock : `journaliserCorrespondancePatient` importe prisma
// dynamiquement, tombait sur un `correspondancePatient` absent, et avalait son
// exception. Le banc observait donc la ligne d'audit (juste) sans jamais voir
// la ligne dérivée (fausse).
const createCorrespondance = vi.fn();
// Le booklet part au patient : la prévisualisation qualifie la synthèse dont il
// est tiré (antérieure au retrait d'interprétation ?), d'où cette lecture des
// passations du dossier, en sélection minimale.
const findManyReponses = vi.fn(async () => [] as Array<{ idQuestionnaire: string }>);

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { email: 'p@wellneuro.fr' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    syntheseIA: { findFirst: (...a: unknown[]) => findFirst(...a) },
    patient: { findUnique: (...a: unknown[]) => findUniquePatient(...a) },
    journalAccesDossier: {
      create: (...a: unknown[]) => createJournal(...a),
      deleteMany: (...a: unknown[]) => deleteManyJournal(...a),
    },
    bookletEnvoi: { create: (...a: unknown[]) => createBookletEnvoi(...a) },
    correspondancePatient: { create: (...a: unknown[]) => createCorrespondance(...a) },
    questionnaireReponse: { findMany: (...a: unknown[]) => findManyReponses(...(a as [])) },
  },
}));
vi.mock('@/lib/anthropic', () => ({
  maskEmail: (e: string) => `masqué(${e})`,
  sanitizeAuditError: (m: string) => m,
}));
// Transport SMTP stubé : sans lui, le seul chemin de SUCCÈS de la route est
// hors de portée d'un test unitaire (la route s'arrête en 503 quand `SMTP_URL`
// est absente) — donc l'écriture de l'instantané de note ne serait jamais
// observée. Le stub ne sert QUE les tests qui posent `SMTP_URL` ; ailleurs la
// variable reste absente et les 503 attendus tiennent.
const sendMail = vi.fn(async () => ({}));
vi.mock('@/lib/email/transportSmtp', () => ({
  creerTransportSmtp: () => ({ sendMail: (...a: unknown[]) => sendMail(...(a as [])) }),
}));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn(), security: vi.fn() } }));
vi.mock('@/lib/observability/requestContext', () => ({
  createRequestContext: () => ({}),
  finalizeLogContext: (_c: unknown, x: unknown) => x,
  withCorrelationHeader: (res: unknown) => res,
}));

import { getServerSession } from 'next-auth';
import { GET, POST } from './route';

function req(url: string) {
  return new Request(url);
}

function syntheseFixture(statut: string) {
  return {
    idSynthese: 'SYN_1',
    idPatient: 'PAT_1',
    emailPatient: 'sophie.nicola@fictif.wellneuro.fr',
    statut,
    dateValidation: new Date('2026-07-18T00:00:00.000Z'),
    dateGeneration: new Date('2026-07-17T00:00:00.000Z'),
    notesPraticien: null,
    bookletEnvois: [],
    syntheseJson: {
      resume_praticien: 'Résumé interne',
      axes_prioritaires: [{ axe: 'Sommeil', niveau_priorite: 'eleve', arguments: ['réveils'], points_a_confirmer: [] }],
      points_de_vigilance: ['fatigue'],
      questions_entretien: ['Depuis quand ?'],
      narratif_patient: 'Sommeil fragmenté.',
      limites: 'À valider.',
    },
  };
}

beforeEach(() => {
  findFirst.mockReset();
  findUniquePatient.mockReset();
  createJournal.mockReset();
  deleteManyJournal.mockReset();
  createBookletEnvoi.mockReset();
  createCorrespondance.mockReset();
  createCorrespondance.mockResolvedValue({});
  // `actif` manquait : `phaseDossier` lit `!etat.actif` et concluait
  // « désactivé » sur un dossier censé être en suivi. Aucun test n'allait
  // jusque-là, donc le fixture pouvait rester faux sans que rien ne rougisse.
  findUniquePatient.mockResolvedValue({
    prenom: 'Sophie', nom: 'Nicola', actif: true, suiviClotureLe: null, effaceLe: null,
  });
  createJournal.mockResolvedValue({});
  deleteManyJournal.mockResolvedValue({ count: 0 });
  createBookletEnvoi.mockResolvedValue({});
  findManyReponses.mockReset();
  findManyReponses.mockResolvedValue([]);
  sendMail.mockReset();
  sendMail.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe('GET /api/praticien/booklet', () => {
  it('401 sans session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'));
    expect(res.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('400 sans idSynthese', async () => {
    const res = await GET(req('http://x/api/praticien/booklet'));
    expect(res.status).toBe(400);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('scope la recherche au praticien en session (relation patient)', async () => {
    findFirst.mockResolvedValue(syntheseFixture('Validee_Praticien'));
    await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'));
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        idSynthese: 'SYN_1',
        patient: { praticienEmail: { equals: 'p@wellneuro.fr', mode: 'insensitive' } },
      },
      include: { bookletEnvois: { where: { statut: 'Envoye' }, orderBy: { dateEnvoi: 'desc' }, take: 1 } },
    });
  });

  it('404 pour la synthèse d’un patient d’un autre praticien, indistinguable de l’inexistante — jamais journalisé', async () => {
    findFirst.mockResolvedValue(null);
    const res = await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Synthèse introuvable.' });
    // Un refus ne se journalise jamais : la ligne nommerait un dossier non lu.
    expect(createJournal).not.toHaveBeenCalled();
  });

  it('422 si la synthèse n’est pas validée — la lecture est journalisée (le dossier a été résolu)', async () => {
    findFirst.mockResolvedValue(syntheseFixture('Brouillon_IA'));
    const res = await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'));
    expect(res.status).toBe(422);
    expect(createJournal).toHaveBeenCalledTimes(1);
  });

  it('200 avec le HTML pour une synthèse validée', async () => {
    findFirst.mockResolvedValue(syntheseFixture('Validee_Praticien'));
    const res = await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patientNom).toBe('Sophie Nicola');
    expect(typeof body.html).toBe('string');
    expect(body.html.length).toBeGreaterThan(0);
    // Dossier sain : aucune mention. C'est le contrôle négatif des deux tests
    // qui suivent.
    expect(body.avertissementMesureRetiree).toBeNull();
  });

  it('booklet tiré d’une synthèse antérieure au retrait : la prévisualisation le dit', async () => {
    // Le booklet part AU PATIENT. Le praticien doit le savoir avant d'envoyer,
    // pas après — et les 3 synthèses de production sont toutes validées, donc
    // expédiables en l'état.
    findFirst.mockResolvedValue(syntheseFixture('Validee_Praticien'));
    findManyReponses.mockResolvedValue([{ idQuestionnaire: 'Q_SOM_07' }]);
    const body = await (await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'))).json();
    expect(body.avertissementMesureRetiree).toBeTruthy();
    // Elle informe, elle ne bloque pas : le document reste produit.
    expect(body.html.length).toBeGreaterThan(0);
  });

  it('dossier concerné mais synthèse postérieure au retrait : aucune mention', async () => {
    findFirst.mockResolvedValue({
      ...syntheseFixture('Validee_Praticien'),
      dateGeneration: new Date('2026-08-01T00:00:00.000Z'),
    });
    findManyReponses.mockResolvedValue([{ idQuestionnaire: 'Q_SOM_07' }]);
    const body = await (await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'))).json();
    expect(body.avertissementMesureRetiree).toBeNull();
  });

  it('lecture journalisée au gabarit littéral (G-TRUST-04), idPatient issu de la synthèse', async () => {
    findFirst.mockResolvedValue(syntheseFixture('Validee_Praticien'));
    await GET(req('http://x/api/praticien/booklet?idSynthese=SYN_1'));
    expect(createJournal).toHaveBeenCalledTimes(1);
    expect(createJournal).toHaveBeenCalledWith({
      data: {
        idPatient: 'PAT_1',
        praticienEmail: 'p@wellneuro.fr',
        route: '/api/praticien/booklet',
        methode: 'GET',
      },
    });
  });
});

describe('POST /api/praticien/booklet (garde inchangée)', () => {
  it('422 sans confirmation de relecture, sans lecture de synthèse ni journalisation', async () => {
    const res = await POST(
      new Request('http://x/api/praticien/booklet', {
        method: 'POST',
        body: JSON.stringify({ idSynthese: 'SYN_1' }),
      }),
    );
    expect(res.status).toBe(422);
    expect(findFirst).not.toHaveBeenCalled();
    // Le POST ne journalise pas (GD-1) : l'envoi laisse déjà sa trace datée.
    expect(createJournal).not.toHaveBeenCalled();
  });
});

// SMTP_URL est absente en test : la route s'arrête en 503 APRÈS la garde de
// registre. C'est ce qui permet de prouver qu'un narratif propre la franchit,
// sans avoir à simuler nodemailer.
describe('POST /api/praticien/booklet — garde de registre anxiogène', () => {
  function envoyer(corps: Record<string, unknown>) {
    return POST(
      new Request('http://x/api/praticien/booklet', {
        method: 'POST',
        body: JSON.stringify({ idSynthese: 'SYN_1', relectureConfirmee: true, ...corps }),
      }),
    );
  }

  function avecNarratif(narratif: string) {
    const s = syntheseFixture('Validee_Praticien');
    s.syntheseJson.narratif_patient = narratif;
    findFirst.mockResolvedValue(s);
  }

  it('demande confirmation, nomme le mot, et n’envoie rien', async () => {
    avecNarratif('Une consultation urgente est à prévoir.');
    const res = await envoyer({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.needsConfirmation).toBe(true);
    expect(body.reason).toBe('REGISTRE_ANXIOGENE');
    // Le MOT du praticien, pas la racine : « urgen » n'est pas du français.
    expect(body.terme).toBe('urgente');
    expect(body.warning).toContain('urgente');
    // Aucun envoi : la route se serait sinon arrêtée en 503 (SMTP_URL absente).
    expect(body.emailMasque).toBeDefined();
  });

  it('journalise le blocage — un motif clinique doit se relire', async () => {
    avecNarratif('Une consultation urgente est à prévoir.');
    await envoyer({});
    expect(createBookletEnvoi).toHaveBeenCalledTimes(1);
    const trace = createBookletEnvoi.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(trace.data.statut).toBe('Confirmation_Requise');
    expect(trace.data.operation).toBe('Registre');
    expect(String(trace.data.erreurCourte)).toContain('urgente');
  });

  it('confirmerRegistre laisse passer — la garde fait regarder, elle ne décide pas', async () => {
    avecNarratif('Une consultation urgente est à prévoir.');
    const res = await envoyer({ confirmerRegistre: true });
    // 503 SMTP : la garde est franchie, l'envoi est bien tenté.
    expect(res.status).toBe(503);
  });

  it('forceSend ne vaut PAS confirmation de registre — deux décisions distinctes', async () => {
    avecNarratif('Une consultation urgente est à prévoir.');
    const res = await envoyer({ forceSend: true });
    const body = await res.json();
    expect(body.needsConfirmation).toBe(true);
    expect(body.reason).toBe('REGISTRE_ANXIOGENE');
  });

  it('un narratif descriptif passe sans confirmation', async () => {
    avecNarratif('Vos réponses évoquent un sommeil fragmenté ; nous en reparlerons.');
    const res = await envoyer({});
    expect(res.status).toBe(503);
    expect(createBookletEnvoi).toHaveBeenCalledTimes(1);
    const trace = createBookletEnvoi.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(trace.data.operation).not.toBe('Registre');
  });

  it('un dossier clos répond « dossier clos », pas « reformulez »', async () => {
    avecNarratif('Une consultation urgente est à prévoir.');
    findUniquePatient.mockResolvedValue({
      prenom: 'Sophie', nom: 'Nicola', actif: true,
      suiviClotureLe: new Date('2026-07-01T00:00:00.000Z'), effaceLe: null,
    });
    const res = await envoyer({});
    expect(res.status).toBe(409);
  });
});

// L'instantané de la note (`noteTransmise`) est ce que le portail patient sert
// dans « Mon bilan ». Deux propriétés le rendent honnête, et aucune des deux ne
// se lit sur le seul code de `logBookletEnvoi` : une ligne d'échec ne porte
// rien, et un renvoi fige la note DU RENVOI, pas celle du premier envoi.
describe('POST /api/praticien/booklet — instantané de la note transmise', () => {
  const NOTE_PREMIER_ENVOI = 'Première note, celle du 18 juillet.';
  const NOTE_CORRIGEE = 'Note corrigée avant le renvoi du 25 juillet.';

  function envoyer(corps: Record<string, unknown>) {
    return POST(
      new Request('http://x/api/praticien/booklet', {
        method: 'POST',
        body: JSON.stringify({ idSynthese: 'SYN_1', relectureConfirmee: true, ...corps }),
      }),
    );
  }

  // Spread plutôt qu'affectation : le fixture type `notesPraticien` à `null`
  // et `bookletEnvois` à `never[]`, l'écrasement par spread rend les vrais
  // types sans cast.
  function synthese(note: string | null, envoisPrecedents = 0) {
    return {
      ...syntheseFixture('Validee_Praticien'),
      notesPraticien: note,
      bookletEnvois: Array.from({ length: envoisPrecedents }, (_, i) => ({
        id: `BE_${i + 1}`,
        dateEnvoi: new Date('2026-07-18T00:00:00.000Z'),
      })),
    };
  }

  function derniereLigne(): Record<string, unknown> {
    const appels = createBookletEnvoi.mock.calls;
    return (appels[appels.length - 1][0] as { data: Record<string, unknown> }).data;
  }

  // --- (a) une ligne d'échec n'a rien transmis --------------------------

  it('Erreur (relecture non confirmée) : aucune note dans la ligne', async () => {
    findFirst.mockResolvedValue(synthese(NOTE_PREMIER_ENVOI));
    await POST(
      new Request('http://x/api/praticien/booklet', {
        method: 'POST',
        body: JSON.stringify({ idSynthese: 'SYN_1' }),
      }),
    );
    expect(derniereLigne().statut).toBe('Erreur');
    expect(derniereLigne().noteTransmise).toBeUndefined();
  });

  it('Erreur (synthèse non validée) : aucune note dans la ligne', async () => {
    findFirst.mockResolvedValue({ ...synthese(NOTE_PREMIER_ENVOI), statut: 'Brouillon_IA' });
    const res = await envoyer({});
    expect(res.status).toBe(422);
    expect(derniereLigne().statut).toBe('Erreur');
    expect(derniereLigne().noteTransmise).toBeUndefined();
  });

  it('Erreur (SMTP absent) : rien n’est parti, donc aucune note figée', async () => {
    findFirst.mockResolvedValue(synthese(NOTE_PREMIER_ENVOI));
    const res = await envoyer({});
    expect(res.status).toBe(503);
    expect(derniereLigne().statut).toBe('Erreur');
    expect(derniereLigne().noteTransmise).toBeUndefined();
  });

  it('Confirmation_Requise (renvoi non confirmé) : aucune note dans la ligne', async () => {
    findFirst.mockResolvedValue(synthese(NOTE_PREMIER_ENVOI, 1));
    const body = await (await envoyer({})).json();
    expect(body.needsConfirmation).toBe(true);
    expect(derniereLigne().statut).toBe('Confirmation_Requise');
    expect(derniereLigne().operation).toBe('Renvoi');
    expect(derniereLigne().noteTransmise).toBeUndefined();
  });

  // --- (b) un renvoi fige la note DU RENVOI ------------------------------

  describe('avec un SMTP joignable', () => {
    beforeEach(() => {
      process.env.SMTP_URL = 'smtp://test:test@localhost:1025';
    });
    afterEach(() => {
      delete process.env.SMTP_URL;
    });

    it('un renvoi écrit un instantané FRAIS, pas celui du premier envoi', async () => {
      // Le premier envoi a figé `NOTE_PREMIER_ENVOI` ; le praticien a depuis
      // corrigé la note (action `annoter`, volontairement sans garde) et
      // renvoie. Précondition explicite : les deux notes DIVERGENT — sans quoi
      // le test passerait même si la route recopiait l'ancien instantané.
      expect(NOTE_CORRIGEE).not.toBe(NOTE_PREMIER_ENVOI);
      findFirst.mockResolvedValue(synthese(NOTE_CORRIGEE, 1));

      const res = await envoyer({ forceSend: true });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(derniereLigne().statut).toBe('Envoye');
      expect(derniereLigne().operation).toBe('Renvoi');
      expect(derniereLigne().noteTransmise).toBe(NOTE_CORRIGEE);
    });

    it('un premier envoi fige la note du moment', async () => {
      findFirst.mockResolvedValue(synthese(NOTE_PREMIER_ENVOI));
      const res = await envoyer({});
      expect(res.status).toBe(200);
      expect(derniereLigne().statut).toBe('Envoye');
      expect(derniereLigne().operation).toBe('Envoi');
      expect(derniereLigne().noteTransmise).toBe(NOTE_PREMIER_ENVOI);
    });
  });
});

// ---------------------------------------------------------------------------
// M03 / D-148 — la ligne que le PRATICIEN voit sur la fiche.
//
// `booklet_envois` (l'audit) était juste ; `correspondances_patient` (ce qui
// s'affiche) en dérivait par un ternaire qui rangeait tout non-`Envoye` en
// `Erreur`. Lecture de production du 2026-09-08 : 222 lignes de journal, dont
// 5 `Erreur` — les 5 mêmes que les 5 `Confirmation_Requise` de l'audit. La
// seule erreur jamais affichée était fausse, et sur l'un des deux dossiers le
// praticien a réessayé trois fois en trois minutes avant d'abandonner.
// ---------------------------------------------------------------------------
describe('POST /api/praticien/booklet — ce que le journal de correspondance dit', () => {
  function envoyer(corps: Record<string, unknown>) {
    return POST(
      new Request('http://x/api/praticien/booklet', {
        method: 'POST',
        body: JSON.stringify({ idSynthese: 'SYN_1', relectureConfirmee: true, ...corps }),
      }),
    );
  }

  function ligneJournal() {
    const appels = createCorrespondance.mock.calls;
    return (appels[appels.length - 1][0] as { data: Record<string, unknown> }).data;
  }

  function avecNarratif(narratif: string) {
    const s = syntheseFixture('Validee_Praticien');
    s.syntheseJson.narratif_patient = narratif;
    findFirst.mockResolvedValue(s);
  }

  it('une confirmation de REGISTRE attendue n’est pas un échec d’envoi', async () => {
    avecNarratif('Une consultation urgente est à prévoir.');
    await envoyer({});
    // L'audit dit vrai — il le disait déjà.
    expect(createBookletEnvoi.mock.calls[0][0].data.statut).toBe('Confirmation_Requise');
    // Et la fiche ne dit plus « Échec d'envoi » pour un document en attente.
    expect(ligneJournal().statut).toBe('Non_envoye');
    expect(ligneJournal().statut).not.toBe('Erreur');
    // « Non envoyé » seul ne dirait pas ce qui est attendu.
    expect(String(ligneJournal().objet)).toContain('en attente de votre confirmation');
  });

  it('une confirmation de RENVOI attendue n’est pas davantage un échec', async () => {
    const s = syntheseFixture('Validee_Praticien');
    s.bookletEnvois = [{ dateEnvoi: new Date('2026-07-18T00:00:00.000Z') }] as never;
    findFirst.mockResolvedValue(s);
    await envoyer({});
    expect(createBookletEnvoi.mock.calls[0][0].data.statut).toBe('Confirmation_Requise');
    expect(ligneJournal().statut).toBe('Non_envoye');
    expect(String(ligneJournal().objet)).toContain('Renvoi');
  });

  it('un envoi réussi reste « Envoye »', async () => {
    process.env.SMTP_URL = 'smtp://test:test@localhost:1025';
    try {
      findFirst.mockResolvedValue(syntheseFixture('Validee_Praticien'));
      const res = await envoyer({});
      expect(res.status).toBe(200);
      expect(ligneJournal().statut).toBe('Envoye');
    } finally {
      delete process.env.SMTP_URL;
    }
  });

  // Le pendant exact du défaut : une panne RÉELLE n'écrivait NI ligne d'audit
  // NI ligne de journal — seulement un `logger.error`. Un bilan perdu était
  // donc invisible sur la fiche, pendant qu'une demande de confirmation, elle,
  // s'y affichait en rouge. Le patron appliqué est celui de `file-envoi`.
  it('un relais SMTP qui refuse écrit l’audit ET le journal, et répond 502', async () => {
    process.env.SMTP_URL = 'smtp://test:test@localhost:1025';
    try {
      findFirst.mockResolvedValue(syntheseFixture('Validee_Praticien'));
      sendMail.mockRejectedValueOnce(new Error('550 relais refusé'));

      const res = await envoyer({});
      expect(res.status).toBe(502);

      expect(createBookletEnvoi).toHaveBeenCalledTimes(1);
      const audit = createBookletEnvoi.mock.calls[0][0].data as Record<string, unknown>;
      expect(audit.statut).toBe('Erreur');
      expect(audit.operation).toBe('Envoi');
      expect(String(audit.erreurCourte)).toContain('550');
      // Rien n'est parti : aucun instantané de note ne doit être figé.
      expect(audit.noteTransmise).toBeUndefined();

      expect(ligneJournal().statut).toBe('Erreur');

      // Et le praticien n'est plus renvoyé vers un terminal de développement.
      const corps = await res.json();
      expect(String(corps.error)).not.toContain('Next.js');
      expect(String(corps.error)).toContain('pas parti');
    } finally {
      delete process.env.SMTP_URL;
    }
  });

  // Les deux avertissements sont RENDUS TELS QUELS au praticien : ils ne
  // peuvent pas nommer un champ JSON qu'aucun écran ne pose.
  it('les avertissements nomment une case, pas un champ JSON', async () => {
    avecNarratif('Une consultation urgente est à prévoir.');
    const registre = await (await envoyer({})).json();
    expect(registre.warning).not.toContain('confirmerRegistre');
    expect(registre.warning).toContain('Envoyer tel quel');

    const s = syntheseFixture('Validee_Praticien');
    s.bookletEnvois = [{ dateEnvoi: new Date('2026-07-18T00:00:00.000Z') }] as never;
    findFirst.mockResolvedValue(s);
    const renvoi = await (await envoyer({})).json();
    expect(renvoi.warning).not.toContain('forceSend');
    expect(renvoi.warning).toContain('Confirmer le renvoi');
  });
});
