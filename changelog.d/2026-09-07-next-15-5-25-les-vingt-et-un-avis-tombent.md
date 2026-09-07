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
