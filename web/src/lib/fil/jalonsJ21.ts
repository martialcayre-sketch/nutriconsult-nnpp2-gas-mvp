import { ensureReponses, optionLibelle } from '@/lib/protocol/checkinDomain';
import type { JalonRow } from './cartes';

// Filtrage des jalons J21 (accueil-observatoire LOT-03) — domaine PUR, aucun
// accès base. « Jalon atteint sans décision consignée » se lit comme la
// DIFFÉRENCE entre deux artefacts persistés (arbitrage A1 : les deux sont
// distincts et aucun champ « décision oui/non » n'existe) :
//   - J21 soumis        → il existe un `ProtocolCheckin` pointEtape='J21' ;
//   - décision consignée → il existe un `AssessmentEpisode` milestone='J21'.
// Une décision « Continuer » ne crée aucun artefact ; se fonder sur l'épisode
// J21 (le marqueur persisté le plus fiable) évite d'en inventer un.
//
// LA DIFFÉRENCE EST TEMPORELLE, PAS SEULEMENT ENSEMBLISTE ([[D-151]], constat
// `A04`). Écarter tout patient portant AU MOINS UN épisode J21 fait masquer un
// point d'étape par une décision qui lui est ANTÉRIEURE. Deux chemins y mènent,
// et le second n'a pas besoin de deux cycles :
//   · entre cycles — un épisode J21 du cycle 1 masque l'attente du cycle 2 ;
//   · DANS UN SEUL CYCLE — les deux « J21 » vivent sur deux calendriers
//     (point d'étape = `approvedAt` + 21 ± 3 j ; mesure = `confirmedAt` de
//     l'ancre + 21 ± 8 j), donc un épisode de mesure confirmé AVANT l'arrivée
//     du point d'étape supprime la carte définitivement.
// La règle porte donc sur la PRÉCÉDENCE : un point d'étape n'est décidé que par
// un épisode confirmé À PARTIR de sa soumission.
//
// CE QUI N'EST PAS FAIT ICI, ET POURQUOI. L'audit proposait de rapprocher les
// objets « par l'identité métier appropriée », c'est-à-dire par cycle. La
// chaîne `checkin.protocolDraftId → draft.assessmentEpisodeId → episode.cycleId`
// est nullable aux deux maillons, et l'unique `protocol_draft` de production
// n'a PAS d'`assessment_episode_id` : une jointure par cycle apparierait mal
// ou tomberait en silence. La règle temporelle ferme le même risque sans
// dépendre d'une chaîne que la production ne peuple pas.

export type CheckinJ21Row = { id: string; idPatient: string; reponses: unknown; soumisLe: Date };

/**
 * Un jalon par patient ACTIF dont le check-in J21 le plus récent n'a pas encore
 * reçu de décision — c'est-à-dire qu'aucun épisode J21 du dossier n'a été
 * confirmé À PARTIR de sa soumission.
 * L'ancre du refus est le check-in J21 le plus récent (une correction en
 * ajoute un plus récent → la carte écartée revient : fait nouveau, nouvelle
 * décision). L'action principale observée n'est citée que si le check-in est
 * lisible — jamais devinée.
 */
export function jalonsSansDecision(
  checkinsJ21: CheckinJ21Row[],
  /**
   * Date du dernier épisode J21 confirmé, par patient. Une `Map` et non un
   * `Set` : c'est la DATE qui décide, pas la seule présence.
   */
  dernierEpisodeJ21ParPatient: Map<string, Date>,
  actifs: Set<string>,
): Omit<JalonRow, 'momentum'>[] {
  const dernierParPatient = new Map<string, CheckinJ21Row>();
  for (const c of checkinsJ21) {
    if (!actifs.has(c.idPatient)) continue;
    const actuel = dernierParPatient.get(c.idPatient);
    if (!actuel || c.soumisLe > actuel.soumisLe) dernierParPatient.set(c.idPatient, c);
  }

  return [...dernierParPatient.values()]
    // La carte reste tant qu'AUCUN épisode n'a été confirmé à partir de la
    // soumission : un épisode confirmé à l'instant même compte donc comme LA
    // décision de ce point d'étape, pas comme une décision antérieure.
    .filter(c => {
      const decision = dernierEpisodeJ21ParPatient.get(c.idPatient);
      return decision === undefined || decision < c.soumisLe;
    })
    .map(c => {
      let adhesion: string | null = null;
      try {
        adhesion = optionLibelle('adhesion', ensureReponses(c.reponses).adhesion);
      } catch {
        adhesion = null; // check-in illisible : on ne cite rien
      }
      return { idCheckin: c.id, idPatient: c.idPatient, soumisLe: c.soumisLe, adhesion };
    });
}
