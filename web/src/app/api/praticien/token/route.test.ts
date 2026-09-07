import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma, verifierAppartenancePatient } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn(), update: vi.fn() },
    portailMagicLink: { create: vi.fn(), updateMany: vi.fn() },
    // `$transaction` reçoit un tableau de promesses déjà construites : les
    // exécuter suffit, et les appels sont enregistrés sur les mocks ci-dessus.
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
  },
  verifierAppartenancePatient: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/praticien/appartenance', () => ({
  verifierAppartenancePatient,
  emailPraticien: () => 'p@wellneuro.fr',
}));
// L'action `issue` déclenche un envoi d'e-mail réel (best-effort, avalé par
// un try/catch — lent et bruyant en test). Mock nécessaire depuis que le test
// de réémission emprunte ce chemin, le seul qui atteigne la dé-révocation.
// Le gate G4 est éteint par défaut : sans ce mock, `lien_magique` répond 404
// et les cas qui le visent passeraient au vert sans rien atteindre.
vi.mock('@/lib/portail/featureFlag', () => ({ isG4LienMagiqueEnabled: () => true }));
vi.mock('@/lib/consultation/email', () => ({
  buildGoogleConnexionUrl: () => 'https://app.wellneuro.fr/portail/google',
  buildMagicLinkUrl: (jeton: string) => `https://app.wellneuro.fr/portail/lien/${jeton}`,
  sendMagicLinkEmail: vi.fn(),
  sendPortailLinkEmail: vi.fn(),
}));

import { sendMagicLinkEmail, sendPortailLinkEmail } from '@/lib/consultation/email';
import { DELETE, POST } from './route';

function request(query = 'idPatient=PAT_1'): Request {
  return new Request(`http://localhost/api/praticien/token?${query}`, { method: 'DELETE' });
}

function postRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/praticien/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('DELETE /api/praticien/token — révocation d’accès', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    verifierAppartenancePatient.mockResolvedValue('ok');
    prisma.patient.findUnique.mockResolvedValue({ idPatient: 'PAT_1', accessTokenRevoked: false });
    prisma.patient.update.mockResolvedValue({});
    prisma.portailMagicLink.updateMany.mockResolvedValue({ count: 0 });
  });

  // IDP2 LOT-02 : révoquer ferme le chemin par jeton ET les sessions de compte
  // déjà ouvertes. Sans la seconde écriture, un cookie valide survivrait à la
  // révocation le jour où le jeton permanent disparaît (LOT-04).
  it('coupe l’accès par jeton et les sessions déjà ouvertes', async () => {
    const avant = Date.now();
    const res = await DELETE(request());
    expect(res.status).toBe(200);

    const [appel] = prisma.patient.update.mock.calls as [
      [{ where: { idPatient: string }; data: { accessTokenRevoked: boolean; sessionsInvalidesAvant: Date } }],
    ];
    expect(appel[0].where).toEqual({ idPatient: 'PAT_1' });
    expect(appel[0].data.accessTokenRevoked).toBe(true);
    expect(appel[0].data.sessionsInvalidesAvant.getTime()).toBeGreaterThanOrEqual(avant);
  });

  // LOT-02c — la troisième porte. Un lien à usage unique émis avant la
  // révocation n'était gardé que par `accessTokenRevoked` : réémettre l'accès
  // le rendait exploitable, jusqu'à 24 h après.
  it('ferme les liens à usage unique encore en vol, dans la même transaction', async () => {
    await DELETE(request());

    const [appel] = prisma.portailMagicLink.updateMany.mock.calls as [
      [{
        where: { idPatient: string; consommeLe: null; expireLe: { gt: Date } };
        data: { expireLe: Date };
      }],
    ];
    // `consommeLe: null` : un lien DÉJÀ consommé garde sa date d'origine — la
    // trace ne doit pas être réécrite par une révocation postérieure.
    // `expireLe: { gt: maintenant }` : l'écriture est monotone et idempotente,
    // elle ne rallonge jamais un lien et ne touche rien au second passage.
    expect(appel[0].where).toEqual({
      idPatient: 'PAT_1',
      consommeLe: null,
      expireLe: { gt: expect.any(Date) },
    });
    expect(appel[0].data.expireLe).toBeInstanceOf(Date);

    // Les deux écritures tombent ensemble : fermer le jeton sans fermer les
    // liens laisserait exactement le trou qu'on referme.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [operations] = prisma.$transaction.mock.calls[0] as [unknown[]];
    expect(operations).toHaveLength(2);
  });

  it('date les deux écritures du même instant', async () => {
    await DELETE(request());
    const patch = prisma.patient.update.mock.calls[0][0] as { data: { sessionsInvalidesAvant: Date } };
    const liens = prisma.portailMagicLink.updateMany.mock.calls[0][0] as { data: { expireLe: Date } };
    expect(liens.data.expireLe.getTime()).toBe(patch.data.sessionsInvalidesAvant.getTime());
  });

  // LE BANC DÉCISIF DE `D-128`, et il garde ce que la révocation s'INTERDIT.
  // Elle datait `consommeLe` sur un lien que personne n'avait ouvert : l'encart
  // des dossiers neufs devait ensuite écarter ces tampons par une égalité
  // stricte, ruse qui ne tenait qu'UNE révocation. Un correctif qui refermerait
  // par `consommeLe` — la forme d'avant — rougit ici.
  //
  // La boucle ne peut pas être vide-donc-verte : le banc voisin ci-dessus
  // déréférence `mock.calls[0][0]`, donc l'absence d'appel y échoue déjà.
  it('n’écrit JAMAIS `consommeLe` — cette colonne ne dit que l’entrée du patient', async () => {
    await DELETE(request());
    // La garantie tient DANS ce banc : sans cette ligne, la boucle serait
    // vide-donc-verte le jour où l'écriture disparaîtrait.
    expect(prisma.portailMagicLink.updateMany).toHaveBeenCalledTimes(1);
    for (const [appel] of prisma.portailMagicLink.updateMany.mock.calls) {
      expect(appel.data).not.toHaveProperty('consommeLe');
      expect(appel.data).toHaveProperty('expireLe');
    }
  });

  it('refuse sans session praticien, et n’écrit rien', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await DELETE(request())).status).toBe(401);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('refuse le patient d’un autre praticien, et n’écrit rien', async () => {
    verifierAppartenancePatient.mockResolvedValue('autre_praticien');
    expect((await DELETE(request())).status).toBe(403);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  // Propriété centrale du lot : une révocation ne se défait pas par effet de
  // bord. Réémettre rouvre l'accès, mais les sessions d'avant restent mortes.
  it('la réémission d’un accès n’efface pas la date de révocation', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      idPatient: 'PAT_1',
      email: 'sophie.nicola@example.test',
      prenom: 'Sophie',
      // `actif: true` manquait (404 avant toute écriture) et `action: 'lien'`
      // est le seul chemin en LECTURE SEULE de la route — deux façons pour ce
      // test d'être vert sans rien prouver (constats L-3 puis M de la revue
      // de la PR de purge). `issue` est la réémission que le titre nomme : le
      // seul chemin qui atteint la dé-révocation.
      actif: true,
      accessTokenRevoked: true,
      sessionsInvalidesAvant: new Date('2026-07-21T10:00:00.000Z'),
    });

    // L'accord de rétablissement est désormais requis : sans lui la route
    // refuse en 409 et n'écrit rien — le banc mesurerait alors une absence.
    await POST(postRequest({ idPatient: 'PAT_1', action: 'issue', retablirAcces: true }));

    // La contre-épreuve d'existence d'abord : sans elle, une route qui
    // n'écrirait rien rendrait la boucle vide et le test menteur.
    expect(prisma.patient.update).toHaveBeenCalled();
    const appels = prisma.patient.update.mock.calls as [{ data: Record<string, unknown> }][];
    for (const [appel] of appels) {
      expect(appel.data).not.toHaveProperty('sessionsInvalidesAvant');
    }
  });

  // « Renvoyer l'accès » est le chemin qui sert les dossiers DÉJÀ ouverts :
  // c'est par lui que le texte du gabarit atteint un patient créé avant sa
  // dernière version. L'adresse du praticien doit y voyager comme ailleurs,
  // sans quoi le bouton « Répondre » retombe sur `noreply@`.
  it('la réémission passe le praticien du dossier, pour le Reply-To', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      idPatient: 'PAT_1',
      email: 'sophie.nicola@example.test',
      prenom: 'Sophie',
      praticienEmail: 'p@wellneuro.fr',
      actif: true,
      accessTokenRevoked: false,
    });

    await POST(postRequest({ idPatient: 'PAT_1', action: 'resend' }));

    expect(vi.mocked(sendPortailLinkEmail)).toHaveBeenCalledWith(
      'sophie.nicola@example.test',
      'Sophie',
      'PAT_1',
      'p@wellneuro.fr',
    );
  });
});

// Ce que la RÉPONSE dit de l'envoi. Trois `catch` muets rendaient
// `success: true` sur un envoi mort, et l'écran annonçait « envoyé ».
describe('POST /api/praticien/token — ce que la réponse dit de l’envoi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Le gate G4 est éteint par défaut (`featureFlag.ts`) : sans ce drapeau,
    // `action: 'lien_magique'` répond 404 et le banc ne prouverait rien.
    vi.stubEnv('WN_G4_LIEN_MAGIQUE', 'true');
    // `empreinteJeton` échoue explicitement sans secret (`lienMagique.ts`) :
    // la route partirait alors en `exception`, et le banc mesurerait l'inverse
    // de ce qu'il croit mesurer.
    vi.stubEnv('NEXTAUTH_SECRET', 'secret-de-banc');
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    verifierAppartenancePatient.mockResolvedValue('ok');
    prisma.patient.findUnique.mockResolvedValue({
      idPatient: 'PAT_1',
      email: 'sophie.nicola@example.test',
      prenom: 'Sophie',
      praticienEmail: 'p@wellneuro.fr',
      actif: true,
      accessTokenRevoked: false,
    });
    prisma.patient.update.mockResolvedValue({});
    prisma.portailMagicLink.create.mockResolvedValue({});
    vi.mocked(sendPortailLinkEmail).mockResolvedValue('Envoye');
    vi.mocked(sendMagicLinkEmail).mockResolvedValue('Envoye');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('un renvoi d’accès réussi le dit', async () => {
    const json = await (await POST(postRequest({ idPatient: 'PAT_1', action: 'resend' }))).json();
    expect(json.success).toBe(true);
    expect(json.envoi).toBe('envoye');
  });

  it('un renvoi d’accès mort ne s’annonce plus « renvoyé »', async () => {
    vi.mocked(sendPortailLinkEmail).mockRejectedValueOnce(new Error('smtp down'));
    const res = await POST(postRequest({ idPatient: 'PAT_1', action: 'resend' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.envoi).toBe('echoue');
  });

  it('une messagerie non configurée se distingue d’un envoi mort', async () => {
    vi.mocked(sendPortailLinkEmail).mockResolvedValueOnce('Non_envoye');
    const json = await (await POST(postRequest({ idPatient: 'PAT_1', action: 'resend' }))).json();
    expect(json.envoi).toBe('non_configure');
  });

  it('le lien à usage unique est ÉMIS même quand son e-mail échoue', async () => {
    // Deux faits distincts, et l'écran doit dire les deux : le lien existe en
    // base (il est rendu), et le patient ne l'a pas reçu.
    vi.mocked(sendMagicLinkEmail).mockRejectedValueOnce(new Error('smtp down'));
    const res = await POST(postRequest({ idPatient: 'PAT_1', action: 'lien_magique' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.lien).toContain('/portail/lien/');
    expect(json.envoi).toBe('echoue');
  });

  it('le lien à usage unique distingue lui aussi la messagerie absente', async () => {
    vi.mocked(sendMagicLinkEmail).mockResolvedValueOnce('Non_envoye');
    const json = await (await POST(postRequest({ idPatient: 'PAT_1', action: 'lien_magique' }))).json();
    expect(json.envoi).toBe('non_configure');
  });

  it('« Copier le lien » n’envoie rien, et ne dit donc RIEN de l’envoi', async () => {
    // La garde qui compte : poser 'envoye' par défaut ferait annoncer un
    // e-mail parti là où aucun n'a jamais été tenté.
    const json = await (await POST(postRequest({ idPatient: 'PAT_1', action: 'lien' }))).json();
    expect(json.lien).toBeTruthy();
    expect('envoi' in json).toBe(false);
    expect(sendPortailLinkEmail).not.toHaveBeenCalled();
  });
});

// Les deux gardes serveur du rétablissement. Un `describe` à part : celui du
// DELETE porte déjà deux cas POST, l'y grossir aggraverait son faux nom.
describe('POST /api/praticien/token — rétablissement d’accès', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { email: 'p@wellneuro.fr' } });
    verifierAppartenancePatient.mockResolvedValue('ok');
    prisma.patient.findUnique.mockResolvedValue({
      idPatient: 'PAT_1',
      email: 'sophie.nicola@example.test',
      prenom: 'Sophie',
      praticienEmail: 'p@wellneuro.fr',
      actif: true,
      accessTokenRevoked: true,
    });
    prisma.patient.update.mockResolvedValue({});
    vi.mocked(sendPortailLinkEmail).mockResolvedValue('Envoye');
  });

  it('renvoi sur accès révoqué sans accord : 409, aucune levée, aucun e-mail', async () => {
    const res = await POST(postRequest({ idPatient: 'PAT_1', action: 'resend' }));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('retablissement_non_confirme');
    expect(prisma.patient.update).not.toHaveBeenCalled();
    expect(sendPortailLinkEmail).not.toHaveBeenCalled();
  });

  it('accord non booléen : refusé comme s’il était absent', async () => {
    const res = await POST(postRequest({ idPatient: 'PAT_1', action: 'resend', retablirAcces: 'oui' }));
    expect(res.status).toBe(409);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('renvoi confirmé : lève et envoie', async () => {
    const res = await POST(postRequest({ idPatient: 'PAT_1', action: 'resend', retablirAcces: true }));
    expect(res.status).toBe(200);
    expect(prisma.patient.update).toHaveBeenCalledWith({
      where: { idPatient: 'PAT_1' },
      data: { accessTokenRevoked: false },
    });
    expect(sendPortailLinkEmail).toHaveBeenCalledOnce();
  });

  it('la copie du lien reste en lecture seule sur un dossier révoqué', async () => {
    // C'EST CE CAS QUI INTERDIT DE HISSER LA GARDE au-dessus du test
    // `action !== 'lien'` : copier ne rétablit rien, donc n'a rien à faire
    // confirmer, et un 409 y serait une régression pure.
    const res = await POST(postRequest({ idPatient: 'PAT_1', action: 'lien' }));
    expect(res.status).toBe(200);
    expect(prisma.patient.update).not.toHaveBeenCalled();
    expect(sendPortailLinkEmail).not.toHaveBeenCalled();
  });

  it('le lien à usage unique refuse toujours en portal_revoked, jamais en retablissement_non_confirme', async () => {
    // L'AUTRE HISSEMENT, ET C'EST UNE MUTATION DISTINCTE. Ce chemin ne
    // rétablit RIEN : son refus est sec, et le confondre avec l'autre
    // priverait l'écran du seul moyen de savoir s'il a une question à poser.
    const res = await POST(postRequest({ idPatient: 'PAT_1', action: 'lien_magique' }));
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe('portal_revoked');
  });
});
