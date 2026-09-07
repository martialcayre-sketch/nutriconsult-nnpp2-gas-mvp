### Un critère n'est pas calculé, il est constaté (`D-138`) — migration

`clinical_rules.condition_supplementaire` portait deux natures dans une seule
colonne, et elles ne se rencontraient jamais : l'API n'accepte que
`{ critereId }`, le moteur C4 ne lit que `{ type: 'biologie', cible }` et refuse
tout le reste comme illisible. Une règle conditionnée à un critère — la seule
que l'outil sache écrire — refusait donc son intention, pour une raison fausse.

Les deux natures sont séparées : `condition_critere_id` devient une vraie clé
étrangère vers le vocabulaire gouverné (jusqu'ici la référence vivait dans un
JSON et rien n'empêchait qu'elle pende), `condition_biologie` garde sa forme.
L'ancienne colonne est conservée : sa suppression est destructive et demandera
sa propre confirmation.

Séparer seul aurait aggravé le défaut — la règle serait passée de « refus » à
« on applique », sa condition n'étant plus évaluée par personne. D'où la
seconde moitié : `criteres_dossier_constates`. Rien dans le dépôt ne dit ce
qu'un critère lit chez un patient, et l'inventer serait inventer de la
sémantique clinique. Un critère ne se dérive donc pas : un praticien constate
qu'il s'applique ou non, et il signe. L'absence de ligne vaut **inconnu**,
jamais « absent ».

Migration seule — routes, écran et moteur suivent en PR séparée, après
application constatée (`D-087`).
