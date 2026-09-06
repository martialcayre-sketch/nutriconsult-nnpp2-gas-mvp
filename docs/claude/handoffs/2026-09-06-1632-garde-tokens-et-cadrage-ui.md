# Handoff — 2026-09-06 — Le design system passe de la prose au test

## Branche et état Git

`wn-ui-garde-design-system`, ouverte depuis `main` (`1b2a46e9`), vivante.
Hors campagne : `wn-cycle` rattache la branche au lot actif LOT-06 de
`2026-08-23-alliance-objectif-trois-voix`, à tort — ce travail n'en relève pas.

## Objectif

Répondre à « une skill serait-elle utile au design des interfaces ? » sur mesure :
outiller le design **sans** importer de skill tierce, et convertir en test ce que
la prose ne tenait pas.

## Décisions prises

- **Deux règles du §10 deviennent exécutables** —
  `web/src/components/ui/design-system.guard.test.ts` garde `bg-white` en dur et
  `text-[13px]`/`text-[14px]`. Motif : la règle était écrite deux fois en prose ;
  une règle écrite deux fois dérive d'un côté au moins.
- **La palette native n'est pas gardée ici : E18 le fait déjà.**
  `src/lib/tokens-couleur.guard.test.ts` balaie tout `web/src`, 19 échelles ×
  16 utilitaires, `.css` compris — ma règle 3 en était un doublon plus faible.
- **La garde naît verte, délibérément.** Les deux motifs rendent 0 sur 177
  fichiers, et chacun est **prouvé rouge sur des sources fabriquées** avant
  l'arbre réel (patron de `PanneauSuperpose.guard.test.ts`). Anti-vacuité à 150.
- **Le motif de la taille arbitraire est borné à `text-[13px]`/`[14px]`**, ce
  que le §10 proscrit nommément — l'élargir imposerait un changement de pixels
  sur douze fichiers sous couvert de garde (voir « Prochaine action »).
- **`/wn-ui`** (`.claude/skills/wn-ui/SKILL.md`) cadre une surface avant le
  code : primitives reprises/étendues/créées, thème nommé, quatre états, palier
  E2E. Elle **ne réécrit pas** les règles passées en test.

## Options écartées, et pourquoi

- **Gardes sur les hexadécimaux et sur `shadow-sm`** : leurs seuls usages réels
  sont légitimes — logo Google, `global-error.tsx` (remplace le layout racine,
  donc s'affiche sans variables CSS), SVG de data-viz, point de curseur de
  `ScoreZones` que le §10 autorise. Une règle qui exige trois exceptions sur ses
  seules occurrences ne paie pas.
- **Deux skills tierces** — Impeccable (SOUS RÉSERVE) et UI/UX Pro Max, qui
  génère une identité là où le dépôt en a une. Détail dans le changelog.

## Cinq erreurs rattrapées

Les trois premières sont détaillées dans `/wn-ui` §4, avec la règle qui en sort.

1. **« 184 `<button>` bruts contre 12 `Button` » n'est pas une dérive** — zéro
   rejoue une variante de `Button` (onglets, lignes de liste, boutons d'icône).
2. **Le seul `bg-white` du dépôt est dans un commentaire** de `PatientCard`
   documentant ce qu'il a remplacé — d'où `sansCommentaires` dans la garde.
3. **« Cinq boutons sans nom accessible » : zéro.** La regex se trompait de borne
   au premier `onClick={() => …}`, dont la flèche porte un `>` — piège documenté
   depuis le 2026-09-03 en tête de `PanneauSuperpose.guard.test.ts`. Au parseur
   TypeScript : 193 boutons, 1 sans texte, `Button.tsx` lui-même.
4. **Une garde écrite sans chercher l'existante.** La règle « palette native »
   rejouait E18. Ce n'est pas une revue qui l'a vu : c'est **E18 elle-même**, en
   CI, en rougissant sur les sources fabriquées de sa copie — une échelle brute
   écrite dans `web/src` en est une, fût-ce entre guillemets. Avant d'écrire une
   garde : `rg -l 'guard.test' web/src`.
5. **Une reproduction locale sur la mauvaise branche.** Le premier
   `npm run test:siin57` a rendu 485 fichiers verts et a été annoncé comme
   probant. Il tournait sur `k1-acte-date-et-contenu` : une autre session avait
   repris le checkout (visible au `git reflog`). Le CI comptait 486 —
   **l'écart d'un fichier était le mien**. Refaite en worktree dédié
   (`node_modules` et `src/generated/prisma` liés, hors de Git) : 486 verts.

**Règle qui en sort : un écart s'établit sur un comptage qualifié, jamais sur un
`grep` brut.**

## Fichiers modifiés

`web/src/components/ui/design-system.guard.test.ts` (créé, 160 l.) ·
`.claude/skills/wn-ui/SKILL.md` (créé, 122 l.) ·
`changelog.d/2026-09-06-garde-tokens-design-system.md` (créé) ·
`docs/claude/SESSION_LOG.md` · ce handoff. Aucun composant applicatif touché.

## Validations exécutées

`WN_ALI_01_SIIN57=true vitest run` (la commande exacte du CI) en worktree
dédié : **486 fichiers, 6511 tests verts, code 0** — même compte de fichiers que
le CI. E18 et la nouvelle garde passent ensemble. `tsc --noEmit` propre.

**Pas d'E2E** : aucun composant ne change, seul un test s'ajoute — le palier T2
de `frontend-ui.md` vise les changements d'UI, celui-ci n'en est pas un.

## Problèmes ouverts

- **`eslint` cassé au chargement de sa config** en local, avant ce changement :
  `eslint.config.mjs` ne résout pas `eslint-config-next/core-web-vitals` (il
  manque le `.js`). Non diagnostiqué ; l'étape Lint du CI n'a pas tourné, sautée
  après l'échec Vitest — elle rougira peut-être au prochain run.
- **Le checkout principal est partagé.** Une autre session y travaille sur
  `k1-acte-date-et-contenu` ; ne pas y changer de branche.
- **Impeccable** : `/wn-tiers` au commit `831cabe` → **SOUS RÉSERVE** (binaire
  natif sans attestation de provenance, câblé en `PostToolUse` sur chaque
  édition). Détail dans le fragment de changelog. Si activation un jour : copier
  à la main, ne pas câbler le hook, préinstaller via `IMPECCABLE_BIN`.
- **`/wn-tiers` ne demande pas « est-ce que ça répond à un besoin mesuré ? »**
  Il a rendu ACTIVER sur `frontend-design` le 2026-08-06. Critère candidat.

## Prochaine action exacte

**Échelle typographique : tranchée le 2026-09-06 — paliers natifs de Tailwind
admis, valeurs arbitraires proscrites.** Les natifs (18/20/24/30 px) sont
pilotables centralement, ce que le §10 exige ; les 19 `text-[…]` ne le sont pas.

Reste à faire, en **PR séparée** (elle déplace des pixels, donc T2 et baselines
regardées) : écrire la règle au §10, ajouter un palier bas `text-3xs` (10 px)
pour ne pas grossir les labels denses, migrer les 19 sites, puis élargir le
motif de la garde à `text-[…]`.

## Interdits encore actifs

- Ne pas installer une skill tierce de design sans repasser `/wn-tiers` : le
  verdict porte sur un commit, pas sur un dépôt.
- Ne pas élargir un motif de garde quand l'élargissement impose une décision
  visuelle non prise : la garde tiendrait une règle que personne n'a écrite.
- Ne pas conclure à une dérive sur un `grep` : ouvrir trois occurrences d'abord.
