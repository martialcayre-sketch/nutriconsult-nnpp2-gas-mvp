### Sécurité — dépendances, lot A (verrou seul, sans `--force`)

L'audit npm annonçait 24 avis dont un critique. Ce lot en ferme sept, dont le
critique, **sans toucher à `package.json`** : le diff porte sur le seul
`package-lock.json`.

- **`next-auth` 4.24.14 → 4.24.15** — ferme l'avis critique. Le majeur qui
  l'accompagne (`uuid` 8.3.2 → 11.1.1) n'est pas un choix : c'est
  `next-auth@4.24.15` qui exige `uuid@^11.1.1`, et nous n'importons `uuid`
  nulle part dans `src/`.
- **Prisma aligné en 7.10.0** (CLI *et* `@prisma/client`, tous deux dans leur
  caret `^7.8.0` déclaré). `npm audit fix` avait monté le seul CLI, laissant le
  générateur deux mineures devant le client d'exécution ; sur une base HDS,
  cette dérive est le genre d'écart qui ressort en énigme six semaines plus
  tard.
- **`npm audit fix --force` a été refusé** : il installe `prisma@6.19.3` —
  une rétrogradation d'un majeur entier sur la couche qui parle à la base de
  production — pour un avis `valibot` de sévérité *modérée*. L'avis reste
  ouvert et assumé.

Dix-sept avis restent ouverts, tous connus et classés :

- **`nodemailer` 7.0.13** — six avis, dont **un seul `high` : l'option
  `raw` d'un message contourne `disableFileAccess` / `disableUrlAccess`**
  (plage vulnérable `<=9.0.0`, donc correctif en 10.0.0, un majeur). Nous ne
  passons jamais `raw`. L'avis `envelope.size` souvent cité par-dessus est,
  lui, de sévérité **`low` et corrigé dès 8.0.4** — il ne commande rien.
  Toute notre surface tient dans `lib/email/transportSmtp.ts` : un
  `createTransport(url)`, et nous ne posons ni `raw` ni `envelope`.
- **`next` 14.2.35** — **vingt-et-un avis**, pas un seul. Le DoS via
  `remotePatterns` de l'optimiseur d'images est `moderate` et **corrigé en
  15.5.10** ; il est de surcroît sans objet ici, `next.config.mjs` ne
  déclarant aucune section `images` (toute URL distante est donc refusée).
  Ce qui commande est le reste du lot — DoS Server Components, SSRF dans les
  rewrites, empoisonnement de cache RSC — **dont la borne haute est
  `<15.5.21`**. La ligne 15.5 est maintenue : `npm view next dist-tags` donne
  `backport: 15.5.25`, dont le peer React admet `^18.2.0`. **Les vingt-et-un
  avis tombent donc sans quitter React 18, en une seule marche 14 → 15.5** —
  et non aux deux majeures de Next 16.
- **`mysql2`** — tiré par le CLI Prisma pour son connecteur MySQL ; nous
  sommes sur PostgreSQL, l'avis est sans objet à l'exécution.
- **`glob`, `minimatch`, `postcss`, `find-my-way`, `deepmerge-ts`,
  `valibot`** — chaînes d'outillage (`eslint-config-next`,
  `@typescript-eslint/*`, `@prisma/config`, `@prisma/dev`), hors chemin de
  requête. L'avis `glob` vise son *CLI* (`-c/--cmd`), que rien n'invoque ici.

Paliers T1 et T3 complets verts avant et après l'alignement Prisma — séquence
CI locale entière, E2E Chromium + WebKit compris.

> **Correction du 2026-09-07, postérieure au merge de #923.** Ce fragment a
> d'abord annoncé le correctif `envelope.size` en nodemailer 10.0.0 (il est en
> 8.0.4) et le correctif `remotePatterns` en Next 16 (il est en 15.5.10). Les
> deux plages ont été relues dans `npm audit --json` et corrigées ci-dessus.
> L'erreur n'était pas neutre : elle désignait une migration à deux majeures
> là où une marche de ligne mineure suffit.
