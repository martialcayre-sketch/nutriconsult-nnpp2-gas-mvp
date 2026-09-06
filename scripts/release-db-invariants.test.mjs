// Invariants de sûreté du workflow `release-db` — le SEUL chemin d'écriture de la
// base de production.
//
// POURQUOI CE BANC. Depuis que le workflow est PROPOSÉ AUTOMATIQUEMENT (déclencheur
// `push` sur une migration mergée), il ne reste plus qu'UNE barrière entre un merge
// et une écriture en production : l'environnement protégé `release-db`. Avant, il en
// fallait deux — qu'un humain clique « Run workflow », ET que l'environnement gate.
// Un `environment:` retiré par mégarde était alors inoffensif tant que personne ne
// déclenchait ; il ne l'est plus.
//
// Ce banc ne remplace pas la configuration côté GitHub (required reviewers, politique
// de branches), qu'un test ne peut pas voir. Il verrouille ce qui vit dans le dépôt,
// c'est-à-dire ce qu'une PR peut casser en silence.
//
// Il travaille sur le TEXTE et non sur un objet YAML : aucun parseur n'est résolvable
// depuis la racine du dépôt, et ce sont de toute façon des propriétés de forme —
// « ce job ne porte pas telle clé » — qu'un objet reconstruit rendrait plus flou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHEMIN = join(RACINE, '.github/workflows/release-db.yml');
const SOURCE = readFileSync(CHEMIN, 'utf8');

/**
 * Découpe la section `jobs:` en blocs, un par job. Un job commence à une ligne
 * `  <nom>:` en indentation 2 et court jusqu'au job suivant.
 */
function blocsDeJobs(source) {
  const lignes = source.split('\n');
  const debutJobs = lignes.findIndex((l) => l === 'jobs:');
  assert.notEqual(debutJobs, -1, 'section `jobs:` introuvable');

  const blocs = new Map();
  let courant = null;
  for (const ligne of lignes.slice(debutJobs + 1)) {
    const entete = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(ligne);
    if (entete) {
      courant = entete[1];
      blocs.set(courant, []);
      continue;
    }
    if (courant) blocs.get(courant).push(ligne);
  }
  return new Map([...blocs].map(([nom, l]) => [nom, l.join('\n')]));
}

const JOBS = blocsDeJobs(SOURCE);

test('les trois jobs attendus existent', () => {
  assert.deepEqual([...JOBS.keys()].sort(), ['ref-refusee', 'release', 'resume']);
});

test('`release` est le seul job à porter `environment: release-db`', () => {
  const porteurs = [...JOBS].filter(([, bloc]) => /^\s+environment:\s*release-db\s*$/m.test(bloc));
  assert.deepEqual(
    porteurs.map(([nom]) => nom),
    ['release'],
    "l'environnement protégé doit être porté par `release`, et par lui seul",
  );
});

test('`release` reste borné à main', () => {
  assert.match(
    JOBS.get('release'),
    /^\s+if:\s*github\.ref == 'refs\/heads\/main'\s*$/m,
    'le garde de ref de `release` a disparu — un dispatch depuis une branche écrirait en production',
  );
});

test('`ref-refusee` porte toujours la condition inverse et échoue', () => {
  const bloc = JOBS.get('ref-refusee');
  assert.match(bloc, /^\s+if:\s*github\.ref != 'refs\/heads\/main'\s*$/m);
  assert.match(bloc, /exit 1/, 'une ref refusée doit échouer bruyamment, pas être *skipped*');
});

test('`resume` ne porte aucun environnement et ne voit aucun secret', () => {
  const bloc = JOBS.get('resume');
  assert.doesNotMatch(
    bloc,
    /^\s+environment:/m,
    "`resume` doit rester HORS du gate : c'est ce qui lui permet de s'exécuter AVANT l'approbation",
  );
  assert.doesNotMatch(
    bloc,
    /secrets\./,
    "`resume` s'exécute sans approbation humaine — aucun secret ne doit y être en portée",
  );
});

test('`release` dépend de `resume`, pour que le résumé précède la demande', () => {
  assert.match(JOBS.get('release'), /^\s+needs:\s*resume\s*$/m);
});

// Depuis le cutover du 2026-08-22 (D-080/D-087), le mode import-cb est HORS
// SERVICE : il visait Supabase. Le refus doit être EXPLICITE (une garde qui
// échoue en le disant), jamais un mode qui « tombe en marche » sur une base
// décommissionnée — et il doit rester la SEULE étape qui mentionne import-cb :
// une étape d'import réapparue à côté du refus serait le retour silencieux du
// mode, refus maintenu en façade.
test('le mode import-cb est refusé explicitement, et rien d’autre ne le porte', () => {
  const lignesImport = SOURCE.split('\n').filter(
    (l) => /^\s+if:/.test(l) && l.includes('import-cb'),
  );
  assert.equal(
    lignesImport.length,
    1,
    `une seule garde import-cb attendue (le refus), trouvé ${lignesImport.length}`,
  );
  assert.match(
    lignesImport[0],
    /github\.event_name == 'workflow_dispatch'/,
    "le refus ne concerne que le dispatch : un push n'a pas de mode",
  );
  assert.match(
    JOBS.get('release'),
    /import-cb hors service[\s\S]*?exit 1/,
    'le refus doit se dire hors service et échouer bruyamment',
  );
});

// La leçon de l'incident du 2026-08-22 : le workflow appliquait ses migrations
// sur Supabase parce qu'un secret d'URL (MIGRATE_ + DATABASE_URL) était resté
// pointé dessus au cutover. Depuis D-087, AUCUNE URL de base ne transite par
// GitHub — le one-off tourne là où l'add-on injecte l'URL. Ce banc interdit le
// retour du motif jusque dans les commentaires : si une URL de base redevient
// nécessaire ici, c'est le MODÈLE qui change (décision), pas une variable
// qu'on ajoute.
test('aucune URL de base ne transite par le workflow', () => {
  assert.doesNotMatch(SOURCE, /DATABASE_URL/, 'aucune variable *DATABASE_URL ne doit réapparaître');
  assert.doesNotMatch(SOURCE, /postgres(ql)?:\/\//, 'aucune URL de connexion ne doit réapparaître');
});

// Une sentinelle non liée au run est un faux vert en attente : `logs --filter`
// est un MOTIF, et un WN_RELEASE_DB_OK laissé par un one-off antérieur dans la
// fenêtre de logs passerait pour le succès du run courant — sur le chemin
// d'écriture du schéma HDS.
test('les sentinelles des one-offs sont liées au run courant', () => {
  const bloc = JOBS.get('release');
  assert.match(
    bloc,
    /WN_RELEASE_ID: \$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
    'l’identifiant de run doit exister et inclure la tentative',
  );
  for (const sentinelle of ['WN_RELEASE_DB_OK', 'WN_RELEASE_DB_ECHEC', 'WN_STATUT_DB_OK', 'WN_STATUT_DB_ECHEC']) {
    assert.match(
      bloc,
      new RegExp(`${sentinelle} id=\\$WN_RELEASE_ID`),
      `le grep de ${sentinelle} doit exiger l'id du run, pas le mot seul`,
    );
  }
});

// Les deux calculs d'empreinte — runner (commit approuvé) et conteneur (image
// déployée) — ne se comparent qu'à condition d'être LE MÊME calcul. Une
// divergence future (un côté modifié sans l'autre) rendrait toute release
// impossible, sans que rien ne l'ait signalé avant la production : la tenir
// ici, à l'octet près, au `cd web && ` près.
test('les deux calculs d’empreinte des migrations sont identiques', () => {
  const script = readFileSync(join(RACINE, 'web/scripts/release-db-scalingo.sh'), 'utf8');
  const duWorkflow = /EMPREINTE=\$\(cd web && (.+)\)/.exec(SOURCE);
  const duConteneur = /EMPREINTE_IMAGE=\$\((.+)\)/.exec(script);
  assert.ok(duWorkflow, "calcul d'empreinte introuvable dans le workflow");
  assert.ok(duConteneur, "calcul d'empreinte introuvable dans le script du one-off");
  assert.equal(
    duWorkflow[1],
    duConteneur[1],
    'les deux expressions doivent rester identiques — sinon toute release échoue sur empreinte_migrations',
  );
});

// Leçon de la première répétition générale (run 32578782755, 2026-08-22) : le
// CLI Scalingo n'authentifie PAS par la variable d'environnement — sans
// `login --api-token`, chaque appel échoue, et un échec d'API muet se lit
// exactement comme « drapeau absent ». Le login doit exister, et venir AVANT
// le premier appel qui parle à l'app.
test('le CLI se connecte explicitement avant le premier appel à l’app', () => {
  const bloc = JOBS.get('release');
  const login = bloc.indexOf('scalingo login --api-token');
  const premierAppel = bloc.indexOf('env-get WN_MIGRATIONS_PAR_RELEASE_DB');
  assert.ok(login > -1, "l'étape de login a disparu — aucun appel Scalingo ne réussit sans elle");
  assert.ok(premierAppel > -1, 'la garde du drapeau a disparu');
  assert.ok(login < premierAppel, "le login doit précéder le premier appel à l'app");
});

// Le jeton d'API est une créance PLEINE sur l'app (one-offs, environnement,
// tunnels) : en portée de job, il serait visible de TOUTES les étapes — dont
// l'installation du CLI, qui exécute du contenu téléchargé.
test('le jeton API est borné aux étapes qui parlent à Scalingo', () => {
  const bloc = JOBS.get('release');
  const avantSteps = bloc.slice(0, bloc.indexOf('    steps:'));
  assert.ok(avantSteps.length > 0, 'section steps introuvable dans release');
  assert.doesNotMatch(
    avantSteps,
    /SCALINGO_API_TOKEN:/,
    'le jeton ne doit pas être en portée de job',
  );
});

// L'installeur « dernière version » du domaine de téléchargement mettait du
// contenu non épinglé sur le chemin d'écriture de la production. Version figée
// + empreinte vérifiée : une mise à jour du CLI est une PR, pas un aléa.
test('le CLI Scalingo est épinglé par version et empreinte', () => {
  const bloc = JOBS.get('release');
  assert.match(bloc, /github\.com\/Scalingo\/cli\/releases\/download\//, 'archive de release épinglée attendue');
  assert.match(bloc, /sha256sum -c/, "l'archive doit être vérifiée par empreinte");
  assert.doesNotMatch(bloc, /cli-dl\.scalingo\.com/, "l'installeur « dernière version » ne doit pas revenir");
});

// Toute la gouvernance tient à une variable d'app : si le drapeau saute, le
// postdeploy migre en silence À CÔTÉ de la porte. Le constater à chaque
// release, par `env-get` (jamais `env`, qui déverserait les secrets de l'app).
test('le drapeau de gouvernance est constaté, pas cru', () => {
  assert.match(JOBS.get('release'), /env-get WN_MIGRATIONS_PAR_RELEASE_DB/);
});

// D-102 — la release DÉCLENCHE le déploiement qu'elle attend. Sans ce
// déclenchement, l'étape d'attente redevient l'interblocage : Scalingo attend
// que tous les checks du commit concluent, `release-db` en est un, et il
// attend le déploiement. Trois refus le 2026-08-23 avant que la cause soit
// nommée.
test('la release déclenche le déploiement avant de l’attendre', () => {
  const bloc = JOBS.get('release');
  // L'INVOCATION, pas la prose : un commentaire cite la commande plus haut
  // dans la même étape, et un `indexOf` nu ancrait ce banc sur lui.
  const declenche = bloc.indexOf('integration-link-manual-deploy main');
  const attend = bloc.indexOf('jamais déployé en success');
  assert.ok(declenche > -1, 'le déclenchement du déploiement a disparu — l’interblocage revient');
  assert.ok(attend > -1, "l'attente du déploiement a disparu");
  assert.ok(declenche < attend, "le déclenchement doit précéder l'attente, sinon il ne sert à rien");
});

// `integration-link-manual-deploy` déploie une BRANCHE. Si la tête de `main`
// n'est plus le commit approuvé, tout dépend de CE qui est arrivé : des
// migrations nouvelles, que personne n'a approuvées — exactement ce que tout
// ce workflow existe pour empêcher — ou aucune, auquel cas l'ensemble à
// écrire est identique à l'approuvé. Le refus aveugle d'origine a échoué le
// 2026-09-06 (run 33966114073) sur un push DOCUMENTAIRE, après 20 h
// d'attente d'approbation : une garde qui refuse à tort quand elle peut
// trancher n'est pas une garde, c'est un bruit.
test('le déclenchement exige que la tête de main soit le commit approuvé', () => {
  const bloc = JOBS.get('release');
  const debut = bloc.indexOf('Déclenchement du déploiement');
  const fin = bloc.indexOf('integration-link-manual-deploy main');
  // Sans ces deux ancres, `slice` rendrait une tranche arbitraire où les
  // assertions ci-dessous passeraient pour de mauvaises raisons — constaté en
  // mutation : l'invocation retirée, ce banc restait vert.
  assert.ok(debut > -1 && fin > debut, 'les ancres de l’étape de déclenchement ont bougé');
  const etape = bloc.slice(debut, fin);
  assert.match(etape, /git rev-parse origin\/main/, 'la tête de main doit être constatée');
  assert.match(
    etape,
    /!=\s*"\$GITHUB_SHA"/,
    'une tête différente du commit approuvé doit être jugée',
  );
  assert.match(
    etape,
    /merge-base --is-ancestor "\$GITHUB_SHA" "\$TETE"/,
    'une tête hors de la ligne du commit approuvé (force-push) doit arrêter le déclenchement',
  );
  assert.match(
    etape,
    /git diff --quiet "\$GITHUB_SHA" "\$TETE" -- web\/prisma\/migrations\//,
    'une tête apportant des migrations nouvelles doit arrêter le déclenchement — elles sont non approuvées',
  );
  assert.match(etape, /exit 1/, 'le refus doit être franc, pas un avertissement');
});

// Quand la tête acceptée n'est pas le commit approuvé, c'est ELLE que le
// build déploie : sans repointage, la garde suivante attendrait 20 minutes
// un déploiement du commit approuvé qui ne viendra jamais.
test('une tête acceptée à la place du commit approuvé repointe la garde', () => {
  const bloc = JOBS.get('release');
  const debut = bloc.indexOf('Déclenchement du déploiement');
  const fin = bloc.indexOf('Release en one-off');
  assert.ok(debut > -1 && fin > debut, 'les ancres du déploiement ont bougé');
  const etape = bloc.slice(debut, fin);
  assert.match(
    etape,
    /GITHUB_SHA="\$TETE"/,
    'la garde doit attendre la tête déployée, pas le commit approuvé qu’elle a dépassé',
  );
});

// LE point de sûreté de D-102 : le pouvoir de déployer reste DERRIÈRE le gate
// humain. Déplacer ce déclenchement dans `resume` ferait gagner cinq minutes
// de build — et rendrait le jeton Scalingo atteignable sans approbation, ce
// que D-087 a précisément construit pour l'empêcher.
test('aucun job hors du gate ne déclenche de déploiement', () => {
  for (const [nom, bloc] of JOBS) {
    if (nom === 'release') continue;
    assert.doesNotMatch(
      bloc,
      /integration-link-manual-deploy|scalingo deploy/,
      `le job \`${nom}\` déclenche un déploiement hors de l'environnement protégé`,
    );
  }
});

// Les trois boucles d'attente cumulent ~35 minutes ; sans borne, un run
// suspendu occuperait le groupe de concurrence — et donc TOUTE release
// suivante — indéfiniment.
test('le job release est borné dans le temps', () => {
  assert.match(JOBS.get('release'), /^\s+timeout-minutes:\s*\d+\s*$/m);
});

// D-044 a élargi ce filtre, DÉLIBÉRÉMENT et à un seul chemin de plus. La borne
// n'a pas disparu, elle a changé de valeur : ce banc la tient à sa nouvelle
// valeur exacte. Élargir encore reste une décision, pas un geste de passage —
// chaque chemin ajouté fait proposer une release, donc demande une approbation
// humaine, à chaque push qui le touche.
test('le déclencheur automatique est borné à main et aux deux chemins décidés', () => {
  const bloc = /^on:\n([\s\S]*?)^concurrency:/m.exec(SOURCE);
  assert.ok(bloc, 'section `on:` introuvable');
  const declencheurs = bloc[1];
  assert.match(declencheurs, /^ {2}push:\s*$/m, 'le déclencheur `push` a disparu');
  assert.match(declencheurs, /^ {4}branches:\s*\[main\]\s*$/m, '`push` doit être borné à `main`');
  assert.match(
    declencheurs,
    /^ {6}- 'web\/prisma\/migrations\/\*\*'\s*$/m,
    'le filtre `paths` doit viser les migrations, seul chemin légitime de leur registre canonique',
  );
  // Sans ce chemin, le contrat de fraîcheur des claims — qui n'a de sens que
  // contre la production — ne démarrerait jamais seul : le LOT-01 ne porte
  // aucune migration. C'est le précédent D-015 (rejeu promis, jamais câblé).
  assert.match(
    declencheurs,
    /^ {6}- 'web\/src\/lib\/clinical\/\*\*'\s*$/m,
    "le filtre `paths` doit viser les tables de règles cliniques (D-044), sans quoi le contrat de fraîcheur des claims ne se rejoue jamais",
  );
  const chemins = declencheurs.match(/^ {6}- '.*'$/gm) ?? [];
  assert.equal(chemins.length, 2, `deux chemins attendus dans \`paths\`, trouvé ${chemins.length}`);
});

// Le commentaire de la section `on:` explique au relecteur ce que le filtre laisse
// passer. S'il nomme un autre chemin que celui réellement appliqué, il enseigne le
// faux à la seule personne qui relira ce fichier avant d'approuver une écriture en
// production. C'est arrivé dès la première rédaction : le commentaire disait
// `prisma/migrations/**` quand le filtre visait `web/prisma/migrations/**`.
test('le commentaire du déclencheur nomme le chemin réellement filtré', () => {
  const bloc = /^on:\n([\s\S]*?)^concurrency:/m.exec(SOURCE);
  const declencheurs = bloc[1];
  const chemins = [...declencheurs.matchAll(/^ {6}- '(.+)'$/gm)].map((m) => m[1]);
  assert.ok(chemins.length > 0, 'aucun chemin lisible dans `paths`');

  // Les spans sont relevés LIGNE PAR LIGNE : sur le texte entier, une regex
  // apparie la backtick fermante d'une citation avec l'ouvrante de la suivante et
  // capture la prose qui les sépare. Première rédaction de ce banc, et il rougissait
  // sur un fichier sain.
  // Depuis D-044 le filtre porte DEUX chemins : une citation doit être l'un
  // d'eux, pas « le » chemin. Un commentaire qui citerait un glob voisin mais
  // faux — `migrations/**` pour `web/prisma/migrations/**` — enseignerait le
  // faux à la seule personne qui relira ce fichier avant d'approuver une
  // écriture en production.
  const cites = declencheurs
    .split('\n')
    .filter((l) => /^\s*#/.test(l))
    .flatMap((l) => l.match(/`[^`]+`/g) ?? [])
    .filter((c) => c.includes('/**`'));

  assert.ok(cites.length > 0, 'le commentaire doit citer les chemins filtrés, pour que le relecteur sache');
  for (const cite of cites) {
    assert.ok(
      chemins.includes(cite.slice(1, -1)),
      `le commentaire cite ${cite}, qui n'est pas un des chemins filtrés (${chemins.join(', ')})`,
    );
  }

  // Chaque chemin réellement filtré est expliqué quelque part dans le
  // commentaire : en ajouter un en silence est précisément ce qu'un relecteur
  // ne doit pas avoir à découvrir en lisant le YAML.
  for (const chemin of chemins) {
    assert.ok(
      cites.includes(`\`${chemin}\``),
      `le chemin filtré \`${chemin}\` n'est expliqué par aucun commentaire`,
    );
  }
});
