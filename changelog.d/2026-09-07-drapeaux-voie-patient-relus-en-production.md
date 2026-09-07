### Les quatre portes de la voie patient sont ouvertes — relu, plus déduit (2026-09-07)

La veille, `docs/FEATURE_FLAGS.md` recevait l'état attesté des quatre drapeaux
qui commandent l'entrée d'un patient, avec une réserve explicite : les dates
connues étaient **antérieures à la migration Scalingo**, et attestaient
l'activation, pas l'état du jour. Chaque ligne portait le geste qui la
confirmerait.

Ce geste est fait. `scalingo --app wellneuro --region osc-fr1 env-get`, le
2026-09-07, sur les quatre variables et elles seules :

| Drapeau | Valeur en production |
|---|---|
| `WN_G4_LIEN_MAGIQUE` | `true` |
| `WN_G4_REDEMANDE_PATIENT` | `true` |
| `WN_G5_GOOGLE_PATIENT` | `true` |
| `WN_ENABLE_VALIDITE_PASSATIONS` | `1` |

**Ce que cela règle, au-delà du tableau.** Un constat du portail derrière un
drapeau éteint et un constat servi à des patients ne se traitent pas au même
rang. Le classement n'a plus à supposer : les quatre portes sont ouvertes, donc
tout défaut du parcours patient est un défaut servi.

En particulier, une correction en attente — faire que le geste par défaut du
praticien porte un lien qui OUVRE, au lieu de pointer une page de connexion —
n'avait de sens que si `WN_G4_LIEN_MAGIQUE` était posé : drapeau éteint, la
route du lien magique rend un 404 à corps nul, et le correctif enverrait les
patients dans le mur. La précondition est levée.

Aucun secret lu, aucune donnée patient touchée : quatre noms de variables
booléennes, interrogés un par un.
