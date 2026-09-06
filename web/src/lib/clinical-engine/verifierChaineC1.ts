import { prisma } from '@/lib/prisma';
import { ORDRE_CONSULTATION_PORTEUSE, whereConsultationPorteuse } from '@/lib/consultation/consultationPorteuse';
import { filtrerPassationsExploitables } from '@/lib/scoring/validite';
import { canonicalJson, canonicalSha256 } from './canonical';
import { lireEffetsIndesirables } from './effetsIndesirablesPrisma';
import { construireChaineC1Tolerante, lireSelectionPriorite } from './selectionPrioritePrisma';
import { adaptRuntimeInputs } from './runtimeFromPrisma';
import type { ConfirmedAssessmentEpisode, DecisionCard } from './types';

// RECALCUL SERVEUR DE LA CHAÎNE C1 — [[D-054]], arbitrage 5.
//
// LE DÉFAUT QUE CE MODULE FERME. Les deux points de persistance
// (`POST /api/praticien/protocoles/versions` et `POST /api/praticien/protocoles`)
// recevaient la `DecisionCard` du NAVIGATEUR et l'écrivaient telle quelle : rien
// ne comparait ses trois empreintes à quoi que ce soit. Une carte portant
// `abstention: {status: 'not_required'}` et un candidat inventé passait toutes
// les validations structurelles — la fixture du banc de la route en était
// elle-même une, avec `inputHash: 'HASH_DEC'`.
//
// CE QU'IL FAIT. Il RECONSTRUIT la chaîne depuis la base, aux horodatages
// soumis, et compare les trois `inputHash`. Il ne fait pas confiance au corps de
// requête pour ce qu'il vérifie — même discipline que
// `refusPreconditionsPersistance`, et pour le même motif : un contrôle qui lirait
// ce qu'il doit vérifier serait un contrôle client déguisé.
//
// POURQUOI LES HORODATAGES SOUMIS, ET POURQUOI CE N'EST PAS UN TROU. Les
// identifiants sont EXCLUS des trois empreintes (`clinicalSnapshot.ts`,
// `clinicalReview.ts`, `decisionCard.ts`) ; `createdAt` et `asOf`, eux, y
// entrent. Recalculer à l'heure courante ferait donc diverger toute carte
// honnête. Un horodatage forgé, lui, ne gagne rien : il ne change ni les
// passations lues, ni les règles appliquées, ni l'abstention — seulement la date
// portée par une carte que le praticien vient d'écrire, et que la ligne
// persistée date de toute façon elle-même.
//
// CE MODULE NE FAIT PAS : ni authentification, ni contrôle d'appartenance, ni
// journalisation. Les deux routes appellent APRÈS leur garde d'appartenance : on
// ne lit pas le dossier d'un patient qu'on n'a pas prouvé sien.

/** Motif servi au client sur divergence — jamais de contenu clinique. */
export const RAISON_DIVERGENCE = 'chaine_c1_divergente';

function estIsoCanonique(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !valeur) return false;
  const date = new Date(valeur);
  return !Number.isNaN(date.getTime()) && date.toISOString() === valeur;
}

/**
 * Les entrées runtime du patient, lues en base.
 *
 * MÊMES LECTURES QUE `loadRuntimeInputs` (cockpit), délibérément : la
 * consultation VALIDÉE la plus récente pour le contexte patient, toutes les
 * passations du dossier pour l'épisode, et le filtre de validité (LOT-00,
 * drapeau éteint par défaut) appliqué au même endroit. Une lecture qui
 * divergerait ferait 409 sur une carte honnête — c'est le seul mode de panne de
 * ce module, et il est bruyant plutôt que silencieux.
 *
 * Le `route.ts` du cockpit ne peut pas exporter de valeur (Next.js casse au
 * build sans que `tsc --noEmit` le voie) : la lecture est donc écrite ici, et
 * `adaptRuntimeInputs` — la seule pièce qui TRADUIT — reste partagée.
 */
async function entreesRuntime(idPatient: string) {
  const [responses, consultation] = await Promise.all([
    prisma.questionnaireReponse.findMany({
      where: { idPatient },
      select: { idReponse: true, idQuestionnaire: true, dateReponse: true, scoresJson: true, statutValidite: true },
      orderBy: [{ dateReponse: 'asc' }, { idReponse: 'asc' }],
    }),
    prisma.consultation.findFirst({
      where: whereConsultationPorteuse(idPatient),
      select: { anamnese: true },
      orderBy: ORDRE_CONSULTATION_PORTEUSE,
    }),
  ]);
  return adaptRuntimeInputs(
    // `createdAt` n'est lu que par `proposeRuntimeEpisode`, qui n'est PAS appelé
    // ici : l'épisode vient du corps de requête et c'est justement ce qu'on
    // vérifie. Une seconde lecture du patient n'achèterait rien.
    { idPatient, createdAt: new Date(0) },
    filtrerPassationsExploitables(responses),
    consultation,
  );
}

/**
 * `null` si la carte soumise correspond exactement au recalcul serveur, sinon un
 * message français de refus (à servir en 409 `chaine_c1_divergente`).
 *
 * FAIL-CLOSED : toute exception du moteur clinique — passation disparue,
 * métadonnée d'épisode qui ne correspond plus, provenance invalide — est une
 * divergence, jamais un laissez-passer.
 */
export async function refusChaineC1(
  episode: ConfirmedAssessmentEpisode,
  decisionCard: DecisionCard,
): Promise<string | null> {
  if (!estIsoCanonique(decisionCard.createdAt)) {
    return 'La carte de décision ne porte pas d’horodatage ISO canonique : elle ne peut pas être recalculée.';
  }
  if (typeof decisionCard.inputHash !== 'string' || !decisionCard.inputHash) {
    return 'La carte de décision ne porte aucune empreinte : elle ne peut pas être recalculée.';
  }

  // LA CARTE EST-ELLE FIDÈLE À SA PROPRE EMPREINTE ?
  //
  // LE DÉFAUT QUE CE BLOC FERME, trouvé en revue le 2026-08-12. Les trois
  // comparaisons plus bas confrontent le recalcul aux empreintes DÉCLARÉES par
  // le client — jamais au CONTENU de la carte soumise. Une carte dont
  // l'abstention, les candidats et les limitations sont entièrement réécrits,
  // mais qui transporte les trois empreintes honnêtes, passait donc les trois :
  // le serveur recalculait bien, comparait bien, et comparait deux nombres que
  // le fraudeur n'avait aucune raison de toucher. Le contenu, lui, n'était lu
  // par personne.
  //
  // `decisionCardId` est le SEUL champ exclu de l'empreinte (`decisionCard.ts`,
  // dernière ligne de `buildDecisionCard`) : le reste doit se re-hacher à
  // l'identique.
  //
  // Posé AVANT la lecture du dossier : une carte qui ne se recoupe pas
  // elle-même n'a pas à faire lire le patient.
  try {
    const { decisionCardId: _identifiant, inputHash: _empreinte, ...contenuSoumis } = decisionCard;
    if (canonicalSha256(contenuSoumis) !== decisionCard.inputHash) {
      return 'La carte de décision ne correspond pas à sa propre empreinte : elle a été modifiée après sa préparation.';
    }
  } catch {
    // Sérialisation canonique impossible (valeur non JSON, cycle, date brute) :
    // une carte qu'on ne sait pas hacher est une carte qu'on n'écrit pas.
    return 'La carte de décision n’est pas sérialisable de façon canonique : elle ne peut pas être vérifiée.';
  }

  const inputs = await entreesRuntime(episode.patientId);
  // Même lecture que le cockpit, par la même fonction : le vérificateur
  // recalcule, il ne réinterprète pas ([[D-101]]). Drapeau éteint ⇒ `undefined`
  // des deux côtés, donc aucune divergence possible.
  const effetsIndesirables = await lireEffetsIndesirables(episode.patientId);

  let recalculee;
  try {
    ({ chaine: recalculee } = construireChaineC1Tolerante({
      // Identifiants d'enveloppe : EXCLUS des empreintes, repris tels quels pour
      // que l'objet recalculé soit comparable champ à champ à celui qui a été
      // soumis.
      snapshotId: decisionCard.snapshotId,
      reviewId: decisionCard.reviewId,
      decisionCardId: decisionCard.decisionCardId,
      patientId: episode.patientId,
      horodatage: decisionCard.createdAt,
      episode,
      patientContext: inputs.patientContext,
      responses: inputs.responses,
      // RELU EN BASE, ET PLUS RÉINJECTÉ DEPUIS LE CORPS DE REQUÊTE ([[D-127]]
      // §1bis). `D-054` arbitrage 5 le nommait « le seul champ que le serveur ne
      // peut pas dériver » — c'était vrai tant qu'aucune table ne le portait.
      // Depuis que la sélection est un acte consigné, le serveur la dérive comme
      // le reste, par la MÊME fonction que le cockpit ([[D-101]]).
      //
      // Ce que ce déplacement ferme : une carte forgée portant une sélection que
      // le praticien n'a jamais posée. Elle passait auparavant, parce que le
      // recalcul repartait de la valeur soumise — `buildDecisionCard` vérifiait
      // seulement que le CANDIDAT était réellement classé, jamais que la
      // SÉLECTION avait eu lieu. Désormais la comparaison canonique de contenu,
      // quelques lignes plus bas, oppose la carte soumise à une carte construite
      // sur la sélection RÉELLE : le motif inventé et l'horodatage forgé y
      // divergent tous les deux.
      //
      // Le REPLI de `construireChaineC1Tolerante` s'applique ici comme au
      // cockpit, et c'est obligatoire : un repli fait d'un seul côté rendrait
      // 409 sur une carte honnête dès qu'une sélection devient inapplicable.
      // Relu en base par `entreesRuntime`, comme le contexte patient : les deux
      // sortent de la même consultation validée, par le même `adaptRuntimeInputs`.
      // Un signal lu ici et pas dans le cockpit — ou l'inverse — ferait diverger
      // la revue recalculée et rendrait 409 sur une carte honnête.
      signauxAlerte: inputs.signauxAlerte,
      etatPopulation: inputs.etatPopulation,
      effetsIndesirables,
    }, await lireSelectionPriorite(episode.patientId, decisionCard.decisionCardId)));
  } catch (error) {
    return `La chaîne clinique ne peut pas être recalculée sur ce dossier : ${
      error instanceof Error ? error.message : 'entrées incohérentes.'
    }`;
  }

  // TROIS COMPARAISONS, ET NON UNE SEULE. La dernière suffirait à rejeter (les
  // deux premières empreintes entrent dans la troisième) ; les nommer séparément
  // dit au praticien QUEL maillon a bougé — les données, la revue, ou la carte.
  if (recalculee.snapshot.inputHash !== decisionCard.snapshotInputHash) {
    return 'Les données du dossier ont changé depuis la préparation de cette décision. Rechargez le cockpit.';
  }
  if (recalculee.review.inputHash !== decisionCard.reviewInputHash) {
    return 'La revue clinique recalculée ne correspond pas à celle qui accompagne cette décision. Rechargez le cockpit.';
  }
  if (recalculee.decisionCard.inputHash !== decisionCard.inputHash) {
    return 'La carte de décision soumise ne correspond pas au recalcul serveur. Rechargez le cockpit.';
  }

  // CEINTURE ET BRETELLES : le CONTENU, champ à champ, et pas seulement son
  // empreinte.
  //
  // Ce que les trois comparaisons ne ferment pas, même avec le recoupement
  // d'empreinte posé plus haut : une CLÉ SURNUMÉRAIRE. `canonicalize` ignore
  // `undefined`, et rien n'oblige un champ inconnu du contrat à faire bouger un
  // hash calculé sur les champs connus. Comparer les deux JSON canoniques rend
  // le contrôle indépendant de ce que `buildProtocolDraft` lira ensuite — et
  // c'est ce qu'on veut, car ce module garde la BASE, pas un consommateur.
  //
  // `decisionCardId` est écarté des deux côtés : il identifie l'enveloppe et le
  // recalcul le reprend du corps de requête, le comparer ne dirait rien.
  const { decisionCardId: _soumis, ...contenu } = decisionCard;
  const { decisionCardId: _recalcule, ...contenuRecalcule } = recalculee.decisionCard;
  if (canonicalJson(contenuRecalcule) !== canonicalJson(contenu)) {
    return 'Le contenu de la carte de décision soumise ne correspond pas au recalcul serveur. Rechargez le cockpit.';
  }
  return null;
}
