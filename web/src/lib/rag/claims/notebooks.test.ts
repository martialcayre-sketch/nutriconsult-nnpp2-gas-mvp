import { describe, expect, it } from 'vitest';
import {
  annoterSources,
  estSourceEnQuarantaine,
  noticeDeSource,
  sansSourcesEnQuarantaine,
  sourcesDuNotebook,
} from './notebooks';

// Le registre réel (source_registry.json) est importé statiquement : ces tests
// verrouillent le contrat sur des notices connues du pilote.
describe('notebooks — vue registre', () => {
  it('annote une source pilote avec son titre et son notebook', () => {
    const notice = noticeDeSource('WN-SRC-0056');
    expect(notice).not.toBeNull();
    expect(notice?.notebook).toBe('09 — Nutrition et aliments vedettes');
    expect(notice?.titre).toContain('acides gras');
  });

  it('rend null pour une source hors registre', () => {
    expect(noticeDeSource('WN-SRC-0000')).toBeNull();
  });

  it('liste les sources du notebook pilote (les 6 sources y figurent)', () => {
    const ids = sourcesDuNotebook('09 — Nutrition et aliments vedettes');
    for (const attendu of ['WN-SRC-0032', 'WN-SRC-0053', 'WN-SRC-0056', 'WN-SRC-0063', 'WN-SRC-0074', 'WN-SRC-0075']) {
      expect(ids).toContain(attendu);
    }
    // Trié, sans doublon.
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('un notebook inconnu rend une liste vide (filtre qui ne matche rien, jamais ignoré)', () => {
    expect(sourcesDuNotebook('Notebook fantôme')).toEqual([]);
  });

  it('annoterSources marque les inconnues Hors registre sans les perdre', () => {
    const annotees = annoterSources(['WN-SRC-0056', 'WN-SRC-0000']);
    expect(annotees).toHaveLength(2);
    expect(annotees[1]).toEqual({ sourceId: 'WN-SRC-0000', titre: 'WN-SRC-0000', notebook: 'Hors registre' });
  });
});

describe('notebooks — quarantaine sanitaire', () => {
  it('reconnaît une source en quarantaine du registre réel', () => {
    // WN-SRC-0318 « Les insomnies premières ordonnances » — vigilance Élevée,
    // action requise « Relecture scientifique et sécurité ».
    expect(estSourceEnQuarantaine('WN-SRC-0318')).toBe(true);
  });

  it('ne met pas en quarantaine une source ordinaire ni une inconnue', () => {
    expect(estSourceEnQuarantaine('WN-SRC-0056')).toBe(false);
    expect(estSourceEnQuarantaine('WN-SRC-0000')).toBe(false);
  });

  it('retire les sources en quarantaine et conserve les autres', () => {
    const filtrees = sansSourcesEnQuarantaine(['WN-SRC-0056', 'WN-SRC-0318', 'WN-SRC-0032']);
    expect(filtrees).toEqual(['WN-SRC-0056', 'WN-SRC-0032']);
  });

  it('sourcesDuNotebook NE filtre PAS la quarantaine — la file de revue doit la voir', () => {
    // C'est le contrat qui rend la quarantaine réversible : le praticien
    // continue de voir ces claims pour les arbitrer. Les masquer ici rendrait
    // la quarantaine définitive par accident. Le retrait appartient aux chemins
    // qui SERVENT le claim (rayonCorpus), pas à ceux qui l'exposent pour
    // décision.
    const ids = sourcesDuNotebook('02 — Sommeil et chronobiologie');
    expect(ids).toContain('WN-SRC-0318');
  });

  it('le rayon micronutrition perd bien des sources au filtrage (effet réel, pas théorique)', () => {
    const brutes = sourcesDuNotebook('10 — Micronutrition et compléments');
    const servables = sansSourcesEnQuarantaine(brutes);
    expect(brutes.length).toBeGreaterThan(servables.length);
    expect(servables.every((id) => !estSourceEnQuarantaine(id))).toBe(true);
  });
});
