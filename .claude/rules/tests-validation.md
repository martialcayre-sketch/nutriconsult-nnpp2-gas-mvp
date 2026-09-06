---
paths:
  - "web/e2e/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "web/playwright.config.*"
  - "scripts/wn-test-worktree.sh"
---

# Tests et validation — E2E, paliers, machines

- Une suite Vitest verte ne prouve rien sur les parcours : Playwright est dans
  `test:worktree` seulement.
- **Tout diagnostic de parcours étiquette ses constats** (`D-125`) : *observé sur
  un parcours réel*, *démontré dans le code sans occurrence observée*, ou
  *inconnu faute de preuve*. Un défaut démontré se corrige sans occurrence ; sa
  fréquence ne s'invente pas. Et un état incomplet n'est un défaut que si un
  geste était attendu à ce stade — sur une fixture, cette attente est
  artificielle.
- **T2 et T3 jouent tous deux les E2E contre le build de production** depuis le
  2026-08-11 : `--fast` ne saute plus le build. Sur `next dev`, les E2E étaient
  cinq fois plus lents et emportaient le test en cours à chaque recyclage
  mémoire du serveur — un `--fast` rouge se lisait alors comme une régression.
  L'écart entre les deux paliers est désormais le lint, l'anti-secrets, l'audit
  de campagnes et la certification scoring, pas le build.
- **Le segment E2E de T3 relève du CI, pas du Mac, tant que `D-049` tient** —
  un blocage navigateur (WebKit) y fait expirer une navigation sans qu'aucune
  requête parte ; `wn-test-worktree.sh` le classe tout seul. Le reste de T3
  (contrats SQL, dérive schéma↔migrations, certification scoring) reste exigé.
- **Les E2E (`npm run test:e2e`) sont l'exclusivité du Mac** — base partagée,
  jamais deux runs en parallèle. Rôles : `docs/ROLES_MACHINES.md`.
- `test:worktree` provisionne son PostgreSQL éphémère et son secret de test.
  Prérequis et options : `web/e2e/README.md`.
