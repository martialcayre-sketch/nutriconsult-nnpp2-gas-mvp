### Corrigé

- **Une passation retirée du raisonnement par le praticien pesait encore sur ce
  qu'il lit** (`A03` de l'audit du 2026-09-06, `D-146`). Deux adaptateurs
  sélectionnaient `statutValidite` en base puis le perdaient en reconstruisant
  l'objet passé au moteur de trajectoire. Le moteur porte pourtant le filtre —
  il n'était jamais atteint.
- **Mesuré, pas supposé** : le mutant qui remet les adaptateurs dans leur état
  d'avant rend `{ tendance: 'stable', delta: 0 }` pour une passation
  explicitement écartée. Ce n'est pas une donnée manquante affichée comme
  manquante, c'est une lecture fabriquée à partir d'une passation que le
  praticien avait retirée. Le drapeau `WN_ENABLE_VALIDITE_PASSATIONS` étant posé
  en production depuis le 2026-08-19, le défaut était **actif**.
- **La cause racine était le type, pas les adaptateurs.** `ReponseBrute`
  déclarait `statutValidite?: string | null` et son commentaire assumait
  « absent, la passation vaut VALID ». Un champ facultatif dont l'absence
  signifie « valide » rend l'oubli indiscernable d'une affirmation. Il est
  obligatoire ; passer `null` reste possible, mais c'est alors un geste écrit.
- **Le rendre obligatoire a trouvé un troisième site que personne n'avait vu** —
  ni l'audit, ni l'instruction, ni la contre-épreuve adverse :
  `clinical-engine/clinicalSnapshot.ts:151`, dans la chaîne C1. Ses entrées sont
  filtrées en amont, l'oubli y était donc inoffensif — mais silencieux. Il y
  porte désormais un `null` explicite qui nomme l'hypothèse et dit quoi faire le
  jour où elle tombe.

### Sécurité

- `adaptateursValidite.test.ts` prend les deux adaptateurs par leur seule sortie
  observable — le momentum — avec une passation retirée. Aucun banc ne couvrait
  ces deux fichiers ; c'est ce banc qui aurait attrapé `A03`. Mutant prouvé rouge
  sur les deux.
- Deux cas au niveau du moteur, en paire : drapeau allumé, la passation retirée
  ne mesure plus son jalon ; drapeau éteint, elle le mesure encore. Sans le
  second, le premier pourrait passer au vert pour une raison sans rapport.

### Note

- L'instruction affirmait qu'une passation invalidée « peut ancrer T0 ».
  **C'est faux** — `resoudreDateT0` est inatteignable par ces chemins. La
  démonstration est consignée en `D-146` §5 pour que l'affirmation ne revienne
  pas : c'était le point le plus alarmant du dossier, et il ne tenait pas.
- Portée bornée : le défaut est inerte sans épisode d'ancre confirmé et ne mord
  que sur onze questionnaires sur soixante-cinq. Le nombre de passations
  non-`VALID` en production reste **non établi**.
