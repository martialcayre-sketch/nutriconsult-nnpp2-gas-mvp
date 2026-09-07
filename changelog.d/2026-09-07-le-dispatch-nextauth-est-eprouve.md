### Le dispatch NextAuth est éprouvé, plus seulement lu

`api/auth/[...nextauth]/route.ts` porte un avertissement : **NextAuth v4 détecte
le mode App Router via la PRÉSENCE de `params` sur le second argument** ;
l'omettre le fait retomber en mode Pages Router, où il lit `req.query.nextauth`
— inexistant sur une `Request` — et l'authentification praticien tombe
entièrement.

Rien ne l'éprouvait. `route.test.ts` **mocke `next-auth`** et réimplémente le
dispatch : il atteste que le wrapper transmet `context`, jamais que le vrai
next-auth le comprenne. Et `e2e/helpers/auth.ts` **forge** un JWT puis pose le
cookie de session directement — aucun des E2E existants ne frappait
`/api/auth/*`. La surface P0 la plus critique du dépôt ne reposait que sur une
lecture de paquet.

Deux revues indépendantes — contre-expertise Codex et revue interne — ont nommé
ce trou **séparément**, sur le même commit (la marche Next 15.5.25, `D-139`).
C'est cette convergence qui a désigné la cible.

`e2e/auth-dispatch.spec.ts` frappe deux actions choisies exprès : `csrf` ne
dépend d'AUCUN provider configuré, `providers` en dépend. Si les identifiants
OAuth venaient à manquer de l'environnement de test, `csrf` continuerait de
garder le dispatch — le banc ne deviendrait pas creux en silence. Un troisième
cas exige un `csrfToken` réellement présent : un handler rendant `{}` avec un
200 satisferait tout le reste.

Il ne teste PAS le flux Google, qui exige un compte réel et vit en unitaire avec
un jeton forgé. Il teste que le dispatch **arrive**.

Mutant exécuté, reproduisant l'avertissement du fichier à la lettre — un second
argument sans `params` : **500 sur les deux actions**, le repli Pages Router
annoncé. C'est la première preuve exécutée que la détection tient.
