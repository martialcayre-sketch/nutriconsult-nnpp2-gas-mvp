### L'échelle typographique se ferme aux valeurs arbitraires et s'ouvre aux paliers natifs (2026-09-06)

Le §10 énumérait sept paliers sans dire si la liste était close, et ne proscrivait
nommément que `text-[13px]`/`text-[14px]`. Deux conséquences se sont installées
en silence : **19 valeurs arbitraires** dans l'arbre, dont `text-[15.5px]`,
`text-[10.5px]` et un `text-[1.875rem]` qui valait déjà exactement `text-3xl` ;
et **117 usages** de `text-lg`/`xl`/`2xl`/`3xl` que rien n'autorisait ni
n'interdisait.

Le diagnostic n'était pas « échelle fermée ou ouverte » mais **un trou** :
l'échelle du §10 couvre l'UI dense (11,5 → 16px) plus une métrique à 32px, et il
n'y avait aucun palier entre 16 et 32. Les titres n'en avaient donc aucun, et les
136 usages remplissaient ce vide chacun à sa façon.

- **Toute valeur arbitraire `text-[…]` est désormais proscrite**, pas seulement
  les deux que le §10 nommait. Un `text-[26px]` n'est pilotable centralement par
  rien : c'est un nombre magique dans un `className`, ce que le principe même de
  la section refuse.
- **Les paliers natifs de Tailwind sont admis** — `text-lg` 18px, `text-xl` 20px,
  `text-2xl` 24px, `text-3xl` 30px. `fontSize` vivant sous `theme.extend`, ils
  survivent, et la configuration les pilote centralement : ils satisfont le
  principe. Ce qui manquait n'était pas une interdiction, c'était de le dire.
- **Palier bas `text-3xs` (10px) ajouté.** Dix sites écrivaient 9 à 11px en dur ;
  les remonter tous à `text-2xs` aurait grossi des badges capitales et des
  légendes de graphe de 2,5px. Le palier leur donne une marche.
- **Les 19 sites sont migrés** au palier le plus proche : 9/10/10,5px →
  `text-3xs` · 11px → `text-2xs` · 15/15,5px → `text-sm` · 19px → `text-lg` ·
  26px → `text-2xl` · `1.875rem` → `text-3xl`. Treize fichiers, aucun changement
  de logique.

Écarté — **migrer aussi les 117 usages natifs** vers des paliers nommés propres
au dépôt. L'état final serait plus net, mais la migration toucherait 136 sites
pour déplacer des pixels sur des titres que personne ne conteste, et les paliers
natifs satisfont déjà le principe de pilotage central. Le coût n'était pas payé
par le gain.
