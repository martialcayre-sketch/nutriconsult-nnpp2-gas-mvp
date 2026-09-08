### Note

- **Le niveau d'alerte documente ; il ne décide pas** (`D-152`). `D-143` avait
  retiré la couleur inventée et laissé ouverte la seule question qui comptait :
  non pas « quels paliers », mais **à quoi le niveau doit servir**. Trois issues
  étaient posées — documenter, trier, ou moduler un refus de sécurité, cette
  dernière étant un assouplissement de garde. L'arbitrage retient la première.
- Conséquence directe et libératrice : **aucune échelle n'est à fonder**. Une
  échelle ne doit être gouvernée que si quelque chose s'y appuie ; un
  commentaire libre n'a pas besoin de paliers, et `niveau_alerte` reste
  légitimement un `TEXT` sans `CHECK`. Ce n'est pas un report : le champ n'a pas
  besoin de la réponse qu'on croyait lui devoir.
- Ce qui alerte reste le **fait** — un cumul constaté, un seuil dépassé —,
  jamais l'étiquette posée dessus. Les deux portes de sécurité continuent de
  basculer sur la **présence** de l'alerte.

### Ajouté

- Sentinelle : aucune source servie ne peut **comparer** `niveauAlerte` à une
  valeur (`===`, `switch`, ou un ordre). Elle laisse passer ce que l'arbitrage
  autorise — le test de **présence** (`=== null`, truthiness), nécessaire pour
  afficher, et la borne de longueur, qui valide une saisie libre sans lire
  aucune gradation. Une sentinelle qui interdirait de montrer le niveau
  punirait la bonne conduite et finirait désactivée. Éprouvée par mutation.

### Note

- Portée sur l'existant : **nulle**. `protocol_review_flags` n'est écrite par
  aucun chemin, aucun écran ne lit ce niveau, et aucune comparaison n'existait
  dans le dépôt. Ce lot ne change aucun comportement ; il fixe ce que le champ
  a le droit de devenir.
