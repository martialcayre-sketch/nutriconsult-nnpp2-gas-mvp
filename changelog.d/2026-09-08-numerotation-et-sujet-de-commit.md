### Note

- **Un numéro de décision ne se réserve qu'au merge.** Le choisir à l'ouverture
  d'une branche, c'est parier que personne ne mergera pendant le CI — pari perdu
  **cinq fois** le 2026-09-08, six décisions ayant atterri sur `main` en quelques
  heures. Ce n'est pas un défaut de la garde `decisions-numerotation.mjs` : c'est
  le prix, déjà assumé dans son en-tête, de rendre la collision **bruyante**.
  Cinq conflits qui se résolvent valent mieux qu'un doublon qui se propage
  silencieusement — précédent `D-013`/`D-014`, huit renvois à reprendre chaque
  fois. La marche à suivre est écrite là où le CI envoie déjà le lecteur.
- Ce qui coordonne plusieurs sessions n'est **pas** le worktree — elles y sont
  déjà, et la contention porte sur un **compteur**, pas sur un répertoire.

### Corrigé

- **Une note du registre disait faux, et sa correction change la consigne.** La
  note sous `D-142` attribuait l'écart de sujet de #943 à « un titre de PR qui
  n'a pas suivi ». #949 le réfute : son titre **avait** été renuméroté, et le
  sujet est resté faux. Le réglage réel est
  `squash_merge_commit_title = COMMIT_OR_PR_TITLE` — GitHub prend le titre du
  **commit** quand la branche ne porte qu'un seul commit réel, les commits de
  fusion ne comptant pas.
- Le levier, qui ne demande aucun `force`-push :
  `gh pr merge <N> --squash --subject "<sujet exact>"`. Éprouvé sur #956, dont
  le sujet écrit sur `main` porte bien `(D-153)`.
- Trois PR portent un `D-NNN` faux dans leur sujet sur `main` — #943, #949, #950
  — dont #949, qui cite un `D-145` **existant et sans rapport**. Un commit de
  `main` ne se réécrit pas : l'écart est noté sous chacune des décisions
  concernées, là où on le cherchera.

### Ajouté

- `D-147` porte désormais la trace de son application en production, constatée
  par conteneur `one-off-7344` et non sur la foi du workflow : colonne absente,
  migration appliquée en une seule tentative — la garde n'a pas mordu.
