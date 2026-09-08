### Modifié

- **Le gabarit `objectif_propose@1` est formellement validé** (2026-09-08, sur
  demande explicite du responsable en session). `D-154` §7 avait laissé le geste
  ouvert et en avait nommé la forme : « elle se pose en changeant `valideLe`,
  sans toucher l'empreinte ». C'est exactement ce qui est fait — `valideLe`
  passe de `null` à `2026-09-08`, le `hash` ne bouge pas.

### Note

- **Première validation du registre posée APRÈS COUP.** Les deux seules autres
  (`acces_portail@2`, `acces_portail_lien@1`) étaient nées validées le jour de
  leur rédaction. Le champ prouve ici ce pour quoi il avait été prévu : porter
  un acte du responsable qui n'est pas une réécriture.
- **L'empreinte est la preuve que rien n'a changé.** Elle couvre
  `{key, version, sujet, corps, variables}` et rien d'autre ; le hash-lock du
  banc reste vert sans qu'une seule valeur y soit retouchée. Une validation qui
  aurait exigé de recalculer l'empreinte aurait été, par définition, une v2.
- **Les huit gabarits historiques restent `valideLe: null`.** Ce lot n'en valide
  aucun autre : le registre continue de dire ce qui n'a pas eu lieu.
