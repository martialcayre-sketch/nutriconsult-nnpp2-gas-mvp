import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CE BANC REMPLACE `sentryConfig.test.ts`, QUI LISAIT CES FICHIERS COMME DU
// TEXTE et y cherchait la sous-chaîne `split('?')[0]`. Il était vert sur des
// fichiers que personne ne chargeait, et serait resté vert sur un masquage
// faux ou sur un crochet débranché.
//
// Ici, `@sentry/nextjs` est moqué : on récupère les options RÉELLEMENT passées
// à `Sentry.init`, puis on FAIT TOURNER les crochets qu'elles portent.

const init = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  init: (options: unknown) => init(options),
  captureRouterTransitionStart: vi.fn(),
  captureRequestError: vi.fn(),
}));

const ID_PATIENT = 'cmf3k2p9x0000zz8h7q2v1abc';
const JETON = 'aG9yc2xhX3VuX2pldG9uX2RlX2xpZW5fbWFnaXF1ZQ';

type Options = {
  dsn?: string;
  sendDefaultPii?: boolean;
  replaysSessionSampleRate?: number;
  replaysOnErrorSampleRate?: number;
  beforeSend?: (e: unknown) => unknown;
  beforeSendTransaction?: (e: unknown) => unknown;
  beforeSendSpan?: (s: unknown) => unknown;
};

const CONFIGURATIONS = [
  { nom: 'serveur', chemin: '../../../sentry.server.config', variable: 'SENTRY_DSN' },
  { nom: 'edge', chemin: '../../../sentry.edge.config', variable: 'SENTRY_DSN' },
  { nom: 'client', chemin: '../../../instrumentation-client', variable: 'NEXT_PUBLIC_SENTRY_DSN' },
] as const;

async function chargerOptions(chemin: string, variable: string): Promise<Options> {
  process.env[variable] = 'https://cle@o4507.ingest.de.sentry.io/1';
  vi.resetModules();
  init.mockClear();
  await import(chemin);
  expect(init, `${chemin} n'a pas appelé Sentry.init`).toHaveBeenCalledTimes(1);
  return init.mock.calls[0][0] as Options;
}

describe.each(CONFIGURATIONS)('configuration $nom', ({ chemin, variable }) => {
  const initial = process.env[variable];
  afterEach(() => {
    if (initial === undefined) delete process.env[variable];
    else process.env[variable] = initial;
  });

  it('lit son DSN dans la variable attendue', async () => {
    const options = await chargerOptions(chemin, variable);
    expect(options.dsn).toBe('https://cle@o4507.ingest.de.sentry.io/1');
  });

  it("n'envoie pas les données personnelles par défaut", async () => {
    const options = await chargerOptions(chemin, variable);
    expect(options.sendDefaultPii).toBe(false);
  });

  it('LES TROIS CROCHETS DE NETTOYAGE SONT BRANCHÉS, et ils masquent', async () => {
    const options = await chargerOptions(chemin, variable);

    // `beforeSend` — les erreurs.
    const erreur = options.beforeSend?.({
      request: { url: `https://app.wellneuro.fr/portail/lien/${JETON}?email=a@b.c` },
    }) as { request?: { url?: string } };
    expect(erreur?.request?.url).toBe('https://app.wellneuro.fr/portail/lien/:jeton');

    // `beforeSendTransaction` — le régime NORMAL, que `beforeSend` ne voit pas.
    const transaction = options.beforeSendTransaction?.({
      transaction: `GET /portail/${ID_PATIENT}`,
    }) as { transaction?: string };
    expect(
      transaction?.transaction,
      'beforeSendTransaction absent ou inopérant : une requête sur dix partirait avec sa route en clair',
    ).toBe('GET /portail/:idPatient');

    // `beforeSendSpan` — les attributs de span.
    const span = options.beforeSendSpan?.({
      data: { 'http.url': `/dashboard/patients/${ID_PATIENT}` },
    }) as { data?: Record<string, unknown> };
    expect(span?.data?.['http.url']).toBe('/dashboard/patients/:idPatient');
  });
});

describe('configuration client — le rejeu de session', () => {
  const initial = process.env.NEXT_PUBLIC_SENTRY_DSN;
  afterEach(() => {
    if (initial === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = initial;
  });

  it('reste à ZÉRO sur les deux taux — il filmerait l\'écran du patient', async () => {
    const options = await chargerOptions('../../../instrumentation-client', 'NEXT_PUBLIC_SENTRY_DSN');
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
  });
});
