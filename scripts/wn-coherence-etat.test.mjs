// Banc des trois gardes de cohérence de l'état machine (LOT-00 de la campagne
// `2026-08-08-dettes-ouvertes-5-0`, dette 6).
//
// Il fait deux choses, et la seconde est celle qui compte :
//
// 1. Vérifier sur fixtures que chaque garde détecte SA dérive — et, sa
//    contrepartie, qu'un état sain n'en produit aucune. Un garde qui rougit
//    toujours ne garde rien, un garde qui ne rougit jamais non plus.
// 2. **Confronter le dépôt RÉEL.** C'est ici que le banc échoue si
//    `ACTIVE_CAMPAIGN.md` a été régénéré avant sa source, si un
//    `last_checked_at` a été tamponné en avance, ou si le lot courant de
//    `.wn/state.json` a divergé de `CAMPAGNE.md`. Ces trois classes sont
//    déterministes — deux fichiers du dépôt, aucune horloge —, donc jouables en
//    CI sans devenir rouges avec le temps.
//
// Ce que ce banc n'assère PAS sur le dépôt réel : le verdict « périmé »
// (`last_checked_at` de plus de sept jours). Celui-là dépend de la date du jour
// et rougirait un lundi matin sans qu'aucun commit n'ait rien cassé. Il reste
// signalé par le rapport, il ne bloque pas le CI.
//
// Question tranchée à l'ouverture du lot : le garde **échoue**, il ne répare
// pas. Une régénération automatique supprimerait la trace de la dérive au
// moment même où elle survient — or c'est le taux de récidive qui motive ce
// lot, et on ne compte pas ce qu'on efface.
//
// Le geste de réparation N'EST PAS le même pour les trois, et un remède unique
// serait pire que pas de remède :
//
// - garde 1 (vue) → `node scripts/wn-cycle.mjs --appliquer`, qui régénère la
//   vue depuis sa source ;
// - garde 2 (dates) → **rejouer la validation**, puis réinscrire son résultat.
//   Surtout PAS `--appliquer` : il pousse `updated_at` à maintenant et éteint
//   donc le garde sans qu'aucun palier ait été joué — la réparation qui efface
//   la trace, précisément ce que ce lot refuse ;
// - garde 3 (lot courant) → aligner les deux à la main : `node
//   scripts/wn-campaign.mjs activate <id> --lot LOT-xx`, ou corriger
//   `lot_courant` dans `CAMPAGNE.md`. `--appliquer` ne touche jamais
//   `active_lot`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { rendreVueCampagnesActives } from './lib/vue-campagnes-actives.mjs';
import {
  collecterCampagnes,
  comparerEtat,
  construireRapport,
  lireVueSurDisque,
  ordinalDeLot,
} from './wn-etat-reel.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAINTENANT = new Date('2026-08-08T12:00:00Z');

/** État minimal cohérent : aucun garde ne doit rien trouver dessus. */
function etatSain() {
  return {
    status: 'active',
    active_campaign: 'campagne-x',
    active_lot: 'LOT-03',
    validation: { last_checked_at: '2026-08-08T09:00:00Z' },
    updated_at: '2026-08-08T10:00:00Z',
  };
}

function faitsSains(etat) {
  const campagnes = [{ name: 'campagne-x', title: 'Campagne X', lotCourant: 'LOT-03' }];
  const vue = rendreVueCampagnesActives(etat, campagnes);
  return {
    worktreesVivants: [],
    dirty: false,
    maintenant: MAINTENANT,
    vueSurDisque: vue,
    vueAttendue: vue,
    lotCourantDeclare: 'LOT-03',
  };
}

function champs(ecarts) {
  return ecarts.map((ecart) => ecart.champ).sort();
}

// ── Contrepartie : l'état sain ne produit rien ──────────────────────────────

test('état cohérent : aucun écart — sans quoi les trois gardes ne prouveraient rien', () => {
  assert.deepEqual(comparerEtat(etatSain(), faitsSains(etatSain())), []);
});

// ── Garde 1 — la vue dérivée contre sa source ───────────────────────────────

test('garde 1 : une vue régénérée AVANT sa source est détectée (défaut de la PR de clôture 5.0)', () => {
  const etat = etatSain();
  const campagnes = [{ name: 'campagne-x', title: 'Campagne X', lotCourant: 'LOT-03' }];

  // La séquence exacte du 2026-08-08 : la vue est rendue depuis l'état
  // PRÉCÉDENT (lot 02), puis l'état passe au lot 03 sans que la vue soit
  // refaite. Les deux fichiers sont individuellement bien formés.
  const vuePerimee = rendreVueCampagnesActives({ ...etat, active_lot: 'LOT-02' }, campagnes);
  const ecarts = comparerEtat(etat, {
    ...faitsSains(etat),
    vueSurDisque: vuePerimee,
    vueAttendue: rendreVueCampagnesActives(etat, campagnes),
  });

  assert.deepEqual(champs(ecarts), ['ACTIVE_CAMPAIGN.md']);
  assert.match(ecarts[0].valeurStockee, /LOT-02/);
  assert.match(ecarts[0].valeurReelle, /LOT-03/);
});

test("garde 1 : une vue éditée à la main — même d'un seul mot — est détectée", () => {
  const etat = etatSain();
  const faits = faitsSains(etat);
  const ecarts = comparerEtat(etat, {
    ...faits,
    vueSurDisque: faits.vueAttendue.replace('Campagne X', 'Campagne X (en pause)'),
  });
  assert.deepEqual(champs(ecarts), ['ACTIVE_CAMPAIGN.md']);
});

test('garde 1 : sans état daté, aucune comparaison — jamais un écart inventé', () => {
  // `vueAttendue: null` est ce que `construireRapport` passe quand
  // `updated_at` manque : le rendu devrait alors inventer une date, et la
  // comparaison rougirait sur du bruit.
  const etat = { ...etatSain(), updated_at: undefined };
  const ecarts = comparerEtat(etat, { ...faitsSains(etatSain()), vueAttendue: null });
  assert.deepEqual(champs(ecarts), []);
});

// ── Garde 2 — une validation ne précède pas l'écriture qui la porte ─────────

test('garde 2 : last_checked_at postérieur à updated_at est incohérent', () => {
  const etat = { ...etatSain(), validation: { last_checked_at: '2026-08-08T11:00:00Z' } };
  const ecarts = comparerEtat(etat, faitsSains(etat));
  assert.deepEqual(champs(ecarts), ['validation.last_checked_at vs updated_at']);
  assert.equal(ecarts[0].verdict, 'incohérent');
});

test("garde 2 : une seconde d'avance suffit — la borne n'admet aucune tolérance", () => {
  // Sans ce cas, une tolérance de quelques minutes glissée dans la comparaison
  // reste verte (mutation trouvée par la revue adversariale du 2026-08-08) —
  // et un tampon posé à la main dépasse justement de quelques minutes.
  const etat = { ...etatSain(), validation: { last_checked_at: '2026-08-08T10:00:01Z' } };
  const ecarts = comparerEtat(etat, faitsSains(etat));
  assert.deepEqual(champs(ecarts), ['validation.last_checked_at vs updated_at']);
});

test('garde 2 : une validation exactement contemporaine de updated_at passe', () => {
  // La borne compte : `wn-cycle --appliquer` peut écrire les deux dans la même
  // seconde. Un garde en `>=` rougirait à chaque exécution normale.
  const etat = { ...etatSain(), validation: { last_checked_at: '2026-08-08T10:00:00Z' } };
  assert.deepEqual(comparerEtat(etat, faitsSains(etat)), []);
});

test('garde 2 : la date périmée et la date incohérente sont deux écarts distincts, jamais fondus', () => {
  // Vieille de 24 jours face à `maintenant` (donc périmée) ET postérieure de
  // deux semaines à l'écriture de l'état (donc incohérente).
  const etat = {
    ...etatSain(),
    validation: { last_checked_at: '2026-07-15T00:00:00Z' },
    updated_at: '2026-07-01T00:00:00Z',
  };
  const ecarts = comparerEtat(etat, faitsSains(etat));
  assert.deepEqual(champs(ecarts), [
    'validation.last_checked_at',
    'validation.last_checked_at vs updated_at',
  ]);
});

// ── Garde 3 — le lot courant, qui n'était comparé par rien ──────────────────

test('garde 3 : active_lot divergent de lot_courant est détecté (LOT-06 contre LOT-07)', () => {
  const etat = { ...etatSain(), active_lot: 'LOT-06' };
  // La vue est rendue depuis le MÊME état : elle est cohérente, et c'est le
  // point — le garde 3 attrape ce que les deux autres laissent passer. C'est
  // exactement la situation du 2026-08-08 vue depuis `CAMPAGNE.md`.
  const ecarts = comparerEtat(etat, { ...faitsSains(etat), lotCourantDeclare: 'LOT-07-cloture.md' });
  assert.deepEqual(champs(ecarts), ['active_lot']);
  assert.equal(ecarts.find((e) => e.champ === 'active_lot').valeurStockee, 'LOT-06');
});

test('garde 3 : le suffixe libre du fichier de lot ne compte pas — LOT-03 vaut LOT-03-implementation.md', () => {
  const etat = etatSain();
  const ecarts = comparerEtat(etat, { ...faitsSains(etat), lotCourantDeclare: 'LOT-03-implementation.md' });
  assert.deepEqual(champs(ecarts), []);
});

test("garde 3 : un seul côté nomme un lot — « aucun » face à LOT-03 est un écart", () => {
  // Le cas le plus probable, et celui qu'une clause de présence
  // (`lotStocke && lotDeclare`) aveuglerait : sept campagnes sur trente-cinq
  // portent aujourd'hui `lot_courant: "aucun"`.
  const etat = etatSain();
  const ecarts = comparerEtat(etat, { ...faitsSains(etat), lotCourantDeclare: 'aucun' });
  assert.deepEqual(champs(ecarts), ['active_lot']);
  assert.equal(ecarts[0].valeurReelle, 'aucun');
});

test("garde 3 : l'inverse aussi — état sans lot sous une CAMPAGNE.md qui en déclare un", () => {
  const etat = { ...etatSain(), active_lot: null };
  const ecarts = comparerEtat(etat, { ...faitsSains(etat), lotCourantDeclare: 'LOT-02-socle.md' });
  assert.deepEqual(champs(ecarts), ['active_lot']);
});

test('garde 3 : campagne active absente du disque — aucun lot déclaré, écart signalé', () => {
  const etat = { ...etatSain(), active_campaign: 'campagne-inexistante' };
  const ecarts = comparerEtat(etat, { ...faitsSains(etat), lotCourantDeclare: null });
  assert.deepEqual(champs(ecarts), ['active_lot']);
});

test('garde 3 : deux côtés sans lot nommé — aucun écart inventé', () => {
  const etat = { ...etatSain(), active_lot: 'aucun' };
  const ecarts = comparerEtat(etat, { ...faitsSains(etat), lotCourantDeclare: 'aucun' });
  assert.deepEqual(champs(ecarts), []);
});

test('garde 3 : hors campagne active, rien à comparer', () => {
  const etat = { ...etatSain(), active_campaign: null, active_lot: null, status: 'idle' };
  const ecarts = comparerEtat(etat, { ...faitsSains(etat), vueAttendue: null, lotCourantDeclare: 'LOT-01' });
  assert.deepEqual(champs(ecarts), []);
});

test('garde 4 : une tête de reprise qui nomme une AUTRE campagne est détectée (le défaut A11)', () => {
  const etat = {
    ...etatSain(),
    next_action: ['CAMPAGNE PRIMAIRE ACTIVE : campagne-perimee, lot courant LOT-01.'],
  };
  const ecarts = comparerEtat(etat, faitsSains(etat));
  assert.deepEqual(champs(ecarts), ['next_action[0]']);
});

test("garde 4 : les traces d'anciennes têtes ne sont JAMAIS relues", () => {
  // La moitié qui compte. `next_action` est une pile dont les entrées 1+ citent
  // des campagnes closes — c'est sa raison d'être. Un garde qui les lirait
  // rougirait sur toute campagne correctement archivée, et serait désarmé dans
  // la semaine.
  const etat = {
    ...etatSain(),
    next_action: [
      'CAMPAGNE PRIMAIRE ACTIVE : campagne-x, lot courant LOT-03.',
      '[trace 2026-08-23 — ancienne tête remplacée] CAMPAGNE PRIMAIRE ACTIVE : campagne-perimee, LOT-01.',
      '[trace 2026-08-22 — ancienne tête remplacée] CAMPAGNE PRIMAIRE ACTIVE : campagne-plus-vieille, LOT-09.',
    ],
  };
  const ecarts = comparerEtat(etat, faitsSains(etat));
  assert.deepEqual(champs(ecarts), []);
});

test('garde 4 : une tête qui nomme la campagne mais tait son lot courant est détectée', () => {
  const etat = {
    ...etatSain(),
    next_action: ['CAMPAGNE PRIMAIRE ACTIVE : campagne-x — le lot n\'est pas nommé.'],
  };
  const ecarts = comparerEtat(etat, faitsSains(etat));
  assert.deepEqual(champs(ecarts), ['next_action[0]']);
});

test('garde 4 : sans next_action, aucune comparaison — jamais un écart inventé', () => {
  const etat = { ...etatSain(), next_action: undefined };
  const ecarts = comparerEtat(etat, faitsSains(etat));
  assert.deepEqual(champs(ecarts), []);
});

test('ordinalDeLot : « aucun », vide et non-chaîne rendent null, jamais une égalité par accident', () => {
  assert.equal(ordinalDeLot('LOT-07-cloture.md'), 'LOT-07');
  assert.equal(ordinalDeLot('lot-07'), 'LOT-07');
  // Une coquille à un chiffre désigne le même lot : un écart ici ressemblerait
  // à un bug du garde plutôt qu'à la dérive qu'il cherche.
  assert.equal(ordinalDeLot('LOT-7'), 'LOT-07');
  assert.equal(ordinalDeLot('aucun'), null);
  assert.equal(ordinalDeLot(''), null);
  assert.equal(ordinalDeLot(null), null);
  assert.equal(ordinalDeLot(undefined), null);
});

// ── Le câblage réel : construireRapport, pas comparerEtat ───────────────────
//
// Les tests ci-dessus appellent `comparerEtat` en lui passant des faits
// fabriqués : ils prouvent la LOGIQUE des gardes, pas leur BRANCHEMENT. Deux
// mutations de `construireRapport` (`vueAttendue` toujours nulle,
// `lotCourantDeclare` toujours nul) les laissaient tous verts pendant que le
// CLI continuait d'annoncer « 3 confrontées, 0 écart » en n'en confrontant plus
// qu'une — la dette 6 reproduite d'un cran. Trouvé par la revue adversariale du
// 2026-08-08 ; ces deux tests-là ferment le trou.

/** Dépôt-fixture : `.wn/state.json`, des campagnes, et une vue au contenu choisi. */
function depotFixture({ etat, campagnes, vue }) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-coherence-'));
  fs.mkdirSync(path.join(racine, '.wn'), { recursive: true });
  fs.writeFileSync(path.join(racine, '.wn', 'state.json'), `${JSON.stringify(etat, null, 2)}\n`);
  const base = path.join(racine, 'docs', 'claude', 'campagnes');
  fs.mkdirSync(base, { recursive: true });
  for (const campagne of campagnes) {
    fs.mkdirSync(path.join(base, campagne.dossier), { recursive: true });
    fs.writeFileSync(path.join(base, campagne.dossier, 'CAMPAGNE.md'), campagne.contenu);
  }
  fs.writeFileSync(path.join(base, 'ACTIVE_CAMPAIGN.md'), vue);
  return racine;
}

function campagneFixture({ dossier, id = dossier, titre = 'Campagne de banc', lotCourant = 'LOT-00' }) {
  return {
    dossier,
    contenu: `---\nid: "${id}"\ntitre: "${titre}"\nstatut: "active"\nlot_courant: "${lotCourant}"\n---\n\n# ${titre}\n`,
  };
}

/**
 * État daté par rapport à MAINTENANT, pas en absolu.
 *
 * `construireRapport` lit l'horloge réelle (c'est son rôle : le verdict
 * « périmé » compare la validation à la date système). Une fixture datée en dur
 * du 2026-08-08 vieillit donc : sept jours plus tard, un troisième écart
 * apparaît et toute égalité stricte tombe — un CI rouge pour le dépôt entier,
 * sans qu'aucun commit n'ait rien cassé. Défaut introduit puis trouvé par la
 * revue adversariale du 2026-08-08 : c'est exactement la classe que ce banc
 * prétend garder, arrivée dans le banc lui-même.
 *
 * Les dates sont donc relatives, et les tests peuvent asserter l'égalité
 * stricte — le filtre sur « périmé » n'est plus nécessaire.
 */
function etatDateRelativement({ heuresAvantMaintenant = 2, ...reste }) {
  const maintenant = Date.now();
  return {
    ...reste,
    validation: { last_checked_at: new Date(maintenant - heuresAvantMaintenant * 3600_000).toISOString() },
    updated_at: new Date(maintenant - (heuresAvantMaintenant - 1) * 3600_000).toISOString(),
  };
}

test('CÂBLAGE — construireRapport confronte réellement la vue ET le lot courant', () => {
  const etat = etatDateRelativement({
    status: 'active',
    active_campaign: 'campagne-de-banc',
    active_lot: 'LOT-05',
  });
  const campagnes = [campagneFixture({ dossier: 'campagne-de-banc', lotCourant: 'LOT-00' })];
  const racine = depotFixture({
    etat,
    campagnes,
    // Vue rendue depuis un état antérieur : désynchronisée de sa source.
    vue: rendreVueCampagnesActives({ ...etat, active_lot: 'LOT-04' }, [
      { name: 'campagne-de-banc', title: 'Campagne de banc' },
    ]),
  });

  const rapport = construireRapport(racine);
  const trouves = rapport.ecarts.map((ecart) => ecart.champ).sort();
  assert.deepEqual(trouves, ['ACTIVE_CAMPAIGN.md', 'active_lot']);
});

test('CÂBLAGE — un dépôt cohérent ne produit aucun écart, sinon le test ci-dessus ne prouverait rien', () => {
  const etat = etatDateRelativement({
    status: 'active',
    active_campaign: 'campagne-de-banc',
    active_lot: 'LOT-00',
  });
  const racine = depotFixture({
    etat,
    campagnes: [campagneFixture({ dossier: 'campagne-de-banc', lotCourant: 'LOT-00' })],
    vue: rendreVueCampagnesActives(etat, [{ name: 'campagne-de-banc', title: 'Campagne de banc' }]),
  });

  // Égalité stricte, sans filtre : la fixture est datée relativement, donc
  // aucun verdict ne peut s'ajouter avec le temps.
  assert.deepEqual(construireRapport(racine).ecarts, []);
});

// ── Parité des deux lecteurs de campagnes ───────────────────────────────────

test("PARITÉ — le garde lit les campagnes comme l'écrivain : `id:` fait foi, pas le nom du dossier", () => {
  // Le rendu de la vue nomme la campagne par son `id:` de front matter. Un
  // garde qui la nommerait par son dossier rougirait sur un fichier
  // correctement écrit — et conseillerait une resynchronisation sans effet.
  const racine = depotFixture({
    etat: {},
    campagnes: [campagneFixture({ dossier: 'dossier-different', id: 'identifiant-canonique' })],
    vue: '',
  });
  const campagnes = collecterCampagnes(racine);
  assert.equal(campagnes.length, 1);
  assert.equal(campagnes[0].name, 'identifiant-canonique');
  assert.equal(campagnes[0].lotCourant, 'LOT-00');
});

test('PARITÉ — le front matter est borné : un `titre:` du corps ne devient pas une métadonnée', () => {
  // L'une des quatre divergences qui motivaient l'extraction du lecteur : un
  // regex appliqué au fichier entier lisait n'importe quelle ligne `titre:`,
  // fût-elle dans un exemple au milieu du document.
  const racine = depotFixture({
    etat: {},
    campagnes: [
      {
        dossier: 'campagne-piegeuse',
        contenu:
          '---\nid: "campagne-piegeuse"\ntitre: "Le vrai titre"\nlot_courant: "LOT-02"\n---\n\n# Le vrai titre\n\nExemple de front matter cité dans le corps :\n\n    titre: "Un titre qui n\'en est pas un"\n    lot_courant: "LOT-99"\n',
      },
    ],
    vue: '',
  });
  const campagne = collecterCampagnes(racine)[0];
  assert.equal(campagne.title, 'Le vrai titre');
  assert.equal(campagne.lotCourant, 'LOT-02');
});

test('PARITÉ — sans `titre:`, le titre se replie sur le premier `# H1`, comme chez l\'écrivain', () => {
  const racine = depotFixture({
    etat: {},
    campagnes: [
      {
        dossier: 'campagne-sans-titre',
        contenu: '---\nid: "campagne-sans-titre"\nstatut: "active"\n---\n\n# Titre porté par le H1\n',
      },
    ],
    vue: '',
  });
  assert.equal(collecterCampagnes(racine)[0].title, 'Titre porté par le H1');
});

// ── Le dépôt réel ───────────────────────────────────────────────────────────

test('DÉPÔT RÉEL — ACTIVE_CAMPAIGN.md est identique à ce que .wn/state.json produit', () => {
  const etat = JSON.parse(fs.readFileSync(path.join(RACINE, '.wn', 'state.json'), 'utf8'));
  const vueSurDisque = lireVueSurDisque(RACINE);
  assert.ok(vueSurDisque, 'docs/claude/campagnes/ACTIVE_CAMPAIGN.md doit exister');
  assert.ok(etat.updated_at, '.wn/state.json doit porter updated_at — sans lui, la vue est incomparable');

  const attendu = rendreVueCampagnesActives(etat, collecterCampagnes(RACINE));
  assert.equal(
    vueSurDisque,
    attendu,
    'La vue a dérivé de sa source. Réparer : `node scripts/wn-cycle.mjs --appliquer` (jamais à la main).',
  );
});

test('DÉPÔT RÉEL — la validation ne se prétend pas plus récente que la dernière écriture d\'état', () => {
  const etat = JSON.parse(fs.readFileSync(path.join(RACINE, '.wn', 'state.json'), 'utf8'));
  const ecarts = comparerEtat(etat, {
    worktreesVivants: [],
    dirty: null,
    // Date de l'état lui-même, pas l'horloge : ce test ne doit dépendre que de
    // deux champs du fichier. `maintenant` ne sert ici qu'au verdict « périmé »,
    // que ce banc n'assère délibérément pas.
    maintenant: new Date(etat.updated_at),
  });
  assert.deepEqual(
    ecarts.filter((ecart) => ecart.champ === 'validation.last_checked_at vs updated_at'),
    [],
  );
});

test('DÉPÔT RÉEL — le lot actif de .wn/state.json est celui que CAMPAGNE.md déclare', () => {
  const etat = JSON.parse(fs.readFileSync(path.join(RACINE, '.wn', 'state.json'), 'utf8'));
  const campagnes = collecterCampagnes(RACINE);
  const ecarts = comparerEtat(etat, {
    worktreesVivants: [],
    dirty: null,
    maintenant: new Date(etat.updated_at),
    lotCourantDeclare: campagnes.find((campagne) => campagne.name === etat.active_campaign)?.lotCourant ?? null,
  });
  assert.deepEqual(ecarts.filter((ecart) => ecart.champ === 'active_lot'), []);
});

test("DÉPÔT RÉEL — la tête de next_action nomme la campagne active, pas une campagne close", () => {
  const etat = JSON.parse(fs.readFileSync(path.join(RACINE, '.wn', 'state.json'), 'utf8'));
  const ecarts = comparerEtat(etat, {
    worktreesVivants: [],
    dirty: null,
    maintenant: new Date(etat.updated_at),
  });
  assert.deepEqual(
    ecarts.filter((ecart) => ecart.champ === 'next_action[0]'),
    [],
    "La tête de `next_action` annonce une autre campagne que `active_campaign`. "
      + 'Réparer : pousser une tête neuve en position 0 et préfixer la précédente '
      + "de `[trace <date> — ancienne tête remplacée]`. Ne PAS réécrire les entrées "
      + "suivantes : elles sont l'archive, et c'est à ça qu'elles servent.",
  );
});
