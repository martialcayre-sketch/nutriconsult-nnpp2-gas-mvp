import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isC4Enabled } from '@/lib/supplement-library/featureFlag';
import { claimValideAuCorpus } from '@/lib/rag/claims/validite';
import {
  SELECTION_REGLE,
  serialiserRegle,
  validerContenuRegle,
  type RegleAtelier,
} from '@/lib/supplement-library/gouvernance';

// Révision d'une règle (C4, LOT-03b) — décision actée n°5 : le contenu d'une
// règle ne se modifie JAMAIS en place. Réviser = créer une NOUVELLE ligne de
// la même lignée (intention, ingrédient, type de règle), versionRegle + 1, en
// BROUILLON. La version en place — validée ou non — n'est PAS touchée ici :
// elle reste active et servie jusqu'à validation de la nouvelle version (route
// validation, qui la désactive dans la même transaction que la signature).
//
// Un seul brouillon à la fois par lignée : un brouillon en attente doit être
// validé ou désactivé avant d'ouvrir une nouvelle révision — sinon deux
// brouillons concurrents se disputeraient le même versionRegle.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type RegleRevisionApiResponse =
  | { ok: true; regle: RegleAtelier }
  | { ok: false; reason: string; error: string };

const MESSAGES_REFUS: Record<string, { message: string; status: number }> = {
  regle_introuvable: { message: 'Règle introuvable.', status: 404 },
  brouillon_existant: {
    message:
      'Un brouillon existe déjà dans cette lignée — validez-le ou désactivez-le avant d’ouvrir une nouvelle révision.',
    status: 409,
  },
  forme_invalide: {
    message: 'La forme préférée doit être une forme active de l’ingrédient de la règle.',
    status: 422,
  },
  source_introuvable: { message: 'Source inconnue ou inactive.', status: 422 },
  critere_introuvable: { message: 'Critère clinique inconnu ou inactif.', status: 422 },
  claim_non_valide: {
    message:
      'Ce claim n’est pas validé au corpus : vérifiez son identifiant et sa version au poste '
      + 'de revue des claims. Une règle ne peut reposer que sur un claim signé.',
    status: 422,
  },
};

function echec(reason: string, error: string, status: number) {
  return NextResponse.json({ ok: false as const, reason, error }, { status });
}

type PostBody = {
  regleId?: unknown;
  formePrefereeId?: unknown;
  doseCibleBasse?: unknown;
  doseCibleHaute?: unknown;
  gradePreuveScientifique?: unknown;
  justification?: unknown;
  sourceReferenceId?: unknown;
  poids?: unknown;
  conditionCritereId?: unknown;
  conditionBiologie?: unknown;
  claimId?: unknown;
  versionClaim?: unknown;
};

type ResultatTransaction =
  | { ok: true; creee: Parameters<typeof serialiserRegle>[0] }
  | { ok: false; raison: keyof typeof MESSAGES_REFUS };

// POST /api/praticien/regles/revision — { regleId, ...contenu complet }
export async function POST(req: Request): Promise<NextResponse<RegleRevisionApiResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return echec('unauthenticated', 'Authentification requise.', 401);
    if (!isC4Enabled()) {
      return echec('flag_eteint', 'Atelier de règles indisponible (rayon compléments désactivé).', 404);
    }

    let body: PostBody;
    try {
      body = (await req.json()) as PostBody;
    } catch {
      return echec('invalid', 'Corps de requête illisible.', 400);
    }

    const regleId = typeof body.regleId === 'string' ? body.regleId.trim() : '';
    if (!regleId) return echec('champs_requis', 'Identifiant de règle obligatoire.', 400);

    // Le contenu d'une révision est COMPLET (grade, justification, source…) :
    // une révision est une réécriture assumée, pas un patch partiel.
    const verdict = validerContenuRegle(body);
    if (!verdict.ok) return echec(verdict.reason, verdict.message, 400);
    const { contenu } = verdict;

    // Le claim se vérifie AVANT la transaction, contrairement aux autres
    // référentiels : il ne dépend pas de la lignée (que seule la transaction
    // connaît), et il vit dans une table SQL-brut hors `schema.prisma`
    // ([[D-140]]). Refuser tôt évite d'ouvrir une transaction pour rien.
    if (!(await claimValideAuCorpus(contenu.claim))) {
      const refus = MESSAGES_REFUS.claim_non_valide;
      return echec('claim_non_valide', refus.message, refus.status);
    }

    const resultat: ResultatTransaction = await prisma.$transaction(async (tx) => {
      const origine = await tx.clinicalRule.findUnique({
        where: { id: regleId },
        select: { id: true, intentTagId: true, ingredientId: true, typeRegle: true, poids: true },
      });
      if (!origine) return { ok: false, raison: 'regle_introuvable' };

      const lignee = {
        intentTagId: origine.intentTagId,
        ingredientId: origine.ingredientId,
        typeRegle: origine.typeRegle,
      };

      const brouillonExistant = await tx.clinicalRule.findFirst({
        where: { ...lignee, actif: true, validePar: null },
        select: { id: true },
      });
      if (brouillonExistant) return { ok: false, raison: 'brouillon_existant' };

      // Référentiels de la révision — vérifiés dans la transaction, l'ingrédient
      // de la lignée étant connu ici seulement.
      const [source, forme, critere] = await Promise.all([
        tx.supplementSourceReference.findUnique({
          where: { id: contenu.sourceReferenceId },
          select: { id: true, actif: true },
        }),
        contenu.formePrefereeId
          ? tx.supplementIngredientForme.findUnique({
              where: { id: contenu.formePrefereeId },
              select: { id: true, actif: true, ingredientId: true },
            })
          : Promise.resolve(null),
        contenu.conditionCritereId
          ? tx.clinicalCriterion.findUnique({
              where: { id: contenu.conditionCritereId },
              select: { id: true, actif: true },
            })
          : Promise.resolve(null),
      ]);
      if (!source?.actif) return { ok: false, raison: 'source_introuvable' };
      if (
        contenu.formePrefereeId
        && (!forme?.actif || forme.ingredientId !== origine.ingredientId)
      ) {
        return { ok: false, raison: 'forme_invalide' };
      }
      if (contenu.conditionCritereId && !critere?.actif) {
        return { ok: false, raison: 'critere_introuvable' };
      }

      const plafond = await tx.clinicalRule.aggregate({
        where: lignee,
        _max: { versionRegle: true },
      });

      const creee = await tx.clinicalRule.create({
        data: {
          ...lignee,
          versionRegle: (plafond._max.versionRegle ?? 0) + 1,
          poids: contenu.poids ?? origine.poids,
          justification: contenu.justification,
          // Les deux natures séparées, et écrites ([[D-142]]) — voir la route
          // de création pour ce que l'écriture de l'ancien champ produisait.
          conditionCritereId: contenu.conditionCritereId,
          conditionBiologie: contenu.conditionBiologie ?? undefined,
          formePrefereeId: contenu.formePrefereeId,
          doseCibleBasse: contenu.doseCibleBasse,
          doseCibleHaute: contenu.doseCibleHaute,
          gradePreuveScientifique: contenu.gradePreuveScientifique,
          sourceReferenceId: contenu.sourceReferenceId,
          claimId: contenu.claim.claimId,
          versionClaim: contenu.claim.versionClaim,
          actif: true,
          // Brouillon : validePar / valideLe restent nuls.
        },
        select: SELECTION_REGLE,
      });
      return { ok: true, creee };
    });

    if (!resultat.ok) {
      const refus = MESSAGES_REFUS[resultat.raison];
      return echec(resultat.raison, refus.message, refus.status);
    }

    return NextResponse.json({ ok: true, regle: serialiserRegle(resultat.creee, []) }, { status: 201 });
  } catch (err) {
    console.error('[praticien/regles/revision POST]', err instanceof Error ? err.message : String(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}
