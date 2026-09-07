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
});
