---
description: Cadre un écran ou un panneau WellNeuro avant d'écrire du code — primitive existante ou création, thème, états obligatoires, palier de validation. À déclencher avant de créer une surface ou d'en refondre une ; PAS pour un correctif visuel d'une ligne, où il coûte un tour pour rien. Lecture seule par défaut ; n'écrit qu'après acceptation explicite.
argument-hint: "<écran ou panneau> [go]"
disable-model-invocation: true
effort: medium
---

# WellNeuro — cadrage d'une surface

## Contexte — chargé ici une fois, et une seule

!`cd "$(git rev-parse --show-toplevel)" && ls web/src/components/ui/*.tsx | grep -v '\.test\.' | grep -v '\.guard\.' | xargs -n1 basename`

Cible : `$ARGUMENTS`

## Ce qui est déjà tenu par une machine — ne pas le réauditer à la main

Deux gardes tournent en T1 et rendent inutile toute relecture humaine de leur
périmètre :

| Garde | Ce qu'elle tient |
|---|---|
| `design-system.guard.test.ts` | `bg-white` en dur, `text-[13px]`/`text-[14px]`, palette native de Tailwind |
| `PanneauSuperpose.guard.test.ts` | `theme="patient"` absent sur une surface patient |

**Ne pas réécrire ces règles en prose dans un cadrage.** Elles ont quitté la
prose le jour où elles sont devenues des tests ; les répéter les fait dériver
d'un côté au moins, et c'est le côté qu'on ne relit pas.

## 1. La question d'abord : cette primitive existe-t-elle déjà ?

Vingt-cinq primitives vivent dans `web/src/components/ui` (listées ci-dessus).
`.claude/rules/frontend-ui.md` en tire une règle : **ne pas créer un composant
si l'un d'eux répond au besoin.** Le cadrage rend donc, avant toute autre
chose, trois listes :

- **ce qui est repris tel quel** — nommer la primitive ;
- **ce qui est étendu** — nommer la primitive et la prop ajoutée ;
- **ce qui est créé** — et pourquoi aucune primitive ne convenait.

La troisième liste se justifie, les deux premières non. Une troisième liste
longue est le signal à remonter, pas à exécuter.

**Une migration vers une primitive se fait à apparence constante.** Si
l'adoption demande de déplacer un panneau, d'ajouter une affordance ou
d'inventer du texte, c'est la migration qui a tort, pas l'écran — c'est la
règle qui a produit les six exclusions de `PanneauSuperpose` le 2026-09-03.

## 2. Le thème se choisit ; il ne se subit pas

Deux univers, deux jeux de tokens : `praticien` (cockpit, rail sombre) et
`patient` (portail). Le cadrage dit lequel, en une ligne, avant le premier
composant — le défaut de `globals.css` est le thème PATIENT, si bien qu'une
surface praticien qui ne se nomme pas se repeint sans que rien ne rougisse
hors de la garde citée plus haut.

## 3. Les quatre états, ou l'écran n'est pas cadré

Un écran n'est pas une vue pleine : c'est quatre vues. Le cadrage les rend
toutes les quatre, avec leur texte réel en français :

1. **vide** — une invitation à agir, jamais un constat d'absence ;
2. **chargement** — squelette si la forme est connue (`MetricCardSkeleton` en
   donne le patron), sinon rien plutôt qu'un spinner ;
3. **erreur** — ce qui s'est passé et ce qu'on peut faire, dans la voix de
   l'interface, sans excuse ni vague ;
4. **dense** — l'écran au maximum réaliste de données, pas au minimum
   confortable. C'est celui qu'on oublie et celui qui casse.

## 4. Ce qui n'est PAS un écart — le piège de ce dépôt

Le 2026-09-06, un audit a compté **184 `<button>` bruts hors de
`components/ui/` contre 12 imports de `Button`**, et en a conclu à une dérive.
La mesure suivante a montré que **zéro** d'entre eux rejoue une variante de
`Button` : ce sont des onglets, des lignes de liste, des boutons d'icône —
que `Button` et ses trois variantes ne savent pas exprimer. Le nombre était
juste, la conclusion fausse.

La même session a produit deux autres faux positifs, tous deux instructifs :

- le seul `bg-white` de l'arbre vit dans un **commentaire** de `PatientCard`
  documentant ce que le composant a remplacé — un fichier qui NOMME un motif
  proscrit ne l'EMPLOIE pas ;
- cinq « boutons sans nom accessible » n'existaient pas : la regex se
  trompait de borne au premier `onClick={() => …}`, dont la flèche porte un
  `>`. Le parseur TypeScript en rend **zéro**. Le piège est écrit depuis le
  2026-09-03 en tête de `PanneauSuperpose.guard.test.ts`.

**Règle qui en sort : un écart s'établit sur un comptage qualifié, jamais sur
un `grep` brut.** Avant de nommer une dérive, ouvrir trois occurrences et
vérifier qu'elles sont ce que le motif prétend.

## 5. La question ouverte à ne pas trancher seul

L'échelle typographique du §10 énumère sept paliers sans dire si la liste est
fermée, et `fontSize` vivant sous `theme.extend`, les paliers natifs de
Tailwind survivent. L'arbre s'en sert : **117 usages** de
`text-lg`/`xl`/`2xl`/`3xl`, plus **19 tailles arbitraires** hors des deux que
le §10 proscrit (`text-[15.5px]`, `text-[10.5px]`, `text-[1.875rem]`).

Un cadrage qui rencontre ce cas le **signale** et prend le palier nommé le
plus proche pour son propre écran. Il ne lance pas la migration : elle déplace
des pixels sur douze fichiers, et les baselines visuelles ne comparent aucun
pixel hors Linux.

## 6. Validation — une suite verte en local ne prouve rien sur un parcours

Un changement d'UI se rejoue en E2E : `npm run test:worktree -- --fast` (T2).
Vitest ne visite aucun écran. Le cadrage nomme, avant d'écrire, le parcours
E2E qui prouvera l'écran — ou dit qu'il faut l'écrire.

## Sortie

1. **Primitives** — reprises, étendues, créées (avec la justification des
   créations, elles seules).
2. **Thème** — `praticien` ou `patient`, en une ligne.
3. **Les quatre états**, texte français réel.
4. **Écarts constatés** — chacun avec son comptage qualifié, jamais un `grep`
   nu ; et ce qui a été écarté comme faux positif, avec sa raison.
5. **Validation** — le parcours E2E qui prouvera l'écran.

Sans `go`, ne rien écrire : rendre le cadrage et s'arrêter.
