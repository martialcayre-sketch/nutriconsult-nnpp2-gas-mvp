### Instrumentation — une garde de runtime avant la marche en Next 15

`register()` posait ses handlers `process` sans regarder le runtime. Ce dépôt a
un `src/middleware.ts` (`matcher: '/patient/:path*'`), donc un compilateur edge
— et dans le bac à sable edge, **toute fonction de `process` jette**
(`next/dist/server/web/sandbox/context.js`, `throwUnsupportedAPIError`), tandis
que l'erreur de `register()` y est **relancée**
(`next/dist/server/web/globals.js`).

Sous Next 14, l'instrumentation n'est pas compilée du tout : le défaut est
inerte. Sous Next 15 elle le devient, et `register()` aurait cassé le middleware
**au chargement**, emportant la redirection legacy `/patient/*`. La garde est
donc posée AVANT la marche, parce qu'après il serait trop tard pour l'apprendre
autrement qu'en production.

Le banc couvre `edge` et une valeur inconnue, et nomme les handlers fautifs
quand il rougit : retirer la garde donne
« handlers posés en runtime « edge » : unhandledRejection, uncaughtException ».

Le commentaire du fichier est corrigé au passage. Il affirmait que poser un
handler désarme la sortie de Node, comme si nous en étions la cause. C'est faux :
`next start` pose déjà `uncaughtException` et `unhandledRejection` avec un corps
`console.error(err)` sous le commentaire « we keep the process alive »
(`next/dist/server/lib/start-server.js`). Le désarmement existe en production
aujourd'hui, sans nous. Notre `process.exit(1)` le corrige — Node exécute tous
les écouteurs — mais il corrige un état actuel, pas un état à venir.
