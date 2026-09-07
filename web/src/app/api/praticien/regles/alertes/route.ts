import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isC4Enabled } from '@/lib/supplement-library/featureFlag';
import {
  CODE_GOUVERNE_RE,
  MESSAGE_ALERTE_MAX,
  NIVEAU_ALERTE_MAX,
} from '@/lib/supplement-library/gouvernance';

// ALERTES DE SÉCURITÉ — [[D-132]], suite de [[D-131]].
//
// CE QUE LE CATALOGUE D'ALERTES DÉBLOQUE, et c'est le point le plus lourd du
// lot : `deciderIntentionAvantBiologie` refuse TOUT tant que ce catalogue n'est
// pas PUBLIÉ — « aucune alerte » ne serait pas un constat, seulement une absence
// d'examen ([[D-056]] arbitrage 2, garde au niveau du CATALOGUE et non de
// l'ingrédient). Sans écrivain, ce refus était définitif.
//
// LE NIVEAU N'EST PAS UNE ÉCHELLE, et le dire est plus honnête que d'en fixer
// une : `niveau_alerte` est un `TEXT` sans `CHECK`, aucun vocabulaire n'est
// défini dans le dépôt, et le moteur de décision NE LE LIT PAS — toute alerte
// active refuse, quel que soit son niveau. Poser ici « orange / rouge »
// inventerait une gradation clinique que rien ne source (`DC-19`, `DC-20`). Le
// champ est donc exigé et borné, pas contraint ; la dette est nommée à
// [[D-132]].
//
// UNE ALERTE NAÎT ACTIVE, et rien ici ne la retire : `actif` n'est pas reçu du
// client. Retirer une alerte de sécurité est un geste distinct, qui demande sa
// propre trace — cette route ne l'ouvre pas.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type AlerteCreee = {
  id: string;
  code: string;
  messageFr: string;
  niveauAlerte: string;
};

export type AlerteCreationApiResponse =
  | { ok: true; alerte: AlerteCreee }
  | { ok: false; reason: string; error: string };

export type AlertesListeApiResponse =
  | { ok: true; alertes: AlerteCreee[] }
  | { ok: false; reason: string; error: string };

function echec(reason: string, error: string, status: number) {
  return NextResponse.json<AlerteCreationApiResponse>(
    { ok: false, reason, error },
    { status },
  );
}

/**
 * GET — les alertes ACTIVES.
 *
 * Il ne sert pas qu'à l'ergonomie : c'est par lui que le praticien constate que
 * le catalogue EXISTE, et le catalogue publié est précisément ce que
 * `deciderIntentionAvantBiologie` exige avant de proposer quoi que ce soit.
 * Écrire une alerte sans pouvoir la relire laisserait ce constat invérifiable.
 */
export async function GET(): Promise<NextResponse<AlertesListeApiResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json<AlertesListeApiResponse>(
        { ok: false, reason: 'unauthenticated', error: 'Authentification requise.' },
        { status: 401 },
      );
    }
    if (!isC4Enabled()) {
      return NextResponse.json<AlertesListeApiResponse>(
        { ok: false, reason: 'flag_eteint', error: 'Atelier de règles indisponible (rayon compléments désactivé).' },
        { status: 404 },
      );
    }
    const alertes = await prisma.supplementSafetyAlert.findMany({
      where: { actif: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, messageFr: true, niveauAlerte: true },
    });
    return NextResponse.json<AlertesListeApiResponse>({ ok: true, alertes });
  } catch (err) {
    console.error('[praticien/regles/alertes GET]', err instanceof Error ? err.message : String(err));
    return NextResponse.json<AlertesListeApiResponse>(
      { ok: false, reason: 'exception', error: 'Erreur technique.' },
      { status: 500 },
    );
  }
}

// POST /api/praticien/regles/alertes — { code, messageFr, niveauAlerte }
export async function POST(req: Request): Promise<NextResponse<AlerteCreationApiResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return echec('unauthenticated', 'Authentification requise.', 401);
    if (!isC4Enabled()) {
      return echec('flag_eteint', 'Atelier de règles indisponible (rayon compléments désactivé).', 404);
    }

    let body: { code?: unknown; messageFr?: unknown; niveauAlerte?: unknown };
    try {
      body = (await req.json()) as { code?: unknown; messageFr?: unknown; niveauAlerte?: unknown };
    } catch {
      return echec('invalid', 'Corps de requête illisible.', 400);
    }

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!CODE_GOUVERNE_RE.test(code)) {
      return echec('code_invalide', 'Code invalide (snake_case minuscule attendu).', 400);
    }

    // LE MESSAGE EST L'ALERTE. `deciderIntentionAvantBiologie` le sert TEL QUEL
    // au praticien quand il refuse (« Alerte de sécurité active sur X : … ») :
    // une alerte sans message refuserait sans dire quoi.
    const messageFr = typeof body.messageFr === 'string' ? body.messageFr.trim() : '';
    if (messageFr.length === 0 || messageFr.length > MESSAGE_ALERTE_MAX) {
      return echec(
        'message_requis',
        `Le message de l’alerte est obligatoire (${MESSAGE_ALERTE_MAX} caractères au plus) — `
          + 'il est servi tel quel au praticien quand l’alerte refuse.',
        400,
      );
    }

    const niveauAlerte = typeof body.niveauAlerte === 'string' ? body.niveauAlerte.trim() : '';
    if (niveauAlerte.length === 0 || niveauAlerte.length > NIVEAU_ALERTE_MAX) {
      return echec(
        'niveau_requis',
        `Le niveau d’alerte est obligatoire (${NIVEAU_ALERTE_MAX} caractères au plus).`,
        400,
      );
    }

    try {
      const alerte = await prisma.supplementSafetyAlert.create({
        data: { code, messageFr, niveauAlerte },
        select: { id: true, code: true, messageFr: true, niveauAlerte: true },
      });
      return NextResponse.json<AlerteCreationApiResponse>({ ok: true, alerte }, { status: 201 });
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
        return echec('code_deja_pris', 'Ce code d’alerte existe déjà.', 409);
      }
      throw err;
    }
  } catch (err) {
    console.error('[praticien/regles/alertes POST]', err instanceof Error ? err.message : String(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}
