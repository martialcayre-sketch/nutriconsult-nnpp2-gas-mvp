### Modifié

- **`D-049` ne se referme plus sur un compteur de runs verts** (`D-155`). Sa
  condition de sortie offrait deux branches : « deux séquences complètes
  consécutives sans blocage » **ou** une cause racine. La première a été
  littéralement remplie le 2026-09-08 — trois séquences T3 complètes, `EXIT 0`,
  194 E2E chacune, aucune signature de blocage — et elle est **neutralisée**
  pour autant.
- Le motif était déjà écrit dans le dépôt : la panne est intermittente et
  **dépendante de la charge machine**, et le 2026-09-07 quatre runs consécutifs
  avaient échoué avant qu'un cinquième passe. On en avait tiré que quatre
  échecs ne font pas une reproductibilité. **La symétrie est exacte : trois
  succès ne font pas une disparition.** Compter des séquences propres mesure
  une absence d'observation, pas une résolution.
- Conséquence assumée : `D-049` n'a plus de porte de sortie automatique. Une
  décision qui se referme sur un compteur se rouvre au premier run rouge, et
  l'aller-retour coûte plus que l'état stable qu'il prétend rétablir.

### Ajouté

- Règle ferme, sans exception : **un rouge WebKit du CI ne se relance jamais** —
  il se rapporte (spec, projet, message exact) comme un rouge non tranché. Plus
  stricte que pour un rouge local, et pour une raison précise : depuis le
  2026-09-07 il n'existe plus d'arbitre au-dessus du CI. Un rouge local se
  laisse arbitrer par le CI ; un rouge du CI ne se laisse arbitrer par rien, et
  le relancer ne produit pas une information, seulement un silence.
- `docs/claude/REGLES_PR_MERGE.md` porte désormais la consigne du **sujet de
  squash** : il vient du commit de branche, pas du titre de la PR
  (`squash_merge_commit_title = COMMIT_OR_PR_TITLE`), et se pose avec
  `gh pr merge <N> --squash --subject "<sujet>"` — sans `force`-push. C'est là
  qu'on merge, donc là que la consigne manquait.
- `D-148` porte la trace de l'écart de son propre commit de fusion (#950, sujet
  `D-147`), comme `D-142` et `D-147` déjà.

### Note

- Ce lot n'instruit pas la cause racine et n'affirme pas que les deux symptômes
  — expiration locale à trace réseau vide, `internal error` du CI — n'en font
  qu'un. Ils restent **inconnus faute de preuve** (`D-125`). Le périmètre de
  `D-049` est par ailleurs inchangé : contrats SQL, dérive schéma↔migrations,
  certification scoring et suite unitaire restent exigés en T3 local.
