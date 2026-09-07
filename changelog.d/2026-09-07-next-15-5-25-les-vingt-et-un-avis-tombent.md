### Next.js 14.2.35 → 15.5.25 — les vingt-et-un avis tombent, React reste en 18

La ligne 15.5 est activement maintenue (`npm view next dist-tags` →
`backport: 15.5.25`) et son peer React admet `^18.2.0`. **Les vingt-et-un avis
ouverts sur `next@14.2.35` avaient tous une borne haute `<15.5.21`** : ils
tombent donc en une seule marche, sans quitter React 18 — et non aux deux
majeures de Next 16, qui auraient exigé React 19 et la re-validation de toute
la couche composants.

**Audit : 15 → 9 paquets.** `next` ne figure plus que transitivement, via
`postcss`. Ce qui reste est entièrement de l'outillage hors chemin de requête —
`postcss` (build CSS), `mysql2` (connecteur MySQL du CLI Prisma, sans objet sur
PostgreSQL), `deepmerge-ts`, `find-my-way`, `valibot` (`@prisma/config`,
`@prisma/dev`).

**Quatorze fichiers** pour les APIs de requête devenues asynchrones — onze
pages, trois routes — plus l'unique `cookies()` du dépôt, et treize sites de
bancs qui passaient des `params` synchrones.

- **La route d'authentification ne recelait pas le piège annoncé.** Son
  commentaire avertit que NextAuth v4 détecte l'App Router par la seule
  *présence* de `params`, et qu'une erreur là casse toute l'authentification.
  Vérifié dans le paquet : `next-auth/next/index.js` fait déjà
  `(await context.params)?.nextauth` et ne teste que la présence. Passer la
  promesse telle quelle est sûr — c'est pourquoi `next-auth@4.24.15` déclare
  `next: ^15 || ^16`.
- **L'`await` reste APRÈS les gardes de drapeau** partout où il y en a
  (`portail/lien/[jeton]`, `api/portail/boussole/[foodRef]`, la page boussole) :
  le 404 « la route n'existe pas drapeau éteint » doit demeurer le premier
  geste, sans quoi le refus dépendrait d'une résolution de promesse.

**Le vrai obstacle fut ESLint, mais pas par la voie attendue.** `eslint.config.mjs`
— une configuration plate qu'aucun outil ne lisait sous Next 14 — est détectée
par le `next lint` de la 15, qui lui passe alors des options eslintrc. ESLint
les refuse, et **le lint meurt en silence pendant le build** : `next build`
imprime `⨯ ESLint: Invalid Options` et poursuit. Le fichier est retiré ; le lint
retrouve son chemin `.eslintrc.json`.

Il fait alors apparaître six erreurs `@next/next/no-html-link-for-pages` sur
deux `<a>` délibérés — la règle scanne désormais aussi l'app router. Les deux
sont justes : `/portail/google` est un **route handler** qui pose un cookie puis
redirige, et `connexion` est `force-dynamic` pour relire ses drapeaux à chaque
requête. La règle est désactivée à ces deux endroits, avec son motif ; changer
un comportement de navigation n'est pas le rôle d'une PR de version.

`next-env.d.ts` est régénéré par Next 15 et référence désormais
`.next/types/routes.d.ts`. Vérifié : le type-check passe à froid, sans aucun
`.next` — la référence absente ne casse rien, ce que le CI exige.

Reste hors de ce lot, et signalé : `next lint` est **déprécié** et disparaît en
Next 16. La migration vers l'ESLint CLI est un chantier distinct.

> **Correction du 2026-09-07, postérieure au merge de #934 — le titre est faux
> sur un point qui comptait.**
>
> « React reste en 18 » est vrai de `package.json`. C'est **faux du runtime**.
> Next embarque son propre React et l'aliase sur les trois couches de l'App
> Router, `appPagesBrowser` compris : le dépôt n'ayant pas de Pages Router,
> toute l'application s'exécute dessus, serveur comme navigateur.
>
> | | React réellement exécuté |
> |---|---|
> | `next@14.2.35` | `18.3.0-canary-178c267a4e-20241218` |
> | `next@15.5.25` | `19.2.0-canary-0bdb9206-20250818` |
>
> **La marche emporte donc une majeure de React**, et l'arbitrage a été rendu
> sans le savoir. Les 6708 bancs unitaires sont aveugles au changement —
> `vitest` n'aliase pas React et joue le `18.3.1` de `node_modules` — et
> `@types/react` reste en `^18.3.3`, donc `tsc` ne le voit pas non plus. Ce qui
> a réellement éprouvé React 19, ce sont les **183 E2E sur build de
> production**, deux navigateurs, baselines comprises.
>
> Décision reprise sur cette base et consignée en `D-139` : le déploiement part,
> avec fenêtre de surveillance, et la majeure est arbitrée plutôt que subie.
> `src/lib/observability/reactEmbarque.test.ts` refuse désormais tout changement
> de majeure sans décision — c'est le contrôle dont l'absence a coûté cet
> arbitrage.
>
> Second fait non dit : `staleTimes.dynamic` passe de 30 s à **0**. Deux pages du
> rail praticien interrogent Postgres côté serveur ; chaque retour re-requête au
> lieu de réutiliser 30 s de cache client. Non mesuré, consigné en `D-139` §6.

