### Une mesure biologique saisie de travers se corrige — et l'erreur reste lisible (2026-09-06)

Une valeur fausse n'avait aucune issue : la route le disait, l'écran
avertissait de « vérifier avant de consigner ». Le geste existe désormais, et
il suit le régime arbitré par `D-124` : **corriger crée une LIGNE qui référence
l'ancienne**, jamais un `update`. C'est le patron maison des chaînes
`supersedes_*`, et c'est l'esprit de `DC-30` — une erreur se signale, elle ne
disparaît pas.

**À l'écran, l'erreur reste visible.** La série rend toutes les lignes,
corrigées comprises : la valeur dépassée s'affiche barrée, avec la date de sa
correction et la valeur qui l'a remplacée ; la correction, elle, se signale
comme telle. Rien n'est filtré — filtrer effacerait la trace, ce qui est
exactement ce que le régime refuse. Seule la ligne qui fait foi offre le geste
de correction : on corrige la version courante, jamais une version dépassée.

**Le second temps ne propose que la valeur.** Ni analyte, ni date de
prélèvement : le serveur les **relit sur la ligne visée** et ignore ce que le
corps de requête en dit. Ce n'est pas une simplification d'écran — les offrir
laisserait croire qu'on peut les corriger, alors que les changer serait
*annuler* une mesure et en saisir une autre, ce qui reste hors périmètre.

**Ce que cette forme ferme, et que la décision n'avait pas vu.** `D-124`
nommait un écart : une correction atterrissant sur une clé
`(patient, analyte, date)` déjà occupée ne serait pas rattrapée par le `P2002`,
puisqu'elle vit hors de l'index partiel. En dérivant l'analyte et la date de la
cible plutôt que de les prendre du client, **cet écart ne peut plus se
produire** : la correction porte, par construction, la clé de ce qu'elle
corrige, et la ligne visée est vérifiée tête de fil avant toute écriture. Trois
lectures gardent le geste — la cible existe **et** appartient au dossier (une
seule requête : une cible d'un autre dossier est « introuvable », et le refus
n'apprend rien à qui devine un identifiant), et personne ne la supplante déjà.

**Un analyte retiré du catalogue** interdit une mesure neuve, jamais une
correction : refuser enfermerait une valeur fausse pour toujours dans le
dossier, sans aucun geste pour la reprendre.

La règle de départage d'une fourche — deux corrections de la même ligne — vit
**au serveur seulement** (`filCorrection`), et l'écran ne fait que suivre
l'identifiant qu'on lui donne : deux surfaces ne peuvent pas raconter deux
histoires du même dossier. La garde applicative de tête de fil ferme le cas
séquentiel, pas la course de deux corrections simultanées — même portée que
`D-123`, et c'est précisément cette règle de départage qui la rend inoffensive
à l'affichage.

### Corrigé

- **Deux fuites possibles dans les journaux** de la route des résultats. Le
  `catch` intérieur de la consignation écrivait « JAMAIS `err.message` » en
  toutes lettres — mais les deux `catch` extérieurs, eux, journalisaient
  `err.message`. Un `PrismaClientValidationError` y rend ses arguments : une
  valeur mesurée, un identifiant de dossier. Les trois suivent désormais la
  même discipline, `err.name` seulement.
