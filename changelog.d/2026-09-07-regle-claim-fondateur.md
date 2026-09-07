### Une règle nomme le claim qui la fonde (`D-140`) — migration

Le moteur C4 vérifie `claimsValides` en premier, et `clinical_rules` n'avait
aucun champ pour nommer un claim : la prévisualisation de l'atelier refusait
donc **toute** règle, avec un motif qui affirmait faussement que « les claims
cités » n'étaient pas valides. Aucun n'était cité.

Le corpus n'était pas en cause — la production compte 8 224 claims `VALIDE`.
Seul le lien manquait. `clinical_rules` porte désormais `claim_id` +
`version_claim`, miroir exact de l'invariant déjà énoncé pour
`biology_functional_ranges` : « une plage fonctionnelle sans claim validé
n'existe pas ».

Les colonnes naissent **nullables** : les poser NOT NULL avant que le code ne
les remplisse casserait la création de règle pendant la fenêtre de release. Le
resserrement suit avec le code, et le contrat SQL refuse qu'on l'oublie.
