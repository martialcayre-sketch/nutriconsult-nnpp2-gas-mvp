### Corrigé

- **Une règle conditionnée à un critère l'est enfin vraiment** (`D-141`).
  `D-138` avait séparé la condition en deux colonnes et fait lire les nouvelles
  au moteur ; les routes d'écriture continuaient d'écrire l'ancienne. Une règle
  créée depuis l'atelier avec un critère naissait donc **inconditionnelle** aux
  yeux du moteur : le praticien choisissait le critère, l'écran ne montrait
  rien, et la décision n'en tenait aucun compte. Aucune occurrence en
  production — la table est vide —, et c'est la seule raison pour laquelle ce
  défaut n'a rien produit.
- **Réviser une règle ne lui retire plus sa condition en silence.** Le
  formulaire de révision n'envoyait aucune condition ; une révision étant une
  réécriture complète, la condition disparaissait. Le retrait reste possible,
  mais il redevient un choix.

### Ajouté

- **La condition biologique est saisissable** — elle ne l'avait jamais été. Le
  moteur la lit depuis toujours et en fait naître une intention suspendue à un
  bilan ; aucun chemin d'écriture ne la produisait. L'atelier porte désormais
  une cible et une échéance optionnelle, validées par le **lecteur même du
  moteur** : ce que la décision jugerait illisible est refusé à la saisie, au
  lieu d'être découvert après coup sans moyen de le corriger.
- **Les conditions s'affichent sur la fiche d'une règle** — critère nommé,
  bilan attendu, et un avertissement pour une règle portant encore une
  condition à l'ancien format. Aucun écran ne les montrait : une règle
  conditionnée était indiscernable d'une règle inconditionnelle.
- Sentinelle `conditionRegle.guard.test.ts` : aucune route ne peut plus
  mentionner l'ancien champ, et les deux routes doivent poser les deux
  colonnes. Éprouvée par mutation.
