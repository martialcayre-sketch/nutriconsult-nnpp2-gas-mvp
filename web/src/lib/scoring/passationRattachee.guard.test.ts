import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// GARDE : UNE PASSATION ÉCRITE SANS ASSIGNATION EST UNE RÉPONSE QUE PERSONNE
// NE VOIT ARRIVER.
//
// `questionnaire_reponses.id_assignation` est NULLABLE au schéma, et
// 15 lignes de production le sont réellement. La lecture du 2026-09-08 dit
// lesquelles : 3 patients, du 10 au 20 juin 2026 — une cohorte close, dont le
// dernier élément précède de 17 jours la première passation rattachée
// (2026-07-07). Aucun chemin vivant n'en produit : les trois écrivains
// (`patient/submit`, les deux clôtures d'agenda) tirent tous
// `idAssignation` d'une assignation déjà résolue.
//
// CE QUI SE CASSERAIT SI UN QUATRIÈME OUBLIAIT LE CHAMP. Le rattachement est
// la seule jointure qui dise « cette assignation a sa réponse » :
// `idsAssignationsAvecPassation` (liste patients) et la carte
// `assignation_en_retard` du Fil s'y appuient. Une passation détachée laisse
// donc le dossier réclamer un questionnaire que le patient a DÉJÀ rempli —
// et le patient, lui, ne peut pas savoir que sa réponse n'a pas été rattachée.
//
// La garde est structurelle parce que le défaut serait une OMISSION : aucun
// banc d'écrivain ne rougit d'un champ facultatif qu'on ne passe pas. C'est
// exactement la leçon de [[D-146]] — un champ dont l'absence est tolérée rend
// l'oubli indiscernable de l'intention.

const RACINE = path.join(process.cwd(), 'src');

function fichiersSources(depart: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(depart)) {
    const complet = path.join(depart, entree);
    if (statSync(complet).isDirectory()) {
      if (entree === 'node_modules' || entree === '.next' || entree === 'generated') continue;
      trouves.push(...fichiersSources(complet));
    } else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      trouves.push(complet);
    }
  }
  return trouves;
}

// Un écrivain = un `questionnaireReponse.create(` suivi de son bloc `data`.
// On lit le bloc jusqu'à sa fermeture par accolade en colonne connue plutôt
// que par appariement complet : les trois blocs du dépôt sont plats.
function ecrivainsDePassation(): { fichier: string; bloc: string }[] {
  const ecrivains: { fichier: string; bloc: string }[] = [];
  for (const fichier of fichiersSources(RACINE)) {
    const source = readFileSync(fichier, 'utf-8');
    for (const appel of source.matchAll(/questionnaireReponse\.create\(\{([\s\S]*?)\n\s*\}\);/g)) {
      ecrivains.push({ fichier: path.relative(RACINE, fichier), bloc: appel[1] });
    }
  }
  return ecrivains;
}

describe('garde — toute passation écrite est rattachée à son assignation', () => {
  it('les trois écrivains connus sont bien vus (le détecteur mord)', () => {
    const fichiers = ecrivainsDePassation().map((e) => e.fichier).sort();
    expect(fichiers).toEqual([
      path.join('app', 'api', 'patient', 'submit', 'route.ts'),
      path.join('lib', 'agenda-alimentaire', 'cloture.ts'),
      path.join('lib', 'agenda-sommeil', 'cloture.ts'),
    ]);
  });

  it('aucun écrivain n’écrit une passation sans `idAssignation`', () => {
    const detaches = ecrivainsDePassation()
      .filter((e) => !/\bidAssignation\b/.test(e.bloc))
      .map((e) => e.fichier);
    expect(
      detaches,
      `Écrivain(s) de passation sans \`idAssignation\` : ${detaches.join(', ')}. `
        + "La réponse existera sans que son assignation cesse d'être réclamée.",
    ).toEqual([]);
  });

  // Le pendant : `dateReponse` est ce qui date le jalon. Un écrivain qui ne le
  // pose pas laisserait le défaut `now()` de la base décider — même valeur
  // aujourd'hui, mais plus aucune trace de l'intention le jour où l'un d'eux
  // voudra dater la PÉRIODE mesurée plutôt que le geste d'enregistrement
  // (question ouverte de `M13`, non tranchée ici).
  it('chaque écrivain pose explicitement `dateReponse`', () => {
    const sansDate = ecrivainsDePassation()
      .filter((e) => !/\bdateReponse\s*:/.test(e.bloc))
      .map((e) => e.fichier);
    expect(sansDate).toEqual([]);
  });
});
