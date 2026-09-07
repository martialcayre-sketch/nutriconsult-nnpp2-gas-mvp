### Modifié

- **Une règle clinique repose sur un claim validé, et le moteur peut enfin le
  dire** (`D-140`, second temps). L'atelier exige désormais le claim fondateur à
  la création comme à la révision, et vérifie au corpus qu'il est `VALIDE` —
  au même titre que la source ou le critère. Le lecteur de catalogue remplit
  `claimsValidesParRegle` sur ce que la base dit : la prévisualisation cesse de
  refuser toute règle avec un motif — « les claims cités ne sont pas valides » —
  qui était faux, aucun claim n'étant cité. Le refus qui subsiste **nomme** le
  claim en cause, et se sépare en deux : une règle sans claim est une lacune de
  la règle, un claim non validé est un état du corpus.
- La vérification reprend **mot pour mot les cinq prédicats** de la voie de
  récupération des claims — actif, `VALIDE`, non patient, compartiment `ACTIF`,
  adossé à au moins un verbatim source. Un claim que la récupération refuserait
  de servir ne peut pas fonder une règle. Aucun texte du corpus ne transite par
  ce chemin : la requête ne rend que l'identifiant déjà fourni.

### Base de données

- Migration `20260907210000_regle_claim_obligatoire` — resserrement de
  `clinical_rules.claim_id` et `version_claim` en `NOT NULL`, contract de
  l'expand/contract ouvert le matin même. Une garde refuse le resserrement **en
  le disant** s'il existe une règle sans claim : aucun identifiant ne se
  fabrique pour combler un trou (`DC-19`, `DC-20`). Sans reprise de données —
  la table compte 0 ligne en production.
- Le contrat SQL `c4_regle_claim_v1_negatif` a vu rougir, comme prévu, le terme
  qui affirmait les colonnes « encore nullables ». Il a été **retourné**, pas
  contourné : il éprouve maintenant que les deux colonnes sont `NOT NULL` et
  qu'une règle sans claim fondateur est refusée par la base elle-même.
