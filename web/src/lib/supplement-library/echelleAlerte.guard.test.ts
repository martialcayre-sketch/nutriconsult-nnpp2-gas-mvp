import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// AUCUNE VALEUR D'ÉCHELLE D'ALERTE N'EST ÉCRITE EN DUR ([[D-143]]).
//
// `supplement_safety_alerts.niveau_alerte` est un `TEXT` sans `CHECK` : aucune
// gradation n'est gouvernée, et [[D-132]] a refusé d'en inventer une faute de
// source. Le code servi en écrivait pourtant une — `'orange'`, posé
// inconditionnellement sur tout candidat de cumul de substance et en repli sur
// un dépassement sans alerte jointe. Une échelle refusée en prose et écrite en
// code n'est pas refusée.
//
// Ce banc garde l'absence. Il ne juge PAS les bancs, qui doivent pouvoir
// nommer des niveaux pour éprouver qu'ils traversent — un niveau de FIXTURE
// décrit une donnée d'entrée, il n'affirme rien.

const RACINE = join(__dirname, '..', '..');

/**
 * Les valeurs qu'on refuse de voir apparaître comme LITTÉRAL dans du code
 * servi. Elles ne sont pas une échelle : elles sont ce que le dépôt a déjà vu
 * passer, dans deux registres incompatibles — un code couleur et une formule
 * verbale. C'est précisément parce qu'aucune n'est fondée qu'aucune ne doit
 * s'écrire.
 */
const VALEURS_REFUSEES = ['orange', 'rouge', 'vert', 'jaune', 'vigilance renforcée'];

function sourcesServies(dossier: string, trouves: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === 'generated' || entree === 'node_modules') continue;
      sourcesServies(chemin, trouves);
      continue;
    }
    if (!/\.tsx?$/.test(entree)) continue;
    if (/\.test\.tsx?$/.test(entree)) continue;
    trouves.push(chemin);
  }
  return trouves;
}

describe('échelle d’alerte — rien n’est inventé ([[D-143]])', () => {
  const fichiers = sourcesServies(RACINE);

  it('lit un corpus de sources non vide (sinon le banc passerait par vacuité)', () => {
    expect(fichiers.length).toBeGreaterThan(100);
  });

  it('aucune source servie n’écrit une valeur de niveau d’alerte', () => {
    // La forme cherchée : une valeur d'échelle AFFECTÉE à un champ de niveau.
    // Le mot « orange » ailleurs — un ingrédient, une couleur de style — n'est
    // pas visé, et le viser ferait de ce banc une nuisance qu'on finirait par
    // désactiver.
    const motif = new RegExp(
      `niveauAlerte\\s*[:=]\\s*['"\`](${VALEURS_REFUSEES.join('|')})['"\`]`,
      'i',
    );
    const coupables: string[] = [];
    for (const fichier of fichiers) {
      readFileSync(fichier, 'utf8').split('\n').forEach((ligne, index) => {
        const nue = ligne.trim();
        if (nue.startsWith('//') || nue.startsWith('*')) return;
        if (!motif.test(ligne)) return;
        coupables.push(`${fichier.replace(RACINE, 'src')}:${index + 1} — ${nue}`);
      });
    }
    expect(coupables, coupables.join('\n')).toEqual([]);
  });

  // Le pendant POSITIF : sans lui, retyper le champ en `string` non nullable
  // ferait repasser ce banc au vert tout en forçant un repli fabriqué.
  it('le niveau d’un candidat de sentinelle peut être ABSENT', () => {
    const types = readFileSync(join(RACINE, 'lib', 'supplement-library', 'types.ts'), 'utf8');
    expect(types).toContain('niveauAlerte: string | null;');
  });

  // LE NIVEAU DOCUMENTE, IL NE DÉCIDE PAS ([[D-152]]). L'arbitrage a retenu la
  // première des trois issues laissées ouvertes par [[D-143]] : le niveau
  // s'affiche et ne commande rien. Ce qui alerte reste le FAIT — un cumul
  // constaté, un seuil dépassé —, jamais l'étiquette posée dessus.
  //
  // Ce terme vise la COMPARAISON DE VALEUR, et rien d'autre :
  //
  // - le test de PRÉSENCE reste permis (`=== null`, `!== undefined`,
  //   truthiness) — savoir si le niveau existe est nécessaire pour l'AFFICHER,
  //   et l'affichage est précisément ce que l'arbitrage autorise ;
  // - la borne de longueur reste permise (`niveauAlerte.length > …`) — elle
  //   valide une saisie libre, elle ne lit aucune gradation ;
  // - la vérification de TYPE reste permise (`typeof x.niveauAlerte ===
  //   'string'`) — elle valide la forme d'une entrée, pas son contenu. Ce banc
  //   l'a d'abord refusée à tort, sur la route d'écriture des alertes : le
  //   faux positif est retiré ICI, à la source, plutôt que par une exception
  //   nommant ce fichier — une liste d'exceptions vieillit mal ;
  // - l'ORDRE est refusé sans exception : `<` ou `>` sur ce champ n'a de sens
  //   que si des paliers sont ordonnés, et aucun ne l'est.
  //
  // Une sentinelle qui interdirait de MONTRER le niveau punirait la bonne
  // conduite et finirait désactivée ([[D-147]] §4).
  it('aucune source servie ne DÉCIDE sur le niveau d’alerte', () => {
    // L'espace vit DANS la négation, et ce n'est pas un détail de style :
    // écrite `…\s*(?!null\b)`, l'expression laisse le moteur rétrograder `\s*`
    // à zéro, comparer « ` null` » à « `null` », et accuser le test de
    // PRÉSENCE qu'elle est censée autoriser. Constaté par mutation.
    const comparaisonValeur =
      /niveauAlerte\s*(?:===|!==|==(?!=)|!=(?!=))(?!\s*(?:null|undefined)\b)/;
    const comparaisonOrdre = /niveauAlerte\s*(?:<=?|>=?)(?!=)/;
    const aiguillage = /switch\s*\(\s*[A-Za-z0-9_.?[\]]*niveauAlerte\b/;
    // `typeof <expr>.niveauAlerte === '<type>'` — garde de forme, retirée de la
    // ligne avant analyse pour qu'elle ne se lise pas comme une décision.
    const gardeDeType = /typeof\s+[A-Za-z0-9_.?[\]]*niveauAlerte\s*(?:===|!==)\s*['"`][a-z]+['"`]/g;

    const coupables: string[] = [];
    for (const fichier of fichiers) {
      readFileSync(fichier, 'utf8').split('\n').forEach((ligne, index) => {
        const nue = ligne.trim();
        if (nue.startsWith('//') || nue.startsWith('*')) return;
        const analysee = ligne.replace(gardeDeType, '');
        if (!comparaisonValeur.test(analysee)
          && !comparaisonOrdre.test(analysee)
          && !aiguillage.test(analysee)) return;
        coupables.push(`${fichier.replace(RACINE, 'src')}:${index + 1} — ${nue}`);
      });
    }
    expect(coupables, coupables.join('\n')).toEqual([]);
  });
});
