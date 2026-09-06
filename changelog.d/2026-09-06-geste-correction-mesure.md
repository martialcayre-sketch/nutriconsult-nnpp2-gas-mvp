### Une mesure biologique saisie de travers se corrige — et l'erreur reste lisible (2026-09-06)

Une valeur fausse n'avait aucune issue : la route le disait, l'écran
avertissait de « vérifier avant de consigner ». Le geste existe désormais, et
il suit le régime arbitré par `D-124` : **corriger crée une LIGNE qui référence
l'ancienne**, jamais un `update`. C'est le patron maison des chaînes
`supersedes_*`, et c'est l'esprit de `DC-30` — une erreur se signale, elle ne
disparaît pas.

**À l'écran, l'erreur reste visible.** La série rend toutes les lignes,
corrigées comprises : la valeur dépassée s'affiche barrée, et l'écran nomme
celle qui fait foi à sa place ; chaque correction, elle, se signale comme telle
**avec sa propre date de consignation**. Rien n'est filtré — filtrer effacerait
la trace, ce qui est exactement ce que le régime refuse. Seule la ligne qui
fait foi offre le geste : on corrige la version courante, jamais une dépassée.

**La phrase nomme un ÉTAT, pas un événement**, et ce n'est pas une nuance de
style. La ligne qui fait foi n'est pas forcément celle qui vous a remplacé
directement : sur une mesure corrigée deux fois, la première version est
supplantée par la deuxième, mais c'est la **troisième** qui fait foi. Dire
« corrigée le [date de la troisième] » attribuerait un geste qui n'a jamais eu
lieu — et sur une fourche, ferait passer une **sœur** pour une correction.
L'écran dit donc « remplacée — la valeur qui fait foi est Y, consignée le X »,
et la date de chaque correction se lit sur sa propre ligne : le fil reste
lisible pas-à-pas, ce que `DC-30` demande.

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

**Une seule valeur fait foi par mesure, fourche comprise.** La garde
applicative de tête de fil ferme le cas séquentiel, pas la course de deux
corrections simultanées — même portée que `D-123`. Ce qui rend cette course
inoffensive, c'est l'**élection** faite au serveur : les lignes d'une même
mesure sont regroupées par la racine de leur chaîne, et une seule y est
désignée courante — la plus récente, l'identifiant départageant à horodatage
égal. Sans cette élection, les deux branches d'une fourche seraient sorties
« non supplantées » et se seraient prolongées chacune de son côté. La règle vit
**au serveur seulement** ; l'écran suit l'identifiant qu'on lui donne, si bien
que deux surfaces ne peuvent pas raconter deux histoires du même dossier.

**Et la route applique la MÊME règle que l'affichage.** Elle relit le fil
entier de la mesure avant d'accepter une correction, au lieu de chercher le
seul successeur direct : sur une fourche, la branche perdante n'est supplantée
par personne au sens du chaînage, et la corriger aurait fait basculer
l'autorité en silence vers celle qui avait perdu — la route aurait permis
exactement ce que son refus dit interdire. **Son message de refus nomme donc,
lui aussi, un état** : « cette mesure ne fait plus foi », et non « elle a déjà
été corrigée » — personne n'a corrigé une branche que sa sœur a devancée.

**L'écran annonce l'unité qui sera consignée**, pas celle d'origine. Le serveur
relit l'unité sur l'analyte au catalogue : si elle a changé depuis la mesure,
le second temps le **dit** et nomme les deux. Afficher l'ancienne ferait taper
un nombre sous un libellé faux — sur une donnée clinique, un facteur mille
silencieux.

**Un catalogue non lu n'affirme rien** (`DC-24`, la règle que la série
appliquait déjà deux panneaux plus haut). Tant que le catalogue est en vol — ou
s'il est en panne —, l'écran ne dit plus « cet analyte n'est plus servi » : il
dit que l'unité n'est pas vérifiable pour l'instant et qu'elle sera reprise du
catalogue à la consignation, ce qui est vrai dans les trois cas.

**Une mesure d'import laboratoire ne se corrige pas par une saisie praticien.**
La garde est posée avant que le cas n'existe : sans elle, une valeur rendue par
un laboratoire passerait barrée sous une valeur frappée à la main, dans une
surface dont le contrat dit qu'`import_labo` attend son propre chemin.

**Une chaîne malformée est un refus, jamais une bascule silencieuse.** Un
identifiant de cible envoyé vide, en nombre ou en objet produisait une mesure
**neuve** avec l'analyte et la date du client : le geste changeait sans le
dire. C'est désormais un 400, et la longueur est bornée comme celle de
l'identifiant de dossier.

### Corrigé

- **Deux fuites possibles dans les journaux** de la route des résultats. Le
  `catch` intérieur de la consignation écrivait « JAMAIS `err.message` » en
  toutes lettres — mais les deux `catch` extérieurs, eux, journalisaient
  `err.message`. Un `PrismaClientValidationError` y rend ses arguments : une
  valeur mesurée, un identifiant de dossier. Les trois suivent désormais la
  même discipline, `err.name` seulement.
