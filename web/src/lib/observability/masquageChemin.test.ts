import { describe, expect, it } from 'vitest';
import { masquerChemin, masquerTransaction, masquerUrl } from './masquageChemin';

// Ce banc remplace un test qui lisait les fichiers de configuration Sentry
// comme du TEXTE et y cherchait la sous-chaîne `split('?')[0]`. Il passait au
// vert sur un fichier jamais chargé, et n'aurait rien dit d'un masquage faux :
// il prouvait qu'une ligne était écrite, pas qu'elle protégeait quoi que ce
// soit. Ici, on fait passer de vraies valeurs et on regarde ce qui ressort.

// Valeurs réalistes de ce dépôt. Aucune n'est une identité réelle.
const ID_PATIENT = 'cmf3k2p9x0000zz8h7q2v1abc';
const JETON = 'aG9yc2xhX3VuX2pldG9uX2RlX2xpZW5fbWFnaXF1ZQ';
const ID_ASSIGNATION = 'cmf3k2p9x0001zz8h4d5e6fgh';

describe('masquerChemin', () => {
  it("remplace l'identifiant patient du portail par son nom de paramètre", () => {
    expect(masquerChemin(`/portail/${ID_PATIENT}`)).toBe('/portail/:idPatient');
  });

  it("remplace l'identifiant patient du dashboard praticien", () => {
    expect(masquerChemin(`/dashboard/patients/${ID_PATIENT}`)).toBe('/dashboard/patients/:idPatient');
  });

  it('masque les DEUX identifiants d\'un chemin qui en porte deux', () => {
    expect(masquerChemin(`/portail/${ID_PATIENT}/questionnaires/${ID_ASSIGNATION}`)).toBe(
      '/portail/:idPatient/questionnaires/:idAssignation',
    );
  });

  it('MASQUE LE JETON DE LIEN MAGIQUE — un credential vivant, pas un identifiant', () => {
    const masque = masquerChemin(`/portail/lien/${JETON}`);
    expect(masque).toBe('/portail/lien/:jeton');
    expect(masque).not.toContain(JETON);
  });

  it("le segment littéral l'emporte sur le segment dynamique de même forme", () => {
    // `/portail/lien/indisponible` et `/portail/lien/:jeton` ont la même
    // longueur : si l'ordre de déclaration s'inversait, l'écran de refus
    // deviendrait indistinguable d'une tentative d'ouverture.
    expect(masquerChemin('/portail/lien/indisponible')).toBe('/portail/lien/indisponible');
  });

  it('conserve les chemins entièrement statiques, qui ne portent rien', () => {
    expect(masquerChemin('/login')).toBe('/login');
    expect(masquerChemin('/portail/connexion')).toBe('/portail/connexion');
    expect(masquerChemin('/')).toBe('/');
  });

  it('un segment attrape-tout absorbe plusieurs segments', () => {
    expect(masquerChemin('/api/auth/callback/google')).toBe('/api/auth/:...action');
    expect(masquerChemin('/api/praticien/biologie/proposition')).toBe('/api/praticien/:...action');
  });

  // ── Le repli fermé : c'est lui qui tient dans six mois ──────────────────

  it('UNE ROUTE INCONNUE EST RÉDUITE, JAMAIS RENDUE TELLE QUELLE', () => {
    // Le jour où quelqu'un ajoute `/consultations/[idPatient]` sans toucher à
    // ce module, l'identifiant ne doit pas sortir pour autant.
    const masque = masquerChemin(`/consultations/${ID_PATIENT}`);
    expect(masque).toBe('/…');
    expect(masque).not.toContain(ID_PATIENT);
  });

  it('une racine connue mais une suite inconnue ne conserve que la racine', () => {
    const masque = masquerChemin(`/portail/${ID_PATIENT}/rubrique-neuve/${ID_ASSIGNATION}`);
    expect(masque).toBe('/portail/…');
    expect(masque).not.toContain(ID_PATIENT);
    expect(masque).not.toContain(ID_ASSIGNATION);
  });

  it("AUCUNE valeur sensible ne survit, quelle que soit la forme du chemin", () => {
    // La garde qui couvre ce que les cas nommés ci-dessus oublient.
    const secrets = [ID_PATIENT, JETON, ID_ASSIGNATION, 'sophie.nicola@example.invalid'];
    const chemins = [
      `/portail/${ID_PATIENT}`,
      `/portail/lien/${JETON}`,
      `/dashboard/patients/${ID_PATIENT}`,
      `/portail/${ID_PATIENT}/questionnaires/${ID_ASSIGNATION}`,
      `/route/jamais/vue/${JETON}`,
      `/api/portail/${ID_PATIENT}/quelque-chose`,
      `/${ID_PATIENT}`,
      `/portail/sophie.nicola@example.invalid`,
    ];
    for (const chemin of chemins) {
      const masque = masquerChemin(chemin);
      for (const secret of secrets) {
        expect(masque, `« ${chemin} » a laissé passer « ${secret} »`).not.toContain(secret);
      }
    }
  });
});

describe('masquerUrl', () => {
  it('supprime la query string ET le fragment, sans condition', () => {
    expect(masquerUrl(`https://app.wellneuro.fr/portail/${ID_PATIENT}?email=x@y.z#ancre`)).toBe(
      'https://app.wellneuro.fr/portail/:idPatient',
    );
  });

  it("conserve l'origine réelle, et n'en invente pas pour une URL relative", () => {
    expect(masquerUrl('https://app.wellneuro.fr/login')).toBe('https://app.wellneuro.fr/login');
    expect(masquerUrl('/login')).toBe('/login');
  });

  it('une URL illisible rend null plutôt que de sortir telle quelle', () => {
    // Le champ se perd ; c'est le prix, et il est bon marché.
    expect(masquerUrl('http://[')).toBeNull();
  });
});

describe('masquerTransaction', () => {
  it('conserve le verbe et masque le chemin', () => {
    expect(masquerTransaction(`GET /portail/${ID_PATIENT}`)).toBe('GET /portail/:idPatient');
  });

  it('traite une valeur sans verbe comme un chemin', () => {
    expect(masquerTransaction(`/dashboard/patients/${ID_PATIENT}`)).toBe('/dashboard/patients/:idPatient');
  });

  it('laisse intact un nom de transaction qui n\'est pas un chemin', () => {
    expect(masquerTransaction('tâche de fond : purge des liens')).toBe('tâche de fond : purge des liens');
  });
});
