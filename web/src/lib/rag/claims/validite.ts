import { prisma } from '@/lib/prisma';

// LE CLAIM CITÉ EXISTE-T-IL, ET EST-IL VALIDE AU CORPUS ? ([[D-140]])
//
// POURQUOI CE MODULE EXISTE. `rag_corpus_claims` est une table SQL-brut, hors
// `schema.prisma` (`prisma.config.ts`, `tables.external`) : aucune clé
// étrangère ne peut partir de `clinical_rules` ni de `biology_functional_ranges`
// vers elle. Le lien entre une règle et son claim fondateur ne peut donc être
// gardé que par le CODE — à l'écriture (les routes de l'atelier refusent une
// règle dont le claim n'est pas valide) et à la lecture
// (`lireCatalogueDecision` remplit `claimsValidesParRegle` avec ce qui est
// constaté, jamais avec une présomption).
//
// LES MÊMES PRÉDICATS QUE LA VOIE DE RÉCUPÉRATION, EXACTEMENT. La fonction
// `match_wellneuro_rag_claims` est la seule voie autorisée à faire REMONTER un
// claim (son verbatim, sa portée, son autorité) ; ce module ne fait pas
// remonter de claim : il répond OUI ou NON sur un identifiant que l'appelant
// nomme déjà. Il n'en reprend pas moins ses cinq prédicats mot pour mot —
// `active`, `statut = 'VALIDE'`, non patient, compartiment `ACTIF`, et adossé à
// au moins un chunk source. Un claim que la récupération refuserait de servir
// ne peut pas davantage fonder une règle : deux réponses différentes sur le
// même claim seraient une incohérence clinique, pas une nuance.
//
// AUCUN TEXTE N'EN SORT : la sélection ne rend que le couple identifiant déjà
// fourni par l'appelant. Rien du corpus ne transite par ce chemin.

/** Format de `rag_corpus_claims.claim_id` (CHECK `rag_corpus_claims_claim_format`). */
export const CLAIM_ID_RE = /^WN-CL-[0-9]{4}-[0-9]{3}$/;
/** Format de `rag_corpus_claims.version_claim` (CHECK `rag_corpus_claims_version_format`). */
export const VERSION_CLAIM_RE = /^v?[0-9]+\.[0-9]+$/;

/**
 * Une référence de claim. Le COUPLE fait l'identité : `rag_corpus_claims` porte
 * son unicité sur `(claim_id, version_claim)`, jamais sur `claim_id` seul — un
 * claim reste adossé à la version qu'un praticien a validée, même si le
 * verbatim est supersédé depuis (versionnage épinglé, A9/AC-2).
 */
export type ReferenceClaim = { claimId: string; versionClaim: string };

/** Clé de carte pour un couple — jamais un `claimId` seul. */
export function cleClaim(reference: ReferenceClaim): string {
  return `${reference.claimId}::${reference.versionClaim}`;
}

/**
 * Parmi les références demandées, celles qui sont VALIDES au corpus — rendues
 * comme un ensemble de clés `cleClaim`.
 *
 * CE QUE L'ABSENCE SIGNIFIE : une référence absente de l'ensemble n'est PAS
 * valide, et l'appelant ne doit rien en déduire de plus. Elle peut n'exister
 * nulle part, être en attente de validation, avoir été rejetée, désactivée, ou
 * n'être adossée à aucun verbatim source. Les distinguer supposerait de lire le
 * corpus ; refuser ne le suppose pas (`DC-24` — l'absence d'information ne vaut
 * jamais autorisation).
 */
export async function claimsValidesAuCorpus(
  references: readonly ReferenceClaim[],
): Promise<ReadonlySet<string>> {
  // Dédoublonnage : plusieurs règles peuvent reposer sur le même claim, et une
  // seule question suffit alors.
  const uniques = new Map<string, ReferenceClaim>();
  for (const reference of references) uniques.set(cleClaim(reference), reference);
  if (uniques.size === 0) return new Set();

  const couples = [...uniques.values()];
  const claimIds = couples.map((reference) => reference.claimId);
  const versions = couples.map((reference) => reference.versionClaim);

  // `unnest(a, b)` apparie les deux tableaux POSITION PAR POSITION. Un
  // `claim_id = ANY(...) AND version_claim = ANY(...)` produirait au contraire
  // le produit croisé, et validerait une règle citant la version d'un AUTRE
  // claim demandé — un faux positif silencieux.
  const lignes = await prisma.$queryRaw<Array<{ claim_id: string; version_claim: string }>>`
    SELECT c.claim_id, c.version_claim
    FROM public.rag_corpus_claims AS c
    JOIN unnest(${claimIds}::text[], ${versions}::text[])
      AS demande(claim_id, version_claim)
      ON demande.claim_id = c.claim_id
     AND demande.version_claim = c.version_claim
    WHERE c.active = true
      AND c.statut = 'VALIDE'
      AND c.patient_identifiable = false
      AND c.compartment = 'ACTIF'
      AND EXISTS (
        SELECT 1 FROM public.rag_corpus_claim_sources AS s WHERE s.claim_pk = c.id
      )
  `;

  return new Set(
    lignes.map((ligne) => cleClaim({ claimId: ligne.claim_id, versionClaim: ligne.version_claim })),
  );
}

/** Le cas à une seule référence — l'écriture d'une règle en pose exactement une. */
export async function claimValideAuCorpus(reference: ReferenceClaim): Promise<boolean> {
  return (await claimsValidesAuCorpus([reference])).has(cleClaim(reference));
}
