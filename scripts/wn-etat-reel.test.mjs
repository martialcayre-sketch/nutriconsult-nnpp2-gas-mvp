// Banc de `scripts/wn-etat-reel.mjs`.
//
// Toutes les fixtures vivent dans des répertoires temporaires
// (`mkdtempSync`/`os.tmpdir()`) — jamais l'état réel du dépôt, jamais la
// production — SAUF les deux tests qui testent littéralement l'indépendance
// au cwd (N1) et le compte réel du registre de certification (N3) : ces
// deux-là ne peuvent être vérifiés qu'en lisant CE dépôt, en lecture seule.
//
// Le script observe, il ne corrige rien : ce banc vérifie qu'il détecte bien
// les trois classes de dérive décrites dans la consigne (branche de worktree
// morte, `dirty` périmé, validation trop vieille), qu'il ne dépend PAS du cwd
// d'appel (N1 — régression trouvée par la revue adversariale du 2026-08-05),
// qu'il lit le bon registre de certification (N3), qu'il reste silencieux et
// non-cassant quand `gh` est indisponible, qu'un registre de certification
// absent ne lève pas d'exception, et — contrainte de sûreté du script —
// qu'aucune connexion base de données ni aucune écriture de fichier n'y est
// jamais tentée (y compris via l'import de `writeMachineState`, C7).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { construireRapport, lireRegistreCertification } from './wn-etat-reel.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'wn-etat-reel.mjs');
const REPO_ROOT = path.join(path.dirname(SCRIPT), '..');
/**
 * Le texte du script ET celui de ses imports locaux, concaténés.
 *
 * Les deux gardes textuelles ci-dessous (« aucune connexion base », « jamais
 * d'écriture ») ne portaient que sur `wn-etat-reel.mjs`. Depuis qu'il importe
 * `lib/campagnes-sur-disque.mjs` et `lib/vue-campagnes-actives.mjs`, un
 * `writeFileSync` posé dans l'un de ces deux modules ferait écrire le
 * rapporteur avec les deux gardes vertes — la classe « un garde qui ne descend
 * pas assez bas », déjà rencontrée sur ce dépôt.
 *
 * La descente s'arrête aux modules de `scripts/lib/` : `wn-state.mjs`, aussi
 * importé, EXPOSE `writeMachineState` pour `wn-cycle.mjs` qui répare l'état —
 * l'y inclure ferait rougir la garde sur une écriture légitime que ce script
 * n'appelle pas. Ce qui protège ce cas-là reste en place et n'a pas changé : le
 * texte du script lui-même ne doit contenir `writeMachineState` nulle part, pas
 * même dans un import.
 */
function sourceAvecLibsLocaux(chemin, vus = new Set()) {
  const reel = path.resolve(chemin);
  if (vus.has(reel)) return '';
  vus.add(reel);
  const texte = fs.readFileSync(reel, 'utf8');
  const dossier = path.dirname(reel);
  const textes = [texte];
  // Trois formes, parce que deux d'entre elles suffiraient à faire sortir un
  // module du périmètre en silence : `import … from`, `export … from`, et
  // `await import(…)`. La descente est RÉCURSIVE — un lib qui en importe un
  // autre resterait invisible autrement, et la borne annoncée serait plus large
  // que ce que le code atteint.
  const motifs = [
    /^(?:import|export)[^'"]*['"](\.[^'"]+)['"]/gm,
    /import\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ];
  for (const motif of motifs) {
    for (const trouve of texte.matchAll(motif)) {
      if (!trouve[1].startsWith('./lib/') && !trouve[1].startsWith('../lib/')) continue;
      const cible = path.join(dossier, trouve[1]);
      if (fs.existsSync(cible)) textes.push(sourceAvecLibsLocaux(cible, vus));
    }
  }
  return textes.join('\n');
}

const SOURCE = sourceAvecLibsLocaux(SCRIPT);

// Non-vacuité : les deux gardes ci-dessous sont des `doesNotMatch`, donc un
// `SOURCE` qui RÉTRÉCIT les rend plus faciles à satisfaire, jamais rouges. Ici,
// et seulement ici, c'est la PRÉSENCE qu'il faut asserter — sinon une forme
// d'import non reconnue sortirait un module du périmètre sans que rien ne le
// dise.
test('le texte gardé couvre bien le script ET ses libs — sinon les deux gardes ci-dessous seraient vides', () => {
  assert.match(SOURCE, /export function construireRapport/, 'le script lui-même');
  assert.match(SOURCE, /export function rendreVueCampagnesActives/, 'lib/vue-campagnes-actives.mjs');
  assert.match(SOURCE, /export function lireCampagnesSurDisque/, 'lib/campagnes-sur-disque.mjs');
});

/**
 * Dépôt git minimal, committé, avec juste assez de structure pour que les six
 * collecteurs tournent sans erreur (git grep sur `web/src`, migrations sur
 * disque, parcours patient) et un `.wn/state.json` fourni par l'appelant.
 */
function initDepotMinimal(etatMachine) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-etat-reel-'));
  execFileSync('git', ['init', '--quiet'], { cwd: racine });
  execFileSync('git', ['config', 'user.email', 'test@wellneuro.fr'], { cwd: racine });
  execFileSync('git', ['config', 'user.name', 'Banc wn-etat-reel'], { cwd: racine });

  fs.mkdirSync(path.join(racine, 'web', 'src', 'app', 'patient'), { recursive: true });
  fs.writeFileSync(
    path.join(racine, 'web', 'src', 'app', 'patient', 'page.tsx'),
    "const drapeau = 'WN_ENABLE_TEST_FIXTURE';\nconst autre = 'WN_C4_TEST_FIXTURE';\nexport default function Page() { return drapeau + autre; }\n",
  );
  fs.mkdirSync(path.join(racine, 'web', 'prisma', 'migrations', '20260101000000_init'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'web', 'prisma', 'migrations', '20260101000000_init', 'migration.sql'), '-- init\n');

  fs.mkdirSync(path.join(racine, '.wn'), { recursive: true });
  fs.writeFileSync(path.join(racine, '.wn', 'state.json'), `${JSON.stringify(etatMachine, null, 2)}\n`);

  execFileSync('git', ['add', '-A'], { cwd: racine });
  execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: racine });
  return racine;
}

test('état figé : la validation trop vieille est signalée ; le bloc git ne se compare plus', () => {
  const racine = initDepotMinimal({
    schema_version: 2,
    project: { id: 'wellneuro', name: 'Wellneuro' },
    status: 'idle',
    active_campaign: null,
    active_lot: null,
    // Un bloc `git` résiduel d'un état ancien : il ne doit RIEN produire.
    // Ces champs ne sont plus écrits depuis le 2026-08-07 — `dirty` était
    // toujours `true` — écrit avant le commit, donc systématiquement démenti
    // par ce commit même — et `branch` nommait souvent le
    // worktree d'une autre session. Ce qui ne se stocke plus ne dérive plus.
    git: {
      branch: 'worktree-fantome-de-test',
      last_commit: 'abcdef1',
      dirty: true,
    },
    validation: {
      overall_status: 'passed',
      last_checked_at: '2020-01-01T00:00:00Z',
    },
    updated_at: '2020-01-01T00:00:00Z',
  });

  // Appel direct de la fonction plutôt qu'un spawn du script : le CLI résout
  // désormais sa racine depuis l'EMPLACEMENT du fichier (N1), pas depuis le
  // cwd d'appel — un spawn avec `cwd: racine` ignorerait donc la fixture.
  // `construireRapport` reste testable telle quelle : elle prend `racine` en
  // paramètre explicite.
  const rapport = construireRapport(racine);

  const parEchamp = Object.fromEntries(rapport.ecarts.map((e) => [e.champ, e]));
  assert.equal(parEchamp['validation.last_checked_at']?.verdict, 'périmé');
  assert.equal(parEchamp['git.branch'], undefined, 'git.branch ne se compare plus');
  assert.equal(parEchamp['git.dirty'], undefined, 'git.dirty ne se compare plus');

  // Les flags posés dans la fixture doivent être lus réellement, pas codés en
  // dur, et le motif élargi (C1) doit attraper autre chose que `WN_ENABLE_`.
  assert.deepEqual(rapport.flags.referencesDansLeCode, ['WN_C4_TEST_FIXTURE', 'WN_ENABLE_TEST_FIXTURE']);
  assert.equal(rapport.flags.valeurEnvironnement, null, "aucune valeur d'environnement lue : jamais \"actif\"");
  assert.deepEqual(rapport.migrations.noms, ['20260101000000_init']);
  assert.equal(rapport.migrations.verifieEnBase, null);
  assert.match(rapport.migrations.commandeDeVerification, /FROM _prisma_migrations/);
});

test('gh absent : le champ PR porte disponible=false et une raison, jamais un tableau vide silencieux', () => {
  const racine = initDepotMinimal({
    schema_version: 2,
    status: 'idle',
    active_campaign: null,
    active_lot: null,
    git: { branch: null, last_commit: null, dirty: false },
    validation: { last_checked_at: new Date().toISOString() },
  });

  // PATH réduit à un répertoire ne contenant QUE `git` (symlink vers le git
  // réel) : `gh`, présent ou non sur la machine, devient introuvable pour
  // l'appel `execFileSync('gh', …)`. C'est la même défaillance qu'un poste
  // sans `gh` installé. On mute `process.env.PATH` autour de l'appel plutôt
  // que de spawner tout le script — cohérent avec N1 : le script n'utilise
  // plus le cwd pour se repérer, mais `collecterPrOuvertes` (et `git`)
  // continuent de dépendre du PATH hérité par le process courant.
  const gitReel = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-etat-reel-bin-'));
  fs.symlinkSync(gitReel, path.join(binDir, 'git'));

  const pathAvant = process.env.PATH;
  let rapport;
  try {
    process.env.PATH = binDir;
    rapport = construireRapport(racine);
  } finally {
    process.env.PATH = pathAvant;
  }

  assert.equal(rapport.prOuvertes.disponible, false);
  assert.equal(typeof rapport.prOuvertes.raison, 'string');
  assert.ok(rapport.prOuvertes.raison.length > 0);
  assert.equal(rapport.prOuvertes.prs, undefined, 'pas de tableau qui se confondrait avec "aucune PR ouverte"');
  // gh indisponible n'empêche pas le reste du rapport de s'assembler.
  assert.deepEqual(rapport.migrations.noms, ['20260101000000_init']);
});

/**
 * Un faux `gh` posé en tête de `PATH`, qui rend toujours la même chose.
 *
 * POURQUOI. `collecterPrOuvertes` appelle `gh pr list --json
 * number,title,isDraft,updatedAt` — un appel LIVE à l'API GitHub. N1 compare
 * deux exécutions par `deepEqual` : il comparait donc des données que GitHub
 * fait bouger tout seul. Deux causes le faisaient rougir, aucune n'ayant le
 * moindre rapport avec le code testé :
 *
 *   • une PR dont le CI TOURNE pendant la passe — son `updatedAt` change entre
 *     les deux spawns. C'est-à-dire la situation NORMALE juste après un push,
 *     et donc précisément le moment où l'on joue T2 (constaté le 2026-09-06,
 *     PR #888 : T2 sortait en 1 avant même la phase Vitest, et le banc était
 *     vert cinq fois de suite en isolation) ;
 *   • un `gh` qui échoue d'un seul côté — `disponible` bascule, `deepEqual`
 *     avec.
 *
 * Le stub supprime la course SANS rien retirer : les deux exécutions
 * traversent le même chemin de code, `cwd: racine` compris, et le cas NOMINAL
 * (`disponible: true`) devient joué de façon déterministe — il ne l'était par
 * aucun banc, celui de la ligne 159 ne couvrant que `gh` absent.
 */
function posePasserelleGhDeterministe() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-etat-reel-gh-'));
  const faux = path.join(dossier, 'gh');
  fs.writeFileSync(
    faux,
    '#!/bin/sh\n'
      + 'echo \'[{"number":1,"title":"banc","isDraft":false,'
      + '"updatedAt":"2026-01-01T00:00:00Z"}]\'\n',
  );
  fs.chmodSync(faux, 0o755);
  return { dossier, PATH: `${dossier}${path.delimiter}${process.env.PATH ?? ''}` };
}

test("N1 — régression : le rapport ne dépend pas du cwd d'appel", () => {
  // Reproduction exacte du bug trouvé par la revue : `cd web && node
  // ../scripts/wn-etat-reel.mjs` rendait 0 écart en code 0, parce que
  // `process.cwd()` pointait sous `web/` où `.wn/` n'existe pas. Ce test
  // spawn le script réel (pas une fixture) depuis deux cwd différents du
  // MÊME dépôt et exige un rapport identique — c'est la seule façon de tester
  // la résolution de racine du CLI, puisqu'elle est désormais dérivée de
  // l'emplacement du fichier et non plus injectable par `cwd`.
  //
  // La seule source non déterministe du rapport est neutralisée : voir
  // `posePasserelleGhDeterministe`.
  const passerelle = posePasserelleGhDeterministe();
  const env = { ...process.env, PATH: passerelle.PATH };
  try {
    const depuisRacine = spawnSync(process.execPath, [SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
    });
    const depuisWeb = spawnSync(process.execPath, [SCRIPT], {
      cwd: path.join(REPO_ROOT, 'web'),
      encoding: 'utf8',
      env,
    });

    assert.equal(depuisRacine.status, 0, depuisRacine.stderr);
    assert.equal(depuisWeb.status, 0, depuisWeb.stderr);

    const rapportRacine = JSON.parse(depuisRacine.stdout);
    const rapportWeb = JSON.parse(depuisWeb.stdout);

    // LE STUB A-T-IL SEULEMENT PRIS ? Sans cette garde, un faux `gh`
    // introuvable ou non exécutable ferait rendre `disponible: false` aux DEUX
    // exécutions : le `deepEqual` resterait vert et le banc aurait
    // silencieusement cessé de couvrir le chemin nominal — la classe « un
    // garde qui ne descend pas assez bas », déjà rencontrée sur ce dépôt.
    assert.equal(rapportRacine.prOuvertes.disponible, true, 'le faux `gh` n’a pas été appelé');
    assert.deepEqual(rapportRacine.prOuvertes.prs.map(pr => pr.number), [1]);

    // `genereLe` porte l'horodatage d'exécution : seul champ qui peut varier
    // légitimement entre les deux appels.
    delete rapportRacine.genereLe;
    delete rapportWeb.genereLe;

    assert.deepEqual(rapportWeb.ecarts, rapportRacine.ecarts);
    assert.deepEqual(rapportWeb, rapportRacine);
  } finally {
    fs.rmSync(passerelle.dossier, { recursive: true, force: true });
  }
});

test('N3 — le registre de certification réel est instrument_registry.json, 65 instruments', () => {
  const resultat = lireRegistreCertification(REPO_ROOT);
  assert.equal(resultat.status, 'loaded');
  assert.equal(resultat.chemin, path.join('docs', 'claude', 'corpus', 'instrument_registry.json'));
  assert.equal(resultat.entries, 65);
});

test('registre de certification absent : status "missing", jamais une exception', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-etat-reel-cert-'));
  const resultat = lireRegistreCertification(racine);
  assert.equal(resultat.status, 'missing');
});

test('registre de certification présent mais JSON invalide : status "invalid", jamais une exception', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-etat-reel-cert-invalide-'));
  const cheminRegistre = path.join(racine, 'docs', 'claude', 'corpus', 'instrument_registry.json');
  fs.mkdirSync(path.dirname(cheminRegistre), { recursive: true });
  fs.writeFileSync(cheminRegistre, '{ ceci ne parse pas');
  const resultat = lireRegistreCertification(racine);
  assert.equal(resultat.status, 'invalid');
});

test('registre de certification au format objet `{ instruments: [...] }` : compte via la clé, pas Array.isArray au premier niveau', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-etat-reel-cert-objet-'));
  const cheminRegistre = path.join(racine, 'docs', 'claude', 'corpus', 'instrument_registry.json');
  fs.mkdirSync(path.dirname(cheminRegistre), { recursive: true });
  fs.writeFileSync(
    cheminRegistre,
    JSON.stringify({ version: 1, dateAudit: '2026-01-01', commentaire: 'fixture', instruments: [{ id: 'A' }, { id: 'B' }] }),
  );
  const resultat = lireRegistreCertification(racine);
  assert.equal(resultat.status, 'loaded');
  assert.equal(resultat.entries, 2);
});

// ── Contrainte de sûreté : aucune connexion base de données ────────────────
//
// CLAUDE.md réserve la lecture de production à l'outil MCP Supabase. Ce test
// matérialise la contrainte au niveau du texte source : ni `pg`, ni un client
// Prisma, ni `psql`/`supabase` en ligne de commande, ni une variable
// d'environnement de connexion ne doivent y être lus.
test('aucune connexion base de données : ni module `pg`, ni client Prisma, ni psql/supabase exécutés, ni DATABASE_URL', () => {
  assert.doesNotMatch(SOURCE, /from ['"]pg['"]/);
  assert.doesNotMatch(SOURCE, /require\(['"]pg['"]\)/);
  assert.doesNotMatch(SOURCE, /new Client\(/);
  assert.doesNotMatch(SOURCE, /@prisma\/client/);
  assert.doesNotMatch(SOURCE, /DATABASE_URL/);
  // `psql` et `supabase` apparaissent légitimement en PROSE dans le
  // commentaire de tête (« jamais psql… », citant CLAUDE.md) — la garde
  // cherche donc un appel EXÉCUTABLE sur ces binaires, pas la simple présence
  // du mot dans un commentaire.
  assert.doesNotMatch(SOURCE, /execFileSync\(\s*['"](psql|supabase)['"]/);
  assert.doesNotMatch(SOURCE, /\bexec(Sync)?\(\s*['"`][^'"`]*\b(psql|supabase)\b/);
});

// ── Garde textuelle : jamais d'écriture de fichier ──────────────────────────
//
// Ce script est un rapporteur, pas un réparateur (`node scripts/wn-cycle.mjs
// --appliquer` existe déjà pour ça). L'absence de toute écriture est vérifiée
// au texte source plutôt qu'à l'exécution : une garde d'exécution ne prouverait
// que le chemin emprunté par CE run, pas l'absence du code à un autre endroit.
// `writeMachineState` est explicitement interdit en plus de `writeFileSync` :
// `wn-state.mjs` l'exporte à côté de `readMachineState`/`readCampaignTruth`
// que ce script importe déjà — rien n'empêcherait une édition future de
// l'ajouter au même import sans que les deux autres motifs le détectent (C7).
test("jamais d'écriture de fichier : ni writeFileSync, ni writeMachineState, nulle part dans le source", () => {
  assert.doesNotMatch(SOURCE, /writeFileSync/);
  assert.doesNotMatch(SOURCE, /fs\.write\(/);
  assert.doesNotMatch(SOURCE, /fs\.appendFile/);
  assert.doesNotMatch(SOURCE, /writeMachineState/);
});
