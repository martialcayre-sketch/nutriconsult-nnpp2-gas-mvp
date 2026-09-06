import { describe, expect, it } from 'vitest';
import { correctionsParLigne, type MaillonFil } from './filCorrection';

function maillon(id: string, supersedesResultatId: string | null, saisiLe: string): MaillonFil {
  return { id, supersedesResultatId, saisiLe };
}

describe('correctionsParLigne — le fil de correction d’une mesure (D-124)', () => {
  it('rend une table vide quand aucune ligne ne supplante', () => {
    const corrections = correctionsParLigne([
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('b', null, '2026-09-02T08:00:00.000Z'),
    ]);
    expect(corrections.size).toBe(0);
  });

  it('associe la ligne supplantée à celle qui la supplante', () => {
    const corrections = correctionsParLigne([
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('b', 'a', '2026-09-02T08:00:00.000Z'),
    ]);
    expect(corrections.get('a')?.id).toBe('b');
    // La correction elle-même est COURANTE : personne ne la supplante.
    expect(corrections.has('b')).toBe(false);
  });

  it('remonte un fil de trois maillons : seul le dernier est courant', () => {
    const corrections = correctionsParLigne([
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('b', 'a', '2026-09-02T08:00:00.000Z'),
      maillon('c', 'b', '2026-09-03T08:00:00.000Z'),
    ]);
    expect(corrections.get('a')?.id).toBe('b');
    expect(corrections.get('b')?.id).toBe('c');
    expect(corrections.has('c')).toBe(false);
  });

  it('sur une fourche, la plus récente l’emporte — quel que soit l’ordre d’arrivée', () => {
    const tot = maillon('b', 'a', '2026-09-02T08:00:00.000Z');
    const tard = maillon('c', 'a', '2026-09-03T08:00:00.000Z');
    const origine = maillon('a', null, '2026-09-01T08:00:00.000Z');

    expect(correctionsParLigne([origine, tot, tard]).get('a')?.id).toBe('c');
    // L'ordre de la liste ne doit rien changer : sinon deux écrans triés
    // différemment raconteraient deux histoires du même dossier.
    expect(correctionsParLigne([origine, tard, tot]).get('a')?.id).toBe('c');
  });

  it('à horodatage égal, l’identifiant départage — et il départage de façon stable', () => {
    const meme = '2026-09-02T08:00:00.000Z';
    const b = maillon('b', 'a', meme);
    const c = maillon('c', 'a', meme);
    expect(correctionsParLigne([b, c]).get('a')?.id).toBe('c');
    expect(correctionsParLigne([c, b]).get('a')?.id).toBe('c');
  });

  it('un horodatage illisible ne prend pas la tête du fil', () => {
    const abime = maillon('b', 'a', 'pas-une-date');
    const lisible = maillon('c', 'a', '2026-09-02T08:00:00.000Z');
    expect(correctionsParLigne([abime, lisible]).get('a')?.id).toBe('c');
    expect(correctionsParLigne([lisible, abime]).get('a')?.id).toBe('c');
  });

  it('une chaîne ORPHELINE n’invente pas de ligne courante', () => {
    // La référence est souple, sans clé étrangère (D-124) : une cible absente
    // de la série est possible. Elle ne doit rien faire disparaître d'autre.
    const corrections = correctionsParLigne([
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('z', 'ligne_absente', '2026-09-02T08:00:00.000Z'),
    ]);
    expect(corrections.has('a')).toBe(false);
    expect(corrections.get('ligne_absente')?.id).toBe('z');
  });

  it('une chaîne vide se lit comme une absence de chaîne', () => {
    const corrections = correctionsParLigne([maillon('a', '', '2026-09-01T08:00:00.000Z')]);
    expect(corrections.size).toBe(0);
  });

  it('ne mute pas les lignes reçues', () => {
    const lignes = [
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('b', 'a', '2026-09-02T08:00:00.000Z'),
    ];
    const copie = JSON.parse(JSON.stringify(lignes));
    correctionsParLigne(lignes);
    expect(lignes).toEqual(copie);
  });
});
