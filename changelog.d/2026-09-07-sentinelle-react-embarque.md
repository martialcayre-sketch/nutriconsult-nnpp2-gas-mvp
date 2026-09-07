### Une sentinelle sur le React réellement exécuté

`package.json` déclare `react: ^18.3.1`, et c'est cette version que jouent les
6708 bancs unitaires. Ce n'est pas celle qui tourne en production : Next embarque
son propre React et l'aliase sur les trois couches de l'App Router —
`reactServerComponents`, `serverSideRendering` **et `appPagesBrowser`**. Le dépôt
n'ayant pas de Pages Router, toute l'application s'exécute dessus, serveur comme
navigateur.

Ce banc existe parce que son absence a coûté un arbitrage. La marche
`next@14.2.35 → 15.5.25` a été présentée — et **décidée** — comme « React reste
en 18 », alors qu'elle faisait passer le runtime de `18.3.0-canary` à
`19.2.0-canary`. Un majeur entier, invisible du `package.json`, du type-check et
de la suite unitaire.

`src/lib/observability/reactEmbarque.test.ts` lit
`require('next/dist/compiled/react').version` et refuse tout changement de
majeure. Son message le dit : consigner la décision AVANT de toucher la
constante. Un troisième cas vérifie que la version embarquée **diverge** de celle
de `node_modules` — si elles coïncidaient, l'aliasing aurait changé de forme et
la sentinelle ne garderait plus ce qu'elle croit garder.

Mutant exécuté et vérifié rouge : ramener la constante à 18 donne « React
embarqué par Next est en 19.2.0-canary-… — majeure 19, arbitrée 18. »

Voir `D-139`, qui consigne le fait, l'arbitrage repris sur cette base, et le
second point non dit de la marche (`staleTimes.dynamic` : 30 s → 0).
