# Handoff — 2026-09-06 — Preuve visuelle : les baselines deviennent opposables

## Branche et état Git

Lot clos. Neuf PR fusionnées sur `main` : #871, #872, #874, #875, #876, #879,
#881, #882, #884. Aucune branche de ce lot ne survit ; les worktrees sont
retirés. Écrit depuis `main` : la fenêtre de clôture avant PR était fermée.

## Objectif

Rendre la comparaison visuelle réellement opposable. À l'ouverture, deux écrans
sur neuf étaient comparés, aucun regardé, et le seuil n'avait jamais été mesuré.

## Décisions prises

- **`--update-snapshots=all`** dans `visual-baselines.yml`. Le drapeau nu vaut
  `changed` : Playwright ne réécrit que ce qu'il juge différent, au seuil du
  matcher. Une baseline périmée passait donc sous le seuil et repartait dans
  l'artefact (constaté : deux images octet pour octet identiques aux commises).
- **Seuil `maxDiffPixels: 100`**, absolu et non ratio. Mesuré en se servant du
  CI comme instrument : une passe à `0` a fait dire l'écart réel entre contexte
  de génération et contexte de comparaison — **17/31/33 px, et 0 dans 5 cas sur
  8**. L'ancien ratio de 2 % en tolérait 48 960 sur le cockpit.
- **Borne de garde à 219 px**, le plus petit changement d'état mesuré
  (« renseignée » ↔ « à ouvrir »). Une icône SEULE n'est pas gardable :
  horloge ↔ cercle vaut 23 px, sous le bruit. Ce qui la rattrape est que
  `IconeStatut` et `libelleStatut` dérivent du même `statut`.
- **Le cadrage suit le projet** (`isMobile`), au lieu d'écraser le viewport à
  1440 pour les deux. Le projet « iPhone 13 » capture enfin en 390 px.
- **Fenêtre haute et non `fullPage` en mobile** : `MobileBottomNav` est en
  `position: fixed` et `fullPage` la fige au milieu de l'image, par-dessus le
  contenu surveillé.
- **Rapporteur `html`** ajouté à `list`, avec `open: 'never'`.

## Options écartées, et pourquoi

- **Aligner le contexte de génération** (faire tourner la suite complète dans
  `visual-baselines`) : écarté après mesure. Le décalage vaut 33 px ; le
  remède coupleraient les baselines aux effets de bord des 21 autres specs.
  `dashboard-patients` reste hors comparaison pour cette raison.
- **Renommer le projet « iPhone 13 »** : le nom est gravé dans le nom des
  fichiers de baseline ; le renommer les invaliderait toutes.
- **Isoler un dossier pour la suite visuelle** : non engagé, faute de risque
  réel (`workers: 1`, pas de course).

## Fichiers modifiés

`web/e2e/visual.spec.ts` · `web/playwright.config.ts` · `web/package.json`
(crochet `pretype-check`, banc `seuil-visuel`) · `.github/workflows/ci.yml` ·
`.github/workflows/visual-baselines.yml` · `scripts/ci-invariants.test.mjs`
(5 invariants) · `scripts/seuil-visuel.test.mjs` (créé) ·
`web/e2e/portail-pack-reevaluation.spec.ts` (commentaire) ·
`web/e2e/visual.spec.ts-snapshots/` (11 baselines) · `web/scripts/wn-test-worktree.sh`.

## Validations exécutées

T1 exit 0 à chaque lot. T2 `--fast` exit 0 sauf sur le lot des réserves, où il
rend **1** sur `portail-lien-magique.spec.ts` (iPhone 13, `page.goto` expiré à
120 s) — signature de `D-049`, spec non touchée par le lot, 18 tests de
`visual.spec.ts` verts. CI `verify` vert sur les neuf PR.

Toutes les gardes prouvées **rouges par mutation** avant d'être déclarées
vertes : drapeau nu / `=changed` / `=missing` ; seuil 500 / 197 / 219 / ratio /
réduit à un commentaire ; `reporter: 'list'` ; `outputFolder` désaccordé ;
retrait de `if-no-files-found`.

## Problèmes ouverts

- **`D-049`** tient : T2 local peut rougir sur `portail-lien-magique` sans que
  le lot en cause y soit pour rien. Le CI Linux fait foi.
- **`dashboard-trajectoires` et `dashboard-patients`** gardent l'artefact de la
  barre fixe en mobile. Assumé et écrit : captures de revue, aucune baseline.
- **Un vert dit « dans la tolérance », pas « identique »** — vrai désormais à
  100 px près, plus à 49 000.

## Prochaine action exacte

Aucune sur ce lot : il est clos. Si la comparaison rougit un jour sur un écran
praticien, lire le rapport Playwright — il existe enfin — avant de toucher au
seuil. Le desserrer exige une **nouvelle mesure**, pas une estimation :
`scripts/seuil-visuel.test.mjs` le refuse au-delà de 219 px.

## Interdits encore actifs

- Ne jamais promouvoir une baseline sans avoir **regardé chaque image** à pleine
  résolution — c'est ce qui a intercepté l'artefact de la barre fixe, qu'aucune
  garde automatique n'aurait vu.
- Ne pas lire un code de sortie derrière un tube : il rend celui de `tail`.
- Ne pas conclure d'une capture **locale** à ce que verra le CI : un poste qui
  pose `WN_CB_RESULTS_ENABLED` rend un autre panneau.
