import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildProtocolDraft } from '@/lib/clinical-engine/protocolDraft';
import { refusPreconditionsPersistance } from '@/lib/clinical-engine/preconditionsT0Prisma';
import { lireAncresPersistees, refusAncreNonRecevable } from '@/lib/protocol/ancresPersistees';
import { RAISON_DIVERGENCE, refusChaineC1 } from '@/lib/clinical-engine/verifierChaineC1';
import type {
  ConfirmedAssessmentEpisode,
  DecisionCard,
  ProtocolAction,
  TherapeuticLoad,
} from '@/lib/clinical-engine/types';
import {
  deriveProtocolDraftId,
  deriveVersionId,
  isClinicalChange,
  resolveActiveVersion,
  resolveCycleId,
  toDraftCreateInput,
  toEpisodeCreateInput,
} from '@/lib/protocol/versioning';
import { reconstructProtocolDraft } from '@/lib/protocol/fromPrisma';
import {
  C5_DATASET_VERSION,
  C5_PRACTITIONER_FOODS,
  assertFoodCompassActionRef,
  buildFoodCompassProtocolV2FromSource,
  isC5Enabled,
  type CiqualNutrientDatum,
} from '@/lib/food-compass';
import { buildPractitionerFoodCompassReference } from '@/lib/food-compass/practitionerReference';
import { emailPraticien, verifierAppartenancePatient } from '@/lib/praticien/appartenance';
import type { VerdictArbitrage } from '@/lib/biology-library/arbitrage';
import { refusResolutionSansArbitrage } from '@/lib/biology-library/revision';
import { canonicalSha256 } from '@/lib/clinical-engine/canonical';

// Versionnement du protocole 21 jours (C2A LOT-03). Chaque enregistrement
// explicite d'un CHANGEMENT CLINIQUE crée une ligne append-only chaînée
// (`supersedes_draft_id` = version active précédente) ; un contenu clinique
// identique est un no-op (jamais de doublon). L'horodatage de la validation
// praticien est `reviewed_at`. La construction du `ProtocolDraft` (validations
// + hash `node:crypto`) reste serveur. Aucun envoi automatique : ce lot s'arrête
// à la version relue ; la diffusion patient relève d'un lot ultérieur.
//
// NB déviation §8.6 : l'id de ligne est `${protocolDraftId}#${inputHash}` (le
// contrat réutilise `protocolDraftId` d'une révision à l'autre) — voir
// lib/protocol/versioning.ts. Additive-only, aucune migration.

type Submission = {
  purpose?: string;
  followUpCriterion?: string;
  actions?: ProtocolAction[];
  therapeuticLoad?: TherapeuticLoad;
  adviceSheetRef?: string | null;
  limitations?: string[];
};

type PostBody = {
  episode?: ConfirmedAssessmentEpisode;
  decisionCard?: DecisionCard;
  submission?: Submission;
  baseVersionId?: string | null;
};

type PostResponse =
  | {
      ok: true;
      unchanged: boolean;
      versionId: string;
      protocolDraftId: string;
      status: string;
      supersedesDraftId: string | null;
    }
  | { ok: false; reason: string; error: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

const ID_PATTERN = /^[A-Za-z0-9_:.#-]+$/;

// Gabarit littéral pour le journal des accès (G-TRUST-04) — jamais l'URL reçue.
const ROUTE_JOURNAL = '/api/praticien/protocoles/versions';

// POST — enregistre explicitement une version du protocole (relue par le praticien).
export async function POST(req: Request): Promise<NextResponse<PostResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { ok: false, reason: 'unauthenticated', error: 'Authentification requise.' },
        { status: 401 },
      );
    }

    let body: PostBody;
    try {
      body = (await req.json()) as PostBody;
    } catch {
      return NextResponse.json(
        { ok: false, reason: 'invalid', error: 'Corps de requête illisible.' },
        { status: 400 },
      );
    }

    const { episode, decisionCard, submission } = body;
    if (!episode || !decisionCard || !submission) {
      return NextResponse.json(
        { ok: false, reason: 'invalid', error: 'episode, decisionCard et submission sont requis.' },
        { status: 400 },
      );
    }
    if (episode.status !== 'confirmed' || !isNonEmptyString(episode.confirmedAt)) {
      return NextResponse.json(
        { ok: false, reason: 'not_confirmed', error: 'Seul un épisode confirmé peut porter un protocole.' },
        { status: 400 },
      );
    }
    if (!isNonEmptyString(episode.patientId) || !isNonEmptyString(decisionCard.decisionCardId)) {
      return NextResponse.json(
        { ok: false, reason: 'invalid', error: 'Identifiants de contrat manquants.' },
        { status: 400 },
      );
    }

    const idPatient = episode.patientId;
    const decisionCardId = decisionCard.decisionCardId;
    const protocolDraftId = deriveProtocolDraftId(decisionCardId);
    // Garde factorisée sans `acces` : une écriture laisse déjà sa propre
    // trace datée et attribuée (GD-1). Les deux verdicts non-`accessible`
    // rendent le 403 historique de cette route.
    const verdictPost = await verifierAppartenancePatient(idPatient, emailPraticien(session));
    if (verdictPost !== 'accessible') {
      return NextResponse.json(
        { ok: false, reason: 'forbidden', error: 'Patient non accessible pour ce praticien.' },
        { status: 403 },
      );
    }

    // OUVERTURE DE CYCLE (`D-113`), AVANT TOUT CONTRÔLE CLINIQUE. Un `milestone`
    // que rien ne relit — ou une ancre dont le rang saute — est un défaut de
    // FORME : le refuser après le rideau d'entrée ferait répondre « il manque
    // Q_MOD_03 » à un client qui a posté « T7 ». Les ancres lues ici servent
    // aussi la résolution du cycle plus bas : une seule lecture, sinon deux
    // verdicts pourraient diverger.
    const ancres = await lireAncresPersistees(episode.patientId);
    const refusAncre = refusAncreNonRecevable(episode, ancres);
    if (refusAncre) {
      return NextResponse.json(
        { ok: false, reason: 'preconditions_non_remplies', error: refusAncre },
        { status: 422 },
      );
    }

    // Préconditions T0 ([[D-052]]), APRÈS la garde d'appartenance et AVANT la
    // lecture du fil : un épisode qui ne remplit pas ses conditions n'a pas à
    // faire lire l'historique du patient. 422 et non 409 — sur cette route, 409
    // porte déjà `version_stale` et `protocol_stale`, et c'est la seule
    // discrimination que le client applique (il recharge l'historique).
    // La ligne d'abord : elle sert au garde des préconditions (les traces déjà
    // écrites) ET au contrôle de divergence ci-dessous.
    const ligneEpisode = await prisma.assessmentEpisode.findUnique({
      where: { id: episode.assessmentEpisodeId },
      // `payload` en plus de l'empreinte : il porte les contournements DÉJÀ
      // écrits, seule preuve qu'un arbitrage a eu lieu (`D-129`). Sans lui, un
      // contournement dont la condition s'est résolue depuis serait refusé
      // comme « sans objet » — et le dossier deviendrait inenregistrable.
      select: { payloadHash: true, payload: true },
    });
    const tracesEnBase = (() => {
      const brut = ligneEpisode?.payload;
      if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) return [];
      const champ = (brut as { preconditionOverrides?: unknown }).preconditionOverrides;
      return Array.isArray(champ) ? (champ as { conditionId?: string }[]) : [];
    })();
    const refusPreconditions = await refusPreconditionsPersistance(episode, emailPraticien(session) ?? '', tracesEnBase);
    if (refusPreconditions) {
      return NextResponse.json(
        { ok: false, reason: 'preconditions_non_remplies', error: refusPreconditions },
        { status: 422 },
      );
    }

    // INTÉGRITÉ DE LA CHAÎNE C1 ([[D-054]], arbitrage 5), APRÈS les
    // préconditions et AVANT la lecture du fil : une carte qui ne correspond pas
    // au dossier n'a pas à faire lire l'historique du patient.
    //
    // 409 et non 422 : sur cette route, 409 porte déjà `version_stale` et
    // `protocol_stale`, et c'est la seule discrimination que le client applique —
    // il recharge. Une carte périmée est exactement ce cas-là.
    const refusChaine = await refusChaineC1(episode, decisionCard);
    if (refusChaine) {
      return NextResponse.json(
        { ok: false, reason: RAISON_DIVERGENCE, error: refusChaine },
        { status: 409 },
      );
    }

    // Fil de versions de ce protocole logique (borné au patient).
    const rows = await prisma.protocolDraft.findMany({
      where: { idPatient, decisionCardId },
      select: { id: true, inputHash: true, supersedesDraftId: true, createdAt: true, payload: true },
    });
    const active = resolveActiveVersion(rows);

    // Anti-écrasement optimiste : le praticien construit sur une version connue.
    const baseVersionId = body.baseVersionId ?? null;
    if (baseVersionId !== null && (active?.id ?? null) !== baseVersionId) {
      return NextResponse.json(
        { ok: false, reason: 'version_stale', error: 'La version active a changé ; rechargez l’historique.' },
        { status: 409 },
      );
    }

    let activeDraft = null;
    if (active) {
      try {
        activeDraft = reconstructProtocolDraft(active.payload, active.inputHash);
      } catch {
        return NextResponse.json(
          { ok: false, reason: 'protocol_stale', error: 'Version active du protocole incohérente.' },
          { status: 409 },
        );
      }
    }

    // Construction serveur : validations + hash du moteur clinique.
    const now = new Date().toISOString();
    let draft;
    try {
      const submittedActions = submission.actions ?? [];
      const hasC5Reference = submittedActions.some(action => action.foodCompassRef !== undefined);
      if (hasC5Reference && !activeDraft) {
        throw new TypeError('Une référence C5 exige un protocole source actif.');
      }
      if (hasC5Reference && !isC5Enabled(process.env.WN_C5_ENABLED)) {
        throw new TypeError('C5 est désactivée.');
      }
      const verifiedActions = [] as ProtocolAction[];
      for (const action of submittedActions) {
        const submittedRef = action.foodCompassRef;
        if (submittedRef === undefined) {
          verifiedActions.push(action);
          continue;
        }
        assertFoodCompassActionRef(submittedRef, {
          protocolDraftId: (activeDraft as NonNullable<typeof activeDraft>).protocolDraftId,
          selectedPriorityId: (activeDraft as NonNullable<typeof activeDraft>).selectedPriorityId,
        });
        const foodRefMatch = /^ciqual-2025-v1:(\d{1,6})$/.exec(submittedRef.foodRef);
        const manifest = foodRefMatch
          ? C5_PRACTITIONER_FOODS.find(food => food.foodRef === foodRefMatch[1])
          : undefined;
        if (!foodRefMatch || !manifest) {
          throw new TypeError('Référence alimentaire C5 hors manifeste ou incompatible.');
        }
        let nutrientRows;
        try {
          nutrientRows = await prisma.ciqualNutrientValue.findMany({
            where: { datasetVersion: C5_DATASET_VERSION, ciqualCode: manifest.foodRef },
            orderBy: { nutrientCode: 'asc' },
          });
        } catch (caught) {
          console.error('[praticien/protocoles/versions C5]', caught instanceof Error ? caught.message : String(caught));
          return NextResponse.json(
            { ok: false, reason: 'reference_unavailable', error: 'Référentiel alimentaire temporairement indisponible.' },
            { status: 503 },
          );
        }
        if (nutrientRows.length !== 16
          || new Set(nutrientRows.map(row => row.nutrientCode)).size !== 16) {
          return NextResponse.json(
            { ok: false, reason: 'reference_incomplete', error: 'Référentiel alimentaire incomplet.' },
            { status: 503 },
          );
        }
        const rows: CiqualNutrientDatum[] = nutrientRows.map(row => ({
          datasetVersion: row.datasetVersion,
          ciqualCode: row.ciqualCode,
          nutrientCode: row.nutrientCode,
          value: row.value === null ? null : Number(row.value),
          valueStatus: row.valueStatus as CiqualNutrientDatum['valueStatus'],
          unit: row.unit as CiqualNutrientDatum['unit'],
          sourceRef: row.sourceRef,
          sourceHash: row.sourceHash,
        }));
        let expected;
        try {
          expected = buildPractitionerFoodCompassReference({
            ciqualCode: manifest.foodRef,
            foodLabel: manifest.label,
            rows,
            activeProtocol: activeDraft as NonNullable<typeof activeDraft>,
          }).actionRef;
        } catch {
          return NextResponse.json(
            { ok: false, reason: 'reference_incomplete', error: 'Référentiel alimentaire incomplet ou incohérent.' },
            { status: 503 },
          );
        }
        if (!expected || expected.refHash !== submittedRef.refHash) {
          throw new TypeError('La référence C5 ne correspond pas aux données officielles et au protocole actif.');
        }
        verifiedActions.push({ ...action, foodCompassRef: expected });
      }
      const baseDraft = buildProtocolDraft({
        protocolDraftId,
        decisionCard,
        createdAt: activeDraft ? activeDraft.createdAt : now,
        updatedAt: now,
        purpose: submission.purpose ?? '',
        followUpCriterion: submission.followUpCriterion ?? '',
        adviceSheetRef: submission.adviceSheetRef ?? null,
        actions: verifiedActions.map(({ foodCompassRef: _foodCompassRef, ...action }) => action),
        therapeuticLoad: submission.therapeuticLoad as TherapeuticLoad,
        limitations: submission.limitations ?? [],
        review: { reviewedAt: now, reviewerRole: 'practitioner', confirmation: 'content_reviewed' },
      });
      draft = hasC5Reference
        ? buildFoodCompassProtocolV2FromSource({
            sourceProtocolDraft: activeDraft as NonNullable<typeof activeDraft>,
            targetProtocolDraft: baseDraft,
            actions: verifiedActions,
            c5Enabled: true,
          })
        : baseDraft;
    } catch (err) {
      return NextResponse.json(
        { ok: false, reason: 'draft_invalid', error: err instanceof Error ? err.message : 'Protocole invalide.' },
        { status: 400 },
      );
    }

    // Pas de changement clinique → no-op (jamais de version en double).
    if (active && activeDraft && !isClinicalChange(activeDraft, draft)) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        versionId: active.id,
        protocolDraftId,
        status: activeDraft.status,
        supersedesDraftId: active.supersedesDraftId,
      });
    }

    // Invariant LOT-06 (D-059 §4, Lot G critère 2) : résoudre une intention
    // `conditionnelle_biologie` de la version active exige un arbitrage
    // biologique lié à CETTE version, et la résolution suit le verdict
    // (`confirme` ⇒ `active`, `infirme` ⇒ `non_indiquee_actuellement`
    // conservée). Une intention en attente ne disparaît jamais.
    if (active && activeDraft) {
      const arbitrages = await prisma.arbitrageBiologique.findMany({
        where: { protocolDraftId: active.id },
        select: { intentionId: true, verdict: true, noteCourte: true, arbitreLe: true },
      });
      const refusArbitrage = refusResolutionSansArbitrage({
        actionsActives: activeDraft.actions,
        actionsSoumises: draft.actions,
        arbitrages: arbitrages.map(arbitrage => ({
          intentionId: arbitrage.intentionId,
          verdict: arbitrage.verdict as VerdictArbitrage,
          noteCourte: arbitrage.noteCourte,
          arbitreLe: arbitrage.arbitreLe.toISOString(),
        })),
      });
      if (refusArbitrage) {
        return NextResponse.json(
          { ok: false, reason: 'resolution_sans_arbitrage', error: refusArbitrage },
          { status: 422 },
        );
      }
    }

    const versionId = deriveVersionId(protocolDraftId, draft.inputHash);
    const supersedesDraftId = active?.id ?? null;

    // Identité de cycle (gate G2), résolue AVANT la transaction : une ancre
    // ouvre son cycle, un jalon de mesure rejoint le cycle du rang le plus haut
    // déjà ouvert à sa date.
    const cycleId = resolveCycleId({ episode, ancresCandidates: ancres });

    // L'ÉPISODE REÇU DOIT ÊTRE CELUI QUI EST ENREGISTRÉ (`D-129`). Cette route
    // n'est PAS l'écrivain de l'acte : elle le reçoit du navigateur. Son
    // `upsert(..., update: {})` avalait donc une divergence en silence, sous une
    // réponse `ok: true` — un épisode périmé citait la ligne d'un autre contenu
    // et le praticien n'en savait rien. On refuse plutôt que d'avaler ; c'est le
    // cockpit, seul écrivain de l'acte, qui met la ligne à jour.
    if (ligneEpisode && ligneEpisode.payloadHash !== canonicalSha256(episode)) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'preconditions_non_remplies',
          error:
            'Cet épisode a été re-confirmé depuis. Rechargez la fiche pour repartir de la mesure enregistrée.',
        },
        { status: 422 },
      );
    }

    await prisma.$transaction([
      prisma.assessmentEpisode.upsert({
        where: { id: episode.assessmentEpisodeId },
        create: toEpisodeCreateInput(episode, { cycleId }),
        update: {},
      }),
      prisma.protocolDraft.upsert({
        where: { id: versionId },
        create: toDraftCreateInput({ id: versionId, draft, decisionCard, episode, supersedesDraftId }),
        update: {},
      }),
    ]);

    return NextResponse.json({
      ok: true,
      unchanged: false,
      versionId,
      protocolDraftId,
      status: draft.status,
      supersedesDraftId,
    });
  } catch (err) {
    console.error('[praticien/protocoles/versions POST]', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, reason: 'exception', error: 'Erreur technique.' },
      { status: 500 },
    );
  }
}

type HistoryItem = {
  versionId: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  inputHash: string;
  supersedesDraftId: string | null;
  isActive: boolean;
};

type GetResponse =
  | {
      ok: true;
      protocolDraftId: string | null;
      active: { versionId: string; status: string; createdAt: string; reviewedAt: string | null } | null;
      history: HistoryItem[];
    }
  | { ok: false; reason: string; error: string };

// GET ?idPatient=&decisionCardId= — version active + historique d'un fil.
export async function GET(req: Request): Promise<NextResponse<GetResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { ok: false, reason: 'unauthenticated', error: 'Authentification requise.' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const idPatient = (searchParams.get('idPatient') ?? '').trim();
    const decisionCardId = (searchParams.get('decisionCardId') ?? '').trim();
    if (!idPatient || !/^[A-Za-z0-9_-]+$/.test(idPatient) || idPatient.length > 64) {
      return NextResponse.json(
        { ok: false, reason: 'invalid', error: 'Identifiant patient invalide.' },
        { status: 400 },
      );
    }
    if (!decisionCardId || !ID_PATTERN.test(decisionCardId) || decisionCardId.length > 200) {
      return NextResponse.json(
        { ok: false, reason: 'invalid', error: 'Identifiant de carte de décision invalide.' },
        { status: 400 },
      );
    }

    // Garde factorisée (G-TRUST-04) : les deux verdicts non-`accessible`
    // rendent le 403 historique de cette route.
    const verdict = await verifierAppartenancePatient(idPatient, emailPraticien(session), {
      route: ROUTE_JOURNAL,
      methode: 'GET',
    });
    if (verdict !== 'accessible') {
      return NextResponse.json(
        { ok: false, reason: 'forbidden', error: 'Patient non accessible pour ce praticien.' },
        { status: 403 },
      );
    }

    const rows = await prisma.protocolDraft.findMany({
      where: { idPatient, decisionCardId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        inputHash: true,
        supersedesDraftId: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    const active = resolveActiveVersion(rows);

    // Contenu de la version active (LOT-06) : ce que l'écran d'arbitrage
    // biologique doit connaître pour préparer une révision — actions (dont
    // intentions `conditionnelle_biologie`), finalité, critère, charge. Nul si
    // le payload ne se reconstruit pas : l'historique reste servi, le panneau
    // d'arbitrage s'abstient.
    let contenuActif = null;
    if (active) {
      const ligneActive = await prisma.protocolDraft.findUnique({
        where: { id: active.id },
        select: { payload: true },
      });
      try {
        const draftActif = reconstructProtocolDraft(ligneActive?.payload, active.inputHash);
        contenuActif = {
          purpose: draftActif.purpose,
          followUpCriterion: draftActif.followUpCriterion,
          therapeuticLoad: draftActif.therapeuticLoad,
          actions: draftActif.actions,
        };
      } catch {
        contenuActif = null;
      }
    }

    return NextResponse.json({
      ok: true,
      protocolDraftId: rows.length > 0 ? deriveProtocolDraftId(decisionCardId) : null,
      active: active
        ? {
            versionId: active.id,
            status: active.status,
            createdAt: active.createdAt.toISOString(),
            reviewedAt: active.reviewedAt ? active.reviewedAt.toISOString() : null,
            contenu: contenuActif,
          }
        : null,
      history: rows.map((row) => ({
        versionId: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
        inputHash: row.inputHash,
        supersedesDraftId: row.supersedesDraftId,
        isActive: active ? row.id === active.id : false,
      })),
    });
  } catch (err) {
    console.error('[praticien/protocoles/versions GET]', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, reason: 'exception', error: 'Erreur technique.' },
      { status: 500 },
    );
  }
}
