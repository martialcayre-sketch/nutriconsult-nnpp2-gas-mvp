### L'inbox dit ce qu'elle sait, et n'affirme plus qu'un patient a été lu ([[D-135]], 2026-09-07)

Quand l'inbox se vidait, elle écrivait « Aucun questionnaire en attente — tout a
été vu en consultation ». C'était une affirmation, et elle reposait sur un geste
du **patient** : `Consultation.dateValidation` n'a qu'un écrivain dans tout le
dépôt, la validation d'anamnèse au portail. Rien n'y prouvait qu'un praticien
ait lu quoi que ce soit.

**Rien n'était perdu pour autant**, et c'est ce qui a décidé de la forme. La
fiche patient lit toutes les réponses d'un dossier, sans ancre et sans filtre :
ce que l'inbox coupe est le signal, jamais la pièce. Le défaut n'était donc pas
une perte de donnée — c'était un écran qui concluait à la place de son lecteur.

L'ancre ne change pas. L'état vide dit ce que l'accueil sait : « Aucune réponse
reçue depuis la dernière consultation ». Et un repli compte ce que l'ancre a
retiré, dossier par dossier, en pointant la fiche patient. Replié, parce que le
cas courant est vide et que l'accueil doit rester une liste courte.

**Un défaut vivant corrigé au passage.** La normalisation intermédiaire de la
route laissait tomber `statutValidite` et `motifInvalidation` — sélectionnés en
base, recopiés à la sortie, mais absents de l'objet qui les relie. Le champ
retombait donc toujours sur `VALID` : le bandeau « Retirée du raisonnement
clinique » ne pouvait **jamais** s'afficher, et une passation que le praticien
avait retirée lui revenait valide, avec son bouton « Retirer » intact.

**Ce qui a été écarté, et pourquoi il faudra s'en souvenir.** Faire de l'accusé
de lecture la seule horloge est juste sur le fond. Mais le POST qui enregistre
« j'ai lu » filtre ce qu'il a le droit d'écrire avec la MÊME ancre : une réponse
antérieure en est écartée, le serveur répond succès sans rien écrire, et l'écran
recharge une liste inchangée. Le praticien cliquerait, l'écran acquiescerait,
rien ne bougerait. Si cette option est reprise, le POST doit changer dans le
même lot que l'affichage.

Six mutants joués, six tués.

Aucune migration, aucun seuil de scoring.
