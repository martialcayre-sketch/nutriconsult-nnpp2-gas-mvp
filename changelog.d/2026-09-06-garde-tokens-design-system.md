### Le design system passe de la prose au test — garde des tokens et cadrage `/wn-ui` (2026-09-06)

Deux règles de `docs/design-system-d1.md` §10 n'étaient tenues que par la
relecture, et réécrites en prose à deux endroits — le §10 et le rappel qu'un
agent lit à chaque session. Une règle écrite deux fois dérive d'un côté au
moins : c'est le signal qu'elle doit devenir exécutable.

- **`web/src/components/ui/design-system.guard.test.ts`** garde `bg-white` en
  dur (« toujours `bg-surface` ») et les tailles arbitraires `text-[13px]`/
  `text-[14px]`. Les deux rendent **0 sur 177 fichiers** : la garde naît verte,
  délibérément, et fige un état atteint.
- **La palette native de Tailwind n'y est pas — elle était déjà gardée.** La
  garde E18 (`src/lib/tokens-couleur.guard.test.ts`) balaie tout `web/src`,
  dix-neuf échelles contre seize utilitaires, `.css` compris. Une première
  version rejouait cette règle ; **c'est E18 qui a attrapé le doublon**, en
  rougissant sur les sources fabriquées de la copie — une échelle brute écrite
  dans `web/src` en est une, fût-ce entre guillemets dans un cas de test. Deux
  gardes qui se recouvrent rendent un verdict arbitraire : E18 garde le
  périmètre.
- **Chaque règle est prouvée rouge sur des sources fabriquées** avant d'être
  appliquée à l'arbre, y compris le cas « motif cité en commentaire » — le seul
  `bg-white` du dépôt vit dans un commentaire de `PatientCard` documentant ce
  qu'il a remplacé. Une garde qui déciderait sur la présence du motif classerait
  en faute le fichier qui a corrigé la faute. Garde anti-vacuité à 150 fichiers.
- **`/wn-ui`** cadre une surface avant le code : inventaire des 25 primitives de
  `components/ui` avant toute création, thème (`praticien`/`patient`) nommé en
  une ligne, les quatre états obligatoires (vide, chargement, erreur, **dense**),
  et le palier E2E — une suite Vitest verte ne prouve rien sur un parcours.

Écarté — des gardes sur les hexadécimaux littéraux et sur `shadow-sm` : leurs
seuls usages réels sont légitimes (logo Google d'un tiers, `global-error.tsx`
qui s'affiche sans variables CSS, attributs SVG de data-viz, point de curseur de
`ScoreZones`). Une règle qui exige trois exceptions sur ses seules occurrences
ne paie pas son coût.

Écartées aussi deux skills de design tierces, après contrôle `/wn-tiers` :
**UI/UX Pro Max** génère une identité visuelle (192 palettes, 74 appariements de
polices) là où le dépôt en a une, verrouillée ; **Impeccable** rend SOUS RÉSERVE
au commit `831cabe` — ingénierie soignée (fusion de hooks qui préserve les
entrées tierces, SHA256 fail-closed, écritures hors dépôt limitées à
`~/.impeccable/`), mais ce qui s'exécute est un binaire natif sans attestation
de provenance, câblé en `PostToolUse` sur chaque édition.

**Question ouverte, volontairement non gardée** — l'échelle typographique du §10
énumère sept paliers sans dire si la liste est fermée, et `fontSize` vivant sous
`theme.extend`, les paliers natifs de Tailwind survivent. L'arbre s'en sert :
117 usages de `text-lg`/`xl`/`2xl`/`3xl`, plus 19 tailles arbitraires hors des
deux que le §10 proscrit (`text-[15.5px]`, `text-[10.5px]`, `text-[1.875rem]`).
Les corriger déplace des pixels sur douze fichiers ; c'est une décision de
design system, pas un ajustement de garde.
