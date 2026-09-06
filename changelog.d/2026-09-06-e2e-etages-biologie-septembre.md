### Deux parcours joués gardent les étages biologie livrés en septembre (2026-09-06)

Le document remis au patient et la saisie de résultats n'avaient que leurs bancs
unitaires et de route : ce qui y casserait n'aurait été vu que par un praticien,
sur un vrai dossier. Deux parcours Playwright les traversent désormais à chaque
passage du CI.

**Ce qu'aucun banc de rendu ne pouvait prouver.** « Le document remis survit au
rechargement » est la phrase centrale du geste livré début septembre, et elle
exige un aller-retour réel : une consignation, une page neuve, une relecture
servie par la base. Le parcours **déplie le texte** plutôt que de se contenter
de son en-tête — c'est la différence entre « la ligne existe » et « la pièce est
entière ». Il joue aussi les deux refus confirmables dans l'ordre que la route
impose : le registre patient d'abord, le doublon ensuite, chacun tranché à
l'écran comme le praticien le ferait.

**La saisie de résultats est éprouvée là où elle peut mentir.** Deux
prélèvements du même jour distingués par la seule heure coexistent bien ; un
doublon exact part en refus **et** n'écrit rien — un refus affiché sur une
écriture qui a eu lieu serait pire que pas de refus du tout ; et une panne de
lecture ne se lit jamais « aucune mesure », sur un dossier qui en porte
justement.

**Un constat, obtenu en essayant de jouer le troisième parcours.**
Enregistrer une version de protocole est aujourd'hui impossible depuis
l'application : la carte servie par le cockpit ne porte jamais de priorité
sélectionnée, et la route de versionnement l'exige. La chaîne est coupée à la
sélection de priorité — dette déjà nommée, qui passe de « démontré dans le
code » à **observé sur un parcours réel**. Le parcours arbitrage → révision
attend donc la réparation de cette chaîne, qui relève de sa propre décision.

### Interne

- Le geste de confirmation d'épisode T0, partagé par les parcours du rayon
  biologie, vit désormais dans un helper : deux copies d'une logique aussi
  subtile auraient divergé au premier changement d'écran.
