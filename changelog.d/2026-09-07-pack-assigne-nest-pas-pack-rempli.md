### Un pack assigné n'est pas un pack rempli — et l'agenda n'a pas d'échéance (2026-09-07)

L'encart des dossiers neufs s'arrêtait au COMPTE DES ASSIGNATIONS : un pack de
base parti et jamais ouvert affichait « Accès et pack de base OK ». C'était
exactement le dossier vide que l'encart existe pour montrer. Une étape
`pack_sans_reponse` s'intercale — assigné n'est pas rempli, seule une réponse
rendue franchit la dernière porte.

Et le pack partait **sans échéance**. Or la lecture du Fil filtre
`dateLimite: { not: null }` avant même d'atteindre les cartes de retard : un
pack de base oublié ne pouvait rougir nulle part. Une date suffit à le faire
exister.

**L'échéance ne s'applique pas aux agendas, et c'est la partie qui comptait.**

Le pack de base contient `Q_SOM_09`, l'agenda du sommeil. Poser une `dateLimite`
dessus n'aurait pas signalé un retard : elle aurait **fermé**, dans cet ordre,
la saisie d'une nuit (410), la saisie alimentaire, l'affichage — le hub teste
l'expiration AVANT la branche agenda, donc l'instrument bascule en « Expiré »
sans action — et surtout **la relance praticien** (409 `date_limite_depassee`),
c'est-à-dire le seul geste de rattrapage, celui-là même que ce correctif existe
pour rendre possible.

Pire : la fenêtre de 21 nuits est ancrée sur la PREMIÈRE SAISIE, pas sur
l'assignation. Un patient qui commence au douzième jour aurait vu son recueil
coupé à 18 nuits, la clôture jamais atteinte, les agrégats jamais produits.

Et rien ne l'aurait montré. Les bancs et les E2E tournent à l'heure réelle : à
J+30, l'échéance est toujours dans le futur au moment du run. La régression
serait née en production trente jours après le premier onboarding validé.

Le refus vit dans `assignPackToPatient`, pas chez l'appelant : la contrainte est
celle de l'INSTRUMENT, pas celle du chemin — `praticien/packs/assign`, qui laisse
le praticien saisir une date, poserait le même piège.

**Le Set des instruments exemptés est exporté**, et pas par confort : `Q_ALI_09`
est suspendu tant que son drapeau est éteint, donc jamais assigné, donc aucun
banc passant par le chemin d'assignation ne peut rougir si on le retire du Set.
Sans cet export, ce mutant survivait — et le jour de l'allumage, l'agenda
alimentaire aurait été tronqué exactement comme celui du sommeil.

**Le délai n'est pas inventé** : 30 jours, la fenêtre de l'encart « nouveaux
patients ». Le relais entre les deux signaux n'est pas exact et aucune valeur ne
le rendrait exact — ils partent d'événements différents, la création du dossier
pour l'un, la validation de l'onboarding pour l'autre. La constante n'est pas
partageable (Next.js interdit l'export depuis un `route.ts`) : un banc assert sa
valeur, seule chose qui rattrape leur désynchronisation.

Onze mutants joués, onze tués.

Limite assumée : une assignation `Annulée` compte dans le total sans jamais
compter comme rendue — un pack entièrement annulé se lira « rien rendu ». Un
banc le dit plutôt que de le laisser découvrir à l'écran.

Arbitrage praticien du 2026-09-07 : exempter les instruments d'agenda.
Aucune migration, aucun seuil de scoring.
