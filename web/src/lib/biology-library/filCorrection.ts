// Le fil de correction d'une mesure biologique ([[D-124]]) — résolution PURE,
// testable sans base.
//
// POURQUOI PAS `resolveActiveVersion` (lib/protocol/versioning.ts). La
// fonction du protocole exige `inputHash` et `supersedesDraftId`, que la
// mesure n'a pas. On reprend donc sa RÈGLE, pas son code — et il faut la
// reprendre EN ENTIER, car elle fait DEUX choses : (a) délimiter le groupe,
// (b) y élire UNE tête. Une première version de ce module n'avait gardé que
// le chaînage et laissait DEUX lignes courantes sur une fourche (contre-revue
// du 2026-09-06, M1) : les deux branches sortaient toutes deux « non
// supplantées », l'écran offrait deux fois le geste, et deux valeurs
// concurrentes faisaient foi pour la même mesure.
//
// CE QUI REMPLACE LE GROUPEMENT PAR (analyte, date). Le raisonnement qui le
// jugeait inutile était juste, mais incomplet : une correction hérite bien de
// l'analyte et de la date de sa cible, si bien que toute ligne d'une clé
// descend d'une seule racine — l'index partiel n'en tolère qu'une. Le groupe
// se délimite donc par la RACINE DE CHAÎNE, ce qui est exactement équivalent
// et ne demande ni analyte ni date. Mais il faut encore y élire une tête, et
// c'est ce qui manquait.
//
// LA FOURCHE EXISTE EN BASE, ET ELLE EST VOULUE. La route refuse de corriger
// une ligne déjà corrigée, mais la base l'accepte — le contrat SQL le prouve
// exprès (`corr1bis`). Deux corrections vraiment simultanées peuvent donc
// encore forker : même classe d'écart que `D-123`, la garde applicative ferme
// le séquentiel, pas la course. C'est l'élection ci-dessous, et elle seule,
// qui rend cette course inoffensive à l'affichage.

/** Le strict nécessaire pour remonter un fil : l'identité, le lien, la date. */
export type MaillonFil = {
  id: string;
  supersedesResultatId: string | null;
  /** Horodatage serveur de la saisie (`saisi_le`), inantidatable. */
  saisiLe: string;
};

/** Garde-fou de remontée : au-delà, on tient la chaîne pour abîmée. */
const PROFONDEUR_MAX = 1000;

/**
 * Rend, pour chaque ligne qui NE FAIT PAS FOI, celle qui fait foi à sa place.
 *
 * Une ligne absente de la table rendue est **courante**, et il y en a
 * exactement UNE par fil — fourche comprise. En cas d'égalité d'horodatage,
 * l'identifiant départage, comme dans `resolveActiveVersion` : deux surfaces
 * ne peuvent pas raconter deux histoires du même dossier.
 */
export function correctionsParLigne<T extends MaillonFil>(lignes: T[]): Map<string, T> {
  const parId = new Map<string, T>();
  for (const ligne of lignes) parId.set(ligne.id, ligne);

  // (a) Le groupe : toutes les lignes qui partagent la même racine de chaîne.
  const groupes = new Map<string, T[]>();
  for (const ligne of lignes) {
    const cle = racine(ligne, parId);
    const groupe = groupes.get(cle) ?? [];
    groupe.push(ligne);
    groupes.set(cle, groupe);
  }

  // (b) L'élection, groupe par groupe.
  const corrections = new Map<string, T>();
  for (const groupe of groupes.values()) {
    const gagnante = elire(groupe);
    for (const ligne of groupe) {
      // TOUTES les autres pointent vers celle qui fait foi — y compris la
      // branche PERDANTE d'une fourche, qui n'est supplantée par personne au
      // sens du chaînage mais ne fait pas foi pour autant. C'est le défaut
      // que la contre-revue a nommé : sans cette ligne-ci, elle s'affichait
      // courante, avec son propre bouton « Corriger ».
      if (ligne.id !== gagnante.id) corrections.set(ligne.id, gagnante);
    }
  }
  return corrections;
}

/**
 * L'identifiant de la racine du fil. Une chaîne ORPHELINE (cible absente de
 * la série, référence souple sans FK) fait racine là où elle se casse : la
 * ligne reste visible et forme son propre fil, plutôt que de disparaître.
 */
function racine<T extends MaillonFil>(depart: T, parId: Map<string, T>): string {
  const chemin: string[] = [depart.id];
  let courante = depart;
  for (let pas = 0; pas < PROFONDEUR_MAX; pas += 1) {
    const cible = courante.supersedesResultatId;
    if (cible === null || cible === '') return courante.id;
    const amont = parId.get(cible);
    // Cible hors série : le fil s'arrête ici, et la CIBLE fait racine — deux
    // orphelines visant la même ligne absente restent bien dans un seul fil.
    if (amont === undefined) return cible;
    const boucle = chemin.indexOf(amont.id);
    if (boucle !== -1) {
      // CYCLE — irréalisable par la route (append-only, cible antérieure),
      // mais une base abîmée ne doit ni figer l'écran, ni scinder le cycle en
      // deux fils selon la ligne d'où l'on est parti. On rend donc le PLUS
      // PETIT identifiant DU CYCLE : un représentant canonique, identique
      // quel que soit le point d'entrée.
      return [...chemin.slice(boucle)].sort()[0];
    }
    chemin.push(amont.id);
    courante = amont;
  }
  return courante.id;
}

/** La tête du fil : celle que personne ne supplante, la plus récente. */
function elire<T extends MaillonFil>(groupe: T[]): T {
  const supplantees = new Set<string>();
  for (const ligne of groupe) {
    if (ligne.supersedesResultatId) supplantees.add(ligne.supersedesResultatId);
  }
  const tetes = groupe.filter(ligne => !supplantees.has(ligne.id));
  // Repli sur le groupe entier si tout le monde est supplanté (chaîne abîmée) :
  // mieux vaut désigner une ligne que n'en désigner aucune — sans quoi la
  // série entière disparaîtrait de l'écran.
  const pool = tetes.length > 0 ? tetes : groupe;
  return pool.reduce((meilleure, candidate) => (emporte(candidate, meilleure) ? candidate : meilleure));
}

/** `candidat` l'emporte-t-il sur `tenant` ? Plus récent, puis id décroissant. */
function emporte(candidat: MaillonFil, tenant: MaillonFil): boolean {
  const ecart = horodatage(candidat) - horodatage(tenant);
  if (ecart !== 0) return ecart > 0;
  return candidat.id > tenant.id;
}

/**
 * Un `saisiLe` illisible ne fait pas gagner : il vaut `-Infinity`, donc il
 * perd contre toute date lisible. Une donnée abîmée ne prend pas la tête d'un
 * fil au prétexte qu'on n'a pas su la lire.
 */
function horodatage(maillon: MaillonFil): number {
  const t = new Date(maillon.saisiLe).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}
