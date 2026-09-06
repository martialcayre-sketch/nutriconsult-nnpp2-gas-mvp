### La sélection praticien d'une priorité reçoit sa table (2026-09-06)

**Ce que la chaîne du protocole ne pouvait pas faire.** Enregistrer une version
de protocole 21 jours était **impossible depuis l'application**. Le constructeur
exige depuis toujours qu'une priorité ait été choisie par le praticien ; aucune
surface ne permettait de la choisir, et la carte servie par le cockpit n'en
portait jamais. Tout l'aval en dépendait : version relue, approbation de
diffusion, vue patient du protocole, points d'étape J7/J14/J21, jalon J21 du Fil.

Le constat n'est plus une déduction de lecture de code : il a été **observé en
essayant de jouer le parcours**, puis recoupé en production le 2026-09-06 —
aucune version de protocole n'y a jamais été écrite, et quatre dossiers réels
s'arrêtent exactement à cette coupure, épisode confirmé et rien après.

**Ce que cette livraison pose.** La table qui manquait : l'acte de sélection —
quelle priorité, par qui, quand, et **pourquoi**. Le motif écrit n'est pas une
note facultative : c'est ce qu'une version de protocole citera, et ce qui se
relit six semaines plus tard.

Le régime est celui de la maison : **changer d'avis crée une ligne, jamais une
rature**. Ici la raison n'est pas seulement doctrinale — l'horodatage du choix
entre dans l'empreinte de la carte de décision, et chaque version enregistrée
s'ancre sur cette empreinte. Une sélection réécrite en place ferait pointer
l'ancre d'une version déjà enregistrée vers une carte que la base ne saurait plus
reconstruire : le contrôle d'intégrité refuserait alors une version que le
praticien avait légitimement écrite.

Deux gardes rendent le fil d'une carte **strictement linéaire** — une seule
sélection d'origine, un seul successeur par ligne. C'est plus strict que les
autres chaînes du dépôt, qui tolèrent une bifurcation et la tranchent à la
lecture, et le motif est clinique : deux sélections concurrentes sur la même
carte, ce serait deux praticiens croyant chacun avoir décidé. La base refuse
plutôt que d'élire.

**Ce que cette livraison ne fait pas encore.** Rien n'écrit ni ne lit cette
table : le geste à l'écran et la route qui le consigne suivent, une fois la
migration appliquée. Une seule exception, et elle protège le patient — la
suppression d'un dossier vide dès maintenant cette table, comme toutes les
autres pièces du dossier.

Aucune sélection n'est posée rétroactivement sur les dossiers existants : une
priorité inscrite aujourd'hui sur une décision d'hier serait un acte que
personne n'a posé.
