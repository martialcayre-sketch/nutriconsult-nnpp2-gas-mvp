# Registre des décisions Wellneuro

> Append-only. Ajouter une nouvelle décision en tête de la section active.

## Décisions actives

### D-135 — L'inbox dit ce qu'elle sait, et n'affirme plus qu'un patient a été lu

- Date : 2026-09-07
- Statut : accepté (arbitrage praticien explicite en session, option « l'écran cesse d'affirmer ce qu'il ignore ») et exécuté.
- Domaine : accueil praticien, inbox des questionnaires, validité des passations

- Contexte : l'inbox écarte une réponse dès qu'elle précède la dernière
  consultation VALIDÉE du patient, et affichait alors « Aucun questionnaire en
  attente — tout a été vu en consultation ».

**1. L'ancre est un geste du PATIENT, et elle ne prouve aucune lecture.**
`Consultation.dateValidation` n'a qu'un seul écrivain dans tout le dépôt : la
validation d'anamnèse au portail. Un dossier rouvert, une consultation créée,
le patient qui valide — et à cette seconde toutes ses réponses antérieures
quittent l'accueil, y compris celles que personne n'a ouvertes. L'écran
affirmait le contraire de ce qu'il savait.

**2. Rien n'est perdu, et c'est ce qui a décidé de l'option retenue.**
`api/praticien/reponses` lit TOUTES les réponses d'un dossier, sans ancre et
sans filtre ; la fiche patient les affiche. Ce que l'ancre coupe est le SIGNAL,
jamais la pièce. Le défaut n'était donc pas une perte de donnée mais une
assertion fausse — et `DC-24` (« une donnée absente n'est jamais zéro ni
normale ») est opposable exactement à cela.

**3. L'ancre ne change pas ; l'écran cesse de conclure.** L'état vide dit
« Aucune réponse reçue depuis la dernière consultation », ce que l'accueil
sait. Un repli compte ce que l'ancre a retiré, par dossier, et pointe la fiche
patient — l'écran qui montre tout. Replié, parce que le cas courant est vide et
que la décision du 2026-07-23 tient : l'accueil est une liste courte.

**4. Ce que cette décision N'A PAS retenu, et pourquoi.** Faire de l'accusé de
lecture praticien la seule horloge est juste sur le fond, mais le POST qui
enregistre « j'ai lu » filtre ce qu'il a le droit d'écrire AVEC LA MÊME ANCRE :
une réponse antérieure en est écartée, le serveur répond `{ ok: true }` sans
rien écrire, et l'écran recharge une liste inchangée. Le praticien clique, ça
dit oui, rien ne bouge. Aucun banc ne couvre ce cas. Si cette option est
reprise, **le POST doit changer dans le même lot que l'affichage, jamais
après**.

**5. Un défaut vivant corrigé au passage, indépendant de l'arbitrage.** La
normalisation intermédiaire de la route laissait tomber `statutValidite` et
`motifInvalidation` : sélectionnés en base, recopiés à la sortie, mais absents
de l'objet qui les relie. Le champ retombait donc toujours sur `'VALID'`, le
bandeau « Retirée du raisonnement clinique » ne pouvait jamais s'afficher, et
une passation retirée revenait valide avec son bouton « Retirer » intact.

**6. Trois items voisins ne se règlent PAS par cette décision**, contrairement
au cadrage initial. `A04` n'est pas une question d'horloge : le Fil reçoit un
`Set` d'`idPatient` construit sans date, donc un patient ayant *un jour*
confirmé un J21 n'aura plus jamais de carte — problème d'identité de cycle.
`M08` est un champ à remplir, à faire après pour hériter du bon vocabulaire.
`M13` est un choix sur ce que `dateReponse` signifie sur une clôture d'agenda,
et il doit passer par un champ distinct : rétrodater ferait lire le même
recueil de 21 nuits comme un point J42, privant le cycle de sa lecture J21.

Aucune migration, aucun seuil de scoring.

### D-134 — Un banc qui fabrique l'erreur qu'il attend ne prouve pas qu'elle arrive

- Date : 2026-09-07
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06 —
  « 1, 2 puis 3 », le troisième point comprenant ce harnais)
- Domaine : contrats de base, traduction des violations d'unicité.
  **Aucun code de production modifié, aucune migration, aucun seuil.**
- Porte sur : `D-127` §3bis, `D-132`, `D-123`, `D-125` pour l'étiquetage

**Le défaut de preuve.** Trois routes traduisent `P2002` en 409 lisible —
`selection_stale` (sélection de priorité), `code_deja_pris` (catégories,
alertes). Leurs bancs unitaires **fabriquent** l'erreur `P2002` pour vérifier la
traduction. Aucun ne prouvait que la base la produise, ni que le client la rende
sous ce code : ils simulent l'erreur qu'ils attendent.

**Le cas qui portait le risque.** `c1_selection_priorite_racine_unique` est un
index **partiel** (`WHERE supersedes_selection_id IS NULL`) qui vit dans la
**migration seule** — Prisma ne le déclare pas et ne le connaît pas. C'est
pourtant lui qui arbitre la course de deux premières sélections. Si un
adaptateur cessait de classer `23505` en violation d'unicité, `selection_stale`
tomberait en **500** au lieu de 409, sans qu'un seul banc bouge.

**Ce que la sonde a établi, sur base réelle** (worktree, PostgreSQL 15) :

```
racine     : code=P2002  originalCode=23505  contrainte=id_patient,decision_card_id
successeur : code=P2002  originalCode=23505  contrainte=supersedes_selection_id
```

L'adaptateur classe `23505` en `UniqueConstraintViolation` **avant** que Prisma
ne le rende en `P2002`, index modélisé ou non. La traduction tient donc pour
l'index déclaré comme pour l'index inconnu — c'était l'hypothèse, elle est
désormais un fait.

**Arbitrage — le contrat vit dans la lane E2E, sans navigateur.**
`prisma/checks/*.sql` prouve ce que la BASE refuse, et le contrat de `D-127` le
fait déjà ; ce qui restait à prouver est la **traduction**, qui appartient au
client Prisma. Aucune lane n'existe pour un contrat de niveau client, et en
ouvrir une aurait demandé de recopier une étape dans `ci.yml` **et** dans
`wn-test-worktree.sh` — la divergence silencieuse que ces deux fichiers
refusent explicitement, et que l'extraction `sed` des deux listes existe pour
empêcher. La suite E2E est la seule lane disposant d'une vraie base en T2, T3 et
CI ; un spec sans écran y est assumé, et son en-tête dit pourquoi.

**Le témoin fait la preuve.** La sonde éprouve AUSSI
`@@unique([supersedesSelectionId])`, déclaré au schéma. Sans lui, un `P2002` sur
la racine ne dirait pas si la traduction vaut également pour l'inconnu : c'est
la comparaison des deux qui établit le fait, pas le premier cas seul.

**Portée.** Le contrat ne dit rien de la BONNE traduction en 409 — c'est le
travail des bancs de route, qui reste entier. Il dit que l'entrée qu'ils
simulent existe réellement.

### D-133 — Le moteur C4 avait tout pour décider, et personne pour l'appeler

- Date : 2026-09-07
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06 —
  « 1, 2 puis 3 », le second point étant le moteur sans appelant)
- Domaine : atelier de règles cliniques (C4), moteur de décision avant biologie.
  **Aucun seuil posé, aucune règle écrite, aucune migration, aucun chemin
  patient touché.**
- Porte sur : `D-056` (arbitrages 1 et 2), `D-003` (barrière de validation),
  `D-131` et `D-132` (les écrivains du catalogue), `DC-24`, `D-125`

**Le défaut.** `deciderIntentionAvantBiologie` et
`deciderIntentionsAvantBiologie` sont écrits, testés, complets — et **leur seul
importeur était leur propre banc**. Aucun module de `src/` ne les appelait. Le
moteur que `D-056` arbitrage 1 annonçait comme « livré » ne tournait donc nulle
part, et sa mutité passait pour l'effet du catalogue vide alors qu'elle tenait
d'abord à l'absence d'appelant. C'est le **cinquième** exemplaire du motif de la
journée, après `D-127`, `D-130`, `D-131` et le constat de `D-132`.

**Où il est branché, et pourquoi là.** La **prévisualisation d'atelier**
(`/api/praticien/regles/previsualisation`) — le seul lieu qui puisse l'appeler
sans dossier. Son en-tête le dit déjà d'elle-même : « cette sortie ne doit JAMAIS
alimenter un chemin protocole ou patient ». La barrière de `D-003` reste donc
entière : rien de ce que le moteur rend ici n'atteint un protocole, une
diffusion ou un patient.

**Deux entrants ne se dérivent pas, et ils sont rendus FERMÉS plutôt
qu'inventés.** L'absence d'information ne vaut jamais autorisation (`DC-24`,
`D-056` arbitrage 2) :

1. **`claimsValides` — aucun lien n'existe.** Le moteur exige de savoir si les
   claims cités par une règle sont valides au corpus. Or `ClinicalRule` ne porte
   **aucune référence de claim** : `claim_id` existe côté biologie
   (`biology_functional_ranges`), jamais ici, et la source d'une règle est une
   citation bibliographique, pas un identifiant de corpus. La carte reste vide,
   donc `false` pour chaque règle, et le refus `claims_non_valides` dit une chose
   vraie — rien n'établit la validité de ces claims. **Le lien règle ↔ claim est
   une dette nommée ici** ; le combler demandera un arbitrage (le schéma, ou le
   contrat du moteur).
2. **`declencheur` — il appartient à un dossier.** Le tableau clinique (besoin
   dégradé + plainte + anamnèse) est patient-spécifique ; l'atelier n'a pas de
   patient. Il reste vide. Le fabriquer donnerait à lire « tableau complet » là
   où personne n'a été examiné.

**Trois entrants se dérivent, et la lecture les prend.**
`catalogueDecisionPrisma.ts` — module à part, même séparation que
`selectionPrioritePrisma` : ce qui DÉCIDE reste pur, ce qui LIT vit ailleurs.

- **Le catalogue d'alertes est publié dès qu'une alerte active existe**, garde au
  niveau CATALOGUE et jamais ingrédient (`D-056` arbitrage 2).
- **Une alerte n'atteint un ingrédient que par un seuil**, le schéma ne les
  reliant pas directement — et seulement si ce seuil **bascule le risque**. Sans
  ce terme, une alerte citée à titre documentaire refuserait l'ingrédient entier.
- **Les seuils sont bornés aux ingrédients que la résolution touche**, jamais lus
  sur le catalogue entier.

**Ce que le branchement apporte concrètement.** Les verdicts sont aujourd'hui des
refus — c'est la vérité de la production. Ce qu'ils ajoutent, c'est de nommer
**lequel** des obstacles mord en premier, ce qu'aucun écran ne disait :
l'atelier montrait les règles résolues sans laisser voir qu'aucune n'irait plus
loin. Le premier message servi est celui de la sentinelle : « rien n'a été
examiné — ce n'est pas un feu vert », la distinction que tout ce rayon défend.

**Ce que ça n'ouvre pas.** Ni les seuils (`D-132` : une dose sans unité ne se
compare à rien), ni le lien claims, ni aucun chemin patient.

### D-132 — Deux référentiels de plus, et un troisième qu'on n'ouvre pas : une dose sans unité ne se compare à rien

- Date : 2026-09-07
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06 —
  « 1, 2 puis 3 », le premier point étant l'ouverture du catalogue C4)
- Domaine : atelier de règles cliniques (C4), référentiel du moteur d'intention.
  **Aucun seuil clinique posé, aucune échelle d'alerte inventée, aucune
  migration.**
- Porte sur : `D-131` (dont ceci est la suite), `D-056` arbitrage 2, la décision
  n°11 du moteur d'intention, `DC-19`/`DC-20`, `D-125` pour l'étiquetage

**Ce que la décision livre.** Les deux derniers référentiels **non chiffrés**
restés sans écrivain après `D-131` : `functional_categories` et
`supplement_safety_alerts`, chacun avec sa route (POST **et GET**) et son geste
d'écran, sous `WN_C4_ENABLED` comme le reste de l'atelier.

**Pourquoi un GET, et pas seulement un POST.** Le code est unique en base : sans
relecture, une ressaisie rendrait 409 devant un écran muet. Pour les alertes,
c'est davantage qu'une commodité — le catalogue **publié** est exactement ce que
`deciderIntentionAvantBiologie` exige avant de proposer quoi que ce soit
(`D-056` arbitrage 2), et le praticien doit pouvoir constater qu'il existe. Un
référentiel de sécurité qu'on écrit sans le relire est pire qu'un référentiel
absent.

**Le niveau d'alerte est exigé, PAS contraint.** `niveau_alerte` est un `TEXT`
sans `CHECK` ; aucun vocabulaire n'est défini dans le dépôt — la seule occurrence
du mot « orange » est un défaut interne de la sentinelle, sur un autre objet ; et
le moteur de décision **ne lit pas le niveau** : toute alerte active refuse, quel
qu'il soit. Poser ici une liste « orange / rouge » aurait inventé une gradation
clinique que rien ne source (`DC-19`, `DC-20`). Le champ est donc obligatoire et
borné, et l'écran en fait un champ libre plutôt qu'une liste déroulante. **La
définition de l'échelle reste due.**

**Arbitrage principal — les seuils fonctionnels NE SONT PAS ouverts, et le motif
n'est pas la prudence de principe.** `depasseSeuilHaut`
(`decisionAvantBiologie.ts`) compare `regle.doseCibleBasse/Haute` à
`seuil.seuilDoseHaute` **par un `>` numérique nu**. Or :

- `ClinicalRule` ne porte **aucune colonne d'unité** — ni au schéma, ni dans
  `validerContenuRegle` ;
- `IngredientFunctionalThreshold` en porte une (`unite`, NOT NULL) ;
- le dépôt connaît déjà la règle et l'applique ailleurs — `compositions.ts` :
  « **Dose et unité vont PAR PAIRE** […] Une dose sans unité est un nombre auquel
  un lecteur prêtera la grandeur qui l'arrange ».

Une règle à 500 (µg dans l'intention du rédacteur) comparée à un seuil de 200 mg
serait refusée à tort ; une règle à 500 mg comparée à un seuil de 1000 µg
**passerait** en étant 500 fois au-dessus. Le second sens est celui qui blesse.

**Ce défaut est INATTEIGNABLE aujourd'hui, et le serait devenu par cette PR.**
`seuilsActifs` est toujours vide faute d'écrivain, donc `aucun_seuil_publie` mord
en premier. Ouvrir le chemin des seuils rendrait la comparaison atteignable —
même forme que `D-127` §8, où persister sans traiter la péremption rendait une
régression atteignable. Constat **démontré dans le code, sans occurrence
observée** (`D-125`) : aucun seuil n'existe en production.

**Deux sorties, et aucune n'est mienne.** (a) Une **migration** ajoutant l'unité
à `ClinicalRule`, la dose et l'unité devenant une paire comme partout ailleurs ;
(b) un **refus fail-closed** dans le moteur — une dose sans unité n'est
comparable à rien, donc ne se compare pas — ce qui est une modification de
logique clinique. L'une demande une autorisation de migration, l'autre une
décision clinique : les deux appellent un arbitrage explicite, et cette décision
les nomme plutôt que d'en choisir une au passage.

**Ce que ça n'ouvre pas.** La chaîne C4 reste **muette** : une règle peut naître
et être validée, un catalogue d'alertes peut être publié — mais
`deciderIntentionAvantBiologie` exige encore des seuils actifs, et surtout **il
n'est appelé par personne** (aucun module de `src/` ne l'importe hors de son
propre banc). Cette seconde rupture est le chantier suivant.

### D-131 — Le catalogue C4 n'était pas seulement vide : il n'était pas remplissable

- Date : 2026-09-06
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06 —
  « peupler le catalogue C4 d'abord »)
- Domaine : atelier de règles cliniques (C4), référentiel du moteur d'intention.
  **Aucun seuil clinique posé, aucune règle écrite, aucune migration.**
- Porte sur : `D-056` arbitrage 1 (la dette du catalogue), la décision n°11 du
  moteur d'intention, `LOT-00-AUDIT-SOURCES`, `D-130` (dont ce défaut est le
  frère), `D-125` pour l'étiquetage

**Faits relus avant d'écrire.**

1. **Production, lue par conteneur le 2026-09-06** — et c'est la PREMIÈRE
   lecture de ces tables depuis le cutover ; les chiffres de `D-056` dataient du
   2026-08-13, donc de Supabase, qui n'existe plus :
   `clinical_rules` 0, `clinical_intent_tags` 0, `clinical_criteria` 0,
   `supplement_source_references` 0, `supplement_safety_alerts` 0,
   `functional_categories` 0, `ingredient_functional_thresholds` 0 —
   pour `supplement_ingredients` **3 444**. La couche matière est peuplée, la
   couche décision est vide, un mois plus tard et sur une autre base.
2. **Quatre des six tables de décision n'ont AUCUN écrivain** — ni route, ni
   seed, ni script : sources, alertes de sécurité, catégories fonctionnelles,
   seuils fonctionnels. Seuls `clinical_intent_tags` et `clinical_criteria`
   (route de vocabulaire) et `clinical_rules` en ont un.
3. `clinical_rules.source_reference_id` est **NOT NULL**, et
   `POST /api/praticien/regles` refuse toute règle dont la source n'existe pas
   ou n'est pas active.
4. La décision n°11 du moteur d'intention interdit la synchronisation live et
   toute écriture en base active depuis une source externe ; `LOT-00-AUDIT-
   SOURCES` en tire la conséquence pour cette table précise — « par **curation
   manuelle praticien** », l'ANSES ne publiant aucun format machine.
5. L'atelier corpus existe, mais ses « sources » sont les notebooks du registre
   sanitaire, pour les *claims* : il n'alimente pas ce référentiel.

**Le défaut.** De (2) + (3) : **l'atelier de règles, qui fonctionne par
ailleurs, était structurellement incapable de créer sa première règle.** Le
catalogue n'était pas vide par politique — il n'était pas remplissable.
`D-056` arbitrage 1 attribuait le blocage à « un travail de contenu clinique
sourcé » : c'est vrai, et incomplet — même le contenu en main, il n'y avait
nulle part où le mettre. Constat **démontré dans le code et lu en production**
(`D-125`).

C'est le quatrième exemplaire du même motif en deux jours, après `D-127` (un
champ que personne n'écrivait) et `D-130` (un contrat que personne ne
demandait) : **une garde dont l'entrée n'a pas de producteur**.

**Arbitrage 1 — le chemin est une SAISIE praticien, pas un import.** La décision
n°11 interdit l'écriture depuis un flux externe ; elle n'interdit pas la
curation, elle la prescrit (fait 4). `POST /api/praticien/regles/sources` ne lit
rien d'externe : il enregistre ce qu'un praticien authentifié écrit, sous le
drapeau `WN_C4_ENABLED` comme le reste de l'atelier.

**Arbitrage 2 — cette décision n'ouvre QUE les sources.** Alertes de sécurité,
catégories fonctionnelles et seuils fonctionnels restent sans écrivain. Ils
portent des **niveaux d'alerte et des bornes de dose**, c'est-à-dire du contenu
clinique chiffré (`DC-19`, `DC-20`) : leur chemin d'écriture se pose avec le
cadre qui vérifie ce qu'on y met, pas au passage d'une PR qui débloque une
citation. Les nommer sans les ouvrir est le point.

**Arbitrage 3 — le doublon est refusé À L'APPLICATION, et la garde en base est
une dette.** La table ne porte aucune contrainte d'unicité sur la citation, et
l'ajouter serait une migration — hors périmètre ici. Deux lignes pour une même
source ne corrompent rien mais **scindent la lignée** : deux règles citant « la
même » référence par deux identifiants ne se relient plus. Refus 409 sur
comparaison insensible à la casse, texte détouré. La garde en base reste due.

**Arbitrage 4 — le lien est facultatif, mais s'il est là il doit être
ouvrable.** Une source dont le lien ne s'ouvre pas est pire qu'une source sans
lien : elle promet une vérification qu'elle ne permet pas. `http`/`https`
seulement — un `javascript:` ou un `data:` posé dans un champ que l'écran rend
en lien est une injection, pas une référence.

**L'écran vient avec la route, et ce n'est pas un supplément.** Une route sans
geste d'écran serait un cinquième exemplaire du motif que cette décision
constate. Le formulaire vit dans l'atelier, sous le vocabulaire gouverné, et
**recharge** le vocabulaire après ajout : sans ce rechargement, la source
existerait en base et resterait absente de la liste où la règle vient la
choisir.

**Ce que ça n'ouvre PAS, et il faut le dire.** Une règle peut désormais être
créée et validée. Elle ne produira toujours **aucune intention** :
`deciderIntentionAvantBiologie` exige en plus un catalogue d'alertes **publié**
et des seuils actifs sur l'ingrédient (`D-056` arbitrage 2), tables restées sans
écrivain. La chaîne C4 reste donc muette en production — d'un cran moins loin
qu'hier, et pas davantage.

### D-130 — Le contrat de payload du protocole devient demandable : sans quoi la chaîne biologie de LOT-03 n'a aucun producteur

- Date : 2026-09-06
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06 —
  « go » sur l'ouverture de la route au contrat V4)
- Domaine : versionnement du protocole 21 jours, chaîne arbitrage biologique →
  révision. **Aucun seuil, aucune règle clinique nouvelle, aucune migration** —
  le contrat V4 lui-même est celui, déjà signé, de `D-056`.
- Porte sur : `D-056` (contrat V4), `D-059` §4 (correspondance verdict →
  résolution), le LOT-03 §3, `D-127` (dont ce défaut est le jumeau), `D-125`
  pour l'étiquetage des constats

**Faits relus avant d'écrire.**

1. `buildProtocolDraft` construit `c1-protocol-draft-v1` quand `version` est
   absent (`protocolDraft.ts`), et V1 **refuse** `interventionStatus` comme
   `waitFor` — « exige un payload protocole V4 explicite ».
2. `POST /api/praticien/protocoles/versions` est l'**unique** appelant de
   production de `buildProtocolDraft`, et il ne passait aucune `version` ; son
   type `Submission` n'avait pas ce champ.
3. `ProtocolMiniBuilder.emptyAction` ne pose aucun statut, et le formulaire
   n'offre ni statut d'intervention ni attente.
4. `arbitrage.ts` refuse une intention dont le statut n'est pas
   `conditionnelle_biologie`.
5. `refusResolutionSansArbitrage` (`revision.ts`) itère les intentions
   `conditionnelle_biologie` de la version **active** — celles d'un payload
   persisté.
6. Les bancs de `revision.ts` et `boucleRevision.ts` appellent la fonction pure
   avec des `actionsActives` **fabriquées à la main** ; aucun banc de route ne
   soumet un `interventionStatus`.

**Le défaut, et sa forme.** De (1) + (2) : aucune intention
`conditionnelle_biologie` n'était persistable. De là, par (4) et (5), **la route
d'arbitrage ET la garde de résolution étaient inatteignables depuis
l'application** — un invariant serveur sans aucun producteur. Par (3), l'écran
ne pouvait pas davantage en produire une.

C'est **exactement la forme de `D-127`**, en plus large : là-bas un champ que
personne n'écrivait, ici un contrat entier que personne ne demandait. Et (6) dit
pourquoi c'est resté invisible dix mois : le domaine était éprouvé, la route
était éprouvée, et **aucun banc ne demandait si la route savait produire
l'entrée que le domaine garde**. Constat **démontré dans le code, sans occurrence
observée en production** (`D-125`) — la base n'a pas été lue pour ce point ; elle
ne peut de toute façon porter aucun payload V4, faute d'écrivain.

**Arbitrage 1 — la version se DEMANDE, elle ne se déduit pas.** `submission`
accepte désormais `version`. Déduire V4 de la présence d'un `interventionStatus`
aurait été plus court et aurait contredit la doctrine de `protocolDraft.ts`, qui
exige le mot « explicite » : un contrat déduit d'un champ présent laisse le
client choisir sa validation par omission, et un champ oublié ferait alors
silencieusement retomber le payload au contrat le plus permissif.

**Arbitrage 2 — une seule valeur est demandable.** `c1-protocol-draft-v4`, et
rien d'autre ; toute autre valeur est un 400 `version_inconnue`. V2 et V3 ont
leurs propres surfaces (référence alimentaire, catalogue de compléments) et
leurs propres vérifications ; cette décision n'ouvre que ce qu'elle nomme.
L'absence de `version` reste V1, **et les empreintes déjà persistées ne bougent
pas** — `canonicalJson` ignore les clés absentes.

**Arbitrage 3 — V4 n'ouvre pas `supplementCatalogRef` au passage.** Le moteur
l'accepte en V3 comme en V4 (`normalizeActions`), et cette route ne le vérifie
contre **aucun** catalogue — à la différence de `foodCompassRef`, recalculée
puis comparée. L'accepter par effet de bord ferait persister une référence que
personne n'a contrôlée. Elle reste refusée, comme aujourd'hui ; le refus n'est
rendu explicite (400 `reference_non_verifiee`) que sur le chemin V4, pour laisser
les autres payloads au message du moteur, inchangé.

**Arbitrage 4 — une version V4 ne se révise pas en V1** (409
`version_contrat_incompatible`). Le cas « statut conservé » était déjà refusé par
le moteur ; c'est le cas **« statut retiré »** que ce refus ferme, et c'est le
grave : une intention résolue `non_indiquee_actuellement` redeviendrait une
action ordinaire, et **la résolution clinique s'effacerait sans laisser de
trace**. Sans cette garde, l'ouverture du contrat aurait créé un chemin
d'effacement qui n'existait pas avant elle.

**Ce que la décision N'ouvre PAS.** L'écran ne produit toujours aucune intention
`conditionnelle_biologie` : `ProtocolMiniBuilder` n'offre ni statut ni attente.
La chaîne devient atteignable **par l'API**, et le parcours E2E l'éprouve de bout
en bout ; le geste d'écran reste dû, et il est nommé ici plutôt que supposé
livré. C'est la même séquence que `D-127` — la table, puis le serveur, puis
l'écran — et nous en sommes au serveur.

**Arbitrage 5 — une fixture E2E qui mute doit savoir se défaire.**
`preparerReprisePourTest` (`e2e/helpers/db.ts`) antidatait **toutes** les
réponses du dossier au 2025-01-01, et `nettoyerReprise` ne restaurait rien :
elle ne supprimait que les propositions de pack. L'en-tête de
`portail-pack-reevaluation` affirmait pourtant que « chaque spec qui mute nettoie
derrière lui » — un commentaire crédible et faux, exactement ce que ce même
en-tête reprochait à sa rédaction précédente.

Ce que l'oubli cassait est mesurable : le rideau T0 de la fixture biologie est
daté du **2026-01-01**, un an APRÈS l'antidatage. Une fois le dossier antidaté,
la fenêtre T0 se recompose sur les réponses de 2025 et le rideau en sort. Le
cockpit l'a dit lui-même au second projet Playwright : « Le canal de plainte
(`Q_MOD_03`) ne rend aucune mesure sur l'épisode confirmé » ⇒ abstention requise,
aucun candidat, sélection impossible. Le premier projet passait, le second non —
et **aucun parcours antérieur ne dépendait des règles de priorité**, ce qui est
la seule raison pour laquelle personne ne l'avait vu.

Les dates sont désormais **capturées avant la mutation et restituées par
`nettoyerReprise`**. La capture ne s'écrase pas : deux préparations sans
nettoyage entre elles (le spec `visual` suit celui du pack) prendraient la
seconde sur un dossier déjà antidaté et figeraient 2025-01-01 en croyant
restaurer. Un worker qui redémarrerait entre capture et restitution ne restaure
rien plutôt que d'inventer des dates.
### D-129 — Un acte a une date et un contenu : un écrivain chacun

- Date : 2026-09-06
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06 —
  « reprendre la ligne, jamais comparer »)
- Domaine : persistance de l'épisode d'évaluation, cockpit praticien.
  **Aucun seuil de scoring modifié, aucune migration.**
- Porte sur : `D-118` (le cockpit comme troisième point de persistance),
  `D-052` (préconditions T0), `D-054`, `D-113`, `D-128` pour le
  compare-and-swap

**Le défaut (P0).** Les trois points de persistance écrivaient l'épisode par
`upsert(..., update: {})`, présenté comme de l'idempotence : « une ligne déjà
posée ne se réécrit pas ». Ce n'était pas de l'idempotence, c'était du SILENCE.
Quand la ligne existait avec un contenu DIVERGENT — socle de mesures différent,
réponses incluses différentes — rien n'était écrit et la route répondait succès.
Le praticien lisait « confirmé » à l'écran pendant que la base gardait la mesure
précédente. **Une confirmation clinique perdue, sans trace.**

**Ce que la décision tranche.**

**1. Une re-confirmation remplace ce que l'épisode RETIENT, et rien d'autre.**
Trois colonnes : `payload`, `payloadHash`, `contractVersion`. HUIT restent hors
de portée (`createdAt` compris, posé par la base), chacune pour son motif — `id`/`idPatient`/`milestone` sont l'identité
de la ligne ; `targetAt` la géométrie de la fenêtre ; `cycleId` la seule dont
l'écriture peut violer l'index unique partiel des jalons de mesure ;
`versionScore` est figé à la mesure, sinon la garde A8-3 devient indéclenchable.

**2. `confirmedAt` a un écrivain unique : la création.** C'est la DATE DE
L'ACTE. `runtimeFromPrisma` en fait la date de référence de tout jalon de mesure
du cycle, et le portail patient y adosse la fermeture de ses jalons : la
réécrire déplacerait le parcours du patient sous ses pieds. Une re-confirmation
porte donc l'instant de l'acte, jamais celui du clic — pour l'épisode comme pour
toute la chaîne C1 qu'il engendre.

**3. La justification de contournement se REPREND, elle ne se recompare pas.**
Premier arbitrage rendu. Sur un acte déjà enregistré, l'override est repris
VERBATIM de la ligne et le motif reçu du navigateur est ignoré — sans être
comparé. Le comparer aurait bloqué un praticien sur une virgule : le panneau
vide ses motifs à chaque remontage du composant et ne lui remontre jamais celui
d'origine ; la ligne portant « Vue en entretien. », il aurait retapé « Vue en
entretien » et se serait heurté à un refus définitif sur un dossier qu'il ne
peut plus enregistrer. Même traitement que la date de l'acte, et pour la même
raison : ce qui a été rendu à sa date se reprend, il ne se rejuge pas.

**3 bis. La trace d'un arbitrage SURVIT à la résolution de sa condition.**
Second arbitrage rendu. Une condition souple se résout — la contradiction est
levée, la passation est repassée. Ne reconstruire que les conditions ENCORE
requises effaçait alors, en silence et au premier geste anodin du praticien, qui
avait passé outre, quand et pourquoi : c'est la seule ligne qui en fasse foi, et
c'était la même classe de perte que le P0 que cette décision ferme. Les
overrides déjà rendus sont donc reportés.

**UNE TRACE SE RECONNAÎT À SA PRÉSENCE EN BASE, JAMAIS À SA DATE.** Une première
rédaction de ce contrôle distinguait la trace de la fabrication par
l'ANTÉRIORITÉ de `decideLe` à `confirmedAt`. La revue adversariale l'a exécutée :
elle était inversée dans les deux sens. Le cockpit tamponne
`decideLe = confirmedAt` sur le tout premier contournement — l'égalité ne
satisfait pas la stricte antériorité, donc AUCUNE trace réelle n'était reconnue,
et la route vivante refusait le dossier en 422 définitivement. Symétriquement,
une date se forge : un override au motif vide, portant l'e-mail d'un autre
praticien et daté de 1999, passait — exactement ce que la règle protégeait.

La ligne persistée, elle, ne se forge pas depuis le navigateur.
`refusPreconditionsPersistance` reçoit donc les contournements DÉJÀ écrits (les
deux routes protocole lisent le `payload` de la ligne, qu'elles lisaient déjà
pour le contrôle de divergence) et n'admet un override non requis que s'il y
figure à l'identique.

**4. Un contournement NOUVEAU se date du JOUR, sur un acte qui garde le sien.**
Troisième arbitrage rendu, et il corrige une première conception de cette même
décision. Elle refusait ce cas, au motif qu'il n'existait « pas de troisième
écriture honnête » : `decideLe` devait ÉGALER `confirmedAt`, donc dater le
contournement de l'acte l'aurait antidaté, et le dater du jour rendait le
dossier non enregistrable.

C'était un excès. `decideLe === confirmedAt` est une règle du dépôt, pas une
loi ; elle existait pour empêcher un horodatage « daté à volonté ». La borne
`confirmedAt <= decideLe <= maintenant` l'empêche tout autant — on ne peut ni
remonter avant l'acte, ni projeter dans le futur — et elle autorise ce qui est
vrai : un arbitrage rendu aujourd'hui porte la date d'aujourd'hui.

Le refus, lui, se déclenchait sur un parcours NOMINAL. `contradictions_ouvertes`
est une condition vivante (`WN_ENABLE_CONTRADICTIONS_NNPP2=1`,
`docs/FEATURE_FLAGS.md` et `D-104`, postérieur à la bascule Scalingo du
2026-08-22 — `D-064` posait le drapeau sur la Production VERCEL, décommissionnée
depuis, et ne porte donc pas l'état actuel). L'état n'a PAS été relu par
conteneur : c'est de la documentation, avec la réserve que cela implique. Le
commentaire « MUETTE AUJOURD'HUI » de `evaluerContradictions` est périmé ; celui
d'`evaluerAmbigues` ne l'est PAS, `WN_ENABLE_VALIDITE_PASSATIONS` restant
éteint — les deux ne se confondent pas.
Un T0 confirmé, une contradiction qui s'ouvre ensuite, et la re-confirmation
divergente — celle que cette décision existe pour ne plus perdre — était
refusée. Le P0 aurait été corrigé partout SAUF là où le contenu diverge le plus
souvent. Relevé par la revue adversariale, qui l'a reproduit.

**5. L'écriture dit ce qu'elle fait — trois branches, une par cas réel.** Pas de
ligne : `create`, et non `upsert` — l'`upsert` ne SAIT PAS dire « la ligne est
née entre-temps », il écrirait par-dessus avec un payload épinglé à notre
horloge ; la collision se traite en 409. Ligne présente au contenu divergent :
`updateMany` en COMPARE-AND-SWAP sur l'empreinte lue, même mécanique que la
consommation du lien magique (`D-128`) — si une autre requête a réécrit entre
notre lecture et notre écriture, on refuse au lieu d'écraser. Empreintes
égales : aucune écriture. C'est là, et là seulement, que l'idempotence annoncée
est vraie.

**6. Les deux routes protocole refusent la divergence au lieu de l'avaler.**
Elles ne sont pas l'écrivain de l'acte : elles reçoivent l'épisode du
navigateur. Un épisode périmé citait la ligne d'un autre contenu sous une
réponse `ok: true`. Elles rendent désormais 422 et invitent à recharger.

**Ce que la conception d'abord arbitrée proposait, et pourquoi elle est
écartée.** Elle comparait la justification reçue à celle de la ligne et refusait
en cas de divergence. La revue adversariale l'a mise en `NO GO` par deux chemins
indépendants : le refus se déclenchait sur un parcours NOMINAL — les conditions
souples étant recalculées à chaque appel, une nouvelle passation rend une
condition satisfaite, l'ensemble des contournements requis rétrécit, et le
praticien était bloqué parce que son patient avait fait ce qu'on lui demandait ;
et la comparaison de texte était inatteignable pour l'humain, faute que l'écran
lui remontre jamais le motif d'origine.

**Les écarts résiduels.**

1. **Un protocole qui cite un épisode remplacé garde une empreinte calculée sur
   le payload précédent.** Aucun consommateur vivant ne la recoupe aujourd'hui ;
   c'est vrai maintenant, pas par construction.
2. **La branche « contournement nouveau » n'a pas de banc de bout en bout** :
   elle est gardée côté route, pas depuis l'écran.
3. **`assessment_episodes` n'est plus vide en production** (4 lignes au
   2026-09-06). Des commentaires du dépôt affirmaient encore le contraire, sur
   la foi d'un constat du 2026-08-26 ; ils sont corrigés là où ce lot passe.
4. **Le motif saisi à l'écran est ignoré sans que l'écran le dise.** Sur un acte
   déjà enregistré, le panneau exige encore une saisie qu'il jette : le
   praticien tape une justification nouvelle, lit « confirmé », et la base garde
   celle d'origine. Le comportement est le bon (§3) ; son silence ne l'est pas.
   Corriger l'écran — « justification déjà enregistrée le … » — est un lot
   propre, hors de celui-ci.
5. **`targetAt` peut diverger entre la colonne et le payload** lors de la
   re-confirmation d'une ancre dont la fenêtre a bougé. Aucun des lecteurs de
   `assessment_episodes` ne lit cette colonne aujourd'hui : dette nommée, pas
   défaut.
6 bis. **La reprise verbatim rejoue `decidePar`, que les routes protocole
   recoupent contre la session.** Un SECOND praticien qui re-confirmerait
   obtiendrait 200 au cockpit puis un refus définitif à l'enregistrement de
   version. Inatteignable aujourd'hui — le dépôt est mono-praticien — mais ce
   module existe pour rester sûr le jour où un second compte apparaîtra. Relevé
   par la troisième revue adversariale, laissé ouvert et nommé ici plutôt que
   corrigé à l'aveugle : l'exemption du recoupement pour une trace déjà en base
   est un arbitrage, pas une évidence.
7. **L'affichage du refus `episode_ecrit_ailleurs` n'est gardé que côté
   serveur.** La raison est assertée sur les deux 409, mais aucun banc ne prouve
   que le client l'affiche : `ClinicalRuntimeSection.test.tsx` ne couvre aucun
   chemin de refus, et en poser un demanderait de monter le composant entier.
   Retirer la raison de la liste du client laisserait donc la suite au vert.
   Nommé plutôt que masqué.
8. **Les suites de ce périmètre dépendent de l'ordre des tests.** Mesuré par la
   revue : `--sequence.shuffle` rougit déjà sur la base de cette PR. Ce lot
   ferme les fuites d'implémentation qu'il a introduites, il ne guérit pas la
   maladie de fond.

### D-128 — Révoquer ferme aussi par l'horizon : `consommeLe` ne dit plus qu'une chose

- Date : 2026-09-06
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06)
- Domaine : accès au portail patient, lecture de l'encart des dossiers neufs.
  **Aucune règle clinique, aucun seuil, aucune migration.**
- Porte sur : `D-126` (dont ce geste devient le jumeau), la PR #889 (l'égalité
  stricte, ici requalifiée), `D-085` §2, `D-125` pour l'étiquetage

**Le défaut.** La révocation datait `consommeLe` sur les liens encore en vol,
pour qu'`etatLien` les refuse. Or `consommeLe` est la seule trace d'entrée du
versant patient : on y écrivait « fermé » dans une colonne qui dit « ouvert ».
L'encart des dossiers neufs devait ensuite écarter ces tampons par une égalité
stricte avec `sessionsInvalidesAvant` — et cette ruse ne tenait qu'UNE
révocation, la colonne n'ayant qu'un emplacement : à la seconde, les tampons de
la première redevenaient indiscernables d'une entrée, et le dossier passait de
« Jamais connecté » à « Onboarding à finir » sans que personne ne soit entré.

Le code nommait cette limite et la disait insoluble : « les distinguer
demanderait une colonne à la table des liens ». **C'était faux.** Il ne fallait
pas ajouter une colonne, il fallait retirer un écrivain.

**Ce que la décision tranche.**

**1. La révocation ferme par `expireLe`, comme la désactivation.** Un écrivain
RETIRÉ à `consommeLe`, aucun ajouté nulle part, aucun lecteur nouveau. Le filtre
`expireLe: { gt: maintenant }` rend l'écriture monotone et idempotente. Les deux
fermetures praticien sont désormais le même geste, au mot près.

**2. L'encart n'a plus rien à discriminer.** La présence de `consommeLe` EST
l'entrée, pour toute ligne écrite depuis. L'égalité stricte de la #889 n'est pas
retirée : elle devient un FILET RÉTROSPECTIF sur les lignes antérieures, et
c'est écrit à l'endroit où elle vit.

**3. Ce qui a été REFUSÉ, et qui semblait pourtant la solution.** La piste
examinée d'abord faisait écrire à la révocation `consommeLe` ET `expireLe`, pour
que le lecteur discrimine par `consommeLe >= expireLe`. Elle fonctionne — c'est
son piège. Elle AJOUTE un écrivain à `expireLe` sans en retirer aucun à
`consommeLe` : on finirait avec deux colonnes à deux sens au lieu d'une colonne
à un sens. Elle donnerait surtout à `expireLe` un SECOND lecteur, et dès lors
tout futur écrivain d'`expireLe` qui oublierait `consommeLe: null` dans son
`where` convertirait silencieusement des entrées RÉELLES en tampons.

**4. La consommation compare l'horizon à la valeur LUE, pas à une horloge.**
`D-126` avait conditionné la consommation à `expireLe: { gt: new Date() }` en
croyant fermer la course. Elle ne la fermait pas : ce prédicat est évalué en
JavaScript à la CONSTRUCTION de la requête, donc avant l'attente du verrou de
ligne. La fermeture concurrente commite ensuite, à un instant postérieur, et son
nouvel horizon satisfait encore le prédicat. Côté SQL, `now()` ne vaudrait pas
mieux : Postgres le fige au début de la transaction, elle aussi antérieure à
l'attente. Le prédicat devient donc un COMPARE-AND-SWAP sur la valeur lue :
toute fermeture déplace `expireLe`, la constante ne correspond plus, et Postgres
réévalue le prédicat sur la version verrouillée de la ligne. Relevé par la revue
adversariale de ce lot, sur du code mergé le jour même.

**Les écarts résiduels.**

1. **Les lignes ANTÉRIEURES ne sont pas récupérées**, et se rangent en trois
   familles. (A) Les tampons posés par l'ancien ordre de l'atterrissage
   (consommer avant de garder, pré-`D-126`) : indiscernables, définitivement.
   (B) Les tampons de révocation sur liens en vol : rattrapés par le filet tant
   que leur révocation reste la dernière du dossier. (C) Les tampons sur liens
   déjà expirés : reconnaissables par ligne (`consommeLe > expireLe`), mais les
   récupérer donnerait à `expireLe` le second lecteur que le §3 refuse.
2. **Aucun volume de production n'a été lu.** Combien de lignes tombent dans
   chaque famille, on l'ignore — et la conception ne dépend d'aucun comptage.
3. **`sessionsInvalidesAvant` non nul ne veut pas dire « révoqué »** : la
   migration `20260721190000` a rempli la colonne par backfill. Le filet vaut
   par la coïncidence à la milliseconde, pas par un état.
4. **Le motif journalisé se déplace** : un lien fermé par révocation était
   refusé en « consomme », il le sera en « expire ». Destination et message
   patient inchangés ; qui cherche des révocations dans les logs doit le savoir.
5. **La course à la NAISSANCE d'un lien est inchangée** (`D-126` §3). Elle ne
   peut pas salir l'encart : la ligne reste à `consommeLe` nul.
6. **AUCUN BANC NE GARDE L'ALLER-RETOUR `DateTime`.** Le compare-and-swap
   suppose qu'une valeur lue par Prisma puis renvoyée dans un `where`
   corresponde encore à la ligne. Une perte de précision rendrait le prédicat
   TOUJOURS faux — et plus aucun patient n'entrerait. La revue adversariale l'a
   vérifié à la main, sur le vrai client et une base jetable en `TIMESTAMP(3)` :
   aller-retour fidèle, `count = 1` puis `count = 0` au rejeu, et l'UPDATE émis
   est plat (sans `IN (SELECT …)`), ce qui est la condition pour que Postgres
   réévalue le prédicat sur la version verrouillée. Les bancs, eux, comparent
   contre un double : ils ne verraient pas cette perte. Le mécanisme pour
   combler ce trou existe (`web/prisma/checks/` et le service Postgres du CI) ;
   il n'est pas mobilisé ici.

**Règle d'arbitrage, pour les lignes que rien ne départage.** De deux erreurs
possibles, on choisit toujours celle qui fait **renvoyer un accès de trop** —
coût : un e-mail, que la prochaine connexion corrige — jamais celle qui fait
**attendre en silence un patient jamais entré**, dont le coût est l'onboarding
entier.

### D-127 — La sélection d'une priorité est un acte praticien : elle se pose au serveur, s'écrit une fois pour toutes, et ne se rattrape pas

- Date : 2026-09-06
- Statut : accepté (arbitrage du responsable du 2026-09-06 — « réparer la chaîne
  d'abord », puis « crée la table » —, rendu après que le LOT-03 de la campagne
  « Biologie exploitée » a buté sur ce blocage en essayant de jouer son
  troisième parcours). Les trois questions posées en session sont tranchées
  ci-dessous **sur pièces**, code et production relus avant rédaction.
- Domaine : clinique (chaîne C1, carte de décision), persistance, cockpit
  praticien. **Aucun seuil, aucune règle clinique nouvelle** : la décision porte
  sur QUI pose la sélection, ce qu'elle consigne, et ce qu'elle n'a pas le droit
  de rattraper.
- Porte sur : `D-054` (arbitrage 5 — recalcul serveur ; « le seul champ que le
  serveur ne peut pas dériver »), `D-058` (amendement du 2026-08-14 : la
  sélection praticien « n'a aucun producteur » — dette nommée, jamais tranchée),
  `D-087` (le déploiement du code précède la migration), `D-101` (une seule
  lecture partagée cockpit/vérificateur), `D-118` (un acte posé ne redevient pas
  invisible), `D-124` (patron de chaîne et unicité partielle), `D-125`
  (étiquetage des constats), `DC-01`, `DC-24`.

**Ce qui a été relu avant d'écrire** — sept faits, aucun supposé.

1. `DecisionPrioritySelection` porte **quatre champs** : `candidateId`,
   `selectedAt`, `selectedBy: 'practitioner'`, `rationale`
   (`clinical-engine/types.ts:319`). Les quatre entrent dans
   `decisionCard.inputHash` — seul `decisionCardId` en est exclu.
2. `candidateId` vaut `priority:${regle.id}` (`chaineC1.ts:490`) : il est dérivé
   de la **règle clinique**, pas de l'instance de carte. Il survit donc à un
   recalcul de carte tant que la règle se déclenche encore.
3. **La table des priorités EST signée** — `validationExterne: true`,
   `dateValidation: '2026-08-28T00:00:00.000Z'`, `shaPerimetre` concordant, et le
   banc l'assertionne (`priorityRulesV1.test.ts:76`). Des candidats sont donc
   réellement produits en production : la chaîne n'est pas coupée en amont de la
   sélection, elle est coupée **à** la sélection.
4. `canonical.ts` importe `node:crypto`. **L'empreinte d'une carte n'est pas
   calculable par le navigateur.**
5. Le vérificateur réinjecte `decisionCard.selectedMainPriority` tel quel puis le
   **re-valide** par `buildDecisionCard` (`verifierChaineC1.ts:157`) : « une
   sélection forgée sur un candidat que le serveur ne produit pas jette ici
   même ». Le fail-closed existe déjà.
6. Le rejeu du cockpit **avale** cette exception : `construireChaineC1` jette,
   le `catch` journalise et sert la proposition (`cockpit/route.ts:429` et son
   commentaire). Une sélection devenue inapplicable ferait donc **disparaître un
   épisode confirmé de l'écran** — exactement ce que `D-118` a fermé.
7. **Lecture de production du 2026-09-06** (one-off détaché, `D-087`) :
   `protocol_drafts` = **1 ligne**, `assessment_episodes` = **4** (toutes `T0`,
   `objets-cliniques-v2`, sur quatre dossiers distincts, la dernière confirmée
   le 2026-09-04), `protocol_checkins` = 0, `protocol_diffusion_approvals` = 0,
   `arbitrages_biologiques` = 0. L'unique ligne de `protocol_drafts` **n'est pas
   une version de protocole** : `contract_version = 'ja-food-observation-v1'`,
   `assessment_episode_id` nul, `reviewed_at` nul — c'est le journal alimentaire,
   que tous les lecteurs C1 écartent déjà par
   `contractVersion: { not: 'ja-food-observation-v1' }`.

**Constat, étiqueté selon `D-125`** : *observé sur un parcours réel* — **aucune
version de protocole C1 n'a jamais été enregistrée en production**, et quatre
dossiers réels se tiennent aujourd'hui exactement au bord de la coupure.

**Sept arbitrages.**

**1. Le geste est SERVEUR, et il ne pouvait pas être ailleurs.** La sélection
entre dans l'empreinte de la carte (fait 1) et le navigateur ne sait pas calculer
cette empreinte (fait 4) : un écran qui poserait la sélection dans la carte qu'il
détient produirait une carte que `refusChaineC1` rejetterait en 409. Ce que
`D-054` arbitrage 5 décrit — la carte vient du client, la sélection est
réinjectée — n'est donc **pas une porte ouverte** : le client ne peut qu'y
renvoyer une sélection que le serveur avait déjà mise dans la carte. Le geste
praticien s'écrit au serveur, qui reconstruit ensuite la carte ; l'écran
transmet un choix, il ne signe rien.

**1 bis. Conséquence : la sélection cesse d'être le champ que le serveur ne
dérive pas.** Une fois consignée, elle se relit en base — par une fonction
PARTAGÉE entre le cockpit et `verifierChaineC1`, patron
`lireEffetsIndesirables` (`D-101`) : deux lectures divergentes rendraient 409 sur
une carte honnête. Le vérificateur cesse alors de réinjecter la valeur SOUMISE,
et la comparaison canonique de contenu qu'il fait déjà transforme toute sélection
forgée en refus. `D-054` arbitrage 5 n'est pas contredit — il est **complété** :
le dernier champ que le client fournissait rejoint ceux que le serveur établit.

**2. Ce qui est consigné : les quatre champs du contrat, ancrés sur
`decisionCardId`, PLUS l'empreinte `decisionCardInputHash` du moment.**
L'empreinte **ne barre rien** — le recalcul barre déjà (fait 5), et gater dessus
refuserait des sélections encore parfaitement valides, le dossier ayant bougé sur
un axe sans rapport. Elle est consignée pour que le **désaccord se dise** :
faute d'elle, une sélection devenue inapplicable fait jeter le rejeu, que le
`catch` traduit en « proposition servie » — le praticien verrait son épisode
confirmé redevenir un formulaire à confirmer (fait 6). Avec elle, la sélection
périmée est écartée **en le nommant**, et l'épisode reste ce qu'il est. C'est
`DC-24` appliqué à un acte, et non à une mesure.

**3. Le régime est append-only chaîné (`supersedes_selection_id`) — et ce n'est
pas une préférence de style.** `selectedAt` entre dans l'empreinte de la carte,
et chaque version enregistrée ancre sa provenance sur
`protocol_drafts.decision_card_input_hash`. Une sélection **mise à jour en
place** ferait donc pointer l'ancre d'une version déjà enregistrée vers une carte
que la base ne sait plus reconstruire : `refusChaineC1` refuserait une version
que le praticien avait légitimement écrite. L'append-only est ce qui garde
**chaque version passée re-vérifiable**. S'y ajoute que `rationale` est un motif
écrit par le praticien : l'écraser effacerait la raison pour laquelle un
protocole a été construit. Le patron est celui de la maison — **treize** chaînes
`supersedes_*` au schéma avant celle-ci, aucun contre-exemple sur un acte
clinique.

**3 bis. Le fil d'une carte est STRICTEMENT LINÉAIRE, et c'est un resserrement
assumé.** Deux gardes : unicité **partielle** de la racine — une seule sélection
non chaînée par `(patient, carte)`, patron `D-124` — et unicité du **successeur**,
qui interdit qu'une même ligne soit supplantée deux fois. Les autres chaînes du
dépôt tolèrent la fourche et la tranchent à la lecture (`filCorrection`,
`resolveActiveVersion`). Ici la lecture n'a aucune règle de départage à appliquer,
et il vaut mieux qu'elle n'en ait jamais besoin : deux sélections concurrentes de
la même carte, ce sont deux praticiens qui croient chacun avoir décidé — la base
refuse plutôt que d'élire. L'écart au patron est nommé ici, pas subi.

**4. Aucune rétro-sélection.** Il n'y a rien à reprendre (fait 7) : zéro version
C1, donc zéro reprise, zéro backfill. Et surtout, poser aujourd'hui une priorité
sur les quatre dossiers qui ont confirmé leur `T0` serait **fabriquer un acte que
personne n'a posé** — `DC-01`, et le même interdit que celui qui protège les
dossiers réels d'un seed. Le geste s'ouvre pour l'avenir ; ces quatre dossiers le
trouveront à la prochaine ouverture de leur cockpit, et c'est tout ce qui leur
est dû.

**5. Ce que la réparation N'OUVRE PAS, nommé ici pour ne pas être lu de
travers.** Elle rend l'aval **atteignable**, pas **servi** : version relue,
approbation de diffusion, vue patient du protocole, points d'étape J7/J14/J21,
jalon J21 du Fil. Chacun garde sa propre porte, et aucune ne s'ouvre parce que
celle-ci s'ouvre. De même — et la contre-revue Codex du 2026-09-05 l'avait déjà
établi — cela ne touche **en rien** les tables de la campagne ALLIANCE : les deux
chaînes sont indépendantes.

**6. Le voisin de table est nommé une fois pour toutes.** `protocol_drafts`
héberge deux locataires : les versions C1 et le journal alimentaire
(`ja-food-observation-v1`). Tout dénombrement de cette table qui omet le filtre
que les routes appliquent déjà **dira faux** sur l'état du protocole — la lecture
du 2026-09-06 aurait conclu « une version existe » sans le fait 7.

**7. Le schéma part avant le code qui l'exploite — à UNE exception, et elle est
imposée par une garde du dépôt.** `D-087` fait déployer le code AVANT d'appliquer
la migration : du code qui interrogerait une table encore absente ferait échouer
la construction de la carte, c'est-à-dire le cockpit entier — motif déjà écrit en
tête d'`effetsIndesirablesPrisma.ts`. La lecture partagée, la route d'écriture et
le geste d'écran suivent donc dans une seconde PR, après application constatée.

L'exception est **l'effacement IDP2**. La rédaction initiale de cette décision le
renvoyait à la seconde PR ; c'était faux, et le dépôt l'a dit. Le banc de
complétude d'`effacement.test.ts` **dérive du schéma** : toute table portant
`@map("id_patient")` doit être effacée, sinon il rougit. Repousser le branchement
exigerait donc d'exempter la table — c'est-à-dire de désarmer précisément la
garde qui existe pour qu'une campagne future n'oublie pas de la vider. Le
branchement part **dans cette PR**, comme `resultats_biologiques` l'a fait pour
la même raison. Fenêtre assumée et bornée : entre le déploiement et l'approbation
`release-db`, une demande d'effacement échouerait sur une table absente — c'est
le compromis que le précédent a déjà tranché, et il se referme à l'application.

**Ce qui est refusé, et pourquoi le nommer importe.**

- **Le repli du constructeur sur `proposedMainPriorityId`.** Une note de travail
  antérieure le présentait comme « le correctif minimal », par symétrie avec le
  repli qui existe déjà pour la re-passation ciblée
  (`ClinicalRuntimeSection.tsx:944-951`). Il est **refusé** : ce repli ferait
  passer la **proposition du moteur** pour la **sélection du praticien**.
  `selectedBy: 'practitioner'` deviendrait faux, et `buildDecisionCard` refuse
  précisément toute autre valeur pour que ce champ ne puisse pas être forgé.
  Les deux replis ne sont pas symétriques : l'un vise QUOI re-passer, l'autre
  signerait QUI a décidé. La différence est toute la décision clinique.
- **Forcer `VITEST` dans le runner E2E** pour déverrouiller `chaineC1Fixture`.
  Ce garde existe pour qu'une table clinique ne se signe pas par appel de
  fonction ; on ne le crochète pas pour arranger un banc.

**Dettes ouvertes à la rédaction de cette décision.**

- La **seconde PR** : lecture partagée, route d'écriture, réinjection dans les
  deux sites de construction du cockpit et dans le vérificateur, branchement
  IDP2 — après application de la migration.
- Le **placement du geste dans le cockpit** — où le praticien lit les candidats
  et motive son choix — reste à poser, et il portera sa propre revue d'écran.
- Le **parcours 3 du LOT-03** (arbitrage → révision) reprend après cette
  réparation : son spec est écrit, complet, et n'attend que la chaîne.

**Suivi — 2026-09-06, seconde PR (côté serveur).** Migration appliquée et
vérifiée par conteneur (une seule tentative, dix colonnes, zéro ligne, RLS
active, les deux gardes sous leur forme attendue). La lecture partagée, la route
d'écriture et la réinjection sont livrées. Deux points que l'écriture du code a
imposés, et qui n'étaient pas dans la rédaction initiale :

**§8. La péremption devait être traitée, pas seulement nommée.** §2 disait que
l'empreinte servirait à ce que « la sélection périmée soit écartée EN LE
NOMMANT ». Le code a montré que sans mécanisme, elle n'est pas écartée du
tout : `buildDecisionCard` **jette** sur une sélection devenue inapplicable —
décision bloquée par un constat de sécurité apparu depuis (`DC-12` retire les
candidats), ou candidat dont la règle ne se déclenche plus — et le rejeu du
cockpit rattrape cette exception en servant « proposition ». Persister la
sélection sans traiter sa péremption aurait donc rendu ATTEIGNABLE la régression
que `D-118` a fermée : un épisode confirmé redevenant un formulaire à confirmer.

`construireChaineC1Tolerante` construit avec la sélection, et **sans elle** si la
construction échoue. Le repli n'est tenté qu'avec une sélection non nulle, et si
la construction sans elle échoue à son tour l'erreur remonte intacte : le seul
cas absorbé est « la chaîne se construit sans la sélection mais pas avec »,
c'est-à-dire exactement la péremption — aucune autre panne n'est masquée. Il est
partagé par le cockpit ET le vérificateur, comme la lecture : un repli fait d'un
seul côté rendrait 409 sur une carte honnête.

**Ce qui reste dû, et qui est le vrai « en le nommant »** : l'écran montre
qu'aucune priorité n'est retenue, il n'explique pas encore POURQUOI celle qui
avait été posée ne l'est plus. Le serveur le journalise sans nommer ni le motif
ni le candidat.

**§10. Le geste d'écran, et ses trois silences.** `SelectionPrioritePanel` se
place sous « Priorité et limites » — là où `ProtocolMiniBuilder` refusait sans
dire où aller. Il montre le RANG et le STATUT de chaque candidat : le praticien
décide avec ou contre le classement du moteur, jamais à l'aveugle. Le motif est
exigé à l'écran comme au serveur — la route refuserait de toute façon, mais un
refus après coup ferait perdre la saisie. Il RECHARGE au lieu de fabriquer :
l'empreinte de la carte passe par `node:crypto`, un état local divergerait de ce
que le prochain GET servira, et le POST de version suivant partirait sur une
carte que `refusChaineC1` rejetterait.

Il **ne rend rien** dans trois cas, chacun ayant son propriétaire ailleurs à
l'écran : décision bloquée (« Priorité et limites » le dit déjà, avec le motif
signé — et proposer un choix que `buildDecisionCard` refuserait serait pire que
répéter), aucun candidat classé (table non signée), aucune carte. Changer d'avis
rouvre le formulaire avec un motif **vierge** : recycler la justification d'un
choix pour fonder le suivant est exactement ce que l'append-only refuse.

**§9. Les bancs devaient décrire un dossier, pas une commodité.** Trente-huit cas
sont passés au rouge au déplacement de §1bis, et c'était le bon signal : ils
soumettaient une carte PORTANT une sélection sur un dossier où rien n'avait été
posé. Ils décrivent désormais la base correspondante
(`ligneSelectionDeFixture`, source unique avec `chaineC1DeReference` — deux
littéraux recopiés auraient divergé d'un caractère et rendu le 409
indéchiffrable). Un cas a été rendu explicite plutôt que laissé vert : celui du
dossier portant un signal passait par le repli au lieu de la voie qu'il annonce.

**Suivi — 2026-09-06, troisième PR : la dette de §8 est payée.**

**§11. La péremption se dit à l'écran, et elle traverse les silences de §10.**
Le §8 laissait un « reste dû » nommé : l'écran montrait qu'aucune priorité n'est
retenue sans expliquer pourquoi celle qui avait été posée ne l'était plus. Ce
n'était pas un manque d'ergonomie mais un manque de VÉRACITÉ — la carte servie
après un écart est celle construite sans la sélection, donc **en tout point
indiscernable de celle d'un dossier où personne n'a jamais choisi**. Le serveur
était seul à savoir qu'un acte existait, et il ne le disait qu'à son journal.

`selectionEcartee` remonte désormais dans la réponse `ready`, **à côté de la
carte et non dedans** — même motif que `rejoue` et `perimetreSigne` : la carte
est hachée et persistée, y ajouter un champ déplacerait toutes les empreintes
déjà émises. Il remonte du GET (rejeu) **et du POST** : une re-confirmation du
même épisode passe par le POST, et le taire là ferait disparaître la phrase au
premier re-clic.

**Ce qu'il ne dit pas, et pourquoi.** Ni le candidat, ni le motif consigné. Le
candidat écarté n'est plus classé — c'est la raison même de l'écart — et son
libellé n'existe donc plus dans la carte : le servir demanderait de fabriquer un
fragment d'affichage sur une règle qui ne se déclenche pas (`DC-01`). La phrase
dit en revanche que **rien n'a été effacé**, parce que c'est vrai (le fil est
append-only, la ligne demeure) et parce que c'est la question suivante.

**Les trois silences de §10 sont RESTREINTS, pas levés.** Ils portaient, et
portent toujours, sur le GESTE : décision bloquée et aucun candidat classé
signifient qu'il n'y a rien à retenir, et proposer un choix que
`buildDecisionCard` refuserait serait pire que se taire. Ils ne valent pas sur
le CONSTAT : « il n'y a rien à retenir » et « ce que vous aviez retenu n'est
plus servi » sont deux énoncés différents, et le second n'a de propriétaire
**nulle part ailleurs** à l'écran. Une décision bloquée est d'ailleurs le cas où
la péremption est la PLUS probable — `DC-12` retire les candidats — et s'y taire
serait se taire là où il faut parler. Le panneau rend donc le constat seul,
sans formulaire, dans les deux cas. Le troisième silence — aucune carte — reste
entier : sans carte il n'y a pas de réponse `ready`, donc pas de drapeau.

**Le vérificateur, lui, ignore ce drapeau, et c'est délibéré.** Il recalcule
pour comparer : une carte honnête émise après péremption est justement celle
construite sans la sélection. Y faire entrer le constat le ferait diverger de ce
que le cockpit émet — la divergence exacte que `D-101` interdit.

### D-126 — Désactiver un dossier ferme les liens en vol, par l'horizon et non par l'événement

- Date : 2026-09-06
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06 —
  « un patient désactivé doit voir son lien révoqué »)
- Domaine : accès au portail patient, cycle de vie du dossier. **Aucune règle
  clinique, aucun seuil, aucune migration.**
- Porte sur : l'invariant révocation du LOT-04, `D-085` §2 et §5, la PR #889
  (le discriminant d'égalité stricte de `api/praticien/nouveaux-patients`),
  `D-125` pour l'étiquetage des constats

**Le défaut.** Le dialogue de désactivation promettait déjà « ses liens
cesseront de fonctionner ». Le code ne le tenait pas : `PATCH
/api/praticien/patients` posait `actif: false` par un `update` nu, sans toucher
aux liens magiques encore en vol. Un lien émis avant la désactivation restait
ouvrable jusqu'à 24 h après — et l'atterrissage le CONSOMMAIT avant de vérifier
le compte, puis le refusait. Le lien était brûlé, le patient n'entrait jamais,
et la ligne restait avec `consommeLe` renseigné et `rejeuxRefuses` à zéro :
la forme exacte d'une entrée réussie pour qui lit cette colonne.

**Ce que la décision tranche** — six points.

**1. On ferme par `expireLe`, jamais par `consommeLe`.** C'est l'arbitrage
central. La révocation, elle, date `consommeLe` et paie ce choix par une
égalité stricte avec `sessionsInvalidesAvant` — seul moyen, pour l'encart des
dossiers neufs, de distinguer un tampon de fermeture d'une vraie première
connexion (PR #889). Recopier ce geste ici ferait de la désactivation le
**second écrivain de `sessionsInvalidesAvant`**, colonne à emplacement unique :
chaque nouvelle date écrase la précédente et convertirait d'un coup les tampons
d'une révocation antérieure en fausses entrées. **On refermerait une porte en
rouvrant l'autre.** `expireLe` n'a qu'un lecteur (`etatLien`), sa valeur est
dérivée (`creeLe + 24 h`) et donc reconstructible, et elle ne dilue pas
`consommeLe`, seule trace d'entrée du versant patient (`D-085` §2).

Le filtre `expireLe: { gt: maintenant }` rend l'écriture **monotone et
idempotente** : elle ne rallonge jamais un lien et ne touche rien au second
passage. Aucune détection de transition n'est nécessaire, donc aucune course
lecture/écriture à fermer.

**2. Désactiver n'est pas révoquer.** La désactivation ne pose PAS
`accessTokenRevoked`. Les quatre lecteurs d'entrée exigent déjà `actif` :
poser le drapeau ne fermerait rien de plus, et fabriquerait un cul-de-sac —
`PATCH { actif: 'OUI' }` ne le rabaisse pas, `action: 'lien_magique'` rend 409
sans le rabaisser ; le lèvent `issue`/`resend` (`api/praticien/token`) et
`POST /api/praticien/consultations`. Des gestes que rien à l'écran n'annonce
comme tels, pour zéro fermeture supplémentaire.

**3. L'atterrissage garde AVANT de consommer, et trace son refus.** La garde de
compte remonte au-dessus de la consommation atomique, qui devient le dernier
geste de la route. Le refus incrémente `rejeuxRefuses` et `derniereTentative`
comme le fait déjà le refus d'`etatLien` : sans cette écriture, un jeton martelé
sur un compte fermé ne laisserait plus que le log applicatif, qui est purgé.

Remonter la garde ne suffisait pas : elle lit un INSTANTANÉ. Si la
désactivation commite entre cette lecture et la consommation, un `updateMany`
filtré sur le seul `consommeLe: null` matcherait encore — lien brûlé, patient
dehors, et la ligne prenant la forme exacte d'une entrée réussie, c'est-à-dire
le défaut de départ reparu par la course. `expireLe` entre donc dans le
prédicat de consommation, évalué à une horloge FRAÎCHE (`maintenant` est
capturé en haut de la route, donc avant la fermeture qu'il s'agit de
rattraper). Postgres réévalue le prédicat sur la version verrouillée de la
ligne : la consommation échoue, et le patient voit l'écran de refus neutre.
Relevé par la revue adversariale de cette PR.

**4. La réactivation ne défait RIEN.** Un lien fermé ne se rouvre pas, il se
réémet. Le silence sur ce point aurait été un défaut ; la réponse est explicite
— et elle est DITE AU PRATICIEN, dans les deux dialogues. Ne pas l'y écrire
aurait reproduit à l'écran le cul-de-sac que le §2 reproche à la conception
écartée : une conséquence irréversible que rien n'annonce.

**5. L'état fermé se dit au cockpit.** Nouvelle étape `dossier_desactive` —
« Dossier désactivé » — en tête de l'ordre de l'encart des dossiers neufs, et
hors du compte « en attente ». Sans elle, un dossier que le praticien vient de
fermer restait « Jamais connecté », comptait en attente, et **remontait en tête
de l'encart** : l'inverse exact de sa décision.

**6. Le formulaire « Modifier » ne poste plus `actif`.** C'était la seule porte
de désactivation sans dialogue de confirmation. Le geste étant devenu
irréversible, un praticien venu corriger un numéro de téléphone pouvait tuer le
lien envoyé deux heures plus tôt, pour tout retour « Patient mis à jour. ».
L'état du dossier se change au menu de ligne, derrière son dialogue — la règle
que ce module s'écrivait déjà à lui-même.

**7. Les TROIS actions d'accès sont grisées sur un dossier inactif** — « Copier
le lien » comprise. Elle poste elle aussi (`action: 'lien'`), et le garde
`actif` d'`api/praticien/token` précède l'aiguillage des actions : le serveur
la refusait déjà, en « Patient introuvable. » sur un dossier que le praticien a
sous les yeux. Un bouton qui ment est pire qu'un bouton grisé.

**L'écart résiduel, nommé maintenant plutôt que découvert plus tard.**

1. **Les tampons `consommeLe` posés par l'ancien ordre survivent en base et
   sont irrécupérables** : aucune lecture ne peut les distinguer d'une entrée
   réelle. Le correctif vaut pour l'avenir, pas pour l'existant. Le commentaire
   de `nouveaux-patients` le dit, pour qui interrogera cette table plus tard.
2. **Aucun backfill n'est requis** : tout lien en vol antérieur est borné par
   `creeLe + 24 h` et s'éteint seul.
3. **Une course étroite demeure, à la NAISSANCE d'un lien** — non à sa
   consommation, que le §3 ferme. `api/portail/lien/demande` lit `actif` puis
   crée le lien dans une transaction tenue par `pg_advisory_xact_lock` ; sous
   contention de ce verrou, un lien peut naître après la fermeture. Il ne
   s'ouvre pas pour autant (la garde de compte à l'atterrissage le refuse), et
   ne redeviendrait utile qu'en cas de réactivation sous 24 h. Résidu identique
   à celui de la révocation d'aujourd'hui ; il n'est pas fermé ici.

**Forensique.** Un lien intact porte `expire_le = cree_le + 24 h` exactement
(`DUREE_VALIDITE_MS`) ; un lien fermé par une désactivation porte un écart plus
court. Le prédicat est donc une tolérance autour de 24 h,
`abs(extract(epoch from (expire_le - cree_le)) - 86400) > 60`, et non un seuil
large : à `23 hours`, toute désactivation survenue dans la dernière heure de vie
du lien échapperait au filtre. Angle mort résiduel : la minute qui suit
l'émission.
Table de distinction des trois gestes : `docs/RUNBOOK.md`, §Révocation.

**Comment la décision a été prise.** Cinq lentilles ont cartographié ce que
`patients.actif` commande, trois conceptions indépendantes ont été écrites
depuis trois angles (sécurité, changement minimal, doctrine), une synthèse a
tranché, et une passe adverse a tenté de la réfuter. Elle a rendu GO sous
réserve et trouvé quatre défauts que la conception ne voyait pas — dont les
points 5 et 6 ci-dessus, qui sont des conséquences directes d'arbitrages
qu'elle défendait comme des bénéfices, et le fait que le banc présenté comme
décisif ne l'était pas. Tous sont traités dans le lot.

### D-125 — Une fixture prouve un mécanisme, elle ne décrit pas un parcours

- Date : 2026-09-06
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-06,
  après l'audit du parcours du 2026-09-05, sa contre-revue adverse Codex, et la
  convergence des deux contre-lectures sur ce point précis)
- Domaine : méthode d'audit et de diagnostic des parcours ; rôle des données de
  test. **Aucune règle clinique, aucun seuil** — la décision porte sur ce qu'on
  a le droit de CONCLURE d'une source, jamais sur ce qui se calcule.
- Porte sur : `D-075` (les dossiers de test sont réels et se lisent par
  identifiant), `D-006` (données réelles dès la phase de test), `DC-01` et
  `DC-24` (provenance ; une absence n'est ni un zéro ni un normal),
  `CLAUDE.md` §Données patients, `.claude/rules/tests-validation.md`, l'audit du
  parcours patient ↔ praticien du 2026-09-05

**Ce que la décision tranche** — trois choses : le partage des rôles, le refus
d'une suppression, l'étiquetage des constats.

**1. Le partage des rôles.** Une **fixture** est un *contrôle* : déterministe,
rejouable en CI, elle atteste qu'un mécanisme se comporte comme spécifié. Un
**dossier réel** est une *observation* : lui seul dit quel mécanisme se
déclenche effectivement, dans quel ordre, avec quels délais, et où quelqu'un
décroche. Les deux sont nécessaires et **ne se remplacent pas**. L'audit du
2026-09-05 a demandé au contrôle de faire le travail de l'observation : il a
produit la carte des parcours **possibles** et l'a présentée comme un classement
de priorités. C'est cette confusion que la décision ferme.

**2. Les trois identités de fixture ne sont pas supprimées.** La suppression a
été posée en question par le responsable, examinée, et **écartée comme
destructrice** — quatre raisons, dont aucune n'est de forme :

- `web/prisma/seed.ts` écrit des **réponses de questionnaire**
  (`seedReponses.ts`) : le viser sur un dossier réel fabriquerait une donnée que
  personne n'a produite, qui alimenterait ensuite scoring, orientation et
  indications — `DC-01`, `DC-24`, et c'est déjà l'interdit de `CLAUDE.md` ;
- **le CI n'a pas de base de production et ne doit pas en avoir** :
  `test:worktree` provisionne un PostgreSQL éphémère, migre, seede, puis joue
  Playwright contre le build. Sans fixtures, T2 et T3 n'ont plus rien à jouer ;
- **un dossier réel bouge sous le banc** : une suite ancrée dessus devient
  instable, et surtout elle couple son verdict au soin réel de quelqu'un ;
- **certains défauts ne s'observent pas en attendant** — la perte d'écriture
  trouvée par la contre-revue (`K1`, deux confirmations divergentes du même
  épisode) exige une concurrence fabriquée ; on ne guette pas qu'elle arrive à
  un patient.

S'y ajoute la raison HDS : « développer à partir des patients réels » mettrait
leurs données dans les environnements de dev, les logs et les captures. `D-075`
les lit **sur place**, par identifiant, depuis un conteneur — il les lit, il ne
les sort pas. Supprimer les fixtures pousserait le réel vers la boucle de dev,
exactement à l'envers.

**3. Tout diagnostic de parcours étiquette chacun de ses constats** — *observé
sur un parcours réel*, *démontré dans le code sans occurrence observée*, ou
*inconnu faute de preuve*. Deux corollaires, qui sont la moitié utile de la
règle :

- une perte d'écriture **démontrée** se corrige **sans** incident observé ; sa
  fréquence, elle, ne s'invente pas ;
- **un état incomplet n'est un défaut que si un geste était attendu à ce
  stade.** Table vide, étape non franchie, objet sans client : sur un dossier
  réel il reste à séparer le blocage, la pause voulue, et l'étape que le
  praticien n'a pas encore engagée. Sur une fixture, cette attente est
  entièrement artificielle.

**Ce que la livraison devra porter** :

- `CLAUDE.md` §Données patients porte la règle du partage des rôles ;
  `.claude/rules/tests-validation.md` porte celle de l'étiquetage ;
- la reprise de l'audit prend **chaque dossier réel comme unité d'analyse**,
  avec une chronologie commune aux deux voix : ce que le praticien a proposé,
  envoyé, validé ou modifié ; ce que le patient a reçu lorsque c'est vérifiable,
  consulté, renseigné ou demandé ; ce qui est revenu au praticien et comment il
  a pu y répondre ; puis l'écart avec l'attendu de ce dossier ;
- **sortie toujours dé-identifiée** — formes, comptes, transitions, délais
  relatifs ; jamais un nom, une adresse, ni un dossier reconstitué, y compris
  dans un artefact ou une mémoire de session ;
- la carte des parcours possibles est **conservée comme témoin** : l'écart entre
  ce que le code permet et ce que les dossiers montrent est lui-même une
  observation. Un chemin qui existe et que personne n'emprunte est un résultat ;
- **sous-produit attendu et opposable** : la liste des trajectoires qui manquent
  au seed. Les fixtures ne manquent pas en NOMBRE — trois identités suffisent —
  elles manquent en VARIÉTÉ : chacune vit aujourd'hui un parcours linéaire et
  idéal. Les enrichir est la réponse, pas les supprimer.

**L'écart résiduel, nommé maintenant plutôt que découvert plus tard.** Trois
points, et ils tiennent tant que rien ne les traite :

1. le seed ne porte **aucune trajectoire** — pas le lien ouvert onze jours
   après, pas le questionnaire à moitié rempli, pas le point d'étape hors
   tolérance. Tant qu'il en est ainsi, une T2 verte prouve le mécanisme sur un
   chemin parfait, et rien de plus ;
2. la lecture de production est un **geste manuel** (one-off détaché, `D-087`
   pour l'écriture, lecture seule ici) : l'observation n'est pas continue, c'est
   un instantané daté, et il vieillit ;
3. rien ici ne dit **combien** de dossiers réels portent la phase de test ni
   quelle variété ils couvrent. Si le compte est faible, l'observation sera
   pauvre — ce sera un résultat à énoncer, pas un échec de méthode à masquer.

**Pourquoi maintenant.** L'audit du 2026-09-05 a produit 106 constats classés
P0-P3, et ce classement était sur le point de commander des lots. La contre-revue
adverse en a réfuté les deux inférences causales ; le responsable a nommé la
cause plus profonde, que ni l'audit ni sa contre-revue n'avaient marquée — aucune
de ces gravités n'est pesée par ce qui se passe réellement. Trancher avant la
reprise ne coûte rien ; trancher après aurait voulu dire un second artefact à
corriger.

### D-124 — Corriger une saisie de résultat : nouvelle ligne chaînée, unicité rendue partielle, valeur et unité seulement

- Date : 2026-09-05
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-05,
  **avant toute ligne de code** — première case du Done du LOT-02)
- Domaine : rayon biologie fonctionnelle — étage 2 (résultats réels, `D-122`
  §2). **Aucune borne clinique, aucun seuil** : la correction revalide la
  FORME exactement comme la saisie (`DC-19`/`DC-20` inchangés).
- Porte sur : `D-122` §2 (la table `resultats_biologiques`), `D-087` (cycle
  migration), `D-090` (« corriger se fait en publiant une version qui
  corrige »), `DC-30` dans son esprit (une erreur se signale, elle ne
  disparaît pas), campagne « Biologie exploitée » LOT-02

**Ce que la décision tranche** — trois choses : le régime, la forme, le
périmètre.

**1. Le régime : nouvelle ligne chaînée, jamais de correction en place.** Ce
n'est pas une préférence, c'est la constitution du dépôt : **au moins dix
chaînes `supersedes_*` distinctes** existent déjà (réponses, événements de
confiance, brouillons de protocole, check-ins, nuits et jours d'agenda,
approbations, rejets, notes, propositions), et le schéma le dit en toutes
lettres — « append-only par convention, aucune route d'update ; un correctif
est une nouvelle ligne qui référence l'ancienne ». La correction en place a
été examinée et **écartée comme dominée** : elle exige de toute façon des
colonnes pour dire qu'une correction a eu lieu — donc la migration est payée —
tout en détruisant la valeur erronée et en rendant une correction
indiscernable d'une saisie neuve dans la trace. Même coût, moins de garanties.

**2. La forme : UNE colonne `supersedes_resultat_id`, et l'index unique
devient PARTIEL.** Le patron maison se heurte ici à un obstacle propre à cette
table : `cb_resultat_bio_patient_analyte_idx` est **UNIQUE** sur
`(id_patient, analyte_code, preleve_le)`, or corriger une valeur c'est écrire
une seconde ligne sur exactement cette clé. Trois formes ont été pesées ; la
retenue est celle-ci :

```sql
-- l'index unique devient partiel : les corrections en sortent
CREATE UNIQUE INDEX cb_resultat_bio_patient_analyte_idx
  ON resultats_biologiques (id_patient, analyte_code, preleve_le)
  WHERE supersedes_resultat_id IS NULL;
```

Une saisie **neuve** porte `supersedes_resultat_id` à `NULL` et reste soumise
à l'unicité — le doublon continue de partir en `P2002` → 409 `doublon_mesure`,
**comportement inchangé**. Une **correction** porte un `supersedes` non nul et
sort de l'index. Une colonne, un échange d'index, **aucun `UPDATE`**,
append-only strict intact. La lecture réutilise l'idiome déjà en place,
`resolveActiveVersion` (`web/src/lib/protocol/versioning.ts`) : la ligne
courante est celle qu'aucune autre ne supplante, la plus récente en cas
d'égalité — ce qui tranche aussi une fourche de deux corrections concurrentes.

Les deux formes écartées, et pourquoi :

- **rendre l'index simplement non unique** (le patron d'`AgendaSommeilNuit`) —
  supprimerait **en silence la garde anti-doublon**, puisque le 409 est un
  rattrapage de `P2002`. `AgendaSommeilNuit` n'avait aucune garantie base à
  perdre ; cette table-ci en a une ;
- **marqueur `remplace_le` sur la ligne d'origine + unique partiel dessus** —
  tient aussi, mais coûte deux colonnes, un `UPDATE` de la ligne corrigée, et
  la fin de l'append-only strict pour ne rien gagner de plus.

**3. Le périmètre V1 : valeur et unité seulement.** Corriger le
`analyte_code` ou le `preleve_le`, ce n'est pas corriger une mesure : c'est en
**annuler** une et en saisir une autre — or la suppression est explicitement
hors périmètre du lot et n'existera pas sans décision propre.

**Ce que la livraison devra porter** (opposable au LOT-02) :

- la **migration seule dans sa PR**, cycle `D-087` complet, application
  constatée par conteneur avant le code qui la consomme ;
- le contrat `prisma/checks/cb_resultats_biologiques_v1_negatif.sql` amendé —
  sa **liste blanche de colonnes** refuse toute colonne neuve (« une colonne
  neuve doit être arbitrée ») : c'est une porte voulue, cette décision la
  franchit ;
- horodatage et auteur de la correction **posés serveur, inantidatables**
  (`saisi_le` par défaut de la base) ;
- la série affiche la valeur **courante** et **dit qu'une correction a eu
  lieu** ; la ligne d'origine reste lisible.

**L'écart résiduel, nommé maintenant plutôt que découvert plus tard.** Une
correction qui atterrirait sur une clé `(patient, analyte, date)` déjà occupée
par une autre ligne courante **n'est pas rattrapée par `P2002`** — elle est
hors index par construction. Une vérification applicative est donc **due au
geste de correction**, et le lot doit la porter.

**Pourquoi maintenant.** `WN_CB_RESULTS_ENABLED` n'est pas posé en production
et `resultats_biologiques` compte **0 ligne** (`one-off-7473`, 2026-09-05). Un
échange d'index unique sur une table vide est gratuit ; sur une table peuplée
il peut échouer sur les données existantes et exige un plan de reprise. Et une
fois des mesures saisies, le régime de correction devient très coûteux à
changer.

**Suivi (2026-09-05) — quatre précisions rapportées par la contre-revue de la
migration (PR #883, verdict NO-GO initial, levé).** Aucune ne change le régime,
la forme ni le périmètre ; toutes complètent ce que la décision disait trop vite.

1. **La forme littérale de cette décision laissait la série sans index.** La
   garde partielle ne couvre que les lignes non supplantées, or la lecture est
   la série ENTIÈRE — une correction doit rester lisible avec ce qu'elle
   corrige. La migration ajoute donc `cb_resultat_bio_serie_idx`, non unique,
   sur les trois mêmes colonnes. **Et le nom de la garde ne bouge pas** :
   `cb_resultat_bio_patient_analyte_idx` désigne l'unicité depuis la création
   de la table et continue de la désigner. Recycler ce nom pour l'index de
   lecture aurait fait dire à la production le contraire du registre — un
   auditeur y aurait lu une garde disparue, ou l'aurait « réparée » en la
   rendant totale, ce qui tue toute correction.
2. **Un `CHECK` de non-réflexivité est ajouté** (`supersedes_resultat_id <>
   id`) : une ligne qui se supplante elle-même ne serait jamais tête de fil,
   et la mesure disparaîtrait de la série en silence. **C'est un écart assumé
   au patron maison** — aucune des dix autres chaînes `supersedes_*` ne le
   porte, et il est en pratique inatteignable (`id` est un `cuid()`). Il est
   strictement resserrant, donc conservé ; l'asymétrie avec les dix autres
   tables reste, elle, à trancher si le cas se pose ailleurs.
3. **La reprise de `resolveActiveVersion` était surestimée.** La fonction
   exige `{ inputHash, supersedesDraftId }`, que `ResultatBiologique` n'a pas,
   et rend UNE tête pour tout le tableau — or une série a une tête **par
   groupe (analyte, date de prélèvement)**. Le geste devra donc grouper puis
   adapter, ou la fonction être généralisée. À trancher avant l'écriture.
4. **La validation de la cible d'une correction n'est pas facultative, et ce
   n'est pas UNE condition mais QUATRE.** Une ligne au `supersedes` non nul
   est **hors index par construction** : un `supersedes` accepté sans contrôle
   contourne la garde anti-doublon autant de fois qu'on veut. Avant écriture,
   la route doit vérifier que la cible **existe**, appartient **au même
   dossier**, porte le **même `analyte_code`** et le **même `preleve_le`**, et
   est elle-même **tête de fil**. La décision n'en nommait qu'une (« même
   clé ») ; les quatre sont portées au Done du LOT-02.

**Suivi (2026-09-06) — le geste livré, et deux corrections au suivi du
2026-09-05** (contre-revue de la PR #887, verdict NO-GO initial, levé).

5. **Le §3 ci-dessus était juste sur le diagnostic, trompeur sur le remède.**
   Il disait que le geste devrait « grouper puis adapter » — la première
   écriture a compris qu'il fallait *supprimer* le groupement, au motif exact
   qu'une correction hérite de l'analyte et de la date de sa cible. Le motif
   est bon ; la conséquence tirée ne l'était pas. `resolveActiveVersion` fait
   **deux** choses — délimiter le groupe **et** y élire une tête — et seule la
   première devenait inutile. Sans élection, **les deux branches d'une fourche
   sortaient courantes** : deux valeurs faisaient foi pour la même mesure, avec
   deux gestes offerts à l'écran. Le groupement par `(analyte, date)` est donc
   **remplacé par un groupement par RACINE DE CHAÎNE** — strictement
   équivalent, puisque toute ligne d'une clé descend d'une seule racine et que
   l'index partiel n'en tolère qu'une —, **pas supprimé**. L'élection, elle,
   est reprise telle quelle. **L'équivalence a une précondition, à ne pas
   perdre** : elle tient tant que toute racine porte `supersedes IS NULL` et
   que la série est lue ENTIÈRE pour la clé. Sur une série lue partiellement,
   racine et clé cessent de coïncider — un lecteur futur ne doit pas étendre
   l'équivalence au-delà.
6. **Une mesure d'`import_labo` ne se corrige pas par une saisie praticien**,
   et cette garde est posée avant que le cas n'existe (aucune ligne d'import
   n'a jamais été écrite). Sans elle, la valeur d'un laboratoire passerait
   barrée sous une valeur frappée à la main, alors que la route déclare
   qu'`import_labo` attend son propre chemin. **Arbitrage à confirmer** : c'est
   le choix conservateur, il se rouvrira avec le chemin d'import.
7. **Le §5 a changé le SENS de la table, et la phrase de l'écran ne l'a pas
   suivi** (seconde contre-revue, motif unique du second NO-GO). Grouper puis
   élire fait que `corrigeeParId` ne désigne plus le successeur **direct** mais
   **la ligne qui fait foi** : sur `a→b→c`, `a` pointe vers `c`. L'écran, lui,
   disait toujours « corrigée le [date] en [valeur] » : il attribuait à `c` un
   geste qui n'a jamais eu lieu — c'est `b` qui a corrigé `a`, à une autre
   date, vers une autre valeur —, et sur une fourche il faisait passer une
   **sœur** pour une correction. Déclenché par la séquence la plus ordinaire
   qui soit : corriger deux fois la même mesure. La phrase nomme désormais un
   **état** (« remplacée — la valeur qui fait foi est Y, consignée le X »), et
   la date de chaque correction se lit **sur sa propre ligne** — sans quoi
   `saisi_le` n'apparaissait nulle part (la série affiche `preleve_le`) et le
   fil cessait d'être lisible pas-à-pas, dans un lot dont tout le propos est
   `DC-30`. **Leçon générale : un contrat de données qui change de sens oblige
   à relire toutes les phrases qui le rendent**, pas seulement le code qui le
   calcule.
8. **La route et la lecture doivent définir « tête de fil » IDENTIQUEMENT.** La
   garde applicative cherchait le seul successeur **direct** ; la lecture élit
   la tête du **groupe**. Les deux divergent sur une fourche : la branche
   perdante n'est supplantée par personne au sens du chaînage, si bien que la
   route acceptait de la corriger alors que l'écran lui avait retiré son geste
   — l'autorité basculait en silence vers la branche qui avait perdu, et la
   route permettait précisément ce que son message de refus dit interdire. La
   garde relit désormais **le fil entier** sur `(dossier, analyte,
   prélèvement)` — l'index de série ajouté au §1 — et applique la même règle
   que l'affichage. **La portée reste celle de `D-123`** : le séquentiel est
   fermé, la course de deux corrections vraiment simultanées ne l'est pas —
   c'est l'élection, et elle seule, qui la rend inoffensive.
9. **Le motif récurrent, nommé pour cesser de le redécouvrir.** Trois fois dans
   ce seul fichier, une PHRASE est devenue fausse sous son propre code — le
   commentaire `GD-1` (« ce POST ne lit rien » → il lit une ligne → il lit le
   fil), le message de refus `correction_deja_corrigee` (« a déjà été
   corrigée », faux dès que la garde refuse aussi une **sœur**), et la phrase
   du barré (§7). Aucune n'était fausse à l'écriture ; toutes le sont devenues
   quand ce qu'elles décrivent s'est élargi. **Règle qui en découle : élargir
   OU DÉPLACER une lecture, un contrat, une garde ou une source de vérité
   oblige à relire tout ce qui les RACONTE** — commentaires, messages d'erreur,
   fragments de changelog, fiches de lot. C'est le seul des trois défauts qui
   atteignait le praticien qui a coûté un NO-GO ; les deux autres ne mentaient
   qu'au relecteur suivant, ce qui est une dette d'une autre nature mais pas
   moins réelle. **Le §10 en est la quatrième occurrence**, et elle confirme la
   règle par un cas de plus : déplacer la source de l'unité a rendu *superflue*
   — pas fausse — une phrase d'esquive écrite quand cette unité était
   inconnaissable.
10. **`m17` : l'unité d'un analyte retiré, fermée dans le lot plutôt que
    reportée.** La bannière de divergence passait par la LISTE du catalogue,
    qui ne sert que `actif: true` : l'alerte était donc structurellement
    inatteignable pour les analytes retirés — or `M2` (§ contre-revue du geste)
    nommait précisément cette population comme celle où le catalogue a bougé,
    et c'est celle que ce lot ouvre à la correction. **Fermer `M2` pour les
    seuls analytes actifs, c'était le fermer partout sauf là où il avait été
    trouvé** : ce motif porte à lui seul. Le serveur, lui, relisait déjà
    l'analyte sans ce filtre et consignait son unité courante — il écrivait une
    unité que l'écran ne pouvait pas montrer. Forme : `unite` ajoutée au
    `select` de la relation `analyte`, qui n'est pas filtrée par `actif` ; le
    GET porte un champ de plus, `uniteCatalogue`, distinct de l'unité
    consignée. Trois sources par ordre — la ligne, la liste en secours, puis le
    **silence** : si aucune ne renseigne, l'écran n'affirme aucune unité plutôt
    que de supposer qu'elle n'a pas bougé (`DC-24`). **Motif écarté comme
    porteur** : « le fragment de changelog promettait déjà cette unité » est
    vrai, mais un fragment non assemblé se restreint en une ligne — en faire la
    raison créerait le précédent « une phrase de fragment force un champ de
    contrat », à refuser.

En revanche, ce que le §4 exigeait est tenu **plus fort que demandé** : les
quatre validations dues ne sont pas quatre contrôles, mais deux impossibilités
(analyte et date relus sur la cible, jamais pris du client) et trois lectures
gardées. L'écart « clé déjà occupée » que cette décision nommait comme dû au
geste est **fermé par construction** — une correction porte forcément la clé de
ce qu'elle corrige.

### D-123 — La course de deux consignations simultanées n'est pas due : la garde applicative suffit, et le détecteur existe désormais

- Date : 2026-09-04
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-04,
  sur constat de production lu le même soir)
- Domaine : rayon biologie fonctionnelle — document patient consigné (étage
  1 bis). **Aucune règle clinique, aucun seuil, aucun schéma touché** : cette
  décision est un refus d'ouvrir un chantier, pas une modification.
- Porte sur : `D-122` §1 (la table `documents_patient_biologie`), `D-087`
  (chemin release-db, dont cette décision évite précisément le cycle),
  `D-090` (régime du refus confirmable, que la garde livrée applique),
  campagne « Biologie exploitée » LOT-01

**Ce que la décision tranche.** La garde anti-double-consignation livrée au
LOT-01 est **applicative** — `findFirst` puis `create`
([route.ts:290](../web/src/app/api/praticien/biologie/proposition/document-patient/route.ts#L290)
et [:316](../web/src/app/api/praticien/biologie/proposition/document-patient/route.ts#L316)),
sans transaction ni contrainte d'unicité. Elle ferme le cas séquentiel et
laisse ouverte la course de deux requêtes vraiment simultanées.
**Cette course n'est pas due.** Elle ne sera pas fermée tant que l'un des deux
déclencheurs nommés plus bas n'est pas constaté.

**Sur quoi elle s'appuie — trois faits, vérifiés le 2026-09-04.**

1. **Le double-clic est déjà absorbé côté client.** Le bouton passe `disabled`
   sur `envoiEnCours`, posé **synchroniquement dans le `onClick` avant**
   l'appel, et `dejaConsigne` le referme après consignation
   ([PropositionBilanPanel.tsx:280-283](../web/src/components/patient-cockpit/PropositionBilanPanel.tsx#L280-L283)).
   Dans un onglet, deux clics ne produisent pas deux POST. La course n'est
   donc pas « deux clics » mais **deux contextes de navigation distincts**
   dont les clics tombent dans la largeur d'un aller-retour base — quelques
   millisecondes. Ce n'est pas une double-soumission, c'est une coïncidence.
2. **Le rayon d'explosion en aval est nul.** La table n'a que trois
   consommateurs dans tout le dépôt : le `GET` de relecture, le `findFirst` de
   la garde, et le `deleteMany` de l'effacement patient
   (`web/src/lib/patient/effacement.ts:130`). Rien ne la compte, ne l'exporte,
   ne la montre au patient, n'en dérive quoi que ce soit de clinique. Une
   ligne en double fait apparaître **deux fois la même remise, avec deux
   horodatages distincts**, dans une liste lue par un humain — aucun score,
   aucun document, aucune décision n'est faussé.
3. **La production comptait UNE ligne.** Lu par one-off `one-off-2476` le
   2026-09-04 à 23:53 (agrégats seuls, aucune identité) :
   `lignes=1, dossiers=1, doublons_de_texte=0, paires_à_moins_de_5_s=0`. Le
   geste a été exécuté **une fois depuis que la table existe**. Le défaut n'a
   pas une fréquence faible : il n'a jamais eu l'occasion de se produire.

**Ce qui rend l'attente légitime plutôt que négligente.** Le LOT-01 n'a pas
seulement posé la garde : il a livré le **détecteur**. Avant lui, un doublon
serait resté invisible pour toujours — la table n'avait aucun lecteur. Le
praticien le verrait désormais dans sa liste de relecture. On n'accepte donc
pas un risque aveugle, on accepte un risque **observable** : c'est la
condition sous laquelle « ne pas fermer » est un choix d'ingénierie et non un
oubli.

**Les deux déclencheurs de réouverture** — la décision n'est pas ouverte,
elle est conditionnée :

1. **Un doublon réel apparaît** — vu à l'écran, ou relevé par la requête
   agrégée ci-dessus rejouée en one-off.
2. **Le geste change d'échelle** — la table passe de l'unité à un usage
   courant, où la coïncidence cesse d'être une curiosité.

**Ce que la décision ne dit pas.** Elle ne dit pas que la contrainte en base
serait inutile ; elle dit qu'elle n'est pas due **maintenant**. Si un
déclencheur tombe, la voie retenue est **colonne d'empreinte du texte +
colonne d'intention (`doublon_confirmé`) + index unique PARTIEL** sur les
seules lignes non confirmées — et la contrainte se glisse **sous** le 409
confirmable, qui reste : c'est lui qui porte le message et le second temps
(`D-090`). Deux voies sont écartées et le restent :

- **l'index unique nu** `(id_patient, empreinte)` — il fermerait la course en
  tuant le geste que la garde autorise exprès : remettre une seconde copie au
  patient est légitime. Ce serait une régression de geste, pas une correction
  de bug ;
- **la transaction sérialisable sans migration** — payer un chemin de retry
  dans une écriture pour un événement de fréquence nulle, avec un verrou
  étranger aux habitudes du dépôt.

**Dépendance nommée.** Si un doublon survient, **le retirer demande un geste
qui n'existe pas** : c'est le terrain du LOT-02 (régime de correction). Cette
décision s'appuie donc sur le fait que LOT-02 finira par le donner.

### D-122 — Les étages restants du rayon biologie s'ouvrent : document patient consigné, puis résultats réels

- Date : 2026-09-01
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-09-01 —
  « passer aux autres étages du rayon », après constat visuel du rayon
  documentaire en production ; schémas des deux migrations confirmés
  explicitement le même jour)
- Domaine : rayon biologie fonctionnelle — régime documentaire (décision F du
  cadrage CB) et étage 2 (CB-09) ; aucune règle clinique, aucun seuil
- Porte sur : `D-073` (ancrage en colonnes, dont elle reprend le patron),
  `D-079` (le SHA fait foi), `D-080`/`D-120`/`D-121` (qui ont levé le verrou
  d'hébergement et exigé la demande explicite que cette décision constate),
  `D-081` (un drapeau se pose avec le code qui le lit, geste daté),
  `D-087` (chemin release-db), décision F du cadrage CB (README §4)

**Ce que la décision constate.** La demande explicite exigée par `D-120` pour
ouvrir l'étage 2 est rendue. Les deux livraisons passent chacune par une
migration, chacune seule dans sa PR, appliquée par `release-db` approuvé puis
constatée par conteneur, le code ensuite.

**1. Le document patient (décision F) se consigne ancré.** Table
`documents_patient_biologie`, patron `correspondances_medecin` sans le
médecin : texte généré côté serveur depuis la table d'indications signée,
`ancrage_sha256`/`ancrage_version` **non nuls** (ce document n'existe que
dérivé de la table signée — sans ancre, pas de ligne), append-only, RLS
deny-all, effacement IDP2 dès la PR de schéma, contrat SQL à liste blanche de
colonnes (verrou « sans valeurs » intact : la demande, jamais le résultat).
**Granularité : le dossier entier**, comme le courrier médecin — avec zéro
appariement NABM signé, tout remboursement sort `non_evalue` et le régime
documentaire couvre de toute façon toutes les lignes ; scinder par régime
redeviendra pertinent quand l'appariement sera curé.

**2. L'étage 2 (CB-09) reçoit sa table, bornée au cadrage.** Table
`resultats_biologiques` (migration distincte, seconde PR) : `id_patient`,
`analyte_code` (FK catalogue), `valeur`, `unite` (vocabulaire d'unités
partagé), `preleve_le`, `source` (`saisie_praticien | import_labo`),
`saisi_par`/`saisi_le`. **Par analyte seulement** — pas de ratio en V1 (ils se
calculent), entité distincte, jamais un champ de la proposition. Hors de
`tables_cb` du verrou structurel (comme les autres tables patient du rayon),
RLS deny-all, effacement IDP2 dès la PR de schéma. La borne « date non
future » se garde côté route (`now()` interdit en CHECK).

**Frontières nommées, non franchies ici.**

- Aucune règle « résultat → statut de panel » : le moteur de statuts ne lit
  que les déclarations de panel documenté ; faire parler un résultat réel au
  moteur est une règle clinique neuve, avec sa décision et ses claims. Une
  discordance déclaration ↔ résultat se **signale**, ne se résout pas
  (`DC-30`).
- `WN_CB_RESULTS_ENABLED` (retiré le 2026-08-31, `D-120` §3) se **repose avec
  le code qui le lit**, geste d'exploitation daté (`D-081`) — le verrou
  `isCbResultsEnabled` existe, exige les deux drapeaux, et tout code étage 2
  naît fermé.
- Le courrier médecin reste sans pièce biologique tant que sa frontière n'est
  pas rouverte (cadrage §7).

**Aucune modification clinique** (`DC-17`/`DC-18`) : aucun seuil, aucune
règle, aucune table signée touchée — deux tables de consignation et leur
régime d'écriture.

### D-121 — La réserve de D-089 est levée : l'annexe HDS est signée, G-TRUST-04 est définitivement clos

- Date : 2026-08-31
- Statut : accepté (**constat du responsable du traitement**, rendu en session
  le 2026-08-31)
- Domaine : sécurité, hébergement, gate `G-TRUST-04`
- Porte sur : `D-089` (levée sous réserve unique), `D-080` (échéance du
  constat), `D-078` (fenêtre de moindre couverture)

**Le constat.** L'annexe HDS Scalingo a été **signée le 2026-08-30** —
déclaration du responsable, rendue en session le 2026-08-31 ; la signature
s'est faite par canal hors dépôt (demandée le 2026-08-12, relancée le
2026-08-19). Le constat intervient dans le délai que `D-089` fixait : au plus
tard le 2026-09-01.

**Ce qui en découle.** La réserve unique de `D-089` est levée ; `G-TRUST-04`
est **définitivement clos** — le 2026-10-21 ne redevient pas point de contrôle
à ce titre. La retenue que la réserve imposait tombe : une affirmation
contractuelle d'hébergement HDS face au patient devient possible ; sa
publication reste un geste TRUST distinct, à jouer avec la mise à jour du
contenu patient qui suivra l'exécution de `D-080`/`D-120`. La fenêtre de
moindre couverture de `D-078` se ferme par cette signature.

**Reste dû, hors du gate** : l'archivage du document signé (et du DPA) au
dossier — rubrique 6 du `DOSSIER_RGPD.md`, où la ligne « signature et
archivage non faits » ne vaut plus que pour l'archivage.

**Traçabilité** : `GATES_GO_NO_GO.md` ligne 11 (statut mis à jour), note de
suivi sous `D-089`, `DOSSIER_RGPD.md` rubriques 12 et 14.

### D-120 — Le décommissionnement D-080 s'exécute : validation expresse, anticipation d'un jour actée, drapeau CB régularisé

- Date : 2026-08-31
- Statut : accepté (**validation expresse du responsable du traitement**,
  rendue en session le 2026-08-31) ; **exécution en cours** — la preuve
  d'effacement se consigne en rubrique 12 du `DOSSIER_RGPD.md` au moment des
  suppressions
- Domaine : hébergement, décommissionnement Vercel/Supabase, drapeaux
  d'exploitation
- Porte sur : `D-080` (décision-cadre), `D-081` (`WN_CB_RESULTS_ENABLED`),
  `D-089`/`D-121` (G-TRUST-04)

**Ce qui est décidé, en trois points.**

1. **Le décommissionnement complet de Vercel et Supabase est validé
   expressément**, avec une **anticipation d'un jour actée ici** : l'exécution
   s'engage le soir du 2026-08-31, la lettre de `D-080` fixant le terme au
   2026-09-01. La production Scalingo est constatée saine le jour même
   (DNS exclusivement Scalingo, `HDS=true`, service HTTP sain) ; la fenêtre de
   stabilité n'a connu qu'un incident de performance le 2026-08-31 au soir
   (saturation mémoire des conteneurs, résolu le soir même par
   redimensionnement S→M et borne de tas V8), sans atteinte aux données ni
   interruption du service rendu.

2. **L'ordre d'exécution protège le point de non-retour.** Gestes réversibles
   d'abord : détacher `app.wellneuro.fr` du projet Vercel et déconnecter
   l'intégration GitHub — un déploiement « production » fantôme du ~2026-08-28
   a été constaté, le lien GitHub→Vercel buildait encore à chaque push.
   Suppressions ensuite, projet Vercel puis projet Supabase gelé (dernier
   rollback des données pré-cutover, backups inclus), **chacune avec capture
   de preuve au moment du geste** (écran de confirmation daté, e-mail,
   confirmation d'effacement des backups demandée au support). Les
   suppressions restent des gestes du responsable au dashboard, conformément
   à `D-080` ; aucune copie de secours hors HDS avant suppression.

3. **Un écart de gouvernance découvert à l'inventaire est régularisé** :
   `WN_CB_RESULTS_ENABLED` était posé en production sans décision ni fragment,
   en contradiction avec `D-081` (« reste absent tant qu'aucun code ne le
   lit »). Retiré le 2026-08-31 à 23:19 (`env-unset`, geste inerte : zéro
   appelant dans le code). `D-081` demeure la doctrine : la pose accompagnera
   le code de la Phase C comme geste d'exploitation daté.

**Ce que « activer les fonctions dépendantes de HDS » recouvre — et ne
recouvre pas.** L'inventaire du dépôt n'a trouvé qu'une seule fonction jamais
conditionnée à HDS : la biologie réelle (Phase C, `WN_CB_RESULTS_ENABLED`,
zéro appelant en production). Aucun geste de code n'accompagne donc cette
validation ; la biologie réelle reste hors produit **par choix de roadmap**
(`D-089`), et son ouverture exigera une demande explicite distincte (nouveau
modèle de données, migration Prisma). `SAFETY_EI_METADATA` (`DC-42`) est une
signature clinique sans aucun lien avec HDS — hors périmètre de cette
décision.

**Reste dû pour clore** : preuves d'effacement capturées et consignées
(rubrique 12), mise à jour du contenu patient trust (`registre.ts`,
`gouvernance.ts` — palier T2), PR de nettoyage du code mort (scripts
`supabase:*`, `vercel.json`, bootstrap `vercel env pull`…), mises à jour
d'état courant (`PROJET_CONTEXTE.md`, `CLAUDE.md`,
`.claude/rules/db-prisma.md`, retrait du serveur MCP Supabase).

**Suivi (2026-09-01)** : projet Supabase supprimé par le responsable (CLI,
entre 00:12 et 00:18 CEST, au terme exact de `D-080` — l'anticipation actée
au point 1 n'a finalement pas servi) ; preuve consignée en rubrique 12.
Gestes Vercel exécutés dans la foulée par le responsable au dashboard
(domaine détaché, GitHub déconnecté, projet supprimé — zéro projet constaté
par canal indépendant à 00:39 CEST). **Le décommissionnement est
intégralement exécuté** ; reste la confirmation écrite d'effacement des
backups Supabase par le support, à archiver.

### D-119 — La contradiction s'explicite là où le geste se pose : constats dans la checklist, recoupement factuel près de la carte

- Date : 2026-08-29
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-29)
- Domaine : surface praticien — checklist de confirmation (`D-052`) et écran de
  décision ; aucune règle, aucun seuil, aucune table signée
- Porte sur : `D-050` (moteur déterministe, dont elle sert les constats),
  `D-052` (checklist), `DC-30` (une discordance se signale, ne se résout pas),
  `D-041` (aucune gradation de confiance)
- Origine : retour d'usage praticien du 2026-08-29 sur l'écran de validation
  T0 — « le message concernant la contradiction n'est pas clair du tout ».

**Ce qui bloquait.** Le chargeur des préconditions calcule les constats
complets — instruments, déclarations, dates — puis n'en laisse passer qu'un
**compte** : la checklist affichait « 1 contradiction ouverte sur ce dossier »
sans dire laquelle, ni où la lire, ni ce que confirmer signifie. Le praticien
devait contourner en aveugle une garde dont le contenu était calculé trois
lignes plus haut.

**La décision, en deux gestes et une frontière.**

1. **La checklist porte les constats, plus seulement le compte.** Chaque
   contradiction s'affiche dans la condition souple elle-même : sa description
   et ses passations datées, **recopiées** du modèle d'affichage du service —
   jamais composées ni reformulées (leçon `D-115` : ce que l'écran cite vient
   du service, pas de l'assembleur). Le motif de contournement devient un
   motif éclairé, et le texte dit désormais ce que le geste fait : confirmer
   ne résout pas la contradiction, le motif est tracé avec l'épisode.
2. **Le recoupement factuel s'affiche près de la carte de décision.** Quand
   une contradiction ouverte confronte un instrument qui **fonde aussi** un
   candidat de priorité (via les passations de sa provenance) ou le canal de
   plainte, l'écran le dit — une intersection d'identifiants, calculée par un
   module pur et prouvée par mutation.

**La frontière, nommée.** Aucune aide au choix par recommandation : une règle
« contradiction ⇒ orienter l'objectif » serait une règle clinique neuve,
exigeant claims certifiés et sa propre décision. Le domaine et les besoins ne
sont d'ailleurs **pas joignables** sans annoter une table signée — le
recoupement s'en tient aux deux faits partagés qui existent : l'instrument et
la passation. Et rien ne touche la proposition d'objectif ni les sept tables
de la campagne : la fenêtre `D-093` observe, on n'y écrit pas.

**Aucune modification clinique** (`DC-17`/`DC-18`) : les règles de
contradiction, leurs déclencheurs et la taxonomie des conditions sont
inchangés — c'est la **restitution** d'un calcul existant qui gagne en
fidélité.

### D-118 — L'épisode confirmé au cockpit se persiste à la confirmation : un acte posé ne redevient pas invisible

- Date : 2026-08-28
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-28)
- Domaine : chaîne C1 — persistance de l'épisode d'évaluation
- Porte sur : `D-054` (dont elle déplace un arbitrage sans en abroger les deux
  points de persistance), `D-052` (préconditions T0), `D-113`/`D-114` (identité
  de cycle), `G-TRUST-04` (journalisation des accès)
- Origine : retour d'usage du premier dossier réel servi de bout en bout
  (2026-08-28) — le praticien confirme `T0` au matin, recharge la page, et le
  rail affiche « Décision : en attente », « Actions : à ouvrir », comme si
  l'acte n'avait pas eu lieu.

**Ce qui bloquait.** L'arbitrage `D-054` faisait voyager la persistance de
l'épisode avec le protocole : le POST cockpit confirmait **en mémoire** et
n'écrivait rien — ses commentaires le disaient à quatre endroits. Tant que le
protocole n'était pas enregistré, l'acte clinique « j'ai confirmé cet épisode »
ne survivait pas à la session d'écran. Un écran qui affiche « en attente » sur
un geste déjà posé ment par omission ; et le praticien à qui l'écran ment
recommence son geste — au mieux une re-lecture, au pire une re-saisie.

**Ce que la décision ne change pas.** Le doublon de `T0` était déjà impossible :
l'identité d'épisode est déterministe (même dossier + même jalon ⇒ même
identifiant), et l'index partiel unique de `D-114` verrouille en base qu'un
dossier ne porte qu'une ancre par nom. La décision ne crée pas le blocage — elle
rend l'état **visible et durable**.

**La décision.** Le POST cockpit persiste l'épisode **à la confirmation**, sous
les mêmes gardes que le point de persistance du protocole : recevabilité
d'ancre, préconditions de persistance, résolution d'identité de cycle. Le GET
expose l'état persisté ; le rail des phases le lit — « Décision : renseignée »
survit au rechargement. Les deux points de persistance du protocole
**demeurent** (`D-054`, arbitrage 5 : un fail-closed écrit dans une seule route
est un fail-closed qu'on peut oublier de corriger dans l'autre) — leur upsert
idempotent trouve désormais la ligne déjà posée et ne réécrit rien.

**Le non-journal du POST change de justification, pas de comportement.** Il
reposait sur « ce POST n'écrit rien » — motif qui meurt avec la décision. Le
POST reste non journalisé, mais au titre de la dispense d'écriture de `GD-1`,
la même que les deux points de persistance du protocole : une écriture laisse
déjà sa propre trace datée et attribuée.

**L'état neuf « confirmé sans protocole » est sain partout.** Les neuf lecteurs
d'`assessment_episodes` traitent une ligne comme un marqueur de jalon confirmé
(`milestone` + `confirmedAt`), jamais comme une promesse de protocole — le
pré-vol lit les protocoles dans une requête distincte. C'est aussi la sémantique
clinique : l'épisode **est** l'acte de confirmation, le protocole est ce qu'on
en fait.

**Aucune modification clinique** au sens de `DC-17`/`DC-18` : aucun seuil, dose
ni borne ; aucune règle ajoutée, retirée ni modifiée. C'est le **moment de
persistance** d'un acte déjà défini qui change, et sa visibilité.

### D-117 — Une quatrième règle de priorité : l'axe douleur, sans préjuger de l'adressage

- Date : 2026-08-28
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-28)
- Domaine : table des règles de priorité — périmètre signé
- Porte sur : `D-054` (qui écartait `PRIO-DOU`), `D-116` (signature du même
  jour), `DC-27`
- Origine : suite directe de `D-116` — la même question, posée sur l'axe
  suivant que le corpus pouvait fonder.

**Ce qui bloquait.** `PRIO-DOU` était écartée depuis le 2026-08-12 pour deux
motifs : le corpus NNPP2 ne portait pas de claim d'intervention sur ce champ, et
**une part de la douleur chronique appelle un ADRESSAGE plutôt qu'un axe de
travail** — « produire un axe là où il faut orienter serait pire » que de
s'abstenir.

**Le corpus a changé.** Quatre claims valides de mécanisme portent la
PERCEPTION douloureuse : `WN-CL-0026-012` (« les IL6 abaissent le seuil
d'excitabilité des voies neurosensorielles dans la perception de la douleur »),
`WN-CL-0161-035` (oméga 3 et récepteurs FFA1/GPR40), `WN-CL-0163-002` (excès de
graisses saturées, d'oméga 6 et d'acides gras trans **associé** aux lombalgies
chroniques — le mot est celui du claim, et la règle s'en tient là : une
association n'est pas une cause, `DC-27`), et `WN-CL-0162-007` (modèle
biopsychosocial).

**La frontière, tranchée par le responsable, ne supprime pas le risque : elle
le nomme dans ce que la règle sert.** L'axe **ne préjuge pas** de l'adressage,
ne le réalise pas et ne le remplace pas. C'est écrit en `limitations`, donc servi
avec la règle. `WN-CL-0162-007` fonde cette réserve dans le corpus lui-même — la
douleur relève de processus biologique, neurologique, psychologique, social et
environnemental, dont un axe neuronutritionnel ne couvre qu'un.

**`douleurs` seul, et pas `mobilite`.** Les deux domaines étaient écartés
ENSEMBLE ; ils ne reviennent pas ensemble. Tous les claims cités portent la
perception ; **aucun ne porte l'appareil locomoteur**. Déclencher sur `mobilite`
citerait des sources qui ne parlent pas d'elle. La mobilité reste écartée sous
`PRIO-MOB`, avec un motif propre et une condition de retour qui exige de dire ce
qu'un axe de mobilité **ajouterait** à l'axe douleur, plutôt que de le dédoubler.

**Trois claims délibérément non cités.** `WN-CL-0161-057` (essai où le malate de
magnésium réduit la douleur) et `WN-CL-0102-003` (coenzyme Q10 « utilisé dans
les douleurs et la fibromyalgie ») sont des claims d'EFFET et de CONDUITE :
les citer ferait promettre un traitement là où la table désigne un axe.
`WN-CL-0161-056` (« le magnésium POURRAIT jouer un rôle ») est hypothétique —
une règle signée ne se fonde pas sur un conditionnel.

**Aucun seuil inventé** : `Q_MOD_03` domaine `douleurs` `>= 7`, la bande des
trois autres règles. Besoin 4 « Perception et sensations corporelles », dont
l'une des deux sources est l'instrument inflammatoire `Q_INF_01` — le mécanisme
cité.

**Seconde re-signature du même jour.** La date ne bouge pas ; seul le SHA suit
le périmètre. Signature posée après attestation explicite du responsable.

### D-116 — Une troisième règle de priorité : l'axe sommeil, en complément de l'orientation

- Date : 2026-08-28
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-28)
- Domaine : table des règles de priorité — périmètre signé
- Porte sur : `D-054` (qui écartait `PRIO-SOM`), `D-099` (signature précédente),
  `D-093`, `DC-27`, `DC-28`
- Origine : la vérification serveur des sources signées (`D-115`) a rendu
  visible que la table ne publiait que **deux** règles, et que la surface ne
  pouvait donc jamais proposer plus de deux axes.

**Ce qui bloquait, et qui est levé.** `PRIO-SOM` était écartée depuis le
2026-08-12 pour deux motifs, tous deux nommés dans sa `conditionDeRetour` : le
corpus ne portait, pour cet axe, que des claims d'exploration ; et
l'articulation avec la table d'orientation — qui déclenche déjà sur le PSQI en
bande `>= 7` — n'était pas tranchée.

1. **Le corpus.** Cinq claims valides de MÉCANISME fondent l'axe, de la même
   nature que ceux qui fondent l'axe digestif : `WN-CL-0086-001` (« le sommeil
   et l'éveil sont deux composantes indissociables du rythme circadien en
   Neuro-Nutrition »), `WN-CL-0017-015` (portée systémique), `WN-CL-0025-047`
   (dette de sommeil, insulino-résistance, inflammation de bas grade),
   `WN-CL-0006-021` et `WN-CL-0003-013` (versant neurotransmetteurs).
2. **L'articulation, tranchée par le responsable** : la priorité **complète**
   l'orientation, elle ne la remplace pas. Les deux n'énoncent pas la même
   chose et ne se contredisent donc pas — l'orientation propose d'objectiver la
   plainte par un instrument, la priorité propose de regarder l'axe. C'est le
   partage déjà écrit dans `BESOIN_SOURCES` entre l'agenda et le PSQI. Il est
   inscrit en `limitations` de la règle, donc servi avec elle.

**Trois exclusions délibérées.** `WN-CL-0030-001` et `WN-CL-0045-001` sont des
modèles de CAUSALITÉ : les citer ferait dire à la règle qu'une plainte de
sommeil cause le reste du tableau (`DC-27`) — même arbitrage que l'exclusion de
`WN-CL-0023-005` pour l'axe digestif. `WN-CL-0086-007` (privation de sommeil
comme chronothérapie) est une CONDUITE, et cette table désigne des axes.

**Les 39 claims de l'agenda de sommeil (`WN-SRC-0052`) restent hors de la
règle** : ils décrivent comment tenir un agenda, une procédure d'exploration.
C'est exactement ce que la condition de retour demandait de distinguer.

**Aucun seuil inventé** : le déclencheur est `Q_MOD_03` domaine `sommeil`
`>= 7`, la bande déjà utilisée par les deux règles publiées. Aucune cadence,
dose ni borne n'est touchée.

**Re-signature.** Ajouter la règle change `PRIORITY_RULES_SHA256`, ce qui a
refermé le verrou seul — comportement prévu, éprouvé ici pour la troisième
fois. La signature a été posée après attestation explicite du responsable :
`shaPerimetre` figé sur le nouveau périmètre, `dateValidation` au 2026-08-28,
et les cinq claims ajoutés à `claimsSource` ainsi qu'au contrat de fraîcheur.
**C'est la première re-signature dont le périmètre s'agrandit d'une RÈGLE**, et
non d'un texte.

**Ce que la signature assume**, comme les précédentes : une règle reposant sur
un item unique auto-déclaré de `Q_MOD_03` (`DC-28`, mitigé par ce que la règle
produit — un axe, pas une conclusion).

**Les trois règles restantes ne sont pas au même stade.** `PRIO-STR` et
`PRIO-FAT` exigent un instrument que le produit ne lit pas (PSS-10, DASS-21) :
aucun arbitrage ne les lève. `PRIO-DOU` est, comme `PRIO-SOM` l'était, à un
arbitrage praticien — la frontière entre axe de travail et motif d'adressage.

### D-115 — La source signée se vérifie au serveur : `G7-1` s'amende dans un seul sens, et l'exception est bornée

- Date : 2026-08-28
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-28)
- Domaine : provenance des propositions d'objectif — vérification d'une source signée
- Porte sur : `G7-1` (qu'elle amende), `D-094` (cite et n'invente jamais),
  `DC-26`, `D-093`
- Origine : contre-revue adverse Codex du 2026-08-27, affirmation `N2.2`
  (réfutée, contre-exemple exécuté)

**Le défaut.** La route de proposition acceptait du NAVIGATEUR le couple
`{regle, texte, shaPerimetre}` et le persistait comme `regle_signee` après
n'avoir vérifié qu'une **forme** : 64 caractères hexadécimaux pour le SHA, un
identifiant plausible pour la règle. Une règle inventée, syntaxiquement valide,
était donc servie au praticien puis au patient comme **citée d'une table signée
que le registre ne contient pas**. L'affirmation « le moteur cite et n'invente
jamais » était fausse.

**Ce n'était pas un oubli, et c'est ce qui rend l'arbitrage nécessaire.** La
route le disait — elle ne pouvait pas confronter le SHA au registre, `G7-1` lui
interdisant d'importer `lib/clinical/`. Mais une garde qui documente le trou
qu'elle laisse reste un trou : la contre-revue a traversé par là.

**L'arbitrage.** `G7-1` s'amende dans **un seul sens** : un adaptateur
serveur, `web/src/lib/praticien/sourceSigneeVerifiee.ts`, est autorisé à lire le
registre des règles de priorité. La route **confronte** le périmètre reçu à
celui du serveur et **recopie** le texte des règles depuis le registre, au lieu
de croire celui du navigateur.

**Ce que `G7-1` continue d'interdire** — écrit ici parce qu'une exception non
bornée transforme un interdit en préférence, et éprouvé par quatre bancs
(`G7-1 bis`) :

1. le module PUR n'importe **rien** — il part dans le bundle patient, et une
   dépendance serveur y a déjà cassé la construction de production ;
2. la route n'atteint le registre **que** par l'adaptateur, jamais directement ;
3. l'adaptateur ne lit **que** le registre des règles : ni `clinical-engine`,
   ni `scoring`, ni `instruments`, ni `equilibre`. Il résout une citation, il ne
   calcule aucune clinique ;
4. l'adaptateur ne **fabrique** aucun texte : il recopie, ou rend `null`.

**Les fail-closed sont durcis, jamais assouplis.** Un registre non signé rend
503 ; un périmètre reçu qui n'est pas celui du serveur rend 409 (« rechargez »)
plutôt qu'une substitution silencieuse ; un SHA **absent** reste un refus, comme
avant — substituer là le SHA du serveur aurait signé à la place du cockpit.

**La conséquence produit, qui n'est pas un effet de bord mais le fond.** Le
registre ne publie aujourd'hui que **deux** règles (`PRIO-DIG-01`,
`PRIO-PON-01`) ; les quatre autres sont écartées. Un candidat que le registre ne
publie pas n'est **plus** cité — il l'était, sous une signature qu'il n'avait
pas. La surface propose donc désormais au plus deux propositions. Ce n'est pas
une régression à corriger en élargissant la garde : c'est la mesure réelle de ce
qui est signé. L'élargir demande de **publier des règles**, pas d'assouplir la
vérification.

### D-114 — La base tient l'identité d'un cycle : la fenêtre sans dédoublonnage se referme au premier `T0`

- Date : 2026-08-28
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-28)
- Domaine : intégrité de `assessment_episodes` — forme du jalon et identité de cycle
- Porte sur : `D-113` (dont elle paie la dette nommée), `D-052`, `D-087` (chemin
  de mise en production d'une migration)
- Origine : contre-revue adverse Codex du 2026-08-27, affirmations `N1.1`
  (réfutée) et `N3.7` (jugement demandé)

**Le défaut.** `assessment_episodes.milestone` n'avait aucun CHECK, et rien
n'interdisait deux lignes de même identité de cycle. Le bord applicatif
couvrait la forme, le rang et l'identité de la ligne — mais seulement pour les
chemins qu'on avait prévus. La contre-revue a montré le contraire par
construction : elle a réfuté `N1.1` en postant une seconde ancre `T0` sous un
identifiant inconnu de la base, ce qui rouvrait la collision de clé primaire
inter-cycle que `D-113` venait de fermer.

**L'arbitrage, et son échéance.** La table porte **zéro ligne** en production
(constat par conteneur du 2026-08-26, `D-112`). C'est la **dernière fenêtre** où
ces contraintes se posent sans dédoublonnage : au premier `T0` confirmé, toute
migration devra d'abord prouver l'absence de doublons, ou décider lesquels
garder — un arbitrage sur données réelles, dans un dossier de patient.
L'argument « la table est vide, donc rien ne presse » se retourne : c'est parce
qu'elle est vide que c'est maintenant.

**Ce qui est posé.** Un CHECK de forme sur `milestone`, dont le motif est celui
de `FORME_ANCRE` — la série des ancres reste **ouverte** (`T0`, `T1`, `T142`) et
`T01` est refusé à dessein. Deux index uniques **partiels** : une ancre par
dossier et par nom (c'est lui qui ferme `N1.1`), un jalon de mesure par cycle.

**Ce qui n'est pas posé, et qui est nommé plutôt que sous-entendu.** L'index des
mesures ne couvre pas les lignes dont `cycle_id` est NULL : la colonne est
nullable par construction, et PostgreSQL traite deux NULL comme distincts.
Rendre `cycle_id` NOT NULL est une décision de modélisation distincte. Le
contrat SQL **éprouve cette limite** au lieu de la supposer, pour qu'on ne
croie jamais la garde plus large qu'elle n'est.

**Le garde du garde.** Prisma ne sait déclarer ni CHECK ni index partiel : le
drift check ne les voit pas. Un contrat SQL
(`prisma/checks/episodes_identite_cycle_v1.sql`) tente chaque écriture
interdite dans une transaction annulée. Éprouvé par deux mutations : un index
rendu **total** est pris par le drift check, un **prédicat qui glisse** — que le
drift ne peut pas voir — est pris par le contrat, sur le message attendu.

**Mise en production** : par `release-db` approuvé (`D-087`), après merge. La
migration ne s'applique pas au déploiement du code.

### D-113 — Les cycles sont nommés `T0`, `T1`, `T2` : une ancre posée ne se déplace plus

- Date : 2026-08-26
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-26)
- Domaine : modèle de suivi longitudinal — ancrage des cycles et des jalons
- Porte sur : `D-058` (jalon dû), `D-111` (réponse d'étape, dont elle corrige la
  dette multi-cycle nommée à la revue), `DC-30` (une discordance se signale)
- Livrée en **deux PR**, toutes deux mergées le 2026-08-27 : #803 la structure
  — qui ne change rien à ce que fait l'application —, #805 le comportement.
- La revue P0 de #805 a rendu **NO-GO** sur sa première version, et deux
  corrections en sont issues, l'une d'elles indispensable à l'objet même de la
  décision : **l'identifiant d'un épisode porte désormais son cycle**
  (`runtime-episode-<patient>-<ancre>-<jalon>` pour un jalon de mesure). Il
  n'était unique que tant qu'un dossier n'avait qu'un cycle ; le `J21` du
  second prenait la même **clé primaire** que celui du premier, et la
  persistance écrit par `upsert(..., update: {})` — la confirmation n'écrivait
  rien sous une réponse `ok: true`. Le `T1` que cette décision ouvre aurait été
  un cycle dont aucune mesure n'était confirmable. Second correctif : un
  épisode dont l'identifiant et le jalon déclaré se contredisent est **refusé**
  au lieu d'être départagé (`DC-30`) — départager laissait ouvrir une ancre
  sans rideau `D-052`.
- **Trois** gardes d'écriture aux points de persistance, et non deux : la
  forme, le rang, la cohérence interne.

**Le défaut.** Chaque cycle s'ouvrait par un épisode `T0`. Deux cycles pour un
même patient produisaient donc **deux `T0`**, et toute la chaîne retenait « le
plus récent » (`trajectoire.cycles.at(-1)`, `resoudreJalonDu`). Ouvrir un second
cycle **déplaçait donc l'ancre du premier**, et les fenêtres de jalon encore
ouvertes se refermaient **comme effet de bord** : un patient à J85 perdait sa
question J90 le jour où son praticien confirmait un nouveau départ.

Le défaut n'est pas la fermeture — elle se défend cliniquement. C'est qu'elle
était **invisible et non décidée**.

**La décision.**

1. **Le premier cycle s'ancre en `T0`, le deuxième en `T1`, le troisième en
   `T2`.** Une ancre est posée une fois et ne se déplace plus jamais. La classe
   de bug ci-dessus n'est pas corrigée : elle **n'existe plus**.
2. **`milestone === 'T0'` devient un prédicat**, `estAncreDeCycle`. Chaque site
   doit être **relu**, jamais substitué mécaniquement : certains voulaient dire
   « l'ancre du cycle courant », d'autres « la toute première mesure ». C'était
   la même chose ; ça ne l'est plus. C'est là que les défauts se logeront.
3. **La série des ancres est ouverte, donc `JalonMomentum` n'est plus une union
   fermée.** Conséquence mesurée, pas supposée : `Record<JalonMomentum, number>`
   **dégénère en signature d'index** — `JOURS_JALON['T1']` était typé `number`
   tout en valant `undefined`, soit un `NaN` silencieux dans un calcul de date.
   `tsc` rendait vert. La table porte donc les **seuls jalons de mesure**
   (`Record<JalonMesure, number>`), et l'offset d'une ancre est **nul par
   définition** — une ancre est le jour 0 de son propre cycle.
4. **Les cadences ne bougent pas.** 21, 42, 90 et la tolérance de ±8 sont
   inchangées. Ce qui change est une **clé**, pas un seuil : aucune modification
   clinique au sens de `DC-17`/`DC-18`, et le fragment de changelog le dit.
5. **La dépendance ne va que dans un sens.** `equilibre/constants.ts` est une
   table clinique : elle ne connaît pas le protocole. La règle « une ancre est le
   jour 0 » vit dans `lib/protocol/fenetreJalon.ts`, qui lit les deux. Une
   première rédaction faisait importer le prédicat par la table — inversion de
   couche, écartée.
6. **L'ordre des cycles vient du RANG, la chronologie de la date — et quand les
   deux divergent, on le SIGNALE** (`discordanceDOrdre`). Un `T2` confirmé avant
   un `T1` est une discordance, pas un tri à corriger en silence (`DC-30`).
7. **`T01` est refusé** au même titre que `TA` : deux écritures d'un même cycle
   en feraient deux cycles distincts pour la lecture.
8. **L'ouverture d'un cycle ferme les fenêtres restées ouvertes du précédent**,
   et cette fermeture devient une **règle énoncée** au lieu d'un effet de bord.
   Mécaniquement, chaque cycle portant son ancre propre, on pourrait les laisser
   vivre — mais demander à un patient où il en est sur l'objectif du cycle
   précédent, alors qu'un nouveau a commencé, poserait la question à côté. Ce qui
   a déjà été écrit reste lisible.
9. **Aucune comparaison entre cycles n'est introduite.** Comparer le J90 de `T0`
   à celui de `T1` est un acte clinique qui demande sa propre provenance
   (`DC-27`, `DC-30`) — ce n'est pas un corollaire gratuit du renommage.

**Le moment.** `assessment_episodes` est **entièrement vide en production** —
zéro épisode, tous jalons confondus, et `milestone` n'a aucun CHECK. La bascule
ne coûte donc **aucune donnée migrée**. C'est le moment le moins cher qu'elle
aura jamais ; le premier `T0` confirmé en production le rendrait payant.

**Dette nommée.** `assessment_episodes.milestone` reste une colonne `String`
sans contrainte : rien en base n'empêche `T01`, `TA` ni `J7`. Poser ce CHECK est
une migration à part, avec sa confirmation distincte.

### D-112 — L'appareil de l'alliance est complet et n'a jamais servi : `D-093` n'est pas levé, et le classement n'est pas signable

- Date : 2026-08-26
- Statut : accepté (constat de bilan — ne modifie aucune règle clinique)
- Domaine : gouvernance clinique et clôture de campagne — Alliance 6.0-B
- Porte sur : [[D-093]] (dont elle constate les conditions de sortie), `DC-19`
  (la provenance précède la règle), `DC-24` (une absence de constat n'est pas un
  feu vert)
- Fonde : le LOT-06 de `2026-08-23-alliance-objectif-trois-voix` ·
  bilan complet : `docs/claude/campagnes/2026-08-23-alliance-objectif-trois-voix/BILAN.md`

**Le constat.** Lecture de production par conteneur one-off le 2026-08-26, par
identifiants seuls : **les neuf tables de la campagne portent zéro ligne**. Aucun
objectif négocié, aucune proposition, aucune ratification, aucun amendement,
aucune réponse d'étape. Sur 21 dossiers patients et 15 consultations validées,
**zéro épisode `T0` confirmé** — aucun cycle n'est ancré en production, ce qui
dépasse le périmètre de cette campagne.

Drapeaux : `WN_DOSSIER_DEUX_VOIX`, `WN_CE_QUI_COMPTE` et `WN_COMPREHENSION` sont
posés ; **`WN_OBJECTIF_PROPOSE` est absent**, donc le moteur de proposition est
éteint (fail-closed).

**Ce que cela décide :**

1. **`D-093` n'est pas levé, et ne peut pas l'être aujourd'hui.** Sa condition
   (a) — une réponse patient réelle sur un objectif — bute sur l'absence
   d'objectif ; la précondition que `D-093` nommait lui-même (« le praticien doit
   rédiger un objectif sur au moins un des trois ») n'est pas levée trois jours
   après la décision. Sa condition (b) — un bilan sur le comportement du
   classement — **n'est pas productible** : un bilan de comportement suppose un
   comportement, et rien n'a été présenté. La borne du **2026-10-04** court ; à
   son terme, sans les deux conditions, le périmètre **se referme**.
2. **Le dossier de signature du classement n'est pas préparé, et ce refus est
   motivé.** Signer un classement certifie la provenance d'un ORDRE de
   présentation. Zéro présentation, zéro reprise, zéro écart motivé : il n'y a
   rien à certifier. Un dossier rédigé sur cette base **supposerait** un
   comportement au lieu de le documenter — ce que `DC-19` interdit. La campagne
   devait fabriquer la provenance ; elle a fabriqué la **capacité** de la
   recueillir.
3. **Aucun agrégat n'est produit sur la parole patient**, y compris pour dire
   qu'elle est absente : le bilan compte des événements techniques, jamais la
   qualité d'une parole.
4. **La campagne n'est pas déclarée close par cette décision.** La passe Codex du
   LOT-05 (classe P0) et la contre-revue adverse à l'échelle de la campagne
   restent à jouer — la contre-revue **avant** la clôture, sous forme
   d'affirmations à réfuter.

**Le geste unique qui débloque la suite, et il n'est pas technique** : qu'un
objectif négocié soit rédigé sur l'un des trois dossiers du périmètre. Les trois
surfaces patient sont déjà ouvertes en production. La réponse d'étape du LOT-05
demande **en plus** un `T0` confirmé, dont aucun n'existe.

**Dette de lecture nommée.** `scalingo env-get` rend `An error occurred:` aussi
bien pour une variable absente que pour un incident d'API — les deux sont
indiscernables. C'est cette ambiguïté qui a fait accuser à tort le drapeau
`WN_MIGRATIONS_PAR_RELEASE_DB` au premier run `release-db` du LOT-05. Toute garde
qui lit une variable d'app doit distinguer les deux cas ou dire qu'elle ne le
peut pas.

### D-111 — La réponse d'étape a sa table, l'ancre n'est pas une étape, et l'EVA ne conclut rien

- Date : 2026-08-25
- Statut : accepté (migration confirmée explicitement par le responsable en
  session le 2026-08-25 ; gate humain = approbation `release-db`)
- Domaine : schéma et doctrine produit — campagne Alliance 6.0-B, réponse du
  patient aux jalons de son objectif
- Porte sur : `D-088` (EVA sans interprétation, dont elle applique le régime),
  `D-094` §2 (dont elle reprend le raisonnement de forme), `DC-19`/`DC-20`,
  `DC-24`
- Fonde : le LOT-05 de `2026-08-23-alliance-objectif-trois-voix`

**Contexte.** Aux jalons J21/J42/J90, le patient est invité à dire où il en est
**par rapport à son objectif** — en mots, plus une EVA facultative restituée
brute. Aucune table du dépôt ne pouvait porter cet événement. La migration est
seule dans sa PR ; le code qui la consomme suit, après application constatée par
conteneur (`D-087`).

**Décision 1 — table propre, et non un élargissement de `protocol_checkins`.**
Celle-ci est ancrée à un **protocole** : `protocol_draft_id` et
`id_assignation` sont NOT NULL, si bien qu'une réponse portant sur un objectif —
qui n'a ni protocole ni assignation — y serait inécrivable sans relâcher deux
colonnes porteuses. Et sa taxonomie de point d'étape est **J7/J14/J21**, quand
les jalons de l'objectif sont ceux de `JOURS_JALON` (**J21/J42/J90**) : la
fusionner l'aurait rendue bilingue sur ses **deux** axes — un `J21` y aurait
désigné deux moments différents selon la ligne. C'est le raisonnement de
`D-094` §2 pour l'amendement, appliqué au même endroit.

**Décision 2 — `T0` n'est pas un jalon de réponse, et le CHECK le refuse.**
`T0` est l'**ancre** des fenêtres, le moment où l'objectif se pose. Demander à
cet instant « où en êtes-vous par rapport à votre objectif » n'a pas de sens :
il n'y a rien derrière soi. La taxonomie est donc `JOURS_JALON` **moins son
ancre**. Ce refus ne se déduit d'aucun autre — `T0` étant une valeur
parfaitement légitime ailleurs —, il est donc éprouvé pour lui-même au contrat,
et la taxonomie y est lue dans la **définition** de la contrainte : les cas
négatifs testent des valeurs refusées, si bien qu'un CHECK élargi à `T0` les
laisserait tous verts.

**Décision 3 — l'EVA est portée par l'événement, bornée 0-10, et ne conclut
rien.** La borne est **purement technique de saisie**, identifiée comme telle
(`DC-19`/`DC-20`) : aucune bande, aucun seuil, aucune direction, aucune moyenne,
aucune courbe, aucun moteur ne la lit. Elle est **restituée brute** au praticien,
qui l'interprète avec son patient — le régime que `D-088` a établi pour l'EVA
sans interprétation, appliqué ici **sans l'élargir**. `0-10` est l'échelle de
saisie retenue, pas une grille.

Elle reste **facultative**, et la colonne nullable sans DEFAULT : la rendre
obligatoire forcerait un chiffre là où le patient n'a que des mots — et un
chiffre contraint n'est plus une réponse, c'est une case remplie pour passer. Un
DEFAULT, lui, fabriquerait une réponse que personne n'a donnée (`DC-24`).

**Si un instrument publié doit un jour structurer cette mesure** — Goal
Attainment Scaling ou autre —, ce sera une décision de **provenance dédiée**,
hors de ce lot. La présente décision ne pose aucun barème et n'en autorise
aucun.

**Décision 4 — le texte est obligatoire, l'EVA ne peut pas le remplacer.** Une
réponse d'étape sans mots n'est pas une réponse. L'invariant compte davantage
ici qu'ailleurs : l'EVA étant facultative, une ligne au texte vide serait un
**chiffre nu déposé dans un dossier** — exactement ce que ce lot refuse de
produire.

**Décision 5 — aucune contrainte d'unicité sur (patient, objectif, jalon).**
Répondre deux fois au même jalon fait **deux lignes**, comme une ratification et
un amendement. Se raviser se dit en le disant ; la lecture retient la plus
récente. Un `UNIQUE` transformerait un second geste en erreur technique, ou
pousserait à l'`upsert` — c'est-à-dire à écraser ce que le patient avait écrit.
Le contrat asserte cette **absence**, contrainte et index confondus.

**Décision 6 — l'ancre des jalons est celle de toute la chaîne, et il n'y en
aura pas de seconde.** `JOURS_JALON` compte les jours depuis le `dateT0` du
cycle — la confirmation du protocole (`jalonDu.ts`). La réponse d'étape emploie
**cette ancre-là**, sans en stocker de copie et sans colonne d'ancre.

Le point mérite d'être écrit parce qu'il se rouvrira : la version d'un objectif
peut naître longtemps après le T0, et l'on pourrait vouloir compter « J21 » à
partir d'elle. Ce serait **fabriquer un second calendrier** — un `J21` qui ne
désigne pas le même moment que le `J21` du reste du dépôt, c'est-à-dire
exactement la bilinguité que la Décision 1 reproche à `protocol_checkins`,
déplacée d'un cran. Le jalon est la **cadence du suivi**, pas l'anniversaire de
l'objectif : demander à J21 « où en êtes-vous par rapport à votre objectif » a du
sens quel que soit l'âge de la version visée, puisque c'est la version exacte qui
est référencée. Sans cycle confirmé, aucun jalon n'est calculable et la surface
ne s'affiche pas — ce n'est pas un manque à combler.

**Ce que cette décision n'autorise pas.** Calculer, moyenner, cumuler ou tracer
une courbe sur l'EVA ; en dériver un taux d'atteinte, une progression ou un
classement d'objectifs ; rendre l'absence de réponse à un jalon comme un
manquement (`DC-24`) ; relancer le patient — le portail reste en pull.

**Dettes nommées.**

1. Pas de CHECK « date non future » sur `repondu_le` : Postgres refuse `now()`
   dans un CHECK, la borne se garde à la route — reconduite de 6.0-A et du
   LOT-01. `repondu_le` reste la colonne de **déclaration** du patron de
   campagne, sœur d'`exprime_le` et de `geste_le` : nulle tant que personne ne
   déclare de date.
2. **La taxonomie des jalons et les bornes de l'EVA n'existent qu'en SQL.** Rien
   en TypeScript ne nomme « `JOURS_JALON` moins son ancre », et deux modules
   énumèrent déjà ses clés telles quelles. Un chemin qui dériverait le jalon de
   `resoudreJalonDu` obtiendrait `T0` pour un patient sans cycle confirmé, et
   l'INSERT lèverait un 23514 — donc un 500 côté patient, sur un chemin que ni
   T1 ni T2 ne voient. **Préalable de la PR de code** : une constante dérivée,
   ancre retirée nommément, et le refus rendu à la route en français.
3. **`btrim/1` ne retire que l'espace ASCII.** Le CHECK de texte de cette table
   emploie donc `btrim(texte, E' \t\r\n')`, et un cas négatif l'éprouve. Mais
   les CHECK de texte **déjà appliqués en production** — `amendements_objectif`,
   et ceux de 6.0-A — portent le trou : un texte fait d'une tabulation y passe.
   Les resserrer est une migration à part, avec son arbitrage ; elle n'a pas de
   porteur.
4. **La fenêtre d'effacement, assumée comme au LOT-01.** `effacement.ts`
   référence la table neuve et se déploie **au merge**, quand la migration
   n'est appliquée qu'après approbation `release-db`. Entre les deux, tout
   effacement de dossier échoue en 500 — **fail-closed, aucune perte**, la
   transaction étant annulée en bloc. Ne pas « protéger » l'appel par un
   `try/catch` : cela ouvrirait un effacement partiel, très pire que la fenêtre.
   Le couplage est imposé par la garde de complétude, qui refuserait le schéma
   sans la ligne.

**Complément du 2026-08-26 — les décisions de la PR de code.** La migration a
été appliquée puis **constatée par conteneur** le 2026-08-26 (cinq contraintes,
taxonomie sans `T0`, `btrim` à deux arguments, RLS active, aucun index unique
hors clé primaire). Les dettes 1 à 4 restent ouvertes ; la dette 2 est levée par
la Décision 7.

7. **La taxonomie est dérivée par une garde, pas par un import.** `G5` interdit
   au module pur d'importer `@/lib/equilibre` — et il est embarqué dans le
   bundle patient. `JALONS_OBJECTIF` est donc une littérale, et `G7` importe
   `JOURS_JALON`, en retire `ANCRE_JALON` **par son nom**, et compare. Une
   seconde assertion vérifie que l'ancre est bien une clé de `JOURS_JALON` :
   sans elle, renommer l'ancre des deux côtés laissait la première verte et
   rendait `T0` acceptable en silence (constaté par mutation).
8. **La fenêtre a sa fonction, distincte de `resoudreJalonDu`.**
   `jalonObjectifDu` lit les mêmes nombres sans les redéfinir, mais ne reprend
   pas l'exclusion des jalons **déjà confirmés par le praticien** : une
   confirmation au cockpit ne dit rien de ce que le patient a raconté, et
   réutiliser cette exclusion aurait fait disparaître la question d'un patient
   n'ayant jamais parlé. Elle ne rend jamais `T0` : sans ancre, elle rend
   `aucune` avec son motif.
9. **La fenêtre est tenue au POST, et sur QUEL jalon.** L'écran n'affiche que
   l'étape ouverte, mais une horloge de navigateur décalée, un onglet resté
   ouvert ou un POST direct le contournent. Sans la comparaison de jalon, un
   `J90` s'écrirait dans la fenêtre du `J21` et daterait un point d'étape d'un
   moment que le patient n'a pas vécu.
10. **Invitation et permission sont séparées, à dessein.** L'écran ne pose la
    question que sur un objectif ratifié ou dit-autrement, et sur une tête
    unique ; le serveur, lui, n'exige pas la ratification pour accepter le
    texte. Solliciter à côté est un défaut d'écran ; refuser la parole d'un
    patient sur son propre objectif serait un défaut de fond.
11. **Une réponse d'étape n'entre pas dans l'état de ratification.** Dire où
    l'on en est n'est ni ratifier, ni contester, ni reformuler. L'y verser
    ferait passer un patient en retard pour un patient qui conteste son
    objectif.

**Dette nommée par la PR de code.** La garde anti-gamification lit **aussi les
commentaires** : citer une formule interdite pour expliquer qu'elle l'est rend
rouge un fichier sain. Les autres gardes de la campagne dépouillent les
commentaires (`sourceSansCommentaires`) ; celle-ci non. L'aligner est un
changement de garde, hors périmètre de ce lot.

**Complément du 2026-08-26 (2) — ce que la revue a corrigé.** Verdict GO, quatre
majeurs, tous réels et tous corrigés. Deux méritent d'être retenus au-delà de ce
lot :

12. **Une garde qui nomme sa collection ne garde rien — troisième occurrence.**
    `reponsesJalon\.(reduce|sort)` était franchie par l'alias `etapes` introduit
    une ligne plus loin, et une moyenne d'EVA passait les deux bancs au vert. Le
    dépôt avait déjà rencontré ce patron sur `{ceQuiCompte.length}` puis
    `{siens.length}`, et le remède — interdire le motif partout, nommer les
    licites un par un — était écrit dans le MÊME fichier. **Règle : un interdit
    de forme ne se lie jamais à un identifiant choisi par l'auteur du code
    gardé.**
13. **Le bloc « écrit sur une version précédente » est un invariant de surface,
    pas une particularité de l'amendement.** La route ne sert que les têtes de
    chaîne : toute parole de patient rattachée à une version doit avoir son
    rendu hors-tête, sans quoi elle disparaît de son écran à la première
    reformulation — pendant que le praticien continue de la lire. Le LOT-04
    l'avait découvert pour l'amendement ; le LOT-05 l'a refait pour le récit
    d'étape, et son propre banc verrouillait la disparition. **Toute table de
    parole patient ancrée à `id_objectif` hérite de cette obligation.**

Corrigés aussi : le motif de `jalonObjectifDu` n'était rendu nulle part (écran
vide hors fenêtre, que le module écrivait vouloir empêcher) ; la garde
« écrivain unique » ne balayait ni `src/app` hors `api`, ni `src/components`,
si bien qu'un Server Action dans un composant écrivait les trois tables sans
faire rougir personne ; la fixture d'ancre E2E ne survivait pas à un run tué et
cassait trois specs qui assertent l'absence d'épisode sur `PAT_SEED_01` — un
`globalSetup` balaie désormais l'identifiant réservé avant tout spec.

### D-110 — « Le dire autrement » : le troisième verbe du patient, et le quatrième état

- Date : 2026-08-25
- Statut : accepté (arbitrages rendus à l'implémentation du LOT-04, campagne
  Alliance 6.0-B)
- Domaine : doctrine produit et surface patient — geste patient sur l'objectif
  négocié, dérivation d'état, sources admissibles de citation
- Porte sur : `D-094` §2 (qu'elle applique) et `D-094` §1 (dont elle borne la
  portée), `DC-24`, `DC-30`, `DC-19`/`DC-20`
- Fonde : le LOT-04 de `2026-08-23-alliance-objectif-trois-voix`

**Contexte.** `D-094` §2 a tranché la FORME du « dire autrement » — table
d'événement propre, append-only, écrivain unique au portail, version exacte
référencée. Le LOT-01 a livré `amendements_objectif`, appliquée et constatée en
production le 2026-08-23 ; elle est restée sans écrivain jusqu'ici. Trois
points de forme dépassent ce que `D-094` avait réglé, et sont tranchés ici.

**Décision 1 — le geste est gardé par `WN_DOSSIER_DEUX_VOIX`, pas par
`WN_OBJECTIF_PROPOSE`, ET IL S'OUVRE DONC AU MERGE.** `D-094` §2 dit « même
régime que la ratification » ; la ratification est gardée par
`WN_DOSSIER_DEUX_VOIX`, qui est **posé en production depuis le 2026-08-23**
(clôture de 6.0-A). Le geste est donc ouvert à tous les dossiers courants dès
la livraison — ce que la section « Application immédiate » de la campagne
prévoit explicitement, sur le fait que les patients actuels sont des
bêta-testeurs réels et informés.

L'adosser à `WN_OBJECTIF_PROPOSE` aurait fait dépendre le droit du patient à
répondre de l'activation de la **machine qui propose** : deux gestes de
gouvernance que `D-094` §5 tient précisément séparés, et la confusion exacte
que `D-070` a constatée sur le rayon biologie. L'interdit « le stock ne déferle
pas à l'allumage » est satisfait sans réserve : **rien ne s'accumule** — un
amendement est un geste que seul le patient peut poser, il n'existe aucun stock
dormant à libérer.

**Décision 2 — l'état dérivé compte QUATRE valeurs, et « dit autrement » est
une valeur à part entière.** Ni un accord, ni un refus. Le replier sur
`conteste` ferait lire un désaccord là où le patient a fait une proposition ; le
replier sur `en_attente` effacerait un geste qu'il a posé (`DC-24`). Les deux
tables — ratifications et amendements — se lisent **ensemble**, dernier geste
gagnant, sans jamais compter ni moyenner (`DC-30`) : lire la seule table des
ratifications rendrait « ratifié » à un patient qui vient d'écrire autre chose.

**Décision 3 — un amendement est une source admissible de citation pour une
reprise praticien, et cela n'élargit pas la liste fermée de `D-094` §1.** Cette
liste ferme les sources d'un **fragment de PROPOSITION**, c'est-à-dire ce que la
machine assemble. Un amendement n'est pas assemblé : c'est le patient qui l'a
écrit, à la première personne, sur son propre dossier. Il relève donc de la
règle inviolable elle-même — `enoncePatient` ne se pré-remplit que par citation
verbatim de ce que le patient a écrit — et non de la liste des matériaux que la
machine a le droit de citer.

Trois bornes rendent la citation opposable plutôt que promise :

1. **L'écran désigne, le serveur recopie.** Seul l'identifiant de l'amendement
   transite ; le texte n'est jamais transmis par le client, et la citation
   s'affiche sans champ modifiable. Un champ éditable inviterait à « améliorer »
   la phrase du patient, et la nouvelle version porterait un texte retouché sous
   l'étiquette « ce que le patient demande ».
2. **La citation est une RÉVISION**, jamais une tête neuve : sans
   `supersedesObjectifId`, elle créerait un second objectif courant, donc un
   portail qui refuse toute réponse.
3. **L'amendement doit porter sur la MÊME CHAÎNE** que la version reformulée —
   la chaîne, et non la seule version visée : le patient peut avoir écrit sur
   `v1` alors que le praticien reformule `v2`, et sa parole n'a pas cessé de
   concerner cet objectif parce qu'une version s'est intercalée.

**Décision 4 — le drapeau ne s'étend pas au cockpit, et c'est un choix, pas une
déduction.** `WN_DOSSIER_DEUX_VOIX` garde la **surface du patient** : sa
capacité à lire et à écrire. Ce qui est déjà écrit est une pièce du dossier, et
ni la lecture du dossier par le praticien ni sa faculté de **reformuler** un
objectif n'ont jamais été sous un drapeau (arbitrage de 6.0-A). Éteindre
l'interrupteur ferme le portail ; cela ne rend pas intouchables les mots que le
patient a déjà écrits, et les masquer au praticien le rendrait aveugle à une
pièce réelle du dossier.

La différence avec la reprise de proposition — gardée, elle, par
`WN_OBJECTIF_PROPOSE` depuis le LOT-03 — est de **nature** : celle-là consomme
une matière que la MACHINE produit, et couper son interrupteur signifie « nous
ne voulons plus qu'elle propose ». Deux bancs épinglent ce choix ; s'ils
deviennent rouges, c'est une décision à reprendre, pas un réglage à ajuster.

**Ce que cette décision n'autorise pas.** Compter, résumer, graduer ou
« diffuser » le texte d'un patient ; le tronquer (refus par motif, borne
affichée) ; le journaliser ; le soumettre à la garde de registre anxiogène —
celle-ci vise un texte que le **praticien** écrit et que le patient subit, et
l'étendre à la parole du patient reviendrait à faire dire au journal que sa
façon de parler de lui-même pose problème. Aucune notification n'est créée : le
portail reste en pull.

**Trois dettes nommées, pour qu'aucune ne se redécouvre.**

1. **Rien ne marque un amendement comme « lu » ou « intégré »** — une colonne
   mutable contredirait l'append-only, et c'est le même arbitrage que celui déjà
   écrit pour `desaccords_comprehension`. Deux conséquences assumées : le cockpit
   affiche tous les amendements de la chaîne indéfiniment, et rien n'empêche le
   praticien de poser deux versions successives portant le même texte de patient.
   Un accusé de lecture appelle sa propre décision.
2. **Le dossier clos n'arrête pas le troisième verbe**, par héritage exact de la
   ratification : la clôture est un état du suivi praticien, pas un ordre de
   silence fait au patient — couper le geste permettrait de clore un dossier pour
   rendre son objectif incontestable. Ce qui valait pour un clic vaut pour un
   texte ; l'écrire ici évite qu'on le « corrige » un jour comme un oubli.
3. **Aucune limitation de débit** sur le dépôt d'amendements, comme sur la
   ratification. Un jeton portail permet d'accumuler des textes de 4 Ko. Dette
   préexistante, plus coûteuse ici — elle n'a pas de porteur.

### D-109 — Clôture de « Doctrine exécutable » : six règles fermées, et tout le reste nommé

- Date : 2026-08-25
- Statut : accepté (LOT-08, lot de clôture — constat, aucun arbitrage neuf)
- Domaine : doctrine clinique — statuts, renvois, routages. **Aucun code.**
- Porte sur : les 58 règles `DC-nn`, l'audit du 2026-08-11, la file d'attente
- Fait suite à : les dix lots de la campagne, `D-095` à `D-108`

**Ce lot vérifie, il n'enregistre pas.** Sa fiche l'interdit en toutes lettres :
aucune bascule sur la foi d'un lot déclaré terminé. Les six règles ci-dessous
franchissent leurs **trois preuves**, chacune revérifiée ici — décision datée,
banc **présent au dépôt**, statut basculé :

| Règle | Décision | Banc |
|---|---|---|
| `DC-09` | `D-097` | `promptAssociationPreuve.guard.test.ts` |
| `DC-19` | `D-105`, `D-108` | `seuilsLitterauxMotives.guard.test.ts` |
| `DC-22` | `D-106`, `D-108` | `natureIndiceGlobal.guard.test.ts` |
| `DC-23` | `D-099` | `safetyFindings.guard.test.ts` |
| `DC-54` | `D-103`, `D-104` | `conflitsSourcesV1.guard.test.ts` |
| `DC-55` | `D-103`, `D-104` | `conflitsSourcesV1.guard.test.ts` |

**Décision 1 — `DC-19` bascule, `DC-20` ne bascule pas, et la nuance est le
cœur du lot.** Le banc des seuils exige désormais de chaque littéral qu'il soit
nommé ou **motivé**, et chaque motif dit pourquoi le chiffre n'est pas clinique.
C'est de la déclaration de nature, et elle mord. Mais elle est **en prose, dans
un banc** — pas dans un champ `thresholdKind` porté par la donnée : elle ne suit
pas le seuil hors du dépôt et ne se requête pas. `DC-20` reste donc chez
**Curation signée**. La distance est plus courte qu'au 2026-08-11 ; elle n'est
pas franchie, et l'écrire fermée aurait été le mensonge que cette campagne
existe pour supprimer.

**Décision 2 — les quatre règles non armées sont reconduites sur preuve
STRUCTURELLE, plus sur un comptage.** `rag_corpus_claims` ne porte **aucune
colonne de claim parent** (`DC-05`) ni **aucune colonne de niveau d'exécution**
(`DC-08`), et aucune `ALTER` ultérieure n'en ajoute : le déclencheur ne peut pas
être franchi, il n'est pas seulement « non franchi ». Pour `DC-52`/`DC-53`, la
mesure a trouvé une nuance qu'un comptage aurait manquée — « PNNS 4 » **figure**
au dépôt, mais comme **libellé d'un item de questionnaire** : on demande au
patient s'il suit ces recommandations, le système ne les référence pas. Un socle
cité dans une question n'est pas un socle référencé.

**Décision 3 — la matrice claim par claim est ROUTÉE, aux deux endroits qui
l'annonçaient sans destinataire.** Elle était promise en fin de constitution
**et** en fin d'audit : un travail annoncé deux fois et jamais routé finit par ne
plus être annoncé. Elle appartient entièrement à **Curation signée**. Ce qui rend
le routage exact plutôt que dilatoire : les 8 224 claims de production sont tous
`VALIDE` et leur `metadata` ne porte que `section`/`source_chunk`/`page`/`usage`
— la grille **n'a aucune colonne où s'écrire** tant que Curation signée n'a pas
ouvert les axes.

**Décision 4 — la fiche du lot était périmée, et c'est l'arbitrage le plus
récent qui l'emporte.** Le §2 de `LOT-08` annonçait les dix orphelines comme
« dettes nommées sans véhicule ». C'est l'option **écartée** la veille par
`D-107`, au profit d'une **campagne dédiée** — et pour ce motif exact : « dettes
nommées » est le régime qui les avait rendues orphelines. La fiche n'est pas
réécrite, elle est amendée en tête. Le lot prend acte ; il n'arbitre pas.

**Ce que la clôture refuse d'écrire comme fermé**, nommément : `DC-20` (nature
en prose), `DC-26` (le compilateur n'existe ni sur le disque ni dans
l'historique Git), `DC-42` (mécanisme complet, **signature reportée au
2026-08-30**), `DC-43` (mécanisme complet et relu, **sans sujet** — `neCouvrePas`
`null` sur les 95 interventions), `DC-58` (instruite, sans contre-exemple et
sans méthode fondée), les quatre non armées, et les **onze statuts orphelins**
recomptés au grep le 2026-08-25 — **13** occurrences, dont deux en en-tête,
inchangé depuis la mesure du LOT-11. `DC-50` et `DC-51` sont **renvoyées** à la
campagne chaîne alimentaire : un renvoi est un routage, pas une fermeture.

**L'audit du 2026-08-11 est amendé ligne par ligne et daté, jamais réécrit.**
Huit lignes changent de sort dans leur colonne « Porteur » ; le constat
d'origine reste lisible, comme la fiche l'exige. Une répartition finale par
véhicule est ajoutée en fin de document.

**Ce que la campagne aura appris sur elle-même, et qui est écrit dans la
constitution.** Quatre fois, un lot a déclaré close une chose qui ne l'était
pas, et **jamais le lot lui-même ne l'a vu** : une entrée de garde qui était un
no-op silencieux, un banc vert sous quatre mutations, une règle étiquetée
*Proposition* dont le corps concluait qu'elle basculait, et un texte de jeu servi
au patient depuis cinq semaines. Les trois premières ont été trouvées par revue
ou par mesure ; la quatrième par une **contre-revue adverse** lancée avant cette
clôture (`D-108`), qui a réfuté sept des treize affirmations qui allaient être
gravées ici. C'est la raison pour laquelle le bloc de clôture de la constitution
dit **d'abord** ce qui n'est pas fermé.

### D-108 — La contre-revue adverse a trouvé six trous, dont un servi au patient depuis cinq semaines

- Date : 2026-08-24
- Statut : accepté (arbitrages du responsable, rendus en session le 2026-08-24)
- Domaine : doctrine exécutable — bancs élargis, un texte patient corrigé, aucun
  seuil ni valeur clinique modifiés
- Porte sur : `DC-19`, `DC-20`, `DC-22`, et la réserve R2 de gamification
- Fait suite à : la contre-revue Codex du 2026-08-24 (PR #792), lancée
  **avant** le LOT-08 pour que ses trouvailles alimentent la clôture au lieu de
  la corriger après coup

**La revue a été lancée avant la clôture, et c'est ce qui a payé.** Le LOT-08 ne
change aucun code : la surface relue était identique avant et après. Mais il
**grave** l'état final dans la constitution, la matrice d'audit et
`FILE_ATTENTE` — une règle actée sur un banc qui ne mord pas y serait inscrite
comme fermée. Sept des treize affirmations soumises ont été réfutées, six
tiennent. Les six trouvailles ont été **revérifiées une par une** dans l'arbre à
`7793a4ac` avant tout correctif : toutes réelles.

**Décision 1 — le vocabulaire de jeu servi au patient est corrigé, et le garde
cesse d'être une liste tenue à la main.** `PatientCompanionHome.tsx` servait
« … pour le chemin parcouru » depuis le **2026-07-18** (`477fa20d`), monté dans
le portail par `app/portail/[token]/questionnaires/page.tsx`. Le mot est le
**deuxième motif** de la liste surveillée par `gamification-patient.guard.test.ts`
— ce n'est pas la liste qui a failli, c'est le PÉRIMÈTRE : le garde connaissait
la page, pas le composant qu'elle monte, et `components/patient-companion`
n'avait jamais été déclaré.

C'est la **deuxième fois** que ce garde est pris à ne pas couvrir ce qu'il
annonce. Le LOT-11 avait trouvé ses entrées de type fichier muettes ; sa
correction — une non-vacuité **par entrée déclarée** — ne pouvait par
construction rien dire d'une surface **jamais déclarée**. Le correctif ferme donc
la CLASSE : un nouveau cas remonte les imports de composants du portail patient,
transitivement, et exige que chaque racine atteinte soit déclarée. Un composant
patient neuf est gardé d'office, ou il rougit en nommant l'entrée qui manque.
Deux racines manquaient — `patient-companion` et `ui`. La phrase devient un
constat de l'étape (« Votre praticien en fait le point avec vous »), pas une
récompense d'une date atteinte.

**Décision 2 — les trois bancs sont élargis avant la clôture, pas déclarés
limités.** L'option « requalifier les statuts en déclarant les limites » a été
écartée par le responsable : un banc dont la limite couvre le contournement
qu'on vient de démontrer ne garde pas la règle, il en documente l'absence.

- **Le banc de bump** portait le nom du bump et ne gardait que **deux
  constantes**. La mutation `× 100 → × 99` déplaçait TOUTES les valeurs du score
  global sans le faire rougir, alors que `constants.ts` range explicitement la
  formule, les poids et le mapping parmi ce qui impose un bump. Deux registres
  s'ajoutent, sur le même patron par version : les **sorties** de
  `agregerEquilibre` sur six scénarios, et l'**empreinte du mapping** besoin →
  sources. Un sixième scénario a dû être ajouté après mesure : rejouée contre les
  cinq premiers, la mutation n'en faisait rougir qu'un, et `Math.round → floor`
  passait vert sur les cinq — l'arrondi entier absorbe 1 % sur les petites
  valeurs. Le scénario `frontiereArrondi` tombe sur 64,5 exactement. **Quatre
  mutations vues rouges.**
- **Le banc des seuils** ne connaissait qu'une POSITION, le littéral à droite
  d'un opérateur. `Math.min(0,95, …)` introduisait une borne non motivée en plein
  `src/lib` sans le réveiller. La position d'**écrêtage** entre dans le balayage.
  Mesuré d'abord : 39 littéraux, dont **30 `.slice`** de troncature d'affichage —
  les faire entrer aurait noyé la liste d'exemptions sous une classe qui ne
  décide de rien, défaut que l'en-tête du banc nomme déjà. `.slice` reste donc
  dehors, **avec sa mesure**. Les neuf écrêtages réels sont le même patron —
  `Math.max(plancher, Math.min(paramètre ?? défaut, plafond))` — et sont exemptés
  comme bornes de charge (`DC-20`).
- **Le banc de la nature du total** suivait la valeur par NOM, limite qui était
  *déclarée* — la contre-revue a montré qu'elle était un contournement complet :
  un second affichage sous alias, coexistant avec l'affichage conforme, laissait
  la sentinelle de fichiers immobile. Les alias sont désormais résolus **à point
  fixe** dans le fichier.

**Décision 3 — deux surfaces praticien reçoivent la mention de nature.** La
contre-revue a nommé `TrajectoirePanel` (`indice {jalon.valeur}`) et
`J21DecisionPanel` (la tendance sous « Score Mon équilibre ») : deux chemins de
données distincts vers le même agrégat, qu'aucune résolution d'alias ne peut
rejoindre — la valeur change de nom en traversant une réponse d'API. Un **second
détecteur, par LIBELLÉ**, lit ce que le praticien lit au lieu de ce que le code
nomme. `D-106` exige que le total soit identifié comme tel là où il s'affiche, et
le praticien est précisément celui qui pourrait le lire comme un score : les deux
surfaces portent la mention.

**Décision 4 — la borne de `scinderSousPlafond` est épinglée, pas corrigée.** Un
mot plus long que le plafond sort seul, hors plafond. Le constat est exact et
n'appelle aucun correctif : « aucun mot coupé » et « tout morceau sous le
plafond » sont **incompatibles** dans ce cas, et couper fabriquerait deux mots
absents d'un texte signé (`DC-19`) là où un morceau trop long ne fait que refuser
un enregistrement, bruyamment et sans rien altérer. Ce qui manquait n'était pas
le comportement mais son épinglage ; un cas mesure aussi que le registre publié
reste **loin** de cette borne.

**Ce que la revue a laissé debout, et qui compte autant.** A1 (verrous
fail-closed), A2 (`DC-12`), A3 (prédicat unique d'ouverture), A4 (verrous à sens
inverse), A6 (aucune identité réelle en fixture) et D2 (aucune valence sur la
variation) **résistent**. La revue a par ailleurs écarté sa propre première
restitution — elle présentait comme confirmées des mutations non exécutées — et
corrigé son verdict A4 après lecture des bancs de sécurité.

**Ce qui n'est pas corrigé ici, et pourquoi.** Les constats F5 et F6 portent sur
l'arbre final, sans être attribués à un commit de la campagne : le texte patient
précède la campagne de cinq semaines. Les corriger dans ce lot est un choix de
sécurité, pas une réparation de régression.

### D-107 — Les actes en attente : une signature reportée, deux campagnes routées, une borne déclarée

- Date : 2026-08-24
- Statut : accepté (arbitrages du responsable, rendus en session le 2026-08-24)
- Domaine : portefeuille et clinique — une borne de charge nommée, aucune valeur
  modifiée
- Porte sur : `DC-42`, `DC-43`, `DC-19`, et le sort des dix règles orphelines
- Fait suite à : le LOT-11 de « Doctrine exécutable », qui rassemblait les actes
  que les lots précédents avaient nommés sans les rendre

**Le lot re-constate avant de décider**, comme sa fiche l'exige — et rien n'avait
bougé : les six drapeaux toujours posés en production, les deux signatures
toujours à `false`, **zéro** exclusion curée, `DC-42`/`DC-43`/`DC-58` toutes
trois en *proposition*, **13** occurrences d'`**Orpheline**` au grep, et
`preconditionsT0Prisma.ts:66` appelant toujours `contradictionsPourPatient`
**sans** les claims cités.

**Décision 1 — `SAFETY_EI_METADATA` est reportée au 2026-08-30, avec son motif.**
La revue était planifiée à cette date. Le report n'est pas un silence : **rien ne
se perd**, parce que `WN_EI_INTERRUPTION` vaut déjà `1` — le drapeau ouvre la
CAPTURE, et les signalements d'effet indésirable sont collectés. Seule
l'INTERRUPTION reste fermée. Ce qui sera assumé en signant **n'est pas gradué** :
un signalement rattaché retirera **tous** les candidats du dossier, quel que soit
le protocole visé, le seul levier du dépôt étant binaire. `DC-42` reste donc en
proposition **avec sa date**, jamais sans verdict.

**Décision 2 — la curation des exclusions est ROUVERTE, et cela revient sur
`D-101`.** Le LOT-05 avait abandonné cette curation *sur mesure* : son registre
n'a aucun consommateur d'exécution. Le responsable rouvre, et l'écart mérite
d'être dit plutôt que lissé. Ce que la mesure établit : les **95 interventions**
portent `neCouvrePas` **null sur les 95**, donc `gatePopulationV1` ne mord sur
**aucun** dossier — `DC-43` ne peut pas franchir son gate faute de **sujet**, non
faute de mécanisme, celui-ci étant complet et relu.

`GATE_POPULATION_METADATA` **n'est donc pas signée** : la signer armerait un
garde sans sujet, ce que le gate de campagne « aucun banc sans sujet » interdit
nommément. Mais `DC-43` **cesse d'être reconduite « écrite, non armée »** : elle
obtient un **porteur nommé**, la curation routée en file d'attente. Le garde-fou
de `D-101` demeure entier (`DC-35`) — une intervention dont les exclusions ne
sont pas curées se propose **en le disant**, et la curation partielle est un état
déclaré, jamais un silence.

**Décision 3 — les dix orphelines reçoivent une campagne dédiée.** L'arbitrage
de portefeuille était **reporté, pas clos**, depuis le LOT-01 ([[D-095]]) et
rappelé au LOT-08. Trois options étaient nommées ; les deux écartées le sont avec
leur motif : « dettes nommées » **est le régime qui les a rendues orphelines**,
et le « rattachement au coup par coup » ne fait remonter aucune règle sans
porteur. Le LOT-08 les **écrit** comme telles ; il ne les arbitre plus.

**Décision 4 — le `3` des axes prioritaires est une borne de charge, déclarée
aujourd'hui.** La descente demandée par le responsable a été faite, et **elle n'a
rien rendu** :

- le prompt **ne demande pas trois axes** — `SYSTEM_PROMPT_SYNTHESE` montre un
  axe d'exemple et ne pose aucun plafond ;
- **aucun document source** ne dit « trois axes prioritaires », à la différence
  de « trois actions maximum », qui vient de
  `docs/RELATION_PRATICIEN_PATIENT_SOURCE.md` ;
- le commit d'origine (`651a9e98`, 2026-07-25, « Ajoute la rédaction praticien
  des synthèses ») l'introduit **sans une ligne de motif**.

Elle devient donc `MAX_AXES_PRIORITAIRES`, borne de **charge de la restitution
praticien** — sans claim ni intervalle, et qui n'a pas à en avoir. **Sa
provenance est l'arbitrage daté du 2026-08-24, pas un document antérieur** :
écrire l'inverse aurait fabriqué une source (`DC-19`). La valeur ne change pas.

**Et la descente a trouvé le même défaut que `D-105`** : la borne était écrite
**trois fois** — le validateur, et deux fois `SynthesePraticienEditor.tsx` (la
garde d'ajout, le bouton désactivé). La porter à quatre côté serveur laissait
l'écran en bloquer trois, sans message.

**Le banc du LOT-03 a signalé la bascule tout seul**, et c'est la preuve qu'il
mord : dès la constante posée, son cas « aucune exemption ne survit à ce qu'elle
exemptait » a rougi sur l'entrée devenue morte.

**Décision 5 — `DC-55` reste curatoriale, `DC-58` reste proposition.** « Impact
clinique significatif » n'est **pas** mécanisé, et c'est assumé : n'entre au
registre que ce que le praticien juge significatif. La règle est donc tenue par
un geste humain **déclaré**, et `DC-55` le dit au lieu de laisser croire à un
filtre automatique — mécaniser le qualificatif aurait supposé une hiérarchie que
la donnée ne soutient pas ([[D-103]] : aucun des quatre axes n'est comparable en
production). `DC-58` reste **proposition avec sa mesure**.

**Décision 6 — les neuf dettes routées une par une**, à la demande du
responsable. `CS-MAG-01` → Curation signée (épingler `WN-CL-0327-002` et
`WN-CL-0018-013` est de la curation claim par claim) ; l'escalade vers T0 et le
tour du vérificateur → campagne des orphelines ; la garde de lecture de
consultation et les deux portées de garde restantes → dettes assumées,
recomptées au LOT-08. **Trois sont corrigées ici**, et deux ont mordu :

1. **Le découpage des conflits.** Mesuré d'abord : la description de `CS-BIO-01`
   fait **569** caractères à elle seule. `scinderSousPlafond` coupe aux fins de
   phrase — à défaut entre deux mots, **jamais au milieu** — et fait porter
   `[regleId]` à chaque morceau, sans quoi `depuisSynthese.ts` cesserait de
   reconnaître la vigilance au milieu d'une phrase. Un cas vérifie que **recoller
   les morceaux rend le texte d'origine** : le texte d'un conflit est une donnée
   signée, le raccourcir serait modifier du clinique pour tenir dans un gabarit
   (`DC-19`). **`lignesDeVigilance` a déménagé dans un module feuille** — la
   laisser à côté de Prisma obligeait tout banc de longueur à provisionner une
   base, ou à recomposer la phrase et donc à en mesurer une autre que celle
   servie.
2. **Le banc de bump de version.** Il n'épingle pas `0,34` : un `toBe` se corrige
   dans le même diff que la valeur et ne garde rien. Les valeurs sont épinglées
   **par version**, les deux positions du drapeau couvertes. Vu rouge en portant
   le seuil à `0,40`.
3. **Le tour du vérificateur, éprouvé sur un dossier portant un signal.** Le
   premier essai a échoué sur « Une priorité ne peut être sélectionnée avant la
   levée des bloqueurs » : avec un signal, la carte est **bloquée** — `DC-12`
   mord, exactement comme prévu. Le banc garde donc le cas réel, une chaîne
   légitimement **dépourvue** de sélection. Fixture **séparée** : enrichir celle
   de référence aurait déplacé `CANDIDAT_RANG_1` et toutes les empreintes qui en
   dérivent.

**Un garde du dépôt a attrapé ce lot, et il avait raison.** Toute spec sensible à
`WN_ALI_01_SIIN57` doit tourner dans les **deux positions** du drapeau. Le banc
de bump l'est — il lit `VERSION_SCORE_EQUILIBRE`, qui vaut `v15` ou `v14` selon
la forme servie — et ne tournait que dans une, alors qu'il prétend couvrir les
deux. Inscrit à `test:court14`.

**Ce que cette décision NE fait pas.** Elle ne signe rien, ne modifie aucune
valeur calculée, ne porte aucune migration, et n'ouvre aucun dossier de campagne
— les deux ouvertures sont **routées** en file d'attente, leur cadrage restant un
geste séparé, parce qu'un cadrage écrit sans mesure préalable est exactement ce
que les trois derniers lots ont dû corriger après coup.

### D-106 — Le total de « Mon équilibre » n'a pas d'interprétation clinique, et il le dit

- Date : 2026-08-24
- Statut : accepté (arbitrage praticien, rendu en session le 2026-08-24)
- Domaine : clinique — nature d'un indicateur restitué, et deux pondérations
  jusqu'ici non arbitrées
- Porte sur : `DC-22`, et par les deux arbitrages adjacents, `DC-21` et le
  calibrage du plafonnement
- Fait suite à : le LOT-07 de « Doctrine exécutable », dont la fiche imposait de
  **mesurer, poser la question, et s'arrêter**

**La mesure, d'abord.** `DC-22` pose que la question précède le calcul :
*existe-t-il une interprétation clinique du total ?* La descente a établi trois
faits qui ont rendu l'arbitrage décidable.

1. **Aucun consommateur ne lit le total** — et la formulation demande de la
   précision, qu'une première rédaction s'était épargnée. `GLOBAL_BALANCE` n'est
   **pas** un simple code de vocabulaire : `clinicalSnapshot.ts:209` l'émet comme
   un `ClinicalObjectFinding` **portant la valeur mesurée**, qui entre donc dans
   le snapshot figé et dans son empreinte. Ce qui est vrai, et qui suffit à
   trancher : **rien ne le consomme**. Tous les producteurs de constats émettent
   `clinicalObjectCodes: []` (`chaineC1.ts:506`, `clinicalReview.ts`,
   `safetyFindings.ts`), et les consommateurs ne lisent que
   `balanceAssessment.needs` (`decisionCard.ts:40`, `clinicalReview.ts:55`).
   Seule exception, et elle ne lit pas la valeur : `clinicalSnapshot.ts:273,277`
   teste la **nullité** de `scoreGlobal` pour peupler `availableDomains` /
   `missingDomains`. Le total ne déclenche rien.
2. **Le patient ne voit pas le nombre** (`showValue={false}`) ; le praticien, si.
3. **Mais sa VARIATION est un signal présenté aux deux.** C'est le fait qui
   obligeait à trancher : `construireHistoriqueEquilibre` empile `scoreGlobal`
   en lectures datées, `calculerDeltaMomentum` en tire hausse/stable/baisse. Si
   le total n'a pas de sens clinique, la variation de ce total n'en a pas non
   plus — et c'est **elle**, pas lui, que le patient lit.

**Décision 1 — le total n'a pas d'interprétation clinique, et il n'est pas
retiré.** Il reste un **repère de suivi identifié comme tel** (`DC-20` : un
chiffre purement technique doit être identifié comme tel). L'issue « le retirer »
était ouverte et n'a pas été retenue ; ce que l'arbitrage interdit n'est pas de
l'afficher, c'est de le laisser passer pour ce qu'il n'est pas. La mention
« Repère de suivi, pas un score clinique » accompagne donc le chiffre partout où
il s'affiche — c'est-à-dire au seul endroit du dépôt où il s'affiche, la fiche
praticien. **Le patient ne la reçoit pas**, et c'est délibéré : lui servir « pas
un score clinique » l'obligerait à démentir un score qu'il n'a jamais lu.

**Décision 2 — un libellé patient affirmait une amélioration ; il ne l'affirme
plus.** Le libellé de hausse disait « **En progression** depuis votre dernier
bilan ». « Progression » est exactement l'interprétation clinique que la décision
1 refuse au total. Il devient « Votre repère de suivi est en hausse depuis votre
dernier bilan » — le vocabulaire neutre que les surfaces praticien employaient
déjà.

**L'asymétrie des trois libellés est conservée, et ce n'est pas un oubli.** La
doctrine antérieure « construction, jamais dégradation » (SP-CONV LOT-05, `D7`,
gardée par `gamification-patient.guard.test.ts`) veut qu'une évolution
défavorable ne soit **jamais annoncée comme une chute** : le libellé de baisse
garde donc sa formulation d'origine, qui ne nomme pas la direction et tend la
main au praticien. Symétriser les trois « pour la cohérence » aurait cassé une
règle en croyant en servir une autre.

**Décision 3 — `SEUIL_EFFONDREMENT = 0,34` et `PLAFOND_FONDATION_CRITIQUE = 50`
sont validés tels quels.** Les deux portaient depuis l'origine la mention
« calibrage v1, **à valider par le praticien** », et cette validation n'avait
jamais eu lieu — alors que ce sont les deux valeurs qui façonnent le plus le
total, puisqu'elles commandent le plafonnement anti-moyenne. Validés **sans
changer d'un chiffre**, donc **aucun bump de `VERSION_SCORE_EQUILIBRE`** : aucune
valeur calculée ne bouge, aucun épisode figé ne change de sens, aucune
comparaison de jalons ne se bloque. Un bump ici aurait coûté l'historique de tous
les patients pour n'enregistrer qu'une signature.

**Décision 4 — l'égalité entre besoins d'une même strate est délibérée, et sa
motivation est écrite.** La mesure a trouvé une pondération **tacite** : les
poids sont motivés sur place à deux étages — entre sources d'un besoin (le
rapport 2:1 du repos), entre strates (60/20/20) — mais la moyenne entre besoins
d'une strate est **simple**, et aucune ligne ne le disait. `DC-21` pose qu'« un
poids égal entre axes n'est pas neutre : c'est déjà une décision de modèle ».

La motivation rendue : **la hiérarchie clinique entre besoins n'est pas portée
par des poids, elle est portée par le mécanisme des fondations critiques** —
cinq besoins dont l'effondrement plafonne le total quoi qu'il arrive ailleurs.
Hiérarchiser une seconde fois par des poids superposerait deux mécanismes de
priorité sur le même objet, et un besoin à la fois sous-pondéré et fondation
critique deviendrait illisible : son poids l'efface dans la moyenne pendant que
son plafond commande le total. L'égalité est la condition pour que le
plafonnement reste le **seul** énoncé de priorité.

**La garde, et les deux fail-open qu'elle a fallu corriger avant de la retenir.**
Une issue de cette forme ne vit que dans des libellés d'écran, que la première
refonte efface sans bruit. `natureIndiceGlobal.guard.test.ts` la rend opposable.
Deux versions ont été **vues vertes sous injection** avant d'être refusées :

- la première cherchait la mention **n'importe où dans le fichier** — l'`import`
  suffisait, un composant pouvait donc l'importer sans jamais l'afficher ;
- la seconde raisonnait **par fichier** — or `FichePatientPanel.tsx` porte
  ailleurs une jauge servie `showValue={false}`, et cette seule occurrence
  dispensait toutes les autres, y compris celle du total.

Le banc lit désormais **l'élément JSX qui reçoit `indiceGlobal`**, et lui seul.

**Un piège que ce lot a failli poser — et le garde censé l'empêcher était déjà
cassé.** En sortant les libellés patient de `components/patient` pour les loger
avec leur doctrine, le lot les sortait du balayage de
`gamification-patient.guard.test.ts`, qui ne lit que des chemins **déclarés**.
L'entrée a donc été ajoutée — puis la revue a montré qu'elle **ne mordait pas** :
`fichiersSources()` appelle `readdirSync` sur chaque entrée, et `readdirSync`
lève `ENOTDIR` sur un **fichier** ; le `catch` rendait `[]`. **Toute entrée de
chemin de fichier y était un no-op silencieux.**

Deux conséquences, dont une hors de ce lot. La première : la protection que ce
lot revendiquait n'existait pas. La seconde, **préexistante** :
`lib/agenda-sommeil/rappelPortail.ts` était dégardé depuis son ajout — le garde
n'a jamais lu aucun de ses deux chemins de fichier. Les deux sont réparés ici
(`statSync` sur repli), et la cause du silence est refermée par une
**non-vacuité PAR ENTRÉE** : le plancher global était insensible à une entrée
morte, puisqu'un dossier en apporte des dizaines. Vérifié en injectant
« bravo » dans le module déplacé : le garde rougit désormais.

**Ce que cette décision NE fait pas.** Elle ne retire aucun total, ne modifie
aucune valeur calculée, ne bump aucune version de score, et n'élargit pas au
scoring des instruments : `DC-22` vise le **total agrégé**, pas les scores qui
l'alimentent. Elle ne mécanise pas non plus une interprétation du total — il n'y
en a pas, c'est le sens de l'arbitrage.

**Trois dettes nommées, à ne pas redécouvrir.**

1. **`calculerDeltaMomentum` déclenche « hausse » sur `delta > 0`**, donc sur
   `+0,01` : le patient lit « en hausse » pour du bruit de mesure. Poser un seuil
   de significativité serait un **changement clinique** avec sa propre décision
   et son bump de version — hors de ce lot, mais le report est désormais écrit.
2. **Le banc suit la valeur par son NOM.** Une variable intermédiaire, un spread
   d'attributs ou un renommage du champ côté API la lui font perdre. La limite
   est déclarée dans le banc ; la fermer supposerait une analyse de flot.
3. **Rien ne garde le bump de `VERSION_SCORE_EQUILIBRE`.** `constants.ts` exige
   désormais en toutes lettres qu'une modification de `SEUIL_EFFONDREMENT` ou de
   `PLAFOND_FONDATION_CRITIQUE` s'accompagne d'un bump — la règle est déclarée,
   vérifiée par aucun banc.

### D-105 — `DC-58` n'a pas de sujet, sa méthode ne tient pas, et le banc se pose sur l'autre versant

- Date : 2026-08-24
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-24)
- Domaine : outillage de doctrine — plus deux littéraux cliniques nommés, sans
  qu'aucune valeur ne change
- Porte sur : `DC-58`, et par ce que la mesure a trouvé, `DC-19`/`DC-20`
- Fait suite à : le LOT-03 de « Doctrine exécutable », dont la fiche exigeait
  **la mesure avant le banc** — c'est elle qui a retourné le lot

**La mesure d'abord, et elle dit non.** La fiche demandait un banc détectant
« une valeur cliniquement signifiante qui n'existerait que dans un test ».
Descente du 2026-08-24 sur **476 fichiers de test et 595 fichiers source** :
128 candidats au lexique clinique étroit, 25 sans provenance, **zéro orpheline
réelle** après qualification une par une. Les 25 se répartissent en trois
classes, toutes légitimes : 19 lignes de fixture d'une **colonne Prisma**
(`doseCibleBasse/Haute`, `seuilDoseBasse/Haute`, `doseParDjr` — les vraies
valeurs vivent en base, curées) ; 4 codes **HTTP 400** attrapés dans des titres
de test ; 2 sorties calculées.

**Et surtout, la méthode prescrite est vacue.** Contrôler qu'une valeur de test
« existe ailleurs » ne prouve rien : avec 633 valeurs distinctes au
dénominateur, presque tout entier court trouve un répondant **par hasard**.
`poids = 1` était « couvert » parce que le chiffre 1 figure dans
`indicationsBiologieV1.ts` ; `doseCibleBasse = 4000` par
`LONGUEUR_MAX_CE_QUI_COMPTE`, qui est une longueur de texte. Une seconde
formulation — un test qui réécrit en littéral la valeur d'une constante déclarée
— échoue pour la même raison : un `3` n'importe où dans un test du même dossier
suffit à la satisfaire. **Un tel banc serait vert en permanence et vert pour la
mauvaise raison**, ce que les interdits du lot refusent explicitement.

**Décision 1 — `DC-58` reste une proposition, et le dit avec sa mesure.** Elle
n'est pas basculée : non par manque d'outil, mais parce que **le dépôt ne lui
oppose aucun contre-exemple** et que sa mécanisation par égalité de valeurs est
démontrée non fondée. Le statut porte désormais la date, le volume et la raison
— une proposition mesurée sans sujet n'est pas une proposition non instruite.

**Décision 2 — le banc se pose sur le versant décidable.** Ce que `DC-58`
décrit — « un cut-off inventé puis recopié dans le moteur » — devient décidable
dès qu'on cesse de comparer des VALEURS pour regarder des **POSITIONS** : un
littéral à droite d'un opérateur de comparaison **est** un seuil, sans qu'on ait
à deviner si le nombre est clinique. `seuilsLitterauxMotives.guard.test.ts`
balaie tout `src/lib` en découverte automatique, neutralise chaînes,
commentaires et expressions régulières, et exige que **toute** comparaison à
littéral non trivial hors catalogue soit soit nommée dans une constante motivée,
soit inscrite dans une liste d'exemptions **avec son motif écrit**. Une
comparaison inconnue **rougit plutôt que d'être devinée** — le patron de
`D-046`, où une table inconnue n'hérite d'aucun jeu de propriétés par défaut.

**Ce que ce banc garde, et ce qu'il ne garde pas.** Il garde `DC-19`/`DC-20`
plus que `DC-58`, et son en-tête le dit : un banc dont on croit qu'il garde
autre chose que ce qu'il garde est pire qu'absent. **Le catalogue est exempté
par forme** — un cut-off écrit dans le catalogue est chez lui, c'est lui la
source déclarée, et `ranges.ts` interdit déjà de ré-encoder ses bornes ailleurs.
Les **33** seuils de `questions.ts` (PSQI, Horne-Östberg, Karasek…) ne sont donc
pas gardés ici ; ils le restent par la certification de scoring et par
`DC-17`/`DC-18`. Limite nommée, pas oubli.

**Décision 3 — les deux littéraux trouvés sont nommés. Aucune valeur ne
change.** Sur 61 comparaisons littérales mesurées dans `src/lib`, deux étaient
fautives, et de la même façon : **un repère unique écrit plusieurs fois, dont
une seule écriture nommée.**

1. `discordanceRythme.ts` confrontait le déclaré à un littéral `10` pendant que
   l'observé lisait `SEUIL_JEUNE_MIN`. Or c'est **un seul repère** — SIIN54 se
   répond en heures, l'agenda s'observe en minutes, et le barème n'en déclare
   qu'un (`{id:'SIIN54',points:2,seuil:{min:10}}`). Porter `SEUIL_JEUNE_MIN` à
   11 h laissait le déclaré comparer à 10 : la discordance aurait alors
   confronté le déclaré à un repère et l'observé à un autre, **en silence**, et
   le drapeau de sur-déclaration se serait levé ou tu sans raison lisible.
   `SEUIL_JEUNE_DECLARE_H = SEUIL_JEUNE_MIN / 60` — dérivé, jamais recopié, même
   raison que `MAX_RYTHME_CHRONO`. Vaut 10 avant comme après.
2. La borne « trois actions maximum » était écrite **six fois dans trois
   fichiers** — le refus du moteur, le second refus de l'aperçu patient, deux
   gardes de saisie, un bouton désactivé et un libellé « /3 ». Une borne portée
   à quatre côté moteur laissait l'écran en bloquer trois, et le praticien
   devant un bouton grisé sans message. `MAX_ACTIONS_PROTOCOLE_21J = 3`, posée
   dans `clinical-engine/types.ts` — **seul foyer possible** : ce fichier
   n'importe que des types, donc un composant client peut l'importer en valeur
   sans embarquer `node:crypto`, défaut que `bundleClient.guard.test.ts` ferme
   pour `lib/clinical`.

**Provenance des deux, établie et non inventée.** Le repère de jeûne est
déclaré au catalogue. « Trois actions maximum » vient de
`docs/RELATION_PRATICIEN_PATIENT_SOURCE.md` : c'est une borne de **charge** de
la relation praticien-patient, pas un seuil mesuré sur une population — elle n'a
ni claim ni intervalle et n'a pas à en avoir. Elle est nommée pour être
identifiable comme telle (`DC-19`), pas pour prétendre à une provenance qu'elle
n'a pas.

**Ce que cette décision NE fait pas.** Elle ne modifie aucun seuil, aucune dose,
aucune borne : les deux valeurs sont identiques avant et après, et aucun test
existant n'a été touché pour faire passer quoi que ce soit. Elle ne corrige pas
les 33 seuils du catalogue, qui sont à leur place. Elle ne retrace pas la
provenance de `source.axes_prioritaires.length > 3` dans
`synthese-praticien.ts` — troisième borne « au maximum 3 » du dépôt, exemptée
**en étant nommée dette** dans la liste du banc, parce que son arbitrage
appartient au praticien.

**Le banc a été vu rouge quatre fois** avant d'être retenu : sur un fichier
neuf portant un seuil orphelin (la découverte automatique), sur une exemption
devenue morte, et sur chacune des deux corrections défaite.

### D-104 — Le registre des conflits de sources est signé : `CS-BIO-01` mord

- Date : 2026-08-24
- Statut : accepté
- Domaine : clinique — signature praticien du registre des conflits déclarés
- Porte sur : [[D-103]], dont elle pose le geste que le lot avait délibérément
  laissé ouvert ; fait basculer `DC-54` et `DC-55` de proposition à **acté**

**Le geste.** `CONFLITS_SOURCES_METADATA` passe aux cinq termes :
`validationExterne: true`, `dateValidation: '2026-08-24T00:00:00.000Z'` (ISO
canonique), les deux claims épinglés, et `shaPerimetre` figé sur
`ea18140366c114d6a51d19f82ecb082c98dab10b07b47effd527e1430fd581e2` — la valeur
que `CONFLITS_SOURCES_SHA256` portait à la relecture, recopiée en littéral.

**Ce que le praticien assume en signant.** Que `WN-CL-0312-018` (« un bilan
biologique nutritionnel, fonctionnel et systémique une fois par an ») et
`WN-CL-0387-013` (« le bilan biologique complet n'est pas à réaliser
systématiquement chez toute personne quel que soit l'âge ») **s'opposent sur le
même objet**, et qu'aucun des deux ne doit être retenu automatiquement contre
l'autre. La machine ne tranche pas : elle remonte, en nommant les quatre axes de
`DC-54` qu'elle ne compare pas et pourquoi.

**Pourquoi la signature n'a pas été posée le jour de la livraison.** Elle EST le
geste de mise en service. Ce registre n'a pas de drapeau propre, et les deux
termes qui l'accompagnent — `WN_ENABLE_CONTRADICTIONS_NNPP2=1`,
`WN_CB_PROPOSITION=true` — étaient déjà vrais en production. Signer et déployer
suffit donc à faire apparaître le constat. L'arbitrage du 2026-08-24 a été de
livrer inerte, faire relire, puis signer — et la revue a effectivement trouvé
quatre défauts, dont un qui aurait bloqué toute release de base.

**Effet mesurable en production.** `CS-BIO-01` apparaît dans le panneau de
vigilances du cockpit pour tout dossier dont la proposition de bilan cite
`WN-CL-0312-018` — les quatre règles de répétition annuelle le citent. Le
constat **escalade** : il ne retire aucun panel, ne bloque aucune décision, et
n'ajoute aucun point. Second effet, moins visible : la route cockpit dérive
désormais la proposition de bilan à chaque POST pour collecter les claims cités
(cinq requêtes de plus, isolées par un `catch` — une panne de cette dérivation
ne peut pas emporter la confirmation d'épisode T0).

**Ce que la signature n'allume pas.** Un constat escaladé reste « ouvert » au
sens de `contradictionEstOuverte` et interdirait l'extinction d'une règle
d'orientation partout où il serait passé au prédicat. Il ne l'est pas : le
branchement s'arrête au cockpit praticien, et `preconditionsT0Prisma` reçoit une
liste de claims cités vide. Cette limite fait partie de ce qui est signé ;
l'étendre est un effet clinique distinct.

**Un banc qui change de nature avec ce geste.** Les cas qui éprouvaient le
verrou FERMÉ s'appuyaient sur l'état non signé du dépôt ; ils le ferment
désormais eux-mêmes par simulation. Un banc de verrou qui dépend de la position
courante du verrou change de sens à chaque signature et cesse de garder quoi que
ce soit. Un cas neuf asserte l'état réel — registre signé, verrou ouvert — et
rougira le jour où un conflit amendé sans re-signature le refermera seul.

### D-103 — La politique de résolution ne compare rien, et elle le dit

- Date : 2026-08-24
- Statut : accepté
- Domaine : clinique — conflits entre sources du corpus (`DC-54`, `DC-55`),
  sort de la forme `CONVERGENCE` (`DC-29`)
- Porte sur : `D-041` et `D-044` (l'objet à trois formes), dont elle peuple la
  troisième forme ; `D-095` (la population sort du claim), dont elle tire la
  conséquence sur un axe de comparaison

**Le fait mesuré, qui a retourné le lot.** La fiche du LOT-06 annonçait que
« trois des quatre axes de `DC-54` sont mécanisables ». Six lectures de la
production le 2026-08-23 (conteneurs one-off, lecture seule, agrégats sans
identité) établissent qu'**aucun ne l'est** :

| Axe de `DC-54` | Mesure sur 8 224 claims `VALIDE` |
| --- | --- |
| population | hors du claim, définitivement (`D-095`) |
| niveau de preuve | **45 claims (0,55 %)**, **32 valeurs libres** — « B », « AE », « élevé », « Niveau 1 / Niveau 2 », « evidence based », « non consensuel » |
| classe d'autorité | **154 claims (1,87 %)**, **73 valeurs libres** — institutions et **noms d'auteurs** mêlés (« EFSA », « OMS », « Pierre Deniker », « Thurin J.M. 2005 ») |
| date | `valide_at` existe partout, mais c'est la date de **validation praticien** — 11 jours distincts, du 2026-07-22 au 2026-08-03, dans l'ordre de l'ingestion |

**Un seul claim sur 8 224 porte à la fois un niveau de preuve et une classe
d'autorité.** Requête reproductible :

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE btrim(coalesce(niveau_preuve,'')) <> '')   AS np,
       count(DISTINCT btrim(niveau_preuve))                              AS np_distincts,
       count(*) FILTER (WHERE btrim(coalesce(classe_autorite,'')) <> '') AS ca,
       count(DISTINCT btrim(classe_autorite))                            AS ca_distincts
  FROM public.rag_corpus_claims;
```

**Ce que la décision tranche.** La politique de résolution est écrite,
déterministe et versionnée (`politique-resolution-conflit-v1`) — et sa **sortie
est une** : l'escalade praticien. Elle **déclare** ses quatre axes non comparés,
chacun avec le motif mesuré, et sert ce motif au praticien. La position la plus
prudente de `DC-54`, une fois la mesure faite, **est de ne pas trancher** ; et
`DC-55` pose que l'arbitrage humain est une **issue** de la politique, pas son
échec. Un banc épingle qu'aucun axe n'est comparable : le jour où l'un le
devient, il rougit et force à écrire la branche de comparaison plutôt qu'à la
laisser manquer en silence.

**Écarté — comparer quand les champs sont là.** Elle aurait mordu sur 1 claim
sur 8 224, et comparer « EFSA » à « Pierre Deniker » ou « élevé » à « B »
suppose une hiérarchie qu'aucune ligne signée ne donne : `DC-19`. **Écarté
aussi — poser d'abord un vocabulaire fermé** par migration et curer les 8 224
claims : c'est une campagne à soi seule, et le LOT-06 n'aurait rien livré.

**Le piège de l'axe « date », qu'il faut avoir nommé.** C'est le seul des
quatre dont la colonne est peuplée partout, et le seul qui aurait donné une
réponse. Sur le conflit déclaré ci-dessous, elle aurait fait gagner
`WN-CL-0387-013` (validé le 2026-08-03) contre `WN-CL-0312-018` (le
2026-07-29) — c'est-à-dire trancher une question de preuve par l'ordre dans
lequel deux documents ont été ingérés.

**Un conflit se déclare, il ne se détecte pas.** Rien au schéma ne dit que deux
claims parlent du même objet ; la seule détection possible serait une
similarité sémantique, donc une résolution générative, que `DC-01` et `DC-02`
interdisent sur ce chemin. Le registre `conflitsSourcesV1.ts` est curé à la
main, relu en PR, signé — patron exact de `contradictionsV1.ts`.

**Le conflit déclaré, `CS-BIO-01`, était déjà vécu dans le dépôt.** Objet : le
bilan biologique complet se réalise-t-il systématiquement une fois par an, ou
sur orientation clinique ? `indicationsBiologieV1.ts` fonde la répétition
annuelle (`delaiJours: 365`) sur `WN-CL-0312-018`, et son commentaire de
`§B.8` invoque `WN-CL-0387-013` pour justifier qu'un panel d'approfondissement
n'ait **pas** de répétition — « le bilan complet ne se fait pas
systématiquement ». **Deux claims du même corpus certifié employés à sens
opposés dans un même fichier signé.** Le conflit n'a pas été fabriqué pour ce
lot : il était là, non nommé.

**Le déclenchement.** Un constat naît quand **au moins un** des deux claims est
cité par une sortie de ce dossier — pas les deux. Le cas dangereux est celui où
le dossier ne s'appuie que sur l'une des deux positions : c'est là que le
praticien a besoin de savoir qu'elle est contredite. La correspondance porte
sur la **paire** `(claimId, versionClaim)`, comme le contrat de fraîcheur.

**Deux conflits examinés puis écartés, avec leur motif** (patron `D-042`) :

- **`CS-MAG-01`** — `WN-CL-0032-018` (« les médecins **devraient prescrire** du
  magnésium pour la dépression résistante au traitement sans plus attendre »,
  prescriptif) contre `WN-CL-0362-014` (« dans la dépression, l'inositol et le
  magnésium sont **inefficaces** »). Conflit réel et le plus frontal du corpus,
  **écarté parce qu'aucun des deux claims n'est épinglé par une table signée** :
  aucune sortie de dossier ne les cite, le constat n'atteindrait jamais
  personne. Le déclarer aurait ajouté une entrée inerte.
- **`CS-MAG-02`** — `WN-CL-0242-007` contre `WN-CL-0333-020` : **faux conflit**,
  l'un écarte le magnésium **plasmatique** en première intention, l'autre
  conseille le magnésium **érythrocytaire**. Compatibles, et la seconde position
  est même la conséquence de la première.

**`DC-29` — la descente de provenance a eu lieu, et elle n'a rien rendu.** Sur
les 8 224 claims actifs : « sources indépendantes » → **0**, « triangulation »
→ 0, « convergen\* / faisceau » → 6, « méthodolog\* » → 3, « niveau de preuve »
→ 7, « contradict\* » → 1, « discordan\* » → 2. Les dix-neuf candidats relus un
par un sont tous des claims de **contenu**, aucun n'est un claim de **méthode**.
Verdict écrit : **aucune source du corpus certifié ne fonde une graduation par
nombre de sources indépendantes**. La forme `CONVERGENCE` **reste vide**, état
légitime, et un banc refuse désormais toute règle qui la porterait — sans lui,
une telle règle serait ignorée en silence par `contradictionsEngine.ts`, verte
et fausse.

**Ce que le lot ne fait pas, et qui est nommé plutôt que produit.** Un constat
escaladé **reste ouvert** au sens de `contradictionEstOuverte`, donc il
interdirait l'extinction d'une règle d'orientation (`D-053` §5, `D-055`)
partout où les constats de ce moteur seraient passés au prédicat. Ils ne le
sont pas : le branchement s'arrête à la restitution praticien du cockpit, et
`preconditionsT0Prisma` reçoit une liste de claims cités vide. Étendre
l'escalade à l'extinction et aux préconditions T0 est un **effet clinique
distinct**, qui demande son propre arbitrage.

**Ce que la revue `wn-reviewer` a refermé** (NO-GO conditionnel, 2026-08-24) —
quatre défauts qu'aucun banc du lot ne voyait :

- **Le préflight `release-db` entrait sur deux paires jamais relues.** Le
  déclencheur du workflow couvre `web/src/lib/clinical/**` ; le contrat de
  fraîcheur est fail-closed sur la production, et `WN-CL-0387-013` n'était
  jusqu'ici cité que dans un **commentaire** — donc gardé par rien. Non
  conforme, il aurait bloqué **toute release de base** au nom d'un registre qui
  ne produit rien. Relu le 2026-08-24 (conteneur `one-off-6148`) : les deux sont
  `VALIDE`, actives, non remplacées, en v1.0 ; le constat est inscrit dans
  l'en-tête du contrat, comme pour `arret` et `priorites`.
- **Deux consommateurs gardaient un conflit avec la signature de la mauvaise
  table.** Seul `contradictionsPourAffichage` avait reçu le filtre par forme ;
  `vigilancesDiscordancePourSynthese` et `discordancesPourGardeRestitution`
  restaient sur `contradictionsActives()`. Or `lignesDeVigilance` sait DÉJÀ
  nommer un conflit : elle l'aurait servi au praticien sous la signature de la
  table de contradictions. Un prédicat unique, `formeAutorisee`, gouverne
  désormais les trois — et un banc du dépôt encodait l'invariant inverse, il est
  corrigé.
- **Une panne de la dérivation biologie éteignait la confirmation d'épisode
  T0.** Cinq requêtes Prisma pour une vigilance informative, sans `catch` : un
  catalogue mal formé rendait 500 sur le chemin principal. Isolée.
- **La lecture Prisma partait au nom des conflits.** La première écriture
  ouvrait la porte du dossier dès que l'un des deux verrous l'était, pour un
  moteur qui ne lit ni passation ni anamnèse. Les conflits sont calculés hors de
  cette porte : l'invariant « le verrou passe avant toute lecture » redevient
  vrai dans toutes les configurations.

**Et un point de doctrine relevé par la même revue** : `DC-54` énumère « niveau
de preuve, **contexte**, date, population ». La première rédaction avait
silencieusement remplacé `contexte` par `classe_autorite` — qui n'est pas un axe
de la règle — pendant que le motif servi s'ouvrait sur « aucun axe de DC-54 ».
C'était le grief même que ce lot instruit. `contexte` a désormais son entrée et
son motif (aucune colonne du claim ne porte le contexte d'une affirmation ; le
seul champ proche dit COMMENT la connaissance a été recueillie, jamais dans
quelles circonstances elle vaut), et `classe_autorite` est comptée à part comme
axe supplémentaire du schéma.

**Et une mesure à ne pas redécouvrir** : la description composée de `CS-BIO-01`
fait 569 caractères ; les deux lignes que `lignesDeVigilance` en tirerait
feraient **768 et 607**, pour un plafond de **500** (`LONGUEUR_MAX_POINT`, à
l'enregistrement d'un brouillon praticien). Sans effet ici — le cockpit ne
plafonne rien et la synthèse ne reçoit pas ces constats — mais c'est le
précédent exact de C-STR, scindée en 411 + 326 pour cette raison. Alimenter la
synthèse en conflits demandera de **scinder par position**.

### D-102 — La release déclenche le déploiement qu'elle attend

- Date : 2026-08-23
- Statut : accepté
- Domaine : chemin d'écriture de la base de production — workflow `release-db`
- Porte sur : `D-087` (régime de la release approuvée), qu'elle rend
  applicable ; ne modifie ni son gate humain ni sa portée

**Le fait.** Scalingo est en auto-déploiement **après CI**, et il n'attend pas
« le workflow CI » : il attend que **tous les checks du commit** aient conclu.
Or `release-db` est lui-même un check de ce commit. Sur tout commit portant une
migration, la garde « le commit approuvé est le dernier déployé » attendait
donc un déploiement que Scalingo n'aurait déclenché qu'une fois cette garde
terminée. Les deux s'attendaient, et la borne des 20 minutes tranchait.

**Ce n'est pas une inférence.** Le 2026-08-23, les trois commits portant un run
`release-db` (#773 `43705ea1`, #778 `59c16e62`, #780 `c2210355`) n'ont **jamais
été déployés d'eux-mêmes** ; le seul commit déployé ce jour-là sans migration
(`4dc72347`) l'a été **deux secondes** après sa CI. Sur `c2210355`, aucun autre
commit ne concurrençait le créneau et la CI était verte depuis 19:41:45 : aucun
build n'a démarré. La release rejouée a conclu au vert à **20:08:58**, et
l'auto-déploiement Scalingo a démarré à **20:09:02** — quatre secondes après le
dernier check, exactement la latence observée ailleurs. La cause est constatée,
pas supposée.

**La garde existante couvrait un cas voisin, pas celui-là.** Elle traite la
**coalescence** — un déploiement plus récent qui saute le commit approuvé — et
elle la traite bien. Son message de refus conseillait cependant de relancer en
`workflow_dispatch` sur la tête de `main` : remède sans effet dans
l'interblocage, puisque la tête *était* le commit non déployé. Un diagnostic
qui oriente vers un faux remède est un second défaut, corrigé avec le premier.

**Décision — inverser la dépendance.** Le job `release` **déclenche** le
déploiement du commit approuvé (`integration-link-manual-deploy`) avant
d'entrer dans sa boucle d'attente, inchangée par ailleurs. La borne des 20
minutes cesse d'être une course : elle attend un build qu'on vient de lancer,
au lieu d'espérer un build que personne ne lancera. **La coalescence disparaît
du même geste** — le commit approuvé obtient *son* build et ne dépend plus d'un
créneau qu'un merge voisin peut lui prendre.

Trois garde-fous, tous fail-closed :

1. **Un déploiement de ce commit, quel que soit son statut, suffit à ne rien
   déclencher** — un build en cours n'est pas doublé.
2. **La tête de `origin/main` doit ÊTRE le commit approuvé.** La commande
   déploie une *branche*, pas un SHA : si la tête a bougé, elle déploierait du
   code que personne n'a approuvé. Refus immédiat, plus strict qu'avant.
3. **Le déclenchement reste DANS le job protégé.** Le sortir en amont ferait
   tourner le build pendant la délibération humaine — cinq minutes gagnées —
   mais rendrait le jeton Scalingo atteignable **sans approbation**, ce que
   `D-087` construit précisément pour l'empêcher. Un invariant CI interdit à
   tout job hors gate de déclencher un déploiement.

**Aucun privilège nouveau.** Le job exécute déjà des one-offs arbitraires dans
l'image de production, ce qui est strictement plus puissant que déployer.

**Conséquence assumée.** Une fois `release-db` au vert, Scalingo déploiera une
**seconde fois** le même commit — build redondant, conteneurs redémarrés,
`postdeploy` qui se tait. L'éviter exigerait de sortir `release-db` des checks
du commit (`workflow_dispatch` seul), option écartée : elle coûte une action
humaine de plus — dispatcher *puis* approuver — sans ajouter la moindre
garantie, l'approbation étant déjà le contrôle. Un build de trop vaut mieux
qu'une action humaine de trop.

**Options écartées.** Désactiver « attendre le CI » chez Scalingo : elle
déploierait du code à CI rouge — on ne supprime pas un interblocage en retirant
la garde qui n'est pas en cause.

### D-101 — La gate de population dit ce qu'elle ignore, l'effet indésirable reçoit son association, et une seule consultation fait foi

- Date : 2026-08-23
- Statut : accepté (quatre arbitrages du praticien, rendus en session le
  2026-08-23)
- Domaine : doctrine clinique exécutable — gate de population, objet de
  sécurité, anamnèse patient, lecture de consultation
- Fonde : le LOT-05 de la campagne `2026-08-18-doctrine-executable`
- Porte sur : `DC-43`, `DC-42`, `DC-35`, `DC-24`, et la lecture de consultation
  partagée

**Ce que la mesure d'ouverture a trouvé, et qui a changé le lot.** La fiche
prévoyait de curer les 95 `neCouvrePas` du registre d'interventions puis de
poser la gate. La descente du 2026-08-23 a montré que **la gate n'avait pas de
sujet** : le seul objet réellement classé à l'exécution est une **règle de
priorité** (`chaineC1.ts`, deux règles publiées — des *axes de travail*, pas
des interventions), et `neCouvrePas` vit sur 95 **documents sources** d'un
registre d'audit dont les seuls consommateurs sont un script de vérification —
qui ne lit même pas ce champ — et un commentaire. **Aucun chemin d'exécution ne
relie un candidat classé à une entrée de ce registre.** Curer aurait produit
une donnée que rien ne lit.

Sur l'état du patient, la mesure est du même ordre : des **neuf critères** que
`DC-43` nomme, **aucun** n'était lisible comme état courant. « Grossesse /
post-partum » n'existe que comme **facteur déclenchant** — un antécédent ;
les pathologies rénale et hépatique sont absentes des douze domaines
d'antécédents ; `chirurgies` est un textarea libre, que le fichier lui-même
déclare inutilisable en déclencheur ; végétalisme et maladie cœliaque
n'existent nulle part.

**Décision 1 — la gate livre son MÉCANISME et son AVEU, pas sa curation.** La
gate est posée avant le classement, sur une table de curation **vide et
déclarée vide** (`gatePopulationV1.ts`, non signée). Aucun candidat n'est
écarté aujourd'hui, sur aucun dossier ; chacun repart avec le motif
« **exclusions non curées** », servi au praticien. C'est `DC-35`, et c'est le
seul rempart entre « ouvert par défaut » et « aveugle par défaut ». La table
n'entre **pas** dans le périmètre signé de `priorityRulesV1` : elle ne porte
aucun contenu clinique, elle déclare une ignorance — et l'y faire entrer aurait
changé `PRIORITY_RULES_SHA256`, donc fermé le verrou, donc retiré **tous** les
candidats de la production pour y inscrire un tableau vide.

**Décision 2 — l'état de population entre par une section neuve de l'anamnèse
patient.** Section « État actuel », distincte des facteurs déclenchants et des
antécédents, **sept critères**, chacun en `radio` à trois réponses — « Je ne
sais pas » **écrit**. Une case à cocher ne distingue pas « je ne suis pas
concerné » de « je n'ai pas répondu », et sur une gate de sécurité cette
confusion est le fail-open que `DC-24` interdit. **Trois critères de `DC-43`
sont volontairement absents, et il faut le dire** : l'**âge** (aucune borne n'a
de provenance — poser un pivot serait inventer un seuil, `DC-19`), la
**polymédication** (le compte existe, le nombre qui qualifie n'a aucune
source), l'**allergie/intolérance** (déjà déclarée deux champs plus haut ; la
redemander créerait deux vérités pour un même fait).

**Décision 3 — l'effet indésirable reçoit son association, par migration.**
`DC-42` exige un symptôme « temporellement associé à une intervention » ; la
capture existait depuis le 2026-07-16 et elle est complète, mais l'association
n'y était pas — `produit_libelle` est du texte libre, `debut_prise` et
`debut_symptomes` sont des `TEXT` que rien ne contraint. La règle n'était pas
« non appliquée », elle était **inapplicable**. Trois colonnes nullables
s'ajoutent (`protocol_draft_id`, `debut_prise_le`, `debut_symptomes_le`), les
deux champs libres **restent**, et le patient **déclare** au portail que le
produit fait partie de son programme — c'est le serveur qui résout lequel
(`resolveProtocoleDiffuse`, V1 mono-protocole). Aucune ressemblance de libellé
n'est calculée : l'association se déclare, elle ne s'infère pas.

**Décision 4 — une seule sélection de consultation fait foi.** `statut:
'validee'`, triée par `dateValidation`. Deux sélections coexistaient et
rendaient parfois deux lignes différentes ; la synthèse pouvait nommer un
signal que le cockpit ne voyait pas, et elle passe par
`extraireVigilanceDeterministe`, le repli exact sur lequel s'appuie le rang
`vigilance` de la cotation signée ([[D-099]]). **La condition d'anamnèse est
conservée par-dessus** : les deux sélections ne visaient pas le même défaut, et
prendre l'une sans l'autre en rouvrirait un — une consultation validée dont
l'anamnèse est nulle ferait rendre `[]` à `signauxDeclares`, c'est-à-dire « je
n'ai pas regardé » servi comme « aucun signal ».

**Ce que la décision ne fait pas, et ce qui n'est pas acté.**

- **`DC-43` ne bascule pas.** La moitié « le filtre est avant le classement »
  est tenue et gardée ; la moitié « les populations particulières filtrent »
  ne l'est pas — aucune exclusion n'est déclarée, la gate ne mord sur aucun
  dossier. La règle reste **proposition**, avec un marqueur qui dit précisément
  ce qui manque.
- **`DC-42` ne bascule pas non plus.** La règle d'interruption est écrite et
  bancée, **non signée**, derrière un drapeau `WN_EI_INTERRUPTION` **neuf et
  éteint**. Deux gestes restent, et dans cet ordre : poser le drapeau après que
  la migration est appliquée **et constatée** ([[D-087]]), puis signer la règle.
  Les inverser inhiberait sur une colonne que personne n'a encore remplie.
- **Un arbitrage est nommé et non rendu** : ce que fait la gate quand l'état du
  patient est **inconnu** sur un critère exclu. Le module **parle** plutôt
  qu'il n'inhibe — écarter sur inconnu retirerait des axes à tout dossier
  antérieur à la section « État actuel », c'est-à-dire à tous. La branche est
  **inatteignable** tant que la table est vide ; l'arbitrage se rendra au
  moment de la curation, avec les exclusions sous les yeux.
- **La place exacte du filtre n'est pas gardable de l'extérieur**, et le banc
  l'écrit : déplacer le filtre juste après le `sort` mais avant la numérotation
  rend un résultat strictement identique (mutation jouée, banc resté vert). Ce
  qui est réellement gardé est « aucun candidat écarté ne porte de rang » —
  mutation jouée, banc **vu rouge**.

**Un défaut de rendu trouvé et fermé au passage.** `buildDecisionCard`
n'agrège **pas** les limitations des candidats dans `decisionCard.limitations`,
et `DecisionSummaryCard` ne rendait que ces dernières : le motif de la gate
serait entré dans l'empreinte de la carte, serait arrivé au navigateur, et
n'aurait été affiché par personne — la classe de défaut exacte que la revue du
LOT-04 a trouvée sur les motifs d'abstention. Corrigé, et gardé par un banc de
composant vu rouge.

- Référence : [web/src/lib/clinical/gatePopulationV1.ts](web/src/lib/clinical/gatePopulationV1.ts), [web/src/lib/consultation/etatPopulation.ts](web/src/lib/consultation/etatPopulation.ts), [web/src/lib/consultation/consultationPorteuse.ts](web/src/lib/consultation/consultationPorteuse.ts), [web/src/lib/clinical/safetyEffetIndesirableV1.ts](web/src/lib/clinical/safetyEffetIndesirableV1.ts), [web/prisma/migrations/20260823210000_association_effet_indesirable_intervention/migration.sql](web/prisma/migrations/20260823210000_association_effet_indesirable_intervention/migration.sql), [[D-087]], [[D-093]], [[D-095]], [[D-099]]

### D-100 — Une citation s'ancre sur du texte, et le classificateur E2E se taisait pour deux raisons, pas une

- Date : 2026-08-23
- Statut : accepté
- Domaine : outillage de doctrine et de test — aucune règle clinique, aucun
  seuil
- Campagne : « Doctrine exécutable », LOT-10
- Fait suite à : [[D-098]], qui a cadré ce lot, et dont **deux constats sont
  corrigés ici par la mesure**
- Porte sur : `docs/claude/doctrine/README.md` (convention),
  `scripts/wn-ancres-doctrine.mjs` (neuf), `scripts/wn-diagnostic-e2e.mjs`

**Décision 1 — l'ancre d'une citation devient TEXTUELLE, et l'ancre et son
texte sont liés dans un seul jeton.** Une citation conforme s'écrit
`[« texte exact »](chemin)` ou `` [`symbole`](chemin) ``. Le numéro de ligne
devient une commodité que rien ne vérifie.

Le motif est mesuré : le LOT-09 a décalé un fichier de onze lignes et faussé
**huit** citations d'un coup, **toutes dans les bornes**. Le contrôle évident —
le fichier existe, la ligne est dans les bornes — n'en aurait attrapé aucune.

**Pourquoi un LIEN, et pas un verbatim posé à côté de l'ancre.** Parce que
l'attribution par proximité invente des morts, et [[D-098]] en porte la preuve
sans l'avoir vue : son instrument imputait chaque verbatim à l'ancre la plus
proche à sa gauche, et a ainsi déclaré morte `drapeauxAnamnese.ts:28` en lui
attribuant le libellé « Difficultés à avaler ». **Cette ancre est juste** — la
ligne 28 porte `symptomesFonctionnels: string[]`, qui est ce qu'elle ancre ; le
libellé appartient à l'ancre **voisine**, `anamnese.ts:110-119`, où il figure
toujours. Le lien rend l'attribution syntaxique : il n'y a plus rien à deviner.

**Correction du décompte de [[D-098]] : une citation morte, pas deux.** Seule
`orientationEngine.ts:769-772` avait réellement dérivé — elle pointait sur un
`return` et une déclaration de fonction, le code cité ayant migré. Ré-ancrée
sur son verbatim.

**Décision 2 — une ancre cite ce qui EST, jamais ce qui FUT.** Le registre
raconte aussi des états révolus : « `chaineC1.ts:315` **posait**
`safetyFindings: 0` en dur » a été écrit la veille du jour où [[D-099]] a
supprimé ce code. Ancrer une phrase pareille la ferait rougir pour toujours, ou
forcerait à réécrire l'histoire pour faire taire un contrôle. Une citation
historique **garde l'ancienne forme**. C'est l'auteur qui choisit d'ancrer, et
il n'ancre que le présent.

**Décision 3 — le contrôle refuse de vérifier, et le DIT, plutôt que de se
taire.** Un verbatim élidé (`[…]`) ou plus court que trois caractères est une
**violation**, jamais un silence. Sans cela, il suffirait d'élider une citation
fausse pour la dispenser du contrôle censé refuser les élisions — et c'est
exactement ce que faisait la première rédaction, dont la reconnaissance ne
voyait pas les liens à crochets internes. Le banc l'a trouvé.

**Décision 4 — les 252 citations antérieures sont grandfathered, et le
grandfathering est un CHIFFRE.** Le contrôle les compte et ne les juge pas. Une
sentinelle refuse qu'elles tombent sous cent — une chute signalerait une
réécriture de masse, que ce lot interdit.

**Décision 5 — le classificateur E2E se taisait pour DEUX raisons, et
[[D-098]] n'en avait cadré qu'une.** Il exigeait deux prédicats : `page.goto`
dans `error-context.md`, **et** un journal réseau vide.

- **Mode A**, celui que [[D-098]] a vu : Playwright n'écrit pas toujours
  l'appel fautif — au LOT-09, il n'y avait consigné qu'un délai de *teardown*.
  Le prédicat `page.goto` cède la place à `timeout`.
- **Mode B**, mesuré ici sur **deux artefacts réels de deux sessions
  distinctes** : un test qui monte son décor par `page.request.post(...)` écrit
  une entrée dans le **même** journal, AVANT la navigation qui, elle, n'émettra
  rien. Le journal pesait 2 723 octets **pour une seule ligne**, et le
  classificateur s'est tu sur le cas exact qu'il existe pour nommer. Corriger le
  Mode A seul n'y aurait rien changé.

Le fait discriminant devient donc **« aucune requête de PAGE »** et non « le
journal est vide » : Playwright marque `snapshot._apiRequest: true` les requêtes
d'`APIRequestContext`. Un défaut applicatif émet des requêtes de page ; un
blocage du navigateur n'en émet aucune, quoi que le corps du test ait envoyé
par ailleurs. Cela impose de décompresser le journal — `zlib` étant natif à
Node, la contrainte d'origine du script (aucune dépendance à `unzip`) tient.

**Ce que ce lot NE fait pas**, et qui reste écrit dans son interdit : aucune
réécriture de masse des 252 citations, et aucune garde bloquante sur
l'existant.

**Découverte de sécurité, sans rapport avec le périmètre mais bloquante pour
lui : une trace Playwright ne peut jamais être committée comme fixture.** Le
journal réseau transporte les en-têtes complets de chaque requête, **cookie
`next-auth.session-token` compris**. Le cas de non-régression du Mode B est
donc construit sur la **forme** réelle observée — le marqueur `_apiRequest` —,
jamais sur l'artefact.

**Réserves.**

1. **Deux citations hors bornes restent hors périmètre**, et c'est le périmètre
   qui les met dehors, pas un oubli. `seed.ts:270` vit dans
   `docs/claude/SESSION_LOG.md`, **append-only**, et dans la fiche d'un lot de
   campagne close — deux archives. Réécrire une archive pour faire taire un
   contrôle est exactement ce que la décision 2 interdit. La troisième,
   `web/prisma/seed.ts:288-294` dans ce registre, est ré-ancrée : le défaut
   qu'elle décrit existe toujours, seules les lignes avaient bougé — et son
   verbatim, lui, avait réellement dérivé.
2. **Le contrôle ne distingue pas seul le présent du passé.** Il vérifie ce
   qu'on lui donne à vérifier. Rien n'empêche un auteur d'ancrer une phrase
   historique et de se condamner à un rouge permanent ; la convention le dit,
   aucun code ne l'empêche.
3. **Le périmètre est le corpus doctrinal et ce registre.** L'élargir sans
   écrire la convention ailleurs ferait rougir des documents dont personne n'a
   accepté la règle.

- Référence : [scripts/wn-ancres-doctrine.mjs](scripts/wn-ancres-doctrine.mjs), [scripts/wn-ancres-doctrine.test.mjs](scripts/wn-ancres-doctrine.test.mjs), [scripts/wn-diagnostic-e2e.mjs](scripts/wn-diagnostic-e2e.mjs), [docs/claude/doctrine/README.md](docs/claude/doctrine/README.md), [[D-049]], [[D-098]], [[D-099]]

### D-099 — Les douze signaux d'alerte sont cotés en deux rangs, et le rang d'adressage retire les priorités au lieu de s'afficher à côté

- Date : 2026-08-23
- Statut : accepté (arbitrage praticien rendu en session le 2026-08-23, item
  par item sur les douze libellés ; signature des deux tables dans le même
  échange)
- Domaine : clinique et scoring — `DC-12`, `DC-23`, `DC-19`, `DC-24`
- Campagne : « Doctrine exécutable », LOT-04 (véhicule V3a de l'audit)
- Porte sur : `web/src/lib/clinical/safetySignalsV1.ts` (neuf),
  `web/src/lib/clinical-engine/safetyFindings.ts` (neuf), `chaineC1.ts`,
  `runtimeFromPrisma.ts`, `verifierChaineC1.ts`, `priorityRulesV1.ts`
  (re-signature), le cockpit praticien

**Contexte, et ce qui n'était pas en cause.** `SafetyFinding` existe depuis la
chaîne T0, son consommateur aussi : `decisionCard.ts` bloque dès
[`input.review.safetyFindings.length > 0`](web/src/lib/clinical-engine/decisionCard.ts),
et `evaluerAbstention` sélectionne `ABST-SEC-01`.
Les deux sont bancés. Ce qui manquait était le **producteur** —
`chaineC1.ts:315` posait `safetyFindings: 0` en dur, si bien que `DC-12` et
`DC-23`, actées par [[D-043]] et [[D-062]], étaient **inertes en production**.
Ce lot ne crée ni le type, ni le blocage : il donne une entrée à un chemin
déjà écrit.

**Ce que le praticien voyait, et qui ne suffisait pas.** Les douze
`signaux_alerte` remontent par `extraireVigilanceDeterministe` sous forme d'une
**liste de chaînes**, où rien ne distingue « Idées noires ou suicidaires » de
« Constipation récente inexpliquée » — ni gravité, ni domaine, ni conduite. Et
l'arbitrage praticien du 2026-08-03, inscrit en tête d'`orientationRulesV1.ts`,
avait déjà tranché le fond : un signal d'alerte appelle un **adressage**, jamais
une exploration — « la surface manque, c'est un lot dédié ». C'est celui-ci.

**Décision 1 — la cotation est graduée, sur un critère écrit.** Rang
**`adressage`** : le signal appelle un avis médical dont **le report est
lui-même le risque**. Rang **`vigilance`** : le signal appelle un avis médical
que le praticien porte dans la consultation en cours.

Six en `adressage` : douleur thoracique / oppression · essoufflement
inhabituel · malaise / perte de connaissance · perte de force ou de
sensibilité brutale · idées noires ou suicidaires · sang dans les selles ou les
urines. Six en `vigilance` : perte de poids involontaire · fièvre prolongée /
sueurs nocturnes · vomissements persistants · diarrhée persistante ou nocturne
· douleur intense et inhabituelle · constipation récente inexpliquée.

**La provenance de cette cotation est décisionnelle, pas bibliographique**, et
c'est écrit plutôt que sous-entendu : aucun claim du corpus ne gradue ces douze
libellés. Le régime est celui d'`ABSTENTION_PROCEDURE_V1` ([[D-062]]) —
`DC-26` est satisfaite par le registre des décisions, pas par celui des claims.
L'alternative « uniforme », qui n'aurait rien exigé de neuf, a été exposée et
écartée (voir Options écartées).

**Décision 2 — le rang `vigilance` ne produit RIEN.** Aucun constat, aucun
changement de comportement : ces six signaux continuent de remonter par
`extraireVigilanceDeterministe`, qui ne filtre rien et que ce lot ne touche
pas. Le rang n'est pas une mise en sourdine, c'est le refus d'ajouter une
inhibition là où l'arbitrage n'en a pas demandé. Un banc l'épingle par égalité
d'empreintes : signal de vigilance ⇒ revue et carte **identiques au caractère
près**.

**Décision 3 — l'inhibition mord, et elle retire au lieu de coexister
(`DC-12`).** Un constat de rang `adressage` fait passer l'abstention en
`required` ; `construireCandidats` rend alors `[]` — la table des priorités se
tait —, la carte est bloquée, et `ProtocolConsultationPanel` refuse la
diffusion ([`decisionCard.safetyFindingIds.length === 0`](web/src/components/patient-cockpit/ProtocolConsultationPanel.tsx)). Le candidat est **retiré**, pas affiché sous un bandeau.

**Décision 3 bis — et le praticien lit POURQUOI** (correctif apporté après la
revue du lot, constat C1). Les deux motifs d'abstention appellent des gestes
**opposés** — un signal d'alerte appelle un adressage médical, un canal de
plainte non mesurable appelle une passation —, et les trois surfaces du cockpit
les affichaient toutes deux « bloqueurs décisionnels à revoir ». Les textes qui
les distinguent existaient, entraient dans l'empreinte de la carte et
arrivaient au navigateur : **aucun composant ne les rendait**. `DecisionSummaryCard`
nomme désormais le signal dans son résumé — sans dépli — et sert les
`abstention.limitations`, qui sont des **données signées** couvertes par
`PRIORITY_RULES_SHA256` (patron [[D-062]]), jamais des littéraux de composant.
Sans ce correctif, `DC-34`/`DC-35` — une abstention doit être explicable —
n'étaient pas tenues, et six dossiers sur vingt-cinq passaient en écran muet dès
le merge.

**Décision 4 — aucun point, dans aucun sens (`DC-23`).** Le constat ne porte ni
gravité chiffrée, ni rang numérique, ni pondération, et le producteur ne lit
aucun score. Le seul champ qui pouvait s'y confondre est `confidence`, imposé
par `ClinicalFindingBase` et **partagé** avec les manques et les discordances :
l'ôter du seul objet de sécurité aurait touché les deux autres. Il est donc
**figé à `'à_documenter'`** — le faire varier avec le rang en aurait fait une
mesure de gravité déguisée. Un banc vérifie la constance sur les douze, et un
second inspecte les **valeurs** produites : aucun nombre, nulle part, sous
aucun nom. La preuve de bout en bout est une égalité d'empreinte de snapshot —
score favorable et signal majeur coexistent, le score ne bouge pas d'un point,
le signal prime.

**Décision 5 — fail-closed sur le libellé inconnu.** Un signal déclaré que la
cotation signée ne connaît pas — ce qu'une réécriture d'`anamnese.ts`
produirait — est traité comme un **adressage**, jamais ignoré : un silence sur
le rang n'est pas une permission (`DC-13`, `DC-24`). Trois replis fail-open ont
été écartés nommément, et chacun est gardé : `extraireDrapeauxAnamnese` (qui
filtre contre l'énuméré courant et ferait **disparaître** un libellé dérivé —
son propre commentaire le dit), le plafond de 50 entrées de `liste()`, et la
neutralisation de texte destinée au prompt. Classe fermée par [[D-072]],
rouverte ici et refermée. Ce cas est **vide en production** au 2026-08-23.

**Décision 6 — re-signature de la table des priorités, et son motif est
étroit.** Le texte signé d'`ABST-NR-01` affirmait « aucun constat de sécurité
n'est produit par le moteur déterministe — **aucun producteur n'existe à ce
jour** ». Ce lot l'a rendu faux. Le corriger change `PRIORITY_RULES_SHA256`,
donc referme le verrou : la re-signature est la sortie prévue par le patron
[[D-063]]/[[D-067]], jamais la mise à jour silencieuse du sha. **Le périmètre
n'a pas bougé autrement** — les deux règles, leurs déclencheurs, leurs claims
et les deux motifs `required` sont identiques au caractère près.

La phrase de remplacement se garde de trois affirmations. Elle ne dit pas
« les signaux ont été lus et aucun n'appelle d'adressage » (faux quand la
cotation n'est pas signée). Elle ne prétend à aucune exhaustivité — le second
producteur, l'effet indésirable déclaré au portail, appartient au LOT-05. Et
elle n'affirme **aucun acte de lecture** : une première rédaction disait « la
portée de cette lecture est celle de la règle SAF-ANAM-01 », que la revue du
lot a refusée à juste titre — `adaptRuntimeInputs` rend une liste **vide**
aussi bien sur « aucun signal coché » que sur « aucune consultation validée à
lire », et un jalon post-T0 se confirme sans les préconditions qui exigent
cette consultation. La phrase aurait servi l'absence de lecture comme le
résultat d'une lecture, c'est-à-dire le défaut `DC-24` que cette re-signature
existe précisément pour corriger. Elle nomme désormais la **portée de la
règle** — ce sur quoi elle s'applique — et renvoie à la revue pour son état.

**Mesure de production avant décision** (conteneur `one-off-7803` puis
`one-off-9489`, lecture seule, agrégats sans identité, 2026-08-23) : **25
consultations, 9 portent au moins un signal** (36 %), et **6 portent au moins
un signal de rang `adressage`** (24 %). Six libellés distincts sont présents,
tous exacts. La cotation graduée rend donc **trois dossiers** à la table des
priorités que la cotation uniforme aurait fait taire.

**Options écartées.**

- **Cotation uniforme** (les douze inhibent). Ne demandait aucun arbitrage neuf
  et n'inventait rien : c'était l'option la moins coûteuse en provenance. Elle
  faisait taire le cockpit sur 36 % des dossiers, y compris sur une
  constipation récente. Écartée par le praticien au profit d'une cotation
  qu'il rend et qu'il signe.
- **Critère « tout signal appelant un adressage »** plutôt que « le report est
  le risque ». Il réunissait en `adressage` le trio d'orientation classique
  (sang, perte de poids, fièvre prolongée) que le critère retenu **sépare**.
  Exposé avant la cotation, non retenu — la conséquence est assumée et écrite
  dans la table.
- **Une règle `SAF-ANAM-nn` par signal.** Douze règles auraient porté douze
  fois la même validation et laissé croire à douze relectures. Une seule règle,
  le libellé cité verbatim dans la `rationale`.
- **Une conduite à tenir par item.** Douze textes pour deux rangs auraient
  inventé onze distinctions que l'arbitrage n'a pas rendues, chacune sans
  provenance au sens de `DC-19`. La conduite est portée par le rang.
- **Rattraper la limitation d'abstention appauvrie.** Table des priorités
  désignée, la revue servait « Aucune règle d'abstention cliniquement validée
  n'est fournie. » ; la règle de sécurité en étant une, le message tombe
  désormais sur une branche exacte mais moins renseignée. Corriger cela
  supposait de toucher `clinicalReview.ts`, qui sert aussi les manques et les
  discordances. Écart écrit dans le banc, non corrigé au passage.

**Réserves.**

1. **Le verrou de la cotation a un sens INVERSE des autres tables du dépôt.**
   Ailleurs, un verrou fermé fait taire le moteur et c'est le défaut sûr. Ici,
   il **retire une inhibition** : le dispositif devient moins prudent. Le
   contrepoids est étroit — la règle passe en `candidate` et la revue publie
   « Règle candidate inactive : SAF-ANAM-01. », le CI rougit avant la
   production —, mais il ne remplace pas une inhibition. Nommé, gardé, non
   fermé.
2. **« Douleur intense et inhabituelle » est cotée faute de libellé
   qualifiable**, pas sur un jugement clinique : le libellé ne porte ni siège
   ni domaine. La requalifier suppose de réécrire la question dans
   `anamnese.ts` — modification de questionnaire, donc autre lot et autre
   arbitrage.
3. **Le constat ne cite aucune source.** `validateProvenance` exige que toute
   source citée existe dans le snapshot, or l'anamnèse n'y figure pas — le
   snapshot est bâti sur les passations. La provenance est donc structurellement
   **vide**, et l'origine est dite en limitation. Faire entrer l'anamnèse dans
   le snapshot est un autre lot.
4. **La couverture n'est pas complète et ne le prétend pas.** Le second
   producteur — effet indésirable déclaré au portail — appartient au LOT-05, et
   la phrase d'`ABST-NR-01` est écrite pour ne pas l'anticiper.
5. **La sécurité lit une AUTRE consultation que l'orientation, les
   contradictions et la synthèse** (relevé en revue, C3). Deux requêtes
   coexistent dans le dépôt : la chaîne C1 (cockpit, vérificateur,
   préconditions) lit `statut: 'validee'` triée par `dateValidation desc,
   createdAt desc` ; `orientationService`, `contradictionsService` et
   `api/praticien/synthese` lisent `NOT anamnese DbNull` triée par `createdAt
   desc`. Sur un dossier portant deux consultations validées dont l'ordre de
   création diffère de l'ordre de validation, la synthèse peut nommer un signal
   d'alerte — par `extraireVigilanceDeterministe`, **le repli exact sur lequel
   s'appuie le rang `vigilance`** — pendant que le cockpit lit l'autre anamnèse.
   La divergence **préexiste** à ce lot (elle portait sur `patientContext`) ;
   ce lot la fait porter sur un chemin de sécurité. Trancher quelle consultation
   fait foi est un arbitrage clinique — le commentaire d'`orientationService`
   défend explicitement l'autre choix — et il n'est pas rendu ici. **Dette
   nommée, à porter au LOT-05**, qui branche le second producteur et rencontrera
   la même question.
6. **Le tour complet du vérificateur n'est éprouvé sur aucun dossier portant un
   signal.** `verifierChaineC1` recalcule la chaîne pour comparer trois
   empreintes, et le seul banc de bout en bout passe par `ANAMNESE_C1_FIXTURE`,
   qui ne porte pas de `signaux_alerte`. Le code des deux lectures est
   identique — vérifié ligne à ligne en revue —, mais rien ne le garde. Même
   dette que la précédente, même véhicule.
7. **Toutes les empreintes de revue et de carte changent, y compris sur les 16
   dossiers sans aucun signal** : la règle `SAF-ANAM-01` est jointe à
   `review.rules` inconditionnellement, et `rules` entre dans le hash.
   Conséquence réelle et bénigne — une carte préparée avant le déploiement puis
   persistée après rend un 409 « Rechargez le cockpit » —, mais elle dépasse les
   6 dossiers porteurs, et c'est écrit plutôt que découvert.

- Référence : [web/src/lib/clinical/safetySignalsV1.ts](web/src/lib/clinical/safetySignalsV1.ts), [web/src/lib/clinical-engine/safetyFindings.ts](web/src/lib/clinical-engine/safetyFindings.ts), [web/src/lib/clinical-engine/safetyFindings.guard.test.ts](web/src/lib/clinical-engine/safetyFindings.guard.test.ts), [web/src/lib/clinical/priorityRulesV1.ts](web/src/lib/clinical/priorityRulesV1.ts), [[D-043]], [[D-062]], [[D-063]], [[D-067]], [[D-072]], [[D-095]]

### D-098 — Trois dettes tranchées : l'ancre devient textuelle, le classificateur perd un prédicat, les orphelines ne se rouvrent pas

- Date : 2026-08-23
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-23)
- Domaine : outillage de doctrine et de test — aucun code produit, aucune
  règle clinique
- Fait suite à : [[D-097]], dont la livraison a produit la dette d'ancres
- Porte sur : les citations `fichier:ligne` du corpus de doctrine,
  `scripts/wn-diagnostic-e2e.mjs`, et le sort des dix règles orphelines

**Contexte.** Le LOT-09 a laissé trois dettes nommées. Elles sont tranchées
ici sur **mesure**, pas sur impression.

**Décision 1 — les dix orphelines ne se rouvrent pas.** [[D-096]] les a
laissées « dettes nommées sans véhicule » et le **LOT-08** les porte déjà dans
son périmètre, liste et méthode de recomptage comprises. Les re-décider huit
jours plus tard serait de l'agitation de portefeuille. Elles s'exécutent au
LOT-08 ; aucune décision n'est due ici.

**Décision 2 — l'ancre d'une citation devient TEXTUELLE, parce que le contrôle
évident ne marche pas.** Mesure du 2026-08-23 : **247 citations**
`fichier:ligne` dans `docs/claude/doctrine/` et ce registre. Le contrôle qu'on
écrirait spontanément — le fichier existe, la ligne est dans les bornes — rend
0 introuvable et **2 hors bornes** (`DECISIONS.md:4125`).

Et voici ce qui tranche : **les huit citations faussées par le LOT-09 étaient
toutes dans les bornes.** Ce contrôle-là n'en aurait attrapé aucune. Il garde
contre la suppression d'un fichier, jamais contre la dérive — c'est-à-dire
contre le seul défaut qu'on ait réellement observé, deux fois en un jour.

Sur les **12 citations à verbatim accolé**, les seules vérifiables sans
ambiguïté : 8 justes, 2 faux positifs de l'instrument de mesure (`D-097` cite
avec `[…]` et du gras), **2 réellement mortes** — `drapeauxAnamnese.ts:28`
cite « Difficultés à avaler », absent de tout le fichier, et
`orientationEngine.ts:769` cite `Q_GAS_01`, qui vit aux lignes 283, 479 et 966.

Le correctif n'est donc **pas un banc de plus, c'est un changement d'ancre** :
une citation porte un **verbatim exact ou un nom de symbole**, le numéro de
ligne devenant une commodité. Un contrôle « le texte cité existe dans le
fichier cité » ne fait alors **aucune arithmétique de ligne** : décidable,
sans faux positif, immunisé à la dérive. Il aurait attrapé les deux mortes —
et surtout, avec une ancre textuelle, les huit décalées restaient **lisibles**
au lieu d'envoyer le relecteur sur une consigne de médicaments.

**Ce que cette décision ne fait pas** : réécrire les 247 citations. Le
bénéfice ne paie pas la revue, et un diff de 247 lignes noierait le contrôle
qui l'accompagne. Convention appliquée **au neuf et au touché**, l'existant
grandfathered et le disant. **Limite assumée** : le contrôle prouvera que le
texte cité existe dans le fichier cité, jamais qu'il s'y trouve à la ligne
annoncée. Le numéro reste une commodité non gardée.

**Décision 3 — le classificateur E2E perd un prédicat.**
`scripts/wn-diagnostic-e2e.mjs` exige aujourd'hui le journal réseau vide
**et** `page.goto` dans `error-context.md`. Le premier est le fait décisif —
aucune requête émise, donc ni l'application, ni Prisma, ni PostgreSQL ne
peuvent être en cause. Le second dépend de ce que Playwright choisit d'écrire :
au LOT-09, il n'y avait mis que le timeout de *teardown*, et le script s'est
tu sur exactement le cas qu'il existe pour nommer — rendant l'enquête d'une
demi-heure qu'il devait supprimer. `page.goto` cède la place à `timeout` ; le
journal vide reste discriminant.

Ce que ce correctif **ne fait pas** : ajouter des `retries`, blanchir un rouge,
ou toucher au code de sortie. Le harnais sort en `1` quoi qu'il diagnostique,
et c'est voulu — le script nomme un rouge, il ne le supprime pas.

**Décision 4 — un seul lot, le LOT-10 de « Doctrine exécutable ».** Les deux
correctifs n'ont aucun rapport de fond, mais ils partagent leur origine — la
livraison du LOT-09 —, leur classe (outillage, aucune règle clinique) et leur
palier. Deux lots auraient coûté deux PR pour la même quantité de travail. Le
LOT-10 est libre de toute dépendance.

**Correction de portée sur une note de session** : la mémoire de travail
affirmait le palier T3 local « atteignable sur aucune branche de ce Mac ».
Faux — le T3 du LOT-09 est passé **intégralement**, WebKit compris, sur un
diff plus large que celui qui avait rougi une heure plus tôt. Le blocage
`D-049` est **intermittent, pas structurel** : un rouge portant sa signature
se rejoue une fois avant qu'on en conclue quoi que ce soit.

### D-097 — `DC-09` mord dans le prompt : une association ne se restitue jamais en preuve, et la clause est gardée en position

- Date : 2026-08-23
- Statut : accepté (formulation clinique tranchée par le responsable en
  session le 2026-08-23)
- Domaine : consigne système de synthèse (`SYSTEM_PROMPT_GOUVERNANCE`),
  doctrine clinique
- Fait suite à : [[D-096]] décision 1, qui a donné le LOT-09 à `DC-09`
- Porte sur : `DC-09` ; ne touche ni [[D-011]], ni `DC-03`, ni `DC-27`

**Contexte.** `DC-09` — « un claim associatif ne devient jamais une preuve » —
n'avait **aucun ancrage côté rédigé** : ni clause de prompt, ni marqueur dans
la validation de sortie. L'audit du 2026-08-11 la désignait comme le garde-fou
le plus exposé de la chaîne, et le LOT-01 de « Doctrine exécutable » a
confirmé le trou. Le déterministe, lui, tenait déjà :
`ContradictionFinding.description` impose une formulation neutre
(`contradictionFinding.ts:130-136`) et aucune table signée ne conclut.

**Décision 1 — la clause, et ses quatre verbes.** Le cadre déontologique du
prompt porte désormais : « **Une association n'est pas une preuve.** […] Ne
l'écris jamais sous la forme "X prouve Y", "X explique Y", "X démontre Y" ni
"X atteste Y" […] Expliciter un motif déjà énoncé ou une hypothèse déjà
transmise reste attendu ; en faire une démonstration ne l'est jamais »
(`anthropic.ts:347`). La formule courte est **citable**, comme « Association
n'est pas causalité » l'est pour `DC-27` : c'est ce qui la rend épinglable.

`confirme` et `signe` ont été **délibérément écartés** de la liste des verbes
interdits : le prompt emploie déjà « à confirmer par l'entretien » et
« signale-le », et un interdit portant sur ces deux mots se lirait comme une
contradiction de consignes voisines. Le glissement probatoire est nommé par
`prouve` et `démontre`, ses deux reformulations immédiates par `explique` et
`atteste`. Aucun lexique clinique n'est créé : la clause interdit une **forme
de phrase**, elle n'établit rien.

La seconde moitié de la clause n'est pas de l'ornement. Le même prompt exige
ailleurs « Ton rôle est de le **restituer et de l'expliquer** »
(`anthropic.ts:499`) et « expliquer en langage clinique le motif déjà énoncé »
(`:508`). Un interdit brut sur le verbe *expliquer* aurait renversé la
restitution que la section orientation impose. La clause sépare donc
**expliciter un motif donné** (attendu) de **poser qu'un élément en explique
un autre** (interdit), et le banc garde les deux bouts.

**Un résiduel relevé en revue, et fermé plutôt que laissé ouvert.** L'interdit
porte sur une **forme de surface** (« X explique Y »), son exception sur un
**acte** (« expliciter un motif donné »). Or `:508` demande aussi de « relier
ce motif aux scores et au contexte ». Un modèle prudent pouvait donc ranger la
restitution du bloc déterministe sous l'antécédent de la clause — « ce qui
t'est transmis comme un lien possible » — et couvrir d'un « pourrait être
associé à » un motif que la table **signée** a, lui, tranché : une règle de
prudence affaiblissant une recommandation déjà décidée, exactement l'inverse
de l'effet recherché. La clause dit désormais que le bloc « Recommandation
d'exploration déterministe » n'est **pas** un lien possible — « il a été décidé
hors de toi. Restitue-le tel qu'il t'est donné ». Le banc l'assertionne
(`promptAssociationPreuve.guard.test.ts:85`). Corrigé **avant** expédition :
plus tard, la même phrase aurait coûté un `synthese-v30`.

**Décision 2 — la clause est gardée en POSITION, pas seulement en texte.** Le
prompt contient une clause de primauté : la section « Recommandation
d'exploration déterministe » prime sur toute autre consigne relative aux
explorations, mais « ne relève **aucune des interdictions posées plus haut** »
(`anthropic.ts:525`). Une clause posée dans le cadre déontologique est donc
hors de sa portée ; la même clause déplacée plus bas deviendrait discutable
**sans qu'un mot ait bougé**. `promptAssociationPreuve.guard.test.ts:133`
assertionne l'ordre — formule après `## Cadre déontologique`, avant la
première section topique. Vue rouge constatée sur les deux gestes : clause
retirée (4 tests rouges), clause déplacée sous « Consignes de réponse » (le
seul test de position rouge, texte intact).

**Le banc garde aussi l'OPÉRATEUR, et c'est la revue qui l'a exigé.** Première
rédaction : six assertions vérifiaient que les quatre formes verbales
*apparaissent*, jamais qu'elles sont *interdites*. Deux mutations réelles
laissaient tout vert — « Ne l'écris jamais sous la forme » → « **Tu peux
l'écrire** sous la forme », et → « **Évite** de l'écrire ». L'interdit devenait
une préférence sans qu'une assertion bouge, c'est-à-dire exactement le retrait
silencieux que ce lot prétend rendre impossible. Le seul filet restant était
l'empreinte du prompt, dont le message d'échec disait « reporter la nouvelle
empreinte ici » — une invitation à la mise à jour machinale. Deux correctifs :
`promptAssociationPreuve.guard.test.ts:67` épingle l'opérateur (vu rouge sur
les deux mutations), et les **deux** messages d'empreinte
(`promptAlimentaire.guard.test.ts`, `anthropic.corpusActif.guard.test.ts`)
disent désormais que le geste n'est pas mécanique et qu'un interdit clinique
qui bouge appelle une décision `D-xxx` avant le report.

**Limite nommée** : une clause *contradictoire ajoutée ailleurs* dans le prompt
(« une association peut valoir preuve quand… ») reste verte au banc — mutation
jouée, elle passe. La détecter demanderait le lexique ouvert que la décision 3
écarte ci-dessous. Ce cas-là est rattrapé par l'empreinte, et par elle seule.

**Ce que cette préséance ne couvre pas, relevé en revue.** Deux autres
sections priment elles aussi — « Questionnaires alimentaires » (`:384`) et
« Questionnaires dont le résultat n'est pas interprétable » (`:457`) — et leur
formule est **sans réserve** : « prime sur toute autre consigne de ce prompt si
elles paraissent se contredire ». Seule la section orientation (`:525`)
s'interdit explicitement de relever les interdictions posées plus haut. Être
au-dessus met donc hors de portée de `:525`, pas des deux autres. Aucune
contradiction pratique aujourd'hui — les deux sections alimentaire et non
interprétable sont plus restrictives que la clause, jamais plus permissives —
mais la revendication est bornée ici pour qu'un lot suivant ne cite pas ce
patron plus large qu'il n'est.

**Décision 3 — le second point de passage est examiné et ÉCARTÉ.** Le
détecteur de restitution (`verifierRestitutionOrientation.ts`) ne portera pas
de marqueur « association devenue preuve ». Son critère de décidabilité est
écrit dans son en-tête : un écart ne se juge que contre un **vocabulaire
fermé** (seize packs, identifiants de forme fixe, marqueurs d'extinction déjà
imposés par la consigne). Le glissement probatoire n'en a pas — il faudrait un
lexique ouvert de paraphrases (« témoigne de », « rend compte de »,
« est à l'origine de ») **et** la provenance associative du lien, que la prose
ne porte pas. Un repérage littéral des quatre verbes confondrait
« expliquer le motif déjà énoncé », qui est exigé, avec « X explique Y », qui
est interdit ; les départager demanderait une fenêtre d'adjacence et un
traitement de la négation — un **arbitrage chiffré neuf**, que la constitution
interdit d'inventer (`DC-19`, `DC-20`). Le motif est écrit dans le fichier
lui-même (`:43`) pour que la question ne se repose pas à l'aveugle. Le régime
de [[D-011]] — journaliser, ne pas censurer — reste intact ; le renverser
serait un autre acte.

**Décision 4 — bump `synthese-v28` → `synthese-v29`, déclaré.** Un numéro de
prompt qui bouge coupe les comparaisons entre synthèses, et cela se dit plutôt
que se taise : une synthèse rédigée sous v28 a pu écrire « X explique Y » là
où la donnée ne portait qu'un lien possible. Les deux versions ne se comparent
donc pas sur ce point.

**Ce que cette décision ne fait pas.** Elle ne garantit pas que le modèle
obéit — le banc épingle **la consigne**, jamais la sortie, exactement comme
celui de `DC-27`. Elle garantit qu'on ne retire pas l'interdit en silence, ni
en le supprimant, ni en le déplaçant. Elle n'empiète pas sur `DC-03`
(provenance de la justification générative) : le glissement traité est
association → preuve, pas l'origine de la justification.

**Effet sur la doctrine.** `DC-09` bascule de *Proposition* à **acté**. Les
quatre règles que l'audit du 2026-08-11 désignait comme les plus exposées sont
désormais **toutes** ancrées. `DC-36` demeure la seule règle sans preuve, sans
banc et sans véhicule.

### D-096 — Trois arbitrages de portefeuille : DC-09 reçoit un lot, la migration change de campagne, la convergence cherche sa provenance

- Date : 2026-08-23
- Statut : accepté (arbitrages du responsable, rendus en session le 2026-08-23)
- Domaine : portefeuille de campagnes — « Doctrine exécutable », « Curation
  signée »
- Fait suite à : [[D-095]], dont le LOT-01 a produit les trois questions
- Porte sur : `DC-09`, `DC-29`, et le porteur de `DC-07` / `DC-13` / `DC-20`

**Contexte.** Le LOT-01 de « Doctrine exécutable » a livré l'état atteint de
la constitution et laissé trois questions ouvertes qu'aucune règle ne pouvait
trancher seule : que faire des **onze** règles orphelines (plus la part de
`DC-11` hors exclusions) recensées par [[D-095]], quand jouer une
migration qui n'a plus de consommateur, et que faire d'une forme typée sans
provenance. Elles sont tranchées ici, ensemble, parce qu'elles se répondent.

**Décision 1 — `DC-09` reçoit le LOT-09 ; les autres orphelines restent des
dettes nommées.** `DC-09` (« un claim associatif ne devient jamais une
preuve ») était la dernière des quatre règles que l'audit du 2026-08-11
désignait comme les plus exposées à n'avoir aucun ancrage — les trois autres
(`DC-27`, `DC-29`, `DC-30`) sont refermées. Elle est la **jumelle exacte de
`DC-27`** : même fichier (`anthropic.ts`), même mécanisme (clause de prompt
plus garde qui épingle la formule dans `SYSTEM_PROMPT_GOUVERNANCE`), même
coût. Le patron vient d'être constaté opérant ; le rejouer sur la règle la
plus exposée du dépôt est le meilleur rapport de toute la campagne.

Les **dix autres orphelines** — `DC-03`, `DC-36`, `DC-38`, `DC-39`, `DC-40`,
`DC-41`, `DC-44`, `DC-45`, `DC-47`, `DC-48`, plus la part de `DC-11` hors
exclusions — **restent des dettes nommées, sans véhicule**, écrites comme
telles au LOT-08. Ce n'est pas un renoncement : leur fermeture est un
arbitrage de portefeuille, et « Doctrine exécutable » n'a pas mandat pour
l'absorber. `DC-36` demeure la seule règle sans preuve, sans banc et sans
véhicule.

**Décision 2 — la migration des axes du claim change de campagne.** Le LOT-02
livrait trois axes doctrinaux sur `rag_corpus_claims` (`DC-07`, `DC-13`,
`DC-20`). Après que `D-095` a sorti la population du claim, il ne lui restait
**aucun consommateur** dans la campagne : `LOT-05` et `LOT-06` avaient perdu
leur dépendance, et le LOT-01 a mesuré que rien d'autre ne lit ces colonnes.
Son unique bénéficiaire est **Curation signée**, qui n'a nulle part où écrire
ces axes — et qui est à l'arrêt (appariement NABM et liens biomarqueur↔besoin
toujours à 0 ligne).

L'argument d'origine de l'audit — « si la migration n'est pas posée tôt,
chaque lot invente son équivalent local » — visait les LOT-04, LOT-05 et
LOT-06 de la **chaîne T0**, livrés depuis le 2026-08-18 : le risque qu'il
prévenait a expiré. Le périmètre est donc transféré, intégralement et avec ses
contraintes (confirmation obligatoire, PR seule, contrat plus négatif nommés
en CI, aucun backfill, aucun défaut clinique), à
`docs/claude/campagnes/2026-08-18-curation-signee/sources/2026-08-23-transfert-migration-axes-claim.md`.

Conséquence assumée : **« Doctrine exécutable » n'a plus de migration**, donc
plus aucune étape sous confirmation obligatoire ni délai `release-db`. Poser
une colonne en production depuis une campagne qui ne s'en sert pas aurait
ajouté une orpheline à celles que le LOT-01 vient de recenser.

**Décision 3 — `DC-29` : le LOT-06 descend chercher la provenance avant de
conclure.** Les quatre niveaux de convergence sont typés et gardés, mais rien
ne dit à partir de combien de sources indépendantes on écrit
`CONVERGENCE_MODEREE` — et l'inventer violerait `DC-19`. Plutôt que d'assumer
d'emblée la forme vide, le LOT-06 **cherche** : descente du corpus certifié à
la recherche d'une source qui fonde une graduation. Si elle existe, la règle
se signe et la forme s'ouvre ; sinon la forme reste vide, écrite comme état
légitime. **La forme vide devient le repli, plus le défaut** — et une forme
laissée vide *sans descente* ne vaut pas le critère de done du lot. La
descente peut ne rien rendre : c'est un résultat, et son coût est borné.

**Ce que la décision ne fait pas.** Elle ne modifie aucun code, aucun banc,
aucun seuil, aucune règle clinique. Elle ne referme aucune des dix orphelines
restantes. Elle ne renumérote pas les lots : le numéro du LOT-02 n'est pas
réattribué — renuméroter six fiches coûterait plus que le trou, et
l'historique des dépendances en deviendrait illisible.

**Impact attendu.** « Doctrine exécutable » passe à **sept lots exécutables**
sur neuf numéros, sans migration ; son graphe se réduit à un seul lien fort
(LOT-04 → LOT-05/LOT-06), et trois lots — LOT-03, LOT-07, LOT-09 — sont
entièrement libres. « Curation signée » gagne une migration à cadrer le jour
où elle s'ouvre.

### D-095 — L'état atteint de la constitution : ce qu'on a le droit de dire acté

- Date : 2026-08-23
- Statut : accepté (arbitrages du praticien, rendus en session le 2026-08-23)
- Domaine : doctrine clinique — constitution, audit doctrinal, gouvernance des
  statuts
- Fonde : le LOT-01 de la campagne `2026-08-18-doctrine-executable`
- Porte sur : `DC-14`, `DC-29`, `DC-33`, et la forme des statuts des 58 règles

**Contexte.** L'audit doctrinal du 2026-08-11 confrontait les 58 règles `DC-nn`
au code. Douze jours plus tard, le dépôt a bougé sous lui : la campagne chaîne
T0 est close (10/10 lots, 2026-08-18), le Socle a posé le niveau « demande »
clinique du hook, et le LOT-01 de la chaîne T0 a livré un objet de
contradiction. Les 58 règles ont été re-vérifiées une par une contre le dépôt
à `f9290b37`, jamais contre la documentation qui le décrit. La présente
décision tranche ce que cette descente ne pouvait pas trancher seule.

**Décision — le critère, rappelé parce qu'il a servi de filtre.** Une règle
n'est **actée** que sur ses **trois preuves** : une décision qui la tranche
(`DC-18`), un banc ou un contrat qui la fait mordre **et qui tourne
réellement** — nommé par une étape CI ou joué par une suite —, et le statut
basculé dans `CONSTITUTION_CLINIQUE.md`. Une règle respectée en pratique mais
sans banc reste « proposition ». Une règle bancée sans décision **n'est pas
actée par sa seule livraison de code**.

**Décision 1 — `DC-29` bascule à acté.** [[D-041]] avait écrit sa propre
condition (« elles ne basculent à acté qu'à ce moment »), et cette condition
est remplie : `contradictionFinding.guard.test.ts:71-163` refuse **à la
compilation** tout champ de certitude, de probabilité, de score ou de
confiance, sous quelque nom que ce soit, doublé sur l'instance par
`contradictionsEngine.test.ts:325-345`. La réserve de [[D-043]] est **levée
pour cette règle seule** — `DC-54` et `DC-55` restent « proposition », leur
banc n'existe pas. La bascule porte sur **l'interdit**, pas sur l'obligation :
la moitié positive de `DC-29` (« chaque convergence nomme ses sources
indépendantes ») n'est exercée par aucune sortie, la forme `CONVERGENCE` n'a
aucun producteur et le moteur la refuse (`contradictionsEngine.ts:188-192`).

**Décision 2 — `DC-33` bascule à acté, par régularisation.** Le code la tient
et un banc la garde (`chaineC1.ts:382-413` classe puis numérote,
`chaineC1.test.ts:164` épingle `[1, 2]` sur la carte de décision servie), mais
**aucune décision ne la tranchait** : [[D-048]] l'avait renvoyée au LOT-04, et
[[D-054]], décision de ce lot, ne l'a jamais reprise. La présente décision
prononce l'arbitrage omis. **Deux réserves nommées, qui ne sont pas des
formalités** : `PRIORITY_RULES_V1` ne publie que deux règles, donc le rang
observable n'excède jamais 2 ; et le classement lui-même vit **hors du
périmètre haché** (`priorityRulesV1.ts:328-333`, « CE QUI RESTE HORS DU
SHA ») — la signature ne le couvre
pas.

**Décision 3 — la portée de `DC-14`.** La règle gouverne l'**extrapolation
d'un claim** ; elle ne commande pas le défaut d'une colonne. Une population
générale **déclarée** — `adulte_tout_venant` — n'est pas le silence que
`DC-14` interdit de lire comme une généralité : le dépôt en fait déjà la
démonstration signée avec `BiologyFunctionalRange.population NOT NULL DEFAULT`
et son `CHECK` fermé ([[D-068]], [[D-069]]). Il en découle que la population
appartient à l'**intervention** (`DC-11`), pas au claim : un claim descriptif
n'a pas de population, c'est la proposition qui en a une. **Le texte de
`DC-14` n'est pas modifié** — seule sa lecture est écrite. Conséquence
opératoire : le LOT-02 n'ajoute pas de colonne `population` à
`rag_corpus_claims`, et un `DEFAULT` posé par migration sur les 8 224 claims
serait une déclaration clinique que personne n'a prononcée (`DC-17`, `DC-19`).

**Décision 4 — sept réserves « Banc dû » sont retirées, et il faut le dire
nommément.** Neuf règles portaient « **Banc dû** : la règle ne mord pas encore
à l'exécution ». Sept ne le méritent plus, et pour deux raisons distinctes :

- **le banc a été trouvé** — `DC-17` (hook à huit fichiers cliniques,
  `D-083` §3, banc CI), `DC-27` (le prompt interdit la causalité depuis la
  v20, `promptPassationCourante.guard.test.ts:70-78`), `DC-30` (moteur de
  contradictions, quatre bancs en CI), `DC-34` (les claims remontent à
  l'écran, `MissingDataPanel.test.tsx:105-112`), `DC-35`
  (`ABSTENTION_PROCEDURE_V1` signée, fail-closed, quatre bancs) ;
- **la réserve était mal nommée** — `DC-12` et `DC-23` : leurs bancs
  existaient déjà, ce qui manque est un **producteur**. Elles reçoivent le
  marqueur **Producteur dû** : la branche est gardée, mais
  `chaineC1.ts:315` pose `safetyFindings: 0` en dur et la règle est **inerte
  en production**.

Deux réserves demeurent : `DC-14` (« Banc dû sur l'objet de la règle » — rien
n'empêche d'appliquer un claim hors de sa population) et `DC-20` (aucun
`thresholdKind` au dépôt). Aucun banc n'est créé, modifié ni supprimé par
cette décision : seuls des constats changent.

**Décision 5 — le marqueur « Décision due ».** Quatre règles sont « actées »
sans qu'aucune entrée du registre ne les prononce : `DC-04`, `DC-21`, `DC-44`,
`DC-56`. Elles **restent actées** — le code les tient réellement, les
déclasser dirait moins que la vérité — et portent désormais un marqueur
**Décision due**, calqué sur le **Banc dû** que le document emploie déjà. Un
seul précédent pour les quatre, et une dette qui se retrouve au grep. Un
troisième marqueur, **écrite, non armée**, distingue les règles sans sujet
(`DC-05`, `DC-08`, `DC-52`, `DC-53`) des propositions ordinaires : leur
déclencheur est nommé, et c'est un état légitime.

**Ce que la décision ne fait pas.** Elle ne modifie aucun code, aucun banc,
aucune table de règles, aucun seuil. Elle ne bascule aucune règle dont les
trois preuves ne sont pas réunies, et ne referme aucune des règles devenues
orphelines. **Elle ne recompute pas la grille à quatre colonnes de l'audit**
(acquis / partiel / porté / absent) : cette grille mesure l'état du **code**,
quand la constitution mesure l'**acte d'intégration**, et les deux ne
coïncident pas — `DC-33` en est la preuve, le code la tenait avant qu'aucune
décision ne la tranche. Un chiffre global non reconstituable depuis les listes
serait pire que pas de chiffre ; la limite est nommée plutôt que masquée.

**Constat porté au registre, parce qu'il est le vrai produit de la descente.**
Le tableau de l'audit compte **13 lignes « porté »** et **6 lignes
« partiel » nommant un lot** de la chaîne T0 — dix-neuf lignes suspendues à
une campagne **close depuis le 2026-08-18**. Quatre ont été **refermées** par
leur lot (`DC-27`, `DC-30`, `DC-33`, `DC-34`). **Onze sont orphelines** — le
lot est livré sans les avoir refermées, et aucun lot ne les reprend :
`DC-03`, `DC-09`, `DC-36`, `DC-38`, `DC-39`, `DC-40`, `DC-41`, `DC-44`,
`DC-45`, `DC-47`, `DC-48`, plus la part de `DC-11` qui excède les exclusions.
Chacune porte le marqueur **orpheline** dans la constitution : la liste se
vérifie au grep, elle ne se croit pas sur parole. Les quatre restantes ont
changé de porteur — `DC-37` (livrée en trois formes), `DC-46` (CB-09, hors
campagne), `DC-35` et `DC-11`-exclusions (LOT-05 de cette campagne).

Ce ne sont pas des régressions de code, ce sont des **promesses de lot
évaporées**. Deux règles n'ont ni preuve, ni banc, ni véhicule : `DC-09` — que
l'audit désignait comme le garde-fou le plus exposé de la chaîne — et
`DC-36`.

**Impact attendu.** Aucun sur la production : la décision est documentaire.
Elle rend mesurables les sept lots suivants de la campagne, et elle donne aux
règles orphelines un nom, à défaut d'un véhicule.

### D-094 — La machine cite, elle n'invente pas : le régime de la proposition d'objectif

- Date : 2026-08-23
- Statut : accepté (arbitrage du praticien, rendu en session le 2026-08-23)
- Domaine : doctrine produit — campagne Alliance 6.0-B (l'objectif à trois
  voix), proposition d'objectif négocié
- Fonde : la campagne `2026-08-23-alliance-objectif-trois-voix` (LOT-00)

**Contexte.** La campagne 6.0-A a livré le dossier à deux voix : l'objectif
négocié se rédige au cockpit (`objectifs_negocies`, append-only), le patient
le ratifie ou le conteste au portail (`ratifications_objectif`). `D-093` a
constaté qu'aucun objectif n'existe encore en production — sans objectif,
rien à ratifier. La campagne 6.0-B fait de Wellneuro une **force de
proposition** sur cet objectif, et la présente décision en fixe le régime
avant qu'aucun code n'existe. Fait de périmètre : tous les patients actuels
sont des bêta-testeurs réels et informés (Wellneuro leur a été présenté
comme en phase de test) — la surface s'ouvre à tous les dossiers courants,
sans lever `D-093`, dont la raison (classement non signé) est étrangère au
statut de testeur.

**Décision — le principe.** Une proposition d'objectif est un **assemblage
de fragments qui portent chacun leur provenance**. La machine ne rédige
jamais un texte d'objectif : elle cite. Un fragment sans source est
**inconstructible** — c'est un invariant de type, pas une validation. Le
champ `enoncePatient` reste inviolable : il ne se pré-remplit que par
**citation verbatim** de ce que le patient a écrit, marquée comme citation
avec sa source.

**Décision — les cinq arbitrages.**

1. **Sources admissibles d'un fragment**, liste fermée à trois entrées :
   les mots écrits du patient à l'anamnèse (`motif_principal`,
   `objectif_prioritaire`, `attentes` — verbatim, jamais paraphrasés) ; la
   restitution d'instrument certifié (plainte dominante `Q_MOD_03`, bande
   restituée) ; les candidats signés de la chaîne C1 avec leurs textes
   `LIMITATION_*` et le SHA du périmètre signé. Toute extension de cette
   liste est une décision `D-xxx` nouvelle.
2. **« Le dire autrement » est une table d'événement propre**, pas un
   élargissement du CHECK de `ratifications_objectif` : un amendement porte
   un texte, une ratification n'en porte pas — les fusionner affaiblirait
   les deux objets. Même régime que la ratification pour le reste :
   append-only, écrivain unique au portail, version exacte référencée,
   jamais compté ni noté.
3. **Au plus TROIS propositions simultanées**, affichées dans l'ordre des
   candidats C1 mais **sans numérotation ni mise en avant de la première** :
   l'ordre des candidats n'est couvert par aucune ligne signée (`D-093`), il
   ne doit pas se lire comme un classement. La levée de cette neutralité
   suivra la signature du classement, pas l'inverse.
4. **Déterministe d'abord.** Le moteur de proposition (LOT-02) n'emploie
   aucun LLM : assemblage pur, reproductible, caduc par hash des données
   sources. Un assemblage LLM éventuel sera une extension ultérieure, sur le
   modèle éprouvé de la synthèse (`Brouillon_Moteur`, invisible du patient
   avant reprise praticien), et exigera sa propre décision.
5. **Le module de proposition est DISTINCT du module objectif.** La garde G6
   (aucun import du moteur clinique dans le module objectif) reste intacte ;
   le module de proposition reçoit plainte dominante et candidats **en
   entrée** (sortie du cockpit), ne recalcule rien, n'importe pas
   `clinical-engine/`, et n'écrit jamais `objectifs_negocies` ni
   `ratifications_objectif` (garde G7). La reprise d'une proposition passe
   par la route praticien existante, enrichie du seul champ
   `sourcePropositionId`.

**Gouvernance du périmètre.** Drapeau neuf `WN_OBJECTIF_PROPOSE` (éteint à
la livraison, pose en production = geste du responsable) ; interrupteur de
repli `WN_OBJECTIF_PROPOSE_PATIENTS` (liste d'identifiants ; vide = tous les
dossiers) — un mécanisme de réversibilité, pas un périmètre par défaut.

**Ce que cette décision n'autorise pas.** Générer ou paraphraser la parole
d'un patient ; remettre quoi que ce soit au patient sans reprise praticien ;
modifier le classement, les textes `LIMITATION_*` ou `priorityRulesV1` ;
lever `D-093` ; compter, moyenner ou noter une parole (`DC-19`, `DC-24`).

### D-093 — Les recommandations élargies s'ouvrent en périmètre RESTREINT et OBSERVÉ, pas d'un coup

- Date : 2026-08-23
- Statut : accepté (arbitrage du praticien, rendu en session le 2026-08-23)
- Domaine : gouvernance clinique — recommandations élargies se réclamant de
  `priorityRulesV1` (chaîne C1, producteur de candidats)

**Contexte, et il porte une surprise.** Le gate d'Alliance 6.0-A — « aucune
recommandation élargie se réclamant de `priorityRulesV1` avant que la
ratification patient existe et soit constatée » — est levé : `D-092` l'a
constaté en production. Mais la vérification a montré que **ce gate n'a jamais
été un drapeau**. `tablePrioritesSignee()` rend `true` depuis la signature du
2026-08-15 (`D-061`) et sa re-signature du 2026-08-16 (`D-067`) ;
`chaineC1.ts:364` ne produit des candidats que sous ce verrou, qui est ouvert ;
`WN_ENABLE_ORIENTATION_NNPP2` est allumé. Le mécanisme est vivant. Le gate était
une **retenue de gouvernance**, et « activer » signifie ici : s'autoriser à s'en
réclamer.

**Ce qui est acquis.** La dette bloquante de `D-054` — la procédure d'abstention
hors du périmètre haché, ce que `DC-17` et `DC-26` interdisent — est **close**
par `D-062`, et la re-signature du 2026-08-16 couvre le périmètre complet.

**Ce qui ne l'est pas, et qui fonde cette décision.** Deux faits :

1. **Le CLASSEMENT n'est couvert par aucune ligne signée.** Le producteur de
   candidats, l'ordre de présentation (plainte dominante, puis priorité
   intrinsèque, puis identifiant) et les textes `LIMITATION_*` vivent dans
   `lib/clinical-engine/chaineC1.ts`, hors du SHA ; l'ordre d'évaluation des
   deux motifs d'abstention est dans le même cas, « mécanique, mais non relu »
   (bloc « À LIRE AVANT DE RE-SIGNER » de `priorityRulesV1.ts`). Or dans une
   recommandation élargie, c'est l'ordre qui décide de ce qui est proposé en
   premier.
2. **Aucun patient n'a encore répondu.** Les cinq tables de l'alliance sont
   vides. La capacité de contredire existe et est ouverte en production ; elle
   n'est pas exercée. Le gate demandait qu'elle existe — son intention était
   qu'elle **pèse**.

**Décision — périmètre restreint et observé :**

1. **Trois dossiers, et eux seuls** : `PAT006`, `PAT007`, `PAT017`.

   Désignés par leur **identifiant**, jamais par un nom ni une adresse.
   L'historique Git, les logs CI et les builds ne s'effacent pas : une identité
   écrite ici y resterait même retirée ensuite. C'est l'usage déjà établi du
   dépôt — l'état machine parle du « dossier de contrôle PAT006 », pas de la
   personne.

   Vérifiés en production le 2026-08-23, par lecture d'**identifiants seuls**
   (aucune adresse n'a transité — une requête par e-mail aurait déposé ces
   adresses dans les logs d'exploitation, où les commandes des conteneurs
   one-off sont recopiées telles quelles) : les trois sont **actifs**, suivi non
   clos, accès non révoqué.

   **Précondition à lever avant que l'observation puisse commencer** : au
   2026-08-23, aucun de ces dossiers ne porte d'objectif négocié — les cinq
   tables de l'alliance sont vides en production. Sans objectif, il n'y a rien à
   ratifier, donc la condition de sortie (a) ne peut pas se produire. Le
   praticien doit rédiger un objectif sur au moins un des trois pour que la
   fenêtre de six semaines ait un sens.
2. **Relecture praticien de CHAQUE recommandation avant remise** — aucune
   recommandation élargie ne part sans avoir été lue.
3. **La sortie du périmètre exige DEUX conditions, cumulatives** : (a) au moins
   **une réponse patient réelle** observée sur un objectif — ratification ou
   contestation, l'une vaut l'autre ; (b) un **bilan écrit** sur le classement
   des candidats tel qu'il s'est comporté sur ces dossiers.
4. **Borne de six semaines** (échéance : 2026-10-04). Passé ce délai sans les
   deux conditions, **le périmètre se referme** — il ne s'étend pas par défaut.
   Une absence de constat n'est pas un feu vert (`DC-24`, appliqué à la
   gouvernance).

**Ce que cette décision N'AUTORISE PAS** : la généralisation à d'autres dossiers,
l'envoi d'une recommandation élargie sans relecture, et toute modification du
classement ou des textes `LIMITATION_*` — qui demeurent hors périmètre signé et
relèvent d'une décision propre.

**Condition nommée de la généralisation ultérieure** : faire entrer le
classement, les textes `LIMITATION_*` et l'ordre d'évaluation des motifs
d'abstention dans un périmètre **signé**. Tant que ce n'est pas fait, aucune
généralisation ne peut se réclamer d'une provenance certifiée (`DC-01`,
`DC-26`).

- Conséquences : fragment
  `changelog.d/2026-08-23-activation-restreinte-recommandations-elargies.md`.
  Aucun code, aucun drapeau, aucune migration — le mécanisme était déjà vivant,
  c'est son usage qui est borné.

### D-092 — Le gate d'une campagne se constate sur la STRUCTURE, pas sur une ligne de production

- Date : 2026-08-22
- Statut : accepté (arbitrage du responsable, rendu en session le 2026-08-22)
- Domaine : gouvernance de campagne — sortie d'Alliance 6.0-A, préalable à
  l'activation élargie protocole→produits
- Numérotation : `D-091` a été pris par l'agenda du sommeil (#758) pendant ce
  lot. Un numéro se réserve dans `main`, jamais dans une branche.
- Contexte : le gate de la campagne exige que « la ratification patient existe
  et soit constatée » avant toute recommandation élargie se réclamant de
  `priorityRulesV1`. Le fichier de lot demandait ce constat « sur un dossier de
  test réel, lecture par identifiant, MCP ». Deux faits l'en empêchent :
  1. depuis le cutover du 2026-08-22, le MCP Supabase lit la base **gelée**,
     plus la production (`D-080`, `D-087`) — le constat serait cohérent et
     faux ;
  2. les trois drapeaux de la campagne sont **éteints** en production. Aucun
     patient n'a pu ratifier quoi que ce soit, et aucun ne le pourra avant que
     le responsable les pose. Exiger une ligne réelle subordonnerait la clôture
     de la campagne à un geste d'exploitation qui n'en fait pas partie.
- Décision : le gate se constate sur la **structure**, par lecture de la
  production depuis un conteneur `scalingo run -d` (`D-087`) :
  1. les cinq tables de l'alliance existent et portent leurs contraintes ;
  2. la route qui écrit la ratification existe, elle est unique, et une garde
     structurelle l'épingle ;
  3. **zéro ligne de ratification en production**, et le constat le DIT au lieu
     de le masquer — les drapeaux sont éteints, c'est la seule valeur attendue.
- Ce que la décision N'AUTORISE PAS : elle ne pose aucun drapeau, n'ouvre
  aucune surface, et n'active pas la recommandation élargie. Elle constate
  qu'un geste patient EXISTE et qu'il est atteignable dès l'ouverture ; le
  moment de l'ouverture reste au responsable, avec le piège `D-071` (poser la
  variable ne suffit pas, il faut un build qui la porte).
- **État du constat, à l'écriture de cette décision : NON EFFECTUÉ.** La
  décision fixe le critère, elle ne rapporte pas son résultat. Le CLI Scalingo
  ne s'authentifie pas par l'environnement (leçon du 2026-08-22, PR #751) : la
  lecture exigeait un `scalingo login` du responsable. Les points 1 et 2 étaient,
  eux, constatables sans la production.
- **CONSTAT EFFECTUÉ LE 2026-08-22, APRÈS L'ÉCRITURE DE CETTE DÉCISION.**
  Lecture de la production par conteneur one-off, sans lire aucune ligne
  patient : `ratifications_objectif` contient **zéro ligne**, et les quatre
  autres tables de l'alliance sont vides elles aussi. Le gate structurel est
  donc constaté. Consigné au paragraphe « Constat de clôture » de
  `docs/claude/campagnes/2026-08-21-alliance-dossier-deux-voix/CAMPAGNE.md`, qui
  fait foi. Cette ligne existe pour que le registre des décisions, lu seul, ne
  laisse pas croire que le gate est resté dû : les deux paragraphes ci-dessus
  décrivent deux moments, pas deux états contradictoires.
- **Ce que le constat ne dit pas** : `WN_COMPREHENSION` est posé à `true` en
  production depuis le 2026-08-22 — la surface patient du LOT-04 est donc
  OUVERTE, même si aucune synthèse n'y est publiée à ce jour.
  `WN_CE_QUI_COMPTE` et `WN_DOSSIER_DEUX_VOIX` restent absents. Le zéro
  constaté sur les ratifications s'explique par l'absence du troisième, pas par
  l'extinction des trois.
- Conséquences : clôture d'Alliance 6.0-A sur ce critère, fragment
  `changelog.d/2026-08-22-alliance-lot06-dossier-deux-voix.md`. Un constat
  d'usage réel — « au moins un dossier porte une ratification » — reste
  possible plus tard ; il appartiendra à l'exploitation, pas à la campagne.

### D-091 — Agenda du sommeil : compte de réveils exact, jamais d'horaires nocturnes

- Date : 2026-08-22
- Statut : accepté (**arbitrage du praticien**, rendu en session le
  2026-08-22)
- Domaine : instrument de recueil Q_SOM_09 (agenda du sommeil 21 nuits)
- Numérotation : `D-090` était réservé par le LOT-04 Alliance 6.0-A (garde de
  chemin sortant), alors non mergé — cette entrée a pris le numéro suivant et
  a atterri après lui.
- Contexte : le compte de réveils nocturnes plafonnait à « 3 ou plus »
  (contrat `agenda-sommeil-v2`) — un patient à six réveils par nuit était
  indiscernable d'un patient à trois, et la moyenne `AGD_REV_MOY` était
  bornée à 3 par construction. La demande initiale envisageait aussi le
  recueil des horaires de chaque réveil.
- Décision :
  1. Le compte devient **exact** (contrat `agenda-sommeil-v3`), borné par une
     borne de vraisemblance technique `NB_REVEILS_MAX = 20` — un chiffre
     technique, pas un seuil clinique. Sur une ligne v1/v2 déjà en base, la
     valeur 3 reste un PLANCHER (« 3 ou plus ») et n'est jamais
     réinterprétée — même doctrine que les classes d'éveil héritées.
  2. **Aucun horaire de réveil nocturne n'est recueilli** — option écartée :
     le Consensus Sleep Diary recueille compte + durée cumulée, et horodater
     supposerait que le patient regarde l'heure la nuit, la conduite que
     l'instrument évite (même doctrine que la latence en classes). Le WASO
     continue de venir de la durée cumulée déclarée.
  3. Le compte reste facultatif et hors de tout calcul structurel : l'indice
     /100 ne le voit qu'à travers l'efficacité, comme avant.
- Conséquences : saisie patient au compteur tactile (sans clavier), borne du
  pseudo-item `AGD_REV_MOY` alignée (0..20), fragment
  `changelog.d/2026-08-22-agenda-sommeil-compte-reveils-exact.md`.

### D-090 — Le régime d'une garde de chemin sortant suit le GESTE, pas le texte

- Date : 2026-08-22
- Statut : accepté
- Domaine : restitution sûre (Socle), surface patient, Alliance 6.0-A LOT-04

- Contexte : la carte des chemins sortants du Socle
  (`web/src/lib/documents/vocabulaire.ts`) porte trois régimes — journalisant,
  refus confirmable, refus dur — et note explicitement que leur alignement
  « est un arbitrage du responsable, non tranché ». Le LOT-04 ajoute le
  cinquième chemin de la carte, et le premier depuis le Socle : la synthèse de
  compréhension, écrite par le praticien et publiée au patient. Contrairement
  aux quatre précédents, ce chemin comporte **deux gestes distincts** — une
  publication (praticien) et un affichage (service) — que rien n'obligeait à
  ranger sous le même régime.

- Décision : le régime suit le **geste**, pas le texte. Un même objet peut
  donc porter deux entrées de carte. Concrètement, pour la synthèse de
  compréhension : **refus confirmable à la publication**, **journalisant au
  service portail**.

- Motif : un refus confirmable n'a de sens que s'il existe un humain pour
  trancher, au moment où il se produit. Il y en a un à la publication — le
  praticien, qui voit le terme relevé et choisit de reformuler ou de publier
  tel quel. Il n'y en a aucun quand le patient ouvre sa page : y bloquer
  afficherait une page d'erreur pour un texte que le patient n'a pas écrit et
  ne peut pas corriger. Le refus dur est écarté pour la même raison, aggravée :
  un faux positif du registre rendrait une synthèse légitime impubliable sur
  une surface de dialogue où le praticien choisit ses mots.

- Conséquences :
  - deux lignes ajoutées à la carte, avec leurs bancs de débranchement, **vus
    rouges** avant d'être déclarés verts ;
  - code d'événement neuf `PORTAIL_COMPREHENSION_REGISTRE_ANXIOGENE` ;
  - la question posée au praticien à la publication est rendue comme une
    **question**, pas comme une erreur, et sa confirmation est un **second
    geste distinct** de « publier » ;
  - cette décision ne modifie **aucun** des quatre régimes déjà en place ni
    aucun registre de termes (`RACINES_PRESCRIPTIVES`, `RACINES_ANXIOGENES`
    inchangées) — elle tranche une question que la carte laissait ouverte, elle
    ne réaligne rien.

- Corollaire posé explicitement à la revue : **il n'existe aucune
  dépublication**. Retirer au patient une synthèse déjà publiée n'est pas un
  geste que ce lot ouvre — publier engage, et corriger se fait en publiant une
  version qui corrige. La première rédaction produisait pourtant ce retrait
  sans le dire : elle servait au patient la *tête de chaîne* publiée, si bien
  qu'enregistrer un simple **brouillon** de révision faisait disparaître du
  portail la version publiée qu'il supplantait, et l'écran patient présentait
  ce retrait comme « votre praticien n'a encore rien publié » — une absence
  fabriquée, `DC-24` pris à revers. Corrigé : la ligne servie est la **publiée
  la plus récente**. Le filtre par tête n'apportait rien (une révision publiée
  est toujours plus récente) ; son seul effet propre était le défaut.

- Portée : ce lot ne relève ni du scoring ni d'une règle clinique. Aucun seuil,
  aucune dose, aucune borne clinique — les bornes posées (4 000 caractères,
  64 Kio de corps) sont techniques et identifiées comme telles (`DC-19`,
  `DC-20`).

- Référence : `docs/claude/campagnes/2026-08-21-alliance-dossier-deux-voix/lots/LOT-04-synthese-comprehension-desaccord.md`,
  `web/src/lib/documents/vocabulaire.ts`

### D-089 — Levée technique du gate G-TRUST-04, sous réserve unique : la signature de l'annexe HDS

- Date : 2026-08-22
- Statut : accepté (**décision du responsable du traitement**, rendue en
  session le 2026-08-22, en fin de la journée qui a exécuté le cap `D-085`)
- Domaine : sécurité, hébergement, gate `G-TRUST-04`

- Contexte : au soir du 2026-08-22, l'état du code a rejoint les exigences.
  Ligne par ligne : **2/4** purge appliquée et vérifiée §C sur les deux
  bases ; **3** sans objet (mono-praticien, condition de réouverture
  écrite) ; **5** ✅ (947 accès journalisés, preuve comportementale) ;
  **6** ✅ (procédure exercée, registre physique ouvert, runbook Scalingo
  livré) ; **7** ✅ (revue de sécurité jouée — 0 H, 2 M, 1 L — constats
  triés ET corrigés le jour même, correctifs passés en revue adversariale).
  Ligne **1** : service et données sont rendus par un hébergeur certifié
  HDS (Scalingo, certificat LNE 38436) depuis le cutover — **mais l'annexe
  HDS n'est pas signée** et Vercel/Supabase restent en décommissionnement
  jusqu'au 2026-09-01 (`D-080`).

**La décision.** Le gate `G-TRUST-04` est **levé techniquement le
2026-08-22, au vu de l'état du code**, avec une **réserve unique et
nommée** : la signature de l'annexe HDS — une question de jours selon le
fournisseur, et que le responsable s'engage à constater levée **au plus
tard à la date fixée du décommissionnement (2026-09-01, `D-080`)**. La
dérogation du 2026-07-21 (bornée au 2026-10-21) est **remplacée** par cette
levée sous réserve ; si la réserve n'était pas levée au 2026-10-21, cette
date redevient un point de contrôle.

**Ce que la réserve retient encore, et rien d'autre** : aucune affirmation
contractuelle d'hébergement HDS face au patient tant que l'annexe n'est pas
signée (le centre d'information reste factuel). Tout le reste est
fonctionnel. La biologie réelle reste hors produit par choix de roadmap
(Phase C), plus par le gate.

**Traçabilité** : `GATES_GO_NO_GO.md` (registre, ligne 11) porte le nouveau
statut ; `CHECKLIST_ACTIVATION_G_TRUST_04.md` reste le dossier de preuve ;
la dette `D-TRUST-03` est refermée sur ce périmètre (sa part multi-praticien
vit dans la condition de réouverture de l'exigence 3, `D-085`).

**Suivi (2026-08-31, `D-121`)** : annexe HDS signée le 2026-08-30 — la
réserve est levée dans le délai fixé, le gate est définitivement clos.

### D-088 — Une famille d'instruments du cabinet qui pilote sans classer : la garde de grille complète est relâchée pour elle seule, contre une garde anti-seuil plus stricte

- Date : 2026-08-22
- Statut : accepté (**arbitrage du responsable**, rendu en session le
  2026-08-22 — plan du LOT-05 de la campagne Alliance 6.0-A)
- Domaine : clinique, instruments du cabinet, validation `@/lib/instruments`

- Contexte : une EVA (échelle visuelle analogique) est un instrument de
  **pilotage** : le praticien lit une valeur et une trajectoire, il ne lit pas
  une catégorie. La voie `CabinetInstrument` existante ne pouvait pas la
  porter : `validerInstrumentCabinet` exige de tout instrument une grille
  d'interprétation de 1 à 6 bandes, contiguës et couvrant tout l'intervalle de
  score. Une EVA n'y entrait qu'au prix d'une bande inventée — exactement ce
  qu'interdisent `DC-19` et `DC-20`.

**1. La garde de couverture est relâchée pour UNE famille déclarée, et pour
elle seule.** Un quatrième type de scoring est admis à l'entrée :
`sum_no_interpretation`. Les trois familles qui concluent (`sum`,
`sum_reversed`, `count_threshold`) sont **inchangées, au caractère près** —
grille obligatoire, bandes 1..6, contiguïté, couverture, items `likert` à 2..8
options. Leurs bancs existants sont verts sans modification.

**2. La contrepartie est une garde inverse, plus stricte : aucune bande.** Sur
cette famille, une bande — **une seule, même « neutre », même « à définir »** —
est refusée par la validation, aux **cinq** points d'appel (création, import,
demande de relecture, publication, édition). C'est la garde anti-seuil du lot :
elle mord aussi sur la bande d'attente `« Grille à définir — relecture
requise »` — un libellé d'attente coloré `warning` sur un instrument qui ne
classe pas est un verdict de fait.

**2 bis. La garde anti-bande-par-défaut : deux sites actifs, un défensif.** Dit
tel quel pour ne pas faire croire à une couverture plus large qu'elle n'est.
**Actifs** : `validerInstrumentCabinet` (refuse toute bande, d'où qu'elle
vienne) et l'amorce de l'éditeur (`BibliothequePanel`, qui refuse la famille au
lieu de lui poser sa bande d'attente). **Défensif** : le paramètre
`typeDemande` de `scoringParDefaut` — la garde y est câblée, mais **aucun
appelant ne le passe** : les trois appels de l'import sont sans second
argument, et n'ont lieu que lorsque `scoring` est absent, cas où aucune famille
n'est déclarable. Ce chemin est donc inatteignable en l'état. Ce qui couvre
réellement « items `number`, grille absente » est un **refus dédié de
l'import** (« Saisie chiffrée sans grille déclarée… »), qui nomme le geste
attendu au lieu de servir les messages de la famille par défaut (« seul
“likert” est admis », « entre 2 et 8 options ») — deux reproches exacts dont
aucun ne dit quoi faire. Fail-closed inchangé : c'était un 400, c'est un 400.

**3. Le moteur de scoring n'a pas bougé d'une ligne.** `sum_no_interpretation`
existe déjà dans `web/src/lib/questions.ts` (servi par `Q_PED_01` — Échelle de
Matinalité-Vespéralité Enfant, `questions.ts:939` — et `Q_MOD_02`,
`questionnaires/mode-de-vie.ts:140` ; `Q_MOD_01`, lui, est de type `subscore`)
et rend `interpretation: null`. Aucune modification du
moteur, aucune migration Prisma : les colonnes `definitionJson` /
`scoringJson` suffisent. La saisie patient réutilise l'item `number` borné
(`min`/`max`/`unit`) déjà rendu par `QuestionField` et déjà gardé côté serveur
par `api/patient/submit` — pas de composant curseur neuf.

**4. Provenance : assumée, jamais fabriquée.** Un instrument de cette famille
est un **instrument de pilotage, sans provenance clinique** : il n'a ni source,
ni population déclarée, ni cut-off, et il n'en réclame aucun puisqu'il ne
conclut pas. Il reste privé au cabinet, non certifié (« Cabinet — scoring non
vérifié »), et passe par le cycle complet `brouillon → grille_a_relire →
valide` comme tout instrument du cabinet — ce qui se relit n'est plus la
grille, mais l'énoncé et ses ancres.

**4 bis. Ce que vaut le total d'un instrument multi-items — cadrage, non
tranché.** Le moteur somme les items, et cette somme est servie comme
`scorePrincipal`. Sur cette famille, **ce total est une somme brute sans
portée clinique** : additionner « fatigue 7/10 » et « douleur 3/10 » donne 10,
qui ne mesure rien — aucune source ne pondère ces axes, et cette famille ne
conclut par construction pas. **Ce qui se lit est la valeur par item**, jamais
le total. L'alternative — **contraindre cette famille à un seul item par
instrument**, ce qui rendrait le total non ambigu — **reste ouverte à
l'arbitrage du responsable** : elle n'est pas tranchée ici, et le validateur
n'impose donc aucune limite de nombre d'items au-delà du plafond commun.

**5. Réserve fermée par banc : la complétude.** Le moteur
`sum_no_interpretation` n'émet **ni `missing` ni `repondus`** (contrairement à
`sum`). Sur cette famille, la complétude d'un recueil n'est donc tenue que par
la garde de `api/patient/submit` — et par rien d'autre, les bandes qui la
tiennent ailleurs n'existant pas ici. Un banc l'asserte explicitement (recueil
partiel d'un instrument de cette famille → 400, aucune persistance, aucun
verrouillage) et rougit au débranchement de cette garde.

- Conséquences : `TYPES_SCORING_CABINET_ADMIS`, union discriminée
  `ScoringCabinet`, garde nommée `interditTouteBande` (module feuille
  `@/lib/echelles-cabinet`, lue aussi par le panneau client) ; l'éditeur de
  questionnaire **refuse** cette famille au lieu de lui poser une amorce de
  bande (il ne sait écrire que des likert et des bandes, il la détruirait) ;
  l'entrée se fait par import JSON (shape complète). Restitution inchangée et
  assertée : `interpretation` nulle en base, `—` sur la fiche patient,
  mini-synthèse vide.
### D-087 — L'écriture du schéma de production passe par un one-off Scalingo approuvé ; le postdeploy ne migre plus

- Date : 2026-08-22
- Statut : accepté (**décision du responsable**, rendue en session le
  2026-08-22 — « repointer `MIGRATE_DATABASE_URL` du workflow release-db vers
  Scalingo » — puis **confirmée par arbitrage explicite le même jour**, face
  au régime de `D-086` : « porte release-db »)
- Domaine : hébergement HDS, gouvernance des migrations, workflow `release-db`
- Rapport à `D-086` : les deux décisions sont nées le même jour, dans deux
  sessions parallèles, du même incident. `D-086` reste le constat exact du
  **régime transitoire** — le postdeploy migre au merge tant que le drapeau
  n'est pas posé — et son §3 (vérification par one-off, jamais par le MCP
  Supabase) demeure. **Ses §1-2 sont supplantés par la présente décision** :
  le gate humain redevient l'approbation `release-db` dès la pose du drapeau,
  et le « repointage » du §2 est matériellement impossible — la base HDS
  n'étant pas exposée à Internet, aucune URL posée chez GitHub ne peut
  l'atteindre ; le one-off en est l'implémentation réelle.

- Contexte : constat fait le jour même sur la purge #746 — le secret
  `MIGRATE_DATABASE_URL` n'avait jamais été repointé au cutover (`D-080`) :
  le workflow appliquait ses migrations **sur Supabase**, la porte
  d'approbation protégeait la mauvaise base, pendant que la production réelle
  (Scalingo) migrait au `postdeploy`, **sans porte**. La règle « écriture
  uniquement par migration relue via release-db » (CLAUDE.md) était fausse en
  fait.

**Le modèle décidé.** La base HDS n'étant pas exposée à Internet, le
repointage n'est pas un échange d'URL : **aucune URL de base ne transite
plus par GitHub**. Le job `release` exécute les préflights et
`migrate deploy` **en one-off dans l'image de production** via le CLI
Scalingo (secret `SCALINGO_API_TOKEN`) ; le `postdeploy` ne migre plus quand
`WN_MIGRATIONS_PAR_RELEASE_DB=1` est posé (production seule — le staging
garde l'auto-migration). L'approbation humaine de `release-db` redevient
l'unique porte d'écriture du schéma.

**Les gardes qui rendent l'approbation vraie** (durcies par revue
adversariale le jour même) : le commit approuvé doit être **le dernier
déploiement réussi**, et l'**empreinte des migrations** du commit approuvé
est re-vérifiée **dans le conteneur** au moment d'écrire — un déploiement
plus récent ne peut pas faire partir de migrations que personne n'a
approuvées. Sentinelles de sortie **liées au run** (`id=`), drapeau de
gouvernance **constaté** à chaque release (`env-get`), jeton borné aux
étapes qui parlent à Scalingo, CLI épinglé par version et empreinte. Seule
l'URL injectée par l'add-on est acceptée dans le one-off —
`MIGRATE_DATABASE_URL` y est ignorée à dessein.

**Contreparties assumées, et écrites** : le filet « postdeploy en échec =
déploiement annulé » disparaît sous le drapeau — l'ordre devient « code
d'abord, migration après approbation » (ADD derrière drapeau éteint, DROP =
retour arrière par restauration de base) ; un redéploiement d'un slug
antérieur au 2026-08-22 ré-active l'auto-migration ; `import-cb` est **hors
service** jusqu'à sa réécriture avec la Phase C. Séquence de mise en service
et régime établi : `docs/DEPLOIEMENT_RELEASE_DB.md`.
### D-086 — Le chemin de release des migrations après le cutover : le gate humain est le merge

- Date : 2026-08-22
- Statut : accepté (**arbitrage du responsable**, rendu en session à
  l'ouverture du LOT-01 Alliance 6.0-A)
- Contexte : depuis le cutover Scalingo (2026-08-22 ~04:05), l'app de
  production `wellneuro` auto-déploie `main` (lien GitHub constaté à la CLI)
  et son hook `postdeploy` (`web/Procfile` → `web/scripts/db-deploy.sh`)
  applique les migrations **au merge** — avant toute approbation `release-db`.
  Le secret `MIGRATE_DATABASE_URL` de l'environnement `release-db`, inchangé
  depuis le 2026-08-05 (métadonnées GitHub), pointait encore la base Supabase
  gelée : un run aurait rendu vert sur une base condamnée au 2026-09-01
  (`D-080`), et la vérification MCP — qui lit cette même base — aurait
  confirmé ce faux vert. Boucle cohérente et entièrement fausse.
- Décision :
  1. **Le gate humain d'une migration est la revue (`wn-reviewer`) + le go
     explicite du responsable AVANT merge.** L'approbation `release-db`
     subsiste (required reviewers + wait timer, vérifié à l'API) mais **ne
     garde plus la première écriture** — le `postdeploy` l'a déjà faite au
     merge ; une PR de migration le dit en tête et ne se merge jamais sans
     ce go.
  2. Le responsable **repointe `MIGRATE_DATABASE_URL` vers la base Scalingo**
     (geste hors dépôt, avant le 2026-09-01) ; `release-db` devient une
     **seconde application idempotente** avec ses préflights — conservé, pas
     démantelé.
  3. La **vérification post-release** se fait depuis un conteneur one-off
     Scalingo (`scalingo run -d`), plus jamais par le MCP Supabase
     `execute_sql`, qui lit la base gelée.
- Conséquences : `CLAUDE.md` (règle non négociable base de production),
  `.claude/rules/db-prisma.md` et `docs/DEPLOIEMENT_RELEASE_DB.md` sont
  alignés par la PR du LOT-01 Alliance. Les deux runs `release-db` en attente
  du 2026-08-22 (pushes `D-044`) visent la base gelée — leur sort est un
  geste du responsable, hors de cette décision.

### D-085 — Revue G-TRUST-04 : cinq arbitrages du responsable pour ne laisser ouverte que l'exigence 1

- Date : 2026-08-22
- Statut : accepté (**arbitrages du responsable du traitement**, rendus en
  session le 2026-08-22, lors de la reprise de revue post-cutover)
- Domaine : sécurité, hébergement, gate G-TRUST-04

- Contexte : la revue post-cutover (PR #744) laissait sept exigences
  partielles. Le responsable fixe le cap : régler les exigences 2 à 6
  aujourd'hui et confier la 7 à une revue, pour qu'il ne reste que
  l'exigence 1 — dont la fermeture est déjà datée (annexe HDS +
  décommissionnement du 2026-09-01, `D-080`).

**1. Exigence 3 — sans objet, avec condition de réouverture.** WellNeuro est
mono-praticien de fait et de choix : un seul compte praticien (le
responsable). Une exigence d'isolation multi-praticien n'a pas d'objet dans
ce périmètre. **Condition de réouverture écrite** : l'exigence se rouvre
telle quelle, et redevient bloquante, avant toute création d'un second compte
praticien — avec le test d'isolation réel qu'elle exigeait. La garde 30/33
routes reste en place comme défense en profondeur ; rien n'est démonté.

**2. Exigence 5 — tenue pour satisfaite.** Piste d'audit branchée sur les
22 routes GET « dossier nommé », preuve fonctionnelle produite le 2026-08-22
(947 accès, 99 post-bascule), lecture par requête. L'absence d'écran de
consultation est un choix documenté (GD-3), pas un manque.

**3. Exigence 6 — réglée par arbitrage, à un livrable près.** La procédure de
violation, écrite ET exercée sur table, suffit ; la confirmation par un
conseil qualifié sort du gate et devient la dette `D-TRUST-10` (échéance
2026-T4, avec `D-TRUST-02`). Le **registre physique des violations est
ouvert le 2026-08-22**, tenu hors dépôt par le responsable (EX-3 soldé).
Reste un livrable commandé ce jour : le runbook réécrit pour Scalingo.

**4. Exigence 7 — confiée à la revue Codex.** La revue de sécurité sera
réalisée par Codex, pilotée par le responsable (bloc de paramètres préparé
par l'assistant, lancement manuel — jamais d'appel automatisé). **Sa nature
est dite** : revue automatisée par un second modèle, pas un test d'intrusion
humain externe ; l'exigence se ferme quand la revue est jouée et ses
constats triés.

**5. Exigences 2/4 — purge ordonnée.** La suppression des trois colonnes
dormantes `access_token*` (PR 2 annoncée par #397) est **explicitement
demandée** : migration Prisma sous protocole §C (revue adversariale avant,
vérification prod après), bascule du helper E2E vers le lien magique. La
révocation de remplacement existe déjà (`sessionsInvalidesAvant`). La purge
complète s'achève au décommissionnement (effacement de la copie Supabase,
`D-080`).

> **Correction de fait, même jour (cadrage de la migration)** : le périmètre
> réel est **deux colonnes** — `access_token` et `access_token_created_at`.
> `access_token_revoked` n'est pas dormante : c'est le drapeau **vivant** de
> révocation du portail (posé par la route praticien `token`, honoré aux
> trois entrées et par `isSessionValideForPatient`) — il reste. La checklist
> disait « trois », le code disait deux ; le code fait foi. Même sort pour la
> « bascule du helper E2E vers le lien magique » ordonnée ci-dessus : **sans
> objet** — acquise de fait depuis LOT-04 (le jeton n'ouvrait plus rien, les
> specs entrent par cookie signé) ; le helper cesse simplement d'écrire un
> jeton mort (revue de la PR de purge, constat M-2).

### D-084 — Arbitrages post-revue de D-082 : la signature vaut provenance, le corpus rejoint le régime `shaPerimetre`

- Date : 2026-08-22
- Statut : accepté (**arbitrages du responsable**, rendus en session le
  2026-08-22 — questions 3 et 4 de la revue adversariale de `D-082`)
- Domaine : clinique, synthèse IA, `corpusSyntheseV1.ts`

- Contexte : la revue adversariale de la signature (`D-082`) laissait deux
  questions au responsable. Question 3 : « la relecture a-t-elle porté sur une
  source SIIN identifiable (notebook, version) qu'on pourrait épingler, ou la
  signature vaut-elle provenance à elle seule ? ». Question 4 : « faut-il
  ouvrir un `shaPerimetre` sur cette table, maintenant qu'elle est la seule
  signée sans ancrage ? »

**1. La signature vaut provenance.** La relecture du 2026-08-22 a porté sur le
texte du corpus lui-même — rédigé au dépôt le 2026-07-10 (`11c5744c`), sans
document source SIIN épinglé. « SIIN » au titre désigne l'école
méthodologique du praticien, pas un document ; le texte ne porte aucun seuil,
dose ni borne chiffrée (constaté en revue, `D-082`). Si un document source
identifiable est épinglé un jour, il s'ajoutera par **nouvelle version** du
corpus — jamais par retouche du texte signé.

**2. Le corpus rejoint le régime `D-067`.** `shaPerimetre` épinglé au littéral
(`19a55478…`, recalculé le jour même — identique au SHA consigné en `D-082`),
et le verrou d'activation de `lib/anthropic.ts` devient auto-portant : flag
**ET** signature **ET** date ISO canonique **ET** concordance du SHA de
périmètre. Une retouche de la prose signée ferme le corpus en production toute
seule (fail-closed), au lieu de seulement rougir le banc d'empreinte. Contenu
inchangé au caractère près : le jour de signature (2026-08-22, `D-082`) reste
le fait attesté — précédent `orientationRulesV1`/`D-067`.
### D-083 — L'en-tête d'`orientationRulesV1` cesse d'annoncer un pipeline qui n'a jamais existé

- Date : 2026-08-22
- Statut : accepté (**go du responsable en session** le 2026-08-22, texte de
  remplacement proposé puis validé ; Socle LOT-02)
- Domaine : clinique, documentation d'une table signée,
  `orientationRulesV1.ts`

- Contexte : depuis le 2026-08-03, l'en-tête affirmait que la table « est
  régénérée par `tools/corpus/orientation/` (lot 9) » — un compilateur qui
  n'a **jamais existé** (audit doctrine §E, constat du 2026-08-11 ; `D-042`
  a posé un banc de fraîcheur des claims en **compensation**, sans ordonner
  la correction du commentaire). Une provenance décrite fausse est pire
  qu'une provenance absente (`DC-01`, `DC-02`).

**1. Ce que la décision pose.** Le commentaire d'en-tête — et lui seul — est
réécrit : la table est **écrite à la main**, du code versionné relu en PR ;
ses claims justificatifs sont réels, validés dans l'Atelier corpus
(barrière `D-003`), et leur fraîcheur est tenue par le banc de `D-042`.
L'en-tête nomme sa propre période mensongère (2026-08-03 → 2026-08-22) —
la trace ne s'efface pas, elle se date.

**2. Ce que le geste a mesuré.** Le sha épinglé
(`SHA_SIGNE_2026_08_06`, discipline `D-018`) couvre
`sha256(JSON.stringify(ORIENTATION_RULES_V1))` — **les données de la
table, pas le texte du fichier** : la suite clinique est restée verte
(61/61) sans ré-épinglage, contrairement à ce que le cadrage du Socle
annonçait. Aucune règle, aucun seuil, aucun claim modifié — le diff est
un commentaire.

**3. Garde posée dans le même lot.** Le fichier est désormais au niveau
« demande » du hook d'écriture (`protect-wellneuro-files.mjs`, Socle
LOT-02) : cette édition-ci a été la première à passer par la confirmation
en session que le hook matérialise.

- Référence : `web/src/lib/clinical/orientationRulesV1.ts` (en-tête),
  `docs/claude/doctrine/AUDIT_DOCTRINE_CHAINE_T0.md` §E, [[D-042]],
  [[D-018]], [[D-003]], campagne
  `docs/claude/campagnes/2026-08-21-socle-restitution-sure/` (LOT-02).

### D-082 — Le corpus de synthèse est signé : validation clinique du responsable, contenu inchangé

- Date : 2026-08-22
- Statut : accepté (**acte clinique du responsable**, rendu en session le
  2026-08-22 après relecture intégrale du corpus affiché)
- Domaine : clinique, synthèse IA, `corpusSyntheseV1.ts`

- Contexte : dernière table clinique non signée du dépôt
  (`validationExterne: false` depuis sa création). Son contenu : 32 lignes
  (1 966 caractères) de cadre méthodologique pour le prompt de synthèse —
  prudence clinique, axes d'analyse, heuristiques de croisement, règles de
  formulation (« hypothèse à explorer », jamais de causalité affirmée).
  Aucun seuil, aucun dosage, aucune borne chiffrée. Intégrité vérifiée en
  revue par empreinte
  (`sha256 = 19a554786075d608db033c7354b720f8b35ed6e1889ae5595979b75ce2f68fee`).

**1. Ce que la décision pose.** Le responsable valide cliniquement le corpus
**tel quel** — pas un caractère du contenu ne change — et la métadonnée
passe à `validationExterne: true`, datée du 2026-08-22. Le verrou de
signature est ouvert ; le deuxième terme du ET
(`WN_ENABLE_CORPUS_CLINIQUE_V1=1`) se pose en production **après** le
déploiement qui porte la signature, comme geste d'exploitation daté —
l'ordre « validation d'abord, flag ensuite » de `FEATURE_FLAGS.md` est
respecté à la lettre.

**2. Ce que ça allume, et ce dont ça dépend pour rester borné** (leçon de
`D-065`) : le corpus est injecté dans le prompt de synthèse — il **cadre**
la formulation, il ne décide rien. La couche déterministe garde la main
(DC-02) ; la synthèse reste un brouillon soumis à validation praticien avant
tout envoi, et ce frein-là est structurel, indépendant du drapeau.

### D-081 — Les derniers freins non cliniques tombent : recherche corpus ouverte, gate `WN_CB_RESULTS_ENABLED` requalifié

- Date : 2026-08-22
- Statut : accepté (**décision du responsable**, rendue en session le
  2026-08-22 — « lever ces derniers freins »)
- Domaine : feature flags, hébergement HDS

- Contexte : après la bascule Scalingo (`D-080`), le responsable demande que
  plus aucun gate non clinique ne freine le produit. L'inventaire du
  2026-08-22 n'en trouvait que trois ; deux sont non cliniques et relèvent de
  cette décision, le troisième (signature de `corpusSyntheseV1`) est un acte
  clinique distinct.

**1. `WN_RECHERCHE_CORPUS_ENABLED` est posé en Production** (Scalingo,
2026-08-22) : la recherche corpus clinique (rayons cognition, douleur,
intestin) ouvre. C'était un choix produit, il est levé.

**2. Le gate dur `WN_CB_RESULTS_ENABLED` est requalifié.** Sa doctrine
(« ne jamais passer à true avant l'attestation HDS ») visait un monde où les
données résidaient hors HDS. Depuis la bascule, la base EST chez un hébergeur
certifié ; après le décommissionnement (`D-080`, 2026-09-01), elle n'aura
plus d'autre résidence. La condition devient : **hébergement HDS effectif et
exclusif** — satisfaite au décommissionnement, sans attendre l'annexe. Le
drapeau reste **absent** tant qu'aucun code ne le lit (il n'a aucun appelant
à ce jour) ; sa pose accompagnera le code de la Phase C, comme geste
d'exploitation daté.

### D-080 — Fenêtre de stabilité de dix jours, puis décommissionnement inconditionnel de Vercel/Supabase

- Date : 2026-08-22
- Statut : accepté (**décision du responsable**, rendue en session le
  2026-08-22, texte proposé par l'assistant et validé tel quel)
- Domaine : hébergement, HDS, campagne `2026-08-18-echeance-hds-g-trust-04`

- Contexte : la bascule Scalingo est faite — données réelles chargées le
  2026-08-22 à 03:24 CEST, service basculé par cutover DNS le même matin
  (`app.wellneuro.fr` → `wellneuro.osc-fr1.scalingo.io`). `D-078`
  subordonnait le décommissionnement de Vercel/Supabase à la signature de
  l'annexe HDS, toujours pendante (demandée le 2026-08-12, relancée le
  2026-08-19, sans réponse).

**1. Ce que la décision pose.** Une **fenêtre de stabilité de dix jours**
court jusqu'au **2026-09-01**. À son terme, si la production Scalingo est
restée saine, **Vercel et Supabase sont décommissionnés, que l'annexe HDS
soit signée ou non** — la subordination posée par `D-078` est levée à cette
date.

**2. Motifs.** Le filet de rollback court perd sa raison d'être après dix
jours de production stable ; et l'effacement des copies hébergées **hors
HDS** réduit l'écart d'hébergement plutôt qu'il ne l'aggrave — après
décommissionnement, les données de santé ne résident plus que chez un
hébergeur certifié.

**3. Ce qui ne change pas.** La **preuve d'effacement écrite** au registre
RGPD reste obligatoire (critère de done du LOT-02) ; l'annexe HDS reste
poursuivie — elle demeure la sortie « par le haut » de la revue ; la **revue
du 2026-10-21** demeure. Le décommissionnement reste un geste du responsable,
avec sa confirmation au moment de l'étape.

### D-079 — Le SHA fait foi : une re-signature sans changement de contenu ne périme aucune lettre

- Date : 2026-08-20
- Statut : accepté (**décision du responsable**, rendue en session le
  2026-08-20, sur question posée par la revue du LOT-01)
- Domaine : biologie, provenance des courriers, verdict d'ancrage

- Contexte : le LOT-01 de la campagne `2026-08-18-biologie-consolidee` ouvre le
  chemin de lecture des colonnes d'ancrage de [[D-073]] — le fil dit si l'ancre
  d'une lettre **concorde** avec la table d'indications courante. La revue
  `wn-reviewer` a montré que le terme de version ne détecte pas ce qu'un
  commentaire lui prêtait, et a posé la question restée sans réponse : **une
  re-signature de la table qui bumperait sa version sans toucher aux règles
  doit-elle périmer les lettres antérieures ?**

**1. Ce que la décision pose.** Non. **Le SHA fait foi.** Une lettre dont le
contenu de référence n'a pas bougé reste **concordante** : ce qu'elle dit du
patient est toujours adossé aux mêmes règles, et la péremption doit signaler un
écart de **fond**, jamais un acte administratif. La version reste un
descripteur de provenance, pas une garde.

**2. Ce que la décision ne change pas.** Rien au comportement : le code
l'implémentait déjà, sans que la sémantique soit écrite. `courrier.ts` estampe
un littéral en dur qu'un bump de `INDICATIONS_BIOLOGIE_METADATA.version`
n'atteint pas ; le verdict reste `concordante`. Cette décision **écrit ce que
le code fait**, pour qu'un futur relecteur ne prenne pas l'écart pour un oubli
et ne « corrige » pas dans l'autre sens.

**3. Ce que le terme de version garde encore, et qui reste utile.** Il détecte
la divergence entre ce qui est **estampillé** et ce qui est **comparé** — deux
littéraux qui n'ont aucune raison de différer. Un banc de
`correspondance-medecin/route.test.ts` confronte les trois porteurs (métadonnée,
estampille, comparaison) et rougit si l'un bouge : la garde survit, elle change
seulement de motif.

**4. Ce que la décision n'autorise pas.** Elle ne dispense pas d'un examen si
une re-signature future **change les règles** : là, le SHA bouge, et les lettres
antérieures sont **périmées** — c'est le comportement voulu. Elle ne modifie
aucune table signée et n'ouvre aucune migration.

### D-078 — Le gate G-TRUST-04 est levé par arbitrage du responsable, et la migration Scalingo est engagée sans attendre l'annexe HDS

- Date : 2026-08-19
- Statut : accepté (**décision du responsable de traitement**, rendue en session
  le 2026-08-19, après exposé des constats ci-dessous)
- Domaine : hébergement, conformité HDS/RGPD, gouvernance des gates

- Contexte : l'arbitrage que la campagne `2026-08-18-echeance-hds-g-trust-04`
  devait porter à son LOT-01 est rendu par anticipation. Motif invoqué par le
  responsable : **le gate bloque trop le développement**. État des deux
  conditions dures de [[D-006]] au moment de la décision — **(b) levée** par
  écrit le 2026-08-11 ([[D-047]]) ; **(a) ouverte** : l'annexe HDS a été
  demandée le 2026-08-12 et relancée le 2026-08-19, sans réponse à ce jour.

**1. Ce que la décision fait.** Le gate **G-TRUST-04 est levé**. Les
fonctionnalités qu'il retenait deviennent activables — étage 2 du rayon
biologie (résultats réels, `WN_CB_RESULTS_ENABLED`) et messagerie D5 — et la
**migration totale vers Scalingo est engagée**, sans attendre la signature de
l'annexe HDS.

**2. Ce que la décision N'EST PAS, et il faut l'écrire.** Ce n'est **pas une
mise en conformité**, et elle ne lève aucune des exigences qu'elle contourne.
Six des sept exigences du gate restent **partielles** et la première reste
**non satisfaite** ; la checklist d'activation continue de faire foi sur leur
état réel. Comme la décision du 2026-07-21 dont elle prend la suite, celle-ci
est un **écart assumé, daté et consigné** — et c'est ce qui la rend
défendable : elle établit que le responsable savait, et depuis quand.

**3. Le point que la décision accepte sciemment.** Scalingo écrit, le
2026-08-11 : « l'annexe HDS distincte doit être signée séparément pour activer
l'option HDS ; l'acceptation des conditions générales seule ne suffit pas ».
L'annexe n'est donc pas une pièce à enregistrer après coup : sa couverture
court **à partir de la signature**. Entre la bascule et cette signature, les
données réelles se trouvent dans le seul endroit couvert **ni** par la
dérogation en vigueur — qui vise l'implantation Vercel — **ni** par une option
HDS active. Sur ce point précis, et pour cette fenêtre seulement, la posture
est **moins couverte qu'avant la migration**. Le responsable en a été informé
avant de trancher et maintient son choix.

**4. L'ordre imposé de [[D-006]] est explicitement écarté** pour sa condition
(a). L'ordre reste écrit au registre, et [[D-047]] reste vraie ; c'est leur
application qui est suspendue par le présent arbitrage, non leur contenu. La
condition (b) n'est pas écartée — elle est **satisfaite**.

**5. Ce qui reste dû, et n'est pas emporté par la levée.**
- **Signer l'annexe HDS et archiver les deux pièces dès réception** — le
  LOT-01 de la campagne HDS reste ouvert sur ce seul objet, la relance est
  partie le 2026-08-19.
- **L'information des personnes** sur l'écart d'hébergement, dont l'échéance
  au tableau §14 de `docs/DOSSIER_RGPD.md` est « au plus tôt », donc **déjà
  échue** — et que la présente décision rend plus exigeante, non moins.
- Les autres trous du tableau §14, inchangés (AIPD, base légale, pentest,
  registre des violations, `D-TRUST-02`).
- **La date de revue reste le 2026-10-21.** La décision du 2026-07-21 bornait
  son écart ; rien dans le présent arbitrage ne demande de repousser ce terme,
  et un écart sans terme cesse d'être un écart borné. À cette date, l'annexe
  devrait être signée et l'écart refermé par le haut ; à défaut, le terme se
  reconduit explicitement ou la règle du dépôt reprend.

- Réversibilité : une décision de registre se révoque par une décision de
  registre. Techniquement, la bascule se replie par le filet de rollback court
  prévu par [[D-006]] — Vercel/Supabase gardés chauds, non décommissionnés tant
  que l'annexe n'est pas signée. **Le décommissionnement, lui, n'est pas
  réversible** et reste subordonné à la signature.
- Référence : [[D-006]], [[D-037]], [[D-047]], décision du responsable du
  2026-07-21 (`CHECKLIST_ACTIVATION_G_TRUST_04.md`),
  `docs/claude/campagnes/2026-08-18-echeance-hds-g-trust-04/`.

### D-077 — Le filtre de validité des passations est allumé : rien ne change aux calculs, le geste d'invalidation s'ouvre

- Date : 2026-08-19
- Statut : accepté (arbitrage praticien explicite en session, option
  « allumer maintenant ») et exécuté.
- Domaine : clinique, validité des passations, drapeaux, exploitation

- Contexte : `WN_ENABLE_VALIDITE_PASSATIONS` était absent de la production —
  filtre du LOT-00 de la chaîne T0 inerte (état documenté, `D-052`), route
  d'invalidation praticien en 503. Interrupteur découvert lors de la lecture
  des valeurs de production et entré en file comme geste (PR #717).

**1. L'état des données a décidé de la sûreté du geste.** Lecture MCP de la
production avant l'arbitrage : 111 passations, toutes `VALID` — le défaut de
migration, qui n'est pas un jugement clinique (`D-052`). Le seul chemin
d'écriture d'un autre statut est la route d'invalidation elle-même
(`SUPERSEDED` et `HISTORICAL_ONLY` ne sont posables nulle part,
`invalidation.ts`). Allumer ne retire donc rien du raisonnement aujourd'hui ;
cela ouvre le geste praticien, et le filtre devient réel pour l'avenir. La
raison d'un lancement éteint — ne rien faire disparaître en silence pendant
la mise en place — est épuisée depuis la clôture de la chaîne T0.

**2. Exécution.** Variable posée à `1` (famille `WN_ENABLE_*`, jamais
`true`), scope Production, non marquée *sensitive* — lisible pour les audits
futurs, à la différence de ses deux aînées. Build porté par `vercel redeploy`
du déploiement `Ready` courant (poser ne suffit pas, `D-070`/`#708`) :
`Ready` en 2 min, aliasé `app.wellneuro.fr` le 2026-08-19.

**3. Méthode de lecture, consignée parce qu'elle manquait.** `D-076` notait
qu'aucun outil accessible ne lit les variables Vercel : `vercel env pull`
vers un FICHIER CIBLE EXPLICITE du scratchpad (jamais `.env.local`, prouvé
intact par diff, tirage détruit après lecture) rend les valeurs non
*sensitive* lisibles. Les variables marquées *sensitive* restent illisibles
par construction — pour elles, seul le comportement ou le registre fait foi.

- Vérification restante, à l'œil praticien : le geste d'invalidation répond
  (plus de 503) sur un dossier de test réel.
- Hors périmètre : scopes Preview/Development (`D-076`, dette toujours
  ouverte) ; `WN_CB_RESULTS_ENABLED`, geste distinct encore en file.

### D-076 — Le message d'orientation inactive donnait une raison démentie depuis quinze jours

- Date : 2026-08-19
- Statut : accepté (demande praticien explicite) et implémenté.
- Domaine : texte praticien, orientation, état réel

- Contexte : `MESSAGE_ORIENTATION_INACTIVE` annonçait « Orientation en cours de
  constitution — les règles NNPP2 ne sont pas encore validées ». La table est
  signée depuis le 2026-08-04 : la phrase est fausse depuis ce jour-là. Dette
  nommée par `D-074`, traitée ici.

**1. Un message d'état ne nomme pas un terme qu'il ne connaît pas.** La
constante est servie par `resultatInactif()`, appelée dès que
`orientationActive()` est faux — c'est-à-dire pour l'UN OU L'AUTRE des deux
termes du ET (drapeau, signature). Nommer la signature revenait à affirmer le
seul des deux qui était devenu faux. Le texte devient donc neutre :
**« Orientation non activée sur cet environnement. »**

**2. Ce que ça coûtait vraiment.** Ce n'est pas une coquille : c'est la phrase
qu'un praticien lit pour comprendre pourquoi son écran se tait, et elle
l'orientait vers la mauvaise conclusion — « le contenu clinique n'est pas
prêt » au lieu de « la fonctionnalité n'est pas ouverte ici ». `DC-34` demande
qu'une sortie soit explicable ; une explication fausse est pire qu'une
explication absente.

- Périmètre : la constante, les trois bancs qui l'épinglent, et le renvoi de
  `FEATURE_FLAGS.md`. Aucun comportement changé — seul le libellé.
- Non traité, et hors de ma portée : les **scopes Preview et Development** des
  drapeaux, que `FEATURE_FLAGS.md` demande de vérifier depuis le 2026-08-04.
  Aucun outil accessible ne lit les variables d'environnement Vercel ; seul le
  panneau les montre. La dette reste ouverte et nommée.

### D-075 — Les dossiers de test sont réels : lisibles par identifiant, jamais nommés dans le dépôt, jamais écrits par un seed

- Date : 2026-08-18
- Statut : accepté (arbitrage praticien explicite en session) et implémenté
  (`CLAUDE.md`, §Données patients).
- Domaine : données patients, gouvernance, dossiers de test

- Contexte : la règle disait « seuls ces patients fictifs peuvent apparaître
  dans le code, les seeds, les tests ou les démos ». Lue littéralement, elle
  m'a fait refuser d'examiner un dossier que le praticien utilise réellement
  pour tester — alors que la vérification demandée ne portait pas sur son
  contenu clinique. Le praticien a tranché : les dossiers de test sont réels,
  et c'est le cas de tous les dossiers créés jusqu'ici.

**1. Ce que la règle protégeait vraiment.** Pas l'existence de dossiers réels
— elle est normale et ne se décrète pas — mais deux choses : que des identités
réelles n'entrent pas dans un dépôt dont l'historique ne s'efface pas, et
qu'aucune donnée fabriquée n'atterrisse dans un dossier de personne. La règle
confondait les deux avec « n'en parle jamais ».

**2. Lecture autorisée, par identifiant.** Vérifier un comportement sur un vrai
dossier via `execute_sql` est la façon normale de travailler ; s'en priver
avait un coût réel — au lot `D-074`, la conclusion a failli reposer sur un
journal d'accès que Playwright pouvait avoir écrit.

**3. Deux interdits maintenus, et ils ne sont pas de forme.** Jamais de nom ni
d'e-mail réel dans le dépôt : Git, les logs CI et les builds Vercel ne
s'effacent pas. Jamais de seed ni d'E2E visant un dossier réel : `web/prisma/seed.ts`
écrit des réponses de questionnaire (`questionnaireReponse.upsert`), et une
réponse fabriquée déposée dans un dossier réel est une donnée que personne n'a
produite — elle alimenterait ensuite scoring, orientation et indications
(`DC-01`, `DC-24`). Les trois identités de fixture restent donc en place ;
elles ne décrivent plus une liste de dossiers autorisés à exister.

- Écarté : faire des trois personnes les identités de fixture du dépôt (255
  fichiers, identités définitives dans l'historique, et réponses fabriquées
  écrites dans deux dossiers réels).
- Hors portée : le régime HDS, inchangé — aucune valeur biologique patient
  n'entre nulle part.

### D-074 — Le drapeau d'orientation était posé depuis au moins le 5 août, et deux textes affirmaient le contraire

- Date : 2026-08-18
- Statut : accepté (constat praticien en session, observation du comportement
  en production) et implémenté.
- Domaine : drapeaux, orientation, documentation, état réel

- Contexte : le praticien a tenté de poser `WN_ENABLE_ORIENTATION_NNPP2` en
  Production ; Vercel a refusé — la variable existait déjà. Elle est marquée
  **sensitive**, donc write-only : sa valeur n'est plus lisible. Deux textes du
  dépôt la disaient non posée, un troisième disait l'inverse.

**1. Le fait, établi par le comportement et non par un panneau.** Le panneau
« Orientation · explorations proposées » du bas de la fiche patient SERT des
recommandations en production. Or la route ne journalise et ne calcule
qu'après `orientationActive()` — `WN_ENABLE_ORIENTATION_NNPP2 === '1'` ET
`tableSignee()`. Le drapeau vaut donc `1` en Production. Le journal d'accès
montre par ailleurs 37 accès à `/api/praticien/orientation` depuis le
2026-08-05.

**2. Pourquoi le journal seul ne suffisait PAS à conclure**, et c'est la partie
à retenir : la base de production est aussi celle du dev et des E2E, et
`playwright.config.ts` arme délibérément `WN_ENABLE_ORIENTATION_NNPP2=1` dans
`webServer.env` (LOT-01, 2026-08-07). Des accès journalisés sur dossiers
fictifs sont donc compatibles avec un drapeau éteint chez Vercel. Seule
l'observation du rendu tranchait. Une trace n'est une preuve que si l'on sait
qui a pu l'écrire.

**3. Ce qui est corrigé.** `propositionService.ts` justifiait un découplage par
« drapeau non posé en production » : le découplage reste juste, mais il vaut
par l'indépendance des deux surfaces, jamais par l'état d'un drapeau — un état
qui bascule ne peut pas fonder une décision de conception. `FEATURE_FLAGS.md`
laissait entendre que « seul le drapeau tient encore le verrou » ; sa cellule
d'état dit maintenant que les deux conditions sont remplies. Le récit de
`D-065` (« l'orientation étant allumée en production ») était, lui, exact.

**4. Nommé et NON corrigé ici** : `MESSAGE_ORIENTATION_INACTIVE`
(`orientationService.ts:36`) annonce au praticien « les règles NNPP2 ne sont
pas encore validées » — faux depuis le 2026-08-04, la table étant signée. Le
message ne s'affiche plus en production puisque le verrou est ouvert, et le
corriger relève d'une autre finalité (texte d'interface) que ce lot d'état.
Dette portée au handoff.

- Hors portée : poser, retirer ou modifier le drapeau. La décision constate.
- Récidive nommée : troisième cas de la même classe après `D-064` et `D-070` —
  **un état de production ne se déduit pas de la documentation**. La nouveauté
  ici est le mécanisme qui l'a rendue durable : un drapeau marqué *sensitive*
  n'est plus relisible, donc plus démentable. Réserver *sensitive* aux secrets ;
  un interrupteur clinique y perd sa vérifiabilité.

### D-073 — Le courrier médecin gardera son ancrage de provenance en colonne, pas en prose

- Date : 2026-08-18
- Statut : accepté (arbitrage praticien en session). **Migration seule** ;
  le branchement du courrier suit dans une PR distincte, après `release-db`.
- Domaine : clinique, traçabilité, schéma

- Contexte : `genererCourrierBiologie` produit un bloc dont la `provenance`
  porte le SHA du périmètre signé et sa version. `preparerCorrespondance` ne
  persistait que le texte : consigner la lettre revenait à perdre ce par quoi
  elle s'explique (`DC-34`). C'est le motif pour lequel `D-071` avait ÉCARTÉ la
  consignation du courrier — dette nommée, aujourd'hui soldée.

**1. Deux colonnes, `ancrage_sha256` et `ancrage_version`**, nullables, sur
`correspondances_medecin`.

**2. Pourquoi une colonne et non une ligne de texte.** L'option « ancre en pied
de lettre » était plus courte d'une migration et d'un cycle de release. Elle a
été écartée : une ancre en prose n'est vérifiable par personne, et elle se
retouche avec le texte avant envoi. Tout le programme `D-063`→`D-067` a consisté
à rendre la péremption DÉTECTABLE — un SHA qu'une garde compare. Une ancre
noyée dans le corps de la lettre serait à la traçabilité ce qu'un JSDoc est à
une garde : le relevé M-B de la revue du 2026-08-16, exactement.

**3. Nullables à dessein.** Une correspondance saisie à la main n'est dérivée
d'aucune table ; lui inventer une ancre serait pire que l'absence (`DC-24`). Le
contrat éprouve donc AUSSI qu'une lettre sans ancre reste consignable — sans
ce cas positif, un durcissement rendrait la saisie manuelle impossible sans que
rien ne rougisse.

**4. Les deux termes voyagent ensemble ou pas du tout** (CHECK) : un SHA sans
version ne se rattache à rien, une version sans SHA n'atteste rien. Une moitié
d'ancre donnerait l'apparence de la traçabilité sans la fournir. Le contrat est
tué par quatre mutations, dont « ancre rendue obligatoire », qui casserait la
saisie manuelle.

**5. Le critère 2 du Lot F est tenu.** « Chaque ligne porte claim + niveau +
remboursement » : le terme est présent et vaut `non_evalue` sur les 47
analytes, faute d'appariement analyte ↔ acte. `non_evalue` n'est pas une
absence — c'est l'aveu d'ignorance qu'exige `DC-24`, et l'écran écrit qu'il ne
signifie pas « non remboursé ». Le critère portait sur la présence TRAÇABLE du
terme, pas sur le peuplement du référentiel, qui reste un lot de curation
signée.

### D-072 — Les dettes du LOT-06 sont soldées : deux replis fail-open supprimés, et la matrice cesse de compter les imports de type

- Date : 2026-08-18
- Statut : accepté (arbitrage praticien en session — « solder toutes les
  dettes »). Porté par la PR de soldes, en attente de relecture.
- Domaine : clinique, outillage d'inventaire, UI

**1. Deux replis fail-open sont SUPPRIMÉS du moteur, pas rendus
inatteignables.** `deriverStatutsBiologie` concluait `deja_documente` sur une
date de bilan illisible **comme** sur une date postérieure à la référence —
donc RETIRAIT le panel des propositions. Une donnée aberrante produisait la
conclusion rassurante, ce que `DC-24` et `DC-25` refusent. `D-071` §2 bis les
avait fermés à la frontière du service ; ils sont désormais fermés **dans le
moteur**, pour tout appelant présent ou futur, et la garde de frontière est
retirée : une règle clinique recopiée dans deux modules est une règle qu'on
peut oublier de corriger dans l'un des deux.

Le sens du repli est arbitré : écarter propose un bilan de trop, garder en
tairait un. Une déclaration écartée n'est jamais silencieuse — la ligne du
panel porte son motif (`DC-30`). Une `dateReference` illisible écarte **toutes**
les déclarations : ne pouvant juger aucune ancienneté, le moteur ne conclut sur
aucune.

**2. Les rapports calculés entrent dans la composition.** Un item de panel porte
soit un analyte soit un ratio ; les ratios étaient écartés, et la composition
affichée était donc amputée de ce que le bilan contient réellement. Ils sont
exposés à part — ce sont des CALCULS sur des analytes, sans remboursement propre
ni validation médicale.

**3. La matrice de consommation cesse de compter les imports de TYPE.** Les
jetons d'une source incluent le chemin de son module, et la correspondance est
textuelle : un `import type { Remboursement } from './remboursable'` suffisait à
faire d'un fichier un consommateur. La bibliothèque NABM (987 actes) passait
ainsi de « dormante » à « consommée » sans qu'un seul remboursement soit dérivé.
Un import de type est **effacé à la compilation** : aucun code ne s'exécute,
aucune donnée ne transite.

**Le correctif porte au-delà du cas signalé, et c'est délibéré** : c'est la même
erreur corrigée partout. Le dépôt compte désormais **6 sources dormantes au lieu
de 5**, et plusieurs lignes perdent des surfaces qui n'étaient atteintes que par
un type. L'instrument devient plus sévère — et plus vrai. Sa limite reste
entière et connue : il modélise le graphe d'imports, jamais une frontière HTTP.

**4. Le cockpit est remonté au changement de dossier** (`key={idPatient}`). En
App Router, un changement de segment peut réconcilier un composant client sans
le démonter : l'état clinique du patient précédent restait affiché tant que les
GET du nouveau dossier n'avaient pas répondu. Du contenu clinique sous le
mauvais nom, même une seconde, ne se rattrape pas. Coût assumé : un brouillon en
cours est perdu si l'on change de dossier.

**5. Une affirmation d'état est corrigée, et sa phrase conservée** (`D-071`,
append-only). « Les tables NABM sont vides » est **imprécis** :
`biology_nabm_actes` porte **987 actes** (lecture MCP du 2026-08-18). Ce qui est
vide, c'est `biology_analyte_nabm` — l'appariement analyte ↔ acte, que le schéma
exige manuel et signé. La conclusion ne change pas ; sa raison, si.
L'affirmation avait été reprise d'une revue sans être lue en base : même classe
que `D-070`.

**6. Ce que la revue a corrigé avant merge (NO-GO → GO).** Les trois blocages
tombaient tous dans le périmètre que cette décision revendique comme soldé —
c'est le motif de les avoir traités plutôt que reportés :

- **Le remontage était posé au mauvais niveau.** `key={idPatient}` gardait
  `ClinicalRuntimeSection`, mais c'est `FichePatientPanel` qui détient l'état du
  dossier — équilibre, réponses, trajectoire, mode de vie, assignations. Le
  risque nommé restait donc entier sur la plus grande sous-arborescence. La clé
  est remontée au point de montage du dossier.
- **Le repli « écarter plutôt que taire » rouvrait deux silences** : sur un
  panel discordant (la branche sort en `continue` avant le motif) et sur un
  panel sans ligne (inactif, ou visé par aucune règle exploitable). Le premier
  est corrigé sur place ; le second remonte désormais à l'appelant par
  `declarationsIgnoreesHorsProposition`, que l'écran affiche. Une déclaration
  écartée a toujours un porteur.
- **La matrice portait deux définitions concurrentes de « import de type »** :
  `import { type X }` seul restait compté, et le script en jugeait autrement
  selon l'endroit. Un juge unique — `nomsDeValeur` — les décide désormais tous
  les deux, et un banc éprouve que les deux chemins ne divergent pas.

Trois corrections de moindre gravité sont prises dans la même passe : le
courrier médecin nomme enfin les rapports calculés (l'amputation survivait sur
le seul artefact qui quitte le cabinet) ; le moteur adopte la **même** tolérance
de fuseau que la route (sans quoi une déclaration du jour saisie la nuit était
acceptée puis systématiquement écartée sous les yeux de celui qui la saisit) ;
et le motif distingue enfin la déclaration illisible de la date de RÉFÉRENCE
illisible — accuser la mauvaise donnée est un défaut de `DC-34`.

**Restent des LOTS, pas des dettes** — ils demandent une curation praticien
signée, claim par claim, et ne se soldent pas dans une passe : l'appariement
analyte ↔ NABM (0 ligne) et les liens biomarqueur ↔ besoin (0 ligne, claim
obligatoire au schéma).

### D-071 — Brancher la proposition de bilan : un drapeau neuf éteint, et la table qui rend « déjà documenté » atteignable

- Date : 2026-08-17
- Statut : accepté (arbitrages praticien en session). §2 et §3 sont
  **appliqués** — migration relue (#703) et `release-db` approuvée le
  2026-08-17, table vérifiée en production (lecture MCP : 7 colonnes, RLS
  active sans policy, 2 FK `RESTRICT`, 0 ligne). §1, §2 bis et §4 sont
  **portés par la PR de branchement, en attente de relecture**. Ce registre
  est append-only et ne déclare pas implémenté ce qui n'est pas encore relu
  (`D-070` : une affirmation déduite de la documentation avait déjà été
  fausse).
- Domaine : clinique, biologie, schéma, drapeaux

- Contexte : `D-070` a établi que `deriverStatutsBiologie` n'a aucun appelant
  hors bancs. Le catalogue (`D-068`) et les quinze règles signées (`D-069`)
  sont en base et n'atteignent aucun écran. Ce lot pose le premier appelant.

**1. Le branchement part derrière un drapeau NEUF et ÉTEINT**
(`WN_CB_PROPOSITION`), ET-é avec `isCbEnabled()` au patron exact de
`isCbResultsEnabled`. Motif : `WN_CB_ENABLED` vaut **déjà `true`** en
production (`D-070`) — s'y adosser rendrait la proposition visible sur tous
les dossiers du cabinet dès le déploiement, sans geste d'exploitation, ce que
`D-070` vient précisément de constater dans l'autre sens. Écarté :
`WN_CB_RESULTS_ENABLED`, qui est le gate dur HDS — adosser une surface
documentaire au verrou de stockage des résultats les ouvrirait ensemble le
jour venu.

**2. La table des panels documentés hors outil s'ouvre**
(`panels_biologie_documentes`). Sans elle, `deja_documente` et `a_repeter`
sont **inatteignables** : le moteur reproposerait un bilan que le patient
vient de faire faire, sans jamais signaler qu'il ignore la question. L'option
« livrer sans, en disant la limite à l'écran » a été écartée au profit de la
table. Trois termes de la décision :

- **une déclaration par (patient, panel)**, unicité SQL — le moteur ne lit
  qu'une date par panel ; empiler une histoire que rien ne consomme rendrait
  le statut dépendant de l'ordre de lecture ;
- **aucune valeur biologique** (verrou HDS) : l'outil connaît l'existence et
  la date d'un bilan revenu sur papier, jamais un résultat. Contrat SQL
  négatif dédié, tué par mutation avant d'être retenu ;
- **pas de CHECK « date non future »** : Postgres refuse `now()` dans un CHECK
  (fonction non immutable). La borne se garde côté route, à la déclaration —
  c'est une dette nommée tant que la route n'existe pas ;
- **deny-all RLS** posé par la migration (posture `D-005`) : la table porte un
  lien nominatif — quel dossier a fait explorer quel panel, quand, déclaré par
  qui — et une table neuve de `public` rejoint sinon le périmètre Data API.

**2 bis. Cette PR rend atteignables deux replis fail-open du moteur, et c'est
une dette nommée.** `statuts.ts` conclut `deja_documente` — donc RETIRE le
panel des propositions — quand la date est illisible (`NaN`) comme quand elle
est dans le futur. Une donnée aberrante y produit la conclusion rassurante, ce
que `DC-24` et `DC-25` refusent. Ces deux branches étaient mortes tant
qu'aucune source n'alimentait `documentes` ; ouvrir la table les ouvre. Elles
ne sont couvertes par aucun banc et doivent l'être **avant le premier
appelant** : repli = traiter comme NON documenté, avec motif.

**3. La ligne d'effacement IDP2 part AVEC le schéma, pas avec le code.** Le
banc de complétude d'`effacement.test.ts` se dérive du **schéma**, pas des
appelants : il rougit à la seconde où un modèle portant `id_patient`
apparaît. `arbitrages_biologiques` a tenté le report (#680, « migration
seule ») et a dû ajouter un second commit. Le coût est nommé plutôt que
découvert : entre le déploiement Vercel de cette PR et l'approbation de
`release-db`, un effacement de dossier échouerait sur une table absente — il
échoue **fermé** (transaction annulée, rien de supprimé à moitié) et redevient
possible après la release.

**4. Le premier appelant honorera le contrat M-B** : `INDICATIONS_BIOLOGIE_V1`
et `INDICATIONS_BIOLOGIE_METADATA` passés **verbatim**, sans `filter`, `sort`,
`map` ni aller-retour JSON — le verrou hache les règles réellement évaluées,
et la table n'étant ni `readonly` ni gelée, un `sort()` sans copie
empoisonnerait l'export pour tout le processus. Corollaire : l'évaluation
reste **serveur** (le moteur importe `createHash`), seul le résultat traverse
HTTP.

**5. Dettes nommées par la revue du branchement, et assumées.** Deux ne sont
pas fermées par la PR de branchement, et l'être-nommé vaut mieux que
l'omission :

- **La matrice de consommation reste imprécise sur la bibliothèque NABM.** La
  régénération la fait passer de « dormante » à « 3 surfaces indirectes », par
  un chemin qui part d'un `import type { Remboursement }` — un import de TYPE,
  effacé à la compilation, alors que le service ne passe délibérément aucun
  remboursement. La ligne *neuve* de la matrice, elle, est juste : la table
  d'indications y entre et cesse d'être dormante. Corriger le générateur pour
  ignorer les imports de type est un lot à part.
- **L'état affiché n'est pas remis à zéro au changement de patient**
  (`ClinicalRuntimeSection`) : en App Router, un changement de segment peut
  réconcilier le composant sans démontage. Défaut PRÉEXISTANT, partagé avec les
  arbitrages — mais la matière affichée devient plus parlante avec ce lot, donc
  le risque perçu monte. Correctif connu : `key={idPatient}`, hors périmètre
  d'une PR de branchement parce qu'il touche tous les panneaux du cockpit.

Fermé en revanche, et non reporté : la correction d'une déclaration erronée
(le formulaire reste offert — une date saisie de travers retirait sinon un
panel de la proposition sans issue), le verrou de drapeau re-testé DANS le
service (au patron d'`evaluerOrientationPourPatient`, pour qu'aucun futur
appelant ne lise le dossier sans lui), et la frontière de fuseau (une tolérance
d'un jour, faute de quoi la date du jour était refusée comme future chaque nuit
entre minuit et 2 h à Paris).

Écarté : consigner le courrier médecin dans la foulée — `CorrespondanceMedecin`
n'a aucune colonne d'ancrage, et consigner une pièce clinique sans sa
provenance contredit `DC-34` ; l'y ajouter est une autre migration. Écarté
aussi : passer au moteur une carte de remboursements `non_evalue` — les tables
NABM sont vides et le moteur pose déjà ce défaut, qui est l'aveu d'ignorance
juste (`DC-24`).

*(Phrase conservée pour l'histoire, mais IMPRÉCISE : `D-072` établit que
`biology_nabm_actes` porte **987 actes**. Ce qui est vide, c'est
`biology_analyte_nabm` — l'appariement analyte ↔ acte, que le schéma exige
manuel et signé. La conclusion — ne pas construire de carte — ne change pas ;
sa raison, si. L'affirmation avait été reprise d'une revue sans être lue en
base, même classe que `D-070`.)*

### D-070 — Le drapeau `WN_CB_ENABLED` était déjà posé : quatre affirmations reviennent à l'état réel, et la table signée se découvre dormante

- Date : 2026-08-17
- Statut : accepté (constat praticien en session, panneau Vercel) et
  implémenté.
- Domaine : exploitation, drapeaux, documentation, état réel
- Contexte : `D-069` §2, `FEATURE_FLAGS.md`, le fragment de changelog du même
  jour et l'en-tête de `indicationsBiologieV1.ts` affirmaient tous que
  `WN_CB_ENABLED` « reste éteint ». Le 2026-08-17, une tentative de création
  de la variable en Production a été refusée par Vercel — *a variable with the
  name `WN_CB_ENABLED` already exists for the target production* — et sa
  valeur est `true`. Elle l'était donc avant le déploiement de `4b588d1e`
  (créé à 09:16 UTC, en succès à 09:33), qui n'a pu que l'hériter.
  L'affirmation était **fausse au moment où elle a été écrite** : elle a été
  déduite de la documentation, jamais lue dans le panneau.

**1. Les quatre sites reviennent à l'état réel.** Le registre ne s'efface pas
(append-only) : la phrase de `D-069` §2 est conservée telle quelle et annotée
d'un renvoi ici. Les trois autres sont corrigés sur place.

**2. Ce que le drapeau ouvre est nommé pour ce qu'il est** : la surface
d'**arbitrage** biologique — `CbFeatureProvider` → `ClinicalRuntimeSection`,
`POST /api/praticien/biologie/arbitrage`, et les cartes « biologie arbitrée
sans révision » du fil. Pas les indications. La production compte **zéro
arbitrage** (lecture du 2026-08-17) : rien n'a jamais transité par cette
surface, drapeau posé ou non.

**3. La table signée est DORMANTE.** `deriverStatutsBiologie` n'a aucun
appelant hors bancs : les quinze règles de `D-069` et le catalogue niveau 1 de
`D-068` sont en place, signés, en base — et n'atteignent aucun écran. C'est un
état cohérent, pas une régression : le lot a livré la matière, pas son
branchement. Le premier appelant devra honorer le contrat M-B (table canonique
passée VERBATIM, ni filtre ni tri ni reconstruction).

**4. Aucun geste d'exploitation n'est posé ni retiré ici** : le drapeau reste
tel qu'il est. Cette décision constate et corrige, elle n'allume ni n'éteint.

- Hors portée : la date de pose du drapeau, qu'aucun document n'enregistre —
  elle reste inconnue et n'est pas inventée. Aucun contenu haché n'est touché ;
  les `shaPerimetre` des cinq tables sont intacts.
- La leçon, de même classe que `D-064` : **un état de production ne se déduit
  pas de la documentation**. Les deux fois, une affirmation d'état a été
  recopiée d'un document au lieu d'être lue à la source — panneau Vercel ici,
  base là-bas.

### D-069 — Les quinze règles d'indication biologique entrent dans la table signée, et la signature biologie devient réelle

- Date : 2026-08-17
- Statut : accepté (arbitrage praticien explicite en session — « toutes les
  signatures praticien, sans réserves », porté sur la table PEUPLÉE) et
  implémenté.
- Domaine : clinique, biologie, table d'indications signée, signature
- Contexte : dernière marche du programme LOT-06. La table
  `INDICATIONS_BIOLOGIE_V1` était vide par contrat (`D-059` §2-3) et sa
  signature incomplète fermait le verrou (`D-063`). Tous les prérequis sont
  tombés dans l'ordre : la disjonction existe (`D-060`), les sept instruments
  inertes sont vivants (`D-066` — réactivation + comptes de complétude), le
  catalogue est en base (`D-068`), et les grilles publiées des treize
  instruments déclencheurs ont été relues une à une le 2026-08-17.
- Décision :

**1. Quinze règles, transcrites de la proposition v5** — 12 conditionnelles
(dont SIX en `ou` `D-060` : humeur, anxiété, stress, mémoire, digestif,
neurodégénératif), 1 optionnelle (`0178-055`, seul claim du corpus à qualifier
un bilan d'optionnel), 2 non indiquées (motifs VERBATIM de `0242-007` et
`0042-007`). Les zones citent les bandes que chaque instrument PUBLIE, relues
dans les grilles — pas la sténo du document : le BMS-10 se juge sur la
MOYENNE et `Q_INF_05` sur un COMPTE d'items (les zones couleur lisent la bande
servie et neutralisent ces pièges) ; `Q_INF_05` porte la seule bande `dark` du
périmètre ; MMSE et 5 mots sont des échelles inversées (zones couleur, jamais
de comparaison) ; le MADRS reste en comparaison `>= 8` (sa grille ne classe ni
7 ni 19). Le PSS-10, le PSQI et le TFD reprennent À L'IDENTIQUE les zones des
règles signées d'orientation (`R-STR-01/02`, `R-SOM-01`, `R-GAS-01`), `dark`
inerte compris. Répétition annuelle (`delaiJours: 365`, arbitrage F.1) sur les
NEUF panels de tableau clinique de niveau socle — ni populations, ni
optionnel, ni approfondissement.

**2. La signature biologie est RÉELLE** : `dateValidation`
`2026-08-17T00:00:00.000Z`, les 29 claims distincts cités par les règles
(égalité exacte deux sens, tenue par banc) — dont `WN-CL-0312-018` et
`WN-CL-0389-004`, qui fondent la répétition annuelle : le seul chiffre
paramétrique de la table est DANS le périmètre signé (relevé en revue, la
première rédaction le laissait en prose). `shaPerimetre` en littéral figé
recopié de `INDICATIONS_BIOLOGIE_SHA256` au moment de la relecture. Le verrou
à cinq termes est OUVERT côté signature ; `WN_CB_ENABLED` reste ÉTEINT — le
drapeau d'exploitation est un geste praticien distinct, signer n'allume pas.
*(Phrase conservée pour l'histoire, mais FAUSSE : `D-070` établit que le
drapeau était déjà posé à `true` en production quand elle a été écrite.)*

**Limites nommées par la revue, portées sur les règles elles-mêmes** : la
branche IBS-SSS est inerte pour tout patient répondant « non » à une question
filtre du score de Francis (les items écartés comptent comme manquants —
mesuré sur le moteur réel ; le panel digestif reste servi par sa jambe TFD ;
corriger relève d'un lot de scoring sur instrument certifié). Et « reprise à
l'identique » des zones d'orientation vaut pour la ZONE, pas le comportement :
sous `ou`, le déclenchement par plancher garanti sur recueil partiel est perdu
(`D-060` §2/§6, fail-closed uniforme assumé) là où la feuille simple du PSQI
le conserve — asymétrie interne à la table, dite sur place.

**3. Les deux réserves de la revue `D-060` sont fermées** : RV-1, banc
d'inertie sur les moteurs RÉELS (`calculateScore` saturé, lecture au grain du
porteur visé — un moteur qui cesse de publier ses comptes rougit au CI, pas en
production six mois plus tard) ; RV-2, garde de forme de la table (un panel
par règle, claims/conditions/motifs par mode, `signauxAlerte` interdit sous
`ou`, instruments assignables, couleurs défavorables seules, borne MADRS
épinglée, codes de panels = ceux de `D-068`).

- Conséquences : les sentinelles « table vide » et « signature incomplète »
  sont inversées, jamais supprimées ; `FEATURE_FLAGS.md` suit (gardé). La
  proposition de bilan se dérivera dès que `WN_CB_ENABLED` sera posé ET qu'un
  appelant de production existera (le contrat d'appelant est bordé —
  M-B/`D-067`).
- Écarté : transcrire les zones depuis la colonne du §F.2 (étendues de score,
  pas des bandes — le §B fait foi) ; une zone couleur pour le MADRS (trous 7
  et 19) ; des comparaisons pour MMSE/5 mots (échelles inversées) ; citer les
  claims de bandes BMS-10 en plage `0106-025..029` (seuls les trois relevés
  nommément en production sont vérifiés — la règle cite `0106-027`, la bande
  « présence du burnout » qui fonde le départ à warning).

### D-068 — Le catalogue biologie niveau 1 entre en base : 47 analytes, 15 panels, 2 plages sourcées

- Date : 2026-08-17
- Statut : accepté (proposition du 2026-08-15 v5 validée par le praticien ;
  arbitrages restés ouverts tranchés en session — F.1 répétition sur les
  panels socle par choix explicite, blocs conservés tels quels, MADRS en
  comparaison, panel fatigue entier, F.3/F.4/F.5 sur l'option portée par le
  document) et implémenté en migration de données.
- Domaine : catalogue biologie, migration de données, schéma (une colonne)
- Contexte : `D-059` §2 exigeait une proposition validée ligne à ligne avant
  toute migration. La proposition v5 existe, ses 49 claims ont été relus en
  production (tous `VALIDE`, actifs, non superseded — 2026-08-16), et les
  textes des claims d'arbitrage ont été relus le 2026-08-17 (ferritine
  50-80 ng/mL verbatim ; vitamine D cible 45 sur `0239-004`, concordant
  `0154-054`).
- Décision :

**1. Composition SEULE.** 47 analytes (§A), 15 panels (§B/§C/§D — ceux que les
règles de PR-3 référencent), items de composition. Aucune indication en base :
les conditions vivent dans la table signée `indicationsBiologieV1.ts` (`D-059`).
Les panels « seconde intention » ne sont pas transcrits (compositions citant
des analytes hors §A). `source_provenance = 'saisie_praticien'`.

**2. Écarts nommés, jamais comblés.** L'apoprotéine (`0178-054`) et « les IgA
sécrétoires » (`0178-055` — le claim ne dit pas le site de prélèvement,
salivaire et fécales existant toutes deux) n'ont pas de code §A : lignes
omises. Le « < 10 ng/mL » de `0239-010` est un seuil de déficit profond avec
conduite associée, pas une borne de plage cible : non transcrit. **La plage
vitamine D n'a pas de plafond, et c'est un écart de corpus** : aucun claim ne
borne le haut (`0239-005`, 60 ng/mL, se déclare non consensuel — non
prescriptif en base) ; la ligne cite `WN-CL-0154-054`, le claim qui FONDE la
forme « > 45 » (revue, BL-1), et dit « zone souhaitée », jamais « rien n'est
trop haut ». Les quatre entrées « rapport/indice » restent des ANALYTES (leurs
opérandes ne sont pas tous au catalogue — les décomposer serait inventer) ;
leurs codes occupent l'espace `BIO_RATIO_*` que la table des ratios réserve —
l'intersection des deux espaces est désormais interdite par contrat
(`cb_catalogue_niveau_1_donnees.sql`, finding MA-2). Trois résolutions
générique → spécifique sont HÉRITÉES de la proposition validée (MI-7) :
« fer » (`0334-005`) → fer sérique, « magnésium » (`0388-008`) →
érythrocytaire, « acides gras » (`0282-018`) → érythrocytaires. Enfin le
panel fatigue porte 14 analytes, fidèles à l'énumération de `0361-009` — la
garde §B.7 de la proposition écrit « 13 », décompte faux d'une unité dans le
document validé (MI-6, signalé au praticien).

**3. La barrière `D-003` s'exécute À L'INSERTION.** Les deux plages
fonctionnelles sont des `INSERT … WHERE EXISTS (claim VALIDE et actif)` : en
CI (corpus vide) zéro ligne et le contrat reste vert par vacuité ; en
production les claims sont vérifiés présents (`v1.0`, relus le 2026-08-17).
Une plage qui ne s'insérerait pas est un écart à lire en vérification
post-release, jamais un oubli silencieux.

**4. La colonne `validation_medicale_requise`** (schéma + défaut `false`)
porte l'arbitrage F.6 : l'insulinémie seule à `true` — règle de sécurité
PRODUIT, posée explicitement, aucun claim ne la fonde et c'est dit. Le
vocabulaire d'unités est étendu de `µg/mL` (BIO_LBP), par la voie additive que
la migration d'origine prévoyait.

**5. Choix d'exploitation écrits (revue du 2026-08-17).** `statut_fiche`
reste `'importee'` : la vérification PAR FICHE (`verifiee` + signataire +
date) est un geste praticien ultérieur, distinct de la validation du catalogue
que cette décision porte — un lecteur filtrant `verifiee` voit un catalogue
vide, et c'est exact. Le pointeur `biology_catalog_versions_courantes` reste
VIDE pour `saisie_praticien` : ce mécanisme d'idempotence est construit pour
les imports versionnés d'une source amont (snapshot NABM) — un catalogue saisi
n'a pas de snapshot ; l'ancrage de version est cette décision et le contrat de
données (47/15/78/2). La barrière d'insertion reprend le prédicat EXACT du
contrat CI (`VALIDE` + `active`, sans `superseded_at` — lacune héritée du
contrat, consignée, MI-8). Les deux panels non indiqués PORTENT leur motif
(colonne `objectif`, verbatim `0242-007`/`0042-007`) : si PR-3 glisse, la
production ne montre pas deux coquilles vides (MA-4).

- Conséquences : `release-db` après merge (approbation humaine), vérification
  de la base de production en lecture MCP ensuite (47 analytes, 15 panels,
  78 items, 2 plages, insulinémie seule marquée — les sept lectures du bloc
  « risques » de la PR). PR-3 (règles + signature) peut référencer les
  `panelCode`.
- Écarté : transcrire les panels seconde intention avec des compositions
  amputées (misrepresentation des claims) ; poser les plages sans condition
  d'existence du claim (le CI aurait exigé une liste d'exceptions ou un corpus
  fixture) ; décomposer les ratios en opérandes absents du §A.

### D-067 — Les quatre tables cliniques passent au verrou à cinq termes, et les signatures dues sont reposées

- Date : 2026-08-16
- Statut : accepté (arbitrage praticien explicite en session — « toutes les
  signatures praticien, sans réserves ») et implémenté.
- Domaine : clinique, signatures des tables, verrous fail-closed
- Contexte : `D-063` a construit sur le verrou biologie le seul verrou à cinq
  termes du dépôt — booléen, date, forme ISO canonique, claims, concordance
  d'un `shaPerimetre` littéral avec le SHA recalculé du contenu — et a nommé
  l'écart : les quatre tables historiques (orientation, priorités, arrêt,
  contradictions) restaient à trois termes, sans détection de péremption. Par
  ailleurs `D-062` avait agrandi le périmètre haché des priorités APRÈS leur
  signature du 2026-08-15 : la re-signature était due. Enfin la réserve F5 de
  la revue du 2026-08-16 : la date d'orientation (`'2026-08-06'`) n'était pas
  ISO canonique et son verrou ne contrôlait pas la forme.
- Décision, trois gestes :

**1. `shaPerimetre` entre dans les quatre métadonnées**, en littéral figé
recopié depuis la constante calculée au moment de la relecture — jamais la
constante elle-même (comparaison tautologique, péremption invisible ; piège
documenté par le verrou biologie). Les quatre fonctions de validation passent
à cinq termes (`tablePrioritesSignee`, `tableSignee` ×2, `tableArretSignee`),
forme ISO canonique de la date comprise — une date mal formée FERME. Sur la
table d'ARRÊT, c'est le terme qui compte le plus : une règle d'extinction
retouchée après signature aurait éteint sous une signature qui ne l'a jamais
couverte.

**2. Les priorités sont RE-SIGNÉES au 2026-08-16** sur le périmètre agrandi
par `D-062` (procédure d'abstention comprise) — la dette de re-signature est
soldée. Le SHA du contenu n'a pas changé depuis `D-062` ; la date, si :
`validation.validatedAt` change, donc la fenêtre 409 `chaine_c1_divergente`
(constat M5) se rouvre pour toute carte préparée avant déploiement et soumise
après. Assumé et borné, comme les deux fois précédentes.

**3. La date d'orientation est portée à l'ISO canonique** (`'2026-08-06'` →
`'2026-08-06T00:00:00.000Z'`) : le JOUR attesté ne change pas, seule la forme
rejoint le standard que le verrou contrôle désormais (réserve F5 soldée).
L'arrêt et les contradictions gardent leur date du 2026-08-15 — leur contenu
n'a pas bougé, seul le `shaPerimetre` s'ajoute.

- Conséquences : la sentinelle de date de la revue M/F a rougi comme prévu et
  a désigné les deux copies à aligner (`DATE_SIGNATURE_LIVREE`,
  `DATE_SIGNATURE_SIMULEE`) ; la date simulée désalignée de
  `priorityRulesV1.test.ts` (dette n° 4 du handoff) est alignée au passage ;
  `FEATURE_FLAGS.md` suit, tenu par son garde. Les bancs en escalier prouvent
  chaque terme séparément, péremption comprise.
- Écarté : re-dater l'orientation au 2026-08-16 (le fait attesté est la
  relecture du 6 août — changer la date affirmerait une relecture qui n'a pas
  eu lieu) ; poser `shaPerimetre` sans re-signer les priorités (le littéral
  aurait figé un périmètre que la signature ne couvrait pas).

### D-066 — Cinq instruments cognitifs sont réactivés sur déclaration du praticien, et trois moteurs publient leurs comptes de complétude

- Date : 2026-08-16
- Statut : accepté (deux arbitrages praticien explicites en session, le second
  pris en connaissance des motifs réels de suspension, re-présentés avant le
  geste) et implémenté.
- Domaine : catalogue des questionnaires, droits, scoring (métadonnées de
  complétude), consigne de synthèse (bump v26)
- Contexte : sept des dix-sept instruments déclencheurs du catalogue biologie
  niveau 1 ne pouvaient pas allumer leur panel (audit du 2026-08-16, consigné
  dans `RESERVE-instruments-non-declenchables.md` de la proposition). Cinq
  étaient suspendus (`actif: false`, zéro passation en production) : les panels
  mémoire et neurodégénératif étaient morts en toutes formes. Deux moteurs ne
  publiaient aucun compte de complétude (HAD, IBS-SSS) : leurs branches de
  disjonction (`D-060` §2) étaient inertes à vie.
- Décision, en deux volets :

**1. Réactivation de `Q_GEO_03`, `Q_GEO_04`, `Q_GEO_05`, `Q_GEO_06` et
`Q_NEU_06`, sur déclaration du praticien-propriétaire que l'usage est couvert**
— patron EORTC du 2026-07-30 : la déclaration lève la suspension, jamais les
réserves, qui restent au registre (« © PAR, licence requise » pour le MMSE ;
identité IEDM sans ayant droit sollicitable pour le MMT). Les motifs réels de
la suspension ont été re-présentés au praticien avant le geste, et la décision
les porte explicitement :

- ces cinq instruments sont **de consultation** (administrés par le clinicien
  ou renseignés avec l'informant) — leur assignation est un geste praticien,
  jamais un envoi de routine, et le bandeau `administrationMode: 'clinicien'`
  reste ce qui le dit à l'écran ;
- le **risque de mesure du MMT demeure nommé** (auto-rempli hors surveillance,
  le test se corrige en remontant la page) — la décision le porte, elle ne le
  nie pas ; la trace vit dans `mmtReconstruit.guard.test.ts` ;
- les sentinelles qui épinglaient la fermeture sont **inversées, jamais
  supprimées** : `droitsAssignabilite.guard.test.ts` épingle la liste exacte
  des ouverts par décision (la prochaine ligne de `PASSATION_PRATICIEN` reste
  fermée sans décision), `bibliotheque.test.ts` épingle chaque instrument dans
  sa position. `Q_URO_02`, `Q_PED_02` et `Q_PED_03` restent fermés, hors
  périmètre.
- `listeBibliotheque()` fusionne désormais les deux sources : un instrument
  peut être de passation praticien ET assignable — sans la jointure, les cinq
  sortaient en double au sélecteur d'assignation.

**2. Les moteurs `had`, `sum_two_phases` et `francis` publient leurs comptes de
complétude** (`missing`/`repondus`, par axe pour HAD, à la racine pour les deux
autres) — extension de la campagne du 2026-08-04, mêmes clés, même contrat.
Sans eux, aucune branche de disjonction ne peut viser HAD-A, HAD-D, le test des
5 mots ou l'IBS-SSS (`D-060` §2, fail-closed). Effet de bord assumé et voulu :
sur un recueil partiel, la garde générale de complétude annule désormais la
mesure de ces porteurs là où elle ne lisait rien — c'est le comportement que
les autres moteurs ont déjà. La consigne de synthèse passe en v26 : **missing**
rejoint **items** et **repondus** dans la phrase qui sépare les comptes de
questions des points de score.

**3. L'invariant « geste praticien, jamais envoi de routine » est STRUCTUREL,
pas déclaratif** — ajouté après la revue `wn-reviewer` de la première
implémentation, qui a montré qu'il ne reposait que sur la vigilance d'écran
(pack par défaut ouvert aux cinq, bandeau affirmant « jamais envoyé au
portail » à côté d'un bouton d'envoi actif, sélecteur sans marque, consignes
praticien servies au patient, cinq mots du test de rappel écrits dans
l'énoncé) :

- les **packs refusent** tout instrument de `PASSATION_PRATICIEN` (409
  `questionnaire_consultation`, POST comme PATCH), et l'assignation du pack de
  base à l'onboarding l'écarte en ceinture — un pack est l'envoi de routine par
  définition, pack de base compris ;
- l'assignation DIRECTE reste ouverte : c'est elle, le geste praticien — et le
  sélecteur la marque (« passation en consultation ») ;
- le **portail patient** affiche à l'ouverture : « se remplit en consultation,
  avec votre praticien » — l'auto-remplissage à domicile reste techniquement
  possible (aucun logiciel ne force la présence), c'est le risque résiduel que
  la décision porte ;
- `Q_GEO_03` (AQ) et `Q_GEO_05` (QDRS) reçoivent `administrationMode:
  'clinicien'` qui leur manquait — informant-based, l'auto-remplissage
  répondrait à la place du proche (`DC-14`, `DC-28`) ;
- l'alerte Alzheimer du test des 5 mots exige un rappel différé COMPLET
  (`missing === 0`) — un rappel amputé ne peut qu'abaisser le total, le biais
  même qui fabriquait l'alerte (finding M1).

- Conséquences : les sept instruments de l'audit sont déclenchables ; les
  panels mémoire et neurodégénératif redeviennent écrivables en PR-3 ; le banc
  d'inertie des branches `ou` (réserve RV-1 de la revue de `D-060`) pourra
  exiger des comptes publiés sans liste d'exception.
- Écarté : maintenir la suspension en retenant les deux panels (proposé comme
  option recommandée — le praticien a préféré réactiver) ; réactiver sans
  re-présenter les motifs réels (les options initiales décrivaient le motif
  comme inconnu, un second arbitrage a été demandé quand il s'est avéré
  documenté) ; écrire les branches inertes avec liste d'exceptions au banc.

### D-065 — Le frein de `D-053` §5 devient structurel : pas d'extinction sans système de contradictions actif

- Date : 2026-08-16
- Statut : accepté (arbitrage praticien explicite entre deux options
  présentées) et implémenté.
- Domaine : clinique, moteur d'orientation, règles d'arrêt, contradictions
- Contexte : `D-064` a fermé la fenêtre par l'environnement — le drapeau des
  contradictions est posé en production — mais la configuration piège restait
  constructible : retirer ce drapeau, ou l'oublier dans un nouvel
  environnement, aurait réarmé silencieusement l'extinction sans frein. Un
  banc du dépôt gravait même ce comportement comme voulu (« hiérarchie des
  verrous » : contradictions éteintes, le dossier s'éteint quand même).
- Décision : `orientationService` ne passe les règles d'arrêt au moteur que si
  `tableArretExploitable()` — signature de la table d'arrêt ET
  `contradictionsActives()`. « Aucun constat » et « système de constats
  éteint » cessent d'être indiscernables (`DC-24`) ; une discordance déclarée
  ne peut plus être supprimée sans que le système capable de la constater
  tourne (`DC-30`). Les DEUX effets de la table (extinction, exclusion
  déjà-répondu) suivent le même prédicat : les scinder recréerait l'asymétrie
  de verrous payée par `D-064`. Le tampon d'audit `arret` suit aussi — une
  table qui n'a rien pu produire n'inscrit pas sa version.
- Option écartée : statu quo documenté par un banc — c'eût été graver dans un
  test la configuration que `D-064` venait de qualifier de `DC-30` à revers.
- Conséquence assumée : l'extinction et l'exclusion sont couplées au système
  de contradictions. Éteindre les contradictions éteint l'arrêt tout entier —
  fail-closed, aucun changement observable en production où les deux sont
  actifs.
- La dette de banc de `D-064` est soldée : « arrêt signé + contradictions
  inactives ⇒ rien ne s'éteint » est éprouvé sous ses deux visages (drapeau
  absent ; table non signée), plus le couplage de l'exclusion.

### D-064 — Le frein de `D-053` §5 était inopérant en production ; les contradictions sont activées pour le rendre réel

- Date : 2026-08-16
- Statut : accepté et exécuté — `WN_ENABLE_CONTRADICTIONS_NNPP2=1` posé sur le
  scope Production Vercel le 2026-08-16, sur instruction expresse du praticien.
  **Effet au prochain déploiement de production seulement.**
- Domaine : clinique, verrous de signature, contradictions, extinction
- Contexte : revue `wn-reviewer` a posteriori des trois PR cliniques de
  `D-061`/`D-062`/`D-063` (jamais revues avant merge, produites depuis un
  conteneur distant). Finding critique confirmé : la signature CONJOINTE des
  tables d'arrêt et de contradictions (`D-061`) ne produisait pas le frein
  qu'elle revendiquait. La borne « une contradiction ouverte interdit
  l'extinction » (`D-053` §5, `orientationEngine.ts`) ne mord que sur les
  constats effectivement produits, et `contradictionsActives()` exige le
  drapeau EN PLUS de la signature — quand `tableArretSignee()` ne teste que
  la signature, sous un `WN_ENABLE_ORIENTATION_NNPP2` déjà posé. Le drapeau
  des contradictions étant absent de tous les scopes Vercel, l'extinction
  tournait donc SANS FREIN en production depuis le 2026-08-15 : sur un
  dossier du recoupement `STOP-STR` × `C-STR`, une discordance déclarée
  était supprimée sans constat — `DC-30` pris à revers.
- Décision : poser le drapeau, pas dé-signer. Deux alternatives écartées :
  dé-signer `stopRulesV1` (retire une extinction voulue et déjà signée pour
  corriger un défaut qui n'est pas le sien) ; conditionner l'extinction à
  `contradictionsActives()` dans le code (change la sémantique du verrou —
  reste une piste de durcissement, non tranchée ici). Poser le drapeau
  rétablit l'état que `D-061` croyait avoir produit : constats servis à
  l'écran (câblage `D-050`) ET frein réel sur l'extinction.
- Conséquence assumée : le cockpit praticien affichera les constats de
  contradiction (`C-STR`, seule règle publiée) dès le prochain déploiement.
- Dette nommée : aucun banc ne joue « arrêt signé + contradictions
  inactives » — la configuration exacte qui a laissé ce trou invisible. Un
  garde reliant `docs/FEATURE_FLAGS.md` à l'état réel des `validationExterne`
  manque également (le document a menti trois jours sur deux tables).

### D-063 — Le verrou biologie devient réel, et il révèle que sa signature n'en était pas une

- Date : 2026-08-16
- Statut : accepté pour le code ; **la signature biologie reste à poser
  réellement**, et l'extension du patron aux quatre autres tables est proposée.
- Domaine : clinique, verrous de signature, biologie
- Contexte : `D-061` dette (b). `deriverStatutsBiologie` ne testait QUE
  `validationExterne` — ni date, ni claims, ni périmètre. C'était le plus
  faible des cinq verrous, et la table venait d'être signée VIDE : la fenêtre
  se refermait à la première règle ajoutée, qui serait entrée sous une
  signature acquise sans que rien ne la fasse rougir.

- Décision : trois points.

**1. Le verrou reprend le patron `tablePrioritesSignee`, et ajoute un terme.**
`signatureIndicationsValide()` exige les cinq : `validationExterne`, une date
ISO CANONIQUE non nulle, des `claimsSource` non vides, et — terme que les
quatre autres tables n'ont pas encore — la concordance de `shaPerimetre` avec
`INDICATIONS_BIOLOGIE_SHA256`. Ce dernier rend la PÉREMPTION DÉTECTABLE : dès
qu'une règle est ajoutée, le SHA change, la concordance tombe, le verrou se
ferme SEUL.

**2. Ce que le durcissement a révélé : la signature de `D-061` n'en était pas
une.** Elle portait `validationExterne: true` mais `dateValidation: null` et
`claimsSource: []`. Au standard des quatre autres tables, ce n'est pas une
signature — elle passait uniquement parce que son verrou ne regardait que le
booléen. L'assistant l'a posée ainsi sans relever l'asymétrie ; c'est une
erreur de sa part, corrigée ici en la rendant visible plutôt qu'en la taisant.

Conséquence : **le verrou est désormais FERMÉ.** État juste, et
**observablement inerte** — la table est vide, le moteur refusait déjà faute
de règle publiée. Seul le motif change, et il devient exact. Pour signer
réellement : poser la date, les claims du périmètre relu, et
`shaPerimetre = INDICATIONS_BIOLOGIE_SHA256`. Geste praticien.

**3. Le patron devrait remonter aux quatre autres tables (proposé).** Aucune
ne porte de `shaPerimetre` : leur péremption reste un commentaire. La plus
concernée est la table des priorités, dont `D-062` a agrandi le périmètre sans
que la signature du 2026-08-15 le couvre — exactement le cas que ce terme
détecterait. Non fait ici : cela fermerait des verrous ouverts, et renverser
ces décisions n'appartient pas à l'assistant.

- Mesuré : `npm run check` vert ; banc biologie 18 tests, les deux positions du
  verrou éprouvées. T2/T3 restent injouables dans le conteneur distant.
- Dettes ouvertes : (a) signature biologie réelle ; (b) re-signature priorités
  sur le périmètre de `D-062` ; (c) `shaPerimetre` aux quatre autres tables ;
  (d) revue `wn-reviewer` et T3 hors conteneur.

### D-062 — La procédure d'abstention entre dans le périmètre signé, et la re-signature devient due

- Date : 2026-08-16
- Statut : accepté pour la partie code ; **la re-signature praticien reste à
  poser**, et le durcissement du verrou est proposé, non tranché.
- Domaine : moteur clinique, périmètre signé, doctrine
- Contexte : `D-061` a signé la table des priorités en franchissant une dette
  écrite (`D-054`, revue du 2026-08-12) — le SHA ne couvrait pas la procédure
  d'abstention, si bien que la signature ouvrait un verdict `required` /
  `not_required` servi au praticien qu'aucune ligne signée ne décrivait
  (`DC-17`, `DC-26`). Les priorités étant la seule table SANS drapeau
  d'exploitation, le merge de `D-061` a rendu cette dette échue, non différée.

- Décision : trois points, dont un seul est exécuté.

**1. La procédure devient des DONNÉES SIGNÉES (fait).**
`ABSTENTION_PROCEDURE_V1` vit désormais dans `priorityRulesV1.ts` — cadre,
deux motifs de `required`, verdict par défaut, chacun avec son texte français
exact. `PRIORITY_RULES_SHA256` porte sur `{ regles, abstention }` et non plus
sur les seules règles. `evaluerAbstention` n'énonce plus rien : elle applique.
Ce qui reste dans `chaineC1.ts` est l'ordre d'évaluation et le câblage des
entrées — mécanique, non clinique. Comportement servi INCHANGÉ, textes
identiques au caractère près : 65 tests des trois bancs concernés passent.

**2. La provenance est DOCTRINALE, et la question des claims reste ouverte.**
Les deux motifs ne dérivent d'aucun claim du corpus : ils dérivent de la
constitution — `DC-12`/`DC-23` pour le signal de sécurité qui prime sans
ajouter de points, `DC-24`/`DC-25` pour la donnée absente qui n'est ni nulle
ni normale. Chaque motif cite sa doctrine, et un banc l'exige non vide.
`DC-26` demande qu'une règle vive « dans le registre » sans préciser lequel :
celui des décisions est ici retenu. **Question ouverte au praticien** : faut-il
en plus des claims `VALIDE` ? Ils n'existent pas et seraient à écrire.

**3. La re-signature est DUE, et le durcissement du verrou est PROPOSÉ.**
Le périmètre signé a grandi, donc le SHA a changé —
`4b51c649…7448042` → `cfd9b876…d511ab4`. `PRIORITY_RULES_METADATA` porte
toujours `dateValidation: '2026-08-15T00:00:00.000Z'`, posée sur l'ANCIEN
périmètre : la signature ne couvre plus ce qu'elle prétend couvrir. Mettre le
littéral du banc à jour ne vaut pas signature, le banc le dit lui-même.

*Proposé, délibérément non fait* : épingler le SHA du périmètre dans la
métadonnée (`shaPerimetre`) et l'ajouter aux termes de
`tablePrioritesSignee()`. La péremption deviendrait alors DÉTECTABLE au lieu
d'être un commentaire — le verrou se fermerait seul dès que le contenu bouge
sans re-signature. Ce n'est pas fait ici parce que cela **éteindrait les
priorités que le praticien vient d'allumer**, et renverser sa décision de la
veille sans qu'il l'ait demandé n'appartient pas à l'assistant. Le même patron
vaudrait pour le verrou biologie (`D-061` dette b).

- Non joué : T2 et T3 restent injouables dans le conteneur distant
  (installation Playwright en dur, CDN refusé par l'allowlist). `npm run check`
  vert, et les trois bancs couvrant l'abstention joués explicitement (65
  tests). Revue `wn-reviewer` non lancée.
- Dettes ouvertes : (a) re-signature praticien sur le nouveau périmètre ;
  (b) `shaPerimetre` dans le verrou, priorités et biologie ; (c) claims
  `VALIDE` pour les motifs d'abstention, si le praticien les juge nécessaires.

### D-061 — Les quatre tables restantes sont signées, dont deux en passage en force nommé

- Date : 2026-08-15
- Statut : accepté (arbitrage praticien explicite du 2026-08-15, après exposé
  des blocages)
- Domaine : clinique, signatures de tables, verrous fail-closed, bancs
- Contexte : demande praticien « signer toutes les tables ». La vérification
  préalable a établi trois choses que la demande ne pouvait pas anticiper.

  **`ORIENTATION_METADATA` était DÉJÀ signée** — `validationExterne: true`,
  `dateValidation: '2026-08-06'`, 23 claims. L'assistant avait affirmé le
  contraire deux fois le même jour (corps de la PR #685, §F.2 du catalogue
  biologie, tous deux mergés) : une lecture fautive attrapant la première
  occurrence du fichier au lieu de l'objet de métadonnées. Corrigé dans la
  même PR que cette décision. Conséquence : les trois zones du catalogue
  reprises de cette table (sommeil, stress, digestif) s'adossent à une table
  signée, non à un alignement provisoire.

  **La table des priorités porte une dette bloquante écrite** (« À LIRE AVANT
  DE SIGNER », [[D-054]], revue du 2026-08-12).

  **Le verrou biologie est le plus faible des cinq** : `deriverStatutsBiologie`
  ne teste que le booléen, là où les quatre autres exigent aussi date et
  claims.

- Décision : quatre signatures, portées au 2026-08-15 en ISO canonique.

**1. Arrêt et contradictions, signées CONJOINTEMENT.** L'ordre a un sens
clinique et n'est gardé par rien : signer la table d'arrêt seule ferait
tourner l'extinction sans le frein « une contradiction ouverte interdit
l'extinction » ([[D-053]] §5), aucun constat n'existant si les contradictions
sont inactives. Les signer ensemble ferme ce trou. Le drapeau
`WN_ENABLE_CONTRADICTIONS_NNPP2` reste un geste d'exploitation distinct.

**2. Priorités — PASSAGE EN FORCE, nommé comme tel, et SANS SECOND VERROU.**

*Fait vérifié après coup, qui aggrave ce point* : les priorités sont la SEULE
des cinq tables sans drapeau d'exploitation. L'orientation a
`WN_ENABLE_ORIENTATION_NNPP2`, les contradictions
`WN_ENABLE_CONTRADICTIONS_NNPP2`, la biologie `WN_CB_ENABLED` ;
`tablePrioritesSignee()` est le verrou unique du chemin priorités
([[D-054]] arbitrage 7 l'assume : « la chaîne C1 est déjà derrière
l'authentification praticien et la confirmation T0 »). Pour les quatre autres
tables, signer n'allume pas. **Pour celle-ci, si.** Le merge de la PR portant
cette décision met donc le verdict d'abstention en production immédiatement.
La dette (a) ci-dessous n'est pas différable : elle est due au merge. Le SHA ne couvre pas la
procédure d'abstention, qui vit dans `chaineC1.ts` : la signature ouvre un
verdict `required` / `not_required` servi au praticien et haché dans la carte
de décision, dont aucune ligne signée ne décrit la règle — ce que `DC-17` et
`DC-26` interdisent. La dette n'est PAS close. Le praticien a signé après que
le blocage lui a été exposé mot pour mot. **Dette ouverte et prioritaire.**

**3. Biologie — PASSAGE EN FORCE, table VIDE.** La signature n'atteste aucune
relecture de contenu puisqu'il n'y a pas de contenu. Mesuré au banc : elle est
**observablement inerte aujourd'hui** — le moteur refuse toujours de dériver,
mais sur la seconde garde (« aucune règle publiée et sourcée ») et non plus
sur le verrou de signature. Le risque n'est pas aujourd'hui, il est à la
première règle ajoutée : elle entrera sous signature acquise, sans SHA ni date
pour la faire rougir. **Dette ouverte : aligner le verrou biologie sur le
patron `tablePrioritesSignee` (date + SHA + claims).**

**4. Les sentinelles sont INVERSÉES, jamais supprimées.** Sept bancs
affirmaient la non-signature ; les supprimer aurait retiré le fil de
déclenchement. Ils affirment désormais la signature ET sa bonne forme (date
ISO canonique), de sorte qu'une dé-signature accidentelle ou une date
malformée reste attrapée. Deux positions du verrou restent éprouvées partout,
la position fermée étant désormais SIMULÉE.

**5. La machinerie de banc capturait l'état non signé en dur.**
`chaineC1Fixture.retablirTablePriorites()` remettait `false` au nom de
« l'état LIVRÉ » ; après signature, ce helper imposait l'ancien état au lieu
de restaurer le vrai, rendant l'isolation mensongère. Il capture désormais
l'état livré au chargement. Même correction dans `chaineC1.test.ts`.

- Conséquences mesurées : `npm run check` vert (41 fichiers de bancs). Le
  comportement de production CHANGE — l'abstention passe de `not_evaluated` à
  évaluée, les priorités et l'extinction deviennent productibles dès que leurs
  drapeaux d'exploitation sont posés. Signer n'allume pas : chaque table garde
  son ET avec un drapeau (`WN_ENABLE_ORIENTATION_NNPP2`,
  `WN_ENABLE_CONTRADICTIONS_NNPP2`, `WN_CB_ENABLED`).
- Non fait, et assumé comme tel : T2 et T3 sont injouables dans le conteneur
  distant — `wn-test-worktree.sh` installe les navigateurs Playwright en dur et
  le CDN est refusé par l'allowlist du proxy. Le segment E2E relève du CI
  ([[D-049]]), mais les contrats SQL et la certification scoring de T3 n'ont
  PAS été joués ici. La revue `wn-reviewer` prescrite pour une PR clinique n'a
  pas été lancée non plus.
- Dettes ouvertes : (a) procédure d'abstention à faire entrer dans le
  périmètre signé des priorités ; (b) verrou biologie à renforcer avant toute
  première règle ; (c) T3 et revue `wn-reviewer` à jouer hors de ce conteneur.

### D-060 — Le contrat de déclenchement apprend la disjonction, et un recueil incomplet ne l'allume jamais

- Date : 2026-08-15 · **implémentée et relue le 2026-08-16**
- Statut : accepté (arbitrage utilisateur du 2026-08-15). La sémantique de
  complétude n'est plus « proposée » : la revue `wn-reviewer` du 2026-08-16 a
  tenté de l'ouvrir et n'y est pas parvenue — garde de branche et garde
  statique du moteur d'arrêt sont le même prédicat, au même grain, et un
  plancher ne peut structurellement pas allumer une branche. Le §2 est donc
  **opposable**. Le §5 l'est depuis le même jour, mais il a fallu recâbler cinq
  gardes anti-dérive qui lisaient encore la racine (voir « Ce que la revue a
  trouvé », plus bas).
- Domaine : moteur clinique, contrat de déclenchement, garde de complétude,
  traçabilité
- Contexte : découvert en étendant le panel stress du catalogue biologie au
  BMS-10 (LOT-06). `OrientationDeclencheur` ne sait exprimer **aucune
  disjonction**, à deux niveaux : dans une règle les `declencheurs` sont en ET
  (`tousAtteints`), et deux règles publiées sur un même panel sont traitées
  par `statuts.ts` comme une discordance — le panel bascule
  `non_indique_actuellement` et est écarté (`DC-30`). Six panels du catalogue
  sont écrits « déclencheur X ou Y » et ne sont donc pas implémentables ;
  publier naïvement deux règles les **écarterait** au lieu de les élargir.

  Le manque n'est pas propre à la biologie et il a déjà coûté. La règle sur
  `Q_INF_03` d'`orientationRulesV1.ts` (correction du 2026-08-04) dérivait son
  seuil de la négation de `WN-CL-0136-004`, une conjonction de trois
  conditions dont la négation est une disjonction — « Lagrue ≤ 6 OU HAD ≥ 7 OU
  D ≥ 10 OU S ≥ 10 ». Faute de pouvoir l'écrire, la règle n'a pas été bloquée :
  elle a été **refondée sur un autre appui**, la bande d'entrée de la grille
  certifiée, le commentaire concluant que « le déclencheur ne peut donc pas se
  réclamer de cette négation ». Le manque ne produit pas des règles absentes
  mais des règles dont la provenance naturelle est remplacée par un repli, en
  silence — aucun banc ne le fait rougir.

- Décision : cinq points.

**1. La disjonction entre dans le contrat PARTAGÉ, pas dans un correctif
local (arbitrage utilisateur).** Une variante ne touchant que `statuts.ts` —
plusieurs règles sur un panel cessant d'être une discordance — a été chiffrée
et **écartée** : un fichier au lieu de cinq, mais un « ou » indisponible aux
tables d'orientation, de priorité, d'arrêt et de contradictions. Le motif du
rejet est le périmètre, non le coût : le besoin déborde la biologie, le
précédent `Q_INF_03` le montre.

**2. Un recueil incomplet n'allume jamais une branche (`DC-24`).** Une branche
ne compte que si **son** instrument est complètement recueilli ; la
disjonction est vraie si au moins une branche *complète* est vraie. Sans cette
règle, le OU transformerait la garde de complétude en passoire — il suffirait
d'une branche non recueillie pour la contourner. *Fail-closed* : dans le doute,
la branche ne compte pas.

**3. Aucune imbrication.** Un `ou` ne contient que des déclencheurs feuilles,
jamais un autre `ou`. Contrainte portée par le type quand c'est possible, par
un banc sinon. Motif : une algèbre booléenne complète dans une table de règles
cliniques serait illisible en revue, et la revue est le seul contrôle réel.

**4. La traçabilité ne remonte que la branche atteinte.** `evaluerDeclencheur`
retourne aujourd'hui `string | null` ; trois appelants
(`contradictionsEngine`, `chaineC1`, le moteur d'arrêt) ont besoin de savoir
**laquelle** des branches a été atteinte pour construire leurs sources et
leurs `responseId`. Le retour est donc élargi et tous les appelants repris.
Dupliquer la logique dans un helper parallèle est **exclu** : le commentaire
d'`evaluerDeclencheur` énonce déjà que « les réécrire ailleurs les aurait fait
diverger en silence ».

**5. L'interdit sur `signauxAlerte` survit à l'imbrication.** Un drapeau
d'anamnèse reste refusé comme déclencheur de signal d'alerte, qu'il soit posé
à la racine ou sous un `ou`. Un banc le vérifie explicitement sous
disjonction.

- Conséquences : deux PR. La première porte le type, l'évaluateur, les quatre
  consommateurs et les bancs — ils ne se séparent pas, TypeScript casse à la
  première. Palier T3 et revue `wn-reviewer` (Opus) exigés : on touche une
  garde de sécurité. La seconde reprend les six panels du catalogue biologie
  et la table d'indications. Bancs neufs : OU vrai si ≥ 1 branche complète
  vraie · faux si toutes fausses · faux si la seule branche vraie est sur
  recueil incomplet · un plancher n'allume jamais un OU · la traçabilité ne
  cite que la branche atteinte · pas d'imbrication · `signauxAlerte` refusé
  sous `ou`.
- Écarté : la variante `statuts.ts` seul (périmètre, voir point 1) ; un
  instrument unique par panel (perd le déclenchement quand le patient a passé
  l'autre questionnaire) ; tous les instruments en ET (exigerait que le
  patient les ait tous passés et tous positifs, contraire à l'intention
  clinique).
- Dette ouverte : aucune règle existante n'est réécrite par ce lot. La
  refondation de `Q_INF_03` reste en place ; savoir si elle doit reprendre
  l'appui de `WN-CL-0136-004` une fois la disjonction disponible est un
  arbitrage clinique distinct, à poser séparément.

**Ce que la revue du 2026-08-16 a trouvé, et ce qui en découle.**

**6. `{ou:[X]}` est plus restrictif que `X`, et c'est assumé.** La garde de
complétude par branche ferme deux chemins que la RACINE d'une règle
d'orientation laissait ouverts : un instrument qui ne publie aucun compte (le
Berlin, nommé par `D-053` §4) allume une feuille mais jamais une branche, et le
`bandePlancher` — construit précisément pour rattraper la sévérité sur un
recueil partiel — est inopérant sous `ou`. Conséquence pratique : élargir une
règle existante de `X` à `X ou Y` lui fait PERDRE le déclenchement par plancher
sur `X`.

Le point 2 justifiait le fail-closed par le sur-déclenchement ; l'effet
symétrique — un faux négatif sur les tables non extinctives (orientation,
priorités, biologie) — n'avait pas été nommé. Il l'est ici, et le choix ne
change pas : **fail-closed uniforme**, pas de régime gradué par table. Motif :
un `ou` dont la sémantique dépendrait de la table qui le porte serait
irrelisable en revue, et c'est la revue qui est le seul contrôle réel (même
raisonnement que le point 3 sur l'imbrication). Le coût est borné et visible —
il ne se paie qu'au moment où quelqu'un écrit un `ou`, jamais rétroactivement.
Conséquence opératoire : **on n'élargit pas une règle existante en `ou` sans
vérifier que ses instruments publient leurs comptes**.

**7. Les gardes anti-dérive lisent les FEUILLES, et c'est structurel.** Le
point 5 ne se tenait pas tout seul : cinq gardes filtraient encore sur le type
du déclencheur racine et sautaient un nœud `ou` en silence — dont deux de
sécurité patient (bandes favorables et libellés verbatim des règles d'arrêt).
Une règle d'arrêt écrite sous `ou` aurait pu éteindre une recommandation sur une
bande DÉFAVORABLE sans faire rougir le CI. Toutes sont recâblées sur
`feuillesDuDeclencheur`, et chacune est désormais éprouvée par une règle
fabriquée portant la faute sous une branche — la vérification empirique a été
faite en retirant l'aplatissement : les quatre contre-épreuves rougissent.

**8. Réserve nommée — `MATRICE_CONSOMMATION` sous-déclare la table
d'orientation.** Le compte passe de 7 à 5 surfaces indirectes. Aucune
consommation n'a disparu : `chaineC1.ts` n'a plus besoin d'importer
`OrientationDeclencheur` (les instruments lui sont fournis par
`evaluerPriorites`), ce qui rallonge d'un saut le chemin vers
`api/praticien/protocoles/route.ts` et `.../protocoles/versions/route.ts` et
les fait sortir du graphe borné par `PROFONDEUR_MAX = 3`. Le découplage est un
gain de code ; la perte de justesse de la matrice est réelle et n'a pas de
correctif local — relever la profondeur toucherait toutes les lignes du
document et relève d'un lot dédié.

### D-059 — La biologie devient opérante sans qu'une seule valeur n'entre en base, et le schéma précède le code

- Date : 2026-08-14
- Statut : accepté (deux arbitrages utilisateur du 2026-08-14, cadrage d'ouverture du LOT-06)
- Domaine : clinique, biologie, migrations, courrier médecin, révision de protocole
- Contexte : dernier lot de la campagne « Chaîne T0 opérationnelle ». Le
  squelette biologie existe et est **vide** en production (relu le
  2026-08-14 : `biology_nabm_actes` = 987 lignes de référentiel,
  0 analyte/panel/range, 0 correspondance médecin, aucune table d'arbitrage).
  Le LOT-05 fournit déjà `conditionnelle_biologie` et `waitFor` (aucun bump
  de contrat) ; la mécanique de révision (`supersedesDraftId`,
  `isApprovalStale`) existe en entier ; les drapeaux `isCbEnabled` /
  `isCbResultsEnabled` existent sans appelant. `BiologyPanel` ne porte
  **aucun champ de déclencheur** — et n'en portera pas : la campagne prescrit
  le patron orientation (table TS versionnée + claims + signature + SHA) pour
  la biologie, donc les conditions vivent dans une table signée, pas dans des
  colonnes de catalogue. La migration de schéma se réduit à
  `ArbitrageBiologique`.
- Décision : six arbitrages, les deux premiers tranchés par l'utilisateur.

**1. Le schéma précède le code (arbitrage utilisateur).** La migration de
schéma (`ArbitrageBiologique` + déclencheurs de panels) part en PR SEULE,
relue, puis `release-db` approuvé — **avant** que le moindre code qui s'en
sert ne soit mergé. Aucun code mergé ne référence jamais une table absente.
Coût assumé : deux allers-retours release-db avant tout écran visible.

**2. Le catalogue niveau 1 est proposé, puis validé ligne à ligne (arbitrage
utilisateur).** L'assistant rédige la proposition (socle, glucidique,
lipides, thyroïde, micronutrition, CRPus ; panels conditionnels cœliaque et
hormonal), chaque ligne adossée à un claim **VALIDE relu en production**
(`DC-01`, `DC-26`) — abstention sur ce qu'aucun claim ne fonde (`DC-25`),
jamais un remplissage. Le praticien valide ligne à ligne ; la migration de
DONNÉES ne part qu'après cette validation, en PR séparée.

**3. Sans catalogue publié, le moteur ne propose RIEN.** Même patron que les
quatre décisions précédentes (`D-055`→`D-058`) : le moteur de statuts est
fail-closed sur catalogue vide, avec un motif lisible en français — jamais
une proposition « au cas où » ni un statut déduit d'une table absente.

**4. L'arbitrage biologique ne porte JAMAIS de valeur.** Verdict à trois
états (`confirme | infirme | sans_objet`), note courte OBLIGATOIRE sur
`infirme`, auteur et horodatage posés côté serveur. Le verrou HDS reste
entier : aucune valeur d'analyse en base, contrat SQL négatif étendu.
Résoudre une intention `conditionnelle_biologie` sans arbitrage lié est
impossible.

**5. Les déclencheurs et exclusions de panels vivent dans une TABLE TS
SIGNÉE, au patron orientation** (`orientationRulesV1` : conditions typées sur
zones d'instruments et drapeaux d'anamnèse, claims épinglés par règle,
`validationExterne: false` à la livraison — signer est un geste praticien
séparé). Jamais d'expression libre, jamais une condition évaluée par le LLM
(`D-003`, `DC-26` : les règles cliniques vivent dans une table versionnée et
relue, pas dispersées dans des lignes de base). Le catalogue DB ne porte que
la COMPOSITION des panels (items, niveaux) ; la table signée dit QUAND un
panel est recommandé, conditionnel ou non indiqué. Écart à la fiche assumé et
motivé : elle plaçait `TriggerConditions` dans la migration de données — le
patron de campagne (« réutilisé partout ») et `DC-26` commandent la table
signée. Un déclencheur non rempli s'affiche `conditionnel` avec sa condition
— pas absent, pas refusé en silence.

**6. Le courrier médecin passe par le chokepoint existant.** Rendu via
`rendu.ts` (destinataire médecin), donc sous
`assertRenduMedecinNonPrescriptif` — pas de second chemin de rendu ;
consignation par `preparerCorrespondance` existant. Remise manuelle en V1,
aucun envoi automatique.

- Dettes nommées, non résolues ici : « aucune ligne de catalogue sans
  claim » n'est imposé par le schéma QUE sur `BiologyFunctionalRange` et
  `BiologyAnalyteLink` — pour les panels, la garantie viendra de la
  proposition validée et du contrat SQL, pas d'une contrainte NOT NULL
  (à réexaminer si le catalogue s'ouvre à d'autres auteurs) ; la saisie de
  valeurs biologiques reste hors périmètre (décision HDS préalable, backlog).
- Conséquences : au merge du lot, rien ne s'allume tant que la release de
  schéma n'est pas approuvée ET que le catalogue n'est pas peuplé — deux
  portes humaines distinctes, dans cet ordre.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie/lots/LOT-06-biologie-revision.md`,
  `web/src/lib/biology-library/`, `web/prisma/checks/cb_biologie_*.sql`,
  `docs/claude/handoffs/2026-08-14-2255-lot06-ouverture-biologie.md`

### D-058 — Ce qu'un delta a le droit d'affirmer, et pourquoi « stable » ne se déduit pas d'un zéro

- Date : 2026-08-13
- Statut : accepté (décision utilisateur du 2026-08-13, arbitrage d'ouverture du LOT-07)
- Domaine : clinique, momentum longitudinal, restitution praticien
- Contexte : le LOT-07 doit donner au praticien un **momentum par domaine**
  (digestif, alimentaire, mouvement, sommeil, adaptation) au lieu du seul delta
  d'un scalaire agrégé, et rendre les jalons J21/J42/J90 confirmables depuis
  l'interface. Sa fiche laisse une question ouverte, et elle commande tout le
  reste : les **bandes de bruit par variable**, sous lesquelles un écart se lit
  « stable » plutôt qu'un mouvement. Aucune source du dépôt ne les fixe. Cette
  décision précède la première ligne de code (`DC-17`, `DC-18`).
- Fait relu dans le code avant d'écrire : `calculerDeltaMomentum`
  (`equilibre/momentum.ts:36`) rend déjà `tendance: 'stable'` — **mais
  uniquement sur un delta exactement nul**. Deux mesures qui tombent au
  centième près produisent « stable » ; un écart d'un centième produit
  « hausse ». Ce n'est pas un jugement de bruit, c'est une coïncidence
  arithmétique présentée comme un constat. Le mot est déjà là ; ce qui manque,
  c'est ce qui le fonderait.
- Décision : quatre arbitrages.

**1. Sans bande publiée, le momentum par domaine ne QUALIFIE pas.** Il rend le
delta factuel — la mesure existe, elle est réelle — et refuse de dire
« stable » comme « en mouvement », avec un motif lisible en français plutôt
qu'un silence. Publier une bande pour une variable est un **acte séparé**, de
la même famille que les trois signatures en attente. Le mécanisme est livré, la
permission ne s'ouvre pas d'elle-même : c'est la quatrième fois de la journée
(`D-055`, `D-056`, `D-057`), et c'est la même raison — un chiffre qui décide
d'une lecture clinique n'apparaît pas parce qu'il fallait bien en mettre un
(`DC-19`, `DC-20`).

Ce qui aurait été plus rapide et qui est refusé : reprendre le `> 0 / < 0 / = 0`
du scalaire. Il ne coûte rien à écrire et il rend un verdict sur tout écart,
si petit soit-il — donc il transforme le bruit de mesure en tendance clinique,
exactement sur l'écran où le praticien vient chercher si son protocole agit.

**2. Un domaine non re-mesuré n'a pas de momentum.** Ni zéro, ni « stable », ni
absence silencieuse : il est nommé non mesuré. Un J21 où seul le TFD a été
repassé rend un momentum digestif et rien d'autre — et surtout ne laisse pas
croire que le sommeil est resté stable parce que personne ne l'a mesuré
(`DC-24`). C'est la règle qui justifie à elle seule le passage du scalaire
agrégé aux domaines : un agrégat mélange ce qui a bougé et ce qui n'a pas été
regardé.

**3. Le momentum scalaire existant ne change pas.** Ses consommateurs actuels
le lisent avec sa sémantique actuelle, `'stable'` à delta nul compris ; le
modifier ferait dériver des restitutions déjà servies sans que le LOT-07 l'ait
demandé. Mais **cette sémantique ne s'étend pas** au momentum par domaine, et
la tautologie du zéro est **nommée ici comme dette** plutôt que reconduite en
silence : le jour où une bande sera publiée, c'est elle qui devra décider aussi
pour le scalaire.

**4. Aucune interprétation clinique automatique d'un delta.** Une tendance est
factuelle : « en baisse de 4 points » et jamais « amélioration significative ».
Le mot « significatif » appartient à un test statistique qu'aucun banc ne fait
tourner ici, et « amélioration » suppose une direction souhaitable qui dépend
de la variable (`DC-27` : association n'est pas causalité). La re-passation au
jalon reste une **proposition** dérivée des `mesures[]` du protocole, jamais un
envoi automatique — geste praticien, comme toute assignation.

- Dettes nommées, non résolues ici : la **tautologie du zéro** sur le scalaire
  (arbitrage 3) ; le **peuplement des fixtures E2E** du parcours nominal T0
  (dette du LOT-02 rattachée à ce lot) — les trois patients fictifs autorisés
  sont tous centraux, et en peupler un déplace `orientation-file-envoi`,
  `fiche-detail-reponses`, la capture pixel de `visual.spec.ts` et
  `seedCertification.guard.test.ts` ; le **multi-cycle T1/T2** et les **poids
  déclaratifs**, tous deux au backlog nommé.
- Conséquences : le praticien voit, dès le merge, des jalons confirmables et
  des deltas par domaine ; il ne verra « stable » sur aucun domaine tant
  qu'aucune bande n'aura été publiée. Aucun changement de `versionScore`,
  aucune grille touchée, aucun momentum entre cycles ni entre versions de score
  — les gardes existantes sont préservées.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie/lots/LOT-07-jalons-momentum.md`,
  `web/src/lib/equilibre/momentum.ts`, `web/src/lib/fil/momentumJ21.ts`,
  `web/src/lib/protocol/trajectoire.ts`,
  `docs/claude/doctrine/CONSTITUTION_CLINIQUE.md`

**Amendement du 2026-08-14** (revue `wn-reviewer` du LOT-07, avant merge — une
décision opposable ne se corrige pas dans un commentaire de module) :

- **Arbitrage 4, cible de la re-passation** : la cible ne se dérive **pas** des
  `mesures[]` du protocole — ce champ, tel que le LOT-05 l'a écrit, est du
  texte libre (« Agenda rempli au moins 14 jours sur 21 »), rien de mécanique
  ne s'en déduit sans deviner. Elle se dérive de `provenance.needIds` de la
  priorité **visée** (sélectionnée par le praticien quand elle existe, à défaut
  proposée par la carte), via la table signée `BESOIN_SOURCES`
  (`repassationCiblee.ts`) : aucune correspondance nouvelle n'est inventée
  (`DC-19`, `DC-26`). Le reste de l'arbitrage tient — proposition via la file
  d'envoi, jamais un envoi automatique.
- **Ancre des jalons, unique** : un jalon post-T0 se fenêtre sur le
  `confirmedAt` du T0 confirmé le plus récent — l'ancre de la trajectoire
  (LOT-08, A8-1). Le cockpit (`resoudreJalonDu`) et le serveur
  (`proposeRuntimeEpisode` via `ancreCycleCourant`) partagent bornes et
  tolérance à la milliseconde ; un banc de contrat inter-couches le tient. Le
  T0 initial reste ancré sur la première réponse du dossier — aucun cycle
  confirmé ne le précède.
- **Pas de garde de version intra-cycle** sur le momentum par besoin : les deux
  lectures d'une série sont toujours recalculées par le moteur courant, aucune
  soustraction inter-versions n'existe par construction. Une garde d'étiquette
  (versionScore figé vs constante) aurait affiché « non re-mesuré » sur des
  besoins re-mesurés — l'inverse de `DC-24` — pour tout cycle antérieur au bump
  v14/v15. La garde A8-3 reste inter-cycles (`resoudreComparaison`).
- **Dettes ajoutées** : `DC-41` (réserver l'axe tolérance — un momentum
  favorable ne se lit pas comme un succès de protocole) n'est ni livré ni
  gardé ; la sélection praticien d'une priorité (`selectedMainPriority`) n'a
  **aucun producteur** — la re-passation vise la priorité proposée tant qu'il
  n'existe pas, et reste inerte tant que la table des priorités n'est pas
  signée ; Q_SOM_09 (agenda du sommeil, 21 nuits) figure parmi les cibles
  proposables à J21 alors que sa mesure ne se rend qu'au voisinage du J42 —
  laissé à l'arbitrage praticien, rien ne part automatiquement.

### D-057 — Ce qu'une discordance a le droit de dire à la synthèse, et ce que « présente en tête » ne prouve pas

- Date : 2026-08-13
- Statut : accepté (décision utilisateur du 2026-08-13, trois arbitrages tranchés à l'ouverture du LOT-09)
- Domaine : clinique, moteur de contradictions, synthèse IA, garde de restitution
- Contexte : l'étape 5 du LOT-01 avait deux moitiés. Le câblage cockpit des
  contradictions est livré ([[D-050]]) ; **l'injection des vigilances dans la
  synthèse ne l'est pas**. Elle a été renvoyée le 2026-08-12 sans lot d'accueil,
  rattachée au LOT-05, puis ressortie le 2026-08-13 quand ce lot a été clos sur
  un diff d'une seule finalité. Le LOT-09 est cet accueil, et cette décision
  précède sa première ligne de code (`DC-17`, `DC-18`).
- Fait relu dans le dépôt le 2026-08-13, et il réduit le lot : **rien de
  clinique n'est à rédiger.** `ContradictionAffichee.description` est déjà « la
  formulation neutre produite par le déterministe, jamais reformulée ici » ;
  `constatsContradictionsPourDossier` produit les constats verrou compris (il a
  été extrait au LOT-08 pour `orientationService`) ; `fusionnerVigilance`
  fusionne déjà et sert les vigilances d'anamnèse ; et la route porte déjà les
  données — `reponsesAdministrables` a exactement la forme
  `LignePassationDossier`, `consultation.anamnese` est lue dans le même bloc.
  Aucune lecture base supplémentaire, aucun texte nouveau (`DC-19`).
- **Effet en production : nul au merge.** `contradictionsActives()` exige le
  drapeau **et** `tableSignee()`, et `CONTRADICTIONS_METADATA.validationExterne`
  vaut `false` — la table n'est pas signée. Troisième lot d'affilée sans effet
  servi, et le dire ici évite qu'on le découvre en cherchant un changement
  absent.
- Décision : trois arbitrages.

**1. Seuls les constats OUVERTS deviennent vigilance, au prédicat PARTAGÉ.**
Non pas « le même critère » recopié, mais `contradictionEstOuverte`, la
fonction unique qu'appelle aussi le moteur d'arrêt ([[D-053]] §5, [[D-055]]).
La première rédaction du lot le paraphrasait en `statut !== 'resolue'` et
omettait l'exclusion des convergences que le moteur applique : une règle
`CONVERGENCE` publiée aurait été servie au praticien sous l'intitulé
« discordance » tout en laissant l'extinction possible. Défaut trouvé en revue,
avant la signature de la table, et refermé à la racine — il n'y a plus qu'une
écriture du critère. Escalade praticien comprise dans « ouvert ». Deux motifs, et le second pèse plus que le premier. Un critère : deux
définitions d'« ouvert » dans le même dépôt divergeraient en silence, et le même
constat bloquerait l'extinction sans atteindre la synthèse, ou l'inverse. Une
raison clinique : un constat que le praticien a explicitement résolu, resservi à
chaque synthèse, apprend à survoler le bloc de vigilances — et une vigilance
qu'on apprend à survoler ne protège plus rien. Aucun plancher d'importance n'est
posé : [[D-048]] refuse déjà qu'`importance` serve à décoter un constat, et
aucune source ne fonde un tel seuil (`DC-19`, `DC-20`).

**2. La vigilance porte la description ET l'action suggérée, reprises telles
quelles.** `DC-30` énumère l'objet minimal d'une discordance — « sources,
description, importance, hypothèses, action suggérée, résolue ou non » — et
livrer le constat sans sa suite laisse le praticien devant une alerte sans
issue, tout en laissant le modèle libre de proposer la sienne : précisément ce
que l'injection déterministe existe pour empêcher. Les deux champs sont repris
**mot pour mot** ; ce moteur ne reformule pas ce qu'il transporte. Les
passations datées restent au cockpit, où elles s'ouvrent : les recopier dans le
bloc de vigilances l'alourdirait à chaque constat sans rien rendre de plus
vérifiable.

**3. La fusion garantit la PRÉSENCE, pas la FIDÉLITÉ — un garde mesure la
seconde.** `fusionnerVigilance` met la vigilance déterministe en tête et
l'empêche d'être supprimée. Elle n'empêche pas le modèle de la contredire trois
paragraphes plus bas, et le praticien lirait alors deux affirmations opposées
dont une seule est déterministe. Un contrôle reprend le patron d'adjacence de
[[D-055]] et **journalise** — jamais de censure, même régime que ses deux
prédécesseurs : l'objet actionnable vient de la route déterministe, donc une
prose infidèle ne déclenche rien. Ses contrôles négatifs comptent autant que ses
positifs : la revue adversariale du 2026-08-03 a déjà montré qu'un garde trop
large accuse la prose clinique ordinaire et noie son propre signal.

La première version l'a démontré une fois de plus, et pire : **son bruit était
corrélé à la fidélité**. « incohérent » contient « cohérent », « n'est pas
confirmé par » contient « confirmé par » — six phrases mesurées sur sept qui
restituaient CORRECTEMENT la discordance étaient accusées, et ces écarts sont
persistés en base comme fait d'audit. Deux corrections : le marqueur doit
ouvrir un mot, et il ne doit pas être nié. Le garde s'exclut en outre de sa
propre entrée, faute de quoi le déterministe finirait par s'accuser lui-même
dès qu'une règle citera ses instruments par identifiant.

Sa portée reste **étroite et il faut le dire** : le modèle ne reçoit pas la
discordance dans son prompt, il n'a donc guère de raison de citer des
identifiants d'instrument au voisinage d'une affirmation de concordance. Le
garde est un filet, pas le mécanisme principal — l'injecter dans la consigne
serait ce mécanisme, et c'est une dette nommée, pas ce lot.

**4. Une discordance ne sort pas du praticien.** Le constat déclare
`audience: 'praticien_seul'` ; converti en chaîne de `points_de_vigilance`, il
perdait cette audience et héritait du destinataire **médecin** du bloc
« vigilance » — donc du courrier au médecin traitant, un document SORTANT.
L'élargissement se faisait par effet de bord d'un field-filter existant, sans
qu'aucune décision ne l'ait dit. Il est refermé : le bloc d'une vigilance de
discordance ne porte que le destinataire praticien, et un banc symétrique de
celui du patient fige la porte. Les vigilances d'anamnèse, elles, gardent leur
régime — ce sont les propos du patient, pas un constat entre instruments.

- Dettes nommées, non résolues ici : **injecter la discordance dans la consigne
  de synthèse**, ce qui empêcherait le modèle de la contredire par ignorance et
  rendrait au garde son rôle de filet (bump de consigne, hors de ce lot) ;
  **l'écart dossier ↔ épisode** que [[D-050]]
  laisse ouvert — le moteur de contradictions évalue le **dossier entier** alors
  que `review` porte sur l'épisode T0, si bien qu'un constat peut reposer sur
  une passation laissée hors de l'épisode. Ce lot ne l'aggrave pas (il consomme
  la même source que le cockpit et le moteur d'arrêt, sans élargir sa portée) et
  ne le referme pas : le refermer suppose d'arbitrer ce qu'est le périmètre
  légitime d'une discordance, ce qu'aucune source du dépôt ne tranche.
- Conséquences : la synthèse praticien porte les discordances ouvertes dès que
  la table sera signée ; d'ici là, `contradictionsActives()` rend faux et rien
  n'est ajouté. La signature reste un acte praticien distinct, hors de ce lot.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie/lots/LOT-09-vigilances-discordance.md`,
  `web/src/lib/clinical/contradictionsService.ts`,
  `web/src/app/api/praticien/synthese/route.ts`,
  `web/src/lib/clinical/verifierRestitutionOrientation.ts`,
  `docs/claude/doctrine/CONSTITUTION_CLINIQUE.md`

### D-056 — Ce qu'une intention de complément exige avant la biologie, et pourquoi un catalogue vide doit refuser

- Date : 2026-08-13
- Statut : accepté (décision utilisateur du 2026-08-13, arbitrage de cadrage du LOT-05)
- Domaine : clinique, contrat de protocole, rayon compléments (C4), garde de restitution
- Contexte : le LOT-05 doit permettre une prescription-conseil de compléments
  fondée sur claims **avant** la biologie, marquée provisoire et résolue par
  l'arbitrage du LOT-06. La spec (Lot E, `sources/02-spec-lots-parcours-t0.md`)
  en pose quatre conditions cumulatives, dont trois interrogent le catalogue de
  décision C4. Cette décision précède la première ligne de code du lot
  (`DC-17`, `DC-18`).
- Fait relu en production le 2026-08-13 (`execute_sql`, lecture seule) : la
  couche **matière** du catalogue est peuplée — `supplement_ingredients` 3 444,
  `supplement_products` 140 148 — et la couche **décision** est *entièrement
  vide* : `clinical_rules` 0, `clinical_intent_tags` 0,
  `supplement_source_references` 0, `supplement_safety_alerts` 0,
  `ingredient_functional_thresholds` 0, `functional_categories` 0. Aucun seed
  ne les peuple. `clinical_rules` porte en outre des clés étrangères non nulles
  vers `clinical_intent_tags` et `supplement_source_references` : aucune règle
  ne peut naître avant que ces deux tables ne soient publiées.
- Lecture de ce fait avant d'écrire : la condition 1 (règle C4 validée) est
  **insatisfiable**, et les conditions négatives de la condition 2 (« aucune
  alerte active », « seuils fonctionnels respectés ») sont **vraies par
  vacuité** — elles passeraient parce que les tables sont vides, non parce que
  le complément est sûr (`DC-24` : une donnée absente n'est jamais zéro ni
  normale). C'est le quatrième exemplaire d'un motif déjà corrigé trois fois :
  le `VALID` tautologique ([[D-052]]), le `group_majority` muet ([[D-053]],
  [[D-055]]), et `[]` lu « aucun conflit » là où il faut lire « rien n'a été
  examiné » (#482, #489).
- Décision : six arbitrages, rendus ensemble.

**1. Le lot livre le moteur, pas la permission.** La règle de décision
« compléments avant biologie » est écrite, testée sur fixture et branchée ;
elle reste **structurellement incapable de produire une intention en
production** tant que le catalogue de décision n'est pas publié. Le lot ne
peuple pas ce catalogue : son hors-périmètre le dit déjà (« le lot consomme
l'atelier règles existant »), et le remplissage — tags d'intention, références
sources, seuils fonctionnels, alertes de sécurité — est un travail de contenu
clinique sourcé exigeant des claims certifiés et une validation praticien
(`DC-01`, `DC-02`, `DC-19`). Il relève d'un lot clinique distinct, nommé ici
comme dette et non résolu par du code. Un moteur juste qui ne peut rien dire
vaut mieux qu'un moteur qui dit oui faute d'avoir regardé.

**2. Les conditions négatives sont inversées en fail-closed.** L'absence
d'information ne vaut jamais autorisation. La condition 2 de la spec se lit
désormais en deux étages, distincts parce que les deux tables ne se lisent pas
de la même manière :

- **Alertes de sécurité** — garde au niveau du *catalogue*. Qu'un ingrédient ne
  porte aucune alerte est le cas normal et ne prouve rien à lui seul ; ce qui
  fait preuve, c'est que le catalogue d'alertes soit **publié**. Catalogue
  d'alertes non publié ⇒ refus, pour tout ingrédient, sans exception.
- **Seuils fonctionnels** — garde au niveau de l'*ingrédient*. Sans seuil actif
  publié sur l'ingrédient visé, « seuils respectés » n'est pas une conclusion
  mais une absence de vérification : la borne de dose cible portée par la règle
  n'est comparable à rien. Aucun seuil actif sur l'ingrédient ⇒ refus pour cet
  ingrédient.

Aucun de ces refus n'est silencieux : chacun rend un motif lisible en français,
distinct de « pas d'obstacle constaté » (`DC-34`, `DC-35`). Un refus faute de
catalogue n'est pas une contre-indication et ne se restitue jamais comme telle.

**3. La sentinelle existante est le point d'ancrage — on n'écrit pas une
seconde primitive.** `sentinelleADeQuoiConclure` (`sentinelle.ts:78`) énonce
déjà ce fait exact et existe pour lui : elle rend faux tant qu'aucune règle
validée n'atteint le moindre ingrédient. La règle de décision l'appelle ;
`evaluerSentinelle` conserve son fail-closed de flag (`WN_C4_ENABLED`), qui
reste un **second verrou indépendant** — même catalogue publié, le rayon reste
clos sur un environnement où le flag n'est pas ouvert. Correction documentaire
au passage, sans changement de logique : le commentaire de cette fonction
affirme que `clinical_intent_tags` « est peuplée » ; la production dit 0. Les
deux tables sont vides, et le commentaire est remis à l'état réel.

**4. Le déclencheur reste le tableau clinique, jamais un score seul.**
Condition 3 de la spec, inchangée et désormais gardée : besoin dégradé +
plainte + anamnèse. Un axe DNST ne déclenche aucune intention de complément,
seul ou combiné à un autre axe. Test négatif dédié sur tyrosine et mélatonine —
les deux cas où la tentation est la plus forte. `DC-27` (score ≠ diagnostic),
`DC-28` (un questionnaire isolé ne suffit pas à conclure).

**5. `conditionnelle_biologie` n'est pas une recommandation, et la restitution
doit le rendre impossible à lire ainsi.** Une intention en attente de bilan
n'apparaît ferme ni au praticien ni au patient ; le patient la lit « en attente
de confirmation par votre bilan », formulation non anxiogène. La garde de
restitution est étendue sur le patron de [[D-055]] (éteinte ≠ recommandée) :
le LLM ne peut nommer aucun complément absent des intentions déterministes, et
ne peut pas non plus promouvoir une intention conditionnelle en conseil ferme.
L'approbation de diffusion praticien reste requise, inchangée (`D-003`).

**6. Contrat versionné en V4, aucune migration.** Phases, statut
d'intervention et `waitFor` entrent dans le payload JSON versionné :
`c1-protocol-draft-v4`, à côté des V1 à V3 existantes. Aucune modification de
`schema.prisma`, aucune migration Prisma — le lot n'en a pas besoin, et la
règle de la campagne interdirait d'y faire voyager le code qui en dépend. La
garde `FORBIDDEN_SUPPLEMENT_FIELDS` (`protocolDraft.ts:17`) est étendue aux
nouveaux statuts : ni produit, ni forme, ni dose, ni marque en texte libre,
quel que soit le statut de l'intention.

- Dette nommée, non résolue par ce lot : (a) le **peuplement du catalogue de
  décision C4**, préalable réel à toute intention de complément en production —
  arbitrage 1 ; (b) `DC-39` (« une modification à la fois »), que la fiche de
  lot porte sans l'avoir au périmètre : distinguer les interventions
  compatibles simultanément de celles à tester séquentiellement est un
  arbitrage clinique par type d'intervention, à instruire depuis des sources,
  jamais à déduire (`DC-19`) — aucune ligne de code ne le devine, et ce lot ne
  le devine pas ; (c) l'injection des **vigilances** de synthèse, moitié non
  livrée de l'étape 5 du LOT-01, reprise ici sous la même garde LLM : une
  vigilance déterministe n'est pas censurable par une sortie de modèle.
- Conséquences : le LOT-05 est livrable et vérifiable sur fixture ; en
  production, la règle de décision refuse, avec motif, jusqu'à publication du
  catalogue. Aucune interprétation réellement servie aujourd'hui n'est déplacée
  par ces arbitrages — il n'y a aucune intention de complément en production à
  déplacer. Le LOT-06 (arbitrage biologique) reste le résolveur des intentions
  `conditionnelle_biologie` ; il hérite du même refus fail-closed tant que le
  catalogue est vide.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie/lots/LOT-05-protocole-complements-claims.md`,
  `sources/02-spec-lots-parcours-t0.md` (Lot E),
  `web/src/lib/supplement-library/sentinelle.ts`,
  `web/src/lib/clinical-engine/types.ts`,
  `web/src/lib/clinical/verifierRestitutionOrientation.ts`,
  `docs/claude/doctrine/CONSTITUTION_CLINIQUE.md`

### D-055 — Ce qu'un moteur muet doit publier pour qu'une extinction devienne possible, et ce qui l'interdit

- Date : 2026-08-13
- Statut : accepté (décision utilisateur du 2026-08-13, approbation du plan du LOT-08)
- Domaine : clinique, moteur de scoring (`group_majority`), règles d'arrêt, garde de restitution
- Contexte : le LOT-03 a livré STOP-STR inerte, et l'a écrit ([[D-053]],
  arbitrage 8) : son déclencheur porteur `Q_STR_01` passe par `group_majority`,
  qui ne publie aucun compte de recueil, et `totalSousScore` rend un total dès
  un item par groupe — trois réponses sur vingt et une produisaient la bande la
  plus favorable de la grille. La garde de complétude du moteur d'arrêt refuse
  donc d'éteindre, à raison. S'y ajoutent deux dettes nommées par [[D-053]] :
  le §5 (« une contradiction ouverte interdit l'extinction ») n'a aucun code,
  et le garde de restitution ne distingue pas une cible éteinte d'une cible
  recommandée. Le LOT-08 lève ces trois verrous ; cette décision précède sa
  première ligne de code (`DC-17`, `DC-18`).
- Fait relu en production le 2026-08-13 (`execute_sql`) : **une seule
  passation `Q_STR_01`**, sans `rawAnswers` — donc déjà inerte pour tout
  raisonnement recalculé (motif 1 de `scoresRecalculesPourRaisonnement`), et
  son instantané stocké n'est pas réécrit. Les arbitrages ci-dessous ne
  déplacent **aucune** interprétation réellement servie aujourd'hui.
- Décision : six arbitrages, rendus ensemble.

**1. `group_majority` publie `missing` et `repondus` à la racine, et rien
d'autre.** C'est la forme « moteurs à score global » que `comptesDuRecueil`
(`orientationEngine.ts`) sait déjà lire, celle de `sum`, `psqi` et `tfd`.
**Aucun champ nouveau n'atteint le prompt, donc aucun bump de consigne** — le
motif exact, corrigé en revue (M11) : la consigne ne décrit `items`/`repondus`
que sous les sous-scores, mais `sum` publie `missing`/`repondus` à la racine
depuis #561 et l'ensemble admis du banc de consigne les contient déjà. Les
comptes sont sommés depuis `totalSousScore` par groupe, jamais recopiés d'une
déclaration. Pas de comptes par groupe : aucun consommateur ne
les lit — un groupe entièrement vide rend déjà `total: null`, et le bloc
« groupe dominant » n'est atteint que sur un total global non nul, donc sur
trois groupes mesurés. Une note de recueil partiel dit le trou en français
(patron `tfd`), en s'ajoutant à la note existante de l'instrument sans
l'écraser.

**2. `total` ne change pas ; la bande tombe sur recueil partiel.** Le total
reste servi tel quel : c'est une mesure réelle, biaisée vers le bas, et
d'autres consommateurs le lisent — le partage exact de `tfd`. La bande
(`interpretation`, et avec elle `dominant` et `protocol`) n'est plus servie que
sur recueil complet (`missing === 0`) : une grille calibrée sur vingt et un
items ne se lit pas sur trois, et la bande fabriquée était la plus favorable,
affichée sur la fiche praticien — même classe que le PSQI et le TFD, fermée par
les mêmes précédents. Pas de `bandePlancher` pour `group_majority` : aucune
règle d'orientation publiée ne lit cette bande, et un plancher — garantie
basse — ne peut par construction jamais garantir la bande favorable qu'exige
une extinction ; ce serait du code mort qu'aucune mutation ne ferait rougir.

**3. La garde de complétude du moteur d'arrêt refuse « muet OU incomplet »,
explicitement.** Elle refusait un porteur sans comptes lisibles ; elle refuse
désormais aussi, dans la même garde, un porteur dont les comptes disent un
manquant. Le refus sur recueil partiel était déjà obtenu par ricochet — la
garde générale d'`extraireCible` retire la mesure, le déclencheur ne mord pas —
mais une extinction ne se refuse pas par ricochet : la borne se lit dans le
moteur d'arrêt lui-même. Fail-closed renforcé, jamais desserré ; aucune valeur
clinique n'entre.

**Et elle lit AU GRAIN DU DÉCLENCHEUR — fait découvert en écrivant le banc de
bout en bout, pas en relisant le code.** La garde lisait les comptes à la
RACINE du porteur pour tous les déclencheurs ; or les moteurs à sous-scores
(`subscore` — le DASS-21, deux des quatre déclencheurs de STOP-STR) ne
publient aucun compte racine, leur complétude vivant sur chaque axe
(`repondus`/`items`). Un déclencheur sur `Q_STR_04/S` échouait donc la garde
même sur une passation complète : publier les comptes de `Q_STR_01` n'aurait
fait que déplacer le verrou d'un instrument à l'autre, et la signature aurait
été un geste vide une seconde fois. La garde lit désormais l'axe visé quand le
déclencheur en vise un, la racine sinon, avec la résolution d'axe
d'`extraireCible` (l'id prime sur le libellé) ; axe introuvable ⇒ illisible ⇒
refus, jamais un repli sur la racine.

**4. « Contradiction ouverte » ([[D-053]] §5) : un constat du moteur de
contradictions dont `resolution.statut !== 'resolue'`, sur le DOSSIER entier.**
`ouverte` et `escaladee_praticien` bloquent toutes deux — une escalade est une
discordance que personne n'a tranchée, pas une discordance résolue. Le
périmètre est le dossier, pas l'axe : aucun vocabulaire d'axe n'existe sur ces
tables, et en inventer un serait une structure clinique nouvelle sans source ;
bloquer plus large ne peut que raréfier l'extinction, c'est le sens du
fail-closed ; et en V1, C-STR (seule contradiction publiée) et STOP-STR (seule
règle d'arrêt) portent le même axe — les deux lectures coïncident, l'arbitrage
se rouvre si des contradictions d'autres axes gênent un jour réellement.
L'écart [[D-050]] (le moteur de contradictions évalue le dossier là où `review`
porte sur l'épisode T0) est constaté, non refermé : l'orientation raisonne
elle-même sur les dernières passations du dossier. Le blocage n'existe que si
le système de contradictions est actif (`contradictionsActives()` : drapeau ET
table signée) — un système éteint ne produit aucun constat, donc rien
d'« ouvert » ; c'est la hiérarchie de verrous déjà en place, pas un verrou
nouveau. **Le sens unique est garanti par construction** : les constats ne sont
lus que pour interdire l'extinction, jamais pour la déclencher ni pour toucher
une recommandation (`DC-30`) — un banc compare les deux sorties. Précision de
revue (M8), figée par banc avant que les formes vides soient peuplées : une
`CONVERGENCE` non résolue ne bloque PAS — un accord de sources n'est pas une
contradiction ; seules `DISCORDANCE` et `CONFLIT_SOURCES` interdisent.

**5. Le garde de restitution distingue éteinte et recommandée, lexicalement,
et journalise.** Même régime que le garde existant : log `warn`, jamais de
censure — l'objet actionnable vient de la route déterministe, pas de la prose.
Le critère est décidable parce que le vocabulaire l'est : autour de chaque
citation d'une cible, une fenêtre de caractères normalisés (patron de
l'adjacence « pack ») est fouillée pour un petit vocabulaire fermé de marqueurs
d'extinction — famille « étein- », « extinction », « pas d'objet », « pas/plus
nécessaire », « plus lieu », et le libellé servi (`LIBELLE_EXTINCTION`). Ces
marqueurs sont ceux que la consigne v25 impose déjà au modèle (« dis qu'elle
n'est pas nécessaire en l'état, et reprends le motif d'arrêt ») : **aucun bump
de consigne**, et deux bancs les tirent des textes de production eux-mêmes —
reformuler `LIBELLE_EXTINCTION` ou le motif de STOP-STR sans réviser le
vocabulaire rougit. La fenêtre est ASYMÉTRIQUE, sur mesure et non sur
intuition : 200 en amont, 420 en aval — le motif de STOP-STR, que la consigne
fait citer après la cible, porte son unique marqueur à ~235 caractères
normalisés de sa tête, et une fenêtre symétrique de 200 accusait la
restitution la plus fidèle possible (trouvé par le banc dérivé du motif). Deux sens : une cible éteinte citée sans marqueur proche est un
écart (présentée comme courante) ; une cible recommandée vivante citée avec
marqueur proche est un écart (présentée comme éteinte). Les angles morts — une
paraphrase sans marqueur, deux cibles dans la même fenêtre — sont documentés en
tête de module, comme ceux du garde d'origine : un garde borné et honnête vaut
mieux qu'une garantie prétendue.

**6. Rien d'autre ne bouge.** Aucun seuil, bande ou valeur clinique nouveau
(`DC-19`, `DC-20`) ; aucune migration, rien de persisté ; la table d'arrêt
reste **non signée** — la production ne change pas au merge, et la signature
demeure l'acte praticien séparé que [[D-053]] décrit (étape 6 du lot,
confirmation distincte, après relecture du bloc « à connaître avant de
signer » de `stopRulesV1.ts`).

- Conséquence latérale, nommée puis COMPLÉTÉE en revue (B1) : « Mon équilibre »
  lit les comptes racine (`extraireValeurBrute`, `equilibre/score.ts`) et
  `Q_STR_01` y sert le **besoin 9** — une FONDATION CRITIQUE — en échelle
  inversée (`inverser: true`). Un recueil partiel y produisait une valeur
  biaisée bas, donc un bien-être surestimé après inversion ; il vaut désormais
  « non mesuré ». L'effet va dans les deux sens : un `Q_STR_01` partiel et déjà
  sévère (`total >= 28`, seule source répondue) effondrait le besoin 9 et
  plafonnait le score global à 50 — le rendre non mesuré lève ce plafond, et le
  score REMONTE. C'est un changement de définition du besoin :
  `VERSION_SCORE_EQUILIBRE` est bumpée **v12/v13 → v14/v15**, comme aux deux
  précédents de la même classe (PSQI/besoin 5 → v10/v11, TFD/besoin 4 →
  v12/v13), doctrine dans `constants.ts` et banc « le plafond de fondation
  critique tombe » dans `score.test.ts`. Stock de production nul (une
  passation, sans `rawAnswers`) — mais les deux précédents ont bumpé sur un
  stock aussi mince : c'est le FLUX que l'étiquette gouverne.
- Conséquences : `web/src/lib/questions.ts` (moteur `group_majority`),
  `web/src/lib/clinical/orientationEngine.ts` (garde d'arrêt, entrée
  `contradictions`), `web/src/lib/clinical/orientationService.ts` (câblage des
  constats), `web/src/lib/clinical/contradictionsService.ts` (helper partagé,
  même verrou), `web/src/lib/clinical/verifierRestitutionOrientation.ts` et
  `api/praticien/synthese/route.ts` (listes éteintes/recommandées). Bancs à
  chaque étage, dont le cas « trois items sur vingt et un » en vrai
  `calculateScore`.
- Alternatives écartées : des comptes par groupe (aucun lecteur, et le contrat
  du prompt exigerait de décrire des champs que personne ne consomme) ; retirer
  ou nuller `total` sur recueil partiel (le total partiel est une mesure réelle
  que d'autres consommateurs lisent — c'est la bande qui ment, pas le nombre) ;
  une `bandePlancher` pour `group_majority` (code mort pour une règle d'arrêt,
  cf. arbitrage 2) ; un blocage d'extinction par axe (vocabulaire d'axe
  inexistant, arbitrage 4) ; un bump de consigne pour imposer un marqueur
  canonique (la v25 induit déjà les marqueurs retenus ; bumper serait un acte
  visible sans gain de garde).
- Dettes reconduites, sans les redécouvrir : borne d'ancienneté de l'exclusion
  `dejaRepondu` (question ouverte de campagne, aucun chiffre fondé) ;
  complétude du moteur Berlin (`Q_SOM_03`), préalable à toute reprise de
  STOP-APN ; régénération des synthèses historiques ([[D-053]] §6, hors
  campagne) ; le garde de restitution reste journalisant, pas bloquant — en
  faire un rejet serait un arbitrage nouveau sur le coût d'un faux positif.

### D-054 — Ce qu'une priorité candidate a le droit d'affirmer, et qui recalcule la chaîne

- Date : 2026-08-12
- Statut : accepté (décision utilisateur du 2026-08-12)
- Domaine : clinique, chaîne C1, cockpit praticien, intégrité de persistance
- Contexte : après confirmation T0, le cockpit affiche « Décision suspendue :
  l'abstention clinique n'est pas encore évaluée » — indéfiniment. Aucune
  `ClinicalRuleRef` validée n'atteint jamais `buildClinicalReview`, si bien que
  l'abstention retombe systématiquement sur `not_evaluated`
  (`clinicalReview.ts`), que `buildDecisionCard` classe la décision `blocked`, et
  qu'aucune priorité candidate n'a jamais pu exister. En regard, la plainte que
  le patient déclare (`Q_MOD_03`) et l'objectif qu'il se donne
  (`patientContext.priorityGoal`) traversent toute la chaîne sans être affichés
  nulle part. Le LOT-04 rebranche cette chaîne. Neuf arbitrages, rendus avant la
  première ligne de code (`DC-17`, `DC-18`).
- Décision :

**1. Aucune porte praticien existante n'est affaiblie.** Les conditions T0
(`preconditionsT0.ts`) et les cinq gardes de `buildDecisionCard` — règle
candidate stérile, `origin` obligatoirement `engine`, rangs uniques, décision
bloquée par une abstention non levée ou un constat de sécurité, sélection
réservée au praticien — restent à l'octet. Une chaîne qui produit enfin quelque
chose est exactement le moment où l'on est tenté d'assouplir la porte qui la
gardait.

**2. Les claims d'un candidat sont portés par la RÈGLE, pas par le contrat C1.**
`DecisionPriorityCandidate` et `ClinicalFindingProvenance` ne sont PAS étendus :
ils entrent dans `decisionCard.inputHash`, donc dans `draft.inputHash`, donc dans
`versionId` — les élargir déplacerait toutes les empreintes pour un besoin que la
table sait déjà couvrir. La traçabilité vit dans `justificationClaims` de
`priorityRulesV1.ts` (patron orientation), et le
`ValidatedClinicalRuleRef.validation.sourceReference` reste une chaîne qui nomme
la table, sa version et son SHA.

**3. Un drapeau d'anamnèse et l'objectif prioritaire ne sont pas des mesures.**
Ils ne peuvent donc pas entrer dans `provenance`, dont `validateProvenance` reste
jetante et inchangée : cette fonction garantit qu'un constat ne cite que des
sources réellement présentes dans le `ClinicalSnapshot`. Ce que le patient
DÉCLARE s'exprime en `rationale` et en `limitations`, et s'affiche au cockpit —
jamais comme une provenance. Conséquence assumée : **la V1 de la table ne porte
aucun déclencheur de drapeau**, faute de bande publiée à citer.

**4. LOT-04 ne consomme pas les règles d'arrêt.** Aucun pont
`reglesEteintes` → priorité candidate. Motif : une extinction d'orientation dit
qu'une EXPLORATION n'a plus d'objet ; elle ne dit rien de ce qu'il faut
ENTREPRENDRE. Traduire l'une en l'autre serait exactement le genre d'inférence
que `DC-01` interdit. **Écart écrit plutôt que masqué** : le critère du lot
« stress au mieux mineur si C-STR ouvert » est donc tenu par construction — la
V1 ne porte aucune règle d'axe stress — et non par un mécanisme. Le banc le
vérifie et le dit.

**5. Le recalcul serveur vérifie la carte SOUMISE, pas ses seules empreintes.**
`POST /api/praticien/protocoles/versions` et `POST /api/praticien/protocoles`
acceptaient jusqu'ici la `DecisionCard` du corps de requête TELLE QUELLE : la
fixture du banc `versions/route.test.ts` était elle-même une carte forgée
(`inputHash: 'HASH_DEC'`) qui passait. Le contrôle se fait désormais **en deux
temps**, et le second ne suffit pas sans le premier :

1. **La carte est recoupée contre sa PROPRE empreinte.** `decisionCardId` est le
   seul champ exclu du hash (`decisionCard.ts`) : tout le reste doit se
   re-hacher à l'identique. Ce premier temps est posé AVANT la lecture du
   dossier — une carte qui ne se recoupe pas elle-même n'a pas à faire lire le
   patient.
2. **La chaîne est reconstruite DEPUIS LA BASE**, aux horodatages soumis (les
   identifiants sont exclus des empreintes, `createdAt` et `asOf` y entrent).
   Les trois `inputHash` sont comparés — nommés séparément pour dire QUEL
   maillon a bougé —, puis les deux JSON canoniques de la carte (hors
   `decisionCardId`). Cette dernière comparaison ferme les clés surnuméraires et
   rend le contrôle indépendant de ce que `buildProtocolDraft` lira ensuite : ce
   module garde la BASE, pas un consommateur.

**LE PREMIER TEMPS A ÉTÉ AJOUTÉ APRÈS LA REVUE DU 2026-08-12, ET LE TROU MÉRITE
D'ÊTRE NOMMÉ.** La première rédaction ne portait que le second : elle confrontait
le recalcul aux empreintes **déclarées par le client**, jamais au CONTENU de la
carte envoyée. Une carte dont l'abstention, les priorités candidates et les
limitations étaient entièrement réécrites, mais qui transportait les trois
empreintes honnêtes, passait donc les trois comparaisons — le serveur recalculait
bien, comparait bien, et comparait deux nombres que le fraudeur n'avait aucune
raison de toucher. Les deux bancs d'intrusion d'alors passaient au vert pour une
raison ANNEXE (la carte y était fabriquée table non signée puis soumise table
signée, si bien que le recalcul divergeait de toute façon) : ils ne disaient rien
du cas qui compte. Les deux bancs ajoutés depuis ont été vus ROUGIR quand le
recoupement est neutralisé.

Divergence ⇒ **409 `chaine_c1_divergente`**, code choisi pour rejoindre les 409
existants de la route (`version_stale`, `protocol_stale`), que le client traite
déjà en rechargeant. Aucune migration, aucune colonne, aucune persistance
nouvelle.

**Une seule chose que le serveur ne peut pas recalculer, et elle est nommée :
`selectedMainPriority`.** C'est un GESTE praticien, pas une dérivation. Le
recalcul la réinjecte telle quelle, et `buildDecisionCard` la re-valide
entièrement (`selectedBy: 'practitioner'`, candidat réellement classé, décision
non bloquée). **Conséquence pour le lot qui posera la sélection** : elle devra
transiter par une route serveur, jamais par un enrichissement de carte côté
client — tout autre champ ajouté au navigateur fera 409.

**6. Le helper de vérification garde les DEUX points de persistance.** Un
fail-closed écrit dans une seule des deux routes est un fail-closed qu'on peut
oublier de corriger dans l'autre — même motif que le double verrou
d'`orientationService`. Il vit dans
`web/src/lib/clinical-engine/verifierChaineC1.ts`, et la construction de la
chaîne elle-même est extraite dans `chaineC1.ts`, appelée par le cockpit ET par
le vérificateur : deux constructions divergentes rendraient 409 sur une carte
honnête.

**CE QUE CET ARBITRAGE NE COUVRE PAS, ET C'EST UNE DETTE PRÉEXISTANTE.** Sur
`POST /api/praticien/protocoles`, le `ProtocolDraft` arrive CONSTRUIT du
navigateur : la route en vérifie l'ancrage (`decisionCardId`,
`decisionCardInputHash`) et la structure des compléments, mais elle ne le
RE-DÉRIVE pas de la carte — `validateDecisionCard` n'y est pas rejouée, à la
différence de la route sœur qui, elle, reconstruit le protocole serveur par
`buildProtocolDraft`. **Le 409 garde donc la carte, pas le protocole.** Le lot ne
referme pas ce trou : il est antérieur, il appelle son propre arbitrage, et
l'écrire ici vaut mieux que laisser croire que ce point de persistance est
entièrement gardé. *Relevé en revue du 2026-08-12 (M4).*

**7. La table est livrée NON SIGNÉE — la production ne change pas au merge.**
Même discipline que `contradictionsV1` et `stopRulesV1` : écrire une table et la
signer sont deux gestes distincts, le second est un acte praticien.
`tablePrioritesSignee()` reprend la triple forme auto-portante de `tableSignee()`
— `validationExterne`, une date de validation, des claims sources non vides. Tant
qu'elle est fermée, aucune `ClinicalRuleRef` n'atteint la revue, l'abstention
reste `not_evaluated` et aucun candidat n'est produit : le comportement servi est
celui d'hier. **Pas de drapeau d'environnement propre** — la chaîne C1 est déjà
derrière l'authentification praticien et la confirmation T0 ; un second drapeau
donnerait l'illusion d'un second verrou là où il n'y a qu'un chemin (patron
[[D-053]], arbitrage 6).

**Deux effets NE sont PAS derrière ce verrou, et c'est voulu.** L'affichage de la
plainte dominante et de l'objectif prioritaire est la restitution d'une bande
déjà publiée par un instrument certifié et d'un texte déjà saisi : ce n'est pas
une sortie de règle. Le recalcul serveur (arbitrage 5) est un contrôle
d'intégrité, pas une conclusion clinique — le subordonner à une signature
clinique reviendrait à laisser une carte forgée passer tant que la table n'est
pas signée.

**8. Aucun seuil neuf n'entre dans le dépôt.** Les déclencheurs citent la bande
`>= 7` de `Q_MOD_03`, celle que la table d'orientation SIGNÉE cite déjà
(`R2-SOM-02`) et que `questions.ts` publie (1-3 « Intensité faible ou absente »,
4-6 « modérée », 7-8 « élevée », 9-10 « très élevée ») : `>= 7` vise les deux
bandes hautes et elles seules. Le départage de la plainte dominante — à valeur
égale, l'ordre de publication des sept domaines par le catalogue — est un choix
purement TECHNIQUE de stabilité d'affichage, identifié comme tel sur place
(`DC-19`, `DC-20`) : il ne hiérarchise aucune plainte cliniquement.

**9. `TABLE_EXIGE_PRESCRIPTIF = false` pour cette table.** Une priorité candidate
est une PROPOSITION hiérarchisée soumise au praticien, pas une prescription
d'intervention — à la différence d'une extinction, qui agit sur ce que le
praticien ne verra pas. Les onze claims épinglés sont descriptifs
(`prescriptif = false` en production, relu le 2026-08-12) : ils décrivent des
mécanismes — fonctions intestinales, dysfonction de barrière, insulino-résistance
— et ne recommandent aucune conduite. Exiger `prescriptif` d'eux serait une
erreur de catégorie ([[D-046]]), et aurait forcé à épingler un claim voisin qui
ne dit pas la règle (`DC-14`). Ce que la règle ajoute — « cet axe mérite d'être
regardé en premier » — viendra de la SIGNATURE praticien, jamais des claims.

**10. Une abstention REQUISE fait taire la table.** *Arbitrage rendu en revue du
2026-08-12 (M3), après avoir constaté que le producteur de candidats ne
consultait pas l'abstention.* Le cas n'est pas théorique : `Q_MOD_03` amputé d'un
SEUL domaine rend `total: null`, ce qui déclare le canal de plainte non mesurable
— donc l'abstention `required` —, et pourtant les six domaines répondus portaient
encore leurs valeurs et déclenchaient les règles. La carte servait alors une liste
hiérarchisée sous un bandeau de suspension : `buildDecisionCard` remettait bien la
priorité PROPOSÉE à `null` (la décision est `blocked`), mais gardait les candidats
classés. Données insuffisantes ⇒ on réduit la conclusion, on ne l'habille pas
(`DC-25`). Le producteur lit le statut NORMALISÉ de la revue, et non l'intention
locale — lire l'intention laisserait produire des candidats sous une abstention
que `buildClinicalReview` a ramenée à `not_evaluated`.

- Conséquences : `web/src/lib/clinical/priorityRulesV1.ts` (table, verrou,
  producteur), `web/src/lib/clinical-engine/chaineC1.ts` (construction unique),
  `verifierChaineC1.ts` (recalcul serveur), les deux routes de persistance, le
  cockpit et son écran. Onze paires de claims entrent au contrat de fraîcheur
  (`rag_claim_fraicheur_tables_signees_v1.sql` et son négatif) sous la table
  `priorites`.
- Frontière de ce que la signature couvrira : `PRIORITY_RULES_SHA256` porte sur
  `PRIORITY_RULES_V1` SEULE — déclencheurs, claims, libellés, motifs. Le
  producteur de candidats, le classement et la procédure d'abstention vivent dans
  `chaineC1.ts` et relèvent des bancs ordinaires, pas du périmètre signé. Dit ici
  parce que le contraire se supposerait.
- **Dette BLOQUANTE POUR LA SIGNATURE (M1)** : la procédure d'abstention étant
  hors du périmètre signé, signer `PRIORITY_RULES_METADATA` en l'état ouvrirait un
  verdict clinique — `required` / `not_required`, servi au praticien et haché dans
  la carte — qu'AUCUNE ligne signée ne décrit (`DC-17`, `DC-26`). Avant toute
  signature, cette procédure doit entrer dans le périmètre signé : dans la table,
  ou dans un document signable qu'elle référence. Le rappel vit aussi en
  commentaire au-dessus de `PRIORITY_RULES_METADATA` et de `evaluerAbstention`.
- Ce que la signature assumera par ailleurs (M5) : chacune des deux règles repose
  sur UN ITEM UNIQUE de `Q_MOD_03`, un auto-déclaré de 1 à 10 sans instrument
  spécifique à l'appui. `DC-28` (« un questionnaire isolé ne suffit pas à
  conclure ») est mitigé par ce que la règle PRODUIT — une proposition
  hiérarchisée, jamais une conclusion — et par les `limitations` que chaque
  candidat porte. Ce n'est pas une objection réfutée : c'est un arbitrage qui
  appartient au praticien qui signe.
- Dette nommée : aucun candidat n'est encore SÉLECTIONNABLE — la sélection
  praticien reste hors périmètre, et un protocole reste donc impossible même
  table signée. Aucune règle ne couvre les cinq autres domaines de plainte
  (fatigue, douleurs, sommeil, moral, mobilité) : elles sont écartées avec leur
  motif dans `PRIORITY_RULES_ECARTEES_V1`, faute de claim relu pour l'axe.
  Enfin, `POST /api/praticien/protocoles` ne re-dérive pas son `ProtocolDraft` de
  la carte (arbitrage 6, M4).

### D-053 — Ce qui a le droit d'éteindre une exploration, et ce qui n'en a que l'air

- Date : 2026-08-12
- Statut : accepté (décision utilisateur du 2026-08-12)
- Domaine : clinique, orientation, règles d'arrêt
- Contexte : les recommandations d'exploration restent allumées indéfiniment ;
  le moteur ne sait pas dire « information suffisante — pas d'exploration
  supplémentaire actuellement ». Le LOT-03 pose ce geste. Le cadrage a établi
  que **trois des quatre prédicats de la spécification ne sont pas écrivables**
  avec le vocabulaire et les grilles du dépôt, et que l'un d'eux contredit la
  table d'orientation signée. Cette décision précède la première ligne de code
  (`DC-17`, `DC-18`).
- Décision : sept arbitrages, rendus ensemble.

**1. Une extinction est un acte plus exigeant qu'une proposition.** Ce qui a le
droit de **déclencher** une exploration n'a pas pour autant le droit de la
**taire**. Une grille descriptive, un item auto-déclaré isolé, un indice non
validé psychométriquement et un instrument dont le moteur ne publie pas ses
comptes de complétude peuvent proposer ; aucun ne peut éteindre. Motif : une
proposition superflue coûte une passation, une extinction indue coûte une
exploration qui n'aura pas lieu, et le praticien ne voit pas ce qui ne s'affiche
pas (`DC-25`, `DC-28`).

**2. La V1 ne porte que STOP-STR, sur ses seules cibles stress — et c'est
`Q_STR_01` qui porte le claim, pas le DASS.** La rédaction initiale de cet
arbitrage écrivait la règle sur « DASS-21 et Cungi rassurants ». La lecture de
`rag_corpus_claims` en production le 2026-08-12 (8 224 claims `VALIDE` et actifs)
la corrige : **ni le DASS-21 ni le Cungi ne portent de claim d'extinction**, le
corpus n'en publie que les bandes. La seule échelle de stress dont le corpus
attache une **conduite** à la bande rassurante est le questionnaire SIIN
(`Q_STR_01`) — `WN-CL-0051-030` (« un score total inférieur à 4 correspond à un
niveau de stress rassurant **relevant de l'hygiène de vie** ») et
`WN-CL-0051-033`, prescriptif (« il est recommandé d'orienter vers les **conseils
de vie antistress** »). La bande voisine donne son sens à celle-ci :
`WN-CL-0051-031` réserve le « regard physiopathologique » à l'intervalle 5-14.
`questions.ts` sert exactement cette bande sur `Q_STR_01` (0-4, « Oriente vers
les conseils de vie antistress »).

`Q_STR_01` rassurant est donc la condition **porteuse** ; le DASS-21 (axes `A` et
`S` en bande `Normal`) et le Cungi (« Niveau de stress très bas ») restent des
conditions **additionnelles**, dont les bandes sont elles aussi publiées par le
corpus. Les exiger rend l'extinction plus rare : le sens du fail-closed. L'axe
`D` du DASS n'entre pas — c'est l'axe humeur, et l'arbitrage 3 y renonce.

**Trois règles sont éteintes, et le critère n'est pas l'axe : c'est ce qui les
déclenche.** `R2-STR-01`, `R2-STR-02` et `R2-STR-03` partent d'un **dépistage**
— l'axe `ADAPTATION_STRESS` de `Q_MOD_01`, un burn-out déclaré à l'anamnèse — et
demandent une mesure spécifique : les éteindre quand cette mesure revient
rassurante, c'est dire que la question posée a reçu sa réponse. `R-STR-01` et
`R-STR-02` **ne sont pas éteintes** : leur déclencheur est le PSS-10
(`Q_STR_02`) en zone défavorable, c'est-à-dire une **mesure**, sur l'instrument
que la table d'orientation appelle elle-même « le questionnaire habituel
d'intensité ». Les éteindre sans lire le PSS-10 aurait fait taire un résultat
défavorable parce que d'autres sont rassurants, et servi au praticien le motif
« les explorations de l'axe stress n'ont pas d'objet » devant un stress perçu en
zone danger. C'est l'objection de l'arbitrage 3, appliquée **à l'intérieur** de
l'axe (`DC-30`). *Relevé en revue adversariale du 2026-08-12, après une première
rédaction qui éteignait les cinq.*

Les explorations concernées sont donc celles que ces trois règles proposent —
PSS-10 `Q_STR_02`, DASS-21 `Q_STR_04`, Cungi `Q_STR_03`, BMS-10 `Q_STR_05`. Les
seuils ne sont pas écrits dans la table d'arrêt : ils **citent les bandes déjà
publiées** de chaque grille, comme le fait C-STR ([[D-042]]). Aucun nombre
nouveau n'entre dans le dépôt par ce lot (`DC-19`, `DC-20`) — une réserve près,
dite plutôt que lissée : le catalogue note que le seuil 4 de `Q_STR_01` n'est pas
explicitement couvert par la source et a été rattaché par harmonisation à la
bande basse, que la règle cite.

**L'extinction nomme des RÈGLES, jamais des cibles.** Une cible qu'une règle
d'un autre axe motive encore reste allumée : le Cungi est proposé par `R-SOM-01`
(axe sommeil), et une extinction par cible le ferait disparaître d'un axe qui n'a
rien demandé. C'est la même objection que celle qui fait renoncer au HAD.

**3. STOP-STR n'éteint pas le HAD.** Le HAD (`Q_NEU_11`) n'est proposé par
aucune règle de stress : il l'est par `R2-NEU-01` (plainte moral déclarée),
`R2-NEU-02` (antécédent psychiatrique), `R2-NEU-03`/`R2-NEU-04` (axes du DNST)
et `R-SOM-01` (PSQI défavorable). L'éteindre sur un DASS rassurant reviendrait à
**résoudre par suppression une discordance entre instruments d'axes
différents** — précisément ce que `DC-30` interdit, et l'inverse de ce que fait
C-STR, qui signale cette discordance au lieu de la trancher. *Arbitrage rendu
sans préférence exprimée par l'utilisateur ; il se rouvre sur une source
clinique qui fonderait l'extinction.*

**4. STOP-SOM et STOP-APN sont écartées de la V1, et leurs motifs entrent dans
la table.** Patron `CONTRADICTIONS_REGLES_ECARTEES_V1`, que [[D-042]] a rendu
livrable pour cette raison : une règle écartée reste lisible avec son motif,
plutôt que de disparaître dans un ticket.

- **STOP-SOM** — la spécification l'énonce sur « PSQI 5 », valeur à laquelle la
  table **signée** dit que `R-SOM-01` doit s'allumer, motif écrit à l'appui
  (`orientationRulesV1.ts:173-176` : la bande `info` du PSQI est prise
  au-dessus du seuil de 4 que l'instrument publie). L'écrire serait éteindre en
  V1 une règle signée le mois dernier sur la même valeur, sans re-signer la
  table. Sa seconde jambe, l'agenda `Q_SOM_09`, porte deux réserves : son
  indice /100 est une construction WellNeuro sans validation psychométrique ni
  cohorte de calibration, et [[D-052]] l'a déjà exclu du rideau T0 au motif
  qu'un recueil de 21 nuits ne conditionne pas une décision prise à J0 — la
  même objection vaut en miroir pour une extinction.
- **STOP-APN** — son prédicat « absence de symptômes » n'est pas exprimable :
  le vocabulaire de déclencheurs ne connaît que des tests positifs, et lire une
  liste vide comme « absent » heurte `DC-24`. Même motif que l'écartement de
  C-ALI en LOT-01. Défaut supplémentaire à refermer avant toute reprise : le
  moteur Berlin (`Q_SOM_03`) ne publie ni `missing` ni `repondus`, et sa garde
  par catégorie se contente d'un item mesuré — un Berlin à trois items sur neuf
  peut sortir « Risque faible ». Pour une règle d'orientation c'est un faux
  négatif ; pour une règle d'arrêt, ce serait une extinction fondée sur un
  instrument vide.

**5. Une contradiction ouverte interdirait l'extinction ; elle ne la déclenche
jamais.** Le fichier de lot autorisait les deux lectures. Une discordance se
signale (`DC-30`) : une règle d'arrêt qui éteindrait sur discordance la ferait
disparaître. **Cet arbitrage n'a AUCUN code, et c'est une dette, pas une
garantie** — ni le moteur ni le service ne consultent les contradictions. Dire
qu'il serait « inerte mais fail-closed » était faux dans ce sens-là : un frein
absent ne retient rien, il laisse passer. Ce que le lot livre à sa place est
plus étroit et réellement tenu : l'extinction ne peut pas naître d'une
discordance, puisque aucune contradiction n'est lue. La borne inverse — une
contradiction ouverte qui EMPÊCHE d'éteindre — reste à écrire, et elle
n'empêche rien aujourd'hui. *Reclassé après revue du 2026-08-12.*

**6. Une recommandation éteinte reste relisible dans la sortie courante ; rien
n'est persisté.** Elle garde ses motifs d'origine et porte en plus son motif
d'extinction — l'interdit « une extinction n'efface jamais l'historique » est
ainsi tenu par construction, sans table ni migration. Le rallumage est gratuit :
tout l'étage d'orientation est recalculé à chaque lecture, une passation
nouvelle devient mécaniquement la dernière, le déclencheur d'arrêt ne mord plus
et la recommandation revient. **Conséquence assumée** : les synthèses déjà
validées gardent leur instantané — la régénération des synthèses historiques est
hors périmètre de la campagne.

**7. `dejaRepondu` n'exclut que sur une passation exploitable, et le badge
survit à l'exclusion.** Aujourd'hui `dejaRepondu` vaut `true` sur une passation
dont le score a été annulé — le service annule le score sans retirer la ligne,
délibérément, pour préserver ce fait administratif. Le rendre excluant sans
garde ferait **disparaître la recommandation de refaire passer l'instrument que
le praticien vient d'invalider**, alors qu'invalider, c'est attendre une
re-passation. L'exclusion porte donc sur le seul cas où le recalcul rend une
mesure ; une passation `INVALID`, `SUPERSEDED`, non interprétable ou sans
réponses brutes n'exclut pas et laisse intact le signal « mesure à
replanifier ». Le badge « déjà renseigné » reste affiché dans tous les cas :
deux faits distincts en sortie, pas un booléen retourné. Une composition de pack
inconnue (`null`) n'exclut jamais — un `null` excluant serait un fail-open.

- Conséquences :
  - Nouvelle table `stopRulesV1.ts` sur le patron d'`orientationRulesV1.ts`,
    avec ses métadonnées, ses claims épinglés, sa constante de SHA **et** son
    littéral épinglé au banc — une constante seule, dont les deux membres
    bougent ensemble, est une signature décorative.
  - Le banc de fraîcheur des claims **découvre automatiquement** tout fichier
    de `web/src/lib/clinical/` portant un champ `claimsSource` : il rougit dès
    la création du fichier, avant toute signature. Il faut lui déclarer la
    table, trancher explicitement son exigence de `prescriptif` (une table qui
    **éteint** une prescription n'est ni la table d'orientation, qui prescrit,
    ni celle des contradictions, qui constate — arbitrage nouveau exigé par
    [[D-046]]), et étendre le contrat SQL de production avec ses fixtures.
  - La table d'orientation **n'est pas touchée** : l'étape SCOFF est différée
    hors du lot, donc aucun bump ni re-signature.
  - L'extinction est calculée dans le moteur, après l'absorption pack/membre et
    avant le tri, jamais dans une route ni dans un composant : les deux
    consommateurs — cockpit et synthèse — passent par le même service, et un
    fail-closed dupliqué est un fail-closed qu'on oublie de corriger dans l'une
    des deux copies.
  - Dire au modèle comment lire une extinction modifie le prompt système :
    bump `synthese-v25` et nouvelle empreinte gardée, sur le précédent v15/v16
    (le dépôt bumpe quand la couche déterministe change le **sens** de ce qui
    est transmis).
- Alternatives écartées : les trois stop rules comme spécifiées (exigerait
  d'ajouter la négation au vocabulaire de déclencheurs partagé par les trois
  moteurs — décision d'architecture, pas détail de table) ; une trace persistée
  et datée des extinctions et rallumages (nouvelle table, migration, PR séparée
  du code qui en dépend — la relisibilité dans la sortie courante suffit à
  l'interdit) ; `dejaRepondu` excluant sur toute passation existante, tel que le
  lot l'énonçait ; une fenêtre de fraîcheur bornant l'ancienneté d'une passation
  qui exclut — la borne serait un chiffre à fonder cliniquement, non disponible.
**8. Un instrument qui ne sait pas dire sa complétude ne peut pas éteindre.**
La garde générale retire la mesure d'un recueil qui se **déclare** incomplet ;
elle ne peut rien dire d'un moteur qui ne publie aucun compte. C'est le cas de
`group_majority`, celui de `Q_STR_01` — et `totalSousScore` rend un total dès un
item par groupe : trois réponses sur vingt et une produisent la bande la plus
favorable de la grille. Pour une règle d'orientation, ce silence est un faux
négatif ; pour une règle d'arrêt, ce serait l'extinction sur instrument vide qui
fait précisément écarter STOP-APN. Le moteur d'arrêt refuse donc d'éteindre sur
tout instrument dont la complétude n'est pas lisible.

**Conséquence, écrite ici plutôt que découverte le jour de la signature :
STOP-STR ne peut pas mordre en l'état.** Son déclencheur porteur est
précisément `Q_STR_01`. Faire publier ses comptes de recueil à `group_majority`
— comme `psqi` le fait depuis le lot de signature — est une modification du
moteur de scoring : elle appelle sa propre décision et son propre fragment, hors
de ce lot. **Signer la table d'arrêt ne suffira donc pas.**

- Dette nommée : aucune règle d'arrêt n'est gardée par un banc de production
  aujourd'hui ; l'existence réelle des `claimId` cités reste hors d'atteinte du
  CI, qui n'en vérifie que le format — les cinq paires ont été relues à la main
  sur la production le 2026-08-12 (toutes `VALIDE`, actives, non remplacées, en
  `v1.0`). Deux autres dettes, nommées par la revue : aucune borne d'ancienneté
  ne limite l'exclusion (une passation valide et mesurée de 2024 exclut sa cible
  — la fenêtre de fraîcheur reste écartée faute de chiffre fondé), et le garde de
  restitution de la synthèse ne distingue pas une cible citée comme recommandée
  d'une cible citée comme éteinte : sur ce point précis, c'est la consigne qui
  protège, non la donnée.

### D-052 — Les préconditions de confirmation T0 : ce qu'un T0 exige, et ce que « VALID » ne prouve pas

- Date : 2026-08-12
- Statut : accepté (décision utilisateur du 2026-08-12)
- Domaine : clinique, épisode d'évaluation T0, validité des passations
- Contexte : la confirmation d'un épisode T0 n'a aujourd'hui **aucune
  précondition**. Le panneau invite même explicitement à confirmer un dossier
  vide (« Aucune réponse disponible. Confirmez explicitement… »,
  `EpisodeConfirmationPanel.tsx`), et les deux points de persistance
  n'exigent que `status === 'confirmed'`. Or le T0 est **irrévocable** :
  l'identifiant d'épisode est déterministe (`runtime-episode-<patient>-<jalon>`)
  et les deux routes écrivent en `upsert(..., update: {})` — le premier T0 écrit
  est le seul, pour toujours. Ce lot pose la porte ; il ne la rouvre pas.
- Décision : quatre arbitrages, rendus ensemble.

**1. Le rideau T0 est une table clinique, pas une composition administrative.**
`Q_MOD_03`, `Q_MOD_01`, `Q_INF_03`, `Q_ALI_01` — quatre identifiants **en dur**,
signés ici, découplés du pack de base. Le pack est une ligne en base éditable
depuis l'UI, et une divergence registre↔pack a déjà été journalisée le
2026-08-03 : dériver le rideau du pack ferait déplacer une règle clinique par un
geste administratif (`DC-26`). `Q_SOM_09` est **exclu du rideau bien qu'il soit
au pack de base seedé** : un agenda du sommeil sur 21 nuits ne peut pas
conditionner un point de décision qui se prend à J0. L'écran doit l'expliquer,
sans quoi l'exclusion se lira comme un oubli. `Q_ALI_01` est accepté **dans
l'une ou l'autre de ses formes** : la forme longue serait plus exigeante, mais
rendrait le T0 inconfirmable partout où `WN_ALI_01_SIIN57` est éteint — soit
partout aujourd'hui. Le repère, lui, continue de s'abstenir sur cet identifiant
([[D-051]]) ; une précondition qui constate une passation et un repère qui
désigne laquelle fait foi ne demandent pas la même certitude.

**2. « VALID » ne prouve rien, et c'est écrit plutôt que contourné.** La
migration du LOT-00 a posé `statut_validite TEXT NOT NULL DEFAULT 'VALID'` :
PostgreSQL a donc estampillé `VALID` **toutes** les lignes existantes.
Vérification en production le 2026-08-12 : 105 passations, **toutes `VALID`,
aucune autre valeur**, et la seule route capable d'écrire autre chose rend 503
tant que `WN_ENABLE_VALIDITE_PASSATIONS` est éteint. Une condition dure « la
passation est `VALID` » serait donc **tautologique** — un défaut de colonne
présenté comme un jugement clinique, exactement ce que `DC-24` interdit.
La condition dure retenue ne s'y appuie pas : une passation compte si elle
**existe**, si son statut **n'est pas exclu du raisonnement**
(`statutExcluDuRaisonnement`, indépendant du drapeau, prévu pour *désigner* et
non pour *filtrer*) et si le recalcul rend **une mesure** — c'est-à-dire un
score coté (`scored`, `total`), et pas seulement un objet non-`null`.

**Ce troisième terme a dû être écrit deux fois, et le dire évite de le
réécrire une troisième.** La première rédaction se contentait de
`scoresRecalculesPourRaisonnement(...) !== null`. Or `calculateScore` porte
depuis le 2026-07-29 une garde générale de passation vide qui rend, sur une
passation sans réponse lisible, `{ scored: false, total: null,
interpretation: null, raisonNonScore }` — un objet. **Quatre passations sans
une seule réponse satisfaisaient donc « rideau complet »**, et le T0 est
irrévocable (revue du 2026-08-12). Le cas n'est pas d'école : une passation
`Q_ALI_01` de la forme courte relue sous la définition SIIN ne partage aucun
identifiant d'item et tombe exactement là ([[D-051]]). La condition lit
désormais `scored` et `total`, les deux drapeaux que cette garde pose.

Ce terme est le seul qui refuse quelque chose en production : le statut est
tautologique, l'existence est triviale. Un T0 confirmé sur un questionnaire
présent mais non coté serait un T0 sans mesure.

**Ce que la condition ne dit PAS** : que chaque item est répondu. Un instrument
partiellement renseigné mais cotable passe — exiger la complétude item par item
serait un durcissement clinique qui n'a pas été arbitré ici. Le libellé affiché
dit donc « renseigné et cotable », pas « complet ».

**3. Le rideau s'évalue hors fenêtre.** `targetAt` d'un T0 vaut la date de la
**première passation du dossier**, quelle qu'elle soit. Un patient ayant
répondu à un questionnaire isolé six semaines avant son pack de base verrait
donc son rideau tomber hors de la fenêtre ±8 j et son T0 refusé **alors
qu'aucune donnée ne manque** — un refus qui ne protège de rien. La précondition
cherche la dernière passation de chaque instrument du rideau, sans contrainte
de date ; la fenêtre continue de gouverner la **composition** de l'épisode, qui
est un autre objet. `TOLERANCE_JOURS_JALON` et `JOURS_JALON` ne sont pas
touchés.

**4. La fraîcheur de la synthèse se juge sur le rideau et sur la validation.**
La synthèse doit être `Validee_Praticien` ou `Corrigee_Praticien` et sa
`dateValidation` postérieure à la dernière passation **du rideau**, pas du
dossier : une passation hors rideau, plus récente, ne périme pas une synthèse
qui n'avait pas à en tenir compte. `Corrigee_Praticien` **ne rafraîchit pas**
`dateValidation` — comportement existant, non modifié ici : une annotation
commente une synthèse, elle ne la re-valide pas.

- Conditions **souples** : contournables, avec motif obligatoire, tracées dans
  le payload d'épisode. `preconditionOverrides` porte la condition, le motif,
  l'auteur et l'horodatage, **posés par le serveur** à la confirmation.
  L'épisode transitant ensuite par le navigateur, les deux points de
  persistance les **recoupent champ par champ** contre la session : un
  contournement dont l'auteur n'est pas celui de la session, dont la date n'est
  pas une date, ou dont la condition n'est pas réellement en défaut, est refusé
  en 422. Ils vérifient plutôt qu'ils ne réécrivent — réécrire ferait diverger
  l'épisode de celui qui a été haché dans `snapshot.inputHash`.
- **La porte ne se désactive pas en déclarant un autre jalon.** Le jalon est
  dérivé du suffixe de `assessmentEpisodeId` quand il est dérivable, et le
  champ `milestone` du corps de requête ne fait foi qu'à défaut. Sans cela,
  déclarer `J21` sur l'identifiant du T0 ouvrait la porte — et l'écriture étant
  un `upsert(..., update: {})`, l'identifiant T0 du patient était squatté
  définitivement par une ligne de suivi.
- **La fraîcheur se juge sur la dernière synthèse VALIDÉE, pas sur la dernière
  ligne.** Chaque génération crée une ligne au statut `Brouillon_IA` :
  régénérer une synthèse pour la relire aurait bloqué le T0 d'un dossier qui en
  porte une validée, avec le message « Aucune synthèse validée par le
  praticien » — factuellement faux, et inexplicable au sens de `DC-34`.
- Écarté : **la condition souple « suggestions d'orientation ni renseignées ni
  écartées »**, retirée du lot. « Écartée » n'existe nulle part : les deux
  seules notions de rejet du dépôt (`FilCardRejection`,
  `PackProposition.declinee`) désignent autre chose, et la créer demanderait une
  persistance nouvelle donc une migration, que ce lot s'interdit. La livrer
  dégradée en « des suggestions restent non renseignées » aurait produit un
  avertissement **non acquittable**, donc affiché à chaque T0 — un avertissement
  qu'on ne peut pas éteindre est un avertissement qu'on apprend à ignorer.
- Assumé, et nommé plutôt que masqué : les deux conditions souples conservées
  (`AMBIGUOUS` sur le rideau, contradictions ouvertes) sont **muettes
  aujourd'hui** — la première parce qu'aucune passation ne peut porter
  `AMBIGUOUS` drapeau éteint, la seconde parce que `contradictionsActives()`
  est faux tant que la table n'est pas signée. Elles sont câblées et prouvées
  par bancs pour que le chemin existe le jour de l'allumage ; prétendre
  qu'elles protègent quelque chose en production serait faux.
- **Impact mesuré sur le parc avant merge**, parce qu'une porte qui fermerait
  tout serait une régression et non une garde : au 2026-08-12, sur 19 patients
  de production, **10 portent le rideau complet et une anamnèse validée avec
  motif, et 8 satisfont les trois conditions dures** (les 2 autres échouent sur
  la fraîcheur de la synthèse). La mesure porte sur la présence des passations,
  pas sur leur cotabilité — elle majore donc légèrement.
- Réserve nommée : cette décision **ne rend pas le T0 corrigible**. Elle durcit
  une porte à sens unique, et un T0 confirmé par contournement le reste. La
  correction ou ré-ouverture d'un T0 confirmé est hors périmètre du lot et reste
  sans lot d'accueil.
- Réversibilité : les conditions vivent dans un module pur
  (`preconditionsT0.ts`) et leurs refus sont trois appels dans les routes ; les
  retirer rétablit le comportement antérieur. Les bancs du module et les trois
  bancs de route le signaleraient.
- Référence : `web/src/lib/clinical-engine/preconditionsT0.ts`,
  `web/src/app/api/praticien/cockpit/route.ts`,
  `web/src/app/api/praticien/protocoles/route.ts`,
  `web/src/app/api/praticien/protocoles/versions/route.ts`,
  `docs/claude/campagnes/2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie/lots/LOT-02-preconditions-t0.md`,
  [[D-051]]

### D-051 — Le repère de passation courante s'abstient sur un identifiant qui a désigné plusieurs instruments

- Date : 2026-08-12
- Statut : accepté (décision utilisateur du 2026-08-12)
- Domaine : clinique, synthèse IA, catalogue de questionnaires
- Contexte : `Q_ALI_01` résout vers **deux questionnaires distincts** selon
  `WN_ALI_01_SIIN57` — le dépistage court à 14 items (total /42) ou l'Enquête
  alimentaire SIIN à 57 items (total /90) — sous un identifiant unique
  (`web/src/lib/questionnaires/alimentaire.ts`). Ce ne sont pas deux versions
  d'un même instrument : le banc de certification a comparé les libellés
  position par position et trouve des similarités de 0,00 à 0,33. Les 8
  passations en production portent la forme courte. Le repère
  `passationCourante`, livré à l'étape 6 du LOT-01, répond « laquelle fait foi »
  en groupant par `idQuestionnaire` : à l'allumage du drapeau, une passation sur
  90 aurait été présentée au modèle comme l'état actuel à la place d'une
  passation sur 42, et l'écart de total se serait lu comme une évolution
  clinique. **Le défaut est antérieur à ce lot et latent** ; c'est le repère qui
  l'aurait rendu actif.
- Décision : sur un identifiant listé comme ayant désigné plusieurs instruments,
  **aucune passation ne porte le repère dès qu'il en existe au moins deux
  EXPLOITABLES**, et chaque ligne concernée porte le motif de l'abstention
  (`formeInstrumentAmbigue`) — consigne `synthese-v24` à la date de cette
  décision, portée à `synthese-v25` le même jour par [[D-053]] (l'extinction
  d'orientation), sans que le fond de cette section change.
- **Marquer, pas taire** — et c'est le cœur de la décision. Retirer le repère
  sans rien dire aurait été lu par le modèle comme le cas « aucune passation
  exploitable » que la consigne décrit déjà : un motif faux à la place d'un
  motif vrai, c'est-à-dire une dimension mesurée présentée comme non mesurée.
  Le motif arrive donc comme une DONNÉE, au patron d'`ecarteeDuRaisonnement`
  ([[D-048]], contre-revue).
- **Seuil à deux passations, pas une.** Avec une seule, il n'y a rien à
  départager et le repère reste vrai ; s'en abstenir coûterait un repère juste.
- **Indépendant du drapeau, délibérément.** Le risque naît de la coexistence de
  passations des deux époques dans un même dossier — un état que le drapeau
  éteint n'exclut plus une fois qu'il a été allumé une fois.
- Écarté : **déduire la forme de chaque passation depuis ses identifiants
  d'items** (`AL1`…`AL14` pour la forme courte). Plus fin, mais cela ferait
  dépendre un repère clinique d'une heuristique sur des clés de réponses brutes ;
  tant qu'aucun dossier ne mélange les deux formes, la précision gagnée est nulle
  et le risque de se tromper, réel.
- Écarté : **abstention systématique sur `Q_ALI_01`**, passation unique comprise
  — voir le seuil ci-dessus.
- Écarté : **renvoyer le sujet à un lot dédié.** Le repère est livré par ce lot ;
  laisser sortir la capacité qui rend le défaut actif en le nommant seulement au
  handoff aurait été le publier en connaissance de cause.
- Réserve nommée : cette décision **ne répare pas** le fond — un identifiant qui
  désigne deux instruments reste une ambiguïté du catalogue. Elle empêche un
  raisonnement faux, elle ne rend pas les deux formes comparables. `DC-25` :
  données insuffisantes ⇒ réduire la conclusion, jamais l'inventer.
- Portée : le repère de la synthèse IA **seulement**. L'orientation et les
  contradictions passent par la même `derniereReponseParQuestionnaire` et ne
  sont pas corrigées ici. **Elles ne sont pas exposées pour autant, et le motif
  n'est pas celui qu'une première rédaction avait écrit** — `R2-ALI-01` est
  publiée et cible bien `Q_ALI_01` (`orientationRulesV1.ts`), l'affirmation
  inverse était fausse. Ce qui protège est une garde nommée, et elle nomme ce
  cas précis : le recalcul à la lecture passe par `calculateScore`, qui rend
  `scored: false, total: null, interpretation: null` dès qu'aucune réponse ne
  correspond aux items de la définition servie — « c'est le cas des 8 passations
  de la forme courte à 14 items (clés `AL1`–`AL14`), qui ne partagent aucun
  identifiant avec les 57 items » (`web/src/lib/questions.ts`). Une passation de
  la mauvaise époque ne peut donc pas déclencher `R2-ALI-01`, dont le
  déclencheur porte sur l'interprétation. La garde tient dans les deux sens.
- Ce que cette protection ne couvre pas, et qui reste ouvert : elle éteint la
  passation d'une autre forme, elle ne la distingue pas d'une passation
  simplement non cotable. Un moteur qui, demain, déclencherait sur autre chose
  que l'interprétation — un nombre de passations, une date — retrouverait le
  piège intact. Porté au handoff.
- Réversibilité : retirer l'entrée de `INSTRUMENTS_A_FORME_VARIABLE` suffit à
  rétablir le comportement antérieur, et **trois des cinq bancs** du bloc
  « identifiant qui a désigné plusieurs instruments » le signaleraient — mesuré,
  pas supposé : « aucun repère », « l'abstention est locale » et « l'abstention
  vient d'une constante ». Les deux autres (passation unique, paire dont l'une
  est écartée) passent aussi sans la garde : ce sont des témoins, pas des
  gardes. **Le couple version/empreinte ne le verrait pas non plus** — le texte
  de la consigne serait inchangé, et décrirait alors un champ que plus personne
  n'émet.
- Référence : `web/src/lib/questionnaires/alimentaire.ts`,
  `web/src/app/api/praticien/synthese/route.ts`,
  `web/src/app/api/praticien/synthese/passationCourante.test.ts`, [[D-048]]

### D-050 — L'injection cockpit des contradictions : un modèle d'affichage, et un câblage réel

- Date : 2026-08-12
- Statut : accepté (décision utilisateur du 2026-08-12). **Ferme la réserve
  « le câblage relève d'un lot suivant » de [[D-048]] et complète la conséquence
  de conversion de [[D-044]]**, le reste de ces deux entrées étant intact. En
  particulier, [[D-048]] écrivait que « la protection effective aujourd'hui
  reste l'absence d'appelant autant que le verrou » : ce n'est plus vrai, il ne
  reste que le double verrou — et il suffit, la table n'étant pas signée.
- Domaine : clinique, restitution praticien, architecture
- Contexte : [[D-044]] écrit « conséquence : l'injection cockpit convertit »
  **sans nommer de cible**, après avoir posé que le moteur ne réutilise pas
  `DiscordanceFinding` et pourquoi (`confidence: QualitativeConfidence`, que le
  garde de [[D-041]] interdit). La cible restait donc à choisir, et le choix
  n'était pas libre : `QualitativeConfidence` ne propose que `solide`,
  `probable`, `fragile`, `à_documenter` — **aucune valeur ne dit « non
  applicable »**. Toute cible héritant de `ClinicalFindingBase` obligerait à
  inventer un degré de certitude. Par ailleurs, [[D-048]] a livré la capacité
  d'affichage **sans site d'appel** : le critère de sortie du LOT-01 sur
  l'injection cockpit n'était pas tenu, et l'entrée le disait.
- Décision, premier volet : **la conversion a lieu vers un modèle d'AFFICHAGE**
  (`ContradictionAffichee`), qui ne porte aucun champ de certitude, de
  probabilité, de score ou de confiance. `DiscordanceFinding` reste en place,
  inchangé, et ce moteur ne l'emprunte pas. Cette entrée **complète [[D-044]]**
  — elle ne l'amende pas : [[D-044]] avait laissé la cible ouverte, elle est
  nommée ici. Une première rédaction de cette entrée prétendait le contraire et
  corrigeait une prescription que [[D-044]] n'a jamais portée.
- Décision, second volet : **le câblage est fait dans ce lot**. Une étape nommée
  « injection cockpit » qui ne livre aucun site d'appel livre un composant que
  personne n'appelle. `POST /api/praticien/cockpit` rend désormais les constats
  à côté de `review`, et `ClinicalRuntimeSection` les passe au panneau. **Le
  critère de sortie du LOT-01 sur le PANNEAU cockpit est donc tenu**, et la
  réserve ouverte par [[D-048]] sur ce point est refermée.
- **L'étape 5 avait deux volets, et le second reste ouvert.** La spec décrit
  « injection vigilances **et** cockpit » : les constats déterministes
  n'alimentent pas `vigilanceDeterministe` de la route de synthèse, qui ne vient
  toujours que de l'anamnèse. Dit ici plutôt que laissé croire — l'étape n'est
  pas close, sa moitié cockpit l'est.
- **Rien ne s'allume pour autant.** Le double verrou fail-closed est appliqué
  dans le service — drapeau `WN_ENABLE_CONTRADICTIONS_NNPP2` **et** signature
  clinique de la table —, et la table est livrée **non signée** : la liste est
  vide quel que soit le drapeau. Le verrou est franchi **avant toute lecture du
  dossier** ; un banc épingle qu'aucune requête ne part verrou fermé.
- **Le recalcul depuis `rawAnswers` est partagé, pas recopié.** L'en-tête de
  `contradictionsEngine.ts` en fait une obligation de l'appelant ; l'appelant
  réutilise `scoresRecalculesPourRaisonnement` d'`orientationService` plutôt que
  d'en dupliquer les cinq motifs de mise à `null`. Une fermeture clinique
  recopiée dans deux services est une fermeture qu'on peut oublier de corriger
  dans l'un des deux. La fonction a perdu « Orientation » de son nom à cette
  occasion — il désignait son seul consommateur d'alors, pas ce qu'elle fait.
- Écarté : **étendre `QualitativeConfidence` d'une valeur « non applicable »**.
  Cela aurait ouvert le champ de certitude à tous les producteurs existants de
  `DiscordanceFinding` pour le confort d'un seul consommateur, et fait dépendre
  un garde clinique de la discipline de chaque appelant.
- Écarté : **laisser la cible de conversion dans le seul fragment `changelog.d/`
  et un commentaire de code.** Le lecteur de [[D-044]] serait resté devant une
  conversion sans destination, au moment précis où il en cherche une ; le
  changelog est un journal, il ne se relit pas comme le registre.
- **Périmètre différent de `review`, nommé plutôt que supposé** :
  `snapshot`/`review` sont calculés sur les réponses **incluses dans l'épisode
  T0 confirmé**, alors que les contradictions sont évaluées sur le **dossier
  entier**. Un constat peut donc reposer sur une passation laissée hors de
  l'épisode ; ses passations sont datées à l'écran, ce qui rend l'écart lisible.
  Réduire le moteur au périmètre de l'épisode est un arbitrage clinique qui
  **n'a pas été rendu** — il est porté au handoff.
- **Une passation écartée ne peut pas fonder un constat, drapeau ou pas — et sa
  ligne reste.** Le motif de validité du recalcul partagé est gaté par
  `WN_ENABLE_VALIDITE_PASSATIONS`, éteint en production : l'appelant applique
  donc le prédicat sans drapeau `statutExcluDuRaisonnement` pour **nuller le
  score**, jamais pour retirer la ligne. Le geste est celui
  d'`orientationService`, et pour sa raison : retirer la ligne ferait de la
  passation ANTÉRIEURE « la dernière », c'est-à-dire un repli sur une mesure que
  le praticien n'a pas invalidée mais qu'il n'a pas non plus désignée. Un
  praticien qui invalide attend une re-passation ; l'instrument s'éteint, il ne
  recule pas dans le temps. Une première rédaction de ce lot filtrait, ce qui
  violait de surcroît le contrat écrit du prédicat (« à n'utiliser que pour
  DÉSIGNER, jamais pour FILTRER »).
- Écarté : **renvoyer le câblage au lot suivant.** Trois lignes de liaison ne
  justifient pas un lot, et un critère de sortie non tenu qui traverse une
  clôture devient un critère qu'on oublie.
- Réversibilité : le champ `contradictions` de la réponse cockpit et la liaison
  du composant ; le verrou reste fermé dans tous les cas.
- Référence : `web/src/lib/clinical/contradictionsService.ts`,
  `web/src/app/api/praticien/cockpit/route.ts`,
  `web/src/components/patient-cockpit/ClinicalRuntimeSection.tsx`, [[D-041]],
  [[D-044]], [[D-048]]

### D-049 — Le CI fait autorité sur le palier E2E tant que le blocage navigateur local dure

- Date : 2026-08-12
- Statut : accepté (décision utilisateur du 2026-08-12)
- Domaine : validation, gouvernance des PR
- Contexte : depuis le 2026-08-11, la séquence complète locale
  (`npm run test:worktree`) échoue à répétition sur **un seul test par run,
  jamais le même**, dans `web/e2e/visual.spec.ts`, projet iPhone 13 (WebKit)
  uniquement : `page.goto` expire à 120 s pendant que ses voisines immédiates
  restent sous la seconde. Six runs, quatre blocages. La trace Playwright donne
  `0-trace.network` **vide** — aucune requête HTTP n'est jamais partie, le
  serveur n'a jamais été sollicité. La cause est dans le processus navigateur,
  hors de ce dépôt, et n'est pas identifiée. Preuve d'attribution close le
  2026-08-12 : le blocage s'est reproduit sur une branche d'outillage ne
  contenant aucune ligne de code applicatif. Jamais observé en CI (Linux).
- Décision : tant que ce blocage dure, **le CI tient lieu de palier E2E** pour
  les PR de classe migration/scoring/clinique, là où `CLAUDE.md` exigeait T3
  local.
- **Périmètre exact — seul le segment E2E bascule.** T3 local reste exigé, et
  reste joué, pour les contrats SQL (`web/prisma/checks/`), la dérive
  schéma↔migrations, la certification scoring et la suite unitaire complète.
  Cette décision ne dispense d'aucun de ces contrôles.
- **Condition de sortie, nommée** : le blocage cesse d'être observé sur deux
  séquences complètes consécutives, **ou** une cause racine est identifiée.
  L'un ou l'autre referme cette décision et rétablit `CLAUDE.md` à l'identique.
- Ce que cette décision **ne fait pas** : elle n'autorise pas à rejouer une
  suite jusqu'au vert, ni à ajouter des `retries` à Playwright — un réessai
  transformerait ce blocage en succès silencieux et emporterait avec lui les
  vrais échecs intermittents.
- Garde-fou associé : `scripts/wn-diagnostic-e2e.mjs` classe automatiquement
  cet échec (« `page.goto` expiré, et AUCUNE requête HTTP émise ») et rappelle
  dans son message que la séquence **reste rouge**. Sans ce classement, un
  blocage navigateur se lit comme une régression du code en cours — c'est
  arrivé trois fois en deux jours.
- Écarté : **instruire la cause racine avant de décider** — la navigation
  n'atteint jamais le réseau, l'instruction sort donc du dépôt et entre dans
  WebKit/Playwright, pour un coût sans terme prévisible pendant que le LOT-01
  reste bloqué.
- Écarté : **monter Playwright 1.61.1 → 1.62.1** — rien ne relie ce blocage à
  un correctif amont ; monter sur une supposition ne se distingue pas d'un
  tirage au sort.
- Réversibilité : une ligne de `CLAUDE.md` et cette entrée.
- Référence : `scripts/wn-diagnostic-e2e.mjs`, PR #662,
  `docs/claude/handoffs/2026-08-12-0546-diagnostic-blocage-navigateur-e2e.md`

### D-048 — Les trois arbitrages cliniques du LOT-01 (importance de C-STR, fenêtre temporelle, cohabitation à l'écran)

- Date : 2026-08-12
- Statut : accepté (décision utilisateur du 2026-08-12)
- Domaine : clinique, moteur de contradictions, restitution praticien
- Contexte : [[D-046]] a livré la table de contradictions v1 avec une seule
  règle publiée, C-STR, et a laissé trois points que le code ne pouvait pas
  trancher. Les étapes 3 et 5 du LOT-01 en dépendaient. Ils sont rendus
  ensemble parce qu'ils se tiennent : les deux derniers portent tous deux sur
  ce que le praticien voit.
- **1. `importance` de C-STR reste `useful_not_urgent`, et sa justification est
  écrite.** La valeur était posée **nue** dans `contradictionsV1.ts` — aucun
  commentaire, absente de [[D-041]], [[D-042]] et [[D-046]], absente du dossier
  de règles candidates. Le défaut était l'absence de motif, pas la valeur : la
  règle prescrit elle-même « à clarifier en entretien », ce qui est actionnable
  sans être urgent.
  - Écarté : **`critical_for_decision`** — le libellé servi au praticien est
    « Critique pour décider » (`MissingDataPanel.tsx`), et C-STR ne bloque
    aucune décision : elle demande une clarification en entretien. `DC-23` ne
    *réserve* aucun niveau — rédaction corrigée après revue, elle disait le
    contraire — mais elle pose que les red flags restent prioritaires sans se
    compenser avec aucun score ; hisser au niveau le plus haut un constat qui
    n'est pas un signal de sécurité ([[D-046]]) brouillerait cette hiérarchie.
  - Écarté : **`optional`** — contredirait la clarification en entretien que la
    règle prescrit.
  - Conséquence : la valeur ne change pas, donc `CONTRADICTIONS_RULES_SHA256`
    non plus. Seul un commentaire s'ajoute.
  - Réserve nommée : `DC-33` confie la hiérarchisation praticien (priorité 1,
    2, 3) au **LOT-04**. Cette décision ne l'anticipe pas ; elle donne au champ
    la valeur juste, elle n'invente pas de classement.
- **2. Aucune fenêtre temporelle. Le constat porte l'écart.** Le constat est
  émis quel que soit l'écart entre les deux passations comparées, et il porte
  le nombre de jours qui les sépare — ce qui rend vérifiable la troisième
  hypothèse explicative de C-STR (« une passation du DASS-21 antérieure ou
  postérieure à l'épisode que l'axe d'adaptation reflète »).
  - Écarté : **un seuil au-delà duquel on n'émet plus** — aucune source
    publiée ne donne de durée de validité croisée entre `Q_MOD_01` et le
    DASS-21. `DC-19` nomme explicitement les « fenêtres temporelles » parmi les
    chiffres exigeant une provenance, et `DC-30` interdit de supprimer une
    discordance en silence : taire un constat parce qu'il est « vieux » est
    exactement ce qu'elle proscrit.
  - Écarté : **un seuil déclaré `technical` au sens de `DC-20`** — un seuil
    d'ingénierie qui éteint un constat clinique est la confusion même que
    `DC-19` et `DC-20` existent pour empêcher.
  - **Un fait à corriger au passage** : le comportement n'était pas seulement
    ouvert, il était figé par accident. `contradictionsEngine.test.ts:137-146`
    produit un constat entre deux passations distantes de **40 jours** (et non
    six semaines, comme deux handoffs l'ont écrit), mais ce banc documente la
    limite de la garde de complétude — l'écart de dates y est un effet de bord
    **non commenté**. Il est ramené au même jour, et un cas temporel délibéré
    est écrit à côté.
  - Garde : l'écart est un **fait sur les données**, jamais un degré de vérité.
    Le garde non négociable de [[D-041]] interdit tout champ de certitude, de
    probabilité, de score ou de confiance « sous quelque nom que ce soit » ; un
    banc épingle que l'écart n'est lu par aucun tri, aucun seuil, aucun
    branchement.
  - Absence : une source unique donne un écart **`null`**, jamais `0` —
    `DC-24`, une donnée absente n'est ni zéro ni normale.
- **3. Le constat affiche sa justification de recoupement avec `R2-STR-01`.**
  Le champ `recoupementJustifie` existe déjà dans la règle, gardé par un banc,
  et **n'est lu par personne**. Il devient ce que le praticien lit quand les
  deux sorties coexistent — ce que son propre commentaire exige déjà : « deux
  sorties simultanées à l'écran doivent être défendables ». Cette phrase est
  celle du commentaire de `contradictionsV1.ts`, **pas** de la constitution :
  `DC-37` (« un questionnaire redondant ne s'assigne pas ») y est au statut
  **proposition**, et cette décision ne la rend pas opposable — elle en applique
  l'esprit à une sortie d'écran, ce que `DC-37` ne couvre pas littéralement.
  - Rappel de ce qui était déjà tranché par [[D-042]] : la coexistence est
    **voulue**. `R2-STR-01` (règle d'orientation de premier tour,
    `ADAPTATION_STRESS <= 17`) propose une **mesure**, le PSS-10 ; C-STR nomme
    une **contradiction** entre deux mesures déjà faites. La population de
    C-STR est un sous-ensemble de celle de `R2-STR-01`.
  - Écarté : **fusionner les deux sorties en une seule entrée d'écran** — on
    perdrait soit l'instrument à administrer, soit le signal que les
    instruments existants se contredisent.
  - Écarté : **renvoyer le traitement d'écran au LOT-04** — le texte existe
    déjà dans la règle ; l'afficher ne demande aucun arbitrage de
    hiérarchisation et n'empiète donc pas sur `DC-33`.
- Ce que ces trois décisions **n'allument pas** : la table reste **non signée**
  (`validationExterne: false`). La CAPACITÉ d'affichage part derrière un double
  verrou — drapeau d'environnement **et** signature clinique —, au patron de
  `orientationActive()`. Rien de ce lot n'atteint un praticien.
- **Ce lot ne CÂBLE pas l'injection**, et la formulation initiale de cette
  entrée le laissait croire : aucun site d'appel ne passe de constats au
  panneau. Ce qui est livré est la capacité — moteur, verrou, conversion,
  composant — et sa protection effective aujourd'hui reste l'absence d'appelant
  autant que le verrou. Le câblage relève d'un lot suivant, et le critère de
  sortie correspondant du LOT-01 n'est donc **pas tenu** ; il est nommé ici
  plutôt que passé sous silence, au patron de [[D-044]] point 2.
- Réversibilité : un commentaire, deux champs, une conversion et un bloc
  d'affichage sans appelant. Aucun schéma de base.
- Référence : `web/src/lib/clinical/contradictionsV1.ts`,
  `web/src/lib/clinical/contradictionFinding.ts`,
  `web/src/lib/clinical/contradictionsEngine.ts`,
  `web/src/lib/clinical/orientationRulesV1.ts` (`R2-STR-01`), [[D-041]],
  [[D-042]], [[D-044]], [[D-046]]

### D-047 — Réponse écrite de Scalingo (2026-08-11) : (b) est levée, (a) était mal requalifiée par D-037 et reste ouverte

- Date : 2026-08-11
- Statut : accepté (décision du **responsable de traitement** du 2026-08-11)
- Domaine : architecture, hébergement et conformité (HDS, RGPD)
- Contexte : réponse écrite de Scalingo au ticket ouvert le 2026-08-09
  ([[D-037]]), reçue par courriel (Jennifer, Scalingo) le 2026-08-11,
  consignée dans `docs/DOSSIER_RGPD.md` §6.
- Décision : deux arbitrages sur les conditions dures de [[D-006]], relevées
  par [[D-037]], pris ensemble.
  1. **(b) périmètre HDS de la région — LEVÉE.** Scalingo confirme par écrit
     que les ressources créées avec `--hds-resource` en `osc-fr1`
     (application, add-on PostgreSQL, ses sauvegardes) sont couvertes par le
     certificat LNE n° 38436-2, pour les six activités du référentiel dont la
     5 (administration et exploitation) et la 6 (sauvegardes externalisées).
     C'est exactement la pièce que [[D-037]] attendait du ticket.
  2. **(a) DPA — la requalification de [[D-037]] était fausse ; la condition
     reste ouverte, autrement caractérisée.** [[D-037]] posait que l'accord de
     sous-traitance vivait dans les documents généraux acceptés à la
     souscription, et qu'« il n'y a donc pas d'e-signature à obtenir » — sous
     réserve explicite de confirmation du fournisseur, jamais obtenue avant ce
     jour. Scalingo répond l'inverse, sans ambiguïté : l'accord se compose du
     DPA et d'une **annexe HDS distincte**, et « l'acceptation des conditions
     générales seule ne suffit pas » à activer l'option HDS — l'annexe se
     signe séparément. (a) n'est donc pas seulement non accomplie comme le
     disait [[D-037]] : elle était **mal caractérisée**. Ce qui reste à faire
     n'est plus d'archiver une pièce déjà acceptée, mais d'**obtenir et signer
     l'annexe HDS**, puis d'archiver le DPA et cette annexe signée.
- Ce que cette décision **ne fait pas** : elle n'ouvre pas la migration des
  données réelles. L'ordre imposé de [[D-006]] tient intégralement — aucun
  patient réel sur Scalingo avant que (a) soit **effectivement** levée
  (signature et archivage faits, pas seulement caractérisés).
- État réel des deux conditions dures de [[D-006]] après cette décision :
  - **(a) DPA + annexe HDS — ouverte.** Action restante : obtenir l'annexe HDS
    auprès de Scalingo (ticket existant ou `support@scalingo.com`), la signer,
    puis archiver le DPA et l'annexe signée au dossier.
  - **(b) périmètre HDS `osc-fr1` — levée.**
  - Les réserves (3), (4), (5) de [[D-006]] — inchangées, cf. [[D-037]].
- Réversibilité : une décision de registre se révoque par une décision de
  registre.
- Référence : `docs/DOSSIER_RGPD.md` §6, courriel Scalingo (Jennifer) du
  2026-08-11, [[D-037]], [[D-006]].

### D-046 — Un constat n'est pas une prescription : `prescriptif` est exigé des claims de l'orientation, pas de ceux des contradictions

- Date : 2026-08-11
- Statut : accepté (décision utilisateur du 2026-08-11, LOT-01 de la campagne `2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie`)
- Domaine : clinique, corpus de claims, contrat de lecture sur la production
- Contexte : l'écriture de C-STR bute sur une contradiction entre deux décisions du même jour. Le claim qui fonde exactement la règle est `WN-CL-0238-002` — « les symptômes de stress […] ne présentent pas de corrélation avec la gravité de la charge allostatique » —, `VALIDE`, actif, non remplacé, dans le périmètre orientation, mais **`prescriptif = false`**. Or [[D-044]] exige `prescriptif = true` de toute paire épinglée : l'épingler rendrait rouge le contrat de fraîcheur et **bloquerait toute release**.
- **Décision : la propriété `prescriptif` n'est exigée que des claims épinglés par une table qui PRESCRIT.** Le contrat porte désormais, pour chaque paire, la table qui l'épingle : quatre propriétés pour `orientation`, trois pour `contradictions` (`statut = 'VALIDE'`, `active = true`, pas de `superseded_at`).
- Motif : les quatre propriétés de [[D-044]] sont le jeu que la relecture du 2026-08-06 avait contrôlé **sur la table d'orientation**, dont chaque règle *suggère une exploration* — une prescription. Une règle de contradiction ne prescrit rien : elle **constate** que deux instruments ne disent pas la même chose, et ce constat se fonde sur un fait descriptif. Exiger `prescriptif` d'un claim descriptif est une erreur de catégorie, importée d'une table qui n'a pas le même objet.
  - La distinction est celle que `DC-30` porte déjà : une discordance **se signale**, elle ne se moyenne ni ne se supprime. Signaler n'est pas prescrire.
- Options écartées :
  - **Épingler des claims prescriptifs adjacents** — `WN-CL-0323-028` (« il est important d'associer des questionnaires évaluant les 3 pathologies ») et `WN-CL-0236-012` (« le choix des questionnaires doit reposer sur […] la perception clinique »). La règle serait publiable et le contrat vert, mais aucun des deux ne dit que les symptômes ne corrèlent pas à la charge : la justification serait un rapprochement que la source ne porte pas, exactement ce que `DC-14` interdit. Écarté — un contrat vert obtenu en tordant une source est pire que pas de contrat.
  - **Différer C-STR** (règle en `brouillon`, `justificationClaims` vide). Honnête, mais le lot livrerait une table sans règle et le contrat de fraîcheur n'aurait rien de neuf à garder — les deux livrables se videraient l'un l'autre.
  - **Retirer `prescriptif` du contrat pour toutes les tables.** Plus simple, et strictement moins protecteur : la table d'orientation prescrit des explorations, et la relecture du 2026-08-06 a vérifié cette propriété-là sur ses 23 claims. La perdre pour résoudre le cas d'une autre table serait payer la simplicité avec la garantie existante.
- Conséquence : le contrat cesse d'être une liste de paires pour devenir une liste de paires **qualifiées par leur table**. Le banc de couverture refuse une table inconnue plutôt que de lui appliquer un jeu de propriétés par défaut — un troisième moteur devra faire l'objet de son propre arbitrage, pas d'un héritage silencieux.
- Réversibilité : une colonne du contrat SQL, une correspondance dans le banc de couverture. Aucun schéma de base, aucune migration.
- Référence : `web/prisma/checks/rag_claim_fraicheur_tables_signees_v1.sql`, `web/src/lib/clinical/claimsEpinglesFraicheur.guard.test.ts`, `web/src/lib/clinical/contradictionsV1.ts`, `docs/claude/doctrine/CONSTITUTION_CLINIQUE.md` (`DC-14`, `DC-30`), [[D-041]], [[D-042]], [[D-044]]

### D-045 — Le moteur de propositions de parcours ouvre avec quatre règles, chacune sur un signal exact, et la dysphagie n'y devient pas une vigilance

- Date : 2026-08-11
- Statut : accepté (décision utilisateur du 2026-08-11, LOT-03 de la campagne `2026-08-10-chaine-alimentaire`)
- Domaine : clinique, moteur de règles, parcours alimentaires, anamnèse
- Décision : publier **quatre règles de parcours, et elles seules**, à l'ouverture du moteur de propositions de parcours. Chacune est adossée à des claims `VALIDE` du corpus et à un signal **déjà capté**, sans appariement inventé. Le dossier de règles candidates (`DOSSIER_REGLES_LOT-03.md`, PR #654) en listait huit au §4.A ; l'arbitrage n'en retient que quatre.
  1. **`R-PARC-ALI-01` — assiette de détoxication.** Claim `WN-CL-0287-009`, condition verbatim « lorsque le score global de l'enquête alimentaire SiiN détaillée est défavorable ». Déclencheur `Q_ALI_01` en zone `{type:'interpretation'}`, citant **au caractère près** les deux bandes défavorables de la forme SIIN57 (`questionnaires/alimentaire.ts:312-313`) : « Alimentation déséquilibrée, ne contribuant pas au maintien du capital santé » et « Alimentation très déséquilibrée et défavorable ». La bande `info` (51-70, « plutôt équilibrée, mais insuffisamment protectrice ») reste **dehors**, comme `R2-ALI-01` l'a tranché le 2026-08-04. **Aucun claim neuf** : c'est la **seconde branche** de `WN-CL-0287-009`, celle que `R2-ALI-01` a dû abandonner faute de cible parcours (`orientationRulesV1.ts:1082-1084` — l'assiette de détoxication « n'est PAS un questionnaire »).
  2. **`R-PARC-ALI-02` — éviction du gluten / régime méditerranéen adapté.** Claims `WN-CL-0072-031`, `WN-CL-0076-018`, condition verbatim « en cas d'intolérance au gluten ». Déclencheur : drapeau `intolerancesAlimentaires` contenant « Gluten » (`consultation/drapeauxAnamnese.ts:27`, énuméré `anamnese.ts:179-182`).
  3. **`R-PARC-ALI-03` — régime à faible teneur en histamine.** Claims `WN-CL-0250-001`, `WN-CL-0251-011`, condition verbatim « chez les sujets présentant des symptômes d'intolérance à l'histamine ». Déclencheur : `intolerancesAlimentaires` contenant « Histamine ».
  4. **`R-PARC-ALI-04` — alimentation mixée.** Claims `WN-CL-0389-024`, `WN-CL-0386-008`, `WN-CL-0387-016`, condition verbatim « en cas de troubles de la déglutition ». Déclencheur : drapeau `symptomesFonctionnels` contenant « Difficultés à avaler / troubles de la déglutition » (`drapeauxAnamnese.ts:28`, énuméré `anamnese.ts:110-119`).
- Conséquences et bornes — **non négociables** :
  - **Jamais d'auto-assignation.** Le moteur **propose** ; le praticien lit, valide ou amende. Invariant repris du moteur d'orientation, il n'est pas rediscutable pour cette cible-ci.
  - **Une dysphagie récente et inexpliquée reste un motif d'adressage.** `R-PARC-ALI-04` propose une **texture à côté** de cet avis — elle ne l'éteint pas, ne le retarde pas et ne le remplace pas. En conséquence, `symptomes_fonctionnels` **reste hors `extraireVigilanceDeterministe`** (`consultation/contexteClinique.ts:159`) : porter la dysphagie en vigilance déterministe serait une **décision propre**, avec sa formulation et son banc, et elle n'est pas prise ici. L'avertissement déjà posé en commentaire d'`anamnese.ts` (« une règle qui la lit ne doit jamais court-circuiter cette vigilance ») est ainsi tenu par construction, pas par vigilance de relecture.
  - **Fail-closed ; `null`, jamais `0`.** Signal absent, non capté ou hors énuméré ⇒ la règle est **muette**, jamais « pas de parcours indiqué » ni une proposition par défaut. Une anamnèse sans le champ n'est pas une anamnèse sans intolérance (`DC-24`).
  - **Les anamnèses antérieures à #655 restent muettes.** La capture structurée des intolérances et de la déglutition date de la PR #655 ; **aucun rattrapage rétroactif** n'est fait ni autorisé. Les dossiers plus anciens ne déclenchent rien, et cela n'est pas un défaut à corriger par dérivation.
  - **Le texte libre n'est jamais un déclencheur.** Le champ `allergies` « Allergies et intolérances connues » (`anamnese.ts:173`) remonte au praticien en contexte, **jamais** au moteur — pas de correspondance textuelle, pas d'extraction, pas d'inférence.
  - **Rien de la biologie.** Le groupe B du dossier (§4.B — CRP, HOMA, ferritine, 25-OH-D…) reste **hors de ce moteur** : ces conditions sont des valeurs biologiques, non déductibles d'un questionnaire ou de l'agenda. Elles appartiennent au versant biologie-révision.
  - **Aucun des 16 claims porte-seuil n'est mobilisé.** Les quatre règles retenues sont toutes sans borne chiffrée ; la garde `rag_claim_porte_seuil` n'a donc rien à arbitrer dans cette ouverture, et aucun dosage ni durée ne transite par le moteur.
  - **`WN_ALI_01_SIIN57` est respecté par construction.** Citer les **bandes verbatim** de la forme SIIN57 — et non une couleur — fait que `R-PARC-ALI-01` **cesse d'elle-même de mordre** en forme COURT14, dont les libellés sont d'autres phrases. Pas de garde à maintenir ailleurs ; c'est la leçon de `R2-ALI-01` (`orientationRulesV1.ts:1021-1043`) appliquée à l'identique.
- Options écartées :
  - **Publier tout le groupe A** (les 7 parcours du §4.A). Écarté : l'assiette **psychobiotique** (`WN-CL-0291-014`) dépend de l'axe A5 de densité végétale, dont la calibration est gatée par la **porte des 21 jours** ; l'assiette **sérotoninergique** (`WN-CL-0341-025`, `WN-CL-0245-014`) demande un **appariement instrument→parcours non tranché**. Ouvrir large aurait fait entrer deux règles dont le déclencheur serait proposé ici plutôt que porté par le claim.
  - **Déclencher sur un antécédent adjacent, façon `R2-GAS-02`** — « Digestif (SII…) » pour le gluten, « Allergies / atopie » pour l'histamine. Écarté au profit du **signal exact capté en #655** : un antécédent voisin n'est pas l'intolérance que le claim nomme, et le raccourci aurait fait mordre les règles sur une population que la source ne couvre pas (`DC-14`).
  - **Lire le texte libre** des allergies pour rattraper les dossiers anciens : écarté, c'est une extraction inventée depuis de la prose.
  - **Porter la dysphagie en vigilance dans le même geste** : écarté — deux objets distincts, deux décisions distinctes (voir bornes).
- Réversibilité : la table de règles est versionnée et `statut`-gardée (**`publiee` seulement**) ; repasser une règle en `brouillon` ou `suspendue` la neutralise sans migration. Le moteur entier part derrière un **drapeau éteint**, et l'objet « proposition de parcours » voyage en **migration séparée** du code. `git revert` suffit sur la table.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-alimentaire/DOSSIER_REGLES_LOT-03.md` (§4.A, §5, §6), `docs/claude/campagnes/2026-08-10-chaine-alimentaire/lots/LOT-03-moteur-propositions-parcours.md`, PR #654 (dossier de règles), PR #655 (capture des signaux déclarés), `web/src/lib/questionnaires/alimentaire.ts:309-314` (bandes SIIN57), `web/src/lib/clinical/orientationRulesV1.ts:1021-1084` (`R2-ALI-01`, branche perdue), `web/src/lib/consultation/drapeauxAnamnese.ts:27-28`, `web/src/lib/consultation/anamnese.ts:110-119` et `:173-182`, `web/src/lib/consultation/contexteClinique.ts:159`, [[D-030]], [[D-031]], [[D-033]], [[D-034]], [[D-043]]

### D-044 — Trois conséquences de la revue de clôture du LOT-01

- Date : 2026-08-11
- Statut : accepté (décision utilisateur du 2026-08-11, après revue `wn-reviewer` du dossier doctrinal)
- Domaine : clinique, types du moteur d'interprétation, critères de campagne, CI
- Contexte : la revue de clôture a trouvé trois écarts que ni [[D-041]] ni [[D-042]] n'avaient vus. Aucun n'est un désaccord clinique ; les trois sont tranchés ici pour que la première ligne de TypeScript du lot ne parte pas sur un contrat faux.
- **1. Le moteur définit son propre objet ; il ne réutilise pas `DiscordanceFinding`.** Le garde non négociable de [[D-041]] (« aucun champ de certitude, de probabilité, de score ou de confiance, sous quelque nom que ce soit ») est **déjà violé** par le type que la spec désignait : `DiscordanceFinding` hérite de `ClinicalFindingBase`, qui porte `confidence: QualitativeConfidence` (`clinical-engine/types.ts:184-186`), et `clinicalReview.ts:107` le valide à l'exécution. Le banc exigé par D-041 aurait échoué le premier jour.
  - Le moteur du LOT-01 porte donc un type propre, à trois formes, **sans aucun champ de cette famille**. `DiscordanceFinding` reste en place, inchangé et non utilisé par ce moteur.
  - Écarté : **retirer `confidence` de `ClinicalFindingBase`** — c'est le bon geste à terme, mais le socle est partagé avec `MissingDataFinding`, `SafetyFinding` et `DecisionPriorityCandidate` : refactor d'un type clinique partagé, donc son propre `D-xxx` et son propre lot.
  - Écarté : **amender le garde de D-041** pour tolérer une qualification qualitative de la donnée. La nuance « `confidence` qualifie la donnée, pas la conclusion » est exactement la confusion que `DC-29` existe pour empêcher ; la laisser vivre dans le type l'aurait rendue indéfendable en revue.
  - Conséquence : l'injection cockpit convertit ; c'est le coût assumé de la coexistence de deux familles de constats voisines.
- **2. Les critères de sortie du LOT-01 sont réduits, et l'écart est nommé.** Le critère 2 du Lot B (`sources/02-spec-lots-parcours-t0.md:119-122`) exige que la sortie « porte les deux vigilances C-STR et C-SOM » ; [[D-042]] le rend inatteignable. La fiche revendique désormais les critères **3 et 4 intégralement**, le critère **1 en partie** (mélatonine non suggérée : tenu ; contradiction de sommeil produite : non tenu) et déclare le critère **2 non tenu**, motif D-042.
  - Écarté : **amender la spec** dans `sources/`. Ces documents sont l'original de la campagne ; les réécrire fait perdre la trace de ce qui avait été demandé. Un écart nommé dans la fiche est relisible, une spec retouchée ne l'est plus.
- **3. Le contrat de fraîcheur des claims part sur un déclencheur CI étendu.** `release-db` ne se déclenche automatiquement que sur un `push` vers `main` touchant `web/prisma/migrations/**` (`.github/workflows/release-db.yml:24-27`), et D-042 exclut toute migration : le contrat, tel que D-042 le décrivait, n'aurait jamais démarré seul. `paths` est donc étendu à `web/src/lib/clinical/**`, de sorte que toute modification d'une table signée rejoue les contrats de lecture sur la production.
  - **Cette modification ne voyage pas dans la PR documentaire** : elle élargit ce qui déclenche un accès à la base de production et appelle sa propre revue. Elle part avec le code du LOT-01.
  - Le précédent est nommé : [[D-015]] avait déjà promis un rejeu production pour `agenda_alimentaire_v1.sql` — il n'a jamais été câblé. Un déclencheur automatique évite de répéter la promesse.
  - Le banc contrôle la paire `(claim_id, version_claim)`, et **quatre** propriétés, non trois : `statut = 'VALIDE'`, `active = true`, absence de `superseded_at`, et `prescriptif = true` — c'est le jeu que la relecture du 2026-08-06 avait effectivement contrôlé (`orientationRulesV1.ts:1403-1408`). Une contrepartie négative accompagne le contrat, au patron de `packs_registre_coherence_v1_negatif.sql`.
- Réversibilité : un type neuf, un paragraphe de critères, quatre lignes de workflow. Aucun schéma de base.
- Référence : `web/src/lib/clinical-engine/types.ts:184-215`, `web/src/lib/clinical-engine/clinicalReview.ts:107`, `.github/workflows/release-db.yml:24-27`, `web/src/lib/clinical/orientationRulesV1.ts:1403-1408`, [[D-015]], [[D-018]], [[D-041]], [[D-042]]

### D-043 — L'extrait permanent de `CLAUDE.md` est opposable ; neuf règles basculent à « acté », la dette de bancs est nommée

- Date : 2026-08-11
- Statut : accepté (décision utilisateur du 2026-08-11)
- Domaine : gouvernance clinique, doctrine, contexte permanent des agents
- Contexte : l'extrait permanent ajouté à `CLAUDE.md` déclare « ces règles valent », alors que onze des `DC-nn` qu'il citait portaient le statut **proposition** — que `docs/claude/doctrine/README.md` définit comme « informe une revue, ne la tranche pas ». Le lot court-circuitait le mécanisme de statut qu'il venait de créer.
- **Décision : les règles de l'extrait sont opposables.** Neuf basculent à **acté** dans `CONSTITUTION_CLINIQUE.md` : `DC-12`, `DC-14`, `DC-17`, `DC-20`, `DC-23`, `DC-27`, `DC-30`, `DC-34`, `DC-35`.
- **Ce que « acté » signifie ici, et ce qu'il ne signifie pas.** Ces règles sont opposables **en revue et à tout agent** : une PR qui les enfreint est refusable en citant la règle. Elles ne sont **pas** pour autant tenues à l'exécution — aucune n'est encore gardée par un banc. Chaque statut le dit sur place (« **Banc dû** : la règle ne mord pas encore à l'exécution »), et c'est la dette que ce lot reconnaît plutôt que de la laisser invisible.
  - La distinction est nécessaire : l'acte d'intégration défini par l'audit (décision + banc + bascule du statut) vise les règles qui doivent mordre **dans le code**. Une règle de conduite peut lier une revue avant que son banc existe ; la confusion des deux aurait rendu l'extrait permanent inutilisable pendant des mois.
- **`DC-29`, `DC-54` et `DC-55` restent « proposition »** — [[D-041]] le réserve explicitement tant que le banc qui les fait mordre n'existe pas, et une décision de gouvernance ne défait pas une réserve clinique nommée. En conséquence, la puce « conflit non résolu ⇒ escalade praticien » de `CLAUDE.md` est requalifiée : elle est signalée comme non encore opposable, au lieu d'être présentée comme une règle qui vaut.
- Options écartées :
  - **Restreindre l'extrait aux règles déjà actées** : cohérent, mais il perdait ses règles les plus utiles au quotidien (`DC-27` association ≠ causalité, `DC-30` discordance, `DC-20` seuil clinique ≠ technique) — c'est-à-dire précisément celles qu'un agent enfreint sans s'en apercevoir.
  - **Retirer l'extrait de `CLAUDE.md`** : le contexte permanent restait court, mais plus rien ne rappelait la doctrine hors des chemins cliniques, où le rappel arrive trop tard.
- Réversibilité : neuf lignes de statut et une section de `CLAUDE.md`. Aucun code.
- Référence : `docs/claude/doctrine/CONSTITUTION_CLINIQUE.md`, `docs/claude/doctrine/README.md`, `docs/claude/doctrine/AUDIT_DOCTRINE_CHAINE_T0.md` (« L'acte d'intégration lui-même »), `CLAUDE.md`, [[D-041]]

### D-042 — La table de discordances V1 part avec une seule règle, et un banc de fraîcheur garde les claims épinglés

- Date : 2026-08-11
- Statut : accepté (décision utilisateur du 2026-08-11, LOT-01 de la campagne `2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie`)
- Domaine : clinique, moteur de discordances, corpus de claims
- Contexte : la descente prédicat par prédicat des trois règles de la spec (`DOSSIER_REGLES_LOT-01.md`) a établi qu'elles ne sont pas dans le même état. Les trois arbitrages sont tranchés ensemble ici.
- **C-STR — retenue, seuil `≤ 8`.** Déclencheurs : `ADAPTATION_STRESS ≤ 8` (`Q_MOD_01`) **et** DASS-21 dans la bande « Normal » sur dépression (`D ≤ 4`) et stress (`S ≤ 7`). Aucun de ces trois chiffres n'est arbitré : `≤ 8` est exactement la bande « Adaptation perturbée » de l'axe (bandes 0-8 / 10-17 / 18-24, `orientationRulesV1.ts:676-682`), `D ≤ 4` et `S ≤ 7` sont les bandes publiées du DASS-21 (`questions.ts:157-159`). `DC-19` est tenue sans réserve.
  - **Le trou à 9 est laissé ouvert, délibérément.** Les bandes de l'axe ne couvrent pas la valeur 9. Étendre à `≤ 9` aurait fermé le trou au prix d'un point sans source. Le patient à 9 n'est pas laissé sans rien : `R2-STR-01` le couvre déjà (`≤ 17`) et lui propose le PSS-10 — il perd la vigilance de discordance, pas l'orientation.
  - **Recoupement assumé et à écrire dans la règle** : C-STR se déclenche sur un sous-ensemble de la population de `R2-STR-01`. Les deux sorties coexisteront à l'écran ; l'une propose une mesure, l'autre nomme une contradiction. `DC-37` exige que cette justification soit portée par la règle, pas supposée.
- **C-SOM — retirée de la V1, motif inscrit dans la table.** L'axe `ME` du DNST (`Q_INF_03`) est titré « Mélatonine — Rythme **et socialisation** » et porte **six items de sociabilité sur dix** (ME1, ME2, ME5, ME6, ME8, ME9), pesant jusqu'à 24 points sur 40. Comme la règle exige que le PSQI, l'Epworth et le Berlin soient **rassurants**, elle ne sélectionnerait pas une discordance de sommeil : elle sélectionnerait, **systématiquement et non au hasard**, des patients introvertis qui dorment bien. C'est le cas que `DC-09` et `DC-28` existent pour attraper.
  - Écarté : **créer maintenant** le sous-score de rythme (ME3/ME4/ME7/ME10, plafond 16). La règle mesurerait enfin ce qu'elle prétend mesurer, mais ce sous-score n'existe pas au catalogue — donc un `versionScore`, un `D-xxx` propre et un périmètre qui déborde un lot de garde-fou de synthèse. **Instruit séparément.**
  - Écarté : **maintenir C-SOM telle quelle**. La spec en fait une régression testée (section 57) ; le banc validerait alors un comportement faux.
- **C-ALI — reportée.** Le prédicat « restriction déclarée (drapeau anamnèse) » n'a **aucun support direct**. `DrapeauxAnamnese` porte **dix** clés à `367688ad` (`drapeauxAnamnese.ts:14-31`) : les huit d'origine, plus `intolerancesAlimentaires` et `symptomesFonctionnels` ajoutées par ce même commit. Deux candidats existent donc, et **aucun des deux n'est une restriction déclarée** : `variationPoids` est proche du sujet sans le couvrir ; `intolerancesAlimentaires` (`anamnese.ts:179-181` — Gluten, Histamine, Lactose) déclare une **cause supposée**, pas un comportement d'éviction — un patient peut se déclarer intolérant sans rien évincer, et évincer sans se déclarer intolérant. Substituer l'un ou l'autre serait l'extrapolation que `DC-14` interdit. La règle dépend d'une modification du recueil d'anamnèse, qui est un autre geste dans un autre lot.
  - **Correction d'une affirmation de la première rédaction** : le seuil `≥ 7` de la plainte surpoids **a** une provenance, contrairement à ce qui avait été écrit. `surpoids` est le sous-score `Q004` de `Q_MOD_03` (`mode-de-vie.ts:28`), dont la grille d'interprétation certifiée ouvre la bande « Intensité élevée » exactement à 7 (`mode-de-vie.ts:33-37`) ; la table d'orientation **signée** s'en sert déjà au même seuil pour `R2-NEU-01` (`orientationRulesV1.ts:775-786`). `DC-19` n'est pas en cause ici.
- **Conséquence : la table V1 porte UNE règle**, `validationExterne: false` à la livraison — écrire une règle et la signer restent deux gestes distincts (même discipline que `orientationRulesV1.ts`). Les quatre livrables d'architecture du lot — moteur, prompt v20, schéma de sortie strict, injection cockpit — sont **inchangés**. Une règle signée juste vaut mieux que trois dont deux produisent des vigilances fausses.
- **Banc de fraîcheur des claims épinglés — dans ce lot.** Le lot épingle de nouveaux `justificationClaims` au patron d'`orientationRulesV1`, dont l'audit a établi que le compilateur annoncé (`tools/corpus/orientation/`) n'a jamais existé. Sans banc, le lot duplique le trou dans une table neuve. Le banc vérifie que chaque claim cité **existe, est `VALIDE` et n'est pas `superseded`**, et couvre **les deux tables** d'un coup.
  - **Réserve de conception, non négociable** : la base CI est vide. Un banc écrit comme test CI serait **vacué** — exactement le piège nommé dans [[D-015]] et [[D-012]], où la partie du contrat qui protège le plus est celle que le CI ne joue pas. Il prend donc la forme d'un contrat rejoué **en lecture seule sur la production** (patron `web/prisma/checks/`), jamais celle d'un test unitaire vert sur une base sans claims.
- Réversibilité : une table de règles et un contrat de lecture ; aucun schéma de base, aucune migration.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie/DOSSIER_REGLES_LOT-01.md`, `docs/claude/doctrine/AUDIT_DOCTRINE_CHAINE_T0.md` (§E), `web/src/lib/questions.ts` (bandes DASS-21 et DNST), `web/src/lib/clinical/orientationRulesV1.ts:676-682`, [[D-012]], [[D-015]], [[D-041]]

### D-041 — Discordance, convergence et conflit de sources sont un seul objet à trois formes

- Date : 2026-08-11
- Statut : accepté (décision utilisateur du 2026-08-11, LOT-01 de la campagne `2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie`)
- Domaine : clinique, architecture du moteur d'interprétation, synthèse IA
- Décision : le moteur du LOT-01 produit **un objet unique**, discriminé par une `forme` à trois valeurs, et non trois objets voisins :
  1. **`DISCORDANCE`** — deux instruments ou plus qui se contredisent sur un même axe (`DC-30`). Forme livrée par le LOT-01.
  2. **`CONVERGENCE`** — plusieurs sources indépendantes qui pointent le même axe (`DC-29`), graduée `SIGNAL` · `CONVERGENCE_FAIBLE` · `CONVERGENCE_MODEREE` · `CONVERGENCE_FORTE`.
  3. **`CONFLIT_SOURCES`** — deux claims ou sources du corpus qui ne disent pas la même chose (`DC-54`), avec issue d'escalade praticien (`DC-55`).
- Motif : les trois ont la même forme — des sources, une description, une importance, des hypothèses, une action suggérée, un état résolu ou non — et diffèrent seulement par la **matière** confrontée (instruments, faisceau, corpus). Trois objets auraient produit trois vocabulaires de vigilance sur le même écran et, à terme, trois moteurs.
- **Le garde-fou qui rend cette fusion acceptable — non négociable.** Réunir convergence et discordance dans un objet portant un champ d'importance invite à lire la convergence comme une certitude. `DC-29` l'interdit : **la convergence augmente la priorité, jamais la certitude**. En conséquence, l'objet ne porte **aucun champ de certitude, de probabilité, de score ou de confiance**, sous quelque nom que ce soit ; la graduation de la forme `CONVERGENCE` compte des **sources indépendantes**, elle ne mesure pas une vraisemblance. Un banc doit asserter l'absence d'un tel champ — sans quoi la fusion se retourne contre la doctrine qu'elle sert.
- Conséquences :
  - Le déterministe produit ces objets ; **le LLM les restitue et ne les crée jamais** ([[D-003]], `DC-02`). Aucune forme n'est supprimable par la sortie du modèle.
  - Les trois formes partagent le même canal d'injection — vigilances de synthèse et panneau du cockpit — donc un seul vocabulaire pour le praticien.
  - Seule la forme `DISCORDANCE` est peuplée par le LOT-01. Les deux autres sont **prévues par le type, vides à la livraison** : la structure évite le second moteur, elle n'anticipe aucune règle clinique.
  - L'escalade praticien de `CONFLIT_SOURCES` (`DC-55`) est une **issue** de la politique de résolution, pas son échec.
- Options écartées :
  - **Trois objets distincts** : plus lisibles pris un par un, mais deux vocabulaires de vigilance cohabitant à l'écran et un second moteur à écrire dès la première convergence.
  - **Un objet sans discriminant**, les trois cas se distinguant par leurs champs remplis : rend intestable l'absence d'un champ de certitude et laisse la forme se déduire, donc se tromper.
- Portée de cette décision dans l'intégration doctrinale : elle est le **premier des trois actes** exigés par `DC-18`. `DC-29` et `DC-54` restent au statut **proposition** dans `CONSTITUTION_CLINIQUE.md` tant que le banc qui les fait mordre n'existe pas ; elles ne basculent à **acté** qu'à ce moment.
- Réversibilité : un type et une table de règles, aucun schéma de base, aucune migration. `git revert` suffit.
- Référence : `docs/claude/doctrine/CONSTITUTION_CLINIQUE.md` (`DC-29`, `DC-30`, `DC-54`, `DC-55`), `docs/claude/doctrine/AUDIT_DOCTRINE_CHAINE_T0.md` (véhicule V1), `docs/claude/campagnes/2026-08-10-chaine-t0-operationnelle-de-la-donnee-valide-a-la-revision-par-biologie/lots/LOT-01-gardefous-synthese-contradictions.md`, [[D-003]], [[D-011]]

### D-040 — La discordance rythme déclaré/observé est un drapeau directionnel de sur-déclaration, praticien-only, à trois axes

- Date : 2026-08-10
- Statut : accepté (décision utilisateur du 2026-08-10, LOT-01 de la campagne `2026-08-10-chaine-alimentaire`)
- Domaine : clinique, scoring, agenda alimentaire, Mon Équilibre
- Décision : confronter le **rythme alimentaire déclaré** — sous-score `RYTHME_CHRONO` de `Q_ALI_01` (items `SIIN52/53/54/55`, `web/src/lib/questionnaires/alimentaire.ts:303`) — au **rythme observé** par l'agenda alimentaire clôturé (agrégats `AGA_*`, `web/src/lib/agenda-alimentaire/cloture.ts`, D-039). La confrontation prend la forme d'un **drapeau DIRECTIONNEL de sur-déclaration** : il ne se lève que lorsque le patient **déclare favorable ET l'agenda observe défavorable** — jamais l'inverse (un patient lucide sur son défaut n'est pas signalé). Praticien-only, niveau de preuve D, point à explorer, jamais un diagnostic ([[D-034]]).
- Les trois axes et leurs seuils — **fixés par l'utilisateur, révisables à la clôture des 21 jours** :
  1. **Jeûne nocturne** — déclaré `SIIN54` « ≥ 10 h » ; observé `AGA_JEUNE_MEDIAN`. Drapeau si observé **< 600 min**. Ce seuil n'est **pas inventé** : c'est la borne de la source elle-même (10 h = 600 min), la même que le barème `SIIN54 {min:10}` (`alimentaire.ts:252`).
  2. **Protéines au matin** — déclaré `SIIN52/53` « chaque jour / régulièrement » (oui) ; observé `AGA_FREQ_PROTEINES_MATIN_SEM` (jours/7). Drapeau si observé **< 4 j/7** (rupture de majorité face à une déclaration de régularité).
  3. **Soir léger** — déclaré `SIIN55` « soir léger et digeste » (oui) ; observé `AGA_FREQ_SOIR_COPIEUX_SEM` (jours/7 où le soir fut le plus copieux). Drapeau si observé **> 3 j/7** (le soir fut le plus copieux la majorité des jours, contredisant « léger »).
- Ce que les seuils 2 et 3 sont, et ce qu'ils ne sont pas : des **arbitrages cliniques explicites**, sans distribution réelle pour les étalonner (le recueil est arrêté au premier jour). La porte des 21 jours interdit qu'un seuil soit **inventé par l'assistant** ; elle n'interdit pas au responsable de traitement d'en poser un, **nommé et daté**, à réviser quand le recueil le permettra. Le seuil 1, lui, n'est pas un arbitrage : il est porté par la source.
- Conséquences et bornes — non négociables :
  - **`null`, jamais 0.** Sous la forme courte de `Q_ALI_01` (`WN_ALI_01_SIIN57` éteint), `RYTHME_CHRONO` n'existe pas et `MAX_RYTHME_CHRONO = 0` (`equilibre/constants.ts:182`) : le déclaré est alors absent, la discordance rend **`null`** (non mesurable), jamais un drapeau ni un « concordant ». Idem si la couverture de l'agenda est insuffisante sur l'axe (dénominateur `AGA_*` nul). Prouvé dans les **deux positions** du drapeau ([[D-033]]).
  - **Aucune double mesure de Mon Équilibre.** La discordance **ne réalimente pas le besoin 3** : `RYTHME_CHRONO` déclaré y reste l'unique source (`equilibre/constants.ts:253`). C'est une lecture praticien à côté du besoin, pas un second porteur — le piège nommé `RYTHME_ALIMENTAIRE`/10 vs `RYTHME_CHRONO`/7 (`alimentaire.ts:645-658`) reste fermé.
  - **Directionnel seul.** Déclaré défavorable → pas de drapeau (rien à sur-déclarer). Déclaré favorable + observé favorable → « concordant », pas de drapeau. Seul le couple (déclaré favorable, observé défavorable) lève l'axe.
- Options écartées :
  - **Confrontation par axe qualitative** (concordant/discordant/non mesurable, sans drapeau directionnel) : plus complète mais moins actionnable ; l'utilisateur a préféré ne signaler que l'asymétrie qui appelle un entretien.
  - **Taux de concordance chiffré** (« 2 axes sur 3 ») : mesure dérivée exigeant un seuil d'alerte et une calibration — bute sur la porte des 21 jours et frôle la revendication psychométrique de [[D-034]].
  - **Attendre le recueil pour tout** (y compris l'axe jeûne) : écarté, l'axe jeûne étant seuil-libre par la source et livrable sans données.
- Réversibilité : les trois seuils sont des littéraux ; `git revert` suffit, et leur révision à la clôture des 21 jours est prévue par cette décision même.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-alimentaire/lots/LOT-01-discordance-rythme.md`, `web/src/lib/questionnaires/alimentaire.ts` (RYTHME_CHRONO, SIIN52-55), `web/src/lib/agenda-alimentaire/cloture.ts` (agrégats AGA_*), `web/src/lib/equilibre/constants.ts` (besoin 3), [[D-033]], [[D-034]], [[D-039]]

### D-039 — La clôture de l'agenda alimentaire transmet tous les agrégats calculés — sans poids, sans seuil, sans sélection

- Date : 2026-08-10
- Statut : accepté (décision utilisateur du 2026-08-10, à l'ouverture de la campagne `2026-08-10-chaine-alimentaire`, LOT-00)
- Domaine : agenda alimentaire, forme du dossier patient
- Décision : **la clôture d'un recueil d'agenda alimentaire transmet au dossier la totalité des agrégats que le domaine calcule** (`AgregatsAgendaAli`, `web/src/lib/agenda-alimentaire/agregats.ts`), avec leurs dénominateurs de couverture, sous forme de pseudo-items dans le `rawAnswers` d'une `QuestionnaireReponse` standard `scored:false` — sur le gabarit du jumeau sommeil (`web/src/lib/agenda-sommeil/cloture.ts`). **Aucune sélection, aucun poids, aucun seuil** : transmettre n'est pas coter, et le tri clinique appartient au barème (LOT-02), qui ne s'écrira qu'après la porte des 21 jours, sur distribution réelle.
- Ce que la décision amende, et dans quelle limite : la position du catalogue (« un barème posé avant la première passation serait une donnée clinique inventée », `web/src/lib/questionnaires/alimentaire.ts`) reste entière — `Q_ALI_09` garde `scoring:{type:'journal'}` et ne rend aucun score. Ce qui change est strictement la **visibilité** : le recueil clôturé devient une réponse lisible par la fiche, la synthèse et tout lecteur du dossier, au lieu de rester enfermé dans sa table.
- Conséquences :
  - La liste des pseudo-items est **dérivée du domaine, jamais recopiée** : une clé d'agrégat ajoutée sans son pseudo-item doit rougir (garde du LOT-00). Une liste écrite à la main dirait ce qu'on croyait le jour où on l'a écrite.
  - La clôture est idempotente, vraie dans les deux positions de `WN_AGENDA_ALI` ([[D-033]]), et n'exige aucune migration.
  - Aucune revendication au-delà du descriptif : niveau de preuve D, longitudinal, jamais diagnostique ([[D-034]]).
- Options écartées :
  - **Le sous-ensemble resserré** (jeûne médian, fenêtre, régularité, couverture seuls) : plus lisible en synthèse, mais la sélection est déjà un jugement clinique — prématuré sans distribution réelle — et les agrégats écartés auraient exigé une nouvelle décision et une re-clôture pour entrer au dossier.
  - **Différer** : l'agenda restait invisible du dossier et de la synthèse IA, alors que le maillon manquant est précisément la visibilité, pas la mesure.
- Réversibilité : la clôture est du code sans migration, `git revert` suffit ; les réponses déjà écrites restent des lectures datées légitimes du recueil tel qu'il était.
- Référence : `docs/claude/campagnes/2026-08-10-chaine-alimentaire/CAMPAGNE.md`, `NOTE_CADRAGE.md` (même dossier), `web/src/lib/agenda-sommeil/cloture.ts`, [[D-033]], [[D-034]]

### D-038 — Le badge muet se remplit depuis le catalogue, aligné à la main — le registre ne pilote pas l'écran

- Date : 2026-08-09
- Statut : accepté (décision utilisateur du 2026-08-09, sur la liste produite par le garde du LOT-04 de la campagne `2026-08-08-dettes-ouvertes-5-0`, close le même jour)
- Domaine : UI praticien, vocabulaire clinique, et source d'autorité d'une affirmation clinique
- Numérotation : cette décision est celle que la campagne annonçait en `D-037` — numéro parti le 2026-08-09 à la décision HDS, une réservation n'existant pas ([[D-037]], « Numérotation »). Elle prend le suivant libre, comme écrit.
- Décision : **le catalogue de code reste la source d'autorité du badge, et il s'aligne à la main, instrument par instrument.** L'écran continue de lire `def.scoring.certification.status` ; le registre audité (`instrument_registry.json`) ne pilote pas l'écran. Un lot dédié déclare `certification` pour chacun des instruments que le registre certifie et que l'écran tait — **chaque déclaration est une relecture adossée au banc certify, jamais une copie du registre**. Les quatre instruments où l'écran affirme « ambigu » (`Q_SOM_02`, `Q_GAS_01`, `Q_FIB_02`, `Q_URO_01`) sont réexaminés un par un avant tout changement : le doute posé dans le catalogue a peut-être un motif que le barreau du registre ne porte pas.
- La liste de référence, mesurée le 2026-08-09 sur `main` (sortie de `check_questionnaire_certification.js`, après #632) : **22 instruments** que le registre déclare au moins `scoring_verifie` et dont le catalogue servi ne dit pas `certifie` — 4 « ambigu » ci-dessus, et 18 muets : `Q_NEU_06`, `Q_SOM_01`, `Q_SOM_03`, `Q_SOM_04`, `Q_SOM_07`, `Q_GAS_03`, `Q_CAR_01`, `Q_TAB_03`, `Q_TAB_04`, `Q_PED_02`, `Q_MOD_01`, `Q_MOD_02`, `Q_ALI_01`, `Q_ALI_02`, `Q_ALI_03`, `Q_GEO_03`, `Q_GEO_05`, `Q_GEO_06`. Le chiffre n'est pas un compteur à maintenir ici : la sortie du garde fait foi à chaque `npm run check`, et c'est elle qui mesurera l'avancement du lot.
- Conséquences :
  - **Le garde écran ↔ registre du LOT-04 garde son objet.** Deux sources restent confrontées : le sens menteur (un `certifie` d'écran au-dessus du barreau du registre) reste bloquant, l'inventaire du sens silencieux devient l'instrument de mesure de l'alignement — il décroît déclaration par déclaration, et ne peut décroître qu'honnêtement.
  - **Ce que chaque badge affirmera reste borné par [[D-034]]** : « Scoring vérifié » dit que le code reproduit fidèlement la règle enregistrée, rien de psychométrique. L'alignement ne fait dire à l'écran que ce que le banc certify prouve déjà.
  - **Cette décision n'exécute rien.** L'alignement est un lot à ouvrir, avec son propre palier (changement d'UI → T2, et revue de la famille `certification` du catalogue) ; les proses et libellés restent ceux de [[D-036]].
- Options écartées :
  - **Le registre pilote l'écran.** Une seule source, les 22 passent d'un coup — mais la nuance « ambigu » posée dans le catalogue pour quatre instruments serait écrasée sans réexamen, et le garde écran ↔ registre perdrait son objet le jour même où il vient d'être posé : plus deux sources à confronter, plus de dérive détectable.
  - **Le silence assumé.** Décider que le badge ne parle que si le catalogue déclare, sans lot d'alignement, laissait 18 instruments que le registre certifie muets au praticien et 4 affirmant « ambigu » contre le registre — la moitié silencieuse du tableau que [[D-036]] nommait déjà comme dette.
- Réversibilité : les déclarations du catalogue sont des littéraux de code, `git revert` suffit ; le garde, lui, refuserait une affirmation au-dessus du registre — c'est son objet.
- Référence : `docs/claude/campagnes/2026-08-08-dettes-ouvertes-5-0/CAMPAGNE.md`, `docs/claude/campagnes/2026-08-08-dettes-ouvertes-5-0/lots/LOT-04-garde-code-registre.md`, `scripts/check_questionnaire_certification.js` (sortie « écran ↔ registre »), [[D-034]], [[D-036]], [[D-037]]

### D-037 — [[D-006]] est confirmée, et la revue de la dette HDS quitte le 2026-10-21 pour la réponse de Scalingo

- Date : 2026-08-09
- Statut : accepté (décision du **responsable de traitement** du 2026-08-09)
- Domaine : architecture, hébergement et conformité (HDS, RGPD)
- Numérotation : la campagne active `2026-08-08-dettes-ouvertes-5-0` annonçait écrire sa décision produit sur le badge muet en `D-037`. **Une réservation de numéro n'existe pas** : `scripts/lib/decisions-numerotation.mjs` refuse tout trou dans la suite, et la première rédaction de cette décision — qui prenait `D-038` en laissant `D-037` vacant — a été rejetée par ce garde. Le numéro va à la décision qui s'écrit ; celle du badge prendra le suivant libre le jour où elle se prendra.
- Décision : trois arbitrages, pris ensemble.
  1. **[[D-006]] est confirmée.** La cible reste « Scalingo seul », Vercel/Supabase en filet de rollback court puis décommissionnés. Elle n'est ni suspendue ni révoquée — mais sa **réserve (1) est requalifiée dans sa nature** au point (a) ci-dessous : « e-signer le DPA » décrit une démarche qui n'existe pas chez ce fournisseur. Requalifiée, non levée.
  2. **La revue de la dette 8 quitte le 2026-10-21 pour la date de réponse de Scalingo** au ticket ouvert le 2026-08-09. Motif : attendre octobre n'apporte aucune information que ce ticket n'apporte pas, et le développement a besoin du périmètre fonctionnel complet pour continuer. **L'échéance de la dérogation, elle, ne bouge pas** — elle reste au 2026-10-21, et c'est l'échéance que porte la majorité des trous du dossier RGPD (tableau §14 ; quelques-uns en ont une autre, dont l'information des personnes, « au plus tôt », donc déjà échue). **Aucun compte n'est écrit ici** : ce lot documente précisément qu'un compteur figé dérive en silence, et il en a périmé trois en ajoutant une ligne à ce tableau.
  3. **L'orientation du 2026-07-22 cesse d'être présentée comme courante.** Elle reste un évènement daté et vrai — l'arbitrage qui découlait de l'instruction du 2026-07-21 — mais elle est **antérieure de six jours** à [[D-006]] et n'a jamais été consignée au registre. Les pièces qui la portaient au présent la datent désormais au passé.
- Ce que cette décision **ne fait pas** : elle n'ouvre pas la migration des données réelles. **L'ordre imposé de [[D-006]] tient intégralement** — aucun patient réel sur Scalingo avant (a) et (b) ci-dessous.
- État réel des deux conditions dures de [[D-006]], relevé le 2026-08-09 — **aucune des deux n'est levée** :
  - **(a) DPA — réserve REQUALIFIÉE, non levée.** Ce qui change est la **nature de la démarche**, pas son accomplissement : l'accord de sous-traitance vit dans les **documents généraux** de Scalingo, acceptés à la souscription — laquelle existe déjà (app `wellneuro-staging` et add-on PostgreSQL Business payant). Il n'y a donc **pas d'e-signature à obtenir**, et la rédaction « e-signature du DPA » de [[D-006]] décrivait une démarche qui n'existe pas chez ce fournisseur. Mais **la pièce n'est pas au dossier au 2026-08-09** : la copie horodatée de la version acceptée est demandée au ticket et n'a pas été reçue. Tant qu'elle manque, (a) reste une condition ouverte — une souscription inférée n'est pas une pièce produite.
  - **(b) périmètre HDS de la région — NON satisfaite, et le certificat ne la satisfait pas.** Le certificat LNE n° 38436-2 a été lu le 2026-08-09 : il ne nomme **aucune région**, ses sites couverts étant « 9 rue de la Krutenau, 67000 Strasbourg » et « sites virtuels / bureaux distants ». La confirmation que les ressources `--hds-resource` en `osc-fr1` tombent sous ce certificat relève des conditions de l'offre, et est demandée au ticket. Élément à charge côté plateforme : `apps-info` rend `HDS: true` sur l'app.
- Conséquences :
  - **La réserve de région change de nature.** `scalingo regions` ne rend qu'`osc-fr1` sur ce compte : `osc-secnum-fr1` **n'est pas accessible** et suppose une démarche d'accès préalable. L'arbitrage recommandé par l'audit du 2026-07-24 n'était donc pas un choix ouvert entre deux régions disponibles, mais une demande à formuler — ce que fait le ticket.
  - **Deux prémisses non établies sortent du chemin critique.** L'audit déduisait de l'annexe HDS un accès aux données de santé **réservé à un professionnel de santé porteur de carte CPS**, et en tirait que la pratique d'exploitation (lecture SQL depuis le poste, MCP, Prisma Studio) deviendrait une non-conformité contractuelle au jour de la bascule. L'activité de Wellneuro **n'est pas une activité réglementée** — précédent : Pronutriconsult, plateforme équivalente exploitée par des praticiens non médecins, sans CPS. Ce qui subsiste est une **politique d'accès écrite** (traçabilité, minimisation), due sous la dérogation actuelle comme après la bascule, et qui n'engendre aucun lot d'ingénierie.
  - **Le certificat était cité depuis le 2026-07-24, mais n'avait pas été lu.** Le numéro LNE 38436-2 et l'échéance du 2028-09-11 figuraient déjà dans [[D-006]], dans `AUDIT_MIGRATION_HDS.md` et dans `CHECKLIST_ACTIVATION_G_TRUST_04.md`. Ce que la lecture du 2026-08-09 ajoute, et qui manquait partout : la **condition d'isopérimètre au certificat ISO/IEC 27001 n° 38435** (sans lequel la pièce est incomplète pour un auditeur), la date de début de validité, la déclaration d'applicabilité, les sites couverts, le détail des six activités — et **l'absence de toute mention de région**. Le dossier RGPD porte désormais la pièce, non plus son seul numéro.
  - **Les activités 5 et 6 sont couvertes** (administration et exploitation ; sauvegardes externalisées). C'est ce qui rend conformes le PostgreSQL managé **et ses sauvegardes** — le motif exact pour lequel l'audit avait écarté Scaleway.
- Réserves — aucune n'est levée par cette décision, et **les cinq de [[D-006]] restent entières** :
  - **(a) et (b) sont toutes deux ouvertes.** (a) est requalifiée dans sa nature (archivage, non signature) sans être accomplie ; (b) attend la réponse écrite.
  - **La réserve (3) de [[D-006]] — confirmation DPO** sur « patients réels sur Scalingo en phase de test » — n'est ni levée ni traitée ici. Elle est rappelée explicitement parce qu'une première rédaction de cette décision réduisait l'ordre imposé à deux conditions et la faisait disparaître par omission. S'y ajoute une difficulté que le dossier RGPD nomme déjà : `docs/DOSSIER_RGPD.md` relève une **contradiction non tranchée sur l'existence d'un DPO** (G-TRUST-02 écrit « pas de DPO désigné », [[D-005]] écrit « confirmé par le DPO le 2026-07-27 »). Tant qu'elle tient, la réserve (3) n'est pas seulement non levée : on ne sait pas qui pourrait la lever.
  - Les réserves (4) et (5) de [[D-006]] — DPA des autres sous-traitants, AIPD, pentest ; conformité des consentements comme certification du responsable — sont inchangées.
  - **Les deux prémisses retirées le sont sur des bases inégales, et aucune n'a été confirmée par le fournisseur.** La CPS repose sur le statut de l'activité et un précédent de place, **pas** sur une lecture contradictoire des art. 9.4/10.3 de l'annexe HDS ni sur un avis de conseil. La forme du DPA repose sur l'existence de la souscription, **pas** sur une pièce. Le ticket du 2026-08-09 ne pose ni l'une ni l'autre de ces deux questions : les deux points sont donc **requalifiés sous réserve de confirmation du fournisseur ou d'un conseil qualifié**, à poser au prochain échange.
  - Les trous côté Wellneuro restent entiers, et **la plupart gardent le 2026-10-21 — pas tous ; le tableau §14 du dossier RGPD fait foi** : **information des personnes sur l'écart d'hébergement** (« au plus tôt », donc échue), **base légale non qualifiée**, durées de conservation, AIPD à qualifier, pentest, DPA des autres sous-traitants (« avant bascule Scalingo »).
  - La **stratégie de rollback** n'existe qu'en une subordonnée (« Vercel/Supabase gardés chauds »), sans critère de déclenchement, sans fenêtre, sans geste de retour. Aucun **GO/NO-GO de migration** n'existe : `GATES_GO_NO_GO.md` est une table de gates produit.
  - L'**état de schéma du staging n'est pas mesuré** depuis le 2026-07-24 : `apps-info`/`addons`/`ps` ne lisent pas les migrations, et `prisma migrate status` exige un conteneur `scalingo run` avec TTY.
  - La seconde app `wellneuro`, au statut `new`, n'est toujours pas instruite.
- Corrigé dans la foulée, donc **hors des réserves** : `Force HTTPS` était à `false` sur `wellneuro-staging` (relevé le 2026-08-09) ; **activé le même jour**, `apps-info` rend `true`.
- Options écartées :
  - **Suspendre [[D-006]] jusqu'au 2026-10-21.** C'était la lecture que le runbook du 2026-08-05 rendait vraisemblable. Écartée : elle fait payer deux mois d'attente pour une information que le ticket rend en quelques jours, et laisse le développement sans périmètre fonctionnel complet.
  - **Révoquer [[D-006]].** Aucun fait nouveau ne la contredit ; le certificat lu le 2026-08-09 la conforte au contraire sur les six activités.
  - **Attendre la réponse de Scalingo pour trancher.** Écartée : l'ordre imposé de [[D-006]] protège déjà les données réelles. Confirmer maintenant ne fait courir aucun risque et débloque tout le travail qui ne touche pas aux données.
- Réversibilité : une décision de registre se révoque par une décision de registre. Les corrections documentaires qui l'accompagnent sont des textes, `git revert` suffit.
- Référence : `docs/DOSSIER_RGPD.md`, `docs/claude/propositions/2026-07-24-audit-migration-hds/` (AUDIT, RUNBOOK, CHECKLIST_FINALISATION), certificat LNE n° 38436-2 (Drive, dossier « Scalingo »), [[D-006]], [[D-005]]

### D-036 — « Certifié » se renomme « Scoring vérifié » : le libellé porte la définition, pas une infobulle

- Date : 2026-08-08
- Statut : accepté (décision utilisateur du 2026-08-08, LOT-02 de la campagne `2026-08-08-dettes-ouvertes-5-0`)
- Domaine : UI praticien, et vocabulaire clinique
- Décision : deux arbitrages, pris ensemble.
  1. **Le libellé change, plutôt que de recevoir une infobulle ou un lien.** [[D-034]] laissait dû le geste d'UI : le mot « Certifié » s'affichait au praticien sans porter le sens qu'il définit. Trois options étaient ouvertes — infobulle, libellé plus long, lien vers la définition. **Le libellé est retenu** : il dit ce que la donnée dit, sans rien exiger du lecteur. Les deux autres ont un défaut de forme documenté ici même (voir Options écartées).
  2. **Toute la famille des libellés suit, pas seulement les trois badges verts.** Le périmètre cadré ne nommait que « Certifié », « Certifié Drive » et « Certifié manuel EORTC » — les trois `success`, ceux qui rassurent à tort. Mais **« Non certifié » se lit tout aussi bien comme « non validé psychométriquement »** : c'est le mot qui est ambigu, pas l'état vert. **Neuf libellés changent**, plus **trois proses en ligne** du rayon Questionnaires (`BibliothequePanel.tsx:369` et `:1215`, tous deux « jamais certifié automatiquement », et `:1405`, « Il reste non certifié ») — la quatrième prose, celle du tiroir des instruments du cabinet, est devenue la constante `TEXTE_INSTRUMENTS_CABINET` et se compte avec les littéraux d'écran, pas avec les proses. Le critère n'est pas la présence du mot mais la **cohérence de l'échelle** : « Drive ambigu » et « À vérifier » ne le portaient pas et ont changé quand même.
- Le coût, accepté et non tu : **le mot « Certifié » est employé à l'oral par le praticien**, et il reste dans `docs/claude/corpus/instrument_registry.json`, dans le type `StatutCertificationRuntime`, dans la valeur de donnée `'certifie'`, dans `scripts/check_questionnaire_certification.js` et dans le corpus. **L'écran et le dossier ne disent donc plus la même chose.** Aucune valeur de donnée n'a été renommée — le hors-périmètre du lot fige le registre, et renommer une donnée pour aligner un écran serait le mauvais sens de la dépendance. Cet écart est une **dette nommée**, pas un oubli.
- Conséquences :
  - **Les deux mappers deviennent un module, et ce n'est pas un rangement.** `badgeCertification` (`BibliothequePanel.tsx`) et `certificationBadge` (`FichePatientPanel.tsx`) étaient locaux et non exportés : **aucun banc ne pouvait asserter ce qu'ils rendaient**. Ils vivent désormais dans `web/src/lib/certification-libelles.ts`, avec les deux littéraux d'écran qui ne passaient par aucun mapper (badge et prose des instruments du cabinet) — hors du module, ils auraient échappé au garde.
  - **Le garde porte sur les valeurs rendues, jamais sur le source des composants.** `web/src/lib/certificationLibelles.guard.test.ts` refuse `/certifi/i` sur ce que le module produit. Un motif appliqué au source rougirait sur les identifiants légitimes du dossier (`libelleCertificationBibliotheque`, `CertificationLue`, `'certifie'`) et exigerait une exception : c'est exactement la forme qui a fait refuser la deuxième rédaction du garde D-034 — **une échappatoire creusée pour un cas légitime est réutilisable par le défaut**. Pas de `\b` non plus : en JavaScript `é` n'est pas `\w`, donc `\bcertifié\b` ne borne rien.
  - **Exhaustivité par le typage plutôt que par une liste.** Les attendus sont un `Record<StatutCertificationRuntime, …>` : ajouter une valeur à l'union sans écrire son libellé ne compile pas. Les libellés eux-mêmes sont **écrits à la main** — un attendu dérivé du module testé bougerait avec lui et ne prouverait rien.
  - **Un garde de libellé ne suffit pas : il faut un garde de RENDU, et il porte sur le texte ET sur la couleur.** Le module est épinglé, mais un composant peut calculer le bon libellé et en afficher un autre, ou coder `variant="success"` en dur — « Scoring non vérifié » passerait alors en vert sans qu'un test de texte ne bouge. `web/src/components/ui/Badge.tsx` expose donc `data-variant`, et les deux bancs de rendu (`BibliothequePanel.test.tsx`, `FichePatientPanel.test.tsx`) assèrent les deux. Le banc de la bibliothèque couvre **les six** états de `StatutCertificationRuntime`, servis ou non : un banc qui ne couvre que l'état du jour cesse de garder au prochain.
  - **Neuf mutations vérifiées, neuf rouges**, comptes pris sur une même base — les trois bancs du lot en une passe (101 tests). Quatre à l'écriture : libellé nu remis dans le module (6), motif cassé (10), ancien libellé réintroduit dans un composant (1), source de la règle scorée effacée (3). Cinq trouvées par deux passes de revue adversariale, dont **trois qui passaient vertes après le premier correctif** : sens de la prose cabinet inversé sans le mot interdit (1), libellé nu posé directement dans le badge du catalogue (9), `variant="success"` codé en dur — tous les états en vert (6), clause `statutCertification === 'certifie'` retirée du `||` (1 ; l'accord des deux champs dans la fixture avait cessé de l'exercer), badge masqué pour l'état `inconnu` (3 ; 21 instruments privés de badge).
  - **Un compte de rouges se mesure sur la base qu'on annonce.** Deux des chiffres ci-dessus avaient d'abord été relevés sur une sélection partielle de fichiers, et étaient donc trop bas — et une première rédaction de cette décision annonçait « quatre mutations » là où les autres pièces en portaient six. La leçon est du même ordre que celle du chiffre de passe E2E de ce lot, annoncé à 131 alors qu'il valait 130 : le compte venait d'une passe qui portait un banc de capture jetable.
  - **La source de la règle scorée reste nommée.** « Scoring vérifié (Drive) » et « Scoring vérifié (manuel EORTC) » diffèrent : le moteur EORTC suit le manuel officiel, les autres la grille Drive. Les fondre en un seul libellé aurait fait perdre à la fiche ce qui distingue les deux vérifications — et c'était déjà la raison d'être de la branche `manuel_eortc`, sans laquelle le badge retombait sur le libellé de défaut alors que le registre porte `scoring_verifie`.
- Réserves :
  - **Le seed omet une clé que le moteur produit — ce n'est pas une impossibilité de banc.** Une première rédaction de cette décision écrivait « aucun E2E ne PEUT témoigner des libellés de passation » : c'est faux, et la revue adversariale l'a démenti. Tous les moteurs propagent la métadonnée (`web/src/lib/questions.ts`, `certification: sc.certification || null`) et `api/patient/submit` persiste le résultat entier ; `web/e2e/portail-parcours.spec.ts` complète déjà une soumission réelle. Ce qui manque est **une assertion, pas une possibilité** : **le seed est aujourd'hui moins fidèle que le moteur** — 15 blocs `scoresJson` dans `web/prisma/seed.ts`, aucune clé `certification`. À ne pas adoucir pour autant : Sophie Nicola porte **cinq** passations seedées, dont **quatre** déclarent `certification:{source:'drive',status:'certifie'}` au catalogue ; la cinquième est le PSQI, l'un des muets ci-dessous. Même seed étendu, une passation sur cinq de la patiente de référence restera « Historique ».
  - **Le badge est muet pour 21 des 65 instruments, et la production ne fait pas mieux.** Mesuré le 2026-08-08 sur le catalogue résolu (`statutCertificationRuntime` sur `QUESTIONNAIRE_CATALOGUE`) : **38 `certifie`, 21 `inconnu`, 6 `ambigu`**. Les 21 ne déclarent aucune `certification` — `web/src/lib/questionnaires/sommeil.ts` et `gerontologie.ts` n'en contiennent aucune —, donc « Statut inconnu » à la bibliothèque et « Historique » sur la fiche, **en production comme en local**. Et le croisement avec le registre est le vrai chiffre : **18 des 21 portent `scoring_verifie`** (dont le PSQI, `Q_SOM_01`) ; les trois autres non — `Q_GEO_04` est `contenu_verrouille`, `Q_SOM_09` `droits_verifies`, `Q_ALI_09` `repere`. Citer le MMSE comme une divergence avec le registre était donc faux : pour lui, « Statut inconnu » en est l'écho fidèle. Le lot cadre le risque comme « le badge vert rassure à tort » ; l'autre moitié du tableau est qu'il **ne dit rien du tout** sur un tiers du catalogue, dont 18 instruments que le registre certifie. Dette nommée, sans lot.
  - **Le libellé emprunte le nom d'un barreau qu'il ne lit pas.** « Scoring vérifié » reproduit mot pour mot `scoring_verifie` de `instrument_registry.json`, alors qu'il est piloté par `def.scoring.certification.status`, écrit à la main dans le catalogue de code. **Aucun contrôle ne relie les deux** : `scripts/lib/verifier_registre_instruments.js` reçoit le catalogue et la bibliothèque comme du texte et ne compare jamais les deux champs. Avant ce lot, une divergence rendait un mot vague faux ; désormais elle rend une affirmation précise et vérifiable fausse. C'est le voisin naturel du garde anti-dérive du LOT-03, et une dette nommée à part.
  - **Le garde n'attrape pas un mot neuf.** Le contrôle de source qui refuse la réintroduction d'un ancien libellé porte sur une **liste fermée** de dix chaînes, **à la casse près** : `'Instrument certifié'` en minuscule lui échappe. Ce qui réduit ce trou est le rendu réellement asséré — `BibliothequePanel.test.tsx` (badge du catalogue dans ses quatre états, badge cabinet, prose du tiroir), `FichePatientPanel.test.tsx` (colonne « Qualité »), `e2e/dashboard-praticien.spec.ts` (parcours cabinet). Il est réduit, pas fermé.
- Options écartées :
  - **Infobulle native (`title` + `aria-label`) sur le badge.** Le patron existe dans le dépôt (`FicheComplementPanel.tsx:446`, `RechercheCorpusRayonPanel.tsx`), mais il est **hover-only** : au doigt, la définition n'est pas atteignable, et `.claude/rules/frontend-ui.md` demande de concevoir tactile avant les interactions de survol. `docs/claude/UX_WELLNEURO_3_0.md:88-90,565-569` va plus loin et pose la table de remplacement — « Tooltip uniquement au survol → bouton d'information cliquable », « Attribut `title` → popover, accordéon ou panneau de détail ». Il n'existe par ailleurs **aucun composant d'infobulle réutilisable** : seul `@radix-ui/react-dialog` est installé.
  - **Lien vers la définition.** Atteignable au doigt et au clavier, mais il fait quitter l'écran ou ouvrir une modale, là où la preuve attendue du lot demandait la définition « sans quitter l'écran ».
  - **Ne qualifier que les trois badges verts.** Aurait laissé « Non certifié » nu à côté de « Cabinet — scoring non vérifié » : une échelle incohérente, où le mot ambigu survit précisément là où il annonce une absence.
- Réversibilité : le renommage est un changement de littéraux dans un seul module ; `git revert` suffit. Ce qui ne revient pas tout seul, c'est le garde — il refuserait le retour des anciens libellés, et c'est son objet.
- Référence : `docs/claude/campagnes/2026-08-08-dettes-ouvertes-5-0/lots/LOT-02-badge-certifie-definition.md`, `docs/claude/corpus/README.md`, [[D-034]]

### D-035 — Le parcours patient legacy est retiré, sa redirection reste

- Date : 2026-08-08
- Statut : accepté (décision utilisateur du 2026-08-08, LOT-01 de la campagne `2026-08-08-dettes-ouvertes-5-0`)
- Domaine : parcours patient, dette 5 de la déclaration 5.0
- Décision : **supprimer `web/src/app/patient/` immédiatement**, plutôt que lui poser une date-cible de retrait comme le cadrage le prévoyait. La redirection 307 vers `/portail/connexion` est **conservée sans échéance**.
- Ce que cette décision renverse, et assume : le LOT-04 de la campagne close avait refusé la suppression **sans mesure d'usage préalable** (`next.config.mjs` invoquait « une nouvelle mesure d'usage »). Cette mesure n'a jamais existé, et la produire pour dater un retrait déjà acquis aurait coûté plus que le retrait. Le risque a été signalé avant exécution et la décision maintenue : le parcours était inatteignable depuis le 2026-08-05, plus aucun lien interne ne le visait, et les 406 lignes supprimées ne portaient aucune règle que le portail ne porte déjà.
- Conséquences :
  - **La conséquence d'une panne de redirection a changé** : avant, un patient tombait sur l'ancien parcours (dégradé mais fonctionnel) ; désormais, sur un 404. La redirection est donc devenue critique, et un banc E2E l'emprunte enfin (`web/e2e/parcours-legacy-redirection.spec.ts`) — elle n'en avait aucun.
  - **La redirection n'a pas de date de fin de vie**, et c'est une dette assumée, pas un oubli : elle sert des liens e-mail déjà partis chez des patients, dont on ne connaît pas la durée de vie réelle. La question « jusqu'à quand » reste ouverte dans `CAMPAGNE.md`.
  - `web/src/app/api/patient/assignations/route.ts` n'a plus d'appelant. Non retirée : le retrait d'une route d'API se décide séparément.
  - Trois gardes structurelles listaient `app/patient` parmi leurs racines : une a rougi, **deux se sont tues** (leur `readdirSync` avalait l'erreur). Les trois sont purgées, et `auth.roles.guard.test.ts` refuse désormais la résurrection du répertoire sans réinscription de sa racine.
- Réversibilité : `git revert` restaure la page. Ce qui ne revient pas tout seul, c'est l'entrée `app/patient` des gardes — d'où le test de non-résurrection.

### D-034 — La validation psychométrique n'entre pas au programme : Wellneuro repère et prépare, il ne mesure pas

- Date : 2026-08-08
- Statut : accepté (décision utilisateur du 2026-08-08, clôture de la dette 2 de la campagne `2026-08-05-cloture-des-dettes-wellneuro-5-0`)
- Domaine : clinique, corpus des questionnaires, et rédaction assistée
- Décision : **les instruments servis par Wellneuro sont des outils de repérage et de préparation de consultation, pas des mesures dont Wellneuro établit ou revendique la validité psychométrique.** L'établissement de cette validité — grades COSMIN adossés à des études de validation — **n'entre pas au programme**. Ce n'est pas un report : c'est un non assumé, qui ferme la dette 2 plutôt que de la laisser ouverte indéfiniment.
- Ce que « certifié » veut dire, et ne veut pas dire : dans `docs/claude/corpus/instrument_registry.json`, `statutCertification: scoring_verifie` signifie **le code reproduit fidèlement la règle enregistrée** — items servis conformes à la source, moteur de scoring vérifié par le banc `certify`. Cela ne dit **rien** de la qualité psychométrique de l'instrument, de sa validité de construit, de sa fidélité, ni de l'étalonnage de ses seuils sur une population. L'écart était déjà nommé (#560, « ce que “certifié” ne dit pas ») ; il est ici tranché au lieu d'être re-nommé.
- Conséquences :
  - **Le champ `cosmin` reste `inconnu` pour les 65 instruments, et c'est désormais un état stable, pas une lacune.** La raison est écrite une fois dans `docs/claude/corpus/README.md`. Le banc `scripts/lib/verifier_registre_instruments.js` continue d'interdire tout grade qui ne serait pas adossé à une étude concordante : il n'y a donc aucun chemin pour écrire un grade « au jugé ».
  - **La consigne système de synthèse ne revendique plus la validation.** Elle disait « organiser les résultats de questionnaires **validés** » — la seule surface du **runtime** à l'affirmer (le fichier `prompts/synthese_multi_questionnaires.md` portait la même phrase, mais n'est référencé par rien), et la plus lourde de conséquences puisqu'elle fabrique le texte clinique lu par le praticien puis remis au patient. Elle porte désormais l'énoncé exact — *WellNeuro n'a évalué la validité psychométrique d'aucun instrument qu'il sert et ne s'en réclame pas* — dans son cadre déontologique. `VERSION_PROMPT_SYNTHESE` passe à `synthese-v19` ; un garde de banc (`promptAlimentaire.guard.test.ts`) refuse le retour de la revendication **et** exige la présence du démenti — l'absence seule laisserait le modèle réinventer la formulation retirée.
  - **Ce que le produit dit au patient ne change pas**, parce qu'il ne l'a jamais revendiqué : `web/src/lib/trust/contenus/registre.ts` écrit déjà « cet accompagnement relève du bien-être et du suivi ; il n'établit pas de diagnostic médical ». La décision aligne l'interne sur l'externe, pas l'inverse.
  - **Réversibilité, et à quel prix.** Si un usage à venir l'exige — audit, publication, qualification en dispositif médical —, cette décision se rouvre par une campagne d'ingestion des études de validation. Le banc et le vocabulaire fermé `A|B|C|inconnu` sont déjà en place pour l'accueillir : rien n'est à défaire, seulement à ajouter.
  - **Ce que la décision ne dit PAS, et qu'une première rédaction disait à tort.** Elle ne nie pas la validité des instruments : le catalogue sert l'EORTC QLQ-C30, le PSQI, la HAD, l'Epworth — des échelles publiées et validées par ailleurs. Ce que WellNeuro déclare, c'est qu'**il ne l'a pas évaluée et ne s'en réclame pas**. La première version de la consigne système interdisait de « présenter ces questionnaires comme validés » : c'était un faux clinique, dans le texte même qui va au praticien puis au patient. Refusé en revue, corrigé avant merge. L'interdit porte sur **notre revendication**, jamais sur la nature de l'instrument.
  - **Ce qui reste interdit** : présenter un score comme une mesure validée, invoquer une norme ou un étalonnage de population que les données ne portent pas.
  - **Ce que cette décision laisse dû, et qu'elle ne prétend pas avoir fait** : les badges praticien affichent « Certifié » (`web/src/components/BibliothequePanel.tsx`, `FichePatientPanel.tsx`) **sans porter le sens défini ici**. Le mot circule donc encore sans sa définition à l'endroit où un praticien le lit. C'est un geste d'UI, hors du périmètre de cette décision ; il est nommé ici pour ne pas être perdu, et revient au lot de la dette 6 ou à un lot d'UI dédié.
- Référence : `docs/claude/campagnes/2026-08-05-cloture-des-dettes-wellneuro-5-0/DECLARATION_5_0.md` (dette 2), `docs/claude/corpus/README.md`, `web/src/lib/anthropic.ts`

### D-033 — « Suspendu » est un état de drapeau, pas une propriété de l'instrument

- Date : 2026-08-07
- Statut : accepté (décision utilisateur du 2026-08-07, LOT-00 de la campagne `2026-08-07-dettes-packs-residuelles`)
- Domaine : produit et clinique (packs de questionnaires, agenda alimentaire), et méthode documentaire
- Décision : deux arbitrages, pris ensemble.
  1. **Le geste de donnée est différé après le merge.** Retirer `Q_ALI_09` du pack de base « Base de consultation » par l'UI praticien ne se fait pas avant la PR du LOT-00, mais après son merge (décision utilisateur). Conséquence à ne pas adoucir : **le lot n'est pas livré** — seule sa moitié *code* l'est (bloc de retrait dans la modale d'édition, `web/src/components/PacksPanel.tsx:635-649` sur l'instantané `:69`, `:187` ; `suspendus` servis à part des actifs par `web/src/app/api/praticien/questionnaires/route.ts:32,48,68-72`) ; sa moitié *donnée* reste due, et **le risque d'auto-assignation court jusqu'à ce geste**.
  2. **Le titre du lot est réécrit, parce qu'il n'était vrai que dans une position du drapeau.** « `Q_ALI_09` soudé au pack de base — un geste nécessaire est impossible » décrit exactement le dépôt (drapeau éteint) et **rien** de la production. Le titre retenu nomme les deux moitiés : « Q_ALI_09 dans le pack de base — auto-assigné à l'onboarding drapeau allumé, irretirable drapeau éteint ».
- Conséquences :
  - **« Suspendu » est un état de drapeau, pas une propriété de l'instrument.** `Q_ALI_09` est déclaré `actif: isAgendaAlimentaireEnabled()` (`web/src/lib/questionnaires-catalog.ts:83`), fonction qui lit `process.env.WN_AGENDA_ALI` (`web/src/lib/agenda-alimentaire/featureFlag.ts:36-37`), et `IDS_SUSPENDUS` est **dérivé** de `!q.actif` (`web/src/lib/questionnaires-catalog.ts:518-520`). L'appartenance bascule donc avec le drapeau — **allumé en production depuis le 2026-08-05** (`docs/claude/campagnes/2026-08-04-agenda-alimentaire/RUNBOOK-allumage-drapeau.md:227-231`, « le drapeau a été allumé et le pilote lancé » ; variable créée côté Vercel en Production ce jour-là), **éteint dans le dépôt**, donc en CI, en local et sur les bancs.
  - **Donc un diagnostic écrit sur `IDS_SUSPENDUS` n'a pas la même valeur de vérité en production et dans le dépôt** — et il s'inverse : drapeau éteint, `web/src/app/api/portail/valider/route.ts:144-152` **ampute** le pack en silence ; drapeau allumé, il **ne fait rien** et le pack part entier, agenda compris. **Un document qui ne dit pas dans quelle position il se lit est faux la moitié du temps.** Le fait qui commande le lot est celui de la colonne allumée : le prochain patient onboardé reçoit l'agenda **sans décision praticien**, exactement ce que [[D-025]] protège. Fait rassurant et daté, à ne pas prendre pour une fermeture : **0 assignation créée depuis le 2026-08-06 18:02** — le risque est **prospectif**, pas réalisé.
  - **La moitié *code* du lot, elle, est indépendante du drapeau** : le geste de retrait vaut pour tout instrument réellement suspendu, sans drapeau pour le rallumer. C'est pourquoi elle se livre séparément sans mentir sur ce qui reste dû.
- Réserves :
  - **Un prérequis de runbook vérifié à l'allumage n'est re-vérifié par rien ensuite.** Celui de `WN_AGENDA_ALI` — « aucun pack ne référence `Q_ALI_09` » (`docs/claude/campagnes/2026-08-04-agenda-alimentaire/RUNBOOK-allumage-drapeau.md:44-53`, `SELECT nom, par_defaut, actif FROM packs WHERE 'Q_ALI_09' = ANY(qids);`, attendu 0 ligne) — **était satisfait le 2026-08-05** à l'allumage, et a été **cassé le lendemain** par une écriture sur le pack de base (`packs.updated_at` = 2026-08-06 18:02:38.913, dérive documentée en [[D-032]]), **sans aucune alerte**. Le runbook ne repasse pas par ses prérequis une fois exécuté.
  - **Aucun contrat SQL de `web/prisma/checks/` n'assère « aucun pack actif ne référence un qid de `IDS_SUSPENDUS` ».** C'est l'assertion qui aurait mordu le 2026-08-06 à 18:02 — la seule qui transforme un prérequis vérifié une fois en invariant tenu en continu. Elle **reste sans lot ouvert** ; cette décision ne l'ouvre pas. Note de conception : un tel contrat doit se lire **dans la position du drapeau de l'environnement où il tourne**, sinon il rougirait en CI (drapeau éteint) sur un état parfaitement sain en production.
  - La garde `IDS_SUSPENDUS` de `PATCH /api/praticien/packs` ne prévient pas cette dérive : elle ne juge que les qids **ajoutés** (`web/src/app/api/praticien/packs/route.ts:307`, diff calculé contre l'existant) — ce qui est le choix qui rend le retrait possible, et n'est donc pas à affaiblir.
- Référence : `docs/claude/campagnes/2026-08-07-dettes-packs-residuelles/lots/LOT-00-pack-base-instrument-suspendu.md`, `docs/claude/campagnes/2026-08-04-agenda-alimentaire/RUNBOOK-allumage-drapeau.md`, [[D-025]], [[D-032]]

### D-032 — Une campagne se clôt sur ce qui est prouvé, et les dettes sans lot sont nommées comme telles

- Date : 2026-08-07
- Statut : accepté (arbitrages utilisateur du 2026-08-07, clôture du LOT-04 de la campagne `2026-08-06-packs-personnalises`)
- Domaine : produit et méthode (clôture de campagne, packs de questionnaires)
- Décision : trois arbitrages, pris ensemble à la clôture.
  1. **Le parcours E2E manquant part en lot nommé, et l'énoncé de campagne est réécrit pour ne dire que ce qui est prouvé.** Le fait 2 du « Résultat observable » annonçait un état de l'application ; les preuves disponibles sont **unitaires seulement** (`OrientationPanel.test.tsx`, `api/praticien/file-envoi/route.test.ts`, `.../envoyer/route.test.ts`) et la couverture E2E du parcours orientation → file d'envoi → envoi → déduplication est **nulle** (`grep -rn orientation web/e2e/` ne rend rien ; `dashboard-praticien.spec.ts:60-88` ne vérifie que le titre de colonne, le commentaire `:86` acceptant l'état vide et `:87` portant l'assertion ; `OrientationPanel` est monté par `TrajectoirePanel.tsx:255` mais aucune assertion ne le touche, et le bouton `OrientationPanel.tsx:345` n'est jamais cliqué). La campagne clôt donc sur la couverture existante, et le manque devient le LOT-01 de `2026-08-07-dettes-packs-residuelles` — jamais une extension du lot de clôture, dont le « Hors périmètre » exclut tout nouveau développement.
  2. **Le fait 2 est restreint par écrit au panneau d'orientation.** Le formulaire « Assigner un pack à un patient » de `PacksPanel.tsx:483-513` (`POST /api/praticien/packs/assign`) **reste en place**, nommé comme survivance assumée : depuis le retrait, il ne peut plus proposer que « Base de consultation ». Un énoncé de campagne qui aurait dit « plus aucun bouton d'assignation » aurait été faux à l'échelle de l'application.
  3. **Seule la dette `Q_ALI_09` reçoit un lot** (LOT-00 de la campagne suivante) : elle est clinique et active en production — **deux portes seulement** ferment le retrait de cet instrument suspendu du pack de base, vérifiées ligne à ligne : `web/src/app/api/praticien/questionnaires/route.ts:35` (`.filter(q => q.actif)` — aucune case à cocher n'expose le qid au praticien) et `PacksPanel.tsx:309-310` puis `:215` (l'écran d'édition recharge l'état stocké en entier, donc le qid repart à chaque sauvegarde). Les deux autres maillons souvent cités n'en sont pas : `packs/route.ts:306-309` **n'est pas une porte** — la garde ne porte que sur les qids **ajoutés** et ne bloque aucun retrait, ce qui est précisément la raison pour laquelle le pack n'est pas verrouillé (commentaire `:298-301`) ; et `portail/valider/route.ts:144-152` est la **conséquence** — l'amputation silencieuse, journalisée à chaque onboarding —, pas une porte. Les cinq autres dettes sont **nommées sans lot d'accueil** — voir Réserves.
- Conséquences :
  - **Un chiffre d'énoncé se relit contre la base — et un chiffre qui bouge est une dérive, pas une péremption.** Le fait 4 annonçait « 5 qids, `Q_SOM_09` inclus » ; la lecture SQL du 2026-08-07 en donne **6** (`Q_MOD_03`, `Q_MOD_01`, `Q_INF_03`, `Q_SOM_09`, `Q_ALI_01`, `Q_ALI_09`), avec `pack_questionnaires` aligné à 6 lignes. La première rédaction de cette décision en concluait que « le chiffre était périmé » : **c'est faux, et la preuve dit le contraire**. Le LOT-00 avait mesuré 5 qids **en production le 2026-08-06** et certifié « 8/8 packs en MATCH exact », « 5 lignes, ordres 0..4 sans trou » (`2026-08-06-packs-personnalises/lots/LOT-00-cadrage.md:90-91,119-123`) ; `packs.updated_at` porte **2026-08-06 18:02:38.913** — cet horodatage ne borne que la **dernière** écriture sur la ligne, pas celle qui a ajouté le qid. Ce qui est prouvé, et rien de plus : `Q_ALI_09` est entré dans le pack de base **pendant la campagne**, **entre la mesure du LOT-00 (2026-08-06) et 18:02:38.913**, dernière écriture connue — donc après cette mesure et **avant** que le garde `IDS_SUSPENDUS` sur `PATCH` (LOT-03, #604, 2026-08-07) n'existe. La lecture consignée en [[D-025]] (« Lecture du 2026-08-05 : aucun des 8 packs ne le référence ») corrobore : la dérive est **postérieure au 2026-08-05**. **L'auteur du geste est indéterminé** : aucune colonne d'audit ne le porte, aucun document de campagne ne le mentionne. Le fait 4 est donc **partiellement vérifié — dérive survenue et non prévenue** : l'invariant « registre = legacy » tient (6 lignes pour 6 qids, relu le 2026-08-07), la **non-dérive** est démentie. C'est nommément la réserve de [[D-025]] (« Aucun garde n'empêche `Q_ALI_09` d'entrer dans un pack… ») et le **point 4 de [[D-030]]**, qui portait ce garde au LOT-03 précisément parce qu'aucun endpoint ne le vérifiait.
  - **Une garde qui rend un défaut impossible remplace le log qui l'aurait constaté — dans le périmètre de la garde, pas au-delà.** Le fait 3 promettait une journalisation de la perte de cible ; elle aurait été verte en test et muette à vie, `packId` ne survivant que dans l'union de type. Substituée par `orientationRulesV1.test.ts:463` — aucune entrée de la table, publiée ou non, ne cible un pack (justification : `lots/LOT-03-integration.md:21-28`). **Ce banc ne porte que sur `suggestion.packId`** : l'énoncé se lit « la perte de cible **par pack** est rendue impossible ». Les **deux points de fail-closed silencieux** nommés par [[D-030]] écartent, eux, des cibles **questionnaire**, et restent **non instrumentés** — `web/src/lib/clinical/orientationEngine.ts:627` (si `suggestion.questionnaireId && estAdministrable(…)` est faux, `cibles` reste vide et rien n'est journalisé) et `web/src/lib/clinical/orientationService.ts:262-264` (filtrage muet sur `estAdministrableParLaRoute`). Dette écrite, sans lot.
- Réserves :
  - **Cinq dettes sont nommées sans lot d'accueil, et c'est un choix, pas un oubli — mais le décompte annoncé d'abord (« trois ») était faux.** `2026-08-06-packs-personnalises/lots/LOT-03-integration.md:203-213` en datait **cinq** ; trois avaient disparu du diff de clôture. Rétablies, le compte passait à six ; il redescend à cinq, la dette « seed à 5 qids » étant **rattachée au périmètre du LOT-00** de `2026-08-07-dettes-packs-residuelles`. Les cinq : (a) `prisma/seed.ts` **ne répare pas un pack de base cassé** — [`if (!parDefautExistant) {`](web/prisma/seed.ts), un `upsert` dont l'`update` est vide (`update: {}`, `create: PACK_BASE`), no-op silencieux **suivi d'un message de succès faux** (« Pack par défaut créé »), alors que `web/src/app/api/praticien/packs/route.ts:92-94` note que sans `parDefaut: true` **et** `actif: true` tout onboarding rend 404 sans chemin de réparation par l'UI — miroir exact de la dette (c) ; (b) `resolvePackQuestionnaireIds` (`web/src/lib/consultation/packRegistry.ts:89-123`) ne lit jamais `questionnaire_packs.actif`, et le retrait vient d'**armer sa condition de déclenchement** (7 lignes sur 8 à `false`) — piège pour le jour d'une bascule du registre en source primaire ; (c) aucun chemin praticien ne réactive un pack — `PATCH { actif: true }` est accepté par la route, aucun écran ne l'envoie : `PacksPanel.tsx` porte **quatre** appels mutants sur `/api/praticien/packs`, le `POST` de création (`:177-181`), le `PATCH` d'édition (`:207-217`, dont le payload `:210-216`), le `DELETE` (`:238`) et le `PATCH { idPack, parDefaut }` (`:254-257`) — **aucun des quatre ne porte `actif`**, et c'est cela qui prouve qu'aucun écran ne réactive un pack. Le cinquième appel mutant du composant, `POST /api/praticien/packs/assign` (`:281`), vise **une autre route** — c'est le formulaire d'assignation nommé au point 2 ; (d) le commentaire de `web/prisma/schema.prisma:155-156` cite encore le pack en **capitales**, la casse même qui avait tué le repli de `resoudrePackBase` ; (e) la suture `suggestedPackSelection` est laissée inerte (`web/src/components/PatientsPanel.tsx:902`, prop `:1033`, consommateur `web/src/components/PacksPanel.tsx:80-106`). **Piège de lecture** : LOT-03 nommait « `seed.ts` ne répare pas un pack de base cassé », la première rédaction de la clôture nommait « `seed.ts:270` porte 5 qids » — **deux défauts distincts sous le même mot `seed`**, traiter le second ne traite pas le premier. Aucune des cinq n'a d'effet clinique observable aujourd'hui ; ouvrir un lot par dette latente rouvrirait la campagne qu'on clôt. Elles sont écrites dans `lots/LOT-04-validation.md` pour être retrouvées.
  - **Le LOT-00 de `2026-08-07-dettes-packs-residuelles` n'est pas seulement clinique : il débloque une campagne en cours.** `2026-08-04-agenda-alimentaire/RUNBOOK-allumage-drapeau.md:44-53` fait de « **Aucun pack ne référence `Q_ALI_09`** » un **prérequis bloquant** de l'allumage de `WN_AGENDA_ALI` (`SELECT nom, par_defaut, actif FROM packs WHERE 'Q_ALI_09' = ANY(qids);`, attendu 0 ligne) : c'est **le seul chemin qui assignerait l'agenda sans clic praticien**, `assignPackToPatient` — appelé par l'onboarding portail — n'écartant que `IDS_SUSPENDUS`, et rien ne validant les `qids` d'un pack contre cette liste. La production rend aujourd'hui **1 ligne**, le pack de base. Le retrait de `Q_ALI_09` est donc **requis, pas à arbitrer** ; et tant que la ligne existe, allumer `WN_AGENDA_ALI` auto-assignerait l'agenda à chaque patient onboardé **sans décision praticien** — exactement ce que [[D-025]] protège.
  - La garde générale appelée par les réserves de [[D-031]] — un banc distinguant porte constitutive et voie d'entrée suffisante — **reste sans lot ouvert** ; cette décision ne l'ouvre pas.
- Référence : `docs/claude/campagnes/2026-08-06-packs-personnalises/lots/LOT-04-validation.md`, `docs/claude/campagnes/2026-08-07-dettes-packs-residuelles/CAMPAGNE.md`, [[D-030]], [[D-031]]

### D-031 — Une porte posée par une règle ne se contourne pas par une cible ajoutée ailleurs

- Date : 2026-08-07
- Statut : accepté (arbitrage praticien du LOT-02, campagne `2026-08-06-packs-personnalises`, PR #599 ; formalisé après le NO-GO de la passe adversariale `wn-reviewer` sur la première rédaction du re-ciblage)
- Domaine : produit et clinique (orientation)
- Décision : quand le critère d'une règle d'orientation est ce qui **rend l'instrument indiqué** — et non l'une de plusieurs voies d'entrée suffisantes vers lui —, ce critère est une **porte**, et l'instrument ne s'atteint pas ailleurs sans elle. Ajouter ce même instrument comme cible d'une **autre** règle, sans y reporter la porte, élargit l'indication en silence. Plusieurs règles peuvent en revanche atteindre légitimement un même instrument par des versants cliniques distincts, chacun se suffisant : `R2-SOM-01` (`SOMMEIL <= 14`) et `R2-SOM-02` (`Q_MOD_03/sommeil >= 7`) proposent toutes deux le PSQI, et le moteur les agrège en une recommandation à deux motifs. **Cette distinction est tenue à la relecture, par aucun mécanisme général** (voir Réserves).
- Le cas qui l'a produit : `R2-SOM-04` conditionne le dépistage d'apnées du sommeil (questionnaire de Berlin) à la conjonction d'un **antécédent respiratoire déclaré** et d'un **sommeil contextuel dégradé** (`Q_MOD_01/SOMMEIL <= 14`) — l'antécédent seul ne suffit pas, une apnée appareillée et équilibrée n'appelant pas de dépistage. Lors du re-ciblage des 6 règles à `packId` vers des suggestions `questionnaireId`, Berlin avait été proposé comme cible de `R2-SOM-05` — sur l'attente de sommeil déclarée **et** la mesure (`SOMMEIL <= 8`, plus strict que le `<= 14` de `R2-SOM-04`), mais **sans l'antécédent respiratoire**, la seule pièce manquante. **Aucune ligne de code n'était fausse** : les deux règles étaient valides prises séparément, et une revue de diff ne pouvait pas voir le défaut. La passe adversariale `wn-reviewer` a rendu NO-GO ; l'arbitrage praticien a retenu `R2-SOM-05 → PSQI + Horne`, Berlin retiré.
- Deux motifs de retrait, pas un : Berlin et Epworth ont d'abord été écartés de `R2-SOM-05` parce que **`WN-CL-0178-017` ne les nomme pas** — les proposer là les aurait fait reposer sur un claim qui ne les couvre pas. **Ce motif n'est tenu par aucun banc** : la correspondance entre un instrument proposé et ce que ses claims nomment n'est lisible que par un humain — réserve de [[D-018]], `rag_corpus_claims` vit en base, qu'aucun test unitaire n'ouvre. Ce que le sha épinglé de [[D-018]] garantit, c'est seulement qu'une table modifiée **rougit le CI** jusqu'à ce que quelqu'un ré-épingle le littéral ; que ce geste s'accompagne d'une relecture des claims et d'une nouvelle `dateValidation` est une procédure, pas un mécanisme — les deux littéraux sont épinglés séparément, et aucun banc ne les relie. Le contournement de porte s'ajoutait pour Berlin seul. **D-031 traite ce second motif** : la couverture par les claims ne dit rien des portes des règles voisines.
- Conséquences :
  - **Corollaire, du même ordre** : une composition de remplacement se choisit sur ce que **les claims de la règle** nomment, pas sur ce que **le pack remplacé** contenait. Reprendre le contenu d'un pack parce qu'il était là est un raisonnement d'inventaire, pas un raisonnement clinique.
  - **Le geste attendu** : avant d'ajouter une cible à une règle d'orientation, relire les portes des règles voisines qui nomment le même instrument. Si l'instrument est gardé quelque part, son arrivée ailleurs porte la même garde, ou ne se fait pas.
- Réserves :
  - **D-031 est un énoncé, pas une garde exécutable.** Hors le cas de Berlin, épinglé nommément par `orientationRulesV1.test.ts:875,912`, rien n'empêche mécaniquement d'ajouter une cible qui contourne une porte voisine : une mutation posant `Q_SOM_03` sur une règle qui ne s'allume pas sous les fixtures de ce banc — `R2-SOM-03` (rythme biologique) ou `R2-SOM-06` (fatigue) — n'est nommée par **aucun banc de contenu** : seuls rougissent le sha épinglé (`orientationRulesV1.test.ts:144`), qui rougit pour toute édition de la table sans rien dire de la porte, et le banc `:912` si la règle mutée s'allume sous ses fixtures. C'est le cas de `R2-SOM-01` et `R2-SOM-05`, attrapées nommément par l'égalité stricte de `orientationRulesV1.test.ts:918-919,922-923` ; `R2-SOM-03` et `R2-SOM-06` ne s'allument pas là, et aucun banc ne les nomme. **Aucun mécanisme ne signale au re-signataire qu'une porte vient d'être franchie.** Une garde **générale** — un banc distinguant porte constitutive et voie d'entrée suffisante, puis refusant la première sans sa condition — **reste à porter par un lot nommé, non encore ouvert** : le « Hors périmètre » du LOT-04 de cette campagne exclut « tout nouveau développement », un manque découvert là devenant « un lot nommé, pas une extension de ce lot ».
  - La distinction posée par cette décision **n'est pas testable en l'état** : la table ne marque nulle part, sur la règle elle-même, quel déclencheur est constitutif de l'indication. C'est cette marque, avant le banc, que le lot à ouvrir doit poser.
  - **Écart assumé à la pratique de [[D-028]]** : deux renvois inverses sont posés dans [[D-030]] et [[D-018]], datés et attribués à D-031, à la demande de l'utilisateur. La datation est le compromis — l'ajout se lit comme un ajout, jamais comme du texte d'origine.
- Référence : `docs/claude/campagnes/2026-08-06-packs-personnalises/lots/LOT-02-implementation.md`, `web/src/lib/clinical/orientationRulesV1.ts`, [[D-030]], [[D-018]]

### D-030 — Un seul pack actif : le geste d'envoi personnalisé remplace l'assignation figée

- Date : 2026-08-06
- Statut : accepté (arbitrages utilisateur du 2026-08-06, session de cadrage de la campagne `2026-08-06-packs-personnalises`, formalisés ici sur pièces d'inventaire — LOT-01 ; corrigé après revue adversariale `wn-reviewer`, NO-GO du 2026-08-06 sur la première rédaction — 32/34 citations exactes, correctifs appliqués ci-dessous)
- Domaine : produit et clinique (orientation), praticien
- Décision : trois arbitrages, plus un geste de garde porté au LOT-03.
  1. **Le second pack créé par le praticien, hors doctrine — « Florence 1 » (`PACK_b8sda7asd-h_B8x8061uORhc`) —, est désactivé, en plus des 5 packs de doctrine actifs.** « Base de consultation » (`PACK_-bG21yeIvVYRhrdlYuWIMnFz`, `par_defaut:true`), le premier pack praticien, **n'est jamais désactivée** : c'est elle qui reste seule active. Total : 6 packs désactivés (`PACK_SOCLE_INIT`, `PACK_SOMMEIL_CHRONO`, `PACK_STRESS_BURNOUT`, `PACK_DIGESTIF_INTESTIN`, `PACK_CARDIO_METABO`, « Florence 1 »). `PACK_HUMEUR_NEURO` était déjà inactif. Après retrait (LOT-03) : 1 pack actif sur 8, 7 en historique.
  2. **Le geste d'envoi depuis l'orientation est l'ajout à la file d'envoi** (`POST /api/praticien/file-envoi`, puis `POST /api/praticien/file-envoi/envoyer`), pas l'assignation directe d'un pack (`POST /api/praticien/packs/assign`). Le chemin de remplacement existe déjà et n'est pas construit par cette campagne : dédup, plafond 60 qids, un seul mail récapitulatif — même patron que `packs/assign` (commentaire `web/src/app/api/praticien/file-envoi/envoyer/route.ts:26`).
  3. **Cette campagne devient l'activité primaire** ; la reprise des dettes 5.0 (LOT-06/LOT-07) attend sa clôture.
  4. **Un garde `IDS_SUSPENDUS` sur `POST`/`PATCH /api/praticien/packs` est porté au LOT-03** (détail en Réserves) — aucun des deux endpoints ne le vérifie aujourd'hui.
- Ce que l'inventaire du LOT-01 établit, et qui fonde ces arbitrages : les 6 règles d'orientation à `packId` (`R2-SOM-05`, `R2-STR-02`, `R2-GAS-02`, `R2-ALI-01`, `R-STR-02`, `R-GAS-01` — `orientationRulesV1.ts`) ciblent 3 packs, tous les trois parmi les 5 packs de doctrine désactivés par le point 1 : elles perdent donc **toutes** leur seule cible, silencieusement, dès l'application du retrait. Aucun mécanisme de repli intra-règle n'existe (type `OrientationSuggestion`, union stricte, `orientationRulesV1.ts:118`) — composer des cibles `questionnaireId` de remplacement est un geste clinique du LOT-02, pas une correction de code, et il exige la re-signature D-018 (relire les claims, poser une nouvelle `dateValidation`, épingler un nouveau sha — le littéral `SHA_SIGNE_2026_08_04` d'`orientationRulesV1.test.ts:105` rougira sinon).
- Conséquences :
  - **`PackProposition` (`schema.prisma:1347`) reste un modèle vivant**, pas « sans objet » comme le texte initial du lot le supposait. Écrivain runtime confirmé : `api/portail/pack-reevaluation/route.ts:173` (`create`, statut `acceptee`/`declinee`, acteur `patient`), purgé par l'effacement RGPD (`lib/patient/effacement.ts:101`). **0 ligne en production au 2026-08-06** (lecture SQL `SELECT count(*) FROM pack_propositions`). Il survit au retrait puisque « Base de consultation » reste une cible valide de proposition.
  - **Toute modification des 6 règles à `packId` exige la re-signature D-018**, geste distinct du code du LOT-02 et tracé comme tel — pas un correctif silencieux du sha épinglé.
  - **La perte de cible d'une règle devra être journalisée** (LOT-03) : recherché explicitement dans `eventCodes.ts`, aucun code d'événement n'existe aujourd'hui pour ce cas — seuls les **5** codes `ASSIGNATION_PACK_*` (`web/src/lib/observability/eventCodes.ts:77-80,86` — payload invalide, résolution échouée, e-mail échoué, exception, instrument suspendu ; `ASSIGNATION_DEJA_ASSIGNE_ECARTE` à `:90` est un code voisin, sans le préfixe `PACK`) et `PACK_REGISTRE_REPLI_LEGACY` (`:124`, repli du registre relationnel) sont déclarés. Il y a en réalité **deux points de fail-closed silencieux** à instrumenter, pas un : le moteur (`orientationEngine.ts:571-587,621-632`) et le service, en sortie, inconditionnel (`orientationService.ts:260-269`).
  - **Les packs désactivés restent visibles en historique, sans réactivation possible par l'UI.** `GET /api/praticien/packs` (`route.ts:63-70`) ne filtre pas `actif` — les 7 packs retirés continuent d'apparaître, badge « Inactif », dans `PacksPanel.tsx`. `PATCH` accepte pourtant `actif` (`packs/route.ts:181`) : une réactivation reste possible par appel API direct, jamais par un geste UI. C'est une dette assumée, pas une régression du retrait — aucune UI de réactivation n'était demandée.
  - Cette classe de défaut — « aucun garde n'empêche un instrument suspendu d'entrer dans un pack », déjà nommée en [[D-025]] (réserve « Aucun garde n'empêche `Q_ALI_09` d'entrer dans un pack », et le constat contigu « aucun des 8 packs ne le référence » — cités par leur phrase, pas par un numéro de ligne : ce fichier s'append en tête et décale toute référence à chaque nouvelle décision) — **est réduite, pas fermée : le chemin de création reste ouvert.** Rien ne retire `POST /api/praticien/packs` (`packs/route.ts:86,102`), et `normaliserQids` (`:52-60`) ne consulte pas `IDS_SUSPENDUS` : un pack créé avec un instrument suspendu puis marqué `parDefaut` s'auto-assignerait à chaque onboarding, exactement le scénario que la réserve de [[D-025]] décrivait. D'où le point 4 de la décision.
- Réserves :
  - **La composition de remplacement des 6 règles n'est pas encore arbitrée cliniquement** — le LOT-01 propose des candidats tirés de la composition SQL réelle des 3 packs (voir la matrice de ce lot), mais le choix final, l'objectif rédigé et la re-signature restent un acte praticien du LOT-02.
  - **L'asymétrie du repli `pack-reevaluation`** (pack déjà rempli désactivé → repli sur `parDefaut` ; pack déjà rempli actif mais vide → aucune proposition, pas de repli — `packReevaluation.ts:47-49`) reste à trancher au LOT-03. Elle est qualifiée acceptable en l'état car le seul pack jamais écrit dans `consultations.id_pack_assigne` est le pack de base (15 lignes, lecture SQL du 2026-08-06), qui reste actif après retrait.
  - **Le repli par nom de `resoudrePackBase` (`valider/route.ts:24,28-31`) est mort, pas un filet.** `NOM_PACK_BASE = 'BASE DE CONSULTATION'` (majuscules) alors que le nom réel en base est « Base de consultation » ; l'égalité Prisma/PostgreSQL est sensible à la casse — ce repli ne peut jamais s'exécuter. Si le pack `parDefaut` disparaissait ou perdait sa marque, `resoudrePackBase` renverrait `null` et `portail/valider` échouerait, sans filet réel. **Aggravant : `PATCH /api/praticien/packs` (`packs/route.ts:182,191-193`) accepte `parDefaut` sur n'importe quel pack, actif ou non, sans aucune garde** — rien n'empêche de démarquer « Base de consultation » par erreur. Geste porté au LOT-03 (point 4 de la décision) : recherche insensible à la casse, ou garde interdisant de désactiver/démarquer le pack `parDefaut`.
  - **Le bloc « Packs suggérés » de `PatientsPanel.tsx`** (`packsRecommandes`, `questionnaires-functional.ts:78,209-268` → `api/praticien/questionnaires/registry/route.ts:8,25` et `api/praticien/questionnaires/route.ts:45` → `PatientsPanel.tsx:272,288,750,900-928`) n'a pas été retiré par ce lot documentaire : après le retrait effectif (LOT-03), ses boutons continueront de citer des packs désactivés et d'aboutir à un message d'échec — porte du parcours à fermer au LOT-03.
  - **Le sens de `dejaAssigne`/`dejaCouvert`/`dejaRepondu` change quand une cible pack devient N cibles questionnaires** (`orientationEngine.ts:655-665` : pour un pack, `dejaAssigne` est un `every` sur toute la composition ; pour un questionnaire, c'est l'item seul). Le panneau d'orientation passe alors de 1 ligne par règle à 5-8 lignes — arbitrage UX/clinique à trancher au LOT-02.
  - **L'absorption comme regroupement disparaît avec le retrait des cibles pack** (le report « via Q_GAS_01 : … », [`` `via ${qid} : ${objectif}` ``](web/src/lib/clinical/orientationEngine.ts) — ancre corrigée le 2026-08-23 ([[D-100]]) : elle visait `orientationEngine.ts:769-772`, où ce code ne vit plus) : `R2-GAS-01` et le remplacement de `R2-GAS-02` dédupliqueront alors en une seule ligne, là où l'un absorbait l'autre — acceptable, à valider au LOT-02.
  - **`packsTransmis` (`synthese/route.ts:97,361,414` ; prompt `anthropic.ts:326`) deviendra structurellement vide.** À vérifier au LOT-02 si un bloc vide se lit, côté modèle, « aucun pack recommandé » (correct) ou « bloc absent » (silence trompeur).
- Référence : `docs/claude/campagnes/2026-08-06-packs-personnalises/CAMPAGNE.md`, `docs/claude/campagnes/2026-08-06-packs-personnalises/lots/LOT-01-socle.md` (matrice d'inventaire, section « Résultats »), [[D-018]], [[D-025]] ; renvoi ajouté le 2026-08-07 par [[D-031]] : le re-ciblage des 6 règles **rendu nécessaire par ce retrait, et arbitré au LOT-02**, est borné par [[D-031]] — une cible ajoutée ne contourne pas la porte d'une règle voisine.

### D-029 — Un repli d'accès sans session se retire, il ne se patche pas, une fois la reprise prouvée

- Date : 2026-08-05
- Statut : accepté
- Domaine : sécurité et authentification patient
- Décision : les 6 routes `api/patient/*` qui acceptaient un accès sans cookie de session (repli email + `idAssignation`, hérité du parcours legacy `/patient/[idAssignation]`) n'acceptent plus que la session portail `wn_portail` — alignées sur `api/patient/protocole`, déjà écrite ainsi. Le repli avait un défaut vivant (ne relisait jamais `patients.actif`/`accessTokenRevoked` : un patient révoqué gardait un accès complet), mais **le corriger n'a pas été retenu comme réponse suffisante** : une fois `/patient/[idAssignation]` redirigé vers `/portail/connexion` ([[D-002]]), plus aucun appelant légitime n'atteint ces routes sans session — patcher le repli aurait laissé debout une surface d'attaque sans usage. Le retrait n'a été posé qu'**après** vérification empirique (logs d'exécution Vercel, hors dépôt) que la cible de reprise (`/portail/connexion` — lien magique, Google, jeton) fonctionne réellement en production : retirer un chemin d'accès sans prouver d'abord que son remplaçant marche aurait échangé un risque de sécurité contre un risque de disponibilité.
- Conséquences : règle générale pour tout futur retrait d'un chemin d'accès patient hérité — (1) mesurer l'usage réel, (2) prouver que le chemin de remplacement fonctionne en production, **puis seulement** (3) retirer plutôt que patcher un repli faible. Un correctif qui referme un trou de sécurité sans retirer la surface qui le portait n'est qu'une étape intermédiaire, pas une clôture. Le répertoire `web/src/app/patient/[idAssignation]/` reste dans le dépôt (page inatteignable, marquée datée) ; son retrait physique est un lot distinct, subordonné à la vérification que le portail couvre le consentement RGPD et la consultation de réponses verrouillées que la page legacy portait aussi.
- Référence : campagne `2026-08-05-cloture-des-dettes-wellneuro-5-0`, LOT-04 (`docs/claude/campagnes/2026-08-05-cloture-des-dettes-wellneuro-5-0/lots/LOT-04-validation.md`), `changelog.d/2026-08-05-parcours-patient-unique.md`, [[D-002]], [[D-028]]
### D-028 — Le drapeau atteint l'écran par un provider de page, jamais par la route qui refuse de le lire

- Date : 2026-08-05
- Statut : accepté (**ferme la réserve nommée « L'écran ne dit pas que le recueil est fermé » de [[D-027]]**, le reste étant intact). [[D-027]] n'est pas retouché — une décision est un enregistrement daté, et c'est à celle-ci de nommer ce qu'elle déplace, exactement comme [[D-027]] l'a fait pour [[D-025]].
- Domaine : exploitation (transport d'un drapeau jusqu'à une surface client). **Sans effet clinique** : l'instrument est non scoré, et rien ici ne conditionne un accès.
- Décision : le panneau praticien de l'agenda alimentaire **dit** la position de `WN_AGENDA_ALI` par une bannière — « Recueil fermé — le patient ne peut plus noter de journée. Les journées déjà notées restent lisibles ici. » — et la position lui parvient par un **provider de page** (`AgendaAliFeatureProvider`, monté dans `dashboard/patients/[idPatient]/page.tsx`, composant serveur), **jamais** par un champ ajouté à la réponse de `GET /api/praticien/agenda-alimentaire`.
- **Ce qui a été écarté, et pourquoi.** Un champ `recueilOuvert` dans la réponse de la route était la voie évidente. Elle oblige à appeler `isAgendaAlimentaireEnabled` **dans la route même dont le commentaire interpelle nommément le relecteur tenté de le faire** et exige « de repasser par une décision qui rouvre ce point ». *Rapporter* n'est pas *garder* — mais l'appel est le même, à une ligne près de devenir un `if` qui referme un lecteur append-only. Le provider rend le même service sans poser cette ligne : [[D-027]] tient tout entier, sans être rouvert.
- **Le motif n'est pas nouveau, il était déjà dans le fichier.** `C5FeatureProvider` (`components/patient-cockpit/C5FeatureProvider.tsx`, treize lignes) fait exactement cela pour `WN_C5_ENABLED`, deux lignes au-dessus du point de montage, et son consommateur profond `ClinicalRuntimeSection` lit `useC5Enabled()`. Réutiliser un motif présent coûtait moins qu'ouvrir une route gardée par un commentaire.
- Conséquences :
  - **Le contexte est à TROIS états, et son défaut est `null` — pas `false`.** Le réflexe fail-closed vient des *gardes* : refuser par défaut ne coûte qu'un accès, et c'est la bonne doctrine pour `isAgendaAlimentaireEnabled` lui-même. Ce contexte ne garde rien, il alimente un **énoncé** — « Recueil fermé, le patient ne peut plus noter de journée ». Le drapeau étant **allumé en production** ([[D-025]]), un défaut `false` serait la valeur fausse cent pour cent du temps : un provider oublié sur un futur point de montage afficherait en silence une affirmation fausse sur l'état d'un dossier. `null` signifie « position inconnue » et le panneau n'affirme alors rien — se taire quand on ne sait pas est le seul défaut qui ne ment jamais. Le rendu teste `=== false`, jamais `!drapeau`, qui aplatirait les trois états en deux.
  - **Le câblage réel est épinglé par un test**, plutôt que compensé par un défaut : `web/src/app/dashboard/patients/[idPatient]/page.test.tsx` vérifie que la page monte le provider et l'alimente depuis `isAgendaAlimentaireEnabled`, jamais depuis une constante. Vérifié par mutation — `enabled={true}` en dur fait passer le test au rouge.
  - **L'état vide du panneau n'est pas touché.** [[D-027]] l'a rendu descriptif exprès (« un écran ne doit pas proposer un geste impossible ») ; une bannière par-dessus « aucun agenda assigné » n'ajouterait rien. La bannière n'apparaît qu'avec au moins un épisode.
  - Aucune surface patient ne change, aucune garde d'accès n'est ajoutée ni retirée.
- Réserves :
  - **Rien ne mesure la position du drapeau côté dépôt** — réserve de [[D-025]] et [[D-027]], non levée. La bannière *dit* le drapeau, elle ne le *vérifie* pas : un drapeau mal positionné produit une bannière fausse, dans un sens comme dans l'autre.
  - **Un second point de montage du panneau devra penser au provider.** Il n'y en a qu'un aujourd'hui (`FichePatientPanel`). Le défaut `null` fait qu'un oubli produit un panneau **muet** sur l'état du recueil — l'état d'avant ce lot, pas une contre-vérité. C'est le moins mauvais des deux échecs, ce n'est pas une absence d'échec.
  - **L'argument explicite `isAgendaAlimentaireEnabled(process.env.WN_AGENDA_ALI)` au point de montage est décoratif**, et il ne faut pas croire le contraire. La fonction est déclarée `(value = process.env.WN_AGENDA_ALI)` : une faute de frappe sur le nom de la variable rend `undefined`, ce qui **déclenche le paramètre par défaut** — donc relit la bonne variable et produit le même verdict. Vérifié par mutation le 2026-08-05. Aucun test ne peut donc couvrir ce nom-là, et le même angle mort vaut pour `isC5Enabled(process.env.WN_C5_ENABLED)` deux lignes plus haut. Ce qui protège vraiment le nom de la variable est ailleurs : la position du drapeau se lit en production, jamais dans le dépôt — réserve ci-dessus.
- Référence : [../web/src/components/agenda-alimentaire/AgendaAliFeatureProvider.tsx](../web/src/components/agenda-alimentaire/AgendaAliFeatureProvider.tsx), [../web/src/app/dashboard/patients/[idPatient]/page.tsx](../web/src/app/dashboard/patients/%5BidPatient%5D/page.tsx), [claude/campagnes/2026-08-04-agenda-alimentaire/lots/LOT-08-le-recueil-dit-son-etat.md](claude/campagnes/2026-08-04-agenda-alimentaire/lots/LOT-08-le-recueil-dit-son-etat.md), [[D-015]], [[D-025]], [[D-027]]

### D-027 — Le drapeau ferme ce qui s'écrit, pas ce qui se relit : la lecture praticien de l'agenda n'est pas gardée

- Date : 2026-08-05
- Statut : accepté (arbitrage praticien en session — **amende la conséquence « l'extinction referme toutes les surfaces » de [[D-025]] et ferme sa réserve « aucun lecteur praticien des journées n'existe »**, le reste étant intact). [[D-025]] n'est pas retouché : une décision est un enregistrement daté, et c'est à celle-ci de nommer les deux points qu'elle déplace.
- Domaine : exploitation (portée du drapeau). **Sans effet clinique** : l'instrument est non scoré, et la lecture n'en produit aucun.
- Décision : **`WN_AGENDA_ALI` ne garde pas la route `GET /api/praticien/agenda-alimentaire` ni le panneau qu'elle alimente.** La conséquence de [[D-025]] se lit désormais : l'extinction referme toutes les surfaces **d'écriture et d'exposition patient** — bibliothèque praticien, sélecteur, route d'assignation, hub, saisie, `patient/submit`. Elle ne referme pas la **lecture au dossier**. Trois constats la fondent, et le troisième est celui qui décide.
  1. **L'extinction n'efface rien.** Le modèle est append-only ([[D-015]]), et [[D-025]] le consigne lui-même : « éteindre referme les assignations mais n'efface pas les journées notées ; un pilote lancé laisse une trace en base après extinction ». Une donnée qui survit à l'extinction et un lecteur qui ne lui survit pas forment un état où la donnée existe sans porte.
  2. **Le drapeau ne protège aucune isolation de données**, et [[D-025]] l'établit : il ne décide que de **quel déploiement affiche la surface**. Le retirer de la lecture ne retire donc aucune protection — il retire une coïncidence.
  3. **Le moment où ce lecteur compte le plus est exactement celui où le drapeau serait éteint.** Un recueil de 21 jours se calibre **après** sa clôture, et la clôture est précisément ce qui rend l'extinction souhaitable. Garder le lecteur derrière le drapeau reviendrait à fermer la porte le jour où l'on entre — et à renvoyer `LOT-06` vers `execute_sql`, c'est-à-dire vers la dette que ce lot ferme.
- **Ce que la lecture reste gardée par**, et qui est plus fort que le drapeau : une session praticien (`getServerSession`), puis `verifierAppartenancePatient` — appelée **avant la première lecture Prisma**, et qui écrit le journal d'accès dossier (G-TRUST-04). Le drapeau n'a jamais été un contrôle d'accès ; ces deux-là le sont, et ils sont nominatifs quand il est global.
- Conséquences :
  - La route répond drapeau éteint, et **un test le nomme** plutôt que de le laisser à l'absence de code : sans lui, un relecteur futur « corrigerait » l'absence de garde. La raison est aussi écrite en commentaire au-dessus de la route.
  - Aucune surface patient ne change. Le patient dont l'agenda est éteint ne voit rien de plus ; c'est le praticien, sur un dossier qui lui appartient, qui relit ce qui a déjà été saisi.
  - La réponse porte un compte `illisibles` distinct des journées actives — les lignes en quarantaine se comptent au dossier, elles ne se taisent pas.
- Réserves :
  - **L'écran ne dit pas que le recueil est fermé.** Le panneau ne lit pas la position du drapeau : un praticien peut donc relire un agenda que le patient ne peut plus alimenter, sans que rien ne l'indique. Faire dépendre le lecteur du drapeau qu'il refuse justement de lire a été écarté ; le dire par une bannière reste possible et n'est pas fait. Pour la même raison, l'état vide du panneau (aucun agenda assigné) a été rendu **descriptif**, sans impératif : drapeau éteint, `IDS_SUSPENDUS` retire `Q_ALI_09` à la fois de la bibliothèque et de la route d'assignation, si bien que le geste « Assignez l'instrument » que l'écran nommait auparavant n'existe alors nulle part — un écran ne doit pas proposer un geste impossible.
  - **Sous sept journées, `calculerAgregatsAli` rend `null`** (`MIN_JOURS_AGREGATS`). Le panneau l'affiche en toutes lettres — « couverture insuffisante — N/7 » — parce qu'une zone vide serait le même signal trompeur que [[D-025]] reproche à la bibliothèque. Le pilote en cours est dans ce cas, à une journée sur vingt et une.
  - **Rien ne mesure la position du drapeau côté dépôt**, réserve déjà portée par [[D-025]] et inchangée : cette décision ne la lève pas, elle la rend seulement moins coûteuse — un drapeau mal positionné ne rend plus la donnée illisible.
- Référence : [../web/src/app/api/praticien/agenda-alimentaire/route.ts](../web/src/app/api/praticien/agenda-alimentaire/route.ts), [../web/src/components/agenda-alimentaire/AgendaAlimentairePraticienPanel.tsx](../web/src/components/agenda-alimentaire/AgendaAlimentairePraticienPanel.tsx), [claude/campagnes/2026-08-04-agenda-alimentaire/lots/LOT-05-dossier-de-controle-et-lecteur-praticien.md](claude/campagnes/2026-08-04-agenda-alimentaire/lots/LOT-05-dossier-de-controle-et-lecteur-praticien.md), [[D-015]], [[D-022]], [[D-025]]

### D-026 — Ce que le patient lit est un instantané de l'envoi, pas le champ vivant

- Date : 2026-08-05
- Statut : accepté
- Domaine : produit et clinique
- Décision : la page « Mon bilan » du portail sert `booklet_envois.note_transmise`, figé au moment de l'envoi et nul sur toute ligne d'échec — **jamais** `syntheses_ia.notes_praticien`, qui reste modifiable après un envoi réussi. La visibilité se fonde sur un `BookletEnvoi` de statut `Envoye`, jamais sur le statut de la synthèse : un praticien valide souvent avant de décider s'il envoie.
- **L'absence de garde sur `annoter` est un choix, pas une dette.** Une garde symétrique de celle d'`effacer` — refuser dès qu'un envoi existe — paraissait la réponse évidente, et elle est fausse : le renvoi corrigé (`forceSend`, opération `Renvoi`) consiste **précisément** à corriger une note puis à la renvoyer. La garde aurait interdit le geste qu'elle prépare. C'est l'instantané qui ferme le défaut, et un renvoi en écrit un frais.
- **L'envoi accorde la visibilité, le rejet la retire.** Sans cette soupape, un praticien qui s'aperçoit après coup qu'il a transmis un bilan erroné n'aurait aucun recours : `effacer` est refusé dès qu'un envoi existe, et « Rejeter » resterait sans effet sur ce que le patient lit. Le seul moyen serait d'en envoyer un autre.
- **Une règle de visibilité s'écrit une fois.** `whereEnvoiVisible` (`lib/documents/bilanPatient.ts`) est l'unique définition, servie à la page comme au hub. Les deux avaient déjà divergé — le hub proposait « Consulter mon bilan » après un rejet, vers une page répondant « ne vous a pas encore transmis ». Même classe que les PR #546/#552 : une liste dérivée d'une carte partagée, jamais deux copies d'un prédicat.
- Conséquences :
  - **Un backfill s'appuie sur un invariant, pas sur un comptage.** La condition `updated_at <= date_envoi` ne recopie que les envois dont la synthèse n'a provablement pas bougé ; les autres restent nuls — un manque visible, jamais un texte présenté comme transmis alors qu'il ne l'a pas été. Une mesure prise à la relecture ne dit rien de l'état au déploiement, et l'action qui pourrait l'invalider est justement celle qu'on laisse ouverte.
  - **L'accès au document et l'avancement de la frise sont deux signaux.** Les servir depuis le même prédicat faisait reculer le parcours patient de « restitution disponible » à « votre praticien les prépare », contre l'invariant « jamais rétrograde » de `lib/trajectoire-partagee/contrat.ts`. L'envoi a eu lieu : l'historique le garde acquis, seul l'accès suit le rejet. `bilanConsultable` implique `bookletEnvoye`, jamais l'inverse. Après le rejet du dernier bilan, un envoi antérieur dont la synthèse reste valide **redevient visible** — il n'a jamais été repris au patient.
  - **Le narratif, lui, n'est pas snapshotté.** Il n'est figé que par le refus d'`enregistrer` sur toute synthèse qui n'est plus un brouillon — un invariant qui vit dans une **autre** route. Épinglé par un test depuis ce lot ; il ne l'était par rien avant.
  - **Un refus d'accès à un document clinique laisse une trace** (`logger.security` sur les deux refus), et le refus opposé à un compte révoqué rend `403` et non `401` : le client cessait d'afficher un motif et renvoyait vers le gate, qui refusait à son tour.
- Réserves :
  - **Sur un dossier clos, annoter reste possible et renvoyer ne l'est plus.** La note du dossier peut alors diverger définitivement de ce que le patient a reçu, sans moyen de réconcilier. Sans conséquence pour le patient — le portail sert l'instantané — mais c'est une question de tenue de dossier, et aucune des deux réponses envisagées ne la ferme.
  - **`booklet_envois` n'est plus un journal d'audit.** Elle porte désormais du texte clinique libre. L'effacement patient la couvre déjà (supprimée en premier, avant `syntheseIA`), mais toute règle de conservation qui la traiterait comme de la métadonnée est devenue fausse.
  - **Aucun code d'événement ne vise le bilan patient.** `PORTAIL_SESSION_EXCEPTION` est le moins faux des existants : un lecteur qui filtrerait cette famille y trouvera des échecs de lecture de bilan.

### D-025 — Le drapeau de l'agenda s'allume en Production, seul environnement où un recueil de 21 jours puisse vivre

- Date : 2026-08-05
- Statut : accepté (arbitrage praticien en session — **amende le point 2 de [[D-022]]**, dont le point 1 reste intact)
- Domaine : exploitation (position du drapeau). **Sans effet clinique** : l'instrument est non scoré.
- Décision : **`WN_AGENDA_ALI` est posé à `true` sur le scope Vercel Production, et sur lui seul.** La restriction « sur Development et Preview, **et sur elles seules** » du point 2 de [[D-022]] est levée, et retournée : c'est la **Preview** qui est désormais exclue. La portée est celle des **environnements Vercel** — le banc de test reste libre de forcer le drapeau, ce que `web/playwright.config.ts` fait déjà et doit continuer de faire. Trois constats la fondent.
  1. **La Preview est inatteignable par le praticien, et le Development ne peut pas porter le recueil.** Deux verrous indépendants ferment la Preview : `ssoProtection: all_except_custom_domains` place les URLs `*.vercel.app` derrière le SSO Vercel, seul le domaine personnalisé étant public ; et le callback OAuth envoyé par l'application est `https://app.wellneuro.fr/api/auth/callback/google` (`docs/claude/CONTEXTE_SESSION_VERCEL_2026-07-01.md`), quand l'URL d'une preview change à chaque déploiement. Le Development, lui, **est** atteignable — `web/playwright.config.ts` y pose `WN_AGENDA_ALI: 'true'` et `e2e/portail-agenda-alimentaire.spec.ts` déroule assignation, hub, consentement et saisie sans passer par Google, la session praticien étant fabriquée par `e2e/helpers/auth.ts`. Mais un serveur local éphémère ne porte pas trois semaines de recueil. Le précédent maison tranchait déjà dans ce sens pour une autre variable : « poser la variable dans Vercel **Production seule** — jamais Preview, qui lit la base de production » (`campagnes/2026-07-19-idp-identite-patient-durable/ACTIVATION_RUNBOOK_G4.md`).
  2. **Le motif du report est éteint.** [[D-022]] justifiait la restriction par le fait qu'allumer rendrait `Q_ALI_09` assignable « sans qu'aucun écran ne le consomme ». `LOT-04` a livré cet écran le 2026-08-05 (PR #570). La prémisse est tombée avec le lot qui la levait — et le code l'avait anticipé : « le seul geste qui sépare la production de cet écran est un `true` posé au panneau Vercel — pas une revue de code » (`questionnaires/alimentaire.ts`).
  3. **Le drapeau ne protège aucune isolation de données, et [[D-022]] le consigne lui-même** : « les environnements non-production partagent la base de production, donc une assignation créée depuis une preview y atterrit ». Il ne décide donc que d'une chose — **quel déploiement affiche la surface**.
- **Ce qui n'est pas un fait nouveau** : la lecture de la base. `agenda_alimentaire_jours` compte 0 ligne et `assignations` 0 ligne pour `Q_ALI_09` (sur 113) au 2026-08-05 — chiffres **inchangés** depuis [[D-022]], qui les portait déjà tous les deux. Rien n'a bougé côté donnée ; ce qui change est la lecture du **blocage**, et lui seul. L'observation « 0 ligne dit une inaction et non une attente » porte sur `LOT-05`, pas sur [[D-022]], qui n'a jamais écrit le contraire.
- Conséquences :
  - **Aucun des trois patients de graine ne porte le recueil pilote**, et le croire était l'erreur de la première rédaction de cette décision. Le motif qui vaut pour les trois et ne dépend d'aucun état : leur adresse `@fictif.wellneuro.fr` n'existe pas, quand le lien d'entrée au portail part **par e-mail** et que l'interface ne l'affiche pas (`PatientsPanel.tsx` rend « Lien à usage unique envoyé » et jette le `lien` que la route renvoie). S'y ajoutent, propres à chacun, la mutation par les E2E (`preparerReprisePourTest` sur `PAT_SEED_02`, parcours sur `PAT_SEED_03`) et, au 2026-08-05, un `actif = false` sur `PAT_SEED_01` et `PAT_SEED_02` qui suffirait à faire refuser l'assignation — `accepteNouvelEnvoi` n'accepte qu'un dossier `en_suivi`, c'est-à-dire `actif` vrai **et** `suiviClotureLe` nul (`lib/patient/cycleDeVie.ts`). Cet état-là est daté : les E2E le retournent sans le restaurer. Le dossier de contrôle suit donc la règle déjà payée par le gate G4 : « la précaution qui compte n'est pas "un patient fictif", c'est **aucune boîte d'un tiers** » — une adresse relevant du praticien lui-même.
  - **Rien ne s'auto-assigne aujourd'hui, et cette phrase porte une date.** Le drapeau pilote le seul champ `actif` du catalogue (`featureFlag.ts` en est l'unique lecteur runtime), mais `assignPackToPatient` n'écarte que `IDS_SUSPENDUS` et part de l'onboarding portail — **donc sans clic praticien sur le questionnaire**. Un `Q_ALI_09` entré dans un pack serait assigné à tout onboarding, drapeau allumé. Lecture du 2026-08-05 : aucun des 8 packs ne le référence. **Au passage, la graine ne reflète plus ce qu'elle prétend refléter** : `web/prisma/seed.ts` déclare quatre identifiants sous le commentaire « reflète le pack `parDefaut` réel (contenu figé R2, 2026-07-10) », quand le pack de production — « Base de consultation » — en porte cinq, `Q_SOM_09` s'y étant ajouté depuis. Constat consigné, non corrigé : hors périmètre de ce lot.
  - **Aucune lecture clinique n'est exposée**, parce qu'il n'y en a aucune : `scoring.type = 'journal'` ne lit rien et rend `scored: false` — et `'journal'` figure dans `PORTE_SON_PROPRE_NON_SCORE`, si bien que la garde « aucune réponse correspondante » ne le préempte pas. Ni barème, ni indice, ni seuil : c'est l'objet de `LOT-05`, qui n'est pas écrit.
  - **Le geste reste en deux temps** : poser la variable **puis** redéployer, jamais l'un sans l'autre — `IDS_SUSPENDUS` est un `const` de module calculé à l'import ([[D-015]], [[D-022]]). La variable se crée **non sensible**, pour la même raison que `WN_G4_REDEMANDE_PATIENT` : une variable masquée n'est plus relisible, donc plus vérifiable après coup.
  - **L'extinction referme toutes les surfaces**, par conception et vérifié une à une : la barrière 5 de `agenda-alimentaire/portail.ts` est traversée par le GET **et** le POST de la route agenda ; le hub filtre deux fois ; bibliothèque et sélecteur passent par `actif` ; la route d'assignation par `IDS_SUSPENDUS` ; et `patient/submit` refuse `Q_ALI_09` nommément. Aucun cron ne s'exécute (`vercel.json` n'en déclare aucun), et la seule relance automatisable est bornée à l'agenda du **sommeil**.
  - La ligne « Hors périmètre » de la campagne — « toute activation de `WN_AGENDA_ALI` avant la fin de `LOT-04` » — est **satisfaite**, non levée.
- Réserves :
  - **L'interface ne dira pas « pilote » : elle dira « instrument cassé ».** Faute de bloc `certification` et de `sections`, la bibliothèque affichera `nbQuestions: 0`, `scoreMax: null` et **« Statut inconnu »** (`lib/bibliotheque.ts`, `BibliothequePanel.tsx`), et l'aperçu rendra un questionnaire vide. Ce n'est pas une absence de signal, c'est un **signal trompeur** — et rien ne distingue à l'écran un instrument de recueil d'un instrument défaillant. Non corrigé.
  - **Aucun garde n'empêche `Q_ALI_09` d'entrer dans un pack.** `POST` et `PUT /api/praticien/packs` ne valident pas les `qids` contre `IDS_SUSPENDUS` ; la vérification du prérequis est le seul filet, et elle est manuelle. C'est le chemin par lequel « rien ne s'auto-assigne » cesserait d'être vrai sans qu'aucune décision ne soit prise.
  - **Le recueil pilote hérite des six manques nommés au handoff de `LOT-04`** — et les deux que la première rédaction avait omis sont ceux qui pèsent le plus sur un pilote : `soumisLe` estime là où `supersedesJourId` trancherait (refus *fail-closed* opposé au patient **sans geste de sortie**), et **le hit-test tactile de `LigneDePrises` n'est prouvé nulle part**, jsdom ne calculant aucune géométrie et l'E2E passant par le clavier — sur des prises espacées de 15 minutes qui se recouvrent à l'écran. Les quatre autres : correction bornée à J et J-1, aucune vue praticien ni clôture patient, une borne qui ne ferme rien d'observable, `nbRenseignees` divergent. **La donnée que `LOT-05` aura à calibrer sera recueillie sous ces manques**, puisqu'ils ne peuvent se corriger qu'avant un recueil dont l'absence est justement ce qui bloque.
  - **Aucun lecteur praticien des journées n'existe.** Les seuls consommateurs de `agendaAlimentaireJour` sont le hub patient, la persistance et l'effacement RGPD : les 21 journées ne se relisent que par `execute_sql`. Le chemin de calibration de `LOT-05` est donc manuel, et c'est une dette de ce lot-ci, pas du suivant.
  - **Rien ne mesure l'allumage côté dépôt.** Aucun test ni garde CI ne constate la position de la variable ; la variable non sensible se relit au panneau Vercel, ce qui suffit à séparer « non posée » de « redéploiement non fait », mais aucun signal ne remonte au dépôt.
  - **Éteindre referme les assignations mais n'efface pas les journées notées**, le modèle étant append-only ([[D-015]]). Un pilote lancé laisse une trace en base après extinction ; c'est voulu, et cela doit être su avant de le lancer.
  - **Le contrôle SQL du recueil cesse d'être vacu.** Les assertions données de `web/prisma/checks/agenda_alimentaire_v1.sql` rendent 0 ligne **par vacuité** tant qu'aucune journée n'existe et ne prouvent alors rien ([[D-015]]). Le pilote est l'événement qui les rend exigibles : le runbook les rejoue, sans quoi ce recueil serait le premier à n'être vérifié par personne.
- Référence : [../web/src/lib/agenda-alimentaire/featureFlag.ts](../web/src/lib/agenda-alimentaire/featureFlag.ts), [../web/src/lib/agenda-alimentaire/portail.ts](../web/src/lib/agenda-alimentaire/portail.ts), [../web/src/lib/questionnaires-catalog.ts](../web/src/lib/questionnaires-catalog.ts), [../web/src/lib/questionnaires/alimentaire.ts](../web/src/lib/questionnaires/alimentaire.ts), [claude/campagnes/2026-08-04-agenda-alimentaire/RUNBOOK-allumage-drapeau.md](claude/campagnes/2026-08-04-agenda-alimentaire/RUNBOOK-allumage-drapeau.md), [[D-015]], [[D-022]], [[D-023]]

### D-024 — Un plancher allume une règle quand il ne reste plus une seule issue hors de sa zone

- Date : 2026-08-05
- Statut : accepté (fille de [[D-021]], ferme sa première réserve — et avec elle la seconde moitié de [[D-020]])
- Domaine : clinique et scoring
- Décision : sur un recueil **partiel**, une règle d'orientation de type `zone` s'allume sur le `bandePlancher` de [[D-021]] **si et seulement si toutes les bandes que le score final peut encore atteindre sont dans la zone visée** — `∀ r ∈ ranges, r.min ≥ plancher.min ⇒ r ∈ zone`. Quatre règles publiées entrent dans ce cas et **aucune autre** : `R-GAS-01`, `R-SOM-01`, `R-STR-01`, `R-STR-02`.
- Ce qui la fonde : [[D-021]] a rendu la sévérité déjà acquise **lisible** sans la rendre **agissable** — sa propre réserve le disait, « le vrai positif est raconté, pas agi ». Un plancher est une borne inférieure ; une règle demande « warning ou pire », c'est-à-dire un **prédicat**. La fermeture est ce qui convertit l'un en l'autre, et elle le fait sans jamais comparer deux couleurs entre elles : une zone qui ne couvre pas toute la fermeture reste éteinte **par inclusion échouée**, pas par une règle « ne pas viser vers le bas » qu'il aurait fallu écrire et maintenir.
- **Le plancher n'entre pas par la porte de la mesure.** `extraireCible` rend un **troisième champ**, `plancher` ; `valeur` et `interpretation` restent `null`, et les deux gardes de complétude (`recueilIncomplet` au niveau global **et** par axe) ne sont pas touchées. C'est ce qui rend l'immunité des règles `type:'comparaison'` **prouvée par construction** plutôt que vérifiée par relecture : `Q_MOD_01` est une échelle inversée testée en `<=`, où un plancher serait exactement le faux positif que la garde existe pour empêcher. Marquer `interpretation` d'un drapeau `garanti` aurait rendu le défaut **fail-open** — tout chemin qui lit une interprétation se serait remis à voir une bande.
- **La fermeture est dérivée de la grille, jamais d'un ordre de couleurs.** `couleursPossibles` / `labelsPossibles` sont calculés là où `ranges` se trouve déjà (`bandePlancher`), par `min` et non par index — plusieurs grilles sont rédigées en `min` décroissant, et déduire la sévérité des couleurs est faux sur quatre instruments (voir [[D-021]]). Aucune table `RANG_COULEUR` n'existe : c'est l'allowlist **dérivée du mapping** des PR #546/#552, appliquée au grain de la bande.
- Conséquences :
  - **Une fermeture incomplète n'est pas une fermeture.** Si une seule bande atteignable n'a pas de couleur exploitable — ou pas de `min` comparable —, la liste n'est **pas servie du tout** et la règle reste éteinte. Une première rédaction filtrait ces bandes *hors* de la liste, ce qui **rétrécissait** la fermeture et rendait l'inclusion plus facile : l'exact inverse du fail-closed revendiqué. Trouvé en revue adversariale, latent sur le catalogue actuel, et corrigé aux **deux** portes (couleur absente, `min` non numérique).
  - **Une zone `plage` n'est jamais garantie.** Un plancher borne par le bas ; une plage exige aussi une borne haute que les items sans réponse peuvent franchir. Aucune des quatre règles n'en utilise ; la branche `interpretation`, elle, est implémentée symétriquement, ce qui **épingle par un banc** l'extinction de `R2-ALI-01` (grille inversée, non éligible) au lieu de la laisser à l'absence de code.
  - **Le motif praticien dit les deux choses que le plancher est** : une garantie basse (« au moins »), et une garantie tirée d'un recueil incomplet — avec son **dénominateur**, « 23 items sans réponse **sur 31** ». Sans la mention, `R-STR-02` afficherait un pack burn-out justifié par un libellé qui commence par « Adaptation satisfaisante » — le libellé est préexistant, mais « au moins » le rend **plus** trompeur, pas moins. Sans le dénominateur, le praticien ne peut pas décider entre relancer le patient et proposer le pack : « 23 » et « 23 sur 31 » ne se lisent pas pareil.
  - **Aucune conduite ne sort par cette porte.** Un pack d'orientation est un pack d'**exploration**, rien n'est auto-assigné, et le `protocol` amputé par [[D-021]] est un autre objet. Une garde balaie la **vraie** table publiée et vérifie qu'aucun texte de conduite du catalogue n'apparaît dans les motifs.
- **Trois arbitrages rendus en session, et assumés comme tels** :
  1. **On allume dès le plancher le plus faible que la grille autorise** — `R-GAS-01` propose le pack digestif sur 8 items /31, `R-STR-02` sur 5 /10. Le motif : la sévérité est *acquise*, pas probable, et l'exploration est réversible. C'est un arbitrage clinique, pas un détail d'implémentation ; il se renverse en exigeant que la fermeture soit la bande la plus sévère.
  2. **La zone de `R-SOM-01` reste inchangée** — elle s'allume donc sur un plancher `info` (PSQI 5-10, ~8 items /18). La resserrer modifierait un **objet** de la table, donc son empreinte, donc exigerait une re-signature, et changerait aussi le comportement sur passation **complète**.
  3. **Avenant daté, pas re-signature.** `ORIENTATION_RULES_SHA256` est inchangé (`528004de…`) et il **doit** l'être : aucune donnée de règle n'a bougé. Ce qui a changé est le **moteur qui lit la table**, pas ce que le praticien a signé le 2026-08-04. L'en-tête de la table porte l'avenant daté, parce qu'il affirmait le contraire — « `R-SOM-01` ne peut plus s'allumer sur un instrument à moitié rempli » — et qu'un relecteur y lisait l'inverse du comportement.
- Réserves :
  - **L'audit ne distingue pas les deux comportements.** `orientationVersion` et `orientationSha256`, persistés avec chaque synthèse, couvrent désormais **deux comportements décisionnels pour les mêmes entrées** : une synthèse d'avant et une d'après ce lot sont indiscernables. Le corriger demande de versionner le **moteur** à côté de la table — autre lot.
  - **La divergence du même message change de sens au lieu de disparaître.** `api/praticien/synthese` concatène un bloc `scores` **gelé** à la soumission ([[D-019]]) et un bloc d'orientation **recalculé**. [[D-021]] décrivait « scores parle, orientation muette » ; désormais l'orientation peut proposer sur un plancher que le bloc gelé ne porte pas. La consigne de synthèse en couvre un sens (`synthese-v16`), pas l'autre.
  - **Un trou de grille atteignable ferait mentir la fermeture.** Le prédicat ignore un troisième état : un score atteignable qui ne décroche **aucune** bande. La règle s'allumerait alors sur le partiel et s'éteindrait une fois la passation complétée. `Q_NEU_02` est le seul éligible à trous (7 et 19), et ses items étant cotés `{0,2,4,6}` les totaux sont toujours pairs : les deux trous sont **inatteignables**, et aucune règle publiée ne le vise. À rouvrir le jour où une grille à trou atteignable devient éligible.
  - **La propriété ne visite pas tout le catalogue** : 17 instruments éligibles sur 23. Cinq sortent faute de bande intermédiaire, et `Q_STR_08` faute de sous-ensemble produisant un plancher chez le générateur — ce qui est une limite du **générateur**, levable, et non une propriété de l'instrument. Les deux portes de sortie sont désormais **déclarées** ; un instrument qui sortirait par une porte non déclarée fait rougir.
  - **L'angle mort d'axe de [[D-021]] subsiste** : huit réponses maximales concentrées sur un seul axe du TFD ne produisent aucun plancher de racine (`totalGlobalDepuisSousScores` rend `null`). Le chemin plancher par **sous-score** est en revanche vivant et couvert — il ne l'était par aucun test avant la revue. Quand le plancher est un plancher d'axe, le compte affiché est celui de **l'axe** (4 sur 8), pas de l'instrument (23 sur 31) — servir 23 sur une ligne préfixée `(C1)` dirait un axe six fois plus troué qu'il ne l'est. Réserve à connaître : le dénominateur d'axe vient d'`items`, qui **exclut les questions écartées par un conditionnel**. Deux patients peuvent donc lire « sur 8 » et « sur 6 » pour le même axe. C'est le nombre honnête — ce qui était applicable à ce patient-là — mais ce n'est pas une constante d'instrument, et un praticien qui compare deux dossiers pourrait le croire.
  - **« Aucun plancher ne transporte de conduite » est vrai de `protocol`, pas de `detail`.** [[D-021]] ampute `protocol` ; `detail` reste servi, et celui de la bande `warning` du PSS-10 se termine par « stratégies de gestion du stress conseillées », c'est-à-dire une quasi-conduite. Elle **n'atteint pas** le motif d'orientation — seuls `label`, `color` et les fermetures y sont lus, et une garde le vérifie sur la table publiée — mais elle voyage dans `scoresJson` jusqu'au prompt de synthèse. Comportement antérieur à ce lot ; le fermer changerait ce que `bandePlancher` sert à **tous** ses consommateurs, donc autre arbitrage.
  - **Portée mesurée et NULLE sur l'existant** — lecture `execute_sql` du 2026-08-05 : sur les trois instruments porteurs de ces quatre règles, **10 passations, aucune partielle**, aucun `bandePlancher` en base. Le lot est **prospectif** ; il ne réinterprète aucun dossier vivant.
  - **La classe reste ouverte** sur `sum_decimal`, `count_threshold`, `ecab` et `bms_average`, et sur le moteur `subscore` (écart délibéré de [[D-020]]) : aucune règle publiée ne les vise.
- Référence : [web/src/lib/clinical/orientationEngine.ts](web/src/lib/clinical/orientationEngine.ts), [web/src/lib/clinical/plancherOrientation.guard.test.ts](web/src/lib/clinical/plancherOrientation.guard.test.ts), [web/src/lib/clinical/orientationRulesV1.ts](web/src/lib/clinical/orientationRulesV1.ts), [web/src/lib/questions.ts](web/src/lib/questions.ts), [web/src/lib/anthropic.ts](web/src/lib/anthropic.ts), [[D-019]], [[D-020]], [[D-021]]

### D-023 — Une fenêtre s'ancre sur ce qui est enregistré, pas sur ce qui est relisible ; et un état terminal se dit avant tout geste à poser

- Date : 2026-08-05
- Statut : accepté (lot LOT-04 de l'agenda alimentaire — portail patient et surface de saisie)
- Domaine : clinique (fenêtre de recueil), autorisation et chemins d'écriture patient
- Décision : cinq arbitrages rendus ensemble, tous **rendus exigibles par l'arrivée de l'écran** — trois sur la fenêtre de recueil, deux sur l'ordre des refus.
  1. **L'ancre des 21 jours se calcule sur l'union des dates enregistrées — relues ou non.** `calculerFenetreAliDepuisDates` prend un troisième paramètre optionnel `{ datesIllisibles }` et ancre sur `min(dates ∪ datesIllisibles)`, filtré par `estDateValide`. La quarantaine porte sur le JSONB `reponses`, **jamais** sur la colonne `date_jour` : la date d'une ligne qu'on ne sait pas relire reste connue, sans requête supplémentaire. En face, l'union ne touche **ni** `renseignee` **ni** `nbRenseignees` — une journée en quarantaine n'est pas une journée relue, et la compter ferait franchir les seuils d'exploitabilité sur du vide. `EmplacementFenetreAli` gagne un drapeau `illisible`, **additif et non exclusif** de `renseignee` : le modèle étant append-only, une même date peut porter une tête de chaîne relue *et* une ligne illisible ; un enum aurait forcé un choix faux dans les deux sens.
  2. **Une quarantaine ne bloque une date que tant qu'une ligne illisible peut en être la vraie tête de chaîne.** [[D-015]] refusait toute écriture sur une date portant une ligne illisible. C'était trop large : quand la tête active est relue, on peut chaîner et constater le doublon — bloquer punissait le patient sans rien protéger. Mais l'ouvrir sur la seule présence d'une tête relue serait trop étroit, cette tête étant calculée sur le **sous-ensemble lisible** : si la vraie tête est la ligne en quarantaine et qu'une supplantée est relue, la correction se chaînerait sur une ligne déjà supplantée, et la date porterait **deux têtes concurrentes** le jour où la quarantaine se lève. La règle retenue tranche par `soumisLe` — le critère que `resolveJoursActifs` emploie déjà pour départager, de sorte que règle de blocage et règle de résolution parlent la même langue — et elle est **fail-closed** : égalité d'horodatage ou horodatage inexploitable bloquent. La ligne de journal d'intégrité et le compte `illisibles`, eux, continuent de porter sur l'ensemble **complet** : une ligne supplantée illisible reste un événement d'intégrité, qu'on bloque ou non.
  3. **La borne des 21 jours est une borne SUPÉRIEURE, et elle seule.** [[D-022]] la motive par « une 22ᵉ case n'existe jamais » : c'est la fin de fenêtre qui est en jeu. Une première rédaction bornait des deux côtés, avec un effet non voulu — agenda vide, le patient note aujourd'hui, l'ancre vaut J, et noter la veille devenait impossible : un jour de recueil perdu au démarrage, refusé par un message affirmant que le recueil couvrait déjà 21 jours alors qu'il en couvrait une. Une date antérieure à l'ancre **recule l'ancre** et est acceptée. **Ce recul n'est pas le glissement corrigé au point 1** : celui-là était silencieux, vers l'avant et subi ; celui-ci est explicite, vers l'arrière et voulu par le patient. Le nombre de dates distinctes reste borné par 21, `estDateSaisissable` ne laissant écrire qu'aujourd'hui ou la veille : l'ancre ne peut reculer que d'un jour, et seulement au démarrage.
  4. **La date limite se dit avant le consentement, sur le seul chemin d'écriture.** `authorizeAgendaAlimentairePortail` prend un troisième paramètre `{ verifierDateLimite: true }`, posé par le **seul POST**, qui insère un refus `410 expired` **entre** `suiviClotureLe` (410) et `consentement_absent` (403). Le contrôle qui vivait dans la route est **supprimé**, pas dupliqué. Le `GET` reste à deux arguments : un agenda périmé demeure **lisible**, le patient doit pouvoir relire ses 21 jours.
  5. **Une exemption ne vaut que si TOUTES les portes du parcours la connaissent — et c'est la première qui décide de ce que les suivantes verront jamais.** L'exemption `statutReponses = 'deverrouille'` a été ajoutée à `api/patient/consentement/route.ts`, où elle manquait. Cela n'a d'abord **rien rouvert** : `api/patient/questionnaire/route.ts` — la route que l'écran appelle en premier — refusait en `410` sans exempter `deverrouille`, si bien que le `ConsentScreen` n'était jamais rendu et que la route de consentement restait **inatteignable depuis l'interface**. Il y a quatre portes sur ce parcours (`patient/questionnaire`, `patient/consentement`, `patient/submit`, agenda) ; en aligner trois et laisser fermée celle qui s'ouvre d'abord revient à n'en aligner aucune. Les quatre le sont désormais. Corollaire posé pour la suite : **l'écran ne décide plus lui-même de l'expiration** — la route rend un verdict booléen calculé côté serveur, et les deux écrans porteurs du `ConsentScreen` le consomment.
- Conséquences : les trois réserves visées de [[D-015]] et [[D-022]] sont closes. **Le report de la première n'était plus tenable** : [[D-022]] la différait « faute d'un écran qui rendrait le glissement visible », et ce lot livre précisément cet écran — l'argument du report tombait avec lui. Le défaut cessait par ailleurs d'être cosmétique le jour où la borne des 21 jours s'appuyait sur l'ancre : une date que le serveur refusait la veille redevenait acceptable. Les tests qui gardent ces correctifs ont été **falsifiés avant d'être crus** — chacun retiré pour de bon, le rouge constaté, puis remis : l'union neutralisée fait tomber cinq tests dont celui de l'ancre, qui rend `201` là où il attend `409` ; le départage par `soumisLe` retiré en fait tomber trois. Un garde vert qui n'a pas mordu ne prouve rien. Sur le point 4, la suppression du contrôle de route n'est pas un rangement : deux porteurs de la même exemption devant rester d'accord, dont l'un devient inatteignable, c'est un test qui ne s'exécute plus et une dérive silencieuse à la première édition. **Deux élargissements sont assumés** : `expired` (410) précède désormais `locked` (409) — les deux sont vrais et terminaux, et c'est la règle générale de [[D-015]] point 4 ; et le garde d'écran qui refuse d'afficher le `ConsentScreen` quand le serveur juge le consentement impossible vaut pour **tous** les questionnaires et sur **les deux** écrans qui le portent, non pour le seul agenda — le défaut y est identique et le correctif le même. Un troisième constat, plus large que ce lot, est consigné sans être traité : **la règle « un refus qui nomme un geste doit nommer un geste possible » vaut aussi pour ce qu'on PROPOSE**, pas seulement pour ce qu'on refuse. Elle a rattrapé quatre promesses de ce lot — un `ConsentScreen` inutile, un CTA de clôture sans route, un badge de hub nommant le même geste, et un message de refus annonçant des corrections impossibles.
- Réserves :
  - **La correction resserre le recueil, et c'est son effet clinique le plus net.** Une quarantaine sur le premier jour offrait tacitement 21 jours de plus ; désormais elle occupe l'emplacement 1. Quand **aucune** ligne relue ne porte cette date, la journée est **définitivement perdue** — le POST la refuse (`409 agenda_illisible`), aucun chaînage n'est possible sur une ligne illisible, et **aucun geste de sortie n'existe** hors effacement RGPD du dossier entier. L'arbitrage est de préférer un recueil court et daté juste à un recueil long et mal daté.
  - **`soumisLe` estime là où `supersedesJourId` trancherait.** Ce dernier est lui aussi une colonne, lui aussi sélectionné, et lui aussi jeté dans le `catch` de `listJours`. Il donnerait une certitude — si la ligne en quarantaine déclare supplanter la tête relue, elle **est** la vraie tête ; si c'est l'inverse, il n'y a aucun doute à fermer. Le critère d'horodatage retenu est plus grossier **dans les deux sens**, et il surbloque à l'égalité (deux écritures dans la même milliseconde) comme sur un horodatage inexploitable. L'erreur est toujours dans le sens fermé, donc sans risque pour la donnée — mais c'est un refus opposé au patient sans geste de sortie. À affiner par le lot qui touchera `persistence.ts`.
  - **La correction reste bornée à J et J-1** par `estDateSaisissable`, hérité de L4a. Une journée fausse à J-5, dans la fenêtre et parfaitement lisible, n'est corrigible par aucun chemin. L'écran est cohérent avec le serveur — la frise n'offre aucun clic par journée — mais la capacité manque, et c'est le prochain manque visible du recueil.
  - **La borne ne ferme rien d'observable.** Passé `dateDebut + 20`, `statutReponses` reste `non_rempli` : le praticien voit une assignation ouverte que le serveur refuse d'alimenter, sans trace au dossier. Le seul signal est `metadata.motif = 'hors_fenetre_21j'` dans le journal. À reprendre par le lot qui livrera la clôture patient.
  - **L'ancre décide désormais d'un refus d'écriture, et non plus seulement d'un affichage.** La réserve de concurrence de [[D-015]] — deux premiers POST simultanés lisent tous deux un agenda vide, sans transaction ni index unique, ce dernier interdit par le modèle append-only — prend donc un effet nouveau. Fenêtre courte, cas du double-clic, non corrigé.
  - **`nbRenseignees` diverge entre le hub et la route agenda.** Le hub ne parse jamais le JSONB : il compte les dates en quarantaine, la route non. Écart **pré-existant**, que ce lot réduit en supprimant la divergence d'ancre, et qu'il ne peut pas fermer sans faire lire le JSONB au hub — ce qui est exclu. Pour la même raison, le champ servi au hub s'appelle `journeeDuJourEnregistree` et non « notée » : il mesure « une ligne existe pour aujourd'hui », lisible ou non.
  - **`cloturablePatient` s'ouvre plus tôt** qu'avant, l'ancre ne glissant plus. Sans conséquence tant que la clôture patient n'existe pas ; à reprendre au lot qui la livrera.
  - **L'impasse fermée sur le POST l'est à l'écran par un second geste, pas par le même.** La barrière n'est posée que par le chemin d'écriture ; c'est le garde d'affichage qui empêche de proposer un consentement impossible. Deux mécanismes pour une même règle, à tenir d'accord.
- Référence : [../web/src/lib/agenda-alimentaire/fenetre.ts](../web/src/lib/agenda-alimentaire/fenetre.ts), [../web/src/lib/agenda-alimentaire/portail.ts](../web/src/lib/agenda-alimentaire/portail.ts), [../web/src/app/api/portail/agenda-alimentaire/route.ts](../web/src/app/api/portail/agenda-alimentaire/route.ts), [../web/src/app/api/patient/consentement/route.ts](../web/src/app/api/patient/consentement/route.ts), [[D-015]], [[D-022]]

### D-022 — L'agenda alimentaire se borne par la date, et son drapeau ne s'allume qu'une fois la surface écrite

- Date : 2026-08-04
- Statut : accepté (arbitrages praticien en session, avant le lot L4b de l'agenda alimentaire)
- Domaine : clinique (fenêtre de recueil) et exploitation (position du drapeau)
- Décision : deux réserves de [[D-015]] tranchées ensemble, **avant** d'écrire la surface de saisie.
  1. **La borne des 21 jours se pose sur la date, pas sur l'état.** Le POST refuse toute `dateJour` hors de `[dateDebut, dateDebut + 20]`, où `dateDebut` est le **premier jour saisi** — l'ancre que la fenêtre d'affichage utilise déjà (`web/src/lib/agenda-alimentaire/fenetre.ts:2`). Une 22ᵉ case n'existe donc jamais, et l'écriture cesse de pouvoir déborder la fenêtre qu'elle alimente. Les **corrections** d'une journée déjà notée restent ouvertes tant que le recueil n'est pas clôturé. L'autre branche — fermer sur `cloturablePatient` — est écartée : ce booléen devient vrai dès `offset >= 20` (`fenetre.ts:76`), c'est-à-dire dès que la 21ᵉ case est **atteinte**, jamais qu'elle est **remplie**. Un patient qui note J21 puis veut corriger J19 y serait bloqué, et un recueil troué se fermerait sur ses trous.
  2. **`WN_AGENDA_ALI` sera posé à `true` sur Development et Preview, et sur elles seules — après l'écriture de la surface, pas avant.** Constat du 2026-08-04 : le drapeau ne figure dans **aucune** des 53 variables d'environnement du projet Vercel `wellneuro-app`, ni Development, ni Preview, ni Production ; le lecteur étant *fail-closed* (`value === 'true'`, `featureFlag.ts:36`), l'instrument est fermé partout et l'a toujours été. La production le confirme en sens inverse : `agenda_alimentaire_jours` compte **0 ligne et 0 assignation** (lecture `execute_sql` du 2026-08-04). L'**ordre** est la partie qui décide : `IDS_SUSPENDUS` étant dérivé du drapeau, l'allumer ouvre **aussi** la bibliothèque praticien — `Q_ALI_09` deviendrait assignable depuis des previews qui écrivent dans la base de **production**, sans qu'aucun écran ne le consomme.
- Conséquences : la borne est de **portée nulle sur l'existant** — il n'y a rien à rattraper, et c'est exactement la fenêtre où la poser coûte le moins. Elle vit dans le chemin d'écriture et **nulle part ailleurs** : aucune contrainte en base, que `web/prisma/checks/agenda_alimentaire_v1.sql` interdit délibérément (modèle append-only, [[D-015]]). Les deux réserves de [[D-015]] visées ici sont closes, la seconde dans le sens rassurant. **La position `true` en Preview a un prix assumé** : les environnements non-production partagent la base de production, donc une assignation créée depuis une preview y atterrit. C'est le régime déjà en vigueur pour `WN_C4_ENABLED` et `WN_ALI_01_SIIN57`, posés sur les trois environnements.
- Réserves :
  - **La borne se déplace avec l'ancre.** La réserve « la frise se ré-ancre en silence » de [[D-015]] cesse d'être cosmétique : si la journée la plus ancienne tombe en quarantaine, `min(dates)` glisse, `dateDebut + 20` glisse avec lui, et une date que le serveur refusait hier devient acceptable. La borne ne crée pas ce défaut — elle lui donne un effet sur l'**écriture** là où il n'en avait que sur l'affichage. À exercer explicitement en test ; non corrigé ici, faute d'un écran qui rendrait le glissement visible.
  - **Rien ne double la borne.** Aucune contrainte de base ne la vérifie, par conception. Un chemin d'écriture futur qui l'oublierait — vue praticien, import, reprise — écrirait une 22ᵉ journée sans que rien ne morde. Le seul garde est le test.
  - **`dateDebut` n'existe pas tant qu'aucune journée n'est notée.** Le premier POST d'un agenda vide pose l'ancre et passe toujours : la borne ne dit donc rien de la date de **départ** du recueil, seulement de son étendue. Un patient qui commence trois semaines après l'assignation obtient 21 jours pleins à compter de ce jour-là. Assumé — l'alternative, ancrer sur la date d'assignation, punirait le retard au démarrage en tronquant le recueil.
  - **Allumer le drapeau reste un geste en deux temps** : poser la variable **puis** redéployer, jamais l'un sans l'autre ([[D-015]]).
- Référence : [../web/src/lib/agenda-alimentaire/fenetre.ts](../web/src/lib/agenda-alimentaire/fenetre.ts), [../web/src/lib/agenda-alimentaire/featureFlag.ts](../web/src/lib/agenda-alimentaire/featureFlag.ts), [../web/src/app/api/portail/agenda-alimentaire/route.ts](../web/src/app/api/portail/agenda-alimentaire/route.ts), [[D-015]]
### D-021 — Une sévérité déjà acquise se sert comme PLANCHER, jamais comme mesure

- Date : 2026-08-05
- Statut : accepté (fille de [[D-014]], ferme *partiellement* la deuxième réserve de [[D-020]])
- Domaine : clinique et scoring
- Décision : sur un recueil **partiel**, quand les réponses déjà recueillies suffisent à elles seules à décrocher une bande **autre que la plus basse**, cette bande est servie dans un champ **distinct** — `bandePlancher` —, `interpretation` restant `null`. Elle se dit « **au moins** cette bande », et jamais autrement. Trois moteurs la servent : `sum`, `psqi`, `tfd` (à la racine **et** par axe).
- Ce qui la fonde : [[D-014]] justifiait le retrait des bandes par une asymétrie — « l'erreur est à sens unique : sous-classement, jamais sur-classement ». Si l'erreur ne peut aller que vers le bas, la bande d'un partiel est une **borne inférieure** de la bande finale. La retirer éteignait donc, avec le faux négatif visé, les vrais positifs **déjà acquis**. Cas chiffré : les items du TFD sont cotés 0 à 3 et sa bande B s'ouvre à 24 — **huit réponses au maximum suffisent**, et les vingt-trois restantes ne peuvent qu'ajouter.
- **Deux conditions, déclarées et jamais déduites.** L'éligibilité est portée par l'instrument (`scoring.severiteCroissante`), le défaut restant l'absence de plancher :
  1. **Monotonie** — répondre ne peut jamais faire baisser le total. Elle n'était **pas vraie** avant ce lot : sur le PSQI, `ITEMS_C2 = ['Q2','Q5a']` sous la frontière « au moins un item », si bien que `Q5a` seul renseigné faisait calculer `C2` avec un `Q2` absent, dont le défaut valait trente minutes (`lat = 1`) là où la vraie réponse à dix minutes rend `lat = 0`. Le défaut passe à `0`. C'était le **seul** défaut atteignable du moteur — les trois autres (`Q1`, `Q3`, `Q4`) ne le sont pas, `C4` exigeant ses trois items et le total tombant sans eux.
  2. **Sens de la grille** — la sévérité doit croître avec le score. **Quatre** instruments `sum` vont dans l'autre sens (`Q_TAB_01`, `Q_ALI_01`, `Q_ALI_02`, `Q_GEO_04`) : un plancher de *score* y serait un plafond de *sévérité*, c'est-à-dire le faux positif rassurant de [[D-014]] en pire. Le sens ne se lit ni dans l'ordre d'écriture des bandes ni dans leurs couleurs — plusieurs grilles sont rédigées en `min` décroissant. **21 instruments `sum` déclarés éligibles**, plus `Q_SOM_01` et `Q_GAS_01`.
- Conséquences :
  - **Un plancher ne transporte aucune conduite à tenir.** `separerConduite` — l'entonnoir unique par lequel passent les dix-sept moteurs — sort immédiatement quand `interpretation` vaut `null`, donc précisément sur le recueil partiel. Un `{...bande}` nu ouvrait une **seconde porte non filtrée** : cinq instruments éligibles (`Q_NEU_02`, `Q_GEO_03`, `Q_CAR_01`, `Q_SOM_04`, `Q_GEO_02`) déclarent un `protocol` sur leur bande la plus sévère, et « Orientation psychiatrique urgente » serait parti dans `scoresJson` sous une clé que rien ne rend. `protocol` est **retiré** du plancher, pas redirigé : servir une conduite sur un instrument incomplet est un autre arbitrage. Trouvé en revue adversariale ; invisible de `conduite.guard.test.ts`, qui ne saturait que des passations **complètes** — une garde qui ne visite jamais l'état où le défaut existe est verte pour une mauvaise raison. Elle visite désormais aussi un recueil partiel.
  - **La consigne de synthèse le décrit** (`synthese-v15`), dans une section de **niveau racine** : le champ est servi à la racine des 23 instruments, et une première rédaction l'avait posé dans la liste réservée aux `subScores`.
  - **Le champ est ABSENT quand il n'y a pas de plancher**, jamais servi à `null` — sans quoi il serait parti au modèle sur les vingt-six instruments `sum`.
- Réserves :
  - **`R-GAS-01` n'est PAS rallumée.** C'était l'intention écrite de la réserve de [[D-020]] ; ce lot sert le plancher mais **ne touche pas** `orientationEngine.ts`, qui écarte toujours sur `missing > 0`. La réserve n'est donc close qu'à moitié : le vrai positif est **raconté** (note, synthèse), pas **agi**. Conséquence à connaître : `api/praticien/synthese` peut concaténer dans le même message un bloc `scores` disant « au moins B » et un bloc d'orientation **muet** sur le même appareil. Lot à part, nommé pour ne pas passer pour un oubli.
  - **Aucune surface praticien dédiée.** Le plancher de racine atteint la fiche par la **note** (`text-xs`, sous le titre), pendant que la colonne « Interprétation » affiche `—`. Le plancher d'**axe** du TFD, lui, n'atteint que le modèle de synthèse : aucun composant ne le lit. L'IA en sait donc momentanément plus que la fiche déterministe. Arbitrage d'affichage à rendre, hors périmètre de ce lot.
  - **Portée mesurée et NULLE sur l'existant** — lecture `execute_sql` du 2026-08-05 : **aucune** des 100 passations en base n'est partielle, et les trois PSQI réels sont complets à 18/18 avec `Q2` renseigné. Le changement de défaut ne réinterprète donc rien, et le score étant gelé à la soumission ([[D-019]]), aucun dossier vivant ne gagne de plancher. Le lot est **prospectif**.
  - **La classe reste ouverte** sur `sum_decimal`, `count_threshold`, `ecab` et `bms_average`, inchangés depuis [[D-014]] : aucune règle publiée ne les vise.
  - **Ce que le plancher n'atteint pas** : `totalGlobalDepuisSousScores` rend `null` dès qu'un axe est entièrement vide, et un plancher se lit sur un nombre. Huit réponses maximales **concentrées sur un seul axe** du TFD ne produisent donc aucun plancher, alors qu'elles en fondent un. Le servir demanderait de calculer le plancher **sans** passer par le total global.
- Référence : [web/src/lib/questions.ts](web/src/lib/questions.ts), [web/src/lib/plancherGaranti.guard.test.ts](web/src/lib/plancherGaranti.guard.test.ts), [web/src/lib/monotonieMoteurs.guard.test.ts](web/src/lib/monotonieMoteurs.guard.test.ts), [web/src/lib/eligibilitePlancher.guard.test.ts](web/src/lib/eligibilitePlancher.guard.test.ts), [web/src/lib/anthropic.ts](web/src/lib/anthropic.ts), [[D-014]], [[D-019]], [[D-020]]

### D-020 — La bande d'un AXE se lit sur l'axe complet, et son retrait a un coût dans les deux sens

- Date : 2026-08-04
- Statut : accepté (arbitrage praticien en session, fille de [[D-014]])
- Domaine : clinique et scoring
- Décision : sur le moteur `tfd` (`Q_GAS_01`), un axe partiellement répondu **garde son total** et **perd sa bande**. [[D-014]] posait la frontière « tous les items » au grain de l'**instrument** ; elle vaut ici aussi au grain de l'**axe**, parce que les bandes d'axe du TFD sont calibrées sur l'axe complet (`C1` lit « Absence » de 0 à 7 sur ses huit items) et sont **affichées sur la fiche praticien**. Le moteur publie `missing`/`repondus` à la racine et `repondus`/`items` par axe.
- Conséquences : **écart délibéré au moteur `subscore`**, qui rend la complétude seulement *lisible* et conserve ses bandes d'axe. Le motif de l'écart est une propriété de la **grille du TFD**, et non une différence d'affichage entre moteurs — une première rédaction affirmait le contraire (« aucun instrument `subscore` ne publie de bande d'axe affichée »), et c'était faux : mesuré sur le catalogue résolu, `subscore` sert **8** instruments dont **4 publient des bandes d'axe** (`Q_STR_04`, `Q_INF_03`, `Q_URO_01`, `Q_MOD_01`), affichées par le **même composant et la même ligne** que celles du TFD (`FichePatientPanel.tsx`). Le motif réel est celui écrit dans `questions.ts` : les bandes d'axe du TFD sont **calibrées sur l'axe complet** — `C1` lit « Absence » de 0 à 7 sur ses huit items —, si bien qu'un axe partiel y décroche une étiquette que sa grille n'a jamais définie pour lui. Aligner `subscore` par réflexe serait un autre lot, et un autre arbitrage. Le TFD était le **dernier moteur de la classe atteignable par une règle d'orientation publiée** ; sa fermeture ne clôt pas la classe (voir Réserves).
- Réserves :
  - **L'effet sur « Mon équilibre » va dans les DEUX sens**, et une première rédaction du lot n'en écrivait qu'un — relevé en revue adversariale. `Q_GAS_01` alimente le besoin 4 en `inverser: true` (`max: 93`). Un TFD partiel et **bas** rendait une couverture faussement haute : la garde la fait BAISSER, c'est la correction. Mais au-delà de `total ≥ 62`, la couverture passe sous `SEUIL_EFFONDREMENT` (0,34) et le besoin 4 est une **fondation critique**, ce qui plafonne le score global à 50 ; le rendre non mesuré **lève ce plafond** et le score global REMONTE. Trente items sur trente-et-un, tous au maximum, sont dans ce cas.
  - **Le retrait de bande éteint aussi de vrais positifs.** `R-GAS-01` ne s'allume plus sur un TFD partiel dont le total atteint déjà la bande B (24), ce que huit réponses cotées 3 suffisent à produire. Or les items de `O_TFD` sont cotés 0 à 3 : un item non répondu ne peut qu'**ajouter**, donc la sévérité d'un partiel qui atteint B est **acquise, pas probable**. La règle demande « warning ou pire » — un prédicat que cette monotonie tranche —, mais le moteur lui passe une **étiquette de bande**, pas un prédicat. Le dépôt sait écrire cette asymétrie (`seuilMonotone`, `questions.ts`) ; l'appliquer aux bandes demanderait de servir un **plancher garanti** à côté de la bande, ce qui touche tous les moteurs à recueil partiel. **Lot à part, non fait ici, et nommé pour ne pas passer pour un oubli.**
  - **Portée mesurée et nulle sur l'existant** : la production ne porte que **2 passations `Q_GAS_01`, toutes deux complètes (31/31)** — lecture `execute_sql` du 2026-08-04. Aucun dossier vivant n'est dans l'une ou l'autre branche ci-dessus.
  - **La classe reste ouverte** sur `sum_decimal`, `count_threshold` et `ecab`, inchangés depuis [[D-014]]. Ce qui les distingue n'est pas d'être protégés : c'est qu'aucune règle publiée ne les vise.
  - Défaut voisin fermé au passage, trouvé par la même revue : `buildMiniSynthese` re-fabriquait la conclusion « Tous les axes explorés sont peu perturbés » dès qu'**une seule** rubrique portait une bande (`some` au lieu de `every`), généralisant donc sur les axes que la garde venait de refuser de lire.
- Référence : [web/src/lib/questions.ts](web/src/lib/questions.ts), [web/src/lib/tfdRecueilPartiel.guard.test.ts](web/src/lib/tfdRecueilPartiel.guard.test.ts), [web/src/lib/scoring/miniSynthese.ts](web/src/lib/scoring/miniSynthese.ts), [[D-014]], [[D-019]]

### D-019 — Une garde de scoring ne protège que l'avenir, tant que son consommateur relit un score gelé

- Date : 2026-08-04
- Statut : accepté (relevé en revue adversariale sur le lot de signature)
- Domaine : clinique, scoring et architecture
- Décision : le moteur d'orientation lit un score **recalculé depuis `rawAnswers`**, jamais le `scoresJson` stocké. Quatre motifs le ramènent à `null` — pas de `rawAnswers`, un `{error}` rendu par `calculateScore`, un instrument non administrable, ou une passation déclarée **non interprétable** par le registre. C'est le **score** qui tombe à `null`, jamais la ligne : « une réponse existe » est un fait administratif qui fonde `dejaRepondu`, « une réponse est cotable » un fait clinique qui fonde les déclencheurs, et les confondre faisait disparaître le badge « déjà renseigné » — pour un pack entier, une seule passation ancienne suffisait.
- Conséquences : `api/patient/submit` calcule le score **une fois** et le persiste. Toute garde de scoring ajoutée ensuite est donc invisible aux passations déjà enregistrées — la garde de recueil partiel du PSQI ne mordait que sur l'avenir, alors que trois documents du même lot affirmaient le trou fermé. C'est la classe de la PR #202 : aucune ligne fautive, un rattrapage absent. Le recalcul à la lecture ferme la **classe** et non le cas — toute garde future s'applique d'office au passé, sans backfill ni migration —, et aligne l'orientation sur « Mon équilibre », qui recalculait déjà. Deux consommateurs cliniques du même score qui ne lisaient pas la même chose étaient en soi un défaut.
- Réserves : mesuré en production le 2026-08-04 — **15 lignes sur 99** n'ont pas de `rawAnswers`, toutes d'une forme antérieure au moteur actuel (ni `type`, ni `total` racine, ni objet `interpretation`), donc **déjà inertes** pour l'orientation. Le comportement servi ne change pas ; ce qui change, c'est qu'il est voulu. Le coût est un recalcul par passation à chaque lecture (99 lignes au plus pour un patient). Les autres consommateurs du score stocké — fiche praticien, synthèse, PDF — **continuent de lire l'instantané** : cette décision ne porte que sur l'orientation. **Et les deux arrivent au modèle dans le même message** : `api/praticien/synthese` construit le bloc `scores` depuis `scoresJson` (gelé) puis appelle `evaluerOrientationPourPatient` (recalculé), et concatène les deux. Un PSQI partiel antérieur au déploiement y figurera donc avec sa bande périmée, à côté d'un bloc d'orientation muet sur le sommeil — ce qui se lit « le moteur n'a rien à dire » et non « cette passation n'est pas cotable ». Le mécanisme qui le dirait (`note`) vit dans le score recalculé, que la fiche ne lit pas. Divergence **assumée et bornée**, à lever le jour où le recalcul sera étendu.
- Référence : [web/src/lib/clinical/orientationService.ts](web/src/lib/clinical/orientationService.ts), [web/src/lib/clinical/orientationService.test.ts](web/src/lib/clinical/orientationService.test.ts), [[D-014]], [[D-016]]

### D-018 — Une signature porte sur un périmètre relu, pas sur un fichier

- Date : 2026-08-04
- Statut : accepté (signature de la table d'orientation, demandée explicitement en session)
- Domaine : clinique, gouvernance et orientation
- Décision : `ORIENTATION_METADATA.claimsSource` énumère **exactement** les claims cités par les règles — ni plus, ni moins —, et un banc pose l'égalité dans les deux sens. **Le `sha256` de la table signée est en outre épinglé sur un littéral** : toute édition d'une règle après signature rougit le CI, et la sortie de secours est de **re-signer** (relire les claims, poser une nouvelle date, puis épingler le nouveau sha) — jamais de mettre le sha à jour en silence. La signature elle-même reste un acte **praticien**, jamais posé d'initiative, et elle **n'allume rien** : `orientationActive()` est un ET avec `WN_ENABLE_ORIENTATION_NNPP2`, pour que l'acte clinique et l'acte d'exploitation aient deux responsables.
- Conséquences : sans ce banc, ajouter une règle citant un claim jamais relu laissait la table « signée » — la signature couvrant alors un périmètre qui n'existait plus, sans qu'aucune ligne de code ne le dise. Le défaut n'est pas hypothétique : la première rédaction de `claimsSource` en portait **24** au lieu de 23, `WN-CL-0178-016` n'apparaissant dans le fichier que dans un commentaire. Le banc l'a attrapé à sa première exécution, sur la liste de celui qui l'écrivait. La version fait partie de l'identité d'un claim : `v1.0` relu ne garantit rien sur `v2.0`, et le banc l'exige des deux côtés.
- Réserves : le banc prouve la **cohérence** entre la table et son périmètre signé, jamais que les claims **existent** — `rag_corpus_claims` vit en base, qu'aucun test unitaire n'ouvre. Un identifiant inventé, cité par une règle et repris dans `claimsSource`, passerait. La lecture `execute_sql` avant signature reste le maillon que l'automatisation ne couvre pas ; elle a été faite le 2026-08-04 sur les 23. Le banc d'égalité seul restait par ailleurs **vert sur trois mutations** relevées en revue — élargir une zone, changer un `packId`, ajouter une règle ne citant que des claims déjà signés : c'est le sha épinglé qui les attrape, et le banc de sha préexistant ne le pouvait pas, comparant `sha256(table)` à une constante définie exactement ainsi.
- Portée (ajoutée le 2026-08-07 par [[D-031]]) : une re-signature atteste qu'un périmètre a été **relu** ; elle n'atteste pas que l'**indication n'a pas été élargie**. Relire 23 claims et poser un nouveau sha ne dit rien des portes des règles voisines — c'est ce que couvre [[D-031]].
- Référence : [web/src/lib/clinical/orientationRulesV1.ts](web/src/lib/clinical/orientationRulesV1.ts), [web/src/lib/clinical/orientationRulesV1.test.ts](web/src/lib/clinical/orientationRulesV1.test.ts), [[D-003]], [[D-016]]
### D-017 — Un artefact partagé se découpe ou se fusionne tout seul ; un garde qui ne peut pas mordre ne garde rien

- Date : 2026-08-04
- Statut : accepté (lot outillage — créneaux partagés et chaîne de skills)
- Domaine : outillage, travail parallèle, gardes CI
- Décision : trois remèdes **différents** pour trois conflits qui se ressemblaient. `docs/claude/SESSION_LOG.md` prend `merge=union` — journal purement append-only, dont la résolution est toujours « garder les deux », donc git la fait seul. Les handoffs passent à **un fichier par lot** sous `docs/claude/handoffs/`, horodatés `AAAA-MM-JJ-HHMM-slug.md`, sur le patron de `changelog.d/` ; `HANDOFF_CURRENT.md` est supprimé et **aucun fichier « courant » n'est généré** — il recréerait le conflit qu'on supprime. `docs/DECISIONS.md` **reste** à créneau unique, mais sa numérotation devient gardée : doublon, trou et désordre bloquent. Et le garde de cross-invocation des skills passe **fail-closed** : toute référence à un skill non invocable est un constat, sauf marqueur `<!-- mention-seule: nom-du-skill -->` qui **nomme sa cible**.
- Conséquences : le coût mesuré qui a motivé le lot — pendant le seul lot précédent, `main` a bougé trois fois, produisant **deux collisions de numéro de décision** (huit renvois renumérotés chacune), **une PR entière** dont l'objet unique était de réparer le handoff après un merge, et **trois handoffs perdus ou déplacés**, aujourd'hui restaurés comme fragments. Le garde de cross-invocation existait, était bloquant en CI et **vert** pendant que **neuf** branchements étaient morts : il exigeait un verbe impératif dans les 90 caractères amont, or les branchements étaient des titres d'étape nominaux. Trois scripts bloquants en CI étaient absents de `npm run check`, et leurs sept bancs aussi — `scripts/parite-check-ci.test.mjs` dérive désormais la liste depuis `ci.yml` et échoue dès qu'une étape bloquante du CI manque à `check`.
- Réserves : `merge=union` n'est éprouvé **qu'en fusion locale** (merge et rebase) ; son honorabilité par un squash côté GitHub n'est pas établie. Le journal est append-only **par convention**, pas par contrainte — `/wn-compact-sessionlog` le réécrit, et une compaction concurrente d'un ajout ferait **ressusciter** silencieusement des entrées compactées ; l'avertissement est en tête de ce skill. Le garde `D-NNN` interdit les trous : un numéro ne se libère jamais, une décision retirée s'archive. Le marqueur nominatif croît de façon monotone (100 mentions déclarées aujourd'hui) et entre dans le contexte à chaque invocation de skill. Enfin, `docs/DECISIONS.md` **reste** le seul artefact partagé non découpé : sa collision est désormais visible et bloquante, pas impossible — c'est l'arbitrage assumé, le renommage de quatorze décisions citées depuis du code clinique n'ayant pas sa place dans un lot d'outillage.
- Note de lecture : les lignes « Référence » antérieures à ce lot qui pointent `docs/claude/HANDOFF_CURRENT.md` — dont celle de **D-010** — désignent désormais le fragment correspondant de `docs/claude/handoffs/`. Le registre étant append-only, elles ne sont pas retouchées.
- Référence : [../.gitattributes](../.gitattributes), [claude/handoffs/README.md](claude/handoffs/README.md), [../scripts/lib/skill-cross-invocation.mjs](../scripts/lib/skill-cross-invocation.mjs), [../scripts/lib/decisions-numerotation.mjs](../scripts/lib/decisions-numerotation.mjs), [../scripts/parite-check-ci.test.mjs](../scripts/parite-check-ci.test.mjs)

### D-016 — Une règle d'orientation ne se déclenche que sur une mesure complète, et sur la forme réellement servie

- Date : 2026-08-04
- Statut : accepté (arbitrages praticien en session, table d'orientation V2)
- Domaine : clinique, orientation et scoring
- Décision : un déclencheur de la table d'orientation ne mord que sur une **mesure complète** — le moteur refuse un axe dont `repondus < items`, et un score global dont le porteur déclare un recueil partiel. Et il doit être **solidaire de la forme servie** : quand un `idQuestionnaire` désigne deux instruments selon un drapeau, le déclencheur porte sur les **libellés de bande**, que les deux formes ne partagent pas, et non sur une couleur, qu'elles partagent.
- Conséquences : le moteur `subscore` calcule le total d'un axe **dès qu'un seul item est renseigné** ; un total partiel est donc biaisé **vers le bas**, et un déclencheur `<=` le lit comme une dégradation. Mesuré : trois items de `Q_MOD_01` répondus à leur **meilleure** valeur, puis abandon, produisaient **sept recommandations dont deux packs**, motivées par « Sommeil non réparateur » chez un patient qui venait de déclarer un excellent sommeil. Les sous-scores servent désormais `repondus` et `items` (et non `missing` : le décrire aurait imposé de bumper la consigne de synthèse, verrouillée par empreinte). Sur `Q_ALI_01`, dont la forme courte est servie partout où `WN_ALI_01_SIIN57` manque — CI, dev, preview —, le déclencheur porte sur les deux libellés de la forme SIIN57 : la règle cesse d'elle-même de mordre quand le drapeau est éteint, et reste solidaire du claim, qui parle de l'enquête « détaillée ».
- Réserves : le PSQI partiel n'était pas gardé — **fermé depuis, au lot de signature du 2026-08-04** : `psqi` publie `missing`/`repondus` sur ses 18 items cotés et retire sa bande sur recueil partiel. La réserve subsistante est `tfd` (`Q_GAS_01`, cible de `R-GAS-01`), qui ne publie aucun compte à la racine. Par ailleurs `items = repondus + missing` n'est exercé par aucun instrument du catalogue (aucun instrument `subscore` ne porte d'item conditionnel) : une régression y serait silencieuse.
- Référence : [web/src/lib/clinical/orientationEngine.ts](web/src/lib/clinical/orientationEngine.ts), [web/src/lib/clinical/orientationRulesV1.ts](web/src/lib/clinical/orientationRulesV1.ts), [web/src/lib/questions.ts](web/src/lib/questions.ts), [[D-014]]

### D-015 — Agenda alimentaire : la saisie patient exige un consentement enregistré, se ferme à la clôture de suivi, et le doublon se refuse au chemin d'écriture

- Date : 2026-08-04
- Statut : accepté (lot L4a de l'agenda alimentaire — accès portail serveur)
- Domaine : clinique, RGPD et architecture des chemins d'écriture patient
- Décision : trois arbitrages rendus ensemble sur la première surface serveur de `Q_ALI_09`.
  1. **La saisie exige `Assignation.consentement = 'donne'`, et `Patient.suiviClotureLe` la ferme.** Ce que ces deux gardes ferment RÉELLEMENT, en production, aujourd'hui :
     - **Le consentement jamais donné.** `Assignation.consentement` vaut `'non_donne'` par défaut (`schema.prisma:121`) ; il ne passe à `'donne'` que par `api/patient/consentement` (l'endpoint du `ConsentScreen`) ou par `consultation/assignBasePack.ts`. Une assignation créée depuis la bibliothèque praticien naît donc `'non_donne'`. Sa **seule** garde jusqu'ici était un **écran** — `portail/[token]/questionnaires/[idAssignation]/page.tsx:106` — qu'un appel direct à l'API contourne entièrement ; `api/patient/submit` ne vérifie ce champ **nulle part**. C'est **cela** que la nouvelle barrière ferme : 21 jours de donnée de santé qu'on pouvait ouvrir sans consentement enregistré.
     - **La clôture de suivi.** `Patient.suiviClotureLe` est bien écrit, par `api/praticien/patients/cycle-de-vie/route.ts:115`. Un dossier clôturé continuait de recevoir des saisies. **Aucune vue praticien de l'agenda _alimentaire_ n'existe à ce stade** — L4a n'ouvre qu'une route portail, et une version antérieure de cette décision en désignait une qui n'a jamais été écrite. Ce qui est vérifiable : la vue de suivi de l'agenda du **sommeil** (`api/praticien/agenda-sommeil/suivi/route.ts:48`) filtre `suiviClotureLe: null`, et la vue alimentaire à venir suivra la même règle. Les saisies recueillies après clôture seraient donc collectées sans destinataire.
     - **Ce qui n'est PAS fermé, parce que rien ne l'ouvre :** `Assignation.consentementRetraitDate` n'est écrit par **aucun** chemin du dépôt — ni route, ni script, ni seed (vérifié le 2026-08-04 : hors client Prisma généré, les seules occurrences sont le module d'autorisation de l'agenda alimentaire et ses tests). **Aucun patient ne peut retirer son consentement au niveau assignation** : le mécanisme n'existe pas. La barrière posée sur ce champ est une **pré-position défensive**, pour que la route qui l'écrira un jour trouve ce chemin d'écriture déjà fermé. Elle ne protège rien pour l'instant, et il ne faut pas la lire comme une garde active. Une version antérieure de cette décision affirmait qu'« un patient qui retire son consentement continue d'alimenter 21 jours de donnée de santé » : c'était faux, faute d'un mécanisme de retrait.
  2. **Un second envoi sur une date déjà notée est refusé (`409`)**, sauf s'il porte un `supersedesJourId` désignant la journée **active** de cette date. Le refus s'étend à l'écriture portant sur une date **dont une ligne est illisible** — et sur elle seule : une ligne en quarantaine est invisible de `resolveJoursActifs`, donc sa date passerait pour non notée et l'écriture créerait une seconde tête de chaîne. Il ne s'étend **pas** à l'agenda entier. Une version antérieure de cette décision le faisait, au motif qu'`illisibles` est un compte muet sur les dates touchées : c'était faux — `date_jour` est une **colonne**, la ligne fautive est en portée dans le `catch` de `listJours`, qui remonte désormais `datesIllisibles` à côté du compte. Le refus large fermait les vingt autres journées et jusqu'aux corrections légitimes, **sans aucun geste de sortie** (le seul `deleteMany` sur cette table est l'effacement RGPD du dossier entier, `lib/patient/effacement.ts`), pour éviter un dégât qui se réduit à **+1 sur `lignes − dates distinctes`** — une métrique de friction interne. Dans tous les cas, `illisibles > 0` ouvre une ligne de journal d'intégrité (`PORTAIL_PATIENT.AGENDA_ALIMENTAIRE.LIGNE_ILLISIBLE`) — **sur la lecture comme sur l'écriture**, et non au seul POST : la quarantaine naît d'un rollback ou d'un conteneur v1 relisant une ligne v2, fenêtre où les lectures dépassent de loin les écritures, et un agenda encore consulté mais plus alimenté n'ouvrirait alors jamais d'incident. Aucune date en `metadata` (donnée de recueil) ; `dateVisee` est un booléen, renseigné au seul POST.
  3. **`modification_demandee` est refusé au même titre que `verrouille`**, aligné sur `api/patient/submit/route.ts`.
  4. **Les états terminaux passent avant les gestes à poser.** Dans `authorizeAgendaAlimentairePortail`, `Annulée` (`410`) et `suiviClotureLe` (`410`) précèdent les deux barrières de consentement (`403`). L'ordre inverse envoyait le patient vers un geste impossible — `api/patient/consentement/route.ts:65` refuse en `410` sur une annulée — ou, pire, vers un geste que cette route aurait **exécuté** : elle ne lit pas `suiviClotureLe` et aurait écrit le consentement sur un dossier clôturé, juste avant que la barrière suivante ne le referme. Règle générale à retenir : un refus qui **nomme un geste** au patient doit venir après tout refus d'état terminal.
- Conséquences : **l'asymétrie avec l'agenda du sommeil est assumée et nommée**, elle n'est pas un oubli. On ne recopie pas un défaut connu dans du code neuf ; et corriger le sommeil reviendrait à modifier un chemin d'écriture **en production**, hors du périmètre d'un lot qui n'ouvre qu'une route. **La dette reste ouverte sur deux chemins nommés** : `web/src/app/api/patient/submit/route.ts` et `web/src/app/api/portail/agenda-sommeil/route.ts` (via `web/src/lib/agenda-sommeil/portail.ts`) — aucun des deux ne lit `consentement`, ni `consentementRetraitDate`, ni `suiviClotureLe`. Un patient dont le consentement n'a jamais été enregistré peut donc encore écrire par ces deux portes. C'est consigné ici pour être repris, pas pour être oublié. Sur le point 2, le refus tient au chemin d'écriture **et nulle part ailleurs** : il n'existe volontairement **aucune contrainte unique** sur `(id_assignation, date_jour)`, puisque `count(lignes) − count(DISTINCT date_jour)` est le **taux de correction**, seule métrique de friction du lot lisible sans nouvelle migration (D-009, « collecter avant de calibrer »). Sans le `409`, un double-clic serait indiscernable d'une correction réelle et la métrique mentirait dans le sens rassurant. La base ne peut pas faire cette distinction, le chemin d'écriture le peut : c'est la bonne place. Sur le point 3, deux chemins d'écriture qui divergent sur le même statut d'assignation finissent par se contredire au dossier — un patient verrouillé d'un côté, ouvert de l'autre.
- Réserves :
  - **Le `409` rend le double-clic improbable, pas impossible.** Le contrôle est un `listJours` suivi d'un `saveJour`, **sans transaction ni contrainte unique** (délibérément absente, voir ci-dessus) : deux POST concurrents lisent tous deux un agenda vide sur cette date et écrivent tous deux une ligne non chaînée. La fenêtre est courte et le cas est un double-clic, non un adversaire ; mais la métrique `lignes − dates distinctes` compterait alors ce double-clic comme une correction, dans le sens rassurant. Corriger demanderait soit une transaction sérialisable, soit un index unique partiel — ce dernier étant précisément ce que le modèle append-only interdit. Non corrigé dans ce lot, consigné ici.
  - **Éteindre `WN_AGENDA_ALI` exige un redéploiement.** `IDS_SUSPENDUS` est un `const` de module, calculé à l'import : un conteneur serverless déjà chaud garde la valeur de son démarrage. Changer la variable d'environnement Vercel sans redéployer laisse la barrière ouverte sur les conteneurs en vol. Le geste opérationnel est « changer la variable **puis** redéployer », jamais l'un sans l'autre.
  - **Une impasse d'ordre subsiste, hors de portée de ce réordonnancement : date limite dépassée + consentement absent.** La barrière de consentement vit dans `authorizeAgendaAlimentairePortail`, donc **avant** le contrôle de `dateLimite`, qui est une barrière de la route (POST seulement). Sur une assignation périmée et sans consentement, le patient reçoit donc « donnez d'abord votre consentement » (`403`) alors que `api/patient/consentement/route.ts:55` refuse en `410 expired` — le même geste impossible que celui corrigé pour l'annulation. Pire : cette route de consentement **n'exempte pas** `statutReponses = 'deverrouille'`, contrairement à l'agenda ; un agenda délibérément rouvert par le praticien resterait donc fermé côté consentement. **Le report n'est pas motivé par un coût de correction** — une version antérieure de cette réserve affirmait qu'il faudrait déplacer le contrôle de `dateLimite` dans l'`authorize`, donc l'appliquer aussi au `GET` : c'est inexact. Un **paramètre d'option porté par le seul POST** — `authorizeAgendaAlimentairePortail(req, id, { verifierDateLimite: true })` — le corrigerait sans toucher au comportement de lecture. Ce qui motive le report, c'est que **le cas est inatteignable** : `WN_AGENDA_ALI` est éteint, et la barrière 5 (instrument suspendu, `409`) mord avant toutes les autres. Le correctif est bon marché et reste à faire ; à reprendre en L4b, en même temps que l'exemption `deverrouille` côté consentement. Cas voisin, plus bénin : consentement absent + `statutReponses = 'verrouille'` — le geste réussit (la route de consentement ne lit pas ce statut), mais l'agenda refuse ensuite en `409` ; geste inutile, pas impossible.
  - **La frise se ré-ancre en silence si la ligne en quarantaine est la plus ancienne.** `calculerFenetreAliDepuisDates` (`lib/agenda-alimentaire/fenetre.ts:59-60`) ancre les 21 emplacements sur `min(dates)` des journées **relues**. Si la première journée du recueil tombe en quarantaine, la fenêtre repart de la deuxième et les 21 emplacements **glissent** — les index affichés ne désignent plus les mêmes jours. `illisibles` remonte bien au GET, mais rien ne dit que c'est l'ancre qui a bougé, et un patient qui compare deux affichages verrait sa journée 1 changer de date sans explication. Non corrigé dans ce lot : il n'existe pas encore d'écran.
  - **Aucune borne serveur sur les 21 jours.** `estDateSaisissable` n'autorise qu'aujourd'hui ou la veille, mais **rien ne refuse une date au-delà de `dateDebut + 20`** : un recueil peut donc dépasser 21 journées si le patient continue de saisir. La fenêtre ne borne que l'affichage, pas l'écriture. **Question produit ouverte, à trancher avant L4b** : borner au POST (refus d'une 22ᵉ journée) ou à la clôture (le recueil se ferme quand `cloturablePatient` devient vrai) ? Les deux réponses sont défendables et n'ont pas les mêmes effets cliniques — la première tronque, la seconde exige un geste.
  - **Le `400` de domaine ne dit plus lequel des onze contrôles de `jour.ts` a mordu.** La trace d'erreur du chemin d'écriture masque le message pour empêcher un `PrismaClientValidationError` de citer `data.reponses` ; le prix est que les `TypeError` du domaine — dont **aucun** n'interpole une valeur du patient — perdent leur diagnostic. Un **code de domaine énuméré** (une constante par contrôle, levée avec l'exception) restituerait le motif sans rien exposer. Piste pour un lot ultérieur, pas un correctif de celui-ci.
  - L'absence d'unicité en base est désormais **assérée en sens inverse** par `web/prisma/checks/agenda_alimentaire_v1.sql` — ajouter un index unique sur `(id_assignation, date_jour)` ressemblerait à un durcissement et casserait le modèle append-only. Ce contrat garde aussi le `ON DELETE RESTRICT` des deux clés étrangères, sans lequel la suppression nommée de `web/src/lib/patient/effacement.ts` deviendrait du **code mort** en silence, et refuse toute colonne de gramme, kcal, score, indice ou quantité (frontière « journal alimentaire, pas carnet de pesée »), **ainsi que toute clé de premier niveau du JSONB `reponses`** portant les mêmes motifs — un agrégat rangé là n'exigerait aucune migration, c'est le chemin le moins coûteux donc le plus probable. Ses invariants de **données** — verrou de périmètre JSONB, version de contrat lue, chaînage `supersedes_jour_id` non pendant et ne franchissant ni patient, ni assignation, ni date — sont **vacués sur la base CI, qui est vide** : c'est le même piège que pour la barrière D-003, la partie du contrat qui protège le plus est celle que le CI ne joue pas. Ils sont à rejouer en lecture seule sur la production une fois des journées recueillies.
- Référence : [web/prisma/checks/agenda_alimentaire_v1.sql](web/prisma/checks/agenda_alimentaire_v1.sql), [web/src/app/api/portail/agenda-alimentaire/route.ts](web/src/app/api/portail/agenda-alimentaire/route.ts), [web/src/lib/agenda-alimentaire/portail.ts](web/src/lib/agenda-alimentaire/portail.ts), [web/src/lib/patient/effacement.ts](web/src/lib/patient/effacement.ts), [changelog.d/2026-08-04-agenda-alimentaire-l4a.md](changelog.d/2026-08-04-agenda-alimentaire-l4a.md)

### D-014 — Une bande d'interprétation ne se lit que sur l'instrument complet

- Date : 2026-08-04
- Statut : accepté (arbitrage praticien en session, suite du LOT-07)
- Domaine : clinique et scoring
- Décision : sur un recueil **partiel**, les moteurs de somme ne rendent plus de bande d'interprétation. Un item non répondu n'est pas compté `0` — il est **ignoré** —, si bien que le total sort plus bas qu'il ne devrait et décroche une bande calibrée sur la forme complète. **L'erreur est à sens unique : sous-classement, jamais sur-classement**, c'est-à-dire le faux négatif sur un dépistage. Le `total` reste servi, accompagné de `missing` et `repondus` ; ce qui tombe est la **lecture**, pas la mesure. `bms_average` rend en plus `average: null` : sa moyenne divisait par des items que personne n'avait posés, et diviser par `repondus` aurait remplacé un nombre faux par un nombre inventé — la grille du BMS-10 n'a jamais été calibrée sur une moyenne partielle.
- Conséquences : frontière **plus stricte** que celle des sous-scores voisins, qui tiennent un axe pour mesuré dès qu'un item est renseigné. Assumé : un sous-score **détaille** un total resté vérifiable à côté, une bande **affirme**. La règle vaut aussi un étage plus bas, dans `web/src/lib/equilibre/score.ts`, où le total **est** la lecture — il y est divisé par le `max` de la forme complète, et sur une source `inverser: true` l'erreur devient rassurante : un `Q_STR_03` tronqué rendait « besoin bien couvert ». Une source à recueil partiel n'entre donc plus dans la couverture ; un besoin dont toutes les sources sont partielles ressort **non mesuré**, jamais `0`.
- Réserves : **la classe n'est pas fermée.** Trois moteurs servis portent encore le même défaut et n'ont pas été touchés — `sum_decimal` (`Q_GEO_05`, QDRS, où un recueil partiel décroche « Normal » sur une **gradation de démence**), `count_threshold` (`Q_INF_05`, qui calcule `missing` puis l'ignore) et `ecab` (`Q_NEU_08`, dépendance aux benzodiazépines). Portée du présent changement mesurée et **nulle sur l'existant** : les 21 réponses `sum` de production portent toutes exactement le nombre d'items attendu (lecture `execute_sql` du 2026-08-04). Mais le trou n'était **pas** théorique : côté serveur, la complétude n'est exigée que pour `def.cabinet`, et aucun instrument servi par `sum` n'est de cabinet — un POST partiel authentifié était accepté.
- Référence : [web/src/lib/questions.ts](web/src/lib/questions.ts), [web/src/lib/equilibre/score.ts](web/src/lib/equilibre/score.ts), [docs/gouvernance-questionnaires-scoring.md](docs/gouvernance-questionnaires-scoring.md)

### D-013 — Une étiquette de certification ne vaut que ce que vaut la pièce qui la fonde

- Date : 2026-08-04
- Statut : accepté (clôture du LOT-07 de la campagne `2026-08-03-packs-moteur-d-intervention-et-corpus-consommable`)
- Domaine : corpus des questionnaires, gouvernance clinique
- Décision : un statut du registre des instruments ne se pose que sur une pièce qui **certifie l'objet réellement servi**, et un garde de statut vérifie la **teneur** de cette pièce, jamais sa seule présence. Trois applications, toutes exécutables : `statutBibliographique: reference_identifiee` exige un identifiant (DOI ou PMID) qui certifie la forme servie, et non un simple champ d'identification non vide ; `cosmin` autre qu'`inconnu` exige une ligne concordante de `measurement_evidence.json` sur le même `questionnaireId` **et** le même grade ; le barreau `statutCertification: psychometrie_revue` exige une preuve **graduée** — au moins une étude dont `conclusionCosmin !== 'inconnu'` — et un `cosmin` posé sur l'entrée.
- Conséquences : sur 65 entrées, **43 portent `reference_identifiee` et 2 seulement un identifiant** — l'écart est la mesure exacte de ce que l'étiquette ne dit pas, et il est désormais écrit dans `docs/gouvernance-questionnaires-scoring.md`. Une entrée sans identifiant reste `a_completer` et porte un `motifBibliographique` d'au moins 40 caractères disant ce qui a été cherché ; le même champ est **interdit** sur les autres statuts, un constat survivant à une promotion contredisant son voisin. `Q_ALI_03` est le contre-exemple de référence : sa publication d'origine a été retrouvée et n'est délibérément pas portée en `references`, parce que la publication décrit 8 questions et que le dépôt en sert 23 sous un instrument qu'il déclare débaptisé.
- Réserves : le garde générique du registre continue d'accepter `reference_identifiee` sur un seul champ non vide — seuil bas assumé pour les 43 entrées héritées, que ce lot n'a pas rouvertes. La règle du présent D-013 vaut pour toute **nouvelle** promotion, et c'est la revue qui la tient, pas le garde. Par ailleurs `a_completer` recouvre depuis ce lot deux situations qu'aucune requête ne sépare — « rien n'existe » et « trouvé mais non indexé » —, distinction qui ne vit que dans le motif.
- Référence : [scripts/lib/verifier_registre_instruments.js](scripts/lib/verifier_registre_instruments.js), [docs/gouvernance-questionnaires-scoring.md](docs/gouvernance-questionnaires-scoring.md), [docs/claude/corpus/instrument_registry.json](docs/claude/corpus/instrument_registry.json)

### D-012 — La barrière D-003 se garde au point de passage, pas chez ses lecteurs

- Date : 2026-08-03
- Statut : accepté (clôture du LOT-01 de la campagne `2026-08-03-packs-moteur-d-intervention-et-corpus-consommable`) — le contrat qui matérialise cette décision a été mergé par la **PR #553** le 2026-08-03 (`cd7c1b9b`) : la décision et sa mise en œuvre sont toutes deux sur `main`.
- Domaine : architecture, corpus et sécurité clinique
- Décision : la fermeture de la barrière D-003 — aucun claim non signé ne remonte vers une restitution — est **éprouvée sur `public.match_wellneuro_rag_claims`**, seule voie de restitution du corpus, par le contrat `web/prisma/checks/rag_claim_barriere_d003_v1.sql`. Elle n'est **pas** obtenue en imposant un filtre `statut` à chaque module qui lit `rag_corpus_claims`. Le contrat assère aussi ce qui empêche de **contourner** la fonction : `EXECUTE` refusé à `anon` et `authenticated`, RLS active sur les deux tables.
- Conséquences : quatre modules (`revue.ts`, `recherche.ts`, `questionnaire.ts`, `evaluation.ts`) lisent la table sans filtrer `statut`, et **ce n'est pas un défaut** — ce sont l'établi de validation, qui doit voir un claim non signé pour le présenter au praticien. Ils sont documentés comme tels dans `docs/claude/corpus/VALIDATION_CLAIMS_DEUX_VITESSES.md`, pas gardés par du code. En contrepartie, **toute nouvelle voie de restitution doit passer par la fonction** : un `SELECT` direct sur la table depuis une surface de consultation échapperait au garde, qui ne le verrait pas. C'est le prix de ce dessin, et il est assumé — un garde au point de passage tient quel que soit le nombre de lecteurs, une allowlist se périme au premier module ajouté.
- Réserves : le refus d'`EXECUTE` n'est assérable que si les rôles PostgREST existent — la clause est donc **vide sur la base éphémère du CI et mordante en production**. C'est le piège déjà rencontré avec `REVOKE FROM PUBLIC` : la partie du contrat qui protège le plus est celle que le CI ne joue pas. Deux des cinq conditions de la fonction (`patient_identifiable = false`, `compartment = 'ACTIF'`) ne sont pas falsifiables par fixture — tenues par des `CHECK` de table — et sont assérées structurellement dans `pg_constraint`.
- Référence : [web/prisma/checks/rag_claim_barriere_d003_v1.sql](web/prisma/checks/rag_claim_barriere_d003_v1.sql), [.github/workflows/ci.yml](.github/workflows/ci.yml), [docs/claude/corpus/VALIDATION_CLAIMS_DEUX_VITESSES.md](docs/claude/corpus/VALIDATION_CLAIMS_DEUX_VITESSES.md), PR #553

### D-011 — Écart de restitution de l'IA : on journalise, on ne censure pas

- Date : 2026-08-03
- Statut : accepté (clôture du LOT-06 de la même campagne)
- Domaine : clinique et IA (prolonge **D-003**, ne le contredit pas)
- Décision : quand un détecteur constate un écart entre la synthèse **rédigée par l'IA** et le matériel déterministe qui lui a été transmis — un pack ou un questionnaire cité sans avoir été fourni —, l'écart est **consigné** dans les métadonnées de la synthèse, au dossier. La synthèse n'est ni supprimée, ni tronquée, ni masquée au praticien. Le détecteur est un instrument de mesure, pas une censure.
- Conséquences : le praticien voit la synthèse **et** l'écart, et tranche. Le garde ne s'exécute que si le bloc d'orientation a réellement été injecté (`orientationInjectee`) : sans injection, il n'y a pas de matériel de référence, donc pas d'écart mesurable — seulement une accusation possible. L'allowlist est dérivée des **trois** sources réellement transmises, dont les questionnaires que la consigne système cite elle-même : reprocher au modèle d'avoir repris ce qu'on lui a donné revient à l'accuser d'avoir inventé ce qu'il a lu.
- Réserves : ce dessin est né d'un défaut mesuré, pas d'un principe. Pendant le LOT-06, le détecteur tournait avec une allowlist vide sur le seul chemin de production et comparait la prose à 16 titres de packs, dont quatre sont des tournures cliniques françaises ordinaires (« digestif et intestin-cerveau », « stress chronique et burnout ») : **une synthèse fidèle a été accusée, et l'accusation persistée au dossier**. Un détecteur qui peut se tromper ne doit pas avoir le pouvoir de supprimer. S'il gagne un jour ce pouvoir, ce sera par une décision distincte, pas par dérive.
- Référence : [web/src/lib/clinical/verifierRestitutionOrientation.ts](web/src/lib/clinical/verifierRestitutionOrientation.ts), [web/src/app/api/praticien/synthese/route.ts](web/src/app/api/praticien/synthese/route.ts), PR #550
### D-010 — Agenda alimentaire : l'écart déclaré/observé est un objet clinique séparé, pas une source du besoin 3

- Date : 2026-08-04
- Statut : accepté (arbitrage praticien, lots L1-bis et L3 de l'agenda alimentaire)
- Domaine : clinique, Mon Équilibre
- Décision : l'agenda alimentaire `Q_ALI_09` **n'alimente pas** le besoin 3 « Rythme alimentaire », déjà sourcé par le sous-score `RYTHME_CHRONO` de `Q_ALI_01`. Ce que l'instrument doit produire est l'**écart** entre le rythme DÉCLARÉ (questionnaire) et le rythme OBSERVÉ (21 jours), comme objet distinct — trois profils, dont « déclare bon / observe mauvais », où l'action clinique porte sur la perception et non sur le rythme.
- Conséquences : `BESOIN_SOURCES` et `VERSION_SCORE_EQUILIBRE` restent intouchés, et `sourceMonEquilibre` vaut `false` au registre des instruments. Y brancher l'agenda ferait deux mesures d'un même thème — l'agenda serait le **troisième** porteur du mot « rythme », après `RYTHME_ALIMENTAIRE` /10 (affichage) et `RYTHME_CHRONO` /7 (besoin), homonymie dont `lib/anthropic.ts` documente déjà le piège d'addition. L'objet d'écart **dépend de la forme servie** : sous la forme courte à 14 items, `MAX_RYTHME_CHRONO` vaut 0, aucun rythme n'est déclaré, et l'écart devra rendre `null` — jamais 0, qui se lirait « pas d'écart ».
- Référence : [docs/claude/HANDOFF_CURRENT.md](docs/claude/HANDOFF_CURRENT.md), [web/src/lib/equilibre/constants.ts](web/src/lib/equilibre/constants.ts), [web/src/lib/agenda-alimentaire/types.ts](web/src/lib/agenda-alimentaire/types.ts), [web/src/lib/anthropic.ts](web/src/lib/anthropic.ts)

### D-009 — Recueil longitudinal : collecter avant de calibrer, et l'abstention est un état clinique de plein droit

- Date : 2026-08-04
- Statut : accepté (arbitrage praticien, lots L1-bis et L3)
- Domaine : clinique, méthode de mesure
- Décision : sur un instrument de recueil, **aucun barème n'est arrêté avant d'avoir observé des données réelles** — un barème posé avant la première passation est une donnée clinique inventée. Et une question de recueil offre **trois états**, pas deux : observé vrai, observé faux, et `null` — « je ne sais pas » —, distinct de la clé absente qui reste la non-réponse.
- Conséquences : l'ordre des lots est collecte → calibrage, jamais l'inverse ; un instrument peut donc être livré `scored: false` et le rester. L'abstention doit entrer au contrat **avant la première ligne en base** : après, elle coûte une version de contrat, une double lecture et une fenêtre de recueil incomparable à elle-même. Corollaire technique à ne pas manquer — `null !== undefined` est vrai en JavaScript : relâcher un booléen **réveille tous les prédicats qui comptent les valeurs connues**, et un seul laissé en `!== undefined` compte l'abstention comme connue puis la lit comme un « non ». Le test de connaissance s'écrit `typeof … === 'boolean'`, uniformément ; la différence de contrat entre champs vit dans le type et le validateur, jamais dans les prédicats.
- Référence : [changelog.d/2026-08-04-agenda-alimentaire-l3-persistance.md](changelog.d/2026-08-04-agenda-alimentaire-l3-persistance.md), [web/src/lib/agenda-alimentaire/types.ts](web/src/lib/agenda-alimentaire/types.ts), [web/src/lib/agenda-alimentaire/agregats.ts](web/src/lib/agenda-alimentaire/agregats.ts)

### D-008 — Contrat V3 des compléments : validation structurelle au runtime, à la persistence et à la relecture

- Date : 2026-08-03
- Statut : accepté (lot C4, session de consolidation)
- Domaine : architecture, protocoles et rayon compléments
- Décision : le contrat V3 des références catalogue de compléments est désormais validé de bout en bout sur la construction du draft, la persistence côté API praticien et la relecture depuis PostgreSQL. Un payload V3 mal formé est refusé explicitement ; les versions V1/V2 restent inchangées, et le chemin C5 ne se mélange pas au contrat V3.
- Conséquences : la contrainte structurelle est désormais appliquée au point d’entrée d’écriture et au point de reconstitution des protocoles, ce qui évite qu’un draft invalide soit persisté ou réhydrater sans rejet. La gouvernance du rayon compléments reste fail-closed tant qu’aucune activation métier n’est décidée.
- Référence : [docs/claude/campagnes/2026-08-02-rayon-complements-alimentaires/HANDOFF.md](docs/claude/campagnes/2026-08-02-rayon-complements-alimentaires/HANDOFF.md), [web/src/lib/clinical-engine/protocolDraft.ts](web/src/lib/clinical-engine/protocolDraft.ts), [web/src/app/api/praticien/protocoles/route.ts](web/src/app/api/praticien/protocoles/route.ts), [web/src/lib/protocol/fromPrisma.ts](web/src/lib/protocol/fromPrisma.ts)

### D-007 — Orientation adaptative : A-009 amendé, seule la perfusion reste hors moteur

- Date : 2026-08-01 (amendement) — 2026-08-02 (consignation)
- Statut : accepté (arbitrage du praticien-propriétaire, rendu en session)
- Domaine : clinique et corpus (frontière du moteur d'orientation)
- Décision : la décision **A-009** du manifeste plaçait quatre domaines hors moteur — perfusion, sevrages médicamenteux, psychotropes, maladie d'Alzheimer. Pour l'**orientation adaptative** (axe 3 de la campagne `2026-07-25-certification-corpus-questionnaires`, question *f* du cadrage), ce périmètre est **amendé** : seule la **perfusion** reste exclue. Les sevrages médicamenteux, les psychotropes et Alzheimer sont **réintégrés** dans le drafting des claims d'orientation. Motif : ces domaines relèvent de l'exercice courant du cabinet et leur exclusion en bloc privait le moteur de sources que le praticien mobilise en consultation ; la perfusion, elle, désigne un acte que WellNeuro n'a pas vocation à orienter.
- Conséquences : **la voie lente est inchangée** — chaque claim reste soumis à la validation praticien individuelle avant d'exister pour le moteur (barrière **D-003**) ; l'amendement élargit ce qui est *proposé* à la validation, jamais ce qui la contourne. **La quarantaine sanitaire reste un garde-fou, mais elle n'est plus un blocage absolu pour l'orientation** : les sources prescriptives du périmètre sont réintégrées par la levée actée le 2026-08-02 ; les sources non prescriptives restent exclues. Cette distinction est matérialisée dans `tools/corpus/claims/lib/filtre-orientation.mjs` et éprouvée par deux bancs. Matérialisation en base : migration `20260801200000_rag_claim_usage_orientation` (marquage `metadata.usage = 'orientation'`, prescriptifs réintégrés, perfusion épargnée — vérifié en production le 2026-08-02).
- Réserves : le périmètre est **figé dans une liste** au 2026-08-02 ; sa dérive est surveillée par `tools/corpus/claims/lib/perimetre-orientation.test.mjs`, qui échoue dès que le registre s'en écarte — les sources entrant en quarantaine après coup restent exclues si elles ne sont pas prescriptives.
- Référence : `docs/claude/propositions/2026-07-25-certification-corpus-questionnaires/README.md` (§5, question *f*), PR #518 et #519

### D-006 — Migration HDS : bascule tout-Scalingo, données réelles dès la phase de test, découplée du calendrier juridique

- Date : 2026-07-28
- Statut : accepté (décision du **responsable de traitement**), **sous les réserves listées ci-dessous**
- Domaine : architecture, hébergement et conformité (HDS, RGPD)
- Décision : la migration vers **Scalingo** (hébergeur certifié HDS 2.0 — certificat LNE n° 38436‑2, valable 11/09/2028 ; infrastructure sous‑traitante Outscale, certifiée HDS) s'applique **aux patients réels dès la phase de test**, sans attendre la finalisation du volet juridique. **Cette décision lève explicitement le gate documenté « F (juridique) conditionne le GO données réelles »** (`CHECKLIST_FINALISATION.md` §F) : les items AIPD, DPA des sous‑traitants et pentest, qui conditionnaient ce GO, deviennent des **réserves à lever en parallèle** — arbitrage que le responsable de traitement est en droit de rendre, consigné comme tel ici. Base invoquée par le responsable : **consentements patients déjà recueillis** et **information RGPD** (conservation des données, droit d'accès, de consultation, de révocation) **déjà actée** sur l'implantation Vercel actuelle. Cohérence : les données réelles sont **déjà** hébergées sur Vercel/Supabase **non‑HDS** sous la dérogation en vigueur (échéance 2026‑10‑21, qui couvre l'implantation **Vercel** actuelle) ; les déplacer vers Scalingo **améliore** la posture — mais **seulement une fois l'annexe HDS en vigueur et le périmètre HDS de la région cible confirmé** (voir Conséquences). Corollaire : **pas de double‑implantation permanente** — Vercel/Supabase gardés chauds comme **filet de rollback court**, puis décommissionnés avec **preuve d'effacement écrite** (registre RGPD). Cible : **Scalingo seul**.
- Conséquences : **ordre imposé** — l'app prod HDS ne reçoit des données réelles **qu'après** (a) e‑signature du **DPA Scalingo** (l'annexe HDS s'y attache — volet hébergeur de F) **et** (b) confirmation que la **région cible porte le périmètre HDS**. Migrer du réel avant (a) créerait un intervalle couvert **ni** par la dérogation (qui vise Vercel) **ni** par un contrat HDS signé. **Note région :** `osc-fr1` est **conforme HDS** selon Scalingo, mais l'audit recommandait la région **plus stricte** `osc-secnum-fr1` (Outscale **SecNumCloud**, souveraine) ; `osc-fr1 --hds-resource` reste **HDS mais non SecNumCloud** — à confirmer acceptable par le responsable. Les patients réels ne doivent atterrir que sur l'**app prod HDS** dûment provisionnée (`--hds-resource`, `DB_SSL_CA`, secrets prod, contrôles d'accès de niveau prod), **pas** sur un staging au sens lâche. Aucun garde runtime n'empêche les données réelles : le passage au réel est la **migration de données du bloc D** (dump Supabase → restore Scalingo), acte ops du responsable, **subordonné à l'ordre ci‑dessus**. **Réserves :** (1) **e‑signer le DPA Scalingo** — *avant toute donnée réelle* ; (2) **confirmer le périmètre HDS de la région** cible — *avant toute donnée réelle* ; (3) **confirmation DPO recommandée** sur « patients réels sur Scalingo en phase de test » — plus lourd que le RLS (D‑005) ; (4) DPA des **autres sous‑traitants** (Anthropic, SMTP, Google, Sentry), **AIPD**, **pentest léger** (item F) ; (5) la conformité des **consentements/information** est une **certification du responsable**, non vérifiée indépendamment ici. Le gate dur `WN_CB_RESULTS_ENABLED` (résultats biologiques réels) **reste distinct** et ne s'ouvre qu'après attestation HDS effective.
- Référence : `docs/claude/propositions/2026-07-24-audit-migration-hds/` (AUDIT, RUNBOOK §4/§5, CHECKLIST_FINALISATION F/D/E), `docs/DECISIONS.md` D‑005 (RLS), `docs/FEATURE_FLAGS.md`

### D-005 — RLS (exig. 3 HDS) : le deny-all documenté comme contrôle suffisant (posture A)

- Date : 2026-07-27
- Statut : accepté — **confirmé par le DPO le 2026-07-27** (posture A : deny-all base + gardes applicatifs satisfait l'exigence 3)
- Domaine : sécurité et conformité (HDS, exigence 3 — cloisonnement d'accès aux données)
- Confirmation : le DPO a confirmé le 2026-07-27 que la posture A (deny-all base + gardes applicatifs) satisfait l'exigence 3 pour une application mono-domaine sans API de données ouverte ; confirmation relayée par le responsable (à archiver par écrit au dossier d'audit). La **posture B** reste le repli si un audit ultérieur exige une isolation au niveau base indépendante du code.
- Décision : le socle **deny-all** déjà en place — RLS activée sans policy et sans `FORCE` sur 71 tables `public` (migration `20260707123710_enable_rls_security`, état prod vérifié le 2026-07-27 : 0 policy, 0 `FORCE`, app connectée en `postgres` = propriétaire) — **plus** les gardes applicatifs (portail résolu par `session.idPatient` sur cookie signé depuis #397, session praticien Google restreinte `@wellneuro.fr`) couvrent l'exigence 3. La **posture B** (`FORCE` + policies par principal, isolation ligne à ligne au niveau base) n'est **pas retenue à ce stade** : disproportionnée pour une application mono-domaine sans API de données ouverte ni multi-tenant à cloisonner en base, et à fort risque de régression silencieuse.
- Conséquences : **aucun code base**. La justification tient au fait que le vecteur réellement adressé par la RLS Supabase — l'API de données managée (PostgREST, rôles `anon`/`service`) — est neutralisé par le deny-all, tandis que l'isolation ligne à ligne reste **applicative** et déterministe. Garde-fous : ne pas connecter l'app sous un rôle propriétaire différent sans revoir cette décision ; ne pas créer de policy partielle **sans** `FORCE` (sans effet sur le rôle propriétaire, elle donnerait une fausse impression de couverture). Si l'audit exige une isolation base indépendante du code, basculer vers la **posture B** — chantier sous 🚪 go explicite + fenêtre dédiée, à démarrer tôt vu l'échéance de dérogation (2026-10-21).
- Référence : `docs/claude/propositions/2026-07-24-audit-migration-hds/ADDENDUM_RLS_EXIG3.md`, `docs/claude/propositions/2026-07-24-audit-migration-hds/NOTE_DPO_RLS_EXIG3.md`, `CHECKLIST_FINALISATION.md` (section C)

### D-004 — Corpus scientifique 5.0 : pgvector en production, Apps Script transitoire

- Date : 2026-07-21
- Statut : accepté
- Domaine : architecture et corpus
- Décision : le corpus scientifique (supports SIIN validés) est indexé dans PostgreSQL/pgvector (`rag_corpus_chunks`, PR #196) selon un modèle à deux couches — verbatim source immuable + claims validés praticien. Les gates G0 (droits, verdict utilisateur du 2026-07-21) et G5 (migration pgvector) sont ouverts ; détail au `docs/claude/REGISTRE_FRONTIERES.md` (A9).
- Conséquences : le pipeline Apps Script corpus v1.5 est un **appelant transitoire** de la production — il ingère le stock (lots 000-013 puis extraction croisée Sonnet 5 + GPT-5.4) et s'éteint à l'ouverture de l'Atelier corpus (`dashboard/corpus`). D-001 reste entière : aucune dépendance Sheets dans les routes applicatives ; l'ingestion passe exclusivement par `/api/internal/rag/ingest` sous secret partagé. Aucune sortie RAG n'atteint un patient sans validation praticien (D-003).
- Référence : `docs/claude/REGISTRE_FRONTIERES.md` (A9), `docs/RAG_PGVECTOR_PRODUCTION.md`, `docs/claude/propositions/2026-07-21-corpus-wellneuro-5-0/`

### D-003 — Séparation déterministe et narration IA

- Date : 2026-06-15
- Statut : accepté
- Domaine : clinique et IA
- Décision : les règles de sécurité, de scoring et de priorisation doivent rester déterministes et testables
- Conséquences : le LLM peut traduire et synthétiser, mais ne décide pas seul. Vigilances critiques codées en dur, non déléguées au LLM.
- Référence : `docs/claude/REGLES_CRITIQUES.md`

### D-002 — Portail permanent est le flux patient principal

- Date : 2026-07-03
- Statut : accepté
- Domaine : produit
- Décision : `/portail/[token]` est le parcours patient principal et unifié
- Conséquences : `/patient/[idAssignation]` reste un flux de compatibilité legacy, non augmenté de nouvelles fonctionnalités
- Référence : `docs/PROJECT_STATE.md`

### D-001 — PostgreSQL est l'unique base runtime

- Date : 2026-07-07
- Statut : accepté
- Domaine : architecture
- Décision : toutes les données runtime sont lues et écrites via Prisma dans PostgreSQL/Supabase
- Conséquences : Google Sheets ne doit pas être réintroduit dans les routes applicatives
- Référence : `docs/PROJECT_STATE.md`

## Décisions archivées

> Les décisions anciennes sont versionnées dans les entrées `SESSION_LOG.md` (voir `docs/archive/sessions/`).
