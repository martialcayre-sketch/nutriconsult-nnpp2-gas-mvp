// Le DISPATCH de NextAuth — la seule surface P0 que rien n'exerçait en réel.
//
// Pourquoi ce spec existe. `src/app/api/auth/[...nextauth]/route.ts` enveloppe
// le handler NextAuth pour y ajouter la corrélation de journal, et son
// commentaire porte un avertissement : **NextAuth v4 détecte le mode App Router
// via la PRÉSENCE de `params` sur le second argument**. L'omettre le fait
// retomber en mode Pages Router, où il lit `req.query.nextauth` — inexistant sur
// une `Request` — et l'authentification praticien tombe ENTIÈREMENT.
//
// Or rien ne l'éprouvait :
// - `route.test.ts` **mocke `next-auth`** et réimplémente le dispatch à la main.
//   Il prouve que le wrapper transmet `context` ; il ne prouve rien du vrai
//   next-auth.
// - `e2e/helpers/auth.ts` **forge** un JWT et pose le cookie de session
//   directement. Aucun des E2E existants ne frappe `/api/auth/*`.
//
// Deux revues indépendantes — contre-expertise Codex et revue interne — ont
// nommé ce trou séparément, sur le même commit (la marche Next 15.5.25, D-139).
// Une convergence de cet ordre désigne la cible mieux qu'un flair.
//
// Ce que le spec assère, et pourquoi c'est suffisant. Il ne teste PAS le flux
// Google : celui-ci exige un compte réel et vit en unitaire avec un jeton forgé.
// Il teste que le dispatch ARRIVE — que next-auth reconnaît l'App Router et
// route l'action. Un repli en mode Pages Router rend 500
// (`Cannot destructure property 'nextauth' of 'req.query'`), jamais 200 : le
// contraste est net, et il ne dépend d'aucun identifiant OAuth valide.
import { test, expect } from '@playwright/test';

// Deux actions volontairement différentes : `csrf` ne dépend d'AUCUN provider
// configuré, `providers` en dépend. Si un jour les identifiants OAuth manquaient
// dans l'environnement de test, `csrf` continuerait de garder le dispatch — le
// spec ne deviendrait pas creux en silence.
const ACTIONS = ['csrf', 'providers'] as const;

test.describe('Dispatch NextAuth — l’App Router est reconnu', () => {
  for (const action of ACTIONS) {
    test(`GET /api/auth/${action} est servi, et rend du JSON`, async ({ request }) => {
      const res = await request.get(`/api/auth/${action}`);

      // 500 ici = repli Pages Router = authentification praticien morte. Le
      // corps est joint au message : sans lui, un échec dirait « 500 » sans
      // dire pourquoi, et coûterait une demi-journée.
      expect(
        res.status(),
        `dispatch NextAuth en échec sur « ${action} » — corps : ${await res.text()}`,
      ).toBe(200);

      expect(res.headers()['content-type'] ?? '').toContain('application/json');

      // Un 200 avec un corps vide passerait le contrôle ci-dessus sans rien
      // prouver : on exige que le corps soit du JSON réellement analysable.
      const corps = await res.text();
      expect(() => JSON.parse(corps), `corps non analysable : ${corps}`).not.toThrow();
    });
  }

  test('le jeton CSRF est présent — la réponse a du contenu, pas seulement un statut', async ({
    request,
  }) => {
    const res = await request.get('/api/auth/csrf');
    const corps = (await res.json()) as { csrfToken?: unknown };
    // `csrfToken` n'existe que si next-auth a réellement exécuté l'action. Un
    // handler qui rendrait `{}` avec un 200 satisferait tout ce qui précède.
    expect(typeof corps.csrfToken, `réponse csrf inattendue : ${JSON.stringify(corps)}`).toBe(
      'string',
    );
    expect((corps.csrfToken as string).length).toBeGreaterThan(0);
  });
});
