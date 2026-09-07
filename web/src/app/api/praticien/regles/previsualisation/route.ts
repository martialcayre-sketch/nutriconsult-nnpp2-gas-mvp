import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isC4Enabled } from '@/lib/supplement-library/featureFlag';
import { resoudreIntentions } from '@/lib/supplement-library/resolution';
import {
  deciderIntentionsAvantBiologie,
  type VerdictAvantBiologie,
} from '@/lib/supplement-library/decisionAvantBiologie';
import { lireCatalogueDecision } from '@/lib/supplement-library/catalogueDecisionPrisma';
import type { ResolutionIntentions } from '@/lib/supplement-library/types';

// Prévisualisation de résolution (C4, LOT-03b) — « tester une intention »
// depuis l'atelier de règles, PRATICIEN SEUL.
//
// C'est LE SEUL appelant légitime de `resoudreIntentions` avec
// `inclureNonValidees: true` : les brouillons sortent marqués
// (`regleValidee: false`) pour que le praticien voie ce que la lignée
// donnerait APRÈS validation. Cette sortie ne doit JAMAIS alimenter un chemin
// protocole ou patient — la barrière (motif D-003) reste : par défaut, la
// résolution ne sert que des règles validées et signées.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODES_MAX = 20;
const CODE_MAX = 100;

export type ReglesPrevisualisationApiResponse =
  | {
      ok: true;
      resolution: ResolutionIntentions;
      /**
       * Ce que le MOTEUR de décision avant biologie rend sur cette résolution
       * ([[D-133]]).
       *
       * IL N'AVAIT AUCUN APPELANT : `deciderIntentionsAvantBiologie` n'était
       * importé que par son propre banc. Cette prévisualisation est son premier,
       * et le seul lieu où il puisse l'être sans dossier — elle ne touche ni
       * protocole ni patient, la barrière de `D-003` reste entière.
       *
       * LES VERDICTS SONT DES REFUS, ET C'EST LA VÉRITÉ D'AUJOURD'HUI : le
       * catalogue de décision est vide, les claims ne sont reliés à rien, et le
       * déclencheur clinique appartient à un dossier que l'atelier n'a pas. Ce
       * que le champ apporte, c'est de nommer LEQUEL de ces obstacles mord en
       * premier — invisible jusqu'ici.
       */
      verdicts: VerdictAvantBiologie[];
    }
  | { ok: false; reason: string; error: string };

function echec(reason: string, error: string, status: number) {
  return NextResponse.json({ ok: false as const, reason, error }, { status });
}

type PostBody = { codes?: unknown };

// POST /api/praticien/regles/previsualisation — { codes: string[] }
export async function POST(req: Request): Promise<NextResponse<ReglesPrevisualisationApiResponse>> {
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

    const codes = Array.isArray(body.codes)
      ? body.codes.filter((code): code is string => typeof code === 'string')
      : null;
    if (!codes || codes.length === 0 || codes.length > CODES_MAX
      || codes.some((code) => code.trim().length === 0 || code.length > CODE_MAX)) {
      return echec(
        'codes_invalides',
        `La prévisualisation attend entre 1 et ${CODES_MAX} codes d’intention.`,
        400,
      );
    }

    const resolution = await resoudreIntentions(codes, { inclureNonValidees: true });
    // Les ingrédients que la résolution TOUCHE, et eux seuls : le contexte ne se
    // lit jamais sur le catalogue entier.
    const ingredientIds = [
      ...new Set(
        resolution.intentions.flatMap(({ regles }) => regles.map((regle) => regle.ingredient.id)),
      ),
    ];
    const verdicts = deciderIntentionsAvantBiologie(
      resolution,
      await lireCatalogueDecision(ingredientIds),
    );
    return NextResponse.json({ ok: true, resolution, verdicts });
  } catch (err) {
    console.error(
      '[praticien/regles/previsualisation POST]',
      err instanceof Error ? err.message : String(err),
    );
    return echec('exception', 'Erreur technique.', 500);
  }
}
