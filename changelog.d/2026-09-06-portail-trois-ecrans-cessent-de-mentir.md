### Portail : trois écrans cessent de dire au patient l'inverse de ce qui se passe

Trois défauts sans lien de code, mais de même nature : **le serveur connaît la
vérité et l'écran affirme autre chose.** Aucun schéma, aucun seuil, aucun
drapeau — trois textes et une garde.

- **La confirmation d'épisode annonçait ne rien écrire.** « Cette confirmation
  reste en mémoire et ne modifie aucune donnée » se lisait au-dessus du geste
  qui enregistre l'épisode — et que [[D-129]] vient précisément de rendre
  ÉCRASANT sur une re-confirmation divergente. L'écran dit maintenant ce que le
  clic fait : il enregistre, une nouvelle confirmation remplace la sélection
  retenue, et la date de l'acte ne bouge pas. La phrase n'était gardée par
  aucun banc ; elle l'est.
- **La racine du portail fermait la porte au patient qui a tout rempli.**
  `premiereAssignation` ne compte que les assignations NON complétées
  (`session/route.ts`, `statut: { not: 'Complété' }`) : elle est donc null
  aussi bien pour un dossier sans assignation que pour un patient qui a tout
  rendu. L'écran de fin conditionnait le lien vers le hub à ce champ — et
  annonçait des questionnaires « prochainement » à quelqu'un qui n'en attendait
  aucun. Le lien ne dépend plus de rien, et le libellé ne promet plus à la
  place du praticien. Le hub est justement l'écran qui sait dire « transmis /
  en préparation / restitution disponible ».
- **« Demander une correction » échouait en silence.** Le geste ne traitait que
  `data.ok`. Tous les refus rendus par la route — 401, 403, 409
  `invalid_state`, 410 expiré ou annulé — laissaient l'écran strictement
  inchangé, et une panne réseau n'était pas rattrapée du tout. Le patient
  recliquait sur un geste déjà refusé. Le motif s'affiche désormais dans le
  rendu qui existait déjà, remis à blanc à chaque tentative pour qu'il porte
  sur celle-ci et non sur l'échec de chargement d'avant.

Six mutants joués sur les trois gardes, six tués : rétablir l'ancienne phrase,
rétablir la garde sur le lien, rétablir la promesse « prochainement », retirer
la branche de refus, vider le `catch`, retirer la remise à blanc.

Aucune migration, aucun seuil de scoring, aucune route serveur touchée.
