# Handoff — 2026-09-06 — L'échelle typographique se ferme aux arbitraires

## Branche et état Git

`typo-echelle-paliers-nommes`, rebasée sur le `main` d'après #899 (qui porte la
garde des tokens et `/wn-ui`). Travail fait en worktree dédié : le checkout
principal est occupé par une autre session sur `k1-acte-date-et-contenu`.

## Objectif

Trancher la question laissée ouverte par #899 : l'échelle typographique du §10
est-elle fermée ? Puis appliquer la décision.

## La question était mal posée

Ni « fermée » ni « ouverte » : **il manquait un morceau d'échelle**. Le tableau
du §10 couvre l'UI dense (11,5 → 16 px) plus une métrique à 32 px, et **aucun
palier n'existait entre 16 et 32**. Les titres n'en avaient donc aucun, et
136 usages remplissaient ce vide chacun à sa façon — 117 aux paliers natifs de
Tailwind, 19 à des valeurs arbitraires.

## Décisions prises

- **Toute valeur arbitraire `text-[…]` est proscrite**, pas seulement
  `text-[13px]`/`text-[14px]` que le §10 nommait. Un `text-[26px]` n'est
  pilotable centralement par rien.
- **Les paliers natifs sont admis** — 18/20/24/30 px. `fontSize` vit sous
  `theme.extend` : ils survivent et la configuration les pilote, ce que le
  principe du §10 exige. Il manquait de le dire, pas de l'interdire.
- **Palier bas `text-3xs` (10 px) ajouté.** Dix sites écrivaient 9 à 11 px en
  dur ; tout remonter à `text-2xs` aurait grossi badges capitales et légendes de
  graphe de 2,5 px.
- **19 sites migrés**, 13 fichiers : 9/10/10,5 → `text-3xs` · 11 → `text-2xs` ·
  15/15,5 → `text-sm` · 19 → `text-lg` · 26 → `text-2xl` · `1.875rem` →
  `text-3xl` (qui valait déjà exactement la même chose).
- **La garde est élargie** à `text-\[…\]`, avec deux cas de rouge synthétique
  ajoutés : les trois formes réellement trouvées dans l'arbre, et un cas qui
  ACCEPTE les paliers natifs — sans quoi l'élargissement ne prouverait rien.

## Options écartées, et pourquoi

- **Migrer aussi les 117 usages natifs** vers des paliers nommés propres au
  dépôt (`text-title`, `text-title-sm`). L'état final serait plus net, mais
  136 sites touchés pour déplacer des pixels sur des titres que personne ne
  conteste, alors que les natifs satisfont déjà le principe.
- **Garder 26 px en palier nommé** plutôt que de le ramener à `text-2xl` :
  aurait ajouté un palier pour trois usages, contre la logique de l'option
  retenue.

## Fichiers modifiés

`web/tailwind.config.ts` (palier `text-3xs`) · `docs/design-system-d1.md` (§10,
la règle et le palier) · 13 composants et pages · la garde
`web/src/components/ui/design-system.guard.test.ts` ·
`changelog.d/2026-09-06-echelle-typo-fermee-aux-arbitraires.md` ·
`docs/claude/SESSION_LOG.md` · ce handoff.

## Validations exécutées

- `tsc --noEmit` propre.
- **T1** : 485 fichiers, 6515 tests, code 0. Aucun test ne référençait les
  anciennes valeurs.
- **T2 complet** (`npm run test:worktree -- --fast`, build de production +
  Playwright Chromium et WebKit) : **180 passés, 2 sautés, code 0**.
- Garde élargie : 6 cas verts, dont 3 qui la prouvent rouge.

**Ce que T2 ne prouve PAS ici** : `visual.spec.ts` est passé sans comparer un
seul pixel — les baselines sont `-linux` et ce run est macOS. Or ce lot déplace
des pixels **volontairement**. La comparaison réelle n'aura lieu qu'en CI.

## Problèmes ouverts

- **Aucun.** Les baselines ont été régénérées et promues (voir ci-dessous).
- **`eslint` cassé au chargement de sa config** en local (`eslint.config.mjs` ne
  résout pas `eslint-config-next/core-web-vitals`). Préexistant, non diagnostiqué.
- **Le checkout principal est partagé** — ne pas y changer de branche.

## Baselines — régénérées, regardées, promues

`visual-baselines.yml` rejoué sur la branche (run 34041820027, Ubuntu, vert).
**Six baselines sur huit changent** ; les deux de `fiche-trajectoire-onglet` sont
identiques à l'octet.

Les six ont été **ouvertes à pleine résolution** avant promotion :
`fiche-cockpit` ×2 (identité 19 → 18 px), `fiche-tiroir-besoins` ×2 (titre de
tiroir, même changement), `portail-connexion` ×2. Aucun texte tronqué, aucun
débordement, la barre de navigation basse mobile est à sa place.

**`portail-connexion` était la surprise** : la seule ligne que ce lot touche sur
`login/page.tsx` est conditionnée à une erreur, donc invisible ici. La comparaison
des deux versions montre le titre plus petit de 2 px et tout le bloc remonté
d'autant — l'écran passe par `PatientPageHeader`, dont le titre est passé de
26 à 24 px. Changement réel et voulu, pas de la dérive de rendu. Sans ouvrir
l'image, la conclusion aurait été l'inverse.

Trois commentaires devenus faux ont été corrigés dans la foulée (« 26px »,
« 15,5px », « display 19px ») ; ils ne rendent aucun pixel, les baselines restent
donc valides.

## Prochaine action exacte

Ouvrir la PR (`--base main`), lire le CI par `wn-attendre-ci`, merger si `0`.

## Interdits encore actifs

- Ne jamais promouvoir une baseline sans avoir regardé chaque image.
- Ne pas lire un code de sortie derrière un tube : il rend celui de `tail`.
- Ne pas conclure d'un `visual.spec.ts` vert sur macOS que les pixels n'ont pas
  bougé : hors Linux, il ne compare rien.
