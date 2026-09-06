// Le fil de correction d'une mesure biologique ([[D-124]]) — résolution PURE,
// testable sans base.
//
// POURQUOI PAS `resolveActiveVersion` (lib/protocol/versioning.ts). L'arbitrage
// que le suivi de `D-124` laissait ouvert est tranché ici, et dans ce sens :
// la fonction du protocole exige `inputHash` et `supersedesDraftId`, que la
// mesure n'a pas, et surtout elle rend UNE tête pour tout le tableau — or une
// série de résultats a une tête PAR (analyte, date de prélèvement). La
// généraliser aurait voulu dire remanier un module d'un autre sous-système
// pour la commodité de celui-ci. On reprend donc sa RÈGLE, pas son code :
// « la ligne qu'aucune autre ne supplante ; la plus récente en cas d'égalité ».
//
// GROUPER EST INUTILE ICI, et c'est le point qui rend ce module court : une
// correction porte, par construction serveur, le même analyte et la même date
// que ce qu'elle corrige (la route ne les prend PAS du client, elle les relit
// sur la ligne visée). Le chaînage suffit donc à trancher, sans regrouper :
// une ligne est courante si et seulement si personne ne la supplante.
//
// LA FOURCHE EXISTE EN BASE, ET ELLE EST VOULUE. La route refuse de corriger
// une ligne déjà corrigée, mais la base l'accepte — le contrat SQL le prouve
// exprès (`corr1bis`). Deux corrections vraiment simultanées peuvent donc
// encore forker, et c'est la même classe d'écart que `D-123` : la garde
// applicative ferme le cas séquentiel, pas la course. La règle de départage
// ci-dessous est ce qui rend cette course inoffensive à l'affichage.

/** Le strict nécessaire pour remonter un fil : l'identité, le lien, la date. */
export type MaillonFil = {
  id: string;
  supersedesResultatId: string | null;
  /** Horodatage serveur de la saisie (`saisi_le`), inantidatable. */
  saisiLe: string;
};

/**
 * Rend, pour chaque ligne SUPPLANTÉE, le maillon qui la supplante.
 *
 * Une ligne absente de la table rendue est **courante**. En cas de fourche
 * (deux corrections de la même ligne), le vainqueur est le plus récent par
 * `saisiLe`, l'identifiant départageant à horodatage égal — même règle que
 * `resolveActiveVersion`, pour que deux surfaces ne racontent jamais deux
 * histoires du même dossier.
 */
export function correctionsParLigne<T extends MaillonFil>(lignes: T[]): Map<string, T> {
  const gagnants = new Map<string, T>();
  for (const ligne of lignes) {
    const cible = ligne.supersedesResultatId;
    if (cible === null || cible === '') continue;
    const tenant = gagnants.get(cible);
    if (tenant === undefined || emporte(ligne, tenant)) {
      gagnants.set(cible, ligne);
    }
  }
  return gagnants;
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
