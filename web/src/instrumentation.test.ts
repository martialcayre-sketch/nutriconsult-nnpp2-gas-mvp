import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fatal = vi.fn();
const erreur = vi.fn();

vi.mock('@/lib/observability/logger', () => ({
  logger: {
    fatal: (payload: unknown) => fatal(payload),
    error: (payload: unknown) => erreur(payload),
  },
}));

// Les deux configurations Sentry sont moquées : les importer pour de vrai
// lancerait `Sentry.init` dans le worker Vitest. Ce qu'on veut prouver n'est
// pas ce que fait Sentry, c'est QUE le fichier est atteint — il ne l'était par
// personne avant ce câblage.
const initServeur = vi.fn();
const initEdge = vi.fn();
vi.mock('../sentry.server.config', () => {
  initServeur();
  return {};
});
vi.mock('../sentry.edge.config', () => {
  initEdge();
  return {};
});

import { register } from './instrumentation';

/**
 * Capture les handlers que `register()` pose sur le process, sans les poser
 * réellement : un `process.on('uncaughtException')` laissé en place ferait
 * survivre le worker Vitest à ses propres erreurs.
 */
function capterHandlers(): Map<string, (arg: unknown) => void> {
  const handlers = new Map<string, (arg: unknown) => void>();
  vi.spyOn(process, 'on').mockImplementation(((evenement: string, handler: never) => {
    handlers.set(evenement, handler as unknown as (arg: unknown) => void);
    return process;
  }) as never);
  return handlers;
}

const tourDeBoucle = () => new Promise<void>(resoudre => setImmediate(resoudre));

describe('instrumentation — une exception fatale doit rendre la main à Node', () => {
  const runtimeInitial = process.env.NEXT_RUNTIME;
  const dsnInitial = process.env.SENTRY_DSN;

  beforeEach(() => {
    fatal.mockClear();
    erreur.mockClear();
    // Les cas ci-dessous portent sur le runtime Node : on le pose explicitement
    // plutôt que d'hériter de la machine (Vitest laisse NEXT_RUNTIME absent).
    process.env.NEXT_RUNTIME = 'nodejs';
    initServeur.mockClear();
    initEdge.mockClear();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (runtimeInitial === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = runtimeInitial;
    if (dsnInitial === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = dsnInitial;
  });

  it('journalise puis sort en 1 — sans la sortie, le conteneur servirait un état indéfini', async () => {
    const handlers = capterHandlers();
    await register();

    const surException = handlers.get('uncaughtException');
    expect(surException, 'aucun handler uncaughtException posé').toBeDefined();

    const sortie = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    surException!(new Error('boum'));

    expect(fatal).toHaveBeenCalledTimes(1);

    // La sortie ne doit PAS tomber dans le même tick : `logger.fatal` écrit par
    // `console.log`, asynchrone sur un tube, et la trace partirait tronquée.
    expect(sortie, 'sortie dans le même tick : la trace fatale serait tronquée').not.toHaveBeenCalled();

    await tourDeBoucle();
    expect(sortie).toHaveBeenCalledWith(1);
  });

  it('un rejet de promesse non géré est journalisé, et ne fait PAS sortir', async () => {
    const handlers = capterHandlers();
    await register();

    const surRejet = handlers.get('unhandledRejection');
    expect(surRejet).toBeDefined();

    const sortie = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    surRejet!(new Error('promesse'));

    expect(erreur).toHaveBeenCalledTimes(1);
    await tourDeBoucle();
    expect(sortie, 'le rejet non géré ne sort pas — décision distincte, non prise').not.toHaveBeenCalled();
  });

  it.each(['edge', 'unknown'])(
    'ne pose AUCUN handler hors runtime Node (%s) — sinon le middleware casse au chargement',
    async runtime => {
      process.env.NEXT_RUNTIME = runtime;
      const handlers = capterHandlers();

      await register();

      // Dans le bac à sable edge, `process.on` JETTE et l'erreur de `register()`
      // est relancée par Next : un seul handler posé et la redirection
      // `/patient/*` tombe. Le contrat est donc « rien du tout », pas « rien de
      // grave ».
      expect(handlers.size, `handlers posés en runtime « ${runtime} » : ${[...handlers.keys()].join(', ')}`).toBe(0);
      expect(fatal).not.toHaveBeenCalled();
      expect(erreur).not.toHaveBeenCalled();
    },
  );

  // ── Sentry : le câblage qui manquait ────────────────────────────────────

  it("n'initialise RIEN sans SENTRY_DSN — la variable est ce qui autorise la transmission", async () => {
    capterHandlers();
    await register();

    expect(initServeur, 'la configuration serveur a été chargée sans DSN').not.toHaveBeenCalled();
    expect(initEdge).not.toHaveBeenCalled();
  });

  it("REFUSE un DSN hors région UE — le document promet l'Union européenne", async () => {
    // Le patient lit « Sentry — Union européenne » dans le document
    // d'information. Cette phrase n'est pas une déclaration d'intention : elle
    // est vraie parce que ce chemin-ci refuse.
    process.env.SENTRY_DSN = 'https://cle@o4507.ingest.us.sentry.io/1';
    capterHandlers();

    await register();

    expect(initServeur, 'un DSN américain a initialisé Sentry').not.toHaveBeenCalled();
    // Et le refus est DIT, sinon il serait indistinguable d'un DSN absent.
    expect(erreur).toHaveBeenCalledTimes(1);
  });

  it('charge la configuration SERVEUR en runtime Node quand le DSN est posé', async () => {
    process.env.SENTRY_DSN = 'https://cle@o4507.ingest.de.sentry.io/1';
    const handlers = capterHandlers();

    await register();

    expect(initServeur).toHaveBeenCalledTimes(1);
    expect(initEdge).not.toHaveBeenCalled();
    // Le câblage Sentry ne doit pas avoir désarmé les handlers de process :
    // c'est la régression qu'un `return` mal placé produirait.
    expect(handlers.get('uncaughtException')).toBeDefined();
    expect(handlers.get('unhandledRejection')).toBeDefined();
  });

  it("charge la configuration EDGE en runtime edge, et n'y pose toujours aucun handler", async () => {
    process.env.NEXT_RUNTIME = 'edge';
    process.env.SENTRY_DSN = 'https://cle@o4507.ingest.de.sentry.io/1';
    const handlers = capterHandlers();

    await register();

    expect(initEdge).toHaveBeenCalledTimes(1);
    expect(initServeur, 'la configuration serveur n\'a rien à faire en edge').not.toHaveBeenCalled();
    // Le contrat du bac à sable edge tient malgré la branche neuve.
    expect(handlers.size, `handlers posés en edge : ${[...handlers.keys()].join(', ')}`).toBe(0);
  });
});
