### Corrigé

- **Une décision J21 antérieure ne masque plus un point d'étape arrivé après
  elle** (`A04` de l'audit du 2026-09-06, `D-151`). Le Fil lisait « point
  d'étape sans décision » comme une différence d'ensembles : tout patient
  portant au moins un épisode J21 était écarté, quelle que soit la date. La
  règle porte désormais sur la précédence.
- **Le défaut ne demandait pas deux cycles.** Les deux « J21 » vivent sur deux
  calendriers (point d'étape à `approvedAt` + 21 ± 3 j, mesure à `confirmedAt`
  + 21 ± 8 j) : un épisode de mesure confirmé avant l'arrivée du point d'étape
  du **même** cycle suffisait à supprimer la carte définitivement.
- **Deux bancs réécrits, pas complétés** : ils encodaient la règle fautive —
  `new Set(['P-SOPHIE'])` d'un côté, un mock `[{ idPatient }]` sans date de
  l'autre. Ils la tenaient pour voulue, ce qui explique sa survie.

### Note

- **Exposition réelle nulle** : la production ne compte aucun point d'étape
  J21, aucun épisode J21 et aucun second cycle. Comme `D-146`, ce lot ferme une
  trappe **armée et jamais déclenchée**. Sa première vérification réelle viendra
  de la première diffusion d'un protocole, pas d'une date.
- **La jointure par cycle n'est PAS le correctif** : la chaîne
  `checkin → draft → épisode → cycleId` est nullable aux deux maillons et
  l'unique brouillon de production n'a pas d'épisode. Elle apparierait mal ou
  tomberait en silence.
