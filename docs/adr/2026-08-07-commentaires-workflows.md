# ADR — commentaires historiques déplacés des workflows CI (2026-08-07)

Les workflows `.github/workflows/ci.yml` et `release-db.yml` portaient ~52 % de
lignes de commentaires, dont plusieurs comptes-rendus historiques longs relus
par chaque agent qui ouvre le fichier. Les invariants gardent une raison courte
sur place ; le récit complet est ici. **Rien de fonctionnel n'a changé.**

## ci.yml — pourquoi trois fichiers sous `docs/` sont classés CODE

La matrice de mapping des questionnaires est classée CODE : la certification
scoring la vérifie contre le catalogue, et cette certification vit sur le
chemin code (elle transpile le TS du catalogue, donc a besoin de
`web/node_modules`).

Le REGISTRE DES INSTRUMENTS est classé CODE pour la même raison, plus
tranchante encore : il vit sous `docs/` mais il fait autorité — statut de
droits, barreau de certification, date de vérification. Une PR qui ne
toucherait que lui obtenait `docs_only`, donc un `verify` vert SANS qu'aucun
contrôle du registre ne s'exécute : les deux étapes qui le lisent
(`Scoring certification`, `Registre des instruments`) sont toutes deux gatées.
Deux merges de l'historique ont exactement cette forme, dont un qui éditait des
statuts de droits. Relevé en revue adversariale le 2026-07-29, quand le retrait
d'un banc ad hoc a laissé le fichier sans aucun filet.

Le FICHIER DE PREUVES psychométriques (`measurement_evidence.json`) rejoint le
registre depuis le 2026-08-04, pour la même raison : il commande le barreau
`psychometrie_revue`, donc il fait autorité, et il était classé « docs » alors
que les deux mêmes étapes gatées sont les seules à le lire.

## release-db.yml — pourquoi la release est sortie du build, et le motif « deux clés »

**Pourquoi ce workflow.** Historiquement, `web/scripts/vercel-build.sh`
appliquait les migrations et les imports AU BUILD. Deux défauts : un build
pouvait réussir en laissant la base « en retard » (`MIGRATE_DATABASE_URL`
absente → avertissement, pas échec) ; et le contrat post-import s'exécutait
après le COMMIT (« build rouge » ne voulait pas dire « rien écrit »). Le
workflow sort l'écriture du build : le build redevient un pur `next build`.
`migrate deploy` n'invente jamais de SQL : il applique uniquement les
migrations committées et relues en PR ; le gate humain est la revue de PR,
doublée de l'approbation d'environnement.

**Déclenchement automatique sans contourner le gate.** Une migration qui
atterrit sur `main` crée le run toute seule ; les required reviewers de
l'environnement `release-db` mettent le run en `waiting`. Ce qui change n'est
pas qui décide, c'est qui doit y penser — auparavant « rien ne détecte une
release oubliée » était une question ouverte. Le nom d'environnement est dédié
parce que `Production` appartient à l'intégration Vercel (noms insensibles à la
casse) : y attacher des required reviewers gaterait les déploiements Vercel.

**Motif « deux clés » sur l'import.** Sur un événement `push`, le contexte
`inputs` est vide, donc `inputs.mode == 'import-cb'` ne peut pas être vrai : un
déclenchement automatique EST un `migrate-only`. Ce raisonnement seul aurait
suffi, mais il repose sur une sémantique de plateforme qu'aucun lint de
workflow ne vérifie en CI ; les étapes d'import portent donc AUSSI
`github.event_name == 'workflow_dispatch'`. La seule chose qui ne doit JAMAIS
partir toute seule est l'import NABM ; il ne dépend pas d'un raisonnement,
même juste.

**Périmètre.** Deux modes seulement : `migrate-only` et `import-cb`. L'import
C5 CIQUAL n'est volontairement pas câblé : son garde repose sur
`VERCEL_ENV=production`, qui ne tient pas hors Vercel ; le brancher exigerait
de le refaire à la manière du garde `--base` de NABM. C5 est par ailleurs déjà
importé (append-only, idempotent) et re-semé par dump côté Scalingo
(`web/scripts/db-deploy.sh`).

**Filtre `paths`.** Un push qui ne touche pas `web/prisma/migrations/**` ne
crée aucun run — et une migration introduite autrement que par un fichier de ce
dossier n'est pas vue : il n'y a pas d'autre chemin légitime, c'est la doctrine
« registre canonique ».

## 2026-08-21 — seconde vague de déplacement

Les blocs historiques restants des deux workflows sont déplacés ici : sur
place ne restent que les invariants courts, le récit complet vit dans cette page.

### ci.yml — concurrency : pourquoi `github.run_id` sur `main` (2026-08-21)

Un run de PR supplanté par une poussée plus récente n'a pas à finir : seul le
commit de tête compte, et `wn-attendre-ci.mjs` sait lire un run `CANCELLED`
sans le prendre pour un échec. Sur `main`, le groupe porte `github.run_id` :
chaque run y est donc SEUL dans son groupe, et aucun n'annule aucun autre.
`cancel-in-progress: false` ne suffirait PAS à l'obtenir — à groupe partagé,
GitHub sérialise les runs de `main` et annule le run *pending* intermédiaire
dès qu'un troisième arrive. Trois merges dans une fenêtre de ~15 min sont
ordinaires ici ; le commit du milieu perdrait sa vérification, en silence et
sans que personne la regarde (`wn-attendre-ci.mjs` travaille sur des PR). Or
`strict` est délibérément désactivé sur la protection de `main` : le run `push`
est la SEULE vérification du résultat fusionné.

NE PAS copier `release-db.yml` par analogie : son `cancel-in-progress: false` à
groupe FIXE sérialise des ÉCRITURES sur la base de production — la seconde
release attend la première. Dans `ci.yml`, le groupe par ref DÉDOUBLONNE des
vérifications en lecture — la seconde tue la première. Raisons opposées.

### ci.yml — C4 provenance du référentiel d'ingrédients (2026-08-21)

Le drift check Prisma ne voit ni les CHECK, ni la RLS, ni les index partiels :
Prisma ne les introspecte pas. Le contrat STRUCTUREL les vérifie, et fait
échouer le CI si une colonne du catalogue biologie prend une sémantique
patient — le verrou HDS cesse d'être un commentaire pour devenir un test.
C'est le MÊME fichier (bloc DO nu) que l'import CB-02a rejoue DANS sa
transaction avant COMMIT (`prisma/importNabm.ts`) : une violation structurelle
annule alors l'import au lieu d'être constatée après coup.

C4 — provenance du référentiel d'ingrédients. Le fichier existe depuis #493 et
son changelog affirmait « câblé au CI » : il ne l'était pas, et n'a donc JAMAIS
tourné, ni en CI ni dans `wn-test-worktree.sh` (qui dérive sa liste de ce
fichier). Ce qu'il vérifie : la nullabilité APPARIÉE de
(source_provenance, source_identifiant) — sans elle, une demi-clé échappe à la
fois à l'index unique et au findFirst de l'ingestion, et le même identifiant
officiel s'insère indéfiniment ; le vocabulaire clos des provenances ; la RLS ;
et surtout que l'index côté FORME n'est PAS unique — assertion inversée,
délibérée : le rendre unique refuserait la seconde attache d'une forme
multi-substances en ayant l'air d'un durcissement.

### ci.yml — agenda alimentaire (Q_ALI_09), historique du contrat (2026-08-21)

Agenda alimentaire (Q_ALI_09, lot L3 puis L4a). Le lot L3 a déclaré sa
réserve : aucune ligne n'avait jamais été écrite ni relue contre une vraie
base. Ce contrat éprouve ce que `migrate diff` ne voit pas — la RLS, l'action
référentielle des deux clés étrangères (RESTRICT, sans lequel la suppression
nommée de `patient/effacement.ts` deviendrait du code mort en silence), et le
VERROU DE PÉRIMÈTRE qui refuse une colonne de gramme, de kcal, de score ou de
quantité — la frontière « journal alimentaire, pas carnet de pesée » cesse
d'être un commentaire. Le même verrou existe côté JSONB (clés de premier
niveau de `reponses`), mais il est VACUE en CI : la base y est vide, donc sans
clé à parcourir. C'est le chemin le moins coûteux pour ranger un agrégat, donc
celui à rejouer à la main sur la production.

Il porte aussi une assertion INVERSÉE, délibérée : AUCUN index unique sur
(id_assignation, date_jour). En poser un ressemblerait à un durcissement et
casserait le modèle append-only — les lignes supplantées restent, et
`lignes − dates distinctes` est le taux de correction. Ses trois invariants de
DONNÉES (verrou de périmètre JSONB ci-dessus, version de contrat, chaînage de
correction) sont vacués sur la base CI, vide : ils sont là pour être rejoués en
lecture seule sur la production.

### release-db.yml — D-044, le chemin clinique dans `paths` (2026-08-21)

LE CONTRAT DE FRAÎCHEUR DES CLAIMS N'AURAIT JAMAIS DÉMARRÉ SEUL. Il ne se joue
que contre la production, donc dans ce workflow ; or le LOT-01 ne porte AUCUNE
migration, et `paths` ne voyait que `web/prisma/migrations/**`. Un contrat
câblé qui ne se déclenche jamais se lit pourtant comme un contrat — c'est le
précédent D-015 (`agenda_alimentaire_v1.sql`, rejeu promis, jamais câblé) qu'on
refuse de répéter.

CE QUE CETTE LIGNE ÉLARGIT, EN TOUTES LETTRES : une modification d'une table de
règles cliniques PROPOSE désormais une release. Elle ne l'approuve pas —
l'environnement protégé `release-db` et ses required reviewers restent le seul
chemin, et sur un `push` un déclenchement automatique est un `migrate-only`
(no-op s'il n'y a pas de migration neuve). Le gain est le rejeu des contrats de
lecture sur la production à chaque changement d'une table signée, c'est-à-dire
exactement quand la question « ces claims tiennent-ils encore ? » se pose.

### release-db.yml — le garde de ref en deux jobs (2026-08-21)

`workflow_dispatch` accepte n'importe quelle ref, et un environnement GitHub
accepte TOUTES les branches par défaut. Sans ce garde, un dispatch depuis une
branche appliquerait à la production un SQL jamais relu — et l'approbateur ne
verrait pas la ref, que l'interface Actions ne met pas en avant. La doctrine
« migration committée → PR relue → merge sur `main` » était mécanique tant que
le build de `main` était le seul écrivain ; elle deviendrait déclarative au
moment précis où ce chemin devient unique.

Le garde tient en DEUX jobs, et il faut les deux. Le `if:` du job `release`
empêche d'écrire — porté par le job, il est évalué AVANT les règles de
l'environnement, donc il ne consomme aucune approbation. Mais un job non
éligible est *skipped* : rien n'est écrit, et rien n'est DIT. Le job
`ref-refusee` porte la condition inverse et échoue bruyamment, pour que
« release refusée » ne se lise pas comme « rien à faire ». Dans ce workflow,
« fail-closed » désigne un `exit 1` nommé sur stderr : c'est ce que fait ce
second job, et pas le premier seul.

Troisième clé, côté plateforme : la restriction de branche de l'environnement
(runbook, étape ops). Elle survit à une réécriture du fichier, là où les deux
jobs se relisent en PR.

### release-db.yml — runbook du préflight packs ↔ registre (LOT-03) (2026-08-21)

> Note : ce runbook appartient à `docs/DEPLOIEMENT_RELEASE_DB.md` ; il est
> conservé ici en attendant d'y être intégré.

LOT-03, dette 4 — cohérence `packs.qids` ↔ miroir relationnel. C'est la SEULE
lecture de la vraie dérive : la base du CI est vide, le contrat y est vacu.
`BEGIN READ ONLY … ROLLBACK` dans le fichier — aucune écriture.

FAIL-CLOSED ASSUMÉ : une release ne se déploie pas sur une base en dérive. LA
CORRECTION N'EST PAS LA MÊME SELON L'ASSERTION, et le message d'échec nomme le
pack fautif :

- « derive » / « miroir orphelin » → geste PRATICIEN : ré-enregistrer le pack
  depuis l'écran, ce qui rejoue `syncPackToRegistry`. Jamais un UPDATE à la
  main.
- « qid sans definition » → ce geste-là NE MARCHE PAS : depuis le LOT-03,
  ré-enregistrer un tel pack est précisément ce que `syncPackToRegistry` refuse
  (409). Il faut créer la définition manquante, c'est-à-dire
  `npm run backfill:pack-registry:apply` — qui n'a AUCUN chemin sanctionné vers
  la production (le workflow n'offre que `migrate-only` et `import-cb`, et le
  build Vercel n'écrit pas). RÉSERVE NOMMÉE, pas un oubli : cet état ne peut
  plus naître de l'application, seulement d'une écriture hors application. S'il
  survient, il bloque les releases jusqu'à une décision humaine — et c'est le
  comportement voulu, faute de chemin d'écriture relu.

### release-db.yml — préflight fraîcheur des claims épinglés (2026-08-21)

LOT-01 chaîne T0 (D-042, précisé par D-044) — fraîcheur des claims que les
tables de règles SIGNÉES épinglent. C'est la SEULE lecture qui ait un sens : la
base du CI est vide, les 24 claims n'y existent pas, et le contrat y rougirait
sans rien prouver. Ce qui éprouve qu'il MORD est son fichier négatif, câblé en
CI — jamais dans ce workflow, il ÉCRIT ses fixtures. `BEGIN READ ONLY …
ROLLBACK` dans le fichier : aucune écriture.

FAIL-CLOSED ASSUMÉ. Une signature dit qu'un humain a relu ces claims ce
jour-là ; elle ne dit rien de ce que le corpus est devenu depuis. Si un claim
épinglé a été rejeté, désactivé, remplacé ou dépouillé de son caractère
prescriptif, la release attend un ARBITRAGE CLINIQUE — re-signer la table sans
ce claim, ou rétablir le claim par le chemin du corpus. Jamais un UPDATE à la
main sur `statut` ou `active` pour faire verdir ce préflight : ce serait
effacer le signal que ce contrat existe pour produire. Vérifié conforme sur la
production le 2026-08-11 avant ce câblage (24/24).

### release-db.yml — bump du millésime NABM (import CB-02a) (2026-08-21)

Désarmé hors du mode import-cb. L'étape reprend la séquence que le build Vercel
exécutait : advisors → import (jeton/version/sha épinglés dans le workflow,
hôte nommé au déclenchement). PAS de contrat après l'import — il est rejoué
dans la transaction (voir le bloc en fin de job).

Millésime et empreinte n'ont plus qu'UN lieu opérationnel depuis que le build
Vercel n'écrit plus : le workflow. Le jeton, lui, en a DEUX — le littéral du
`run:` et la constante qui fait autorité, `NABM_IMPORT_CONFIRMATION` dans
`web/prisma/nabmImport.ts`. Un bump de millésime doit donc changer les trois
littéraux du workflow, cette constante, ET le secret
`WN_CB_NABM_IMPORT_CONFIRMATION`, ET rouvrir une PR relue. Oublier la constante
fait échouer l'import en « Confirmation CLI invalide » — fermé, donc sans
danger, mais autant le savoir avant de chercher. Le modèle « deux clés qui
bougent ensemble » : le jeton (épinglé + secret) et l'hôte (input). Une
divergence échoue fermé (le garde `--version`/`--sha256` de `importNabm.ts`
rejette), jamais un import silencieux d'un mauvais contenu.

### release-db.yml — la garde d'approbation juge les migrations, pas l'identité de la tête (2026-09-06)

Depuis D-102, l'étape de déclenchement refusait de déployer dès que la tête
de `main` n'était **plus** le commit approuvé : `integration-link-manual-deploy`
déploie une branche, et déployer une tête différente pouvait embarquer du code
non approuvé. Le 2026-09-06, le run push 33966114073 (migration 7d8e997, D-124)
a attendu son approbation près de 20 h — pendant lesquelles un push
**documentaire** (b40e699) est arrivé sur `main`. À l'approbation, la garde a
refusé : « la tête n'est plus le commit approuvé ». Or `main` ne contenait
**aucune migration non approuvée** ; l'échec a coûté un dispatch manuel de
réparation (34021695865, vert) et laissé le run d'origine en échec — alors que
tout ce qu'il fallait écrire était exactement ce qui avait été approuvé.

La garde juge désormais le **contenu** et non l'identité. Quand la tête diffère
du commit approuvé, deux refus demeurent, entiers : la tête a quitté la ligne du
commit approuvé (`merge-base --is-ancestor` faux — force-push ou historique
réécrit : l'approbation ne dit plus rien de ce que déploierait la branche), ou
le diff `web/prisma/migrations/` entre les deux n'est pas vide (des migrations
nouvelles, que personne n'a approuvées). Sinon — la tête contient le commit
approuvé et n'apporte aucune migration — l'ensemble à écrire est identique à
l'approuvé, l'empreinte du one-off est inchangée, et refuser ne ferait
qu'allonger la fenêtre D-102 (code de la tête servi contre une base en retard).

Le prix, assumé : une tête acceptée repointe `GITHUB_SHA` sur elle, pour que la
garde « dernier déployé » attende le build qui partira réellement — sans ce
repointage, elle aurait attendu 20 minutes un déploiement du commit approuvé
condamné par coalescence. Et le cas (b) de cette garde peut désormais suivre
une écriture (la tête déployée contient le code du push intermédiaire, jamais
approuvé — même régime que les coalescences ordinaires de D-102, mais à dire) :
le commentaire de l'étape le nomme, et le message d'échec demande une
vérification à la main. Ce qui ne bouge pas : le déclenchement reste **dans**
le job protégé (D-087), et aucun push porteur d'une migration ne passe sans sa
propre approbation.
