/**
 * Date que porte la passation produite par la clôture d'un agenda — sommeil
 * comme alimentaire. Fonction pure, sans horloge : l'appelant fournit le repli.
 *
 * ARBITRAGE DU RESPONSABLE, 2026-09-08 ([[D-152]], constat `M13`) : la mesure
 * vaut pour la PÉRIODE OBSERVÉE, pas pour le geste de clôture. Elle est donc
 * datée de la DERNIÈRE journée mesurée.
 *
 * CE QUE LE COMPORTEMENT PRÉCÉDENT PRODUISAIT, mesuré en production le
 * 2026-09-08 sur les onze clôtures existantes : cinq d'entre elles, closes le
 * jour de la dernière nuit, dataient de leur fin une période de 20 à 29 jours ;
 * les six autres, closes en lot le 29 août, portaient un écart de 3 à 31 jours
 * avec leur dernière nuit — dont une nuit unique du 29 juillet datée du
 * 29 août. La tolérance de jalon étant de 8 jours, un déplacement de 31 jours
 * ne décale pas la mesure : il la sort de toute fenêtre.
 *
 * LES DATES SONT DES CHAÎNES `AAAA-MM-JJ` (`date_nuit`, `date_jour`) : leur
 * ordre lexicographique EST leur ordre chronologique, aucune conversion n'est
 * nécessaire pour trouver le maximum — et n'en faire aucune évite d'introduire
 * un fuseau là où la donnée n'en porte pas.
 *
 * L'INSTANT RETENU DANS LA JOURNÉE EST MINUIT UTC. Une journée d'agenda n'a pas
 * d'heure : lui en inventer une serait une précision que la saisie ne porte
 * pas. Minuit est la borne basse, donc celle qui ne fait jamais franchir à une
 * mesure la limite d'un jour qu'elle n'a pas atteint.
 */
export function dateMesureAgenda(datesJournees: readonly string[], repli: Date): Date {
  let derniere: string | null = null;
  for (const date of datesJournees) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (derniere === null || date > derniere) derniere = date;
  }
  if (derniere === null) return repli;
  const instant = new Date(`${derniere}T00:00:00.000Z`);
  // Une date syntaxiquement bien formée mais IMPOSSIBLE ne donne PAS un
  // `Invalid Date` : `2026-02-30` est silencieusement reporté au 2 mars. Le
  // banc l'a montré, l'intuition disait l'inverse. Une passation datée d'un
  // jour que personne n'a vécu est pire qu'une passation datée de sa clôture,
  // parce que rien ne la signale. On exige donc l'aller-retour : la date
  // reconstruite doit être celle qu'on a lue, sinon repli.
  if (Number.isNaN(instant.getTime())) return repli;
  return instant.toISOString().slice(0, 10) === derniere ? instant : repli;
}
