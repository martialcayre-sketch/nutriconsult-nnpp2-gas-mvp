### Modifié

- **Un `T0` ne se confirme qu'après le second rideau, et sur une synthèse qui
  l'a lu** (`D-158`, arbitrage du responsable). Une quatrième condition dure
  s'ajoute aux trois de `D-052` — ce que le praticien a assigné **après la
  validation de la première synthèse** doit être rendu —, et la fraîcheur de la
  synthèse est étendue au second rideau. La chaîne compte cinq temps : premier
  rideau → synthèse #1 → second rideau assigné → second rideau rendu →
  **synthèse #2** → `T0`. La table `RIDEAU_T0` est inchangée.
- **Le panneau de confirmation ne promet plus de dispense générale.**
  « Les agendas ne sont pas requis » devenait faux : la phrase distingue
  désormais le premier rideau — où ils ne le sont pas — de ce que vous assignez
  après la synthèse, qui est attendu, agendas compris.

### Détails de conception

- **Le second rideau n'est pas une liste signée**, à la différence du premier.
  La production le montre composé dossier par dossier : les deux seuls existants
  comptent 5 et 8 instruments et n'en partagent que 3. L'assignation n'est pas
  la règle — elle **est** le geste clinique.
- **La borne basse est la PREMIÈRE synthèse validée**, quand la fraîcheur de
  `D-052` se juge toujours sur la dernière. Sans cet écart, valider une seconde
  synthèse après le second rideau déplacerait la borne au-delà des assignations
  qu'elle doit compter, et le dossier qui a fait exactement ce qu'on lui
  demandait deviendrait définitivement inconfirmable.
- **La borne haute est la confirmation de l'ancre.** La garde est rejouée à
  chaque écriture de protocole, `T0` déjà confirmé compris : sans elle, le
  premier questionnaire de suivi assigné après l'acte aurait refusé en 422 le
  protocole d'un dossier vivant — la panne que `D-129` a dû rouvrir.
- **Deux bornes distinctes, et c'est ce qui rend le cinquième temps possible.**
  Le second rideau se compte depuis la **première** synthèse validée ; la
  fraîcheur se juge sur la **dernière**. Si les deux lisaient la même, valider la
  synthèse #2 sortirait le second rideau de son propre compte.
- **Le refus a deux messages**, parce que le geste attendu diffère : sans second
  rideau, la synthèse est en retard sur le premier ; avec, il en faut une
  **neuve** — le dire évite d'aller re-valider l'ancienne, ce qui ne
  rafraîchirait rien (`Corrigee_Praticien` ne touche pas `dateValidation`).
- **« Rendu » se lit sur l'assignation** (`Complété`), pas sur la cotabilité :
  `Q_ALI_03`, les agendas et `Q_ALI_09` ne rendent aucun total, et le prédicat
  du premier rideau les aurait rendus insatisfiables.
- `estAncreInitiale` rejoint `protocol/cycles.ts`, où vivent déjà ses deux
  termes : la règle vaut pour l'ENTRÉE dans le dossier, jamais pour une
  réouverture de cycle.

### Mesuré

- **Neuf dossiers réels deviennent non confirmables** tant qu'un second rideau
  n'est pas assigné, rendu, puis **lu par une nouvelle synthèse**. Au
  2026-09-08 : 14 dossiers portent une synthèse validée, 4 ont déjà leur `T0`, et
  des 10 restants **2 seulement** ont des assignations postérieures — aucune
  rendue. C'est la demande, chiffrée avant d'être écrite.

### Réserves

- La règle repose sur une comparaison d'horodatages : elle n'est pas
  **auditable**. Rien en base ne prouvera a posteriori qu'une assignation
  composait un second rideau plutôt qu'elle ne rattrapait un oubli. Marquer la
  vague demanderait une colonne, donc une migration (chemin `D-087`), et quatre
  chemins d'écriture d'assignation à instrumenter sans en oublier un.
- **La carte du Fil n'est pas encore alignée** : elle appelle toujours « premier
  rideau complet, T0 non consigné », ce qui reste vrai mais ne nomme pas le
  geste devenu nécessaire. Lot suivant.
