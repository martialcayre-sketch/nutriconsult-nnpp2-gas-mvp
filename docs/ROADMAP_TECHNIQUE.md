# Architecture technique système — Wellneuro NNPP2

> **Ce que ce document est** : la cartographie de l'architecture technique
> système actuelle — comment l'application est construite, sur tout le
> périmètre applicatif. Une photo de l'existant, pas un plan d'action ni un
> suivi de chantiers.
>
> **Ce qu'il n'est pas** :
>
> - priorités et fonctionnalités produit → `docs/ROADMAP_PRODUIT.md` ;
> - architecture clinique **cible** (C1→C5B) → `docs/claude/ARCHITECTURE_CLINIQUE_3_2.md` ;
> - relation praticien/patient et frontières fonctionnelles → `docs/RELATION_PRATICIEN_PATIENT_SOURCE.md` ;
> - historique des chantiers et lots de consolidation R0→R10 → `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md` ;
> - état courant condensé pour reprise rapide → `docs/claude/PROJET_CONTEXTE.md` (qui renvoie ici pour le détail).
>
> Mis à jour le 2026-09-07. Ce document décrit l'état constaté au moment de la
> rédaction — en cas de doute, le code fait foi, pas ce texte.

## 1. Vue d'ensemble

Wellneuro-app est une application de consultation en neuronutrition, en
production sur `app.wellneuro.fr`. Deux portails distincts partagent la même
base de données :

```text
                    ┌──────────────────────────┐
                    │  Scalingo (Next.js 15)   │  région osc-fr1, HDS
                    └────────────┬─────────────┘
              ┌──────────────────┴──────────────────┐
              │                                     │
        dashboard/*                          portail/[token]
        (praticien,                    (patient, cookie signé posé
         session NextAuth)              par lien magique ou Google)
              │                                     │
              └──────────────────┬──────────────────┘
                                 │
                   api/{praticien,portail,patient,internal}/*
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
   PostgreSQL (add-on     Anthropic (synthèse IA,   SMTP (envoi
   Scalingo) via Prisma 7  corpus clinique)         booklet/relance)
          │
     + tables SQL-brut pgvector (rag_corpus_*, hors diff Prisma)
```

`api/patient/*` n'est PAS un vestige : c'est le back-end vivant du portail, et
il exige la session `wn_portail` comme les autres. Le parcours `patient/*` de
page, lui, a été retiré le 2026-08-08.

## 2. Stack technique

| Composant | Détail |
|---|---|
| Framework | Next.js 15, App Router, TypeScript, Tailwind CSS |
| Auth praticien | NextAuth 4, provider Google OAuth, domaine restreint `@wellneuro.fr` |
| Auth patient | Cookie signé HMAC (portail), posé par lien magique ou Google — indépendant de NextAuth |
| Base de données | PostgreSQL (add-on Scalingo, non exposé à Internet), Prisma 7 (driver adapter `pg`) |
| IA | Anthropic SDK (synthèse praticien, corpus clinique injecté, prompt caching) |
| Recherche/embeddings | OpenAI (embeddings du corpus RAG, `OPENAI_API_KEY` du conteneur) |
| Email | Nodemailer (SMTP) |
| Déploiement | Scalingo, région `osc-fr1` (hébergement HDS) |

## 3. Cartographie applicative (routes App Router)

### Pages (`web/src/app/`)

| Groupe | Rôle |
|---|---|
| `dashboard/*` | Back-office praticien (session NextAuth) : `patients/[idPatient]`, `synthese`, `trajectoires`, `regles`, `biologie`, `bibliotheque`, `copilote`, `corpus`, `correspondance`, `documents`, `droits`, `agenda`, `parametres` — un dossier par module, `page.tsx` + `layout.tsx` commun |
| `portail/[token]` | Espace patient authentifié par token : `alimentation`, `informations`, `questionnaires`, `suivi`, `connexion`, `google/retour`, `lien/[jeton]` (lien magique), `lien/indisponible` |
| `login` | Connexion praticien |
| `dev/*` | Pages de vitrine/validation en développement, hors production |

### API (`web/src/app/api/`)

| Groupe | Rôle |
|---|---|
| `api/auth/[...nextauth]` | NextAuth (Google Workspace) |
| `api/patient/*` | Actions patient sur session portail : `submit`, `questionnaire`, `reponses`, `protocole`, `equilibre`, `consentement`, `assignations` |
| `api/portail/*` | Endpoints portail patient par token : `agenda-sommeil`, `boussole`, `trust`, `session`, `ja`, `valider`, `pack-reevaluation`… |
| `api/praticien/*` | Le gros du back-office (~40 sous-dossiers) : `orientation`, `packs`, `protocoles`, `regles`, `bibliotheque`, `corpus`, `copilote`, `cockpit`, `synthese`, `trajectoire(s)`, `complements`, `boussole`, `fil`, `documents`, `correspondance-medecin`, `metrics`… |
| `api/internal/*` | Jobs internes non exposés praticien : `rag/{ingest,search,health,claims/ingest}`, `supplements/{ingest,referentiel}` |

## 4. Modèle de données

### 4.1 Domaines Prisma

`web/prisma/schema.prisma` fait foi ; ne pas figer de compte en dur — vérifier
avec `grep -c '^model ' web/prisma/schema.prisma` (66 au 2026-08-03). Domaines
principaux :

| Domaine | Modèles clés |
|---|---|
| Cœur patient | `Patient`, `Consultation`, `Assignation`, `QuestionnaireReponse`, `SyntheseIA`, `AssessmentEpisode`, `ProtocolDraft`/`ProtocolCheckin`/`ProtocolDiffusionApproval` |
| Questionnaires/packs | `QuestionnaireDefinition` ↔ `QuestionnaireCategory`/`QuestionnaireSecondaryCategory`, `Pack`/`QuestionnairePack` (jonction `QuestionnairePackQuestionnaire`, déclenchement `QuestionnairePackTrigger`) |
| Nutrition/compléments | `NeuroAxis`, `NutrientAxisWeight`, `CiqualNutrientValue` (référentiel CIQUAL), `SupplementIngredient`/`SupplementProduct`/`SupplementProductComposition` |
| Moteur clinique/règles | `ClinicalIntentTag`, `ClinicalCriterion`, `FunctionalCategory`, `ClinicalRule`, `IngredientFunctionalThreshold` |
| Biologie (référentiel NABM) | `BiologyAnalyte`, `BiologyNabmActe`, `BiologyReferenceRange`/`BiologyFunctionalRange`, `BiologyPanel`/`BiologyPanelItem` |
| Trust/gouvernance patient | `TrustAcknowledgement`, `TrustChoiceEvent`, `TrustAdverseEffectReport`, `TrustRightsRequest` |
| Correspondance/portail | `CorrespondancePatient`, `CorrespondanceMedecin`, `PortailMagicLink`, `PortailConnexionGoogle`, `JournalAccesDossier` |

### 4.2 Tables SQL-brut hors Prisma (pgvector)

`web/prisma.config.ts` (`experimental.externalTables`) déclare 4 tables
externes : `rag_corpus_chunks`, `rag_corpus_claims`, `rag_corpus_claim_sources`,
`rag_corpus_claim_decisions`. Créées et versionnées par des migrations SQL
classiques, mais exclues du diff déclaratif Prisma (type `vector(1536)` non
modélisable, ou mécanique portée par la base comme les triggers append-only du
journal de décisions). Accès applicatif via SQL brut dans `lib/rag/store.ts`
et `lib/rag/claims/store.ts`. Détail complet : `docs/RAG_PGVECTOR_PRODUCTION.md`.

## 5. Sous-systèmes métier (`web/src/lib/`)

| Sous-système | Dossier(s) | Rôle |
|---|---|---|
| Moteur d'orientation clinique | `lib/clinical/`, `lib/clinical-engine/` | Pipeline de décision (règles, seuils, cartes de décision) exposé via `api/praticien/orientation`. Cible fonctionnelle décrite dans `ARCHITECTURE_CLINIQUE_3_2.md` ; implémentation présente décrite ici uniquement |
| Packs / protocoles | `lib/consultation/` (`packRegistry*.ts`), `lib/protocol/` | Registre relationnel packs↔questionnaires (lecture primaire), fallback legacy `packs.qids` ; adhésion, check-ins, diffusion, trajectoire, versioning |
| RAG / claims | `lib/rag/` (config, embeddings, store, auth, verification, validation, `claims/*`) | Voir section 7 |
| Bibliothèque de compléments | `lib/supplement-library/` | Catalogue, compatibilité, ingestion, résolution, gouvernance, sentinelle — aucun doc dédié, décrit uniquement ici |
| Biologie fonctionnelle | `lib/biology-library/` | Feature flag, référentiel NABM remboursable — aucun doc dédié, décrit uniquement ici |
| Questionnaires + scoring | `lib/questionnaires/` (un fichier par thématique clinique), `lib/scoring/` | Organisation technique des fichiers ; règles de gouvernance dans `docs/gouvernance-questionnaires-scoring.md` |
| Boussole alimentaire | `lib/food-compass/`, `lib/food-observation/` | Recommandations et observation alimentaire patient |
| Agendas patient | `lib/agenda-alimentaire/`, `lib/agenda-sommeil/` | Carnets de suivi quotidien |
| Équilibre | `lib/equilibre/` | Score d'équilibre patient |
| Trust | `lib/trust/` | Consentement et gouvernance côté portail |
| Fil, documents, observabilité | `lib/fil/`, `lib/documents/`, `lib/observability/` | Fil d'actualité praticien, génération de documents/booklets, logs et event codes |

## 6. Authentification et autorisation

| Modèle | Mécanisme |
|---|---|
| Praticien | NextAuth, provider Google OAuth unique, scope `openid email profile`, session JWT 8h, page `/login` custom. `profilPraticienAutorise` (`lib/auth.ts`) applique 3 contrôles cumulatifs : domaine email dans `ALLOWED_DOMAINS=['wellneuro.fr']`, `email_verified === true`, et `hd` (si présent) dans le domaine autorisé — non exigé si absent, pour ne pas fermer l'accès si Google cesse de le renvoyer |
| Portail patient (`/portail/[token]`) | Token révocable + cookie signé HMAC (`lib/patient-session.ts`), indépendant de NextAuth |
| Legacy (`/patient/[idAssignation]`) | **Retiré le 2026-08-08** : plus de page, seule subsiste une redirection 307 vers `/portail/connexion`. `lib/patient-access.ts` reste utilisé par les routes `api/patient/*` |

## 7. Pipeline RAG et corpus clinique

Flux résumé :

```text
NotebookLM (rédaction/validation) → statut MATERIALISE_RAG_MD
  → Apps Script construit les chunks actifs
  → POST /api/internal/rag/ingest (auth RAG_INTERNAL_SECRET, embeddings OpenAI,
    upsert idempotent) → statut INDEXE_RAG_PRODUCTION
  → POST /api/internal/rag/claims/ingest (validation, embeddings, upsertRagClaims,
    verifyRagClaimsBatch)
  → logique métier claims (tirage, revue praticien, recherche) exposée via
    api/praticien/corpus/claims/*
```

Renvois différenciés — ne pas confondre les deux documents :

- infrastructure pgvector et chunks → `docs/RAG_PGVECTOR_PRODUCTION.md` ;
- procédure de validation des claims → `docs/claude/corpus/VALIDATION_CLAIMS_DEUX_VITESSES.md`.

## 8. Déploiement et CI/CD

Scalingo, région `osc-fr1` (hébergement HDS), build piloté par
`web/scripts/build.sh`. En local, aucune migration n'est appliquée.

**État actuel — un seul mécanisme d'écriture** :

- `web/scripts/build.sh` (ex-`vercel-build.sh`) n'écrit plus en base : plus de
  préflight SQL, plus de `prisma migrate deploy` inline, plus d'imports armés
  par variables d'hébergeur (CIQUAL C5, NABM CB-02a). Le script se réduit à
  `prisma generate && next build`.
- Le workflow GitHub Actions `release-db.yml` est le **chemin unique**
  d'application (gaté par l'environnement protégé `release-db` — second gate
  humain) : préflight en lecture seule puis `prisma migrate deploy`. Le mode
  `import-cb` (import NABM, advisors) visait la base Supabase décommissionnée :
  le workflow le refuse désormais explicitement. Le « lot de bascule » qui a
  allégé le build a eu lieu ; les deux mécanismes ne coexistent plus.

Renvois : détail du runbook de release DB → `docs/DEPLOIEMENT_RELEASE_DB.md` ;
exploitation générale → `docs/RUNBOOK.md` ; coordination multi-machines/sessions
→ `docs/ROLES_MACHINES.md`.

## 9. Sécurité, secrets, RGPD

Secrets uniquement en variables d'environnement (jamais en dur), garde-fous
`scripts/check_no_secrets.sh`. Détail : `docs/securite_rgpd.md`,
`docs/claude/REGLES_CRITIQUES.md`, `docs/PROCEDURE_VIOLATION_DONNEES.md`.

Le **dossier RGPD de l'expérimentation** — responsable, finalité, catégories de
données, sous-traitants, transferts, conservation, droits, et le tableau daté de
ce qui manque — est `docs/DOSSIER_RGPD.md`. Il ne lève pas le gate G-TRUST-04.

## 10. Feature flags et quality gate

Les gates vivent dans le code (`lib/*/featureFlag.ts`). Détail complet :
`docs/FEATURE_FLAGS.md`, `docs/QUALITY_GATE.md`.

## 11. Cartographie documentaire — où trouver quoi

| Sujet | Document qui fait foi |
|---|---|
| État courant condensé, onboarding | `docs/claude/PROJET_CONTEXTE.md` |
| Priorités et fonctionnalités produit | `docs/ROADMAP_PRODUIT.md` |
| Architecture clinique cible (C1→C5B) | `docs/claude/ARCHITECTURE_CLINIQUE_3_2.md` |
| Relation praticien/patient | `docs/RELATION_PRATICIEN_PATIENT_SOURCE.md` |
| Historique des chantiers R0→R10 | `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md` |
| Infra RAG/pgvector (chunks) | `docs/RAG_PGVECTOR_PRODUCTION.md` |
| Validation des claims | `docs/claude/corpus/VALIDATION_CLAIMS_DEUX_VITESSES.md` |
| Release DB (migrations/imports hors build) | `docs/DEPLOIEMENT_RELEASE_DB.md` |
| Exploitation générale | `docs/RUNBOOK.md` |
| Rôles des machines et sessions | `docs/ROLES_MACHINES.md` |
| Sécurité et RGPD | `docs/securite_rgpd.md`, `docs/claude/REGLES_CRITIQUES.md` |
| Dossier RGPD de l'expérimentation | `docs/DOSSIER_RGPD.md` |
| Gouvernance questionnaires/scoring | `docs/gouvernance-questionnaires-scoring.md` |
| Feature flags | `docs/FEATURE_FLAGS.md` |
| Quality gate | `docs/QUALITY_GATE.md` |

## 12. Historique des chantiers techniques

L'historique des lots de migration et de reprise (R0→R10) ainsi que la dette
technique close est archivé dans `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md`.
