### Une révocation ne se défait plus par un clic de routine (2026-09-07)

Deux gestes ordinaires — créer une consultation, renvoyer le lien d'accès —
remettaient `accessTokenRevoked` à `false` **en silence**. Le praticien
défaisait sa propre décision de sécurité sans qu'on le lui dise. Et il ne
pouvait pas même la voir : hors de la fenêtre de 30 jours de l'encart
« Nouveaux patients », aucun écran ne portait l'état de révocation d'un dossier.

**Trois gestes, et le troisième est celui qui compte.**

1. **L'état remonte jusqu'à l'écran.** Un champ au DTO des patients, une
   pastille « Accès révoqué » au dossier — cumulative avec « Inactif » et
   jamais déduite d'elle : `D-126` §2 a tranché que désactiver un dossier ne
   pose pas ce drapeau, et un dossier actif, en suivi ouvert, peut avoir son
   accès fermé. Le sélecteur de consultation le signale aussi, à la sélection
   et non après coup.
2. **Un dialogue s'interpose.** Il ne naît pas d'un geste dédié : il se place
   devant un geste EN COURS, et dit donc ce que le praticien croyait faire ET
   ce qu'il ferait en plus. Il nomme aussi ce que le rétablissement ne défait
   pas — les sessions coupées ne reviennent pas, les liens à usage unique
   fermés restent inutilisables.
3. **Les deux routes refusent sans accord explicite** (409
   `retablissement_non_confirme`), et la comparaison à `true` est stricte : une
   chaîne « true » ne rouvre pas un portail que le praticien a fermé. Sans ce
   troisième geste, l'interdiction ne vivrait que dans l'UI et se contournerait
   par un appel direct — la leçon que le dépôt s'est déjà écrite au-dessus
   d'`accepteNouvelEnvoi` (#181).

**Le motif de refus ne pouvait pas être `portal_revoked`.** Ce mot est déjà la
convention de CINQ routes praticien, où il signifie « impossible par ce chemin,
réémettez avant » — aucune ne lève quoi que ce soit. Le réutiliser aurait rendu
indiscernable « impossible » de « possible, confirmez », et privé l'écran du
seul moyen de savoir s'il a une question à poser.

**Deux hissements interdits, deux bancs distincts.** La garde reste derrière le
test `action !== 'lien'` — copier un lien ne rétablit rien — et derrière le bloc
`lien_magique`, dont le refus est sec. Ce sont deux mutations différentes ; il
leur fallait deux cas.

**Une garde structurelle, prouvée rouge avant d'être posée.** Les bancs tiennent
les deux écrivains d'aujourd'hui ; ils ne diraient rien d'un troisième. C'est
pourtant ainsi que le défaut s'était installé — la seconde levée ajoutée par
symétrie avec la première, sans que la question soit rejouée. La garde balaie
les 132 `route.ts` de `src/app` (et non les seuls `src/app/api`, deux routes du
portail lisant déjà ce drapeau), avec deux détecteurs : le littéral, et
l'écrivain de fait. Elle a été vue rouge sur ses trois cas — un écrivain qui
perd son accord, un écrivain qui naît hors table, un drapeau renommé qui rendrait
le détecteur aveugle.

Sa table de classement a gagné une entrée que le plan n'avait pas prévue :
`patients/route.ts` y entre comme LECTEUR, parce que ce lot même lui fait
exposer le drapeau au DTO.

Quatorze mutants joués, quatorze tués.

Limite assumée, non couverte : le nettoyage du retour précédent dans la branche
révoquée d'`onCreateConsultation`. Un banc coûterait un montage à deux échecs
successifs pour une nuisance d'affichage ; le commentaire le porte.

Arbitrage praticien du 2026-09-07 : « un geste dit, dialogue avant de lever ».
Aucune migration, aucun seuil de scoring.
