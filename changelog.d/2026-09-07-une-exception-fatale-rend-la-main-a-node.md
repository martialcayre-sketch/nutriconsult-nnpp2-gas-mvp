### Une exception fatale rend la main à Node

`instrumentation.ts` posait un `process.on('uncaughtException')` qui
journalisait `fatal` — **et rien d'autre**. Or poser ce handler *désarme* la
sortie de Node : le processus survit à l'exception au lieu de mourir. Sur
Scalingo, cela veut dire un conteneur qui continue de servir dans un état
indéfini, au lieu d'être redémarré.

Le handler est **inerte aujourd'hui**, et c'est pourquoi personne ne l'avait
vu : sous Next 14, `register()` est conditionné à
`experimental.instrumentationHook`, qui vaut `false` par défaut
(`config-shared.js:136`, gate en `next-server.js:475`) et que `next.config.mjs`
ne pose pas — `.next/server/instrumentation.js` est d'ailleurs absent du build.
L'instrumentation devient stable en Next 15 : la mine s'amorcerait exactement
au moment de la marche.

- **Le handler sort désormais en `1`** après avoir journalisé. C'est sa raison
  d'être, pas un accessoire de la trace.
- **La sortie est différée d'un tour de boucle, à dessein.** `logger.fatal`
  écrit par `console.log`, asynchrone quand stdout est un tube — le cas en
  conteneur. Sortir dans le même tick tronquerait la trace fatale que l'on
  vient d'écrire, c'est-à-dire perdrait précisément ce qu'on voulait garder.
- **Banc dédié** (`src/instrumentation.test.ts`), prouvé rouge sur ses deux
  mutants : retirer la sortie, et sortir dans le même tick.

Reste ouvert, et signalé : le handler `unhandledRejection` du même fichier
désarme la sortie de la même façon (Node relève un rejet non géré en exception
fatale depuis la v15). Il continue de journaliser sans sortir — décision
distincte, non prise ici, et consignée telle quelle dans le banc.

> **Correction du 2026-09-07, postérieure au merge de #927 — deux faits.**
>
> **1. Le désarmement ne vient pas de nous, et il est déjà là.** `next start`
> pose ses propres écouteurs
> (`next/dist/server/lib/start-server.js`) : `process.on('uncaughtException',
> exception)` et `process.on('unhandledRejection', exception)`, où `exception`
> se réduit à `console.error(err)` sous le commentaire « we keep the process
> alive ». Ce n'est conditionné à aucun mode, et le `Procfile` lance bien
> `next start`. Le conteneur ne redémarre donc **déjà pas** sur exception non
> interceptée, en production, aujourd'hui — indépendamment de ce fichier, qui
> n'est jamais chargé. Le fragment ci-dessus présentait ce risque comme futur ;
> une version en est présente. Le correctif reste juste — Node exécute tous les
> écouteurs, et `process.exit` tranche — mais il corrige un état actuel, pas un
> état à venir.
>
> **2. Le correctif avait un trou : le runtime edge.** Ce dépôt a un
> `src/middleware.ts` (`matcher: '/patient/:path*'`), donc un compilateur edge.
> Dans le bac à sable edge, toute fonction de `process` jette
> (`next/dist/server/web/sandbox/context.js`, `throwUnsupportedAPIError`), et
> l'erreur de `register()` y est **relancée**
> (`next/dist/server/web/globals.js`). Sous Next 15, où l'instrumentation
> devient compilée, `register()` aurait cassé le middleware au chargement — et
> la redirection legacy `/patient/*` avec lui. Une garde de runtime est posée,
> et un banc la prouve sur `edge` comme sur une valeur inconnue.

