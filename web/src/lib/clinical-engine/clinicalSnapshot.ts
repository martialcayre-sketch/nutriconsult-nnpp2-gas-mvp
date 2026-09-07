import { BESOINS, BESOIN_SOURCES, VERSION_SCORE_EQUILIBRE } from '../equilibre/constants';
import { construireReponsesParQuestionnaire } from '../equilibre/depuisPrisma';
import { calculerNiveauxPreuveTousLesBesoins } from '../equilibre/evidence';
import { calculerObjetsCliniques, SOURCES_STABILITE_METABOLIQUE } from '../equilibre/objetsCliniques';
import { calculerCouvertureSource, calculerEquilibre } from '../equilibre/score';
import { QUESTIONNAIRE_CATALOGUE } from '../questions';
import { motifNonInterpretable } from '../scoring/passationsNonInterpretables';
import { canonicalSha256 } from './canonical';
import {
  VERSION_MAPPING_BESOINS,
  VERSION_OBJETS_CLINIQUES,
  VERSION_SCHEMA_CLINICAL_SNAPSHOT,
} from './types';
import type {
  ClinicalObjectFinding,
  ClinicalSnapshot,
  ClinicalSnapshotVersions,
  Measurement,
  PatientContext,
  QuestionnaireFinding,
  QuestionnaireResponseInput,
} from './types';
import type { AssessmentEpisode } from './types';

const ratio = (value: number | null): Measurement => ({ value, unit: 'ratio' });
const scoreToRatio = (value: number | null): number | null => value === null ? null : value / 100;

type RawAnswers = Record<string, string | number>;

function rawAnswersFrom(scoresJson: unknown): RawAnswers | null {
  if (!scoresJson || typeof scoresJson !== 'object' || Array.isArray(scoresJson)) return null;
  const raw = (scoresJson as { rawAnswers?: unknown }).rawAnswers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return null;
  if (entries.some(([, value]) => !(
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
  ))) return null;
  return raw as RawAnswers;
}

function conditionApplies(condition: string | undefined, answers: RawAnswers): boolean {
  if (!condition) return true;
  const match = condition.match(/^(\w+)(>=|<=|>|<|==)(\d+)$/);
  if (!match) return true;
  const raw = answers[match[1]];
  if (raw === undefined || raw === '') return false;
  const value = Number(raw);
  const expected = Number(match[3]);
  if (match[2] === '>=') return value >= expected;
  if (match[2] === '<=') return value <= expected;
  if (match[2] === '>') return value > expected;
  if (match[2] === '<') return value < expected;
  return value === expected;
}

function hasExploitableRawAnswers(response: QuestionnaireResponseInput): boolean {
  const answers = rawAnswersFrom(response.scoresJson);
  if (!answers) return false;
  const definition = QUESTIONNAIRE_CATALOGUE[response.questionnaireId as keyof typeof QUESTIONNAIRE_CATALOGUE];
  if (!definition) return false;
  // Le catalogue mêle fabriques typées et littéraux bruts (levée @ts-nocheck
  // par vagues, lot G-TRUST-04) : on ne dépend ici que de `id`/`conditionnel`.
  const questions = definition.sections.flatMap(
    section => section.questions as ReadonlyArray<{ id: string; conditionnel?: string; horsBareme?: boolean }>,
  );
  // Les items HORS BARÈME sortent du prédicat, et il faut qu'ils en sortent :
  // aucun score ne les lit, donc leur absence ne rend pas la passation
  // inexploitable. Sans ce filtre, le volet « conjoint » ajouté au PSQI le
  // 2026-07-31 faisait tomber l'instrument hors du bilan clinique dans deux cas
  // ordinaires — un patient qui déclare un conjoint sans l'avoir interrogé, et
  // TOUTES les passations antérieures, qui ne portent pas la question 10.
  // `conditionnel` ne pouvait pas jouer ce rôle : ici il rend l'item
  // obligatoire, quand le formulaire patient le rend facultatif.
  return questions
    .filter(question => question.horsBareme !== true)
    .filter(question => conditionApplies((question as { conditionnel?: string }).conditionnel, answers))
    .every(question => answers[question.id] !== undefined && answers[question.id] !== '');
}

function normalizeContext(context: PatientContext): PatientContext {
  return {
    mainReason: context.mainReason,
    priorityGoal: context.priorityGoal,
    expectations: [...context.expectations].sort(),
    constraints: [...context.constraints].sort(),
  };
}

function latestResponsePerQuestionnaire(responses: QuestionnaireResponseInput[]): QuestionnaireResponseInput[] {
  const latest = new Map<string, QuestionnaireResponseInput>();
  for (const response of responses) {
    const current = latest.get(response.questionnaireId);
    if (!current || response.observedAt > current.observedAt) latest.set(response.questionnaireId, response);
  }
  return [...latest.values()].sort((a, b) => a.responseId.localeCompare(b.responseId));
}

export function buildClinicalSnapshot(input: {
  snapshotId: string;
  patientId: string;
  asOf: string;
  assessmentEpisode: AssessmentEpisode;
  patientContext: PatientContext;
  responses: QuestionnaireResponseInput[];
  staleResponseIds?: string[];
}): ClinicalSnapshot {
  if (input.assessmentEpisode.status !== 'confirmed') {
    throw new TypeError('Un ClinicalSnapshot exige un AssessmentEpisode confirmé.');
  }
  if (input.assessmentEpisode.patientId !== input.patientId) {
    throw new TypeError('Le patient du snapshot doit correspondre à celui de l’épisode.');
  }
  const asOf = new Date(input.asOf);
  if (!input.asOf || Number.isNaN(asOf.getTime()) || asOf.toISOString() !== input.asOf) {
    throw new TypeError('asOf doit être une date ISO canonique valide.');
  }

  const byId = new Map(input.responses.map(response => [response.responseId, response]));
  if (byId.size !== input.responses.length) throw new TypeError('Les identifiants de réponse du snapshot doivent être uniques.');
  const episodeRefs = new Map(input.assessmentEpisode.candidateResponses.map(response => [response.responseId, response]));
  const selected = input.assessmentEpisode.includedResponseIds.map(id => {
    const response = byId.get(id);
    if (!response) throw new TypeError(`Réponse incluse absente des entrées du snapshot : ${id}.`);
    const episodeRef = episodeRefs.get(id);
    if (!episodeRef) throw new TypeError(`Réponse incluse absente des candidates de l’épisode : ${id}.`);
    const observedAt = new Date(response.observedAt);
    if (!response.observedAt || Number.isNaN(observedAt.getTime()) || observedAt.toISOString() !== response.observedAt) {
      throw new TypeError(`observedAt de la réponse ${id} doit être une date ISO canonique valide.`);
    }
    if (
      response.questionnaireId !== episodeRef.questionnaireId ||
      response.observedAt !== episodeRef.observedAt ||
      response.scoreVersion !== episodeRef.scoreVersion
    ) {
      throw new TypeError(`Les métadonnées de la réponse ${id} diffèrent de l’épisode confirmé.`);
    }
    return response;
  }).sort((a, b) => a.responseId.localeCompare(b.responseId));

  // Le moteur dédoublonne avant d'extraire rawAnswers : conserver exactement
  // cet ordre empêche de retomber sur une ancienne réponse si la plus récente
  // est inexploitable.
  const latestResponses = latestResponsePerQuestionnaire(selected);
  const effectiveResponses = latestResponses.filter(hasExploitableRawAnswers);
  const effectiveResponseIds = new Set(effectiveResponses.map(response => response.responseId));
  const rawResponses = effectiveResponses.map(response => ({
    idQuestionnaire: response.questionnaireId,
    dateReponse: new Date(response.observedAt),
    scoresJson: response.scoresJson,
    // `null` EST UNE AFFIRMATION, PAS UN OUBLI — et c'est la différence que le
    // type obligatoire achète. Les entrées de ce moteur sont filtrées EN AMONT,
    // avant d'atteindre la chaîne C1 : `api/praticien/cockpit/route.ts:250` et
    // `verifierChaineC1.ts:80` appliquent tous deux
    // `filtrerPassationsExploitables`. Le type de `response` ne transporte pas
    // le statut, il n'y a donc rien à relayer.
    //
    // CE QUE CETTE LIGNE ENGAGE : que tout futur appelant de
    // `buildClinicalSnapshot` filtre lui aussi. Le jour où l'un ne le fera pas,
    // c'est ici qu'il faudra faire descendre le champ jusqu'à `response` plutôt
    // que d'élargir ce `null`.
    statutValidite: null,
  }));
  const reponsesParQuestionnaire = construireReponsesParQuestionnaire(rawResponses);
  const equilibre = calculerEquilibre(reponsesParQuestionnaire);
  const objets = calculerObjetsCliniques(reponsesParQuestionnaire);
  const preuves = calculerNiveauxPreuveTousLesBesoins(reponsesParQuestionnaire);
  const couvertureParBesoin = new Map(equilibre.strates.flatMap(strate => strate.besoins).map(b => [b.besoin, b.couverture]));

  const questionnaireFindings: QuestionnaireFinding[] = selected.map(response => {
    const calculable = hasExploitableRawAnswers(response);
    // L'ordre compte : une passation non interprétable l'est quel que soit
    // l'état de ses réponses brutes. La dire « calculable » laisserait le C1
    // annoncer une mesure disponible là où il n'y en a pas.
    const motifNonMesure = motifNonInterpretable(response.questionnaireId, response.observedAt);
    if (motifNonMesure) {
      return {
        responseId: response.responseId,
        questionnaireId: response.questionnaireId,
        observedAt: new Date(response.observedAt).toISOString(),
        scoreVersion: response.scoreVersion,
        evaluability: 'not_interpretable' as const,
        limitations: [motifNonMesure],
      };
    }
    return {
      responseId: response.responseId,
      questionnaireId: response.questionnaireId,
      observedAt: new Date(response.observedAt).toISOString(),
      scoreVersion: response.scoreVersion,
      evaluability: calculable ? 'calculable' : 'not_calculable',
      limitations: calculable ? [] : ['Réponse sans rawAnswers complets et exploitables.'],
    };
  });

  const limitations = questionnaireFindings.flatMap(finding => finding.limitations);
  if (selected.some(response => response.scoreVersion === null)) {
    limitations.push('Version de scoring questionnaire inconnue pour au moins une réponse.');
  }

  const selectedIds = new Set(selected.map(response => response.responseId));
  const staleResponseIds = [...new Set(input.staleResponseIds ?? [])].sort();
  const unknownStaleIds = staleResponseIds.filter(id => !selectedIds.has(id));
  if (unknownStaleIds.length > 0) throw new TypeError(`Source obsolète absente de l’épisode : ${unknownStaleIds.join(', ')}.`);
  const staleIds = new Set(staleResponseIds);
  if (staleResponseIds.length > 0) limitations.push('Au moins une source est signalée comme obsolète par l’appelant.');

  const responseIdsForQuestionnaires = (questionnaireIds: string[], measurement: number | null): string[] => {
    if (measurement === null) return [];
    const accepted = new Set(questionnaireIds);
    return effectiveResponses
      .filter(response => accepted.has(response.questionnaireId))
      .map(response => response.responseId)
      .sort();
  };
  const allBalanceQuestionnaireIds = Object.values(BESOIN_SOURCES).flat().map(source => source.idQuestionnaire);
  const needQuestionnaireIds = (needId: number) => (BESOIN_SOURCES[needId] ?? []).map(source => source.idQuestionnaire);

  const clinicalObjects: ClinicalObjectFinding[] = [
    { code: 'GLOBAL_BALANCE', measurement: ratio(scoreToRatio(objets.indiceGlobal.scoreGlobal)), definitionVersion: VERSION_OBJETS_CLINIQUES, sourceResponseIds: responseIdsForQuestionnaires(allBalanceQuestionnaireIds, objets.indiceGlobal.scoreGlobal), limitations: [] },
    { code: 'METABOLIC_STABILITY', measurement: ratio(objets.stabiliteMetabolique), definitionVersion: VERSION_OBJETS_CLINIQUES, sourceResponseIds: responseIdsForQuestionnaires(SOURCES_STABILITE_METABOLIQUE.map(source => source.idQuestionnaire), objets.stabiliteMetabolique), limitations: [] },
    { code: 'ADAPTATION_RESERVE', measurement: ratio(objets.reserveAdaptation), definitionVersion: VERSION_OBJETS_CLINIQUES, sourceResponseIds: responseIdsForQuestionnaires(needQuestionnaireIds(9), objets.reserveAdaptation), limitations: [] },
    { code: 'CLARITY', measurement: ratio(objets.clarte), definitionVersion: VERSION_OBJETS_CLINIQUES, sourceResponseIds: responseIdsForQuestionnaires(needQuestionnaireIds(10), objets.clarte), limitations: [] },
    { code: 'MOMENTUM', measurement: { value: null, unit: 'delta' }, definitionVersion: VERSION_OBJETS_CLINIQUES, sourceResponseIds: [], limitations: ['Historique de jalons comparables non fourni à ce snapshot.'] },
  ];

  const versions: ClinicalSnapshotVersions = {
    snapshotSchema: VERSION_SCHEMA_CLINICAL_SNAPSHOT,
    questionnaireScoring: selected
      .map(response => ({ responseId: response.responseId, questionnaireId: response.questionnaireId, version: response.scoreVersion }))
      .sort((a, b) => a.responseId.localeCompare(b.responseId)),
    balanceScore: VERSION_SCORE_EQUILIBRE,
    needMapping: VERSION_MAPPING_BESOINS,
    clinicalObjects: VERSION_OBJETS_CLINIQUES,
  };

  const snapshotWithoutHash = {
    snapshotId: input.snapshotId,
    patientId: input.patientId,
    asOf: asOf.toISOString(),
    assessmentEpisode: input.assessmentEpisode,
    patientContext: normalizeContext(input.patientContext),
    questionnaireFindings,
    balanceAssessment: {
      global: ratio(scoreToRatio(equilibre.scoreGlobal)),
      globalBeforeCap: ratio(scoreToRatio(equilibre.scoreGlobalAvantPlafond)),
      strata: equilibre.strates.map(strate => ({ code: strate.strate, measurement: ratio(strate.couverture) })),
      needs: BESOINS.map(besoin => {
        const sources = BESOIN_SOURCES[besoin.id] ?? [];
        // `evaluability` compte les sources EXPLOITABLES, plus seulement celles
        // dont un objet de réponses existe. Le prédicat était
        // `Boolean(reponsesParQuestionnaire[id])` : il ignorait `sousScore` et
        // ignorait l'échec de scoring, si bien qu'un besoin pouvait se
        // contredire dans un seul objet — `evaluability: 'measured'` à côté
        // d'une `measurement.value` nulle et d'une preuve `NON_MESURE`. C'est
        // `evidence.ts` qui a adopté le bon prédicat en premier (#434) ; ce site
        // était le dernier porteur de l'ancien.
        //
        // Conséquence assumée : `clinicalReview` retrouve des findings
        // `missing_data` sur les besoins dont une source est répondue mais
        // inexploitable. C'est l'information juste — elle manquait.
        const answered = sources.filter(
          source => calculerCouvertureSource(source, reponsesParQuestionnaire) !== null
        ).length;
        return {
          needId: besoin.id,
          strata: besoin.strate,
          measurement: ratio(couvertureParBesoin.get(besoin.id) ?? null),
          evaluability: answered === 0 ? 'not_measured' as const : answered < sources.length ? 'partial' as const : 'measured' as const,
          evidence: preuves[besoin.id],
          questionnaireIds: [...new Set(sources.map(source => source.idQuestionnaire))].sort(),
        };
      }),
      criticalFoundations: equilibre.fondationsCritiquesDeclenchees.map(foundation => ({
        needId: foundation.besoin,
        measurement: ratio(foundation.couverture),
      })),
      limitations: [...limitations],
    },
    clinicalObjects,
    completeness: {
      availableDomains: [
        ...(selected.length > 0 ? ['questionnaires'] : []),
        ...(equilibre.scoreGlobal !== null ? ['equilibre'] : []),
      ],
      missingDomains: [
        ...(selected.length === 0 ? ['questionnaires'] : []),
        ...(equilibre.scoreGlobal === null ? ['equilibre'] : []),
      ],
      staleSources: staleResponseIds,
      sourceDateRange: input.assessmentEpisode.sourceDateRange,
    },
    sourceRefs: selected.map(response => ({
      responseId: response.responseId,
      questionnaireId: response.questionnaireId,
      observedAt: new Date(response.observedAt).toISOString(),
      scoreVersion: response.scoreVersion,
      sourceType: 'questionnaire' as const,
      status: effectiveResponseIds.has(response.responseId) ? 'calculated' as const : 'to_verify' as const,
      limitations: [
        ...(!hasExploitableRawAnswers(response) ? ['Réponse sans rawAnswers complets et exploitables.'] : []),
        ...(hasExploitableRawAnswers(response) && !effectiveResponseIds.has(response.responseId)
          ? ['Réponse remplacée par une réponse plus récente au même questionnaire.']
          : []),
        ...(staleIds.has(response.responseId) ? ['Source signalée comme obsolète par l’appelant.'] : []),
      ],
    })),
    versions,
    limitations,
  };

  // snapshotId identifie l'enveloppe, mais ne fait pas partie de la preuve des entrées.
  const { snapshotId: _snapshotId, ...hashInput } = snapshotWithoutHash;
  const sourceInputs = selected.map(response => ({
    responseId: response.responseId,
    questionnaireId: response.questionnaireId,
    observedAt: new Date(response.observedAt).toISOString(),
    scoreVersion: response.scoreVersion,
    scoresJson: response.scoresJson,
  }));
  return { ...snapshotWithoutHash, inputHash: canonicalSha256({ ...hashInput, sourceInputs }) };
}
