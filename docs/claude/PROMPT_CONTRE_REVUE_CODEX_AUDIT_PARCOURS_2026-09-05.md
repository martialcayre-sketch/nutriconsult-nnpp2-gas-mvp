# Contre-revue adverse — l'audit du parcours patient ↔ praticien (2026-09-05)

*Prompt unique, à coller dans l'extension Codex. Sa cible n'est pas un diff :
c'est une **analyse**. L'audit du parcours a produit une dateline de 283
interactions, 106 constats et 27 propositions ; cette passe cherche à en
falsifier les affirmations portantes avant qu'elles ne commandent des lots.*

> **Statut au 2026-09-05 : rédigé, PAS ENCORE JOUÉ.** Ce fichier est l'énoncé de
> la passe, pas son résultat. Il est versionné parce qu'une contre-revue dont on
> ne peut plus relire la question posée n'est pas auditable : le verdict seul ne
> dit ni ce qui a été cherché, ni ce qui a été laissé hors champ.
>
> La passe se lance **manuellement par le responsable** — jamais par un agent
> ([[D-105]]). Le résultat viendra dans un fichier distinct,
> `REVUE_CODEX_ADVERSE_AUDIT_PARCOURS_<date>.md`, à côté de celui-ci.
>
> Elle est due **avant** que l'audit serve de cadrage, jamais après — régime
> établi par [[D-108]], où sept affirmations sur treize avaient été réfutées,
> dont un texte servi au patient depuis cinq semaines.

---

## 0. Ce que tu fais, et en quoi c'est différent d'une revue de code

Tu ne revois **pas** un diff. Tu attaques les **affirmations d'un audit** —
donc trois choses peuvent être fausses, et pas seulement une :

1. **le fait** : le code ne fait pas ce que l'audit dit qu'il fait ;
2. **la qualification** : le fait est exact, mais ce n'est pas un défaut — c'est
   un arbitrage daté et motivé du responsable, ou une dette déjà nommée avec son
   véhicule, et l'audit l'a présenté comme une découverte ;
3. **l'inférence** : le fait est exact et c'est bien un défaut, mais la
   conclusion que l'audit en tire ne s'ensuit pas.

Une quatrième catégorie compte autant que les trois autres, et c'est la seule
qu'un auditeur ne peut pas produire sur lui-même : **ce que l'audit a manqué**
(§5). Un audit qui se trompe se corrige ; un audit qui rassure à tort oriente
les lots suivants vers le vide.

**Ce qui réfute** : la lecture du code à la ligne citée, ou une commande
exécutée dont tu donnes la sortie, ou une décision du dépôt citée par son
identifiant et sa ligne.

**Ce qui ne réfute rien** et n'est pas demandé : une impression, une préférence
de style, un « ce serait plus propre si », un refactoring, un désaccord sur la
gravité qui ne s'appuie sur aucun scénario.

---

## 1. Règles d'engagement — non négociables

- **Lecture seule.** N'ouvre aucune PR, ne pousse rien, ne commite rien, ne joue
  aucune migration. Les commandes admises sont de lecture (`grep`, `sed`,
  `git log`, `git show`) et, si tu les annonces, `npm run check` et
  `npm run test:worktree -- --fast` depuis `web/`.
- **Ne touche pas à la base de production.** Aucune écriture, aucun SQL mutant.
- **Aucune identité patient réelle dans ta sortie.** Les seules identités
  admissibles sont les fixtures : **Sophie Nicola, Jennifer Martin, Michel
  Dogné**. Si tu rencontres autre chose qui ressemble à une identité réelle,
  signale son **emplacement sans la recopier**. Les dossiers réels se désignent
  par identifiant (`PAT0xx`).
- **Réponds en français.**
- **Ne juge aucun arbitrage clinique ni produit.** Que la jauge de « Mon
  équilibre » soit montrée au patient, que le parcours soit en « pull », que les
  agendas se clôturent à la main : ce sont des décisions prises. Tu vérifies
  qu'elles sont **implémentées telles qu'énoncées** et que l'audit les **qualifie
  correctement**, jamais qu'elles sont bonnes.
- **Ne corrige rien.** Ta sortie est un verdict, pas un patch.

---

## 2. Périmètre

**Cible** : l'analyse produite le 2026-09-05, lue sur `main` au commit
**`87f7f8eb`**, contre-lue sur `2de210e1`. Les affirmations ci-dessous en sont
extraites **verbatim** : tu n'as pas besoin de l'artefact pour travailler, ce
fichier est autoportant. Si l'artefact t'est fourni, il ne fait pas autorité
contre le code — le code fait autorité contre lui.

**Dépôt** : tout `web/src`, `web/prisma`, `web/e2e` et `docs/` est ouvert. C'est
voulu : l'audit prétend couvrir le parcours entier, donc rien n'est hors champ
par construction. Ce qui est hors sujet, en revanche : le déploiement,
`release-db`, l'outillage CI, `archive/gas-legacy/`.

**Deux limites connues de l'audit**, à ne pas re-signaler comme trouvailles —
mais à **utiliser** :

- il a lu le code, **jamais la production** : aucun chiffre de base, aucun état
  réel de drapeau. Toute affirmation de la forme « en production, X » est donc
  au mieux une inférence, et c'est une classe entière d'attaque ;
- il n'a **joué aucun test** : une couverture y est jugée sur le contenu des
  fichiers d'épreuve, pas sur une exécution.

---

## 3. Méthode et seuil de preuve

Chaque affirmation reçoit **exactement un** verdict :

| Verdict | Signification |
|---|---|
| **`RÉFUTÉE`** | le fait est faux, ou la qualification est fausse (décision datée, dette déjà nommée), ou l'inférence ne suit pas — avec `fichier:ligne` ou `D-xxx:ligne` |
| **`RÉSISTE`** | aucun contre-exemple recevable trouvé |
| **`AFFAIBLIE`** | le fond tient mais une branche est fausse, ou la portée est plus étroite qu'annoncée — **dis laquelle, et de combien** |
| **`ÉLARGIE`** | le fond tient et le défaut est **plus large** que l'audit ne le dit — c'est le verdict le plus utile de tous |
| **`NON VÉRIFIABLE`** | un élément nécessaire manquait — **nomme lequel** |

Chaque trouvaille est **`CONFIRMÉE`** (chemin lu ou commande exécutée de bout en
bout) ou **`PLAUSIBLE`** (un maillon reste supposé — **nomme ce maillon**).

**Cinq exigences sur la preuve :**

1. **Cite fichier et ligne** pour chaque constat, et donne le chemin de données
   complet — de l'entrée jusqu'à l'effet.
2. **Une commande annoncée est une commande exécutée**, dont tu donnes la
   sortie. Sinon : `NON VÉRIFIABLE`, jamais `RÉFUTÉE`.
3. **Ne confonds pas « rien ne l'en empêche ici » et « rien ne l'en empêche ».**
   Un verrou permissif dont un contrepoids existe ailleurs ne réfute rien : va
   chercher le contrepoids avant de conclure. C'est l'erreur que cette classe de
   passe commet le plus souvent.
4. **Un `grep` négatif n'est pas une preuve d'absence** tant que tu n'as pas
   essayé au moins deux orthographes et le nom du symbole importé. L'audit
   s'appuie lourdement sur des absences : c'est sa faiblesse méthodologique
   principale, et donc ton meilleur angle.
5. **Pour une décision du dépôt, cite son identifiant ET sa ligne.** « C'est
   documenté quelque part » ne réfute rien.

---

## 4. Les affirmations, par niveau

### NIVEAU 1 — celles qui commandent ce qui sera construit

*Six affirmations. Une seule fausse ici et le cadrage qui s'appuie dessus part
de travers. Traite ce niveau en entier avant tout autre.*

---

**N1.1 · La chaîne du protocole 21 jours est coupée à son maillon central, et
tout son aval est structurellement inatteignable en production.**

Énoncé de l'audit : `ProtocolMiniBuilder` refuse de se rendre tant que
`decisionCard.selectedMainPriority` est nul
(`web/src/components/patient-cockpit/ProtocolMiniBuilder.tsx:100`) et affiche
« Protocole indisponible — priorité praticien non sélectionnée » ; le seul
producteur de carte en production pose `selectionPraticien: null`
(`web/src/app/api/praticien/cockpit/route.ts:429` et `:603`) ; **aucune surface
n'offre de choisir cette priorité**. En conséquence : version relue
(`protocol_drafts`), approbation de diffusion, vue patient du protocole, points
d'étape J7/J14/J21, météo d'adhésion, carte « Jalon J21 », résumé de fin de
cycle — tout est inatteignable.

> **C'est l'affirmation la plus lourde de l'audit** : elle prétend expliquer
> mécaniquement les neuf tables à zéro ligne que [[D-112]] avait constatées sans
> en nommer la cause, et elle disqualifie par avance le geste que le bilan de
> campagne recommandait.
>
> **Attaque-la par cinq angles.** (a) Existe-t-il un **autre producteur** de
> `DecisionCard` que la route cockpit — route, script, fixture montée en
> production, chemin de rejeu ? (b) `POST /api/praticien/protocoles` écrit des
> `protocol_drafts` sans passer par le constructeur : cette route est-elle
> réellement sans client, ou un écran l'atteint-il ? (c) Le repli sur
> `proposedMainPriorityId` (`ClinicalRuntimeSection.tsx:944-952`) alimente-t-il
> un autre chemin que la re-passation ciblée ? (d) `selectedMainPriority`
> peut-il être posé côté client avant que le composant ne monte ? (e) Et
> l'inférence : « inatteignable en production » se déduit-il d'une lecture de
> code seule, alors que l'audit n'a lu **aucune** base ? Cherche une trace au
> dépôt — bilan, journal de session, capture — qui montrerait un protocole
> réellement enregistré.

---

**N1.2 · Aucun constat de gravité P0 : rien de ce qui a été retenu ne rompt la
sécurité des données ni n'expose un dossier à un autre praticien.**

L'audit affiche 106 constats, dont **0 P0**, 17 P1, 61 P2, 28 P3, et écrit en
tête de section : « rien ne rompt la sécurité des données ni n'expose un dossier
à un autre praticien ».

> **C'est l'affirmation la plus dangereuse**, parce qu'elle rassure. Un audit
> qui sous-cote est pire qu'un audit muet : il fait passer un incident pour une
> friction. **Cherche un P0 que l'audit a classé P1 ou P2** — perte de donnée
> patient, écriture perdue sous une réponse `ok`, franchissement de la garde
> d'appartenance `praticienEmail`, donnée d'un dossier servie dans un autre,
> secret exposé, effacement incomplet.
>
> Trois pistes nommées par l'audit lui-même et classées **P2** — juge si le
> classement tient : les packs sont une ressource de cabinet **sans**
> `praticienEmail` (tout compte `@wellneuro.fr` authentifié les lit et les
> édite) ; `POST /api/patient/submit` crée la réponse puis verrouille
> **hors transaction** et sans unicité ; les écritures append-only du portail
> n'ont **aucune clé d'idempotence serveur**. Un double envoi, une coupure entre
> les deux écritures, un second compte praticien : est-ce vraiment P2 ?

---

**N1.3 · La dateline est complète : aucune route, page ou table portant une
donnée patient n'est absente des 283 événements.**

L'audit revendique 11 phases, 283 interactions, et déclare avoir passé une
critique de complétude qui a listé les routes, pages et modèles du dépôt.

> **Vérifie-le mécaniquement.** `find web/src/app/api -name route.ts` rend 125
> routes, `find web/src/app -name page.tsx` en rend 32,
> `grep -c '^model ' web/prisma/schema.prisma` rend 80 modèles. L'audit ne cite
> pas ces trois listes exhaustivement. **Trouve ce qui manque** : une route
> d'écriture patient absente de la chronologie, un modèle portant une donnée de
> santé qu'aucun événement ne nomme, une page du portail sans événement.
>
> Un manque dans une phase déjà dense compte peu ; **un manque dans une
> ramification compte beaucoup** — annulation, expiration, échec d'envoi,
> retrait de consentement, refus, révocation, reprise, effacement, second cycle,
> dossier clôturé, dossier désactivé.

---

**N1.4 · Le gabarit `envoi_bilan` est déclaré conforme à « aucune donnée de
santé dans un e-mail » alors que son corps HTML est le bilan complet.**

Énoncé : `envoi_bilan` v1 porte `donneesSante: { statut: 'conforme' }`
(`web/src/lib/correspondance/registreGabarits.ts:248`) alors que le corps `html`
transporte le narratif patient et la note du praticien
(`web/src/lib/documents/bookletHtml.ts:49`, `:89-96`), acheminé par un relais
SMTP que ni le code ni le registre TRUST ne nomment.

> Deux questions distinctes, et l'audit les a peut-être mêlées. (a) La
> **déclaration** du registre porte-t-elle sur le corps `text` seul, et est-ce
> écrit quelque part ? (b) L'envoi du bilan par e-mail est-il un **arbitrage
> daté** — cherche dans `docs/DECISIONS.md` et `docs/securite_rgpd.md` — auquel
> cas ce n'est pas un défaut mais une décision, et l'audit s'est trompé de
> qualification. Si aucune décision ne le couvre, alors juge la gravité :
> l'audit l'a classé **P1**.

---

**N1.5 · Le document TRUST de confidentialité courant (v3) affirme au patient
quelque chose de faux sur l'authentification Google.**

Énoncé : la v3, publiée le 2026-09-01 et servie au patient, porte « Google —
connexion sécurisée du praticien uniquement (jamais des patients) »
(`web/src/lib/trust/contenus/registre.ts:298-301`, `:349`, `:519-523`,
`web/src/lib/trust/gouvernance.ts:18`) alors que l'entrée patient par Google est
ouverte (`WN_G5_GOOGLE_PATIENT`, `web/src/app/portail/connexion/page.tsx:62-65`).

> **Vérifie les trois maillons séparément** : que la v3 est bien le document
> rendu au patient aujourd'hui ; que la phrase y figure au mot près ; et que le
> drapeau est réellement posé en production — ce dernier point, l'audit ne
> pouvait pas le vérifier, il l'a repris de `docs/FEATURE_FLAGS.md`. Si le
> drapeau est éteint, le document dit vrai et le constat tombe. **C'est le seul
> constat de l'audit dont la vérité dépend d'un état hors dépôt.**

---

**N1.6 · La révocation d'accès n'a aucune surface praticien et se défait en
silence.**

Énoncé : `accessTokenRevoked` est honoré à l'entrée patient
(`web/src/lib/patient-session.ts:98-101`) mais absent du DTO praticien
(`web/src/app/api/praticien/patients/route.ts:43-55`) et du menu de ligne
(`web/src/components/ui/PatientRow.tsx:71-100`) ; `POST /api/praticien/token`
(`:118-124`) et `POST /api/praticien/consultations` le remettent à `false` sans
confirmation ni signal.

> **RP-11 du dépôt** (`docs/RELATION_PRATICIEN_PATIENT_SOURCE.md:372`) pose que
> « la révocation ne peut pas être annulée par un simple renvoi » — mais son
> statut y est **« cible »**, pas « acquis ». La question de qualification est
> donc entière : l'audit signale-t-il un défaut, ou une cible non encore
> construite, ce qui n'est pas la même chose et ne se corrige pas au même titre ?
>
> Vérifie d'abord le fait : la levée est-elle bien silencieuse **dans les deux
> chemins**, et existe-t-il un contrepoids — dialogue de confirmation, trace au
> journal, garde ailleurs ? Puis juge la gravité : levée silencieuse d'une
> révocation de sécurité — P1 comme l'a classé l'audit, ou P0 ?

---

### NIVEAU 2 — la fidélité des constats individuels

*Onze affirmations. Ici, `RÉFUTÉE` retire un constat du lot ; `ÉLARGIE` en
augmente la portée. Ne t'arrête pas au premier contre-exemple.*

**N2.1 · Faux succès sur panne SMTP.** Trois actions d'accès (POST
`consultations`, POST `token` en `lien_magique` et en `resend`/`issue`) avalent
l'exception d'envoi et rendent `success: true`
(`consultations/route.ts:181-186`, `token/route.ts:108-115`, `:128-137`).
L'audit ajoute que `packs/assign`, `assignations` et `file-envoi/envoyer` sont
symétriques, et que seuls le livret et la relance d'agenda disent la panne.
*Vérifie chaque route nommée, et cherche-en une septième. Vérifie surtout la
contrepartie : le journal `CorrespondancePatient` écrit-il vraiment une ligne
`Erreur` dans tous ces cas, et cette ligne a-t-elle un lecteur ?*

**N2.2 · Impasse du portail.** Tout patient qui revient après avoir tout
transmis est déposé à la racine et lit « Merci ! … prochainement » sans lien
vers son parcours ; bilan, dossier à deux voix et centre Informations
deviennent inatteignables (`portail/[token]/page.tsx:528-550`, `:561-566`,
`lien/[jeton]/route.ts:130`, `google/retour/route.ts:238`,
`api/portail/session/route.ts:76-80`). *Cherche un chemin de retour que l'audit
a manqué : un lien dans un e-mail, une URL profonde, un `<details>` ouvert, un
signet plausible. « Inatteignable » est un absolu — casse-le avec un seul
chemin.*

**N2.3 · La clôture d'agenda écrase la date de mesure.** `cloturerAgenda` pose
`dateReponse: now` (`web/src/lib/agenda-sommeil/cloture.ts:81`, `:115` ; jumeau
alimentaire `:165`) : une mesure d'août devient une mesure de septembre dans
l'historique d'équilibre. *Vérifie que la date des nuits est réellement perdue
pour les consommateurs, et non conservée ailleurs et lue par eux.*

**N2.4 · L'ancre « dernière consultation validée » est posée par le patient.**
`Consultation.dateValidation` n'a qu'un site d'écriture,
`api/portail/valider/route.ts:194-195`, à la fin de l'anamnèse ; l'inbox et le
pré-vol la lisent comme la date de la dernière consultation réelle
(`lib/fil/inbox.ts:10-13`, `:39-40`). *Cherche un second site d'écriture, y
compris par script ou migration.*

**N2.5 · Le dossier au pack jamais rempli devient invisible à 31 jours.** Le
pack de base est assigné sans `dateLimite` (`lib/consultation/assignBasePack.ts:77`),
donc jamais « en retard » (`lib/fil/cartes.ts:360`) ; la carte `reprise` exige au
moins une réponse ; l'encart des dossiers neufs s'arrête à 30 jours. *Cherche la
troisième surface qui rattraperait ce dossier.*

**N2.6 · Rien n'appelle le geste de l'objectif négocié.** Ni carte du Fil, ni
fait du pré-vol, ni condition à la confirmation T0, ni étape de la minute
d'après (`lib/fil/cartes.ts:17-25`, `lib/copilote/prevol.ts:155-192`,
`lib/clinical-engine/preconditionsT0.ts:224-330`) ; le rail dérive
« Compréhension » de la couverture des priorités scorées sans jamais lire
`objectifs_negocies` (`FichePatientPanel.tsx:747-749`). *L'audit s'appuie ici
sur un `grep -i objectif` négatif : refais-le autrement — nom du symbole importé,
nom de la table, `ObjectifNegocie`, `objectifs`.*

**N2.7 · « Mon équilibre » sert au patient des seuils écrits dans un
composant.** `libelleCouverture` pose ≥70/≥40 dans
`web/src/components/patient/MonEquilibreDetail.tsx:17-21`, trois « Points à
explorer » sont triés automatiquement (`MonEquilibreAccueil.tsx:99-111`) et
l'indice global est dessiné en jauge proportionnelle (`ScoreGauge.tsx:19`).
*Deux questions : ces seuils existent-ils ailleurs dans une table signée, ce qui
ferait de la copie un `DC-26` et non un `DC-19` ? Et la jauge a-t-elle un
arbitrage daté qui la maintient — l'audit dit que oui, vérifie-le et dis si ça
change la qualification.*

**N2.8 · La demande de correction échoue en silence.**
`ConsultationScreen.tsx:47-60` est un `try/finally` sans `else` ni `catch` : ni
401, ni 409, ni 410, ni panne réseau ne s'affichent. *Vérifie qu'aucun état
d'erreur n'est rendu plus haut dans l'arbre.*

**N2.9 · Le panneau de confirmation d'épisode dit faux.** Il annonce « Cette
confirmation reste en mémoire et ne modifie aucune donnée »
(`EpisodeConfirmationPanel.tsx:67-69`) alors que depuis [[D-118]] le POST
cockpit persiste l'épisode (`api/praticien/cockpit/route.ts:657-663`). *Fait
simple à vérifier ; vérifie-le, et cherche les autres libellés que D-118 a
laissés périmés.*

**N2.10 · Deux calendriers portent le nom « J21 ».** Les points d'étape se
comptent depuis `approvedAt` avec ±3 jours
(`web/src/lib/protocol/checkinDomain.ts:26-41`) ; les jalons de mesure depuis
`confirmedAt` avec ±8 jours (`web/src/lib/protocol/fenetreJalon.ts`,
`web/src/lib/equilibre/constants.ts:349`, `:362`). *L'arbitrage A1 du registre
des frontières les tient pour deux objets distincts : l'audit le sait et le dit.
La question est donc de qualification — un même mot pour deux objets voulus
distincts est-il un défaut d'interface, ou l'audit a-t-il fabriqué un problème à
partir d'une décision ? Tranche, et cherche si un écran met réellement les deux
côte à côte.*

**N2.11 · Le parcours est intégralement en « pull ».** Huit modules d'envoi
seulement — neuf appels, `consultation/email.ts` en portant deux — tous
déclenchés par un clic praticien ; aucune file, aucun réessai, aucune tâche
planifiée (`web/Procfile` : `web` + `postdeploy` ; aucun `cron.json` ; aucun
`schedule:` dans `.github/workflows/`). Rien ne part pour un protocole diffusé,
une correction accordée, un point d'étape dû, un objectif à ratifier, un
document de biologie, un rendez-vous, une clôture.

> *Trois angles.* (a) Recompte les appels `sendMail(` hors tests —
> **attention au piège** : `web/src/lib/agenda-sommeil/relanceEmail.ts:4` cite
> `sendMail(` dans un **commentaire** et gonfle le compte d'un `grep` naïf. Le
> vrai chiffre distingue modules et appels. (b) Cherche un canal sortant qui
> n'est **pas** du SMTP : notification navigateur, webhook, message dans une
> réponse HTTP que le client transforme en alerte. (c) L'ordonnanceur Scalingo
> se configure **hors dépôt** — l'audit ne pouvait pas le voir. Si tu ne peux
> pas trancher, rends `NON VÉRIFIABLE` et nomme-le : c'est une limite à écrire,
> pas à deviner.

---

### NIVEAU 3 — l'inventaire, la méthode, les propositions

*Six affirmations. Un `RÉFUTÉE` ici est une dette de méthode, pas un incident.
La dernière demande un **jugement**, pas un contre-exemple.*

**N3.1 · Les 118 objets « sans client » le sont vraiment.** L'audit classe 590
objets en vivant / sans producteur / sans consommateur / orphelin / derrière
drapeau éteint / incertain. *Tire **dix** objets au hasard parmi les 118 non
vivants — dont au moins trois tables et trois routes — et vérifie chacun par
deux greps indépendants. Un seul faux positif sur dix condamne la colonne
entière : dis-le en ces termes.*

**N3.2 · Les treize silences et les vingt-trois machines à états sont exacts.**
*Prends les trois machines à états les plus lourdes de conséquence (la
Consultation, l'Assignation, la SyntheseIA) et vérifie que les transitions
déclarées « sans surface » n'en ont réellement aucune.*

**N3.3 · Les 27 propositions ne violent aucun invariant du dépôt.** L'audit
affirme qu'aucune n'introduit de seuil clinique, de table événement parallèle,
de texte patient hors registre signé, ni de migration non gatée. *Cherche celle
qui viole. Regarde en priorité R-08 (« aucune règle clinique dans un composant
d'affichage »), R-27 (la frise en projection) et les seize propositions de
vague 2 qui déclarent une migration ou un gate.*

**N3.4 · Les deux constats réfutés par la contre-lecture l'ont été à juste
titre.** F-096 affirmait qu'aucun test n'oppose deux acteurs ; F-103 que rien
dans 6.0-A/B n'est hash-verrouillé. *Une contre-lecture qui tue un vrai constat
est une faute symétrique de celle qui en laisse passer un faux. Vérifie les deux
motifs de réfutation, et notamment le second, qui est un « à moitié vrai ».*

**N3.5 · Les trois constats que le juge déclare non adressés le sont
réellement.** F-031, F-030 et F-007 sont annoncés comme couverts par aucune
proposition. *Vérifie, et dis si d'autres P1 sont dans le même cas sans que le
juge l'ait vu.*

**N3.6 · La méthode elle-même — jugement demandé, pas contre-exemple.**

> L'audit repose sur onze cartographes qui se sont partagé le parcours par
> segments, puis sur dix lentilles qui ont cherché séparément. Deux risques
> structurels en découlent, et l'audit ne peut pas les mesurer sur lui-même :
> **la couture** — un défaut qui vit exactement à la frontière de deux segments
> n'appartient à personne ; et **la corrélation** — dix lentilles qui lisent le
> même code peuvent partager le même angle mort. Juge si les 106 constats
> portent la marque de ces deux biais, et dis où tu chercherais si tu devais
> lancer une seconde passe.

---

## 5. Ce que l'audit a manqué — la partie qui vaut le plus

Cette section n'a pas d'affirmation à réfuter : elle te demande de **produire**.
C'est le seul endroit où tu peux rendre ce qu'un auditeur ne peut pas trouver
sur lui-même.

Cherche, dans cet ordre :

1. **Un défaut de la classe P0 que l'audit n'a pas vu du tout** — pas
   sous-coté : absent. Perte d'écriture, franchissement d'appartenance, donnée
   d'un dossier servie dans un autre, effacement incomplet.
2. **Une ramification entière absente de la dateline** : un chemin d'erreur, une
   reprise, une expiration, une concurrence entre deux gestes simultanés.
3. **Un constat vrai mais dont la cause proposée est fausse** — l'audit nomme
   une cause mécanique pour plusieurs de ses constats. Une cause fausse envoie
   corriger au mauvais endroit.
4. **Une décision du dépôt que l'audit contredit sans le savoir** : il cite
   `docs/DECISIONS.md`, mais pas exhaustivement. Une proposition qui rouvre une
   décision fermée est pire qu'une proposition inutile.

Pour chaque trouvaille : `fichier:ligne`, chemin de données, effet obtenu, et la
gravité que tu proposes avec son scénario.

---

## 6. Ce qu'il ne faut PAS faire

- **Ne propose aucun refactoring, renommage ni réorganisation**, et n'écris
  aucun patch.
- **Ne re-signale pas les deux limites déclarées de l'audit** (n'a pas lu la
  production, n'a joué aucun test) : elles sont écrites dans la page. Montrer
  qu'une conclusion **précise** en dépend, en revanche, vaut beaucoup.
- **Ne re-signale pas les dettes déjà nommées au dépôt** sans montrer qu'elles
  sont plus larges qu'annoncé : `assessment_episodes.milestone` sans CHECK,
  `neCouvrePas` null sur les 95 interventions, `packs.qids` en double source, le
  commentaire périmé du verrou `isCbResultsEnabled`.
- **Ne prends pas ces choix d'architecture pour des défauts** : le portail est
  en pull **par décision** ([[D-111]] : « relancer le patient » a été écarté) ;
  les drapeaux sont fail-closed par convention ; le mode clair unique et
  l'absence de bascule de thème sont l'arbitrage A5 ; l'indifférenciation des
  réponses d'entrée au portail est une garde anti-énumération, pas une paresse
  d'interface.
- **Ne juge pas la mise en forme de l'artefact.** Sa cible est l'analyse.

---

## 7. Format de restitution attendu

1. **Tableau des verdicts** — une ligne par affirmation : identifiant (`N1.1`…),
   énoncé court, verdict, motif en une phrase.
2. **Une section par verdict `RÉFUTÉE`, `AFFAIBLIE` ou `ÉLARGIE`**, dans l'ordre
   des niveaux, avec `fichier:ligne`, le chemin de données complet, l'effet
   obtenu, et la sortie de toute commande exécutée.
3. **Section « Ce que l'audit a manqué »** (§5), trouvaille par trouvaille, avec
   la gravité proposée et son scénario.
4. **Limites de couverture** — ce que tu n'as pas pu vérifier, et pourquoi.

Compte final en une ligne : *N réfutées (dont X au niveau 1), M affaiblies,
E élargies, R résistent, V non vérifiables, plus K trouvailles neuves.*
