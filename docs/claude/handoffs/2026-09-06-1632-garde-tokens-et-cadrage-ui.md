# Handoff — 2026-09-06 — Le design system passe de la prose au test

## Branche et état Git

`wn-ui-garde-design-system`, ouverte depuis `main` (`1b2a46e9`), vivante.
Hors campagne : `wn-cycle` rattache la branche au lot actif LOT-06 de
`2026-08-23-alliance-objectif-trois-voix`, à tort — ce travail n'en relève pas.

## Objectif

Répondre à « une skill serait-elle utile au design des interfaces ? ». Réponse
construite sur mesure, pas sur intuition : outiller le design **sans** importer
une skill tierce, et convertir en test ce que la prose ne tenait pas.

## Décisions prises

- **Trois règles du §10 deviennent exécutables** —
  `web/src/components/ui/design-system.guard.test.ts` garde `bg-white` en dur,
  `text-[13px]`/`text-[14px]`, et la palette native de Tailwind. Motif : la
  règle était écrite **trois fois** en prose (§10, `frontend-ui.md`, rappel de
  session) ; une règle écrite trois fois dérive d'au moins un côté.
- **La garde naît verte, délibérément.** Les trois motifs rendent 0 sur 177
  fichiers. Ce n'est pas décoratif pour autant : chacun est **prouvé rouge sur
  des sources fabriquées** avant l'arbre réel, patron de
  `PanneauSuperpose.guard.test.ts`. Garde anti-vacuité à 150 fichiers.
- **Le motif de la taille arbitraire est borné à `text-[13px]`/`[14px]`**, ce
  que le §10 proscrit nommément. La forme large rend 19 occurrences qu'aucune
  décision ne couvre ; les garder ici imposerait un changement de pixels sur
  douze fichiers sous couvert de garde.
- **`/wn-ui`** (`.claude/skills/wn-ui/SKILL.md`) cadre une surface avant le
  code : primitives reprises/étendues/créées, thème nommé, quatre états, palier
  E2E. Elle **ne réécrit pas** les règles passées en test — elles ont quitté la
  prose le jour où elles sont devenues des tests.
- **Deux skills tierces écartées** après `/wn-tiers` (voir « Problèmes ouverts »).

## Options écartées, et pourquoi

- **Gardes sur les hexadécimaux et sur `shadow-sm`** : leurs seuls usages réels
  sont légitimes — logo Google (couleurs de marque d'un tiers), `global-error.tsx`
  (remplace le layout racine, donc s'affiche sans variables CSS), attributs SVG
  de data-viz, point de curseur de `ScoreZones` que le §10 autorise nommément.
  Une règle qui exige trois exceptions sur ses seules occurrences ne paie pas.
- **Migration typographique** : non engagée. Déplace des pixels sur douze
  fichiers, et les baselines ne comparent aucun pixel hors Linux.
- **Installer Impeccable** : SOUS RÉSERVE, pas ACTIVER. Voir plus bas.

## Trois faux positifs, tous instructifs

Écrits dans `/wn-ui` §4, parce qu'ils ont coûté trois mesures.

1. **« 184 `<button>` bruts contre 12 imports de `Button` » n'est pas une
   dérive.** Zéro rejoue une variante de `Button` : ce sont des onglets, des
   lignes de liste, des boutons d'icône, que trois variantes n'expriment pas.
   Le nombre était juste, la conclusion fausse.
2. **Le seul `bg-white` de l'arbre est dans un commentaire** de `PatientCard`
   documentant ce qu'il a remplacé. Un fichier qui NOMME un motif proscrit ne
   l'EMPLOIE pas — d'où `sansCommentaires` dans la garde.
3. **« Cinq boutons sans nom accessible » : zéro.** La regex se trompait de
   borne au premier `onClick={() => …}`, dont la flèche porte un `>` — piège
   documenté depuis le 2026-09-03 en tête de `PanneauSuperpose.guard.test.ts`.
   Le parseur TypeScript rend 193 boutons, 1 sans texte : `Button.tsx` lui-même.

**Règle qui en sort : un écart s'établit sur un comptage qualifié, jamais sur un
`grep` brut.**

## Fichiers modifiés

`web/src/components/ui/design-system.guard.test.ts` (créé, 175 l.) ·
`.claude/skills/wn-ui/SKILL.md` (créé, 122 l.) ·
`changelog.d/2026-09-06-garde-tokens-design-system.md` (créé) ·
`docs/claude/SESSION_LOG.md` · ce handoff. Aucun composant applicatif touché.

## Validations exécutées

`npx tsc --noEmit` propre. `npx vitest run src/components/ui/` : 9 fichiers,
64 tests verts, garde comprise (6 cas, dont 5 synthétiques).

**Pas d'E2E** : aucun composant ne change, seul un test s'ajoute. Le palier T2
de `frontend-ui.md` vise les changements d'UI ; celui-ci n'en est pas un.

`npx eslint` échoue — **avant ce changement** : `eslint.config.mjs` ne résout
pas `eslint-config-next/core-web-vitals` (il manque le `.js`). Même erreur sur
un fichier non touché. Non corrigé : hors périmètre, et ça touche le CI.

## Problèmes ouverts

- **L'échelle typographique est-elle fermée ?** Le §10 énumère sept paliers sans
  le dire, et `fontSize` vit sous `theme.extend` : les paliers natifs survivent.
  117 usages de `text-lg`/`xl`/`2xl`/`3xl` et 19 tailles arbitraires en
  dépendent. Tant que la question n'est pas tranchée, la garde ne garde que ce
  qui l'a été.
- **`eslint` cassé au chargement de sa config.** Préexistant, non diagnostiqué.
- **Impeccable** (`github.com/pbakaus/impeccable`) : contrôle `/wn-tiers` au
  commit épinglé `831cabee8b4bc1a2b66e5ae22003e9a19b57d464` → **SOUS RÉSERVE**.
  Rien d'hostile : la fusion de hooks préserve les entrées tierces, le
  téléchargement échoue fermé sur SHA256, les écritures hors dépôt se limitent à
  `~/.impeccable/`. La réserve : le binaire exécuté n'a **aucune attestation de
  provenance**, et le manifeste le câble en `PostToolUse` sur chaque édition,
  dans un arbre qui porte `secrets/` et `web/.env.local`. Si activation : copier
  à la main, ne pas câbler le hook, préinstaller via `IMPECCABLE_BIN`.
- **`/wn-tiers` ne demande pas « est-ce que ça répond à un besoin mesuré ? »**
  Il a rendu ACTIVER sur `frontend-design` le 2026-08-06, skill qui pousse à
  inventer une identité là où le dépôt en a une. Critère candidat, non écrit.

## Prochaine action exacte

Trancher la question de l'échelle typographique. Si fermée : élargir le motif de
la garde à `text-\[…\]`, puis migrer les 19 sites vers le palier nommé le plus
proche — en un lot séparé, validé T2, baselines regardées. Si ouverte : l'écrire
dans le §10, et la garde reste telle quelle.

## Interdits encore actifs

- Ne pas installer une skill tierce de design sans repasser `/wn-tiers` : le
  verdict porte sur un commit, pas sur un dépôt.
- Ne pas élargir un motif de garde pour « couvrir plus » quand l'élargissement
  impose une décision visuelle non prise — la garde tiendrait une règle que
  personne n'a écrite.
- Ne pas conclure à une dérive sur un `grep` : ouvrir trois occurrences d'abord.
