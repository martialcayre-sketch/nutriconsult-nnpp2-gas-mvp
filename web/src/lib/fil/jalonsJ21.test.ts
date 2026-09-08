import { describe, expect, it } from 'vitest';
import { jalonsSansDecision, type CheckinJ21Row } from './jalonsJ21';

// Réponses de check-in lisibles minimales (le domaine ne lit que `adhesion`).
const reponses = (adhesion: string) => ({
  adhesion,
  tolerance: 'bien',
  energie: 'stable',
  sommeil: 'stable',
});

const ACTIFS = new Set(['P-SOPHIE', 'P-MICHEL']);

// Aucune décision consignée. Une `Map` vide et non un `Set` : depuis [[D-151]]
// c'est la DATE du dernier épisode J21 qui tranche, pas sa seule présence.
const AUCUNE_DECISION = new Map<string, Date>();

describe('jalonsSansDecision', () => {
  it('retient le patient avec check-in J21 mais sans épisode J21 consigné', () => {
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_1', idPatient: 'P-SOPHIE', reponses: reponses('tous_les_jours'), soumisLe: new Date('2026-07-14T08:00:00.000Z') },
    ];
    const jalons = jalonsSansDecision(checkins, AUCUNE_DECISION, ACTIFS);
    expect(jalons).toHaveLength(1);
    expect(jalons[0].idCheckin).toBe('CHK_1');
    expect(jalons[0].idPatient).toBe('P-SOPHIE');
    // L'action principale observée est citée (factuelle, jamais un score).
    expect(jalons[0].adhesion).toBeTruthy();
  });

  // RÉÉCRIT PAR [[D-151]] — il posait `new Set(['P-SOPHIE'])` et affirmait donc
  // qu'un épisode J21 QUELCONQUE écarte le point d'étape. C'est la règle
  // fautive : le banc la tenait pour voulue, et c'est pourquoi elle a survécu.
  it('écarte le point d’étape tranché par un épisode POSTÉRIEUR à sa soumission', () => {
    const soumisLe = new Date('2026-07-14T08:00:00.000Z');
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_1', idPatient: 'P-SOPHIE', reponses: reponses('tous_les_jours'), soumisLe },
    ];
    const decidePlusTard = new Map([['P-SOPHIE', new Date('2026-07-16T08:00:00.000Z')]]);
    expect(jalonsSansDecision(checkins, decidePlusTard, ACTIFS)).toEqual([]);
  });

  // LE DÉFAUT `A04`, DANS UN SEUL CYCLE. Les deux « J21 » vivent sur deux
  // calendriers : un épisode de MESURE confirmé avant l'arrivée du point
  // d'étape supprimait la carte définitivement, sans qu'aucune décision n'ait
  // été prise sur ce point d'étape.
  it('un épisode ANTÉRIEUR ne tranche rien : la carte demeure', () => {
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_1', idPatient: 'P-SOPHIE', reponses: reponses('tous_les_jours'), soumisLe: new Date('2026-07-14T08:00:00.000Z') },
    ];
    const decideAvant = new Map([['P-SOPHIE', new Date('2026-07-02T08:00:00.000Z')]]);
    const jalons = jalonsSansDecision(checkins, decideAvant, ACTIFS);
    expect(jalons).toHaveLength(1);
    expect(jalons[0].idCheckin).toBe('CHK_1');
  });

  // La borne, dite plutôt que laissée au hasard d'une comparaison stricte.
  it('un épisode confirmé à l’instant même de la soumission EST la décision', () => {
    const soumisLe = new Date('2026-07-14T08:00:00.000Z');
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_1', idPatient: 'P-SOPHIE', reponses: reponses('tous_les_jours'), soumisLe },
    ];
    expect(jalonsSansDecision(checkins, new Map([['P-SOPHIE', soumisLe]]), ACTIFS)).toEqual([]);
  });

  // Entre cycles : c'est le chemin que l'audit nommait, et il se ferme par la
  // même règle — sans jointure sur une chaîne de cycle que la production ne
  // peuple pas.
  it('un épisode du cycle précédent ne masque pas le point d’étape du cycle suivant', () => {
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_C2', idPatient: 'P-MICHEL', reponses: reponses('quelques_jours'), soumisLe: new Date('2026-08-20T08:00:00.000Z') },
    ];
    const decisionCycle1 = new Map([['P-MICHEL', new Date('2026-06-01T08:00:00.000Z')]]);
    expect(jalonsSansDecision(checkins, decisionCycle1, ACTIFS)).toHaveLength(1);
  });

  it('ancre le refus sur le check-in J21 le plus récent (une correction fait revenir la carte)', () => {
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_ANCIEN', idPatient: 'P-MICHEL', reponses: reponses('quelques_jours'), soumisLe: new Date('2026-07-10T08:00:00.000Z') },
      { id: 'CHK_RECENT', idPatient: 'P-MICHEL', reponses: reponses('tous_les_jours'), soumisLe: new Date('2026-07-15T08:00:00.000Z') },
    ];
    const jalons = jalonsSansDecision(checkins, AUCUNE_DECISION, ACTIFS);
    expect(jalons).toHaveLength(1);
    expect(jalons[0].idCheckin).toBe('CHK_RECENT');
  });

  it('un check-in illisible n’invente rien : l’adhésion reste absente, la carte demeure', () => {
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_1', idPatient: 'P-SOPHIE', reponses: { corrompu: true }, soumisLe: new Date('2026-07-14T08:00:00.000Z') },
    ];
    const jalons = jalonsSansDecision(checkins, AUCUNE_DECISION, ACTIFS);
    expect(jalons).toHaveLength(1);
    expect(jalons[0].adhesion).toBeNull();
  });

  it('ignore un patient hors de la patientèle active', () => {
    const checkins: CheckinJ21Row[] = [
      { id: 'CHK_1', idPatient: 'P-AUTRE', reponses: reponses('tous_les_jours'), soumisLe: new Date('2026-07-14T08:00:00.000Z') },
    ];
    expect(jalonsSansDecision(checkins, AUCUNE_DECISION, ACTIFS)).toEqual([]);
  });
});
