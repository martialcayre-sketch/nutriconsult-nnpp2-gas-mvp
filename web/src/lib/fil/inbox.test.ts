import { describe, expect, it } from 'vitest';
import { lignesEcarteesParAncre, lignesInbox } from './inbox';

const NOMS = new Map([
  ['P-SOPHIE', 'Sophie Nicola'],
  ['P-MICHEL', 'Michel Dogné'],
]);

describe('lignesInbox', () => {
  it('groupe par patient : une ligne, nombre, dernière date et derniers titres', () => {
    const lignes = lignesInbox(
      [
        { idReponse: 'R1', idPatient: 'P-SOPHIE', titre: 'Sommeil', dateReponse: new Date('2026-07-14T08:00:00.000Z') },
        { idReponse: 'R2', idPatient: 'P-SOPHIE', titre: 'Plaintes', dateReponse: new Date('2026-07-15T08:00:00.000Z') },
        { idReponse: 'R3', idPatient: 'P-MICHEL', titre: 'Alimentaire', dateReponse: new Date('2026-07-13T08:00:00.000Z') },
      ],
      new Map(),
      NOMS,
    );
    // Tri par dernière date desc : Sophie (15) avant Michel (13).
    expect(lignes.map(l => l.patient)).toEqual(['Sophie Nicola', 'Michel Dogné']);
    const sophie = lignes[0];
    expect(sophie.nb).toBe(2);
    expect(sophie.derniereDate).toBe('2026-07-15T08:00:00.000Z');
    expect(sophie.titres).toEqual(['Plaintes', 'Sommeil']); // plus récent d'abord
  });

  it('écarte les réponses antérieures à la dernière consultation validée', () => {
    const ancres = new Map([['P-SOPHIE', new Date('2026-07-14T12:00:00.000Z')]]);
    const lignes = lignesInbox(
      [
        // vue en consultation (avant l'ancre) → ignorée
        { idReponse: 'R1', idPatient: 'P-SOPHIE', titre: 'Ancien', dateReponse: new Date('2026-07-10T08:00:00.000Z') },
        // après l'ancre → en attente
        { idReponse: 'R2', idPatient: 'P-SOPHIE', titre: 'Récent', dateReponse: new Date('2026-07-15T08:00:00.000Z') },
      ],
      ancres,
      NOMS,
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0].nb).toBe(1);
    expect(lignes[0].titres).toEqual(['Récent']);
  });

  it('sans consultation validée, toutes les réponses attendent', () => {
    const lignes = lignesInbox(
      [{ idReponse: 'R1', idPatient: 'P-MICHEL', titre: 'Alimentaire', dateReponse: new Date('2026-07-13T08:00:00.000Z') }],
      new Map(),
      NOMS,
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0].nb).toBe(1);
  });

  it('plafonne les titres à trois, sans doublon', () => {
    const lignes = lignesInbox(
      [
        { idReponse: 'R1', idPatient: 'P-SOPHIE', titre: 'A', dateReponse: new Date('2026-07-15T08:00:00.000Z') },
        { idReponse: 'R2', idPatient: 'P-SOPHIE', titre: 'A', dateReponse: new Date('2026-07-14T08:00:00.000Z') },
        { idReponse: 'R3', idPatient: 'P-SOPHIE', titre: 'B', dateReponse: new Date('2026-07-13T08:00:00.000Z') },
        { idReponse: 'R4', idPatient: 'P-SOPHIE', titre: 'C', dateReponse: new Date('2026-07-12T08:00:00.000Z') },
        { idReponse: 'R5', idPatient: 'P-SOPHIE', titre: 'D', dateReponse: new Date('2026-07-11T08:00:00.000Z') },
      ],
      new Map(),
      NOMS,
    );
    expect(lignes[0].nb).toBe(5);
    expect(lignes[0].titres).toEqual(['A', 'B', 'C']);
  });

  it('écarte les réponses confirmées lues par le praticien', () => {
    const lignes = lignesInbox(
      [
        { idReponse: 'R-LUE', idPatient: 'P-SOPHIE', titre: 'Sommeil', dateReponse: new Date('2026-07-14T08:00:00.000Z') },
        { idReponse: 'R-NON-LUE', idPatient: 'P-SOPHIE', titre: 'Plaintes', dateReponse: new Date('2026-07-15T08:00:00.000Z') },
      ],
      new Map(),
      NOMS,
      new Set(['R-LUE']),
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0].nb).toBe(1);
    expect(lignes[0].titres).toEqual(['Plaintes']);
  });
});

describe('lignesEcarteesParAncre', () => {
  const noms = new Map([['PAT_1', 'Michel Dogné'], ['PAT_2', 'Sophie Nicola']]);
  const r = (idReponse: string, idPatient: string, iso: string) => ({
    idReponse, idPatient, titre: 'Questionnaire', dateReponse: new Date(iso),
  });

  it('compte ce que l’ancre a retiré, et porte la date qui l’a retiré', () => {
    // C'EST LE COMPLÉMENT EXACT DE `lignesInbox` : ce qu'elle écarte, celle-ci
    // le nomme. Sans quoi l'accueil affirmait « tout a été vu en consultation »
    // sur la foi d'un geste du PATIENT.
    const ancres = new Map([['PAT_1', new Date('2026-09-04T10:00:00.000Z')]]);
    const ecartees = lignesEcarteesParAncre(
      [
        r('R1', 'PAT_1', '2026-09-01T09:00:00.000Z'),
        r('R2', 'PAT_1', '2026-09-03T09:00:00.000Z'),
        r('R3', 'PAT_1', '2026-09-05T09:00:00.000Z'),
      ],
      ancres,
      noms,
    );
    expect(ecartees).toEqual([
      { idPatient: 'PAT_1', patient: 'Michel Dogné', nb: 2, ancre: '2026-09-04T10:00:00.000Z' },
    ]);
  });

  it('une réponse déjà lue n’est pas « écartée sans avoir été vue »', () => {
    // Elle est traitée. L'exclure des DEUX côtés est ce qui garde les deux
    // fonctions complémentaires plutôt que concurrentes.
    const ancres = new Map([['PAT_1', new Date('2026-09-04T10:00:00.000Z')]]);
    const ecartees = lignesEcarteesParAncre(
      [r('R1', 'PAT_1', '2026-09-01T09:00:00.000Z')],
      ancres,
      noms,
      new Set(['R1']),
    );
    expect(ecartees).toEqual([]);
  });

  it('sans consultation validée, rien n’est écarté', () => {
    // Le miroir de `lignesInbox` : sans ancre, toutes les réponses attendent.
    const ecartees = lignesEcarteesParAncre(
      [r('R1', 'PAT_1', '2026-09-01T09:00:00.000Z')],
      new Map(),
      noms,
    );
    expect(ecartees).toEqual([]);
  });

  it('le dossier le plus fourni passe devant', () => {
    const ancres = new Map([
      ['PAT_1', new Date('2026-09-04T10:00:00.000Z')],
      ['PAT_2', new Date('2026-09-04T10:00:00.000Z')],
    ]);
    const ecartees = lignesEcarteesParAncre(
      [
        r('R1', 'PAT_2', '2026-09-01T09:00:00.000Z'),
        r('R2', 'PAT_1', '2026-09-01T09:00:00.000Z'),
        r('R3', 'PAT_1', '2026-09-02T09:00:00.000Z'),
      ],
      ancres,
      noms,
    );
    expect(ecartees.map(e => [e.patient, e.nb])).toEqual([['Michel Dogné', 2], ['Sophie Nicola', 1]]);
  });
});
