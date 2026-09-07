import { describe, expect, it } from 'vitest';
import { dsnRegionUe } from './sentryRegion';

const UE = 'https://cle123@o4507.ingest.de.sentry.io/1234';
const US = 'https://cle123@o4507.ingest.us.sentry.io/1234';
const HISTORIQUE = 'https://cle123@o4507.ingest.sentry.io/1234';

describe('dsnRegionUe', () => {
  it('accepte la région européenne', () => {
    expect(dsnRegionUe(UE)).toBe(UE);
  });

  it('REFUSE la région américaine — le document promet l’Union européenne', () => {
    expect(dsnRegionUe(US)).toBeNull();
  });

  it("refuse l'hôte historique sans région, qui n'est pas européen", () => {
    expect(dsnRegionUe(HISTORIQUE)).toBeNull();
  });

  it('refuse ce qui est absent, vide ou illisible — fermé par défaut', () => {
    expect(dsnRegionUe(undefined)).toBeNull();
    expect(dsnRegionUe(null)).toBeNull();
    expect(dsnRegionUe('')).toBeNull();
    expect(dsnRegionUe('pas une url')).toBeNull();
  });

  it("ne se laisse pas berner par un hôte qui CONTIENT le suffixe sans le terminer", () => {
    // `…de.sentry.io.exemple.test` contient la chaîne mais n'est pas Sentry UE.
    expect(dsnRegionUe('https://cle@o1.ingest.de.sentry.io.exemple.test/1')).toBeNull();
  });
});
