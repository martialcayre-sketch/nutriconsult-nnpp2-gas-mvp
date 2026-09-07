import { masquerChemin, masquerTransaction, masquerUrl } from './masquageChemin';

// LE `beforeSend` PARTAGÉ PAR LES TROIS RUNTIMES.
//
// Il existait avant ce fichier, recopié à l'identique dans les trois
// configurations, et il ne faisait que trois `delete` plus une coupe de query
// string. Trois raisons de le refaire ici :
//
// 1. Le chemin d'URL n'était PAS masqué — `/portail/<idPatient>` et
//    `/portail/lien/<jeton>` partaient entiers (voir `masquageChemin.ts`).
// 2. `event.request` n'est pas le seul canal. Un fil d'Ariane `fetch` porte
//    l'URL appelée ; un fil `console` porte les arguments d'un `console.log` ;
//    `event.transaction` porte la route ; `event.request.query_string` et
//    `.env` sont des champs distincts de ceux qui étaient supprimés.
// 3. Trois copies dérivent. Une seule fonction, testée sur de vrais objets
//    d'événement, ne dérive pas.

/**
 * Adresses e-mail dans un texte libre. Le portail patient est indexé par
 * e-mail : c'est l'identité la plus probable dans un message d'erreur, et la
 * seule que l'on sache reconnaître sans deviner. Le reste — un nom, un
 * identifiant interpolé dans un `throw` — n'est pas reconnaissable de
 * l'extérieur, et c'est pourquoi le nettoyage NE SUFFIT PAS à lui seul : il
 * complète `sendDefaultPii: false` et la discipline des messages d'erreur, il
 * ne s'y substitue pas.
 */
const MOTIF_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Une longue suite opaque : identifiant `cuid` (25 caractères), jeton de lien
 * magique en base64url, empreinte. C'est la forme des credentials et des
 * identifiants de ce dépôt, et un message d'erreur en interpole facilement un
 * — « jeton <valeur> déjà consommé ».
 *
 * Le seuil de 24 est choisi pour passer SOUS les identifiants (`cuid` en fait
 * 25) et AU-DESSUS des mots de la langue et des noms de symboles courants. Il
 * caviarde donc parfois de trop : une empreinte de build, un nom minifié. On
 * préfère perdre un indice de diagnostic à laisser sortir une clé d'entrée.
 */
const MOTIF_OPAQUE = /\b[A-Za-z0-9_-]{24,}\b/g;

function caviarderTexte(texte: string): string {
  return texte
    .replace(MOTIF_EMAIL, '[email caviardé]')
    .replace(MOTIF_OPAQUE, '[valeur caviardée]');
}

type FilDAriane = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

type EvenementSentry = {
  request?: {
    url?: string;
    cookies?: unknown;
    headers?: unknown;
    data?: unknown;
    query_string?: unknown;
    env?: unknown;
  };
  transaction?: string;
  user?: unknown;
  breadcrumbs?: FilDAriane[];
  message?: string;
  exception?: { values?: { value?: string }[] };
};

/**
 * Nettoie un événement avant son départ. Rendre `null` l'annule entièrement.
 *
 * La fonction MUTE l'objet reçu — c'est le contrat qu'attend Sentry, qui
 * réutilise l'événement rendu.
 */
export function nettoyerEvenement<T extends EvenementSentry>(evenement: T): T | null {
  if (evenement.request) {
    const requete = evenement.request;
    // Quatre champs, pas trois : `query_string` et `env` sont distincts de
    // `data` et n'étaient pas touchés.
    delete requete.cookies;
    delete requete.headers;
    delete requete.data;
    delete requete.query_string;
    delete requete.env;

    if (typeof requete.url === 'string') {
      const masquee = masquerUrl(requete.url);
      // `masquerUrl` rend `null` sur une URL illisible : on retire le champ
      // plutôt que de laisser passer ce qu'on n'a pas su analyser.
      if (masquee === null) delete requete.url;
      else requete.url = masquee;
    }
  }

  if (typeof evenement.transaction === 'string') {
    evenement.transaction = masquerTransaction(evenement.transaction);
  }

  // `sendDefaultPii: false` empêche déjà Sentry de renseigner l'IP et
  // l'identité ; le champ est vidé quand même, parce qu'un appel applicatif à
  // `setUser` le remplirait sans que l'option y change rien.
  delete evenement.user;

  if (Array.isArray(evenement.breadcrumbs)) {
    evenement.breadcrumbs = evenement.breadcrumbs
      // UN FIL `console` EST SUPPRIMÉ, JAMAIS NETTOYÉ. Il porte les arguments
      // d'un `console.log` quelconque : sa forme est inconnue, donc son
      // nettoyage est indécidable. Le supprimer coûte du confort de
      // diagnostic ; le garder coûterait ce que le développeur y a mis.
      .filter(fil => fil.category !== 'console')
      .map(fil => {
        // UN FIL `ui.click` OU `ui.keypress` PORTE LE SÉLECTEUR DOM de l'élément
        // touché — c'est-à-dire, dans cette application, un `aria-label` en
        // français écrit pour être lu par un patient (« Ouvrir le bilan de
        // Sophie Nicola »). Le caviardage ne sait pas y reconnaître un nom.
        if (fil.category?.startsWith('ui.')) delete fil.message;
        else if (typeof fil.message === 'string') fil.message = caviarderTexte(fil.message);
        const url = fil.data?.url;
        if (typeof url === 'string') {
          const masquee = masquerUrl(url);
          if (masquee === null) delete fil.data?.url;
          else if (fil.data) fil.data.url = masquee;
        }
        // Le fil de navigation porte les chemins dans `from` et `to`.
        for (const cle of ['from', 'to'] as const) {
          const valeur = fil.data?.[cle];
          if (typeof valeur === 'string' && fil.data) fil.data[cle] = masquerChemin(valeur);
        }
        return fil;
      });
  }

  if (typeof evenement.message === 'string') {
    evenement.message = caviarderTexte(evenement.message);
  }

  for (const valeur of evenement.exception?.values ?? []) {
    if (typeof valeur.value === 'string') valeur.value = caviarderTexte(valeur.value);
  }

  return evenement;
}

/**
 * LE MÊME NETTOYAGE, POUR LES TRANSACTIONS — ET C'EST UN CANAL DISTINCT.
 *
 * `beforeSend` ne voit QUE les événements d'erreur. Avec `tracesSampleRate` à
 * 0,1, une requête sur dix produit une transaction **même quand rien
 * n'échoue**, et elle porte `transaction` (« GET /portail/<idPatient> ») et
 * `request.url` sans passer par le crochet précédent. Un nettoyage qui ne
 * couvre que les erreurs laisse donc sortir, en régime normal, ce qu'il
 * interdit en régime d'incident.
 */
export const nettoyerTransaction = nettoyerEvenement;

type Span = {
  description?: string;
  data?: Record<string, unknown>;
};

/**
 * Les attributs d'un span portent l'URL appelée (`http.url`, `url.path`,
 * `url.full`) et sa description est souvent « GET /portail/<id> ». Les clés
 * sont normalisées par la convention OpenTelemetry, donc énumérables ; toute
 * autre valeur de chaîne est caviardée par prudence.
 */
const CLES_URL = ['http.url', 'url', 'url.full', 'url.path', 'http.route', 'server.address'];

export function nettoyerSpan<T extends Span>(span: T): T {
  if (typeof span.description === 'string') {
    span.description = masquerTransaction(span.description);
  }
  if (span.data) {
    for (const cle of CLES_URL) {
      const valeur = span.data[cle];
      if (typeof valeur !== 'string') continue;
      const masquee = masquerUrl(valeur);
      if (masquee === null) delete span.data[cle];
      else span.data[cle] = masquee;
    }
    // Le reste des attributs n'a pas de forme connue : on caviarde ce qui est
    // reconnaissable plutôt que de faire confiance à la convention.
    for (const [cle, valeur] of Object.entries(span.data)) {
      if (typeof valeur === 'string' && !CLES_URL.includes(cle)) {
        span.data[cle] = caviarderTexte(valeur);
      }
    }
  }
  return span;
}
