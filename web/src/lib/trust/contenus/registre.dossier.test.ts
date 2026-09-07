import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getDocumentCourant } from './registre';

// LE BANC QUI TIENT DEUX DOCUMENTS ENSEMBLE.
//
// Le dépôt énumère ses sous-traitants à deux endroits qui ne se parlaient pas :
// `registre.ts`, servi au PATIENT, et la rubrique 6 de `docs/DOSSIER_RGPD.md`,
// la pièce qu'on présenterait à un RÉGULATEUR. Rien ne les tenait.
//
// Le résultat était mesurable : la rubrique 6 a énuméré Vercel et Supabase
// comme sous-traitants seize jours après le cutover et six jours après leur
// fermeture, sans nommer Scalingo, et a gardé la négation « jamais des
// patients » que `D-137` a démentie le 2026-09-07. Le dossier lui-même avait
// annoncé ce risque le 2026-08-19 — « rien ne tient les deux copies
// synchrones » — sans que rien ne soit posé pour l'empêcher.
//
// Ce banc compare les NOMS, pas les phrases : le document patient parle au
// patient, le dossier parle à un juriste, et il serait absurde d'exiger la même
// prose. Ce qui ne peut pas diverger, c'est QUI reçoit des données.

const RACINE = path.resolve(__dirname, '../../../../..');
const DOSSIER = path.join(RACINE, 'docs', 'DOSSIER_RGPD.md');

/** Les noms de la liste servie au patient : « Scalingo — hébergement… » → « Scalingo ». */
function nomsDuDocumentPatient(): string[] {
  const section = getDocumentCourant('donnees_confidentialite').sections.find(
    s => s.titre === 'Quels prestataires techniques interviennent ?',
  );
  return (section?.points ?? []).map(point => {
    const separation = point.indexOf(' — ');
    return (separation === -1 ? point : point.slice(0, separation)).trim();
  });
}

/** Les noms de la première colonne du tableau de la rubrique 6. */
function nomsDuDossier(): string[] {
  const texte = fs.readFileSync(DOSSIER, 'utf8');
  const debut = texte.indexOf('## 6. Destinataires et sous-traitants');
  expect(debut, 'rubrique 6 introuvable dans docs/DOSSIER_RGPD.md').toBeGreaterThan(-1);
  const entete = texte.indexOf('| Sous-traitant |', debut);
  expect(entete, 'tableau des sous-traitants introuvable en rubrique 6').toBeGreaterThan(-1);

  const noms: string[] = [];
  for (const ligne of texte.slice(entete).split('\n').slice(2)) {
    if (!ligne.startsWith('|')) break; // le tableau s'arrête à la première ligne non tabulaire
    const premiereColonne = ligne.split('|')[1]?.trim();
    if (premiereColonne) noms.push(premiereColonne);
  }
  return noms;
}

describe('rubrique 6 du dossier RGPD ↔ document servi au patient', () => {
  it('trouve les deux listes — sinon ce banc ne prouverait rien', () => {
    expect(nomsDuDocumentPatient().length).toBeGreaterThan(3);
    expect(nomsDuDossier().length).toBeGreaterThan(3);
  });

  it('LES DEUX LISTES NOMMENT EXACTEMENT LES MÊMES TIERS', () => {
    expect(
      nomsDuDossier(),
      'Le dossier RGPD et le document patient ne nomment plus les mêmes sous-traitants. '
        + "Corriger les DEUX : la rubrique 6 de docs/DOSSIER_RGPD.md et la version courante de "
        + 'donnees_confidentialite dans registre.ts — jamais un seul des deux.',
    ).toEqual(nomsDuDocumentPatient());
  });

  it("ne cite plus les hébergeurs fermés le 2026-09-01, d'aucun des deux côtés", () => {
    const tout = [...nomsDuDossier(), ...nomsDuDocumentPatient()].join(' ');
    expect(tout).not.toContain('Vercel');
    expect(tout).not.toContain('Supabase');
  });
});
