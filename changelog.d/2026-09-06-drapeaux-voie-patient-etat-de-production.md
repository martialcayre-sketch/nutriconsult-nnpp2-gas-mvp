### Les quatre drapeaux de la voie patient disent leur état de production (2026-09-06)

`docs/FEATURE_FLAGS.md` datait scrupuleusement les activations du § A —
`WN_CB_PROPOSITION` « POSÉE le 2026-08-18 », `WN_RECHERCHE_CORPUS_ENABLED`
« le 2026-08-22 » — puis s'arrêtait pile au § B. Les quatre drapeaux qui
commandent **toute** la voie patient n'y portaient aucun état.

Le dépôt attestait pourtant chacun d'eux, ailleurs, et depuis des semaines. Ce
n'était pas une information manquante : c'était une information dispersée hors
du document qui a précisément pour objet de la porter.

- **`WN_G4_LIEN_MAGIQUE`** — posé en Production le **2026-07-21**
  (`ACTIVATION_RUNBOOK_G4.md`, constaté à `CHECKLIST_ACTIVATION_G_TRUST_04.md`).
- **`WN_G4_REDEMANDE_PATIENT`** — constaté actif le **2026-08-05** par lecture
  des logs runtime (handoff du même jour). Surface publique non authentifiée.
- **`WN_G5_GOOGLE_PATIENT`** — posé le **2026-07-22**, avec une connexion
  patient réelle tracée le jour même : une porte qui a effectivement servi.
- **`WN_ENABLE_VALIDITE_PASSATIONS`** — posé à `1` le **2026-08-19** par
  [[D-077]]. La note du tableau décrivait le filtre comme « inerte » : c'était
  l'état **antérieur**. [[D-050]] et [[D-052]] disent encore « éteint » et
  n'ont pas été révisées ; elles datent de la vérification du 2026-08-12.

**Pourquoi cela comptait.** Un défaut derrière un drapeau éteint et un défaut
servi à des patients ne se traitent pas au même rang. Le classement d'un
constat du portail est faux tant que le lecteur ignore quelle porte est
ouverte — et le tableau est l'endroit où il va chercher.

**Réserve inscrite, non levée.** Les quatre dates sont antérieures à la
migration Scalingo : elles attestent l'activation, pas l'état d'aujourd'hui.
Chaque ligne porte désormais le geste qui la confirmerait — un `env-get` de
deux minutes, hors dépôt.

Aucune migration, aucun seuil de scoring touché, aucun code modifié.
