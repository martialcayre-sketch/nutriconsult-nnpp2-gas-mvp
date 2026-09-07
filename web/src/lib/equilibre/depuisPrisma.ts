import { filtrerPassationsExploitables } from '../scoring/validite';
import { BESOIN_SOURCES, JOURS_JALON, ORDRE_JALONS_MESURE } from './constants';
import { calculerEquilibre } from './score';
import type { JalonMomentum, LectureDatee, ReponsesParQuestionnaire } from './types';

const JOUR_MS = 24 * 60 * 60 * 1000;

// Forme minimale attendue d'une ligne QuestionnaireReponse (Prisma) — pas de
// dépendance directe au client Prisma pour garder ce module testable avec des
// fixtures synthétiques, comme le reste de web/src/lib/equilibre.
//
// `statutValidite` (LOT-00, chaîne T0) était OPTIONNEL, et c'est ce qui a
// produit le défaut `A03` : « absent, la passation vaut VALID ». Un champ
// facultatif dont le défaut est « valide » rend l'OUBLI indiscernable d'une
// AFFIRMATION de validité — un fail-open par le type, que le compilateur
// approuve en silence.
//
// Il est obligatoire depuis le 2026-09-08. Le rendre tel a immédiatement
// désigné trois adaptateurs qui le perdaient, dont un
// (`clinical-engine/clinicalSnapshot.ts`) que ni l'audit, ni la revue, ni la
// contre-épreuve n'avaient trouvé. Passer `null` reste possible — mais c'est
// alors un geste écrit, relisible, et non plus une omission.
//
// Coût assumé : les fixtures doivent porter le champ. C'est précisément le prix
// qui achète l'impossibilité de l'oublier.
export type ReponseBrute = {
  idQuestionnaire: string;
  dateReponse: Date;
  scoresJson: unknown;
  statutValidite: string | null;
};

// Les réponses soumises via api/patient/submit portent les réponses brutes
// sous scoresJson.rawAnswers (cf. web/src/app/api/patient/submit/route.ts) —
// nécessaires pour rappeler calculateScore(idQuestionnaire, answers) via le
// moteur d'équilibre. Les données de seed antérieures à ce chantier stockent
// uniquement le résultat déjà calculé (pas de rawAnswers) : ces
// questionnaires sont ignorés ici plutôt que de recalculer sur des données
// déjà agrégées — le besoin correspondant reste non évaluable, jamais 0 par
// défaut.
// Exporté depuis le LOT-07 : la règle de nouveauté PAR BESOIN de
// `momentumParBesoin.ts` a besoin du même prédicat d'exploitabilité que la
// règle globale ci-dessous — le recopier les ferait diverger.
export function extraireRawAnswers(scoresJson: unknown): Record<string, string | number> | null {
  if (!scoresJson || typeof scoresJson !== 'object') return null;
  const raw = (scoresJson as Record<string, unknown>).rawAnswers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, string | number>;
}

/**
 * Dédoublonne les réponses d'un patient par idQuestionnaire (garde la plus
 * récente), extrait les réponses brutes exploitables par le moteur
 * d'équilibre. `dateLimite` optionnelle : ignore toute réponse postérieure —
 * utilisé par construireHistoriqueEquilibre pour reconstituer l'état connu à
 * une date passée.
 */
export function construireReponsesParQuestionnaire(
  reponses: ReponseBrute[],
  dateLimite?: Date
): ReponsesParQuestionnaire {
  // Filtre de validité AVANT la déduplication « plus récente » : une
  // re-passation SUPERSEDED ne doit pas masquer la passation valide qui la
  // remplace, et une passation INVALID ne doit pas gagner le dédoublonnage.
  const exploitables = filtrerPassationsExploitables(reponses);
  const parQuestionnaire = new Map<string, ReponseBrute>();
  for (const r of exploitables) {
    if (dateLimite && r.dateReponse > dateLimite) continue;
    const existante = parQuestionnaire.get(r.idQuestionnaire);
    if (!existante || r.dateReponse > existante.dateReponse) {
      parQuestionnaire.set(r.idQuestionnaire, r);
    }
  }

  const resultat: ReponsesParQuestionnaire = {};
  for (const [idQuestionnaire, r] of parQuestionnaire) {
    const rawAnswers = extraireRawAnswers(r.scoresJson);
    if (rawAnswers) resultat[idQuestionnaire] = rawAnswers;
  }
  return resultat;
}

/**
 * Convention actée pour dateT0 (MON_EQUILIBRE_CONTEXTE.md §5, aucun champ
 * dédié dans le schéma Prisma) : date de la toute première réponse à un
 * questionnaire du patient — pas la date de création du dossier patient, ni
 * celle de sa première assignation, qui peuvent précéder sans lien direct le
 * moment réel où le patient a commencé à renseigner l'outil.
 */
export function resoudreDateT0(reponses: ReponseBrute[]): Date | null {
  // Une passation exclue du raisonnement n'ancre pas T0 : la première réponse
  // VALIDE fait foi (drapeau éteint → liste inchangée, comportement actuel).
  const exploitables = filtrerPassationsExploitables(reponses);
  if (exploitables.length === 0) return null;
  return exploitables.reduce(
    (plusAncienne, r) => (r.dateReponse < plusAncienne ? r.dateReponse : plusAncienne),
    exploitables[0].dateReponse
  );
}

/**
 * Historique borné aux 4 jalons T0/J21/J42/J90 (jamais une lecture par date
 * de réponse individuelle, pour rester borné quel que soit le volume de
 * réponses du patient) : à chaque jalon atteint, reconstruit l'état des
 * réponses connues jusqu'à cette date et calcule l'indice global à ce
 * moment-là. Un jalon futur (pas encore atteint) ou sans aucune couverture
 * disponible à cette date est omis, jamais représenté par une valeur à 0.
 *
 * `ancreT0` optionnel (C2B LOT-08, registre A8-1) : ancre explicitement les
 * jalons sur ce T0 plutôt que sur le T0 global (première réponse). Utilisé côté
 * praticien pour ancrer les jalons au T0 confirmé d'un épisode
 * (`assessment_episodes`). Absent → comportement inchangé (T0 global), pour la
 * fiche patient « Mon équilibre ».
 *
 * RÈGLE DE NOUVEAUTÉ (lot 1, audit de la chaîne trajectoire du 2026-07-27,
 * constat F1) : une lecture n'est émise à un jalon que si une réponse NOUVELLE
 * est arrivée depuis la dernière lecture émise. Sans cette règle, la boucle
 * recalculait à chaque jalon passé sur l'ensemble des réponses connues à cette
 * date : un patient ayant répondu une seule fois obtenait quatre lectures
 * identiques datées T0/J21/J42/J90, un delta de 0 et une tendance « stable » —
 * une absence de mesure rendue comme un résultat, ce que les frontières A6-R2
 * et A8-2 interdisent. Le jalon sans réponse nouvelle est désormais omis, donc
 * rendu « non mesuré » (`protocol/trajectoire.ts`), jamais un 0.
 *
 * Ce que la règle ne fait PAS : elle ne compare pas les valeurs. Une réponse
 * nouvelle qui laisse l'indice inchangé produit bien une lecture — c'est une
 * mesure réelle qui se trouve stable, pas un silence.
 */
export function construireHistoriqueEquilibre(brutes: ReponseBrute[], ancreT0?: Date): LectureDatee[] {
  // Filtre de validité en entrée : la règle de nouveauté (ci-dessous) ne doit
  // pas rouvrir un jalon sur l'arrivée d'une passation invalidée.
  const reponses = filtrerPassationsExploitables(brutes);
  const dateT0 = ancreT0 ?? resoudreDateT0(reponses);
  if (!dateT0) return [];

  const maintenant = new Date();
  // L'ANCRE PUIS LES MESURES, EN JOURS. Le NOM de l'ancre n'importe pas ici :
  // seule compte sa distance à elle-même, nulle par définition (`D-113`).
  //
  // Auparavant : `Object.keys(JOURS_JALON)`, qui marchait tant que la table
  // portait `T0: 0`. Depuis que les ancres forment une série ouverte, elle ne le
  // porte plus — et l'énumération aurait SILENCIEUSEMENT PERDU la lecture de
  // référence, sans qu'aucun type ne bronche. C'est le genre de régression que
  // `tsc` ne peut pas voir.
  const joursDesJalons = [0, ...ORDRE_JALONS_MESURE.map((jalon) => JOURS_JALON[jalon])];

  // Seules comptent comme nouveauté les réponses que le moteur lit RÉELLEMENT :
  // exploitables (`rawAnswers` présent, cf. extraireRawAnswers) ET portant sur
  // un questionnaire source d'un besoin. Les deux conditions sont nécessaires.
  //
  // La seconde n'est pas un raffinement : `calculerEquilibre` n'agrège que les
  // sources de la table de mapping ci-dessous — onze questionnaires sur les
  // soixante-quatre du catalogue. Sans elle, une passation hors mapping (un
  // Q_SOM_06, retiré des sources en v4 précisément parce qu'il ne mesure pas ce
  // qu'on lui faisait dire) rouvrirait un jalon dont la valeur serait, par
  // construction, identique à la précédente : « stable, écart 0 » à nouveau,
  // c'est-à-dire F1 sous une forme atténuée. Le seuil de déclenchement aurait
  // bougé, la classe de défaut serait restée ouverte.
  const idsSources = new Set(
    Object.values(BESOIN_SOURCES).flatMap((sources) => sources.map((s) => s.idQuestionnaire))
  );
  const datesReponsesRetenues = reponses
    .filter((r) => idsSources.has(r.idQuestionnaire) && extraireRawAnswers(r.scoresJson) !== null)
    .map((r) => r.dateReponse);

  const lectures: LectureDatee[] = [];
  let dateDerniereLecture: Date | null = null;
  for (const jours of joursDesJalons) {
    const dateJalon = new Date(dateT0.getTime() + jours * JOUR_MS);
    if (dateJalon > maintenant) continue;

    if (dateDerniereLecture) {
      const borneBasse = dateDerniereLecture;
      const nouveaute = datesReponsesRetenues.some(
        (date) => date > borneBasse && date <= dateJalon
      );
      if (!nouveaute) continue;
    }

    const reponsesConnues = construireReponsesParQuestionnaire(reponses, dateJalon);
    const resultat = calculerEquilibre(reponsesConnues);
    if (resultat.scoreGlobal !== null) {
      lectures.push({ date: dateJalon, valeur: resultat.scoreGlobal });
      dateDerniereLecture = dateJalon;
    }
  }
  return lectures;
}
