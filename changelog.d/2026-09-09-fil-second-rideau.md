### Modifié

- **La carte du Fil situe le geste attendu au lieu d'appeler un T0 impossible**
  (`D-158`). Un premier rideau complet n'ouvre plus la confirmation : il ouvre
  le second rideau. La carte porte donc deux états — « second rideau à
  composer » quand rien n'a été assigné depuis la synthèse validée, « second
  rideau rendu, T0 non consigné » quand le patient a répondu.

### Ce que la carte ne fait toujours pas

- **Elle n'évalue aucune précondition dure par dossier** : ni anamnèse, ni
  fraîcheur de la synthèse. Elle situe le dossier dans les trois temps qui
  séparent le premier rideau du `T0`, et rien de plus — les évaluer ici ferait
  un N+1 sur l'écran d'accueil, et ferait dire à une carte ce que seul le
  dossier peut établir.
- **Elle se tait quand la balle est chez le patient** (second rideau assigné,
  pas encore rendu) : appeler alors, ce serait appeler le praticien à attendre,
  et `assignation_en_retard` dit déjà les retards.
- **Elle se tait quand aucune synthèse n'est validée** : `synthese_a_valider`
  porte déjà ce dossier, et deux cartes pour un même geste feraient douter des
  deux.

### Détails de conception

- Deux lectures d'ENSEMBLE de plus dans la route (première validation de
  synthèse par patient, toutes les assignations), jamais une évaluation par
  dossier — même discipline que les trois lectures posées par `D-150`.
- La borne est la **première** synthèse validée, comme la précondition : elle ne
  se déplace pas quand une seconde est validée.
