import { afterEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn().mockResolvedValue({});
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

import { sendMagicLinkEmail, sendPortailLinkEmail } from './email';

describe('sendPortailLinkEmail', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    sendMail.mockClear();
  });

  it('pointe la page de connexion, jamais un lien permanent secret (LOT-04)', async () => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';

    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST');

    expect(sendMail).toHaveBeenCalledOnce();
    const { text } = sendMail.mock.calls[0][0];
    expect(text).toContain('https://app.wellneuro.fr/portail/connexion');
    // Plus de jeton secret ni de promesse de permanence dans le corps.
    expect(text).not.toContain('/portail/TOK');
    expect(text).not.toContain('personnel et permanent');
    // Les deux voies d'entrée restantes sont annoncées.
    expect(text).toContain('Google');
    // Audit HDS : aucune donnée clinique dans le corps.
    expect(text).not.toContain('Motif');
  });

  it('pose le praticien du dossier en Reply-To — sans quoi la réponse vise noreply@', async () => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';

    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST', 'praticien@wellneuro.fr');

    const { from, replyTo } = sendMail.mock.calls[0][0];
    // L'expéditeur ne bouge pas : c'est le canal de service, et le SPF du
    // domaine est aligné sur lui. Seule la réponse change de destination.
    expect(from).toBe('"Wellneuro" <noreply@wellneuro.fr>');
    expect(replyTo).toBe('praticien@wellneuro.fr');
  });

  it("sans adresse de praticien, l'en-tête est absent — pas vide", async () => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';

    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST');

    expect('replyTo' in sendMail.mock.calls[0][0]).toBe(false);
  });

  it('une adresse malformée est écartée, et le message part quand même', async () => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';

    // Retour à la ligne : la forme même d'une injection d'en-tête.
    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST', 'p@wellneuro.fr\nBcc: tiers@example.com');

    expect(sendMail).toHaveBeenCalledOnce();
    expect('replyTo' in sendMail.mock.calls[0][0]).toBe(false);
  });

  it('une adresse démesurée est écartée — la ligne d’en-tête ne doit pas violer RFC 5321', async () => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';

    const trop = `${'p'.repeat(250)}@wellneuro.fr`; // 263 caractères
    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST', trop);

    expect(sendMail).toHaveBeenCalledOnce();
    expect('replyTo' in sendMail.mock.calls[0][0]).toBe(false);
  });

  it("n'envoie rien sans SMTP_URL configuré", async () => {
    delete process.env.SMTP_URL;

    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST');

    expect(sendMail).not.toHaveBeenCalled();
  });

  // A05 — CE QUE LA FONCTION REND, pas seulement ce qu'elle envoie. Tant
  // qu'elle rendait `void`, les trois `catch` des routes ne pouvaient pas
  // distinguer « parti », « pas configuré » et « échoué » : l'écran annonçait
  // « envoyé » dans les trois cas.
  it('rend « Envoye » quand le message part', async () => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';
    await expect(sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST')).resolves.toBe('Envoye');
  });

  it('rend « Non_envoye » sans messagerie configurée, sans rien tenter', async () => {
    delete process.env.SMTP_URL;
    await expect(sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST')).resolves.toBe('Non_envoye');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('RELANCE sur échec SMTP — elle ne rend pas un statut', async () => {
    // La distinction porte tout le correctif : `Non_envoye` se REND (l'appelant
    // en fait « non_configure »), l'échec se RELANCE (l'appelant en fait
    // « echoue » dans son `catch`). Les confondre rendrait un envoi mort
    // indistinguable d'une messagerie absente.
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST')).rejects.toThrow('smtp down');
  });
});

describe('sendMagicLinkEmail — même contrat de retour', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    sendMail.mockClear();
  });

  it('rend « Envoye » quand le message part', async () => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';
    await expect(
      sendMagicLinkEmail('patient@example.com', 'Michel', 'https://app.wellneuro.fr/portail/lien/JETON', 'PAT_TEST'),
    ).resolves.toBe('Envoye');
  });

  it('rend « Non_envoye » sans messagerie configurée', async () => {
    delete process.env.SMTP_URL;
    await expect(
      sendMagicLinkEmail('patient@example.com', 'Michel', 'https://app.wellneuro.fr/portail/lien/JETON', 'PAT_TEST'),
    ).resolves.toBe('Non_envoye');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
