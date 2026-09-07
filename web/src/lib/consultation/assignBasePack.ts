import { prisma } from '@/lib/prisma';
import { createPublicId } from '@/lib/ids';
import { QUESTIONNAIRE_CATALOGUE } from '@/lib/questions';
import { IDS_SUSPENDUS } from '@/lib/questionnaires-catalog';
import { IDS_PASSATION_PRATICIEN } from '@/lib/bibliotheque';
import { qidsDejaOuverts, verrouillerPatient } from '@/lib/assignations/dedup';
import { dateJourParis } from '@/lib/dateParis';
import { AGENDA_SOMMEIL_ID } from '@/lib/agenda-sommeil/types';
import { AGENDA_ALI_ID } from '@/lib/agenda-alimentaire/types';

/**
 * Les qids écartés parce que l'instrument est suspendu. Rendu à l'appelant
 * plutôt que journalisé ici : `LogPayload` exige un contexte de requête, que
 * cette fonction n'a pas — et fabriquer un faux contexte pour contenter le
 * type reviendrait à mentir dans le journal. La route qui appelle est celle
 * qui sait tracer.
 */
export function qidsSuspendus(qids: string[]): string[] {
  return qids.filter(id => IDS_SUSPENDUS.has(id));
}

/**
 * Les qids écartés parce que l'instrument est de CONSULTATION ([[D-066]]).
 * Ceinture du refus posé par `praticien/packs/route.ts` : le pack de base est
 * l'envoi de routine par excellence (chaque nouveau patient, à l'onboarding),
 * et un instrument de consultation ne doit jamais y voyager — même si une
 * composition antérieure au refus en portait un.
 */
export function qidsConsultation(qids: string[]): string[] {
  return qids.filter(id => IDS_PASSATION_PRATICIEN.has(id));
}

const catalogue = QUESTIONNAIRE_CATALOGUE as Record<string, { id: string; titre: string }>;

export type PackAssignmentOptions = {
  /** Date limite AAAA-MM-JJ (optionnelle). */
  dateLimite?: string | null;
  notes?: string;
  /**
   * Marque le consentement comme déjà donné sur chaque assignation créée
   * (utilisé par l'onboarding portail : le consentement est recueilli une
   * fois au niveau de la consultation, pas par questionnaire).
   */
  consentementDonne?: boolean;
  consentementVersion?: string | null;
  /**
   * Consultation dont le consentement couvre ces assignations (P6). Stocké en
   * lien souple sur chaque assignation pour tracer la portée du consentement.
   */
  idConsultation?: string | null;
};

/**
 * Les instruments du pack qui ne reçoivent JAMAIS d'échéance de pack.
 *
 * Un agenda est un RECUEIL, pas un questionnaire : sa fenêtre de 21 jours est
 * ancrée sur la PREMIÈRE SAISIE (`calculerFenetreDepuisDates`), pas sur
 * l'assignation. Une `dateLimite` de pack ne la borne donc pas — elle la
 * TRONQUE, à un endroit qui dépend du jour où le patient a commencé.
 *
 * Et elle ne fait pas que signaler. Sur `dateLimite`, `isDeadlineExpired`
 * ferme, dans cet ordre : la saisie d'une nuit (`api/portail/agenda-sommeil`,
 * 410), la saisie alimentaire (`agenda-alimentaire/portail`), l'affichage
 * — `hubQuestionnaires.affichage` teste `!estEnAttenteSaisie` AVANT la branche
 * agenda, donc l'agenda bascule en « Expiré » sans action — et surtout la
 * RELANCE PRATICIEN (`api/praticien/agenda-sommeil/relance`,
 * `date_limite_depassee`), c'est-à-dire le seul geste de rattrapage.
 *
 * `Q_SOM_09` est dans le pack de base de production (`prisma/seed.ts`,
 * `PACK_BASE.qids`). Sans cette exemption, poser une échéance sur le pack
 * couperait un recueil de 21 nuits en cours et fermerait le rattrapage — sans
 * qu'aucun banc ni aucun E2E ne puisse le voir, puisqu'ils tournent tous à
 * l'heure réelle et que l'échéance est toujours dans le futur au moment du run.
 *
 * Arbitrage praticien du 2026-09-07 : exempter les instruments d'agenda.
 *
 * EXPORTÉ POUR ÊTRE ASSERTABLE. `Q_ALI_09` est suspendu tant que son drapeau
 * est éteint : il n'est jamais assigné, donc aucun banc passant par
 * `assignPackToPatient` ne peut prouver son exemption. Sans cet export, le
 * retirer du Set survivrait à toute la suite — et le jour de l'allumage,
 * l'agenda alimentaire serait tronqué exactement comme celui du sommeil.
 */
export const QIDS_SANS_DATE_LIMITE: ReadonlySet<string> = new Set([AGENDA_SOMMEIL_ID, AGENDA_ALI_ID]);

/**
 * Délai de rendu du pack de base, en jours.
 *
 * VALEUR NON INVENTÉE : c'est `FENETRE_JOURS` de
 * `api/praticien/nouveaux-patients` — la fenêtre au-delà de laquelle un dossier
 * cesse d'être « un nouveau patient ». Tant que le dossier est dans l'encart,
 * l'encart le nomme (`pack_sans_reponse`) ; passé l'échéance, la carte
 * « assignation en retard » du Fil prend le relais.
 *
 * LE RELAIS N'EST PAS EXACT, ET AUCUNE VALEUR NE LE RENDRAIT EXACT. Les deux
 * signaux partent d'événements DIFFÉRENTS : l'encart compte depuis
 * `Patient.createdAt`, cette échéance depuis la VALIDATION de l'onboarding. Un
 * dossier validé d jours après sa création sort de l'encart d jours avant que
 * sa carte ne naisse : un trou de d+1 jours, jamais nul. 30 est retenu comme
 * la valeur la plus proche déjà posée dans le produit, pas comme une soudure.
 *
 * CE N'EST PAS UNE CONSTANTE PARTAGÉE : `FENETRE_JOURS` n'est pas exportable
 * (Next.js refuse au build tout export runtime hors liste dans un `route.ts`).
 * Les deux valeurs doivent donc bouger ENSEMBLE, à la main.
 *
 * CE QUE CE DÉLAI FERME, et pas seulement ce qu'il signale : passé l'échéance,
 * `isDeadlineExpired` refuse la lecture (`api/patient/questionnaire`), le
 * consentement et la soumission, et `mapAssignationPatient` bascule l'item en
 * « Expiré » dans le hub patient. Rouvrir demande un déverrouillage praticien
 * (`api/praticien/assignations`, `statutReponses: 'deverrouille'`). C'est le
 * prix du signal, pas un accident — et c'est pourquoi les agendas en sont
 * exemptés (`QIDS_SANS_DATE_LIMITE`).
 */
export const DELAI_PACK_BASE_JOURS = 30;

/**
 * Échéance AAAA-MM-JJ du pack de base, à partir du JOUR DU CABINET.
 *
 * Ancrée sur `dateJourParis`, puis avancée en jours entiers depuis minuit UTC.
 * Les deux raccourcis échouent, et pas en théorie : `now.toISOString()
 * .slice(0, 10)` rend la date UTC (une validation à 00 h 30 heure de Paris est
 * datée de la veille), et `now.getTime() + N * 86_400_000` perd un jour quand
 * la fenêtre franchit le changement d'heure.
 */
export function echeancePackBase(now: Date = new Date()): string {
  const ancre = new Date(`${dateJourParis(now)}T00:00:00Z`);
  ancre.setUTCDate(ancre.getUTCDate() + DELAI_PACK_BASE_JOURS);
  return ancre.toISOString().slice(0, 10);
}

export type CreatedAssignation = { idAssignation: string; titre: string };

export type BasePackAssignmentResult = {
  cree: CreatedAssignation[];
  /**
   * Qids écartés parce qu'une assignation ouverte les porte déjà. Rendus à
   * l'appelant pour la même raison que `qidsSuspendus` : ce chemin n'a aucun
   * praticien pour lire un écart de comptage, la route est celle qui trace.
   */
  dejaOuverts: string[];
};

/**
 * Assigne tous les questionnaires d'un pack à un patient : une `Assignation`
 * par `qid` valide (ids inconnus du catalogue ignorés, qids déjà ouverts
 * écartés). Renvoie les assignations créées et les qids écartés pour
 * antériorité. Ne gère pas l'email (laissé à l'appelant).
 */
export async function assignPackToPatient(params: {
  idPatientBusiness: string;
  emailPatient: string;
  qids: string[];
  packNom: string;
  options?: PackAssignmentOptions;
}): Promise<BasePackAssignmentResult> {
  const { idPatientBusiness, emailPatient, qids, packNom, options } = params;
  const notes = options?.notes?.trim() || `Pack ${packNom}`;
  const dateLimite = options?.dateLimite?.trim() || null;
  const now = new Date();
  if (qids.length === 0) return { cree: [], dejaOuverts: [] };

  // Vérification + créations sous verrou de la ligne patient : un qid déjà
  // porté par une assignation ouverte est écarté (idempotence — une
  // revalidation d'onboarding ne double pas le pack de base) et rendu à
  // l'appelant pour qu'il le trace.
  return prisma.$transaction(async tx => {
    await verrouillerPatient(tx, idPatientBusiness);
    const ouvertes = await qidsDejaOuverts(tx, idPatientBusiness, qids);
    const cree: CreatedAssignation[] = [];

    for (const idQuestionnaire of qids) {
      const questionnaire = catalogue[idQuestionnaire];
      // Un instrument suspendu OU de consultation est écarté comme un id
      // inconnu. Ce chemin est le plus sensible des trois : il part de
      // l'onboarding portail, donc sans clic praticien sur le questionnaire
      // lui-même — exactement l'« envoi de routine » que [[D-066]] interdit
      // aux instruments de consultation.
      if (!questionnaire || IDS_SUSPENDUS.has(idQuestionnaire) || IDS_PASSATION_PRATICIEN.has(idQuestionnaire)) continue;
      if (ouvertes.has(idQuestionnaire)) continue;
      const idAssignation = createPublicId('ASS');
      const titre = questionnaire.titre || idQuestionnaire;
      await tx.assignation.create({
        data: {
          idAssignation,
          idPatient: idPatientBusiness,
          emailPatient,
          idQuestionnaire,
          titre,
          dateAssignation: now,
          // Un agenda ne reçoit jamais l'échéance du pack : voir
          // `QIDS_SANS_DATE_LIMITE`. Le refus vit ICI et non chez l'appelant
          // parce que la contrainte est celle de l'INSTRUMENT, pas celle du
          // chemin d'assignation — `praticien/packs/assign`, qui laisse le
          // praticien saisir une date, poserait le même piège.
          dateLimite: QIDS_SANS_DATE_LIMITE.has(idQuestionnaire) ? null : dateLimite,
          statut: 'En attente',
          notes,
          idConsultation: options?.idConsultation ?? null,
          ...(options?.consentementDonne
            ? {
                consentement: 'donne',
                consentementHorodatage: now,
                consentementVersion: options.consentementVersion ?? null,
              }
            : {}),
        },
      });
      cree.push({ idAssignation, titre });
    }

    return { cree, dejaOuverts: [...ouvertes].sort() };
  });
}
