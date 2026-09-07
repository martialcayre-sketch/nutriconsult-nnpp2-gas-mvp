import { describe, expect, it } from 'vitest';
import { GOUVERNANCE_TRUST } from './gouvernance';
import { getDocumentCourant } from './contenus/registre';

// CE BANC EXISTE PARCE QUE LA DÉRIVE A EU LIEU.
//
// `gouvernance.ts` n'a aucun consommateur, et le dossier RGPD l'avait nommé
// « copie morte » le 2026-08-19 en annonçant le risque : deux listes que rien
// ne tient synchrones. Le 2026-09-07, `D-137` a corrigé le document servi au
// patient — et ce fichier a gardé la phrase démentie pendant ce temps.
//
// La liste est désormais DÉRIVÉE. Ces cas vérifient qu'elle l'est réellement,
// et qu'elle ne peut plus porter ce que le document ne dit pas.

describe('GOUVERNANCE_TRUST.sousTraitants — dérivée, jamais recopiée', () => {
  const points =
    getDocumentCourant('donnees_confidentialite').sections.find(
      s => s.titre === 'Quels prestataires techniques interviennent ?',
    )?.points ?? [];

  it('reprend exactement les prestataires du document COURANT', () => {
    expect(points.length).toBeGreaterThan(0);
    expect(GOUVERNANCE_TRUST.sousTraitants.map(t => `${t.nom} — ${t.role}`)).toEqual([...points]);
  });

  it('nomme Sentry, que la version recopiée ignorait', () => {
    expect(GOUVERNANCE_TRUST.sousTraitants.map(t => t.nom)).toContain('Sentry');
  });

  it('NE PORTE PLUS la négation que D-137 a démentie', () => {
    // « Google — connexion sécurisée du praticien uniquement (jamais des
    // patients) » : faux depuis le 2026-07-22, corrigé côté patient le
    // 2026-09-07, et resté ici jusqu'à la dérivation.
    const roles = GOUVERNANCE_TRUST.sousTraitants.map(t => t.role).join(' ');
    expect(roles).not.toContain('jamais des patients');
  });

  it("ne cite plus les hébergeurs fermés le 2026-09-01", () => {
    const noms = GOUVERNANCE_TRUST.sousTraitants.map(t => t.nom).join(' ');
    expect(noms).not.toContain('Vercel');
    expect(noms).not.toContain('Supabase');
  });

  it('sépare bien le nom du rôle, sans avaler le tiret', () => {
    const scalingo = GOUVERNANCE_TRUST.sousTraitants.find(t => t.nom === 'Scalingo');
    expect(scalingo).toBeTruthy();
    expect(scalingo?.role).not.toContain('—');
    expect(scalingo?.role).toContain('hébergement');
  });
});
