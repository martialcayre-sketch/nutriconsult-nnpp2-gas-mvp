import { describe, expect, it } from 'vitest';
import { nettoyerEvenement, nettoyerSpan, nettoyerTransaction } from './sentryNettoyage';

const ID_PATIENT = 'cmf3k2p9x0000zz8h7q2v1abc';
const JETON = 'aG9yc2xhX3VuX2pldG9uX2RlX2xpZW5fbWFnaXF1ZQ';
const EMAIL = 'sophie.nicola@example.invalid';

// On fait passer de VRAIS objets d'événement, de la forme que Sentry construit,
// et on regarde ce qui ressort. Le banc précédent lisait les fichiers de
// configuration comme du texte : il ne pouvait rien dire de ce qui part.

describe('nettoyerEvenement', () => {
  it('masque le chemin de la requête, pas seulement sa query string', () => {
    const evenement = nettoyerEvenement({
      request: { url: `https://app.wellneuro.fr/portail/${ID_PATIENT}?email=${EMAIL}` },
    });
    expect(evenement?.request?.url).toBe('https://app.wellneuro.fr/portail/:idPatient');
  });

  it('supprime les cinq champs de requête, dont query_string et env', () => {
    const evenement = nettoyerEvenement({
      request: {
        url: 'https://app.wellneuro.fr/login',
        cookies: { wn_portail: 'secret' },
        headers: { authorization: 'Bearer x' },
        data: { email: EMAIL },
        query_string: `email=${EMAIL}`,
        env: { SERVER_NAME: 'wellneuro' },
      },
    });
    expect(evenement?.request).toEqual({ url: 'https://app.wellneuro.fr/login' });
  });

  it('masque le nom de transaction', () => {
    const evenement = nettoyerEvenement({ transaction: `GET /dashboard/patients/${ID_PATIENT}` });
    expect(evenement?.transaction).toBe('GET /dashboard/patients/:idPatient');
  });

  it('vide event.user même si un appel applicatif l\'a rempli', () => {
    // `sendDefaultPii: false` ne couvre pas un `Sentry.setUser` explicite.
    const evenement = nettoyerEvenement({ user: { id: ID_PATIENT, email: EMAIL } });
    expect(evenement?.user).toBeUndefined();
  });

  it('SUPPRIME les fils console, sans tenter de les nettoyer', () => {
    const evenement = nettoyerEvenement({
      breadcrumbs: [
        { category: 'console', message: `réponse patient ${EMAIL}` },
        { category: 'navigation', message: 'ok' },
      ],
    });
    expect(evenement?.breadcrumbs).toHaveLength(1);
    expect(evenement?.breadcrumbs?.[0].category).toBe('navigation');
  });

  it("masque l'URL d'un fil fetch et les chemins d'un fil navigation", () => {
    const evenement = nettoyerEvenement({
      breadcrumbs: [
        { category: 'fetch', data: { url: `https://app.wellneuro.fr/api/portail/x/${ID_PATIENT}` } },
        { category: 'navigation', data: { from: `/portail/${ID_PATIENT}`, to: `/portail/lien/${JETON}` } },
      ],
    });
    const [fetchFil, navFil] = evenement!.breadcrumbs!;
    expect(String(fetchFil.data?.url)).not.toContain(ID_PATIENT);
    expect(navFil.data?.from).toBe('/portail/:idPatient');
    expect(navFil.data?.to).toBe('/portail/lien/:jeton');
  });

  it('caviarde les e-mails du message et des exceptions', () => {
    const evenement = nettoyerEvenement({
      message: `échec d'envoi vers ${EMAIL}`,
      exception: { values: [{ value: `Patient introuvable : ${EMAIL}` }] },
    });
    expect(evenement?.message).toBe("échec d'envoi vers [email caviardé]");
    expect(evenement?.exception?.values?.[0].value).toBe('Patient introuvable : [email caviardé]');
  });

  it("AUCUN secret ne survit à un événement réaliste complet", () => {
    // La garde d'ensemble : elle attrape ce que les cas nommés oublient.
    const evenement = nettoyerEvenement({
      request: {
        url: `https://app.wellneuro.fr/portail/lien/${JETON}?email=${EMAIL}`,
        cookies: { wn_portail: 'signe.abc' },
        headers: { cookie: 'wn_portail=signe.abc' },
        query_string: `email=${EMAIL}`,
      },
      transaction: `GET /portail/${ID_PATIENT}`,
      user: { id: ID_PATIENT, email: EMAIL, ip_address: '203.0.113.7' },
      breadcrumbs: [
        { category: 'console', message: `dossier ${ID_PATIENT}` },
        { category: 'fetch', data: { url: `/api/patient/submit?token=${JETON}` } },
        { category: 'navigation', data: { from: `/portail/${ID_PATIENT}`, to: '/portail/connexion' } },
      ],
      message: `lien consommé pour ${EMAIL}`,
      exception: { values: [{ value: `jeton ${JETON} déjà consommé` }] },
    });

    const rendu = JSON.stringify(evenement);
    expect(rendu).not.toContain('signe.abc');
    expect(rendu).not.toContain(EMAIL);
    expect(rendu).not.toContain('203.0.113.7');
    // Y COMPRIS DANS LE TEXTE LIBRE : « jeton <valeur> déjà consommé » est une
    // phrase que l'application peut écrire, et le jeton y est un credential.
    expect(rendu).not.toContain(JETON);
    expect(rendu).not.toContain(ID_PATIENT);
    expect(evenement?.request?.url).toBe('https://app.wellneuro.fr/portail/lien/:jeton');
    expect(evenement?.transaction).toBe('GET /portail/:idPatient');
    expect(evenement?.breadcrumbs?.every(f => f.category !== 'console')).toBe(true);
  });

  it("SUPPRIME le message d'un fil ui.*, qui porte un aria-label écrit pour un patient", () => {
    const evenement = nettoyerEvenement({
      breadcrumbs: [
        { category: 'ui.click', message: 'button[aria-label="Ouvrir le bilan de Sophie Nicola"]' },
        { category: 'ui.keypress', message: 'input[value="motif de consultation"]' },
      ],
    });
    expect(evenement?.breadcrumbs).toHaveLength(2);
    for (const fil of evenement!.breadcrumbs!) expect(fil.message).toBeUndefined();
  });
});

describe('nettoyerTransaction — le canal que beforeSend ne voit pas', () => {
  it('masque la route d\'une transaction émise SANS erreur', () => {
    // À `tracesSampleRate` 0,1, une requête sur dix produit ceci en régime
    // normal. `beforeSend` ne s'y applique pas.
    const transaction = nettoyerTransaction({
      transaction: `GET /portail/${ID_PATIENT}`,
      request: { url: `https://app.wellneuro.fr/portail/${ID_PATIENT}/bilan` },
    });
    expect(transaction?.transaction).toBe('GET /portail/:idPatient');
    expect(transaction?.request?.url).toBe('https://app.wellneuro.fr/portail/:idPatient/bilan');
  });
});

describe('nettoyerSpan', () => {
  it('masque la description et les attributs d\'URL', () => {
    const span = nettoyerSpan({
      description: `GET /portail/lien/${JETON}`,
      data: {
        'http.url': `https://app.wellneuro.fr/portail/lien/${JETON}`,
        'url.path': `/dashboard/patients/${ID_PATIENT}`,
      },
    });
    expect(span.description).toBe('GET /portail/lien/:jeton');
    expect(span.data?.['http.url']).toBe('https://app.wellneuro.fr/portail/lien/:jeton');
    expect(span.data?.['url.path']).toBe('/dashboard/patients/:idPatient');
  });

  it('caviarde les attributs de forme inconnue plutôt que de leur faire confiance', () => {
    const span = nettoyerSpan({
      data: { 'db.statement': `SELECT * FROM patients WHERE email = '${EMAIL}'`, 'db.rows': 3 },
    });
    expect(span.data?.['db.statement']).toBe("SELECT * FROM patients WHERE email = '[email caviardé]'");
    // Ce qui n'est pas une chaîne n'est pas touché.
    expect(span.data?.['db.rows']).toBe(3);
  });

  it("AUCUN identifiant ne survit à un span, quelle que soit la clé", () => {
    const span = nettoyerSpan({
      description: `GET /portail/${ID_PATIENT}`,
      data: { 'http.url': `/portail/lien/${JETON}`, 'cle.inconnue': `dossier ${ID_PATIENT}` },
    });
    const rendu = JSON.stringify(span);
    expect(rendu).not.toContain(ID_PATIENT);
    expect(rendu).not.toContain(JETON);
  });
});
