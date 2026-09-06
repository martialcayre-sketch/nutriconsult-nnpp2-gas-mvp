# Runbook Wellneuro

> Procédures réutilisables d'exploitation et d'incident.
>
> **Réécrit le 2026-08-22 pour l'ère Scalingo** (cutover HDS du 2026-08-22,
> [[D-080]] ; livrable commandé par [[D-085]] §3). La production est l'app
> Scalingo `wellneuro`, région `osc-fr1`, ressources HDS ; la base
> PostgreSQL de l'add-on **n'est pas exposée à Internet** — tout accès passe
> par la plateforme (one-off, tunnel), jamais par une URL publique.
> Vercel/Supabase restent tièdes jusqu'au décommissionnement du 2026-09-01
> ([[D-080]]) : plus un chemin d'exploitation, seulement un filet daté.

## Vérification rapide production

1. Accéder à `https://app.wellneuro.fr`
2. Signin praticien avec compte Google `@wellneuro.fr`
3. Vérifier tableau de bord (≥1 patient visible ou message vierge cohérent)
4. Créer ou consulter une assignation de questionnaire
5. Status OK = navigable sans erreur 500

## Exécuter sur la production — one-off Scalingo

Le motif de référence pour toute commande contre la production (éprouvé le
2026-08-22 ; la base n'étant pas exposée, c'est **le** chemin d'exécution) :

```bash
# Lancer détaché (pas de TTY requis — le TTY n'est nécessaire qu'en interactif)
scalingo --app wellneuro --region osc-fr1 run --detached "npx prisma migrate status"
# → « To follow this execution, run: … logs --filter one-off-NNNN »

# Lire la sortie (relancer jusqu'à fin d'exécution)
scalingo --app wellneuro --region osc-fr1 logs --filter one-off-NNNN -n 100

# Arrêter un one-off qui n'aurait pas dû partir
scalingo --app wellneuro --region osc-fr1 one-off-stop one-off-NNNN
```

- Le one-off tourne **dans l'image du dernier déploiement réussi**, répertoire
  `web/` (Procfile) : `scripts/…` et `prisma/…` s'y résolvent directement.
- `logs --filter` filtre par **motif**, pas par égalité : toujours vérifier
  que les lignes lues portent bien le bon numéro de conteneur.
- Variables : `scalingo env-get <VAR>` pour lire UNE variable (jamais
  `scalingo env`, qui déverse toute la configuration, secrets compris) ;
  `scalingo env-set VAR=valeur` pour poser.
- **Piège `env-set`** : les conteneurs qui tournent gardent l'ancien
  environnement — un `scalingo restart` est nécessaire pour qu'ils voient la
  nouvelle valeur. Le `postdeploy`, lui, lit l'environnement **au déploiement
  suivant**.
- Accès SQL exceptionnel : `scalingo db-tunnel` (ou `scalingo run psql`
  en one-off) — lecture seule par défaut de conduite, agrégats seulement,
  jamais de colonne d'identité dans une sortie de terminal.

## Déploiement

1. Commits sur branche de feature → PR vers `main`
2. Merge sur `main` → Scalingo construit et déploie automatiquement
   (`scalingo --app wellneuro --region osc-fr1 deployments` : SHA complets,
   le plus récent en tête)
3. Variables d'environnement : `scalingo env-set` (+ `restart` si des
   conteneurs en cours doivent la voir — piège ci-dessus)
4. **Migrations DB : par le workflow `release-db` exclusivement** ([[D-087]],
   sous `WN_MIGRATIONS_PAR_RELEASE_DB=1`) — proposé automatiquement au merge
   d'une migration, appliqué en one-off **après approbation humaine**.
   Séquence et gardes : `docs/DEPLOIEMENT_RELEASE_DB.md`. Jamais de
   `migrate deploy` à la main contre la production.
5. Attendre le déploiement (~5 min) puis contrôle post-déploiement

## Contrôle post-déploiement

1. Accéder à `https://app.wellneuro.fr` (rafraîchir le cache navigateur)
2. `scalingo --app wellneuro --region osc-fr1 deployments` : le commit
   attendu est en tête, statut `success`
3. `scalingo --app wellneuro --region osc-fr1 logs -n 200` : pas d'erreur
   500 récente ni de crash de conteneur
4. Tester une assignation simple sur dossier de test ([[D-075]] : les
   dossiers de test se lisent par identifiant, jamais par nom dans un outil)

## Rollback

1. Identifier le commit défaillant
2. **Revert par PR** (`git revert` + PR + merge) — jamais de
   `git reset --hard` sur `main` : l'historique de `main` est la référence
   des déploiements et des releases DB
3. Merge → Scalingo redéploie ; contrôle post-déploiement
4. **Deux avertissements ([[D-087]])** :
   - redéployer un slug **antérieur au 2026-08-22** ré-active
     l'auto-migration du `postdeploy` (ancien `db-deploy.sh`) — un rollback
     de code peut migrer au passage ;
   - un rollback de **schéma** ne se fait jamais par le code : une migration
     DROP appliquée ne se défait que par **restauration de base**
     (sauvegardes Scalingo ; la copie Supabase n'est un filet que jusqu'au
     2026-09-01, [[D-080]]). Décision du responsable, jamais un geste par
     défaut.

## Incident : Scalingo / DNS / Configuration

- `scalingo --app wellneuro --region osc-fr1 deployments` puis
  `logs -n 500` : cerner build raté vs crash runtime vs configuration
- Vérifier les variables une à une par `env-get` (jamais `env`)
- DNS : `app.wellneuro.fr` pointe vers Scalingo depuis le cutover — vérifier
  registrar et domaine côté dashboard Scalingo
- Statut plateforme : <https://scalingostatus.com>
- (Jusqu'au 2026-09-01 seulement : l'ancienne pile Vercel existe encore —
  `docs/claude/CONTEXTE_SESSION_VERCEL_2026-07-01.md` pour l'historique.)

## Incident : OAuth Google

1. Vérifier `GOOGLE_CLIENT_ID` posée (`scalingo env-get GOOGLE_CLIENT_ID`)
   et le secret présent (par sa longueur, jamais par sa valeur :
   `scalingo env-get GOOGLE_CLIENT_SECRET | wc -c`)
2. Vérifier application OAuth Google Console : domaine autorisé
   `app.wellneuro.fr`
3. Révoquer session test et retester signin frais

## Incident : base PostgreSQL / Prisma

1. La base n'est **pas joignable depuis Internet** : diagnostiquer par
   one-off — `scalingo run --detached "npx prisma migrate status"` puis
   `logs --filter one-off-NNNN`
2. Erreurs `PrismaClientInitializationError` dans `scalingo logs` :
   vérifier `SCALINGO_POSTGRESQL_URL` **présente** (`env-get … | wc -c`,
   jamais la valeur) et l'état de l'add-on dans le dashboard
3. Schéma suspect : `scalingo run --detached "npx prisma db execute --stdin"`
   n'est PAS le chemin — passer par un one-off `psql` en lecture, ou par le
   contrat `release-db-statut.sh` si la question est « la base est-elle à
   jour ? »
4. En local seulement : `cd web && npx prisma generate` après modification
   du schéma

## Suspicion fuite secret

1. Lancer `bash scripts/check_no_secrets.sh` immédiatement
2. Vérifier `scalingo logs` (pas d'affichage accidentel de clé — l'incident
   type : une URL de base avec identifiants dans un log)
3. Si confirmé : révoquer tokens/clés compromis dans les services (jeton
   d'API Scalingo : dashboard → révoquer le jeton dédié, le workflow
   `release-db` échouera fail-closed jusqu'à repose)
4. Committer un fix sans jamais coller le secret lui-même

## Révocation accès patient

> Corrigé le 2026-07-22 (exercice sur table, constat EX-1) : l'ancienne
> version référençait `Patient.portailToken`, champ qui n'existe pas, et
> ignorait la route applicative prévue pour ce cas. Recalé le 2026-08-22
> après la purge [[D-085]] §5 : le jeton permanent n'existe plus en base,
> `accessTokenRevoked` est le drapeau de révocation du **compte**.

1. Depuis le tableau de bord praticien, révoquer l'accès du patient
   (panneau patients) — ou `DELETE /api/praticien/token?idPatient=...`.
   La route ferme **les trois portes en une transaction** : compte
   (`accessTokenRevoked`), sessions déjà ouvertes (`sessionsInvalidesAvant`),
   liens magiques encore en vol (datés `consommeLe`).
2. Vérifier le refus côté patient : ancien lien → message d'indisponibilité,
   session `wn_portail` existante refusée.
3. Si l'accès doit être rétabli : réémettre et envoyer un nouveau lien
   (`POST /api/praticien/token`, bouton « Renvoyer le lien »). La réémission
   ne rouvre pas les sessions antérieures (`sessionsInvalidesAvant` survit).

### Désactiver n'est pas révoquer, et les deux ferment les liens

Désactiver un dossier (`PATCH /api/praticien/patients`, menu « Désactiver le
dossier ») ferme aussi les liens magiques encore en vol — mais **par
`expireLe`, jamais par `consommeLe`** ([[D-126]]). Les deux gestes se
distinguent donc en base :

| Geste | `accessTokenRevoked` | `sessionsInvalidesAvant` | Liens en vol | `consomme_le` |
|---|---|---|---|---|
| Révoquer | `true` | daté | `expire_le` avancé à cette date | **jamais touché** |
| Désactiver | inchangé | inchangé | `expire_le` avancé à maintenant | **jamais touché** |

Depuis `D-128`, aucun geste praticien n'écrit `consomme_le` : **une date de
consommation est une entrée du patient, et rien d'autre** — pour toute ligne
écrite depuis. Les lignes antérieures, elles, restent ambiguës (`D-128`, écart
résiduel n° 1).

En forensique, un lien non fermé porte `expire_le = cree_le + 24 h` EXACTEMENT
(`DUREE_VALIDITE_MS`). Un écart plus court signe une fermeture praticien — mais
depuis `D-128` il ne signe plus la seule désactivation : les deux gestes ferment
par l'horizon. Pour les SÉPARER, comparer `expire_le` à
`patients.sessions_invalides_avant` : égalité à la milliseconde = révocation
(même objet `Date`, même transaction) ; sinon, désactivation. Le prédicat
d'écart reste celui-ci :

    abs(extract(epoch from (expire_le - cree_le)) - 86400) > 60

La tolérance de 60 s absorbe la dérive d'horloge entre l'application, qui
calcule `expire_le`, et Postgres, qui pose `cree_le` par défaut ; sans elle, un
lien parfaitement normal satisferait le prédicat. Angle mort résiduel, à
connaître : une désactivation survenue dans la MINUTE qui suit l'émission du
lien reste indiscernable. Ne pas retenir de seuil large (`23 hours` par
exemple) : il manquerait toute désactivation survenue dans la dernière heure de
vie du lien — un faux négatif silencieux, au pire moment.

Réactiver ne rouvre aucun lien déjà fermé : il faut en réémettre un. Réserve :
un lien né pendant la fermeture elle-même peut y échapper (course nommée en
écart résiduel n° 3 de `D-126`) et redevenir utilisable si le dossier est
réactivé sous 24 h.

## Violation de données personnelles

Si un incident touche des données patient (divulgation, altération, perte —
même sans certitude), suivre `docs/PROCEDURE_VIOLATION_DONNEES.md` :
**horodater la prise de connaissance immédiatement** (le délai CNIL de 72 h
court à partir de là), ouvrir une fiche au registre, endiguer via les
procédures ci-dessus, puis qualifier le risque avant de décider notification
et information des personnes. Le registre physique des violations est ouvert
depuis le 2026-08-22 ([[D-085]] §3), tenu hors dépôt par le responsable.

## Contrôles avant commit

```bash
bash scripts/check_no_secrets.sh
cd web && npm run type-check
```
