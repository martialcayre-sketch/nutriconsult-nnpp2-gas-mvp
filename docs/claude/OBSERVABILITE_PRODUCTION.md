# Observabilité Production WellNeuro

## Objectif

WellNeuro utilise une journalisation JSON structurée vers stdout/stderr, relue par `scalingo --app wellneuro logs` (hébergement HDS, depuis le cutover du 2026-08-22).
Aucun fichier .log local ou production ne doit être utilisé.

## Niveaux

- DEBUG: diagnostic local uniquement.
- INFO: opération nominale utile.
- WARN: anomalie récupérable.
- ERROR: opération échouée.
- FATAL: indisponibilité majeure.
- SECURITY: événement sécurité.
- AUDIT: événement métier notable.

## Domaines

- AUTH
- PORTAIL_PATIENT
- PRATICIEN
- QUESTIONNAIRE
- ASSIGNATION
- CONSULTATION
- SCORING
- SYNTHESE_IA
- BOOKLET
- EMAIL
- DATABASE
- SECURITY
- SYSTEM

## Format minimal d événement

Chaque événement doit inclure:

- timestamp
- level
- event
- domain
- message
- environment
- release
- runtime
- route
- method
- requestId
- correlationId
- statusCode
- durationMs

## Données interdites en logs

Ne jamais journaliser:

- nom/prénom patient
- email en clair
- téléphone
- date de naissance
- token portail
- cookies
- token NextAuth
- réponses questionnaires
- anamnèse
- résultats biologiques
- contenu de synthèse
- prompt clinique
- URL complète avec query sensible

## Politique d anonymisation

- deny-by-default pour les objets inconnus.
- masquage des clés sensibles.
- suppression des query params dans les URLs.
- sérialisation des erreurs via type/code/message uniquement.

## Corrélation

Chaque réponse API instrumentée doit inclure:

- X-WellNeuro-Correlation-Id

Le correlationId permet de retrouver la séquence complète d un incident dans les logs Scalingo.

## Runbook logs

1. Filtrer par route et status HTTP.
2. Filtrer par level ERROR/FATAL/SECURITY.
3. Rechercher correlationId ou requestId.
4. Isoler event codes récurrents.
5. Vérifier release et branche.
6. Confirmer absence de données sensibles dans les lignes concernées.
7. Documenter l action corrective.

## Nomenclature d incident

- P1: FATAL/SYSTEM indisponibilité production.
- P2: erreurs répétées route critique.
- P3: anomalie fonctionnelle isolée.
- P4: bruit de logs ou dette d instrumentation.

## Sentry — CÂBLÉ le 2026-09-07, et inerte tant que le DSN n'est pas posé

`D-141`. Le câblage qui manquait est en place : `withSentryConfig` dans
`web/next.config.mjs`, initialisation par runtime depuis `register()` de
`web/src/instrumentation.ts`, `onRequestError` exporté (sans lui, une erreur de
composant serveur n'atteint jamais Sentry), et `Sentry.captureException` dans
`web/src/app/global-error.tsx` — c'est cette dernière ligne qui ferme le maillon
manquant décrit ci-dessous.

**Rien ne part tant que `SENTRY_DSN` (serveur, edge) et
`NEXT_PUBLIC_SENTRY_DSN` (client) ne sont pas posés dans l'environnement
Scalingo**, et la condition est écrite dans `instrumentation.ts`, pas seulement
héritée du SDK : sur une application de santé, ce qui déclenche un envoi vers un
tiers se lit dans le dépôt.

Ce que le câblage a coûté de corriger, et qu'il ne faut pas défaire :

- le `beforeSend` recopié dans les trois runtimes coupait la query string et
  **gardait le chemin** — or `/portail/lien/<jeton>` est le lien magique
  lui-même. `masquageChemin.ts` réduit tout chemin à un gabarit par liste
  d'autorisation, et `masquageChemin.routes.test.ts` parcourt `web/src/app` pour
  rougir dès qu'une route nouvelle n'y figure pas ;
- `beforeSend` ne voit que les ERREURS. `beforeSendTransaction` et
  `beforeSendSpan` sont posés parce qu'à `tracesSampleRate` 0,1 une requête sur
  dix produit une transaction en régime normal, route comprise ;
- les fils d'Ariane `console` sont supprimés et les fils `ui.*` perdent leur
  message : le sélecteur DOM porte des `aria-label` écrits pour être lus par un
  patient ;
- pas de Session Replay — les deux taux sont à zéro, délibérément : il filmerait
  l'écran du patient ;
- les cartes de source ne partent que si les trois variables `SENTRY_*` du build
  sont posées, et sont supprimées après envoi.

**Reste dû au responsable de traitement** : poser les DSN, déclarer Sentry aux
personnes (`docs/DOSSIER_RGPD.md:194` — la liste des prestataires de
`donnees_confidentialite` ne le cite pas), signer le DPA et vérifier la
résidence UE (`docs/DOSSIER_RGPD.md:614`, échéance 2026-10-21).

## Surveillance de disponibilité

Deux alertes Scalingo sont armées sur `wellneuro`, type `web` :

- `memory` ≥ 0.85 pendant 5 min (rappel 30 min) — posée après l'incident
  mémoire du 2026-08-31 ;
- `p95_response_time` ≥ 5000 pendant 5 min (rappel 30 min) — c'est celle qui
  aurait signalé cet incident avant le 504. Vérifier l'unité affichée dans
  l'interface : le seuil a été posé en supposant des millisecondes.

**Elles sont internes, et c'est leur limite** : si l'hébergeur devient
indisponible, ses alertes le deviennent avec lui, et aucun écran applicatif ne
peut s'afficher — la page servie est alors celle du routeur. Une sonde externe
et une page d'état hébergées ailleurs restent à créer ; l'adresse de cette page
devra figurer dans l'e-mail du lien magique, sans quoi personne ne saura qu'elle
existe au moment où elle servirait.
