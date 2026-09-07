# CLAUDE.md — Wellneuro NNPP2

Contexte pour Claude Code, lu à chaque session : chaque ligne est repayée à
chaque tour — rester court, pointer les détails. Les règles spécifiques à un
sous-système vivent dans `.claude/rules/` (chargées par chemin, nativement).

## Stack

- Next.js 15 (App Router) — code dans `web/`
- Prisma + PostgreSQL (add-on Scalingo, HDS)
- NextAuth — OAuth Google restreint au domaine `@wellneuro.fr`
- Déploiement Scalingo `osc-fr1` (`app.wellneuro.fr`, cutover 2026-08-22) —
  Vercel/Supabase **décommissionnés le 2026-09-01** (`D-080`, exécution
  `D-120`, preuve au registre RGPD)

Application de consultation en neuronutrition **en production**. Google Apps
Script et Google Sheets sont décommissionnés (`archive/gas-legacy/`, référence
seule). Priorité absolue : stabilité en production, pas de migration
technologique sans demande explicite. État courant :
`docs/claude/PROJET_CONTEXTE.md`.

## Règles non négociables

- **Jamais de secret en dur** (clés API, tokens, mots de passe) : variables
  d'environnement uniquement (`web/.env.local` en dev, Scalingo en prod),
  jamais committées.
- **UI en français** : tout texte visible par l'utilisateur.
- **Changements minimaux** : pas de refactoring, renommage ou réorganisation
  non demandés.
- **Pas de migration Prisma ni de modification de `schema.prisma`** sans
  demande explicite dans la conversation.
- **Pas de SQL destructif** sans confirmation explicite (DROP, DELETE sans
  WHERE, TRUNCATE).
- **Pas de modification de la logique clinique ou des seuils** sans demande
  explicite (décision `D-xxx` + fragment `changelog.d/`).
- **Base de production (Scalingo depuis le 2026-08-22) : lecture uniquement
  depuis un conteneur `scalingo run -d`, écriture uniquement par migration
  relue puis release-db approuvée (`D-087`, qui supplante `D-086` §1-2 — le
  one-off applique APRÈS approbation humaine, le `postdeploy` ne migre plus
  sous drapeau)**. La base Supabase gelée n'existe plus (`D-120`) ; son
  outil MCP, lui, reste branché et n'est neutralisé que par les refus de
  `.claude/settings.json`. Détail : `.claude/rules/db-prisma.md`.

## Données patients

**Aucune identité réelle dans le dépôt** — code, seeds, tests, démos, docs,
messages de commit. Les fixtures portent trois identités neutres : **Sophie
Nicola, Jennifer Martin, Michel Dogné**. Ce sont des identités de fixture, pas
la liste des dossiers qui existent.

**Les dossiers de test sont réels et vivent en production** (arbitrage
praticien du 2026-08-18, `D-075`). Ils se **lisent par leur identifiant**
depuis un conteneur `scalingo run -d` — c'est la façon normale de vérifier un
comportement sur un vrai dossier. Deux interdits demeurent, et ils ne sont pas de forme :

- **jamais désignés par leur nom ou leur e-mail dans le dépôt** — l'historique
  Git et les logs CI ne s'effacent pas ;
- **jamais visés par un seed ou un E2E** : `web/prisma/seed.ts` écrit des
  réponses de questionnaire, et une réponse fabriquée déposée dans un dossier
  réel est une donnée que personne n'a produite — elle alimenterait ensuite
  scoring, orientation et indications (`DC-01`, `DC-24`).

Ne jamais générer, dériver ou « compléter » des données patient réelles, même
si elles apparaissent dans un fichier ouvert ou un log collé par erreur.

**Une fixture prouve un mécanisme, elle ne décrit pas un parcours** (`D-125`).
Les trois identités servent au CONTRÔLE — déterministe, rejouable en CI, seule
forme admise en seed et en E2E. Ce qui se passe réellement — ordre, délais,
décrochages, gestes non engagés — ne se lit que sur les dossiers réels, par
identifiant, depuis un conteneur. Ne jamais conclure d'un parcours de fixture
qu'un patient a été bloqué, oublié ou servi.

## Constitution clinique

Invariant permanent : **aucune règle clinique sans provenance certifiée, aucun
seuil, dose, poids ou borne inventé** ; toute modification clinique exige une
décision `D-xxx` et un fragment `changelog.d/`. Les 58 règles `DC-nn` :
`docs/claude/doctrine/` ; rappel automatique sur les chemins cliniques :
`.claude/rules/clinique-scoring.md`.

## Comportement par défaut — développeur senior

- Comprendre avant de modifier ; commencer par l'hypothèse la plus simple.
- Limiter l'investigation au périmètre utile : `Grep`/`Glob` pour localiser
  avant de lire, `Read` borné sur les gros fichiers.
- Changement minimal ; pas de refactoring « au passage », pas d'élargissement
  spontané du périmètre, pas d'abstraction sans bénéfice concret.
- Ne pas re-questionner une décision confirmée ni réexpliquer l'établi :
  l'exécuter, sauf fait nouveau qui change réellement le choix.
- Ne questionner l'utilisateur que sur une ambiguïté qui change le résultat et
  que le dépôt, Git/GitHub ou les outils disponibles ne peuvent pas résoudre.
- Narration limitée aux résultats intermédiaires utiles, blocages, risques
  nouveaux et changements de plan — pas ses propres évidences.
- Aller droit au résultat vérifiable ; tester proportionnellement au risque.
- **Règle d'arrêt** : cause et correctif minimal établis ⇒ arrêter
  l'exploration — sauf incertitude de sécurité, clinique ou de données.
- Un état Git/GitHub collecté (status, diff, snapshot PR) se réutilise jusqu'à
  la mutation qui le périme — jamais recollecté par réflexe.
- Signaler rapidement un blocage réel plutôt que le contourner en silence.

## Modèle, effort, exécution

**Défaut : Sonnet 5 + effort high + exécution solo** (déjà épinglé dans
`settings.json`) — couvre ~80-90 % du courant : TypeScript, React, Next.js,
docs, tests, CRUD, corrections, Git/GitHub.

- **Opus** sur signal concret : sécurité, auth, revue critique,
  migration/Prisma sensible, clinique/scoring, bug résistant — ou un seul
  signal fort de la liste Fable.
- **Fable** : exceptionnel (< 10 %), au moins deux signaux forts —
  architecture transverse, arbitrage difficile entre solutions plausibles,
  cause racine introuvable après investigation sérieuse, décision engageant
  plusieurs lots. Architecte/conseiller, jamais CRUD, docs, tests, clôture ou
  bug déjà localisé.
- **Ultracode** = largeur parallélisable, opt-in explicite, ponctuel — jamais
  la profondeur d'un bug local. Fable+Ultracode : rare (profondeur ET largeur).
- **Effort natif** : low (mécanique), medium (simple), high (défaut), xhigh
  (exceptionnel), max (quasi jamais) — jamais augmenté sans signal.
- L'escalade est déterministe : un des signaux ci-dessus, sinon le défaut.
  Elle ne se narre pas et n'ajoute aucune couche de routage — elle s'exécute.
- Le frontmatter `model:`/`effort:` des agents `.claude/agents/` fait foi.
- Exploration : agent natif `Explore`. Planification : mode Plan natif ;
  `/model opusplan` quand le plan est le morceau difficile — jamais deux
  planifications pour une même tâche.
- Revue proportionnelle au risque (P0/P1/P2, budgets, signaux d'escalade) :
  `docs/claude/POLITIQUE_REVUE.md`. Ordinaire : `/code-review medium` (nommer
  le niveau — il réutilise sinon le dernier tapé) ; fort risque : agent
  `wn-reviewer` ; sécurité : `/security-review`. Contre-audit Codex : geste
  manuel de l'utilisateur (diff collé) — jamais d'intégration automatisée,
  jamais de seconde passe sans signal.

## Garde-fous d'écriture (hooks)

Trois verdicts — **refus**, **demande**, **silence**. Leur portée n'est pas
absolue, et la croire absolue est le risque : le crochet d'écriture n'arme que
`Edit|Write` — une écriture par `Bash` n'y passe pas — et le crochet Bash sort
sans rien lire si `WN_ALLOW_RISKY_COMMAND=1`. Détail :
`.claude/rules/hooks-garde-fous.md`.

## Validation

| Palier | Commande | Quand |
|---|---|---|
| T1 | `cd web && npm run check` | après chaque édition |
| T2 | `npm run test:worktree -- --fast` | avant tout commit UI ou API |
| T3 | `npm run test:worktree` | avant une PR migration/scoring/clinique |

- T1 ne joue pas de suite complète ; la première passe entière est T2 — c'est
  T2 qu'il faut lancer avant de conclure qu'une suite est verte.
- Rediriger la sortie d'une suite vers un fichier puis la relire ; ne jamais
  relancer une suite pour en relire la sortie.

## Commandes utiles

```bash
cd web && npm run dev              # serveur local
cd web && npx prisma generate      # régénérer le client après modif du schéma
bash scripts/check_no_secrets.sh   # anti-secrets (--staged : lignes indexées)
node scripts/wn-cycle.mjs          # phase du cycle de lot (--appliquer : resynchronise l'état)
node scripts/wn-etat-reel.mjs      # état réel du dépôt — rapporte, ne répare jamais
```

## Avant de committer

- `bash scripts/check_no_secrets.sh` ; aucun fichier `.env*` ; textes UI en
  français.
- Changelog et handoffs par fragments ; la clôture passe avant la PR, pas
  après le merge — détail : `.claude/rules/docs-changelog.md`.

## PR, CI, merge

- Ouvrir la PR avec `--body-file` et un diff d'une seule finalité.
- Attendre le CI en un seul appel bloquant :
  `node scripts/wn-attendre-ci.mjs <N>` — jamais de `gh pr checks` en boucle.
  **`0` est le seul code de sortie qui autorise à annoncer une PR prête.**
- Revue, merge et suppression des branches appartiennent à Copilot, sauf
  autorisation transitoire en cours. Détail :
  `docs/claude/REGLES_PR_MERGE.md`.

## Documentation de référence

- `docs/claude/README.md` (vue d'ensemble) · `PROJET_CONTEXTE.md` (état
  courant) · `REGLES_CRITIQUES.md` (sécurité/clinique) ·
  `WORKFLOW_DEVELOPPEMENT.md` · handoffs : `docs/claude/handoffs/README.md`
- `docs/ROLES_MACHINES.md` (machines, worktrees, E2E) ·
  `docs/ROADMAP_TECHNIQUE.md` · `docs/HISTORIQUE_CHANTIERS_TECHNIQUES.md` ·
  `docs/ROADMAP_PRODUIT.md`
- **Le préfixe `R` désigne trois séries sans rapport** (technique, produit,
  réserves d'audit) : toujours qualifier la série, un `R6` nu est ambigu.

## Début de session

- Si `docs/claude/SESSION_LOG.md` existe, lire silencieusement sa dernière
  entrée avant de répondre à la première question.
- **Une session = un worktree** (outil `EnterWorktree`, ou `git worktree add`)
  — jamais de `checkout`/`switch` dans le worktree d'une autre session.
- Le hook de fraîcheur Git impose une branche contenant `origin/main` au
  démarrage et rejuge à chaque tentative d'édition. Jamais de
  pull/merge/rebase automatique ; un historique divergent se réconcilie par
  arbitrage humain.

## Fin de session

Sur demande d'un « résumé de session » : < 150 mots (décisions, options
écartées et pourquoi, prochaine action, questions ouvertes), ajouté en append
à `docs/claude/SESSION_LOG.md` sous un titre `## [date] — [sujet]`, sans
demander confirmation (log interne, sans donnée sensible).

## Définition de done

Changement limité au périmètre demandé ; pas de secret ni donnée sensible
introduits ; documentation mise à jour si nécessaire.
