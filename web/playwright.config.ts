import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Depuis un worktree git (.worktrees/*), `.env.local` n'existe pas (gitignoré,
// présent uniquement dans le checkout principal). `--git-common-dir` pointe
// toujours vers le `.git` du checkout principal, quel que soit le worktree.
const repoRoot = path.resolve(__dirname, '..');
let mainRoot = repoRoot;
try {
  const gitCommonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
  mainRoot = path.dirname(gitCommonDir);
} catch {
  // Hors dépôt git (archive, CI exotique) : comportement historique inchangé.
}
const isWorktree = mainRoot !== repoRoot;

// Charge DATABASE_URL (et le reste) depuis web/.env.local si disponible (local),
// sinon depuis les variables d'environnement du système (CI). Ceci permet à
// helpers/db.ts (Prisma direct, hors process Next.js) et helpers/auth.ts
// (NEXTAUTH_SECRET) de voir les mêmes valeurs que le serveur testé, que ce soit
// en dev local (avec .env.local) ou en CI (avec variables d'environnement).
// Dans un worktree, fallback sur le web/.env.local du checkout principal —
// le serveur dev lancé par `webServer` hérite de ce process.env, donc il voit
// aussi ces variables même sans .env.local propre au worktree.
const envCandidates = [
  path.join(__dirname, '.env.local'),
  path.join(repoRoot, '.env.local'),
  ...(isWorktree
    ? [path.join(mainRoot, 'web', '.env.local'), path.join(mainRoot, '.env.local')]
    : []),
];

for (const envPath of envCandidates) {
  // Ne pas écraser les variables déjà présentes dans l'environnement shell.
  loadEnv({ path: envPath, override: false });
}

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error(
    [
      'NEXTAUTH_SECRET manquant pour les tests Playwright.',
      'Ajoutez NEXTAUTH_SECRET dans web/.env.local (checkout principal ou worktree)',
      'ou exportez-le dans le shell avant npm run test:e2e.',
    ].join(' ')
  );
}

// Port dédié par worktree : évite qu'un run e2e lancé depuis un worktree
// réutilise silencieusement le serveur dev du checkout principal sur :3000 —
// et teste donc le code d'une autre branche. L'index dans `git worktree list`
// garantit un port unique par worktree au même instant (un hash du chemin
// produisait des collisions, ex. qx-integration/qx-lot03).
function worktreePort(root: string): number {
  try {
    const worktrees = execSync('git worktree list --porcelain', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => path.resolve(line.slice('worktree '.length)));
    const index = worktrees.indexOf(root);
    if (index > 0) return 3100 + index;
  } catch {
    // git indisponible : port de repli fixe ci-dessous.
  }
  return 3100;
}

const port = isWorktree ? worktreePort(repoRoot) : 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

// PLAYWRIGHT_WEB_SERVER=start : sert le build de production (`next start`,
// exige un `npm run build` préalable) — même artefact que le déploiement
// Vercel, démarrage en quelques secondes, aucune compilation à la demande
// pendant les tests. Défaut : `next dev` (itération locale).
const webServerMode = process.env.PLAYWRIGHT_WEB_SERVER ?? 'dev';
if (webServerMode !== 'dev' && webServerMode !== 'start') {
  throw new Error(
    `PLAYWRIGHT_WEB_SERVER invalide : « ${webServerMode} » (valeurs acceptées : dev, start).`
  );
}

export default defineConfig({
  testDir: 'e2e',
  // Répare l'état laissé par un run TUÉ avant que le moindre spec ne lise la
  // base — un `globalTeardown` ne tournerait pas davantage qu'un `afterAll`
  // dans ce cas. Motif complet dans le fichier.
  globalSetup: './e2e/globalSetup.ts',
  fullyParallel: false,
  // Un seul worker : le spec manipule directement l'état DB du patient fictif
  // (Michel Dogné, PAT_SEED_03) — des runs concurrents sur le même patient
  // se marcheraient dessus (reset/token/assignations partagés).
  workers: 1,
  // `list` pour la console, `html` pour l'après-coup. Le second manquait, et
  // son absence était SILENCIEUSE : `ci.yml` publie depuis toujours un artefact
  // `web/playwright-report/` que rien n'écrivait — `web/.gitignore` l'ignorait
  // déjà, ce qui achevait de le rendre crédible. Un échec E2E en CI ne laissait
  // donc ni images de diff, ni trace lisible : il fallait aller chercher le log
  // brut du job par l'API (constaté le 2026-09-05 pour lire la mesure du seuil
  // visuel — `gh run view --log` tronque avant l'étape E2E sans le dire).
  //
  // `open: 'never'` est indispensable : le défaut `on-failure` ouvre un serveur
  // et ATTEND, ce qui suspendrait un run local en échec et le CI avec.
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  // Marges plus larges que les défauts (30s/5s) : le scénario enchaîne ~15
  // appels serveur contre la DB de dev (pooler Supabase distant en local, ou
  // service Postgres en CI), qui ajoute une latence notable.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'Desktop Chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'iPhone 13', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    // Aligne le port du serveur sur baseURL (y compris un
    // PLAYWRIGHT_BASE_URL explicite), sinon Next.js retomberait sur :3000.
    command: `npm run ${webServerMode} -- -p ${new URL(baseURL).port || '3000'}`,
    url: baseURL,
    // Gate G4 allumé pour les tests seulement. Le drapeau reste absent de
    // l'environnement Vercel : le lien magique est donc couvert ici, et éteint
    // en production — c'est ce que demande le NO-GO du registre.
    env: {
      ...process.env,
      // Orientation NNPP2 (LOT-01, orientation-file-envoi.spec.ts) — ce
      // drapeau est posé EN PRODUCTION depuis le 2026-08-04
      // (docs/claude/SESSION_LOG.md). L'armer ici ALIGNE donc le banc sur la
      // production, il ne simule pas une position qu'elle n'aurait pas.
      // ATTENTION en lisant les commentaires voisins : plusieurs décrivent
      // leur drapeau comme « éteint en production », et c'est PÉRIMÉ pour
      // WN_G4_*/WN_G5_*, posés sur Vercel depuis le 2026-07-21/22 (voir leurs
      // runbooks d'activation). Ce bloc dit ce que le BANC arme, jamais ce que
      // Vercel porte. `orientationActive()`
      // est fail-closed sur les DEUX bras d'un ET (ce drapeau, la signature
      // praticien de la table de règles) : sans lui ici, la route
      // `/api/praticien/orientation` répond systématiquement `actif: false`
      // et le panneau ne rend aucune recommandation — le spec n'a rien à
      // cliquer.
      WN_ENABLE_ORIENTATION_NNPP2: '1',
      // Rayon biologie — les DEUX drapeaux, `isCbPropositionEnabled` les exige
      // ensemble (`web/src/lib/biology-library/featureFlag.ts`). Posés en
      // production depuis le 2026-08-18 ([[D-071]]) : le banc s'aligne, il ne
      // simule pas. Sans eux, la route de proposition rend 503 et le spec
      // biologie n'aurait rien à cliquer.
      //
      // JAMAIS AU NIVEAU DU RUNNER. Les avoir exportés sur le job CI entier et
      // sur le script de worktree a fait rougir 10 bancs unitaires : la suite
      // Vitest s'exécute en position CB ÉTEINTE, et `/api/praticien/fil`
      // interroge `arbitrageBiologique` dès que `WN_CB_ENABLED` est vrai —
      // modèle absent du double de test, donc 500. Un drapeau posé au niveau
      // du runner déplace la position de TOUTE la suite.
      //
      // La portée admise est donc le PROCESSUS QUI EN A BESOIN, et il y en a
      // deux : ici, pour le serveur sous test, et la seule commande
      // `npm run build` du CI et de `scripts/wn-test-worktree.sh` — le rendu
      // serveur du build lit ces drapeaux à la compilation. Deux poses, aucune
      // au niveau du runner : les retirer là-bas rouvrirait le trou, les
      // élargir ici rougirait Vitest.
      WN_CB_ENABLED: 'true',
      WN_CB_PROPOSITION: 'true',
      // Étage 2 — résultats réels ([[D-122]] §2). CE DRAPEAU N'EST PAS POSÉ EN
      // PRODUCTION, et c'est la différence avec ses deux voisins : eux
      // ALIGNENT le banc sur la production, celui-ci ouvre la seule position
      // où la surface existe. Ne pas en déduire que l'étage est ouvert chez le
      // praticien — il ne l'est pas, et la table compte 0 ligne.
      //
      // Même portée que les autres : ici, et la seule commande `npm run build`
      // (le composant serveur du dossier lit le drapeau pour alimenter
      // `CbFeatureProvider`). JAMAIS au niveau du runner — la suite Vitest
      // s'exécute en position CB éteinte et un drapeau posé là déplacerait
      // toute la suite.
      WN_CB_RESULTS_ENABLED: 'true',
      // Posé en Production le 2026-08-16 ([[D-064]]) — même doctrine que la
      // ligne du dessus : aligner l'E2E sur l'état réel de production. Depuis
      // [[D-065]], ce drapeau conditionne AUSSI les règles d'arrêt : sans lui,
      // aucune extinction ne peut être observée dans un parcours.
      WN_ENABLE_CONTRADICTIONS_NNPP2: '1',
      WN_G4_LIEN_MAGIQUE: 'true',
      WN_G4_REDEMANDE_PATIENT: 'true',
      // Gate G5 — entrée par Google (IDP2 LOT-03c). Même raison : allumé pour
      // les tests, absent de Vercel. Le client OAuth patient, lui, n'est PAS
      // configuré ici, et c'est délibéré : les tests couvrent l'état exact de
      // la production après le merge — drapeau allumable, aucun secret posé —
      // et vérifient que la route refuse alors proprement, sans jamais ouvrir
      // de session. Le parcours complet chez Google n'est pas automatisable
      // sans compte réel : il est couvert en unitaire, jeton d'identité forgé.
      WN_G5_GOOGLE_PATIENT: 'true',
      // Agenda alimentaire (`Q_ALI_09`, LOT-04). Le drapeau pilote le champ
      // `actif` du catalogue, donc À LA FOIS la route d'assignation (via
      // `IDS_SUSPENDUS`) et la bibliothèque praticien : sans lui, le POST
      // d'assignation du parcours E2E est refusé et l'écran d'agenda n'est
      // jamais atteint. Il se pose ICI et pas dans le spec — `process.env` d'un
      // spec ne vaut que pour le code Node du test, pas pour le serveur Next.
      WN_AGENDA_ALI: 'true',
      // Alliance 6.0-A — les trois surfaces patient du dossier à deux voix.
      // Elles ne sont PAS posées en production : ici l'E2E n'aligne pas un état
      // réel, il ouvre la seule position dans laquelle ces écrans existent. Les
      // trois ensemble, et pas seulement celui du LOT-06 : chaque bloc de
      // l'écran d'assemblage reste soumis à son drapeau propre, et sans les
      // deux autres le parcours ne verrait qu'un tiers de la page.
      //
      // MÊME PORTÉE QUE LA BIOLOGIE CI-DESSUS, pour la même raison : le
      // processus qui en a besoin, jamais le runner. Les pages portail lisent
      // ces drapeaux au RENDU SERVEUR — `notFound()` sur drapeau éteint — donc
      // la commande `npm run build` du CI et de `wn-test-worktree.sh` doit les
      // porter elle aussi.
      WN_CE_QUI_COMPTE: 'true',
      WN_COMPREHENSION: 'true',
      WN_DOSSIER_DEUX_VOIX: 'true',
      // « aucun secret posé » ci-dessus n'est vrai que si on l'IMPOSE : le
      // `...process.env` plus haut fait fuiter le vrai client patient présent
      // dans `web/.env.local` (nécessaire à `npm run dev`), et la route
      // redirigerait alors vers Google au lieu de refuser — deux E2E rouges,
      // mais SEULEMENT sur les postes où ce `.env.local` existe. On force donc
      // l'absence de client, après le spread, pour que le test vérifie partout
      // le même état de production (drapeau allumé, client absent) — la valeur
      // vide fait rendre `null` à `configurationGoogle()`.
      WN_GOOGLE_PATIENT_CLIENT_ID: '',
      WN_GOOGLE_PATIENT_CLIENT_SECRET: '',
      // orientation-file-envoi.spec.ts (LOT-01) va jusqu'au clic « Envoyer »
      // de la file d'envoi (`POST /api/praticien/file-envoi/envoyer`). Sans
      // `SMTP_URL`, `sendFileEnvoiEmail` journalise `Non_envoye` et s'arrête —
      // c'est l'état voulu ici. Même geste défensif que les deux lignes
      // ci-dessus : le spread `...process.env` ferait sinon fuiter un vrai
      // `SMTP_URL` de `web/.env.local` (nécessaire à `npm run dev` pour tester
      // un envoi réel manuellement) et le test enverrait un mail réel vers une
      // adresse `@fictif.wellneuro.fr`, sur les seuls postes où ce
      // `.env.local` le configure.
      SMTP_URL: '',
    } as Record<string, string>,
    // En mode start, exiger un port libre : réutiliser un serveur déjà lancé
    // risquerait de tester silencieusement un `next dev` (autre build, voire
    // autre branche) à la place du build de production attendu.
    reuseExistingServer: webServerMode === 'dev',
    // 240s : le premier boot dev dans un worktree fraîchement provisionné est
    // lent (patch SWC du lockfile + compilation initiale) et dépasse 120s.
    timeout: 240_000,
  },
});
