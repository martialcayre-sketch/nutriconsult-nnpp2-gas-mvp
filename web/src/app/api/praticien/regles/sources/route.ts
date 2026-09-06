import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isC4Enabled } from '@/lib/supplement-library/featureFlag';
import { CITATION_MAX, LIEN_URL_MAX } from '@/lib/supplement-library/gouvernance';

// RÉFÉRENCES SOURCES DE L'ATELIER DE RÈGLES — [[D-131]].
//
// LE CHEMIN QUI MANQUAIT. `clinical_rules.source_reference_id` est NOT NULL, et
// `POST /api/praticien/regles` refuse toute règle dont la source n'existe pas et
// n'est pas active. Or AUCUN écrivain de `supplement_source_references`
// n'existait — ni route, ni seed, ni script. L'atelier de règles, qui fonctionne
// par ailleurs, était donc structurellement incapable de créer sa PREMIÈRE
// règle. État lu en production le 2026-09-06 par conteneur : `sources` 0,
// `clinical_rules` 0, pour 3 444 ingrédients — la couche matière est peuplée, la
// couche décision est vide et n'était pas remplissable.
//
// POURQUOI UNE SAISIE PRATICIEN, ET PAS UN IMPORT. La décision n°11 du moteur
// d'intention interdit la synchronisation live et toute écriture en base active
// depuis une source externe ; `LOT-00-AUDIT-SOURCES` en tire la conséquence pour
// cette table précise — « par curation manuelle praticien », faute de tout
// format machine côté ANSES. Ce POST est cette curation. Il n'ouvre aucun flux :
// il ne lit rien d'externe, il enregistre ce qu'un praticien authentifié écrit.
//
// CE QU'IL N'OUVRE PAS. Ni `supplement_safety_alerts`, ni `functional_categories`,
// ni `ingredient_functional_thresholds` — les trois autres tables sans écrivain.
// Elles portent des SEUILS et des NIVEAUX d'alerte, c'est-à-dire du contenu
// clinique chiffré (`DC-19`, `DC-20`) : leur chemin d'écriture se pose avec le
// cadre qui vérifie ce qu'on y met, pas au passage d'une PR qui débloque une
// citation.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type SourceCreee = { id: string; citation: string; lienUrl: string | null };

export type SourceCreationApiResponse =
  | { ok: true; source: SourceCreee }
  | { ok: false; reason: string; error: string };

function echec(reason: string, error: string, status: number) {
  return NextResponse.json<SourceCreationApiResponse>(
    { ok: false, reason, error },
    { status },
  );
}

/**
 * Le lien est FACULTATIF, mais s'il est là il doit être ouvrable.
 *
 * Une source dont le lien ne s'ouvre pas est pire qu'une source sans lien : elle
 * promet une vérification qu'elle ne permet pas. `http`/`https` seulement — un
 * `javascript:` ou un `data:` posé dans un champ que l'écran rend en lien est
 * une injection, pas une référence.
 */
function lienRecevable(valeur: string): boolean {
  try {
    const url = new URL(valeur);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// POST /api/praticien/regles/sources — { citation, lienUrl? }
export async function POST(req: Request): Promise<NextResponse<SourceCreationApiResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return echec('unauthenticated', 'Authentification requise.', 401);
    if (!isC4Enabled()) {
      return echec('flag_eteint', 'Atelier de règles indisponible (rayon compléments désactivé).', 404);
    }

    let body: { citation?: unknown; lienUrl?: unknown };
    try {
      body = (await req.json()) as { citation?: unknown; lienUrl?: unknown };
    } catch {
      return echec('invalid', 'Corps de requête illisible.', 400);
    }

    // LA CITATION EST LA SOURCE. Un blanc n'en est pas une, et
    // `validerContenuRegle` dit déjà pourquoi : « une règle sans source ne peut
    // pas exister ». Une source vide reviendrait à en rendre une possible.
    const citation = typeof body.citation === 'string' ? body.citation.trim() : '';
    if (citation.length === 0) {
      return echec(
        'citation_requise',
        'La citation est obligatoire — une source sans citation ne référence rien.',
        400,
      );
    }
    if (citation.length > CITATION_MAX) {
      return echec(
        'citation_trop_longue',
        `La citation est trop longue (${CITATION_MAX} caractères au plus).`,
        400,
      );
    }

    const lienBrut = typeof body.lienUrl === 'string' ? body.lienUrl.trim() : '';
    const lienUrl = lienBrut.length > 0 ? lienBrut : null;
    if (lienUrl !== null && (lienUrl.length > LIEN_URL_MAX || !lienRecevable(lienUrl))) {
      return echec(
        'lien_invalide',
        'Le lien doit être une adresse http(s) valide, ou rester vide.',
        400,
      );
    }

    // DOUBLON REFUSÉ À L'APPLICATION, faute de garde en base. La table ne porte
    // aucune contrainte d'unicité sur la citation, et l'ajouter serait une
    // migration — hors de cette PR. Deux lignes pour une même source ne
    // corrompent rien, mais elles scindent la lignée : deux règles citant « la
    // même » référence par deux identifiants ne se relient plus. Comparaison
    // insensible à la casse sur le texte détouré ; la dette de la garde en base
    // est nommée à [[D-131]].
    const existante = await prisma.supplementSourceReference.findFirst({
      where: { citation: { equals: citation, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existante) {
      return echec(
        'citation_deja_presente',
        'Cette source figure déjà au référentiel — citez celle qui existe plutôt que d’en créer une seconde.',
        409,
      );
    }

    const source = await prisma.supplementSourceReference.create({
      data: { citation, lienUrl },
      select: { id: true, citation: true, lienUrl: true },
    });
    return NextResponse.json<SourceCreationApiResponse>({ ok: true, source }, { status: 201 });
  } catch (err) {
    console.error('[praticien/regles/sources POST]', err instanceof Error ? err.message : String(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}
