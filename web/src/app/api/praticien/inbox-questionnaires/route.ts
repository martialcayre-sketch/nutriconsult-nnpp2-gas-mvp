import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailPraticien, filtrePatientsDuPraticien } from '@/lib/praticien/appartenance';
import { lignesEcarteesParAncre, lignesInbox, type LigneEcartee, type LigneInbox } from '@/lib/fil/inbox';
import { getSubScoreRanges, type ScoreRange } from '@/lib/scoring/ranges';
import { resolveDefinition } from '@/lib/instruments';
import { QUESTIONNAIRE_PLAINTES_LECTURE } from '@/lib/plaintes';
import {
  construireReponsesLisibles,
  type ReponseQuestionnaireLisible,
} from '@/lib/questionnaire-reponses';
import type { QuestionnaireDef } from '@/lib/questionnaire-types';
import { motifNonInterpretable, scoresSansMesure } from '@/lib/scoring/passationsNonInterpretables';
import { validitePassationsActive } from '@/lib/scoring/validite';

export type InboxQuestionnaireDetail = {
  idReponse: string;
  idPatient: string;
  idAssignation: string;
  idQuestionnaire: string;
  titre: string;
  dateSoumission: string;
  scoresParsed: Record<string, unknown> | null;
  rawAnswers: Record<string, unknown> | null;
  scorePrincipal: number | null;
  interpretation: string;
  subScoreRanges: Record<string, ScoreRange[]> | null;
  reponsesLisibles: ReponseQuestionnaireLisible[];
  /* Motif pour lequel le résultat enregistré n'est pas une mesure — `null` dans
   * le cas courant. Renseigné, il vient avec un `scorePrincipal` et une
   * `interpretation` déjà vidés côté serveur ; `rawAnswers` et
   * `reponsesLisibles`, eux, sont conservés. */
  nonInterpretable: string | null;
  /* Statut de validité de la passation (LOT-00). `VALID` dans le cas courant ;
   * `INVALID` quand le praticien l'a retirée du raisonnement clinique. */
  statutValidite: string;
  motifInvalidation: string | null;
};

export type InboxQuestionnairesApiResponse = {
  ok: boolean;
  lignes: LigneInbox[];
  /* Ce que l'ancre a ÉCARTÉ, et que l'écran taisait. Rien n'est perdu — la
   * fiche patient affiche toujours l'intégralité des réponses — mais l'inbox
   * affirmait « tout a été vu en consultation » sur la foi d'un geste du
   * PATIENT (`Consultation.dateValidation`, saisi au portail), qui ne prouve
   * aucune lecture. Elle dit désormais ce qu'elle sait, et rien de plus. */
  ecartees?: LigneEcartee[];
  patient?: { idPatient: string; nom: string };
  reponses?: InboxQuestionnaireDetail[];
  /* Le retrait praticien n'est proposé que si le filtre de validité est actif :
   * sinon l'écran promettrait un retrait que rien n'applique. */
  validiteActive?: boolean;
  unavailable?: boolean;
  error?: string;
};

const INDISPONIBLE: Omit<InboxQuestionnairesApiResponse, 'error'> = {
  ok: false,
  lignes: [],
  unavailable: true,
};

function extraireRawAnswers(scores: unknown): Record<string, unknown> | null {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return null;
  const raw = (scores as Record<string, unknown>).rawAnswers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

type ReponseInboxDb = {
  idReponse: string;
  idPatient: string;
  idAssignation: string | null;
  idQuestionnaire: string;
  titre: string;
  dateReponse: Date;
  scoresJson: unknown;
  scorePrincipal: number | null;
  interpretation: string | null;
  statutValidite?: string;
  motifInvalidation?: string | null;
};

function filtrerReponsesEnAttente(
  reponses: ReponseInboxDb[],
  ancres: Map<string, Date>,
  lues: Set<string>,
): ReponseInboxDb[] {
  return reponses.filter(r => {
    if (lues.has(r.idReponse)) return false;
    const ancre = ancres.get(r.idPatient);
    return !ancre || r.dateReponse > ancre;
  });
}

async function resoudreDefinitionPourLecture(
  idQuestionnaire: string,
  praticienEmail: string,
): Promise<QuestionnaireDef | null> {
  if (idQuestionnaire === 'Q_PLAINTES') return QUESTIONNAIRE_PLAINTES_LECTURE;
  return resolveDefinition(idQuestionnaire, {
    praticienEmail,
    inclureNonPublies: true,
  });
}

// GET /api/praticien/inbox-questionnaires — questionnaires reçus en attente
// de consultation, groupés PAR PATIENT (accueil Observatoire LOT-02, décision
// propriétaire 2026-07-23 : remplace les cartes « Reçu » du Fil). L'ancre
// « déjà vu » est la dernière consultation validée — même ancre que le
// pré-vol SP-COP ; l'accusé de lecture praticien retire ensuite les réponses
// confirmées lues, questionnaire par questionnaire.
export async function GET(req: Request): Promise<NextResponse<InboxQuestionnairesApiResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ...INDISPONIBLE, error: 'Non authentifié.' }, { status: 401 });
  }

  const idPatientDetail = (new URL(req.url).searchParams.get('idPatient') ?? '').trim();
  const emailSession = emailPraticien(session) ?? '';
  if (!emailSession) {
    return NextResponse.json({ ...INDISPONIBLE, error: 'Non authentifié.' }, { status: 401 });
  }

  try {
    const patients = await prisma.patient.findMany({
      where: {
        actif: true,
        ...(idPatientDetail ? { idPatient: idPatientDetail } : {}),
        ...filtrePatientsDuPraticien(emailSession),
      },
      select: { idPatient: true, prenom: true, nom: true },
      take: 200,
    });
    const ids = patients.map(p => p.idPatient);
    if (ids.length === 0) return NextResponse.json({ ok: true, lignes: [] });

    const selectReponse = idPatientDetail
      ? {
          idReponse: true,
          idPatient: true,
          idAssignation: true,
          idQuestionnaire: true,
          titre: true,
          dateReponse: true,
          scoresJson: true,
          scorePrincipal: true,
          interpretation: true,
          statutValidite: true,
          motifInvalidation: true,
        }
      : {
          idReponse: true,
          idPatient: true,
          titre: true,
          dateReponse: true,
        };
    const [reponses, consultations] = await Promise.all([
      prisma.questionnaireReponse.findMany({
        where: { idPatient: { in: ids } },
        select: selectReponse,
        orderBy: { dateReponse: 'desc' },
        take: 500,
      }),
      prisma.consultation.groupBy({
        by: ['idPatient'],
        where: { idPatient: { in: ids }, dateValidation: { not: null } },
        _max: { dateValidation: true },
      }),
    ]);

    const ancres = new Map(
      consultations
        .filter(c => c._max.dateValidation !== null)
        .map(c => [c.idPatient, c._max.dateValidation as Date]),
    );
    const noms = new Map(patients.map(p => [p.idPatient, `${p.prenom} ${p.nom}`.trim()]));
    const reponsesNormalisees: ReponseInboxDb[] = reponses.map(r => ({
      idReponse: r.idReponse,
      idPatient: r.idPatient,
      idAssignation: 'idAssignation' in r ? r.idAssignation : null,
      idQuestionnaire: 'idQuestionnaire' in r ? r.idQuestionnaire : '',
      titre: r.titre,
      dateReponse: r.dateReponse,
      scoresJson: 'scoresJson' in r ? r.scoresJson : null,
      scorePrincipal: 'scorePrincipal' in r ? r.scorePrincipal : null,
      interpretation: 'interpretation' in r ? r.interpretation : null,
      // DEUX CHAMPS QUE CETTE NORMALISATION LAISSAIT TOMBER. Ils sont
      // sélectionnés en base et recopiés à la sortie — mais ils ne traversaient
      // pas cet objet intermédiaire, donc `r.statutValidite` valait toujours
      // `undefined` et retombait sur `'VALID'`. Le bandeau « Retirée du
      // raisonnement clinique » ne pouvait JAMAIS s'afficher : une passation
      // que le praticien avait retirée lui revenait valide, avec son bouton
      // « Retirer » intact.
      statutValidite: 'statutValidite' in r ? r.statutValidite : undefined,
      motifInvalidation: 'motifInvalidation' in r ? r.motifInvalidation : null,
    }));
    const lectures = reponses.length > 0
      ? await prisma.questionnaireLecturePraticien.findMany({
          where: { idReponse: { in: reponses.map(r => r.idReponse) } },
          select: { idReponse: true },
        })
      : [];
    const lues = new Set(lectures.map(l => l.idReponse));

    if (idPatientDetail) {
      const patient = patients[0];
      const enAttente = filtrerReponsesEnAttente(reponsesNormalisees, ancres, lues);
      const definitions = new Map(
        await Promise.all(
          [...new Set(enAttente.map(r => r.idQuestionnaire))].map(async idQuestionnaire => [
            idQuestionnaire,
            await resoudreDefinitionPourLecture(idQuestionnaire, emailSession),
          ] as const),
        ),
      );
      return NextResponse.json({
        ok: true,
        lignes: [],
        patient: { idPatient: patient.idPatient, nom: noms.get(patient.idPatient) ?? 'Patient' },
        validiteActive: validitePassationsActive(),
        reponses: enAttente.map(r => {
          const rawAnswers = extraireRawAnswers(r.scoresJson);
          // Même retrait qu'en fiche patient, et pour la même raison : le Fil
          // est l'écran où le praticien découvre la passation. Les réponses
          // brutes et leur relecture item par item RESTENT — c'est ce que le
          // patient a réellement répondu ; seule la lecture qu'on en avait
          // tirée s'en va.
          const nonInterpretable = motifNonInterpretable(r.idQuestionnaire, r.dateReponse);
          return {
            idReponse: r.idReponse,
            idPatient: r.idPatient,
            idAssignation: r.idAssignation ?? '',
            idQuestionnaire: r.idQuestionnaire,
            titre: r.titre,
            dateSoumission: r.dateReponse.toISOString(),
            scoresParsed: nonInterpretable
              ? scoresSansMesure(r.scoresJson)
              : ((r.scoresJson as Record<string, unknown>) ?? null),
            rawAnswers,
            scorePrincipal: nonInterpretable ? null : (r.scorePrincipal ?? null),
            interpretation: nonInterpretable ? '' : (r.interpretation ?? ''),
            subScoreRanges: nonInterpretable ? null : getSubScoreRanges(r.idQuestionnaire),
            // DÉFINITION RETIRÉE sur une passation non interprétable, et c'est
            // le point le plus contre-intuitif de ce chemin.
            //
            // `construireReponsesLisibles` apparie les clés de `rawAnswers` aux
            // questions de la définition COURANTE, sans notion de date. Quand un
            // instrument est reconstruit en gardant ses identifiants d'items —
            // le cas du MFI-20 le 2026-07-31, `M1`…`M20` des deux côtés — les
            // anciennes réponses se retrouvent appariées aux NOUVEAUX libellés.
            // Onze des vingt textes ont changé, plusieurs de polarité inverse :
            // un patient ayant répondu 4 à « J'ai le sentiment de ne rien
            // faire » aurait été lu « Je me sens très actif — 4 ». La lecture
            // n'aurait pas seulement été approximative, elle aurait été
            // RENVERSÉE, et rien à l'écran ne l'aurait dit — le bandeau
            // « Interprétation retirée » porte sur le score, pas sur les items.
            //
            // Sans définition, les libellés sortent à `null` et l'écran dégrade
            // en identifiant + valeur brute. C'est exactement la doctrine
            // « marquer, pas effacer » : ce que le patient a répondu reste, la
            // lecture qu'on n'est plus en droit d'en faire s'en va.
            // Trouvé en revue adversariale.
            reponsesLisibles: construireReponsesLisibles(
              nonInterpretable ? null : (definitions.get(r.idQuestionnaire) ?? null),
              rawAnswers,
            ),
            nonInterpretable,
            statutValidite: r.statutValidite ?? 'VALID',
            motifInvalidation: r.motifInvalidation ?? null,
          };
        }),
      });
    }

    return NextResponse.json({
      ok: true,
      lignes: lignesInbox(reponsesNormalisees, ancres, noms, lues),
      ecartees: lignesEcarteesParAncre(reponsesNormalisees, ancres, noms, lues),
    });
  } catch (err) {
    console.error('[inbox-questionnaires GET]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ...INDISPONIBLE, error: 'Erreur technique.' }, { status: 500 });
  }
}

type LecturePayload = { idPatient?: string; idsReponses?: unknown };

// POST /api/praticien/inbox-questionnaires — confirmation explicite de lecture
// praticien. Le serveur revalide l'appartenance et ne crée une lecture que pour
// les réponses encore en attente de ce patient.
export async function POST(req: Request): Promise<NextResponse<InboxQuestionnairesApiResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ...INDISPONIBLE, error: 'Non authentifié.' }, { status: 401 });
  }
  const emailSession = emailPraticien(session) ?? '';
  if (!emailSession) {
    return NextResponse.json({ ...INDISPONIBLE, error: 'Non authentifié.' }, { status: 401 });
  }

  let payload: LecturePayload;
  try {
    payload = (await req.json()) as LecturePayload;
  } catch {
    return NextResponse.json({ ...INDISPONIBLE, error: 'JSON invalide.' }, { status: 400 });
  }

  const idPatient = (payload.idPatient ?? '').trim();
  const idsReponses = Array.isArray(payload.idsReponses)
    ? payload.idsReponses.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  if (!idPatient || idsReponses.length === 0) {
    return NextResponse.json({ ...INDISPONIBLE, error: 'Patient ou réponses invalides.' }, { status: 400 });
  }

  try {
    const patient = await prisma.patient.findFirst({
      where: { idPatient, actif: true, ...filtrePatientsDuPraticien(emailSession) },
      select: { idPatient: true },
    });
    if (!patient) {
      return NextResponse.json({ ...INDISPONIBLE, error: 'Patient introuvable.' }, { status: 404 });
    }

    const [reponses, consultation] = await Promise.all([
      prisma.questionnaireReponse.findMany({
        where: { idPatient, idReponse: { in: idsReponses } },
        select: { idReponse: true, idPatient: true, titre: true, dateReponse: true },
      }),
      prisma.consultation.groupBy({
        by: ['idPatient'],
        where: { idPatient, dateValidation: { not: null } },
        _max: { dateValidation: true },
      }),
    ]);
    const ancres = new Map(
      consultation
        .filter(c => c._max.dateValidation !== null)
        .map(c => [c.idPatient, c._max.dateValidation as Date]),
    );
    const dejaLues = reponses.length > 0
      ? await prisma.questionnaireLecturePraticien.findMany({
          where: { idReponse: { in: reponses.map(r => r.idReponse) } },
          select: { idReponse: true },
        })
      : [];
    const idsLues = new Set(dejaLues.map(l => l.idReponse));
    const aConfirmer = filtrerReponsesEnAttente(
      reponses.map(r => ({
        ...r,
        idAssignation: null,
        idQuestionnaire: '',
        scoresJson: null,
        scorePrincipal: null,
        interpretation: null,
      })),
      ancres,
      idsLues,
    );
    if (aConfirmer.length === 0) {
      return NextResponse.json({ ok: true, lignes: [] });
    }

    await prisma.questionnaireLecturePraticien.createMany({
      data: aConfirmer.map(r => ({
        idReponse: r.idReponse,
        idPatient,
        praticienEmail: emailSession,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ ok: true, lignes: [] });
  } catch (err) {
    console.error('[inbox-questionnaires POST]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ...INDISPONIBLE, error: 'Erreur technique.' }, { status: 500 });
  }
}
