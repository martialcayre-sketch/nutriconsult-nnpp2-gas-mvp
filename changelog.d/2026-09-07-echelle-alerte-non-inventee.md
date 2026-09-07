### Corrigé

- **La sentinelle n'invente plus de niveau d'alerte** (`D-143`). Elle écrivait
  `orange` en dur — inconditionnellement sur tout cumul de substance, et en
  repli sur un dépassement de seuil sans alerte jointe. Aucune échelle de
  gradation n'est fondée dans le dépôt, et `D-132` avait explicitement refusé
  d'en inventer une faute de source : une échelle refusée en prose et écrite en
  code n'est pas refusée.
- Le niveau vaut désormais **rien** là où aucune alerte ne le porte.
  L'absence n'affaiblit rien : ce qui alerte est le **fait** — un cumul
  constaté, un seuil dépassé —, jamais l'étiquette posée dessus. Le jour où une
  échelle sera fondée, elle remplira ce champ ; d'ici là il dit la vérité, qui
  est qu'on ne sait pas.
- Portée nulle sur l'existant : la table de revue de protocole n'est écrite par
  aucun chemin, et aucun écran ne lit ce niveau. Le défaut n'a rien produit — il
  aurait produit la première ligne d'une échelle non fondée le jour où cette
  table s'ouvrirait.
- Sentinelle `echelleAlerte.guard.test.ts` : aucune source servie ne peut
  affecter une valeur d'échelle à un champ de niveau. Elle ne juge pas les
  bancs, où un niveau de fixture décrit une entrée sans rien affirmer.
  Éprouvée par mutation.

### Note

- La question de fond reste **ouverte, et mieux posée** : le niveau ne commande
  aujourd'hui aucune décision — les deux portes de sécurité basculent sur la
  présence de l'alerte, jamais sur son niveau. Ce qu'il faut trancher n'est donc
  pas « quels paliers » mais **à quoi ce niveau doit servir** : documenter,
  trier, ou moduler un refus de sécurité — cette dernière option étant un
  assouplissement de garde.
