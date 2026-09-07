import { logger } from '@/lib/observability/logger';
import { EVENT_CODES } from '@/lib/observability/eventCodes';
import { deploymentEnv, releaseSha } from '@/lib/observability/deploymentEnv';

export async function register(): Promise<void> {
  // LES HANDLERS DE PROCESS SONT RÉSERVÉS AU RUNTIME NODE. Ce dépôt a un
  // `middleware.ts` (`matcher: '/patient/:path*'`), donc un compilateur edge.
  // Dans le bac à sable edge, TOUTE fonction de `process` jette
  // (`next/dist/server/web/sandbox/context.js`, `throwUnsupportedAPIError`), et
  // l'erreur de `register()` y est RELANCÉE (`web/globals.js`) : le middleware
  // casserait au chargement, et la redirection legacy `/patient/*` avec lui.
  //
  // Inerte sous Next 14, où l'instrumentation n'est pas compilée du tout. La
  // garde est posée AVANT la marche en 15, pas après, parce qu'après il serait
  // trop tard pour l'apprendre autrement qu'en production.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const context = {
    environment: deploymentEnv(),
    release: releaseSha(),
    runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
  };

  // Capture des erreurs Node non interceptées au niveau process.
  process.on('unhandledRejection', reason => {
    logger.error({
      event: EVENT_CODES.SYSTEM_UNHANDLED_ERROR,
      domain: 'SYSTEM',
      message: 'Unhandled promise rejection',
      context,
      error: reason,
    });
  });

  process.on('uncaughtException', error => {
    logger.fatal({
      event: EVENT_CODES.SYSTEM_UNHANDLED_ERROR,
      domain: 'SYSTEM',
      message: 'Uncaught exception',
      context,
      error,
      metadata: { retryable: false },
    });

    // LA SORTIE EST LA RAISON D'ÊTRE DE CE HANDLER, pas un accessoire de la
    // trace — et elle corrige un état qui existe DÉJÀ, sans nous.
    //
    // `next start` pose ses propres écouteurs (`next/dist/server/lib/
    // start-server.js`) : `process.on('uncaughtException', exception)` et
    // `process.on('unhandledRejection', exception)`, où `exception` se réduit à
    // `console.error(err)` sous le commentaire « we keep the process alive ».
    // La sortie de Node est donc désarmée en production aujourd'hui, par Next
    // lui-même, et le conteneur continue de servir dans un état indéfini.
    //
    // Node exécute TOUS les écouteurs enregistrés : le `process.exit` ci-dessous
    // tranche, quel que soit l'ordre d'enregistrement. C'est ce qui rend au
    // conteneur son redémarrage.
    //
    // Elle est différée d'un tour de boucle À DESSEIN : `logger.fatal` écrit par
    // `console.log`, asynchrone quand stdout est un tube — le cas en conteneur.
    // Sortir dans le même tick tronquerait la trace qu'on vient d'écrire.
    setImmediate(() => process.exit(1));
  });
}
