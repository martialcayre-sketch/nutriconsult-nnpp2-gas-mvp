# Contre-revue adverse — la construction de l'objectif négocié (2026-09-08)

*Prompt unique, à coller dans l'extension Codex. Sa cible n'est pas un diff :
c'est un **compte rendu de lecture**. Neuf lecteurs se sont partagé le
sous-système de l'alliance et ont rendu 404 faits, un parcours à deux voies en
14 gestes, 10 silences et une chronologie de production. Cette passe cherche à
en falsifier les affirmations portantes avant qu'elles ne commandent des lots —
et à produire ce qu'un auteur ne peut pas trouver sur lui-même.*

> **Statut : rédigé, PAS ENCORE JOUÉ.** Ce fichier est l'énoncé de la passe, pas
> son résultat. Il est versionné parce qu'une contre-revue dont on ne peut plus
> relire la question posée n'est pas auditable.
>
> La passe se lance **manuellement par le responsable** — jamais par un agent
> ([[D-105]]). Le résultat viendra dans un fichier distinct,
> `REVUE_CODEX_ADVERSE_OBJECTIF_NEGOCIE_<date>.md`, à côté de celui-ci.

---

## 0. Ce que tu fais, et en quoi c'est différent d'une revue de code

Tu ne revois **pas** un diff. Tu attaques les **affirmations d'un compte
rendu** — donc quatre choses peuvent être fausses, et pas seulement une :

1. **le fait** : le code ne fait pas ce que le compte rendu dit qu'il fait ;
2. **la qualification** : le fait est exact, mais ce n'est pas un défaut — c'est
   un arbitrage daté du responsable, ou une dette déjà nommée avec son véhicule,
   et le compte rendu l'a présenté comme une découverte ;
3. **l'inférence** : le fait est exact et c'est bien un défaut, mais la
   conclusion qu'on en tire ne s'ensuit pas ;
4. **la portée** : le fait est exact, mais il vaut sur un chemin seulement,
   ou au contraire sur beaucoup plus de chemins qu'annoncé.

Une cinquième catégorie compte autant que les quatre autres, et c'est la seule
qu'un auteur ne peut pas produire sur lui-même : **ce que le compte rendu a
manqué** (§5, §6, §7). Un compte rendu qui se trompe se corrige ; un compte
rendu qui rassure à tort oriente les lots suivants vers le vide.

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
  `find`, `git log`, `git show`) et, si tu les annonces, `npm run check` et
  `npm run test:worktree -- --fast` depuis `web/`.
- **Ne touche pas à la base de production.** Aucune écriture, aucun SQL mutant,
  aucun `scalingo run`.
- **Aucune identité patient réelle dans ta sortie.** Les seules identités
  admissibles sont les fixtures : **Sophie Nicola, Jennifer Martin, Michel
  Dogné**. Si tu rencontres autre chose qui ressemble à une identité réelle,
  signale son **emplacement sans la recopier**. Les dossiers réels se désignent
  par identifiant (`PAT0xx`).
- **Réponds en français.**
- **Ne juge aucun arbitrage clinique ni produit.** Que le portail soit en
  tirage, que l'échelle 0-10 ne soit agrégée par rien, que la priorité reste un
  libellé libre : ce sont des décisions prises et datées. Tu vérifies qu'elles
  sont **implémentées telles qu'énoncées** et que le compte rendu les
  **qualifie correctement**, jamais qu'elles sont bonnes.
- **Ne corrige rien.** Ta sortie est un verdict, pas un patch.

---

## 2. Périmètre

**Cible** : le compte rendu produit le 2026-09-08, lu sur `main` au commit
**`e67743dc`**. Les affirmations ci-dessous en sont extraites **verbatim** : tu
n'as pas besoin de la page pour travailler, ce fichier est autoportant. Si la
page t'est fournie, elle ne fait pas autorité contre le code — le code fait
autorité contre elle.

**Sous-système visé** — l'alliance, campagnes 6.0-A (« le dossier à deux voix »)
et 6.0-B (« l'objectif à trois voix ») :

| Zone | Chemins |
|---|---|
| Modules purs | `web/src/lib/praticien/{objectifNegocie,propositionObjectif,assemblageProposition,syntheseComprehension,sourceSigneeVerifiee}.ts` |
| Routes praticien | `web/src/app/api/praticien/{objectifs,propositions-objectif,comprehension,ce-qui-compte,equilibre}/` |
| Routes portail | `web/src/app/api/portail/{dossier,comprehension,ce-qui-compte}/` |
| Écrans praticien | `FichePatientPanel.tsx`, `patient-cockpit/{ObjectifNegociePanel,ComprehensionPanel,CeQuiComptePanel,ClinicalRuntimeSection}.tsx` |
| Écrans patient | `patient-companion/{DossierDeuxVoixView,ComprehensionView,LienDossierDeuxVoix}.tsx`, `app/portail/[token]/{dossier,comprehension}/` |
| Canal | `lib/consultation/email.ts`, `lib/correspondance/registreGabarits.ts`, `lib/patient/patient.ts` |
| Jalons | `lib/protocol/{jalonObjectifDu,ancresPersistees}.ts` |
| Base | `web/prisma/schema.prisma` (neuf tables de l'alliance), `web/prisma/migrations/2026082*`, `2026082515*`, `web/prisma/checks/alli_*` |
| Épreuves | les `*.test.ts(x)` de ces chemins, `*.guard.test.ts`, `web/e2e/portail-dossier-deux-voix.spec.ts`, `web/e2e/helpers/db.ts` |
| Doctrine | `docs/DECISIONS.md`, `docs/claude/campagnes/2026-08-21-*`, `2026-08-23-*`, `docs/claude/doctrine/` |

Hors sujet : le déploiement, `release-db`, l'outillage CI, `archive/gas-legacy/`,
le moteur clinique `web/src/lib/clinical-engine/` (6.0-B ne le touche jamais).

**Trois limites déclarées du compte rendu**, à ne pas re-signaler comme
trouvailles — mais à **utiliser** :

- il a lu le dépôt, **jamais la production** : tout chiffre de base est repris
  de décisions et de bilans datés, et vieillit. Toute affirmation de la forme
  « en production, X » est au mieux une citation, et c'est une classe entière
  d'attaque ;
- il n'a **joué aucun test** : une couverture y est jugée sur le contenu des
  fichiers d'épreuve, pas sur une exécution ;
- **sa passe de fusion a manqué.** La synthèse automatique est morte deux fois
  sur une limite de session ; la page a été assemblée à la main depuis neuf
  lectures condensées. Aucune passe n'a donc arbitré les **contradictions entre
  deux dimensions**. C'est ton meilleur angle structurel, et le §4 N3.6 t'en
  donne une, déjà repérée et non tranchée.

---

## 3. Méthode et seuil de preuve

Chaque affirmation reçoit **exactement un** verdict :

| Verdict | Signification |
|---|---|
| **`RÉFUTÉE`** | le fait est faux, ou la qualification est fausse (décision datée, dette déjà nommée), ou l'inférence ne suit pas — avec `fichier:ligne` ou `D-xxx:ligne` |
| **`RÉSISTE`** | aucun contre-exemple recevable trouvé |
| **`AFFAIBLIE`** | le fond tient mais une branche est fausse, ou la portée est plus étroite qu'annoncée — **dis laquelle, et de combien** |
| **`ÉLARGIE`** | le fond tient et le défaut est **plus large** que le compte rendu ne le dit — c'est le verdict le plus utile de tous |
| **`NON VÉRIFIABLE`** | un élément nécessaire manquait — **nomme lequel** |

Chaque trouvaille neuve est **`CONFIRMÉE`** (chemin lu ou commande exécutée de
bout en bout) ou **`PLAUSIBLE`** (un maillon reste supposé — **nomme ce
maillon**).

**Six exigences sur la preuve :**

1. **Cite fichier et ligne** pour chaque constat, et donne le chemin de données
   complet — de l'entrée jusqu'à l'effet.
2. **Une commande annoncée est une commande exécutée**, dont tu donnes la
   sortie. Sinon : `NON VÉRIFIABLE`, jamais `RÉFUTÉE`.
3. **Une ligne qui a bougé ne réfute pas un fait.** Les numéros ci-dessous ont
   été lus à `e67743dc`. Si `main` a avancé, cherche le symbole avant de
   conclure à l'erreur, et dis-le si le décalage est réel.
4. **Ne confonds pas « rien ne l'en empêche ici » et « rien ne l'en empêche ».**
   Un verrou permissif dont un contrepoids existe ailleurs ne réfute rien : va
   chercher le contrepoids avant de conclure. C'est l'erreur que cette classe de
   passe commet le plus souvent.
5. **Un `grep` négatif n'est pas une preuve d'absence** tant que tu n'as pas
   essayé au moins deux orthographes et le nom du symbole importé. Le compte
   rendu s'appuie lourdement sur des absences — dix silences, un inventaire
   d'objets sans client : c'est sa faiblesse méthodologique principale, et donc
   ton meilleur angle de détail.
6. **Un commentaire n'est pas un comportement.** Le compte rendu affirme avoir
   tranché plusieurs contradictions « code contre commentaire » en faveur du
   code. Vérifie qu'il a tranché dans le bon sens — et cherche celles qu'il n'a
   pas vues.

---

## 4. Les affirmations, par niveau

### NIVEAU 1 — celles qui commandent ce qui sera construit

*Six affirmations. Une seule fausse ici et le cadrage qui s'appuie dessus part
de travers. Traite ce niveau en entier avant tout autre.*

---

**N1.1 · Deux versions courantes peuvent coexister, aucun verbe ne les
départage, et le portail promet au patient un geste qui n'existe pas.**

Énoncé : `objectifsCourants` rend **toutes** les têtes de chaîne
(`web/src/lib/praticien/objectifNegocie.ts:305-330`) ; le cockpit les affiche
avec un `role=status` « N versions courantes coexistent »
(`ObjectifNegociePanel.tsx:929`) ; le portail pose `ratifiable = false`
(`api/portail/dossier/route.ts:490`), cache les boutons
(`DossierDeuxVoixView.tsx:379`) et refuse tout POST en **409
`objectif_discordant`** (`route.ts:619-623`) en annonçant que le praticien les
départagera. Or **aucune route, aucun écran, aucune contrainte** ne départage :
pas de verrou en base, pas d'`UNIQUE`, pas de verbe
(`api/praticien/objectifs/route.ts:795-799` ;
`LOT-02-objectif-negocie-v1.md:132-137`). Elles naissent aussi **par
construction** : une reprise crée toujours une tête neuve, même si un objectif
courant existe déjà.

> **C'est l'affirmation la plus lourde du compte rendu** : elle décrit un état
> **durable** dans lequel le patient est muet et le praticien sans recours,
> atteignable sans course, par un geste ordinaire.
>
> **Attaque-la par cinq angles.** (a) Une reformulation sur **chacune** des deux
> têtes réduit-elle vraiment à une seule tête, ou en produit-elle deux
> nouvelles ? Déroule `chaineDObjectif` et `objectifsCourants` sur ce cas. (b)
> Existe-t-il un chemin d'écriture hors des deux routes — script, effacement
> partiel, seed — qui retire une tête ? (c) L'effacement RGPD est-il le seul
> moyen de sortir de l'état ? (d) La reprise refuse-t-elle réellement quand une
> tête existe : lis `verifierReprise` et la garde `reprise_sur_revision`
> (`objectifs/route.ts:494-498`, `:527-555`). (e) **La qualification** : le
> `LOT-02` écrit que poser un verrou « serait une décision propre ». Est-ce donc
> une dette nommée et non un défaut découvert — et le compte rendu s'est-il
> trompé de catégorie ?

---

**N1.2 · L'e-mail de notification ne lit aucun drapeau : il part même quand la
surface patient est fermée, et promet alors une page qui rend 404.**

Énoncé : `notifierObjectifPropose` n'importe ni ne teste
`WN_DOSSIER_DEUX_VOIX` (`api/praticien/objectifs/route.ts:434-446`, `:8-9`) ;
le gabarit `objectif_propose@1` invite à « le contester ou proposer une autre
formulation » (`lib/correspondance/registreGabarits.ts:437`) ; or la page
`/portail/[token]/dossier` rend `notFound()` drapeau éteint
(`app/portail/[token]/dossier/page.tsx:19`), la route rend 503
(`api/portail/dossier/route.ts:321`) et le lien de navigation n'apparaît pas
(`LienDossierDeuxVoix.tsx:46`).

> **Vérifie les quatre maillons séparément** : que la notification est bien
> appelée sur les deux voies (`route.ts:877` objectif ordinaire et `:912`
> reprise) ; que la phrase du gabarit figure au mot près ; que la page rend bien
> `notFound()` et non une coquille ; et que le drapeau **peut** réellement être
> éteint alors que la route praticien reste ouverte — la route des objectifs
> n'est gardée par aucun drapeau, sauf la reprise.
>
> Puis juge **l'inférence** : le compte rendu en conclut que la promesse est
> tenue ou non selon un état hors dépôt. Le drapeau est documenté posé depuis le
> 2026-08-23 ([[D-110]]) — si c'est vrai, le scénario est-il seulement
> théorique ? **Dis-le en ces termes**, et cherche alors le cas atteignable
> drapeau posé : deux têtes coexistantes, après que chaque tête a envoyé son
> e-mail (`route.ts:877`, `:912` puis `dossier/route.ts:490`).

---

**N1.3 · Rien ne revient vers le praticien : ratification, contestation,
amendement et réponse d'étape n'écrivent qu'une ligne, et le 201 de la route
praticien ne porte aucun champ d'envoi.**

Énoncé : `POST /api/portail/dossier` écrit et rend 201 sans notifier
(`api/portail/dossier/route.ts:76-78`, `:791-864`) ; aucune entrée dans le fil
praticien ; le praticien ne l'apprend qu'en rouvrant la phase 3. Symétriquement,
le 201 de `POST /api/praticien/objectifs` ne porte pas l'état de l'envoi
(`objectifs/route.ts:878`, `:913`, à comparer à `api/praticien/consultations/route.ts:35`)
et le panneau n'en dit rien (`ObjectifNegociePanel.tsx:525-538`) : ni l'envoi
réussi, ni le `Non_envoye`, ni l'échec ne remontent dans la phase Compréhension.
L'échec ne se lit que dans l'onglet Correspondance
(`FichePatientPanel.tsx:1774`), **sans sa cause** : `erreurCourte` est
journalisée (`lib/patient/patient.ts:53`) mais absente du `select`
(`api/praticien/correspondance-medecin/route.ts:243-252`) et du rendu
(`CorrespondanceMedecinPanel.tsx:167-183`).

> **La qualification est l'angle principal.** Le modèle en tirage est une
> **décision** : [[D-111]] écarte explicitement la relance. Le compte rendu
> présente-t-il comme un défaut ce qui est un arbitrage ? Distingue les deux
> moitiés : l'absence de notification (décidée) et l'absence de **surface de
> retour d'envoi** dans la phase où le geste a lieu (jamais décidée nulle part —
> vérifie-le en cherchant dans `docs/DECISIONS.md`).
>
> Puis cherche le **contrepoids** : y a-t-il un compteur, un badge, un encart de
> tableau de bord, une ligne de fil qui signale au praticien qu'un patient a
> répondu ? Cherche dans `api/praticien/fil`, `nouveaux-patients/route.ts`,
> `MeteoAdhesionPanel`, `MomentumPanel`. Un seul contrepoids trouvé affaiblit
> l'affirmation.

---

**N1.4 · Chaque nouvelle version remet le patient au silence, et renvoie un
e-mail.**

Énoncé : l'état d'une version est le dernier geste, calculé sur
**l'identifiant de version exact**
(`lib/praticien/objectifNegocie.ts:432-454`) ; toute écriture praticien crée une
ligne neuve, donc une tête en `en_attente` ; et **toute** écriture non-reprise —
première rédaction, reformulation, citation d'amendement — passe par le même
`create` puis `notifierObjectifPropose` (`objectifs/route.ts:877`). Il n'existe
ni dédoublonnage ni relance. Rien ne marque un amendement comme « lu » ou
« intégré », et rien n'empêche deux versions successives de citer le même texte
(`docs/DECISIONS.md:3813-3818`).

> **Trois angles.** (a) [[D-154]] §7 n'exclut que « une autre porte » : le code
> et la décision sont-ils compatibles, ou le compte rendu a-t-il transformé une
> tolérance en défaut ? (b) **Aucun banc n'asserte l'envoi sur la voie de
> reprise** (`objectifs/route.test.ts:1053` ; l'envoyeur est moqué en
> `beforeEach`, `:48-49`, `:114-115`) — la ligne `:912` est-elle réellement
> atteinte, ou le compte rendu l'a-t-il déduite ? Déroule-la. (c) Cherche la
> **borne** : combien d'e-mails un praticien peut-il déclencher en corrigeant
> trois fois une formulation en dix minutes ? Y a-t-il une cadence quelque part
> (`web/src/middleware.ts`, la route, l'envoyeur) ?

---

**N1.5 · Le statut de la phase 3 « Compréhension » ne lit rien de l'objectif.**

Énoncé : « renseignée » / « en attente du patient » se calcule **uniquement**
sur les couvertures des douze besoins servies par
`GET /api/praticien/equilibre` (`FichePatientPanel.tsx:747-749`) ; les
dépendances de `statutPhase` sont `[data, assignationsModif, etatCorrections,
reponses, etatRuntime]` (`:771`) et ne comprennent ni objectif, ni proposition,
ni ratification, ni synthèse, ni désaccord. Un objectif ratifié ne change rien
au rail. Le troisième statut, « indéterminée », **n'est jamais visible** : la
fiche retourne avant le rail (`:881`). Aucun banc n'asserte ce statut.

> **C'est l'affirmation qui porte la lecture de l'écran praticien.** Vérifie
> `statutPhase` ligne à ligne, et surtout : le compte rendu en tire que le rail
> **ne peut pas** dire au praticien qu'un objectif attend une réponse. Cherche
> le contrepoids ailleurs dans la fiche — `phaseDue`, le fil « Prochaine
> étape » (`:1487`), l'eyebrow « Phase due » (`:1670`), un `Chip`, un badge de
> l'onglet. Si un de ces éléments consomme l'objectif, l'affirmation tombe ou
> s'affaiblit.
>
> Juge aussi la **qualification** : la revue Codex du 2026-09-05 avait déjà
> relevé que « le rail dérive Compréhension de la couverture scorée » (N2.6, qui
> avait résisté). Le compte rendu re-signale-t-il une dette déjà nommée en la
> présentant comme neuve ?

---

**N1.6 · L'assemblage des propositions est déclenché par le navigateur, à toute
confirmation d'épisode, jamais sur un rejeu — et son échec est silencieux.**

Énoncé : `ClinicalRuntimeSection` envoie `POST …/propositions-objectif
{action:'assembler'}` à la réponse `ready` de `POST /api/praticien/cockpit`
(`ClinicalRuntimeSection.tsx:839-894`, `:928`) ; un rejeu par `GET /cockpit`
rend `rejoue: true` et n'assemble rien (`api/praticien/cockpit/route.ts:474`,
choix [[D-118]]) ; l'échec est absorbé par un `catch` vide et le 503 nominal
n'est pas signalé (`:955-962`). Le compte rendu déclare **périmés** trois
commentaires de la route qui disent que le panneau appelle `assembler`
(`propositions-objectif/route.ts:394-395`, `:613`, `:723`) : seul
`ClinicalRuntimeSection.tsx:928` assemble, `ObjectifNegociePanel` ne fait que
`GET`, `POST objectifs` et `POST ecarter`.

> **Vérifie le producteur unique** par `grep` sur `'assembler'` dans `web/src`,
> puis sur `propositions-objectif` : combien d'appelants ? Si un second existe
> (test monté en page, script, route interne), l'affirmation tombe.
>
> Puis attaque **la conséquence non écrite** : si l'assemblage n'a lieu qu'à la
> confirmation d'un épisode, et que la production compte 4 épisodes T0 confirmés
> pour 4 propositions, la machine ne peut proposer qu'aux dossiers qui ont un
> cycle. **Est-ce dit quelque part au dépôt, ou est-ce une conséquence que
> personne n'a écrite ?** Et une assemblée devenue vide ne retire pas la
> précédente (`route.ts:693-695`) : combien de temps une assemblée périmée
> reste-t-elle vivante à l'écran ?

---

### NIVEAU 2 — la mécanique et le modèle

*Sept affirmations. Un `RÉFUTÉE` ici ne change pas le cadrage mais corrige une
description qui sera reprise telle quelle par les lots suivants.*

**N2.1 · L'append-only tient par convention et par bancs, jamais par la base.**
Aucune route n'exporte `PATCH`, `PUT` ni `DELETE` ; un seul `create` par geste ;
`creeLe` posé par la base et jamais transmis (`objectifs/route.ts:869-871`) ;
G5 balaie l'application (`objectifNegocie.guard.test.ts:518`) ; et **aucune
contrainte `UNIQUE` nulle part** dans les neuf tables. *Vérifie les trois : lis
les `export` de chaque route du périmètre ; cherche un `update`/`upsert`/
`deleteMany` hors `lib/patient/effacement.ts` ; et compte les `UNIQUE` dans les
migrations `2026082*`. Signale en particulier que **aucune garde n'épingle
`objectifNegocie.create` à un écrivain unique** — G5 n'interdit que
`update`/`delete`/`upsert` (`guard.test.ts:410`) : est-ce exact, et
qu'est-ce que cela ouvre ?*

**N2.2 · L'écran désigne, le serveur recopie.** `enoncePatient` n'est jamais
pris du corps pour une révision, une reprise ou un amendement cité
(`objectifs/route.ts:58-63`) ; seul un fragment de nature `anamnese` est citable
(422 `fragment_non_citable`). *Cherche le contournement : un corps qui porte à
la fois `enoncePatient` et `supersedesObjectifId` est-il vraiment refusé ? Et la
reprise vérifie « assemblée courante ET non disposée », **non**
`propositionsVivantes` (`objectifs/route.ts:494-498`) : une quatrième
proposition d'une assemblée anormalement grande, jamais affichée, est-elle
reprenable par POST direct ?*

**N2.3 · Quatre colonnes de déclaration ne sont écrites par personne.**
`geste_le`, `exprime_le`, `repondu_le`, `dispose_le` existent en base et restent
nulles (`portail/dossier/route.ts:791-851` ; `propositionObjectif.ts:315-322` ;
`schema.prisma:2371-2510`). *Prouve-le autrement que par le compte rendu :
cherche chaque nom en camelCase et en snake_case, dans `web/src`, `web/prisma`
et `web/e2e`. Un seul écrivain trouvé réfute.*

**N2.4 · Les fenêtres d'étape s'ancrent au `confirmedAt` de l'ancre de rang le
plus haut, jamais à la plus récemment confirmée** (`ancresPersistees.ts:58-64`),
et ouvrir T1 ferme les fenêtres de T0 **sans qu'aucune ligne ne soit écrite**.
*Vérifie `ancreCourante`, puis le passage de `dateT0` par la route
(`portail/dossier/route.ts:507`) — l'en-tête de `jalonObjectifDu.ts:9` dit
encore « T0 le plus récent » et le compte rendu le déclare périmé. Tranche. Puis
juge la conséquence : « un patient à J85 perd sa question J90 » est-il un
arbitrage nommé et non tranché, comme l'affirme le bilan, ou un défaut ?*

**N2.5 · L'échelle 0-10 est stockée brute et n'alimente rien** — aucune moyenne,
courbe ni seuil (`migration 20260825150000:90-104` ; garde G2-bis
`objectifNegocie.guard.test.ts:285`). *C'est une décision ([[D-111]] §3). Ne la
juge pas : vérifie seulement qu'aucun consommateur n'existe, y compris un tri ou
un `reduce` sur les identifiants, et que la garde couvre les deux surfaces.*

**N2.6 · Un geste posé sur une version supplantée n'a aucune surface
praticien.** L'état n'est calculé que pour les têtes
(`objectifs/route.ts:365`) ; un amendement écrit sur v1 s'affiche sous la chaîne
de v2 (`ObjectifNegociePanel.tsx:958-960`) pendant que le pied de v2 dit
« Aucune réponse du patient enregistrée » (`:255`). *Vérifie l'asymétrie avec le
portail, qui rend ces paroles **à part** (« sur une formulation précédente »,
`DossierDeuxVoixView.tsx:681-687`) et **perd** jalon et EVA à l'affichage
(`:717-731`) là où le cockpit les garde (`ObjectifNegociePanel.tsx:1050-1063`).
Le compte rendu dit l'asymétrie voulue et commentée : est-ce vrai des deux
côtés ?*

**N2.7 · La date de l'accord se perd à chaque révision.** « Reformuler cette
version » reprend reformulation, priorité et « non traité », mais pas
`negocieLe` : les seuls `setNegocieLe` sont la remise à zéro et le champ de
saisie (`ObjectifNegociePanel.tsx:528`, `:1252`, `:1084`). *Vérifie, et dis si
c'est un oubli ou un choix : les autres reprises de champs sont justifiées en
commentaire, celle-ci ne l'est nulle part. Puis regarde l'effet côté patient —
« Convenu le … » disparaît-il de son écran à la révision suivante ?*

---

### NIVEAU 3 — la production, les documents, la méthode

*Six affirmations. Un `RÉFUTÉE` ici est une dette de méthode, pas un incident.
La dernière demande un **jugement**, pas un contre-exemple.*

**N3.1 · La chronologie de production est exacte et entièrement documentaire.**
23/08 gate 6.0-A, cinq tables vides ; 26/08 neuf tables à zéro, 21 dossiers,
**zéro T0 confirmé**, drapeau du moteur absent ([[D-112]], `BILAN.md:9`) ; 28/08
drapeau posé (`GRILLE_CONSTATS_2026-10-04.md:25`) et premier T0 réel
([[D-118]], `SESSION_LOG.md:4987`) ; 06/09 quatre propositions, un objectif,
zéro retour (`docs/DECISIONS.md:76`) ; 08/09 [[D-154]]. *Vérifie chaque chiffre
à sa ligne. Le compte rendu déclare que « 25 dossiers » **n'a aucune source dans
le dépôt** : confirme ou infirme par `grep`. Et dis si un chiffre cité est
lui-même repris d'une source qui ne l'établit pas.*

**N3.2 · Trois écarts entre les documents et le code sont réels.** (a) [[D-154]]
§4 et le changelog disent le gabarit `valideLe: null` ; le registre porte
`valideLe: '2026-09-08'` (`registreGabarits.ts:467`). (b) Quatre commentaires
disent encore les drapeaux non posés (`playwright.config.ts:208` ;
`ObjectifNegociePanel.tsx:248-249` ; `ClinicalRuntimeSection.tsx:918-919`,
`:956`). (c) Trois décomptes de tables coexistent — cinq, sept, neuf — pour un
effacement qui en nomme neuf et un utilitaire d'épreuve qui en efface sept
(`web/e2e/helpers/db.ts:75`). *Vérifie les trois, et cherche le quatrième que le
compte rendu n'a pas vu.*

**N3.3 · La couverture est segmentée, jamais de bout en bout.** Le seul E2E joue
la voie patient avec un objectif **inséré en base**
(`web/e2e/helpers/db.ts:107`) ; `WN_OBJECTIF_PROPOSE` n'est posé sur aucun banc
(`playwright.config.ts:221`) ; aucun E2E ne joue « le dire autrement », l'écran
praticien, ni l'e-mail. *Vérifie, puis regarde le trou de garde : le banc E2E
**crée une ratification directement en base** (`db.ts:611`) alors qu'une garde
impose un écrivain unique — mais cette garde ne balaie que `src/app`,
`src/components` et `src/lib` (`guard.test.ts:400`). La garde est-elle
contournable ailleurs, et par du code de production ?*

**N3.4 · Les dix silences sont réels.** Voir §6 : c'est le cœur de la passe
« code sans client », traité séparément.

**N3.5 · Les contradictions « code contre commentaire » ont été tranchées dans
le bon sens.** Le compte rendu en revendique une dizaine, toujours en faveur du
code. *Prends-en quatre au hasard et rejuge-les. Un seul mauvais arbitrage
condamne la méthode : dis-le en ces termes.*

**N3.6 · La garde des ancres ne tient que par un contrat SQL que rien ne joue
hors CI — et deux commentaires du module disent encore le contraire.**

*Contexte, déjà tranché après la rédaction du compte rendu : deux de ses
dimensions se contredisaient sur les ancres. La migration
`20260828090000_episodes_identite_cycle_v1` ([[D-114]]) pose bien un `CHECK` sur
`milestone` (`:32-33`) **et** un index unique **partiel**
`(id_patient, milestone) WHERE milestone LIKE 'T%'` (`:48-50`). Deux ancres de
même rang sont donc impossibles en base depuis le 2026-08-28. Les commentaires
`ancresPersistees.ts:19` et `:51` (« la colonne ne porte AUCUN CHECK », « rien
n'interdit ce doublon en base ») sont **périmés** : à verser à N3.2. Ne rejoue
pas cette vérification.*

Ce qui reste ouvert, et qu'on te demande : **l'index est partiel et vit en SQL
brut**. La migration l'écrit elle-même — « Prisma ne sait pas déclarer d'index
partiel, donc le *drift check* ne le voit pas, et c'est le contrat SQL qui garde
son existence ». Or le compte rendu affirme par ailleurs que **les contrats SQL
ne sont lancés que par `ci.yml`** : aucun script de `web/package.json` ne les
exécute.

> *Vérifie les deux maillons.* (a) Le contrat `episodes_identite_cycle_v1.sql`
> asserte-t-il réellement l'**existence de l'index**, ou seulement le `CHECK` ?
> Lis-le. (b) Est-il joué ailleurs que dans `ci.yml` — `npm run check`,
> `test:worktree`, un script de `scripts/` ? (c) Si les deux réponses sont
> mauvaises, alors une suppression d'index passerait le *drift check*, la suite
> locale et la revue : dis ce que cela vaut comme gravité, et si le même patron
> couvre les **autres index partiels** du dépôt (`assignations_unicite_ouverte_idx`
> est nommé comme précédent — cherche les autres).

---

## 5. Ce que le compte rendu a manqué — la partie qui vaut le plus

Cette section n'a pas d'affirmation à réfuter : elle te demande de **produire**.

Cherche, dans cet ordre :

1. **Un défaut de la classe P0 que le compte rendu n'a pas vu du tout** — pas
   sous-coté : absent. Perte d'écriture patient, écriture perdue sous une
   réponse `ok`, franchissement de la garde d'appartenance `praticienEmail`,
   parole d'un dossier servie dans un autre, effacement incomplet d'une des neuf
   tables, secret exposé. Le compte rendu n'affiche **aucune** gravité : c'est
   en soi une absence de méthode, et il ne peut pas la mesurer sur lui-même.
2. **Une ramification entière absente du parcours** : le parcours compte 14
   gestes et se veut complet. Cherche ce qu'il ne montre pas — deux gestes
   simultanés sur la même version, un dossier clos pendant qu'un patient répond
   (le portail accepte, la route praticien refuse 409), une session qui expire
   entre la lecture et le POST, un effacement RGPD pendant un envoi, un second
   cycle ouvert pendant une fenêtre, un rejeu réseau du même « Envoyer où j'en
   suis ».
3. **Un constat vrai dont la cause proposée est fausse.** Le compte rendu conclut
   que « l'appareil est complet, ouvert, et n'a toujours pas de sujet ». Est-ce
   la bonne cause ? Cherche une cause mécanique qu'il n'a pas vue — une garde
   qui ferme un chemin plus tôt qu'il ne le croit, une condition d'affichage qui
   n'est jamais vraie, une précondition de fenêtre inatteignable.
4. **Une décision du dépôt que le compte rendu contredit sans le savoir.** Il
   cite dix décisions ; `docs/DECISIONS.md` en compte cent cinquante.

Pour chaque trouvaille : `fichier:ligne`, chemin de données, effet obtenu, et la
gravité que tu proposes avec son scénario.

---

## 6. Code sans client — inventaire adverse

*Le dépôt a déjà une doctrine sur ce point : l'audit du 2026-09-05 avait classé
590 objets et en avait trouvé 118 sans client. Cette section demande le même
travail, mais **exhaustif sur un petit périmètre** : les neuf tables de
l'alliance, leurs colonnes, les routes qui les servent, les champs exposés par
leurs DTO, et les branches d'écran qui les rendent.*

**Méthode.** Pour chaque objet, deux `grep` indépendants : un producteur
(qui l'écrit ou le sert), un consommateur (qui le lit ou le rend). Classe en
**vivant** / **sans producteur** / **sans consommateur** / **inatteignable** /
**derrière un drapeau éteint**. Un objet servi par une route mais jamais rendu
par un écran est **sans consommateur**, pas vivant.

**Ce que le compte rendu a déjà relevé — ne le re-signale pas, vérifie-le et
cherche ce qui manque :**

| Objet | Classement annoncé | Preuve citée |
|---|---|---|
| `geste_le`, `exprime_le`, `repondu_le`, `dispose_le` | sans producteur | `portail/dossier/route.ts:791-851` |
| `dispositions_proposition.motif` | sans consommateur | `propositions-objectif/route.ts:294-302`, `:374-377` |
| `hash_sources` | sans consommateur hors idempotence | `propositions-objectif/route.ts:119` |
| `praticien_email` sur trois tables | exposé par aucune forme épinglée | `objectifs/route.ts:77-90`, `:200-211` |
| `non_traite_motif`, `non_traite_depuis_le` | jamais servis au patient | `portail/dossier/route.ts:302` |
| `caduques[].disposition`, `PropositionExposee.creeLe` | servis, jamais rendus | `ObjectifNegociePanel.tsx:899-912` |
| `ObjectifExpose.supersedesObjectifId` | exposé, non affiché | `objectifs/route.ts:86` |
| variante `{ok:true, objectif}` de la réponse | rendue, non lue | `objectifs/route.ts:878`, `ObjectifNegociePanel.tsx:518-538` |
| `jalonDu.ouvertLe/fermeLe/prochainJalon/prochaineOuverture` | servis, seul `motif` affiché | `jalonObjectifDu.ts:35-52` |
| `desaccords[].exprimeLe` au dossier | servi, non affiché | `DossierDeuxVoixView.tsx:858-871` |
| le « gate » du schéma (la ratification précède l'élargissement) | sans consommateur | `schema.prisma:2368-2370` |
| `rank`, `confidence` de la carte de décision | jamais lus ni transmis | `ClinicalRuntimeSection.tsx:949-952` |
| refus `motif_sur_reprise` | inatteignable | `propositionObjectif.ts:379-380` |
| branche « Provenance illisible » | inatteignable | `ObjectifNegociePanel.tsx:111-116` |
| `ANCRE_JALON = 'T0'` | mort depuis [[D-113]], lu par trois fichiers d'épreuve | `objectifNegocie.ts:647` |
| `PRIO-STR`, `PRIO-FAT`, `PRIO-MOB` | écartées : aucun candidat possible | `priorityRulesV1.ts:423-437` |
| `corps.idPatient` du POST portail | toléré au type, ignoré à l'exécution | `portail/dossier/route.ts:553` |

**Ce qu'on te demande de produire :**

1. **Les faux positifs.** Prends-en **six** au hasard, dont au moins deux
   colonnes et deux champs de DTO, et cherche un consommateur par deux
   orthographes. Un seul faux positif sur six condamne la colonne entière : dis-le
   en ces termes.
2. **Les manquants.** Les neuf tables portent des colonnes que ce tableau ne
   nomme pas. Balaie `schema.prisma` sur le périmètre et rends la liste complète
   des colonnes **sans consommateur**, y compris celles que le compte rendu a
   ratées.
3. **Les objets d'un rang au-dessus** : une route sans appelant, un module
   exporté sans import, un état d'écran jamais atteint, un code d'erreur jamais
   renvoyé, un libellé jamais rendu. Le compte rendu n'a pas fait ce balayage.
4. **La distinction qui compte** : sépare l'objet **prématuré** (écrit pour un
   lot à venir, nommé comme tel dans une décision ou un commentaire) de l'objet
   **orphelin** (dont le client a disparu ou n'a jamais existé). Le premier n'est
   pas un défaut. Cite la décision qui le couvre, ou dis qu'il n'y en a pas.

---

## 7. Perspectives et améliorations — jugement demandé

*Cette section ne cherche pas un contre-exemple. Elle demande un avis motivé, et
elle a un précédent : la contre-analyse du 2026-09-06 a montré que **onze
actions sur douze débordaient le correctif minimal**, pour 120 heures planifiées
contre 24 nécessaires. Ne refais pas cette faute.*

Pour **chaque défaut que tu retiens** (les tiens et ceux du compte rendu qui
résistent), rends trois choses distinctes :

1. **Le correctif minimal** — en lignes de code et en heures, avec les fichiers
   touchés. S'il tient en dix lignes, dis dix lignes.
2. **Le correctif tentant** — celui qu'on aura envie de faire (migration, table
   neuve, refonte d'écran, notification), et **pourquoi il est plus large** que
   le problème.
3. **Le gate** — ce qui doit être vrai avant de commencer, et ce qui prouverait
   après coup que c'est réglé. Une preuve, pas une intention.

Puis rends **trois jugements de portefeuille** :

- **L'ordre.** Si tu ne pouvais faire que **deux** choses sur ce sous-système
  avant le 4 octobre — l'échéance de [[D-093]] — lesquelles, et pourquoi
  celles-là. Rappelle-toi que la condition de sortie de [[D-093]] exige une
  **réponse patient réelle** sur trois dossiers nommés : classe par ce qui rend
  ce geste possible, pas par ce qui est élégant.
- **Ce qu'il ne faut PAS construire.** Nomme au moins deux choses que le compte
  rendu, le bilan ou la campagne suggèrent et qui seraient prématurées, avec
  leur raison. Une surface de départage des deux têtes, une notification vers le
  praticien, un instrument de mesure sur l'EVA : lesquelles sont mûres,
  lesquelles ne le sont pas ?
- **La question de conception que personne n'a tranchée.** Le compte rendu en
  nomme une : l'appel au patient emprunte la page de connexion, quand la
  production a montré ailleurs qu'une porte à usage unique fait entrer
  (69 sur 71) et que l'autre non (4 sur 21). Ce n'est pas un défaut de code —
  rien ne l'interdit. Dis si c'est le premier lot, et ce qui te ferait changer
  d'avis.

---

## 8. Angles morts

*Deux familles, à ne pas mélanger.*

**Les angles morts du compte rendu** — ce que sa méthode ne pouvait pas voir :

- **la couture.** Neuf lecteurs se sont partagé le sous-système par
  sous-système ; un défaut qui vit exactement à la frontière de deux dimensions
  n'appartient à personne. Les coutures nommables : cockpit ↔ moteur (le signal
  d'assemblage), portail ↔ jalons (la fenêtre et la version visée), canal ↔
  drapeaux (l'e-mail qui ne lit rien), modèle ↔ effacement (les neuf tables).
  **Va chercher là en premier.**
- **la corrélation.** Neuf lecteurs qui lisent le même code sous la même
  consigne peuvent partager le même angle mort. Le compte rendu insiste sur
  l'append-only, la traçabilité et les silences : qu'est-ce qu'une consigne
  ainsi orientée ne fait jamais regarder ? *Piste : la performance et le volume
  — huit tables lues en parallèle à chaque ouverture de dossier, des `findMany`
  non bornés sur tout le dossier (`objectifs/route.ts:163`), aucune pagination
  nulle part. Personne n'a regardé.*
- **la fusion manquante.** Aucune passe n'a arbitré les contradictions entre
  dimensions (§2, §4 N3.6). Cherche-en une seconde.

**Les angles morts du produit** — ce que le système ne voit pas de lui-même :

- il ne sait pas si un e-mail a été **ouvert**, ni si le patient est entré
  ensuite : « Envoye » signifie seulement que le relais a accepté
  (`lib/consultation/email.ts:22-26`) ;
- il ne sait pas qu'un patient est **bloqué** par deux têtes coexistantes ;
- il ne sait pas qu'une **fenêtre d'étape** est ouverte, côté praticien ;
- il ne compte rien : aucun taux de reprise, d'écart, de ratification n'est
  rendu (`ObjectifNegociePanel.tsx:314-315`). C'est un arbitrage doctrinal
  (« l'adhésion se constate en récit, ne se compte jamais ») — **dis si ce
  choix, tenu jusqu'au bout, empêche le bilan de [[D-093]] condition (b) d'être
  productible**. C'est la question la plus intéressante de cette passe.

---

## 9. Ce qu'il ne faut PAS faire

- **Ne propose aucun refactoring, renommage ni réorganisation**, et n'écris
  aucun patch.
- **Ne re-signale pas les trois limites déclarées** (§2) : elles sont écrites
  dans la page. Montrer qu'une conclusion **précise** en dépend, en revanche,
  vaut beaucoup.
- **Ne prends pas ces choix pour des défauts** : le portail est en tirage **par
  décision** ([[D-111]] écarte la relance) ; les drapeaux sont fail-closed par
  convention ; la priorité reste un libellé libre et non un rang
  (`DC-19`/`DC-20`) ; l'EVA n'est agrégée par rien ([[D-111]] §3) ; « la machine
  cite, elle n'invente pas » ferme la liste des sources ([[D-094]]) ; les
  références de version sont **souples, sans clé étrangère**, et se vérifient
  aux routes — c'est le patron du dépôt, pas un oubli.
- **Ne re-signale pas les dettes déjà nommées** sans montrer qu'elles sont plus
  larges qu'annoncé : les deux têtes de chaîne (`LOT-02:132-137`), l'absence de
  cadence (`SESSION_LOG.md:4566`), les deux taxonomies J21 ([[D-111]]), le
  périmètre restreint de [[D-093]].
- **Ne juge pas la mise en forme de la page**, ni ses couleurs, ni ses
  diagrammes. Sa cible est l'analyse.

---

## 10. Format de restitution attendu

1. **Tableau des verdicts** — une ligne par affirmation : identifiant (`N1.1`…),
   énoncé court, verdict, motif en une phrase.
2. **Une section par verdict `RÉFUTÉE`, `AFFAIBLIE` ou `ÉLARGIE`**, dans l'ordre
   des niveaux, avec `fichier:ligne`, le chemin de données complet, l'effet
   obtenu, et la sortie de toute commande exécutée.
3. **Section « Ce que le compte rendu a manqué »** (§5), trouvaille par
   trouvaille, avec la gravité proposée et son scénario.
4. **Tableau « code sans client »** (§6) : objet, classement, producteur,
   consommateur, preuve — plus la liste des faux positifs trouvés et le verdict
   sur la colonne entière.
5. **Perspectives** (§7) : le tableau des trois colonnes par défaut retenu, puis
   les trois jugements de portefeuille.
6. **Angles morts** (§8), séparés en deux familles.
7. **Limites de couverture** — ce que tu n'as pas pu vérifier, et pourquoi.

Compte final en une ligne : *N réfutées (dont X au niveau 1), M affaiblies,
E élargies, R résistent, V non vérifiables, plus K trouvailles neuves et J objets
sans client non répertoriés.*
