import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// LE BANC QUI TIENT LA RUBRIQUE 5 AU SCHÉMA.
//
// Frère de `registre.dossier.test.ts`, sur l'autre rubrique. Celui-là tient la
// liste des SOUS-TRAITANTS (rubrique 6) entre le dossier RGPD et le document
// patient. Rien ne tenait la liste des DONNÉES (rubrique 5) à ce qui existe
// réellement en base — et l'écart s'est vu :
//
// Le 2026-09-09, `WN_CB_RESULTS_ENABLED` a été posé en production. Le dossier
// RGPD §2 conditionnait cette ouverture à la déclaration préalable de la
// catégorie « résultats biologiques » en rubrique 5. La condition a été
// manquée, et AUCUN banc ne pouvait la rappeler. Le constat qui a suivi a
// montré plus large : QUATRE tables patient du rayon biologie manquaient à la
// rubrique 5, dont `documents_patient_biologie` qui portait déjà une ligne en
// production depuis le 2026-09-03.
//
// Ce banc compare des NOMS DE MODÈLE, pas de la prose : la rubrique 5 parle à
// un juriste et n'a pas à recopier le schéma. Ce qui ne peut pas diverger,
// c'est QUELLES TABLES DU DOSSIER PATIENT existent.

const RACINE = path.resolve(__dirname, '../../../../..');
const SCHEMA = path.join(RACINE, 'web', 'prisma', 'schema.prisma');
const DOSSIER = path.join(RACINE, 'docs', 'DOSSIER_RGPD.md');

/**
 * DETTE DATÉE DU 2026-09-09, ET ELLE NE DOIT QUE RÉTRÉCIR.
 *
 * Dix-sept tables filles de `patients` ne sont pas déclarées en rubrique 5.
 * Elles NE SONT PAS corrigées ici, et ce n'est pas un oubli : classer une table
 * en « catégorie particulière » au sens de l'article 9 est une qualification
 * juridique, pas une écriture de code — elle appartient au responsable de
 * traitement, comme le trou de base légale que la rubrique 3 nomme déjà.
 *
 * Ce que cette liste achète en attendant : toute table patient AJOUTÉE APRÈS
 * cette date rougit immédiatement. Le défaut qui a produit ce banc ne peut plus
 * se reproduire en silence — il ne reste que son passif, et il est nommé.
 *
 * Ajouter un nom ici demande une justification écrite dans la PR. Le geste
 * normal est d'en retirer.
 */
const NON_DECLARES_AU_2026_09_09: readonly string[] = Object.freeze([
  'Assignation',
  'CritereDossierConstate',
  'DecisionPrioritySelection',
  'ProtocolDiffusionApproval',
  'FilCardRejection',
  'PackProposition',
  'EnvoiBrouillon',
  'RendezVous',
  'ObjectifNegocie',
  'EntreeCeQuiCompte',
  'SyntheseComprehension',
  'DesaccordComprehension',
  'RatificationObjectif',
  'PropositionObjectif',
  'DispositionProposition',
  'AmendementObjectif',
  'ReponseJalonObjectif',
]);

/** Les modèles Prisma qui portent une relation vers `Patient` — les tables du dossier. */
function modelesFilsDePatient(): string[] {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const noms: string[] = [];
  for (const bloc of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, nom, corps] = bloc;
    if (/\bpatient\s+Patient\b/.test(corps) || /\bPatient\s+@relation\(/.test(corps)) {
      noms.push(nom);
    }
  }
  return noms;
}

/** Le texte de la rubrique 5 seule — les autres rubriques citent des modèles pour d'autres motifs. */
function rubrique5(): string {
  const texte = fs.readFileSync(DOSSIER, 'utf8');
  const debut = texte.indexOf('## 5. Catégories de données');
  expect(debut, 'rubrique 5 introuvable dans docs/DOSSIER_RGPD.md').toBeGreaterThan(-1);
  const fin = texte.indexOf('## 6. Destinataires', debut);
  expect(fin, 'rubrique 6 introuvable — la borne de la rubrique 5 manque').toBeGreaterThan(debut);
  return texte.slice(debut, fin);
}

describe('rubrique 5 du dossier RGPD ↔ tables du dossier patient', () => {
  it('trouve les deux côtés — sinon ce banc ne prouverait rien', () => {
    // Sans ce cas, une regex qui ne capture plus rien rendrait le banc VERT et
    // muet : zéro modèle à vérifier, zéro échec, zéro protection.
    expect(modelesFilsDePatient().length).toBeGreaterThan(20);
    expect(rubrique5()).toContain('Catégorie particulière');
  });

  it('TOUTE TABLE FILLE DE PATIENT EST DÉCLARÉE, hors dette nommée du 2026-09-09', () => {
    const texte = rubrique5();
    const manquants = modelesFilsDePatient()
      .filter(nom => !texte.includes(`\`${nom}\``))
      .filter(nom => !NON_DECLARES_AU_2026_09_09.includes(nom));

    expect(
      manquants,
      'Des tables du dossier patient ne sont pas déclarées en rubrique 5 de docs/DOSSIER_RGPD.md. '
        + 'Une table qui porte une donnée patient et que le registre ignore est un traitement non déclaré. '
        + 'Déclarer la catégorie AVANT d’ouvrir la surface qui l’alimente — précédent WN_CB_RESULTS_ENABLED, 2026-09-09.',
    ).toEqual([]);
  });

  it('les quatre tables du rayon biologie sont déclarées', () => {
    // Le cas concret qui a fait naître ce banc, épinglé pour lui-même : une
    // regression sur ces quatre-là rougirait déjà au cas précédent, mais elle
    // s'y perdrait dans une liste. Ici, elle se nomme.
    const texte = rubrique5();
    for (const modele of [
      'ArbitrageBiologique',
      'PanelBiologieDocumente',
      'DocumentPatientBiologie',
      'ResultatBiologique',
    ]) {
      expect(texte, `${modele} absent de la rubrique 5`).toContain(`\`${modele}\``);
    }
  });

  it('la dette ne contient que des modèles qui existent VRAIMENT', () => {
    // Une liste d'exceptions qui prend de l'âge finit par dispenser des tables
    // renommées ou supprimées — et par couvrir, sous leur ancien nom, des
    // tables neuves qui ne devraient rien recevoir. Elle se périme donc avec le
    // schéma, pas à la relecture.
    const existants = new Set(modelesFilsDePatient());
    const fantomes = NON_DECLARES_AU_2026_09_09.filter(nom => !existants.has(nom));
    expect(
      fantomes,
      'Ces noms sont dispensés de déclaration mais ne sont plus des tables filles de patients : les retirer de la dette.',
    ).toEqual([]);
  });
});
