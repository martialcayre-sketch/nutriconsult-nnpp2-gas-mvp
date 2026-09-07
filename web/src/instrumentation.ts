import { logger } from '@/lib/observability/logger';
import { EVENT_CODES } from '@/lib/observability/eventCodes';
import { deploymentEnv, releaseSha } from '@/lib/observability/deploymentEnv';

export async function register(): Promise<void> {
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

    // Poser un handler `uncaughtException` DÉSARME la sortie de Node : sans le
    // `process.exit` ci-dessous, le processus survivrait à une exception fatale
    // dans un état indéfini, et le conteneur continuerait de servir au lieu de
    // redémarrer. La sortie est donc la raison d'être de ce handler, pas un
    // accessoire de la trace.
    //
    // Elle est différée d'un tour de boucle À DESSEIN : `logger.fatal` écrit par
    // `console.log`, asynchrone quand stdout est un tube — le cas en conteneur.
    // Sortir dans le même tick tronquerait la trace qu'on vient d'écrire.
    setImmediate(() => process.exit(1));
  });
}
