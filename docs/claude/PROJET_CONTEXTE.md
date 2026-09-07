# Contexte projet — Wellneuro NNPP2

> Rédigé le 2026-07-03, après la fin de la migration GAS → Next.js. Ce fichier remplace les anciens documents de suivi de migration (`PROJET_CONTEXTE.md` historique, `ETAT_MIGRATION_*.md`) : il décrit l'état courant, pas un historique de lots.

## Ce qu'est Wellneuro NNPP2

Application de consultation en neuronutrition clinique, à deux portails :
- **Portail praticien** (`/dashboard/*`) : gestion patients, assignation de questionnaires, packs, génération de synthèse IA, envoi de booklets.
- **Portail patient permanent** (`/portail/[token]`) : espace patient unifié, accès par cookie signé `wn_portail`, posé à l'atterrissage par le lien magique à usage unique ou par Google, onboarding (consentement, fiche signalétique, anamnèse) puis hub « Mes questionnaires ». **Flux patient principal.**
- **Flux patient legacy** (`/patient/[idAssignation]`) : **retiré le 2026-08-08** (dette 5). Il n'en reste qu'une redirection 307 vers `/portail/connexion`, pour les liens e-mail déjà partis chez des patients.

Production : `https://app.wellneuro.fr` (Scalingo `osc-fr1`, app
`wellneuro`, HDS — cutover le 2026-08-22 ; Vercel/Supabase décommissionnés le
2026-09-01, `D-080`/`D-120`).

## Stack technique

| Couche | Techno |
|---|---|
| Framework web | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Auth praticien | NextAuth 4, provider Google, restreint au domaine `@wellneuro.fr` |
| Base de données | PostgreSQL (add-on Scalingo `postgresql-business-512`, HDS), via Prisma 7 + Driver Adapter (`@prisma/adapter-pg`) |
| IA clinique | Anthropic SDK (`ANTHROPIC_API_KEY`), prompt caching activé — voir `docs/claude/PROMPT_CACHING.md` |
| Email | Nodemailer / SMTP (`SMTP_URL`) |
| Hébergement | Scalingo `osc-fr1` (Procfile `web/Procfile`, 2 conteneurs web M, migrations par `release-db` approuvé — `D-087`) |

## Arborescence utile

- `web/src/app/dashboard/*` — pages praticien (patients, synthèse, métriques)
- `web/src/app/portail/[token]` — portail patient permanent (onboarding + hub « Mes questionnaires » + pages autonomes par questionnaire)
- `web/src/app/api/praticien/*` — routes serveur praticien (patients, assignations, questionnaires, reponses, synthèse, booklet, metrics, packs, consultations, token)
- `web/src/app/api/portail/*` — routes serveur portail patient (session, consentement, fiche, assignations, valider)
- `web/src/app/api/patient/*` — back-end **vivant** du portail (questionnaire, submit, assignations, consentement, reponses) ; session `wn_portail` obligatoire, le repli e-mail est retiré. Seul le parcours de PAGE `patient/*` a disparu le 2026-08-08.
- `web/src/lib/questions.ts` — catalogue des questionnaires (65, portés depuis `Questions.gs`) et moteur de scoring
- `web/src/lib/auth.ts` — configuration NextAuth
- `web/src/lib/prisma.ts` — client Prisma
- `web/prisma/schema.prisma` — schéma de données (40 modèles au 2026-07-21 ; `grep -c '^model ' web/prisma/schema.prisma` pour un compte à jour plutôt qu'une énumération qui périme à chaque migration)
- `archive/gas-legacy/` — ancien code Google Apps Script (`Code.gs`, `Questions.gs`, `index.html`, `appsscript.json`), gelé, référence historique uniquement

## État de la migration

La migration depuis le MVP Google Apps Script + Google Sheets a été menée en stratégie *strangler pattern* du 2026-06-29 au 2026-07-03 (lots 0, C2, C3, C4, C5). Le lot C5 (2026-07-03) a :
- exécuté la migration historique des données Sheets → Supabase en production ;
- supprimé le déclencheur `sendReminders` côté Apps Script ;
- retiré le déploiement web Apps Script ;
- archivé `src/gas/` dans `archive/gas-legacy/` (commit `2269f91`), puis supprimé les artefacts clasp restants (commit `198f80b`).

`app.wellneuro.fr` (Next.js) est désormais l'unique point d'entrée applicatif. Le MVP GAS est hors service.

## Google Sheets : décommission terminée (2026-07-07)

La dépendance à l'API Google Sheets a été **entièrement retirée du runtime** (au-delà du seul déploiement Apps Script arrêté au lot C5). État vérifié :

- Aucune route ne référence plus `sheets.googleapis.com`, `SHEET_ID`, `spreadsheets` ni `googleapis` dans `web/src/**`. Les routes praticien (`metrics`, `patients`, `assignations`, `questionnaires`, `reponses`, `packs`…) lisent/écrivent **exclusivement PostgreSQL via Prisma**.
- Le scope OAuth NextAuth se limite à `openid email profile` (`web/src/lib/auth.ts`). Le scope `spreadsheets` a été retiré.
- La route `api/praticien/migrate-historique` a été **supprimée** (n'existe plus sur le disque).
- `SHEET_ID` n'est **plus** une variable d'environnement requise (elle reste seulement dans les garde-fous anti-fuite de `scripts/check_no_secrets.sh` et les listes d'hygiène « ne jamais committer »).
- Le code GAS reste archivé dans `archive/gas-legacy/` à titre de référence.

## Portail patient permanent (état actuel)

- Le segment de `/portail/[token]` est l'**`idPatient`**, pas un secret
  (`portail/lien/[jeton]/route.ts:168`). Les colonnes de valeur du jeton
  (`access_token`, `access_token_created_at`) ont été purgées le 2026-08-22
  (`D-085` §5) ; seul subsiste le drapeau `accessTokenRevoked`.
- Unique credential : le cookie signé `wn_portail`, posé par deux portes — le
  **lien magique** à usage unique (empreinte HMAC seule en base) et **Google
  patient**. Pas d'e-mail en URL, pas de ressaisie.
- Onboarding : consentement groupé tracé → fiche signalétique → anamnèse resserrée (repères, motif & attentes, histoire, signaux d'alerte, antécédents, traitements/compléments).
- Hub **« Mes questionnaires »** : navigation libre entre questionnaires, pages autonomes, brouillon local (avec reset limité au non-transmis), transmission au praticien puis verrouillage.
- Consultation permanente des réponses verrouillées + **demande de correction enrichie** (commentaire patient), déverrouillage manuel côté praticien.
- Le modèle **`Consultation`** (historisable) porte consentement / fiche / anamnèse / motif ; le pack **« Base de consultation »** est marqué `par_defaut`.

## Registre relationnel questionnaires / packs

Deux couches coexistent, en transition maîtrisée (lot R3, livré le 2026-07-10, commit `3f367a7`) :
1. Modèle historique simple `Pack.qids` — reste la source d'édition praticien (`PacksPanel.tsx`).
2. Registre normalisé : `questionnaire_categories`, `questionnaires`, `questionnaire_secondary_categories`, `questionnaire_packs`, `pack_questionnaires`, `pack_triggers`.

Les routes d'assignation (`portail/valider`, `praticien/packs/assign`) lisent désormais en priorité le registre via `resolvePackQuestionnaireIds` (`web/src/lib/consultation/packRegistry.ts`), qui ne fait confiance au registre que si son ensemble de qids correspond exactement au `qids` legacy du pack — sinon fallback automatique sur `packs.qids`. Cohérence vérifiable via `npm run check:pack-registry`. Aucun calendrier de décommission de `packs.qids` à ce stade (statut « surveillance », tranché en R10).

## Synthèse IA enrichie (fiche + anamnèse)

La synthèse IA du premier bilan est nourrie, en plus des scores de questionnaires, par la fiche signalétique et l'anamnèse (module déterministe `web/src/lib/consultation/contexteClinique.ts`). Les **vigilances déterministes** (signaux d'alerte, traitements, automédication, compléments) sont extraites puis fusionnées en tête des points de vigilance — garanties même si le LLM les omet. La couche IA traduit, ne décide jamais (garde-fous conservés).

## Architecture clinique cible 3.2

La réconciliation WN Ultimate v2 du 2026-07-13 fixe une cible progressive :
C1 prépare épisode/snapshot/décision/protocole brouillon ; C2 possède la
persistance, l'activation et le longitudinal ; JA possède le journal
alimentaire ; C5A les profils intrinsèques et C5B leur lecture contextuelle.
Les paramètres cliniques non sourcés restent bloqués. Voir
`docs/claude/ARCHITECTURE_CLINIQUE_3_2.md` et
`docs/claude/REGISTRE_FRONTIERES.md`.

## Sécurité, RGPD, clinique — invariants

- Patients fictifs autorisés dans le dépôt : **Sophie Nicola, Jennifer Martin, Michel Dogné**. Aucun autre nom, aucune donnée patient réelle.
- Secrets et configuration sensible (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `SMTP_URL`) uniquement via variables d'environnement (`web/.env.local` en dev, variables Scalingo en prod) — jamais en dur, jamais commitées. `SHEET_ID` n'est plus requis (décommission Sheets, voir plus haut).
- Ne pas modifier la logique clinique ou les seuils de scoring sans demande explicite documentée dans `CHANGELOG.md`.
- Vérification avant tout commit : `bash scripts/check_no_secrets.sh` et `cd web && npm run type-check`.
- Détail complet : `docs/securite_rgpd.md`, `docs/claude/REGLES_CRITIQUES.md`.

## Incidents et runbooks

- Incident 404 production / DNS / config Vercel (2026-07-01), résolu — configuration de référence du projet Vercel (`projectId`, `rootDirectory`, variables d'env prod) : `docs/claude/CONTEXTE_SESSION_VERCEL_2026-07-01.md`.

## État du dépôt : ce qui est généré, ce qui reste humain

`.wn/state.json` a longtemps été maintenu à la main, et a fini par mentir —
branche de worktree supprimée depuis des semaines, `dirty` figé, date de
validation vieille de deux semaines. Deux outils se partagent maintenant la
tâche, avec des rôles disjoints :

- **`node scripts/wn-etat-reel.mjs`** *rapporte*. Il observe six dimensions
  directement depuis leurs sources — flags `WN_*` référencés dans `web/src`
  (jamais une valeur d'environnement lue, donc jamais présentés comme
  « actifs »), noms de migrations sur disque (jamais une connexion à la base :
  cette lecture passe par un conteneur `scalingo run -d` — voir
  « Lire la base de production » dans `.claude/rules/db-prisma.md`), registre de certification
  (`docs/claude/corpus/instrument_registry.json`, 65 instruments — pas
  `source_registry.json`, qui est un registre disjoint de 507 sources
  bibliographiques du corpus clinique), PR ouvertes via `gh`, worktrees et
  branches, routes patient/portail présentes. **Il n'écrit jamais rien.**
  Il en **confronte trois** — et la distinction compte, elle est la dette 6 de
  la déclaration 5.0 : la vue `docs/claude/campagnes/ACTIVE_CAMPAIGN.md` contre
  `.wn/state.json` dont elle dérive, la cohérence des deux dates de l'état
  (`validation.last_checked_at` jamais postérieur à `updated_at`), et le lot
  courant de l'état contre le `lot_courant` de `CAMPAGNE.md` (campagne primaire
  seulement). Le verdict qui **bloque** n'est pas ce CLI — qui sort 0 même avec
  des écarts — mais `scripts/wn-coherence-etat.test.mjs`, joué par T1 et par le
  CI.
- **`node scripts/wn-cycle.mjs --appliquer`** *répare* trois choses, et
  seulement trois : `updated_at` de `.wn/state.json`, `recent_decision_ids`
  réalimenté depuis `docs/DECISIONS.md` quand ce registre rend des décisions, et
  `ACTIVE_CAMPAIGN.md` régénéré. Il ne
  touche plus `git.*` (ces champs ne se stockent plus depuis le 2026-08-07), ne
  touche **jamais** `active_lot` — l'aligner sur `CAMPAGNE.md` reste un geste
  humain (`wn-campaign.mjs activate <id> --lot LOT-xx`) —, et jamais
  `SESSION_LOG.md` ni un fragment de handoff, qui restent du raisonnement
  humain. **Il ne lève pas le garde des dates** : il pousse `updated_at`, donc
  éteindrait le signal sans qu'aucune validation ait été rejouée.

**Piège découvert en écrivant ce lot, à ne pas reproduire** : `wn-cycle.mjs`
traite explicitement `branche === 'main'` comme sa propre phase (`hors-lot`) —
il est conçu pour être rejoué **depuis `main`**. Le lancer en cours de lot,
depuis une branche de travail, écrit le nom de *cette* branche dans
`git.branch` ; une fois la PR squashée et la branche supprimée (doctrine de
merge), `.wn/state.json` pointe de nouveau une branche morte — exactement le
défaut qu'il vient de corriger, recréé par le geste même censé le réparer.
C'est très probablement l'origine du bug initial. La bonne séquence :
`--appliquer` se joue **après** le merge, depuis `main`, jamais en cours de
lot.

Ce qui reste humain, et que ces outils ne touchent pas : les arbitrages
cliniques, `next_action` (le texte libre, pas les champs structurés), et les
décisions de campagne (`docs/DECISIONS.md`).

### Ce qui est consommé, et par quoi — `docs/claude/MATRICE_CONSOMMATION.md`

L'ingestion du savoir est complète ; sa **consommation** ne l'est pas. Un
corpus validé à 100 %, mappé, testé, et qu'aucun écran n'appelle ne produit
aucun signal : rien n'est rouge, rien ne manque, et il ne sert à personne.

`node scripts/wn-matrice-consommation.mjs --markdown` régénère la matrice
« source de savoir → surface qui la consomme → décision produite → drapeaux →
verrou de donnée → visible du patient ». La colonne des surfaces est **dérivée
des imports**, jamais rédigée : une source sans appelant y apparaît avec une
surface vide — c'est l'information recherchée. Trois précautions y sont
lisibles, et ne doivent pas être perdues :

- **atteignable ≠ consommé** : une surface qui atteint la source *à travers* un
  relais est comptée séparément (`+ N indirecte(s)`). `corpusSyntheseV1`
  traverse `lib/anthropic.ts`, que seize surfaces importent ;
- **un drapeau référencé n'est pas un drapeau posé** — aucune valeur
  d'environnement n'est lue ici, même asymétrie que `wn-etat-reel.mjs` ;
- un **double verrou** (drapeau *et* condition de donnée) laisse une surface
  fermée même drapeau posé : c'est le cas de la table d'orientation
  (`WN_ENABLE_ORIENTATION_NNPP2` + `tableSignee()`).

Les arbitrages, eux, ne se dérivent pas : ils vivent dans
`docs/claude/corpus/consommation_decisions.json`, un verdict daté par source
dormante (`a_brancher`, `dormante`, `a_retirer`). Une source qui s'endort sans
décision fait rougir le banc en CI — la dette se voit le jour où elle naît.
État au 2026-08-05 : 19 sources, 6 dormantes, dont la **bibliothèque de
biologie fonctionnelle** — 987 actes NABM en base depuis le 2026-07-26 et
**aucun appelant hors de son propre répertoire**.

## Ce qui reste ouvert (hors périmètre sauf demande explicite)

- ~~R6 / R8 techniques~~ — **livrés** (R0→R10 clos, voir
  `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md`) ; ces deux puces sont restées ici
  périmées jusqu'au 2026-08-21.
- Calendrier de décommission de `packs.qids` : statut « surveillance », pas de date fixée (R10).
- Curation de `QuestionnaireDefinition.niveau` / `.publicCible` : statut « surveillance », pas d'usage applicatif à ce jour (R10).
- Pagination patients/assignations si le volume dépasse ~100 lignes.
- RAG SIIN complet (le prompt système utilise un mini-corpus non validé, pas
  le corpus plein). Le registre sanitaire des 391 notices n'est pas
  activable ; gates G0–G6 obligatoires.
- Génération PDF native (actuellement HTML + impression navigateur), signature électronique du booklet.
- Coaching patient autonome, SSO praticien multi-établissement.
- Séquencement : la roadmap de reprise **R0 → R10 est intégralement soldée** (`docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md`) — elle ne séquence plus rien, elle s'archive.

## Où regarder pour aller plus loin

- Règles de travail détaillées : `docs/claude/REGLES_CRITIQUES.md`, `docs/claude/WORKFLOW_DEVELOPPEMENT.md`
- Templates de prompts : `docs/claude/TEMPLATES_PROMPTS.md`
- Architecture technique système : `docs/ROADMAP_TECHNIQUE.md`
- Historique des chantiers et dette technique : `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md`
- Checklist de test manuel E2E : `docs/checklist_tests_end_to_end.md`
- Historique des changements fonctionnels : `CHANGELOG.md`
