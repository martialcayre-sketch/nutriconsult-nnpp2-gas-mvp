import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */

// En-têtes appliqués à toutes les réponses. `Referrer-Policy: no-referrer` est
// le plus structurant des six : le lien portail porte le jeton d'accès dans son
// chemin (`/portail/<jeton>`), et sans cet en-tête ce jeton part dans le
// `Referer` de la moindre ressource externe chargée par la page.
const enTetesSecurite = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  // Doublon volontaire : `frame-ancestors` fait autorité sur les navigateurs
  // récents, `X-Frame-Options` couvre les plus anciens. Sans eux, le dashboard
  // praticien est encadrable en iframe (clickjacking sur les actions fermes).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

// Le portail patient s'ouvre sur un lien à jeton : si un tel lien fuite vers un
// crawler, la page ne doit pas finir indexée. L'en-tête couvre aussi
// `/patient/:path*`, où il ne reste plus qu'une redirection (voir plus bas) —
// c'est elle qu'un crawler rencontrerait en suivant un ancien lien e-mail.
const enTetesSansIndexation = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }];

const nextConfig = {
  reactStrictMode: true,
  // Parcours patient unique : toute navigation vers l'ancienne URL
  // `/patient/[idAssignation]` est renvoyée sur l'entrée du portail.
  //
  // **Le répertoire `src/app/patient/` a été SUPPRIMÉ le 2026-08-08** (dette 5,
  // LOT-01). Cette redirection n'est donc plus une convergence entre deux
  // parcours vivants : elle est le seul reste du parcours legacy, et elle
  // existe pour les liens e-mail déjà partis chez des patients. La retirer
  // ferait tomber ces liens en 404 au lieu de les ramener au portail.
  //
  // 307 (`permanent: false`) et pas 308 : un 308 est mis en cache durablement
  // par les navigateurs et les intermédiaires, et resterait actif sur les
  // postes patients sans aucun moyen de le rappeler. Le coût d'un 307 est un
  // aller-retour de plus ; celui d'un 308 mal placé est irrattrapable.
  //
  // Aucun email n'est transmis en query string vers `/portail/connexion` :
  // l'adresse du patient est une donnée de santé indirecte, et une redirection
  // la déposerait dans les journaux serveur, l'historique du navigateur et les
  // barres d'URL partagées. `/portail/connexion` redemande l'adresse — c'est le
  // coût assumé d'une reprise sans fuite.
  //
  // LA REDIRECTION N'EST PLUS ICI — elle vit dans `web/src/middleware.ts`, et
  // ce déplacement est ce qui rend vrai le paragraphe ci-dessus.
  //
  // Deux faits mesurés le 2026-08-08, aucun des deux documenté jusque-là :
  //
  // 1. **Un `redirects()` recopie la query string d'origine dans la
  //    destination**, et rien de déclaratif ne l'en empêche — une query portée
  //    par la destination est *fusionnée*, pas substituée
  //    (`/patient/ASS_x?email=…` rendait `/portail/connexion?email=…`, puis
  //    `?email=…&depuis=lien-ancien` à l'essai suivant). La phrase « aucun
  //    email n'est transmis en query string » était donc juste sur l'intention
  //    et fausse sur le fait depuis le 2026-08-05 (LOT-04) ; rien ne
  //    l'éprouvait.
  // 2. **`redirects()` s'exécute AVANT le middleware.** Le garder « en filet »
  //    ne coûtait pas seulement un doublon : il gagnait la course et
  //    neutralisait entièrement le middleware. Un filet placé en amont n'est
  //    pas un filet, c'est le chemin réel.
  //
  // Contrepartie assumée : plus de repli déclaratif. Si le middleware disparaît
  // ou que son `matcher` dérive, un ancien lien tombe en 404 au lieu d'atterrir
  // sur le portail. C'est ce que `e2e/parcours-legacy-redirection.spec.ts`
  // surveille, sur les deux navigateurs.
  // LES DEUX SOUS-VUES PLEINE PAGE DU DOSSIER ONT ÉTÉ RETIRÉES le 2026-09-03.
  // Elles rendaient exactement les composants que les onglets de la fiche
  // montent déjà, et la refonte UX 5.0 (2026-07-19) les avait explicitement
  // remplacées par ces onglets — elles ont survécu à leur propre remplacement,
  // sans qu'aucun lien de l'application n'y mène plus.
  //
  // LA REDIRECTION N'EST PAS UNE COURTOISIE POUR LES FAVORIS, elle referme une
  // exposition. Le dossier `[idPatient]` pose `key={params.idPatient}` sur la
  // fiche ([[D-072]] §4) pour qu'un changement de patient DÉMONTE l'arbre au
  // lieu de le réconcilier. Les deux routes retirées vivaient sous ce dossier
  // sans aucune `key` : `PractitionerFoodObservationPanel` sème quatre morceaux
  // de la décision du praticien (traces, mode, assiette, note) depuis un
  // initialiseur paresseux de `useState`, qui ne s'exécute qu'AU MONTAGE. Passer
  // de l'URL d'un patient à celle d'un autre y laissait donc le brouillon du
  // premier sous le nom du second, sans état de chargement pour le masquer.
  // Renvoyer vers la fiche fait repasser ces adresses par la page gardée.
  //
  // 307 et non 308, comme pour `/patient/` plus haut et pour la même raison : un
  // 308 se met en cache durablement chez le praticien et ne se rappelle pas.
  //
  // Déclaratif ici SANS contredire la leçon du bloc précédent : ce qui avait
  // chassé `redirects()` vers le middleware, c'était la recopie de la query
  // string d'origine — l'e-mail du patient s'y déposait. Ces deux chemins-ci ne
  // portent aucune donnée : la fusion de query est sans effet, et rien dans le
  // middleware (`matcher: '/patient/:path*'`) n'entre en concurrence.
  async redirects() {
    return [
      {
        source: '/dashboard/patients/:idPatient/besoins',
        destination: '/dashboard/patients/:idPatient?onglet=besoins',
        permanent: false,
      },
      {
        source: '/dashboard/patients/:idPatient/alimentation',
        destination: '/dashboard/patients/:idPatient?onglet=alimentation',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: enTetesSecurite },
      { source: '/portail/:path*', headers: enTetesSansIndexation },
      // Conservé après la suppression du répertoire, mais SANS l'effet qu'on
      // lui prêtait : Next n'applique pas ces en-têtes à la réponse 307 d'un
      // `redirects()` — mesuré, `X-Robots-Tag` y est absent. Ce qui protège
      // réellement, c'est que la destination `/portail/:path*` les porte, et
      // c'est cette page-là qu'un crawler indexerait. L'entrée reste pour le
      // jour où une route servirait de nouveau sous `/patient/`.
      { source: '/patient/:path*', headers: enTetesSansIndexation },
    ];
  },
};

// L'ENVELOPPE SENTRY MANQUAIT, ET SON ABSENCE NE SE VOYAIT PAS. Sans elle, le
// plugin ne s'installe pas : ni instrumentation du build, ni cartes de source,
// ni `onRequestError` correctement relié. Trois fichiers de configuration
// existaient dans ce dépôt et n'étaient chargés par personne.
//
// LES CARTES DE SOURCE NE PARTENT QUE SI LES TROIS VARIABLES SONT POSÉES.
// Sinon `sourcemaps.disable` coupe l'envoi : le build reste vert et local, et
// aucune source de l'application ne part chez un tiers par accident.
const televersementCartes = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Le plugin remonte des statistiques de build à Sentry par défaut. Sur une
  // application de santé, rien ne part qui n'ait été décidé.
  telemetry: false,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // `disableLogger` est déprécié en 10.x — le build le dit lui-même. Le
  // remplaçant vit sous `webpack.treeshake`.
  webpack: { treeshake: { removeDebugLogging: true } },
  sourcemaps: {
    disable: !televersementCartes,
    // Une carte de source téléversée ne doit pas rester servie publiquement :
    // elle rendrait le code source de l'application téléchargeable.
    deleteSourcemapsAfterUpload: televersementCartes,
  },
});
