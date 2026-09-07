// Banc anti-dérive de la liste `test:court14` (web/package.json).
//
// Le CI joue Vitest dans les DEUX positions de `WN_ALI_01_SIIN57`. Depuis le
// 2026-08-07, une seule des deux est complète : la position ALLUMÉE
// (`test:siin57`), parce que c'est celle de la PRODUCTION sur les trois
// environnements. La position éteinte (`test:court14`) est réduite aux seuls
// specs dont le verdict dépend de la position du drapeau — les autres y
// rendraient exactement le verdict qu'ils rendent dans la passe complète.
// L'inverse — restreindre la passe de production — aurait réduit la couverture
// de la configuration réelle à quelques specs.
//
// `Q_ALI_01` est résolu AU CHARGEMENT DU MODULE
// (web/src/lib/questionnaires/alimentaire.ts) — aucun mock ne bascule la forme
// après coup, donc la dépendance se lit STATIQUEMENT dans les sources.
//
// La liste vit dans `web/package.json`, source unique : `npm run check`, `ci.yml`
// et `wn-test-worktree.sh` appellent tous les mêmes scripts npm. Une liste tenue
// à la main dérive au premier spec ajouté ; ce banc DÉRIVE les candidats du code
// par quatre marqueurs et exige un triage explicite — tout candidat est dans la
// liste, ou dans l'allowlist motivée ci-dessous. Un spec nouveau qui touche au
// drapeau fait rougir ce banc le jour où il naît, pas six semaines plus tard.
//
// Les marqueurs, et pourquoi CES formes-là :
//   1. le drapeau lui-même (`WN_ALI_01_SIIN57`) ;
//   2. les symboles dont la VALEUR dépend de la forme servie (`BESOIN_SOURCES`,
//      `VERSION_SCORE_EQUILIBRE`, `MAX_RYTHME_CHRONO`) ;
//   3. le BALAYAGE du catalogue — sous son nom (`QUESTIONNAIRE_CATALOGUE`) ou
//      sous son alias public `CATALOGUE_DEFINITIONS` (bibliotheque.ts, le MÊME
//      objet : un banc qui n'en connaîtrait qu'un nom serait aveugle à l'autre).
//      Un balayage rencontre `Q_ALI_01` sous sa forme servie. PAS la simple
//      mention du catalogue : une consultation ponctuelle d'un questionnaire
//      ≠ Q_ALI_01 est indépendante du drapeau PAR CONSTRUCTION, et l'y soumettre
//      noierait le triage sous une quinzaine de faux positifs sans en attraper
//      un seul vrai ;
//   4. la référence à `Q_ALI_01` (bornée par \b : `Q_ALI_01_SIIN_57` et
//      `Q_ALI_01_COURT_14`, les deux formes importées EXPLICITEMENT, ne matchent
//      pas — nommer une forme précise, c'est justement ne pas dépendre de celle
//      qui est servie).
//
// Limites assumées :
//   · un idiome de balayage nouveau (`for…in`, spread) qui ne citerait ni
//     `Q_ALI_01` ni les symboles passerait. C'est le prix de ne pas noyer le
//     triage ; le marqueur 4 attrape tout accès nommé ;
//   · un spec qui dépendrait du drapeau à travers un export INTERMÉDIAIRE, sans
//     citer aucun marqueur, serait invisible. Deux tests plus bas ferment cette
//     porte-là en amont : la forme servie ne circule que par TROIS fichiers de
//     production, et les exports de celui qui en dérive sont tous nommés par le
//     marqueur 2. Un quatrième fichier, ou un export non nommé, fait rougir le
//     banc avant que l'angle mort n'existe. La détection y est volontairement
//     large — toute mention de la valeur, pas seulement l'accès de propriété :
//     la destructuration, le passage en argument, le réexport et l'indexation
//     par chaîne échappaient tous à la forme étroite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(RACINE, 'web');

// Exports de la porte de dérivation dont la VALEUR dépend de la forme servie.
// Source unique : le marqueur 2 en dérive sa regex, et le garde de complétude
// teste l'appartenance à cette liste — un `includes` sur des sources de regex
// concaténées reconnaissait `SOURCES` comme « déjà nommé » parce que
// `BESOIN_SOURCES` le contient, et laissait donc passer l'export qu'il devait
// attraper.
const SYMBOLES_DERIVES = ['BESOIN_SOURCES', 'VERSION_SCORE_EQUILIBRE', 'MAX_RYTHME_CHRONO'];

const MARQUEURS = [
  { nom: 'drapeau WN_ALI_01_SIIN57', regex: /WN_ALI_01_SIIN57/ },
  {
    nom: 'symboles sensibles à la forme servie',
    // Dérivée de SYMBOLES_DERIVES, et non recopiée : le garde de complétude
    // teste l'appartenance à cette liste, il faut donc que la regex et lui
    // parlent de la même chose.
    regex: new RegExp(`\\b(?:${SYMBOLES_DERIVES.join('|')})\\b`),
  },
  {
    nom: 'balayage du catalogue',
    regex: /Object\.(?:keys|values|entries)\(\s*(?:QUESTIONNAIRE_CATALOGUE|CATALOGUE_DEFINITIONS)/,
  },
  { nom: 'référence à Q_ALI_01', regex: /\bQ_ALI_01\b/ },
];

// Candidats VOLONTAIREMENT exclus de la liste. Chaque entrée doit rester un
// candidat (sinon elle est morte et le banc la refuse) : l'allowlist ne peut
// pas accumuler de sédiments.
const ALLOWLIST = new Map([
  [
    'src/lib/fil/cartes.test.ts',
    'ne nomme Q_ALI_01 que comme IDENTIFIANT d’instrument du rideau T0 (carte « T0 à confirmer », '
      + 'D-150) : la carte compte des instruments distincts, elle ne lit ni score ni forme servie',
  ],
  [
    'src/lib/protocol/repassationCiblee.test.ts',
    'ne lit de BESOIN_SOURCES que les identifiants de questionnaire — jamais les max, seuls sensibles '
      + 'à la forme servie : le verdict est identique sous les deux drapeaux',
  ],
  [
    'src/app/api/praticien/synthese/route.post.test.ts',
    'mentionne le drapeau mais score sur ses propres fixtures, indépendantes de la forme servie',
  ],
  [
    'src/lib/questionnaires/alimentaireSiin57.guard.test.ts',
    'éprouve la forme 57 par import DIRECT de Q_ALI_01_SIIN_57, quelle que soit la forme servie',
  ],
  [
    'src/lib/formeCroiseeQAli01.guard.test.ts',
    'passe les DEUX définitions explicitement (Q_ALI_01_COURT_14 et Q_ALI_01_SIIN_57) : il éprouve '
      + 'le croisement des formes, jamais celle qui est servie',
  ],
  [
    'src/app/api/praticien/synthese/passationCourante.test.ts',
    'le verdict ne dépend pas de la forme servie : l’abstention du repère (D-051) vient d’une CONSTANTE '
      + '(`INSTRUMENTS_A_FORME_VARIABLE`), sans lecture d’environnement — un banc du fichier l’épingle',
  ],
  [
    'src/lib/agendaAlimentaireDrapeau.guard.test.ts',
    'garde le drapeau WN_AGENDA_ALI ; cite WN_ALI_01_SIIN57 en contre-exemple, sans en dépendre',
  ],
  [
    'src/lib/equilibre/porteursSousScore.guard.test.ts',
    'mocke le catalogue avec une source synthétique : le verdict ne dépend pas de la forme servie',
  ],
  [
    'src/lib/tfdRecueilPartiel.guard.test.ts',
    'ne lit que BESOIN_SOURCES[4] (Q_GAS_01), insensible à la forme de Q_ALI_01',
  ],
  [
    'src/lib/protocol/versioning.test.ts',
    'compare à VERSION_SCORE_EQUILIBRE importé, que la production lit aussi : vert par construction dans les deux positions',
  ],
  ['src/lib/clinical-engine/clinicalSnapshot.test.ts', 'même motif tautologique que versioning.test.ts'],
  ['src/app/api/praticien/protocoles/route.test.ts', 'même motif tautologique que versioning.test.ts'],
  [
    'src/lib/bibliotheque.test.ts',
    'balaye le catalogue mais n’assère que des identifiants et des propriétés de structure, stables dans les deux positions',
  ],
  [
    'src/components/patient/GenericQuestionnaire.test.tsx',
    'reçoit la forme en prop ; « Q_ALI_01 » n’y est qu’un identifiant opaque de fixture',
  ],
  [
    'src/lib/questionnaire-display.test.ts',
    'les deux formes lui sont passées explicitement ; la table des rendus est statique par identifiant',
  ],
  ['src/app/api/patient/submit/route.test.ts', '« Q_ALI_01 » y est un identifiant opaque, jamais sa forme'],
  [
    'src/lib/portail/hubQuestionnaires.test.ts',
    '« Q_ALI_01 » y est l’identifiant d’une fixture d’assignation ; le hub n’ouvre jamais la définition',
  ],
  [
    'src/app/api/praticien/agenda-sommeil/relance/route.test.ts',
    '« Q_ALI_01 » y est l’identifiant d’un mock Prisma ; la forme servie n’entre pas dans le verdict',
  ],
]);

// Racines effectivement balayées. Les dériver de `vitest.config.ts` plutôt que
// de les écrire en dur : le jour où `include` gagne une racine, un banc à la
// liste figée cesserait de couvrir les specs qui y vivent — sans rougir.
function racinesDeVitest() {
  const config = fs.readFileSync(path.join(WEB, 'vitest.config.ts'), 'utf8');
  const include = /include:\s*\[([^\]]*)\]/.exec(config);
  assert.ok(include, 'vitest.config.ts : `include` illisible — ce banc ne sait plus quoi balayer.');
  const racines = [...include[1].matchAll(/['"]([^'"/*]+)\//g)].map((m) => m[1]);
  assert.ok(racines.length > 0, 'vitest.config.ts : aucune racine extraite de `include`.');
  return [...new Set(racines)];
}

// Les TROIS portes par lesquelles la définition servie circule dans le code de
// production, et rien d'autre. Chacune est couverte par un marqueur : la
// définition et le catalogue par les marqueurs 3 et 4, la dérivation par le
// marqueur 2 qui nomme ses trois exports.
const PORTE_DE_DERIVATION = 'src/lib/equilibre/constants.ts';
const PORTES_CONNUES = [
  'src/lib/questions.ts', // insère la forme servie dans QUESTIONNAIRE_CATALOGUE
  PORTE_DE_DERIVATION, // seule à en dériver des valeurs
  'src/lib/questionnaires/alimentaire.ts', // choisit la forme selon le drapeau
];

/** Sources de production, sur les mêmes racines que les specs (tests exclus). */
function fichiersProduction() {
  const resultat = [];
  for (const base of racinesDeVitest()) {
    const dossier = path.join(WEB, base);
    if (!fs.existsSync(dossier)) continue;
    for (const entree of fs.readdirSync(dossier, { recursive: true })) {
      const rel = path.join(base, String(entree)).split(path.sep).join('/');
      if (/\.tsx?$/.test(rel) && !/\.test\.tsx?$/.test(rel)) resultat.push(rel);
    }
  }
  return resultat;
}

/**
 * Le fichier utilise-t-il la VALEUR `Q_ALI_01` — celle que le drapeau choisit ?
 *
 * Écarté avant l'examen, parce qu'aucun de ces usages ne dépend de la forme
 * servie : les commentaires, l'identifiant littéral `'Q_ALI_01'` (une chaîne,
 * pas la définition), la clé d'objet `Q_ALI_01:` (table indexée par
 * identifiant), et les formes NOMMÉES `Q_ALI_01_SIIN_57` / `Q_ALI_01_COURT_14`
 * — les nommer, c'est précisément ne pas dépendre de celle qui est servie.
 *
 * Tout le reste compte. Chercher l'accès de propriété seul (`Q_ALI_01.`) était
 * trop étroit : la destructuration, le passage en argument, le réexport et
 * l'indexation par chaîne y échappaient tous — quatre idiomes ordinaires.
 */
function utiliseLaFormeServie(source) {
  return /\bQ_ALI_01\b/.test(
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/'Q_ALI_01'|"Q_ALI_01"|`Q_ALI_01`/g, '')
      .replace(/\bQ_ALI_01\s*:/g, '')
      .replace(/\bQ_ALI_01_[A-Z0-9_]+/g, ''),
  );
}

function fichiersTest() {
  const resultat = [];
  for (const base of racinesDeVitest()) {
    const dossier = path.join(WEB, base);
    if (!fs.existsSync(dossier)) continue;
    for (const entree of fs.readdirSync(dossier, { recursive: true })) {
      const rel = path.join(base, String(entree)).split(path.sep).join('/');
      if (/\.test\.tsx?$/.test(rel)) resultat.push(rel);
    }
  }
  return resultat;
}

function scriptsNpm() {
  return JSON.parse(fs.readFileSync(path.join(WEB, 'package.json'), 'utf8')).scripts ?? {};
}

function listeDuScript() {
  const script = scriptsNpm()['test:court14'] ?? '';
  return { script, liste: script.split(/\s+/).filter((t) => /\.test\.tsx?$/.test(t)) };
}

const { script, liste } = listeDuScript();
const tests = fichiersTest();
const candidats = new Map(); // chemin → noms des marqueurs déclenchés
for (const rel of tests) {
  const source = fs.readFileSync(path.join(WEB, rel), 'utf8');
  const declenches = MARQUEURS.filter((m) => m.regex.test(source)).map((m) => m.nom);
  if (declenches.length > 0) candidats.set(rel, declenches);
}

test('test:court14 joue la position éteinte et porte une liste explicite', () => {
  assert.match(script, /^vitest run\b/, 'le script a changé de forme — ce banc ne lit plus la bonne source');
  assert.doesNotMatch(
    script,
    /WN_ALI_01_SIIN57/,
    'test:court14 doit rester la position ÉTEINTE : c’est ce qui justifie de le restreindre.',
  );
  assert.ok(liste.length >= 18, `seulement ${liste.length} spec(s) dans test:court14 — la restriction a perdu des specs`);
});

// L'invariant qui protège la couverture RÉELLE. Le drapeau est allumé en
// production : si un jour `test:siin57` gagnait un filtre de chemin, la seule
// passe qui éprouve la configuration servie aux patients se réduirait à
// quelques fichiers — et rien d'autre ne le dirait.
test('test:siin57 reste une passe COMPLÈTE — c’est la position de production', () => {
  const siin57 = scriptsNpm()['test:siin57'] ?? '';
  assert.match(siin57, /^WN_ALI_01_SIIN57=true vitest run\b/, 'test:siin57 ne pose plus le drapeau.');
  const filtres = siin57.split(/\s+/).filter((t) => /\.test\.tsx?$/.test(t) || t.includes('/'));
  assert.deepEqual(
    filtres,
    [],
    'test:siin57 porte un filtre de chemin : la position de PRODUCTION ne serait plus couverte en entier.',
  );
});

// LA PORTE. Dériver une valeur de la forme SERVIE suppose d'accéder à une
// propriété de `Q_ALI_01` — et dans tout le code de production, un seul fichier
// le fait. Le garde du dessous ne vérifie la complétude des marqueurs que pour
// CE fichier ; si un second se mettait à dériver, ses exports échapperaient aux
// marqueurs et un spec qui les importerait sans citer `Q_ALI_01` deviendrait
// invisible. Ce test-ci refuse donc l'apparition d'une seconde porte : la
// couverture du garde suivant vaut ce que vaut cette liste.
// (`Q_ALI_01_SIIN_57.` / `Q_ALI_01_COURT_14.` sont neutralisés : nommer une
// forme précise, ce n'est pas dépendre de celle qui est servie.)
test('la forme servie ne circule que par les trois portes connues', () => {
  const portes = fichiersProduction().filter((rel) =>
    utiliseLaFormeServie(fs.readFileSync(path.join(WEB, rel), 'utf8')),
  );
  assert.deepEqual(
    portes.sort(),
    [...PORTES_CONNUES].sort(),
    'un fichier de production utilise la forme servie hors des portes connues. Ce qu’il en dérive échappe aux ' +
      'marqueurs : nommer ses exports dans MARQUEURS et l’ajouter à PORTES_CONNUES, sinon un spec qui en dépend ne ' +
      'sera plus joué en position éteinte.',
  );
});

// Un marqueur ne garde que ce qu'il nomme. Les trois symboles du marqueur 2
// sont les exports de `equilibre/constants.ts` dérivés de la forme servie ; un
// quatrième ajouté demain ouvrirait un angle mort en silence. C'est la classe
// « un garde qui ne descend pas assez bas » : le banc vérifie donc que sa
// propre liste de marqueurs est complète, pas seulement qu'elle mord.
test(`aucun export de ${PORTE_DE_DERIVATION} dérivé de Q_ALI_01 n’échappe aux marqueurs`, () => {
  const source = fs.readFileSync(path.join(WEB, PORTE_DE_DERIVATION), 'utf8');
  const manquants = [];
  // `const` comme `function`, majuscules comme minuscules : un helper exporté à
  // côté d'une IIFE n'a rien d'exotique — `MAX_RYTHME_CHRONO` en est une.
  const declarations = /export (?:const|function) ([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\)|:[^=]*)?=?\s*([\s\S]*?)(?=\nexport |\n\/\*\*|$)/g;
  for (const m of source.matchAll(declarations)) {
    const [, nom, corps] = m;
    // `Q_ALI_01:` est une CLÉ (table indexée par identifiant de questionnaire),
    // pas un usage de la définition servie — `NIVEAU_PREUVE_PAR_SOURCE` en est
    // une. Tout le reste compte : accès de propriété comme passage en argument.
    if (utiliseLaFormeServie(corps) && !SYMBOLES_DERIVES.includes(nom)) manquants.push(nom);
  }
  assert.deepEqual(
    manquants,
    [],
    'export(s) de equilibre/constants.ts dérivés de Q_ALI_01 mais absents des marqueurs — les y ajouter, sinon un spec qui en dépend passera inaperçu.',
  );
});

test('chaque marqueur détecte au moins un spec — un marqueur muet est un marqueur mort', () => {
  for (const m of MARQUEURS) {
    const touche = [...candidats.values()].some((noms) => noms.includes(m.nom));
    assert.ok(
      touche,
      `le marqueur « ${m.nom} » ne matche plus rien — symbole renommé ? Le banc serait aveugle en silence.`,
    );
  }
});

test('tout candidat est trié : dans la liste, ou dans l’allowlist motivée', () => {
  const nonTries = [...candidats.keys()].filter((c) => !liste.includes(c) && !ALLOWLIST.has(c));
  assert.deepEqual(
    nonTries.map((c) => `${c} (${candidats.get(c).join(' ; ')})`),
    [],
    'spec(s) dépendant du drapeau hors de test:court14 — les ajouter à cette liste, ou motiver leur exclusion dans ce banc.',
  );
});

test('toute entrée de la liste existe et reste un candidat', () => {
  for (const spec of liste) {
    assert.ok(tests.includes(spec), `${spec} est listé dans test:court14 mais absent du dépôt — spec renommé ou supprimé ?`);
    assert.ok(
      candidats.has(spec),
      `${spec} est listé mais aucun marqueur ne le détecte plus — dépendance disparue (le retirer) ou marqueur à compléter.`,
    );
  }
});

test('l’allowlist est vivante : chaque entrée existe, reste candidate, et n’est pas déjà listée', () => {
  for (const [chemin] of ALLOWLIST) {
    assert.ok(tests.includes(chemin), `allowlist : ${chemin} n'existe plus.`);
    assert.ok(candidats.has(chemin), `allowlist : ${chemin} n'est plus un candidat — entrée morte, la retirer.`);
    assert.ok(!liste.includes(chemin), `${chemin} est à la fois dans la liste et dans l'allowlist — trancher.`);
  }
});
