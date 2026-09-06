### Révoquer un accès ne fabrique plus une première connexion (2026-09-06)

Trouvé par la contre-revue adverse Codex de l'audit du parcours patient
(2026-09-05, `K3`). L'encart des dossiers neufs lisait toute date de
consommation d'un lien magique comme la preuve d'une entrée au portail. Or
révoquer un accès **date** les liens encore en vol (`consommeLe`, route
`token` `DELETE`) pour qu'`etatLien` les refuse : la colonne y porte
« fermé », pas « ouvert ». Un dossier dont le patient n'était jamais entré
passait donc de « Jamais connecté » à « Onboarding à finir » au moment précis
où le praticien lui fermait la porte — et y restait après une réouverture.

- **Le tampon de révocation est écarté** (`api/praticien/nouveaux-patients`) :
  une date de consommation qui vaut exactement `sessionsInvalidesAvant` a été
  posée par la révocation, dans la même transaction, et ne compte pas comme
  une entrée. Une entrée réelle antérieure, elle, reste une entrée.
- **La révocation se nomme** (`lib/fil/nouveauxPatients`) : nouvelle étape
  `acces_revoque` — « Accès révoqué » —, testée avant les trois portes et
  jamais comptée « en attente ». Sans elle, le dossier corrigé affichait
  « Jamais connecté » et invitait à renvoyer un accès que le praticien venait
  de couper, soit à défaire sa propre décision.
- **Aucune migration, aucun changement de la révocation** : le geste continue
  de fermer les trois portes (invariant révocation LOT-04), c'est sa
  *lecture* qui est corrigée.

Limite assumée et commentée à l'appel : le dossier ne retient qu'une date de
révocation. Après deux révocations successives, un tampon de la première
redevient indiscernable d'une entrée — les distinguer demanderait une colonne
à la table des liens.
