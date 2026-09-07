import * as Sentry from '@sentry/nextjs';
import { deploymentEnvLabel, releaseSha } from './src/lib/observability/deploymentEnv';
import {
  nettoyerEvenement,
  nettoyerSpan,
  nettoyerTransaction,
} from './src/lib/observability/sentryNettoyage';

// Chargé depuis `register()` de `src/instrumentation.ts`, et SEULEMENT si
// `SENTRY_DSN` est posé — c'est la convention de `@sentry/nextjs` 10 sous Next
// 15, et le fichier n'était jusqu'ici importé par personne.
//
// `beforeSend` était recopié à l'identique dans les trois runtimes et ne
// masquait pas le chemin d'URL. Il vit désormais dans
// `src/lib/observability/sentryNettoyage.ts`, où il est éprouvé sur de vrais
// objets d'événement plutôt que lu comme du texte.

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: deploymentEnvLabel(),
  release: releaseSha(),
  sendDefaultPii: false,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  beforeSend: nettoyerEvenement,
  // `beforeSend` ne voit QUE les erreurs. À 0,1, une requête sur dix produit
  // une transaction en régime NORMAL, portant la route et l'URL : sans ces deux
  // crochets, le nettoyage ne couvrirait que le régime d'incident.
  beforeSendTransaction: nettoyerTransaction,
  beforeSendSpan: nettoyerSpan,
});
