import { describe, expect, it } from 'vitest';

/**
 * SENTINELLE — la version de React RÉELLEMENT EXÉCUTÉE.
 *
 * `package.json` déclare `react: ^18.3.1`, et c'est cette version que jouent les
 * 6708 bancs unitaires. Ce n'est PAS celle qui tourne en production : Next
 * embarque son propre React et l'aliase sur les trois couches de l'App Router —
 * `reactServerComponents`, `serverSideRendering` ET `appPagesBrowser`
 * (`next/dist/build/webpack-config.js`, `createVendoredReactAliases`). Le dépôt
 * n'ayant pas de Pages Router, TOUTE l'application — cockpit praticien et
 * portail patient, serveur comme navigateur — s'exécute sur cette copie.
 *
 * Ce banc existe parce que son absence a coûté : la marche 14.2.35 → 15.5.25 a
 * été présentée et ARBITRÉE comme « React reste en 18 », alors qu'elle faisait
 * passer le runtime de `18.3.0-canary` à `19.2.0-canary` — un majeur entier,
 * invisible du `package.json`, du type-check et de la suite unitaire. Voir
 * `D-139`.
 *
 * Ce que le banc protège n'est pas une version : c'est le fait qu'un changement
 * de majeure de React ne puisse plus arriver SANS DÉCISION. S'il rougit, la
 * réponse n'est jamais d'ajuster la constante seule — c'est de consigner la
 * décision, puis de l'ajuster.
 */
const MAJEURE_ARBITREE = 19;

function versionReactEmbarque(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const react = require('next/dist/compiled/react') as { version?: string };
  return react.version ?? '';
}

describe('React embarqué par Next — la version qui tourne réellement', () => {
  it('expose une version lisible : sans elle, la sentinelle ne garde rien', () => {
    expect(versionReactEmbarque(), 'React embarqué introuvable ou sans `version`').toMatch(
      /^\d+\.\d+\./,
    );
  });

  it(`reste sur la majeure ${MAJEURE_ARBITREE}, la seule arbitrée`, () => {
    const version = versionReactEmbarque();
    const majeure = Number(version.split('.')[0]);
    expect(
      majeure,
      `React embarqué par Next est en ${version} — majeure ${majeure}, arbitrée ${MAJEURE_ARBITREE}. `
        + 'Une montée de Next a changé le React exécuté en production. Consigner la décision AVANT '
        + 'de toucher cette constante : ni package.json, ni tsc, ni les bancs unitaires ne le voient.',
    ).toBe(MAJEURE_ARBITREE);
  });

  it('diverge de `react` de node_modules — et c’est le fait à ne pas oublier', () => {
    const embarque = versionReactEmbarque();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const declare = (require('react/package.json') as { version: string }).version;
    expect(
      embarque,
      'les deux coïncident : vérifier que l’aliasing de Next n’a pas changé de forme, '
        + 'auquel cas ce banc ne garde plus ce qu’il croit garder',
    ).not.toBe(declare);
  });
});
