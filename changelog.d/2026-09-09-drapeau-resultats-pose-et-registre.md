### Ajouté

- **L'étage 2 du rayon biologie est ouvert en production.**
  `WN_CB_RESULTS_ENABLED` a été posé le 2026-09-09 sur demande explicite du
  responsable (`env-set` puis `restart` — Scalingo n'applique pas un changement
  d'environnement aux conteneurs en cours, et un drapeau posé sans redémarrage
  laisse la configuration et le runtime se contredire). **Effectivité constatée,
  non supposée** : une sonde non authentifiée sur
  `/api/praticien/biologie/resultats` rend `401 unauthenticated` et non
  `503 cb_resultats_desactives` — `garderResultats` teste le drapeau **avant** la
  session, ce qui fait de ce couple de codes une preuve du drapeau lu par le
  processus, sans authentification ni donnée touchée.
- **Le document d'information patient passe en `donnees_confidentialite@v6`**
  (`registre.ts`). Il nomme la catégorie : proposition d'exploration remise,
  analyses déclarées déjà faites, et résultats chiffrés — valeur, unité, date de
  prélèvement. Il dit aussi **ce qui n'en est pas fait** : les repères publiés
  sont posés à côté de la mesure, « aucun calcul ne les déclare normaux ou
  anormaux » (la limite que l'écran tient réellement, `D-157`). Nommer une
  catégorie sans dire ce qu'on en fait laisse le lecteur supposer le pire — ou
  le meilleur.
- **La rubrique 5 du dossier RGPD déclare les quatre tables patient du rayon** :
  `ArbitrageBiologique`, `PanelBiologieDocumente`, `DocumentPatientBiologie`,
  `ResultatBiologique`.

### Écart assumé et daté

- **La condition RGPD préalable n'a pas été tenue.** `DOSSIER_RGPD.md` §2
  conditionnait l'ouverture à la mise à jour **préalable** du registre des
  traitements et du document patient. Le drapeau a été posé **avant** ces deux
  mises à jour, sur une vérification qui n'avait retenu que les conditions
  techniques de `D-081` et `D-122` §2. **La condition n'était écrite que dans le
  dossier RGPD** — ni `FEATURE_FLAGS.md`, ni `D-122` §2 qui décrit pourtant le
  geste, ne la mentionnaient.
- **Portée sur les données : nulle.** `resultats_biologiques` comptait **0
  ligne** au constat (`one-off-8343`). La capacité a été ouverte ; aucune donnée
  de santé n'a été traitée hors registre. Arbitrage du responsable, rendu le
  même jour : **laisser posé et combler immédiatement** plutôt que refermer.
- `FEATURE_FLAGS.md` porte désormais la condition RGPD **sur la ligne du drapeau
  lui-même**. Une condition d'ouverture qui ne vit que dans une pièce de
  conformité, et pas dans la documentation de ce qu'elle conditionne, est une
  condition qu'on manque.

### Ce que le constat a trouvé de plus large

- **Dix-sept tables filles de `patients` ne sont pas déclarées en rubrique 5** —
  mesuré en comparant `schema.prisma` au dossier : 38 modèles portent une
  relation vers `Patient`, 21 y étaient cités. Sans rapport avec la biologie, et
  **non corrigées ici** : qualifier une table au sens de l'article 9 est un acte
  juridique, pas une écriture de code. Portées au récapitulatif des trous
  (rubrique 14), porteur « responsable + conseil ».
- **Nouveau banc `rubrique5.modeles.test.ts`** — frère de celui qui tient la
  rubrique 6 au document patient, sur l'autre rubrique. Il compare des **noms de
  modèle**, pas de la prose : toute table fille de `patients` doit être déclarée,
  hors la dette de dix-sept nommée et datée. **Le passif est ouvert, la récidive
  est fermée** : une table ajoutée demain rougit. Un second cas périme la dette
  elle-même — un nom dispensé qui n'est plus une table doit en sortir, faute de
  quoi la liste finirait par couvrir, sous un ancien nom, une table neuve.
  Éprouvé par mutation dans les deux sens, puis rendu au vert.

### Corrigé

- **Un banc a failli s'éteindre sans bruit.** « La v5 est servie bien qu'elle
  partage sa date avec la v4 » prouvait le départage à date égale (`>` et non
  `>=`, sans quoi le patient reste sur le document périmé). La v6, datée du jour,
  prend la date maximale à elle seule : la paire à égalité quittait le chemin de
  `getDocumentCourant` et le cas serait resté **vert en ne prouvant plus rien**.
  Antidater la v6 l'aurait gardé vivant au prix d'un mensonge sur la date de
  publication d'un document patient. Il est réécrit en **propriété** — le
  document servi est le dernier déclaré parmi ceux qui portent la date la plus
  récente — avec l'attente dérivée du registre, jamais d'une copie de la
  comparaison qu'elle vérifie.

### Note

- `requiresAcknowledgement` reste **`false`** pour la v6, comme pour les v3, v4
  et v5. Le motif retenu : le résultat n'entre au dossier que si le patient
  remet lui-même son compte rendu à son praticien — le geste d'engagement existe
  déjà, hors écran. **C'est le seul arbitrage de ce lot qu'un conseil pourrait
  vouloir revoir**, et il est signalé comme tel.
