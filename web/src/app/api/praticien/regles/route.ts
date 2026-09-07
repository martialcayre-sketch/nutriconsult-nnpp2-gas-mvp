import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isC4Enabled } from '@/lib/supplement-library/featureFlag';
import { claimValideAuCorpus } from '@/lib/rag/claims/validite';
import {
  CODE_GOUVERNE_RE,
  FILTRE_PAR_STATUT,
  LIMITE_PAGE_MAX,
  SELECTION_LIGNEE,
  SELECTION_REGLE,
  cleLigneeRegle,
  estStatutRegle,
  serialiserRegle,
  validerContenuRegle,
  type RegleAtelier,
  type StatutRegle,
} from '@/lib/supplement-library/gouvernance';

// Atelier de règles cliniques (C4, LOT-03b) — liste et création, PRATICIEN
// SEUL. Le référentiel est documentaire et global au cabinet : la garde est la
// session NextAuth (domaine @wellneuro.fr), aucune donnée patient ne vit dans
// ces tables.
//
// Fail-closed : toutes les routes de l'atelier sont derrière WN_C4_ENABLED
// (précédent C5 — flag éteint = 404, jamais une surface entrouverte).
//
// Décision actée n°5 (append-only) : cette route ne fait JAMAIS d'update d'une
// règle existante. La création ouvre une LIGNÉE NEUVE (versionRegle = 1, état
// brouillon — validePar/valideLe nuls) ; si la lignée (intention, ingrédient,
// type de règle) existe déjà, on répond 409 : la suite passe par une révision.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type ReglesApiResponse =
  | {
      ok: true;
      statut: StatutRegle;
      total: number;
      regles: RegleAtelier[];
      compteurs: { brouillons: number; validees: number; desactivees: number };
    }
  | { ok: false; reason: string; error: string };

export type RegleCreationApiResponse =
  | { ok: true; regle: RegleAtelier }
  | { ok: false; reason: string; error: string };

function echec(reason: string, error: string, status: number) {
  return NextResponse.json({ ok: false as const, reason, error }, { status });
}

/** Charge les lignées complètes des règles d'une page, groupées par clé. */
async function chargerLignees(
  regles: Array<{ intentTagId: string; ingredientId: string; typeRegle: string }>,
) {
  const parCle = new Map<string, { intentTagId: string; ingredientId: string; typeRegle: string }>();
  for (const regle of regles) parCle.set(cleLigneeRegle(regle), regle);
  const lignes = parCle.size === 0
    ? []
    : await prisma.clinicalRule.findMany({
      where: {
        OR: [...parCle.values()].map((cle) => ({
          intentTagId: cle.intentTagId,
          ingredientId: cle.ingredientId,
          typeRegle: cle.typeRegle,
        })),
      },
      select: SELECTION_LIGNEE,
    });
  const groupes = new Map<string, typeof lignes>();
  for (const ligne of lignes) {
    const cle = cleLigneeRegle(ligne);
    const groupe = groupes.get(cle) ?? [];
    groupe.push(ligne);
    groupes.set(cle, groupe);
  }
  return groupes;
}

// GET /api/praticien/regles?statut=&intention=&ingredient=&limit=&offset=
export async function GET(req: Request): Promise<NextResponse<ReglesApiResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return echec('unauthenticated', 'Authentification requise.', 401);
    if (!isC4Enabled()) {
      return echec('flag_eteint', 'Atelier de règles indisponible (rayon compléments désactivé).', 404);
    }

    const { searchParams } = new URL(req.url);

    const statutBrut = (searchParams.get('statut') ?? 'brouillon').trim();
    if (!estStatutRegle(statutBrut)) {
      return echec('statut_invalide', 'Statut de règle inconnu.', 400);
    }

    const intentionBrut = (searchParams.get('intention') ?? '').trim();
    const ingredientBrut = (searchParams.get('ingredient') ?? '').trim();
    if (
      (intentionBrut && !CODE_GOUVERNE_RE.test(intentionBrut))
      || (ingredientBrut && !CODE_GOUVERNE_RE.test(ingredientBrut))
    ) {
      return echec('filtre_invalide', 'Filtre intention ou ingrédient invalide.', 400);
    }

    const limitBrut = Number(searchParams.get('limit') ?? '20');
    const offsetBrut = Number(searchParams.get('offset') ?? '0');
    if (
      !Number.isInteger(limitBrut)
      || !Number.isInteger(offsetBrut)
      || limitBrut < 1
      || limitBrut > LIMITE_PAGE_MAX
      || offsetBrut < 0
    ) {
      return echec('pagination_invalide', 'Pagination invalide.', 400);
    }

    const where = {
      ...FILTRE_PAR_STATUT[statutBrut],
      ...(intentionBrut ? { intentTag: { code: intentionBrut } } : {}),
      ...(ingredientBrut ? { ingredient: { code: ingredientBrut } } : {}),
    };

    // Ordre neutre documenté : chronologique inverse (dernière ligne créée en
    // tête), départagé par identifiant. Aucun tri « meilleure règle ».
    const [lignes, total, brouillons, validees, desactivees] = await Promise.all([
      prisma.clinicalRule.findMany({
        where,
        orderBy: [{ creeLe: 'desc' }, { id: 'asc' }],
        skip: offsetBrut,
        take: limitBrut,
        select: SELECTION_REGLE,
      }),
      prisma.clinicalRule.count({ where }),
      prisma.clinicalRule.count({ where: FILTRE_PAR_STATUT.brouillon }),
      prisma.clinicalRule.count({ where: FILTRE_PAR_STATUT.validee }),
      prisma.clinicalRule.count({ where: FILTRE_PAR_STATUT.desactivee }),
    ]);

    const lignees = await chargerLignees(lignes);
    const regles = lignes.map((ligne) =>
      serialiserRegle(ligne, lignees.get(cleLigneeRegle(ligne)) ?? []));

    return NextResponse.json({
      ok: true,
      statut: statutBrut,
      total,
      regles,
      compteurs: { brouillons, validees, desactivees },
    });
  } catch (err) {
    console.error('[praticien/regles GET]', err instanceof Error ? err.message : String(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}

type PostBody = {
  intentTagId?: unknown;
  ingredientId?: unknown;
  typeRegle?: unknown;
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

// POST /api/praticien/regles — création d'une règle en BROUILLON (lignée neuve,
// versionRegle = 1). Tous les référentiels cités doivent exister et être
// actifs ; la forme préférée doit appartenir à l'ingrédient de la règle.
export async function POST(req: Request): Promise<NextResponse<RegleCreationApiResponse>> {
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

    const intentTagId = typeof body.intentTagId === 'string' ? body.intentTagId.trim() : '';
    const ingredientId = typeof body.ingredientId === 'string' ? body.ingredientId.trim() : '';
    const typeRegle = typeof body.typeRegle === 'string' ? body.typeRegle.trim() : '';
    if (!intentTagId || !ingredientId) {
      return echec('champs_requis', 'Intention et ingrédient sont obligatoires.', 400);
    }
    if (!CODE_GOUVERNE_RE.test(typeRegle)) {
      return echec('type_regle_invalide', 'Type de règle invalide (snake_case attendu).', 400);
    }

    const verdict = validerContenuRegle(body);
    if (!verdict.ok) return echec(verdict.reason, verdict.message, 400);
    const { contenu } = verdict;

    // Référentiels : tout ce que la règle cite doit exister ET être actif.
    // Le CLAIM est dans le même lot, et pour la même raison : citer une
    // référence qui n'existe pas ou n'est pas validée n'est pas moins grave que
    // citer une source inactive ([[D-140]]).
    const [intention, ingredient, source, forme, critere, claimValide] = await Promise.all([
      prisma.clinicalIntentTag.findUnique({ where: { id: intentTagId }, select: { id: true, actif: true } }),
      prisma.supplementIngredient.findUnique({ where: { id: ingredientId }, select: { id: true, actif: true } }),
      prisma.supplementSourceReference.findUnique({
        where: { id: contenu.sourceReferenceId },
        select: { id: true, actif: true },
      }),
      contenu.formePrefereeId
        ? prisma.supplementIngredientForme.findUnique({
            where: { id: contenu.formePrefereeId },
            select: { id: true, actif: true, ingredientId: true },
          })
        : Promise.resolve(null),
      contenu.conditionCritereId
        ? prisma.clinicalCriterion.findUnique({
            where: { id: contenu.conditionCritereId },
            select: { id: true, actif: true },
          })
        : Promise.resolve(null),
      claimValideAuCorpus(contenu.claim),
    ]);

    if (!intention?.actif) {
      return echec('intention_introuvable', 'Intention clinique inconnue ou inactive.', 422);
    }
    if (!ingredient?.actif) {
      return echec('ingredient_introuvable', 'Ingrédient inconnu ou inactif.', 422);
    }
    if (!source?.actif) {
      return echec('source_introuvable', 'Source inconnue ou inactive.', 422);
    }
    if (contenu.formePrefereeId && (!forme?.actif || forme.ingredientId !== ingredientId)) {
      return echec(
        'forme_invalide',
        'La forme préférée doit être une forme active de l’ingrédient de la règle.',
        422,
      );
    }
    if (contenu.conditionCritereId && !critere?.actif) {
      return echec('critere_introuvable', 'Critère clinique inconnu ou inactif.', 422);
    }
    // UN SEUL REFUS POUR PLUSIEURS CAUSES, et c'est délibéré : le claim peut
    // n'exister nulle part, attendre validation, avoir été rejeté, désactivé,
    // ou n'être adossé à aucun verbatim source. Les distinguer ici reviendrait
    // à décrire l'état du corpus depuis l'atelier de règles — le poste de revue
    // des claims est le lieu de cette réponse, pas celui-ci.
    if (!claimValide) {
      return echec(
        'claim_non_valide',
        'Ce claim n’est pas validé au corpus : vérifiez son identifiant et sa version au '
        + 'poste de revue des claims. Une règle ne peut reposer que sur un claim signé.',
        422,
      );
    }

    // Une lignée existante ne se « recrée » pas : elle se révise (append-only).
    const ligneeExistante = await prisma.clinicalRule.count({
      where: { intentTagId, ingredientId, typeRegle },
    });
    if (ligneeExistante > 0) {
      return echec(
        'lignee_existante',
        'Cette lignée (intention, ingrédient, type de règle) existe déjà — passez par une révision.',
        409,
      );
    }

    const creee = await prisma.clinicalRule.create({
      data: {
        intentTagId,
        ingredientId,
        typeRegle,
        poids: contenu.poids ?? 1,
        justification: contenu.justification,
        // LES DEUX NATURES SÉPARÉES, ET ÉCRITES ([[D-141]]). L'ancien champ
        // `conditionSupplementaire` n'est plus écrit du tout : le moteur ne le
        // lit plus depuis [[D-138]], et continuer à l'écrire produisait une
        // règle INCONDITIONNELLE à ses yeux — le critère saisi par le praticien
        // n'atteignait aucune décision.
        conditionCritereId: contenu.conditionCritereId,
        conditionBiologie: contenu.conditionBiologie ?? undefined,
        formePrefereeId: contenu.formePrefereeId,
        doseCibleBasse: contenu.doseCibleBasse,
        doseCibleHaute: contenu.doseCibleHaute,
        gradePreuveScientifique: contenu.gradePreuveScientifique,
        sourceReferenceId: contenu.sourceReferenceId,
        claimId: contenu.claim.claimId,
        versionClaim: contenu.claim.versionClaim,
        versionRegle: 1,
        actif: true,
        // validePar / valideLe restent nuls : une règle NAÎT brouillon, la
        // signature ne se pose que par la route validation.
      },
      select: SELECTION_REGLE,
    });

    return NextResponse.json({ ok: true, regle: serialiserRegle(creee, []) }, { status: 201 });
  } catch (err) {
    console.error('[praticien/regles POST]', err instanceof Error ? err.message : String(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}
