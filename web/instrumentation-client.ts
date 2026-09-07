import * as Sentry from '@sentry/nextjs';
import { clientDeploymentEnvLabel, clientReleaseSha } from './src/lib/observability/deploymentEnv';
import {
  nettoyerEvenement,
  nettoyerSpan,
  nettoyerTransaction,
} from './src/lib/observability/sentryNettoyage';
import { dsnRegionUe } from './src/lib/observability/sentryRegion';

// CE FICHIER REMPLACE `sentry.client.config.ts`, ET CE N'EST PAS COSMÉTIQUE.
// `@sentry/nextjs` 10 le dit lui-même à la compilation
// (`build/cjs/config/webpack.js:212`) : l'ancien nom est déprécié et
// **cessera de fonctionner sous Turbopack**. Le déplacer maintenant coûte un
// `git mv` ; le découvrir au premier build Turbopack coûterait une
// observabilité client muette, sans erreur.
//
// `Sentry.init` sans `dsn` n'émet rien : tant que `NEXT_PUBLIC_SENTRY_DSN`
// n'est pas posé, ce fichier est inerte. C'est la variable qui active la
// transmission, pas ce commit.

Sentry.init({
  // Second verrou, redondant avec `instrumentation.ts` et délibéré : ce
  // fichier peut être chargé autrement demain, la promesse ne doit pas en
  // dépendre.
  dsn: dsnRegionUe(process.env.NEXT_PUBLIC_SENTRY_DSN) ?? undefined,
  environment: clientDeploymentEnvLabel(),
  release: clientReleaseSha(),
  sendDefaultPii: false,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  // Le rejeu de session filmerait l'écran du patient — questionnaires,
  // anamnèse, résultats. Les deux taux restent à zéro, et ce n'est pas un
  // réglage par défaut qu'on aurait oublié de relever.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: nettoyerEvenement,
  beforeSendTransaction: nettoyerTransaction,
  beforeSendSpan: nettoyerSpan,
  beforeBreadcrumb(fil) {
    // Deuxième barrière, en amont de `beforeSend` : un fil `console` du
    // navigateur n'entre même pas dans l'événement.
    return fil.category === 'console' ? null : fil;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
