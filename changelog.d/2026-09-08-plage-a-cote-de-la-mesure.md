### Ajouté

- **La plage fonctionnelle sourcée s'affiche à côté de la mesure** (`D-157`,
  LOT-04 du rayon biologie). L'arbitrage praticien a tranché la question
  d'ouverture, posée le 2026-09-04 et restée sans réponse : juxtaposer une
  plage **sourcée** à une mesure, sans écart calculé, sans couleur, sans « hors
  plage », est de l'**affichage documentaire**, pas une interprétation au sens
  `DC-19`/`DC-20`. Une plage est un fait du corpus ; la poser à côté d'un fait
  du dossier n'invente aucune borne. Ce qui basculerait dans l'interprétation
  est le **geste de rapprochement**, et il reste au praticien.
- Chaque plage affiche ses bornes, son unité, sa population, **son claim et sa
  version**, son niveau de preuve. **Toutes** les plages actives d'un analyte
  sont rendues : en choisir une serait trancher à la place du praticien quelle
  population décrit ce dossier.
- Côté serveur : les plages des **seuls** analytes présents au dossier, actives
  seules. Aucune mesure ⇒ la table n'est même pas interrogée — une route qui
  sert des données de santé nommées n'a pas à verser en plus un référentiel
  que l'écran ne montrera pas.

### Ce que l'écran refuse

- **Aucune plage publiée ⇒ rien ne s'affiche**, pas même « aucune plage ». Une
  information sur le corpus posée au milieu d'un dossier se lirait comme une
  information sur le patient (`DC-24`).
- **Unité discordante ⇒ silence.** Juxtaposer « 30 – 100 µg/L » à « 75 nmol/L »
  invite une comparaison fausse que l'œil fait avant que la tête ne lise
  l'unité. Convertir serait interpréter ; l'écart d'unités est un problème de
  catalogue, que l'écran laisse visible en ne montrant rien.
- **Série aux unités mêlées ⇒ silence aussi** : une plage ne vaut pas pour une
  moitié de série. **Plage sans borne ⇒ silence** : une unité seule se lit
  comme une donnée manquante.
- Sentinelle d'écran : aucun vocabulaire de verdict sur cette surface — « hors
  plage », « anormal », « élevé », « bas », « déficit », « carence », « excès »,
  « normal ». La frontière ne tient pas à l'intention de qui écrit l'écran,
  elle tient aux mots qui s'y affichent. Éprouvée par mutation, comme la règle
  d'unité.

### Corrigé

- **La version d'un claim s'affiche telle qu'elle est stockée.** L'écran
  écrivait `(v{version})` en dur alors que `VERSION_CLAIM_RE` rend le préfixe
  `v` facultatif : le rendu donnait « vv1.0 » pour les uns, « v1.0 » pour les
  autres. Le couple (`claim_id`, `version_claim`) est une **identité** — lui
  ajouter un caractère la renomme. Trouvé par le banc, pas à la relecture. Le
  même défaut subsiste dans `FicheAnalytePanel` : nommé, hors périmètre ici.

### Note

- Portée sur l'existant : **nulle**. Lecture de production du 2026-09-08
  (`one-off-9242`) : 2 plages fonctionnelles pour 47 analytes, 0 plage de
  référence, 0 résultat biologique, et `WN_CB_RESULTS_ENABLED` non posé — la
  surface entière est fail-closed. Le lot fixe ce qui s'affichera quand
  l'étage 2 s'ouvrira, et surtout ce qui ne s'affichera jamais.
- Le référentiel **laboratoire** n'est pas servi : les deux ne se fusionnent
  jamais (invariant fondateur du schéma), et il est vide en production.
- **La campagne `biologie-exploitee` est close** : ses quatre lots le sont.
  LOT-03 se déclarait bloqué depuis deux jours par une chaîne que `D-127` avait
  réparée et dont `D-129` avait livré le parcours — la fiche n'avait pas suivi.
  Une dette reste nommée au LOT-02, non tenue par lui : le banc empirique
  `23505 → P2002` demande un harnais d'intégration à base réelle.
