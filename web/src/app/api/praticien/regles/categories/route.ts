import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isC4Enabled } from '@/lib/supplement-library/featureFlag';
import {
  CODE_GOUVERNE_RE,
  DESCRIPTION_MAX,
  LABEL_MAX,
} from '@/lib/supplement-library/gouvernance';

// CATÉGORIES FONCTIONNELLES — [[D-132]], suite de [[D-131]].
//
// Deuxième des quatre tables de décision C4 restées sans écrivain. Elle ne
// porte QUE des libellés : un code gouverné, un intitulé français, une
// description facultative. Aucune valeur clinique chiffrée — c'est ce qui la
// rend livrable ici, quand les seuils ne le sont pas (voir [[D-132]]).
//
// À QUOI ELLE SERT. Un seuil fonctionnel se publie SUR une catégorie
// (`ingredient_functional_thresholds.categorie_fonctionnelle_id`, NOT NULL) :
// sans catégorie, aucun seuil n'est représentable. Elle est donc le préalable du
// maillon suivant, et se pose avant lui.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type CategorieCreee = {
  id: string;
  code: string;
  labelFr: string;
  description: string | null;
};

export type CategorieCreationApiResponse =
  | { ok: true; categorie: CategorieCreee }
  | { ok: false; reason: string; error: string };

export type CategoriesListeApiResponse =
  | { ok: true; categories: CategorieCreee[] }
  | { ok: false; reason: string; error: string };

function echec(reason: string, error: string, status: number) {
  return NextResponse.json<CategorieCreationApiResponse>(
    { ok: false, reason, error },
    { status },
  );
}

/**
 * GET — les catégories ACTIVES, pour que l'écran montre ce qui existe déjà.
 *
 * UN RÉFÉRENTIEL QU'ON ÉCRIT SANS LE RELIRE N'EN EST PAS UN : le code est unique
 * en base, et sans liste une ressaisie rendrait 409 devant un écran muet.
 */
export async function GET(): Promise<NextResponse<CategoriesListeApiResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json<CategoriesListeApiResponse>(
        { ok: false, reason: 'unauthenticated', error: 'Authentification requise.' },
        { status: 401 },
      );
    }
    if (!isC4Enabled()) {
      return NextResponse.json<CategoriesListeApiResponse>(
        { ok: false, reason: 'flag_eteint', error: 'Atelier de règles indisponible (rayon compléments désactivé).' },
        { status: 404 },
      );
    }
    const categories = await prisma.functionalCategory.findMany({
      where: { actif: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, labelFr: true, description: true },
    });
    return NextResponse.json<CategoriesListeApiResponse>({ ok: true, categories });
  } catch (err) {
    console.error('[praticien/regles/categories GET]', err instanceof Error ? err.message : String(err));
    return NextResponse.json<CategoriesListeApiResponse>(
      { ok: false, reason: 'exception', error: 'Erreur technique.' },
      { status: 500 },
    );
  }
}

// POST /api/praticien/regles/categories — { code, labelFr, description? }
export async function POST(req: Request): Promise<NextResponse<CategorieCreationApiResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return echec('unauthenticated', 'Authentification requise.', 401);
    if (!isC4Enabled()) {
      return echec('flag_eteint', 'Atelier de règles indisponible (rayon compléments désactivé).', 404);
    }

    let body: { code?: unknown; labelFr?: unknown; description?: unknown };
    try {
      body = (await req.json()) as { code?: unknown; labelFr?: unknown; description?: unknown };
    } catch {
      return echec('invalid', 'Corps de requête illisible.', 400);
    }

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!CODE_GOUVERNE_RE.test(code)) {
      return echec('code_invalide', 'Code invalide (snake_case minuscule attendu).', 400);
    }

    const labelFr = typeof body.labelFr === 'string' ? body.labelFr.trim() : '';
    if (labelFr.length === 0 || labelFr.length > LABEL_MAX) {
      return echec('label_requis', `Le libellé français est obligatoire (${LABEL_MAX} caractères au plus).`, 400);
    }

    const descriptionBrute = typeof body.description === 'string' ? body.description.trim() : '';
    if (descriptionBrute.length > DESCRIPTION_MAX) {
      return echec('description_trop_longue', `La description est trop longue (${DESCRIPTION_MAX} caractères au plus).`, 400);
    }

    try {
      const categorie = await prisma.functionalCategory.create({
        data: { code, labelFr, description: descriptionBrute || null },
        select: { id: true, code: true, labelFr: true, description: true },
      });
      return NextResponse.json<CategorieCreationApiResponse>({ ok: true, categorie }, { status: 201 });
    } catch (err) {
      // Le code est UNIQUE en base : la garde est là, on n'a qu'à la traduire.
      if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
        return echec('code_deja_pris', 'Ce code de catégorie existe déjà.', 409);
      }
      throw err;
    }
  } catch (err) {
    console.error('[praticien/regles/categories POST]', err instanceof Error ? err.message : String(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}
