### Supprimé

- **La colonne `clinical_rules.condition_supplementaire` est retirée**
  (`D-147`, migration `20260908000000_drop_condition_supplementaire`). Troisième
  et dernier temps de la séparation ouverte par `D-138` : les deux natures
  séparées, puis `D-142` coupant le dernier écrivain, puis ici le retrait de la
  colonne et de ses dernières lectures — **dans le même commit**, faute de quoi
  soit la dérive schéma↔migrations rougit, soit l'avertissement d'atelier
  disparaît avant la garde qui le remplace.
- La migration **compte avant de supprimer** et refuse (`RAISE EXCEPTION`) s'il
  subsiste une règle au format hérité. La production en compte zéro — lecture du
  2026-09-08, conteneur `one-off-209`, `clinical_rules` = 0 ligne —, et c'est
  précisément pourquoi la garde est écrite : une suppression qui repose sur ce
  qu'on a lu la veille repose sur une lecture, pas sur l'état au moment où elle
  s'applique. Le JSON hérité est la seule trace de la condition clinique d'une
  telle règle ; la perdre rendrait une règle conditionnée inconditionnelle.

### Modifié

- **L'avertissement d'atelier disparaît** avec la colonne : l'écran signalait
  toute règle portant encore l'ancien format. Il n'est pas perdu pour rien — un
  avertissement suppose que quelqu'un regarde le bon écran au bon moment, la
  garde de migration refuse. Elle arrive dans le **même** commit, jamais après.
- Sentinelle `conditionRegle.guard.test.ts` **élargie** : bornée aux routes tant
  que l'atelier lisait légitimement le champ, elle couvre désormais toute source
  servie (client généré et bancs exclus). Une mention qui reviendrait ne serait
  plus un simple retour au défaut : ce serait la lecture d'une colonne absente.
- Un banc de `decisionAvantBiologie.test.ts` est retiré : il éprouvait que le
  moteur ignore l'ancienne colonne, laquelle ne peut plus être passée. Un banc
  qui ne peut plus rougir n'éprouve rien.

### Note

- Portée sur l'existant : **nulle**. `clinical_rules` n'a jamais porté de ligne
  en production. Le défaut `D-138`→`D-142` n'a produit aucune règle
  inconditionnelle parce qu'il n'a produit aucune règle — c'est du calendrier,
  pas d'une garde.
