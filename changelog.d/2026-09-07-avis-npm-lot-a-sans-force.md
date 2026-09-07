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

- **`nodemailer` 7.0.13** (injection de commande SMTP via `envelope.size`) —
  correctif en 10.0.0, un majeur. Toute notre surface tient dans
  `lib/email/transportSmtp.ts` : un `createTransport(url)`, et nous ne posons
  jamais `envelope`. À arbitrer : migrer, ou dater l'exception.
- **`next` 14.2.35** (DoS via `remotePatterns` de l'optimiseur d'images) —
  correctif en 16.x, deux majeurs sur une application en production. C'est le
  cœur de `A07` et cela ne se fait pas dans une PR de dépendances.
- **`mysql2`** — tiré par le CLI Prisma pour son connecteur MySQL ; nous
  sommes sur PostgreSQL, l'avis est sans objet à l'exécution.
- **`glob`, `minimatch`, `postcss`, `find-my-way`, `deepmerge-ts`,
  `valibot`** — chaînes d'outillage (`eslint-config-next`,
  `@typescript-eslint/*`, `@prisma/config`, `@prisma/dev`), hors chemin de
  requête. L'avis `glob` vise son *CLI* (`-c/--cmd`), que rien n'invoque ici.

Paliers T1 et T3 complets verts avant et après l'alignement Prisma — séquence
CI locale entière, E2E Chromium + WebKit compris.
