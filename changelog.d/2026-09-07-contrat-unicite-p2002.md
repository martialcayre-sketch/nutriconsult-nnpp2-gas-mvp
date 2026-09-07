### Contrats — la traduction `23505` → `P2002` est prouvée, plus supposée (`D-134`)

Trois routes traduisent `P2002` en 409 lisible : `selection_stale` (sélection de
priorité, `D-127` §3bis) et `code_deja_pris` (catégories et alertes, `D-132`).
Leurs bancs unitaires **fabriquent** cette erreur pour vérifier la traduction —
aucun ne prouvait que la base la produise ni que le client la rende sous ce code.

Le cas qui portait le risque : `c1_selection_priorite_racine_unique` est un index
**partiel** vivant dans la migration seule, que Prisma ne déclare ni ne connaît,
et c'est lui qui arbitre la course de deux premières sélections. Un adaptateur
qui cesserait de classer `23505` en violation d'unicité ferait tomber
`selection_stale` en 500, sans qu'un seul banc bouge.

Sonde sur base réelle : les deux index — le partiel inconnu de Prisma et le
`@@unique` déclaré — rendent `P2002` avec `originalCode` `23505` et la contrainte
nommée. Le second sert de témoin : sans lui, le premier ne dirait pas si la
traduction vaut aussi pour l'inconnu.

Le contrat vit dans la suite E2E, sans navigateur et l'assumant : c'est la seule
lane disposant d'une vraie base en T2, T3 et CI. Les contrats SQL prouvent ce que
la base refuse ; ce qui restait à prouver est la traduction, qui appartient au
client.
