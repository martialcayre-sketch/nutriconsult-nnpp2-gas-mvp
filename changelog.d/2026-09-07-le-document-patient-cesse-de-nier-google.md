### Le document d'information cesse de nier la connexion patient par Google ([[D-137]], 2026-09-07)

Le document servi à tout patient qui ouvre « Informations, confidentialité et
droits » écrivait : « **Google — connexion sécurisée du praticien uniquement
(jamais des patients)** ». C'est une négation explicite, et elle est fausse
depuis le 2026-07-22 : la porte Google patient est ouverte en production — relue
sur Scalingo le 2026-09-07 — et deux écrans patient proposent « Continuer avec
Google ». Le document normatif disait le contraire de ce que le produit fait.

Une v4 le corrige, append-only, la v3 gardant sa place au registre.

**Trois changements, et le deuxième n'était pas demandé.**

1. La ligne Google porte ses deux rôles : la connexion du praticien, et la
   connexion patient facultative — seule l'adresse e-mail étant alors transmise.
2. **Le prestataire d'envoi est nommé, et ce que les e-mails transportent est
   dit.** Le nommer sans le second point aurait fabriqué une fausseté neuve :
   `/portail/connexion` affirme « seule votre adresse email est transmise —
   aucune donnée de santé », vrai de la CONNEXION, et les deux surfaces se
   seraient lues ensemble comme « Google, aucune donnée de santé ». Or le bilan
   validé part par ce relais ([[D-136]]). Une demi-correction aurait été pire
   que la minimale.
3. Le document dit désormais que les connexions sont enregistrées douze mois —
   il invitait à signaler « une connexion que vous ne reconnaissez pas » sans
   avoir jamais dit qu'elles l'étaient.

**Aucun accusé n'est redemandé, et c'est le piège de cet item.**
`requiresAcknowledgement` reste `false`, comme la v3. Le poser à `true` ne
remettrait pas une case : `AvantDeCommencer` ne s'ajoute pas, il REMPLACE la
page. Tous les patients en cours retrouveraient quatre écrans et trois cases
devant leur espace — y compris celui qui note sa quatorzième nuit sur vingt et
une et qui a un rappel à honorer le soir même. Et rien ne l'aurait montré avant
la production : les fixtures e2e résolvent la version depuis le registre, donc
aucun spec ne voit le mur. Coût maximal, information nulle — ces quatre écrans
ne parlent pas de Google. Un banc garde ce point.

**Ce que le texte patient ne dit PAS, délibérément.** La localisation du
traitement d'acheminement et la couverture DPA restent dues au dossier RGPD
(rubrique 6, échéance 2026-10-21). L'arbitrage praticien du 2026-09-07 est de
ne pas les porter dans le document patient : elles restent consignées là où
elles sont suivies, et l'échéance ne bouge pas.

Le résumé de version, que les patients lisent, dit franchement ce que la v3
affirmait à tort — même registre que celui de la v2, qui assume déjà une période
« moins protégée ».

Six mutants joués, six tués — dont celui qui exigerait un accusé de tous les
patients, et celui qui daterait la v4 avant la v3, la rendant jamais servie.

Aucune migration, aucun seuil de scoring.
