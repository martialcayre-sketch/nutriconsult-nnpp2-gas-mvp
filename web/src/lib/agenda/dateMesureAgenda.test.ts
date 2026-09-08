import { describe, expect, it } from 'vitest';
import { dateMesureAgenda } from './dateMesureAgenda';

const CLOTURE = new Date('2026-08-29T14:30:00.000Z');

describe('dateMesureAgenda', () => {
  it('retient la DERNIÈRE journée mesurée, pas la clôture', () => {
    const d = dateMesureAgenda(['2026-07-29', '2026-08-18', '2026-08-02'], CLOTURE);
    expect(d.toISOString()).toBe('2026-08-18T00:00:00.000Z');
  });

  // Le cas de production qui a motivé l'arbitrage : une nuit unique du 29
  // juillet, close le 29 août. Trente et un jours d'écart, pour une tolérance
  // de jalon de 8 : la mesure sortait de toute fenêtre.
  it('une nuit unique close un mois plus tard porte la date de la nuit', () => {
    expect(dateMesureAgenda(['2026-07-29'], CLOTURE).toISOString()).toBe('2026-07-29T00:00:00.000Z');
  });

  it('l’ordre d’arrivée ne compte pas : le maximum est lexicographique donc chronologique', () => {
    const melange = ['2026-09-06', '2026-08-31', '2026-09-01'];
    expect(dateMesureAgenda(melange, CLOTURE).toISOString()).toBe('2026-09-06T00:00:00.000Z');
  });

  it('minuit UTC : une journée d’agenda n’a pas d’heure, on ne lui en invente pas', () => {
    const d = dateMesureAgenda(['2026-08-18'], CLOTURE);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it('sans aucune journée exploitable, le repli est l’instant de clôture', () => {
    expect(dateMesureAgenda([], CLOTURE)).toBe(CLOTURE);
    expect(dateMesureAgenda(['pas-une-date', ''], CLOTURE)).toBe(CLOTURE);
  });

  // `new Date('2026-02-30T00:00:00Z')` ne rend PAS `Invalid Date` : elle est
  // reportée au 2 mars, en silence. Une passation datée d'un jour que personne
  // n'a vécu est pire qu'une passation datée de sa clôture — rien ne la
  // signale. D'où l'exigence d'aller-retour.
  it('une date impossible retombe sur le repli, jamais sur un report silencieux', () => {
    const d = dateMesureAgenda(['2026-02-30'], CLOTURE);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d).toBe(CLOTURE);
  });

  it('une date mal formée est ignorée, les autres restent lues', () => {
    const d = dateMesureAgenda(['18/08/2026', '2026-08-05'], CLOTURE);
    expect(d.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });
});
