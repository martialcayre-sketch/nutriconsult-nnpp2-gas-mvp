// Forme partagée des constats de critères sur un dossier ([[D-138]]).
//
// Le type vit ICI, et non dans le fichier de route, pour la même raison que
// tous ses voisins : un composant client qui importe un type depuis
// `app/api/**/route.ts` fait entrer le module serveur dans le graphe de types
// du client. Le dépôt range ces contrats en `lib/` — la route et l'écran s'y
// réfèrent tous deux.

/**
 * Un critère du vocabulaire gouverné, AVEC son constat sur ce dossier — ou
 * `null`.
 *
 * La forme est délibérée : rendre deux listes séparées (le vocabulaire d'un
 * côté, les constats de l'autre) obligerait l'écran à les recoudre, et une
 * couture ratée rendrait un critère non renseigné indiscernable d'un critère
 * constaté ABSENT. C'est exactement la confusion que [[D-138]] ferme côté
 * moteur ; elle ne se rouvre pas côté client.
 *
 * `constat: null` veut dire INCONNU — personne ne s'est prononcé — et rien
 * d'autre. Un `present: false` de repli affirmerait que le praticien a constaté
 * une absence (`DC-24`).
 */
export type CritereConstatable = {
  critereId: string;
  code: string;
  labelFr: string;
  categorie: string | null;
  constat: {
    present: boolean;
    note: string | null;
    constateLe: string;
    constatePar: string;
  } | null;
};
