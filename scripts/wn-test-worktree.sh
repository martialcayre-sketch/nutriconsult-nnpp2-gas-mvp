#!/usr/bin/env bash
# Réplique locale du job CI `verify` (.github/workflows/ci.yml) dans le
# worktree courant, avec un PostgreSQL éphémère isolé par worktree.
# Ordre fail-fast — contrôles statiques d'abord, base ensuite :
#   anti-secrets → audit campagnes → bancs `node --test` → prisma generate
#   → scoring → type-check → vitest → vitest SIIN 57 → lint → PostgreSQL
#   éphémère → migrate deploy → dérive
#   schéma↔migrations → contrats SQL (prisma/checks) → seed → build
#   → Playwright (Chromium + WebKit) contre
#   le build de production (`next start`), le même artefact que Vercel déploie.
#
# Gates de sûreté avant déploiement (chaîne du workflow release-db —
# `migrate deploy` s'exécute en production hors du build Vercel) :
#   - dérive schéma↔migrations : `prisma migrate diff` compare la base
#     éphémère (construite uniquement par `migrate deploy`) à schema.prisma
#     et échoue si le schéma a évolué sans migration committée — le client
#     Prisma déployé attendrait sinon un schéma que la base n'aura jamais ;
#   - certification scoring : les 63 questionnaires restent conformes à leurs
#     fixtures certifiées (protège la logique clinique) ;
#   - e2e sur build de production : plus rapide (aucune compilation à la
#     demande) et plus fidèle (bundles React prod, prerender identique).
#
# Usage, depuis web/ de n'importe quel worktree (ou du checkout principal) :
#   npm run test:worktree               # séquence CI complète
#   npm run test:worktree -- --fast     # saute anti-secrets, audit, scoring,
#                                       # vitest SIIN 57, lint. Les bancs
#                                       # `node --test` y restent : ~4 s à eux
#                                       # cinq. Le build N'EST PAS sauté — les
#                                       # e2e tournent contre le build de
#                                       # production dans les deux modes.
#   npm run test:worktree -- --keep-db  # conserve la base après le run
#
# Isolation : port PostgreSQL (5500-5599) et port applicatif (3100-3199)
# dérivés du chemin du worktree, avec sondage en cas d'occupation — plusieurs
# worktrees (campagnes en parallèle) peuvent valider sans se contaminer. La
# base est recréée à chaque run (parité CI), données 100 % fictives via le seed.
#
# Plateformes : Linux/Debian (PostgreSQL installé au besoin via apt-get) et
# macOS (PostgreSQL fourni par Homebrew, détecté automatiquement — installer
# avec `brew install postgresql@15` pour la parité stricte avec le service CI).
# Sur macOS aucune dépendance système Playwright n'est requise : `--with-deps`
# ne concerne que les distributions Linux, donc aucun sudo n'est demandé.
#
# Divergence CI assumée : PostgreSQL Debian (17 sur trixie) vs postgres:15 en
# CI. Les migrations sont du SQL standard rejoué par `migrate deploy` ; pour
# une parité stricte, installer postgresql-15 via le dépôt PGDG et exporter
# WN_PG_BIN=/usr/lib/postgresql/15/bin.
#
# L'installation Debian crée un cluster `main` sur 5432 : sans incidence ici
# (plage 5500-5599), ne pas le supprimer.
#
# Overrides : WN_PG_PORT, WN_APP_PORT, WN_PG_BIN.
#
# Note hook Claude (.claude/hooks/block-risky-commands.mjs) : il n'inspecte que
# la ligne de commande Bash, ce script reste donc invocable sans
# WN_ALLOW_RISKY_COMMAND ; le garde-fou interne (base locale uniquement,
# identifiants jetables ci_user/wellneuro_ci) compense.
set -euo pipefail

die() { printf 'Erreur : %s\n' "$*" >&2; exit 1; }

# Chaque appel à step() clôt le chronométrage de l'étape précédente ; le
# récapitulatif final aide à repérer l'étape qui ralentit la séquence.
STEP_NAMES=()
STEP_TIMES=()
STEP_LAST=0
step() {
  local now=$SECONDS
  if ((${#STEP_NAMES[@]} > 0)); then
    STEP_TIMES+=("$((now - STEP_LAST))")
  fi
  STEP_LAST=$now
  STEP_NAMES+=("$*")
  printf '\n\033[1m── %s ──\033[0m\n' "$*"
}

recap() {
  local i
  printf 'Durées par étape :\n'
  for ((i = 0; i < ${#STEP_TIMES[@]}; i++)); do
    printf '  %3d min %02d s  %s\n' \
      "$((STEP_TIMES[i] / 60))" "$((STEP_TIMES[i] % 60))" "${STEP_NAMES[i]}"
  done
}

usage() {
  cat <<'EOF'
Usage : npm run test:worktree [-- options]   (depuis web/)
        bash scripts/wn-test-worktree.sh [options]

Réplique le job CI `verify` avec un PostgreSQL éphémère isolé par worktree.

Options :
  --fast      Saute anti-secrets, audit campagnes, certification scoring et
              lint (garde generate/type-check/vitest/migrate/dérive
              schéma↔migrations/seed/build/e2e).
              Le BUILD n'est plus sauté : les e2e tournent contre le build de
              production dans les deux modes. Sur `next dev` ils étaient cinq
              fois plus lents ET instables — voir le commentaire de la section
              « Build et E2E ».
  --keep-db   Ne détruit pas la base à la fin ; imprime l'URL et la
              commande d'arrêt manuel.
  --help      Affiche cette aide.

Variables : WN_PG_PORT, WN_APP_PORT (forcer les ports), WN_PG_BIN
            (répertoire des binaires PostgreSQL à utiliser).
EOF
}

# ── Arguments ────────────────────────────────────────────────────────────────
FAST=0
KEEP_DB=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast) FAST=1 ;;
    --keep-db) KEEP_DB=1 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; die "option inconnue : $1" ;;
  esac
  shift
done

# ── Chemins (résolus depuis le script, jamais depuis le cwd) ────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
WEB="$ROOT/web"
[[ -f "$WEB/package.json" ]] || die "web/package.json introuvable sous $ROOT — dépôt inattendu."

SLUG="$(basename "$ROOT" | tr -c 'a-zA-Z0-9_-' '_' | head -c 40)"
RUN_DIR="/tmp/wn-pg/${SLUG}-$$"
PGDATA="$RUN_DIR/data"
PGSOCK="$RUN_DIR/sock"
PGLOG="$RUN_DIR/pg.log"
PG_BIN=""
PG_STARTED=""

# ── Ports déterministes par worktree + sondage ──────────────────────────────
# /dev/tcp en sous-shell : la connexion réussit si le port est occupé.
port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

find_free_port() { # $1=port de départ  $2=min  $3=max
  local p="$1" min="$2" max="$3" i
  for ((i = 0; i <= max - min; i++)); do
    if port_free "$p"; then printf '%s' "$p"; return 0; fi
    p=$(( min + (p - min + 1) % (max - min + 1) ))
  done
  return 1
}

HASH="$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1)"
PG_PORT="${WN_PG_PORT:-$(find_free_port $((5500 + HASH % 100)) 5500 5599)}" \
  || die "aucun port PostgreSQL libre dans 5500-5599."
APP_PORT="${WN_APP_PORT:-$(find_free_port $((3100 + HASH % 100)) 3100 3199)}" \
  || die "aucun port applicatif libre dans 3100-3199."

# ── Provisioning one-shot (idempotent) ──────────────────────────────────────
require_sudo() { sudo -n true 2>/dev/null || die "$1"; }

ensure_postgres() {
  if [[ -n "${WN_PG_BIN:-}" ]]; then
    [[ -x "$WN_PG_BIN/initdb" ]] || die "WN_PG_BIN=$WN_PG_BIN ne contient pas initdb."
    PG_BIN="$WN_PG_BIN"
    return
  fi
  # macOS : PostgreSQL vient de Homebrew — ni /usr/lib/postgresql ni apt-get.
  # On privilégie postgresql@15 (version du service CI, parité stricte) puis on
  # se rabat sur les autres formules, enfin sur un initdb déjà dans le PATH.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    local prefix
    for formula in postgresql@15 postgresql@16 postgresql@17 postgresql; do
      prefix="$(brew --prefix "$formula" 2>/dev/null || true)"
      if [[ -n "$prefix" && -x "$prefix/bin/initdb" ]]; then
        PG_BIN="$prefix/bin"
        return
      fi
    done
    if command -v initdb >/dev/null 2>&1; then
      PG_BIN="$(dirname "$(command -v initdb)")"
      return
    fi
    die "PostgreSQL absent — installer avec : brew install postgresql@15 (version du CI)."
  fi
  if ! compgen -G '/usr/lib/postgresql/*/bin/initdb' >/dev/null; then
    step "Installation de PostgreSQL (première exécution, ~1 min)"
    require_sudo "PostgreSQL absent et sudo indisponible — installer postgresql puis relancer."
    sudo apt-get update -qq
    sudo apt-get install -y -qq postgresql >/dev/null
  fi
  # shellcheck disable=SC2012 -- chemins système sans caractères exotiques
  PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  [[ -n "$PG_BIN" && -x "$PG_BIN/initdb" ]] || die "binaires PostgreSQL introuvables."
}

ensure_node_modules() {
  if [[ ! -d "$WEB/node_modules" ]]; then
    step "Installation des dépendances npm (première exécution du worktree)"
    (cd "$WEB" && npm ci)
  fi
}

ensure_playwright() {
  local version marker
  # macOS : `--with-deps` n'installe des paquets système que sur les
  # distributions Linux ; ici il n'y a rien à provisionner, donc pas de sudo
  # (le cache navigateurs vit d'ailleurs dans ~/Library/Caches, pas ~/.cache).
  if [[ "$(uname -s)" == "Darwin" ]]; then
    (cd "$WEB" && npx playwright install chromium webkit)
    return
  fi
  version="$(node -p "require('$WEB/node_modules/@playwright/test/package.json').version")"
  marker="$HOME/.cache/ms-playwright/.wn-deps-$version"
  if [[ -f "$marker" ]]; then
    (cd "$WEB" && npx playwright install chromium webkit)
  else
    step "Installation des navigateurs Playwright + dépendances système (première exécution)"
    require_sudo "sudo requis pour les dépendances système des navigateurs Playwright."
    (cd "$WEB" && npx playwright install --with-deps chromium webkit)
    mkdir -p "$(dirname "$marker")"
    touch "$marker"
  fi
}

# ── PostgreSQL éphémère ─────────────────────────────────────────────────────
cleanup() {
  set +e
  if [[ "$KEEP_DB" == 1 && -n "$PG_STARTED" ]]; then
    printf '\nBase conservée (--keep-db) :\n  %s\n' "$DATABASE_URL"
    printf "Arrêt manuel :\n  %s -D '%s' -m fast stop && rm -rf '%s'\n" \
      "$PG_BIN/pg_ctl" "$PGDATA" "$RUN_DIR"
    return 0
  fi
  if [[ -n "$PG_STARTED" ]]; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1
  fi
  rm -rf "$RUN_DIR"
}

init_db() {
  mkdir -p "$PGDATA" "$PGSOCK"
  # Parité POSTGRES_INITDB_ARGS de ci.yml. trust : acceptable, la base jetable
  # n'écoute que sur 127.0.0.1 et ne contient que des données fictives.
  "$PG_BIN/initdb" -D "$PGDATA" --encoding=UTF8 --locale=en_US.UTF-8 \
    --auth-local=trust --auth-host=trust --username=postgres \
    >"$RUN_DIR/initdb.log" 2>&1 \
    || { cat "$RUN_DIR/initdb.log" >&2; die "initdb a échoué."; }
}

start_pg() {
  "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$PGLOG" -w -t 30 \
    -o "-p $PG_PORT -k $PGSOCK -c listen_addresses=127.0.0.1" start >/dev/null \
    || { tail -50 "$PGLOG" >&2; die "PostgreSQL n'a pas démarré (port $PG_PORT)."; }
  PG_STARTED=1
  local i
  for ((i = 0; i < 30; i++)); do
    if "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_PORT" -q; then return 0; fi
    sleep 0.5
  done
  tail -50 "$PGLOG" >&2
  die "PostgreSQL injoignable après démarrage (port $PG_PORT)."
}

create_db() {
  # Mêmes identifiants jetables que le service postgres de ci.yml. SUPERUSER :
  # parité avec l'image Docker, dont POSTGRES_USER est superutilisateur — la
  # migration pgvector exécute CREATE EXTENSION vector, refusé à un rôle
  # ordinaire (extension non « trusted »).
  "$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q \
    -c "CREATE ROLE ci_user LOGIN SUPERUSER PASSWORD 'ci_password'" \
    -c "CREATE DATABASE wellneuro_ci OWNER ci_user"
}

# ── Exécution ───────────────────────────────────────────────────────────────
START=$SECONDS
printf 'Worktree : %s\nPostgreSQL : 127.0.0.1:%s   Application : 127.0.0.1:%s\n' \
  "$ROOT" "$PG_PORT" "$APP_PORT"

ensure_postgres
ensure_node_modules
ensure_playwright

trap cleanup EXIT
trap 'exit 130' INT TERM

# Parité env du job CI `verify` (ci.yml). Les exports shell priment sur tout
# .env.local (les loaders dotenv du dépôt sont tous en override:false et
# Next.js donne priorité à process.env). Seule divergence : les URLs suivent
# le port applicatif du worktree au lieu de :3000 — le webServer Playwright
# (`next dev` ou `next start` selon PLAYWRIGHT_WEB_SERVER) reçoit ce port via
# `-p`, et la variable PORT exportée ci-dessous couvre tout lancement manuel.
export DATABASE_URL="postgresql://ci_user:ci_password@localhost:${PG_PORT}/wellneuro_ci"
export NEXTAUTH_SECRET="ci-test-secret-r8-2-playwright-automation"
export NEXTAUTH_URL="http://localhost:${APP_PORT}"
export GOOGLE_CLIENT_ID="ci-placeholder"
export GOOGLE_CLIENT_SECRET="ci-placeholder"
export PLAYWRIGHT_BASE_URL="http://localhost:${APP_PORT}"
export PORT="$APP_PORT"
# Parité ressources : les runners CI ont 4 vCPU. Ce conteneur peut avoir plus
# de cœurs mais moins de RAM — sans plafond, Vitest démarre un worker jsdom
# par cœur et leur démarrage expire sous charge (« Failed to start forks
# worker »). Surchargeables si besoin.
export VITEST_MAX_FORKS="${VITEST_MAX_FORKS:-4}"
export VITEST_MAX_THREADS="${VITEST_MAX_THREADS:-4}"

# macOS + PostgreSQL 15 : sans locale valide dans l'environnement, le postmaster
# refuse de démarrer — « postmaster became multithreaded during startup », HINT
# « Set the LC_ALL environment variable to a valid locale ». Certaines sessions
# arrivent avec LANG/LC_ALL vides (shell non interactif, cron, agents) : initdb,
# lui, réussit car on lui passe --locale explicitement, mais le postmaster hérite
# de l'environnement au démarrage et échoue. On aligne son exécution sur la même
# locale que le cluster, sans écraser une locale valide déjà héritée. Réservé à
# Darwin : le symptôme est propre à macOS et en_US.UTF-8 y est toujours présent
# (sur Debian il faudrait la générer — ne pas l'imposer au runner Linux/CI).
if [[ "$(uname -s)" == "Darwin" ]]; then
  export LC_ALL="${LC_ALL:-en_US.UTF-8}"
fi

# Un environnement shell hérité peut exporter NODE_ENV globalement ; la CI ne
# le définit pas. Un NODE_ENV non standard pendant `next build` mélange les
# builds React dev/prod et fait planter le prerender (useContext null) —
# release_go_no_go.sh contourne déjà le même problème. On l'efface : next dev
# et next build fixent chacun la bonne valeur.
unset NODE_ENV

# Garde-fou (même esprit que wn-local-migrate.sh) : jamais de migration hors
# base locale, quelles que soient les variables héritées de l'environnement.
case "$DATABASE_URL" in
  postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;;
  *) die "garde-fou : DATABASE_URL non locale, migrations refusées." ;;
esac

# ── Phase statique (fail-fast) : aucun de ces contrôles ne touche la base ──
# (les tests Vitest mockent tous Prisma). Une erreur de type ou un test rouge
# échoue ici sans payer initdb/migrate/seed.
if [[ "$FAST" == 0 ]]; then
  step "Contrôle anti-secrets"
  bash "$ROOT/scripts/check_no_secrets.sh"
  step "Audit des règles de campagne"
  # L'audit résout ses chemins depuis le cwd : l'exécuter depuis la racine,
  # comme en CI (npm invoque ce script depuis web/).
  (cd "$ROOT" && node scripts/wn-campaign-audit.mjs --fail-on-warning-codes \
    missing_audit_root,missing_in_mirror,extra_in_mirror,status_drift_between_roots,closed_campaign_with_open_lots,inflight_without_active_lot,idle_with_active_fields)
fi

# ── Bancs `node --test` du CI ───────────────────────────────────────────────
# Cinq bancs vivent hors de Vitest et le CI les lance un par un : le banc de
# l'anti-secrets, le dossier des droits, le validateur du registre des
# instruments, le comparateur de certification, le banc golden de scoring.
# Ce palier n'en jouait AUCUN.
#
# Deux d'entre eux sont pourtant dans T1 (`secrets-check`,
# `dossier-droits-check`) : T3 était donc plus ÉTROIT que T1 sur ce point, et
# lancer la séquence longue avant une PR passait à côté de ce que la séquence
# courte vérifiait. C'est le motif exact qui a fait entrer le lint dans T1 le
# 2026-07-21 (LOT-01b) et les contrats SQL dans ce palier — un palier qui ne
# couvre pas ce que le CI vérifie ne protège de rien.
#
# Hors du bloc `--fast` à dessein : les cinq réunis tiennent en ~4 s, et le banc
# golden est précisément celui qui a laissé une dérive de fixture s'accumuler
# (PR #389) faute d'être branché à un runner.
#
# Après `ensure_node_modules` (plus haut) et non avant : le chargeur du banc
# golden transpile les sources TS via le compilateur, devDependency de `web/`.
# Sans node_modules il échoue sur `Cannot find module 'typescript'` — vérifié.
#
# La liste est EXTRAITE de ci.yml, jamais recopiée — même raison que les
# contrats SQL plus bas : une copie diverge au premier banc ajouté, et la
# divergence est silencieuse. `sed` plutôt que `grep -o`, pour la même raison
# de portabilité macOS/runner.
step "Bancs Node du CI (extraits de ci.yml)"
bancs=$(sed -n 's|.*node --test \([A-Za-z0-9_./-]*\.mjs\).*|\1|p' \
  "$ROOT/.github/workflows/ci.yml" | sort -u)
if [[ -z "$bancs" ]]; then
  die "aucun banc \`node --test\` trouvé dans .github/workflows/ci.yml — l'extraction a cessé de fonctionner, elle ne rendrait plus silence que succès."
fi
bancs_attendus=$(printf '%s\n' "$bancs" | wc -l | tr -d ' ')
bancs_joues=0
while IFS= read -r banc; do
  [[ -f "$ROOT/$banc" ]] || die "banc $banc référencé par le CI mais absent du dépôt."
  printf '  %s\n' "$banc"
  # Depuis la racine : ces bancs résolvent leurs fixtures relativement à elle.
  # `< /dev/null` pour la même raison que les contrats SQL — un jour où l'un
  # d'eux lirait stdin, il avalerait le reste du here-string et la boucle
  # s'arrêterait après UN banc, verte.
  (cd "$ROOT" && node --test "$banc" > /dev/null < /dev/null) \
    || die "banc en échec : $banc — le relancer seul pour en lire la sortie (\`node --test $banc\`)."
  bancs_joues=$((bancs_joues + 1))
done <<< "$bancs"
[[ "$bancs_joues" == "$bancs_attendus" ]] \
  || die "$bancs_joues banc(s) joué(s) pour $bancs_attendus extrait(s) de ci.yml — la boucle s'est interrompue sans le dire."

# Les bancs que le CI lance par un SCRIPT et non par un `node --test` littéral
# échappent à l'extraction ci-dessus — elle ne reconnaît que la forme littérale.
# Le 2026-08-01, faire passer les bancs de certification par
# `run-certify-bancs.sh` les a retirés de ce palier sans un bruit : l'extraction
# trouvait encore d'autres bancs, donc le garde de la ligne 366 ne disait rien.
# Une extraction qui ne voit qu'une forme d'appel doit être complétée à la main
# pour les autres — ou bien elle prétend couvrir ce qu'elle ne couvre plus.
step "Bancs de certification (script dédié du CI)"
(cd "$ROOT" && bash scripts/run-certify-bancs.sh > /dev/null < /dev/null) \
  || die "bancs de certification en échec — les relancer seuls pour en lire la sortie (\`bash scripts/run-certify-bancs.sh\`)."

# Le CI doit bien les lancer, lui aussi : sans ce contrôle, retirer le pas de
# ci.yml laisserait ce palier vert et seul à les jouer.
grep -q 'run-certify-bancs.sh' "$ROOT/.github/workflows/ci.yml" \
  || die "ci.yml ne lance plus scripts/run-certify-bancs.sh — les bancs de certification ne tourneraient qu'en local."

cd "$WEB"

step "Client Prisma (generate)"
npx prisma generate

if [[ "$FAST" == 0 ]]; then
  step "Certification scoring (63 questionnaires)"
  npm run scoring-check
fi

step "Type-check"
# `.next/types` EST PURGÉ AVANT, par le `pretype-check` de `web/package.json`.
#
# Next.js y génère un fichier de types par route, mais ne RETIRE jamais celui
# d'une route disparue. Ce type-check tournant AVANT le build, il lisait donc les
# types d'un build précédent : une route supprimée — ou appartenant à une session
# parallèle — faisait échouer `tsc` sur un fichier source qui n'existe plus.
# Trois fois le 2026-09-04, et chaque fois lu d'abord comme une régression.
#
# Rien n'est perdu : `next.config.mjs` ne désactive pas le type-check du build,
# donc les types de routes sont vérifiés plus bas, à l'étape « Build ». Le
# crochet vit dans `package.json` pour couvrir aussi `npm run check` (T1), qui
# appelle le même script et souffrait du même défaut.
npm run type-check

# Passe complète dans la position de PRODUCTION : `WN_ALI_01_SIIN57` est allumé
# sur les trois environnements depuis le 2026-07-28, donc `Q_ALI_01` y prend sa
# forme 57 items. C'est cette passe-là qui doit être entière — jusqu'au
# 2026-08-07 la séquence rapide jouait la suite en position ÉTEINTE, celle que
# la production n'utilise pas.
step "Tests unitaires (Vitest, forme SIIN 57 items)"
npm run test:siin57

if [[ "$FAST" == 0 ]]; then
  # Position éteinte, réduite aux seuls specs dont le verdict dépend de la
  # position du drapeau — liste dans `test:court14` (web/package.json), gardée
  # par `scripts/specs-drapeau-ali01.test.mjs` (rejoué plus haut par
  # l'extraction de ci.yml). Les 352 autres y rendraient le verdict qu'ils
  # viennent de rendre au-dessus.
  step "Tests unitaires (Vitest, forme courte 14 items)"
  npm run test:court14

  step "Lint"
  npm run lint
fi

# ── Phase base de données ───────────────────────────────────────────────────
step "PostgreSQL éphémère (port $PG_PORT)"
init_db
start_pg
create_db

step "Migrations (migrate deploy)"
npx prisma migrate deploy

step "Dérive schéma ↔ migrations (migrate diff)"
# En production, seul le SQL des migrations committées est appliqué
# (workflow release-db) : si schema.prisma a évolué sans migration,
# le client Prisma déployé attendrait un schéma que la base n'aura jamais.
# La base éphémère vient d'être construite uniquement par `migrate deploy` :
# l'introspecter (--from-config-datasource lit DATABASE_URL) équivaut à
# rejouer les migrations. Échec (code 2) si elle diverge de schema.prisma.
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code \
  || die "schema.prisma ne correspond pas aux migrations committées — générer la migration manquante avant tout déploiement."

step "Contrats SQL (prisma/checks)"
# Ces contrats éprouvent ce que ni Prisma ni Vitest ne voient : CHECK, RLS,
# triggers, index partiels, et les invariants de DONNÉES rejoués dans une
# transaction annulée. Le CI les lance ; ce palier ne le faisait pas — si bien
# qu'écrire du SQL de garde obligeait à monter un PostgreSQL à la main pour le
# valider. C'est le motif exact qui a fait entrer le lint dans T1 le
# 2026-07-21 : un palier qui ne couvre pas ce que le CI vérifie ne protège de
# rien (LOT-01b).
#
# La liste n'est pas recopiée : elle est EXTRAITE de ci.yml. Recopier l'aurait
# fait diverger au premier contrat ajouté, et la divergence aurait été
# silencieuse — le palier serait resté vert en ignorant le nouveau garde.
# `sed` plutôt que `grep -o` : le grep de macOS et celui du runner ne rendent
# pas la même chose (voir l'avertissement de ci.yml sur `grep -qv`).
contrats=$(sed -n 's|.*--file \(prisma/checks/[A-Za-z0-9_./-]*\.sql\).*|\1|p' \
  "$ROOT/.github/workflows/ci.yml" | sort -u)
if [[ -z "$contrats" ]]; then
  die "aucun contrat SQL trouvé dans .github/workflows/ci.yml — l'extraction a cessé de fonctionner, elle ne rendrait plus silence que succès."
fi
attendus=$(printf '%s\n' "$contrats" | wc -l | tr -d ' ')
joues=0
while IFS= read -r contrat; do
  [[ -f "$WEB/$contrat" ]] || die "contrat $contrat référencé par le CI mais absent du dépôt."
  printf '  %s\n' "$contrat"
  # `< /dev/null` : sans lui, un jour où l'outil appelé lirait stdin, il
  # avalerait le reste du here-string et la boucle s'arrêterait après UN
  # contrat — verte. C'est exactement le silence que cette étape existe pour
  # empêcher.
  npx prisma db execute --file "$contrat" > /dev/null < /dev/null \
    || die "contrat SQL en échec : $contrat"
  joues=$((joues + 1))
done <<< "$contrats"
# Un contrat extrait mais non joué ne doit jamais ressembler à un succès.
[[ "$joues" == "$attendus" ]] \
  || die "$joues contrat(s) joué(s) pour $attendus extrait(s) de ci.yml — la boucle s'est interrompue sans le dire."

step "Seed (patients fictifs uniquement)"
npm run prisma:seed

# ── Build et E2E ────────────────────────────────────────────────────────────
# LE BUILD N'EST PLUS SAUTÉ, MÊME EN `--fast` — et c'est un gain de temps, pas
# un coût. Mesuré le 2026-08-11 sur le même dépôt, à la même heure :
#
#   build + E2E sur `next start` : 0 min 46 s + 1 min 20 s = 2 min 06 s
#   E2E sur `next dev`           :                          12 min 54 s
#
# `next dev` compile à la demande, page par page, à chaque première visite. Sur
# une suite de 138 tests c'est cinq fois plus lent que de compiler une fois.
#
# ET SURTOUT, IL FLOTTE. Trois exécutions `--fast` le 2026-08-11 ont produit
# trois échecs, sur trois tests DIFFÉRENTS (`visual.spec.ts` lignes 103, 115 et
# 123), chaque fois celui qui suivait immédiatement la ligne
# « ⚠ Server is approaching the used memory threshold, restarting... » : le
# serveur de développement se recycle en mémoire et emporte le test en cours.
# Chacun de ces trois tests passait dans les runs où il n'était pas la victime.
#
# C'était un piège à FAUX NÉGATIF, invisible en CI et en séquence complète, qui
# jouent toutes deux le build : un `--fast` rouge se lisait comme une régression
# et noyait le vrai signal. La leçon avait déjà été consignée deux fois au
# journal de session sans devenir exécutable ; elle l'est ici.
#
# CE QUE `--fast` SAUTE ENCORE : anti-secrets, audit de campagnes, certification
# scoring, lint. Ce qu'il ne saute plus : le build — donc une erreur de build
# arrête désormais la séquence rapide, comme elle arrête le CI.
step "Build"
# Drapeaux du rayon biologie au BUILD, pas seulement au démarrage : la page
# `dashboard/patients/[idPatient]` lit `WN_CB_ENABLED` dans un composant
# SERVEUR. Sans eux ici, `false` est cuit dans la page et le panneau de
# proposition reste absent même quand la route d'API répond `ok`. Portée
# limitée à cette commande : exportés pour tout le script, ils déplacent la
# position de la suite Vitest jouée plus haut.
# Idem pour les trois surfaces patient de l'alliance : les pages
# `portail/[token]/{ce-qui-compte,comprehension,dossier}` appellent leur drapeau
# au RENDU SERVEUR et rendent `notFound()` s'il est éteint. Sans eux au build,
# les trois écrans sont introuvables et le parcours E2E n'a rien à ouvrir.
# `WN_CB_RESULTS_ENABLED` : étage 2 (résultats réels). Contrairement aux deux
# drapeaux ci-dessus, il n'est PAS posé en production — le banc ouvre ici la
# seule position où la surface de saisie existe, pour que le parcours qui la
# traverse ne soit pas muet.
WN_CB_ENABLED=true WN_CB_PROPOSITION=true WN_CB_RESULTS_ENABLED=true \
  WN_CE_QUI_COMPTE=true WN_COMPREHENSION=true WN_DOSSIER_DEUX_VOIX=true \
  npm run build
# E2E contre le build de production tout juste produit : plus rapide (pas de
# compilation à la demande), stable, et fidèle au déploiement Vercel.
export PLAYWRIGHT_WEB_SERVER=start
step "Tests E2E (Playwright — build de production, Chromium + WebKit, port $APP_PORT)"
npm run test:e2e \
  || {
    # Classe l'échec avant de rendre la main : un `page.goto` expiré SANS la
    # moindre requête réseau est un blocage du navigateur, pas un défaut de
    # l'application (motif et preuves : scripts/wn-diagnostic-e2e.mjs). Trois
    # fois en deux jours, ce rouge s'est d'abord lu comme une régression du code
    # en cours. Le diagnostic ne décide de rien — `exit 1` suit dans tous les
    # cas — et son propre échec ne doit surtout pas masquer celui de la suite.
    node "$ROOT/scripts/wn-diagnostic-e2e.mjs" "$WEB/test-results" || true
    printf '\nRapport : %s/playwright-report/\n' "$WEB" >&2
    exit 1
  }

step "Terminé"
recap
printf '\nSéquence %s verte en %d min %d s (PG:%s, app:%s).\n' \
  "$([[ "$FAST" == 1 ]] && echo 'rapide' || echo 'CI complète')" \
  "$(((SECONDS - START) / 60))" "$(((SECONDS - START) % 60))" "$PG_PORT" "$APP_PORT"
