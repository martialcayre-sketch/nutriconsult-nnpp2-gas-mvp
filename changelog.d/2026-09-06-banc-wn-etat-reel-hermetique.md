### Le banc de `wn-etat-reel` ne rougit plus parce qu'une PR a son CI en cours (2026-09-06)

Le test `N1` de `scripts/wn-etat-reel.test.mjs` — celui qui vérifie que le
rapport ne dépend pas du répertoire d'appel — lançait le script **deux fois** et
exigeait deux rapports identiques. Or ce script appelle `gh pr list --json
number,title,isDraft,updatedAt` : il comparait donc des données que GitHub
fait bouger tout seul.

Deux causes le faisaient tomber, aucune ayant le moindre rapport avec ce qu'il
teste :

- **une PR dont le CI tourne pendant la passe** — son `updatedAt` change entre
  les deux appels. C'est la situation normale juste après un push, c'est-à-dire
  exactement le moment où l'on joue T2 ;
- **un `gh` qui échoue d'un seul côté** — le champ « disponible » bascule, et la
  comparaison avec.

L'effet était trompeur : T2 sortait en échec **avant même la phase de tests**,
sur un banc vert cinq fois de suite en isolation, ce qui envoyait chercher la
cause dans le diff en cours.

Le test pose désormais un faux `gh` déterministe en tête de `PATH` pour ses deux
exécutions. **Rien n'est retiré de la couverture** : les deux appels traversent
le même chemin de code, et le cas nominal — `gh` répond — devient joué de façon
reproductible, ce qu'aucun banc ne faisait (le voisin ne couvre que `gh`
absent). Une garde vérifie que le faux `gh` a bien été appelé : sans elle, un
stub introuvable ferait rendre « indisponible » aux deux exécutions, la
comparaison resterait verte et le banc aurait silencieusement cessé de couvrir
quoi que ce soit.
