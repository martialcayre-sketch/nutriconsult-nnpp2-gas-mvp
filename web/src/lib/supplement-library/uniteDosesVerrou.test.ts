import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// VERROU EXÉCUTABLE — l'unité des doses de règle ([[D-132]], arbitrage du
// 2026-09-07 : « verrou d'abord, migration ensuite »).
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE CE BANC GARDE, ET POURQUOI IL EST ÉCRIT PLUTÔT QUE DIT
// ─────────────────────────────────────────────────────────────────────────────
// Deux sites comparent une dose de RÈGLE à un seuil publié par un `>` numérique
// nu, alors que la règle ne porte AUCUNE unité et que le seuil en porte une :
//
//   - `decisionAvantBiologie.ts` → `depasseSeuilHaut`
//   - `sentinelle.ts`            → `detecterDepassementsSeuils`
//
// Une règle à 500 mg comparée à un seuil de 1000 µg PASSERAIT en étant 500 fois
// au-dessus. C'est le sens qui blesse : le silence, pas le refus.
//
// Le dépôt connaît pourtant la règle et l'applique aux produits — `dose et unité
// vont PAR PAIRE` (`compositions.ts`), avec CHECK en base et contrat SQL. Elle
// n'a jamais été appliquée aux règles.
//
// LE DÉFAUT EST INATTEIGNABLE AUJOURD'HUI, et c'est tout l'objet de ce banc :
// `ingredient_functional_thresholds` n'a AUCUN écrivain, donc `seuilsActifs` est
// toujours vide et la garde `aucun_seuil_publie` mord avant la comparaison
// ([[D-132]] l'établit). Le jour où quelqu'un ouvrira ce chemin — c'est le
// prochain pas naturel du rayon C4 — la comparaison deviendra atteignable dans
// le même geste.
//
// LA LEÇON DU 2026-09-07, LITTÉRALEMENT : six fois ce jour-là, ce qui n'était
// gardé que par de la prose n'a pas tenu (D-127, D-130, D-131, D-132, D-133,
// D-134). Une note dans une décision ne barre rien. Ce banc, si.
//
// ─────────────────────────────────────────────────────────────────────────────
// COMMENT LE LEVER (et c'est le but : il est fait pour mourir)
// ─────────────────────────────────────────────────────────────────────────────
// Poser l'unité sur `ClinicalRule` — migration, vocabulaire clos déjà existant
// (`config.ts` : µg, mg, g, mL, UI, UFC), CHECK symétrique sur le patron de
// `20260724133000_c4_supplement_product_catalogue`. Le banc se relâche alors de
// lui-même : il ne réclame plus rien dès que le champ existe.
//
// CE QU'IL NE PRÉTEND PAS FAIRE. Il ne dit pas quoi faire quand DEUX unités
// diffèrent — ça reste à trancher, et la seule réponse qui n'invente rien est
// « on ne compare pas ». Il garantit seulement que la question sera posée avant
// que la comparaison ne serve.

const RACINE_WEB = join(__dirname, '..', '..', '..');
const SCHEMA = join(RACINE_WEB, 'prisma', 'schema.prisma');
const API = join(RACINE_WEB, 'src', 'app', 'api');

/** Le bloc `model ClinicalRule { … }` du schéma, tel quel. */
function modeleClinicalRule(): string {
  const schema = readFileSync(SCHEMA, 'utf8');
  const debut = schema.indexOf('model ClinicalRule {');
  expect(debut, 'le modèle ClinicalRule a disparu du schéma').toBeGreaterThan(-1);
  const fin = schema.indexOf('\n}', debut);
  return schema.slice(debut, fin);
}

/** `true` dès que la règle porte une unité — quel qu'en soit le nom exact. */
function laRegleporteUneUnite(): boolean {
  return /^\s*unite\w*\s+/m.test(modeleClinicalRule());
}

function fichiersTs(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersTs(chemin));
    else if (chemin.endsWith('.ts') && !chemin.endsWith('.test.ts')) trouves.push(chemin);
  }
  return trouves;
}

/** Les routes qui ÉCRIVENT un seuil fonctionnel. */
function ecrivainsDeSeuils(): string[] {
  const ECRITURE = /prisma\.ingredientFunctionalThreshold\.(create|createMany|upsert|update|updateMany)\b/;
  return fichiersTs(API)
    .filter((chemin) => ECRITURE.test(readFileSync(chemin, 'utf8')))
    .map((chemin) => chemin.slice(RACINE_WEB.length + 1));
}

describe('unité des doses de règle — verrou D-132', () => {
  // LE VERROU. Tant que la règle n'a pas d'unité, aucun écrivain de seuil : la
  // comparaison ne doit pas devenir atteignable avant que la question ne soit
  // tranchée.
  it('aucun écrivain de seuil fonctionnel tant que `ClinicalRule` n’a pas d’unité', () => {
    if (laRegleporteUneUnite()) {
      // Le champ existe : le verrou a fait son travail et se retire. Reste à
      // traiter les unités DIFFÉRENTES — voir l'en-tête, et `D-132`.
      return;
    }
    expect(
      ecrivainsDeSeuils(),
      'Un écrivain de `ingredient_functional_thresholds` vient d’être ouvert alors que '
        + '`ClinicalRule` ne porte toujours aucune unité. `depasseSeuilHaut` '
        + '(decisionAvantBiologie.ts) et `detecterDepassementsSeuils` (sentinelle.ts) '
        + 'compareraient dès lors une dose sans grandeur à un seuil qui en a une : une règle '
        + 'à 500 mg passerait sous un seuil de 1000 µg. Posez l’unité sur la règle AVANT '
        + 'd’ouvrir ce chemin — voir D-132.',
    ).toEqual([]);
  });

  // LE VERROU GARDE CE QU'IL CROIT GARDER. Sans ce cas, une faute de frappe dans
  // le motif de recherche rendrait le premier vert à jamais, en silence — c'est
  // exactement le défaut que `D-134` a corrigé ailleurs (un banc qui fabrique
  // l'entrée qu'il garde ne prouve rien).
  it('sait reconnaître un écrivain quand il en existe un', () => {
    const ECRITURE = /prisma\.ingredientFunctionalThreshold\.(create|createMany|upsert|update|updateMany)\b/;
    expect(ECRITURE.test('  await prisma.ingredientFunctionalThreshold.create({ data });')).toBe(true);
    expect(ECRITURE.test('  await prisma.ingredientFunctionalThreshold.findMany({ where });')).toBe(false);
  });

  // Et il sait lire le schéma : aujourd'hui la règle n'a pas d'unité, le seuil
  // en a une. Le jour où ce cas rougira, c'est que la migration a eu lieu — et
  // le premier cas se sera relâché tout seul.
  it('constate l’asymétrie qui motive le verrou', () => {
    expect(laRegleporteUneUnite()).toBe(false);
    const schema = readFileSync(SCHEMA, 'utf8');
    const seuil = schema.slice(schema.indexOf('model IngredientFunctionalThreshold {'));
    expect(seuil).toMatch(/^\s*unite\s+String\s/m);
  });
});
