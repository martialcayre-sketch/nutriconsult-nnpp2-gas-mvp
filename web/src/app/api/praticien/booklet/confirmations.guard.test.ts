import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// GARDE : UN DRAPEAU DE CONFIRMATION QUE LA ROUTE EXIGE DOIT ÊTRE POSABLE
// DEPUIS UN ÉCRAN.
//
// `confirmerRegistre` existait côté serveur depuis la garde de registre
// anxiogène. Son commentaire disait l'intention en toutes lettres — « le
// praticien voit le mot, et décide » — et l'avertissement rendu au praticien
// lui demandait d'« ajouter confirmerRegistre: true ». AUCUN des deux écrans
// qui appellent cette route ne l'envoyait. La décision était donc annoncée,
// documentée, testée côté route, et matériellement impossible à prendre.
//
// Ce que ça a coûté, lu en production le 2026-09-08 : une synthèse validée le
// 16 août, trois tentatives d'envoi à 18 h 09, 18 h 10 et 18 h 11, aucune ligne
// « Envoye » — ni pour cette synthèse ni pour ce patient, jamais. Le bilan
// n'est pas parti, et le journal affichait « Échec d'envoi » à chaque essai.
//
// POURQUOI UNE GARDE STRUCTURELLE ET PAS SEULEMENT UN BANC DE ROUTE. Les bancs
// de `route.test.ts` prouvent que `confirmerRegistre: true` laisse passer —
// ils le prouvaient DÉJÀ pendant les vingt-trois jours où le drapeau était
// inatteignable. Un banc de route ne peut pas voir l'absence d'un appelant.
//
// La garde se lit dans les deux sens : ajouter un drapeau de confirmation à la
// route sans l'exposer rougit ici, et retirer l'exposition d'un écran aussi.

const RACINE = path.join(process.cwd(), 'src');
const ROUTE = path.join(RACINE, 'app', 'api', 'praticien', 'booklet', 'route.ts');

function fichiersSources(depart: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(depart)) {
    const complet = path.join(depart, entree);
    if (statSync(complet).isDirectory()) {
      if (entree === 'node_modules' || entree === '.next') continue;
      trouves.push(...fichiersSources(complet));
    } else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      trouves.push(complet);
    }
  }
  return trouves;
}

// D1 — les drapeaux booléens que la route lit dans le corps du POST.
// `body.<nom> === true` est la forme unique employée ici ; une forme nouvelle
// ferait tomber le drapeau hors du filet, d'où l'assertion de non-vacuité.
function drapeauxExigesParLaRoute(): string[] {
  const source = readFileSync(ROUTE, 'utf-8');
  const trouves = [...source.matchAll(/body\.(\w+) === true/g)].map((m) => m[1]);
  return [...new Set(trouves)];
}

// D2 — les clés que les appelants posent réellement dans le corps envoyé.
// On lit le `JSON.stringify({ … })` du `fetch` vers la route, pas le fichier
// entier : un composant peut nommer `confirmerRegistre` dans une variable
// d'état sans jamais le transmettre — c'est exactement ce qui manquait.
function clesEnvoyeesParLesEcrans(): { fichier: string; cles: string[] }[] {
  const appelants: { fichier: string; cles: string[] }[] = [];
  for (const fichier of fichiersSources(RACINE)) {
    if (fichier === ROUTE) continue;
    const source = readFileSync(fichier, 'utf-8');
    if (!source.includes("'/api/praticien/booklet'")) continue;
    for (const corps of source.matchAll(/JSON\.stringify\(\{([^}]*)\}\)/g)) {
      // La virgule ajoutée ferme la DERNIÈRE clé : sans elle, le drapeau posé
      // en fin d'objet — exactement celui qui manquait — échappait au filet.
      const cles = [...`${corps[1]},`.matchAll(/(\w+)\s*[,:]/g)].map((m) => m[1]);
      if (cles.includes('idSynthese')) {
        appelants.push({ fichier: path.relative(RACINE, fichier), cles });
      }
    }
  }
  return appelants;
}

describe('garde — les confirmations du booklet sont posables depuis un écran', () => {
  it('la route exige bien des drapeaux de confirmation (le détecteur mord)', () => {
    const drapeaux = drapeauxExigesParLaRoute();
    expect(drapeaux).toContain('forceSend');
    expect(drapeaux).toContain('confirmerRegistre');
  });

  it('au moins un écran poste vers la route (le détecteur d’appelants mord)', () => {
    expect(clesEnvoyeesParLesEcrans().length).toBeGreaterThan(0);
  });

  it('chaque drapeau exigé par la route est envoyé par au moins un écran', () => {
    const exposees = new Set(clesEnvoyeesParLesEcrans().flatMap((a) => a.cles));
    const orphelins = drapeauxExigesParLaRoute().filter((d) => !exposees.has(d));
    expect(
      orphelins,
      `Drapeau(x) de confirmation qu'aucun écran ne pose : ${orphelins.join(', ')}. `
        + "La route peut les exiger, le praticien ne peut pas les fournir.",
    ).toEqual([]);
  });

  // La raison sert à l'écran pour nommer LA case à cocher. Sans elle, le seul
  // message rendu était « Document déjà envoyé » — y compris quand la garde de
  // registre avait mordu, ce qui envoyait chercher la mauvaise case.
  it('l’écran qui porte la prévisualisation distingue les deux refus', () => {
    const panneau = readFileSync(path.join(RACINE, 'components', 'SynthesePanel.tsx'), 'utf-8');
    expect(panneau).toContain('REGISTRE_ANXIOGENE');
    expect(panneau).toContain('confirmerRegistre');
  });
});
