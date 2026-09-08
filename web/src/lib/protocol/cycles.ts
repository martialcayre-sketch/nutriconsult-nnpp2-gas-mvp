// LES CYCLES SONT NOMMÉS, ET AUCUNE ANCRE NE BOUGE JAMAIS (`D-113`).
//
// AVANT. Chaque cycle s'ouvrait par un épisode `T0`. Deux cycles pour un même
// patient produisaient donc DEUX `T0`, et la lecture retenait « le plus
// récent » — si bien qu'ouvrir un second cycle DÉPLAÇAIT le point de départ du
// premier. Les fenêtres de jalon du cycle en cours se fermaient comme EFFET DE
// BORD, sans que personne l'ait décidé : un patient à J85 perdait sa question
// J90 le jour où son praticien confirmait un nouveau départ. Le défaut n'était
// pas la fermeture — c'est qu'elle était invisible.
//
// APRÈS. Le premier cycle s'ancre en `T0`, le deuxième en `T1`, le troisième en
// `T2`. Une ancre est posée une fois et ne se déplace plus. Les jalons J21/J42/
// J90 se comptent depuis l'ancre de LEUR cycle, et la classe de bug ci-dessus
// n'existe plus — non pas corrigée, supprimée.
//
// CE MODULE EST PUR : aucun import, aucune table clinique, aucune date. Il ne
// dit que ce qu'est une ancre et comment elles s'ordonnent. Les fenêtres, les
// jours et les seuils vivent ailleurs (`equilibre/constants.ts`, lu jamais
// modifié dans ses valeurs).

/**
 * L'ancre d'un cycle : `T0`, `T1`, `T2`, … La série est OUVERTE — c'est le
 * point de la décision. Un type fermé (`'T0' | 'J21' | …`) rendait « ancre » et
 * « premier cycle » synonymes, et c'est cette confusion qui a produit le
 * défaut : le code testait `milestone === 'T0'` en pensant « est-ce l'ancre ? ».
 */
export type AncreCycle = `T${number}`;

/** Les jalons de MESURE, eux, restent une liste fermée : trois, et pas d'autres. */
export type JalonMesure = 'J21' | 'J42' | 'J90';

/**
 * `T0`, `T1`, `T12`… et rien d'autre.
 *
 * `T01` EST REFUSÉ, et ce n'est pas du zèle : deux écritures d'un même cycle
 * (`T1` et `T01`) en feraient deux cycles distincts pour la lecture, alors
 * qu'ils désignent le même. Une forme unique par cycle est ce qui rend l'ancre
 * comparable. `T` seul, `T-1`, `TA` sont refusés pour la même raison.
 */
const FORME_ANCRE = /^T(0|[1-9][0-9]*)$/;

export function estAncreDeCycle(milestone: string): milestone is AncreCycle {
  return FORME_ANCRE.test(milestone);
}

/**
 * Le rang du cycle que cette ancre ouvre — `T0` → 0, `T3` → 3.
 *
 * Rend `null` sur ce qui n'est pas une ancre, plutôt que de lever ou de rendre
 * `0` : `0` est le rang du PREMIER cycle, et le confondre avec « pas une
 * ancre » ferait passer un jalon de mesure pour le début d'un suivi.
 */
export function indexDeCycle(milestone: string): number | null {
  if (!estAncreDeCycle(milestone)) return null;
  return Number.parseInt(milestone.slice(1), 10);
}

/**
 * L'ancre INITIALE — celle par laquelle on ENTRE dans un suivi, et pas celle
 * par laquelle on le rouvre.
 *
 * DEUX TERMES, ET LE SECOND N'EST PAS DÉCORATIF. [[D-113]] a fait de
 * l'ouverture d'un `T1` le même acte que celle d'un `T0` pour le rideau
 * d'entrée, et c'était juste : ouvrir un cycle est ouvrir un cycle. Deux règles
 * ont pourtant besoin de la distinction, parce qu'elles portent sur l'ENTRÉE
 * dans le dossier et non sur l'ouverture d'un cycle :
 *   · [[D-156]] — la fenêtre de l'ancre initiale couvre tout l'état d'entrée ;
 *     l'ouvrir pour un `T1` lui ferait embarquer tout l'historique.
 *   · [[D-157]] — le second rideau se compte depuis la première synthèse
 *     validée du dossier ; appliqué à un `T1` posé des mois plus tard, il
 *     compterait comme « second rideau » tout ce qui a été assigné depuis,
 *     jalons de suivi compris.
 *
 * Elle vit ICI, avec ses deux termes, plutôt qu'en double chez ses deux
 * appelants : `numeroEpisodeDeCycle` documente déjà ce que coûtent deux copies
 * d'un même décalage.
 */
export function estAncreInitiale(milestone: string): boolean {
  return estAncreDeCycle(milestone) && indexDeCycle(milestone) === 0;
}

/**
 * Le numéro d'ÉPISODE affiché pour un cycle — `T0` → « épisode 1 », `T2` → 3.
 *
 * Rang affiché = rang d'ancre + 1 : le praticien compte à partir de un, la
 * série des ancres à partir de zéro. La formule vivait en double (le bandeau
 * d'épisode et l'index de la fiche-trajectoire) ; deux copies d'un même décalage
 * dérivent tôt ou tard, et l'écart se lit comme deux épisodes différents pour
 * un seul cycle.
 *
 * `rangDeSecours` couvre l'ancre hors série (valeur inattendue en base) : sans
 * lui, `indexDeCycle` rendant `null`, l'écran afficherait « épisode NaN ».
 */
export function numeroEpisodeDeCycle(ancre: string, rangDeSecours: number): number {
  return (indexDeCycle(ancre) ?? rangDeSecours) + 1;
}

/** L'ancre du cycle de rang donné. */
export function ancreDeCycle(index: number): AncreCycle {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`Rang de cycle invalide : ${index}`);
  }
  return `T${index}`;
}

/**
 * L'ancre du cycle SUIVANT, à partir des ancres déjà posées.
 *
 * ELLE SE DÉDUIT DU RANG LE PLUS HAUT, JAMAIS DU NOMBRE D'ANCRES. Si `T0` et
 * `T2` existent sans `T1` — une ligne effacée, une reprise manuelle —, compter
 * les ancres proposerait `T2`, qui est déjà pris, et deux cycles porteraient le
 * même nom. Le rang le plus haut plus un ne peut pas entrer en collision.
 *
 * Sans aucune ancre, le premier cycle s'ouvre en `T0`.
 */
export function ancreSuivante(ancresPosees: readonly string[]): AncreCycle {
  const rangs = ancresPosees
    .map(indexDeCycle)
    .filter((rang): rang is number => rang !== null);
  if (rangs.length === 0) return ancreDeCycle(0);
  return ancreDeCycle(Math.max(...rangs) + 1);
}

/**
 * Les ancres posées, du plus ancien cycle au plus récent — PAR LEUR RANG.
 *
 * L'ordre vient du NOM, pas de la date de confirmation. Les deux devraient
 * coïncider ; quand ils divergent (un `T2` confirmé avant un `T1`), c'est une
 * DISCORDANCE, et `DC-30` demande de la signaler, pas de la départager en
 * silence. La fonction ordonne par rang — le nom fait foi pour l'identité — et
 * `discordanceDOrdre` permet de dire que le doute existe.
 */
export function ancresOrdonnees<T extends { milestone: string }>(episodes: readonly T[]): T[] {
  return episodes
    .filter((episode) => estAncreDeCycle(episode.milestone))
    .sort((gauche, droite) => (indexDeCycle(gauche.milestone) ?? 0) - (indexDeCycle(droite.milestone) ?? 0));
}

/**
 * Vrai quand l'ordre des RANGS contredit l'ordre des DATES de confirmation.
 *
 * Ne corrige rien : signale. Une lecture qui « remet dans l'ordre » choisirait
 * silencieusement laquelle des deux sources a raison.
 */
export function discordanceDOrdre<T extends { milestone: string; confirmedAt: Date | null }>(
  episodes: readonly T[],
): boolean {
  const ancres = ancresOrdonnees(episodes).filter((episode) => episode.confirmedAt !== null);
  for (let index = 1; index < ancres.length; index += 1) {
    const precedent = ancres[index - 1].confirmedAt;
    const courant = ancres[index].confirmedAt;
    if (precedent && courant && courant.getTime() < precedent.getTime()) return true;
  }
  return false;
}

/** Les trois jalons de mesure, dans l'ordre où ils s'ouvrent. */
export const JALONS_MESURE = ['J21', 'J42', 'J90'] as const satisfies readonly JalonMesure[];

export function estJalonMesure(milestone: string): milestone is JalonMesure {
  return (JALONS_MESURE as readonly string[]).includes(milestone);
}

/**
 * Un jalon que la chaîne sait lire : une ancre de cycle, ou un jalon de mesure.
 *
 * Remplace les listes littérales `['T0', 'J21', 'J42', 'J90']` que six modules
 * portaient chacun de leur côté pour filtrer les lignes d'`assessment_episodes`.
 * Recopiée, cette liste ne pouvait qu'être fermée : un `T1` confirmé en base
 * était rejeté à la lecture par chacune d'elles — silencieusement, puisqu'un
 * `continue` ne dit rien.
 */
export function estJalonMomentum(milestone: string): milestone is AncreCycle | JalonMesure {
  return estAncreDeCycle(milestone) || estJalonMesure(milestone);
}

/**
 * Les jalons d'un cycle, dans l'ordre : son ancre, puis les trois mesures.
 *
 * L'ORDRE EST CELUI DU CYCLE, PAS UNE LISTE GLOBALE. `['T0', 'J21', 'J42',
 * 'J90']` en dur décrivait le premier cycle et lui seul : appliquée au cycle
 * ancré en `T1`, elle cherchait une lecture `T0` qui appartient au cycle
 * précédent, et n'en trouvait jamais pour l'ancre du cycle lu.
 */
export function jalonsDuCycle(ancre: AncreCycle): readonly (AncreCycle | JalonMesure)[] {
  return [ancre, ...JALONS_MESURE];
}

/**
 * L'ancre est-elle recevable pour ce patient ? — GARDE D'ÉCRITURE.
 *
 * Deux cas, et deux seulement : l'ancre est DÉJÀ POSÉE (re-confirmation d'un
 * épisode existant, que la persistance traite en `upsert` idempotent), ou elle
 * est EXACTEMENT la suivante. Rien d'autre.
 *
 * Sans cette garde, le `milestone` venant du navigateur, un `T7` posté sur un
 * dossier qui n'a que `T0` ouvrirait un cycle de rang 7 : les rangs 1 à 6
 * n'existeraient jamais, et `ancreSuivante` proposerait ensuite `T8`. Le trou
 * ne se referme pas — il se propage. La colonne `milestone` n'ayant AUCUN CHECK
 * en base (dette nommée par `D-113`), cette garde est la seule qui existe.
 */
export function ancreRecevable(milestone: string, ancresPosees: readonly string[]): boolean {
  if (!estAncreDeCycle(milestone)) return false;
  if (ancresPosees.includes(milestone)) return true;
  return milestone === ancreSuivante(ancresPosees);
}
