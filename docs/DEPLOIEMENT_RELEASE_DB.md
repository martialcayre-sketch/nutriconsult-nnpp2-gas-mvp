# Release DB — appliquer migrations et imports hors du build Vercel

Ce document décrit le workflow GitHub Actions [`release-db.yml`](../.github/workflows/release-db.yml)
et son runbook. Il sépare l'**écriture en base de production** (migrations Prisma,
import de nomenclature NABM) du **build applicatif Vercel**.

> **Réécriture du 2026-08-22 — la cible est Scalingo, et le chemin passe par
> un one-off.** Le cutover HDS a déplacé la production sur Scalingo, dont la
> base **n'est pas exposée à Internet** : le workflow ne s'y connecte plus
> jamais directement (le secret `MIGRATE_DATABASE_URL`, resté pointé sur
> Supabase, a appliqué la purge #746 sur l'ancienne base — constat qui a
> déclenché cette réécriture). Le job `release` exécute désormais
> `web/scripts/release-db-scalingo.sh` (les quatre préflights lecture seule,
> puis `migrate deploy`) **en one-off dans l'image de production**, via le
> CLI Scalingo (secret `SCALINGO_API_TOKEN` — un jeton d'API, pas une URL de
> base), après avoir constaté que le commit approuvé est déployé. Sortie par
> sentinelles (`WN_RELEASE_DB_OK`/`WN_RELEASE_DB_ECHEC`), contre-épreuve
> `migrate status` par un second one-off. Côté app, le `postdeploy` ne migre
> plus quand `WN_MIGRATIONS_PAR_RELEASE_DB=1` est posé (production seule —
> le staging garde l'auto-migration) : l'approbation humaine redevient
> l'unique porte d'écriture du schéma. L'ordre est donc **code d'abord,
> migration après approbation** — un ADD se protège par drapeau éteint, un
> DROP rend le retour arrière dépendant d'une restauration de base. Le mode
> `import-cb` est **hors service** (il visait Supabase) jusqu'à sa
> réécriture avec la Phase C. Décision : [[D-087]] — le régime transitoire
> « gate au merge » que décrivait [[D-086]] prend fin à la pose du drapeau
> (ses §1-2 sont supplantés, son §3 — vérification par one-off — demeure).
> Les sections ci-dessous décrivent l'ère Vercel/Supabase et restent la
> référence pour le raisonnement d'origine.

## Mise en service Scalingo — séquence (2026-08-22)

L'ordre compte : chaque étape laisse la production avec **au moins un chemin
de migration fonctionnel**.

1. **Poser le drapeau avant le merge** — sans effet tant que l'ancien slug
   tourne, son `db-deploy.sh` l'ignore :
   `scalingo --app wellneuro --region osc-fr1 env-set WN_MIGRATIONS_PAR_RELEASE_DB=1`.
   Le drapeau est lu par le `postdeploy` **au déploiement suivant**, pas par
   les conteneurs qui tournent : aucun restart nécessaire.
2. **Merger la PR** : le déploiement Scalingo qui suit embarque le nouveau
   `db-deploy.sh` — à partir de là, le `postdeploy` ne migre plus.
3. **Poser le secret `SCALINGO_API_TOKEN`** dans l'environnement GitHub
   `release-db` (jeton d'API créé dans le dashboard Scalingo — de préférence
   **dédié à ce workflow**, révocable seul), et **supprimer
   `MIGRATE_DATABASE_URL`** du même environnement : le workflow ne la lit
   plus, et la laisser serait offrir l'incident du 2026-08-22 à la prochaine
   main qui la trouve.
4. **Répétition générale, à vide** — après avoir **constaté** qu'elle est à
   vide, pas supposé : `scalingo --app wellneuro --region osc-fr1 run
   "npx prisma migrate status"` doit dire « up to date » (sinon une
   migration en attente ferait de la « répétition » une vraie release).
   Puis `gh workflow run release-db.yml --ref main -f mode=migrate-only`,
   et approuver. Le run éprouve **toute la chaîne** (auth par jeton,
   drapeau constaté, garde de déploiement, one-off, sentinelles,
   contre-épreuve) sans rien écrire. **Tant que cette répétition n'est pas
   verte, ne pas merger de migration.**
5. **Retour arrière de la transition** (si la répétition échoue) :
   `env-unset WN_MIGRATIONS_PAR_RELEASE_DB` rend l'auto-migration au
   `postdeploy` pendant qu'on corrige — la production ne reste jamais sans
   chemin de migration.

À connaître, en régime établi :

- **Un redéploiement d'un slug antérieur au 2026-08-22 ré-active
  l'auto-migration** : l'ancien `db-deploy.sh` ignore le drapeau. Un
  rollback de code peut donc migrer au passage — le savoir avant de
  rollbacker.
- **Annuler le job GitHub n'arrête pas un one-off lancé** (`--detached`) :
  la migration continue pendant que le workflow s'affiche annulé.
  `scalingo one-off-stop <conteneur>` l'arrête vraiment ; un run annulé se
  vérifie comme un run muet — à la main, jamais par relance à l'aveugle.
- **Migration en échec après déploiement du code** : le filet « postdeploy
  en échec = déploiement annulé » n'existe plus sous le drapeau. Un run
  rouge laisse code neuf + schéma ancien ; la sortie est une décision du
  responsable — correctif en avant, ou rollback de slug (en connaissant le
  premier point) — voir [[D-087]].

## Pourquoi

`web/scripts/vercel-build.sh` appliquait historiquement les migrations et les
imports **au build**.

**Ce que le workflow corrige.** Deux choses :

1. **L'écriture sans approbation** — toute PR mergée écrivait en production au
   déploiement suivant, sans autre gate que la revue de code. L'écriture est
   désormais un acte explicite : **proposé** automatiquement, **approuvé** dans un
   environnement protégé. Le déclenchement est mécanique, la décision ne l'est pas.
2. **Rouge ≠ rien écrit** — le contrat CB-02a s'exécutait **après le COMMIT** de
   l'import : un échec de contrat laissait la donnée écrite et le build rouge.
   Les invariants structurels sont maintenant rejoués **dans** la transaction
   d'import ; une violation l'annule.

**Ce que le workflow déplace, et qu'il ne faut pas croire fermé.** L'alignement
code↔schéma. Avant, `migrate deploy` tournait avant `next build` : la migration
partait avec le code, et un échec rendait le build rouge — l'alignement était
garanti **par construction** (le fail-open `MIGRATE_DATABASE_URL` absente en
était l'exception connue). Il est ensuite passé au procédural — et
**rien ne rappelait une release oubliée** : merger une PR de migration sans
déclencher `release-db` servait du code contre une base en retard, en silence.

C'est ce que le déclenchement automatique a refermé : une migration qui atteint
`main` crée son run, qui reste visible en attente jusqu'à ce qu'on l'approuve ou
qu'on le rejette. Le rappel est redevenu mécanique ; **l'approbation, elle, reste
humaine**. Ce qui subsiste est l'ordre expand/contract, décrit plus bas : le
déclenchement automatique raccourcit la fenêtre entre le déploiement du code et
l'application de la migration, il ne la ferme pas.

> **Cette bascule déplace le risque, et il faut le savoir.** Avant, il fallait
> DEUX choses pour écrire en production : qu'un humain clique « Run workflow »,
> **et** que l'environnement gate. Il n'en reste qu'une. Si les *required
> reviewers* de l'environnement `release-db` étaient vidés ou sa politique de
> branches élargie, un push de migration s'appliquerait **sans aucune action
> humaine** — alors qu'auparavant ce même défaut de configuration restait
> inoffensif tant que personne ne déclenchait. Vérifié le 2026-08-05 :
> reviewers = `martialcayre-sketch`, branches restreintes à `main`. À relire lors
> de toute reprise du dépôt, et `scripts/release-db-invariants.test.mjs` verrouille
> en CI ce que le dépôt, lui, peut garantir.
>
> À connaître aussi : `prevent_self_review` est **désactivé** — avec un seul
> relecteur, l'activer rendrait toute release impossible. Le second gate est donc
> un **temps d'arrêt**, pas un second regard.

Le workflow `release-db` porte l'écriture ; le build est redevenu un pur
`next build` sans effet de bord (bascule « le build Vercel n'écrit plus en
base », 2026-07-28). Il
s'aligne sur le modèle déjà en place côté Scalingo (`web/scripts/db-deploy.sh` +
`postdeploy` du Procfile), où les migrations tournent **après** le build sur un
conteneur dédié.

## Ce que le workflow fait

**Proposé automatiquement** dès qu'une migration atterrit sur `main` (déclencheur
`push` filtré sur `web/prisma/migrations/**`), et toujours déclenchable à la main
(`workflow_dispatch`) — seul chemin pour `import-cb`, qui exige de nommer l'hôte
visé. Dans les deux cas, gaté par l'environnement protégé `release-db` (required
reviewers = **second gate humain**, en plus de la revue de la PR qui a mergé la
migration).

**L'automatisation porte sur le déclenchement, jamais sur l'approbation.** Ce qui
change n'est pas qui décide, c'est qui doit y penser : auparavant, rien ne
rappelait qu'une migration mergée attendait sa release, et « rien ne détecte une
release oubliée » figurait en question ouverte du lot qui a créé ce workflow. Un
run en attente est désormais cette détection.

Un déclenchement par `push` **est** un `migrate-only` par construction : sur cet
événement le contexte `inputs` est vide, donc toutes les étapes gardées par
`inputs.mode == 'import-cb'` s'écartent d'elles-mêmes. Ce n'est pas une
convention à respecter, c'est une propriété du fichier.

Séquence :

```
préflight (lecture seule) → migrate deploy → [import-cb] advisors → import NABM
```

Deux modes :

| Mode | Effet |
|---|---|
| `migrate-only` | préflight + `prisma migrate deploy` |
| `import-cb` | idem + advisors Supabase (`--fail-on warn`) + import NABM CB-02a |

`migrate deploy` n'invente jamais de SQL : il applique les migrations committées
(relues en PR). L'import NABM est **transactionnel et idempotent** : rejouable
sans risque, il sort sans écrire si le millésime+empreinte sont déjà servis.

> **Aucun contrat de catalogue ne tourne sur la production.** Le workflow n'en
> rejoue pas après l'import — c'est écrit en toutes lettres dans
> `release-db.yml`. Ce qui est vérifié *dans* la transaction d'import
> (`prisma/importNabm.ts`) : les invariants **structurels** (CHECK, RLS, index
> partiels, verrou HDS) et une relecture des données importées ; une violation
> annule l'import. Ce qui n'est vérifié **nulle part sur la production** : le
> contrat de catalogue `prisma/checks/cb_biologie_catalogue_v1.sql` — donc la
> barrière D-003, les incompatibilités pendantes, les correspondances signées non
> résolues. Il porte sur des plages et des liens peuplés par **d'autres** lots,
> hors du chemin d'import ; il est joué **en CI, sur une base éphémère**, plus le
> banc `web/scripts/test-cb-nabm-import.sh`. Ne pas lire un `import-cb` vert
> comme une attestation D-003 en production.

### Pourquoi l'import C5 CIQUAL n'est PAS câblé ici

Volontaire. L'import C5 (`prisma/importCiqual2025.ts`) garde son écriture derrière
`VERCEL_ENV === 'production'` — un contrôle qui **ne tient pas hors Vercel** et
qu'il faudrait désarmer (`--allow-non-production`) pour le lancer en Actions, ce
qui reviendrait au faux-garde que l'import NABM a précisément remplacé par
`--base`. Avant de brancher C5 ici, refaire son garde à la manière de NABM (nommer
l'hôte visé) — petit refactor à revoir en adversarial. En pratique, C5 est déjà
importé (append-only, idempotent) et re-semé par **dump/restore** côté Scalingo,
donc sans besoin immédiat d'un chemin d'exécution.

## Étapes ops (une seule fois — responsable)

Ces gestes se font dans l'interface, hors code :

1. **GitHub → Settings → Environments → `release-db`** : créer l'environnement,
   activer **Required reviewers** (les personnes autorisées à approuver une
   écriture prod). **Pourquoi ce nom dédié, et pas `production`** : l'environnement
   `Production` existe déjà — c'est celui de l'intégration Vercel, et les noms
   d'environnement GitHub sont insensibles à la casse. Y attacher des required
   reviewers gaterait tous les déploiements Vercel. Ne pas « simplifier » ce nom.
   Dans le même écran, **Deployment branches and tags → Selected branches →
   `main`** : un environnement GitHub accepte **toutes** les branches par défaut,
   et `release-db` se déclenche par `workflow_dispatch` avec la ref choisie au
   déclenchement — sans cette restriction, le SQL d'une branche jamais relue ni
   mergée pourrait s'appliquer à la production, et la doctrine « migration
   committée → PR relue → merge sur `main` » perdrait son ressort mécanique au
   moment même où ce chemin devient unique.
2. **Secrets de l'environnement `release-db`** :
   - ~~`MIGRATE_DATABASE_URL` — URL directe Supabase (session mode, port
     5432)~~ — **supprimée depuis [[D-087]]** (2026-08-22) : le workflow ne
     lit plus aucune URL de base (la base HDS n'est pas exposée à Internet,
     le repointage envisagé par `D-086` §2 était matériellement impossible) ;
     le secret vivant est `SCALINGO_API_TOKEN`, jeton d'API du one-off.
   - `WN_CB_NABM_IMPORT_CONFIRMATION` — jeton `CB-02A-IMPORT-NABM-V105-MC-2026-07-26-v1`
     (doit être **identique** à la constante épinglée dans le code, sinon l'import
     refuse).
3. **Retirer de Vercel** (scope Production) `MIGRATE_DATABASE_URL` et les jetons
   d'import `WN_C5_CIQUAL_IMPORT_CONFIRMATION` / `WN_CB_NABM_IMPORT_CONFIRMATION` /
   `WN_CB_NABM_IMPORT_BASE`. Depuis l'allègement, le build ne les lit plus : ce
   retrait est de l'hygiène (ne pas laisser traîner la connexion de prod), pas une
   condition de correction.

> **Ordre de bascule.** `release-db` est l'**unique** chemin d'écriture : le
> build ne migre plus. Les étapes 1–2 (environnement `release-db` + secrets)
> conditionnent la bascule « le build Vercel n'écrit plus en base » : elles
> devaient être faites **avant** son merge, et sans elles plus aucun chemin
> n'applique les migrations — la base fige. Si ce document est lu alors que le
> workflow n'a jamais tourné, c'est la première chose à vérifier. Depuis que le
> déclenchement est automatique, un run apparaît de lui-même à chaque migration
> mergée — mais il **reste en attente** tant que personne n'approuve, et une
> approbation donnée sans les secrets échouerait sur la garde
> `MIGRATE_DATABASE_URL`. Un run en `waiting` qui s'éternise et un run absent
> disent deux choses différentes : le premier attend un humain, le second dit que
> le déclencheur n'a pas vu la migration.

## Un run en attente n'est pas neutre — le rejeter, ou l'approuver

Le groupe de concurrence `release-db-production` n'admet qu'une release à la fois,
et `cancel-in-progress: false` fait patienter les suivantes plutôt que de les
annuler. Un run laissé en `waiting` a donc trois effets qu'il vaut mieux connaître
avant de le laisser traîner :

1. **Il occupe le groupe.** Un `workflow_dispatch` urgent — reprise après échec, ou
   `import-cb` — reste *pending* derrière lui. Il faut rejeter le premier pour
   passer devant.
2. **GitHub ne garde qu'un seul run en attente.** Trois migrations mergées coup sur
   coup laissent le premier et le dernier ; le run intermédiaire est annulé. La
   base finit correcte — `migrate deploy` applique tout ce qui est en attente — mais
   **le résumé de la migration intermédiaire disparaît** avec son run.
3. **Il ne périme pas.** Rien ne rappelle un run vieux d'une semaine ; c'est un
   rappel, pas une alarme.

Règle simple : un run qu'on ne veut pas approuver se **rejette**, il ne se laisse
pas dormir. Le rejeter est une trace, l'ignorer n'en est pas une.

## L'ordre que ce workflow ne peut pas garantir seul

L'ordre attendu est **migration d'abord, code ensuite** : le code tolère une base
« en avance », l'inverse n'est pas vrai.

**Une PR unique ne peut pas tenir cet ordre.** `release-db` ne part que de `main`,
et le merge qui y pose la migration **déclenche aussi le déploiement Vercel**. Si
la migration et le code qui en dépend voyagent ensemble, le code est en production
avant que la release ait pu être approuvée — et la surface concernée rend une
erreur technique pendant tout l'intervalle. Constaté le 2026-08-05 sur #574 : la
page « Mon bilan », sans drapeau, a été déployée alors que sa colonne n'existait
pas encore.

Deux façons de tenir l'ordre, à choisir **au cadrage du lot**, pas après :

1. **Séparer en deux PR** — migration d'abord, release approuvée et vérifiée en
   base, puis le code. C'est l'expand/contract classique.
2. **Faire partir le code derrière un drapeau éteint**, allumé une fois la colonne
   vérifiée en base. C'est le motif retenu pour l'agenda alimentaire.

Le déclenchement automatique **raccourcit** cette fenêtre — la demande
d'approbation s'affiche dès le merge au lieu d'attendre qu'on y pense — mais il ne
la ferme pas. Seules les deux options ci-dessus la ferment.

## Déclencher une release

Le cas courant n'a plus besoin de cette section : une migration mergée sur `main`
crée son run toute seule, et il ne reste qu'à l'approuver. Ce qui suit vaut pour
un déclenchement manuel — `import-cb`, ou une reprise après échec.

Interface : **Actions → Release DB → Run workflow**, choisir le `mode`. Ou :

```bash
# Migration seule
gh workflow run release-db.yml -f mode=migrate-only
```

### La tête a bougé pendant l'attente d'approbation — ce que fait la garde

`integration-link-manual-deploy` déploie une **branche**, pas un SHA : la
release ne peut déclencher que sur la tête de `main`. Quand celle-ci a bougé
depuis l'approbation, la garde tranche sur le **contenu**, pas sur l'identité :

- la tête a quitté la ligne du commit approuvé (force-push, historique réécrit)
  → **refus**, l'approbation ne dit plus rien de ce que déploierait la branche ;
- la tête apporte des **migrations nouvelles** (`git diff <approuvé> <tête> --
  web/prisma/migrations/` non vide) → **refus**, rejeter le run puis relancer en
  `workflow_dispatch` sur `main`, dont la tête sera alors le commit jugé ;
- la tête contient le commit approuvé **sans toucher aux migrations** (push
  documentaire ou applicatif) → la release **continue** : l'ensemble à écrire
  est identique à l'approuvé (l'empreinte du one-off ne change pas). Le
  déploiement part sur la tête, et la garde « dernier déployé » est repointée
  sur elle — c'est elle que le build produira, pas le commit approuvé.

Conséquence à connaître : dans ce dernier cas, l'image déployée contient le code
du push intermédiaire (jamais approuvé — même régime que les coalescences
ordinaires du D-102), et si le build de la tête échoue, la garde peut refuser
**après** une écriture. Un tel refus se vérifie à la main, comme un run muet.
Avant ce jugement de contenu (2026-09-06), tout push postérieur à
l'approbation faisait échouer la release — y compris un push documentaire, en
pleine fenêtre d'attente de plusieurs heures (run 33966114073).

Depuis le 2026-08-22, `mode=import-cb` est **refusé explicitement** par le
workflow (hors service — il visait Supabase, l'input `nabm_base` a disparu
avec lui) ; sa réécriture pour Scalingo viendra avec la Phase C.

L'exécution reste **en attente d'approbation** tant qu'un reviewer de
l'environnement `release-db` ne l'a pas approuvée.

## Ordonnancement — expand/contract

Une migration **additive** s'applique via `release-db` **avant** le déploiement du
code qui en dépend (garder la PR de migration séparée de la PR fonctionnelle,
comme déjà pratiqué). Le code déployé tolère une base « en avance » **à condition
que la migration soit additive** — colonnes nullables, rien de retiré ni renommé ;
jamais une base « en retard » sur du code qui exige le nouveau schéma.
La condition n'est pas théorique : `20260731200000_c4_composition_dose`
renomme `dose_par_portion` en `dose_par_djr`, et son en-tête décrit le 500
(erreur 42703) que l'ancien code prend en pleine face pendant la fenêtre où il
sert encore. Une migration non additive impose donc de synchroniser release et
déploiement, ou d'accepter une indisponibilité annoncée. Ordre type :

1. Merger la PR de migration → déclencher `release-db` (`migrate-only`) → approuver.
2. Vérifier la base (ci-dessous).
3. Merger/déployer la PR fonctionnelle qui consomme le schéma.

## Vérifier après coup

Lecture seule via l'outil MCP Supabase `execute_sql` (voir `CLAUDE.md` → « Lire la
base de production ») :

- **Migration appliquée** — agréger `_prisma_migrations` par nom (une migration
  porte plusieurs lignes) :
  ```sql
  SELECT migration_name,
         bool_or(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS appliquee
  FROM _prisma_migrations GROUP BY migration_name
  ORDER BY max(started_at) DESC LIMIT 5;
  ```
- **Pointeur NABM cohérent** (après `import-cb`) :
  ```sql
  SELECT v.version_source, v.nombre_entrees,
         (SELECT count(*) FROM biology_nabm_actes a WHERE a.version_source = v.version_source) AS actes
  FROM biology_catalog_versions_courantes v WHERE v.source_provenance = 'nabm_smt_ans';
  ```
  `nombre_entrees` doit égaler le compte d'actes du millésime servi.

Cette vérification post-déploiement est **obligatoire** pour une release de
migration ou d'import (exception migration/auth de `CLAUDE.md`).
