### Atelier de règles — le moteur de décision avant biologie a enfin un appelant (`D-133`)

`deciderIntentionAvantBiologie` et `deciderIntentionsAvantBiologie` sont écrits
et testés depuis le LOT-05, et **leur seul importeur était leur propre banc** :
aucun module de `src/` ne les appelait. Leur mutité passait pour l'effet du
catalogue vide alors qu'elle tenait d'abord à l'absence d'appelant.

Ils tournent désormais dans la **prévisualisation d'atelier**, le seul lieu qui
puisse les appeler sans dossier — et dont l'en-tête dit déjà que sa sortie ne
doit jamais alimenter un chemin protocole ou patient. La barrière de `D-003`
reste entière.

Le contexte se lit en base (`catalogueDecisionPrisma.ts`, module à part) : le
catalogue d'alertes est publié dès qu'une alerte active existe (garde au niveau
catalogue, jamais ingrédient) ; une alerte n'atteint un ingrédient que par un
seuil **qui bascule le risque** ; les seuils sont bornés aux ingrédients que la
résolution touche.

**Deux entrants ne se dérivent pas et sont rendus fermés, jamais inventés.**
`claimsValides` : `ClinicalRule` ne porte aucune référence de claim — `claim_id`
existe côté biologie, jamais ici — donc `false`, et le refus dit une chose vraie.
`declencheur` : le tableau clinique appartient à un dossier, et l'atelier n'en a
pas. Le lien règle ↔ claim est nommé comme dette.

Les verdicts sont aujourd'hui des refus : c'est la vérité de la production. Ce
qu'ils ajoutent, c'est de nommer **lequel** des obstacles mord en premier —
l'atelier montrait les règles résolues sans laisser voir qu'aucune n'irait plus
loin.
