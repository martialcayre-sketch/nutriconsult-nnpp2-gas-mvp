import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// LA SENTINELLE QUI AURAIT ATTRAPÉ [[D-142]], ÉLARGIE PAR [[D-145]].
//
// `D-138` a séparé l'ancien champ à deux natures `condition_supplementaire` en
// deux colonnes — `condition_critere_id` et `condition_biologie` — et a fait
// lire les NOUVELLES au moteur. Les routes d'écriture, elles, ont continué
// d'écrire l'ANCIENNE pendant tout l'intervalle. Rien n'a rougi : les types
// s'accordaient, les bancs passaient, et une règle créée avec un critère
// naissait INCONDITIONNELLE aux yeux du moteur.
//
// Ce banc était borné aux ROUTES, et pour une raison précise : l'atelier lisait
// encore le champ pour MONTRER ce qu'une règle d'avant `D-138` portait, et une
// sentinelle qui punit la bonne conduite finit désactivée. `D-145` a supprimé
// la colonne ; plus personne ne la lit, cette raison a disparu, et le périmètre
// devient TOUTE source servie. Une mention qui réapparaîtrait ne pourrait plus
// être qu'un retour au défaut.

const RACINE = join(__dirname, '..', '..');

/**
 * Toute source servie. Le client Prisma généré est exclu — il décrit le schéma,
 * il ne le décide pas — et les bancs le sont aussi : un banc doit pouvoir
 * NOMMER le champ retiré pour éprouver qu'il ne revient pas.
 */
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

describe('condition de règle — le champ supprimé ne revient pas ([[D-145]])', () => {
  const fichiers = sourcesServies(RACINE);

  it('lit un corpus de sources non vide (sinon le banc passerait par vacuité)', () => {
    expect(fichiers.length).toBeGreaterThan(100);
  });

  // AUCUNE source servie ne doit plus NOMMER l'ancien champ. La colonne
  // n'existe plus en base : une mention ne serait pas seulement un retour au
  // défaut de `D-142`, elle serait une lecture d'une colonne absente.
  it('aucune source servie ne mentionne `conditionSupplementaire`', () => {
    const coupables: string[] = [];
    for (const fichier of fichiers) {
      readFileSync(fichier, 'utf8').split('\n').forEach((ligne, index) => {
        if (!ligne.includes('conditionSupplementaire')) return;
        const nue = ligne.trim();
        if (nue.startsWith('//') || nue.startsWith('*')) return;
        coupables.push(`${fichier.replace(RACINE, 'src')}:${index + 1} — ${nue}`);
      });
    }
    expect(coupables, coupables.join('\n')).toEqual([]);
  });

  // Le pendant POSITIF : sans lui, retirer les deux écritures neuves ferait
  // passer ce banc au vert alors que la condition ne serait écrite nulle part —
  // exactement le défaut que `D-142` ferme, retourné.
  it('les deux routes d’écriture posent bien les DEUX colonnes séparées', () => {
    for (const route of [
      join(RACINE, 'app', 'api', 'praticien', 'regles', 'route.ts'),
      join(RACINE, 'app', 'api', 'praticien', 'regles', 'revision', 'route.ts'),
    ]) {
      const source = readFileSync(route, 'utf8');
      expect(source, `${route} n’écrit pas conditionCritereId`)
        .toContain('conditionCritereId: contenu.conditionCritereId');
      expect(source, `${route} n’écrit pas conditionBiologie`)
        .toContain('conditionBiologie: contenu.conditionBiologie');
    }
  });
});
