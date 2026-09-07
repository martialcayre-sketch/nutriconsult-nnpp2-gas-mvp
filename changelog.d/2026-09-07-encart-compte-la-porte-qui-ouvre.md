### L'encart des dossiers neufs compte enfin la porte qui ouvre (2026-09-07)

L'encart « mise en service » comptait les e-mails de type `acces_portail` — et
eux seuls. Or `acces_portail` pointe une page de CONNEXION ; la porte qui ouvre
vraiment est `lien_magique`, servie par l'action `lien_magique` de
`api/praticien/token` et par la redemande patient `api/portail/lien/demande`.
Un dossier entré par le lien magique s'affichait donc « Accès non envoyé »,
invitant le praticien à renvoyer un e-mail à un patient déjà servi.

Le filtre compte désormais **les deux types**.

**Et une garde neuve, que l'élargissement rendait nécessaire.** Les deux types
partagent le même signal d'échec. Or `api/portail/lien/demande` est un canal
public, rejouable, dont la raison d'être est de servir les patients DÉJÀ
entrés : sans garde, un simple échec SMTP sur une redemande faisait rebasculer
un dossier entré, validé et servi en « Accès non envoyé » — et **en tête de
l'encart**, puisque `etapeNouveauPatient` teste cette porte avant `connecteLe`
et que `estEnAttente` compte cette étape. L'élargissement aurait recréé
ailleurs, en pire, le dommage qu'il supprime. Un échec d'envoi ne parle donc
plus que tant que le patient n'est pas entré.

**Les bancs portent sur l'APPEL, pas sur la sortie.** Le double de `prisma`
rend ce qu'on lui pose sans regarder ni le `where` ni l'`orderBy` : aucun banc
de sortie ne peut distinguer ici un filtre juste d'un filtre faux. C'est
pourquoi le banc principal assert le `where.type` ET l'`orderBy` — ce dernier
n'est pas décoratif, c'est lui qui décide laquelle est « la dernière
tentative », et l'inverser changeait la règle en production sans qu'aucune
sortie ne rougisse.

Trois mutants joués, trois tués : remettre le filtre à un seul type, inverser
l'`orderBy`, retirer la garde « déjà entré ».

Reste nommé, non traité : un dossier servi uniquement par lien magique affiche
encore « Accès non envoyé » si aucune correspondance `acces_portail` n'existe
et que l'envoi a échoué avant l'entrée ; et la fenêtre de 30 jours laisse
toujours sortir de l'écran un dossier en souffrance sans qu'il soit devenu un
dossier.

Aucune migration, aucun seuil de scoring, aucun point d'écriture touché.
