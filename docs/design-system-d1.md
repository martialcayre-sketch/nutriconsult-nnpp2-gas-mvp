# Design system D1 — Wellneuro NNPP2

Référence des tokens et composants livrés par la série D1
(`docs/claude/ROADMAP_AGENT_PLAN.md`, section 3). Complète
`docs/claude/PROJET_CONTEXTE.md` (qui fait foi sur l'état technique
courant) — ce document se concentre sur le design system lui-même.

Identité visuelle **d'origine D1** : deep teal + champagne gold. **Caduque
depuis A5-R1** (2026-07-15) — palette en vigueur : indigo/forêt + solaire/cuivre
(§8, « tokens v2 »), avec le canvas mid-tone A5-R2 appliqué au lot Vague 1 (§9).
Le parti pris reste premium clinique,
scientifique mais accessible. Deux thèmes fixes selon le rôle (pas de
préférence utilisateur togglable), **tous deux clairs** depuis la décision
Hybrid Clinical Foundation du 2026-07-12 (abandon du mode Nuit/Auto) : seule
la navigation praticien (rail desktop, barre basse mobile, tiroir tablette)
reste structurellement sombre, via un jeu de tokens dédié (`--rail-*`,
section 1bis) indépendant de `data-theme`. Mobile first.

## 1. Tokens (`web/tailwind.config.ts` + `web/src/app/globals.css`)

### Palette de marque

| Token CSS | Valeur | Usage |
|---|---|---|
| `--teal-950` | `#0b2027` | Fond praticien (sombre) |
| `--teal-900` | `#102e33` | Surface praticien (cartes) |
| `--teal-700` | `#1f5e5b` | Couleur primaire (les deux thèmes) |
| `--teal-500` | `#2f8481` | Nuance teal intermédiaire |
| `--teal-200` | `#a8bfc2` | Texte atténué praticien |
| `--gold-600` | `#b8923e` | Accent patient (clair) |
| `--gold-500` | `#c9a24b` | Accent praticien (sombre) |
| `--gold-300` | `#e3cd8f` | Nuance or claire |
| `--cream-100` | `#fbf9f5` | Fond patient (clair) |
| `--cream-50` | `#f4efe6` | Texte praticien (sombre) |

### Tokens sémantiques (consommés via classes Tailwind)

`background`, `foreground`, `surface`/`surface-foreground`,
`muted`/`muted-foreground`, `border`, `primary`/`primary-foreground`,
`accent`/`accent-foreground` — définis par thème (voir section 2),
utilisables directement : `bg-background`, `text-foreground`,
`bg-surface`, `border-border`, `bg-primary text-primary-foreground`, etc.

**Important — collision évitée avec les tokens historiques** : les
variables CSS `--primary`/`--accent` existaient depuis le Lot 0. Vérifié
lors de la revue HC-F LOT-01 (2026-07-12) : plus aucun composant ne les
consomme (tous les consommateurs historiques, dont `SynthesePanel.tsx`,
sont déjà migrés vers les tokens sémantiques) — corrige une inexactitude
propagée depuis l'audit LOT-00 qui affirmait `SynthesePanel.tsx` non
migré. Les nouveaux tokens sémantiques gardent néanmoins un espace de
noms distinct (`--color-primary`, `--color-accent`, etc.) par prudence.
Ne pas fusionner ces deux espaces de noms sans nouvelle vérification.

### Rail de navigation (tokens fixes, HC-F LOT-01)

Depuis la décision « tout clair, rail sombre structurel », la navigation
praticien (`SidebarRail.tsx`, `MobileBottomNav.tsx`, et les enveloppes
aside/tiroir de `NavBar.tsx`) ne suit plus `data-theme` : elle consomme un
namespace dédié, toujours sombre, défini sous `[data-theme='praticien']`
dans `globals.css` :

| Token CSS | Valeur | Équivalent |
|---|---|---|
| `--rail-background` | `var(--teal-950)` | ex-`--background` praticien |
| `--rail-surface` | `var(--teal-900)` | ex-`--surface` praticien |
| `--rail-foreground` | `var(--cream-50)` | ex-`--foreground` praticien |
| `--rail-muted` | `#16383d` | ex-`--muted` praticien — badge d'icône inactif, distinct de `--rail-surface` (conteneur) |
| `--rail-muted-foreground` | `var(--teal-200)` | ex-`--muted-foreground` praticien |
| `--rail-border` | `#24444a` | ex-`--border` praticien |
| `--rail-primary` (+ `-rgb`) | `var(--teal-700)` | ex-`--color-primary` praticien |
| `--rail-primary-foreground` | `var(--cream-50)` | ex-`--color-primary-foreground` praticien |
| `--rail-accent` / `--rail-focus-ring` | `var(--gold-500)` | ex-`--color-accent`/`--color-focus-ring` praticien |

Ces valeurs sont une reprise à l'identique de l'ancien thème praticien
sombre — leur contraste AA/AAA était déjà vérifié (cf. tableau de
contraste, section 2) et n'a pas été recalculé, seulement re-scopé.
Classes Tailwind : `bg-rail`, `bg-rail-surface`, `bg-rail-muted`,
`text-rail-foreground`, `text-rail-muted-foreground`, `border-rail-border`,
`bg-rail-primary` (+ `/10` etc.), `text-rail-primary-foreground`,
`text-rail-accent`, `ring-rail-focus-ring`.

**Ne pas confondre `bg-rail-surface` (conteneur : aside, barre basse,
tiroir/sheet) et `bg-rail-muted` (badge d'icône inactif à l'intérieur de
ce conteneur)** — utiliser le même token pour les deux rend le badge
invisible sur son fond.

**Le header praticien (logo, recherche, notifications, profil) n'utilise
pas ces tokens** — il reste sur les tokens sémantiques ambiants
(`bg-surface`, `text-foreground`, etc.), désormais clairs comme le reste
de l'espace de travail.

### Typographie

**Caduque depuis A5-R1** — Inter/Lora ont été remplacées par les cinq
familles « la Spirale » attribuées par thème (praticien : Sora/Instrument
Sans ; patient : Bricolage Grotesque/Albert Sans ; mono partagée IBM Plex
Mono), voir §8. L'échelle de tailles est définie en §10 (socle 5.0).

Chargées dans `web/src/app/layout.tsx` (racine), disponibles partout.

### Radius

`rounded-sm` / `rounded` (`DEFAULT`) / `rounded-lg` → `--radius-sm` /
`--radius` / `--radius-lg`. Valeurs d'origine D1 (0.5/0.75/1 rem)
**remplacées au socle 5.0** par 10/14/18 px, voir §10.

## 2. Thèmes

Activés via l'attribut `data-theme` posé sur un conteneur racine — pas
de contexte JS, pas de `next-themes`, pas de toggle (interdit D1) : le
thème est fixe selon le rôle, pas une préférence utilisateur. Depuis
HC-F LOT-01, `praticien` et `patient` partagent **les mêmes valeurs de
tokens sémantiques** (simplification délibérée, contraste déjà vérifié
pour l'un vaut pour l'autre) ; seule la présence du rail de navigation
(section 1, tokens `--rail-*`) distingue visuellement les deux rôles.

| Thème | Sélecteur | Où il est posé |
|---|---|---|
| **Patient** (clair, défaut) | `:root`, `[data-theme="patient"]` | Défaut implicite — `web/src/app/patient/**` n'a pas encore besoin de le poser explicitement |
| **Praticien** (clair, rail de navigation sombre structurel via tokens `--rail-*` dédiés) | `[data-theme="praticien"]` | `web/src/app/dashboard/layout.tsx` (conteneur racine du shell), `web/src/app/login/page.tsx` (les deux états, chargement et principal) |

Contrastes vérifiés (WCAG, ratio de luminance relative) :

| Paire | Thème | Ratio | Seuil AA |
|---|---|---|---|
| `foreground` / `background` | praticien et patient (valeurs partagées) | ~12.9:1 | ✅ (texte normal 4.5:1) |
| `muted-foreground` / `background` | praticien et patient | ~4.6:1 (`#4a6367` / `#fbf9f5`) | ✅ |
| `accent` (texte) / `surface` | praticien et patient | ~4.65:1 | ✅ (limite) |
| `rail-foreground` / `rail-background` | rail (les deux rôles) | ~14.6:1 | ✅ — reprise à l'identique de l'ancien praticien sombre |
| `rail-muted-foreground` / `rail-background` | rail | ~8.7:1 | ✅ |
| `rail-accent` (texte) / `rail-surface` | rail | ~6-7:1 | ✅ |
| `primary` (texte) / `surface` ou `background` | praticien et patient | ~1.9-2.3:1 | ❌ — **ne jamais utiliser `text-primary` comme texte sur fond clair** ; `primary` n'est conçu que pour un fond de bouton (`bg-primary` + `text-primary-foreground`) |

## 3. Composants (`web/src/components/ui/`)

### Badge

```tsx
<Badge variant="neutral | success | warning | danger">Texte</Badge>
```

Variantes câblées sur les tokens (`neutral` = `bg-muted text-muted-foreground`,
les autres sur des couleurs Tailwind standard auto-contenues). Utilisé
par `NavBar` (tag « Espace praticien »), `PatientsPanel` (`StatusBadge`,
statut actif).

### MetricCard / MetricCardSkeleton

```tsx
<MetricCard label="Patients" value={12} sub="7 jours" />
<MetricCardSkeleton />
```

Utilisé par `MetricsSection`.

### PatientRow

```tsx
<PatientRow
  patient={{ idPatient, prenom, nom, email, telephone, actif: 'OUI' | 'NON' }}
  onEdit={...} onToggleResultats={...} resultatsOuverts={boolean}
  onDelete={...} confirmationSuppression={boolean}
  onDemanderSuppression={...} onAnnulerSuppression={...}
  suppressionEnCours={boolean}
/>
```

`<tr>` autonome (à utiliser dans un `<table>`), état piloté entièrement
par le parent (`PatientsPanel`) via props/callbacks — pas de logique
interne. Liens d'action en `text-muted-foreground`/`text-accent`
(actif)/`text-red-400` (suppression), calibrés pour rester AA sur fond
sombre (seul contexte d'usage réel à ce jour).

### Composants de score (Recharts, D1-2b)

Librairie retenue le 2026-07-04 : **Recharts** (voir
`ROADMAP_AGENT_PLAN.md`, section 3). Toutes les couleurs sont passées
via les tokens CSS (`fill="var(--color-primary)"`, etc.) — fonctionne
directement dans les attributs SVG, aucune résolution JS nécessaire.

```tsx
<ScoreGauge value={72} max={100} label="Mon équilibre" zoneLabel="Bon niveau" />

<ScoreRadar data={[{ axe: 'Sommeil', value: 72 }, ...]} max={100} />

<ScoreBarChart data={[{ label: 'Sophie Nicola', value: 72 }, ...]} max={100} />

<ScoreSparkline data={[{ value: 40 }, { value: 52 }, ...]} />

<ScoreThreshold value={55} max={100} zoneLabel="Attention" variant="warning" />
```

**Garde-fou d'accessibilité (obligatoire pour tout usage futur)** : un
seuil ou une zone clinique ne doit jamais être signalé par la seule
couleur. `ScoreThreshold` et `ScoreGauge` affichent toujours la valeur
numérique et/ou un libellé de zone en texte à côté de la couleur —
respecter ce principe dans toute nouvelle variante.

Ces 5 composants ne sont pas encore branchés dans une page réelle (pas
de score calculé en production à ce stade — l'indicateur "Mon équilibre"
est prévu en E2 du séquencement produit, cf. `docs/claude/MON_EQUILIBRE_CONTEXTE.md`) :
lot purement additif, vérifié uniquement via une page de démo locale (non
committée) dans les deux thèmes.

## 4. État d'intégration réelle (pages migrées)

| Page / composant | Thème appliqué | Lot |
|---|---|---|
| `web/src/components/NavBar.tsx` (header hors rail) | praticien (clair) | D1-3, re-thémé clair par HC-F LOT-01 |
| `web/src/components/ui/SidebarRail.tsx`, `web/src/components/ui/MobileBottomNav.tsx`, aside/tiroir de `NavBar.tsx` | rail (sombre structurel, tokens `--rail-*` dédiés) ; icônes Lucide + overlays Radix Dialog depuis LOT-02 | HC-F LOT-01, LOT-02 |
| `web/src/app/dashboard/layout.tsx` | praticien (clair) | D1-3, re-thémé clair par HC-F LOT-01 |
| `web/src/app/login/page.tsx` | praticien (clair) | D1-3, re-thémé clair par HC-F LOT-01 |
| `web/src/app/dashboard/page.tsx` (titre + feuille de route) | praticien (clair) | D1-3 (élargi après détection d'un défaut de contraste), re-thémé clair par HC-F LOT-01 |
| `web/src/components/MetricsSection.tsx` | praticien (clair) | D1-4, re-thémé clair par HC-F LOT-01 |
| `web/src/components/PatientsPanel.tsx` | praticien (clair) | D1-5, re-thémé clair par HC-F LOT-01 |
| `web/src/app/dashboard/patients/page.tsx`, `.../synthese/page.tsx` (titres) | praticien (clair) | D1-5 (même correctif de contraste que D1-3), re-thémé clair par HC-F LOT-01 |
| `web/src/components/SynthesePanel.tsx` | praticien (clair) | Vérifié lors de la revue HC-F LOT-01 : consomme exclusivement des tokens sémantiques D1 (`bg-surface`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-accent`, `bg-muted`), aucune référence à `var(--primary)`/`var(--accent)` legacy — hérite du praticien clair comme les autres composants migrés, sans action requise. Corrige une inexactitude de l'audit initial LOT-00 (`AUDIT_UI_REEL.md`) |
| `web/src/app/patient/**` | patient (clair, implicite) | Aucun changement requis (thème par défaut) |

### Shell praticien C0-UX / LOT-02

> **Note HC-F LOT-01** : description historique, valable au moment de
> C0-UX. Depuis HC-F LOT-01, le header décrit ci-dessous reste sur ces
> tokens (désormais clairs) mais le rail/les cartes de navigation sont
> passés sur le namespace `--rail-*` dédié (section 1, « Rail de
> navigation ») pour rester sombres — voir section 4 pour le détail par
> fichier.

Le shell praticien réorganisé dans `web/src/components/NavBar.tsx` et
`web/src/app/dashboard/layout.tsx` réutilise uniquement les tokens D1
existants et leurs combinaisons de surface:

- `bg-background` pour le conteneur racine du thème praticien;
- `bg-surface` et `bg-surface/95` pour l'enveloppe du header;
- `border-border` pour les séparateurs et contours du header;
- `bg-primary/10`, `text-primary` et `text-primary-foreground` pour les repères actifs du header;
- `text-muted-foreground` pour les libellés secondaires;
- `Badge` pour les états, les repères de build et les raccourcis non cliniques.

Le lot actuel reste volontairement sans nouvelle primitive UI: la navigation
desktop/tablette repose sur le header de commande, le rail gauche compact et des
liens `Link` standards, afin de conserver une base simple pour le futur lot mobile.

### Navigation mobile C0-UX / LOT-03

> **Note HC-F LOT-01** : description historique. `MobileBottomNav.tsx` est
> passé sur le namespace `--rail-*` (barre basse et bottom sheet incluses)
> — voir section 1 « Rail de navigation » et section 4.

`web/src/components/ui/MobileBottomNav.tsx` (barre basse + bottom sheet « Plus »,
visible uniquement `<768px`) réutilisait exclusivement les tokens déjà listés
ci-dessus: `bg-surface/95` et le halo `backdrop-blur` du header pour la barre,
`bg-surface-elevated` pour le panneau de la sheet (même traitement que le
panneau ☰ tablette et le menu profil), `bg-primary`/`text-primary-foreground`
pour l'état actif, `text-muted-foreground` pour l'inactif, et
`focus-visible:ring-focus-ring` sur chaque élément interactif. Le panneau ☰
tablette existant (768–1024px) n'avait pas été retouché par ce lot.

### Shell premium praticien — HC-F LOT-02

**Lucide React** et **`@radix-ui/react-dialog`** adoptés (première
utilisation réelle des autorisations de la section 5).

- Icônes : les abréviations texte (`AC`/`PT`/`SY`/`PM`) et emojis (`☰`,
  `🔔`, `▾`, `‹›`, `✕`, `•••`) sont remplacés par des icônes Lucide
  (`LayoutDashboard`, `Users`, `Sparkles`, `Settings`, `Menu`,
  `ChevronDown`, `PanelLeftClose`/`PanelLeftOpen`, `X`, `MoreHorizontal`),
  taille 20–21px, `strokeWidth={2}` uniforme. Zone d'icône du rail
  harmonisée à 44×44px (`h-11 w-11`, était `h-10 w-10`).
- Recherche et cloche de notification retirées du header (affordances non
  fonctionnelles, aucune route/API correspondante — interdit explicite du
  lot plutôt que de les simuler).
- Carte « Patients de démonstration » retirée du rail étendu (interdit
  explicite : pas de patients de démo dans le rail permanent).
- Tiroir tablette (`NavBar.tsx`) et bottom sheet mobile
  (`MobileBottomNav.tsx`) reconstruits sur `Dialog.Root`/`Dialog.Portal`/
  `Dialog.Content` de Radix au lieu d'overlays faits main : focus trap
  complet, fermeture Escape, retour de focus au déclencheur et
  `aria-modal` obtenus nativement. Corrige une vraie lacune du tiroir
  tablette (qui n'avait ni Escape, ni focus trap, ni retour de focus
  avant ce lot).

**Piège à connaître pour toute future primitive Radix portée par ce
shell** : `Dialog.Portal` (comme tout portail Radix) rend son contenu
dans `document.body` par défaut, **hors** du conteneur
`[data-theme="praticien"]` posé par `dashboard/layout.tsx`. Les tokens
`--rail-*` sont scopés uniquement à ce sélecteur (contrairement à
`--foreground` et consorts, également définis sur `:root` — ceux-là
restent donc résolus même hors du conteneur) et ne résolvent à rien pour
un contenu porté ailleurs dans le DOM (fond transparent, contenu de la
page visible au travers). **Solution
appliquée** : poser `data-theme="praticien"` directement sur
`Dialog.Overlay` et `Dialog.Content` (l'attribut sur l'élément lui-même
suffit, le sélecteur CSS n'exige pas un ancêtre). À reproduire pour
toute nouvelle primitive portée (dropdown, tooltip, alert dialog…) tant
que les tokens restent scopés par attribut plutôt que globaux.

Palette de commandes : confirmée différée (arbitrage LOT-00), non
livrée dans ce lot.

## 4bis. Mécanismes transverses (HC-F LOT-03, canonisés en LOT-05)

Trois mécanismes livrés **vides** (aucun contenu clinique — HC-F ne conçoit
aucun contenu clinique, cf. `CAMPAGNE.md`) avec un contrat d'instanciation
stable. Contrats validés par l'utilisateur le 2026-07-13 dans le cadrage de
LOT-03 (`docs/claude/campagnes/2026-07-12-hybrid-clinical-experience-questionnaires/CONTRATS_UX_P1.md`,
source détaillée conservée pour l'historique de décision) ; cette section
en est la version canonique et à jour.

### `ModeConsultation` (`web/src/components/ui/ModeConsultation.tsx`)

```ts
type ConsultationModeProps = {
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode; // contenu instancié fourni par l'appelant (C1)
};
```

Instancié dans `dashboard/patients/[idPatient]` (`FichePatientPanel.tsx`) :
déclenché par un bouton dans la ligne d'en-tête existante ; l'état
`active`/`onToggle` vit dans le composant appelant, pas dans le mécanisme.

### Double niveau de lecture (`web/src/components/ui/TwoLevelReading.tsx`)

```ts
type TwoLevelReadingProps = {
  summary: React.ReactNode;
  detail: React.ReactNode;
  defaultExpanded?: boolean;
  label: string; // libellé accessible du contrôle d'expansion
};
```

Mécanisme générique (résumé visible par défaut, détail sur demande),
réutilisable pour tout contenu futur sans connaître son contenu clinique.
Pas de page d'instanciation HC-F propre — à instancier par C1 avec un
contenu factice neutre pour tout test isolé.

### `PatientPreview` (`web/src/components/PatientPreview.tsx`)

```ts
type PatientPreviewProps = {
  patientId: string;
  assignationId: string;
  // Rend ConsultationScreen.tsx en lecture seule via une route dédiée,
  // avec les mêmes garde-fous patient-safe que le portail réel.
};
```

Réutilise **les mêmes composants/tokens** que le portail patient réel
(`ConsultationScreen.tsx`) pour que « Voir ce que recevra le patient » ne
soit jamais un rendu divergent. S'appuie sur une route praticien-authentifiée
dédiée (`api/praticien/apercu-patient/reponses`, gate `getServerSession`,
même `select` Prisma patient-safe que `api/patient/reponses`) plutôt que de
modifier les routes `api/patient/*` existantes. Deux props additifs sur
`ConsultationScreen.tsx` (`fetchUrl`, `readOnlyPreview`) — comportement
portail réel strictement inchangé par défaut. Instancié dans
`dashboard/patients/[idPatient]` (bouton « Voir ce que recevra le patient »,
`FichePatientPanel.tsx`). Toute divergence entre la prévisualisation et le
portail réel doit être documentée et testée (garde-fou `CAMPAGNE.md` LOT-04).
`MonEquilibreAccueil/Detail` a le même problème d'auto-fetch patient-only et
n'est pas traité par ce mécanisme (classé Vague 2, cf.
`MATRICE_ECRANS_MIGRATION.md`).

## 5. Interdits et autorisations (amendé le 2026-07-12, direction Hybrid Clinical)

**Autorisés depuis le 2026-07-12** (levée d'interdits actée, cf.
`docs/claude/REGISTRE_FRONTIERES.md` §A5) :

- primitives **Radix UI / shadcn/ui sélectionnées**, uniquement pour les
  comportements complexes accessibles : dialog, alert dialog, sheet,
  dropdown, tabs, tooltip, command palette — jamais d'abstraction massive ni
  d'esthétique de bibliothèque importée telle quelle ; **`@radix-ui/react-dialog`
  adopté en HC-F LOT-02** (tiroir tablette, sheet mobile — section 4) ;
- **Lucide React** pour les icônes ; **adopté en HC-F LOT-02** (section 4) ;
- **Motion**, uniquement lorsqu'une transition explique un changement d'état
  ou de structure.

**Sans objet depuis la décision « tout en mode clair »** : theme-provider /
contexte JS de thème, `next-themes`, toggle utilisateur de thème. Le thème
est structurel (`data-theme="praticien|patient"`, tous deux clairs, rail
praticien sombre structurel) — il n'existe aucun mode utilisateur.

**Restent interdits** : Storybook, WebGL, migration de framework, refonte de
la logique de `PatientsPanel`, données patient réelles, secrets en dur.

## 6. Réconciliation tokens UX 3.0 (LOT-01, campagne C0-UX)

Comparaison des tokens sémantiques proposés en §11.1 de
`docs/claude/campagnes/2026-07-11-refonte-ux-shell-3-0/sources/UX_WELLNEURO_3_0.md` avec les
tokens réellement livrés par D1. Règle appliquée : réutiliser le nom D1 existant quand un
équivalent fonctionnel existe déjà, ajout **additif** uniquement pour les écarts réels, jamais de
renommage ni de suppression d'un token existant.

| Proposé (§11.1) | Existant D1 | Décision |
|---|---|---|
| `surface-app` | `background` | Conservé tel quel — pas d'ajout. |
| `surface-panel` | `surface` | Conservé tel quel — pas d'ajout. |
| `surface-elevated` | aucun | **Ajouté** : `--color-surface-elevated` / `bg-surface-elevated`. En thème patient, identique au blanc de `surface` (l'élévation y est portée par l'ombre/la bordure, pas la couleur) ; en thème praticien, plus clair que `surface` (`--teal-900`). |
| `surface-patient` | aucun | **Non ajouté** — redondant avec l'architecture par thème (`[data-theme="patient"]` joue déjà ce rôle via `surface`). Un token dédié dupliquerait la logique de thème existante. |
| `text-primary` | `foreground` | Conservé tel quel — pas d'ajout. |
| `text-secondary` | aucun exact | **Non ajouté** dans ce lot, faute de consommateur identifié (D1 n'a qu'un seul niveau de texte atténué, `muted-foreground`). À réévaluer si LOT-02/03 de C0-UX en démontre un besoin réel. |
| `text-muted` | `muted-foreground` | Conservé tel quel — pas d'ajout. |
| `accent-primary` | `color-primary` | Conservé tel quel — pas d'ajout. |
| `accent-secondary` | `color-accent` | Conservé tel quel — pas d'ajout. |
| `status-success` / `-warning` / `-danger` / `-info` | aucun (Badge utilise des couleurs Tailwind auto-contenues) | **Ajoutés** : `--color-status-success/warning/danger/info` / `text-status-*`, `bg-status-*`, calibrés AA par thème. Non câblés dans `Badge.tsx` dans ce lot (hors périmètre LOT-01). |
| `border-subtle` | `border` | Conservé tel quel — pas d'ajout. |
| `focus-ring` | aucun | **Ajouté** : `--color-focus-ring` / `ring-focus`, `text-focus-ring`… (`--teal-700` en thème patient, `--gold-500` en thème praticien) — nécessaire aux garde-fous accessibilité (focus clavier) de C0-UX. |

Garde-fou vérifié : `--primary`/`--accent` historiques (consommés en dur par `SynthesePanel.tsx`,
non migré) ne sont pas affectés par cet ajout — espace de noms `--color-*` toujours distinct.

## 7. Traçabilité

| Lot | PR |
|---|---|
| D1-0 | (docs, sans PR dédiée — commit direct) |
| D1-1 | #4 |
| D1-2a | #5 |
| D1-3 | #6 |
| D1-4 | #7 |
| D1-5 | #8 |
| D1-2b | #9 |
| D1-6 | (ce document) |
| HC-F LOT-00 (audit et arbitrages) | #34 |
| HC-F LOT-01 (tokens clairs, rail sombre structurel) | #35 |
| HC-F LOT-02 (shell premium, Lucide, Radix Dialog) | #37 |
| HC-F LOT-03 (surfaces génériques, 3 mécanismes transverses) | #40 |
| HC-F LOT-04 (portail patient clair) | #42 |
| HC-F LOT-05 (gouvernance et handoff — section 4bis canonisée) | #43 |

## 8. Tokens v2 — « la Spirale » (révision A5-R1, 2026-07-15)

Adoption de la direction artistique issue du brainstorming 5.0
(`docs/claude/propositions/2026-07-15-wellneuro-5-0-spirale/`). La
**structure A5 est conservée** (tout clair, rail sombre signature côté
praticien, patient clair fixe, aucun toggle) ; seules les teintes et les
typographies évoluent. Déploiement séquencé : lot praticien, puis lot
patient, puis lot dataviz — chaque lot réversible par revert.

### Correspondance des tokens (ancien → nouveau)

| Rôle | Ancien | Praticien « Nuit spectrale » | Patient « Forêt & cuivre » |
|---|---|---|---|
| `--background` | cream-100 `#fbf9f5` | `#F7F8FA` | `#FAF8F3` |
| `--foreground` | `#16323a` | `#1B2337` | `#2B2115` |
| `--surface` | `#ffffff` | `#ffffff` | `#FFFDF9` |
| `--muted` / `--muted-foreground` | `#e7eeee` / `#4a6367` | `#E9EBF2` / `#535D7A` | `#EFE8DA` / `#6E5F49` |
| `--border` | `#d8e2e1` | `#DDE1EC` | `#E5DCCB` |
| `--color-primary` | teal-700 `#1f5e5b` | indigo `#3D4A9E` | forêt `#1E6F54` |
| `--color-accent` | gold-600 `#b8923e` | solaire `#E8A33D` (texte : `--solar-ink #8A5B10`) | cuivre `#B25E38` (texte : `--copper-ink #8F4526`) |
| `--rail-background` / `--rail-surface` | teal-950/900 | night `#151C38` / `#1B2342` (dégradé vers `#10162B`) | — (pas de rail) |
| `--rail-accent` | gold-500 | solaire `#E8A33D` | — |
| Statuts / focus | inchangés | inchangés (focus → primaire du thème) | inchangés (focus → forêt) |
| `--viz-corps/ancrage/esprit` | teal-500 / violet-600 / gold-500 | menthe `#0D9488` / indigo `#3D4A9E` / solaire `#E8A33D` (fixes, indépendants des thèmes) | idem |

### Typographies (next/font, auto-hébergées au build)

| Rôle | Praticien | Patient |
|---|---|---|
| `--font-display` | Sora (600/700) | Bricolage Grotesque (700) |
| `--font-body` | Instrument Sans (400/600) | Albert Sans (400/600) |
| `--font-mono` | IBM Plex Mono (400) | IBM Plex Mono (400) |

Tailwind consomme désormais `sans → var(--font-body)`,
`display → var(--font-display)`, `mono → var(--font-mono)` — les valeurs
sont posées par thème dans `globals.css`.

### Matrice de contraste (calculée le 2026-07-15, luminance WCAG 2.x)

| Paire | Ratio | Verdict |
|---|---|---|
| Praticien texte `#1B2337` / fond `#F7F8FA` | 14,72:1 | AAA |
| Praticien texte / surface blanche | 15,65:1 | AAA |
| Praticien muted `#535D7A` / fond | 6,15:1 | AA (texte normal) |
| Blanc / primaire indigo `#3D4A9E` | 7,86:1 | AAA |
| Encre / accent solaire `#E8A33D` | 7,25:1 | AAA |
| `--solar-ink #8A5B10` / fond clair | 5,51:1 | AA |
| Statuts success/warning/danger/info / fond | 4,72 / 6,67 / 6,09 / 6,31 | AA |
| Rail : texte `#EEF0FA` / night-900 | 14,72:1 | AAA |
| Rail : muted `#8B94BE` / night-900 · night-950 | 5,64 / 6,04 | AA |
| Rail : solaire / night-900 | 7,76:1 | AAA |
| Rail : texte / primaire indigo | 6,92:1 | AA |
| Patient texte `#2B2115` / fond `#FAF8F3` | 14,86:1 | **AAA** (promesse §2 tenue) |
| Patient muted `#6E5F49` / fond | 5,83:1 | AA |
| Blanc / primaire forêt `#1E6F54` | 6,07:1 | AA |
| `--copper-ink #8F4526` / fond ivoire | 6,49:1 | AA |
| Blanc / cuivre `#B25E38` | 4,61:1 | AA |
| Cuivre / fond ivoire (graphique) | 4,35:1 | ≥ 3:1 |
| Menthe / blanc · Indigo / blanc (graphique) | 3,74 / 7,86 | ≥ 3:1 |
| **Solaire / fond clair (graphique)** | **2,03–2,16:1** | **< 3:1 — règle de relief obligatoire** : le solaire ne porte jamais une information sans étiquette textuelle directe (héritée de l'or historique) |

### Règles

- Jumeaux RGB (`--*-rgb`) maintenus synchronisés pour chaque couleur
  sémantique (exigence Tailwind, cf. §1).
- Le texte accent utilise `--solar-ink` / `--copper-ink`, jamais le solaire
  ou le cuivre pleins en petite taille sur fond clair.
- `ScoreZones` (point sur zones de seuil) dérive ses zones des bornes
  d'interprétation reçues en props — aucun seuil n'est encodé dans le
  composant ; le statut textuel est toujours affiché. Les bornes sont
  fournies par l'API `reponses` (calcul serveur via `lib/scoring/ranges.ts`,
  le catalogue complet ne rentre pas dans le bundle client).
- **Écart assumé** : le gabarit HTML du booklet email
  (`app/api/praticien/booklet/route.ts`) conserve sa palette autonome
  (verts `#2d6a4f`…, antérieure à la DA) — les emails ont leurs propres
  contraintes de rendu ; à basculer dans un lot dédié si souhaité.

## 9. Tokens v3 — A5-R2 « ardoise & sable » (mid-tone, 2026-07-18)

Révision A5-R2 (registre) : le **canvas de fond s'approfondit** pour donner du
relief aux cartes claires, sans basculer en thème sombre. La structure A5/A5-R1
est conservée (rail nuit signature praticien, patient clair fixe, **aucun
toggle**) ; seuls `--background` et le calibrage `--surface`/`--muted`/`--border`
évoluent. **Appliqué au code au lot Vague 1** (PR « shell praticien », 2026-07-19) :
`globals.css` porte les valeurs v3 ci-dessous dans les deux thèmes, `--surface`
(cartes) inchangé.

### Correspondance des tokens (v2 → v3)

| Rôle | v2 praticien | v3 praticien | v2 patient | v3 patient |
|---|---|---|---|---|
| `--background` (canvas) | `#F7F8FA` | **`#D3D8E6`** (ardoise) | `#FAF8F3` | **`#EAE0CC`** (sable) |
| `--surface` (cartes) | `#ffffff` | `#ffffff` (relief : ombre + bord) | `#FFFDF9` | `#FFFDF9` |
| `--muted` | `#E9EBF2` | `#E3E7F1` (recalibré) | `#EFE8DA` | `#F0E7D6` (recalibré) |
| `--border` | `#DDE1EC` | `#C4CBDD` (plus marqué) | `#E5DCCB` | `#DCCFB6` |
| `--rail-*` | night | **inchangé** | — | — |
| `--color-primary` / `--color-accent` | indigo / solaire | **inchangés** | forêt / cuivre | **inchangés** |
| `--viz-corps/ancrage/esprit` | trio fixe | **inchangé** | trio fixe | **inchangé** |

### Matrice de contraste A5-R2 (calculée le 2026-07-18, luminance WCAG 2.x)

| Paire | Ratio | Verdict |
|---|---|---|
| Praticien texte `#1B2337` / canvas ardoise `#D3D8E6` | 10,98:1 | AAA |
| Praticien texte / carte blanche `#FFFFFF` | 15,65:1 | AAA |
| Praticien muted `#535D7A` / canvas ardoise | 4,59:1 | AA |
| Patient texte `#2B2115` / canvas sable `#EAE0CC` | 12,04:1 | AAA |
| Patient texte / carte crème `#FFFDF9` | ≈ 15,5:1 | AAA |
| Patient muted `#6E5F49` / canvas sable | 4,72:1 | AA |
| Primaire / accent / statuts / rail / dataviz | inchangés (posés sur cartes & boutons) | cf. §8 |

### Règles

- **Point de vigilance** : le canvas mid-tone abaisse le contraste du texte
  *muted* (de ~6,1:1 sur quasi-blanc à ~4,6:1 sur ardoise/sable) — il **reste
  AA** pour le texte normal, mais toute réduction de taille du texte secondaire
  devra être re-vérifiée au lot d'implémentation.
- La **règle de relief solaire** (§8) et le **trio d'entité** restent inchangés.
- Les cartes portent une **ombre** (`0 8px 24px rgba(16,22,43,.08)`) pour se
  détacher du canvas — le relief remplace la frontière par le seul bord.
- Direction d'interface associée : **poste de pilotage** (registre A6-R1) —
  cockpit borné, métriques actives, instruments à tiroir. Maquette :
  `docs/claude/propositions/2026-07-18-refonte-ux-5-0/maquette-cible-ux-5-0.html`.

## 10. Tokens v4 — socle refonte visuelle 5.0 (lot V1, 2026-07-22)

La Vague 1 du 2026-07-19 avait posé les canvas A5-R2 sans porter l'anatomie
de la maquette cible (typo restée à 13-14px, ombres et rayons d'origine D1).
Le lot V1 du chantier « refonte visuelle totale 5.0 » pose le socle manquant ;
les lots suivants (V2+) portent l'anatomie écran par écran.

### Échelle typographique (`tailwind.config.ts`, `theme.extend.fontSize`)

La « typo remontée » de la maquette cible se fait au niveau des tokens —
`text-sm` passe de 14 à 15 px, `text-xs` de 12 à 12,5 px — sans toucher les
composants. Paliers :

| Classe | Taille | Usage maquette |
|---|---|---|
| `text-3xs` | 10px | badges capitales, légendes denses (ajouté 2026-09-06) |
| `text-2xs` | 11,5px | statuts du rail de phases, labels de jauge |
| `text-xs` | 12,5px | eyebrows, labels uppercase (tracking .06em) |
| `text-13` | 13px | chips, mono (heures, sources, positions) |
| `text-14` | 14px | UI dense (rail de phases, tableaux) |
| `text-sm` | 15px | nav, boutons, onglets, sous-titres |
| `text-base` | 16px | corps (line-height 1.55) |
| `text-metric` | 32px | valeurs de métriques (`font-display`) |

#### L'échelle est fermée aux valeurs arbitraires, ouverte aux paliers natifs (2026-09-06)

**Toute valeur arbitraire `text-[…]` est proscrite** — pas seulement
`text-[13px]`/`text-[14px]`, les seules que ce paragraphe nommait jusqu'ici. Un
`text-[26px]` n'est pilotable centralement par rien : c'est un nombre magique
dans un `className`, et c'est exactement ce que le principe de cette section
refuse. La garde
`web/src/components/ui/design-system.guard.test.ts` le tient.

**Les paliers natifs de Tailwind restent disponibles** — `text-lg` (18px),
`text-xl` (20px), `text-2xl` (24px), `text-3xl` (30px). `fontSize` vit sous
`theme.extend` : ils survivent, et ils sont pilotables centralement par la
configuration, ce que le principe exige. Le tableau ci-dessus est **l'échelle
de l'UI dense** (10 → 16px) plus la métrique ; entre 16 et 32px, il n'y avait
aucun palier, et 117 usages de `text-lg`/`xl`/`2xl`/`3xl` remplissaient ce trou
sans que rien ne le dise. C'est désormais dit.

**Migration du 2026-09-06** — les 19 valeurs arbitraires de l'arbre sont passées
au palier le plus proche : 9/10/10,5px → `text-3xs` · 11px → `text-2xs` ·
15/15,5px → `text-sm` · 19px → `text-lg` · 26px → `text-2xl` · `1.875rem` →
`text-3xl` (qui valait déjà exactement la même chose).

### Rayons

`--radius-sm` 10px · `--radius` 14px · `--radius-lg` 18px (valeurs exactes
de la maquette cible).

### Ombres

| Token | Valeur | Usage |
|---|---|---|
| `--shadow-card` (`shadow-card`) | `0 1px 2px rgba(16,22,43,.06), 0 8px 24px rgba(16,22,43,.08)` | carte au repos, onglet actif |
| `--shadow-pop` (`shadow-pop`) | `0 12px 40px rgba(16,22,43,.22)` | survol de carte active, tiroirs, pop-ups |

`shadow-sm` est réservé aux micro-éléments (point de curseur `ScoreZones`) ;
les cartes utilisent `shadow-card`. `bg-white` en dur est proscrit —
toujours `bg-surface`.

### Focus clavier

Règle globale `@layer base` : `:focus-visible { outline: 3px solid
var(--color-focus-ring); outline-offset: 2px; }` — épaisseur et décalage de
la maquette, couleur indigo (praticien) / forêt (patient). Le solaire plein
est exclu comme indicateur de focus (2,03:1 sur blanc, < 3:1 requis).

### État du chantier (clôture V12, 2026-07-22)

Les lots V1 à V11 sont **appliqués au code** : socle, cockpit fiche patient
(Spirale, chips, rail de phases, tiroirs 440 px), accueil (métriques 32 px,
Fil), rail nuit complet (Fiches-trajectoires, écrans réservés C3/C4/différés),
copilote, questionnaires & packs, documents, synthèse/droits/paramètres,
portail sable plat (journey, pbtn, pcard 18 px), Mon équilibre legacy.
Vitrine de comparaison : `/dev/vitrine` (hors production).

Dérogations assumées :
- `ScoreZones` : le point de curseur garde `shadow-sm` (micro-élément).
- « Bande de confiance des observations » (maquette patient) non branchée —
  aucun signal de qualité agrégé dans le payload patient ; rien n'est inventé.
- ~~Captures Playwright en artefacts, sans baselines commitées (rendu
  macOS ↔ Ubuntu divergent ; des baselines mono-plateforme casseraient
  `verify`).~~ **Dérogation levée le 2026-07-23 (SP-CONV LOT-06)** : la
  comparaison au pixel est désormais **Linux uniquement** (l'environnement
  du CI) et conditionnée à l'existence de la baseline — elle ne peut pas
  casser `verify` sur un poste macOS ni sur une baseline absente. Les
  structures sensibles aux polices sont assertées en **snapshots ARIA**
  (texte, toutes plateformes). Bootstrap des baselines : workflow manuel
  `visual-baselines` (Ubuntu, `--update-snapshots`, artefact relu puis
  commité). Le portail est capturé (Jennifer Martin, isolée des parcours).
