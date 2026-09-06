import { canonicalSha256 } from '@/lib/clinical-engine/canonical';
import { ancresOrdonnees, estAncreDeCycle } from './cycles';
import { VERSION_SCORE_EQUILIBRE } from '@/lib/equilibre/constants';
import {
  VERSION_OBJETS_CLINIQUES,
  type ConfirmedAssessmentEpisode,
  type DecisionCard,
  type ProtocolDraft,
} from '@/lib/clinical-engine/types';

// Versionnement du protocole (C2A LOT-03). Le contrat `reviseProtocolDraft`
// réutilise le même `protocolDraftId` et ne porte aucun pointeur de version : le
// chaînage append-only est donc produit ici, côté persistance, sans nouvelle
// migration. L'id de ligne encode le `protocolDraftId` en préfixe (recouvrable)
// suivi de l'`inputHash` du contenu — déviation assumée vs spec §8.6, consignée
// dans l'en-tête de la route et le SESSION_LOG.

// id de ligne de version = `${protocolDraftId}#${inputHash}`.
// Même contenu (timestamps compris) re-soumis → même id → upsert no-op
// (idempotence LOT-02 préservée) ; contenu différent → nouvelle ligne.
export function deriveVersionId(protocolDraftId: string, inputHash: string): string {
  return `${protocolDraftId}#${inputHash}`;
}

// Un protocole logique = un fil de versions regroupé par carte de décision.
// L'id logique est stable à travers les révisions du même `decisionCard`.
export function deriveProtocolDraftId(decisionCardId: string): string {
  return `proto_${decisionCardId}`;
}

// Sous-ensemble d'une ligne persistée sur lequel le versionnement raisonne.
export type PersistedVersionRow = {
  id: string;
  inputHash: string;
  supersedesDraftId: string | null;
  createdAt: Date;
};

// Version active = tête de fil : la ligne qu'aucune autre ne supplante (aucun
// `supersedesDraftId` ne pointe vers elle), la plus récente en cas d'égalité.
export function resolveActiveVersion<T extends PersistedVersionRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const superseded = new Set(
    rows.map((row) => row.supersedesDraftId).filter((id): id is string => id !== null),
  );
  const heads = rows.filter((row) => !superseded.has(row.id));
  const pool = heads.length > 0 ? heads : rows;
  return [...pool].sort((left, right) => {
    const delta = right.createdAt.getTime() - left.createdAt.getTime();
    if (delta !== 0) return delta;
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
  })[0];
}

// Empreinte de contenu CLINIQUE, volontairement sans horodatage ni review : deux
// enregistrements au même contenu clinique (mais timestamps différents) ne créent
// pas de nouvelle version. C'est le critère « changement clinique défini » du lot.
export function clinicalContentHash(draft: ProtocolDraft): string {
  return canonicalSha256({
    decisionCardId: draft.decisionCardId,
    decisionCardInputHash: draft.decisionCardInputHash,
    selectedPriorityId: draft.selectedPriorityId,
    purpose: draft.purpose,
    followUpCriterion: draft.followUpCriterion,
    adviceSheetRef: draft.adviceSheetRef,
    actions: draft.actions,
    therapeuticLoad: draft.therapeuticLoad,
    limitations: draft.limitations,
  });
}

export function isClinicalChange(
  activeDraft: ProtocolDraft | null,
  nextDraft: ProtocolDraft,
): boolean {
  if (!activeDraft) return true;
  return clinicalContentHash(activeDraft) !== clinicalContentHash(nextDraft);
}

// Épisode d'ANCRE déjà persisté, tel que l'appelant le lit pour résoudre le
// cycle. `milestone` en fait partie depuis `D-113` : l'appelant ne peut plus
// filtrer sur le seul littéral `T0`, et c'est le RANG de l'ancre qui départage.
export type AncreCandidate = {
  id: string;
  cycleId: string | null;
  confirmedAt: Date;
  milestone: string;
};

// Identité de cycle (gate G2). Fonction PURE : l'appelant fournit les ancres
// déjà persistées du patient, elle désigne le cycle auquel le nouvel épisode
// appartient. Une ancre ouvre son propre cycle ; un jalon de mesure rejoint le
// cycle du RANG LE PLUS HAUT parmi les ancres antérieures ou égales à sa
// confirmation ; sans ancre antérieure il reste `null` — jamais rattaché de
// force au premier cycle venu.
//
// LE FILTRE DE DATE RESTE, LE DÉPARTAGE PASSE AU RANG. La date interdit de
// rattacher un jalon à un cycle qui n'avait pas commencé — cette borne-là est
// physique. Mais entre deux ancres déjà ouvertes, c'est le nom qui identifie le
// cycle (`D-113` §6) ; trier sur la date choisirait en silence la source qui a
// raison le jour où les deux divergent.
export function resolveCycleId(params: {
  episode: ConfirmedAssessmentEpisode;
  ancresCandidates: AncreCandidate[];
}): string | null {
  const { episode, ancresCandidates } = params;
  if (estAncreDeCycle(episode.milestone)) return episode.assessmentEpisodeId;

  const confirmedAt = new Date(episode.confirmedAt as string).getTime();
  if (!Number.isFinite(confirmedAt)) return null;

  const anterieures = ancresOrdonnees(
    ancresCandidates.filter((candidate) => candidate.confirmedAt.getTime() <= confirmedAt),
  );

  const ancre = anterieures.at(-1);
  if (!ancre) return null;
  // Une ligne héritée dont le cycle n'a pas été backfillé n'invente rien : on
  // retombe sur son propre id, qui est par construction l'id du cycle qu'elle ouvre.
  return ancre.cycleId ?? ancre.id;
}

// Mapping contrat → colonnes `assessment_episodes` (factorisé depuis la route
// LOT-02). `cycleId` est résolu par l'appelant (gate G2) ; `versionScore` est
// figé à la confirmation — jamais recalculé à la lecture, sinon la garde A8-3
// (« pas de comparaison hors version identique ») serait indéclenchable.
export function toEpisodeCreateInput(
  episode: ConfirmedAssessmentEpisode,
  identiteCycle: { cycleId: string | null },
) {
  return {
    id: episode.assessmentEpisodeId,
    idPatient: episode.patientId,
    milestone: episode.milestone,
    targetAt: new Date(episode.targetAt),
    confirmedAt: new Date(episode.confirmedAt as string),
    payload: episode as unknown as object,
    payloadHash: canonicalSha256(episode),
    contractVersion: VERSION_OBJETS_CLINIQUES,
    cycleId: identiteCycle.cycleId,
    versionScore: VERSION_SCORE_EQUILIBRE,
  };
}

/**
 * Mapping contrat → colonnes d'une RE-CONFIRMATION (`D-129`).
 *
 * Une re-confirmation remplace ce que l'épisode RETIENT, et rien d'autre. Les
 * sept colonnes hors de portée, et le motif de chacune :
 *  - `id`, `idPatient`, `milestone` : l'identité de la ligne ;
 *  - `confirmedAt` : la DATE DE L'ACTE, dont la création est l'écrivain unique
 *    — `runtimeFromPrisma` en fait la date de référence de tout jalon de mesure
 *    du cycle, et le portail patient y adosse la fermeture de ses jalons ;
 *  - `targetAt` : la géométrie de la fenêtre, posée avec l'acte ;
 *  - `cycleId` : la seule dont l'écriture peut violer l'index unique partiel
 *    `assessment_episodes_mesure_cycle_unique_idx` ;
 *  - `versionScore` : figé à la mesure, sinon la garde A8-3 (« pas de
 *    comparaison hors version identique ») devient indéclenchable.
 */
export function toEpisodeUpdateInput(episode: ConfirmedAssessmentEpisode) {
  return {
    payload: episode as unknown as object,
    payloadHash: canonicalSha256(episode),
    contractVersion: VERSION_OBJETS_CLINIQUES,
  };
}

// Mapping contrat → colonnes `protocol_drafts`. L'`id` de ligne et le
// `supersedesDraftId` sont fournis par l'appelant : la route LOT-02 passe
// `id = protocolDraftId` sans supersedes (idempotence historique), la route de
// versionnement passe `id = deriveVersionId(...)` + supersedes = version active.
export function toDraftCreateInput(params: {
  id: string;
  draft: ProtocolDraft;
  decisionCard: DecisionCard;
  episode: ConfirmedAssessmentEpisode;
  supersedesDraftId: string | null;
}) {
  const { id, draft, decisionCard, episode, supersedesDraftId } = params;
  return {
    id,
    idPatient: episode.patientId,
    assessmentEpisodeId: episode.assessmentEpisodeId,
    decisionCardId: decisionCard.decisionCardId,
    decisionCardInputHash: decisionCard.inputHash,
    snapshotInputHash: decisionCard.snapshotInputHash,
    reviewInputHash: decisionCard.reviewInputHash,
    selectedPriorityId: draft.selectedPriorityId,
    status: draft.status,
    payload: draft as unknown as object,
    inputHash: draft.inputHash,
    contractVersion: draft.version,
    supersedesDraftId,
    reviewedAt: draft.status === 'practitioner_reviewed'
      // Les nouveaux contrats conservent la date exacte de revue. Le repli sur
      // updatedAt maintient la lecture des anciens payloads déjà persistés.
      ? new Date(draft.review?.reviewedAt ?? draft.updatedAt)
      : null,
  };
}
