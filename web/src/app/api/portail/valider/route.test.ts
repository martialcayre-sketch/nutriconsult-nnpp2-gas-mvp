import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    consultation: { findFirst: vi.fn(), update: vi.fn() },
    pack: { findFirst: vi.fn() },
    assignation: { create: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    // Interrogé par le vrai `resolvePackQuestionnaireIds` : `null` fait
    // retomber la résolution sur `pack.qids` (source « legacy »), c'est-à-dire
    // exactement la liste que le cas de test pose.
    questionnairePack: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/ids', () => ({ createPublicId: (prefix: string) => `${prefix}_TEST_12345678` }));
vi.mock('@/lib/observability/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), security: vi.fn(), error: vi.fn() },
}));
// `resolvePackQuestionnaireIds` reste VOLONTAIREMENT l'implémentation réelle
// par défaut (enveloppée dans un `vi.fn` pour rester surchargeable au cas par
// cas) — même motif que pour `assignBasePack` ci-dessous : c'est le câblage
// qu'on veut prouver, pas la fonction en isolation. Seul le test LOT-02 sur le
// repli `registre_absent` la surcharge, ponctuellement, via
// `mockResolvedValueOnce`.
vi.mock('@/lib/consultation/packRegistry', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/consultation/packRegistry')>();
  return { ...actual, resolvePackQuestionnaireIds: vi.fn(actual.resolvePackQuestionnaireIds) };
});

import { signPatientSession } from '@/lib/patient-session';
import { logger } from '@/lib/observability/logger';
import { EVENT_CODES } from '@/lib/observability/eventCodes';
import { resolvePackQuestionnaireIds } from '@/lib/consultation/packRegistry';
import { POST } from './route';

// `assignBasePack` et `packRegistry` sont VOLONTAIREMENT réels : c'est le
// câblage qu'on veut prouver ici, pas la fonction en isolation (déjà couverte
// par `lib/consultation/assignBasePack.test.ts`). Mocker l'assignation
// laisserait passer une route qui journalise l'écart sans jamais l'appliquer —
// ou l'inverse.

const PATIENT = { idPatient: 'PAT_SEED_03', email: 'michel.dogne@fictif.wellneuro.fr' };

const compte = {
  idPatient: PATIENT.idPatient,
  actif: true,
  email: PATIENT.email,
  accessTokenRevoked: false,
  sessionsInvalidesAvant: null,
};

const consultation = {
  idConsultation: 'CONS_TEST',
  idPatient: PATIENT.idPatient,
  statut: 'en_cours',
  consentement: 'donne',
  consentementVersion: 'v1',
  finaliteConsentement: 'soin',
  ficheSignaletique: { ok: true },
  motif: 'Fatigue',
};

function post(qidsDuPack: string[]): Request {
  prisma.pack.findFirst.mockResolvedValue({
    idPack: 'PACK_BASE',
    nom: 'BASE DE CONSULTATION',
    qids: qidsDuPack,
    parDefaut: true,
    actif: true,
  });
  return new Request('http://localhost/api/portail/valider', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `wn_portail=${encodeURIComponent(signPatientSession(PATIENT))}`,
    },
    body: JSON.stringify({ anamnese: { motif_principal: 'Fatigue persistante depuis six mois.' } }),
  });
}

describe('POST /api/portail/valider — instruments suspendus dans le pack de base', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = 'secret-de-test-non-production';
    prisma.patient.findUnique.mockResolvedValue(compte);
    prisma.consultation.findFirst.mockResolvedValue(consultation);
    prisma.consultation.update.mockResolvedValue({});
    prisma.assignation.create.mockResolvedValue({});
    prisma.questionnairePack.findUnique.mockResolvedValue(null);
    // Dédup : aucune assignation ouverte par défaut ; la transaction
    // interactive passe le client mocké lui-même comme tx.
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
  });

  it('assigne tout le pack lorsque aucun instrument n’est suspendu', async () => {
    const response = await POST(post(['Q_NEU_03', 'Q_SOM_06']));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, count: 2 });
    expect(prisma.assignation.create).toHaveBeenCalledTimes(2);
    // L'assertion porte sur le code d'événement, pas sur « aucun warn » : la
    // fixture n'a pas de registre relationnel (`questionnairePack` rend null),
    // donc le repli legacy est légitimement pris et journalisé depuis le
    // LOT-03. Un « jamais de warn » confondrait les deux signaux.
    expect(
      vi.mocked(logger.warn).mock.calls
        .filter(([payload]) => payload.event === EVENT_CODES.ASSIGNATION_PACK_INSTRUMENT_SUSPENDU),
    ).toEqual([]);
  });

  // Le cas réel qui a motivé cette garde était le pack « Florence 1 » de
  // production, qui contenait `Q_SOM_07` : rien ne retire un qid de
  // `pack.qids`, la garde doit donc agir à la validation, sur un chemin où le
  // patient est seul.
  //
  // Le témoin est `Q_FIB_03` depuis le 2026-07-31 — `Q_SOM_07` a été reconstruit
  // depuis sa source puis rouvert, il n'illustre plus rien ici. Une première
  // rédaction de ce commentaire a été obtenue par substitution mécanique et
  // affirmait que « Florence 1 » contenait `Q_FIB_03` : c'était un fait de
  // production INVENTÉ, relevé en revue. Le mécanisme testé, lui, est le même
  // quel que soit l'instrument suspendu.
  //
  // CONSÉQUENCE À CONNAÎTRE, hors de ce test : la réouverture de `Q_SOM_07`
  // réarme « Florence 1 », qui recommence donc à envoyer le MFI-20 à chaque
  // validation de consultation. C'est cohérent — l'instrument est réparé — mais
  // c'est un effet de la réactivation, pas une décision distincte.
  it('écarte l’instrument suspendu et n’en assigne pas l’assignation', async () => {
    const response = await POST(post(['Q_NEU_03', 'Q_FIB_03']));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, count: 1 });
    expect(prisma.assignation.create).toHaveBeenCalledOnce();
    const arg = prisma.assignation.create.mock.calls[0][0] as { data: { idQuestionnaire: string } };
    expect(arg.data.idQuestionnaire).toBe('Q_NEU_03');
  });

  // Sans cette assertion, retirer les lignes de trace de la route laisserait
  // toute la suite verte : l'amputation du pack de base redeviendrait
  // invisible sur le seul chemin qui n'a aucun praticien pour lire un écart
  // de comptage.
  it('journalise le qid écarté, sous son propre code d’événement', async () => {
    await POST(post(['Q_NEU_03', 'Q_FIB_03']));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: EVENT_CODES.ASSIGNATION_PACK_INSTRUMENT_SUSPENDU,
        domain: 'ASSIGNATION',
        message: expect.stringContaining('Q_FIB_03'),
      })
    );
  });

  // La consultation est validée même si le pack part amputé : le patient a
  // rempli son anamnèse, la lui refaire refaire pour un défaut de catalogue
  // serait le punir d'une décision clinique qui n'est pas la sienne.
  it('valide quand même la consultation', async () => {
    await POST(post(['Q_NEU_03', 'Q_FIB_03']));
    expect(prisma.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idConsultation: 'CONS_TEST' },
        data: expect.objectContaining({ statut: 'validee' }),
      })
    );
  });

  // LOT-02 : le repli legacy du pack de base devient observable pour ses cas
  // bénins (registre jamais synchronisé), en INFO — pas en WARN, qui reste
  // réservé à une vraie divergence (`ensembles_divergents`).
  it('journalise en info le repli legacy du pack de base quand le registre est simplement absent', async () => {
    vi.mocked(resolvePackQuestionnaireIds).mockResolvedValueOnce({
      qids: ['Q_NEU_03'],
      source: 'legacy',
      raison: 'registre_absent',
      registryCount: 0,
    });
    const response = await POST(post(['Q_NEU_03']));
    expect(response.status).toBe(200);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: EVENT_CODES.PACK_REGISTRE_REPLI_LEGACY,
        metadata: { raison: 'registre_absent', registryCount: 0 },
      })
    );
    expect(
      vi.mocked(logger.warn).mock.calls
        .filter(([payload]) => payload.event === EVENT_CODES.PACK_REGISTRE_REPLI_LEGACY),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-03 — le repli par NOM de `resoudrePackBase`.
//
// Ce repli comparait `nom` en égalité exacte contre `'BASE DE CONSULTATION'`
// alors que le pack réel s'appelle « Base de consultation » : l'égalité
// Prisma/PostgreSQL étant sensible à la casse, il ne pouvait JAMAIS matcher.
// Aucun test ne le couvrait — la suite ci-dessus mocke `pack.findFirst` sans
// regarder ses arguments, donc elle passe le pack quelle que soit la requête,
// et le voit toujours résolu par `parDefaut`.
//
// D'où le double de `findFirst` ci-dessous : il REJOUE la sémantique
// PostgreSQL (`equals` nu = sensible à la casse, `mode: 'insensitive'` = non)
// au lieu de rendre la fixture quoi qu'on demande. C'est ce qui rend le banc
// falsifiable : rétablir la comparaison stricte, ou remettre la constante en
// capitales, rend `null` et la route répond 404 `pack_not_found`.
describe('POST /api/portail/valider — l’échéance du pack de base', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = 'secret-de-test-non-production';
    prisma.patient.findUnique.mockResolvedValue(compte);
    prisma.consultation.findFirst.mockResolvedValue(consultation);
    prisma.consultation.update.mockResolvedValue({});
    prisma.assignation.create.mockResolvedValue({});
    prisma.questionnairePack.findUnique.mockResolvedValue(null);
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    // L'horloge est figée AVANT `post()`, qui signe la session sur `Date.now()`.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-07T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Retrouve une création par son instrument — jamais par son rang. */
  function creation(idQuestionnaire: string) {
    const appels = prisma.assignation.create.mock.calls as Array<
      [{ data: { idQuestionnaire: string; dateLimite: string | null } }]
    >;
    return appels.find(c => c[0].data.idQuestionnaire === idQuestionnaire)?.[0].data;
  }

  it('le pack de base part AVEC une échéance — sans elle, aucun retard ne peut naître', async () => {
    // La lecture du Fil filtre `dateLimite: { not: null }` avant même
    // d'atteindre `cartesAssignationsEnRetard` : un pack de base oublié ne
    // pouvait rougir nulle part. L'assertion porte sur TOUTES les créations,
    // pas seulement la première.
    const response = await POST(post(['Q_NEU_03', 'Q_SOM_06']));
    expect(response.status).toBe(200);
    expect(prisma.assignation.create).toHaveBeenCalledTimes(2);
    expect(creation('Q_NEU_03')?.dateLimite).toBe('2026-10-07');
    expect(creation('Q_SOM_06')?.dateLimite).toBe('2026-10-07');
  });

  it('l’agenda du pack de base part SANS échéance, sur le chemin réel', async () => {
    // LE CÂBLAGE DE L'EXEMPTION, pas seulement sa fonction. `Q_SOM_09` est dans
    // le pack de base de production : sans cette garde, chaque onboarding
    // validé poserait une échéance qui, trente jours plus tard, refuserait la
    // saisie d'une nuit ET fermerait la relance praticien.
    const response = await POST(post(['Q_NEU_03', 'Q_SOM_09']));
    expect(response.status).toBe(200);
    expect(creation('Q_NEU_03')?.dateLimite).toBe('2026-10-07');
    expect(creation('Q_SOM_09')?.dateLimite).toBeNull();
  });
});

describe('POST /api/portail/valider — repli par nom du pack de base', () => {
  // TROIS CASSES, et c'est ce qui rend le banc falsifiable indépendamment de la
  // casse de la constante : une comparaison stricte, quelle que soit la forme
  // qu'on lui donne, échoue sur au moins deux des trois. Aucun identifiant de
  // pack de production ici — `idPack` est une valeur de test.
  const CASSES = ['Base de consultation', 'BASE DE CONSULTATION', 'base de consultation'];

  function packNomme(nom: string) {
    return { idPack: 'PACK_TEST_NOMME', nom, qids: ['Q_NEU_03'], parDefaut: false, actif: true };
  }

  type FiltreNom = string | { equals?: string; mode?: string };
  type ArgsFindFirst = { where: { nom?: FiltreNom; parDefaut?: boolean; actif?: boolean } };

  /** Sémantique PostgreSQL du filtre `nom`, telle que Prisma la traduit. */
  function nomCorrespond(filtre: FiltreNom | undefined, nomEnBase: string): boolean {
    if (filtre === undefined) return true;
    if (typeof filtre === 'string') return filtre === nomEnBase;
    const attendu = filtre.equals ?? '';
    return filtre.mode === 'insensitive'
      ? attendu.toLocaleLowerCase() === nomEnBase.toLocaleLowerCase()
      : attendu === nomEnBase;
  }

  /**
   * Monte un catalogue d'UN pack, nommé `nom`, et AUCUN pack `parDefaut` actif :
   * le repli par nom est alors le seul chemin qui reste, ce qui est précisément
   * la situation qu'il prétend couvrir.
   */
  function monterCatalogue(nom: string) {
    prisma.pack.findFirst.mockImplementation(async (args: ArgsFindFirst) => {
      if (args.where.parDefaut === true) return null;
      if (args.where.actif !== true) return null;
      return nomCorrespond(args.where.nom, nom) ? packNomme(nom) : null;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = 'secret-de-test-non-production';
    prisma.patient.findUnique.mockResolvedValue(compte);
    prisma.consultation.findFirst.mockResolvedValue(consultation);
    prisma.consultation.update.mockResolvedValue({});
    prisma.assignation.create.mockResolvedValue({});
    prisma.questionnairePack.findUnique.mockResolvedValue(null);
    prisma.assignation.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
  });

  function requete(): Request {
    return new Request('http://localhost/api/portail/valider', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `wn_portail=${encodeURIComponent(signPatientSession(PATIENT))}`,
      },
      body: JSON.stringify({ anamnese: { motif_principal: 'Fatigue persistante depuis six mois.' } }),
    });
  }

  for (const nom of CASSES) {
    it(`résout le pack nommé « ${nom} », sans pack parDefaut`, async () => {
      monterCatalogue(nom);
      const response = await POST(requete());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, count: 1 });
      expect(prisma.assignation.create).toHaveBeenCalledOnce();
    });
  }

  // `findFirst` sans tri rend une ligne ARBITRAIRE : deux packs homonymes
  // feraient dépendre le pack assigné à un patient d'un ordre non spécifié.
  it('demande un ordre déterministe, jamais la première ligne venue', async () => {
    monterCatalogue(CASSES[0]);
    await POST(requete());
    const appelParNom = prisma.pack.findFirst.mock.calls
      .map(([args]) => args as ArgsFindFirst & { orderBy?: unknown })
      .find(args => args.where.parDefaut !== true);
    expect(appelParNom).toBeDefined();
    expect(appelParNom?.orderBy).toBeDefined();
  });
});
