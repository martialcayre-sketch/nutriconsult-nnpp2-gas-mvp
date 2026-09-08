### Modifié

- **Un `T0` embarque désormais tout l'état d'entrée du dossier**, et non les
  seules réponses tombées à ±8 jours de la première (`D-156`, arbitrage du
  responsable). L'ancre ne bouge pas : c'est la borne HAUTE de l'inclusion qui
  tombe. Un jalon de mesure (J21, J42, J90) garde sa fenêtre, et une ancre qui
  ROUVRE un suivi (`T1`, `T2`…) aussi — sans quoi chaque réouverture
  embarquerait tout l'historique.

### Mesuré

- **Les quatre `T0` confirmés en production embarquaient déjà tout**, à la main :
  13/13, 19/19, 14/14 et 25/25 réponses incluses, alors que 5 à 17 d'entre elles
  étaient hors fenêtre. Trente-trois réinclusions manuelles pour quatre actes,
  sans une seule exception. La borne haute n'écartait rien — elle imposait un
  geste dont le seul aboutissement possible était l'oubli.

### Ce que ce lot ne fait pas

- **Il n'exige pas encore le second rideau** pour confirmer un `T0` : c'est la
  demande d'origine, et elle vient dans un lot distinct. L'ordre est délibéré —
  livrer la composition d'abord garantit qu'aucun `T0` confirmé entre les deux
  ne soit bâti sur le premier rideau seul.
- Il ne touche ni `TOLERANCE_JOURS_JALON` (seuil clinique partagé), ni
  `targetAt`, ni `confirmedAt`, ni les quatre épisodes déjà en base.

### Réserves

- Une proposition ouverte au moment du déploiement change d'empreinte : un `409`
  au POST, résorbé par un rechargement.
