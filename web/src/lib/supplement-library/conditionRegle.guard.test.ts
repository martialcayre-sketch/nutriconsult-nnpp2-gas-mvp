import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// LA SENTINELLE QUI AURAIT ATTRAPÉ [[D-142]].
//
// `D-138` a séparé l'ancien champ à deux natures `condition_supplementaire` en
// deux colonnes — `condition_critere_id` et `condition_biologie` — et a fait
// lire les NOUVELLES au moteur. Les routes d'écriture, elles, ont continué
// d'écrire l'ANCIENNE pendant tout l'intervalle. Rien n'a rougi : les types
// s'accordaient, les bancs passaient, et une règle créée avec un critère
// naissait INCONDITIONNELLE aux yeux du moteur.
//
// Ce banc ferme la porte par le seul moyen qui tienne à cette échelle : lire
// le code servi et refuser toute ÉCRITURE Prisma du champ retiré. Il ne juge
// pas les LECTURES — l'atelier lit encore `conditionSupplementaire` pour
// montrer ce qu'une règle d'avant `D-138` porte, et ce sera vrai jusqu'au
// `DROP`, qui est un geste distinct et confirmé.

const RACINE = join(__dirname, '..', '..');
const ROUTES = join(RACINE, 'app', 'api');

/**
 * Toutes les routes servies. Le périmètre est VOLONTAIREMENT les routes, et
 * pas `src` entier : ce sont elles, et elles seules, qui écrivent en base. Un
 * balayage plus large confondrait l'écriture avec la sérialisation — `serialiserRegle`
 * recopie légitimement l'ancien champ vers l'API pour que l'atelier puisse le
 * MONTRER, et une sentinelle qui refuse cela punit la bonne conduite.
 */
function routesServies(dossier: string, trouves: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      routesServies(chemin, trouves);
      continue;
    }
    if (!/^route\.tsx?$/.test(entree)) continue;
    trouves.push(chemin);
  }
  return trouves;
}

describe('condition de règle — le champ retiré n’est plus écrit ([[D-142]])', () => {
  const fichiers = routesServies(ROUTES);

  it('lit un corpus de routes non vide (sinon le banc passerait par vacuité)', () => {
    expect(fichiers.length).toBeGreaterThan(30);
  });

  // AUCUNE route ne doit plus NOMMER l'ancien champ. C'est une règle plus
  // stricte que « ne pas l'écrire », et c'est délibéré : une route n'a aucune
  // raison légitime de le lire non plus — le moteur ne le lit plus, et l'atelier
  // le reçoit par `serialiserRegle`. La mention dans une route ne peut donc être
  // qu'un retour au défaut que `D-142` ferme.
  it('aucune route ne mentionne `conditionSupplementaire`', () => {
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
