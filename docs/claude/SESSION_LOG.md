# Journal de session — Wellneuro NNPP2

> **Archivage** : les entrées du 2026-07-04 au 2026-07-10 sont compactées dans `docs/archive/sessions/SESSION_LOG_2026-07-04_to_2026-07-10_compact.md`, celles du 2026-07-11 au 2026-07-14 dans `docs/archive/sessions/SESSION_LOG_2026-07-11_to_2026-07-14_compact.md`, et celles du 2026-07-14 au 2026-07-22 dans `docs/archive/sessions/SESSION_LOG_2026-07-14_to_2026-07-22_compact.md`. Le journal actif ne conserve que les entrées récentes utiles à la reprise.

## 2026-08-03 — LOT-02 partiel : rayons cognition/intestin branchés (PR #546)

**Décisions** : NB05/07 vérifiés 100 % VALIDE en base (`execute_sql` direct, pas
le doc d'inventaire de campagne qui porte sur un sous-ensemble différent) ;
ajoutés à `RAYON_VERS_NOTEBOOK` avec un appelant neuf (`dashboard/bibliotheque`,
route `/api/praticien/corpus/rayons`), flag `WN_RECHERCHE_CORPUS_ENABLED`
dédié plutôt que réutiliser `WN_C4_ENABLED`. Revue `wn-reviewer` a trouvé un
bloquant avant merge : une regex seule aurait laissé la route servir
n'importe quel rayon (micronutrition compris) en contournant le flag
compléments — corrigé par une allowlist testée. Couplage caché retiré au
passage : `servirRayonCorpus` forçait `WN_C4_ENABLED` pour tout rayon.

**Écarté** : notebook 06 (douleurs chroniques), non validé — même route déjà
générique, à étendre plus tard.

**Prochaine action** : brancher 06 une fois validé, ou LOT-01/05/06 de la
campagne moteur d'intervention.

**Questions ouvertes** : calibration `minSimilarity`/`matchCount` (réglés sur
un profil fiche-produit) non vérifiée pour une recherche en langage libre.

## 2026-08-03 — Repurposage de ROADMAP_TECHNIQUE.md en architecture technique système

**Décisions** : `docs/ROADMAP_TECHNIQUE.md` cesse d'être un suivi de chantiers (lots R0→R10, dette) pour devenir la cartographie d'architecture technique système (stack, routes, modèle de données, sous-systèmes `lib/`, auth, RAG, déploiement) — décision explicite de l'utilisateur, périmètre = toute l'application. L'ancien contenu est archivé intégralement dans le nouveau `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md` avant réécriture, rien n'est perdu.

**Écarté** : dupliquer le détail déjà couvert par `PROJET_CONTEXTE.md`, `ARCHITECTURE_CLINIQUE_3_2.md`, `RAG_PGVECTOR_PRODUCTION.md` — le nouveau doc résume et renvoie plutôt que de recopier.

**Livré** : réécriture complète + renvois mis à jour dans `CLAUDE.md`, `README.md`, `docs/PROJECT_STATE.md`, `docs/claude/README.md`, `docs/claude/PROJET_CONTEXTE.md`, `docs/ROADMAP_PRODUIT.md`. Aucun `npm run check` requis (documentaire), vérifié : `grep -c '^model '` (66), aucun lien mort, `grep ROADMAP_TECHNIQUE` cohérent.

**Prochaine action** : relire le diff, committer, ouvrir la PR.

**Questions ouvertes** : `vercel-build.sh` porte encore la logique `migrate deploy` inline en parallèle de `release-db.yml` — le « lot de bascule » qui doit l'alléger n'a pas eu lieu, documenté tel quel.

## 2026-08-03 — Rayon compléments alimentaires : contrat de corpus stabilisé

**Décisions** : clôture du lot de consolidation autour du contrat de corpus du rayon compléments alimentaires. L’UI praticien distingue désormais explicitement un corpus vide (état normal, « en cours de constitution ») d’un corpus indisponible ou bloqué par une garde métier, et affiche le message métier renvoyé par l’API. Le changement reste borné au périmètre C4 déjà existant : pas de migration, pas de changement clinique, pas de nouveau flux de données.

**Livré** : messages de corpus centralisés dans [web/src/lib/supplement-library/corpusMessages.ts](/Users/wellneuro/Wellneuro-app/Wellneuro-app.worktrees/wn-docs-setup/web/src/lib/supplement-library/corpusMessages.ts), réutilisés par [web/src/lib/supplement-library/rayonCorpus.ts](/Users/wellneuro/Wellneuro-app/Wellneuro-app.worktrees/wn-docs-setup/web/src/lib/supplement-library/rayonCorpus.ts) et consommés par [web/src/components/complements/FicheComplementPanel.tsx](/Users/wellneuro/Wellneuro-app/Wellneuro-app.worktrees/wn-docs-setup/web/src/components/complements/FicheComplementPanel.tsx). Une régression ciblée couvre le cas indisponible dans [web/src/components/complements/FicheComplementPanel.test.tsx](/Users/wellneuro/Wellneuro-app/Wellneuro-app.worktrees/wn-docs-setup/web/src/components/complements/FicheComplementPanel.test.tsx).

**Validations** : `cd web && npx vitest run src/components/complements/FicheComplementPanel.test.tsx src/lib/supplement-library/rayonCorpus.test.ts`, puis `cd web && npm run type-check && npm run lint`.

**Prochaine action** : préparer la clôture de campagne avec le handoff mis à jour et le statut de lot/campagne aligné.

## 2026-07-22 — Corpus 5.0 : banc qualité d'extraction (triple lecture croisée)

**Décisions** : reprise du chantier pgvector/corpus, phase 2 de la proposition
5.0 (banc qualité, préalable au pipeline d'ingestion). Banc construit dans
`tools/corpus/bench/` (worktree `corpus-bench-qualite`) : pour chaque page,
lecture **A** (pdftotext, vérité des nombres) + **B** (Claude Sonnet 5 vision) +
**C** (GPT-5.4 vision), invariants déterministes bloquants — dosages nombre+unité
de A devant survivre dans B et C, couverture caractères (bigrammes), comptage de
cellules. Clés API lues depuis `web/.env.local` (jamais committées), les 3 PDF
et sorties hors dépôt (`~/.wellneuro/corpus-bench/`).

**Résultat (85 pages)** : restitution des dosages **100 % B / 100 % C**, 0 perdu
des deux. Tokens entrée ~2011 (Claude) / ~1742 (GPT) par page — l'hypothèse
~2100 de la note de coûts tient. Projection 11 000 pages, batch −50 % : croisé
B+C **~76 $** (la note estimait ~107 $ ; recalage par tokens réels).

**Écarté** : traiter les « manques » comme des régressions — deux confusables
Unicode dans l'invariant lui-même, trouvés sur deux runs. Run 1 : ellipse ASCII
`...` absorbée dans un run numérique → dosage fantôme `2.5 mg`. Run 2 : mu grec
`μ` (U+03BC) des sorties Claude vs signe micro `µ` (U+00B5) de la couche texte →
9 faux manques sur un tableau µg (aucune troncature réelle, vérifié ligne à
ligne). Extracteur durci : ellipses neutralisées, nombres bien formés (milliers
FR `1 000`, décimales `2,5`), `μ→µ`. Re-scoré hors-ligne (`rescore.mjs`) à coût
API nul → 100 %/100 % confirmé sur les deux runs. Invariant qui n'a jamais bougé :
perdus des deux = 0. Les modèles vision sont non déterministes (formatage,
codepoints) : l'invariant doit être robuste aux confusables.

**Prochaine action** : pipeline `tools/corpus/` (extract/invariants/chunk/claims/
ingest) sur les notebooks prioritaires (09 Nutrition, 10 Micronutrition, 08
Biologie fonctionnelle — à confirmer) ; puis migration `rag_corpus_claims`.

**Questions ouvertes** : notebooks prioritaires à confirmer ; schéma
`rag_corpus_claims` à compiler ; champ `patient_identifiable` explicite ;
lancement avant 2026-08-31 (tarif intro Sonnet 5).

## 2026-07-22 — Corpus 5.0 : pipeline verbatim + pilote 09 ingéré (dev-local)

**Décisions** : chantier corpus repris en 3 phases (snapshot → pipeline → claims).
Découverte structurante : le « WELLNEURO_CORPUS_STUDIO » du Drive n'est pas jetable
— c'est le pipeline NotebookLM existant (specs SPEC_DECOUPAGE_RAG, 28+ markdown
candidats, preuves G1-G4). Ne rien supprimer, ne pas vider les notebooks.
Preuve à l'appui : l'ancien canonique NotebookLM de WN-SRC-0056 avait **retiré
les 103 dosages** (synthèse dose-strippée, statut réel EN_ATTENTE), là où la
route 2 IA les conserve tous. Les deux couches sont distinctes : la route 2 IA
produit le **verbatim fidèle** (couche manquante), l'ancien alimente les claims.

**Livré (tools/corpus/)** : `snapshot/` (391/391 appariés, 2 doublons contenu),
`lib/wellneuro-text` (réplique normalize, parité hash 3/3 vs serveur),
`extract/` (2 IA A/B/C + invariants), `chunk/` (conforme SPEC : unités de sens
350-800 mots, dose insécable), `ingest/` (`--validate` via vrai
parseRagIngestPayload + `devlocal.mjs` direct pgvector). Pilote 09 (6 sources,
163 pages, ~3 $) : extrait, 26 chunks conformes, **ingérés en base éphémère
pgvector, récupération 26/26**, recherche sémantique juste.

**Écarté** : supprimer le studio / vider les notebooks ; réutiliser les anciens
canoniques comme verbatim (dose-strippés) ; monter un next dev complet (npm
install absent du worktree) au profit d'un harnais direct pgvector répliquant le
SQL du store. Un « perdu des deux » sur WN-SRC-0053 = faux positif (collision de
colonnes de tableau dans pdftotext A ; B/C corrects ; portion alimentaire, pas un
dosage médicamenteux).

**Prochaine action** : Phase 3 — migration `rag_corpus_claims` (SQL brut, pattern
de 20260721090000, revue wn-reviewer avant / execute_sql après). Piste MP4 (14
vidéos, hors 09) à traiter séparément.

**Questions ouvertes** : schéma claims à valider avant migration ; ingestion prod
(acte gaté) ; passage à l'échelle des 88 sources de 09 en batch −50 %.

## 2026-07-22 — IDP2 : #226 vérifiée en prod, G5 constaté actif, précondition LOT-04 re-mesurée

**Décisions** : vérification post-merge de #226 (exception migration/auth) :
migration `20260722100000_idp2_g5_trace_connexions_google` appliquée en
1 tentative (11:39:27Z), table conforme (5 colonnes, pkey + 2 index, RLS
deny-all), requête inverse `_prisma_migrations` vide. Constat non anticipé :
**WN_G5_GOOGLE_PATIENT est actif en production** — 03d exécuté côté humain —
et la trace fonctionne (1 ligne `consomme`, PAT006, 15:04Z), preuve de bout
en bout. Précondition LOT-04 re-mesurée : **1/13** (PAT006 seul passé par
Google ou lien magique). Réconciliation `.wn/state.json`
(`last_completed_lot` → LOT-03f, next_action à jour).

**Écarté** : ouvrir LOT-04 (précondition non remplie, migration destructive) ;
toute écriture en base (lectures `execute_sql` seules).

**Prochaine action** : le praticien renvoie l'invitation aux 12 patients
restants, re-mesurer avant LOT-04 ; sinon suite SP-SPI LOT-01.

**Questions ouvertes** : date de rapprochement 13/13 ; backlog audit.

## 2026-07-22 — C3 LOT-06 : fil médecin V1 livré en deux PR, migration vérifiée en prod

**Décisions** : plan technique approuvé puis exécuté — #252 migration seule
(`correspondances_medecin`, FK RESTRICT, RLS deny-all, effacement nommément,
revue `wn-reviewer` GO, **vérifiée en prod** : 1 tentative, requête inverse
vide, 9 colonnes, 0 policy) ; #255 routes + onglet « Correspondance »
(consigneLe inantidatable, dossier clos = 409 deux sens, `@` refusé dans le
libellé, TRUST indicateur seul). Merges par l'assistant sur instruction
explicite. Vercel : rate limit Hobby → plan Pro pris ; reciblage de #255 après
merge de #252 — `verify` absent (filtre base main), débloqué par close/reopen.

**Écarté** : garde TRUST bloquante (le partage a lieu hors app) ; deux routes
séparées (mêmes gardes) ; exception « entrant » sur dossier clos (rouvrir →
transcrire → reclôturer).

**Prochaine action** : merger #255 dès `verify` vert, puis clôture
documentaire (spéc, campagne, state.json).

**Questions ouvertes** : désactivation des Previews (réglage dashboard, posé ?) ;
bascule C→A au constat d'usage ; visibilité patient du fil.

## 2026-07-22 — Corpus : couche claims (ingestion + rédaction 2 IA)

**Décisions** : voie d'ingestion des claims livrée (route interne
`/api/internal/rag/claims/ingest` + lib), statut `EN_ATTENTE_VALIDATION` forcé et
**version de claim immuable**. Rédaction **2 IA** : Sonnet 5 rédige, GPT-5.4
contre-vérifie la fidélité au verbatim (désaccord → exclu). PR **#254** (infra)
mergée, **#262** (drafting) verify vert.

**Écarté** : supersession auto des claims (risque de défaire une validation) →
additif/immuable ; dry-run d'inspection avant ingestion (choix « enchaîner
direct »).

**Preuves** : revue adversariale (workflow, 20 agents) — 10 constats confirmés,
tous corrigés, dont l'ajout silencieux de sources à un claim validé. Dev-local :
136 claims (53 exclus par la fidélité), 136/136 ingérés, barrière D-003 tenue.
T1 + T2 (`test:worktree`) verts.

**Prochaine action** : claims → prod, gaté sur le déploiement de #254 (Vercel) +
une surface de validation praticien (Atelier corpus, non ouverte).

**Questions ouvertes** : passage à l'échelle 88 sources (API batch) ; piste MP4.

## 2026-07-22 — Hygiène du flux : déploiements Vercel filtrés, purge outillée des branches

**Décisions** : Ignored Build Step posé deux fois — `web/vercel.json` (#258,
mergée) et réglage projet via API — les commits hors `web/` ne consomment plus
de déploiement (quota Hobby 100/j) ; constaté opérant sur #264 (« Canceled by
Ignored Build Step »). `delete_branch_on_merge` activé. Purge sur preuve (tip ⊆
`headRefOid` d'une PR mergée, ou ancêtre de `main`) : 8 worktrees, 76 branches
locales, 15 remote. `scripts/nettoyage-branches.sh` (#264, verify vert) rejoue
cette preuve — constat seul par défaut, `--appliquer` pour purger.

**Écarté** : désactiver les previews par branche (vérification visuelle des
PR) ; toute suppression sans preuve (le squash merge aveugle `--merged` ; deux
rétentions légitimes trouvées).

**Prochaine action** : sortir `docs/ai/Anthropic Api Key.pages` du dépôt ;
trancher `86e0619` (journal LOT-01b jamais mergé).

**Questions ouvertes** : filtre docs-only sur `verify` (check obligatoire) ;
fichier sale de `rag-pgvector-audit`.

## 2026-07-22 — Hygiène du flux, acte II : sauvetages et régime permanent

**Décisions** : clé Anthropic (`.pages`) sortie du dépôt →
`~/Documents/WELLNEURO-API-KEYS/`. Journal LOT-01b (`86e0619`) réinséré à sa
place chronologique (#267). Requalification de 9 sources corpus préservée en
PR brouillon, validée par le praticien et mergée (#268). Purge finale outillée :
restent 3 worktrees (sessions actives), 5 branches locales, 3 remote. Régime
permanent constaté : `delete_branch_on_merge` auto-nettoie les branches
mergées, le filtre CI docs-only existait déjà (`verify` 25 s contre 6 min 33),
l'Ignored Build Step ne consomme plus de déploiement docs.

**Écarté** : valider moi-même la requalification corpus (gouvernance des
données → brouillon) ; pull du checkout principal (compaction du SESSION_LOG
en cours, non committée).

**Prochaine action** : trancher `worktree-corpus-bench-qualite` (`7e4f591`,
brouillon de migration claims) — domaine de la session corpus.

**Questions ouvertes** : compaction du SESSION_LOG à terminer ; deux scripts
keep-awake non suivis dans `scripts/`.

## 2026-07-22 — Cadrage SP-CONV (convergence Spirale 5.0, trajectoire partagée)

**Décisions** : campagne `2026-07-22-sp-conv-trajectoire-partagee` cadrée (7 lots, sans migration) ; contrat d'épisode partagé en code seul sur les cycles G2 ; parcours patient 6 étapes HC-F synchronisées ; réouvertures actées : renommage A7 et baselines V12 ; tags du rail non rouverts (réglé par V14). **Écarté** : lots migration/gate multi-cycles — la confrontation au code montre le gate G2 levé le 19/07 (`c2b_cycle_identity_v1`) ; 5 étapes de la maquette-démo ; KPI d'accueil (métriques supprimées par V14). L'audit du jour est hérité **rectifié** (table dans CAMPAGNE.md). Séquence programme (#12), registre §3 et index README amendés ; `.wn/state.json` non touché (g-trust-04 active). Les trois questions ouvertes ont été tranchées dans la même session (D9 « Mon carnet alimentaire », D10 fiche plein écran réel, D11 quatre statuts patient sous dérogation inchangée). **Prochaine action** : merge de la PR de cadrage (Copilot), puis LOT-00 (annotations + maquettes) après décision de gouvernance sur l'activation. **Questions ouvertes** : aucune au cadrage.

## 2026-07-22 — G-TRUST-04 PR-7 : journal des accès praticien branché

**Décisions** : PR-7 livrée et mergée (#278, verify 6 min 21 vert, merge sur
instruction explicite). Helper `journaliserAccesDossier` (awaité fail-open
patron G5, purge 365 j, code `PRATICIEN.ACCES_DOSSIER.TRACE_ECHEC`), garde
`verifierAppartenancePatient(…, acces?)`, 12 routes GET branchées (7 cat. A,
5 cat. B ralliées à la garde, 403 préservés à l'octet). Revue adversariale
`wn-reviewer` : GO, 0 bloquant. T1 (298 tests) + T2 (1 min 58, 73 E2E) verts.
Post-merge : table vérifiée (`execute_sql`) — 0 ligne, RLS deny-all.

**Écarté** : journaliser les refus (nommerait un dossier non lu) ; convertir
la catégorie C à la garde (choix anti-oracle, PR-9 en appel direct).

**Prochaine action** : PR-5 (`@ts-nocheck` vague 1) ou PR-6 (exercice sur
table) ; PR-9 routes C/D.

**Questions ouvertes** : preuve fonctionnelle du journal au premier dossier
ouvert en prod ; PR #277 (keep-awake) toujours ouverte.

## 2026-07-23 — Corpus : pilote chunks + claims ingéré en production

**Décisions** : ingestion prod exécutée — 26 chunks (6 sources pilotes, batch
001) puis 136 claims LOT_001, via le nouveau `tools/corpus/claims/ingest.mjs`
(#282, mergée sur autorisation explicite). Rotation de `RAG_INTERNAL_SECRET` :
variable Vercel **Sensitive** (`env pull` ne rend que le masque `[SENSITIVE]`),
valeur conservée au coffre `~/Documents/WELLNEURO-API-KEYS/`. Branche
`worktree-corpus-bench-qualite` supprimée (recouverte par main, preuve : diff
vide hors package.json obsolète).

**Écarté** : lots de 64 puis 16 claims — timeout transaction Prisma 5 s (~4
requêtes séquentielles par claim × latence iad1↔eu-central-1) ; `--lot 4`
retenu, correctif serveur remis à plus tard.

**Preuves** : base prod — 136 `EN_ATTENTE_VALIDATION`, 0 `VALIDE`, 136 liens
sha complets, barrière `match_wellneuro_rag_claims` vide même sondée avec
l'embedding d'un claim ingéré au seuil 0.

**Prochaine action** : validation praticien des 136 claims dans l'Atelier
(`dashboard/corpus`).

**Questions ouvertes** : région des fonctions (fra1) et regroupement des
requêtes du store avant l'échelle 88 sources ; piste MP4.

## 2026-07-22 — SP-CONV : cadrage mergé (#280), campagne activée, LOT-00 livré

**Décisions** : merge de #280 par l'assistant sur instruction explicite (« si green go », `verify` vert en 47 s) ; activation de SP-CONV en **campagne parallèle** (`.wn/state.json` + `sync`, g-trust-04 reste principale) ; LOT-00 exécuté dans la foulée. **Livré** : rectification datée en tête de l'audit UX du 22/07 ; « Résolue par G2 » sur les deux documents du gate multi-cycles ; ligne C2B du README rectifiée ; 3 maquettes (bandeau cockpit D5/D10, parcours synchronisé D2/D7/D11, Mon équilibre qualitatif D7) vérifiées au navigateur ; six constats revérifiés sur main post-merge. **Écarté** : capture du parcours-synchronise avant PR (même patron que les deux vérifiées). **Prochaine action** : merge de la PR LOT-00 (Copilot, sauf instruction), puis LOT-01 — contrat d'épisode partagé, code seul. **Questions ouvertes** : aucune.

## 2026-07-22 — G-TRUST-04 PR-6 : exercice sur table de la procédure de violation

**Décisions** : exercice sur table exécuté (exigence 6) — scénario fictif,
lien portail de Michel Dogné transféré à un proche ; déroulé §2→§8 en
vérifiant chaque geste contre le code réel ; fiche 2026-EX1 ; verdict :
exécutable en 72 h par une seule personne. Constat EX-1 corrigé dans la même
PR : RUNBOOK « Révocation accès patient » inexécutable (`portailToken`
inexistant, route `DELETE /api/praticien/token` — trois portes, une
transaction — ignorée). §8.4 réécrit « exercée le 2026-07-22 ». PR #281
verte, `verify` inclus — merge confié à Copilot.

**Écarté** : reprendre PR-7 (constatée déjà mergée #278 par la session
parallèle avant d'agir) ; toucher la checklist (réservée PR-11) ; alerte
active sur les logs SECURITY (EX-2, surface nouvelle non décidée).

**Prochaine action** : reste du LOT-00 (PR-5/8/9/10/11) confié à l'autre
session.

**Questions ouvertes** : existence physique du registre des violations
(EX-3, humain) ; confirmation juridique D-TRUST-02.
## 2026-07-23 — Fonctions Vercel à Francfort (fra1) — question ouverte tranchée

**Décisions** : `web/vercel.json` épingle `regions: ["fra1"]` (#286, mergée
sous l'autorisation full-auto de la session corpus). Cause racine du timeout
de transaction traitée : fonctions en iad1 contre base eu-central-1, ~80 ms
par aller-retour SQL. Bénéfices : toutes les routes serveur, et traitement
des données dans l'UE.

**Écarté** : regroupement des requêtes du store claims (cause supprimée,
changements minimaux) ; élévation du timeout Prisma (même raison). `--lot 4`
reste disponible mais n'est plus nécessaire.

**Preuves** : verify vert (6 min 14) ; déploiement `abf23cf` READY ;
`x-vercel-id: fra1::fra1::…` constaté deux fois sur route dynamique, 401 en
231 ms.

**Prochaine action** : validation praticien des 136 claims (Atelier), puis
échelle 88 sources.

**Questions ouvertes** : piste MP4.

## 2026-07-23 — G-TRUST-04 clos : PR unique de clôture (routes C/D, catalogue typé, campagne livrée)

**Décisions** : reliquat du LOT-00 en une PR unique (décision utilisateur).
Journal des accès branché sur les 10 routes C/D — **correctif au passage : le
GET booklet n'était pas scopé praticien**, rallié au patron du POST.
`@ts-nocheck` levé **17/17** (mesure : 1 560 erreurs, dont 1 425 par le seul
`meta` non typé) — le juge de certification transpile désormais le TS avant
son eval, prouvé neutre. Doublons Q_NEU_04/Q_NEU_08 dédoublonnés (gagnant
runtime conservé). Checklist exigences 5/6 à jour, GD-6 consignée, onboarding
requalifié « fonctionne » (E2E portail-parcours). Lot + campagne livrés.

**Écarté** : borne GD-5 (l'utilisateur a choisi de moderniser le juge) ;
annotation `Record` du catalogue (272 erreurs induites → inférence conservée,
moteur en 51 `any` explicites).

**Prochaine action** : preuve fonctionnelle du journal au premier dossier
ouvert en prod (requête GD-3).

**Questions ouvertes** : conflit bénin possible sur `.wn/state.json` avec la
PR #284 (sp-conv).

## 2026-07-23 — SP-CONV livrée : les six lots de code en full-auto

**Décisions** : exécution full-auto autorisée (« lance tous les lots à la suite, checks, merge PR autorisés, nettoyage branches »). Six PR livrées et mergées à la suite, verify vert à chaque fois : #288 contrat d'épisode partagé (lib pure, garde D7) ; #290 cockpit adaptatif (phase initiale D5, bandeau épisode, plein écran D10, tests réécrits — l'ancien comportement testé était le reproche de l'audit) ; #291 suture time-travel (index Spirale → asOf via LectureEtatPassePanel piloté) ; #293 parcours patient synchronisé (étapes 5-6, champs additifs D11, dédoublonnage CTA) ; #294 Jardin (« Mon carnet alimentaire » — A7 amendé au registre, équilibre qualitatif, 44 px, TTL brouillons, MetricsSection supprimée) ; PR LOT-06 preuve visuelle (ARIA + toHaveScreenshot Linux fs-gaté, portail via Jennifer Martin isolée, workflow visual-baselines, dérogation V12 levée). **Écarté** : capture Mon équilibre portail (exigerait une consultation complète — remplacée par hub déplié). **Prochaine action** : déclencher `visual-baselines` et committer les premières baselines. **Questions ouvertes** : aucune — campagne close.

## 2026-07-23 — SP-CONV : épilogue baselines, campagne close (/wn-finish)

**Décisions** : premières baselines commitées (#298) après deux itérations de relecture — état transitoire du cockpit et textes temporels attrapés avant entrée au dépôt (#297), échappatoire de bootstrap `WN_VISUAL_UPDATE` (#296). La première comparaison active en CI a détecté une vraie instabilité : `dashboard-patients` dépend de l'état laissé par les parcours (2386 vs 2546 px) → retiré du pixel, revue + ARIA conservés. Six baselines comparent vert sous Linux. Verify absent après push sur #298 : débloqué par close/reopen (précédent #255). **Validations** : T1+T2 par lot, verify vert sur les 11 PR, audit campagnes 0 erreur. **Écarté** : merge --admin (attendre la propagation du check suffisait). **Prochaine action** : reprise g-trust-04 (campagne active) ; SP-CONV n'a plus rien en vol. **Questions ouvertes** : aucune.

## 2026-07-23 — Atelier corpus v2 : validation par lot livrée (4 PR)

**Décisions** : la procédure « validation à deux vitesses » (actée le matin,
#289) est exécutable en production. Quatre PR séquencées, toutes mergées :
- **#300 (PR A)** — migration journal des décisions `rag_corpus_claim_decisions`
  (append-only par trigger, cree_le non antidatable, RLS deny-all).
- **#302 (PR B)** — lib : tirage serveur seedé (30 % dégressif, allowlist
  déclaré/observé), `deciderLot` (lot figé au tirage, couverture des chunks,
  UPDATE + journal transactionnels), bascule motivée ; migration de suivi
  20260723120000 (index unique « un tirage, une issue », trigger allowlist).
- **#303 (PR C)** — écran voie rapide + route de restitution en mode revue.
- **#304 (PR D)** — générateur de questionnaire (couverture 1 question ↔ 1 chunk).

**Écarté** : denylist `<> 'interprété'` (revue : laissait entrer `vécu`) →
allowlist stricte ; unicité d'issue applicative (revue : course concurrente) →
index unique en base ; couverture « tous chunks actifs » (revue : sources sans
claim insignables) → « chunks atteignables ».

**Preuves** : deux revues adversariales `wn-reviewer` par migration (PR A :
NO-GO 12 constats → GO ; PR B : NO-GO 2 bloquants concurrence → GO), contrats
SQL joués en CI, T3 verts, base prod vérifiée après chaque migration (journal :
3 triggers/RLS ; suivi : index unique + trigger allowlist présents).

**Prochaine action** : le praticien exerce la voie rapide sur le pilote
(`dashboard/corpus`) — 87 claims en voie rapide, 49 en individuel.

**Questions ouvertes** : générer les questionnaires pilotes (nécessite
ANTHROPIC_API_KEY) ; passage à l'échelle 88 sources.

## 2026-07-23 — Fin de session SP-CONV : vérification prod, rien en vol

**Décisions** : session close sur une vérification factuelle — la 5.0 est **en production** (déploiement Vercel `READY` à chaque merge sur `main`, `app.wellneuro.fr` répond ; dernier déployé : `f2aaccc`). Les maquettes n'ont plus rien à valider : la référence est l'artifact acté en V14, les trois maquettes de campagne ont été réalisées par les LOT-02/04/05 et restent au dossier comme trace. **Écarté** : rouvrir un lot — aucun défaut constaté. **Prochaine action** : tour de validation humaine en prod (fiche adaptative, time-travel, portail) + validations jamais faites (zoom 200 %, lecteur d'écran réel, appareil physique — dette HC-F) ; côté programme, SP-CAB attend `n ≥ 5` épisodes clos. **Questions ouvertes** : aucune pour SP-CONV.

## 2026-07-23 — Atelier : notebooks, modale, questionnaires in-app, bibliothèque NotebookLM

**Décisions** (arbitrages praticien en session) : entrée de l'Atelier = table
des sources **groupée par notebook** (registre sanitaire, importé statiquement) ;
**voie rapide en modale plein écran** (fini le défilement sous la vue) ;
**génération du questionnaire dans la modale** (route serveur Sonnet 5, une
question par chunk atteignable, la génération ne décide rien) ; bibliothèque
**NotebookLM par dossiers Drive**, nourrie au **markdown canonique**
(`tools/corpus/notebooklm/exporter.mjs` + guide, D-003 non engagé). PR #307 et
#309 mergées.

**Écarté** : fenêtre navigateur séparée (perte de session NextAuth) ; PDF
originaux pour NotebookLM (canonique choisi) ; import de fichier questionnaire
(remplacé par la génération in-app).

**Corrigé au passage** : la voie rapide chargeait la file avec `sourceId=`,
paramètre ignoré (route lit `source=`) — couverture affichée faussée, serveur
déjà juste.

**Prochaine action** : exercer la voie rapide sur le pilote (modale, notebook
09) ; téléverser la bibliothèque dans Drive et créer le premier NotebookLM.

**Questions ouvertes** : échelle 88 sources ; piste MP4.

## 2026-07-23 — UX 5.0 V15 : rubrique Bibliothèque (maquette)

**Décisions** : rubrique Bibliothèque activée dans la maquette Spirale
(PR #312, squash `4ecf9ae`, mergée sur instruction explicite du
propriétaire) ; file d'envoi générale multi-patients — un mail, un lien
portail par patient ; aperçu vierge « le Jardin » ; création/import en
tiroirs 440 px ; artifact republié sur la même URL. Revue adversariale
(38 agents) : barème PSS-10 corrigé /40, aperçu du mail resynchronisé.
Questions produit consignées en ARBITRAGES §6. Validations : Chromium
headless (interactions, hauteur bornée, zéro erreur console),
anti-secrets, `verify` 33 s (docs-only) — pas de suite web/, aucun
changement d'app.

**Écarté** : artifact séparé (maquette unique) ; panier par patient
(file globale préférée) ; toucher à l'app.

**Prochaine action** : trancher ARBITRAGES §6 (nommage, écart catalogue,
alias, orchestration serveur de la file) avant implémentation.

**Questions ouvertes** : implémentation app de la vue.

## 2026-07-23 — Épilogue G-TRUST-04 : merge #292, preuve GD-3 acquise, purge — projet en pause

**Décisions** : #292 mergée par l'assistant sur instruction explicite (squash
`1a8d14c`), après deux conflits résolus avec `main` — SP-CONV livrée puis
close en parallèle → état combiné `idle`. Nettoyage sur preuve : 5 worktrees,
6 branches locales. **Preuve fonctionnelle GD-3 acquise en production** :
3 lignes de journal à 08:45 (une minute après le déploiement) — gabarits
littéraux, `GET` seul, identifiant synthétique ; zéro erreur runtime. Pause
actée : gestes humains d'abord.

**Écarté** : forcer le verrou du worktree `g-trust-04-journal-acces-pr7`
(session vivante) ; ouvrir un nouveau fil (corpus #289, exigences 2/3,
dossier RGPD) — reportés au choix du praticien.

**Prochaine action** : humaine — invitations aux 12 patients, trancher #289,
D-TRUST-02, registre EX-3, dérogation au 2026-10-21.

**Questions ouvertes** : aucune côté assistant.

## 2026-07-23 — SP-TRAJ : Fiche-trajectoire 5.0 livrée en 6 lots

**Décisions** : audit confirmé — le rail « Fiche-trajectoire » menait à la page
héritage ; plan approuvé (périmètre complet, arbitrages revisités → **A6-R2 au
registre** : courbe momentum praticien aux seuls jalons mesurés, repère cabinet
n≥5, estimé↔mesuré « second temps » ; porte d'entrée `/dashboard/trajectoires`).
Livré : #311 (mergée) puis pile #313→#317 — Spirale navigable + deep-link,
mode de vie 7 domaines daté, momentum+cabinet, porte d'entrée, tiroirs
« Questionnaires & packs », preuve navigateur Spirale peuplée. Merges par
l'assistant sur instruction explicite — train en cours (#313 mergée, rebase +
verify par étage).

**Écarté** : E2E peuplée sur Sophie/Jennifer (baselines pixel, fixtures) →
Michel + helper auto-nettoyant ; extraction des formulaires en fichiers séparés
→ tiroirs in-situ (état entrelacé).

**Prochaine action** : purge des branches sur preuve et retour du dépôt au
régime permanent — la campagne est close dans cette même PR (state idle),
train de merges achevé, maintenance faite (#301, #318, #308 mergées).

**Questions ouvertes** : échecs locaux `portail-lien-magique` (anti-oracle de
temps, vert en CI) ; baselines pixel des nouveaux écrans (différées).

## 2026-07-23 — SP-TRAJ : merges, maintenance et clôture (Copilot hors forfait)

**Décisions** : sur instruction explicite (Copilot en dépassement de forfait),
merges et maintenance repris par l'assistant — mémoire de gouvernance suspendue
en ce sens, retour à Copilot à la demande. Train mergé après `verify` vert et
rebase par étage : #313→#317 ; production vérifiée READY sur `f220ed7`.
Maintenance : #318 et #301 mergées (conflits d'append du journal résolus sans
réécriture) ; #308 dégelée (frontmatter de lot manquant → corrigé), **revue
adversariale indépendante GO**, son constat VuesRapides intégré à #315. Purge
sur preuve : 9 branches locales/distantes, prune ; `state.json` idle ;
anti-veille stoppé.

**Écarté** : merger #308 sans revue (PR d'une autre session) ; toucher aux
branches des sessions actives (protégées par le script).

**Prochaine action** : gestes humains (voir `state.json`) ; retour de la
gouvernance Copilot quand l'utilisateur le dira.

**Questions ouvertes** : baselines pixel des écrans trajectoires (différées).

## 2026-07-24 — Instruments du cabinet livrés en production (PR #328)

**Décisions** : lot « complet d'emblée » livré — table `cabinet_instruments`, cycle brouillon → relecture → publication, import JSON/CSV, resolver commun. Après revue adversariale (56 agents, 14 constats confirmés dont 1 bloquant) : assignation faisant autorité côté patient, contenu gelé (409) pendant les envois, submit défensif **scopé aux ids CAB_** — le 409 global aurait cassé les questionnaires fonctionnels (23 assignations réelles en attente, vérifié en prod).
**Écarté** : snapshot de définition par assignation (migration lourde, gel applicatif équivalent) ; index partiel (inexprimable en Prisma).
**Validations** : T3 ×4 verts (E2E inclus), 561 tests, banc 63 questionnaires, `verify` CI vert, migration appliquée en prod (RLS active, 0 échec).
**Prochaine action** : arbitrer `Q_STR_02 max:40` dans `equilibre/constants.ts` et le motif import-masqué `Q_STR_01`.
**Questions ouvertes** : rayons Analyses biologiques et Fiches conseils à cadrer.

## 2026-07-24 — PSS-10 : couverture stress bornée sur /50 (PR #348 mergée)

**Décisions** : `equilibre/constants.ts` `Q_STR_02 max 40→50`. Le PSS-10 servi est coté 1–5 (brut ∈ [10,50]) ; `max:40` (vestige 0-4) écrasait à 0 toute couverture de brut ≥ 40 — fondation critique faussée. Bump `VERSION_SCORE_EQUILIBRE v1→v2` (imposé par la convention du fichier). Q_STR_02 migré de l'inline `questions.ts` vers le module `stress.ts` (options PSS dans `shared.ts`) ; deux tests assertent désormais la constante.
**Écarté** : test d'invariant `max==maxTotal` (choix « migrer » plutôt que « garde-fou ») ; normalisation min–max (systémique, hors périmètre) ; PR sur la branche stale `feat/instruments-cabinet` → branche fraîche depuis `main`.
**Validations** : `npm run check` + banc + 415 tests chemin-version verts sur base `main` ; E2E isolés 94 passés (seul échec = flake documenté `portail-lien-magique`) ; revue `wn-reviewer` GO ; CI `verify` pass ; mergée squash `699b228`, branche purgée.
**Prochaine action** : exploitation — signaler la frontière v1↔v2 (momentum masqué sur cycles en cours).
**Questions ouvertes** : motif import-masqué des ~27 autres questionnaires ; rayons Analyses biologiques / Fiches conseils.

## 2026-07-24 — Accueil Observatoire : Fil du jour aligné sur la maquette, quatre lots livrés

**Décisions** : campagne `2026-07-23-accueil-observatoire` (4 lots) planifiée puis livrée ; mergée dans `main` par Copilot pendant la nuit — #308 (timeline horodatée, carte imminente « Maintenant », résumé qualitatif, relectures agrégées par patient, bandeau « Vues rapides ») ; #323 (aside Météo d'adhésion réutilisant SP-MET, inbox questionnaires par patient remplaçant les cartes « Reçu », correspondance récente réutilisant C3 LOT-06, « Principe 5.0 » retiré) ; #324 (cartes jalon J21 / momentum) ; #327 + suivi #334 (agenda `RendezVous`, migration `ao_rendez_vous_v1` — vérifiée en prod : 1 tentative aboutie, table conforme, requête inverse `_prisma_migrations` vide). Correctif signalé « Trajectoire » des Vues rapides : déjà réglé par #315 (SP-TRAJ) dans le même train — rien à faire, worktree fermé sans commit.

**Écarté** : agrégat global des relectures façon maquette (incompatible avec le refus G1, ancré sur un patient) → agrégat par patient, clé datée.

**Prochaine action** : aucune côté ce chantier — campagne close.

**Questions ouvertes** : aucune.

## 2026-07-25 — Certification corpus des questionnaires : LOT-00/01/07 mergés

**Décisions** : audit d'architecture externe challengé puis intégré. Doctrine actée — le RAG certifie, source et explique ; le moteur déterministe calcule ; le graphe clinique oriente ; l'IA rédige. Une certification vaut pour une version, une langue, une population et un usage, jamais globalement. Mergés : #359 cadrage (13 lots, décisions praticien) ; #360 registre des instruments (63 entrées, axes séparés forme publiée / version servie / droits / cosmin / cycle de vie) avec module de validation et son propre banc, `scoring-check` entré dans T1 ; #361 moteur d'orientation dark (table vide, double verrou, filtre droits dur, règle sans claim ⇒ rien).
**Écarté** : tables en base (artefacts JSON/TS versionnés, zéro migration) ; compilateur remplaçant `calculateScore` (réécriture de prod) ; formule composite de momentum et couverture des besoins produite par le LLM (données déterministes).
**Validations** : T1 + garde 63 questionnaires ; 35 tests Vitest + 15 `node --test` ; T2 95 passés (seul échec = flake `portail-lien-magique`) ; revue `wn-reviewer` GO, constats traités ; CI vert sur les 3 PR et sur `main` après merge, contenu vérifié sur `main`.
**Prochaine action** : humaine — fournir les PDF sources des instruments et trancher les droits (PSQI, QLQ, MMSE, Conners, Epworth, HIT-6) pour ouvrir les lots 2-4.
**Questions ouvertes** : divergences à arbitrer — MFI-20 sommé sans inversion d'items, Berlin à 9 items, PSQI adapté, `protocol` mêlé aux bandes de l'IRLS.

## 2026-07-26 — Rayon biologie : import de la nomenclature NABM (CB-02a)

CB-02a mergé (#374) et vérifié en production : 12 tables, RLS deny-all sans policy, 0 ligne. Le lot, annoncé sans migration, en a porté une — mesurer la source avant d'écrire a montré que CB-01 n'avait de colonne ni pour `codeIncompatible` (438 actes sur 987, jusqu'à 17 valeurs) ni pour le snapshot exigé par l'audit. Trois chiffres de l'audit corrigés : 987 actes et non 988 (le 988ᵉ est la racine `NABM`), 63 non-actes, aucun code non numérique mais 256 à zéro de tête.

**Décisions** : snapshot en TEXT et non `jsonb`, pour que son empreinte reste recalculable en base ; vocabulaire de `source_provenance` restreint à `nabm_smt_ans` sur cette table seule.

**Écarté** : merger sans relire la base ; extraire la connexion de production par le MCP Vercel ; écrire par le MCP Supabase, qui contournerait les cinq gardes.

**Validations** : 21 tests Vitest ; 987 actes réellement importés sur PostgreSQL 15 ; contrat vert avec données ; 25 tests négatifs rejetants ; banc d'intégration 9 cas câblé en CI ; revue `wn-reviewer` NO-GO, trois défauts de fond corrigés ; CI vert, migration relue en base.

**Prochaine action** : l'import en production **n'est pas lancé** — aucune chaîne de connexion sur le poste. Le câbler dans `vercel-build.sh` (patron C5) plutôt que de faire transiter un secret.

**Questions ouvertes** : sort d'une correspondance signée dont l'acte disparaît (à trancher avant CB-02c) ; régime documentaire figé ou non entre signature et courrier ; source `labo` dans les snapshots.

## 2026-07-26 — Certification corpus (lots 2-3) et fuite du booklet patient

**Décisions** : rapatriement des 123 PDF Drive → 106 sources extraites en triple
lecture ; banc de certification passé sur **59 instruments** (12 propres, 11 avec
au moins une divergence critique confirmée par les deux lectures, 16 critiques ;
MFI-20 et PSQI confirmés, PSS-10 témoin propre). Droits SIIN actés au registre
sur les 13 instruments internes. **Fuite de production fermée** (#370) : le
booklet envoyé au patient rendait axes, vigilance et questions d'entretien —
dont les signaux d'alerte déclarés. Garde de registre anxiogène confirmable
côté route.

**Écarté** : l'ingestion pgvector, pourtant autorisée — 140 chunks validés hors
ligne, **rien écrit en prod** : les sources sont massivement des échelles
tierces sous copyright, hors périmètre de la déclaration SIIN.

**Validations** : T1, T3, CI `verify` (E2E inclus) verts ; deux revues
`wn-reviewer` NO-GO justifiées, défauts corrigés. #370/#371/#373 mergées.

**Prochaine action** : rejouer le banc sur `Q_ALI_03` et `Q_STR_06` (Karasek),
non croisés.

**Questions ouvertes** : droits des instruments tiers (bloque pgvector) ;
arbitrage des 16 divergences (lot 4) ; PR #372 en attente sur deux points
d'affichage ; rétablir ou non un profil par axes côté patient, avec des libellés
écrits pour lui.

## 2026-07-26 — G5 staging réparé + P2 bornes I/O Scalingo (#377)

**Décisions** : G5 staging basculé sur le vrai client patient Externe `750815743505` — la prod marchait déjà (6 connexions gmail réelles en base). Le blocage `org_internal` venait d'un client **parasite** `385215216634-tanfoe` créé par erreur dans le projet praticien Interne, posé à tort sur staging. Audit complet des identités Google livré (`docs/claude/propositions/2026-07-25-audit-identites-google/`). **P2 mergé (#377)** : helper `creerTransportSmtp` (timeouts 10/10/20 s) sur 8 envois SMTP + `createEmbeddings` borné à 30 s.

**Écarté** : projet Google dédié patient (existe déjà) ; fire-and-forget SMTP (masquerait l'échec d'e-mails qui *sont* le livrable).

**Validations** : T1 vert ; T2 `test:worktree` 2092 unitaires + 95/97 E2E (2 échecs = artefact `.env.local`, prouvé local) ; CI `verify` vert 8m25 ; base prod lue via MCP.

**Prochaine action** : supprimer le client parasite + son JSON (console) ; `DB_SSL_CA` staging ; lots A4/A5.

**Questions ouvertes** : propriété du projet `750815743505` (perso gmail vs org wellneuro.fr) à vérifier/transférer.

## 2026-07-26 — DB_SSL_CA staging + lots code A4/A5 clos (#382)

**Décisions** : `DB_SSL_CA` posé sur staging (root CA « Scalingo Databases », `tlsNoVerify=non` confirmé en logs) — chaîne TLS vérifiée. **A4** (exig. 5) tranché : le GET agenda `rendez-vous` **n'est pas journalisé** (liste opérationnelle ≠ dossier de santé nommé ; `motif` = note d'agenda praticien), documenté en code + test de surface d'exposition. **A5** (exig. 7) : 13 routes praticien authentifiées sans aucun test reçoivent « sans session → 401 » (dont metrics/patients-pg/trust, données patient). **Tous les lots CODE de prépa HDS sont faits** (fondation+P0+P1+P2+A4/A5).

**Écarté** : journaliser l'agenda (surface non clinique) ; faire confiance à l'audit `wn-explorer` brut — 8 faux positifs « manque 401 » écartés par vérif déterministe.

**Validations** : T1 vert (29 tests) ; CI `verify` vert sur #382 (8m31, E2E inclus, en env propre).

**Prochaine action** : migrations Prisma **C** sous 🚪 go explicite — hachage `patients.access_token` (exig. 4) + RLS (exig. 3), protocole renforcé (revue avant, base prod après).

**Questions ouvertes** : go pour migration C ? ; volet ops/juridique HDS (responsable, échéance 2026-10-21) ; propriété projet Google `750815743505`.

## 2026-07-26 — Audit de la chaîne alimentaire 5.0 (PR #380 mergée)

**Décisions** : audit livré en réponse à deux documents praticien (simulation du workflow cible, verdict métrologique sur `Q_ALI_01/02/03`). Sept affirmations vérifiées à la ligne, sept exactes. Quatre constats inédits : le besoin 2 « Micronutriments » est alimenté par la fatigue de Pichot **et** figure dans les fondations critiques — son effondrement plafonne le *Mon équilibre* global à 50 ; `Q_ALI_02`/`Q_ALI_03` n'alimentent aucun besoin ; `Q_ALI_03` promet l'estimation dans ses consignes servies ; `POST /api/portail/ja/observations` n'est appelé par aucun client. Désaccord de fond acté : la référence de certification est la **publication primaire**, pas le PDF du cabinet — sur `Q_ALI_02` l'app est plus fidèle au MEDAS publié que le PDF qu'on lui oppose. Merge par l'assistant sur instruction explicite.

**Écarté** : les 15 domaines proposés (réduits à 5-6 réellement discriminés) ; restaurer les 57 items SIIN (non validés — renommage recommandé) ; exécuter le P0 (bump `VERSION_SCORE_EQUILIBRE` v3→v4 sans demande explicite).

**Validations** : anti-secrets vert ; T1 vert après `npm ci` + `prisma generate` (conteneur nu) ; CI `verify` success 31 s ; citations `fichier:ligne` revérifiées, deux corrigées avant commit.

**Prochaine action** : humaine — trancher les quatre arbitrages du §7 (source du besoin 2, sort de `Q_ALI_01`, alcool dans `Q_ALI_02`, écriture patient du carnet avant le 2026-10-21 sous hébergement non-HDS).

**Questions ouvertes** : `scoring-check` rapporte 0 preuve psychométrique sur les 64 instruments du registre — hors périmètre, mérite son propre fil.

## 2026-07-27 — CB-02b en production et onze arbitrages praticien

**Décisions** : CB-02b mergé (#394) — notebook 08 ingéré, 135 chunks / 758 claims
tous en attente. Onze arbitrages tranchés puis gravés (#399, dossier
`propositions/2026-07-27-arbitrages-praticien/`) : la publication primaire fait
foi ; rescorage rétroactif des passations ; `Q_ALI_01` restauré à 57 items ;
dimensions déclarées sur `Q_CAR_01` et `Q_GEO_04` ; `protocol` hors des bandes
(12 instruments) plus un filtre en lecture ; pilote de 10 sources sur `LOT_006` ;
rayon corpus C4 filtré par notebook ; voie lente biologie retirée du cadrage ;
trois décisions CB-02c. Réserve posée : sous-scores catégoriels `Q_ALI_01`
adossés à la boussole alimentaire, après implantation et passation test.

**Écartées** : estampiller la version du barème (le praticien préfère la série
homogène) ; forme courte de `Q_ALI_01` ; produire `metadata.rayon` dans la chaîne
(imposerait migration et backfill) ; nettoyer les `scores_json` enregistrés
(écriture patient pour un gain nul).

**Validations** : anti-secrets vert ; `verify` vert sur #394 (9 min 2 s, E2E) et
#399 (30 s) ; chiffres recoupés en production par `execute_sql` ; revue
adversariale NO-GO sur #399 — quatre bloquants vérifiés à la ligne et corrigés,
dont une protection décrite à tort comme absente.

**Prochaine action** : auditer une trentaine des claims biologie étiquetés non
prescriptifs — il dira si l'étiquetage LLM peut servir de gate, et conditionne
CB-04.

**Questions ouvertes** : go pour le lot de rescorage (recontact si changement de
bande ? gel des déclenchements ? dénombrement avant/après ?) ; QLQ-BR23, règle
EORTC à lire ; Berlin à rejouer au banc ; garde de divergence registre ↔ base
pour la décision 7 ; `npm ci` jamais joué dans `tools/corpus` en CI.

## 2026-07-27 — Conduites hors des bandes (#389) et garde anti-secrets refait (#396)

**Décisions** : #389 mergée (`159ec9a`) — les conduites sortent de
`interpretation`, et le bloc de scores brut est filtré avant le prompt. Le
modèle continue de recevoir l'orientation, **une fois, étiquetée** par la
mini-synthèse : le filtre retire un doublon, pas une information. #396 mergée
(`bf513c0`) — `secrets/` ignoré, motifs élargis à la forme JSON, banc de 14 cas
en CI et en T1, trois codes de sortie (`2` = « je n'ai pas pu vérifier »).

**Écarté** : couvrir `GOOGLE_CLIENT_SECRET` et `NEXTAUTH_SECRET` — 8 et 28
correspondances, toutes des placeholders ; un garde qui échoue toujours finit
désactivé. Et recalculer les 4 passations MFI-20 : le PDF source montre un
**autre instrument** (échelle, inversions, dimensions et libellés divergent).

**Prochaine action** : `actif: false` sur `Q_SOM_07`, en PR depuis `main`.

**Questions ouvertes** : le checkout principal doit `git pull` pour que
`secrets/` prenne effet là où sont les identifiants ; un fichier binaire indexé
échappe encore au mode `--staged` ; aucune fixture ne rejoue la forme héritée
`interpretation.protocol` par `route.post.test.ts`.

## 2026-07-27 — Migration C / LOT-04 : retrait du jeton portail (PR #397 mergée)

**Décisions** : Option 1 — le cookie de session signé `wn_portail` devient l'unique credential ; résolution par `session.idPatient`, segment d'URL = idPatient (non secret). 50 fichiers (+799/−1350), machinerie morte supprimée (`portal-access.ts`, `lienPermanent.ts`). Aucune migration (colonnes conservées, rollback `git revert`). Révocation tenue à toutes les entrées (garde magic-link réécrite — classe PR #202). Mergée après confirmation des drapeaux d'entrée actifs en prod ; l'utilisateur a lancé `gh pr merge` (le classifier le bloque même après « go » — pas de contournement `gh api`).

**Écarté** : hachage du jeton (relu pour reconstruire l'URL, impossible isolément) ; Option 2 (rebuild `/portail/espace/*`) différée ; DROP COLUMN → PR ultérieure après fenêtre de stabilité.

**Validations** : T1 vert, tsc 0, T3 E2E verts (2 échecs = artefact env worktree connu) ; wn-reviewer GO conditionnel ; post-merge — Vercel prod `success`, DB prod schéma intact (colonnes présentes, 14 actifs, 0 révoqué), `/portail/connexion` 200 avec les deux voies (Google + redemande).

**Prochaine action** : humaine — comms patient (liens permanents cassés) + parcours authentifié réel (magic-link reçu + Google + un révoqué refusé aux trois entrées).

**Questions ouvertes** : cadrer la PR 2 (`DROP COLUMN access_token*`, avec réintroduction d'un drapeau de révocation de remplacement).

## 2026-07-27 — P0 métrologique : le besoin 2 n'est plus mesuré par la fatigue (PR #398)

**Décisions** : `VERSION_SCORE_EQUILIBRE` v3 → v4. `Q_SOM_06` (fatigue de Pichot) retiré du besoin 2 « Micronutriments essentiels », qui devient non évalué — il est fondation critique, donc une fatigue élevée plafonnait le *Mon équilibre* global à 50 sur une carence jamais mesurée. Registre aligné (12 → 11 sources). Frontière de version corrigée : seule l'étiquette `versionScore` est figée, les valeurs sont recalculées, et la comparaison ne reprend pas automatiquement — la note héritée de v2→v3 était fausse. Merge par l'assistant sur instruction explicite.

**Écarté** : retirer le besoin 2 des fondations critiques (une couverture `null` est déjà ignorée par le plafond — inerte, pas dangereux) ; bumper `VERSION_MAPPING_BESOINS` et figer la valeur plutôt que l'étiquette — décisions d'architecture hors lot.

**Validations** : revue adversariale `wn-reviewer` **NO-GO initial**, quatre points traités ; bloquant levé par lecture de production (aucun patient ne perd son indice, `assessment_episodes` vide). Suite complète 280 fichiers / 2 132 tests ; `verify` CI 8 min 14, E2E inclus. Cinq tests ancrent les invariants jusque-là revendiqués en commentaire.

**Prochaine action** : humaine — points 2 à 4 du P0 (promesses de `Q_ALI_03`, seuils provisoires de `Q_ALI_01`, garde-fou IA).

**Questions ouvertes** : étiquette vs valeur de `versionScore` ; `VERSION_MAPPING_BESOINS` figé à `besoins-v1` alors que le mapping a bougé deux fois.

## 2026-07-27 — RLS exig. 3 tranché (posture A), chemin critique HDS vidé

**Décisions** : RLS (exig. 3) tranché **posture A** — deny-all en place (0 policy,
0 `FORCE`, app en `postgres`) + gardes applicatifs = contrôle suffisant, sans code
base. Gravé : `DECISIONS.md` D-005, note DPO prête, addendum, checklist (chemin
critique → A→D→E). **Chemin critique code = vide.**

**Écarté** : posture B (`FORCE` + policies) — disproportionnée mono-domaine, risque
de régression ; force-suppression du worktree verrouillé.

**Incident** : premiers Write/Edit sur le checkout principal (chemins hors
worktree), nettoyés ; sa modif SESSION_LOG (autre session) préservée. 5 branches
HDS mergées effacées.

**Validations** : anti-secrets `--staged` vert ; PR #407 `verify` vert 29 s (docs only).

**Prochaine action** : envoyer la note au DPO/auditeur pour confirmer la posture A.

**Questions ouvertes** : confirmation DPO ; Sentry client ; PR 2 `DROP COLUMN
access_token*` ; ops D/E + juridique F (2026-10-21).

## 2026-07-27 — P0 métrologique alimentaire, points 2 à 4 (PR #408, mergée)

Retiré des questionnaires alimentaires ce qu'ils n'affirment pas : titre et
consignes de `Q_ALI_03` ne promettent plus d'estimation en g/kcal, seuils de
`Q_ALI_01` signalés provisoires, consigne IA interdisant de conclure à une
carence ou une quantité.

**Défaut trouvé hors plan par la revue adversariale** : `Q_ALI_03` émettait un
bloc `monnier` calculé depuis des sous-scores inexistants — 0 g/j et 0 kcal/j
invariants, persistés et transmis au modèle. Un signal de dénutrition fabriqué,
porté par la passation du 2026-07-25. Bloc retiré, clé filtrée du prompt. Le
rapport d'audit affirmait le contraire ; ligne corrigée.

Écartés : recâbler le bloc (exigerait poids, portions, table de composition) ;
renseigner `versionServie.description` (le garde du registre l'interdit sous
`a_auditer`) ; retirer `MO10` et suspendre `Q_ALI_01` (arbitrages cliniques).

**Prochaine action** : backfill des `titre` figés — la fiche praticien affiche
encore l'ancienne promesse sur la passation concernée.

**Questions ouvertes** : neuf réserves au changelog, dont les libellés
« Apports » et les bandes de `Q_ALI_01` qui continuent de conclure.

## 2026-07-27 — `actif` devient une garde de route (#406, #410)

**Décisions** : #406 (`0c7d9af`) — `actif: false` ne gardait que les écrans ;
les trois chemins d'assignation l'ignoraient, dont l'onboarding portail, sans
clic praticien. Garde par `IDS_SUSPENDUS`, jamais par le complément
`IDS_ASSIGNABLES` (il exclut alias et passations praticien, et refuserait des
instruments valides). #410 (`caa0424`) — trois défauts de revue adversariale :
code `INSTRUMENT_SUSPENDU` distinct de `RESOLUTION_FAILED` (un pack tout
suspendu émettait deux fois le même code) ; test de route sur `portail/valider`,
dont la trace pouvait disparaître sans un seul échec ; `PacksPanel` affichait
`Q_SOM_07` brut et un compte faux.

**Écarté** : consultation validée à zéro questionnaire (non atteignable) ;
retrait du seed `REP_J02_SOM07` — il reproduit l'état réel de la production.

**Validations** : T1 vert ; T2 281 fichiers Vitest verts, 5 échecs E2E =
pollution `.env.local` connue ; `verify` vert 8 min 37 ; prod lue par
`execute_sql` (3 assignations, toutes verrouillées).

**Prochaine action** : retirer le worktree `certification-corpus-lots-0-1-7`
depuis le checkout principal ; lots 5-6 (besoins).

**Questions ouvertes** : bloc axes du booklet patient ; `PATCH assignations`
re-sert un suspendu ; les passations invalides alimentent encore fiche et
synthèse IA.

## 2026-07-27 — Le réservoir Q_SOM_07 est fermé (#418)

**Décisions** : #413 mergée. #418 (`4e35516`) — les passations à interprétation
retirée cessent d'alimenter fiche, Fil et synthèse IA. Registre distinct de
`IDS_SUSPENDUS` : `actif: false` décide de l'envoi, pas de la lecture. Liste
blanche, seul `rawAnswers` subsiste. Consigne v5 → v6. Trois arbitrages :
synthèses antérieures qualifiées (critère = date), `evaluability` gagne
`not_interpretable`, `PATCH` / portail / `submit` refusent un suspendu — contre
la doctrine écrite d'`instruments.ts`.

**Écarté** : réécrire les 3 synthèses validées (écriture en base) ; recycler
`not_calculable`, qui aurait nié vingt items présents.

**Validations** : 15 mutations, chacune ≥ 1 échec ; 2200 tests ; `verify`
8 min 29 ; prod relue — rien réécrit.

**Prochaine action** : retirer les deux worktrees ; lots 5-6 (besoins).

**Questions ouvertes** : bloc axes du booklet ; un booklet parti n'est pas
rappelé ; `RETRAIT_EN_SERVICE_LE` en dur.

## 2026-07-27 — Audit de la chaîne trajectoire patient (docs-only)

**Décisions** : clôture de session par un lot documentaire, sans aucun code.
Audit complet de la chaîne trajectoire (SP-CONV + SP-TRAJ) demandé par
l'utilisateur après signalement que le périmètre dépassait une clôture. Règle de
preuve ajoutée : aucun constat de comportement sur lecture seule — sondes Vitest
jetables exécutées, portée mesurée en production.

**Trouvé** : la chaîne praticien est **dormante** (0 épisode, 0 protocole, pour
17 patients) ; un jalon sans réponse nouvelle est rendu « mesuré » avec la valeur
de T0 et un momentum « stable » (F1, prouvé), ce que deux frontières écrites
interdisent mot pour mot ; le repère de cabinet en hérite ; côté patient, « *n*
bilans jalonnent votre parcours » alors qu'il y en a eu un. Aucun patient
concerné aujourd'hui — défauts latents.

**Écarté** : tout correctif de code (F1 modifie un signal clinique servi → bump
v5 + demande explicite) ; le backfill des `titre` figés (données de production).

**Audit externe confronté** (3e document apporté) : juste sur `Q_ALI_01`, risque
résiduel n° 1 — il pilote seul une fondation critique avec des seuils que le code
déclare non certifiés. Faux sur la couverture du carnet, qui refuse explicitement
de qualifier ; mais le verdict de suffisance existe ailleurs et dit au patient
« nous en savons assez » sur trois traces du même jour. Écarté : brancher `AL12`
au besoin 3 (rejouerait le défaut du besoin 2) ; 14 domaines dont 8 vides.

**Prochaine action** : arbitrer `Q_ALI_01` — renommage et sortie des fondations
critiques. Elle commande le lot 1 du plan révisé.

**Questions ouvertes** : sort du « silence utile » ; le cycle protocole → épisode
a-t-il vocation à servir (zéro ligne en base) ; six domaines ou quatorze ; les
quatre questions du rapport trajectoire.


## 2026-07-27 — Clôture : #416 mergée, raccourci docs-only du CI constaté

**Décisions** : #416 mergée en squash (`9693b91`) sur instruction explicite —
audit trajectoire, confrontation de l'audit externe, plan alimentaire révisé.
Conflit sur ce journal avec #419 (deux entrées ajoutées au même endroit) résolu
en conservant les deux, dans l'ordre d'arrivée.

**À retenir** : depuis #412, `verify` détecte un diff purement documentaire
(`ci.yml:53-85`) et saute build et E2E — vert en 33 s là où la même PR prenait
8 min 37 avant le merge de `main`. Ce n'est pas un passage à vide : anti-secrets
et audit des campagnes restent inconditionnels. Ne pas lire un `verify` court
comme un CI qui n'a rien vérifié, ni comme la preuve que les E2E sont passées.

**Écarté** : forcer un run complet sur un diff docs-only.

**Prochaine action** : arbitrer `Q_ALI_01` — lot 1 du plan révisé.

**Questions ouvertes** : inchangées, voir l'entrée précédente.
## 2026-07-28 — Agenda du sommeil : audit, contrat v2 et complétude face au consensus

**Décisions** : audit de la maquette « Wellneuro 5.0 » puis refonte en deux lots, dans le worktree `agenda-sommeil-v2` (non committé). Lot 1 : fin du pré-remplissage par la nuit de la veille (on validait 20 copies conformes sans un geste), cadran tactile sans clavier, éveil nocturne obligatoire avec classe `aucun` explicite, barème refondu en 4 axes indépendants (la latence y comptait 3 fois ; la qualité vécue n'y comptait pas), seuils 7/14 nuits dont 4 de week-end, écart-type en n−1, niveau de preuve B→D, besoin 5 pondéré (mouvement 1/2, repos 1/2). Lot 2, après comparaison au Consensus Sleep Diary : réveil final (3ᵉ poignée conditionnelle — le réveil matinal précoce était invisible et comptait comme du sommeil), aide au sommeil obligatoire, éveil reborné 15/30/60, métriques de fréquence.

**Options écartées** : suppression des horaires et score montré au patient (orthosomnie) ; facteurs et fréquence dans l'indice (expositions, double comptage) ; conversion des classes d'éveil v1 (inventerait une précision).

**Validations** : T1 vert (606 tests) ; T3 : 2225 unitaires verts, 96 E2E passés, 2 échecs pré-existants dans `portail-google.spec.ts` (dépendants du `.env.local` local, hors périmètre).

**Prochaine action** : `/wn-review` (passe adversariale — seuils cliniques), puis commit et PR des deux lots ensemble.

**Questions ouvertes** : l'heure de mise au lit reste absente (nos efficacités sont plus flatteuses qu'un agenda partant du coucher) ; `test:worktree` rend 0 même quand son PostgreSQL ne démarre pas.

## 2026-07-28 — Agenda du sommeil : mise au lit et redéfinition de l'efficacité

**Décisions** : ajout de la 4ᵉ ancre du Consensus Sleep Diary — question « vous avez éteint la lumière : en me couchant / après un moment au lit », la seconde ouvrant une poignée 🛏️ sur le cadran. Deux conséquences voulues : le temps au lit court désormais de la mise au lit au lever (dénominateur de l'efficacité, qui BAISSE — 98 % → 87 % dans le cas testé, sans qu'une minute de sommeil change), et le temps au lit avant extinction devient une métrique à part (`AGD_PRELIT_MOY`), distincte de la latence d'endormissement. Le libellé de la question de latence porte maintenant explicitement sur l'après-extinction. Le recueil couvre 8 des 9 items du noyau ; la question ouverte du lot précédent est close.

**Options écartées** : compter le pré-lit dans le temps de sommeil (le patient ne cherchait pas encore à dormir) ; ancrer la régularité sur le coucher (c'est le rythme de sommeil qu'elle mesure) ; demander l'heure d'endormissement (supposerait de regarder sa montre).

**Validations** : T1 vert (621 tests) ; T3 : 2240 unitaires verts, 96 E2E passés, mêmes 2 échecs pré-existants `portail-google.spec.ts`.

**Prochaine action** : `/wn-review`, puis commit et PR des trois lots ensemble.

**Questions ouvertes** : sept gestes obligatoires le matin — à confronter à l'assiduité réelle d'une première cohorte.

## 2026-07-28 — Garde de contenu de la voie rapide, reprise, arbitrage des bandes

**Décisions** : l'audit des 563 claims « non prescriptifs » du notebook 08 a
trouvé **au moins 55 bornes** de décision (#401). Garde de contenu posé sur les
**six** sites de l'allowlist, définition unique en base (#412) ; puis révocation
nominative d'`anon`/`authenticated`, que `REVOKE … FROM PUBLIC` n'avait pas faite
(#420). Les **28 bornes déjà signées par lot sans lecture** repassent en attente,
signature effacée (#422). Arbitrage des 19 bandes de scores : la publication
primaire ne départage **qu'une fois sur huit** instruments.

**Écarté** : décider sur la typologie du claim — la frontière `déclaré` /
`interprété` est indécidable sur une grille de référence ; toucher aux barèmes
servis — cela change des scores patients, le rescorage a son go séparé.

**Validations** : T1, T2, six contrats SQL, quatre revues adversariales dont
trois NO-GO, preuves par mutation, base de production relue après chaque
migration.

**Prochaine action** : trancher les 19 claims un par un — le dossier propose un
sort pour chacun.

**Questions ouvertes** : BDI-13 et Q-MAT dérivent **côté produit**, gelés
derrière le go de rescorage ; place de l'échelle de Conners, désavouée par ses
auteurs depuis 1985.

## 2026-07-29 — Q_ALI_01 : parc patients reconstitué, et consigne de synthèse v10

**Décisions** : les 4 assignations ouvertes en v14 annulées, puis 8 réassignations
créées, une par patient distinct — parc entièrement reconstitué sur les 57 items.
Deux assignations inatteignables par l'interface ont été débloquées par appel direct
à la route d'annulation, qui applique ses propres gardes. Résiduel de #437 fermé par
la PR #445 (consigne `synthese-v10`), mergée après **trois refus** de revue
adversariale — chaque défaut étant créé par la correction du précédent.

**Écarté** : décrire les quatre porteurs restants (`parts`, `components`,
`categories`, `phases`) — l'un livre `suicidalIdeation`, cela demande un arbitrage
praticien ; poser la parade anti-zéro sur les `subScores` — correctif de moteur, pas
de consigne.

**Leçon** : mon banc saturait les *options* des questions ; `Q_SOM_09` n'en a pas et
sortait du recensement sans bruit — la méthode de mesure cachait le seul
contre-exemple à la règle que j'écrivais.

**Prochaine action** : filtrer les assignations côté serveur (plafond de 40, lacune
de #438).

**Questions ouvertes** : les deux booléens cliniques de `Q_NEU_12` livrés sans
consigne ; l'audit des lignes héritées partielles, dont dépend la réserve `atRisk`.

## 2026-07-29 — Certification des instruments, et trois lots moteur

**Décisions** : 10 instruments montés à `scoring_verifie`, 49 sortis du premier barreau
(#448) ; le vérificateur du CI exige désormais ses pièces à chaque barreau. Le moteur ne
rend plus de bande par défaut (#450), plus de verdict sur une passation vide (#451), et
un axe non répondu vaut « non mesuré » (#456). Deux corrections de dossier (#452, #453).

**Écarté** : dégager les 43 `a_verifier` sur la déclaration de droits — elle porte sur
les supports SIIN, dont aucun des 43 ne relève ; reformuler les items sous licence — une
paraphrase reste dérivée et détruit l'instrument.

**Prochaine action** : arbitrer les 8 sous licence tierce ; aucune assignation ouverte,
six jamais utilisés.

**Questions ouvertes** : 8 instruments via 7 moteurs rendent encore un axe à zéro sur une
passation partielle ; consigne v11 à écrire (le total global `null` n'y est pas nommé) ;
le banc golden n'est pas dans `test:worktree`.

## 2026-07-30 — Campagne scoring : 47/64 en `scoring_verifie`

**Décisions** : campagne d'un jour vers « tous les scoring exacts et validés » —
quatre PR (#469 dossier des 29 divergents, #470 requalifications, #471 frontières
+ bornes, #472 montée de 37). 10 → 47 `scoring_verifie`. Corrigé dans le servi :
grille QDRS (3 bornes chevauchées), Berlin cat2 (≥2 positifs), trous Epworth
comblés par arbitrage déclaré ; `Q_ALI_03` suspendu (10/39 items). 17 fausses
divergences requalifiées avec preuves (bornes PSQI/QIF/ECAB prouvées par
construction). Arbitrages praticien : 9 seuils ajoutés, découpages « aligner sur
la source » (lot 5 reporté), Q_INF_05 relecture d'abord.

**Écarté** : atteindre 64 — exigerait de défaire les suspensions arbitrées ;
plafond 55 annoncé au routage.

**Prochaine action** : garde de fraîcheur verdict↔code, puis correction de
l'extraction du banc (sinon son prochain passage rétablit les divergences
annulées).

**Questions ouvertes** : Q_NEU_06 (suspendre ou reconstruire), Q_ALI_01 (échelle
0–2/0–15 vs #452), Q_INF_05, sémantique `adapte`, lot 5 découpages.

## 2026-07-30 — Deux gardes posées : droits ↔ assignabilité, et le palier T3

**Décisions** : #461 mergée (une donnée absente cesse d'être lue comme une donnée
basse — `??` sur les replis PSQI, seuils monotones asymétriques, `estComplet`).
Puis deux lots nés de ce que le lot précédent avait nommé sans faire. #466 : la
garde `licence_requise` ↔ assignabilité, adossée au **registre** et non à une
liste tapée à la main — le prédicat retenu est celui de la ROUTE (définition +
hors `IDS_SUSPENDUS`), plus permissif qu'`IDS_ASSIGNABLES`, et c'est cet écart
qui est la position « invisible et assignable ». #473 : `test:worktree` ne jouait
aucun des cinq bancs `node --test` du CI ; deux étant dans T1, **T3 était plus
étroit que T1**. Liste extraite de `ci.yml`, jamais recopiée.

**Écarté** : la charnière SIGH-SAD-SA 15-17 (arbitrage clinique, pas correctif) ;
brancher les droits sur la route à l'exécution — une route patient dépendrait
d'un fichier de documentation.

**Validations** : T1 vert sur les deux lots (304 fichiers, 2699 tests) ; `verify`
complet lu avant chaque merge (12 min 42, 10 min 49) ; quatre preuves par
mutation sur #466, trois exécutions de contrôle sur #473. T2/T3 indisponibles ici
— le proxy refuse `cdn.playwright.dev`.

**Prochaine action** : passer `npm run test:worktree` depuis le Mac — le CI
n'exécute pas ce script, l'intégration du bloc de #473 n'est donc pas prouvée.

**Questions ouvertes** : les huit instruments sous licence tierce (aucune
assignation ouverte, six jamais utilisés) ; `Q_NEU_12`, dernier « invisible mais
assignable » ; consigne v11 écrite, mais les deux booléens de `Q_NEU_12` restent
sans consigne.

## 2026-07-30 — Nuits oubliées de l'agenda : trois lots livrés (#477, #478, #480)

**Décisions** : le levier contre les nuits perdues n'est pas la fenêtre de saisie
(borne J-1 confirmée) mais la visibilité de l'oubli. Verdict doctrinal établi et
opposable : la frontière écrite interdit la relance **automatique**, pas le geste
praticien — les deux migrations opposent cron et clic dans la même phrase, et
« Renvoyer le lien » est déjà une relance praticien en prod. Trois lots : vue
transverse « agendas en cours » (5 états par faits datés, jamais un score),
relance au clic sous `WN_AGENDA_RELANCE` (fermé), rappel dans l'espace patient.
Aucune migration.

**Écartés** : la relance automatique (renverserait la frontière) ; le lien profond
vers l'agenda (le segment `[token]` est le jeton permanent, retiré des e-mails par
LOT-04).

**Corrigé de mon propre cadrage** : j'avais annoncé les portes patient éteintes —
`WN_G4_LIEN_MAGIQUE` et `WN_G5_GOOGLE_PATIENT` sont **allumées** depuis le 07-21/22
(commentaire périmé dans `portail/featureFlag.ts`). Il n'y avait donc aucun blocage
de lien.

**Revues adversariales** : trois NO-GO, tous justifiés. (1) un test mockait la garde
de scoping qu'il prétendait couvrir ; (2) un échec SMTP ambigu défaisait les DEUX
protections — N clics = N e-mails reçus, tous consignés « Erreur » ; (3) le hub
invitait à transmettre le matin du 21ᵉ jour, et le suivre clôturait
irréversiblement en abandonnant la dernière nuit.

**Validations** : T1 vert à chaque étape, T2 `--fast`, `verify` vert sur les trois
PR (8m51 à 10m52), mergées, branches supprimées.

**Prochaine action** : allumer `WN_AGENDA_RELANCE` en production — après les deux
points ci-dessous.

**Questions ouvertes** : le relais SMTP n'est identifié nulle part (code ni doc) et
ce lot augmente le volume de courrier patient, à l'échéance HDS du 2026-10-21 ; le
budget anti-harcèlement est par **recueil**, pas par patient (deux agendas ouverts
existent en prod) ; ratifier le verdict doctrinal par une ligne au
`REGISTRE_FRONTIERES.md`, sans quoi le prochain audit relira `PROPOSITION:280` au
pied de la lettre.
## 2026-07-30 (soir) — Campagne « terminer les 17 » : 47 → 53, et quatre NO-GO

**Décisions** : quatre PR (#479 droits déclarés + 4 montées, #483 cotation EORTC
officielle, #484 Conners refermés + fraîcheur des verdicts). Les deux EORTC passent
de la somme brute aux échelles 0-100 de leurs manuels — dont l'inversion des items
44-46, relevée à la source et non de mémoire. Trois dettes d'outillage fermées :
l'empreinte du banc consigne la position des drapeaux, son croisement compte des
lecteurs et non des occurrences, et un verdict ne peut plus être antérieur à ce
qu'il certifie.

**Écarté** : rouvrir Q_PNE_01 (c'est le VQ11 de Ninot et al., échelle publiée) et
Q_PED_02 (sous-score « Opposition » sans aucun item d'opposition) ; monter Q_ALI_01
(l'annulation reposait sur une arithmétique fausse, 57 × 2 = 114) ; monter Q_SOM_09
(verdict vacueux : 0 item et 0 seuil lus).

**Prochaine action** : raccorder la garde de fraîcheur à l'empreinte servie — son
témoin actuel est déclaratif et la moitié du registre lui échappe.

**Questions ouvertes** : la règle du « nombre d'items » n'est pas écrite et s'applique
dans un seul sens (PSQI 24/18, Q_NEU_12 36/48, Q_GEO_01 16/20) ; Q_ALI_01 attend la
répartition des points de sa source ; Q_NEU_06, Q_SOM_09, VQ11 attendent une décision.

## 2026-07-30 (clôture) — Q_ALI_01 tranché sur pièce : 54 sur 64

**Décisions** : la source de l'Enquête alimentaire SIIN a été relue directement
(WN-SRC-0471). Elle porte « Votre score (0, 1 ou 2) » et « alors comptez … points » :
le 0-2 est un barème par item, pas un codage de réponse. Compté — 24 items à
1 point, 33 à 2, total 90 — soit exactement les effectifs du barème servi, bandes
comprises. Divergence annulée sur pièce, instrument monté (#487).

**Écarté** : la même annulation le matin, sur l'arithmétique « 57 × 2 = 90 » (faux,
114) et une prémisse sans pièce — refusée en revue, à juste titre. La conclusion
était bonne, la preuve ne l'était pas.

**Prochaine action** : raccorder la garde de fraîcheur à l'empreinte servie, seul
témoin non déclaratif.

**Questions ouvertes** : Q_NEU_06 (suspendre ou reconstruire), Q_SOM_09 (banc
vacueux), VQ11 = Q_PNE_01 (instruire les droits d'une échelle publiée), règle du
« nombre d'items » non écrite (PSQI 24/18, Q_NEU_12 36/48, Q_GEO_01 16/20).

## 2026-07-31 — Certification : 54 → 56 sur 64, quatre PR

**Décisions** : PSQI aux 24 items de sa source (volet conjoint non coté, drapeau
`horsBareme` pour le moteur clinique) ; MMT et MFI-20 **reconstruits** depuis
leurs sources — le MFI-20 passe de 3 divergences critiques à 0, sa clé
d'inversion lue sur l'image de la grille de correction ; VQ11 rouvert, son
identité étant établie ; cannabis aligné sur les trois bandes de la source. La
règle du « nombre d'items » est écrite : ce sont les axes et le total qui se
comparent, jamais le compteur.

**Écarté** : rouvrir Q_NEU_06 et Q_TAB_04 — identité non instruite, même barre
pour les deux ; et une surface de passation praticien, qui aurait publié le
verbatim d'un instrument sous réserve.

**Prochaine action** : reconstruire le Monnier (10 items servis sur 39).

**Questions ouvertes** : surface de consultation sans verbatim (bloque Q_NEU_06
et Q_GEO_04) ; échelle de Q_SOM_09, à ne pas changer avant clôture des 8 agendas
en cours ; perte de discrimination 16/30 sur le cannabis, si elle ne convient pas.

## 2026-08-01 — `Q_PED_03` : le banc savait échouer, pas le dire

**Décisions** : la fermeture de `Q_PED_03` reposait sur un faux diagnostic. La
lecture GPT plafonnait à 8192 contre 32000 pour la lecture Claude — jetons de
raisonnement décomptés du même plafond — et ne portait **aucune garde de
troncature** : une réponse coupée partait au parse, qui échouait à l'offset de
coupure. « Position 8503 » était un décalage de caractère, jamais un motif.
Reproduit sur l'API réelle avant d'être écrit. Plafonds alignés, garde symétrique
en liste blanche (`failed`/`cancelled`/`refusal` compris), **et le câblage sous
test** — retirer l'appel laissait les cas du garde verts. Banc rejoué : le
croisement a eu lieu, 108 items des deux côtés, 0 divergence critique.
`Q_PED_03` **reste `suspendu`** : le motif technique tombe, le motif clinique
s'ouvre — aucun des 19 (B) / 34 (C) seuils de la source n'est servi, ni bande, ni
dimension, là où deux des quatre dimensions sont des échelles de *validité*.

**Écarté** : réactiver l'instrument sur « 0 critique ». Le compteur agrège les
divergences par genre — « 1 confirmée » comptait une famille de 19 à 34 seuils
absents. Un chiffre de tête qu'on citerait dans six mois.

**Effet de bord attrapé en cours de route** : faire passer les bancs par un
script les a **retirés du palier T3**, dont l'extraction ne reconnaît que la
forme littérale `node --test`. Le garde d'extraction ne dit rien tant qu'il
trouve d'autres bancs. Étape explicite ajoutée, plus un contrôle que la CI les
lance toujours.

**Prochaine action** : arbitrage praticien sur `Q_PED_03` — reconstruire aux
sous-échelles de la source, ou le retirer.

**Questions ouvertes** : `.wn/state.json` et `ACTIVE_CAMPAIGN.md` sont figés au
2026-07-23 (`idle`, aucune campagne) alors que la campagne tourne depuis neuf
jours — non réparé ici, cela engage la gouvernance des campagnes. `registry-check`
reste hors de `npm run check`. `extraireJson` n'a toujours aucun banc, alors que
c'est son message qui a menti deux jours. La garde `scoring_verifie` ne lit que
`divergencesCritiques` : elle laisserait passer un instrument que les notes
interdisent de certifier.
## 2026-08-01 — Hygiène de handoff : doublon de skills, agents Copilot, Fable 5

**Décisions** : `/wn-context` et `/wn-handoff` lançaient la même commande et
écrivaient le même fichier — ils sont désormais séparés par ce qu'ils
produisent, le premier affichant sans écrire, le second seul auteur de
`HANDOFF_CURRENT.md`. Les cinq agents Copilot, posés en un commit d'installation
et jamais relus, apprennent les trois paliers, le fragment `changelog.d/` et,
pour `Reviewer`, la classe de défaut de la PR #202 — ce que le diff **ne fait
pas**. Fable 5, décrit partout mais routable nulle part, entre dans les grilles
de `/wn-route` et `/wn-lot`, avec pour seul critère la durée et l'étendue de la
tâche.

**Écarté** : toucher `CLAUDE.md` pour y nommer Fable — sa propre règle
d'économie s'y oppose, un token posé là étant relu à chaque tour de chaque
session. Écarté aussi, et pour cause : « réparer » le pointeur `AGENTS.md` de
Copilot (valide depuis #502) et corriger le tarif Fable (exact, vérifié à la
source). Deux hypothèses de départ fausses, zéro édition.

**État des deux worktrees C4 — aucun n'est abandonné, ne rien supprimer.**
`c4-transport-compositions` porte la **PR B1** (13 fichiers, +602/−160, T1 vert,
non commité, avec son `HANDOFF_CURRENT.md`) ; `c4-compositions-transport` porte
la **PR B2** (`web/src/lib/supplement-library/compositions.ts` et sa route
interne, non suivis). B1 corrige les écrans pendant qu'ils sont inertes, B2
écrit les compositions : B1 part d'abord.

**Prochaine action** : reprendre B1 là où son handoff s'arrête —
`npm run test:worktree`, puis revue adversariale avant PR.

**Questions ouvertes** : les cinq agents `.github/agents/` sont-ils réellement
chargés par Copilot ? Personne ne l'a vérifié ; s'ils ne le sont pas, ils se
désynchroniseront en silence malgré cet alignement.

## 2026-07-27 — Fil du jour : carte « Synthèse à générer » (PR #402 mergée)

**Décisions** : bug rapporté (patients lus sans synthèse invisibles du Fil et de l'inbox) tracé au retrait immédiat de l'inbox sur lecture confirmée, combiné à l'absence de carte Fil hors synthèse déjà existante (LOT-02). Choix arbitré parmi trois options : nouvelle carte `synthese_a_generer`, symétrique de `synthese_a_valider`, refusable G1 — plutôt que garder l'item dans l'inbox. Revue adversariale (`wn-reviewer`) : GO, aucun défaut bloquant.

**Écarté** : garder l'item dans l'inbox jusqu'à génération, et l'option combinant les deux — la carte au Fil seule couvrait la demande.

**Validations** : T1 vert ; T2 vert (2131/2131 unitaires, 94/98 E2E — 4 échecs = faux-positif connu portail-google/lien-magique en worktree, confirmé par retry) ; CI `verify` vert (9m12) ; merge squash + worktree nettoyé.

**Prochaine action** : aucune côté code ; deux notes mineures de revue (clarté d'une égalité stricte de dates, tests complémentaires) laissées non bloquantes.

**Questions ouvertes** : aucune.

## 2026-07-27 — Édition d'une synthèse IA avant validation + rechercher/remplacer (PR #409 mergée)

**Décisions** : gap comblé — une synthèse IA (`Brouillon_IA`) n'était jamais éditable, seulement validable telle quelle ou rejetable en bloc. Garde PATCH `enregistrer` relâchée, avec la coercion permissive de génération (`validateSyntheseSchema`), pas celle du brouillon praticien qui écrase `limites` et borne des longueurs pensées pour la saisie manuelle. Barre rechercher/occurrence suivante/remplacer/remplacer tout ajoutée à `SynthesePraticienEditor`.

**Écarté** : réutiliser `validerBrouillonPraticien` pour la branche IA (aurait rejeté un contenu déjà long, écrasé `limites`).

**Validations** : T1 vert ; T2 vert (2132/2132 unitaires, 93/98 E2E — 5 faux positifs connus, confirmés par retry) ; NO-GO initial en revue adversariale (positions de remplacement obsolètes ; CRLF pré-existant vérifié non-régression) — corrigé (revalidation d'empan + `key` par synthèse) ; `verify` vert.

**Prochaine action** : aucune côté code.

**Questions ouvertes** : aucune.

## 2026-07-27 — Push Drive du notebook 08 (Biologie fonctionnelle)

**Décisions** : versement du notebook « 08 — Biologie fonctionnelle » dans la bibliothèque NotebookLM. Export local (`exporter.mjs`, 27 sources du registre, toutes avec `canonical.md`) puis `push-drive.mjs` → `WELLNEURO_BIBLIOTHEQUE/08 — Biologie fonctionnelle` : **28 fichiers créés** (MANIFESTE + 27), 0 mise à jour. Auth compte de service + impersonation OK, racine Drive résolue. Aucun changement de code, aucune écriture base.

**Écarté** : rien — pipeline établi (extracted → export → push), `--dry-run` confirmé avant le push réel (validé par l'utilisateur).

**Validations** : dry-run propre (28 créés / 0 màj) puis push réel identique.

**Prochaine action** : geste manuel non outillé — NotebookLM → Sources → Ajouter → Google Drive pour brancher le dossier 08. Puis campagne « repartir des premiers notebooks » : restent 02, 11, 12 (+ décision sur 00).

**Questions ouvertes** : aucune.

## 2026-07-28 — Déblocage HDS : D-006, features par config, Sentry client

**Décisions** : D-006 gravé — cap tout-Scalingo, patients réels dès la phase de test, découplé du juridique, sans double-implantation permanente ; l'entrée lève explicitement le gate F « GO données réelles » et impose l'ordre DPA e-signé + périmètre HDS région confirmé avant toute donnée réelle. D-005 : confirmation DPO du RLS enregistrée. Sentry client tague l'environnement neutre (Scalingo). `docs/FEATURE_FLAGS.md` : débloquer les features par config (env), pas en retirant les gâtes du code. Runbook : région → `osc-fr1 --hds-resource`.

**Écarté** : retirer les gâtes du code (fuite prod) → config ; pincer Node 22 (changerait le runtime prod Vercel) → différé ; `osc-secnum-fr1` SecNumCloud → `osc-fr1` HDS, à confirmer acceptable.

**Validations** : 5 PR mergées (#415/#417/#423/#424/#425), `verify` vert partout (E2E sur #417) ; revues adversariales #417 et #424 (NO-GO → GO) ; anti-secrets vert.

**Prochaine action** : ⚙️ responsable — e-signer le DPA Scalingo + archiver la preuve écrite du périmètre HDS `osc-fr1`, puis provisionner l'app prod HDS (bloc D).

**Questions ouvertes** : confirmation DPO « réel sur Scalingo en test » ? ; `osc-fr1` acceptable (HDS non SecNumCloud) ? ; Node — pincer 24 ou laisser.

## 2026-07-28 — Agenda du sommeil : refonte complète, revue, merge (#427 mergée)

**Décisions** : refonte de Q_SOM_09 en trois lots + correctifs de revue, partie d'un audit de maquette. Cadran tactile sans clavier (4 repères, 2 conditionnels), fin du pré-remplissage, éveil obligatoire, barème à 4 axes indépendants avec plancher de couverture par axe, couverture par métrique, réveil final + aide au sommeil + mise au lit (TIB = mise au lit → lever, l'efficacité BAISSE), bornes d'éveil 15/30/60, métriques de fréquence, niveau de preuve B→D, besoin 5 regroupé (mouvement/repos), `VERSION_SCORE_EQUILIBRE` v8/v9. Couvre 8 des 9 items du Consensus Sleep Diary.

**Écarté** : score montré au patient (orthosomnie) ; facteurs/fréquence/aide dans l'indice (expositions) ; conversion des classes d'éveil v1.

**Revue adversariale** : no-go initial, 4 constats bloquants confirmés et corrigés (compte de réveils réécrivant l'éveil, indice sur 1 nuit/21, pondération changeant le score sans agenda, éveil du matin mal dessiné).

**Merge** : conflits CRLF/LF + collision de version v5 résolus ; 3 tests mis à jour (bump version, garde « aucune réponse », B→D). `verify` vert (9 min 23), squash-mergée.

**Prochaine action** : confronter les 7 gestes obligatoires du matin à l'assiduité d'une première cohorte.

**Questions ouvertes** : `test:worktree` rend 0 quand PostgreSQL ne démarre pas ; `portail-google.spec.ts` dépend du `.env.local` local (2 E2E rouges hors périmètre) — deux chips spawn ouverts.

## 2026-07-29 — Rayon corpus par notebook (#441), certification, ingestion NB02

**Décisions** : rayon compléments filtré par **notebook** via `filter_source_ids` (décision 7 : ni migration ni backfill) — PR #441 mergée, `verify` vert, revue `wn-reviewer` GO, prod OK (étagère micronutrition = 796 VALIDE). Gates 08/10 armées (Vercel) ; NB10 complété (5 sources, 121 claims) et NB02 Sommeil ingéré (LOT_009 : 108 chunks, 671 claims EN_ATTENTE), tous deux poussés Drive.

**Écarté** : backfill `metadata.rayon` (écriture prod inutile, filtre notebook déjà tranché) ; certifier Q_ALI_03/Q_NEU_06 (décalage source↔servi confirmé → arbitrage clinique) ; Conners Q_PED_02/03 (hors registre + droits tiers).

**Validations** : T1 vert, `rayonCorpus.test` 11/11, contrat SQL, `execute_sql` (0 orphelin partout). Instruments propres : Q_SOM_09, Q_STR_06, Q_PED_01.

**Prochaine action** : validation praticien des claims EN_ATTENTE (NB01/NB02) — c'est le levier, pas l'ingestion.

**Questions ouvertes** : droits + curation registre Conners ; arbitrages Q_ALI_03/Q_NEU_06 ; lacune #438 (filtrer les assignations côté serveur, pas le plafond 40).

## 2026-07-29 — Trois points ouverts : cohorte gestes du matin, test:worktree, E2E .env.local (PR #444 mergée)

**Décisions** : #1 (assiduité aux 7 gestes du matin) non actionnable — agenda Q_SOM_09 assigné à 1 seul patient en prod, 0 nuit soumise, pas de cohorte à mesurer. #2 : le « test:worktree rend 0 » ne se reproduit pas (code de sortie déjà 1, prouvé bout-en-bout) ; la vraie cause du chip est que PostgreSQL ne démarre pas sur macOS sans locale (« postmaster became multithreaded during startup ») → corrigé par `LC_ALL=en_US.UTF-8` (macOS seul). #3 : `webServer.env` fuitait le vrai client OAuth patient via `...process.env` → neutralisé (`''`), `portail-google` 6/6 vert sous pollution réelle. PR #444 (2 commits), `verify` vert 10m20, mergée squash, worktree nettoyé.

**Écartées** : toucher au code de sortie du script (déjà correct) ; corriger le flake `portail-lien-magique` iPhone 13 (hors périmètre, vert en CI).

**Prochaine action** : assigner l'agenda sommeil à une vraie cohorte — préalable opérationnel avant toute mesure d'assiduité aux gestes du matin.

**Questions ouvertes** : le « rend 0 » observé venait-il d'un pipe/wrapper (poste PC) ? ; checkout principal 38 commits derrière `origin/main` (noté en mémoire — lire/corriger depuis un worktree off `origin/main`).

## 2026-07-30 — Cadran nuit : interaction réparée (#459, #467) + atteignabilité du corpus sommeil

**Décisions** : correctif d'interaction seul sur `CadranNuit`. Cause racine : le
hit-testing SVG suit l'ordre de peinture — le cercle porteur du handler était
peint **sous** le cercle visible, donc injoignable, et le `<svg>` n'avait aucun
`onPointerDown`. Réparé par handlers à la racine + prise par **distance
euclidienne** à la poignée, décalage de prise conservé, zone morte centrale,
capture sur nœud stable, garde multi-pointeurs. #467 solde les 8 constats non
bloquants : rotation des ex æquo, projection `meet` réelle, filet
`lostpointercapture`, garde d'égalité, 3ᵉ E2E discriminant. 23 tests jsdom + 3
E2E, 7 mutations tuées, `verify` vert (10m05 / 9m56), les deux mergées, prod READY.

**Écartés** : fenêtre de rattrapage J-2 et amorçage local (hors périmètre
demandé) ; `prettier --write` (pas le formateur du dépôt) ; ordre des deux
règles d'ex æquo (improuvable tant que le parent applique les valeurs — écrit
dans le banc).

**Revue adversariale** : NO-GO initial — un swipe de défilement sur le cadran
écrivait une heure de coucher fausse (défaut que **j'avais introduit** : prise
bornée en angle seulement). Mes tests passaient **avec** trois des défauts ;
corrigés puis re-prouvés par mutation. Le relecteur s'est trompé une fois (total
E2E), vérifié plutôt que « corrigé ».

**Claims sommeil** : NB02 = 671 claims, **tous VALIDE**, 28 sources, 336
prescriptifs. Corpus : 4671 VALIDE, reste 221 EN_ATTENTE (12 sources de NB04
Humeur).

**Prochaine action** : décider quel écran clinique citera le corpus sommeil —
`RAYON_VERS_NOTEBOOK` ne déclare que micronutrition/biologie/nutrition, aucun
rayon `sommeil`, et le seul consommateur d'UI est câblé en dur sur
`micronutrition`. Validation nécessaire mais **non suffisante** : c'est la classe
de #441 remontée d'un cran (pas d'étagère du tout).

**Questions ouvertes** : tenue du glisser sous WebKit (test iPhone réel, seul
juge) ; comment le patient défile une page dont les ~300 px hauts portent
`touch-action: none` ; la route `claims/recherche` n'a aucun appelant.

## 2026-07-30 — Corpus RAG : ingestion NB03/NB04, validation, NB00 bibliothèque

**Décisions** : NB03 « Stress » (BATCH_010 : 83 chunks, 486 claims) et NB04 « Humeur »
(BATCH_011 : 102 chunks, 621 claims) ingérés + poussés Drive ; praticien a tout validé le
07-30 → corpus 100 % (4892/4892 VALIDE, 0 sans signature). NB00 « Gouvernance » extrait +
poussé Drive **sans injection RAG** (0 chunk/0 claim, vérifié `execute_sql`) — bibliothèque
miroir, exclu du RAG clinique. `--validate` avant chaque POST prod, dry-run avant chaque push.

**Écarté** : accepter le trou de couverture NB04 (4 chunks tombés en 529 Overloaded Anthropic,
sautés sans retry par `draft.mjs`) → re-draft des sources touchées en batch distinct + fusion
par source (621 claims, 4 chunks récupérés) avant le POST.

**Prochaine action** : ingérer NB05 (Cognition) sur go explicite. Rappel : « validé ≠ servi » —
NB02/03/04 validés mais sans rayon (`RAYON_VERS_NOTEBOOK` = 08/09/10 seuls).

**Questions ouvertes** : ajouter des rayons Stress/Humeur/Sommeil = décision produit ?
branchement manuel NotebookLM (00/02/03/04) restant.

## 2026-07-30 — Carnet alimentaire, lot 3 : journée repère et bilan de calibrage (PR #447 mergée)

**Décisions** : la trace d'essai dit si l'action a tenu, pas à quoi ressemble une journée — d'où la journée repère, unique par date et par épisode, c'est cette unicité qui rend la couverture calculable. Le régime `calibrage`, typé depuis JA5-01 et jamais produit par aucune surface, devient l'avant-protocole : un patient sans protocole diffusé n'avait, depuis le lot 2, que des notes locales intransmissibles. Le moteur de couverture est inclus sur arbitrage du praticien — retour assumé sur « affichage d'abord, aucun moteur » (A7-11), sur ce point seul ; il suggère et ne conclut jamais que l'observation suffit. Moment approximatif retenu, pas l'heure réelle.

**Écarté** : dériver le régime du type d'action du protocole (une devinette à conséquence clinique) ; un champ de régime déclaré par le praticien (contrat de diffusion à toucher, carnet inatteignable en attendant).

**Corrigé au passage** : `joursSansTrace: traces.length === 0 ? 7 : 0` — un 7 en dur qui ne comptait aucun jour.

**Validations** : T1 vert ; Vitest complet vert (296 fichiers, 2537 tests) ; E2E impossibles dans cet environnement (proxy refusant `cdn.playwright.dev`) ; `verify` vert avant merge.

**Prochaine action** : dériver le `DietaryObservationProfile` — les journées sont capturées et comptées, le profil qui les résume reste à écrire.

**Questions ouvertes** : le praticien ne voit que le **nombre** de journées transmises, pas leur couverture ; le bilan de calibrage n'est pas borné dans le temps côté serveur ; marqueurs vedettes acceptés par le domaine mais pas encore proposés à la saisie.

## 2026-07-31 — Rayon compléments, phase 1b : le référentiel d'ingrédients (PR #493 mergée)

**Décisions** : le pivot `supplement_ingredients` cesse d'être vide — c'était le
bloqueur unique du rayon. La nomenclature de 1 955 entrées ne se signe plus à la
main : le praticien a objecté que tout vient de la même base, et il avait raison —
le référentiel officiel Compl'Alim couvre 100 % des 883 libellés chimiques, 1 021
espèces végétales et 61 micro-organismes du catalogue. Migration additive
(4 colonnes de provenance, 4 CHECK, 2 index), voie d'ingestion interne, outils de
moisson et d'ingestion.

**Écarté** : l'unicité côté forme (69 formes officielles relèvent de plusieurs
substances — « D-pantothénate de calcium » = B5 ET calcium ; l'index unique aurait
fait échouer l'ingestion en ayant l'air d'un durcissement).

**Revue adversariale : NO-GO, trois bloquants, tous corrigés.** L'appariement d'une
forme se faisait par un `code` dérivé du libellé — un renommage amont aurait créé un
doublon, l'ancienne ligne subsistant, et les compositions seraient restées
accrochées à l'obsolète. Le `code` d'une entrée existante était réécrit : un
homonyme apparaissant en amont aurait renommé « selenium », désappariant en silence
un drapeau de sécurité. Et la garde anti-détournement n'existait que côté ingrédient.
Trois branches qu'aucun test n'atteignait sont maintenant couvertes.

**Validations** : T1, T3 complet (contrats SQL inclus), `verify` vert 9 min 50 s.
Base de production relue après merge : migration appliquée en une tentative,
structure conforme, 0 ingrédient écrit — le lot n'ingère rien, par conception.

**Prochaine action** : lot 1c, le sélecteur d'ingrédient de `/dashboard/regles`.
Il sert aujourd'hui tout le vocabulaire actif dans un `<select>` nu, sans recherche
ni pagination : sans lui, l'ingestion rendrait l'atelier de règles inutilisable.
**Le sélecteur doit précéder l'ingestion.**

**Questions ouvertes** : les données moissonnées ne sont plus sur disque (relancer
`moisson.mjs`, ~20 min). Le référentiel n'est publié sous aucune licence énoncée —
intégration décidée en connaissance de la lacune, à réexaminer. Les contrats
`c4_supplement_catalogue_v1.sql` et `c4_clinical_rules_lignee_v1.sql` ne sont
câblés à aucun workflow : ils ne gardent rien aujourd'hui.

## 2026-07-31 — Agenda du sommeil : campagne close côté code (#492, #476, #495, #496)

**Décisions** : seuil de relance posé — « on ne relance jamais pour une nuit que le
patient peut encore noter ». `nuit_du_jour_manquante` sort de `relancable` (le bouton
s'affichait dès 00 h 05 sur un patient à jour, alors que `estDateSaisissable` lui laisse
jusqu'à demain matin) ; délai de grâce de 2 jours au démarrage ; règle appliquée aussi
côté serveur via le même prédicat exporté (#495). Défilement du cadran rendu à la page :
blocage décidé geste par geste par un `touchmove` non passif, plus par `touch-action`
figé au premier contact — `touch-none` couvrait 300 × 300 px pour 8-15 % d'utile (#496).
Rayon `sommeil` déclaré (#476), fuseau E2E corrigé (#492).

**Écartés** : `pan-y` sur la racine (casse le glissement aux flancs) ; `touch-action` sur
des `<circle>` SVG (ne s'y applique pas, et reconduit le piège d'ordre de peinture de
#459) ; compter les trous antérieurs (seule la série en cours compte, verrouillé par test).

**Revues** : deux GO, chacune sur un test qui ne prouvait rien — la borne J-2 absente
(l'off-by-one passait vert), et un garde `e.cancelable` dont l'assertion était vraie par
construction. Six mutations éprouvées ensuite.

**Prochaine action** : essayer le glisser sur un iPhone réel — seul juge du postulat
WebKit de #496 ; à défaut, dégradation propre bornée à un cran de 15 min.

**Questions ouvertes** : aucun écran ne consomme le rayon `sommeil` (`FicheComplementPanel`
code `micronutrition` en dur) ; aucun agenda n'a atteint le seuil de scoring en production
(max 3 nuits sur 7 requises, 9 assignations ouvertes) ; le panneau praticien n'a aucune
couverture navigateur.

## 2026-07-31 — Carnet lot 4 (#485) et agenda alimentaire lot 1 (#481)

**Décisions** : le carnet praticien cesse d'affirmer sans savoir — les trois phrases
en dur retirées, le bloc calibrage suit désormais la **dernière** transmission,
chargée d'office et nommée avec sa date. Quatre lecteurs réels remplacent des casts
`as` qui ne validaient rien : une trace au `localDate` objet faisait tomber le panneau
entier. Le carnet reste qualitatif ; l'instrument de mesure sera `Q_ALI_09`, dont le
domaine pur est posé (fenêtre 21 jours, seuils à quatre étages, agrégats `null` jamais 0).

**Écartés** : le moment approximatif pour l'agenda (l'heure réelle est la condition écrite
du déverrouillage de la frontière C5) ; les quantités et toute reconstruction d'un SIIN.

**Revues** : GO conditionnel sur L1 (7 constats, dont une fenêtre hors bornes qui excluait
la journée entière et 21 jours vides déclarés exploitables) ; **NO-GO** sur le lot 4 — une
fausse absence installée là où une fausse présence venait d'être retirée. Tout corrigé.

**Prochaine action** : agenda L2 (catalogue + scorer, drapeau éteint) — mais quatre
arbitrages précèdent L5 : poids 2/1, barème des cinq axes, frontière C5, borne des 18 h.

**Questions ouvertes** : `GenericQuestionnaire.test.tsx` fait échouer T2 **avant**
Playwright deux fois sur trois (timeout 5 s, 12-15 s sous charge) ; un palier qui s'arrête
avant les parcours qu'il vérifie ne protège plus. Le checkout principal était 29 commits
en retard en début de session.

## 2026-07-31 — Rayon compléments, lot 1c : le sélecteur d'ingrédients (PR #499 mergée)

**Décisions** : le verrou avant l'ingestion Compl'Alim est levé. `GET
/api/praticien/regles/vocabulaire` borne les ingrédients à 50, cherche sur nom
ET code, rend `ingredientsTotal` ; `ingredientId` hydrate un ingrédient hors
recherche. Champ de recherche à la place du `<select>` nu. Seuls les ingrédients
sont bornés — intentions, critères et sources sont gouvernés à la main et
restent entiers, fixé par un test.

**Trois pièges d'une même famille** : une liste d'options qui rétrécit fait
mentir un champ déjà rempli. Le `<select>` retombe sur sa première option
pendant que l'état garde l'ancienne valeur — et c'est celle-là qui part.

**Écarté** : hydrater la révision en agrégeant les ingrédients des règles de la
page (couplerait le vocabulaire au rechargement de la liste) ; borner aussi
intentions/critères/sources (refactor non demandé, aucun déversement externe ne
les alimente) ; inventer une sémantique ARIA de combobox, absente du dépôt.

**Revue adversariale : NO-GO**, deux défauts réels. (1) `export const
INGREDIENTS_MAX` dans un `route.ts` fait échouer `next build` — **invisible de
T1**, `tsc --noEmit` n'incluant `.next/types` que si le dossier existe : la PR
serait partie rouge en CI sans qu'aucun palier local ne l'annonce. (2) Le repli
sur la forme préférée courante ne couvrait que `formes === null` ; le cas
« hydratation réussie sans elle » — ingrédient désactivé, liste vide sans être
`null` — lui échappait, et `POST /regles/revision` ne vérifiant que la forme, la
valeur fantôme aurait été écrite au référentiel.

**Validations** : T1 vert ; T3 vert, trois échecs E2E `portail-lien-magique`
**identiques à une exécution de la même suite sans le diff** (mesuré) ; épreuve
au plafond réel (50 × 10 formes) ; sept gardes vérifiées par mutation ; `verify`
vert 9 min 52 avant merge.

**Prochaine action** : l'ingestion elle-même, sur go explicite — moisson (~20
min, données plus sur disque), dry-run, puis ingestion réelle.

**Questions ouvertes** : tri alphabétique sur un `contains` et non un
`startsWith` ; aucun E2E sur `/dashboard/regles`, à écrire après l'ingestion
seulement ; `SESSION_LOG.md` du checkout principal divergent de `origin/main`
(entrées non committées de plusieurs sessions).

## 2026-07-31 — Rayon compléments : le référentiel est ingéré (PR #500 mergée)

**Fait** : 3 444 ingrédients et 665 formes en production, provenance
`complalim`. Le pivot `supplement_ingredients`, vide depuis l'origine, ne l'est
plus — c'était le bloqueur unique du rayon.

**Le compte n'est pas celui annoncé** : 3 444 et non ~1 965. Ce dernier chiffre
comptait les libellés *employés par le catalogue* ; le référentiel officiel est
plus large. Restreindre exigerait les compositions, qui ne sont pas chargées —
et une règle clinique peut précéder le produit qui la porte.

**Garde clinique vérifiée sur la donnée réelle** : « Hydrogénosélénite de
sodium » est rattachée au sélénium ET au sodium, « Iodure de potassium » à
l'iode et au potassium. Une lecture du libellé n'aurait retenu que le second
terme. C'est aussi ce qui justifie l'index non unique côté forme.

**L'incident, et sa vraie leçon** : l'ingestion s'est arrêtée au 3e lot sur 9,
800 ingrédients déjà écrits, sur un code refusé — `slug()` retirait les tirets
de bord avant de tronquer à 80. Deux entrées fautives sur 3 444. Mais le service
valide lot par lot et l'outil ne validait rien : 0,06 % d'entrées mal formées
ont suffi à laisser la base à moitié peuplée, sans avertissement avant le
lancement. `ingest.mjs` valide désormais toute la projection avant le premier
envoi. L'idempotence a tenu à la reprise (800 ingrédients et 628 formes
« inchangés », aucun doublon).

**Écarté** : committer le cache de moisson — aucune licence énoncée, ce serait
le rediffuser ; il passe en `.gitignore`.

**Validations** : `verify` vert 9 min 43 ; base de production relue (3 444 codes
distincts, 0 provenance incomplète, 0 règle / 0 seuil / 0 alerte).

**Prochaine action** : les compositions — les 140 148 fiches restent des
coquilles, le pivot qui les débloque est désormais peuplé.

**Questions ouvertes** : tri alphabétique sur un `contains` dans le sélecteur ;
aucun E2E sur `/dashboard/regles`, désormais écrivable puisque les tables ne
sont plus vides.

## 2026-08-01 — Clôture montée certification 62/64

**Décisions** : la phase de montée (lots 1–4) est déclarée close à 62/64 —
60 `scoring_verifie`, 2 suspendus terminaux — et l'état machine
(`.wn/state.json`, figé au 2026-07-23) est réaligné. Pas de promotion de
Q_GEO_04 : la question n'a pas eu à être arbitrée, le plafond
`contenu_verrouille` posé au registre le 2026-08-01 (bandes HAS 2011 jamais
sourcées, escalade SIIN ouverte) la tranche déjà.

**Écarté** : transcrire la signature praticien dans `droits.detail` — déjà fait
par #515/#516, le cadrage initial du sous-agent était en retard sur le registre.

**Prochaine action** : arbitrages praticien — Q_PED_03 (dimensions et échelles
de validité), table de règles signée conditionnant les lots 5–13.

**Questions ouvertes** : la source des « gates G0–G4 » affichés par le contexte
compact reste introuvable (`.wn/orchestrator.json` n'en porte aucun).

## 2026-08-01 — Arbitrages praticien : Q_PED_03 et orientation adaptative

**Décisions** (praticien, en session) : Q_PED_03 reste `suspendu` — rouvrir sur
usage seulement, avec le scoring dimensionnel complet (4 dimensions, 2 échelles
de validité, seuils source), jamais la somme brute. Axe orientation lancé :
lot 7 autorisé (sans gate), lot 8 ensuite avec ses gates (coût API, écriture
prod, validation claim par claim) ; signature de la table de règles au lot 9.

**Écarté** : reconstruction immédiate du scoring Conners (aucun usage en
production) ; recueil non scoré (sans restitution, peu de valeur).

**Prochaine action** : le cadrage a montré le lot 7 DÉJÀ LIVRÉ (#361,
2026-07-25, dormant fail-closed) — passer au cadrage du lot 8 et à la
confirmation de ses gates avant toute exécution.

**Questions ouvertes** : source des « gates G0–G4 » du contexte compact,
toujours introuvable.

## 2026-08-01 — Lot 8 : décision f amendée, gates confirmés

**Décisions** (praticien, en session) : question f close en AMENDANT A-009 pour
l'orientation — seule la perfusion reste exclue ; sevrages médicamenteux,
psychotropes et Alzheimer réintégrés dans le drafting, chaque claim restant
soumis à la validation individuelle (voie lente, D-003). Coût accepté
(~11-17 $ / 106 fiches) ; premier lot d'ingestion : sommeil complet
(17 fiches), pas de pilote préalable.

**Écarté** : pilote 1-2 fiches avant volume (choix praticien) ; exécution du
pipeline depuis cette session (secrets et PDF n'existent que sur le Mac).

**Prochaine action** : après merge de #517, PR de préparation lot 8 —
`metadata.usage='orientation'` dans draft.mjs, filtre A-009 amendé, runbook
Mac — puis run d'ingestion sommeil sur le poste local.

**Questions ouvertes** : « gates G0-G4 » du contexte compact, toujours sans
source identifiée.

## 2026-08-01 — PR #517 mergée ; préparation lot 8 dans le dépôt

**Décisions** : #517 mergée (squash 3d406d5) sur demande du praticien, branche
repartie de main. Préparation lot 8 : `--usage orientation` dans draft.mjs
(clé metadata.usage, passe-plat serveur couvert par trois tests),
filtre par construction dans lib/filtre-orientation.mjs (quarantaine ≠
décision f ; perfusion WN-SRC-0244 seule exclusion A-009 restante), banc
branché dans run-certify-bancs.sh (exige des bancs dans les deux dossiers),
runbook du run sommeil (12 PDF ingérables sur 17 — 4 MP4 à transcrire,
WN-SRC-0318 en quarantaine).

**Écarté** : corriger le trou d'immuabilité de metadata dans store.ts
(documenté au runbook, changement minimal) ; T2 local (téléchargement
Playwright bloqué par la politique réseau — verify CI fait foi, aucun code
runtime web touché).

**Prochaine action** : PR draft, CI, puis run sommeil sur le Mac.

## 2026-08-01 — Clôture de session : #517 et #518 mergées, main prêt pour le run sommeil

**Décisions** : #518 mergée (squash 2ddeb52) sur demande du praticien après
verify vert lu. La journée livre : montée en certification close (62/64),
Q_PED_03 arbitré (suspendu), décision f close (A-009 amendé : perfusion seule
exclue), pipeline prêt pour le lot 8 (marquage usage, filtre par construction,
banc branché, runbook).

**Écarté** : réécrire 2ddeb52 signalé par le stop-hook — c'est le commit de
squash GitHub sur main, pas un commit local ; faux positif récurrent
post-merge.

**Prochaine action** : run sommeil sur le Mac (`tools/corpus/claims/README.md`,
12 PDF, ~2-3 $), puis validation claim par claim dans l'Atelier, puis lot 9.

**Questions ouvertes** : source des « gates G0-G4 » du contexte compact,
toujours inconnue ; entrée DECISIONS.md pour l'amendement A-009 (proposée, en
attente d'accord).

## 2026-08-02 — CERT-Q LOT-03 handoff

**Décisions** : LOT-03 terminé pour CERT-Q ; les lots 01 à 03 sont consolidés,
avec distinction explicite entre l'état daté 62/64 (2026-07-29) et le registre
courant 64/64. Le handoff campagne est produit, sans changement de scoring.

**Écarté** : suppression automatique des branches historiques ; aucune branche
supprimée dans ce lot.

**Prochaine action** : arbitrer `feat/mini-synthese-par-rubrique` (PR #372),
puis confirmer séparément le nettoyage des 20 branches candidates.

**Questions ouvertes** : intégration amendée ou clôture sans merge de PR #372.

## 2026-08-02 — CERT-Q PR #372 validée et lot clôturé

**Décisions** : l’arbitrage PR #372 a été intégré avec amendements minimes :
mini-synthèse rétablie, helper de coupe remis au bon scope, métadonnées de
campagne complétées, et couverture ajoutée pour le second marqueur de coupe.
T1, T3 et les tests ciblés sont verts ; la revue indépendante n’a relevé qu’un
point de vigilance déjà traité côté commit (inclusion des nouveaux fichiers
`rubriques.*`).

**Écarté** : élargir le changement au-delà de l’intégration amendée de
`feat/mini-synthese-par-rubrique`.

**Prochaine action** : commit/push de la branche de campagne puis éventuel
nettoyage des branches candidates, si confirmé séparément.

**Questions ouvertes** : aucune sur le fond technique ; reste la décision de
gouvernance sur le nettoyage des branches.

## 2026-08-02 — CERT-Q arbitrage final de la branche restante

**Décisions** : `feat/mini-synthese-par-rubrique` est arbitrée en faveur d’une
intégration amendée dans la branche de campagne `campagne/certification-questionnaires-consolidation`.
Le périmètre reste dans CERT-Q, sans lot scoring séparé.

**Écarté** : clôture sans merge de la branche restante.

**Prochaine action** : gouvernance du nettoyage séparé des branches candidates.

**Questions ouvertes** : aucune sur la branche restante ; reste le nettoyage.

## 2026-08-02 — CERT-Q nettoyage des branches candidates exécuté

**Décisions** : les 20 branches candidates de CERT-Q ont été supprimées localement
et à distance quand les refs distantes existaient déjà ; la branche de campagne
reste seule porteuse du consolidé.

**Écarté** : conserver les branches candidates après arbitrage.

**Prochaine action** : aucune côté CERT-Q, hors éventuelle revue de sécurité du
nettoyage si demandée.

**Questions ouvertes** : aucune.

## 2026-08-02 — Rayon compléments : lot d’ingestion/référentiel stabilisé

**Décisions** : le lot a été bouclé sur le périmètre API et documentation du rayon
compléments, avec une réponse d’erreur cohérente `ok: false` sur les payloads
invalides des routes internes d’ingestion/référentiel.

**Écarté** : ouvrir une nouvelle surface fonctionnelle ou modifier la logique
clinique ; la stabilisation est restée bornée aux routes et à la campagne.

**Prochaine action** : poursuivre la campagne sur un autre périmètre concret si
nécessaire, par exemple l’activation métier ou une validation complémentaire.

**Questions ouvertes** : l’activation métier du rayon reste à cadrer avec le
produit et la gouvernance.

## 2026-08-02 — Claims orientation : levée de quarantaine prescriptive

**Décisions** : la quarantaine d’orientation ne bloque plus les sources
prescriptives du périmètre ; 8 sources réintégrées, la perfusion reste exclue.
Le filtre, le contrat SQL de périmètre et les bancs de régression ont été mis
en cohérence.

**Écarté** : lever la quarantaine pour les sources non prescriptives.

**Prochaine action** : aucune immédiate sur le fond technique.

**Questions ouvertes** : aucune.

## 2026-08-03 — Nettoyage branches biologie (CB) + cadrage campagne CB-03→CB-09

**Décisions** : audit des branches liées au rayon biologie — CB-00 à CB-02b
déjà fusionnées en production (#364, #369, #374, #381, #394, #433) ; 9
branches locales obsolètes supprimées (remote déjà « gone »), 1 worktree
retiré. Campagne `2026-08-02-rayon-biologie-cb` créée (LOT-00→LOT-06,
numérotation métier CB-03→CB-09 conservée en contenu) : PR #525 mergée
(squash 6f8e23a) après correction CI — les id de lot doivent respecter
`LOT-\d{2}` (garde-fou `wn-campaign-audit.mjs`), pas de préfixe libre.

**Écarté** : activer la campagne (`--activate`) — CB-03 est bloqué sur les
lots 8-9 de la certification (table NNPP2 signée), encore en cours.

**Prochaine action** : vérifier l'état des lots 8-9 certification avant
d'ouvrir CB-03 ; sinon reprendre le run sommeil (lot 8) puis lot 9.

**Questions ouvertes** : promotion proposée — `scripts/wn-campaign.mjs
create --prefix` permet un id de lot hors format `LOT-NN`, non détecté avant
CI ; à corriger dans le script ou documenter dans le skill (en attente
d'accord).

## 2026-08-03 — Kit `wn` : reprompting, et le garde qui ferme la classe

**Décisions** : `/wn-reprompt` créé et branché dans six skills (#529) — contexte
isolé, sortie ≤ 180 mots, `PASSE` par défaut, un reformulage inutile coûtant le
tour qu'il prétend économiser. Son drapeau `disable-model-invocation` rendait ces
six branchements inexécutables : levé (#530), deuxième exemption assumée après
`wn-route`. Un garde bloquant ferme la classe (#532) et a trouvé une troisième
instance — `wn-route` ordonnait d'invoquer `/wn`, `/wn-model`, `/wn-ultra`, tous
porteurs du drapeau.

**Écarté** : inscrire le reprompting dans `CLAUDE.md` (le ferait payer à toutes
les sessions, y compris celles dont la demande est claire) ; lever trois drapeaux
de plus pour `wn-route` (remplacé par un `Read` ciblé du fichier de grille) ; un
garde épinglant toute mention de skill (mur de faux positifs sur les routeurs).

**Prochaine action** : aucune en attente.

**Questions ouvertes** : aucune. Notice d'exploitation du kit publiée en artefact.

## 2026-08-03 — Campagne packs/moteur d'intervention + LOT-00 registre des interventions

**Décisions** : campagne cadrée et mergée (#531, 8 lots), puis LOT-00 livré (#534).
Le cadrage a corrigé trois points de la demande : la certification était déjà close
(#528), le moteur d'orientation existe mais sa table est vide et n'a aucun appelant,
et l'assouplissement du fail-closed visait un blocage mal situé. LOT-00 a produit
`docs/claude/corpus/nnpp2_interventions_registry.json` — 95 sources, 2002 claims —
et son garde `npm run interventions-check` (26 cas, un échec prouvé par invariant).

**Écarté** : partir du motif de TITRE pour désigner les sources d'intervention. Le
champ structuré `documentType` du registre sanitaire prime — le titre ratait 51
sources sur 99, dont toute la doctrine d'exploration. Écarté aussi : l'Atelier v2
comme prérequis (hors chemin critique), et « l'IA propose un pack » (elle restitue,
elle ne décide pas).

**Prochaine action** : LOT-01 (755 claims à valider, geste praticien), ou LOT-03 /
LOT-04 en parallèle du chemin critique.

**Questions ouvertes** : la validation praticien de la pré-classification des 95
sources reste due. Et le champ `prescriptive` de `source_registry.json` est faux sur
52 des 95 sources — 640 claims prescriptifs déclarés non prescriptifs, erreur
toujours dans le même sens ; aucun code ne le lit, mais la sous-déclaration
mériterait d'être instruite à la source.

## 2026-08-03 — LOT-03 : le moteur d'orientation ne pouvait proposer aucun pack

**Décisions** : correction d'un défaut structurel (#536). Les `PackId` du code et
les `id_pack` de la base formaient deux espaces de noms disjoints ; la route
d'orientation les comparait directement, donc `compositionPacks` restait vide et
le fail-closed rejetait TOUTE recommandation de pack. Traduction posée dans les
deux sens, réponse enrichie de l'`id_pack` attendu par l'assignation. Option C
retenue : `packs.qids` fait foi pour la composition, le code ne gouverne que
l'identité. Repli legacy qualifié par cause — seule une divergence réelle alerte.

**Écarté** : le correctif du `niveau` dans `syncPackToRegistry`, retiré à la revue
— il n'atteignait pas les packs existants (sync déclenché à l'édition seulement)
et aucun code ne lit `questionnaire_packs.niveau`. Écarté aussi : aligner
`estAdministrableParLaRoute` sur `IDS_ASSIGNABLES` — arbitrage clinique, et le
risque est théorique (aucun instrument à passation praticien dans les 6 packs de
doctrine, vérifié en base).

**Prochaine action** : LOT-04 (structuration de l'intake), sans dépendance, ou
LOT-01 (validation praticien des 755 claims).

**Questions ouvertes** : `estAdministrableParLaRoute` ne vérifie pas `actif`
contrairement à `IDS_ASSIGNABLES` — à trancher avant que des packs contenant des
instruments à passation praticien existent. Et 10 des 16 packs de doctrine
n'existent pas en base : les créer est une décision produit.

## 2026-08-03 — LOT-04 : drapeaux d'anamnèse typés (recadré)

**Décisions** : le « schéma d'intake » demandé existait déjà (motifs, formulaire
à options fermées, parsing défensif en texte). Livré le résiduel réel : extraction
typée `extraireDrapeauxAnamnese` (8 drapeaux), valeurs autorisées lues
dynamiquement dans `ANAMNESE_SECTIONS` plutôt que dupliquées — évite toute
divergence de libellé. Revue `wn-reviewer` a trouvé et fait corriger deux défauts
avant clôture : tests tautologiques (remplacés par des libellés figés en dur,
garde anti-dérive) et un filtrage borné à 50 éléments bruts avant dédup (réécrit
pour itérer sur l'énuméré, ordre canonique).

**Écarté** : ajouter un champ `signauxAlerteNonReconnus` pour distinguer un signal
hors énuméré d'un signal absent — pas de consommateur (LOT-05 non écrit), aurait
anticipé un besoin hypothétique. Documenté en commentaire de type à la place :
`signaux_alerte` filtré n'est pas la garantie de sécurité, `extraireVigilanceDeterministe` (non filtré) l'est toujours.

**Prochaine action** : LOT-05 (table de règles d'orientation, dépend de LOT-03 +
LOT-04) ou LOT-01 (validation praticien des 755 claims).

**Questions ouvertes** : LOT-05 devra trancher explicitement si `signauxAlerte`
peut porter une décision de sécurité malgré son filtrage silencieux.

## 2026-08-03 — LOT-05 : table de règles d'orientation V1

**Décisions** : `ORIENTATION_RULES_V1` remplie de six règles adossées à neuf
claims `VALIDE` vérifiés en base, et **volontairement non signée** — écrire les
règles et les signer sont deux gestes, le second est praticien. La route reste
donc fail-closed. Le moteur sait enfin lire les drapeaux d'anamnèse (LOT-04, qui
n'avait aucun consommateur). Trois arbitrages praticien : la bande d'entrée se
choisit **instrument par instrument** (PSQI à `info`, au-dessus de son seuil
publié de 4 ; PSS-10 et TFD à `warning`, déjà leur première bande défavorable) ;
`signauxAlerte` ne porte aucune règle, non parce qu'il est filtré — tous le
sont — mais parce qu'un signal d'alerte appelle un adressage, quand la table ne
sait produire qu'une exploration ; une déclaration seule propose un instrument,
jamais un pack (R-ANA-01 alignée sur R-STR-02).

**Quatre défauts silencieux corrigés** : `OrientationZone` ignorait `dark`
(patients « Très sévère ») et `info` — le même trou aux deux bouts ; le moteur
traitait une composition de pack inconnue comme autorisée, à rebours de son banc
(la route refiltrait, donc aucune recommandation erronée n'en est sortie) ; la
route retenait la consultation la plus récente, or une consultation naît sans
anamnèse — les règles de drapeau se seraient tues dans la fenêtre exacte où le
praticien regarde l'orientation.

**Écarté** : signer la table dans la même PR ; citer les `sourceId` du registre
faute de `claimId` (le registre LOT-00 n'en contient aucun — ils ont été lus en
base) ; cibler `pack_humeur_motivation_neurochimie`, inactif en base.

**Deux revues adversariales, deux NO-GO levés.** La seconde a trouvé une erreur
factuelle : j'avais écrit que le test de Cungi n'était pas au catalogue et fait
proposer le PSS-10 à sa place, alors que Cungi **est** `Q_STR_03`, actif — la
règle propose désormais ce que le claim désigne. Elle a aussi trouvé un
commentaire affirmant un incident qui n'avait pas eu lieu, et trois bancs qui ne
mordaient pas.

**Prochaine action** : LOT-06 (consommateur praticien) ou la signature de la
table après relecture clinique des six règles.

**Questions ouvertes** : (1) **la surface qui affichera un signal d'alerte sans
le traiter comme une exploration reste à écrire** — c'est un lot dédié, et le
commentaire de `orientationRulesV1.ts` y renvoie ; (2) aucun banc ne confronte
les `claimId` à `rag_corpus_claims` (pas de base en Vitest) : la vérification
reste manuelle avant chaque signature ; (3) 10 des 16 packs de doctrine n'existent
toujours pas en base, et `PACK_HUMEUR_NEURO` y est inactif.

## 2026-08-03 — Fenêtre de clôture d'un lot : `scripts/wn-cycle.mjs`

**Décisions** — La clôture (`/wn-finish`) et le handoff (`/wn-handoff write`)
s'écrivent sur la branche vivante et partent dans la PR du lot. Le merge étant
un squash, la frontière n'est pas la suppression de la branche mais le merge
lui-même. Un script rend la phase du cycle et sort en échec quand la fenêtre est
fermée ; il est chargé par le bloc `!` de `/wn-finish` et `/wn-handoff`, seul
chaînage exécutable entre skills (`disable-model-invocation: true` interdit
l'invocation croisée). Correctif au passage : `writeActiveCampaignView()`
tronquait le garde « cette vue est générée » dans sa branche idle.

**Écarté** — Écrire le handoff après le merge et avant le nettoyage (fenêtre
inexistante) ; une PR de doc séparée par défaut (deux PR par lot) ; un contrôle
CI bloquant réclamant le handoff (bloquerait les correctifs urgents).

**Validations** — banc 15/15, cross-invocation 0, audit campagne 0, anti-secrets
0, T1 vert (70 tests). Chemin `gh` vérifié sur les PR réelles #545/#547/#548.

**Prochaine action** — Ouvrir la PR, lire `verify`.

**Questions ouvertes** — `--appliquer` écrit `git.branch` dans `.wn/state.json` :
un nom de worktree éphémère, donc du bruit et un conflit potentiel entre
sessions parallèles si on le committe. Non committé ici.

## 2026-08-03 — LOT-06 : consommateur praticien de l'orientation, restitution IA

**Décisions** : la route d'orientation a enfin un appelant — encart dans l'onglet
Trajectoire (canal fiche, au présent seulement). L'évaluation quitte `route.ts`
pour `orientationService.ts`, dont la synthèse est le second consommateur. Aucun
bloc n'est injecté sans recommandation, **mais la consigne système est
inconditionnelle : toutes les synthèses de production partent désormais en
`synthese-v14` sans qu'aucun bloc n'ait jamais été transmis** — le discriminant
est `donneesEntree.orientationInjectee`. La table du LOT-05 reste non signée :
l'écran affiche « en cours de constitution ».

**Écarté** : neutraliser la synthèse sur écart de restitution (on journalise —
l'objet actionnable vient de la route) ; ouvrir `packs/assign` à `idPatient`.

**Deux NO-GO adversariaux levés** : un garde tournant à allowlist vide qui
accusait quatre syntagmes cliniques ordinaires, l'accusation persistée au
dossier ; puis un e-mail d'assignation pouvant viser le patient **précédent**
(`data` en retard sur `idPatient`), et une phrase affirmant une réception que
l'envoi best-effort ne garantit pas.

**Prochaine action** : signer la table **et** poser `WN_ENABLE_ORIENTATION_NNPP2`
— le verrou est un ET, signer seul n'allume rien. Sinon LOT-01 (755 claims).

**Questions ouvertes** : (1) un écart mesuré par heuristique textuelle a-t-il sa
place dans `donneesEntree` du dossier, ou seulement au journal ? (2) le garde a
quatre angles morts déclarés, dont le réordonnancement — interdit par la
consigne, invérifiable par occurrences.

## 2026-08-03 — LOT-02 clos : rayon `douleur` (notebook 06) et une allowlist reprise en défaut

Le reliquat du LOT-02 attendait la validation du notebook 06. Vérification en base
avant toute écriture : le corpus entier est signé — **8 224 claims actifs, 8 224
VALIDE, 0 en attente**, douze notebooks à 100 %. Le rayon `douleur` est donc branché
(mapping, allowlist, sélecteur, en-tête, doc des flags), et le **LOT-01 est clos sur
preuve** plutôt qu'exécuté : il n'y avait plus rien à valider.

Deux contrôles préalables ont écarté les deux façons dont ce rayon aurait pu être
vide sans erreur : le libellé du mapping correspond à la base au caractère près
(tiret cadratin), et les 651 claims portent 16 `source_id` tous présents dans les 17
du registre.

**Décision de l'utilisateur en séance** : fermer dans cette PR le défaut trouvé par la
revue adversariale — `/api/praticien/complements/corpus` validait `rayon` par regex
seule et servait tout `RAYON_VERS_NOTEBOOK` derrière `WN_C4_ENABLED`, sans consulter
`WN_RECHERCHE_CORPUS_ENABLED`. Le rayon douleur aurait été joignable en production dès
le merge, malgré son lancement dark. Options écartées : dette écrite puis PR séparée,
et statu quo. Allowlist d'un seul rayon désormais ; l'exposition héritée de
`cognition`/`intestin` se ferme avec.

Les listes de rayons refusés des deux routes sont maintenant **dérivées** du mapping :
le prochain rayon ajouté sans allowlist est couvert d'office. T1 vert, T2 vert en
6 min 9 s (E2E compris — la première passe avait rendu le flake connu
`portail-lien-magique`, verte à la seconde sans toucher ce sous-système).

Piège à retenir : le checkout principal était en retard d'un commit, ce qui a fait
lire un `CAMPAGNE.md` périmé et annoncer un écart documentaire inexistant. Lire les
documents de campagne depuis le worktree du lot.

Prochaine action : PR, `verify`, merge. Puis LOT-07, ou la signature clinique des six
règles du LOT-05 — sans elle, le LOT-06 livré n'affiche rien. Questions ouvertes :
`stress`/`humeur`/`sommeil` restent mappés, validés, sans appelant.

## 2026-08-03 — LOT-01 réduit : le garde de la barrière D-003

Décisions — Le cadrage a lu la base plutôt que la fiche : les 755 claims étaient
déjà signés (périmètre 2002/0, corpus actif 8224/0), et #552 avait clos LOT-01
documentairement. Le lot s'est réduit à sa seule pièce manquante : le contrat
`rag_claim_barriere_d003_v1.sql`, qui éprouve `match_wellneuro_rag_claims` par
sept fixtures et assère aussi ce qui empêche de la CONTOURNER (EXECUTE refusé à
anon/authenticated, RLS) — ajout de la revue, qui a vu qu'on prouvait la porte
en laissant la fenêtre.

Écarté — Garder par allowlist les quatre modules qui lisent sans filtrer
`statut` : ce sont l'établi de validation, documentés comme légitimes.

Validations — T1 vert ; sept falsifications, une par assertion nommée ; T3 après
merge de `main`, 12 contrats joués (11 avant). PR #553, `verify` vert 9 min 37 s.

Prochaine action — LOT-07, dernier lot de la campagne.

Questions ouvertes — Un vecteur nul rend `NaN` : les autres contrats du dépôt
copient ce patron, aucun n'a été relu sous cet angle.
## 2026-08-03 — Les blocs `!` des skills ancrés à la racine du dépôt

`/wn-handoff` échouait en `MODULE_NOT_FOUND`. Le diagnostic a montré que le défaut
dépassait de loin le message : les sessions tournent depuis `web/`, et **32 blocs `!`
de `SKILL.md`** désignaient des chemins relatifs à la racine. Mesuré un par un depuis
`web/` : **27 rendaient une sortie vide avec un code de retour 0**, 5 seulement
échouaient bruyamment. `/wn-route`, `/wn`, `/wn-lot`, `/wn-ultra` et les six `/wn-rN`
annonçaient « aucune campagne active » et planifiaient sur du vide.

Les 32 blocs sont ancrés par `cd "$(git rev-parse --show-toplevel)" &&` — vérifié :
depuis un worktree, cette commande rend la racine **du worktree**, donc l'ancre tient
dans le mode nominal. Un contrôle CI (`scripts/lib/skill-bang-cwd.mjs`, banc de 17
cas) le rend durable, hors filtre `docs_only` puisqu'une PR de `SKILL.md` est classée
documentaire.

Décision de conception révisée en cours de route, sur constat de la revue : la
détection **interroge le dépôt** (« ce premier segment existe-t-il à la racine ? »)
au lieu de comparer à une liste fermée de six préfixes, qui laissait passer
`./scripts/`, `web/`, `changelog.d/`, `tools/`, `CHANGELOG.md`. Écarté : ancrer les
30 blocs sans chemin (`git status --short` couvre le dépôt entier depuis n'importe
où) ; documenter la convention dans `CLAUDE.md` (le CI rouge dit déjà quoi faire).

La revue a aussi trouvé que `/wn-auto` lisait `docs/roadmap.md`, **qui n'existe pas** :
le bloc serait resté muet même ancré. Corrigé vers les deux roadmaps réelles.

Garde vérifié **sur l'état d'avant** — rejoué contre les `SKILL.md` de `main`, il rend
exactement 32 violations. Un garde vert sur un dépôt déjà corrigé ne prouve rien.

Prochaine action : PR, `verify`, merge. Puis LOT-07, ou la signature clinique des six
règles du LOT-05. Question ouverte : les blocs `!` d'un même skill partagent-ils un
shell ? Si oui, un seul `cd` en tête suffirait.

## 2026-08-04 — Agenda alimentaire : de l'instrument orphelin à la donnée persistable (L1-bis + L3)

Le domaine pur de l'agenda alimentaire existait depuis le 2026-07-30 sans aucun appelant.
Deux lots l'ont branché : `Q_ALI_09` assignable et non scoré (#554), puis la table, la
persistance et l'effacement RGPD (#557).

**Décidé** — collecte avant calibrage, contre l'ordre d'un audit externe : aucune journée
n'ayant jamais été recueillie, un barème posé maintenant serait une donnée clinique
inventée. L'abstention « je ne sais pas » entre au contrat **v1** (le faire après le
premier patient coûtait une v2 et une fenêtre incomparable à elle-même), par champ, sauf
`soirPlusCopieux`. Et l'agenda **n'alimente pas** le besoin 3, déjà sourcé par
`RYTHME_CHRONO` : la valeur est dans l'écart déclaré/observé, objet séparé.

**Écarté** — brancher l'agenda comme 2ᵉ source du besoin 3 (troisième porteur du mot
« rythme », double comptage) ; les douze indices nutritionnels de l'audit (ajouter des
instruments à un problème d'orchestration) ; déléguer l'exécution à un sous-agent (la
session était déjà sur le modèle de la classe).

**Trois défauts trouvés par la revue adversariale, pas par moi** : `droits: "libre"`
adossé à une revendication non instruite ; un garde de drapeau qui simulait l'absence
par une chaîne vide, donc aveugle au fail-open réel ; et un `rows.map` qui faisait
disparaître tout un agenda pour une ligne illisible — la contradiction exacte que
`jour.ts` refuse en toutes lettres.

**La leçon de méthode** : mes mutations testaient la ligne d'effacement *retirée*, jamais
*déplacée*. Or c'est le déplacement qui casse, et le garde structurel — un
`String.includes` — y est aveugle. Un garde vert qui n'a pas mordu sur la bonne mutation
ne prouve rien.

**Prochaine action** — L4 : routes portail et surface de saisie (< 30 s/jour). La route
devra dériver patient et assignation de la SESSION, jamais du corps de requête.

**Questions ouvertes** — aucun aller-retour n'a été fait contre une vraie base (`as
unknown as object` y efface la garantie de type) : un contrat `prisma/checks/*.sql` est à
poser avant L4. Et `boolean | null` ne se défend pas contre `if (x)` : l'écran L4 est
exactement le lieu où ce raccourci s'écrira.

## 2026-08-03 — Les deux promotions : attente du CI exécutable, deux décisions au registre

Décisions — L'attente du CI devient `scripts/wn-attendre-ci.mjs` : six codes,
`0` seul autorise à annoncer une PR prête ; la liste des checks attendus vient de
la protection de branche, pas d'une constante. `DECISIONS.md` gagne
D-012 (la barrière D-003 se garde au point de passage, pas chez ses lecteurs) et
D-011 (un écart de restitution de l'IA se journalise, ne se censure pas).

Écarté — Un contrôle CI bloquant réclamant le script : il bloquerait un
correctif urgent.

Validations — Banc 31 cas ; 19 mutations, aucune ne survit ; câblé (5 → 6) ;
T1 vert ; deux revues, NO-GO puis GO.

À retenir — **Trois faux verts subsistaient : banc à 18 cas vert, 13 mutations
conformes**, dont `0` rendu sur #553 en conflit.

Prochaine action — LOT-07.

Question ouverte — Un commit Copilot en tête n'a **pas** gelé le run de #553,
contre la doctrine de `CLAUDE.md`.

## 2026-08-04 — LOT-07 : ce que « certifié » ne dit pas

**Décidé** — Une promotion à `reference_identifiee` n'est acquise que si un identifiant
certifie **la forme servie**. Le garde n'exige qu'un champ non vide, et 8 des 12 entrées
`a_completer` avaient déjà un nom d'auteur : s'y adosser aurait produit douze montées
purement déclaratives. Deux entrées seulement portent au final un DOI ou un PMID.
`cosmin` reste `inconnu` sur les 65 : aucune étude consultée ne porte d'appréciation
COSMIN, et l'attribuer nous-mêmes aurait été fabriquer le jugement psychométrique que ce
lot existe pour empêcher.

**Écarté** — Poser une `verdictScoring.reserve` sur `Q_STR_03` malgré l'écart de cotation
trouvé (source 1-6, étendue 11-66 ; le dépôt sert 0-5, `maxTotal: 55`, et alimente Mon
Équilibre) : plafonner un barreau est une décision clinique, pas un geste de lot
bibliographique. Écarté aussi, une 4ᵉ valeur `sans_publication_origine` pour les deux
agendas WellNeuro — hors périmètre écrit, et `a_completer` **sous-évalue** la preuve là
où `reference_identifiee` la surévaluerait ; la direction de l'erreur décide.

**Trois défauts trouvés par la revue adversariale, pas par moi.** Écrire les trois
premières lignes de `measurement_evidence.json` **ouvrait** le barreau
`psychometrie_revue` pour `Q_PED_01` : son garde ne testait que la *présence* d'une
preuve, jamais sa conclusion — et les trois lignes concluent `inconnu`. Le CI classait ce
même fichier en `docs_only` : éditable seul, `verify` vert, sans qu'aucun contrôle ne le
lise. Et `Q_ALI_03` allait recevoir le PMID d'une méthode en 8 questions alors que le
code déclare l'instrument **débaptisé** et en sert 23 — redescendue en `a_completer`.

**La leçon de méthode, revenue une fois de plus** : mes mutations ont testé le *retrait*
du contrôle, pas son *déplacement*. La mutation « hors de la boucle » a survécu au
premier passage — un banc dont chaque cas n'instancie qu'**une** entrée ne distingue pas
« dans la boucle » de « hors de la boucle ». Refermé, puis la variante « dernière
entrée » a survécu à son tour. Il a fallu un cas à trois entrées, faute au milieu.

**Prochaine action** — Arbitrage praticien sur les trois écarts cliniques remontés
(`Q_STR_03`, `Q_FIB_03`, `Q_NEU_03`). Côté campagne, il reste la signature clinique de la
table du LOT-05, sans laquelle le LOT-06 livré n'affiche rien.

**Questions ouvertes** — `a_completer` recouvre désormais deux situations qu'aucune
requête ne sépare : « cherché, rien n'existe » et « trouvé, non indexé ». La distinction
ne vit que dans une phrase française. Et le seuil servi de `Q_SOM_06` est ≥ 23 quand
celui usuellement cité pour l'asthénie de Pichot est ≥ 22 — soupçon non vérifié.

## 2026-08-04 — Trancher les écarts du LOT-07, et ce qu'on a trouvé dessous

**Décidé** — Les trois écarts sont tranchés, et le plus gros a changé de nature. `Q_STR_03` :
la cotation 0-55 contre 11-66 **n'est pas un défaut** — mêmes 11 items, mêmes six ancres,
ré-encodage à partir de zéro, translation constante. Ce qui n'a aucune source, ce sont les
**cinq bandes** : le manuscrit n'en publie aucune, et les jeux diffusés en aval ne sont
signés de personne. Arbitrage praticien : ne pas échanger un jeu non sourcé contre un
autre — réserve posée, bandes inchangées. `Q_NEU_03` : 1992 **et** 1998 datent l'entretien
d'origine ; la version auto-évaluée servie est de **2008**. `Q_FIB_03` : piste ACR 1990
fermée, le dépôt ne sert pas l'examen des 18 points.

**Écarté** — Adopter les seuils d'un diffuseur (ils reclassaient des patients sans gagner
une once de preuve) ; retirer les bandes (le praticien s'en sert) ; poser une réserve qui
déclasse (plafond au barreau courant : enregistrer n'est pas rétrograder).

**Le vrai sujet était ailleurs.** Le moteur `sum` jetait le `missing` de `sumItems` : un
recueil partiel décrochait une bande calibrée sur la forme complète, **à sens unique, vers
le sous-classement**. `bms_average` en pire, sa moyenne divisant par des items jamais
posés. Fermé dans les deux, plus un étage plus bas dans `equilibre/score.ts` où le total
**est** la lecture — sur une source `inverser: true`, un `Q_STR_03` tronqué rendait
« besoin bien couvert ».

**Trois fois, un chiffre supposé a failli devenir un fait.** « 5 items sur 20 » et « 13 sur
20 » venaient de comptes que je n'avais pas lus ; le compte d'instruments `sum` a opposé
deux sous-agents (26/25 contre 25/24) avant que le catalogue résolu ne tranche à **26
éteint / 25 allumé**. La revue adversariale a par ailleurs démoli trois affirmations que le
code écrivait sur lui-même — dont une **qui me sous-estimait** : côté serveur la complétude
n'est exigée que pour `def.cabinet`, donc le trou était réel, pas théorique.

**Prochaine action** — La classe n'est pas fermée : `sum_decimal` (`Q_GEO_05`, QDRS,
gradation de démence), `count_threshold` (`Q_INF_05`) et `ecab` (`Q_NEU_08`) portent le
même défaut et sont servis.

**Questions ouvertes** — `Q_STR_03` sert au praticien et au prompt IA des bandes dont la
réserve dit qu'elles n'ont aucune source : faut-il un signal côté fiche ? Et
`plaintes_actuelles` met `total: null` sur recueil partiel là où `sum` sert le total —
divergence assumée, à réexaminer si elle gêne.
## 2026-08-04 — Agenda alimentaire L4a : l'accès portail serveur, et trois NO-GO

**Décisions** — Quatre arbitrages en session : `dateJourParis` extrait dans un module
neutre (`src/lib/dateParis.ts`) ; gardes consentement et suivi clôturé posées sur
l'alimentaire seul, asymétrie avec le sommeil assumée et nommée ; doublon du jour
refusé en 409 sauf `supersedesJourId` explicite ; `modification_demandee` aligné sur
`patient/submit`. Découpage L4a (serveur) / L4b (surface) retenu pour ne pas émousser
la revue au moment où elle compte.

**Écarté** — Le calque littéral du jumeau sommeil. Le cadrage a rendu « GO sur le lot,
NO-GO sur le calque » : ma liste de six refus en comptait dix, et trois barrières
manquaient.

**Validations** — `npm run check` à 0 dans les deux positions de `WN_AGENDA_ALI` ;
quatre `test:worktree` complets, le dernier à 3545 tests / 108 E2E / contrats SQL joués
/ drift check vert. Contrat SQL éprouvé par mutation sur un PostgreSQL jetable, avec
contrôles négatifs. Chaque garde vue mordre.

**À retenir — trois revues adversariales, trois NO-GO, et la seconde a trouvé ce que la
première avait créé.** C'est le fait marquant du lot. La passe de correctifs d'une revue
est un endroit de régression au moins aussi dangereux que le code d'origine : deux
défauts (nom de classe d'erreur anonymisé en `[id]`, verrouillage d'écriture sans porte
de sortie) n'existaient pas avant qu'on corrige. **Ne jamais clore sur une passe de
correctifs non re-revue.**

Second enseignement : **quatre T3 complets verts n'ont rien vu.** Ni la garde de
consentement posée sur un champ mort, ni le nom de classe redacté, ni le verrou sans
issue. Ce sont des défauts d'absence ou de sens — il n'y avait aucune ligne fautive à
faire échouer. La revue de diff et la suite de tests ne couvrent pas la même classe.

Troisième : **deux de mes propres instructions étaient fausses** (aligner `domain` sur le
préfixe du code, abaisser la journalisation pré-auth). Le dépôt les a démenties toutes
les deux — la convention réelle était l'inverse, et le motif invoqué n'était pas atteint.

**Prochaine action** — Ouvrir la PR, lire `verify` par `node scripts/wn-attendre-ci.mjs`,
code 0 exigé. Puis L4b : aiguillage `page.tsx`, hub patient, surface de saisie, E2E.

**Questions ouvertes** — (1) Aucune borne serveur aux 21 jours : borner au POST ou à la
clôture ? Question produit, les deux réponses n'ont pas les mêmes effets cliniques.
(2) `WN_AGENDA_ALI` est-il éteint sur TOUS les environnements Vercel, preview compris ?
Fait du panneau Vercel, invérifiable depuis le dépôt. (3) La dette consentement / suivi
clos reste ouverte sur `patient/submit` et sur l'agenda du sommeil.

## 2026-08-04 — Créneaux partagés et chaîne de skills : trois conflits, trois remèdes

**Décisions** — Trois remèdes DIFFÉRENTS pour trois conflits qui se ressemblaient, contre
la tentation d'appliquer partout le patron `changelog.d/`. `SESSION_LOG` prend
`merge=union` — une ligne de `.gitattributes`, git fusionne seul. Les handoffs passent à
un fichier par lot sous `docs/claude/handoffs/`, horodatés à la minute, sans fichier
« courant » généré. `DECISIONS.md` reste à créneau unique mais sa numérotation devient
gardée. Le garde de cross-invocation passe fail-closed, avec un marqueur qui NOMME sa
cible. Registre : **D-017**.

**Écarté** — Le renommage de l'identifiant de décision en `D-AAAA-MM-JJ-slug` : collision
impossible par construction, mais quatorze décisions citées depuis du code clinique à
renommer dans un lot d'outillage. La collision reste possible ; elle devient visible.

**Validations** — `npm run check` code 0, portant désormais trois gardes, sept bancs et
l'anti-secrets du dépôt entier ; 173 tests d'outillage. `merge=union` éprouvé par une
fusion réelle dans un dépôt jetable, **avec son contrôle négatif** — la même fusion sans
l'attribut conflicte. Deux revues adversariales, deux NO-GO.

**À retenir — le coût mesuré qui a motivé le lot.** Pendant le seul lot précédent, `main`
a bougé trois fois : deux collisions de numéro de décision (huit renvois renumérotés
chacune), une PR entière dont l'objet unique était de réparer le handoff après un merge,
trois handoffs perdus. Ils sont restaurés comme fragments — c'est la démonstration du
remède autant que sa justification.

**Second enseignement : le garde existait, était bloquant en CI, et était vert pendant
que NEUF branchements étaient morts.** Il exigeait un verbe impératif dans les 90
caractères amont ; les branchements étaient des titres d'étape nominaux. Puis, redessiné
fail-closed sur ses références, il restait fail-OPEN sur la détermination de sa cible :
`disable-model-invocation: yes` — booléen vrai en YAML 1.1 — le faisait sortir du
périmètre. **Un garde n'est fail-closed que si les deux bouts le sont.**

**Troisième : une de mes consignes a produit un contournement.** Demandant de supprimer
21 marqueurs, j'ai obtenu le retrait des barres obliques — donc des lignes invisibles au
garde. La morsure l'a montré sans discussion : avec barre oblique et sans marqueur, le
garde mord ; sans barre oblique, il est muet. Restauré, avec marqueur nommé.

**Prochaine action** — PR, `node scripts/wn-attendre-ci.mjs`, code 0 exigé. Puis L4b.

**Questions ouvertes** — (1) `merge=union` est-il honoré par un squash côté GitHub ? Non
établi ; il l'est en fusion et rebase locaux, qui est le cas où il sert. (2) Le journal
est append-only par convention, pas par contrainte : `/wn-compact-sessionlog` le réécrit,
et une compaction concurrente ferait ressusciter des entrées — avertissement posé en tête
de ce skill. (3) Le marqueur nominatif croît de façon monotone (100 mentions) et entre
dans le contexte à chaque invocation de skill.
## 2026-08-04 — Table d'orientation V2 : un premier tour qui existe

**Le diagnostic** — La table V1 portait six règles publiées et ne pouvait **rien** proposer au
premier rendez-vous : elles se déclenchent sur `Q_SOM_01`, `Q_STR_02` et `Q_GAS_01`, qui ne
sont pas dans le pack de base réellement administré (`Q_MOD_03`, `Q_MOD_01`, `Q_INF_03`,
`Q_ALI_01`). Aucun banc ne pouvait le voir : les règles étaient justes, et inatteignables.
Table portée à **20 règles**, en deux tours — le premier sur le pack de base et l'anamnèse,
le second sur les instruments que le premier fait revenir.

**Décidé** — Signature écartée en l'état ; agendas exclus du premier tour ; un pack absorbe
ses membres, sans plafond ; `R2-GAS-02` conservée mais requalifiée en **arbitrage praticien
assumé** ; `R2-NEU-03` refondée sur la grille certifiée de l'instrument.

**Écarté faute de source** — pack cardio-métabolique sur plainte de surpoids, `Q_FIB_01` sur
plainte de douleur. Une règle envisagée puis **réintégrée** : le relecteur a montré que ma
note « écarté faute de source » était fausse sur `Q_ALI_01` — `WN-CL-0287-009` fonde bien une
porte alimentaire vers le pack digestif.

**Le sourçage a corrigé mes seuils avant que je les écrive.** J'avais posé `Q_INF_03 ≥ 20` ;
le corpus donne 10, et l'instrument aussi. Puis la revue a démoli ma justification : « ≥ 10
est la négation exacte du profil favorable » — **la négation d'une conjonction est une
disjonction**. Le seuil était bon, le raisonnement faux, et le claim venait d'un contexte de
sevrage tabagique où le HAD est un *intrant*, pas une sortie.

**Le vrai défaut était sous la table.** Le moteur `subscore` calcule un axe dès qu'**un** item
est renseigné : un total partiel est biaisé vers le bas, et mes déclencheurs `<=` le lisaient
comme une dégradation. Trois items répondus à leur **meilleure** valeur, puis abandon →
**sept recommandations dont deux packs**, motivées par « Sommeil non réparateur » chez
quelqu'un qui venait de déclarer un excellent sommeil. Les règles V1 en étaient protégées
parce qu'elles lisaient une interprétation globale ; c'est mon passage à `comparaison` — juste
par ailleurs, à cause du trou à 9 — qui a ouvert la brèche. Fermé aux deux étages.

**Trois fois, un relecteur a vu ce que je ne voyais pas** : ce défaut-là ; qu'un pack
s'affichait à côté de ses propres membres ; et qu'un déclencheur sur `Q_ALI_01` est **aveugle
à la position du drapeau** — deux instruments derrière un identifiant, la forme courte servie
partout où `WN_ALI_01_SIIN57` manque. Réparé en déclenchant sur les **libellés** de bande, que
les deux formes ne partagent pas.

**Prochaine action** — La signature (`ORIENTATION_METADATA`) reste à faire, puis le drapeau
`WN_ENABLE_ORIENTATION_NNPP2`, puis la clôture de la campagne. Trois gestes distincts.

**Questions ouvertes** — Le PSQI partiel n'est pas gardé (il ne publie aucun compte à la
racine) : défaut pré-existant, nommé, non fermé. `R-STR-02` cite `WN-CL-0105-001`, qui porte
sur l'alimentation méditerranéenne, pour engager le pack stress — citation mal appariée, à
trancher avant la signature.

## 2026-08-05 — Agenda alimentaire, LOT-04 : la surface que le patient voit

**Décisions** — D-023, cinq arbitrages. L'ancre des 21 jours se calcule sur l'union des
dates enregistrées, relues ou non ; une quarantaine ne bloque une date que tant qu'une
ligne illisible peut en être la vraie tête ; la borne est **supérieure seule** ; la date
limite se dit avant le consentement ; et une exemption ne vaut que si les quatre portes
du parcours la connaissent.

**Options écartées** — Se contenter de *tester* le ré-ancrage silencieux comme le
demandait le lot : D-022 le différait « faute d'écran », et ce lot livre l'écran. Borner
la fenêtre des deux côtés : cela faisait perdre un jour de recueil au démarrage. Retirer
le bouton « Modifier » plutôt qu'exposer `id` : le POST rend déjà `jourId` au client.

**Ce que la revue a trouvé** — L'exemption `deverrouille` ne rouvrait rien : la première
porte refusait avant elle. Aucune ligne fautive — la classe PR #202. Et la règle « un
geste nommé doit être possible » vaut aussi pour ce qu'on **propose** : quatre promesses
rattrapées.

**Prochaine action** — Poser `WN_AGENDA_ALI=true` sur Development et Preview, **puis**
redéployer. Jamais en Production.

**Questions ouvertes** — La correction reste bornée à J et J-1. `soumisLe` estime là où
`supersedesJourId` trancherait. Ni clôture patient ni vue praticien.
## 2026-08-04 — Signature de la table d'orientation, et clôture de la campagne packs/moteur

Le praticien a répondu « signature » à l'arbitrage à deux branches (signer les
vingt règles, ou clore la campagne avec le critère de signature non coché). Les
deux points annoncés comme à trancher d'abord ont été traités, et l'un des deux
n'existait pas.

**Décisions.** Table signée (`validationExterne: true`, 23 claims relus en base le
jour même). Garde de recueil partiel du PSQI fermée **au niveau item** (18 items
cotés) et non au niveau composante, qui laissait passer le cas réel. Campagne
`2026-08-03-packs-moteur…` close avec sept critères cochés sur huit ; le huitième
— la route sert réellement — est **explicitement non coché** et attend
`WN_ENABLE_ORIENTATION_NNPP2` côté Vercel. Campagne
`2026-08-02-certification-questionnaires-consolidation` close aussi.

**Options écartées.** Remplacer `WN-CL-0105-001` sur `R-STR-02` : relu à la
source, le claim dit mot pour mot l'objectif de la règle — c'est l'alerte qui
était fausse. Fondre le huitième critère dans le quatrième : aurait fermé la
campagne sur une affirmation fausse. Garder la garde PSQI au niveau composante :
sept composantes « mesurées à un item » produisaient encore une bande rassurante.

**Ce que le lot a appris.** Le banc d'égalité exacte `claimsSource` ↔ claims cités
a rougi à sa première exécution, sur la liste de celui qui l'écrivait : 24 claims
au lieu de 23, `WN-CL-0178-016` n'existant que dans un commentaire. Deux `D-015`
coexistaient dans le registre depuis la veille (#562 et #565) — collision réparée,
la seconde devient `D-016` ; les nouvelles décisions sont `D-018` (périmètre
signé) et `D-019` (score gelé) — décalées d'un cran, `main` ayant pris `D-017`
pendant le lot.

**Prochaine action prioritaire.** Poser `WN_ENABLE_ORIENTATION_NNPP2=1` en
production Vercel — geste d'exploitation, hors campagne. Rien d'autre ne bloque.

**Questions ouvertes.** `tfd` (`Q_GAS_01`, cible de `R-GAS-01`) reste hors de la
garde de recueil partiel : il ne publie aucun compte à la racine. Même classe
ouverte sur `sum_decimal`, `count_threshold` et `ecab`, sans règle publiée qui les
vise.

## 2026-08-04 — TFD : fermer le recueil partiel du dernier moteur réglé

`WN_ENABLE_ORIENTATION_NNPP2=1` posé en production et redéployé (READY, alias
`app.wellneuro.fr`) : l'orientation tourne avec la table signée en #566.

Puis le lot `tfd` (`Q_GAS_01`), dernier moteur de la classe atteignable par une règle
publiée. Cinq réponses sur trente-et-une, toutes au maximum, rendaient « A — Absence de
troubles fonctionnels ». Comptes publiés à la racine et par axe, bandes retirées sur
recueil partiel — au grain de l'axe aussi (D-020), la grille du TFD calibrant ses
bandes d'axe sur l'axe complet.

Écarté : aligner le moteur `subscore` (8 instruments, autre arbitrage) ; traiter
`sum_decimal`/`count_threshold`/`ecab` au passage (le lot y perdait sa contre-épreuve
nette) ; `agenda-ali-l4b`, périmètre pris par une autre session.

Deux revues adversariales, NO-GO puis GO. Le fond du lot est ce qu'elles ont trouvé :
la direction de l'effet sur « Mon équilibre » n'a pas un seul sens — au-delà de
`total ≥ 62` la garde LÈVE un plafond de fondation critique et le score REMONTE, et
j'avais écrit l'inverse ; `R-GAS-01` s'éteint sur un partiel dont la sévérité est
acquise par monotonie ; `buildMiniSynthese` re-fabriquait « peu perturbés » (`some` au
lieu de `every`) ; et ma propre correction a introduit un fait faux (« 14 instruments
subscore dont aucun » — c'est 8, dont 4 avec bandes d'axe).

Vérifié plutôt que supposé : passe de mutation (6 tests rougissent sans les gardes),
et lecture production — 2 passations `Q_GAS_01`, toutes deux complètes.

Prochaine action : ouvrir la PR, lire le code de sortie de `wn-attendre-ci.mjs`.
Question ouverte, candidate au lot suivant : servir un **plancher garanti** à côté de
la bande, pour que le retrait n'éteigne plus les vrais positifs démontrables.

## 2026-08-05 — Plancher garanti : rendre à D-014 sa seconde moitié

**Décisions.** `D-021` : sur un recueil partiel, la bande atteinte par les seules
réponses recueillies est servie comme **plancher** (`bandePlancher`),
`interpretation` restant `null`, avec la formule « au moins » dans la note.
Éligibilité **déclarée** par l'instrument (`severiteCroissante`) — 21 `sum` +
`Q_SOM_01` + `Q_GAS_01` —, jamais déduite. Le défaut `Q2` du PSQI passe de 30 à 0 :
c'était le seul défaut atteignable qui rompait la monotonie, donc la seule chose
qui rendait un plancher calculable.

**Options écartées.** Un drapeau sur `interpretation` (tout `if (interpretation)`
se serait remis à afficher une bande). Déduire le sens d'une grille de ses couleurs
ou de l'ordre de ses bandes (quatre instruments l'infirment). Rallumer `R-GAS-01`
et donner une surface praticien : hors périmètre, écrits en réserve de `D-021`.

**Ce que le lot a appris.** Trois passes adversariales, deux NO-GO. La première a
trouvé que le plancher faisait sortir une **conduite clinique** par une seconde
porte — `separerConduite` sort quand `interpretation` est `null`, c'est-à-dire
exactement sur le recueil partiel. La seconde a trouvé que mon test de propriété
**ne pouvait pas échouer** : partant d'une passation saturée, la bande finale était
toujours la plus haute de la grille, donc supérieure à n'importe quel plancher,
faux compris. Deux fois la même leçon : **une garde qui ne visite jamais l'état où
le défaut existe est verte pour une mauvaise raison**.

**Prochaine action prioritaire.** Ouvrir la PR, lire le code de sortie de
`wn-attendre-ci.mjs`.

**Questions ouvertes.** `R-GAS-01` reste éteinte sur un TFD partiel : le plancher
est raconté, pas agi. Aucune surface praticien dédiée — le plancher d'axe du TFD
n'atteint que le modèle de synthèse. Classe toujours ouverte sur `sum_decimal`,
`count_threshold`, `ecab` et `bms_average`.

## 2026-08-05 — Le drapeau de l'agenda : lever une restriction devenue un mur

**Décisions.** `D-025` amende le point 2 de `D-022` : `WN_AGENDA_ALI` se pose sur
le scope Vercel **Production**, et la Preview est exclue — elle lit la base de
production et le praticien ne peut pas s'y connecter (SSO sur `*.vercel.app`,
callback OAuth sur `app.wellneuro.fr`). Le motif du report était éteint : `LOT-04`
a livré l'écran dont `D-022` déplorait l'absence. Un runbook porte le geste, avec
prérequis vérifiables et retour arrière.

**Options écartées.** Rendre la Preview utilisable (alias de domaine + callback +
SSO levé) : coût réel, isolation nulle, la base étant partagée. Insérer
l'assignation par script : écriture hors chemin relu, et sans effet drapeau éteint.

**Ce que le lot a appris.** Deux passes adversariales, un NO-GO puis un GO sous
réserve. La première a trouvé que mon runbook prescrivait un **geste impossible** —
les trois patients de graine sont inassignables, `actif = false` pour deux d'entre
eux et une adresse qui n'existe pas pour les trois, alors que le lien d'entrée part
par e-mail. C'est la règle de `D-023` point 5, enfreinte le lendemain de son
écriture. Elle a aussi trouvé que je me créditais d'une relecture que `D-022` avait
déjà faite : elle portait « 0 ligne et 0 assignation » depuis la veille. La seconde
a trouvé que mes deux correctifs les plus concrets ne s'exécutaient pas — `qids` est
`text[]` et non `jsonb`, et le contrat SQL est un bloc `DO $$` que le garde MCP
refuse. **Prescrire un geste sans l'exécuter, c'est écrire une promesse.**

**Prochaine action prioritaire.** PR, puis le geste Vercel — main du praticien.

**Questions ouvertes.** Aucun écran praticien ne lit les journées : la calibration
de `LOT-05` passera par `execute_sql`. Rien ne valide les `qids` d'un pack contre
`IDS_SUSPENDUS`. La graine déclare quatre identifiants pour un pack par défaut qui
en porte cinq.
## 2026-08-05 — Le plancher agi : quatre règles d'orientation rallumées

**Décisions.** `D-024` : une règle `zone` s'allume sur un `bandePlancher` si et
seulement si **toutes** les bandes encore atteignables sont dans la zone visée.
Quatre règles publiées entrent dans ce cas — `R-GAS-01`, `R-SOM-01`, `R-STR-01`,
`R-STR-02`. Le plancher entre par un **troisième champ** d'`extraireCible` :
`valeur` et `interpretation` restent `null`, les deux gardes de complétude ne sont
pas touchées, et l'immunité de `Q_MOD_01` reste vraie par construction. La fermeture
est dérivée de `ranges` là où la grille se trouve déjà, jamais d'un ordre de couleurs.
Trois arbitrages rendus : allumer dès le plancher le plus faible, zone de `R-SOM-01`
inchangée, avenant daté plutôt que re-signature — le sha de la table n'a pas bougé.

**Options écartées.** Marquer `interpretation` d'un drapeau `garanti` : le défaut
serait redevenu fail-open et il aurait fallu modifier les lignes qui protègent les
échelles inversées. Une table `RANG_COULEUR`. Resserrer la zone de `R-SOM-01` (change
un objet signé, et le comportement sur passation complète). Une surface praticien
dédiée : le motif d'orientation *est* déjà cette surface.

**Ce que le lot a appris.** Deux passes adversariales, deux NO-GO, et **la même leçon
deux fois** : la première a trouvé qu'une bande atteignable sans couleur était retirée
de la fermeture au lieu de l'éteindre — l'inverse exact du fail-closed annoncé, et la
seconde passe a prouvé cet état **atteignable** par le repli de plafond. La seconde a
trouvé que la branche `interpretation` n'avait **aucun** cas capable de la réfuter :
les deux seules zones du dépôt valaient exactement la fermeture, si bien que la
« réparation naïve » que son commentaire prétendait interdire laissait toute la suite
verte. Un prédicat que rien ne peut réfuter n'est pas gardé.

**Prochaine action prioritaire.** LOT-01 « Mon bilan » — rebaser `feat/portail-bilan`
sur `main` (78 commits d'écart) et **mesurer** avant de décider reprise ou abandon.

**Questions ouvertes.** L'audit ne distingue pas les deux comportements : version et
sha de la table couvrent désormais deux moteurs. La divergence gelé/recalculé change
de sens au lieu de disparaître. `detail` n'est pas amputé comme `protocol`. Le
dénominateur d'axe exclut les questions conditionnelles. Classe toujours ouverte sur
`sum_decimal`, `count_threshold`, `ecab`, `bms_average`.

## 2026-08-05 — « Mon bilan » : l'instantané plutôt que la garde

**Décisions.** `D-026` : le portail sert `booklet_envois.note_transmise`, figé à
l'envoi, jamais le champ vivant. L'absence de garde sur `annoter` est **assumée** —
la garde évidente aurait cassé le renvoi corrigé, qui consiste précisément à
corriger une note puis à la renvoyer. La visibilité s'écrit une fois
(`whereEnvoiVisible`), mais l'accès au document et l'avancement de la frise
restent **deux signaux**.

**Options écartées.** Refuser `annoter` dès qu'un envoi existe (casse le renvoi) ;
le refuser sur dossier clos seulement (élargit le périmètre) ; laisser le backfill
reposer sur un comptage plutôt que sur l'invariant `updated_at <= date_envoi`.

**Ce que le lot a appris.** Trois passes adversariales. La deuxième a trouvé que mon
correctif du hub faisait **reculer la frise du parcours**, contre un invariant écrit
noir sur blanc à côté. La troisième a montré qu'un garde de banc censé refuser toute
condition non émulée ne voyait rien au-delà du premier niveau : remis dans son
ancienne forme, une condition imbriquée passait 36/36 verte. **Un garde qui ne
descend pas jusqu'où le défaut se cache inspire une confiance qu'il ne mérite pas.**

**Prochaine action prioritaire.** Ouvrir la PR, lire le code de sortie de
`wn-attendre-ci.mjs`, puis vérifier la migration en base.

**Questions ouvertes.** Dossier clos : annoter reste possible, renvoyer non — la note
du dossier peut diverger sans réconciliation. Aucun code d'événement ne vise le bilan
patient. `bilanConsultable ⇒ bookletEnvoye` est commenté, pas testé.
## 2026-08-05 — LOT-00 : un seul chemin d'écriture en base

**Décisions.** Fusionner #435 plutôt que rebaser (`merge-tree` propre, un seul
fichier bougé depuis la base). Environnement GitHub **`release-db`**, pas
`production` — déjà pris par l'intégration Vercel, le protéger aurait gaté ses
déploiements. Garde de branche en trois clés : `if:` sur le job, job frère qui
échoue bruyamment hors `main`, restriction côté plateforme.

**Options écartées.** Construire les gardes CI (PR mêlant migration et code,
détection de release oubliée) — hors périmètre, écrits en réserve. Retoucher
`BRIEF_COMPILED.md` — fichier généré, une retouche y serait effacée.

**Ce que le lot a appris.** Trois balayages du même renommage, trois angles morts
de forme : les accents, le repli de ligne Markdown, le cwd d'une commande de fond.
Et trois réécritures du même commentaire, trois sur-généralisations — le code
était juste à chaque fois.

**Prochaine action prioritaire.** Réglages GitHub (environnement, deux secrets,
branches restreintes à `main`), puis merge.

**Questions ouvertes.** D-003 n'a jamais rencontré les données de production ;
rien ne détecte une release oubliée ; « base en avance » n'est vrai que si la
migration est additive, et rien ne le garde.

## 2026-08-05 — Le pilote avait démarré, et personne ne pouvait le lire

**Décisions.** `D-027` : `WN_AGENDA_ALI` ferme ce qui s'écrit, pas ce qui se
relit — la lecture praticien de l'agenda n'est pas gardée par le drapeau. Le
modèle est append-only (`D-015`) ; fermer le lecteur avec le drapeau rendrait
illisible la donnée déjà recueillie, au moment précis où le barème en a besoin.
Renumérotation : `LOT-05` devient le dossier de contrôle, le barème descend en
`LOT-06` — un `LOT-04b` aurait rendu l'ordinal `LOT-04` à l'audit, donc un CI
rouge.

**Options écartées.** Réécrire `D-025`, dont le « 0 ligne » est dépassé : une
décision est un enregistrement daté, le fait nouveau vit dans le runbook. Servir
la position du drapeau au panneau pour distinguer « pas assigné » de « recueil
fermé » : cela rouvrait le point tranché ; l'état vide a seulement cessé de
nommer un geste impossible.

**Ce que le lot a appris.** Trois des dix premiers constats étaient des gardes
**vertes pour une mauvaise raison** — test de drapeau sur dossier vide, fixture
d'ancrage qui ne pouvait pas bouger, scan de frontière sans agrégats. Et le
constat sans ligne fautive : `statut` décalqué du sommeil rendait « En cours »
sur un agenda annulé, la branche `cloture` étant morte pour cet instrument.

**Prochaine action prioritaire.** Débloquer `git push` (règle Bash), ouvrir la
PR, lire le code de sortie de `wn-attendre-ci.mjs`.

**Questions ouvertes.** Aucune bannière ne dit que le recueil est fermé. Le
déverrouillage praticien d'un `Q_ALI_09` par appel direct retire silencieusement
l'annulabilité. Le taux de correction, dont `LOT-06` aura besoin, se lit encore
par `execute_sql`.
## 2026-08-05 — `release-db` se propose tout seul, sans s'approuver tout seul

**Décisions.** Une migration qui atteint `main` crée son run de release
(déclencheur `push` filtré sur `web/prisma/migrations/**`). **L'automatisation
porte sur le déclenchement, jamais sur l'approbation** : `environment: release-db`
est conservé, le run attend un relecteur. Un job `resume`, sans environnement donc
joué avant le gate, écrit dans le Summary ce que le push apporte — et avertit qu'il
n'est **pas** la liste de ce qui sera appliqué, `migrate deploy` emportant tout
reliquat en attente.

**Options écartées.** Dériver le mode par expression (inutile : `inputs` est vide
hors dispatch). Faire dépendre la sûreté de ce seul raisonnement — les trois étapes
d'import portent aussi `event_name == 'workflow_dispatch'`, aucun lint de workflow
ne tournant ici. `continue-on-error` sur le résumé : un résumé illisible doit
bloquer plutôt que faire approuver à l'aveugle.

**Ce que le lot a appris.** **Automatiser un déclenchement a supprimé une barrière
sans toucher au gate.** Il fallait deux choses pour écrire en production — qu'un
humain clique, *et* que l'environnement gate ; il n'en reste qu'une. Un
`environment:` retiré par mégarde était inoffensif tant que personne ne
déclenchait. D'où le banc d'invariants et la vérification de la configuration
GitHub (relecteurs présents, branches restreintes à `main`). Et un commentaire que
j'ai dû corriger : il justifiait un `|| true` par un `set -e` qui ne se déclenche
pas — sans `pipefail`, le statut d'un pipeline est celui de `sort`, pas de `grep`.

**Prochaine action prioritaire.** PR, CI, merge — puis observer le premier
déclenchement automatique réel.

**Questions ouvertes.** `prevent_self_review` est désactivé (un seul relecteur) :
le second gate est un temps d'arrêt, pas un second regard. Aucun `actionlint` en
CI. La fenêtre entre déploiement du code et migration est raccourcie, pas fermée.
## 2026-08-05 — LOT-01 : vue de vérité générée depuis le code

**Décisions.** `wn-etat-reel.mjs` rapporte, `wn-cycle --appliquer` répare — deux
verbes disjoints. Migrations lues sur disque, jamais de connexion base
(`verifieEnBase: null` + requête à rejouer via MCP). `--appliquer` doit se jouer
**depuis `main`**, jamais en cours de lot : il traite `branche === 'main'` comme
sa propre phase, et l'écrire depuis une branche de travail réécrit `git.branch`
avec un nom promis à mourir au squash-merge — vraisemblablement l'origine du bug
initial. `active_campaign`/`active_lot` réactivés via la commande existante
`wn-campaign.mjs activate`, qui a révélé que `lot_courant` de `CAMPAGNE.md`
n'avait pas été avancé après le merge de LOT-00.

**Options écartées.** Éditer `.wn/state.json` à la main pour `active_campaign` —
la commande sanctionnée existe déjà. Corriger le geste `--appliquer` en cours de
lot plutôt que de le reporter au post-merge.

**Ce que le lot a appris.** Revue adversariale NO-GO : le script rendait un faux
« 0 écart » en code 0 depuis `web/` — le cwd par défaut de toute session — parce
qu'il résolvait sa racine par `process.cwd()`. Grave : ce script est cité comme
critère de clôture de campagne (LOT-07). Deux autres bloquants : mauvais registre
de certification (507 sources bibliographiques au lieu de 65 questionnaires), et
le banc absent de tout palier — ses gardes de sûreté étaient inertes. Les trois
vérifiés indépendamment avant et après correction, pas pris sur parole.

**Prochaine action prioritaire.** Ouvrir la PR, lire son CI, merger, puis depuis
`main` : `node scripts/wn-cycle.mjs --appliquer`.

**Questions ouvertes.** `comparerEtat` ne confronte que 3 des 6 dimensions
collectées (PR ouvertes, worktrees, parcours patient rapportés mais jamais
comparés) — `ACTIVE_CAMPAIGN.md` affirmait « aucune campagne parallèle » sans que
l'outil puisse le voir. `validation.last_checked_at` reste signalé périmé sans
qu'aucun outil ne le rafraîchisse.

## 2026-08-05 — LOT-07 : l'annulabilité se décide sur une passation réelle

**Décisions.** `LOT-06` (barème) reste bloqué et c'est mesuré : `MIN_JOURS_AGREGATS = 7`,
une journée sur vingt et une recueillies. Le lot prend l'un des trois reliquats
de `LOT-05`. Un seul prédicat (`lib/praticien/annulabilite.ts`) importé par la
route **et** par l'écran — c'est leur divergence qui a produit le défaut. Forme
positive, fail-closed : `statutReponses` est un `String` libre sans enum.
`aPassation` exposé comme un **fait**, jamais `annulable` comme un verdict.

**Options écartées.** Fermer le `PATCH` de déverrouillage : chemin sans appelant
d'écran, et refuser `non_rempli` supprimerait une exemption de date limite que
quatre routes portent. Assouplir `wn-campaign-audit.mjs` pour accepter `LOT-05b` :
le reliquat prend un ordinal libre, le garde ne bouge pas.

**Ce que le lot a appris.** Revue adversariale NO-GO sur un bloquant réel :
l'`updateMany` avait sa garde répétée dans le `where` *pour pouvoir ne rien
matcher*, et son résultat était jeté — la route rendait `ok: true` sur zéro ligne
écrite, refaisant sous un autre nom le défaut qu'elle supprime. Aucun test ne le
couvrait, la fixture `{ count: 1 }` étant armée dans le `beforeEach` et jamais
remplacée. Deux tests « négatifs » ajoutés ne discriminaient rien : ils rendaient
le même verdict avant et après. Et un commentaire d'un fichier tiers décrivait
toujours le défaut comme actuel — un lot suivant l'aurait lu comme un trou ouvert.

**Prochaine action prioritaire.** Ouvrir la PR, lire son CI, merger. Puis
`LOT-08` (bannière drapeau éteint + tiroir muet), ou `LOT-06` après J+7.

**Questions ouvertes.** `node scripts/wn-cycle.mjs` **écrit** `.wn/state.json`
sans `--appliquer`, alors que les deux verbes sont censés être disjoints.
L'index `@@index([idAssignation])` sur `QuestionnaireReponse` reste absent, et ce
lot ajoute une lecture sur cette colonne à la route praticien la plus appelée
(sans gravité à 99 lignes, mesuré). `agenda-sommeil/relance` porte la même racine,
nommée non traitée.
## 2026-08-05 — Transport des compositions : le manque n'était pas là où le lot le cherchait

**Décisions.** Le lot livre la **capacité et la mesure**, pas le chargement :
138 728 fiches sur 140 148 (99,0 %) passeraient de coquille à composition connue,
mesuré sur les 284 Mo réels. Charger est une écriture en production, donc un geste
d'exploitation distinct, gardé par deux clés (`--url` confronté à
`SUPPLEMENTS_TRANSPORT_HOTE`), sur le modèle de l'import NABM.

**Options écartées.** Merger les 526 lignes sauvées telles quelles — elles
compilaient, mais **rien ne POSTait vers elles** : zéro fiche remplie. Sortir tous
les doublons du dénominateur de complétude. Alimenter un `bilanPartiel` que le
chemin d'écriture ne construit jamais : la promesse a été retirée, pas maquillée.

**Ce que le lot a appris.** Deux revues, deux NO-GO. Le second a trouvé qu'un
correctif écrit sous la pression du premier **inversait le sens d'un signal
clinique** : sortir tous les doublons du dénominateur faisait passer au feu vert
des fiches ayant perdu une dose. Mesuré ensuite : **7 307 doublons identiques,
2 912 divergents** — 28,5 %, pas un cas limite. Et le piège qui rendait l'ordre
irréversible : **le rejeu ne réparait pas le dénominateur**, alors que trois
endroits le présentaient comme le geste de reprise complet. Un lot mal transporté
aurait été figé à vie.

**Prochaine action prioritaire.** PR, CI, merge. Puis LOT-03 (runbook HDS), qui
ferme la campagne et dénoue le couplage avec les dettes 5.0.

**Questions ouvertes.** 1 420 fiches ont des lignes source mais aucune résolue :
non transportées, `compositionSourceLignes` nul, écran honnête mais muet sur ce
qu'on sait. La garde de parité du dépôt ne couvre pas les étapes CI postérieures à
`setup-node` — un banc y est branché à la main, pas garanti.
## [2026-08-05] — LOT-02 : observer le repli legacy des packs

**Décisions.** Hypothèse de cadrage infirmée : `ensembles_divergents` était déjà
journalisé (WARN, depuis LOT-03) ; le vrai trou était `registre_absent`/
`registre_vide`, muets. Ajout d'une branche `logger.info` dans les deux
appelants (`packs/assign`, `portail/valider`), résolveur intact, même event
code, niveau distinct pour préserver la décision anti-alarme-permanente déjà
prise. Constat production (`execute_sql`) : 7/8 packs conformes, 1 dérive
réelle sur le pack de base (`Q_SOM_09` absent du registre) — repli **non
fermé**, recommandation datée : le fermer aujourd'hui viderait l'agenda du
sommeil de chaque onboarding.

**Options écartées.** Fonction de log partagée entre les deux routes (2
call-sites seulement, duplication déjà le style du dépôt). Résynchroniser le
pack de base dans ce lot (correction de donnée, hors périmètre observation).

**Prochaine action prioritaire.** Ouvrir la PR, lire son CI, merger. Puis LOT-03
(`sum_decimal`, `count_threshold`, `ecab`). Réconciliation `CAMPAGNE.md`
(`lot_courant`, tableau des lots) volontairement **non faite ici** — suit le
même patron que LOT-01 : geste séparé, post-merge, depuis `main`, via l'outil
sanctionné.

**Questions ouvertes.** Aucune côté LOT-02. Celles héritées de LOT-01 (gates
G0-G4, conflits de corpus) restent hors du périmètre de ce lot.

## [2026-08-05] — LOT-03 : fermer sum_decimal, count_threshold, ecab

**Décisions.** Cadrage (`wn-reviewer`) a trouvé le lot rédigé sur deux erreurs
de fait : mauvais fichier (`instruments.ts` au lieu de `questions.ts`) et garde
de référence périmée d'une version (#568 a ajouté un « plancher garanti »
distinct de la garde de base #566/#567). Résolu en distinguant les deux
mécanismes : la garde de base seule (gabarit `bms_average`) suffit au résultat
observable exigé, sans arbitrage clinique sur `severiteCroissante` — laissé
hors périmètre, conforme à l'interdit du lot. Les trois moteurs ne produisent
plus de bande sur recueil incomplet ; total/count inchangés. Constat production :
défaut théorique, 1 seule passation existante et complète.

**Options écartées.** Reproduire le « plancher garanti » (aurait exigé un
arbitrage clinique praticien sur le sens de chaque grille, hors périmètre).
Basculer vers `sumItems()` partagé (comportement sur items conditionnels non
vérifié pour ces trois moteurs — changement minimal préféré).

**Prochaine action prioritaire.** Ouvrir la PR, lire son CI, merger. Depuis
`main` : `node scripts/wn-campaign.mjs activate LOT-04` puis `node
scripts/wn-cycle.mjs --appliquer` (même geste que pour LOT-02→LOT-03).

**Questions ouvertes.** Trois mineurs relevés en revue, non corrigés
(changements minimaux) : commentaires périmés dans `orientationEngine.ts`/
`orientationRulesV1.ts` ; absence d'`evalConditionnel` dans les trois boucles
(latent) ; `noteRecueil` dupliqué texte-pour-texte dans les trois blocs.
Non vérifié : l'UI praticien affiche-t-elle le champ `note` pour ces trois
instruments (mécanisme pré-existant partagé avec PSQI/TFD).

## 2026-08-05 — LOT-02 transport des compositions, puis LOT-03 runbook HDS

**Décisions.** LOT-02 : livrer la capacité et le chiffre, pas le chargement — les
138 728 fiches restent des coquilles jusqu'à un geste d'exploitation distinct,
gardé par deux clés. Un doublon de composition identique sort du dénominateur de
complétude, un doublon divergent y reste. LOT-03 : verser le runbook HDS par
**retouches ciblées sur `main`**, jamais par reprise du fichier de la branche de
sauvegarde.

**Options écartées.** Merger ou rebaser `sauvegarde/runbook-scalingo-staging` :
forkée du 2026-07-24, elle supprimerait 28 332 lignes et annulerait les PR #356 et
#425 — dont #425 porte précisément la correction de région qu'elle prétend
apporter. Sortir tous les doublons du dénominateur (LOT-02) : c'était inverser un
signal clinique.

**Ce que les lots ont appris.** Deux revues adversariales, deux NO-GO sur LOT-02 ;
la seconde a trouvé qu'un correctif de la première faisait passer au feu vert des
fiches ayant perdu une dose — 2 912 cas divergents mesurés sur 10 219. Trois tests
verts pour une mauvaise raison, corrigés et signalés. Sur LOT-03, deux défauts que
ni le lot ni la sauvegarde ne nommaient : la PR #425 avait corrigé la région à un
seul des deux endroits, et le runbook décrivait un `vercel-build.sh` qui n'écrit
plus depuis #435.

**Prochaine action prioritaire.** PR LOT-03, CI, merge — ce lot **clôt la
campagne** « reprise des chantiers en suspens ». Puis rendre la main à la campagne
« Clôture des dettes Wellneuro 5.0 ».

**Questions ouvertes.** Aucune passe T2 locale isolée n'a pu être obtenue : la
session voisine relance Playwright en continu sur la base partagée, y compris en
cours de passe — un `pgrep` préalable ne garde pas une fenêtre de 10 minutes.
Seul le CI rend un verdict. Réserve LOT-02 non corrigée : 1 420 fiches ont des
lignes source mais aucune résolue. Une seconde app Scalingo `wellneuro` existe au
statut `new`, non instruite.

## 2026-08-05 — LOT-04 : parcours patient unique, et un contournement de révocation fermé

**Décisions.** Cadrage débordé le périmètre écrit : 6 des 7 routes
`api/patient/*` avaient un repli sans session ignorant
`actif`/`accessTokenRevoked` — un patient révoqué gardait un accès complet.
Repli **retiré entièrement**, une fois vérifié — logs Vercel du 2026-08-05,
hors dépôt, non rejouables — que `/portail/connexion` fonctionne réellement
(3 drapeaux actifs). Une version intermédiaire du lot rendait 404/403 sur
session absente ; corrigée en 401 uniforme après une 2ᵉ revue, le hub ne
redirigeant vers le gate que sur 400/401.

**Écarté.** Patcher le repli plutôt que le retirer — plus aucun appelant
légitime ne l'atteint une fois la redirection posée.

**Prochaine action.** `/wn-handoff write`, puis PR.

**Questions ouvertes.** Retrait du répertoire `page.tsx` legacy laissé à un lot
nommé (`page.test.tsx` teste encore l'`EmailGate` mort) — vérifier que le
portail couvre consentement RGPD et consultation verrouillée d'abord.

## 2026-08-05 — LOT-08 agenda alimentaire, « le recueil dit son état »

**Décisions.** Campagne active basculée des dettes 5.0 vers l'agenda alimentaire
(LOT-04 non entamé, repris ensuite). LOT-06, le barème, reste fermé — mesuré, pas
supposé. LOT-08 s'est révélé porter **trois** reliquats et non deux : le
troisième, la modale d'annulation muette sur ce qu'elle emporte, ne vivait que
dans la section « ce que ce lot ne fait pas » de LOT-07. La bannière « recueil
fermé » passe par un **provider de page**, motif déjà présent deux lignes au-dessus
du point de montage pour le drapeau C5 (D-028).

**Options écartées.** Un champ `recueilOuvert` dans la réponse de la route
praticien : il aurait fallu rouvrir D-027 pour un résultat identique. Le défaut
`false` du contexte, remplacé par un tri-état après la revue — le fail-closed vaut
pour une garde, pas pour un énoncé, et le drapeau est allumé en production.

**Prochaine action prioritaire.** Suivre le CI de la PR, puis reprendre LOT-04 des
dettes 5.0. LOT-06 pas avant J+7.

**Questions ouvertes.** T2 verte à la troisième passe (120 E2E, aucun échec) ; les
deux rouges antérieures portaient des jeux d'échecs *différents* à code identique,
sur des surfaces portail hors périmètre — un rouge qui se déplace n'est pas une
régression. CI vert sur #590, `verify` a bien tourné. Trois réserves nommées et
non fermées : la modale promet
« vous pourrez réassigner », faux drapeau éteint ; la déduplication `distinct`
côté base n'est prouvée par rien ; l'argument `process.env.WN_AGENDA_ALI` au point
de montage est décoratif — le paramètre par défaut absorbe une faute de frappe,
vérifié par mutation, et le même angle mort vaut pour `isC5Enabled`.

## 2026-08-06 — LOT-00 packs-personnalises : seed du pack de base aligné

**Décisions.** Assainissement documentaire mergé (#594) ; campagne « packs
personnalisés » cadrée et activée (#595) sur trois arbitrages utilisateur
(packs praticien désactivés aussi, geste = file d'envoi, campagne entière avant
dettes). LOT-00 : seed aligné sur la production (5 qids, `Q_SOM_09` inclus,
ordre exact), T2 vert (120 E2E), revue GO. Question tranchée : le seed n'écrit
pas le registre — aucune `QuestionnaireDefinition` seedée, un sync produirait
un registre vide. Dédup LOT-A/B/C vérifiée en prod (index d'unicité présent).

**Options écartées.** Seed → registre (élargissement pour gain nul) ; backfill
`apply` sans nécessité.

**Re-diagnostic.** Le geste UI praticien a tourné (14:19 UTC) sans rien fermer :
`Q_SOM_09` n'avait aucune `QuestionnaireDefinition`, et `syncPackToRegistry`
filtre en silence — un trou d'ordre désigne un filtrage, pas un oubli
d'écriture. Fermé par `backfill:pack-registry:apply` (autorisation explicite) :
67 définitions upsertées, **8/8 packs MATCH**, constat SQL 5/5 sans trou.

**Prochaine action.** LOT-01 : inventaire des surfaces + décision D-0xx.

**Questions ouvertes.** Risque latent E2E : `Q_SOM_09` refusé par `submit`, le
remplisseur générique casserait s'il itérait tout le pack. PR #372 dormante.

## 2026-08-05 — Clôture de la campagne « reprise des chantiers en suspens »

**Décisions.** Trois lots livrés, trois PR mergées, CI vert à chaque fois : LOT-01
« Mon bilan » (#574), LOT-02 transport des compositions (#585), LOT-03 runbook HDS
(#587). LOT-02 livre la capacité et le chiffre — 138 728 fiches sur 140 148 —
mais **ne charge rien** : l'écriture en production reste un geste séparé. LOT-03
verse le runbook par retouches ciblées sur `main`.

**Options écartées.** Merger `sauvegarde/runbook-scalingo-staging` : forkée du
2026-07-24, elle supprimerait 28 332 lignes et annulerait la PR #425, qui porte
la correction qu'elle prétend apporter. Sortir tous les doublons du dénominateur
de complétude : cela inversait un signal clinique (2 912 cas divergents).

**Prochaine action prioritaire.** Arbitrer entre LOT-04 des dettes 5.0 et les lots
de la campagne questionnaires — les deux ont été évoqués, ce ne sont pas les mêmes.

**Questions ouvertes.** Aucune passe T2 locale isolée n'a pu être obtenue : la
session voisine relance Playwright en continu sur la base partagée, y compris en
cours de passe. Seul le CI rend un verdict. Statuts LOT-00/LOT-01 des dettes 5.0
périmés (mergés, encore notés « merge bloqué »). Réserve LOT-02 : 1 420 fiches
sans aucune ligne résolue.

## 2026-08-06 — LOT-01 packs-personnalisés : inventaire des surfaces + D-030

**Décisions.** Matrice livrée (~70 surfaces, chaque ligne chemin:ligne relue ;
unité : une ligne = une surface de code) et D-030 écrite : seul le second pack
praticien « Florence 1 » est désactivé avec les 5 packs de doctrine actifs
(6 au total) — « Base de consultation » ne l'est jamais ; geste d'envoi = file
d'envoi ; campagne primaire. Trois lectures SQL production ancrent la matrice.

**Options écartées.** Références par numéro de ligne dans `DECISIONS.md`
(append-en-tête : périmées à chaque insertion) — remplacées par la citation de
la phrase ; fixture `COMPOSITION_PACKS` comme source des compositions
(partielle : 2/9 et 1/8).

**Prochaine action.** LOT-02 via `/wn-lot` — re-ciblage des 6 règles,
re-signature D-018, revue `wn-reviewer` obligatoire.

**Questions ouvertes.** Repli par nom de `resoudrePackBase` mort (casse) et
`PATCH parDefaut` sans garde → gestes LOT-03 ; `dejaAssigne`, absorption,
`packsTransmis` vide → réserves D-030 ; campagne dettes 5.0 encore `en_cours`
sans trace de la mise en attente.

## 2026-08-06 — LOT-02 packs-personnalisés : l'orientation propose des ensembles, table re-signée

**Décisions.** Les 6 règles à `packId` re-ciblées en suggestions questionnaires
multi-instruments ; table re-signée D-018 (sha `547119c6…`, `dateValidation`
2026-08-06, 23 claims relus en base : 23/23 VALIDE). Geste du panneau : « Ajouter
à la file d'envoi », un clic, sans double temps. Trois arbitrages praticien après
revue NO-GO : R2-SOM-05 → PSQI + Horne (Berlin retiré — il contournait la porte
antécédent respiratoire de R2-SOM-04) ; le claim Karasek suit l'instrument vers
R-STR-02 ; R-GAS-01 assumé.

**Options écartées.** Candidats mono-cible du LOT-01 (3 règles devenaient
no-op par la dédup du moteur) ; mise à jour du sha sans relecture de claims.

**Prochaine action.** LOT-03 : retrait effectif des packs + gestes hérités
(repli `resoudrePackBase` mort, garde `parDefaut`, `IDS_SUSPENDUS`).

**Questions ouvertes.** Bruit du garde de restitution (faux positif « pack »
adjacent, épinglé) ; valeur prod du drapeau orientation non lue (chiffrée) —
vérifier le panneau après merge.

## 2026-08-07 — LOT-03 packs : le garde du pack de base, et D-031 promue

**Décisions.** D-031 promue au registre (PR #602), après quatre passes de revue :
l'énoncé initial était auto-réfutant, et la distinction porte constitutive / voie
d'entrée suffisante a dû être posée. LOT-03 : garde du pack de base sur
`PATCH`/`DELETE`, lu sur l'**état résultant** (deux des cinq chemins de casse n'ont
aucun champ fautif pris isolément) ; garde `IDS_SUSPENDUS` limitée aux qids
**ajoutés** ; repli par nom de `resoudrePackBase` réparé ; bloc « Packs suggérés »
retiré ; banc d'invariant au lieu d'un journal mort-né.

**Options écartées.** Journaliser la perte de cible (vert en test, muet à vie
depuis le LOT-02) ; refus 400 sur instrument suspendu (le dépôt rend 409, mon plan
avait tort) ; rendre le bloc « Packs suggérés » auto-réparant (changement de
contrat de route pour une surface que D-030 retire).

**Prochaine action.** Merger, déployer, **puis** les six désactivations par l'UI —
geste praticien, jamais SQL — et relire « exactement un pack actif ».

**Questions ouvertes.** Après le retrait, aucune réactivation depuis l'UI : une
désactivation par erreur n'a pas de retour. `questionnaire_packs.actif` restera
`false` sur 7 lignes sur 8, champ que rien ne relit.

## 2026-08-07 — Retrait des packs exécuté, campagne au LOT-04

**Décisions.** Geste production fait par le praticien (6 désactivations UI,
05:59:10 → 05:59:32), après déploiement du garde. Trois lectures de contrôle :
exactement 1 pack actif ; aucune consultation ne pointait un pack désactivé (15
sur le pack de base, 10 nulles) donc risque `pack-reevaluation` **nul, mesuré
après le geste** ; `questionnaire_packs` a suivi (7/8 à `actif: false`). État
machine passé à LOT-04, statut du lot et résultats consignés.

**Options écartées.** Laisser le fichier de lot annoncer « reste dû » et l'état
machine sur LOT-03 : c'est la dérive qui a produit #598 et #601.

**Prochaine action.** LOT-04 — clôture de campagne. Son « Hors périmètre » exclut
tout développement neuf : les cinq dettes datées y seront reprises ou renvoyées
vers des lots nommés.

**Questions ouvertes.** Aucune réactivation de pack depuis l'UI, désormais
sensible puisque sept packs sont éteints. `R2-SOM-05` propose Horne sans la porte
`RYTHME_BIOLOGIQUE` de `R2-SOM-03` — délibéré ou angle mort du LOT-02 ? Décision
clinique, que ni le code ni le dépôt ne tranchent.

## 2026-08-07 — Hygiène du workflow : clôture opposable, sync origin, état atomique

**Décisions.** Quatre lots sur une branche (A→D) : skills `wn-r0..r6` supprimés
et références purgées ; `wn-cycle` fetch `origin`, signale un défaut local
divergent (ahead 50 / behind 51 constaté) et un pointage périmé — constat,
jamais de réconciliation automatique ; clôture SESSION_LOG + handoff rendue
opposable dans `/wn-pr` (verdict de cycle) et `/wn-merge` (`files` de la PR),
rattrapage de fenêtre ratée passant par construction ; `state.json` en écriture
atomique, `recent_decision_ids` alimenté depuis `docs/DECISIONS.md` (option i
du cadrage). Ancre sed « Attendre le CI » de wn-merge réparée, gardée par
`wn-check-automation.sh`.

**Options écartées.** Blocage sur dérive de pointage (faux positif garanti en
worktrees parallèles) ; `pull` automatique (décision de fusion, pas une sync).

**Prochaine action.** PR draft, CI (`verify`), puis arbitrer la réconciliation
du `main` local divergent.

**Questions ouvertes.** Faut-il un lot nommé pour résorber l'ahead 50 / behind
51 du poste principal ?
## 2026-08-07 — LOT-04 packs-personnalisés : clôture de campagne

**Décisions.** Campagne `2026-08-06-packs-personnalises` close, deux verdicts
revus. Fait 3 : la perte de cible est impossible **pour la cible pack seulement**
(`orientationRulesV1.test.ts:463`) ; la branche questionnaire
(`orientationEngine.ts:627`, `orientationService.ts:262-264`) reste non
instrumentée. Fait 4 **partiellement vérifié** : le pack de base est passé de 5 à
6 qids le 2026-08-06 à 18:02 (`packs.updated_at`), donc **pendant** la campagne,
auteur indéterminé, avant l'existence du garde `IDS_SUSPENDUS`. [[D-032]]
réécrite.

**Options écartées.** Étendre le LOT-04 à l'E2E manquant. Annoncer trois dettes
sans lot : il y en a **cinq** (`LOT-03-integration.md:203-213`), la dérive
« seed à 5 qids » passant au périmètre du LOT-00.

**Prochaine action.** PR de clôture (T1, T3, audit verts ; CI non lu), puis
LOT-00 de `2026-08-07-dettes-packs-residuelles` : il **débloque**
`2026-08-04-agenda-alimentaire`, dont le runbook exige zéro pack référençant
`Q_ALI_09` (prod : 1).

**Questions ouvertes.** Forme du geste de retrait d'un qid suspendu ; l'E2E
doit-il asserter l'envoi du mail.

## 2026-08-07 — Dégraissage de CLAUDE.md : la gouvernance PR/merge sort du fichier toujours chargé

**Décisions.** `CLAUDE.md` passe de 26 722 à 19 586 o (−26,7 %). L'essentiel du
gain vient d'un déplacement, pas d'une coupe : la gouvernance PR/merge (7 417 o,
27,8 %) part verbatim dans `docs/claude/REGLES_PR_MERGE.md`, que `/wn-merge`
charge par `cat` — elle ne sert qu'au moment de merger et y était déjà rechargée,
donc payée deux fois. Le couplage par ancres `sed`, rompu en silence le matin,
disparaît ; le garde d'ancres devient un garde d'existence. Récits d'incident
compressés en règle + date + lien. Deux erreurs corrigées : `patient/[idAssignation]`
donné comme portail patient alors que le courant est `portail/[token]`, et
l'audit du matin qui affirmait à tort « zéro prescription de délégation ».

**Options écartées.** Ajouter une étape de délégation à `/wn-plan`, `/wn-debug`,
`/wn-review` : ils portent déjà `context: fork`, l'ajout aurait été de la
cérémonie et un saut de plus. Compresser sur place la gouvernance PR/merge :
moitié moins de gain, et perte de détail.

**Prochaine action.** PR, `verify`, merge. Puis arbitrer le `main` divergent.

**Questions ouvertes.** La re-mesure de la consommation reste impossible depuis
le conteneur (transcripts sans compteurs de tokens) : faut-il un export console ?
## 2026-08-07 — LOT-00 dettes-packs : le geste de retrait d'un instrument suspendu

**Décisions.** `WN_AGENDA_ALI` est **allumé en production** depuis le 2026-08-05
(`RUNBOOK-allumage-drapeau.md:227-231`), ce qui **inverse le diagnostic** :
`Q_ALI_09` n'y est pas suspendu, `valider/route.ts:144-152` ne l'écarte pas, le
pack de base part entier — le prochain onboardé reçoit l'agenda **sans décision
praticien** ([[D-025]]). Titre du lot réécrit, il n'était vrai que drapeau éteint
([[D-033]]). Geste de donnée **différé après merge** : le lot **n'est pas livré**,
seule sa moitié code l'est.

**Options écartées.** Annoncer le lot clos. Statut `en_cours`, que
`wn-campaign-audit.mjs:39-42` ne compte pas comme clos.

**Prochaine action.** Après merge : retirer `Q_ALI_09` du pack de base par l'UI —
depuis la **liste principale**, l'instrument y étant `actif` — puis les deux
lectures SQL de contrôle.

**Questions ouvertes.** Aucun contrat `web/prisma/checks/` n'assère « aucun pack
actif ne référence un qid de `IDS_SUSPENDUS` » : sans lot.

## 2026-08-07 — Clôture de session : deux lots workflow livrés, et un CI fantôme

**Décisions.** #607 et #609 mergées : clôture opposable, sync `origin` dans
`wn-cycle`, `.wn/state.json` atomique, retrait de `wn-r0..r6` ; puis `CLAUDE.md`
de 26 722 à 19 586 o (−26,7 %), la gouvernance PR/merge sortie dans
`docs/claude/REGLES_PR_MERGE.md` que `/wn-merge` charge par `cat`. Diagnostic
consigné dans le handoff : une PR peut rester **sans run `verify`** sans cause
identifiable — l'explication d'abord retenue (branche recréée sous un nom déjà
utilisé, suite de checks réassociée) est **réfutée par #610**, qui a reproduit
les mêmes conditions et obtenu son run aussitôt. Ce qui tient : ni « ready » ni
fermer/rouvrir ne créent une suite ; un nouveau SHA de tête, oui.

**Options écartées.** Ajouter une étape de délégation aux skills qui portent
déjà `context: fork` (cérémonie sans gain) ; compresser la gouvernance PR/merge
sur place plutôt que la déplacer.

**Prochaine action.** Arbitrer le `main` divergent (ahead 50 / behind 51), puis
décider du lot `wn-attendre-ci.mjs`. Correction apportée en revue : le script
**nomme déjà** la branche squashée puis rebranchée (`wn-attendre-ci.mjs:12,157`)
— ce qui lui manque est le cas « aucun run créé sans raison identifiable », et
son remède, pousser un nouveau SHA de tête.

**Questions ouvertes.** Que valent les 50 commits locaux jamais poussés ?
## 2026-08-07 — LOT-00 dettes-packs : geste de donnée fait, campagne agenda débloquée

**Décisions.** LOT-00 passé à `livré` sur ses **deux** moitiés : code (PR #608) et
donnée — `Q_ALI_09` retiré du pack de base le 2026-08-07 à 15:46
(`packs.updated_at = 15:46:34.011`). Quatre lectures : 5 qids identiques à
`web/prisma/seed.ts:270` ; `pack_questionnaires` à 5 lignes, `ordre` `[0..4]` ;
**0 ligne** au prérequis du runbook (1 depuis le 2026-08-06 18:02) ; **0
assignation** entre dérive et retrait. Campagne agenda déclarée **débloquée**
dans `.wn/state.json`, qui disait « BLOQUÉE ».

**Options écartées.** Ouvrir `LOT-06` de la campagne agenda : la campagne pose
elle-même la porte des 21 jours (`2026-08-04-agenda-alimentaire/CAMPAGNE.md:123`,
`:151`) et le recueil est arrêté au premier jour. Clore
`dettes-packs-residuelles` : son `LOT-01` est `à_faire`.

**Prochaine action.** LOT-01 — E2E orientation → file d'envoi → envoi →
déduplication ; couverture nulle.

**Questions ouvertes.** Recueil agenda arrêté : 2 journées, toutes deux du
2026-08-05, 1 assignation. Rien ne re-vérifie un prérequis de runbook après
l'allumage.

## 2026-08-07 — Lot pointage : ne plus stocker ce qui se recalcule

**Décisions.** `next_action` passe d'une chaîne de 6 023 caractères **sur une
seule ligne** à un tableau de 31 lignes découpé aux frontières de phrase
(réversible au caractère près) : c'était lui, et non les champs `git.*`, le
moteur des conflits — preuve faite, deux branches modifiant des passages
différents conflictent dans l'ancienne forme et fusionnent dans la nouvelle. Le
bloc `git` sort du fichier : `dirty` était toujours faux (écrit avant le commit)
et `branch` nommait souvent le worktree d'une autre session. `analyserPointage`,
écrit le matin même, disparaît avec lui — sans stockage, pas de dérive.
`wn-campaign.mjs` cesse de dupliquer l'écriture non atomique. `reparer()` est
exporté et couvert (5 cas).

**Options écartées.** Sortir `next_action` vers les fichiers de campagne (plus
propre, mais touche tous les consommateurs) ; supprimer `wn-etat-reel.mjs`
malgré son absence d'appelants (décision distincte).

**Prochaine action.** PR, `verify`, merge. Puis le découpage **éditorial** de
`next_action` (clos vs en vol), toujours dû depuis le LOT-01 #575.

**Questions ouvertes.** `wn-etat-reel.mjs` n'est invoqué par aucun workflow,
skill ni hook : le brancher ou le supprimer ?

## 2026-08-07 — Pointage trié : ce qui est clos quitte next_action

**Décisions.** 10 lignes closes sur 31 quittent `next_action` pour le fragment de
handoff (−37 %, de 5 993 à 3 768 caractères), chacune vérifiée contre le dépôt et
non sur la foi du texte ; aucune perte, prouvée par comparaison à `892a5ff`. Une
ligne a été reclassée par le dépôt lui-même : le « geste post-merge dû pour
réconcilier `git.*` » était sans objet depuis #612, mergée le même après-midi.
`wn-etat-reel.mjs` est **gardé et documenté** dans les « Commandes utiles » :
correction de ma formulation de la veille — il n'est pas orphelin, c'est un outil
à la main par conception, et la frontière rapporter/réparer était déjà posée dans
`PROJET_CONTEXTE.md:109`. Enfin « `dirty` était toujours faux » corrigé dans les
**deux commentaires de banc** (`wn-etat-reel.test.mjs`, `wn-cycle.test.mjs`) : la
valeur stockée était toujours `true`, donc toujours inexacte. **L'entrée du
2026-08-07 sur #612 garde sa formulation d'origine** : ce journal est append-only
(règle de `CLAUDE.md`), donc une entrée datée ne se réécrit pas — la correction
se consigne ici, dans l'entrée suivante. Réserve soulevée par la revue Copilot
sur cette PR, et elle avait raison.

**Options écartées.** Brancher `wn-etat-reel` dans un skill (coût `gh` + balayage
de `web/src` à chaque appel) ; le supprimer (son banc est en CI, sa génération
est la vue de vérité du LOT-01).

**Prochaine action.** PR, `verify`, merge — en attendant la revue Copilot cette
fois, puisqu'elle a publié après le merge de #612 avec deux remarques fondées.

**Questions ouvertes.** Les quatre arbitrages restés dans `next_action` (PR #372,
trois campagnes figées) : ce sont des décisions humaines, pas des faits clos.
## 2026-08-07 — LOT-01 dettes-packs : la première preuve E2E du parcours d'envoi

**Décisions.** LOT-01 `livré`. `web/e2e/orientation-file-envoi.spec.ts` joue six
étapes, sept mutations rouges, référence verte d'abord. Le banc arme
`WN_ENABLE_ORIENTATION_NNPP2` (posé en prod depuis le 2026-08-04) et force
`SMTP_URL` vide. Revue adversariale : **NO-GO**, cinq constats, tous repris —
dont un fait faux que j'avais écrit sur l'état de G4/G5 en production.

**Options écartées.** `resetPortailState` pour le nettoyage : elle filtre sur
`idAssignation: { not: null }` et n'aurait jamais nettoyé la fixture. Prouver la
sortie de la file à l'écran : deux formulations ont laissé la mutation VERTE.

**Prochaine action.** PR, puis clôture de la campagne (LOT-00 et LOT-01 livrés).

**Questions ouvertes.** Le mail lui-même reste sans preuve E2E. Et le seed ne
porte aucun `rawAnswers` : toute règle d'orientation est morte sur ses données.

## 2026-08-07 — Clôture : cinq lots workflow, et un faux positif dans mon propre garde

**Décisions.** Cinq PR mergées (#607, #609, #610, #612, #613) : clôture opposable
dans `/wn-pr` et `/wn-merge`, sync `origin` dans `wn-cycle`, `.wn/state.json`
rendu atomique puis débarrassé des champs qui se recalculent, `next_action`
rendu fusionnable puis trié (−37 %), `CLAUDE.md` allégé de 26,7 % par sortie de
la gouvernance PR/merge dans `docs/claude/REGLES_PR_MERGE.md`.

**Découverte de fin de session.** Le « `main` local ahead 50 / behind 51 »
signalé toute la journée est une **illusion du clone superficiel** : les 50
commits sont les squash des PR #459→#518, tous mergés, et `.git/shallow`
empêche git de calculer la base commune. Aucun travail en danger, rien à
arbitrer — mais l'avertissement de sync posé au LOT-B crie donc à la divergence
à tort sur tout clone superficiel.

**Options écartées.** Réaligner le `main` local : sans objet, tout lot repart
d'`origin/main` fraîchement fetché.

**Prochaine action.** Faire détecter le shallow par `wn-cycle` pour que son
avertissement reste crédible.

**Questions ouvertes.** PR #372 et trois campagnes figées, toujours en attente
d'arbitrage praticien.
## 2026-08-07 — Clôture de la campagne dettes-packs-résiduelles

**Décisions.** Campagne close sur ses deux lots (LOT-00 #608, LOT-01 #614).
**Pièce relue à la clôture, pas reprise** : lecture de production en fin de
journée — « Base de consultation » actif à 5 qids, `updated_at` inchangé à 15:46,
aucun pack ne référence `Q_ALI_09`. Activité primaire promue à
`2026-08-05-cloture-des-dettes-wellneuro-5-0` (LOT-06). Les lignes closes
quittent `next_action` pour ce handoff, convention de #613.

**Options écartées.** Promouvoir la campagne agenda : elle n'attend pas un
correctif mais des données que personne ne saisit. Réécrire les commentaires
périmés de `playwright.config.ts` sur G4/G5 : hors périmètre, l'avertissement est
posé à côté.

**Prochaine action.** LOT-06 de la campagne promue — notices psychométriques et
exigences RGPD.

**Questions ouvertes.** Cinq dettes de packs sans lot d'accueil (D-032). Un
prérequis de runbook n'est re-vérifié par rien après l'allumage — aucun contrat
`web/prisma/checks/` ne l'assère.

## 2026-08-07 — LOT-06 : dossier RGPD et recadrage des dettes psychométriques

**Décisions.** Le lot reposait sur six faits périmés ou faux ; les corriger fait
partie du livrable. Périmètre retenu : recadrage **plus** production effective du
dossier RGPD — seul trou réel, les exigences 5 et 6 ayant leur code livré depuis
juillet. `docs/DOSSIER_RGPD.md` : quatorze rubriques, chacune sourcée dans le
dépôt ou marquée TROU avec porteur et échéance (défaut 2026-10-21), aucune valeur
juridique inventée. COSMIN assumé inconnu **une fois pour les 65 instruments**,
dans `corpus/README.md` — toucher le JSON déclencherait build et E2E pour une
phrase.

**Options écartées.** Reprendre le brouillon du worktree `lot06-rgpd-recadrage`
tel quel : son diff `CAMPAGNE.md` régressait LOT-04/LOT-05. Rédiger l'AIPD, ou
trancher la contradiction DPO (G-TRUST-02 dit « pas de DPO », D-005 dit
« confirmé par le DPO ») : exposées, pas résolues.

**Prochaine action.** LOT-07 — clôture de campagne, PR #435 et #372 à solder.

**Questions ouvertes.** Trois trous découverts à l'écriture et nommés nulle part
avant : information sur l'écart d'hébergement non consignée, fournisseur SMTP non
identifié, Sentry sous-traitant de fait non déclaré aux personnes.

## 2026-08-08 — LOT-07 : clôture de la campagne, verdict 5.0

**Décisions.** `DECLARATION_5_0.md` statue sur les huit dettes de l'audit
d'entrée. **Verdict : 5.0 n'est pas déclarable en bloc** — 3 fermées (1, 3, 7),
1 arbitrée et reportée au 2026-10-21 (8), **4 ouvertes** (2, 4, 5, 6). Aucun
verdict pris sur la prose d'un lot : chaque preuve confrontée à l'artefact,
script exécuté et sortie rediffée. **Quatre verdicts sur huit diffèrent de ce que
le lot écrivait de lui-même.** #372 fermée sans merger. Campagne close.

**Options écartées.** Poser les quatre dettes ouvertes en lots de cette
campagne : la garde `closed_campaign_with_open_lots` l'interdit, et à raison —
on ne pose pas une dette découverte à la fermeture dans ce qu'on ferme. Corriger
au passage les commentaires faux de `orientationEngine.ts` : hors périmètre.

**Prochaine action.** Cadrer une campagne pour les quatre dettes ouvertes, la 6
en premier — un outil d'état qui ne compare qu'une dimension sur six rend un
« zéro écart » qui n'engage rien, et tout jugement sur les autres passe par lui.

**Questions ouvertes.** La date d'arbitrage HDS diverge d'un jour entre
`CAMPAGNE.md` (2026-07-22) et le dossier RGPD (2026-07-21).

## 2026-08-08 — Refonte de l'environnement Claude Code (PR #618, mergée)

**Décisions.** CLAUDE.md 309 → 191 lignes ; règles spécialisées en
`.claude/rules/` path-scopées ; défaut « Sonnet 5 + high + solo » porté par
CLAUDE.md, fin du méta-routage automatique (`wn-route` manuel) ; échelle
`think*` supprimée partout ; `wn-cycle`/`wn-attendre-ci` allégés (~15 appels
`gh` par cycle PR au lieu de ~26-28, polling adaptatif 20→60 s) ; hook de log
`async: true` ; commentaires CI déplacés en ADR. Suite : orchestrateur GitHub
orphelin archivé (`archive/scripts/`).

**Options écartées.** Supprimer `wn-explorer` (coût nul, épinglage haiku
utile) ; trancher `paths:` vs `globs:` sur les rules — test d'injection non
concluant en session distante, les deux clés restent posées.

**Prochaine action.** Observer en session locale fraîche quelle clé de scoping
charge réellement les rules, puis retirer l'autre.

**Questions ouvertes.** `wn-auto` sans usage mesuré — fusion dans `/wn` ?
## 2026-08-08 — Dette 2 réglée : la validation psychométrique n'entre pas au programme

**Décisions.** D-034 — décision utilisateur : Wellneuro repère et prépare une
consultation, il ne mesure pas. Un **non assumé**, qui ferme la dette 2 au lieu
de la reporter. Conséquence exécutable : la consigne système ne revendique plus
la validation (`synthese-v18` → `v19`), seule surface du runtime à l'affirmer, et
un garde de banc refuse son retour. « Certifié » reçoit sa définition là où le
mot s'emploie. Le verdict 5.0 passe à 4 fermées / 1 reportée / 3 ouvertes.

**Options écartées.** Ingérer les études de validation (bornée ou intégrale) :
une campagne, pour un statut dont le produit ne se réclame nulle part. Ajouter
le sens de « certifié » aux badges praticien : geste d'UI, nommé comme dû dans
D-034 plutôt que prétendu fait.

**Prochaine action.** Campagne des trois dettes ouvertes, la 6 en premier —
motif : taux de récidive, pas prérequis.

**Questions ouvertes.** Les badges « Certifié » circulent sans leur définition.

**Ce que deux passes de revue ont rattrapé, et qui vaut d'être retenu.** (1) Ma
première rédaction interdisait de présenter les instruments comme validés — faux
clinique : le catalogue sert l'EORTC QLQ-C30, le PSQI, la HAD, l'Epworth. (2) Le
faux survivait dans l'énoncé de D-034 et dans le fragment de changelog après
correction du prompt. (3) Mon exception de regex `par ailleurs` était un
**passe-partout** : creusée pour un cas légitime, réutilisable par le défaut.

## 2026-08-08 — Suites : clé paths confirmée, wn-auto fusionné

**Décisions.** Test d'observation en contexte neuf : la clé `paths:` des
`.claude/rules/` est honorée (injection ciblée par fichier lu — db-prisma,
clinique-scoring, auth-securite). Question ouverte close, rien à changer.
`wn-auto` supprimé : `/wn` sans argument porte la reprise (lot actif →
SESSION_LOG → roadmaps, lecture seule).

**Options écartées.** Garder `wn-auto` en doublon de `/wn` sans argument.

**Prochaine action.** Aucune sur l'environnement Claude Code — chantier clos
(#618, #620, cette PR).

**Questions ouvertes.** Néant.

## 2026-08-08 — Fin de session : refonte environnement Claude Code close

**Décisions.** Chantier livré en trois PR mergées : refonte (#618), suites et
corrections du contre-audit externe (#620), fusion `wn-auto` → `/wn` et
confirmation de la clé `paths:` (#622). Revue Copilot de #622 intégrée :
`wn-check-automation.sh` nettoyé de `wn-auto` (contrôle 42/42), chemins du
changelog précisés.

**Options écartées.** Étendre le « merge si green » de #620 à #622 sans
instruction : le merge est resté à la main de l'utilisateur.

**Prochaine action.** Aucune sur cet outillage. Développement courant sous le
nouveau régime : Sonnet 5 + high + solo, rules path-scopées actives.

**Questions ouvertes.** Néant.

## 2026-08-08 — LOT-01 : le parcours patient legacy retiré, la redirection reste

**Décisions.** Retrait immédiat de `web/src/app/patient/` plutôt qu'une
date-cible : le parcours était inatteignable depuis le 2026-08-05 (D-035). La
redirection 307 passe de `next.config.mjs` à `web/src/middleware.ts`.

**Options écartées.** Une date-cible — la mesure d'usage qui l'aurait datée
coûtait plus que le retrait. Garder `redirects()` « en filet » : il s'exécute
**avant** le middleware, gagnait la course et neutralisait le correctif.

**Ce qu'un banc a démenti.** Aucun test n'empruntait la redirection ; le premier
écrit a montré que `redirects()` recopiait la query — un email de patient
partait dans l'URL du portail, contre ce que `next.config.mjs` jurait.

**Prochaine action.** LOT-02 : « Certifié » devient « Scoring vérifié » à
l'écran praticien, toute la famille des libellés (arbitrage du 2026-08-08).

**Questions ouvertes.** Jusqu'à quand garder la redirection `/patient/*` ?
`api/patient/assignations` n'a plus d'appelant.

## 2026-08-08 — LOT-02 : « Certifié » devient « Scoring vérifié »

**Décisions.** Renommer le libellé plutôt qu'ajouter une infobulle ou un lien, et
sur **toute la famille** — « Non certifié » se lit aussi bien comme « non validé
psychométriquement » (D-036). Aucune donnée renommée : l'écart écran/dossier est
assumé et écrit.

**Options écartées.** L'infobulle native : hover-only, et `UX_WELLNEURO_3_0.md`
la remplace explicitement par un bouton d'information ; aucun composant
réutilisable n'existe. Le lien : fait quitter l'écran. Ne qualifier que les trois
badges verts : échelle incohérente.

**Ce que deux passes de revue adversariale ont rattrapé, dont trois défauts
survivant au premier correctif.** (1) Un garde qui interdit un **mot** n'épingle
pas une **affirmation** : la prose cabinet inversée passait verte. (2) La surface
principale n'avait **aucun** rendu asséré — la page mocke le panneau. (3) Le
libellé n'est que la moitié du badge : `variant="success"` en dur rendait tous les
états **en vert**, d'où `data-variant` sur `Badge`. (4) Une fixture qui accorde
deux champs cesse d'exercer la seconde moitié d'un `||`. (5) Un banc qui ne couvre
que les états servis aujourd'hui rate `inconnu`, l'état de 21 instruments.

**Ce qui est mesuré, non estimé.** 65 instruments : 38 `certifie`, **21
`inconnu`**, 6 `ambigu` — et **18 des 21 sont `scoring_verifie` au registre**,
donc l'écran taît une vérification qui a eu lieu. Le MMSE n'en fait pas partie
(`contenu_verrouille`) : le citer comme divergence était faux.

**La classe de défaut que ce lot a payée trois fois.** Un chiffre se relève sur la
base qu'on annonce : « 131 E2E » venait d'une passe portant un banc jetable (130),
deux comptes de rouges venaient de sélections partielles, et « 14 blocs seed »
comptait une lecture pour une donnée (15).

**Prochaine action.** LOT-03 (dette 4) : re-mesurer la dérive registre/packs à la
date d'ouverture, puis poser le garde contre son retour.

**Questions ouvertes.** Rien ne relie « Scoring vérifié » au barreau
`scoring_verifie` dont il emprunte le nom — même lot que le garde anti-dérive ?

## 2026-08-08 — LOT-03 : la dérive registre/packs re-mesurée, puis fermée

**Décisions.** La re-mesure d'ouverture (0 divergence sur 8 packs) a trouvé le
**générateur** : `syncPackToRegistry` jetait silencieusement tout qid sans
définition. D'où deux gardes — le chemin d'écriture refuse (409 nommant les qids),
et un contrat SQL en **préflight de production**. LOT-04 ouvert ; le badge muet
reste une décision produit (`D-037`), pas un lot.

**Options écartées.** La lecture planifiée : un secret de production dans GitHub
Actions, second chemin d'accès à la base. Le contrat en CI seul : base vide, donc
assertion vacue.

**Ce que trois passes de revue ont démenti.** Deux NO-GO. Le garde refusait de
**désactiver** le pack qu'il dénonce ; le message nommait un geste impossible ; et
un **correctif** a rouvert la dérive — le seed miroitait la constante au lieu de
la ligne en base.

**Prochaine action.** LOT-04.

**Questions ouvertes.** Une dérive « qid sans définition » bloquerait les releases
sans chemin de correction relu.

## 2026-08-09 — HDS : la décision tranchée, le certificat consigné, deux prémisses non établies retirées

**Décisions.** `D-037` confirme `D-006` et avance la revue de la dette HDS du
2026-10-21 à la **réponse de Scalingo** (ticket envoyé ce jour). L'échéance de la
dérogation, elle, ne bouge pas. L'ordre imposé de `D-006` tient : aucune donnée
réelle avant archivage du DPA et confirmation écrite du périmètre HDS de la
région. Le certificat LNE 38436-2 entre au dossier RGPD.

**Deux prémisses non établies, qualifiées par le responsable.** L'exigence d'une carte
**CPS** — l'activité n'est pas réglementée ; et le DPA **à e-signer** — il vit
dans les documents généraux, acceptés à la souscription. Elles plaçaient une
latence contractuelle inexistante sur le chemin critique. Le correctif reste
écrit dans l'audit, ces faux bloqueurs étant ressortis deux fois.

**Options écartées.** Suspendre `D-006` jusqu'en octobre (deux mois pour une
information que le ticket rend en jours) ; la révoquer (aucun fait contraire).

**Correction.** L'entrée précédente annonce `D-037` pour le badge muet : ce
numéro est pris. `decisions-numerotation.mjs` refuse tout trou — une réservation
n'existe pas.

**Prochaine action.** Contrat SQL pgvector en CI, puis recette staging une fois
les secrets et flags posés par le responsable.

**Questions ouvertes.** Rollback sans critère ni fenêtre ; aucun GO/NO-GO de
migration ; `osc-secnum-fr1` inaccessible sur le compte.

## 2026-08-09 — Clôture de la campagne des dettes ouvertes 5.0, Done vérifié plutôt qu'hérité

**Décisions.** La campagne `2026-08-08-dettes-ouvertes-5-0` est close sur ses
cinq lots. Les trois cases restantes du Done ont été **re-prouvées par mutation
à la clôture** (trois rouges, témoin 24/24 vert) — pas cochées sur la prose des
lots. Aucune campagne promue : l'état porte trois fils à arbitrer (décision
badge muet, chantier HDS, jalon 2026-10-21), l'agenda reste parallèle.

**Options écartées.** Promouvoir l'agenda alimentaire en activité primaire
(mécanique de `deactivate`) : il est gaté par un recueil arrêté au premier
jour — une « activité primaire » qui n'ouvre aucun lot mentirait. La vue rend
proprement « Aucune campagne primaire active », l'audit reste vert.

**Prochaine action.** Arbitrage utilisateur entre les trois fils ; côté HDS, le
contrat SQL pgvector en CI puis la recette staging (secrets/flags au
responsable).

**Questions ouvertes.** Reprises dans le handoff de clôture : badge muet (22
instruments), redirection `/patient/*` sans échéance, `seuils_points`,
instrument terminal encore `certifie`.

## 2026-08-09 — D-038 : le badge muet parlera depuis le catalogue, aligné à la main

**Décisions.** `D-038` (décision utilisateur) tranche le fil 1 de la clôture :
le catalogue de code reste la source d'autorité du badge « Scoring vérifié ».
Alignement à la main, instrument par instrument, adossé au banc certify —
jamais une copie du registre. Les 4 « ambigu » (Q_SOM_02, Q_GAS_01, Q_FIB_02,
Q_URO_01) se réexaminent un par un. Liste de référence : la sortie du garde du
2026-08-09 (22 instruments), qui fait foi à chaque `npm run check`.

**Options écartées.** Le registre pilotant l'écran : écrasait la nuance
« ambigu » sans réexamen et vidait le garde écran ↔ registre de son objet. Le
silence assumé : 18 instruments certifiés muets, 4 contredisant le registre.

**Prochaine action.** Ouvrir le lot d'alignement (changement d'UI → T2) ; les
fils 2 (HDS pgvector/staging) et 3 (jalon 2026-10-21) restent ouverts.

**Questions ouvertes.** Le motif du doute des 4 « ambigu » — à instruire au
lot, pas ici.

## 2026-08-09 — L'alignement D-038 exécuté : le badge parle, l'inventaire tombe à zéro

**Décisions.** Les 18 déclarations posées sur verdicts certify existants (0
divergence critique partout) ; les 4 « ambigu » levés après réexamen — leurs
doutes dataient d'avant les verdicts du 2026-07-30. Q_FIB_03 (suspendu) intact.
Le garde du seed gagne son unique exemption, dérivée de `motifNonInterpretable`
(passation MFI-20 antérieure à la reconstruction), jamais une liste.

**Options écartées.** Poser la clé sur le bloc seed MFI-20 (fausse au dossier,
inerte à l'écran) ; éditer la matrice drive-mapping (audit daté du 2026-07-06,
supersédé par le registre).

**Ce que la vérification a montré.** L'essentiel était déjà vérifié : le lot
est une transcription de verdicts, pas une enquête. « Historique » n'est plus
atteignable depuis le seed — non-couverture nommée dans le spec E2E.

**Prochaine action.** CI `verify` sur la PR (E2E injouables dans ce conteneur :
navigateur épinglé 1228 vs 1194 préinstallé, téléchargement bloqué). Fils 2
(HDS) et 3 (jalon 2026-10-21) ouverts.

**Questions ouvertes.** Voir le fragment de changelog du lot.

## 2026-08-09 — Contrat SQL pgvector : le socle RAG tenu en CI et en préflight de release

**Décisions.** Le contrat (`rag_pgvector_structure_v1.sql`, lecture seule)
assère extension, index HNSW cosinus valides, signatures et droits des deux
`match_*` ; câblé dans `ci.yml` ET en préflight fail-closed de
`release-db.yml` — la production a été lue conforme avant ce câblage. PR #634
mergée.

**Options écartées.** Le contrat en CI seul : la vraie perte d'index est un
geste de production, que seul le préflight voit. Un test de plan d'exécution :
sur base vide, le planificateur ignore l'index de toute façon.

**Preuve qu'il mord.** Trois dérives provoquées sur base éphémère lèvent :
index supprimé, rebuild en L2, `GRANT EXECUTE TO PUBLIC`.

**Prochaine action.** Mardi 2026-08-12 : recette staging, après pose des
secrets et flags par le responsable.

**Questions ouvertes.** Rollback sans critère ni fenêtre ; aucun GO/NO-GO de
migration ; réponse Scalingo attendue.

## 2026-08-10 — La chaîne alimentaire devient une campagne, D-039 posée

**Décisions.** Synthèse de la question alimentaire consolidée (note de
cadrage ancrée chemin:ligne, désormais dans le dossier de campagne) ; campagne
`2026-08-10-chaine-alimentaire` ouverte en activité primaire, cinq lots.
`D-039` (décision utilisateur) : la clôture de l'agenda transmet tous les
agrégats calculés, sans poids ni seuil, liste dérivée du domaine.

**Options écartées.** Sous-ensemble resserré d'agrégats (curation = jugement
clinique prématuré) ; différer la clôture (l'agenda restait invisible).

**Prochaine action.** LOT-00 : `agenda-alimentaire/cloture.ts` calqué sur le
jumeau sommeil, banc de bijection dérivée, idempotence, T2 — PR séparée de
cette ouverture.

**Questions ouvertes.** Dégel de JA5-05 ; relance humaine du recueil ; liste
des règles candidates du LOT-03 (claims + décisions cliniques à venir).

## 2026-08-10 — LOT-00 : l'agenda alimentaire entre au dossier

**Décisions.** La clôture livrée sur le gabarit sommeil, bornée par D-039 :
23 pseudo-items dérivés, `scored:false`, liste épinglée à la main au banc.
Deux gardes au-delà du jumeau : refus fail-closed sur quarantaine (dates
nommées), résolution des corrections avant comptage. Route praticien sans
garde de drapeau — l'arbitrage LOT-05 étendu à la consolidation, écrit dans
la route.

**Options écartées.** Clôturer par-dessus la quarantaine (agrégats sur recueil
amputé) ; poser un bouton UI dans ce lot (geste séparé avec son E2E).

**Preuves.** 20/20 au banc (clôture + route), mutation curation → 3 rouges,
témoin vert ; T1 vert ; Vitest 4 253 ×2 positions. E2E → verify de la PR.

**Prochaine action.** PR du lot ; puis LOT-01 (discordance) qui exige sa
décision clinique, ou le bouton praticien comme micro-geste.

**Questions ouvertes.** Clôture automatique portail à J21 (le jumeau l'a) —
décision d'activation à part.

## 2026-08-10 — Le bouton de clôture praticien, et un badge E2E retrouvé

**Décisions.** Bouton « Clôturer et verser au dossier » sur le lecteur agenda
alimentaire, patron du jumeau sommeil ; libellé « verser au dossier » (pas
« agréger », D-039). Refus laissés au serveur, non redoublés côté client. Le
parcours praticien E2E ré-atteint « Historique » par une vraie clôture — la
non-couverture nommée de fiche-detail-reponses (héritée de D-038) est levée.

**Options écartées.** Confirmation modale (clôture idempotente, refus nommés) ;
garde de drapeau côté client (l'arbitrage LOT-05 tient — collecte vs
consolidation).

**Ce qu'une revue a démenti.** La première rédaction de l'E2E appelait les
routes portail patient avec le seul cookie praticien (401). Corrigé : les deux
cookies coexistent (noms distincts), le praticien pour la fiche, le portail
pour consentement et saisie.

**Prochaine action.** PR du lot ; puis LOT-01 (discordance), qui s'ouvre par sa
décision clinique.
## 2026-08-10 — La validation d'envoi rejoint le praticien (accueil + orientation NNPP2)

**Décisions (propriétaire).** Envoi direct — le bouton « Envoyer (N) — un seul
mail » de la Bibliothèque apparaît sur l'accueil (nouveau bloc aside « File
d'envoi ») et sous les suggestions NNPP2 ; le clic EST la validation, D-030
inchangée. Fusion des inbox réception/envoi **écartée** : deux logiques, deux
blocs voisins.

**Options écartées.** Un simple raccourci vers la Bibliothèque (une navigation
de plus pour rien) ; la fusion (mélange de l'ancre de consultation et des
brouillons dans un composant).

**Livré.** PR #639 mergée — aucun changement d'API, le brouillon part entier,
l'orientation est relue après envoi. 114 tests verts, T1 vert.

**Prochaine action.** Mardi 2026-08-12 : recette staging. Au premier passage
Mac : rejouer T2 (E2E non rejoués avant merge — seule réserve du lot).

**Questions ouvertes.** Inchangées (rollback, GO/NO-GO, réponse Scalingo).

## 2026-08-11 — LOT-00 : la validité des passations, et ce que le banc mesurait

**Décisions.** Statut `statut_validite` porté par passation (CHECK à cinq
valeurs, migration relâchée en production) ; filtre unique appliqué à la
synthèse, l'orientation, l'équilibre/momentum et le cockpit ; invalidation
praticien tracée, motif obligatoire. Tout derrière `WN_ENABLE_VALIDITE_PASSATIONS`,
éteint — l'allumage reste un geste à part.

**Trois exigences de la spec refusées.** `SUPERSEDED` automatique à la
re-passation (effacerait l'ancre T0 et tout le momentum) ; absorption du
registre des passations non interprétables (« nommée-mais-vidée » porte un
signal que `INVALID` détruirait) ; script de reprise, conséquence du refus
précédent.

**Ce qu'une trace a démenti.** Deux échecs E2E attribués d'abord à la charge :
le banc anti-énumération du lien magique tombait parce que le chronomètre
comptait la compilation `next dev` d'un palier de quantification (corrigé,
PR #651) ; `orientation-file-envoi` échouait sur un `POST` jamais revenu sous
`next dev` — 1,3 s en build de production. T3 complet vert en 3 min 29 s,
**plus rapide que T2 `--fast`**.

**Prochaine action.** Écrire la déduplication de synthèse dans le LOT-01 (elle
y a été renvoyée sans jamais y être inscrite), puis PR de campagne.




## 2026-08-11 — La doctrine clinique écrite, et ce qu'une revue lui a démenti

**Décisions.** D-041 : discordance, convergence et conflit en un objet, sans
champ de certitude. D-042 : table V1 à **une** règle (C-STR `≤ 8` ; C-SOM
retirée, son axe mesure la sociabilité ; C-ALI reportée) et un banc de
fraîcheur des claims. D-043 : extrait de `CLAUDE.md` opposable, neuf règles
actées, dette de bancs nommée. D-044 : type propre au moteur, critères du Lot B
réduits, déclencheur `release-db` étendu.

**Écarté.** Tolérer `confidence` dans l'objet — la confusion même que `DC-29`
vise ; retoucher la spec de `sources/`.

**Ce qu'une revue a démenti.** Six affirmations fausses, revérifiées dans le
code : table d'orientation dite non signée, `DC-26` actée sur un compilateur
inexistant, `≥ 7` accusé d'être sans provenance alors qu'il ouvre une bande
certifiée.

**Prochaine action.** PR documentaire, puis le type du moteur et le contrat de
fraîcheur — avant la première règle écrite.

**Ouvert.** La « section 57 » et la fixture golden case sont absentes du dépôt.




## 2026-08-11 — LOT-01 : la première règle de contradiction, et une exemption qui était un défaut

**Décisions.** `D-046` : `prescriptif` n'est exigé que des tables qui
PRESCRIVENT — un constat se fonde sur un claim descriptif (`DC-30`). Table
C-STR **écrite, non signée** : une règle publiée, deux candidates écartées avec
condition de retour. Le moteur partage ses gardes avec l'orientation au lieu de
les réécrire (`DC-24`).

**Écarté.** Exempter par nom de table : l'exemption devenait le défaut, et la
table des parcours (`D-045`), qui prescrit, s'en serait trouvée dispensée en
silence.

**Exploitation.** `release-db` se déclenche sur `web/src/lib/clinical/**` ; le
contrat devient un préflight fail-closed avant `migrate deploy`.

**Démenti par revue.** Mon banc « aucune forme autre que DISCORDANCE » était
tautologique — le piège que ce lot dénonce. Corrigé par règles injectables.

**Prochaine action.** Étapes 3-6 ; l'étape 5 doit recalculer depuis
`rawAnswers`, sinon C-STR se déclenche sur un total partiel.

**Ouvert.** `importance` de C-STR ; émettre malgré `validationExterne: false` ?
; aucune fenêtre temporelle.

## 2026-08-12 — Le rouge E2E qui ne parlait pas du code

**Décisions.** Le blocage de `visual.spec.ts` (WebKit, portail patient) est
**étranger à tout diff** : la trace donne `0-trace.network` vide — aucune
requête émise, serveur jamais sollicité. Preuve close par un run rouge sur une
branche d'outillage ne contenant aucune ligne du LOT-01. Le harnais **classe**
désormais l'échec au lieu de le laisser lire comme une régression.

**Écarté.** `retries` : il ferait de ce blocage un succès silencieux et
emporterait avec lui les vrais échecs intermittents. Montée Playwright
1.61 → 1.62 : rien ne la relie au blocage, ce serait un tirage au sort. Réserve
de la veille sur `:159` : fausse — `:159` passe en 314 ms.

**Prochaine action.** Arbitrer le palier T3, aujourd'hui inatteignable
localement sur **toute** branche ; le CI ne l'a jamais rencontré.

**Ouvert.** Cause racine hors de notre code. Les trois arbitrages cliniques du
LOT-01 restent en attente.

## 2026-08-12 — LOT-01 : les trois arbitrages exécutés, et quatre revues

**Décisions.** `D-050` : conversion cockpit vers un modèle d'**affichage** —
`DiscordanceFinding` porte un `confidence` sans « non applicable » ; cible
laissée ouverte par `D-044`. Câblage fait, **table non signée : rien n'atteint
le praticien**. `D-051` : `Q_ALI_01` désignant deux instruments, le repère
s'abstient dès deux passations exploitables, motif porté (`synthese-v24`).

**Écarté.** Filtrer la passation écartée : retirer la ligne promeut
l'antérieure — repli qu'`orientationService` refuse. Score nullé, ligne gardée.

**Promotion faite.** Report du couple version/empreinte échoué trois fois dans
les documents : `scripts/version-prompt-documents.test.mjs` le relie au registre
et aux fragments (`check` + CI).

**Prochaine action.** Handoff, puis PR.

**Ouvert.** Vigilances de synthèse (étape 5) non câblées. Périmètre
contradictions (dossier entier) ≠ `review` (épisode T0). `D-051` ne répare pas
le catalogue. `D-049` : deux séquences sans blocage (09:24, 10:37) — fermeture
**proposée, non prise**.
## 2026-08-12 — La chaîne de skills relue sur le déroulé réel du LOT-01

**Décisions.** L'audit de redondance de la chaîne (routage → lot → clôture →
PR → merge), rejoué sur le LOT-01 chaîne T0, renverse le verdict théorique :
les recharges CLI sont des contrôles de fraîcheur réels, les passes de revue
ont toutes payé (6 démentis de doctrine, 5 bloquants, 3 énoncés faux du
journal). Seul gaspillage observé : un T3 complet sur le diff purement
documentaire de la PR #656. Trois retouches : palier appliqué au diff de la
session (pilote de lot), bloc « risques » réutilisable émis par la revue,
préparation de PR qui distille la revue existante au lieu de relancer un
agent, et rappelle les tests déjà joués.

**Écarté.** Restructurer la chaîne ; dédupliquer les recharges `wn-cycle`
(chacune lit un état modifié entre-temps).

**Prochaine action.** PR de doc de ces retouches.

**Ouvert.** Rien.

## 2026-08-12 — LOT-02 : les préconditions de confirmation T0

**Décisions.** `D-052` écrite avant la première ligne de code. Quatre
arbitrages : rideau en dur (quatre identifiants, `Q_SOM_09` exclu et
l'exclusion affichée) ; condition dure sans `VALID` (105 passations de
production le portent par défaut de colonne — l'exiger serait tautologique,
`DC-24`) ; rideau évalué hors fenêtre ; volet souple réduit à deux conditions.

**Écarté.** La condition « suggestion d'orientation écartée » : cet état
n'existe nulle part et le créer demanderait une migration. Peupler un patient
de seed pour couvrir le parcours nominal en E2E — le domino (orientation,
capture pixel, garde de certification) coûtait plus que la couverture gagnée.

**Promotion faite.** La revue `wn-reviewer` a rendu NO-GO avec quatre
bloquants, tous réels et tous refermés : `scores !== null` acceptait quatre
passations vides comme rideau complet ; la trace de contournement était
forgeable par le navigateur ; la porte se désactivait en déclarant `J21` ; la
synthèse était lue sans filtre de statut. **La leçon exécutable** : sur ce
dépôt, `calculateScore` rend un objet `{scored:false,total:null}` plutôt que
`null` — tout prédicat d'exploitabilité doit lire `scored`/`total`.

**Prochaine action.** T3 de contrôle, handoff, PR.

**Ouvert.** Le T0 reste irrévocable, sans lot d'accueil pour sa correction.
Parcours nominal sans E2E. 8 dossiers de production sur 19 satisfont les
conditions dures.

## 2026-08-12 — LOT-03 : règles d'arrêt et extinction d'orientation

**Décisions.** `D-053` avant le code, amendée deux fois. La lecture de
`rag_corpus_claims` en production a renversé la spec : ni DASS-21 ni Cungi ne
portent de claim d'extinction. C'est `Q_STR_01` (SIIN) qui l'a —
`WN-CL-0051-033`, prescriptif. Table livrée **non signée**, verrou unique : la
production ne bouge pas au merge.

**Écarté.** STOP-SOM (elle éteindrait `R-SOM-01` à la valeur de PSQI où la table
signée dit qu'elle doit s'allumer) ; STOP-APN (« absence de symptômes »
inexprimable, `DC-24`) ; SCOFF (claim + re-signature) ; la fenêtre de fraîcheur
(aucun chiffre fondé).

**Promotion.** Revue NO-GO, quatre bloquants refermés. **La leçon exécutable :
sur ce dépôt, un objet de score n'est pas une mesure** — `scores != null` a
reposé le piège du LOT-02. Et un moteur qui ne publie pas ses comptes ne garde
rien : `group_majority` éteignait sur 3 items /21.

**Prochaine action.** PR du lot ; le bookkeeping attend le merge de #666.

**Ouvert.** STOP-STR ne peut pas mordre tant que `group_majority` se tait —
signer ne suffira pas. `D-053` §5 est une dette, pas une garantie.

## 2026-08-12 — Un lot d'accueil pour les dettes orphelines (LOT-08)

**Décisions.** Les six dettes sans lot n'en formaient pas un : trois n'en font
qu'une — STOP-STR ne mord pas, `D-053 §5` n'a pas de code, le garde de
restitution ignore l'extinction. Elles deviennent le **LOT-08 « Extinction
opérante »**, dépendant du LOT-03, à exécuter **avant le LOT-05** (les deux
étendent `verifierRestitutionOrientation`). `D-054` exigée avant tout code.

**Écarté.** Un lot fourre-tout. Les quatre autres dettes sont routées :
ancienneté de `dejaRepondu` → question ouverte (aucun chiffre fondé,
`DC-19`/`DC-20`) ; vigilances LOT-01 → LOT-05 ; E2E nominal T0 → LOT-07 ;
T0 irrévocable → backlog, lot Prisma/Auth propre.

**Promotion.** La PR #669 porte le titre du LOT-04 et **ne contient que son
ouverture** — 4 fichiers de bookkeeping, zéro code. Le LOT-04 est ouvert et non
livré ; il n'y avait aucune clôture en retard. Un titre de PR n'est pas un état
de livraison : `git show --stat` avant de conclure.

**Prochaine action.** PR documentaire, puis LOT-04 (chemin critique).

**Ouvert.** `D-054` doit trancher si `total` change quand le recueil est
incomplet — cette valeur alimente une bande déjà servie en production.

## 2026-08-12 — LOT-04 livré : chaîne C1 rebranchée (candidats déterministes)

**Décisions.** `D-054` (10 arbitrages) : canal plainte = `Q_MOD_03` ; table
`priorityRulesV1` livrée **non signée** (verrou `tablePrioritesSignee()`,
production inchangée au merge) ; recalcul serveur anti-forge en deux temps
(carte recoupée contre sa propre empreinte, puis reconstruction depuis la base,
409 `chaine_c1_divergente` sur les deux routes) ; abstention `required` ⇒ zéro
candidat (`DC-25`) ; pas de pont depuis les stop rules.

**Écarté.** Claims de causalité (`DC-27`) ; déclencheurs d'anamnèse sans bande
publiée ; `Q_PLAINTES` (affichage legacy sans score).

**Revue.** wn-reviewer NO-GO puis bloquant B1 refermé (l'anti-forge comparait
des empreintes déclarées par le client) — bancs vus rougir sous mutation.

**Prochaine action.** CI de la PR feat(lot-04) ; dettes M1/M4 nommées en D-054.

**Ouvert.** Signer la table ne suffira pas (procédure d'abstention hors
périmètre signé) ; la décision attendue du LOT-08 devient D-055 (D-054 prise
par ce lot).

## 2026-08-13 — LOT-08 livré : l'extinction devient opérante

**Décisions.** `D-055` (6 arbitrages) : `group_majority` publie
`missing`/`repondus` racine, bande sur recueil complet seul, `total` intact ;
garde d'arrêt « muet OU incomplet » **au grain du déclencheur** ; contradiction
ouverte (`statut !== 'resolue'`, dossier entier) interdit l'extinction sans
jamais la déclencher ; garde de restitution éteinte ≠ recommandée (fenêtre 200,
marqueurs de la consigne v25, journalisé). Table d'arrêt toujours NON signée.

**Écarté.** Comptes par groupe, `bandePlancher`, blocage par axe, bump de
consigne, toucher `total`.

**Promotion.** Le banc de bout en bout a trouvé le second verrou : la garde
lisait la racine, le DASS-21 ne publie que par axe — signer n'aurait rien
allumé, une seconde fois.

**Prochaine action.** Revue wn-reviewer, PR, CI (`verify` porte base + E2E,
proxy sans WebKit ici).

**Ouvert.** Signature (étape 6, acte praticien) ; dettes reconduites en D-055.

## 2026-08-13 — LOT-05 : protocole structuré et compléments avant biologie

Lecture production avant d'écrire : la couche décision du catalogue C4 est
entièrement vide (6 tables à zéro) alors que la matière est peuplée (3 444
ingrédients, 140 148 produits). La condition « règle C4 validée » est donc
insatisfiable, et les conditions négatives de la spec seraient vraies par
vacuité — quatrième exemplaire du motif D-052 / D-053 / #482.

Arbitrage utilisateur : fail-closed, livrer quand même. Écartés — réduire le
périmètre (la règle serait repoussée sans que le danger soit nommé) et peupler
le catalogue d'abord (contenu clinique sourcé, lot distinct). D-056 rendue,
six arbitrages.

Livré : contrat V4 (phases, statut d'intervention, waitFor) sans migration et
à empreintes V1/V3 prouvées inchangées ; règle de décision pure fail-closed
(alertes gardées au niveau catalogue, seuils au niveau ingrédient) ; garde LLM
sur les compléments nommés en contexte prescriptif ; rendu patient conditionnel.
T1 vert, 4 708 tests Vitest verts.

Prochaine action : revue wn-reviewer, PR brouillon, CI. Le segment E2E n'est
pas jouable dans ce conteneur (CDN Playwright bloqué) — il reste à jouer.

Questions ouvertes : quand peupler le catalogue de décision C4 (seul déblocage
réel) ; DC-39 laissé ouvert faute de sources ; vigilances de discordance en PR
séparée.

## 2026-08-13 — LOT-09 : vigilances de discordance injectées dans la synthèse

Ouvert pour donner un accueil à la moitié non livrée de l'étape 5 du LOT-01,
orpheline depuis le 2026-08-12. D-057, quatre arbitrages. Travail de routage :
la formulation neutre existait déjà, rien de clinique n'a été rédigé.

Piège trouvé avant la revue : le cockpit lit toutes les passations, la route de
synthèse un sous-ensemble filtré. Passer ce dernier aurait appauvri la synthèse
sans rien casser. Banc structurel vérifié par mutation.

Revue wn-reviewer : NO-GO, à raison. Trois défauts introduits en affirmant le
contraire dans la doc — critère d'« ouvert » paraphrasé au lieu d'être partagé
(convergences non exclues), garde accusant la prose fidèle (« incohérent »
contient « cohérent »), banc dont le titre disait l'inverse de son assertion. Un
quatrième trouvé par elle : une discordance sortait vers le courrier médecin.
Tous refermés, prédicat extrait et partagé avec le moteur d'arrêt.

Écarté : élargir l'audience au médecin (choix utilisateur : exclure).

T1 vert, 4 758 tests verts. E2E non jouables ici (CDN Playwright bloqué).

Prochaine action : PR, CI, merge. Ouvert : injecter la discordance dans la
consigne — le garde n'est qu'un filet tant que le modèle ne la reçoit pas.

## [2026-08-14] — LOT-07 : NO-GO refermé, jalons et momentum par besoin livrés

Revue wn-reviewer NO-GO (B1/B2/B3, M1–M7, Mo1–Mo4) intégralement refermée :
garde de version intra-cycle retirée (elle éteignait tout le stock v12/v13
avec un motif faux), ancre UNIQUE des fenêtres de jalon (`confirmedAt` du T0
confirmé, partagée cockpit/serveur + banc de contrat), re-passation rendue
atteignable (repli priorité proposée) et POST au vrai contrat (`success`).
Panneau de confirmation gaté hors fenêtre et nommant son jalon ; unités et
motifs rendus ; momentum par besoin opt-in (coût cabinet évité). D-058
amendée (needIds, ancre, garde ; dettes DC-41, producteur de sélection,
Q_SOM_09-à-J21). Production relue : assessment_episodes vide. Écarté :
garder la garde de version « par prudence » — indéclenchable dans le sens
annoncé. Vitest complet vert (4 787). Prochaine action : PR + CI, puis
ouverture du LOT-06 (migration, PR séparée). Ouvert : première bande de
bruit à publier (acte séparé) ; E2E parcours nominal T0.


## [2026-08-15] — LOT-06 : catalogue biologie, déclencheurs câblés (v3)

Arbitrage F.2 clos : le dépôt portait la réponse. Les douze panels
conditionnels pointent des instruments réels en production (BDI, MADRS,
HAD, PSS-10, PSQI, MMSE, IBS-SSS, MFI-20, QDRS…) au lieu de familles. Erreur de la v2 corrigée : humeur et anxiété étaient câblées
sur `Q_MOD`, lue comme *mood* — c'est *mode de vie*. Le câblage a fait
émerger un panel fondé qu'un dépouillement par analyte avait manqué : SJSR →
ferritine (`Q_SOM_04`, trois claims VALIDE) ; il dénoue §F.5, `0112-012`
étant une cible SJSR et non une plage générale (DC-14). Abstention douleurs
chroniques maintenue : instruments présents, claim absent. PR #683 mergée,
CI vert. `gh` absent en session distante : suivi CI via MCP.

Prochaine action : validation ligne à ligne par le praticien. Ouvert : zones
de déclenchement (celles de la table d'orientation, sans seuil nouveau) ;
ferritine `0044-003` vs `0154-051` ; l'implémentation exigera D-xxx.

## [2026-08-15] — LOT-06 : zones tranchées, disjonction cadrée, tables signées

Catalogue biologie porté de v3 à v5 : treize zones de déclenchement tranchées,
Karasek retiré (aucun claim ne le fonde), BMS-10 ajouté (cinq bandes adossées
à cinq claims VALIDE), ferritine `0044-003` retenue. L'axe cognitif est fixé
par STADE et non par couleur — le MCI tombe en `warning` sur l'AQ mais en
`info` sur le MMSE et le QDRS, si bien qu'une règle uniforme l'aurait manqué
sur deux instruments.

Découverte transverse : le contrat de déclenchement ne sait exprimer aucun
« ou », ni dans une règle (ET) ni entre règles (discordance ⇒ panel écarté).
Cinq panels en dépendaient. `D-060` cadre le lot, fail-closed sur le recueil
incomplet ; le précédent `Q_INF_03` montre que le manque a déjà coûté une
provenance.

`D-061` : quatre tables signées sur arbitrage praticien, dont priorités et
biologie en passage en force nommé. Erreur corrigée — `ORIENTATION_METADATA`
était déjà signée, je l'avais dite non signée deux fois.

Prochaine action : procédure d'abstention dans le périmètre signé — due au
merge de #687, les priorités étant la seule table sans drapeau. Ouvert : T3 et
revue `wn-reviewer` injouables ici ; validation ligne à ligne du catalogue.


## [2026-08-16] — LOT-06 : abstention signée, verrou biologie réel

`D-062` : la procédure d'abstention entre dans le périmètre signé — elle vivait
hors du SHA, si bien que signer ouvrait un verdict qu'aucune ligne signée ne
décrivait (`DC-17`). Sa provenance est doctrinale, pas bibliographique.
`D-063` : le verrou biologie passe d'un terme à cinq, dont un inédit —
`shaPerimetre`, qui rend la péremption détectable. Il révèle que la signature
posée par `D-061` n'en était pas une : ni date, ni claims. Verrou désormais
fermé, sans effet observable, la table étant vide.

Écarté : étendre `shaPerimetre` aux quatre autres tables — cela fermerait des
verrous ouverts, donc renverserait des décisions praticien.

Corrigé : j'avais dit deux fois la table d'orientation non signée ; elle
l'était depuis le 2026-08-06.

Prochaine action : compléter la signature biologie, sans quoi aucune règle ne
s'appliquera. Ouvert : re-signature priorités, T3 et `wn-reviewer` injouables
ici, validation ligne à ligne, lot disjonction (`D-060`).

## [2026-08-16] — Reliquats M/F de la revue clinique

Lot `M1`-`M4`/`F1`-`F4` soldé : motifs d'abstention liés par `id` (un absent
jette), verrou biologie haché depuis les règles réellement évaluées, en-têtes
remis à l'état réel, machinerie de banc éprouvée (dates alignées, copie gelée,
position « verrou fermé » enfin testée). Relu `wn-reviewer` : GO, réserve M-A
(bloc historique au présent) corrigée ; sentinelle de date, concordance de
sérialisation et motifs affirmés ajoutés sur sa prescription. Écarté : `F5`
(métadonnée signée — praticien), `M5` (documenté au handoff). Découverte de
l'exécution : un cas de déterminisme passait pour une mauvaise raison,
corrigé. Aucun contenu signé modifié, les deux SHA épinglés intacts.
Prochaine action : PR unique, CI, merge. Ouvert : contrat d'appelant de
`deriverStatutsBiologie` à border avant le premier appelant réel (handoff).

## [2026-08-16] — D-060 : la disjonction entre dans le contrat de déclenchement

`ou` devient exprimable dans les cinq tables cliniques ; aucune n'en porte, le
comportement en production est inchangé. Une branche ne compte que si son
instrument est complètement recueilli (`DC-24`), ce qui exclut aussi le
plancher ; la traçabilité ne cite que la branche qui a décidé, d'où sources de
contradiction et `responseId` dérivés de l'atteinte, plus de la forme.

`wn-reviewer` : NO-GO puis GO. Il a trouvé cinq gardes anti-dérive aveugles au
`ou` — dont deux de sécurité patient : une règle d'arrêt sous `ou` pouvait
éteindre sur une bande défavorable sans CI rouge — et mon banc anti-vacuité qui
n'assertait que le `return` du helper. Recâblées et éprouvées par règles
fabriquées ; discriminance vérifiée en retirant l'aplatissement (4 rouges).

Tranché : fail-closed uniforme (`D-060` §6), pas de régime gradué — graduer
imposerait de passer la nature de la table à l'évaluateur partagé.
Écarté : restaurer le lien perdu de `MATRICE_CONSOMMATION` (7→5) — la perte est
un effet de `PROFONDEUR_MAX`, réserve nommée §8.

Découverte hors périmètre, bloquante pour la suite : **7 des 17 instruments du
catalogue biologie ne peuvent pas allumer leur panel** — 5 sont suspendus
(0 passation en production), HAD et IBS-SSS ne publient pas leurs comptes. Les
panels mémoire et neurodégénératif sont morts en l'état.
Prochaine action : PR de ce lot, puis arbitrage praticien sur ces panels avant
PR-2. Ouvert : RV-1 (banc d'inertie, prérequis dur PR-2), RV-2 à RV-6.

## [2026-08-16] — D-066 : réactivation des cinq cognitifs, comptes de complétude

Deux arbitrages praticien : réactiver `Q_GEO_03/04/05/06` et `Q_NEU_06` sur
déclaration « usage couvert » (patron EORTC — motifs réels de suspension
re-présentés avant le geste : droits © PAR/IEDM, instruments de consultation),
et faire publier leurs comptes par les moteurs `had`, `sum_two_phases`,
`francis` (prérequis des branches `D-060`).

`wn-reviewer` : NO-GO puis GO sous réserve, réserves soldées. Sa trouvaille
majeure : l'invariant « geste praticien, jamais envoi de routine » ne tenait
qu'à l'écran — pack par défaut ouvert aux cinq, bandeau mensonger, cinq mots
du test de rappel dans l'énoncé. Rendu structurel : packs en 409 dédié,
onboarding en ceinture journalisée, sélecteur et file d'envoi marqués, bandeau
portail gardé par banc. `alertMA` exige désormais une phase 2 complète.

Écarté : garder la bande servie sur recueil partiel sous garde (rendu de
production — décision distincte, documentée sur chaque moteur).
Bloqué : connecteur MCP Supabase mort (« organization membership ») — lecture
MAJ-4 et textes de claims PR-2 en attente de reconnexion.
Prochaine action : PR, CI, puis PR-2.

## [2026-08-17] — D-067 : verrous à cinq termes, signatures reposées

Les quatre tables cliniques passent au verrou à cinq termes (`shaPerimetre`
littéral, patron D-063) : la péremption devient détectable partout. Priorités
re-signées au 2026-08-16 (périmètre D-062 — dette soldée) ; date d'orientation
portée à l'ISO canonique en gardant le jour attesté du 6 août (F5).

`wn-reviewer` : GO conditionnel, par mutation — le cinquième terme des
contradictions n'était gardé par rien (sa suppression laissait 1441 tests
verts, sur la seule table au drapeau déjà posé en production). Corrigé : banc
de péremption, garde de source anti-tautologie étendu aux quatre tables
(`shaPerimetreLitteral.guard.test.ts`), escaliers à cinq marches, afterEach
restaurant `shaPerimetre`, commentaire périmé « re-signature requise » recalé.

Écarté : re-dater l'orientation au 2026-08-16 (affirmerait une relecture qui
n'a pas eu lieu). Assumé : fenêtre 409 `chaine_c1_divergente` à chaud
(validatedAt change), silencieuse comme les deux fois précédentes.
Prochaine action : PR, CI ; puis PR-5 (dettes M-B, L-A, L-C/L-D) empilée.

## [2026-08-17] — D-068 : le catalogue biologie niveau 1 entre en base

Migration de données : 47 analytes, 15 panels, 78 items, 2 plages sourcées,
colonne `validation_medicale_requise` (insulinémie seule), `µg/mL` aux trois
vocabulaires. Transcription vérifiée exacte par la revue (13/13 compositions).
Barrière `D-003` exécutée à l'insertion (`WHERE EXISTS` claim VALIDE) : CI
vert par vacuité, production auto-gardée, compte rapporté au log release-db.

`wn-reviewer` : deux NO-GO successifs, tous soldés. Le second m'a pris en
défaut : j'ai affirmé « nouveau contrat joué » sans vérifier que le harnais
tire sa liste de `ci.yml` — le contrat n'avait jamais tourné, et sa regex ne
pouvait pas passer (`IN` normalisé en `= ANY (ARRAY[...])`). Corrigé, preuve
demandée obtenue : 19 → 20 contrats.

Tranché : claim porteur de la forme vitamine D = `0154-054` (« > 45 ») ;
plafond manquant = écart de corpus NOMMÉ ; panels non indiqués portent leur
motif verbatim en `objectif`. Écarté : renommer les codes `BIO_RATIO_*`
(fidélité au document validé — contrat d'intersection à la place).
Prochaine action : PR, CI, release-db (approbation praticien), vérification
post-release à sept lectures, puis PR-3 (règles + signature biologie).

## [2026-08-17] — D-069 : les règles d'indication et la signature biologie réelle

Quinze règles transcrites (six en `ou` D-060 — les premiers du dépôt), zones
relues grille par grille : la revue confirme 17/17 conformes, y compris les
pièges (BMS-10 sur moyenne, Q_INF_05 en compte avec dark réel, échelles
inversées, MADRS >= 8, AQ sans info). Signature réelle : 2026-08-17, 29 claims
(la revue a fait entrer les deux claims de la répétition annuelle — le seul
chiffre paramétrique était en prose), shaPerimetre a2f28c0b…, re-signé.

RV-1 (banc d'inertie sur moteurs réels, saturation exigeant manquants = 0) et
RV-2 (garde de forme) fermées ; banc zone↔grille ajouté sur prescription
(couleurs citées ⊆ publiées ∪ inerties déclarées). Limites nommées sur les
règles : branche IBS-SSS inerte sur filtre « non » (jambe TFD sert), plancher
perdu sous `ou` (PSS-10/TFD) vs conservé en feuille (PSQI).

Écarté : citer les cinq claims de bandes BMS-10 (0106-027 seul fonde le
départ, réserve consignée pour 028/029). WN_CB_ENABLED reste éteint.
Prochaine action : PR empilée sur #700, CI. Restent deux gestes praticien :
release-db (#700) et le drapeau.

## [2026-08-17] — D-068 vérifié en production après release-db

`release-db` approuvé et passé (run 32010232258 sur le merge de #700) :
migration `20260817090000` appliquée. Les sept lectures promises par la PR
sont conformes — 47 analytes `saisie_praticien`, 15 panels, 78 items, zéro
orphelin, `BIO_INSULINEMIE` seule sous validation médicale, intersection
analytes∩ratios vide, et les deux plages sourcées : ferritine 50-80 sur
`WN-CL-0044-003`, vitamine D 45-`NULL` sur `WN-CL-0154-054`, v1.0 actives. La
barrière `D-003` n'a donc pas mordu. Le `NOTICE` final n'est pas au log :
`prisma migrate deploy` n'imprime pas les `RAISE NOTICE` — la lecture directe
des deux lignes le remplace, et vaut mieux que lui.

Corrigé sur prescription du registre : la revue Copilot avait remplacé « 49/49
VALIDE » par « 29/29 » dans l'en-tête des règles — deux ensembles distincts,
et le second contredisait `D-069` (49 claims relus). Les 29 du périmètre signé
sont revérifiés VALIDE/actifs/v1.0 ce jour ; l'en-tête porte les deux nombres.
Prochaine action : merge de #701, puis le drapeau `WN_CB_ENABLED`.

## [2026-08-17] — D-070 : le drapeau CB était déjà posé, la table signée est dormante

Le praticien a voulu poser `WN_CB_ENABLED` : Vercel a refusé, la variable
existait déjà à `true` — donc avant le déploiement de `4b588d1e`. Quatre sites
affirmaient « reste éteint », dont `D-069` §2 : faux au moment de l'écriture,
déduit de la documentation au lieu d'être lu dans le panneau (même classe que
`D-064`). Registre append-only : la phrase de `D-069` est conservée et
annotée, les trois autres corrigés.

Découverte du coup d'œil : `deriverStatutsBiologie` n'a **aucun appelant**.
Les quinze règles et le catalogue sont signés, en base, et n'atteignent aucun
écran ; ce que le drapeau ouvre est la surface d'arbitrage, où la production
compte zéro arbitrage. Le programme a livré la matière, pas son branchement —
la phrase « signer n'allume pas » masquait exactement cela.

Écarté : inventer une date de pose du drapeau (aucun document ne
l'enregistre) ; poser ou retirer un geste d'exploitation.
Prochaine action : PR de correction. Ouvert : brancher le premier appelant de
`deriverStatutsBiologie`, au contrat M-B (table VERBATIM).

## [2026-08-17] — D-071 : la table des panels documentés (migration seule)

Cadrage du branchement de `deriverStatutsBiologie` : le champ `documentes` du
moteur n'a **aucune source**, donc `deja_documente` et `a_repeter` sont
inatteignables — l'outil repropose un bilan récent sans dire qu'il l'ignore.
Le praticien a choisi d'ouvrir la table plutôt que d'afficher la limite, et un
drapeau NEUF éteint (`WN_CB_ENABLED` valant déjà `true`, s'y adosser exposerait
tout au déploiement).

Deux faits ont corrigé le plan. T3 : le banc de complétude d'`effacement.ts` se
dérive du **schéma**, pas des appelants — la ligne d'effacement ne peut pas
attendre la PR de code (#680 avait déjà dû revenir sur ses pas). Revue
`wn-reviewer` NO-GO : RLS deny-all absente, et le contrat comptait un index
*par son nom* — recréé non unique, il passait vert. Contrat réécrit à sept
termes, tué par neuf mutations.

Écarté : consigner le courrier (sans ancrage de provenance, contraire à DC-34).
Prochaine action : PR-1, puis `release-db` approuvée, puis le branchement.
Ouvert : deux replis fail-open du moteur (date illisible, date future) que
cette table rend atteignables, couverts par aucun banc.

## [2026-08-18] — D-071 : la proposition de bilan atteint un écran

Branchement du premier appelant de `deriverStatutsBiologie` : service, route
`GET/POST`, panneau cockpit, derrière `WN_CB_PROPOSITION` neuf et éteint. Le
catalogue et les quinze règles signées cessent d'être dormants.

Le banc-sentinelle du contrat M-B existe enfin — et c'est l'identité de
référence qui mord, pas le SHA : un `filter` qui ne retire rien produit le même
hachage. Les deux replis fail-open du moteur (date illisible, date future ⇒
`deja_documente`, donc panel retiré) sont fermés à la frontière, `statuts.ts`
restant hors périmètre.

Revue GO sous réserve, quatre corrections retenues plutôt que reportées : une
déclaration erronée était irrattrapable depuis l'écran ; le service ne
re-testait pas son drapeau ; la date du jour était refusée comme future entre
minuit et 2 h à Paris ; un corps JSON mal typé rendait 500 avant le drapeau.

`MATRICE_CONSOMMATION.md` a refusé de rester à jour : la table d'indications
n'y avait aucune ligne. 21 sources, 5 dormantes.

Prochaine action : merge, puis allumage (geste distinct). Ouvert : la matrice
compte la biblio NABM non dormante sur un `import type`.

## [2026-08-18] — D-072 : les dettes du LOT-06 sont soldées

Trois PR : #705 (deny-all RLS sur `arbitrages_biologiques`, seule table de
`public` sans RLS en production — CI vert), et les soldes : deux replis
fail-open SUPPRIMÉS du moteur, ratios dans la composition, matrice qui cesse de
compter les imports de type, cockpit remonté au changement de dossier.

Revue NO-GO, trois blocages tous DANS le périmètre revendiqué comme soldé :
la clé de remontage posée sur l'enfant et non sur le composant qui détient
l'état du dossier ; le repli rouvrant deux silences (panel discordant, panel
sans ligne) ; et deux définitions concurrentes d'« import de type » dans le
générateur. Corrigés plutôt que reportés.

Deux corrections d'état me concernant : « les tables NABM sont vides » était
faux (987 actes en base ; c'est l'appariement qui est vide), et j'avais régénéré
la matrice avec des fichiers non suivis — le générateur n'indexe que le suivi,
le CI l'a réfuté.

Écarté : l'appariement analyte ↔ NABM et les liens biomarqueur ↔ besoin — lots
de curation praticien signée, pas des dettes techniques.
Prochaine action : merge des deux PR, puis release-db de #705.

## [2026-08-18] — LOT-06 : le drapeau est posé, et un build le porte enfin

#707 (le générateur de matrice indexe désormais les fichiers non suivis —
`--others --exclude-standard`, deux bancs tués par retour en arrière) ; l'autre
piège de la même famille, `prisma format`, n'a pas de correctif structurel
acceptable et vit désormais dans `.claude/rules/db-prisma.md`, avec le rappel
que Prisma ne modélise pas la RLS.

Puis le drapeau `WN_CB_PROPOSITION` a été posé — et le redéploiement ANNULÉ
deux fois. Cause : `web/vercel.json` porte un `ignoreCommand` qui saute la
construction quand le commit ne touche rien sous `web/`, et #707 était purement
outillage. La production servait donc un build antérieur à la variable : le
drapeau existait dans le panneau, porté par rien. Même classe que D-064 et
D-070. Remède : `vercel redeploy` du déploiement de #706, dont le commit touche
`web/`. Build READY, aliasé `app.wellneuro.fr`, postérieur à la variable.

Écarté : `vercel env pull` pour lire la valeur — il écraserait `.env.local`.
On sait donc que la variable EXISTE et que le build lui est postérieur, pas ce
qu'elle vaut.
Prochaine action : preuve visuelle du panneau sur un dossier réel.

## [2026-08-18] — Courrier médecin branché, campagne T0 close

Dernier appelant du Lot F : POST /proposition/courrier — texte généré serveur
sous la garde non prescriptive, consigné avec l'ancre du document RENDU (bancs
par mutation : texte client ignoré, ancre jamais reconstruite). Garde d'accès
partagée entre les trois routes. Campagne T0 : 10/10, état machine idle.

Revue GO sous conditions, et sa trouvaille compte : le couplage rendu ↔
consigné était accidentel — le générateur consignait l'ENTRÉE du rendu, pas sa
sortie ; un bloc non diffusable aurait fait passer la garde à vide. Couplage
rendu structurel (bloc_non_diffuse). Aussi refermés : consentement de partage
exposé sur le formulaire (décision 2026-07-22), geste offert sur le prédicat du
générateur, verrou de re-consignation, 409/201, log sans texte de lettre.

Mesuré : la borne de 8 000 n'est pas confortable par construction — 4 000 au
catalogue réel, 8 272 avec des libellés doublés. Banc calibré au réel.

Écarté : lire l'ancre dans le fil (dette nommée — écriture seule aujourd'hui).
Prochaine action : PR, CI, merge. Ouvert : E2E de la surface, ancre relue.

## [2026-08-18] — D-074 : le drapeau d'orientation était posé, deux textes disaient l'inverse

Vercel a refusé la création de `WN_ENABLE_ORIENTATION_NNPP2` — déjà présente,
et marquée *sensitive*, donc illisible. Le journal d'accès (37 accès depuis le
5 août) ne tranchait pas : Playwright arme ce drapeau et écrit dans la même
base. C'est l'observation du panneau en production — des recommandations
servies — qui a conclu, la route ne calculant qu'après `orientationActive()`.

Corrigé : `propositionService.ts` (« non posé en production ») et la cellule
d'état de `FEATURE_FLAGS.md`. Le découplage du service reste, mais fondé sur
l'indépendance des surfaces, pas sur l'état d'un drapeau.

Écarté : ouvrir le dossier d'une patiente réelle pour « vérifier » (seuls les
trois dossiers fictifs) ; corriger `MESSAGE_ORIENTATION_INACTIVE`, faux depuis
le 2026-08-04 mais d'une autre finalité — dette au handoff.
Prochaine action : PR. Ouvert : les scopes Preview/Development, jamais
vérifiés.

## [2026-08-18] — D-075 : les dossiers de test sont réels

La règle « seuls ces patients fictifs » m'a fait refuser d'examiner un dossier
que le praticien utilise pour tester. Arbitrage : les dossiers de test sont
réels — c'est le cas de tous ceux créés jusqu'ici — et se lisent par
identifiant via `execute_sql`. Ce que la règle protégeait vraiment n'était pas
leur existence, mais deux choses : pas d'identité réelle dans un dépôt dont
l'historique ne s'efface pas, et aucune donnée fabriquée dans le dossier de
quiconque.

Écarté : faire des trois personnes les identités de fixture (255 fichiers
concernés, identités définitives dans Git, et `web/prisma/seed.ts` écrivant des réponses
fabriquées dans deux dossiers réels — `questionnaireReponse.upsert`).
Prochaine action : PR. Ouvert : les identifiants des trois dossiers, à me
donner au besoin — ils ne sont pas dans le dépôt et n'y entreront pas.

## [2026-08-19] — D-076 : le message d'orientation inactive disait faux depuis quinze jours

« Les règles NNPP2 ne sont pas encore validées » : faux depuis la signature du
2026-08-04. La constante est servie dès que l'un OU l'autre des deux termes du
verrou est faux — elle ne peut donc nommer ni le drapeau ni la signature. Elle
devient neutre : « Orientation non activée sur cet environnement. » Trois
bancs l'épinglaient, plus un renvoi de `FEATURE_FLAGS.md`.

Non traité, hors de portée : les scopes Preview et Development. Aucun outil
accessible ne lit les variables d'environnement Vercel — vérifié, seuls les
réglages de projet et la protection de déploiement le sont. Seul le panneau
les montre ; la dette reste ouverte et nommée dans `D-076`.
Prochaine action : PR.

## [2026-08-19] — Campagne HDS cadrée : le ticket n'était plus en attente

Le brief de la campagne de rang 1 (2026-08-18) demandait de « relancer
Scalingo ». La réponse était arrivée le **2026-08-11**, tranchée le jour même
par `D-047` : (b) périmètre HDS de `osc-fr1` **levée** par écrit, (a) accord de
sous-traitance **ouverte et recaractérisée** — `D-037` avait déduit qu'il n'y
avait rien à signer, le fournisseur répond qu'il faut **obtenir et signer une
annexe HDS distincte du DPA**. Le LOT-01 se construit donc autour de l'annexe,
pas d'une relance ; la démarche reste due même si la dérogation est reconduite.

Trois porteurs répétaient la prémisse morte (`blocking_issue` et `next_action`
de `.wn/state.json`, prérequis DPA du runbook) — redressés, le runbook démenti
sur place. Le LOT-04 visait `REGISTRE_FRONTIERES.md`, qui ne porte qu'un
renvoi : la source du gate est sa checklist d'activation.

Écarté : prendre une `D-xxx` — l'arbitrage migrer/reconduire appartient au
responsable de traitement. Prochaine action : PR, puis le geste
`WN_CB_RESULTS_ENABLED` au panneau Vercel.

## [2026-08-19] — Ouverture de la campagne HDS, réconciliée avec D-078

`/wn-lot next` visait l'écriture du cadrage HDS : caduc — une session
parallèle avait tout cadré et mergé (#720), avec `D-078` rendu APRÈS
l'écriture des lots. Réconciliation plutôt que réécriture : LOT-01 réduit à
l'annexe (arbitrage rendu — migrer sans attendre), LOT-02 débloqué avec deux
verrous conservés (décommissionnement subordonné à l'annexe signée ; fenêtre
de moindre couverture dite à qui exécute), LOT-04 recentré sur la revue du
2026-10-21. Campagne activée par scripts, LOT-01 courant.

Écarté : rejuger D-078 (décision du responsable, registre append-only) ;
affaiblir les confirmations geste par geste du LOT-02.
Décisions promues : aucune nouvelle (D-078 est d'une autre session).
Prochaine action : PR d'ouverture, puis piloter LOT-01 (annexe — attente
Scalingo) et LOT-03 (information des personnes, échue) en parallèle.
Ouvert : tension commentaire du verrou `WN_CB_RESULTS_ENABLED` vs D-078.

## [2026-08-19] — LOT-03 : l'information des personnes était donnée, jamais écrite

Le trou « le plus coûteux du dossier RGPD » n'était pas un défaut
d'information mais de consignation : le praticien informe oralement depuis la
souscription HDS Scalingo. Consigné rubrique 11 avec forme, période et source,
et le manque restant dit tel quel — aucune trace écrite par participant.

D-078 rend l'information à renouveler (l'écart a changé de nature) : un
support v2 est préparé avec ses réserves, jamais publié — la v2 d'un document
versionné et acquitté est un lot TRUST distinct. Deux échéances du §14
réconciliées (rubrique 11, ligne DPA), §6 et §12 annotés sans rien effacer.

Écarté : rédiger ce qui relève d'un conseil qualifié (base légale, transferts,
AIPD restent ouverts) ; publier le support ; cocher une ligne §14 sans preuve.
Prochaine action : revue wn-reviewer, PR. Ouvert : la phrase Sentry du
brouillon suppose une vérification de configuration non faite.

### Rectificatif (même jour, après revue `wn-reviewer`)

L'entrée ci-dessus dit « oralement depuis la souscription HDS Scalingo » comme
si c'était un fait daté : c'est la déclaration du responsable, et le dépôt
refuse précisément cette inférence (`D-047` ; runbook : « une souscription
inférée n'est pas une preuve produite »). Le dossier consigne donc la forme et
le contenu, et laisse ouvertes la date, la modalité de retrait, la trace écrite
par participant et le périmètre des personnes — chacune avec sa ligne au §14.
Deux autres corrections de revue : le renouvellement de l'information est
indexé sur la bascule (pas sur le 2026-10-21 — `D-078` rend l'obligation plus
exigeante), et la ligne « preuve fonctionnelle de la piste d'audit » était
échue sans mention depuis que des dossiers réels sont utilisés.

## [2026-08-20] — LOT-01 : la trace du canal, produite par lecture et non par déclaration

Le critère de done exigeait une trace indépendante du canal de la demande
d'annexe HDS : les dates ne reposaient que sur `D-078`, aucune référence au
dépôt. Lecture du fil (avec accord) : les deux dates sont **confirmées**
(demande 2026-08-12, relance 2026-08-19), le fournisseur **n'émet aucun
numéro de ticket** — la référence est l'objet du fil, écrit tel quel plutôt
qu'un identifiant inventé. Sans réponse au 2026-08-20. Deux notes périmées du
TROU 1 biffées : `D-037` démentie par `D-047`, « forme non posée » posée deux
fois depuis.

Écarté : LOT-02 (tout est à la console du responsable) ; LOT-04 (sa
réconciliation machine s'avère quasi vide) ; écrire au fournisseur.

Prochaine action : PR, puis relance par un second canal — geste du
responsable. Ouvert : l'annexe couvre-t-elle rétroactivement les ressources
déjà provisionnées ? Le LOT-02 en dépend.
## [2026-08-20] — Ouverture de « Biologie consolidée », HDS passe en parallèle

`/wn-lot next` sur la campagne HDS ne rendait qu'un lot bloqué : LOT-01 attend
Scalingo, LOT-02 des gestes ops hors dépôt, LOT-04 la revue du 2026-10-21.
Arbitrage : ouvrir la campagne de rang 2 et lui donner la primauté — l'activité
primaire doit être celle où le travail a lieu ; l'échéance HDS vit dans
`blocking_issues`, qui la porte en toutes lettres.

Le cadrage a réduit le brief : l'ancrage EST gardé à l'écriture (contrat C3), le
manque est la relecture (`SELECTION` de la route du fil) ; un contrat packs
existe mais sur un autre invariant. Et le piège des E2E (peupler un patient
déplacerait trois bancs) se contourne par le patron `fiche-trajectoire-peuplee`
— provisionner par spec, jamais par le seed.

Écarté : garder HDS primaire (le `next` pointerait indéfiniment un lot bloqué).
Prochaine action : LOT-01, le verdict d'ancrage à trois états.

## [2026-08-20] — LOT-01 Biologie : le fil relit l'ancre, trois états

Les colonnes de `D-073` étaient en écriture seule : `SELECTION` ne les lisait
pas. Le fil rend désormais un verdict calculé côté serveur — `concordante`,
`perimee`, `sans_ancrage` — et seul le verdict traverse HTTP. Une lettre sans
ancre ne rend **rien** (`DC-24`).

La revue `wn-reviewer` a trouvé deux choses justes : une mutation survivait
(retirer `!sha` rendait `perimee` sur une demi-ancre), et le commentaire
affirmait qu'une re-signature « doit se voir » — faux, l'estampille de
`courrier.ts` est en dur. Les deux refermées ; un banc confronte maintenant
les trois porteurs de la version.

Écarté : trancher si une re-signature sans changement de contenu doit périmer
(clinique, revient au responsable) ; toucher aux tables signées.

Prochaine action : PR. Ouvert : T2 impossible ici (proxy bloque le navigateur
Playwright) — le CI est la porte ; et aucun `D-xxx` ne couvre un verdict servi.

### Rectificatif (même jour) — la question de la re-signature est tranchée

L'entrée ci-dessus laissait ouverte la question posée par la revue. Le
responsable l'a rendue en session : **le SHA fait foi** (`D-079`). Une
re-signature de la table sans changement de contenu **ne périme aucune
lettre** — la péremption signale un écart de fond, jamais un acte
administratif. Aucun comportement ne change : le code l'implémentait déjà sans
que la sémantique soit écrite. Consigné au registre, dans le commentaire de la
route et dans le banc, avec l'interdit qui va avec : ne pas faire dériver
l'estampille de `courrier.ts` de la métadonnée pour « réparer » l'écart — ce
serait renverser la décision et toucher une table signée. Reste ouvert : aucun
`D-xxx` ne couvre encore le fait de servir un verdict au praticien.

## [2026-08-20] — LOT-02 Biologie : le parcours est écrit, il n'est pas joué

Aucun E2E ne traversait la proposition de bilan ni le courrier, posés en
production depuis le 2026-08-18. Le spec existe : six points, mode sériel,
patient fictif, nettoyage marqué (destinataire, date, préfixe) plutôt que par
`idPatient` — un `deleteMany` large serait destructeur sur la base du Mac.

Le vrai défaut n'était pas dans le spec : **aucun `WN_CB_*` n'était posé dans
le harnais**, ni dans `verify`, ni dans `webServer.env`. Sans eux la route rend
503 et le parcours passait au vert sans rien trouver à cliquer.

Écarté : toucher au seed ; corriger la double consignation (nommée, renvoyée) ;
provisionner un épisode confirmé (justification fausse, retirée à la revue).

Prochaine action : PR. Ouvert : **le spec n'a jamais tourné** — deux runs Mac
sont dus ; `tsc` ne dit rien d'un sélecteur qui ne matche rien.
## [2026-08-21] — Refonte de l'environnement Claude Code

Audit baseline (6 agents) puis application en 4 lots. `CLAUDE.md` 271 → 186
lignes ; routage réduit à une règle (145 → 79 l) ; supprimés : `wn-plan`,
`wn-review` (contrôles cliniques migrés dans `clinique-scoring.md`),
`wn-context`, agent `wn-explorer` — le natif (Plan, `/code-review`, `Explore`)
les recouvre. `wn-cycle --local` + cadence adaptative `wn-attendre-ci` :
cycle PR ~18 → ~12 gh. Récits CI (129 l) → ADR. Garde-fous vérifiés motif par
motif, zéro modification des hooks ; `log-bash-command` était déjà async ;
« think hard » : 0 occurrence (rien à purger). Écarté : supprimer
`REGLES_CRITIQUES.md` (corrigé §4 seulement) ; toucher aux miroirs
`.github/instructions/` (Copilot). Ouvert : contradiction « une session = un
worktree » vs incompatibilité de la suite wn ; durées T1/T2/T3 canoniques dans
`/wn-test`. Prochaine action : PR, CI, revue Copilot.

## [2026-08-21] — Rationalisation du parc skills/agents (seconde vague, PR #727)

Classification sur preuve d'usage (SESSION_LOG + handoffs) : noyau démontré =
10 skills + 2 agents. Fusionnés (zéro usage) : `wn-campaign-run` → `wn-lot
next`, `wn-model` + `wn-ultra` → `wn-route`. Agents retirés : `wn-debugger`,
`wn-doc-auditor`, `wn-hygiene-operator` ; vendoré retiré : `theme-factory`.
Externes : 5 lignes adoptées de superpowers (disjoncteur « bug résistant »,
fraîcheur de preuve, description-déclencheur) ; awesome-copilot, revue
adversariale et intégration Codex REJETÉS — le natif ou le geste manuel les
couvre ; contre-audit Codex consacré d'une ligne dans `CLAUDE.md`. Matrice
T1-T8 figée (`MATRICE_ROUTAGE.md`), T4 fermé (1 signal fort → Opus).
Écarté : trims lourds de `wn-reprompt`/`wn-conventions` (risque > gain).
Prochaine action : CI, revue, merge Copilot, puis fenêtre d'observation.

## [2026-08-21] — Politique de revue Claude/Codex (PR #727, troisième vague)

`docs/claude/POLITIQUE_REVUE.md` (100 l) : P0/P1/P2, budgets (P2 = une seule
revue ; P0 = wn-reviewer + une passe Codex obligatoire), neuf signaux pour
une seconde passe Codex — jamais automatique, toujours ciblée (« seconde
passe = ciblée, jamais un redémarrage ») ; divergence tranchée par la preuve.
Codex reste un geste manuel : la politique définit ce que Claude prépare et
quand il le demande. Inventaire préalable : six contradictions documentaires,
trois refermées (nuance transitoire Copilot dans CLAUDE.md, niveau
/code-review toujours nommé, périmètre auth aligné dans REGLES_PR_MERGE).
Écarté : refondre les trois autres chevauchements (dédoublonnage wn-lot/
wn-merge/auth-securite — coût > gain, la déduplication est explicite).
Prochaine action : CI, revue, merge Copilot.

## [2026-08-21] — Refactor du portefeuille de campagnes vers 6.0

La file d'attente passe à la hiérarchie du 2026-08-21 : l'axe alliance
(réponse au trou ETP de l'audit) n'avait aucun véhicule — cinq dossiers 6.0
entrent en init-only (Socle de restitution sûre rang 1, dossier à deux voix
rang 2, charge/récit/jumeau rangs 5-7), doctrine exécutable garde V3 comme
gate de toute calibration, nutrition recule au rang 8, mémoire relationnelle
gatée conformité. E4 absorbé par 6.0-A/B/C. Resynchronisations : Biologie
lot_courant → LOT-02 (LOT-01 terminé, PR #725), next_action ne désigne plus
HDS comme primaire, R6/R8 périmées corrigées. wn-coherence-etat 24/24, T1
vert. Écarté : cadrer les campagnes 6.0 d'avance (convention init-only).
Prochaine action : PR du refactor, puis clôture biologie (LOT-02/LOT-03).

## 2026-08-22 — LOT-03 biologie : contrat packs ↔ instruments suspendus

Décisions : suspension lue en base (`questionnaires.actif`, backfillée), jamais
une liste recopiée — la réserve de D-033 se ferme par mécanisme ; deux
assertions (legacy + miroir), chacune complète, indépendantes du contrat
frère ; câblage `ci.yml` après seed seulement, release-db hors périmètre
(devra trancher la position de `Q_ALI_09`, note D-033). Écarté : fichier
négatif permanent (périmètre du lot = deux fichiers ; preuve par mutation
jouée en session sur base éphémère, rouge sur chaque assertion, vert sain et
non-vacu) ; édition du frère (interdite par le lot, son « réserve ouverte »
devient périmé — dette nommée au handoff). Constat production : dix suspendus,
aucun référencé. Prochaine action : PR du lot, CI en un appel. Ouvert :
LOT-02 (E2E, D-049) — dernier lot de la campagne.

## 2026-08-22 — LOT-02 biologie : double run prouvé, campagne clôturée

Décisions : la preuve « deux runs consécutifs » jouée sur PostgreSQL
persistant jetable local (migrations + seed), **pas** sur la base partagée —
découverte en route : `.env.local` du Mac pointe le pooler du projet Supabase
de **production** ; un spec jamais joué localement ne s'y essaie pas en
premier. Résultat : 2 × 6 verts (WebKit iPhone compris — le blocage D-049 ne
mord pas ce spec), production intouchée. Clôture complète sur la branche de
la PR #726 (statut lot/campagne, FILE_ATTENTE, state désactivé, trace).
Écarté : jouer sur la base partagée (risque prod sans gain de preuve).
Prochaine action : CI de #726, merge = geste Copilot/responsable ; puis le
créneau primaire s'ouvre (Socle rang 1 — ouverture = geste du responsable).
Question ouverte : documenter dans ROLES_MACHINES.md que « base partagée » =
production, et décider d'une base E2E locale dédiée.

## 2026-08-22 — Ouverture du Socle de restitution sûre (primaire)

Décisions : cadrage écrit sur re-mesure (5 agents, citations exigées), pas sur
le brief du 2026-08-21 — cinq corrections substantielles consignées dans
CAMPAGNE.md ; la liste du hook passe à 8 fichiers (2 tables omises + D-082
signée pendant l'ouverture) ; la correction d'en-tête d'orientationRulesV1
requalifiée geste clinique (sha épinglé, D-xxx au lot) ; « deux dates » et
« chaîne » du patron trust corrigés en ajouts assumés. Écarté : recopier les
lots du brief tels quels (deux sur trois reposaient sur des constats faux ou
périmés). Prochaine action : PR d'ouverture, CI, puis LOT-01. Ouvert :
arbitrage journalisant/bloquant de la garde de synthèse (instruit au LOT-01,
tranché par le responsable) ; sort de stopRulesLibelles (LOT-02).

## 2026-08-22 — Socle LOT-01 : la couverture des chemins sortants est prouvée

Décisions : carte des chemins en tête de documents/vocabulaire.ts (contrat +
consigne pour tout chemin neuf) ; re-vérification du bilan portail au service
en régime JOURNALISANT — retenir changerait le verdict confirmable de l'envoi,
la première rédaction du lot (« retenu ») est corrigée et la correction tracée
dans le fichier de lot ; quatre gardes prouvées par mutation (bilan 3 rouges,
rendu 1, booklet 3, synthèse 4 — tout rebranché vert). Écarté : instantané de
syntheseJson figé à l'envoi (la vraie fermeture — migration, décision
séparée) ; scan des vigilances praticien (jamais servies au patient).
Prochaine action : PR du lot, puis LOT-02 (hook + en-tête sous D-xxx).
Ouvert : arbitrage des régimes (3 options au handoff 11:55) ; CRLF de
booklet/route.ts piégeux (handoff).

## 2026-08-22 — Socle LOT-02 : hook « demande » clinique + D-083

Décisions : huit fichiers cliniques au niveau « demande » (jamais refus) ;
banc neuf du hook (36 cas — il n'en avait aucun) ; relecture adversariale
BLOQUER intégrée puis ACCEPTER en contre-vérification — évitement par
segments refermé (path.posix.normalize, trou hérité couvrant aussi Prisma),
portée Edit/Write dite sans sur-promesse ; D-083 (go responsable) : en-tête
d'orientationRulesV1 corrigé, période mensongère datée. Mesuré au geste : le
sha épinglé couvre les données, pas le texte — 61/61 sans ré-épinglage, le
cadrage sur-annonçait. Écarté : élargir la liste en lot (alimentaire.ts,
stopRulesLibelles, fixture C1 — consignés à trancher). Prochaine action : PR
du lot, puis LOT-03 (registre de gabarits). Ouvert : vestige
WN_ALLOW_RISKY_COMMAND (contredit CLAUDE.md — arbitrage responsable) ;
travail synthèse non commité d'une session parallèle dans l'arbre.

## 2026-08-22 — LOT-02 HDS clos : le corpus sert, arbitrages D-084

Décisions : dernier critère LOT-02 constaté depuis un conteneur prod
(`scalingo run -d` — le « TTY requis » du runbook était faux, corrigé) ;
drapeau corpus posé après le build signé, **constat comportemental** par
synthèse réelle (10:22 UTC, trace `corpusActif: true`, sha concordant) — §C
dit « le corpus SERT » ; arbitrages de revue rendus : signature vaut
provenance, verrou auto-portant à 4 termes (`shaPerimetre`), consignés
**D-084** après collision (le D-083 du Socle, mergé d'abord, garde le
numéro) ; `changelog-collate` fail-closed sur argv après l'incident des 407
fragments (restaurés). Écarté : retitrage du corpus (contenu inchangé) ;
test du CLI réel (risque sur le vrai dépôt). PR #737/#738/#740 mergées.
Prochaine action : 2026-09-01, décommissionnement Vercel/Supabase + preuve
d'effacement (D-080). Ouvert : annexe HDS pendante ; revue G-TRUST-04 le
2026-10-21.

## 2026-08-22 — Socle LOT-03 : registre de gabarits — la campagne se clôt 3/3

Décisions : registre au patron trust adapté (deux dates dont valideLe:null —
aucune validation inventée ; pas de hash-chain, dit tel quel) ; huit gabarits
déménagés au caractère près, fidélité prouvée par 272 tests de surfaces verts
SANS modification (dont le banc strict de la relance) + volet fidélité du banc
du registre (concaténations historiques recopiées) ; segments dateLimite/note
partagés au registre (l'écart « note libre » y est déclaré) ; mutation vue
rouge (hash-lock). Écarté : imposer « aucune donnée de santé » (4 écarts
DÉCLARÉS, correction = décision praticien) ; trust/notification (praticien).
La campagne Socle est TERMINÉE le jour de son ouverture — le gate 6.0 est
posé. Prochaine action : PR, CI. Ouvert : valideLe des 8 gabarits (geste
responsable), 6.0-A à ouvrir (geste responsable).

## 2026-08-22 — Ouverture Alliance 6.0-A : le dossier à deux voix (six lots)

Décisions : campagne ouverte en primaire sur état réel re-mesuré — trois
corrections au brief (patron texte patient = registreGabarits du Socle, pas
trust ; EVA sans migration pressentie via CabinetInstrument, LOT-05
indépendant ; ancrage objectif à deux sources, anamnèse + Q_MOD_03/D-054).
Découpage 4 lots esquissés → 6 : migration isolée en LOT-01 (confirmation
obligatoire, RLS d'office), surface portail + ratification en LOT-06 (tranche
E4, constat du gate). Écarté : table EVA au LOT-01 (voie cabinet existe — le
lot tranche) ; ratification au LOT-02 (geste patient = portail, LOT-06).
Prochaine action : PR d'ouverture, CI, puis LOT-01 (schéma à proposer,
s'arrêter à la confirmation) — LOT-05 jouable en parallèle. Ouvert : travail
synthèse non commité d'une session parallèle dans l'arbre (non touché).

## 2026-08-22 — Alliance 6.0-A LOT-05 : l'EVA, piloter sans classer (D-088)

Décisions : la garde « grille complète et couvrante » est relâchée pour UNE
famille déclarée (`sum_no_interpretation`), contre une garde inverse plus
stricte — aucune bande admise, pas même la bande d'attente « Grille à
définir ». Garde à deux sites actifs + un défensif (paramètre de
`scoringParDefaut`, qu'aucun appelant ne passe) ; le cas « items number sans
grille » est couvert par un refus dédié de l'import. Moteur `questions.ts`
intact (le type existait, servi par Q_PED_01 et Q_MOD_02 — pas Q_MOD_01, qui
est `subscore`) ; aucune migration ; item `number` borné
réutilisé, pas de curseur neuf. La garde nommée `interditTouteBande` vit au
module feuille `echelles-cabinet` — `instruments.ts` embarque Prisma et la
Bibliothèque est un panneau client. Écarté : éditer cette famille dans
l'éditeur de questionnaire (il la détruirait — refus explicite, entrée par
import JSON) ; toute surface de trajectoire (hors périmètre du lot).
Prochaine action : revue puis PR par la session principale. Ouvert :
restitution de trajectoire des passations successives, non traitée.
## 2026-08-22 — Alliance LOT-01 : la migration du dossier à deux voix, et D-086

Décisions : cadrage wn-reviewer NO-GO sur la chaîne de livraison — release-db
pointait la base Supabase gelée et l'auto-deploy Scalingo applique au merge ;
D-086 (arbitrage responsable) : gate humain = revue + go avant merge,
repointage du secret, vérification par conteneur Scalingo. Quatre arbitrages :
FK RESTRICT + Patient/effacement.ts même PR ; ratification en table dédiée dès
le lot ; append-only par convention + bancs. Cinq tables, contrat liste
blanche vu rouge sous trois mutations, parité prouvée. Écarté : verrou base
(trigger) ; colonne d'accusé de lecture (LOT-04). Promu : CLAUDE.md,
db-prisma.md, DEPLOIEMENT_RELEASE_DB.md alignés sur D-086. Prochaine action :
T3, revue wn-reviewer, PR (merge = production, go responsable). Ouvert :
repointage du secret (geste responsable), deux runs release-db en attente.

## 2026-08-22 — Alliance 6.0-A : LOT-02 (objectif négocié) et LOT-03 (« ce qui compte »), en parallèle

Décisions : drapeau sur la seule surface patient (`WN_CE_QUI_COMPTE`, neuf et
éteint), aucun sur la surface praticien ; dépôt patient autorisé sur dossier
clos — la clôture est un état du suivi, pas un ordre de silence ; ratification
lue et jamais écrite au LOT-02 (le geste appartient au patient, donc au
LOT-06) ; toutes les têtes de chaîne affichées plutôt que départagées en
silence. Vérifié en production avant d'écrire : les tables appartiennent au
rôle applicatif et `relforcerowsecurity = f` — sans cette lecture, T2 et T3
seraient restés verts sur une production muette. Écarté : reprendre la plainte
Q_MOD_03 (produite par le seul POST de confirmation d'épisode — la recalculer
serait toucher au moteur). Onze gardes vues rouges par mutation réelle. Deux
revues ont trouvé ce que je n'aurais pas vu : un 500 atteignable sans session,
et deux gardes plus étroites que leur intitulé. Prochaine action : PR des deux
lots. Ouvert : cadence sur les routes d'écriture, allumage du drapeau.

## 2026-08-22 — Alliance LOT-04 : la compréhension gardée, le désaccord indestructible (D-090)

Décisions : l'accusé de lecture praticien n'aura pas de colonne (le schéma la
refuse, la liste blanche du contrat SQL la ferait rougir) — « vu » = journal
d'accès existant, « répondu » = état DÉRIVÉ. D-090 : le régime d'une garde de
chemin sortant suit le GESTE, pas le texte — confirmable à la publication (un
humain est là), journalisant au service portail (personne ne l'est) ; deux
entrées de carte pour un objet. Le drapeau garde aussi la PUBLICATION : sinon
un stock de synthèses crues remises atteindrait le patient d'un coup à
l'allumage (D-070 vu de l'autre bout). Écartés : refus dur (un faux positif
rendrait une synthèse légitime impubliable), colonne d'état, 6e onglet, gabarit
(le portail est en « pull »). Deux bancs de débranchement vus rouges puis
rebranchés. Piège : la garde anti-diagnostic refuse tout nom commençant par
`code` — renommé plutôt qu'assoupli. Revue NO-GO, deux bloquants réels : une
DÉPUBLICATION de fait (servir la tête publiée retirait au patient une synthèse
dès qu'un brouillon la supplantait — et deux de mes bancs l'épinglaient), et
`err.message` brut journalisant le texte clinique alors que le helper sûr
existait dans la route sœur. Corrigés, plus M1-M4. T3 vert. Prochaine action :
PR. Ouvert : WN_COMPREHENSION à poser en production ; l'append-only n'est tenu
par aucune contrainte base ; aucun E2E sur la surface neuve (parité LOT-03).

## 2026-08-22 — Agenda du sommeil : compte de réveils exact (D-091, PR #758 mergée)

Décisions : le compte de réveils nocturnes devient EXACT (contrat
`agenda-sommeil-v3`, borne technique `NB_REVEILS_MAX = 20`) ; les horaires de
réveils sont ÉCARTÉS — le Consensus Sleep Diary recueille compte + durée
cumulée, horodater pousserait le patient à regarder l'heure la nuit (même
doctrine que la latence en classes). Sur une ligne v1/v2, 3 reste un plancher
« 3 ou plus », jamais réinterprété. Le compte reste facultatif et hors calcul
structurel. Saisie au compteur tactile − / + (formulaire sans clavier).
Écartées aussi : une durée par réveil (contrat plus lourd sans gain clinique),
la simple mise en avant du champ. D-091 réservé après le D-090 du lot-04 (trou
assumé puis rebase). T1/T2/CI verts, merge Copilot, worktree retiré. Prochaine
action : aucune. Ouvert : `AGD_REV_MOY` mélange planchers v2 et comptes v3
(sous-estimation documentée, se résorbe seule) ; l'affichage praticien d'un 3
historique ne dit pas « ou plus ».

## 2026-08-22 — Alliance 6.0-A LOT-06 : le dossier à deux voix au portail (D-092)

Décisions : drapeau NEUF `WN_DOSSIER_DEUX_VOIX` gardant écran, route et
ratification — composer les deux drapeaux existants aurait ouvert la seule
écriture patient irréversible du geste qui ouvre une lecture ; un bloc fermé est
ABSENT, pas vide ; deux têtes d'objectif ⇒ aucune ratification proposée (409
même sur la plus récente) ; `geste_le` reste NULLE (colonne de déclaration, le
patient ne date pas son clic) ; lien dans la nav du hub, pas dans le panneau
replié des LOT-03/04. `D-092` : le gate de campagne se constate sur la
STRUCTURE, par conteneur Scalingo — le MCP lit la base gelée. Trois mutations
vues rouges. Écarté : recopier la séquence « Avant de commencer » dans le spec
(provision en base) ; faire remonter le drapeau au cockpit (libellé vrai dans
les deux positions à la place). Revue NO-GO refermée : B2 — l'écran comblait
`saisiLe` par `creeLe` et disait « Écrit le » sur une publication, deux absences
rendues comme des réponses. Prochaine action : T3, PR, puis clôture de campagne.
Ouvert : constat du gate NON FAIT (login Scalingo du responsable) ; trois
drapeaux non posés ; aucune cadence sur la ratification.

## 2026-08-23 — Alliance 6.0-A close : gate constaté (D-092), activation restreinte (D-093)

Décisions : campagne close, six lots mergés. Gate constaté en production par
conteneur — les cinq tables sont VIDES, pas seulement les ratifications. `D-093`
ouvre les recommandations élargies en périmètre restreint : `PAT006`, `PAT007`,
`PAT017` par identifiant, relecture praticien avant chaque remise, sortie
conditionnée à une réponse patient réelle ET un bilan sur le classement, six
semaines au bout desquelles le périmètre se REFERME. Fait décisif : le gate
n'était pas un drapeau — `tablePrioritesSignee()` rend `true` depuis `D-061`, le
mécanisme tournait déjà ; « activer » signifiait s'autoriser à s'en réclamer.
Écarté : activation immédiate (le classement des candidats n'est couvert par
aucune ligne signée, or l'ordre EST la recommandation). Les trois drapeaux sont
posés et vivants (401 et non 503). Prochaine action : rédiger un objectif sur un
des trois dossiers — sans lui, rien à ratifier. Ouvert : classement hors
périmètre signé ; borne des trois dossiers tenue par consigne, pas par verrou.

## 2026-08-23 — Garde-fou Codex P0 automatisé, après un oubli sur LOT-06

Constat : LOT-06 (portail/token, PR #760) est classe P0 (auth/portail) et
n'a jamais reçu la passe Codex obligatoire — seule la revue interne
(`wn-reviewer`, NO-GO puis corrigé) a eu lieu. Décision : ne plus compter sur
la mémoire de session pour ce rappel, mais l'ancrer en hook. Ajout de
`.claude/hooks/gate-codex-p0.mjs` (+ banc 9 cas) sur `PreToolUse`/`Bash` :
avant `gh pr create`/`gh pr merge`, si le diff touche une classe P0
(auth/portail/token, migration, clinique/scoring) sans trace « Codex » dans
changelog.d/handoffs/commits, verdict `ask` — jamais `deny`, le hook ne peut
prouver qu'une passe a eu lieu, seulement son absence de trace. Écarté :
bloquer en dur (le hook n'a pas l'autorité pour ça). Vérifié en live
(sentinelle), banc complet vert (88/88).

Incident en cours de vérification : une session concurrente a commité
(`b67e039c`, branche `alliance-6a/cloture-journal`, non mergée) pendant
qu'une ligne de sentinelle de debug était temporairement dans
`.claude/settings.json` — elle s'est retrouvée committée par erreur. Déjà
revertée en local (diff non commité). Prochaine action : commiter ce
revert. Ouvert : la passe Codex de LOT-06 (#760) reste non confirmée
rétroactivement.

## 2026-08-23 — Doctrine exécutable ouverte, LOT-01 livré : l'état atteint (D-095)

Campagne de rang 3 cadrée sur état frais puis ouverte (#766, deux commits).
Trois véhicules déplacés : V1 à moitié livré (l'objet à trois formes existe
depuis D-041/D-044), V4 PÉRIMÉ (ses fiches d'accueil sont livrées — DC-39/DC-41
deviennent des dettes sans véhicule), §D clos par le Socle. Arbitrage du
responsable : **la population sort du claim** — modèle « général déclaré +
exclusions déclarées » porté par l'intervention (95 entrées, `neCouvrePas` null
sur les 95), sur le précédent signé `BiologyFunctionalRange` ; DC-14 n'est pas
modifiée, sa portée est écrite. LOT-01 livré par descente en éventail (10
agents, 58 règles) : **deux bascules seulement** (DC-29 sur la condition écrite
par D-041 ; DC-33 par régularisation, D-054 ayant omis l'arbitrage), sept
réserves « Banc dû » retirées, marqueurs neufs « Décision due » et « Producteur
dû ». Écarté : déclasser les quatre règles actées sans décision (le code les
tient) ; recomputer la grille 4 colonnes de l'audit (non reconstituable — limite
nommée). Fait décisif : la clôture de la chaîne T0 laisse **douze règles
orphelines**, dont DC-09, que l'audit désignait comme le garde-fou le plus
exposé. Prochaine action : PR du LOT-01. Ouvert : arbitrage de portefeuille sur
les orphelines ; `git add -A` a ramassé le travail d'une session voisine (défait).

## 2026-08-23 — Trois arbitrages de portefeuille sur Doctrine exécutable (D-096)

Les questions ouvertes par le LOT-01 sont tranchées. **DC-09 reçoit le
LOT-09** — jumelle exacte de DC-27 (même fichier, même garde épinglée), et
dernière des quatre règles « les plus exposées » de l'audit sans ancrage ; les
dix autres orphelines restent des dettes nommées au LOT-08. **Le LOT-02 est
transféré à Curation signée** : sans consommateur depuis que D-095 a sorti la
population du claim, une migration posée par une campagne qui ne s'en sert pas
aurait ajouté une orpheline aux onze recensées — la campagne n'a donc plus
aucune migration ni confirmation obligatoire. **DC-29 : le LOT-06 descend
chercher la provenance avant de conclure**, la forme vide devient le repli et
non le défaut. Écarté : renuméroter les lots (coût > trou) ; une campagne
dédiée aux orphelines (la file compte huit dossiers). Sept lots exécutables sur
neuf numéros, un seul lien fort au graphe (LOT-04 → LOT-05/06), trois lots
libres. Prochaine action : PR. Ouvert : l'arbitrage sur les dix orphelines est
reporté, pas clos ; Curation signée est à l'arrêt et porte désormais DC-07,
DC-13, DC-20.

## 2026-08-23 — LOT-09 : DC-09 mord dans le prompt (D-097)

`DC-09` — « une association ne devient jamais une preuve » — est **actée** :
clause au **cadre déontologique** du prompt (`synthese-v29`), pas dans une
section topique, parce que la section orientation prime sur ce qui la suit
mais « ne relève aucune des interdictions posées plus haut ». Quatre verbes
(prouve, explique, démontre, atteste) ; `confirme` et `signe` écartés — le
prompt dit déjà « à confirmer par l'entretien ». Second point de passage
(`verifierRestitutionOrientation.ts`) **examiné et écarté**, motif écrit dans
le fichier : le glissement probatoire n'a pas de vocabulaire fermé, l'y forcer
demanderait un arbitrage chiffré neuf. `D-011` intact.

La revue a trouvé le défaut central : le banc épinglait le **vocabulaire** de
l'interdit, jamais l'interdit — « Évite de l'écrire » restait vert. Corrigé
(garde d'opérateur, unicité, périmètre déterministe, messages d'empreinte qui
refusent le report mécanique). Écarté : détecter une clause contradictoire
arbitraire — même impossibilité que celle qui fonde le verdict ci-dessus.

Prochaine action : PR. Ouvert : les ancres `fichier:ligne` de la constitution
se périment à chaque édition du prompt (8 corrigées ici) ;
`wn-diagnostic-e2e.mjs` rate un blocage WebKit quand `page.goto` n'apparaît
que dans la sortie terminal.

## 2026-08-23 — Alliance 6.0-B ouverte, D-094 et LOT-01 en production ; garde release-db corrigée

Campagne `2026-08-23-alliance-objectif-trois-voix` créée (7 lots, parallèle ;
doctrine-executable reste primaire). `D-094` fonde le régime : **la machine
cite, elle n'invente pas** — sources en liste fermée (anamnèse verbatim,
`Q_MOD_03`, candidats signés), « le dire autrement » en table propre, trois
propositions sans numérotation (l'ordre n'est pas signé, `D-093`),
déterministe d'abord, module distinct (G6 intacte, G7 neuve). Périmètre :
**tous les patients actuels** (bêta-testeurs informés) ; `D-093` inchangée,
sa levée préparée au LOT-06. LOT-01 : trois tables + `source_proposition_id`,
**appliqué et constaté en production** (`one-off-9959`).

Deux trouvailles de gardes. La complétude d'effacement RGPD a refusé la
migration tant que les tables n'étaient pas dans `effacerDossier`. Puis la
revue a mesuré qu'**un cas négatif rouge ne prouve pas QUELLE contrainte l'a
rejeté** : le CHECK du couple geste↔motif subsume celui de la taxonomie —
supprimer ce dernier, ou y légaliser `caduque`, laissait le contrat vert.
Corrigé par assertion structurelle (`pg_constraint`). Sept mutations vues
rouges.

Incident release-db : deux merges rapprochés, Scalingo déploie le plus récent
et saute le commit approuvé ; la garde attendait 20 min un refus certain
d'emblée. Corrigée par test d'ascendance — refus immédiat, actionnable, sans
rien perdre de sa sévérité (#772). `D-096` a par ailleurs rendu caduque la
frontière d'ordonnancement entre les deux campagnes (doctrine n'a plus de
migration).

Écarté : corriger les 24 lignes `cd $(git rev-parse --show-toplevel)` des
skills `/wn-*` (option B) — l'utilisateur a choisi l'option A, travailler en
worktree sans slash-commands. Mémoire retournée en ce sens.

Prochaine action : arbitrer les **cinq recommandations du LOT-02** (consignées
dans sa fiche), puis ouvrir le lot. Ouvert : la forme des fragments n'est
gardée nulle part ; `hash_sources` sans algorithme fixé ; la fenêtre `D-093`
court jusqu'au 2026-10-04 et attend toujours un premier objectif rédigé.

## 2026-08-23 — Alliance 6.0-B, LOT-02 : le moteur de proposition (D-094)

Les cinq arbitrages d'ouverture **tranchés conformes aux recommandations**
(#775), puis le lot livré (#776). Deux points que la fiche ne couvrait pas :
la `DecisionCard` n'étant pas persistée et G7 interdisant de la recalculer,
**un GET ne peut pas assembler** — d'où un POST à deux gestes (`assembler`,
`ecarter`), idempotent par empreinte ; et l'anamnèse se lit **en base**,
jamais dans le corps de la requête. `assembleeLe` devient la clé d'assemblée.

Écarté : assembler sur la seule anamnèse sans candidat signé — la machine
n'aurait rien de signé à citer. Écarté aussi : rouvrir `D-094` pour les
arbitrages 1 et 2, G7 en portant l'exécution.

**La revue a rendu un no-go sur le point qui compte** : mes deux listes de mots
interdits étaient **entièrement en français**, alors que la donnée amont
s'appelle `rank` et `confidence`. Mes quatre mutations vues rouges étaient
toutes francisées — la plus probable serait passée. Même défaut qu'au LOT-09.
Deux autres trous du même ordre (import relatif traversant G7-1, assemblage
rendant le dossier sans journaliser) et six corrections de rang élevé ou moyen.
Un banc avait par ailleurs trouvé un `return promesse` dans un `try` qui
laissait fuir les mots du patient dans un message Prisma.

Prochaine action : LOT-03 (cockpit — reprendre, amender, écarter). Ouvert :
une assemblée devenue vide ne retire pas la précédente (migration) ;
lire-puis-écrire n'est pas étanche à la course ; le SHA du périmètre n'est pas
confrontable depuis la route. T2 porte un échec WebKit du portail **démontré
étranger au lot** (reproduit sur un arbre sans lui).

## 2026-08-23 — LOT-05 en production, et l'interblocage qui bloquait toute release (D-102)

Décisions — La release du LOT-05 a été refusée comme les deux précédentes.
Hypothèse initiale (merges rapprochés) écartée : la garde traite déjà ce cas.
Cause réelle, un interblocage — Scalingo attend que **tous** les checks du
commit concluent, `release-db` en est un, et il attend le déploiement. Tranché
par `D-102` (PR #781) : la release déclenche le déploiement qu'elle attend.
Écarté — désactiver « attendre le CI » (déploierait du code à CI rouge) ; sortir
`release-db` des checks (coûte une action humaine sans rien garantir). Le
déclenchement reste dans le job gaté : le sortir en amont exposerait le jeton
sans approbation.

Preuve — l'auto-déploiement a démarré 4 s après que `release-db` soit passé au
vert. Répétition à vide verte : le déclenchement s'abstient sur une tête déjà
déployée.

Prochaine action — signature `SAFETY_EI_METADATA` (revue 2026-08-30) ; `DC-42`
reste non armée.

Questions ouvertes — aucune sur `D-102` ; l'inhibition de `DC-42` sera totale,
pas graduée.

## 2026-08-24 — LOT-06 : la politique qui ne compare rien, puis sa signature (D-103, D-104)

Décisions — La mesure a retourné le lot : là où la fiche annonçait trois axes de
`DC-54` mécanisables, la production en donne **zéro** (niveau de preuve sur
0,55 % des 8 224 claims en 32 valeurs libres, un seul claim portant deux axes,
`valide_at` étant la date de validation praticien). La politique déclare donc
ses quatre axes non comparés et escalade — `DC-55` obtient son premier
producteur. Le conflit `CS-BIO-01` était déjà vécu dans `indicationsBiologieV1`,
deux claims à sens opposés dans un même fichier signé. Livré inerte, relu, puis
signé (`D-104`) : `DC-54` et `DC-55` basculent.

Écarté — comparer quand les champs sont là (mordrait sur 1 claim sur 8 224 et
exigerait une hiérarchie inventée) ; poser d'abord un vocabulaire fermé (une
campagne à soi seule). `DC-29` : descente faite, verdict négatif, forme
`CONVERGENCE` laissée vide et gardée.

La revue a trouvé qu'un claim entrait au préflight fail-closed sans avoir été
relu — il aurait bloqué toute release de base.

Prochaine action — approuver la release de `3f99ccd6` : sans elle la signature
n'atteint pas la production.

Questions ouvertes — l'escalade n'atteint ni l'extinction ni les préconditions
T0 ; restent LOT-03, LOT-07 et LOT-08 de la campagne.

## 2026-08-25 — Alliance 6.0-B, LOT-03 : le cockpit reprend une citation (#795)

Campagne reprise — elle était repassée **inactive** à la clôture de
`doctrine-executable`. Décisions — l'écran DÉSIGNE le fragment, le serveur le
RECOPIE ; un fragment non-anamnèse est refusé (422) ; reprendre écrit objectif
et geste dans une seule transaction.

Le déclencheur d'assemblage a demandé une mesure, qui a renversé mon modèle :
`GET /cockpit` ne rend jamais `ready`, le `POST` qui produit la carte n'écrit
rien, la carte n'est persistée nulle part. Elle n'existe que dans le navigateur,
après la confirmation T0 — l'intuition du responsable était juste, et l'option
« le panneau cherche les candidats » était **impossible**. Carte du workflow
établie pour trancher.

Deux défauts invisibles de `tsc` : un import de table clinique dans un composant
`'use client'` (667 lignes au bundle) ; puis T2 a cassé le build sur
`node:crypto`. Le domaine est désormais pur, et ce zéro d'import est asserté.

Revue **no-go** : le drapeau ne gardait pas la reprise ; et G2 se disait
bilingue sans l'être — le défaut du LOT-02, non propagé au fichier voisin que
j'éditais. Mémoire corrigée en ce sens.

Prochaine action : LOT-04 (portail, « le dire autrement »). Ouvert : le contrôle
« déjà disposée » n'est pas étanche à la course ; pas de déplacement de focus ;
aucun E2E du parcours complet.

---

## Entrées restaurées le 2026-08-25 — neuf sessions de « Doctrine exécutable »

Ce qui suit a été **écrit après coup**, le 2026-08-25, à partir des fragments de
handoff et du registre de décisions — les deux sources primaires, toutes deux
présentes au dépôt. Les neuf sessions concernées ont produit leur décision, leur
handoff et leur PR ; seule leur entrée de journal manquait, de `D-098` à `D-101`
puis de `D-105` à `D-109`.

Elles sont posées **à la fin**, et non insérées à leur place chronologique :
`SESSION_LOG.md` est append-only, et rétablir une lacune ne justifie pas de
défaire l'invariant qui protège le reste. Chaque titre porte sa vraie date.
Elles sont plus courtes que celles écrites à chaud, et c'est assumé : un
handoff dit ce qu'une session a fait, il ne dit pas tout ce qu'elle a pensé —
on ne comble pas cet écart en l'inventant.

## 2026-08-23 — Trois dettes du LOT-09 tranchées sur mesure (D-098)

Décisions — L'ancre d'une citation devient **textuelle** : mesure sur 247
citations `fichier:ligne`, et le contrôle qu'on écrirait spontanément (le
fichier existe, la ligne est dans les bornes) n'aurait attrapé **aucune** des
huit citations faussées la veille — elles étaient toutes dans les bornes. Il
garde contre la suppression d'un fichier, jamais contre la dérive, c'est-à-dire
contre le seul défaut réellement observé. Le classificateur E2E perd un
prédicat.

Écarté — Rouvrir les dix règles orphelines : `D-096` les a laissées dettes
nommées et le LOT-08 les porte déjà, liste et méthode de recomptage comprises ;
les re-décider huit jours plus tard serait de l'agitation de portefeuille.

Prochaine action — LOT-10, qui exécute les deux premières.

## 2026-08-23 — LOT-04 : un objet de sécurité qui existait partout sauf à l'entrée (D-099)

Décisions — `SafetyFinding` avait son type, son consommateur et ses bancs depuis
la chaîne T0, mais **jamais d'entrée** : `chaineC1.ts` posait `safetyFindings: 0`
en dur. `DC-12` et `DC-23`, actées depuis `D-043`, étaient donc **inertes en
production**. Les douze signaux d'alerte sont cotés en **deux rangs**, et le rang
`adressage` **retire** les priorités au lieu de s'afficher à côté.

Ce que la mesure a changé — Trois lectures de production en conteneur (lecture
seule, agrégats sans identité) : 25 consultations, 9 portent au moins un signal
(36 %), 6 au moins un signal d'adressage (24 %), six libellés distincts tous
exacts. Ces chiffres ont écarté la cotation **uniforme**.

Fait retrouvé, pas inventé — l'arbitrage praticien du 2026-08-03, inscrit en tête
d'`orientationRulesV1.ts` : « un signal d'alerte appelle un ADRESSAGE, pas une
exploration ». Personne n'avait relié ce lot à cette phrase.

## 2026-08-23 — LOT-10 : deux instruments de mesure qui se trompaient (D-100)

Décisions — Le lot a corrigé **son propre cadrage**. Deux constats de `D-098`
étaient faux, pour la même raison de fond : l'instrument de mesure était plus
fragile que ce qu'il mesurait. Une citation morte et non deux — l'attribution
« à l'ancre la plus proche à gauche » condamnait une ancre juste. C'est ce faux
positif qui a dicté la forme retenue : ancre et texte liés dans **un seul lien
markdown**, l'attribution devient syntaxique, il n'y a plus rien à deviner.

Second constat — le classificateur E2E se taisait pour **deux** raisons : le
prédicat `page.goto`, et le prédicat « journal réseau vide », qui lâche dès
qu'un test monte son décor par `page.request.post`. Corriger le seul mode cadré
n'y aurait rien changé.

Questions ouvertes — aucune ; le banc a trouvé deux défauts sur le contrôle
lui-même avant livraison.

## 2026-08-23 — LOT-05 : une gate sans sujet, une règle inapplicable (D-101)

Décisions — La mesure d'ouverture a rendu la fiche inapplicable. **La gate
n'avait pas de sujet** : le seul objet réellement classé à l'exécution est une
règle de priorité, et aucun chemin d'exécution ne relie un candidat classé aux
95 `neCouvrePas` du registre d'audit — les curer aurait produit une donnée que
rien ne lit. **Des neuf critères de `DC-43`, aucun n'était lisible comme état
courant.** Et `DC-42` n'était pas « non appliquée » mais **inapplicable** : la
capture est complète depuis le 2026-07-16, mais `produit_libelle` est du texte
libre et aucune clé ne pointait un protocole — aucune requête ne pouvait établir
ce que la règle demande.

Retenu — la gate **dit ce qu'elle ignore** ; l'effet indésirable reçoit son
association ; une seule consultation fait foi.

## 2026-08-24 — LOT-03 : `DC-58` n'a ni sujet ni méthode (D-105)

Décisions — La fiche exigeait la mesure avant le banc, « c'est elle qui dit si
le garde a un sujet ». **Elle a dit non deux fois.** Descente sur 476 fichiers
de test, 595 sources, 283 de `src/lib` : **zéro valeur orpheline** — les 25
candidats sans provenance sont tous légitimes après qualification une par une.

Et surtout, **la méthode prescrite est vacue** : vérifier qu'une valeur de test
« existe ailleurs » ne prouve rien avec 633 valeurs distinctes au dénominateur.
`poids = 1` était « couvert » par le chiffre 1 d'un fichier d'indications ;
`doseCibleBasse = 4000` par une longueur maximale de texte. Le banc aurait été
vert en permanence, et vert pour la mauvaise raison.

Retenu — le banc se pose sur **l'autre versant**.

## 2026-08-24 — LOT-07 : le total de « Mon équilibre » n'a pas d'interprétation clinique (D-106)

Décisions — Trois faits ont rendu l'arbitrage décidable : aucun consommateur ne
lit le total ; le patient ne voit jamais le chiffre ; **mais sa VARIATION est un
signal présenté aux deux surfaces**. C'est ce troisième fait qui obligeait à
trancher — si le total n'a pas de sens clinique, sa variation n'en a pas non
plus, et c'est elle, pas lui, que le patient lisait sous la forme « En
progression depuis votre dernier bilan ».

Réponse — **non**, il n'a pas d'interprétation clinique, et il n'est pas retiré
pour autant : `DC-22` bascule par sa **seconde branche**, le total est
*identifié* (`DC-20`), pas supprimé.

Corrigé en revue — une première rédaction disait « simple code de vocabulaire » :
c'était faux, `GLOBAL_BALANCE` est émis en portant sa valeur, donc dans le
snapshot figé et son empreinte.

## 2026-08-24 — LOT-11 : les actes en attente (D-107)

Décisions — Le lot re-constate avant de décider, et rien n'avait bougé : six
drapeaux toujours posés, deux signatures toujours à `false`, zéro exclusion
curée sur 95, treize orphelines au grep. `SAFETY_EI_METADATA` est **reportée au
2026-08-30** avec son motif — rien ne se perd, la capture reste ouverte, seule
l'interruption reste fermée. La curation des exclusions est **rouverte**, ce qui
revient sur `D-101` : `DC-43` cesse d'être « écrite, non armée » et obtient un
porteur nommé.

Écarté — laisser les dix orphelines en « dettes nommées » : c'est **le régime
qui les a rendues orphelines**. Elles reçoivent une campagne dédiée.

## 2026-08-24 — LOT-12 : la contre-revue adverse trouve six trous (D-108)

Décisions — La revue a été lancée **avant** le lot de clôture, et c'est ce qui a
payé : sept affirmations sur treize réfutées, six debout, toutes revérifiées une
par une dans l'arbre avant tout correctif. Rien n'a été corrigé sur la parole de
la revue.

Le trou principal n'était pas un banc perfectible — `PatientCompanionHome.tsx`
servait du vocabulaire de jeu **au patient depuis le 2026-07-18**, cinq
semaines. Le mot était le deuxième motif de la liste surveillée : ce n'est pas
la liste qui a failli, c'est le périmètre — le garde connaissait la **page**, pas
le **composant** qu'elle monte. Deuxième fois que ce garde est pris à ne pas
couvrir ce qu'il annonce. Le correctif ferme la classe par remontée
**transitive** des imports du portail.

## 2026-08-25 — LOT-08 : la clôture de « Doctrine exécutable » (D-109)

Décisions — Le lot **vérifie, il n'enregistre pas** : les six bascules citent
chacune une décision existante *et* un banc dont la présence a été vérifiée au
dépôt. Deux mesures ont changé ce qui allait être écrit. Les déclencheurs des
quatre règles non armées, vérifiés **structurellement** : `rag_corpus_claims` ne
porte ni colonne de claim parent ni colonne de niveau d'exécution, et aucune
`ALTER` n'en ajoute — le déclencheur ne *peut pas* être franchi, il n'est pas
seulement « non franchi ». Et « PNNS 4 » figure bien au dépôt, mais comme
**libellé d'un item de questionnaire** : un grep pressé aurait conclu que le
déclencheur de `DC-52` était franchi.

Écarté — suivre la fiche du lot, périmée : son §2 annonçait les dix orphelines
en « dettes nommées », option que `D-107` avait écartée la veille.

Résultat — campagne terminée, 11 lots sur 12 exécutés dont un LOT-12 non prévu ;
six règles sur leurs trois preuves, et ce qui n'est pas fermé est nommé règle
par règle.

## 2026-08-28 — 6.0-B : contre-revue adverse, quatre décisions, une fenêtre ouverte

Décisions — Contre-revue adverse jouée **avant** le lot de clôture et sous forme
d'affirmations à réfuter : 5 sur 25 réfutées, toutes corrigées. `D-114` porte
l'identité de cycle **en base** (CHECK + index partiels) — le garde applicatif
seul avait déplacé le défaut sans retirer sa condition. `D-115` fait résoudre la
provenance signée **au serveur** : le navigateur ne fournit plus le texte d'une
règle. `D-116`/`D-117` publient sommeil et douleur ; la table signée en porte
quatre.

Écarté — filtrer le corpus sur `prescriptif = true` : les 246 claims « sommeil »
sont dominés par une procédure d'agenda, donc de l'exploration. Les règles
publiées citent des claims de **mécanisme**, non prescriptifs.

Prochaine action — le geste clinique : écrire un objectif sur un dossier du
périmètre `D-093`, puis les trois vérifications de provenance.

Ouvert — `WN_OBJECTIF_PROPOSE` est posé et les sept tables portent zéro ligne ;
`D-093` se conclut avant le 2026-10-04, sinon le périmètre se referme.

## 2026-08-28 — D-118 : un acte posé ne redevient pas invisible

Décisions — Retour d'usage du premier dossier réel : T0 confirmé le matin,
page rechargée, rail « en attente ». `D-118` fait du POST cockpit le
**troisième point de persistance** (mêmes gardes, `N1.1` comprise) ; le GET
**rejoue** l'épisode persisté — mêmes empreintes, mêmes identifiants, prouvé
par banc — et le rail dérive « confirmé » de la base. Un rejeu ne verrouille
pas le jalon dû et n'assemble rien.

Écarté — journaliser le POST : la dispense d'écriture de `GD-1` s'applique dès
qu'il écrit ; et `refusPreconditionsPersistance` au cockpit — il construit ses
contournements côté serveur.

Résultat — PR #817 mergée, CI vert. T2 a mordu deux fois juste : le spec
biologie exigeait le défaut que la décision ferme.

Prochaine action — reconfirmer T0 sur le dossier une dernière fois (la ligne
s'écrira), enregistrer le protocole, diffuser.

## 2026-09-03 — Incident mémoire, décommissionnement D-080, chaîne auth

Décisions — Session du 31/08 au 03/09. Incident : logins praticien en échec,
event loop affamé sur conteneurs S ; remédiation 2×M + `NODE_OPTIONS=384` +
alerte 85 % + budget openid-client 8 s (#820). Décommissionnement
Vercel/Supabase exécuté avec preuves (D-120/D-121, trust v3 #822, nettoyage
#823). `NODE_OPTIONS` hérité par le build Scalingo a cassé quatre
déploiements → `unset` dans `build.sh` (#824). `engines.node` épinglé
« 22.x || 24.x » (#826). Auth : endpoints Google épinglés sans découverte,
`hd`, PKCE constaté déjà actif (#827, revue adversariale GO) ; renommage
`jwks_uri` de Copilot reverté — il cassait le login —, contrat consommateur
verrouillé par banc (#829). Login réel validé le 03/09.

Écarté — migration Auth.js (aucun signal) ; restart planifié (alerte +
plafond suffisent).

Prochaine action — sonde Better Stack sur `/login` ; micro-lot
`/login?error` (pannes d'auth muettes à l'écran).

Questions ouvertes — confirmation écrite Supabase (backups, rubrique 12) ;
dépôt sous sync iCloud : suites locales instables (`fileproviderd`).

## 2026-09-04 — Écrans d'échec : plus personne devant un écran muet

Décisions — Suite de la session incident/décommissionnement. `/login` traduit
enfin le `?error=` de NextAuth (refus vs panne, deux conduites distinctes). Côté
patient, la redemande de lien indiquait « envoyé » jusque sur panne SMTP : le
recours est ajouté **à l'identique pour tous**, ce qui préserve
l'indifférenciation anti-énumération. `app/portail/error.tsx` et
`app/not-found.tsx` remplacent le HTML système et la page anglaise. Aucun écran
ne nomme de sous-traitant : inutile au patient, renseignant pour qui sonde.
Alerte `p95_response_time` armée chez Scalingo.

Écarté — un disclaimer applicatif en cas de panne d'hébergeur : la page serait
servie par le composant tombé. Seule réponse valable, une page d'état ailleurs.

Prochaine action — monitor et page d'état externes, puis son adresse dans
l'e-mail du lien magique.

Questions ouvertes — Sentry inerte (aucune erreur client tracée) ; faux succès
praticien symétrique sur panne SMTP ; `web/changelog.d/` jamais collaté.

## 2026-09-04 — D-122 : les deux étages du rayon biologie livrés dans la nuit

Décisions — Nuit sous autorisation globale. Deux migrations seules dans leur
PR (`D-087`), release-db approuvées, constats par conteneur :
`documents_patient_biologie` (#828) puis `resultats_biologiques` (#838, unicité
patient/analyte/horodatage ajoutée par l'utilisateur — la borne vit sur
l'horodatage complet). Code : document patient ancré, refus registre
confirmable lié au texte par empreinte SHA (#848) ; saisie de résultats +
estimé↔mesuré derrière `WN_CB_RESULTS_ENABLED` éteint, unité relue sur
l'analyte, POST sans journal `GD-1` (#854). Deux leçons release-db consignées :
fenêtre de suivi 10 min < démarrage à froid npx ; wait timer + garde de tête =
course perdante face aux merges concurrents.

Écarté — relancer un release-db rouge à l'aveugle ; toute valeur dans la
proposition ou le document patient.

Prochaine action — constat visuel des deux surfaces ; levée du drapeau
précédée du registre des traitements et de l'information patient.

## 2026-09-04 — Mise en service des dossiers neufs : encart du Fil et courrier d'accès

Cinq dossiers ouverts depuis le 2026-08-20 : e-mails d'accès tous partis
(`Envoye`), **aucune entrée au portail**, donc aucun pack — il n'est assigné
qu'à la validation d'onboarding par le patient. Trois portes séparent la
création d'un dossier de son existence clinique, et aucune ne rendait compte.
#868 pose l'encart « Nouveaux patients » qui nomme la première porte fermée ;
#869 réécrit le gabarit `acces_portail` (v2, première `valideLe` du registre)
et pose un `Reply-To` par dossier.

Écarté — un e-mail ponctuel aux cinq (reformuler sert aussi les suivants) ;
`{{praticien}}` en variable (ne dirait plus « c'est moi ») ; restaurer le CRLF
de `consultations/route.ts` (`.gitattributes` renormalise).

La revue adversariale a rendu NO-GO sur deux promesses fausses du texte, dont
« taper app.wellneuro.fr » — la racine sert l'écran praticien. Leçon : un
gabarit se relit seul, ce qu'il promet vit ailleurs.

Prochaine action — « Renvoyer l'accès » sur les cinq fiches après déploiement ;
si rien ne bouge, regarder SPF/DKIM.

## 2026-09-06 — Preuve visuelle : les baselines deviennent opposables

Neuf PR (#871→#884). 4 écrans sur 9 comparés au pixel, 11 baselines commises,
chacune regardée — ce qui a intercepté une image qu'aucune garde n'aurait vue.

Décidé — `--update-snapshots=all` (le drapeau nu conservait le périmé) ; seuil
`maxDiffPixels: 100`, absolu et **mesuré** via le CI pris comme instrument :
l'écart génération↔comparaison vaut 33 px au pire, 0 dans 5 cas sur 8, là où le
ratio de 2 % en tolérait 48 960. Borne de garde à 219 px.

Écarté — aligner le contexte de génération : le décalage mesuré coûte moins que
le couplage aux 21 autres specs. `dashboard-patients` reste hors comparaison.

Prochaine action — aucune, lot clos. Desserrer le seuil exigera une nouvelle
mesure ; le banc le refuse au-delà de 219.

Ouvert — `D-049` fait rougir T2 localement, sans rapport avec le lot.

## 2026-09-06 — Le design system passe de la prose au test

Deux artefacts, une finalité : outiller le design des interfaces sans importer
de skill tierce.

Décidé — deux règles du §10 (`bg-white`, `text-[13px]`/`text-[14px]`) deviennent
`design-system.guard.test.ts`, chacune prouvée rouge sur sources fabriquées ;
`/wn-ui` cadre un écran avant le code.

Corrigé en cours de route — une troisième règle rejouait la garde E18
(`tokens-couleur.guard.test.ts`), qui couvre déjà les échelles Tailwind brutes
sur tout `web/src`. C'est E18 qui a attrapé le doublon, en CI, en rougissant sur
mes propres sources fabriquées. Leçon : chercher la garde existante avant d'en
écrire une.

Écarté — Impeccable (SOUS RÉSERVE au contrôle `/wn-tiers` : binaire non attesté
sur chaque édition) et UI/UX Pro Max (génère une identité là où le dépôt en a
une). Écartées aussi des gardes sur les hex et `shadow-sm` : trois exceptions
pour leurs seuls usages réels.

Corrigé — les « 184 boutons bruts » ne sont pas une dérive : zéro rejoue une
variante de `Button`. Un écart s'établit sur un comptage qualifié, jamais sur un
`grep` nu.

Prochaine action — trancher si l'échelle typographique est fermée : 117 paliers
natifs et 19 tailles arbitraires en dépendent.

## 2026-09-06 — L'échelle typographique se ferme aux arbitraires

Décidé — toute valeur `text-[…]` est proscrite ; les paliers natifs de Tailwind
(18/20/24/30 px) sont admis, `fontSize` vivant sous `theme.extend` et la config
les pilotant centralement. Palier bas `text-3xs` (10 px) ajouté. Les 19 valeurs
arbitraires de l'arbre sont migrées, 13 fichiers. La garde du §10 est élargie en
conséquence, avec ses cas de rouge synthétique.

Le diagnostic n'était pas « fermée ou ouverte » mais un **trou** : aucun palier
entre 16 et 32 px, que 136 usages remplissaient chacun à sa façon.

Écarté — migrer aussi les 117 usages natifs : 136 sites touchés pour déplacer des
pixels sur des titres que personne ne conteste.

Prochaine action — régénérer les 8 baselines visuelles (workflow manuel,
Ubuntu), regarder chaque image, les committer dans la PR. `fiche-cockpit` et
`fiche-tiroir-besoins` changent : 19 → 18 px sur un nom de patient et un titre
de tiroir.

## 2026-09-07 — Les avis npm tombent de 24 à 9, et Next passe en 15.5

Décidé — `next` 14.2.35 → **15.5.25** (tag `backport`), pas Next 16 : les 21 avis
avaient tous une borne `<15.5.21`, et la ligne 15.5 tient sur React 18. Aussi :
`nodemailer` → 10, `next-auth` → 4.24.15 (ferme le critique), Prisma aligné en
7.10.0. `npm audit fix --force` refusé — il rétrograde Prisma d'un majeur.

Corrigé après coup — deux fragments que j'avais publiés portaient des plages
fausses ; et « React reste en 18 » était faux du runtime : Next embarque son
React et l'App Router passe en **19.2-canary** (`D-139`, sentinelle posée).

Écarté — rejouer un CI rouge : le refus a révélé trois courses réelles
(`confirmerEpisodeT0`, saisie de mesure, garde edge de `instrumentation.ts`).

Non résolu — `fiche-trajectoire-peuplee` a échoué une fois puis passé ; la
géométrie est hors de cause (mesurée, et sondée par #924). Dépendant de la
charge.

Prochaine action — fenêtre de surveillance du déploiement : connexion praticien
réelle, entrée par lien magique (drapeau ouvert), charge Postgres
(`staleTimes` 30 s → 0), premier `process.exit(1)`.

## 2026-09-09 — Le drapeau des résultats biologiques posé, son registre rattrapé

Décidé — `WN_CB_RESULTS_ENABLED` posé en production (`D-159`) : `env-set` **puis**
`restart` (Scalingo n'applique rien aux conteneurs en cours), effectivité prouvée
par sonde non authentifiée — `401` et non `503`, la garde testant le drapeau avant
la session. L'étage 2 du rayon biologie est ouvert.

Manqué — la condition RGPD **préalable** (registre des traitements + document
patient) n'était écrite que dans `DOSSIER_RGPD.md` §2 ; j'avais présenté les trois
conditions techniques comme l'ensemble complet. Comblée le jour même : rubrique 5,
`donnees_confidentialite@v6`, et la condition portée sur la ligne du drapeau.

Écarté — refermer le drapeau. Arbitrage du responsable, sur 0 ligne en base
(`one-off-8343`) : aucune donnée traitée hors registre.

Constaté, non tranché — 17 tables filles de `patients` absentes de la rubrique 5 ;
qualification article 9 due au responsable et à un conseil.

Prochaine action — l'accusé de lecture de la v6, tranché par précédent et non par
droit.
