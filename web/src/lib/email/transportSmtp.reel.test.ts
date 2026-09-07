import { describe, expect, it } from 'vitest';

import { creerTransportSmtp } from './transportSmtp';

/**
 * BANC SUR LE VRAI NODEMAILER — délibérément sans `vi.mock`.
 *
 * `transportSmtp.ts` borne les trois timeouts SMTP en les APPENDANT à l'URL de
 * connexion, et parie que nodemailer les relise depuis ses query params. Le
 * commentaire du source dit ce pari « vérifié sur la version installée » : à la
 * main, une fois. Le banc voisin (`transportSmtp.test.ts`) mocke `createTransport`
 * de bout en bout — il prouve la FORME de l'URL, et rien du fait qu'elle soit lue.
 *
 * Si un jour le parseur d'URL de nodemailer diverge, les trois bornes
 * s'évaporent EN SILENCE et un serveur SMTP qui pend rebloque une requête
 * indéfiniment sur un conteneur persistant — précisément le défaut que ce
 * fichier existe pour tuer. Ce banc est le seul endroit qui s'en aperçoive.
 *
 * Aucun réseau : `createTransport` ne fait que construire et parser.
 */
describe('creerTransportSmtp — nodemailer lit réellement les bornes de l’URL', () => {
  it('les trois timeouts arrivent parsés, en nombres, dans les options du transport', () => {
    const transport = creerTransportSmtp('smtp://user:pass@smtp.example.com:587');
    const options = (transport as unknown as { options: Record<string, unknown> }).options;

    expect(options.connectionTimeout, 'connectionTimeout non lu depuis l’URL').toBe(10_000);
    expect(options.greetingTimeout, 'greetingTimeout non lu depuis l’URL').toBe(10_000);
    expect(options.socketTimeout, 'socketTimeout non lu depuis l’URL').toBe(20_000);
  });

  it('l’hôte, le port et les identifiants traversent le parseur intacts', () => {
    const transport = creerTransportSmtp('smtp://user:pa%24%24@smtp.example.com:587');
    const options = (transport as unknown as {
      options: { host?: string; port?: number; auth?: { user?: string; pass?: string } };
    }).options;

    expect(options.host).toBe('smtp.example.com');
    expect(options.port).toBe(587);
    // Le helper appende sans round-trip `new URL` : un mot de passe à caractères
    // spéciaux ne doit pas être ré-encodé au passage.
    expect(options.auth?.user).toBe('user');
    expect(options.auth?.pass).toBe('pa$$');
  });

  it('une URL portant déjà une query garde sa query ET reçoit les bornes', () => {
    const transport = creerTransportSmtp('smtp://h.example.com:587?pool=true');
    const options = (transport as unknown as { options: Record<string, unknown> }).options;

    expect(options.pool, 'la query préexistante a été perdue').toBe(true);
    expect(options.socketTimeout).toBe(20_000);
  });
});
