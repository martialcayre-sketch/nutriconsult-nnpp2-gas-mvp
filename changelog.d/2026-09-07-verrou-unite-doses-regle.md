### Atelier de règles — un verrou exécutable sur l'unité des doses (`D-132`)

Deux sites comparent une dose de règle à un seuil publié par un `>` numérique nu,
alors que `ClinicalRule` ne porte aucune unité et que le seuil en porte une : une
règle à 500 mg passerait sous un seuil de 1000 µg. Le défaut est aujourd'hui
inatteignable — `ingredient_functional_thresholds` n'a aucun écrivain — et le
deviendrait au premier geste qui en ouvre un.

`uniteDosesVerrou.test.ts` refuse désormais cet écrivain tant que la règle n'a
pas d'unité. Il ne tranche rien : il garantit que la question sera posée avant
que la comparaison ne serve, et se relâche de lui-même dès que le champ existe.

Le motif de sa forme : six fois le 2026-09-07, ce qui n'était gardé que par de la
prose n'a pas tenu. Une note dans une décision ne barre rien.
