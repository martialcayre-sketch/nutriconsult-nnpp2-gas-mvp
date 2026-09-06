### `D-128` — révoquer ferme aussi par l'horizon : `consommeLe` ne dit plus qu'une chose (2026-09-06)

La révocation datait `consommeLe` sur les liens encore en vol — une colonne qui
dit « le patient est entré » — pour fermer une porte. L'encart des dossiers
neufs devait ensuite écarter ces tampons par une égalité stricte avec
`sessionsInvalidesAvant`, ruse qui ne tenait qu'UNE révocation : à la seconde,
les tampons de la première redevenaient indiscernables d'une entrée. Le code
disait cette limite insoluble « sans une colonne de plus à la table des liens ».
Elle ne l'était pas : il ne fallait pas ajouter une colonne, il fallait retirer
un écrivain.

- **La révocation ferme par `expireLe`**, exactement comme la désactivation
  (`D-126`) : un écrivain retiré, aucun ajouté, aucun lecteur nouveau. Les deux
  gestes praticien sont devenus le même, au mot près.
- **L'encart n'a plus rien à discriminer** : la présence de `consommeLe` EST
  l'entrée. L'égalité stricte n'est pas retirée — elle devient un filet
  rétrospectif sur les lignes antérieures, et c'est écrit là où elle vit.
- **REFUSÉ, et c'était la piste de départ** : faire écrire à la révocation
  `consommeLe` ET `expireLe` pour discriminer par `consommeLe >= expireLe`. Cela
  fonctionne, et c'est le piège : on ajoute un écrivain à `expireLe` sans en
  retirer aucun à `consommeLe`, et on donne à `expireLe` un second lecteur —
  après quoi tout futur écrivain qui oublierait `consommeLe: null` dans son
  `where` convertirait des entrées RÉELLES en tampons.
- **La consommation compare l'horizon à la valeur LUE, pas à une horloge.**
  `D-126` avait cru fermer la course avec `expireLe: { gt: new Date() }` : ce
  prédicat est évalué en JavaScript à la construction de la requête, donc avant
  l'attente du verrou. `now()` ne vaudrait pas mieux, Postgres le figeant au
  début de la transaction. Le prédicat devient un compare-and-swap.

Aucune migration, aucun backfill. Les lignes antérieures restent ambiguës, en
trois familles nommées dans `D-128`.
