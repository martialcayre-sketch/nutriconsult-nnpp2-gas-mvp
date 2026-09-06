import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma, verifierAppartenancePatient } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    patient: { findUnique: vi.fn(), update: vi.fn() },
    portailMagicLink: { updateMany: vi.fn() },
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
vi.mock('@/lib/consultation/email', () => ({
  buildGoogleConnexionUrl: () => 'https://app.wellneuro.fr/portail/google',
  buildMagicLinkUrl: (jeton: string) => `https://app.wellneuro.fr/portail/lien/${jeton}`,
  sendMagicLinkEmail: vi.fn(),
  sendPortailLinkEmail: vi.fn(),
}));

import { sendPortailLinkEmail } from '@/lib/consultation/email';
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

    await POST(postRequest({ idPatient: 'PAT_1', action: 'issue' }));

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
