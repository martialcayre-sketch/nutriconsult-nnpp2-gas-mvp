### Un critère se constate — la table cesse d'être sans écrivain (`D-138`)

`POST /api/praticien/criteres-dossier` (et son `GET`) : le praticien consigne
qu'un mot du vocabulaire gouverné s'applique, ou non, à un dossier. Il signe —
`constatePar` vient de la session, `constateLe` de la base ; le client ne
fournit ni l'un ni l'autre.

`present` est exigé **strictement booléen**. Un champ oublié, une chaîne
« false », un zéro : tous refusés. Les faire tomber sur un défaut ferait d'un
silence du client un constat clinique signé, que le moteur lirait comme « le
praticien a constaté que non ». L'inconnu s'exprime par l'absence de ligne, et
par rien d'autre.

Re-constater met à jour au lieu d'empiler deux verdicts contradictoires, et
réécrit le signataire. Il n'y a **pas** de suppression : retirer un constat
effacerait une pièce signée du dossier — un geste d'une autre nature, qui
demande son propre arbitrage.

Reste l'écran qui servira cette route : d'ici là, le constat se pose par l'API
seule.
