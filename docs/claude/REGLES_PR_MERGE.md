# Règles PR, CI et merge — Wellneuro

Ce document porte le détail de la gouvernance des PR : attente du CI, régime de
revue et de merge, exception migration/authentification.

**Pourquoi ici et non dans `CLAUDE.md`.** Ces règles ne servent qu'au moment
d'ouvrir, suivre ou merger une PR — mais `CLAUDE.md` est relu *intégralement à
chaque requête de chaque session*. Elles y coûtaient 7 417 o (27,8 % du fichier)
payés partout, et étaient de surcroît rechargées une seconde fois par
`/wn-merge` au moment utile. Sorties ici, elles sont payées une fois, là où elles
servent. `CLAUDE.md` garde la décision non négociable et renvoie ici pour le
détail ; `/wn-merge` charge ce fichier entier.

Rien n'a été réécrit lors du déplacement : le texte ci-dessous est celui qui
était dans `CLAUDE.md` jusqu'au 2026-08-07.

## Attendre le CI d'une PR — un script, plus un idiome

```bash
node scripts/wn-attendre-ci.mjs <N>     # un seul appel bloquant, en tâche de fond
```

Un seul appel bloquant remplace le sondage répété (le 2026-07-20, une session a
produit 81 appels de `gh pr checks` pour l'information que cet appel rend en un
seul). Mais la boucle `until … bucket=="pending"` qui tenait ce rôle jusqu'au
2026-08-03 **ne distinguait pas « aucun check en attente » de « aucun check du
tout »** : elle rendait la main sur deux checks Vercel verts quand `verify`
n'avait jamais été créé. C'est arrivé sur la PR #550, et le correctif a dû être
refait à la main sur #553. Une règle oubliée deux fois devient exécutable.

| Code | Sens | Geste |
|---|---|---|
| `0` | les checks **obligatoires** ont tourné et sont verts | annoncer la PR prête |
| `1` | un check obligatoire a échoué | lire le log, corriger |
| `2` | un check obligatoire **n'a pas tourné** — absent, gelé en `action_required`, ou run **annulé** (`concurrency`) sans remplaçant | le script nomme **toutes** les causes applicables ; ne pas merger |
| `3` | délai dépassé sans conclusion | expirer n'est pas réussir |
| `4` | **indéterminé** — PR illisible ou mergée, `gh` muet, ou liste des checks obligatoires illisible | aucun verdict ; ne pas merger |
| `5` | les checks sont verts mais la PR est **en conflit** | ce vert porte sur un commit qui n'est pas le résultat fusionné |

**`0` est le seul code qui autorise à annoncer une PR prête.** Les cinq autres
disent, chacun à sa façon, qu'on ne peut pas l'affirmer — y compris `4`, qui
couvre le cas où la liste des checks obligatoires n'a pas pu être lue : ne
sachant plus ce qu'il fallait attendre, le script se tait plutôt que de replier
en silence sur `verify`.

La liste des checks attendus vient de la **protection de branche** (`verify`
aujourd'hui), pas d'une constante : un second check rendu obligatoire est suivi
sans toucher au script. Ce qu'il ne fait pas : merger, ou dire s'il faut merger.
Un même nom porté par **deux runs** n'est vert que si les deux le sont — le
rouge ne se laisse pas écraser par l'ordre du tableau. (Le cas venait des
branches `campaign/**`, que `ci.yml` déclenchait sur `push` *et* sur
`pull_request` ; le déclencheur `push` y a été retiré le 2026-08-07, le garde
reste.) Un run **annulé** — `CANCELLED`, la trace normale d'un run supplanté
depuis le bloc `concurrency` de `ci.yml` — n'est ni vert ni un échec : le script
attend le run du commit de tête, puis sort en `2`.

Gabarit de corps de PR et check-list complète : le skill `/wn-pr` (invocation
manuelle ; ces idiomes valent pour **toute** ouverture de PR, `/wn-pr` invoqué ou non). <!-- mention-seule: wn-pr -->

## Revue, merge et suppression des branches — le ressort de Copilot

**Décision du 2026-07-21.** La revue de code, le merge des PR et la suppression
des branches appartiennent à **Copilot**. L'assistant ouvre la PR, vérifie que le
CI est vert, annonce l'état — et s'arrête là.

Deux raisons, données ensemble : un **regard différent** sur le code (une revue
par l'agent qui vient de l'écrire est une relecture, pas une revue), et le **coût
en tokens** — suivre un CI, relancer, merger puis nettoyer consomme des
allers-retours pour un travail qu'un autre outil fait sans eux.

En pratique : pas de `gh pr merge`, pas de `git push origin --delete`, pas de
suppression de worktree rattaché à une PR ouverte. Le nettoyage post-merge n'est
pas une tâche en attente côté assistant.

**Effet de bord à connaître.** Quand le commit de tête d'une PR est attribué au
bot Copilot (un merge de `main` résolu par lui, par exemple), GitHub met le run
`pull_request` en `action_required` et **n'exécute rien** sans approbation
humaine. `gh pr checks` n'affiche alors que les checks Vercel, **sans `verify`** :
la PR paraît verte alors que la vérification n'a jamais tourné. Vérifier la
présence de `verify`, et débloquer en poussant un commit sous le compte du dépôt
— `POST /actions/runs/{id}/approve` ne s'applique qu'aux PR issues de forks.

### Quand une autorisation transitoire permet de merger : le sujet est à poser

**Le sujet du commit de squash vient du COMMIT de branche, pas du titre de la
PR.** Réglage du dépôt : `squash_merge_commit_title = COMMIT_OR_PR_TITLE` —
GitHub prend le titre du **commit** quand la branche ne porte qu'un seul commit
*réel*, les commits de fusion ne comptant pas. **Éditer le titre de la PR ne
change donc rien**, et `gh pr edit --title` donne l'illusion inverse.

Le cas où ça mord : une décision renumérotée en cours de route (fréquent — le
numéro ne se réserve qu'au merge, voir l'en-tête de
`scripts/lib/decisions-numerotation.mjs`). Le registre porte `D-147`, le sujet
du commit annonce `D-145`, et `main` ne se réécrit pas. Trois PR en portent la
trace : #943, #949, #950 — celle de #949 citant un `D-145` qui **existe** et
désigne autre chose, si bien que remonter du `git log` au registre mène à un
faux ami.

Poser le sujet explicitement, ce qui ne demande aucun `force`-push
(contrairement à un `commit --amend`) :

```bash
gh pr merge <N> --squash --delete-branch --subject "<sujet exact>"
```

Une PR gelée ne peut pas être mergée pour autant : `verify` est un **check
obligatoire** de la protection de `main`, et `enforce_admins` est actif depuis le
2026-07-21 — **personne ne passe outre, propriétaire compris**. Un run gelé
bloque donc le merge au lieu de ressembler à un succès. Pour un correctif
d'urgence, il faut désactiver le réglage explicitement avant de merger
(`gh api -X DELETE repos/<dépôt>/branches/main/protection/enforce_admins`), puis
le remettre. Ce geste doit rester visible et rare.

`strict` reste **désactivé** délibérément : une PR peut être mergée sans avoir
été remise à jour sur `main`. Peu de PR tournent en parallèle ici, et l'activer
imposerait une resynchronisation et un nouveau CI à chaque merge concurrent —
friction quotidienne pour un incident rare.

### Période transitoire — cycle PR complet côté assistant (idiome de merge)

Tant qu'une autorisation en cours confie le suivi du CI, le merge et le nettoyage
à l'assistant (retour au ressort Copilot ci-dessus prévu à l'échéance), cet idiome
**prime sur le « pas de `gh pr merge` » plus haut**. Une fois le CI vert lu (idiome
d'attente ci-dessus), enchaîner en un minimum d'allers-retours :

1. **Vérifier que `verify` a réellement tourné**, pas seulement les checks Vercel
   (effet de bord `action_required` décrit plus haut) ; sans `verify`, ne pas merger.
2. `gh pr merge <N> --squash --delete-branch` — merge et suppression de la branche
   distante en un geste.
3. Supprimer le worktree rattaché une fois la PR fermée (`ExitWorktree`, ou
   `git worktree remove`).
4. **Repartir de `main` pour le lot suivant**, jamais de la branche squashée :
   sinon la PR suivante ré-embarque le lot précédent, la fusion conflictue et
   GitHub ne crée aucun run.

`enforce_admins` reste actif et `verify` obligatoire (plus haut) : une PR gelée
bloque le merge au lieu de ressembler à un succès — ne jamais forcer. Sur une PR
de migration ou d'authentification, appliquer d'abord l'exception ci-dessous.

### L'exception : migration ou authentification

Copilot revoit et merge **aussi** ces PR. Mais avant de lui passer la main, sur
une PR qui porte une migration ou touche l'authentification — praticien
(`web/src/lib/auth.ts`, routes `api/auth`) ou portail patient
(`web/src/middleware.ts`, lien magique, cookie de session,
`patients.access_token`), et plus largement tout chemin touchant
session/token (périmètre repris tel quel par `/wn-merge`) :

1. **Une passe de revue adversariale indépendante** (sous-agent `wn-reviewer`).
   C'est elle qui a trouvé, le 2026-07-21 sur la PR #202, un backfill manquant
   dont l'absence défaisait silencieusement une révocation d'accès. Il n'y avait
   aucune ligne fautive à pointer : le défaut était ce que la migration **ne
   faisait pas**. Une revue de diff ne voit pas cette classe-là.
2. **Après le merge, vérifier la base de production** — la migration s'est-elle
   appliquée, et le backfill a-t-il fait ce qu'il annonçait ? Une lecture
   `execute_sql` suffit (voir « Lire la base de production » dans `CLAUDE.md`).
   Sans cela, un `migrate deploy` ou un import qui a échoué à mi-course lors de
   la release (`release-db`) ne se voit nulle part ailleurs.

Le coût de ces deux gestes se compte en minutes ; celui d'un raté sur
l'authentification ou une migration se compte en accès patients rompus.
