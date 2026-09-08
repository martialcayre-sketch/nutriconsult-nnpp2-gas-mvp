### Ajouté

- **Un objectif écrit par le praticien prévient le patient** (`M02` de l'audit
  du 2026-09-06, `D-154` — arbitrage du responsable rendu en session). Nouveau
  gabarit au registre, `objectif_propose@1`, premier message qui n'ouvre pas un
  accès mais **appelle un geste** : relire l'objectif et dire s'il correspond.

### Note

- **La prémisse de l'audit était périmée** : il notait `WN_OBJECTIF_PROPOSE`
  absent ; il est posé. La chaîne était donc entièrement ouverte, et rendait
  toujours 4 propositions, 1 objectif négocié, **0 ratification**. Ce n'est pas
  un drapeau qui manquait — c'est l'appel.
- **L'énoncé ne voyage pas.** Il porte les mots du patient sur ce qui l'amène :
  le message dit qu'un texte attend, il ne le transporte pas. Précédent :
  l'audit HDS du 2026-07-24 a retiré le motif de consultation de l'e-mail.
- **Le gabarit n'est pas validé** (`valideLe: null`). Le responsable a arbitré
  qu'un e-mail parte, pas ce texte — le registre le dit au lieu de l'inventer.
- **Un échec d'envoi n'annule pas l'écriture** : l'objectif est déjà en base,
  l'envoi est hors transaction, et son échec est journalisé donc visible sur la
  fiche (`D-148`).
- **Un garde-fou a été retiré parce qu'il était inatteignable** : le contrôle de
  cycle de vie placé dans la notification ne faisait rougir aucun banc quand on
  le supprimait — le POST refuse déjà 409 à l'entrée. Deux bancs passaient pour
  la mauvaise raison ; ils éprouvent maintenant la vraie porte.
