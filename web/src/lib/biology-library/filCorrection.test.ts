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

  it('remonte un fil de trois maillons : toutes pointent vers CELLE QUI FAIT FOI', () => {
    // La table ne dit pas « qui m'a remplacée directement » — le chaînage
    // direct reste lisible sur chaque ligne (`supersedesResultatId`). Elle dit
    // « laquelle fait foi à ma place », et c'est la tête du fil : c'est cette
    // question-là que l'écran pose pour barrer et pour retirer le geste.
    const corrections = correctionsParLigne([
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('b', 'a', '2026-09-02T08:00:00.000Z'),
      maillon('c', 'b', '2026-09-03T08:00:00.000Z'),
    ]);
    expect(corrections.get('a')?.id).toBe('c');
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

  it('sur une fourche, la branche PERDANTE ne reste PAS courante', () => {
    // Le défaut nommé par la contre-revue du 2026-09-06 (M1) : `b` n'est
    // supplantée par personne au sens du chaînage, et sortait donc courante —
    // deux valeurs faisaient foi pour la même mesure, avec deux boutons
    // « Corriger ». Une seule ligne d'un fil peut être absente de la table.
    const corrections = correctionsParLigne([
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('b', 'a', '2026-09-02T08:00:00.000Z'),
      maillon('c', 'a', '2026-09-03T08:00:00.000Z'),
    ]);
    expect(corrections.get('b')?.id).toBe('c');
    expect(corrections.get('a')?.id).toBe('c');
    expect(corrections.has('c')).toBe(false);
  });

  it('une seule ligne courante par fil, même sur une fourche PROLONGÉE', () => {
    // La branche perdante a elle-même été corrigée : `d` est une tête au sens
    // du chaînage, mais son fil a déjà une tête plus récente.
    const lignes = [
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('b', 'a', '2026-09-02T08:00:00.000Z'),
      maillon('c', 'a', '2026-09-05T08:00:00.000Z'),
      maillon('d', 'b', '2026-09-03T08:00:00.000Z'),
    ];
    const corrections = correctionsParLigne(lignes);
    const courantes = lignes.filter(l => !corrections.has(l.id));
    expect(courantes.map(l => l.id)).toEqual(['c']);
  });

  it('deux fils DISTINCTS gardent chacun leur ligne courante', () => {
    // Deux analytes, ou deux dates : deux racines, deux têtes. Le groupe ne
    // doit pas fusionner ce que rien ne relie.
    const lignes = [
      maillon('a1', null, '2026-09-01T08:00:00.000Z'),
      maillon('a2', 'a1', '2026-09-02T08:00:00.000Z'),
      maillon('b1', null, '2026-09-01T08:00:00.000Z'),
    ];
    const corrections = correctionsParLigne(lignes);
    const courantes = lignes.filter(l => !corrections.has(l.id)).map(l => l.id);
    expect(courantes.sort()).toEqual(['a2', 'b1']);
  });

  it('à horodatage égal, l’identifiant départage — et il départage de façon stable', () => {
    const meme = '2026-09-02T08:00:00.000Z';
    const b = maillon('b', 'a', meme);
    const c = maillon('c', 'a', meme);
    expect(correctionsParLigne([b, c]).get('b')?.id).toBe('c');
    expect(correctionsParLigne([c, b]).get('b')?.id).toBe('c');
  });

  it('un horodatage illisible ne prend pas la tête du fil', () => {
    const abime = maillon('b', 'a', 'pas-une-date');
    const lisible = maillon('c', 'a', '2026-09-02T08:00:00.000Z');
    expect(correctionsParLigne([abime, lisible]).get('b')?.id).toBe('c');
    expect(correctionsParLigne([lisible, abime]).get('b')?.id).toBe('c');
  });

  it('une chaîne ORPHELINE forme son propre fil et ne fait rien disparaître', () => {
    // La référence est souple, sans clé étrangère (D-124) : une cible absente
    // de la série est possible. Elle ne doit ni disparaître, ni emporter une
    // ligne qui n'a rien à voir avec elle.
    const lignes = [
      maillon('a', null, '2026-09-01T08:00:00.000Z'),
      maillon('z', 'ligne_absente', '2026-09-02T08:00:00.000Z'),
    ];
    const corrections = correctionsParLigne(lignes);
    const courantes = lignes.filter(l => !corrections.has(l.id)).map(l => l.id);
    expect(courantes.sort()).toEqual(['a', 'z']);
  });

  it('deux orphelines visant la MÊME ligne absente ne font qu’un fil', () => {
    const lignes = [
      maillon('y', 'ligne_absente', '2026-09-02T08:00:00.000Z'),
      maillon('z', 'ligne_absente', '2026-09-03T08:00:00.000Z'),
    ];
    const corrections = correctionsParLigne(lignes);
    expect(corrections.get('y')?.id).toBe('z');
    expect(corrections.has('z')).toBe(false);
  });

  it('un cycle ne fait pas tourner la résolution sans fin', () => {
    // Irréalisable par la route (append-only, cible antérieure) — mais une
    // base abîmée ne doit pas figer l'écran du praticien.
    const lignes = [
      maillon('a', 'b', '2026-09-01T08:00:00.000Z'),
      maillon('b', 'a', '2026-09-02T08:00:00.000Z'),
    ];
    const corrections = correctionsParLigne(lignes);
    // Tout le monde est supplanté : le repli désigne quand même une ligne,
    // plutôt que de faire disparaître la série entière.
    expect(lignes.filter(l => !corrections.has(l.id))).toHaveLength(1);
  });

  it('une QUEUE qui mène à un cycle rejoint le même fil, quel que soit l’ordre d’entrée', () => {
    // L'invariant de la mémoïsation : `t` mène au cycle `c0 ⇄ c1` sans en faire
    // partie. Sa racine EST le cycle qu'elle atteint, donc les trois lignes ne
    // forment qu'un fil — et cela ne doit pas dépendre de la ligne d'où l'on
    // part, sans quoi le fil se scinderait selon l'ordre d'arrivée.
    const lignes = [
      maillon('c0', 'c1', '2026-09-01T08:00:00.000Z'),
      maillon('c1', 'c0', '2026-09-02T08:00:00.000Z'),
      maillon('t', 'c0', '2026-09-03T08:00:00.000Z'),
    ];
    const depuisLaQueue = correctionsParLigne(lignes);
    const depuisLeCycle = correctionsParLigne([...lignes].reverse());
    // Un seul fil, donc UNE seule ligne courante — dans les deux ordres.
    expect(lignes.filter(l => !depuisLaQueue.has(l.id))).toHaveLength(1);
    expect(lignes.filter(l => !depuisLeCycle.has(l.id))).toHaveLength(1);
    // Et c'est LA MÊME, sans quoi deux surfaces raconteraient deux histoires.
    const courante = (m: Map<string, { id: string }>) =>
      lignes.find(l => !m.has(l.id))?.id;
    expect(courante(depuisLaQueue)).toBe(courante(depuisLeCycle));
  });

  it('une chaîne TRÈS LONGUE reste UN seul fil : aucun plafond ne la scinde', () => {
    // Un garde-fou de profondeur rendrait, au-delà, une racine dépendante du
    // point d'entrée : le fil se scinderait et DEUX lignes feraient foi pour la
    // même mesure — le défaut M1, ressuscité par la protection elle-même
    // (contre-revue du 2026-09-06, m14). La terminaison tient au chemin déjà
    // parcouru, pas à un compteur.
    const N = 3000;
    const lignes = [maillon('m0000', null, '2026-09-01T08:00:00.000Z')];
    for (let i = 1; i < N; i += 1) {
      const id = `m${String(i).padStart(4, '0')}`;
      const amont = `m${String(i - 1).padStart(4, '0')}`;
      const quand = new Date(Date.UTC(2026, 8, 1, 8, 0, 0) + i * 1000).toISOString();
      lignes.push(maillon(id, amont, quand));
    }
    // Ordre d'arrivée hostile : la plus profonde d'abord.
    const corrections = correctionsParLigne([...lignes].reverse());
    expect(lignes.filter(l => !corrections.has(l.id))).toHaveLength(1);
    // Et c'est bien la dernière du fil qui fait foi.
    expect(corrections.get('m0000')?.id).toBe(`m${String(N - 1).padStart(4, '0')}`);
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
