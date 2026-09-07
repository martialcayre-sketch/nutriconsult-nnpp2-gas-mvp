import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn().mockResolvedValue({});
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

// MOCK PARTIEL, ET C'EST OBLIGATOIRE : `email.ts` importe aussi
// `TYPES_CORRESPONDANCE_PATIENT` de ce module. Un factory complet le priverait
// de la constante, et la levée tomberait dans le `try/catch` non bloquant de la
// traçabilité — le banc mesurerait alors une absence.
const { journaliser } = vi.hoisted(() => ({ journaliser: vi.fn() }));
vi.mock('@/lib/correspondance/patient', async orig => ({
  ...(await orig<typeof import('@/lib/correspondance/patient')>()),
  journaliserCorrespondancePatient: journaliser,
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

describe('sendPortailLinkEmail — le lien qui ouvre, quand il existe', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.SMTP_URL = 'smtp://localhost:1025';
    process.env.NEXTAUTH_URL = 'https://app.wellneuro.fr';
  });

  afterEach(() => {
    process.env = { ...env };
    sendMail.mockClear();
    journaliser.mockClear();
  });

  it('SANS lien : l’e-mail est exactement celui d’avant', async () => {
    // L'INERTIE DRAPEAU ÉTEINT, prouvée ici et pas seulement annoncée. Le
    // module d'émission rend `null` quand le drapeau est absent, et ce chemin
    // doit alors servir le gabarit validé, sans une once de lien magique.
    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST');
    const { text } = sendMail.mock.calls[0][0];
    expect(text).toContain('https://app.wellneuro.fr/portail/connexion');
    expect(text).not.toContain('/portail/lien/');
    // ASSERTION SUR LA SUBSTANCE, ET PAS SEULEMENT SUR L'ABSENCE D'UNE URL.
    // `rendreGabarit` ne lève que si le nom est ABSENT de l'objet de variables
    // (`!(nom in vars)`), pas s'il vaut `undefined` : servir le gabarit à lien
    // de façon inconditionnelle substituerait la chaîne « undefined » sans
    // rien casser, et un banc qui ne surveille que `/portail/lien/` laisserait
    // partir aux patients un e-mail disant « ouvrez ce lien : undefined ».
    expect(text).not.toContain('Pour entrer directement');
    expect(text).not.toContain('undefined');
    expect(text).toContain('Votre page d’accès :');
    // Le bloc anti-hameçonnage du seul gabarit validé du registre.
    expect(text).toContain('coordonnées bancaires');
  });

  it('AVEC lien : les deux adresses, et rien de perdu', async () => {
    // UN SEUL E-MAIL, DEUX ADRESSES. Le lien à usage unique pour entrer tout de
    // suite ; la page durable en dessous pour tous les autres jours — un lien
    // magique meurt en 24 h, et l'e-mail de premier contact peut s'ouvrir le
    // lendemain.
    await sendPortailLinkEmail(
      'patient@example.com',
      'Michel',
      'PAT_TEST',
      'praticien@wellneuro.fr',
      'https://app.wellneuro.fr/portail/lien/JETON',
    );
    const envoi = sendMail.mock.calls[0][0];
    expect(envoi.text).toContain('https://app.wellneuro.fr/portail/lien/JETON');
    expect(envoi.text).toContain('https://app.wellneuro.fr/portail/connexion');
    expect(envoi.text).toContain('coordonnées bancaires');
    // Ni le sujet ni le Reply-To ne bougent : c'est le même e-mail, augmenté.
    expect(envoi.subject).toBe('Votre espace de suivi — Martial Cayre (Wellneuro)');
    expect(envoi.replyTo).toBe('praticien@wellneuro.fr');
  });

  it('le TYPE journalisé reste « acces_portail », avec lien comme sans', async () => {
    // LA GARDE DE L'ENCART DES DOSSIERS NEUFS. Il interroge ce type pour savoir
    // si l'e-mail d'accès est parti : le basculer sur `lien_magique` ferait
    // rester chaque dossier neuf en « Accès non envoyé » après un envoi réussi.
    await sendPortailLinkEmail('patient@example.com', 'Michel', 'PAT_TEST');
    await sendPortailLinkEmail(
      'patient@example.com',
      'Michel',
      'PAT_TEST',
      undefined,
      'https://app.wellneuro.fr/portail/lien/JETON',
    );
    const types = journaliser.mock.calls.map(c => (c[0] as { type: string }).type);
    expect(types).toEqual(['acces_portail', 'acces_portail']);
  });
});
