### Ajouté

- **Sentry est câblé** (`A08` de l'audit du 2026-09-06). La dépendance
  `@sentry/nextjs` était installée depuis juillet, trois fichiers de
  configuration existaient — et le SDK n'était **initialisé nulle part** :
  `withSentryConfig` était absent de `next.config.mjs` et `instrumentation.ts`
  n'importait aucun de ces fichiers. Une dépendance présente et un test vert ne
  démontrent pas qu'une alerte arrive.
- **La transmission est conditionnée à `SENTRY_DSN` dans notre code**, alors
  que `Sentry.init` sans DSN est déjà inerte. Le doublon est délibéré : sur une
  application de santé, ce qui déclenche un envoi vers un tiers doit se lire
  dans le dépôt, pas se déduire du comportement d'un SDK. **Ce changement
  n'active rien** — il rend l'activation possible.
- `instrumentation.ts` initialise Sentry **par runtime**, avant de poser ses
  handlers de process, et la garde qui réserve ces handlers au runtime Node est
  préservée : la branche edge charge sa configuration puis sort sans rien poser.
- `onRequestError` (Next 15) est exporté : sans lui, une erreur de composant
  serveur ou de route handler n'atteint jamais Sentry, et le tableau de bord
  reste vide en donnant l'impression que tout va bien.

### Sécurité

- **Le nettoyage ne coupait que la query string ; il coupe désormais le
  chemin.** `event.request.url.split('?')[0]` conservait `/portail/<idPatient>`,
  `/dashboard/patients/<idPatient>` et surtout `/portail/lien/<jeton>` — le lien
  magique lui-même. Un jeton de lien magique déposé chez un tiers n'est pas une
  fuite de donnée, c'est une prise de compte.
- `masquageChemin.ts` procède par **liste d'autorisation** : une route inconnue
  est réduite (`/portail/…`, ou `/…` si même la racine est inconnue), jamais
  rendue telle quelle. Une liste d'interdiction aurait été fausse le jour où
  quelqu'un ajoute une route, et personne ne s'en serait aperçu.
- `sentryNettoyage.ts` ferme quatre canaux que les trois `beforeSend` recopiés
  laissaient ouverts : `request.query_string` et `request.env` (distincts de
  `.data`), le nom de transaction, `event.user` (qu'un `setUser` applicatif
  remplirait malgré `sendDefaultPii: false`), et les fils d'Ariane — les fils
  `console` sont **supprimés** et non nettoyés, leur forme étant inconnue donc
  leur nettoyage indécidable.
- **`beforeSend` ne voit QUE les erreurs — le régime normal fuyait.** À
  `tracesSampleRate` 0,1, une requête sur dix produit une transaction sans
  qu'aucune erreur ne survienne, et elle porte la route et l'URL. Trouvé par la
  contre-épreuve, pas par l'écriture initiale : `beforeSendTransaction` et
  `beforeSendSpan` sont posés dans les trois runtimes, et un banc les fait
  tourner plutôt que de vérifier leur présence.
- Les fils d'Ariane `ui.click` et `ui.keypress` perdent leur message : il porte
  le sélecteur DOM de l'élément touché, c'est-à-dire un `aria-label` français
  écrit pour être lu par un patient.
- `global-error.tsx` appelle enfin `Sentry.captureException`. Sans lui, cet
  écran s'affichait pour une personne suivie **sans que personne ne l'apprenne**,
  et le `digest` proposé en référence n'est posé que par le rendu serveur — une
  erreur de navigateur, le cas dominant sur le portail, n'en portait aucun.
- Les e-mails et les suites opaques de 24 caractères ou plus (identifiants
  `cuid`, jetons, empreintes) sont caviardés dans les textes libres : un message
  d'erreur écrit « jeton <valeur> déjà consommé » sans y penser.
- Le rejeu de session reste à zéro sur les deux taux — il filmerait l'écran du
  patient. Ce n'est pas un défaut qu'on aurait omis de relever.
- Les cartes de source ne partent que si `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` et
  `SENTRY_PROJECT` sont tous les trois posés, et sont supprimées après envoi ;
  la télémétrie de build du plugin est coupée.

### Corrigé

- `sentry.client.config.ts` devient `instrumentation-client.ts`. Le paquet le
  réclame lui-même à la compilation : l'ancien nom est déprécié et **cessera de
  fonctionner sous Turbopack**. Le découvrir au premier build Turbopack aurait
  coûté une observabilité client muette, sans erreur.
- **Le test qui « prouvait » le nettoyage lisait les fichiers comme du texte**
  et y cherchait la sous-chaîne `split('?')[0]`. Il passait au vert sur des
  fichiers que personne ne chargeait, et n'aurait rien dit d'un masquage faux.
  Remplacé par quatre bancs qui font passer de vrais objets — événements,
  transactions, spans — et qui, pour les trois configurations, **exécutent** les
  crochets récupérés sur un `Sentry.init` moqué. Quatre mutants constatés
  rouges, dont le débranchement de `beforeSendTransaction`.
- **La liste d'autorisation est désormais surveillée.**
  `masquageChemin.routes.test.ts` parcourt `web/src/app` et exige un gabarit
  pour chacune des 166 routes servies. Il a immédiatement trouvé huit oublis
  dans la liste écrite le jour même — quatre pages du portail (`bilan`,
  `dossier`, `ce-qui-compte`, `comprehension`), `/dashboard` nu, `/dev/*` et
  `/api/dev/*`. Aucune n'était une fuite, le repli fermé les réduisait ; toutes
  rendaient le diagnostic aveugle sur une page réelle. Sans ce banc, la liste se
  serait périmée à la première route ajoutée, en silence.

### Documentation

- `docs/claude/OBSERVABILITE_PRODUCTION.md` affirmait « rien ne les branche »,
  « `next.config.mjs` n'appelle pas `withSentryConfig` », « il n'y a pas
  d'`instrumentation.ts` ». Les trois sont faux depuis ce commit — corrigés dans
  le même, plutôt que laissés à un futur `A11`.

### Reste dû — au responsable de traitement, pas à l'outil

- Poser `SENTRY_DSN` (et `NEXT_PUBLIC_SENTRY_DSN` pour le client) dans
  l'environnement Scalingo. Tant qu'ils sont absents, rien ne part.
- **Déclarer Sentry aux personnes.** `docs/DOSSIER_RGPD.md:194` pose l'écart
  depuis le 2026-08-07 : « soit il ne traite aucune donnée personnelle et cela
  s'écrit, soit la liste patient est incomplète et se corrige ». L'activation
  tranche dans le second sens — la liste des prestataires de
  `donnees_confidentialite` ne cite pas Sentry, et `D-137` est le précédent de
  ce que coûte un document qui nie un flux réel.
- Le DPA et la vérification de résidence UE, portés au registre d'actions
  (`docs/DOSSIER_RGPD.md:614`, échéance 2026-10-21).
