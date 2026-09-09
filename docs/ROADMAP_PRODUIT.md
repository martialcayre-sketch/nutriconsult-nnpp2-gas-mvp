# Feuille de route consolidée — WellNeuro NNPP2 — priorités produit
# Fichier de contexte pour agent de planification

> **Frontière avec `ROADMAP_TECHNIQUE.md`** (arbitrage du 2026-07-21, réserve R6
> de l'audit 5.0). **Aucun des deux fichiers n'est déprécié** : ils ne parlent
> pas de la même chose et ne se recouvrent pas.
>
> - **Ici** : les **priorités produit** — séries D, R et E, ce que l'application
>   doit savoir faire.
> - **Dans `ROADMAP_TECHNIQUE.md`** : l'**architecture technique système**
>   (cartographie de l'existant, depuis le 2026-08-03). L'historique de la
>   migration GAS → Next.js et des lots de reprise R0 → R10 (dette, build,
>   tests, fiabilisation) est archivé dans `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md`.
> - **Ni l'un ni l'autre ne fait foi sur l'état courant** : c'est
>   `docs/claude/PROJET_CONTEXTE.md`. L'exécution est pilotée par les campagnes
>   (`docs/claude/campagnes/`) et le registre de frontières.
>
> **Attention au préfixe `R`.** Il désigne **trois séries distinctes**, numérotées
> indépendamment : `R6` **produit** (ci-dessous, §4) = workflow RDV complet ;
> `R6` **technique** = stabilisation build/tests (historique dans
> `HISTORIQUE_CHANTIERS_TECHNIQUES.md`) ; `R6` **de l'audit 5.0** =
> double source roadmap, c'est-à-dire cette clarification même. **Toujours
> qualifier la série** — un `R6` nu est ambigu et doit être corrigé, pas deviné.
>
> ---
>
> Rédigé le 2026-07-04. Ce document consolide la roadmap produit complète
> (série D existante + modules R issus du brainstorm + séquencement E).
> Il complète `docs/claude/PROJET_CONTEXTE.md` qui fait foi pour
> l'architecture technique. En cas de conflit : PROJET_CONTEXTE.md gagne
> sur l'état courant, ce fichier gagne sur les priorités produit.
>
> **Révision 2026-07-04 (audit D1)** : ajustements de périmètre et garde-fous
> ajoutés en section 3 suite à un audit de la planification D1 (audit du plan
> uniquement — pas de relecture de code, ce fichier n'ayant pas accès au
> dépôt). Statuts des lots laissés à "À faire" faute de confirmation ; à
> corriger manuellement si certains lots ont déjà avancé.

---

## 1. État courant (acquis — ne pas replanifier)

- Migration GAS → Next.js **terminée** (lots 0, C2–C5, livrés au 2026-07-03).
- `app.wellneuro.fr` (Vercel) est l'unique point d'entrée production.
- Code GAS archivé dans `archive/gas-legacy/` — gelé, ne jamais modifier.
- Portail praticien (`/dashboard/*`) et portail patient permanent
  (`/portail/[token]`, flux principal) fonctionnels ; le flux
  `/patient/[idAssignation]` a été retiré le 2026-08-08 ; seule une redirection 307 subsiste.
- Synthèse IA (Anthropic SDK, prompt caching préparé) et envoi booklet livrés.
- 64 questionnaires portés avec moteur de scoring (`web/src/lib/questions.ts`).
- Pilotage opérationnel actif : architecture campagnes C0/C0-UX/C1…C5
  (`docs/claude/campagnes/README.md`, `docs/claude/campagnes/ACTIVE_CAMPAIGN.md`).

### Dette technique prioritaire (bloquante avant empilement de modules)

- **Décommission Sheets/OAuth** : terminée (2026-07-07) ; aucune route
  praticien n'appelle encore Google Sheets côté runtime.
- Pagination patients/assignations si volume > ~100 lignes.

---

## 2. Invariants non négociables (s'appliquent à TOUT lot)

- Aucun secret en dur ; variables d'environnement uniquement.
- Patients fictifs autorisés exclusivement : **Sophie Nicola, Jennifer
  Martin, Michel Dogné**. Aucune donnée patient réelle, jamais.
- Aucune modification de logique clinique / seuils de scoring sans demande
  explicite documentée dans `CHANGELOG.md`.
- Interface 100 % en français.
- Vocabulaire réglementaire : « recommandation », « protocole personnalisé »,
  « indice de suivi » — jamais « prescription », « ordonnance », « diagnostic ».
- Éviter par conception la qualification dispositif médical : finalité
  bien-être/suivi, validation praticien systématique de tout contenu
  généré par IA avant diffusion au patient.
- HDS obligatoire avant tout stockage de données de santé réelles
  (résultats biologiques notamment).
- Discipline de livraison : 1 tâche = 1 branche courte = 1 PR = 1 périmètre.
  Jamais de mélange design / clinique / IA / corpus / infra dans une même PR.
- Contrôles avant commit : `bash scripts/check_no_secrets.sh` et
  `cd web && npm run type-check`.

---

## 3. Série D1 — Design system (terminée le 2026-07-04)

Découpage en PR courtes déjà acté :

| Lot | Branche | Périmètre | Statut |
|---|---|---|---|
| D1-0 | `chore/d1-align-context` | Recaler la *documentation* (pas l'architecture, déjà à jour dans `PROJET_CONTEXTE.md` depuis le 2026-07-03) : référencer `ROADMAP_PRODUIT.md` dans l'index de `README.md`, et clarifier la relation avec `docs/ROADMAP_TECHNIQUE.md` (fusion ou dépréciation explicite de l'un des deux — éviter une double source de vérité sur la roadmap) | Fait |
| D1-1 | `feat/d1-design-tokens` | `tailwind.config.ts` + `globals.css` : variables CSS, thèmes praticien (dark) / patient (clair), fonts, couleurs, radius. Inclut le choix de contraste AA pour le dark mode praticien | Fait (PR #4) |
| D1-2a | `feat/d1-ui-components-base` | Créer `web/src/components/ui/` : Badge, MetricCard, PatientRow (composants sans dépendance graphique, risque faible) | Fait (PR #5) |
| D1-2b | `feat/d1-ui-components-score-viz` | ScoreGauge, ScoreRadar, ScoreBarChart, ScoreSparkline, ScoreThreshold. Librairie retenue le 2026-07-04 : **Recharts** (API JSX idiomatique, couvre Radar/Bar/Line(sparkline)/ReferenceLine(seuil) nativement, Gauge via `RadialBarChart`, bundle raisonnable, thème pilotable via nos tokens CSS en passant par la prop `style` plutôt que `fill`) | Fait (PR #9) |
| D1-3 | `feat/d1-practitioner-shell` | NavBar, layout dashboard, page login — dark mode praticien. Ne pas toucher la logique signOut | Fait (PR #6) |
| D1-4 | `feat/d1-dashboard-metrics` | MetricsSection → MetricCard, sans changer fetch ni messages d'erreur | Fait (PR #7) |
| D1-5 | `feat/d1-patients-panel-ui` | PatientsPanel : UI uniquement, logique intacte (composant à risque moyen). Vigilance : si `PatientRow` embarque un composant de score (D1-2b), vérifier l'absence de dégradation de perf sur une liste longue avant l'arrivée de la pagination (dette technique séparée) | Fait (PR #8) |
| D1-6 | `docs/d1-design-system-preview` | `docs/design-system-d1.md` | Fait (PR #10) |

Identité visuelle : deep teal + champagne gold, premium clinique,
scientifique mais accessible. Dark mode praticien, mode clair patient,
mobile first.

Interdits D1 : routes API, scoring, auth/session, `archive/gas-legacy/`,
theme-provider complexe, storybook, abstraction Radix massive, refonte
logique de PatientsPanel.

### Garde-fous transverses ajoutés (audit D1, 2026-07-04)

- **Accessibilité** : contraste AA sur le dark mode praticien ; les seuils
  cliniques (`ScoreThreshold` et équivalents) ne doivent jamais reposer
  uniquement sur la couleur (ajouter icône, motif ou libellé).
- **Definition of done par lot** : avant merge, capture d'écran des 3
  patients fictifs (Sophie Nicola, Jennifer Martin, Michel Dogné) dans le
  mode concerné (dark praticien / clair patient) + item ciblé ajouté à
  `docs/checklist_tests_end_to_end.md`.
- **Décision technique préalable à D1-2b** : choix de la librairie de
  visualisation de score à documenter avant l'ouverture de la branche,
  pour éviter que ce choix ne se fasse en cours de PR et n'en fasse
  déraper le périmètre. Tranché le 2026-07-04 : **Recharts** (cf. tableau
  ci-dessus).

---

## 4. Modules R — nouveaux périmètres produits

### R1 — Référentiel alimentaire Ciqual + mapping neuronutriments
- Ingestion one-shot table Ciqual ANSES (~3 200 aliments × ~60 constituants)
  dans PostgreSQL, tables read-only, mise à jour annuelle.
- Table de mapping propriétaire `nutriment → axe neuro SIIN`
  (ex. tryptophane/B6/magnésium → sérotonine ; tyrosine/fer → dopamine ;
  oméga-3/polyphénols → inflammation ; fibres fermentescibles →
  axe intestin-cerveau).
- Usage : cotation automatique des recettes/conseils par axe, suggestions
  alimentaires ciblées par profil patient, section « aliments prioritaires »
  du booklet.
- Risque faible, aucun enjeu RGPD, forte valeur différenciante.

### R2 — Bibliothèque de compléments « clean » (base DGCCRF / Compl'Alim)
- Source : open data des déclarations de compléments alimentaires.
- Couche de filtrage propriétaire avec critères qualité explicites :
  formes biodisponibles (bisglycinate vs oxyde, folates méthylés vs acide
  folique), absence d'additifs controversés, dosages cohérents SIIN.
- Chaque produit retenu = badge + fiche justificative.
- Le praticien compose ses recommandations depuis cette bibliothèque
  (alimente R4).
- Piste secondaire : scan code-barres patient via Open Food Facts.

### R3 — Fiches conseils & recettes
- Extension du corpus `patient/*` planifié, enrichie par R1 : valeurs
  nutritionnelles calculées via Ciqual + tags d'axes.
- Recettes filtrées selon le protocole en cours du patient (pas de PDF
  générique).

### R4 — Protocole builder (vocabulaire : « recommandations », jamais « prescription »)
- Constructeur structuré assemblant : compléments (R2, avec posologie/
  durée/moment de prise), axes alimentaires (R1), hygiène de vie (corpus),
  explorations biologiques suggérées (R5).
- Versionné, validé praticien, injecté automatiquement dans le booklet.
- À terme : signalement (jamais décision automatique) des interactions
  connues complément/médicament.

### R5 — Catalogue et packs d'analyses biologiques
- Référentiel de marqueurs de biologie fonctionnelle (homocystéine, vit. D,
  ferritine, zinc/cuivre, index oméga-3, CRP-us, cortisol salivaire, TSH…)
  organisé en packs par axe : fatigue/mitochondrie, stress/HPA, humeur,
  intestin.
- Formulation : « explorations à discuter avec le médecin traitant ».
- Phase catalogue : sans contrainte HDS. Phase résultats stockés :
  ~~**conditionnée à D6 (HDS)**~~ — **réconcilié le 2026-09-04** : la
  condition HDS est levée (annexe signée `D-121`, hébergement exclusif
  `D-080`/`D-120`) et l'étage 2 est **livré** derrière
  `WN_CB_RESULTS_ENABLED` (`D-122`, PR #838/#854). **Drapeau posé le
  2026-09-09** : l'étage 2 est ouvert en production. Il l'a été **avant** les
  mises à jour RGPD que ce paragraphe posait comme préalables — écart daté au
  dossier RGPD §2, comblé le jour même (rubrique 5 du registre, v6 du document
  patient), sans qu'aucune donnée ait été traitée entre-temps (0 ligne).
  Croisement questionnaires × biologie dans la
  synthèse IA = différenciant majeur — **entièrement à faire** : c'est la
  ré-alimentation du moteur par le mesuré, frontière fermée par `D-122`,
  entrée « à cadrer » de la file d'attente des campagnes.

### R6 — Workflow RDV complet (extension de D3)
- **Socle livré le 2026-07-23** (accueil-observatoire LOT-04) : modèle
  `RendezVous` minimal, agenda praticien (planifier / lister / annuler), et
  cartes « Pré-vol prêt » horodatées dans le Fil du jour (réutilisant le
  pré-vol SP-COP). Ni récurrence, ni notification, ni surface patient.
- **Reste à faire** : Cal.com + chaînage — réservation → assignation
  automatique des questionnaires 48 h avant → rappel → synthèse IA prête en
  consultation. C'est le chaînage (pas l'agenda seul) qui réalise l'objectif
  « zéro saisie » : ~1 h de préparation → < 5 min.

### R7 — Facturation et paiement
- Périmètre minimal : notes d'honoraires (mentions légales françaises),
  paiement Stripe optionnel, export CSV comptable.
- Module de confort, pas différenciant. Ne pas construire un logiciel de
  comptabilité.

### R8 — Authentification patient MyWellneuro

> Sigle partagé par erreur avec le R8 technique (filet de sécurité CI, sans
> rapport, livré 2026-07-11, archivé dans `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md`) :
> les deux roadmaps numérotent indépendamment. Ce R8-ci (produit) reste à
> faire ; campagne **IDP**.
- Prérequis de tout l'espace patient persistant (dashboard, carnet de bord,
  messagerie).
- Socle : **magic link email** ; surcouche : **passkeys (WebAuthn)**.
  Pas de mot de passe classique, pas de France Connect.
- Le lien non prédictible actuel reste valable pour le remplissage simple
  de questionnaire.

### R9 — Mon équilibre (indicateur patient / cartographie neuro-fonctionnelle praticien)

- 12 besoins fondamentaux répartis en 4 piliers (Nutritionnels, Somatiques,
  Sensoriels-émotionnels, Psychiques), regroupés en 3 strates pondérées
  pour le calcul et la visualisation : Corps 60 % (piliers 1+2), Ancrage
  20 % (pilier 3), Esprit 20 % (pilier 4). Équi-pondération à l'intérieur
  de chaque strate.
- Méthodologie de normalisation et de pondération **documentée et
  versionnée** (`versionScore`, analogue à `versionPrompt` : un v1 ne se
  compare pas à un v2).
- **Le score global n'est jamais une moyenne arithmétique.** Il est
  plafonné/modulé par les fondations critiques identifiées (sommeil
  effondré, carences objectivées, inflammation, instabilité glycémique,
  stress chronique, troubles digestifs). L'affichage privilégie toujours
  le profil par besoin aux creux mis en évidence plutôt qu'un chiffre
  unique sans contexte — jamais diagnostique (enjeu clinique ET
  réglementaire : éviter la qualification dispositif médical).
- Chaque donnée alimentant le score porte un **niveau de preuve** : A
  (questionnaires validés), B (référentiels neuronutrition), C (biologie
  fonctionnelle), D (hypothèses WellNeuro). Visible côté praticien.
- **Biomarqueurs réels hors périmètre V1** : le score est complet et
  livrable dès les questionnaires seuls, sans dépendance HDS/D6. Les
  biomarqueurs deviennent un mécanisme de raffinement ultérieur
  (T0 = questionnaires, T1 = ajustement biologique), pas un prérequis.
  Mécanisme de traçabilité T0/T1 à concevoir avant implémentation.
- **Suivi longitudinal (momentum)** : jalons T0/J21/J42/J90, traité comme
  objet à part entière du calcul, porteur de la dimension motivationnelle.
- Côté patient : un seul objet visuel synthétique sur l'écran d'accueil
  (indicateur circulaire "Mon équilibre"), aucune imagerie de dégradation
  (pas de rouge alarme, pas de noir/gris/fissures) — la progression est
  toujours montrée comme une construction. Écran détail séparé
  (`/patient/besoins`) avec visualisation des 12 besoins en sphères
  concentriques organiques, accessible depuis l'accueil, jamais imposé par
  défaut.
- Côté praticien : dashboard dense thème sombre, 5 objets cliniques
  (indice global, stabilité métabolique, réserve d'adaptation, clarté,
  momentum) et priorités des 21 prochains jours sourcées avec leurs
  niveaux de preuve.
- Contexte détaillé et arbitrages produit complets :
  `docs/claude/MON_EQUILIBRE_CONTEXTE.md`.

---

## 5. Expérience patient — principes de conception (transverse D2/E4)

- Triptyque sérieux / ludique / rassurant :
  - sérieux dans le **fond** (données réelles, vocabulaire exact expliqué,
    sourcé SIIN) ;
  - ludique dans la **forme uniquement** (micro-interactions, célébration
    des progrès) — jamais dans le contenu clinique ;
  - rassurant = prévisibilité + contexte : **jamais un score seul sans
    interprétation** qui l'accompagne.
- Hiérarchie d'information en 3 couches sur chaque écran patient :
  visuel synthétique → phrase d'interprétation en langage patient →
  détail clinique accessible en un clic.
- Deux régimes de contenu à ne jamais mélanger :
  1. contenu statique validé (fiches corpus `patient/*`) → affichable sans
     IA à l'exécution ;
  2. contenu généré par IA → validation praticien obligatoire avant
     diffusion.
- Pont praticien-patient : badge « validé par votre praticien » sur
  synthèse et protocole ; note courte praticien visible sur le dashboard
  (préfiguration légère de la messagerie D5, sans la remplacer).
- Outils de suivi : frise longitudinale par axe, radar interactif cliquable
  vers fiches corpus, carnet de bord quotidien < 15 s (2-3 questions),
  check-list de protocole 21 j avec progression visuelle sans points/niveaux.
- Coaching V1 réaliste : tips quotidiens issus des fiches corpus liées au
  protocole + check-in hebdomadaire structuré avec alerte praticien si
  dégradation. Le chatbot conversationnel complet (ancré au protocole
  validé, jamais générique) reste une étape ultérieure distincte.

---

## 6. Séquencement consolidé (série E)

> **Révision 2026-07-15** : la séquence opérationnelle est désormais portée
> par le programme de campagnes
> [`docs/claude/campagnes/PROGRAMME_WELLNEURO_5_0.md`](claude/campagnes/PROGRAMME_WELLNEURO_5_0.md)
> (disposition « la Spirale », décision A6 au registre des frontières).
> Correspondances : E3 (auth patient R8) = campagne **IDP** ; E4 (dashboard
> patient) ≈ **SP-SPI** (+ JA) ; E6 (protocole builder) alimenté par C4/C5 et
> consommé par **SP-COP** ; E8 (biologie réelle) = Phase C, toujours
> conditionnée à D6 (HDS). E5 (workflow RDV) reste un module futur du Fil du
> jour. Les tableaux ci-dessous restent valables comme description des
> périmètres, plus comme ordre d'exécution.

Chaque lot E se découpe ensuite en branches courtes selon le schéma D1.

### Court terme
| Lot | Contenu | Dépendances |
|---|---|---|
| Série D1 | Design system (7 PR ci-dessus) | **Fait** (PR #4 à #10, 2026-07-04) |
| **E0** | Bascule Sheets → PostgreSQL exclusif (dette technique) | — ; prioritaire avant empilement |
| **E1** | Référentiels de données : ingestion Ciqual + mapping neuronutriments + squelette bibliothèque compléments (R1 + socle R2) | Aucune ; parallélisable avec D1 (ne touche ni UI ni routes existantes) |

### Moyen terme
| Lot | Contenu | Dépendances |
|---|---|---|
| **E2** | Mon équilibre v1 (R9) : méthodologie, 12 besoins/3 strates, versionnage | Questionnaires existants |
| **E3** | Auth patient MyWellneuro (R8) : magic link + passkeys | — |
| **E4** | Dashboard patient v1 (absorbe D2) : écran Mon équilibre (orb + détail 12 besoins), timeline, fiches corpus, recettes filtrées (R3), carnet de bord | E2 + E3 + E1 |
| **E5** | Workflow RDV complet (absorbe D3 + R6) : Cal.com + assignation auto pré-consultation | — |
| **E6** | Protocole builder (R4) | E1 (référentiels) ; alimente le booklet |

### Long terme
| Lot | Contenu | Dépendances |
|---|---|---|
| **E7** | Facturation / paiement (R7) | E5 souhaitable |
| **E8** | Packs biologiques avec résultats patients stockés (R5 complet) | ~~**D6 HDS obligatoire**~~ HDS acquis (`D-121`) ; socle livré éteint (`D-122`, 2026-09-03) — restent la levée du drapeau (préalables RGPD) et la ré-alimentation du moteur (décision propre) |
| D6 | Hébergement HDS + éventuel multi-praticien | — |
| D5 | Messagerie sécurisée praticien ↔ patient | E3 ; HDS recommandé |
| D4/D7 | Corpus SIIN complet + synthèse longitudinale + RAG pgvector + suggestions de protocoles | Corpus structuré (stratégie NotebookLM → .md → pgvector actée) |
| — | Zéro saisie avancée (OCR, vocal, import mail), coaching conversationnel, réseau partenaires, wearables | Selon maturité |

### Logique de dépendances (résumé)
Les référentiels (E1) nourrissent le score (E2) et le protocole (E6) ;
l'auth (E3) débloque le dashboard (E4) ; l'HDS (D6) conditionne la
biologie réelle (E8) et la messagerie (D5) — pour E8, cette condition est
satisfaite depuis le 2026-09-01 (`D-120`/`D-121`) et le socle est livré
(`D-122`).

---

## 7. Stratégie corpus SIIN (rappel, actée)

- NotebookLM sert à comprendre. Markdown sert à valider. GitHub sert à
  versionner. Claude sert à générer. Le praticien sert à autoriser.
  Le RAG servira à retrouver dynamiquement.
- Arborescence `corpus/` définie (axes, questionnaires, protocoles 21 j,
  fiches patient, références, templates). Démarrage : 8 fiches à haute
  valeur.
- Fine-tuning : non recommandé à ce stade.
- Risques suivis : double vérité NotebookLM/GitHub, injection trop large
  dans les prompts, RAG prématuré, absence de validation praticien.

---

## 8. Consignes pour l'agent de plan

1. Ne jamais proposer un plan qui mélange plusieurs lots D/E dans une même
   branche ou PR.
2. Avant tout plan touchant les routes praticien : vérifier la double
   source Sheets + PostgreSQL (section 1).
3. Tout plan impliquant des données de santé réelles ou des résultats
   biologiques stockés doit expliciter la dépendance HDS (D6).
4. Tout plan touchant au contenu clinique (scoring, seuils, corpus,
   prompts de synthèse) doit prévoir la validation praticien et la trace
   dans `CHANGELOG.md`, ainsi que le versionnage (`versionPrompt`,
   `versionScore`).
5. Prompt système IA : respecter les règles de prompt caching
   (`docs/claude/PROMPT_CACHING.md`) — contenu stable dans le système,
   contenu volatile dans le message utilisateur, bump de version à chaque
   modification.
6. Par défaut : exploration et discussion, pas de génération de code sans
   demande explicite.
7. Vocabulaire : recommandations, protocole, indice de suivi. Interdits :
   prescription, ordonnance, diagnostic.
