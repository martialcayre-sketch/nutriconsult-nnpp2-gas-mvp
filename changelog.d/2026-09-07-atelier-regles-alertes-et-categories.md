### Atelier de règles — catégories fonctionnelles et alertes de sécurité deviennent saisissables (`D-132`)

Suite de `D-131`. Les deux derniers référentiels **non chiffrés** restés sans
écrivain reçoivent leur route (POST **et GET**) et leur geste d'écran, sous
`WN_C4_ENABLED`.

Le GET n'est pas une commodité : le code est unique en base, et sans relecture
une ressaisie rendrait 409 devant un écran muet. Pour les alertes, c'est le
catalogue **publié** que `deciderIntentionAvantBiologie` exige avant de proposer
quoi que ce soit — le praticien doit pouvoir constater qu'il existe.

**Le niveau d'alerte est exigé, pas contraint** : la colonne est un `TEXT` sans
`CHECK`, aucune échelle n'est définie dans le dépôt, et le moteur ne lit pas le
niveau (toute alerte active refuse). Proposer « orange / rouge » aurait inventé
une gradation clinique que rien ne source. La définition de l'échelle reste due.

**Les seuils fonctionnels ne sont pas ouverts, et le motif est concret.**
`depasseSeuilHaut` compare la dose cible d'une règle au seuil publié par un `>`
numérique nu — or `ClinicalRule` ne porte aucune colonne d'unité, quand le seuil
en porte une. Une règle à 500 mg comparée à un seuil de 1000 µg passerait en
étant 500 fois au-dessus. Le défaut est aujourd'hui inatteignable (aucun seuil
n'existe) et le serait devenu en ouvrant ce chemin. Deux sorties possibles — une
migration ajoutant l'unité à la règle, ou un refus fail-closed dans le moteur —
appellent chacune un arbitrage explicite.

La chaîne C4 reste muette : `deciderIntentionAvantBiologie` n'est importé par
aucun module hors de son propre banc.
