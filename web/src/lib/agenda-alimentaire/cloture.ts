import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { computeScoreFromDef } from '@/lib/questions';
import { resolveDefinition } from '@/lib/instruments';
import { createPublicId } from '@/lib/ids';
import { calculerAgregatsAli, type AgregatsAgendaAli } from './agregats';
import { resolveJoursActifs } from './jour';
import { dateMesureAgenda } from '@/lib/agenda/dateMesureAgenda';
import { listJours } from './persistence';
import { AGENDA_ALI_ID } from './types';

// Clôture d'un agenda alimentaire (Q_ALI_09) — chemin UNIQUE de production de
// la réponse, calqué sur le jumeau `agenda-sommeil/cloture.ts`. Produit une
// QuestionnaireReponse STANDARD (mêmes champs que /api/patient/submit) :
// compatibilité automatique avec la fiche, l'inbox et la mini-synthèse.
// Idempotente : une seconde clôture renvoie la réponse déjà produite.
//
// CE QUE LA CLÔTURE TRANSMET, ET RIEN D'AUTRE (D-039) : la totalité des
// agrégats que le domaine calcule (`AgregatsAgendaAli`), avec leurs
// dénominateurs de couverture, en pseudo-items `AGA_*` dans `rawAnswers`.
// Sans poids, sans seuil, sans sélection — transmettre n'est pas coter.
// `Q_ALI_09` garde `scoring:{type:'journal'}` : la réponse rend `scored:false`
// et aucun score principal. Le tri clinique appartient au barème (LOT-02),
// derrière la porte des 21 jours.
//
// Ce fichier n'est PAS réexporté par `index.ts` : l'index du domaine est pur
// (aucun import Prisma), même règle que `persistence.ts`.

export type ClotureAliResultat = {
  idReponse: string;
  titre: string;
  nbJours: number;
  dejaCloture: boolean;
};

/**
 * Pseudo-item d'un agrégat : `AGA_` + clé du domaine en SNAKE_CASE majuscule
 * (`jeuneMedian` → `AGA_JEUNE_MEDIAN`). La liste des pseudo-items est DÉRIVÉE
 * de l'objet calculé, jamais recopiée (D-039) : une clé ajoutée au domaine est
 * transmise sans qu'aucune table ici ne doive suivre — c'est le banc qui
 * épingle les noms à la main et rougit sur toute clé nouvelle ou renommée.
 */
export function pseudoItemAgendaAli(cle: string): string {
  return `AGA_${cle.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
}

/** Compteur transmis même quand la couverture est trop faible pour agréger. */
export const PSEUDO_ITEM_NB_JOURS = 'AGA_NB_JOURS';

/**
 * `rawAnswers` d'une clôture : tous les agrégats, dérivés — ou, sous le seuil
 * de couverture où le domaine ne calcule rien (`calculerAgregatsAli` → null),
 * au moins le compte de journées actives. Une métrique non couverte reste
 * `null` jusque dans `rawAnswers` : elle se lit comme inconnue, jamais comme
 * un zéro (même doctrine que le jumeau sommeil).
 */
export function rawAnswersDepuisAgregats(
  agregats: AgregatsAgendaAli | null,
  nbJoursActifs: number,
): Record<string, number | null> {
  if (agregats === null) return { [PSEUDO_ITEM_NB_JOURS]: nbJoursActifs };
  const raw: Record<string, number | null> = {};
  for (const [cle, valeur] of Object.entries(agregats)) {
    raw[pseudoItemAgendaAli(cle)] = valeur;
  }
  return raw;
}

export async function cloturerAgendaAli(input: { idAssignation: string }): Promise<ClotureAliResultat> {
  const ass = await prisma.assignation.findUnique({ where: { idAssignation: input.idAssignation } });
  if (!ass) throw new TypeError('Agenda introuvable.');
  if (ass.idQuestionnaire !== AGENDA_ALI_ID) {
    throw new TypeError("Cette assignation n'est pas un agenda alimentaire.");
  }
  // Annulée par le praticien : la clôture PRODUIT une QuestionnaireReponse et
  // repasse `statut` à 'Complété' — sans ce refus, une annulation serait
  // silencieusement écrasée. Chemin unique de clôture : le garde y suffit.
  if (ass.statut === 'Annulée') {
    throw new TypeError('Cet agenda alimentaire a été annulé et ne peut pas être clôturé.');
  }

  // Idempotence : déjà clôturé → renvoyer la réponse existante sans en recréer.
  if (ass.statutReponses === 'verrouille') {
    const existante = await prisma.questionnaireReponse.findFirst({
      where: { idAssignation: ass.idAssignation },
      orderBy: { dateReponse: 'desc' },
      select: { idReponse: true, scoresJson: true },
    });
    if (existante) {
      const raw = (existante.scoresJson as Record<string, unknown> | null)?.rawAnswers as
        | Record<string, unknown>
        | undefined;
      const nbJours = typeof raw?.[PSEUDO_ITEM_NB_JOURS] === 'number' ? (raw[PSEUDO_ITEM_NB_JOURS] as number) : 0;
      return { idReponse: existante.idReponse, titre: ass.titre, nbJours, dejaCloture: true };
    }
  }

  const lecture = await listJours(ass.idPatient, ass.idAssignation);
  // Fail-closed sur la quarantaine : clôturer par-dessus des lignes illisibles
  // transmettrait des agrégats calculés sur un recueil amputé, en silence. Le
  // lecteur praticien nomme déjà ces journées ; l'incident se règle avant.
  if (lecture.illisibles > 0) {
    throw new TypeError(
      `Recueil non clôturable : ${lecture.illisibles} ligne(s) illisible(s) en quarantaine` +
        (lecture.datesIllisibles.length > 0 ? ` (${lecture.datesIllisibles.join(', ')})` : '') +
        '. Régler l’incident d’intégrité avant de clôturer.',
    );
  }

  const joursActifs = resolveJoursActifs(lecture.jours);
  if (joursActifs.length === 0) {
    throw new TypeError('Aucune journée renseignée : rien à clôturer.');
  }
  // `JourRow` porte `dateJour` et `reponses` — la forme exacte de
  // `JourAgregable` : l'agrégation lit les deux (le week-end lit la date).
  const agregats = calculerAgregatsAli(joursActifs);
  const rawAnswers = rawAnswersDepuisAgregats(agregats, joursActifs.length);

  const def = await resolveDefinition(AGENDA_ALI_ID, { pourPassation: true });
  const scores = (def ? computeScoreFromDef(def, rawAnswers) : { error: 'Définition introuvable' }) as Record<
    string,
    unknown
  >;

  // Type `journal` : `scored:false`, aucun total, aucune interprétation — la
  // clôture n'en fabrique pas (un libellé posé ici serait un jugement sans
  // barème, exactement ce que D-039 exclut).
  let interpretation = '';
  if (scores.interpretation && typeof scores.interpretation === 'object') {
    interpretation = ((scores.interpretation as Record<string, unknown>).label as string) ?? '';
  }
  const scorePrincipal: number | null = typeof scores.total === 'number' ? scores.total : null;
  const scoresWithAnswers = { ...scores, rawAnswers } as Prisma.InputJsonValue;

  const idReponse = createPublicId('REP');
  const now = new Date();
  // La passation vaut pour la PÉRIODE OBSERVÉE, pas pour le geste de clôture
  // ([[D-152]], arbitrage du responsable du 2026-09-08). `now` reste l'instant
  // du geste : il date le verrouillage de l'assignation, pas la mesure.
  const dateMesure = dateMesureAgenda(joursActifs.map(x => x.dateJour), now);

  // Création de la réponse + verrouillage de l'assignation dans une seule
  // transaction, avec re-vérification sous verrou de LIGNE (SELECT … FOR
  // UPDATE) : deux clôtures concurrentes ne produisent qu'une réponse — il
  // n'existe pas de contrainte d'unicité sur questionnaire_reponses
  // .id_assignation, c'est le verrou qui garantit l'unicité (même motif que le
  // jumeau sommeil).
  const resultat = await prisma.$transaction(async (tx) => {
    const verrou = await tx.$queryRaw<Array<{ statutReponses: string }>>`
      SELECT statut_reponses AS "statutReponses"
      FROM assignations
      WHERE id_assignation = ${ass.idAssignation}
      FOR UPDATE`;
    if (verrou[0]?.statutReponses === 'verrouille') {
      const existante = await tx.questionnaireReponse.findFirst({
        where: { idAssignation: ass.idAssignation },
        orderBy: { dateReponse: 'desc' },
        select: { idReponse: true },
      });
      if (existante) return { idReponse: existante.idReponse, dejaCloture: true };
    }
    await tx.questionnaireReponse.create({
      data: {
        idReponse,
        idPatient: ass.idPatient,
        emailPatient: ass.emailPatient.toLowerCase(),
        idAssignation: ass.idAssignation,
        idQuestionnaire: AGENDA_ALI_ID,
        titre: ass.titre || AGENDA_ALI_ID,
        dateReponse: dateMesure,
        scoresJson: scoresWithAnswers,
        scorePrincipal,
        interpretation: interpretation || null,
      },
    });
    await tx.assignation.update({
      where: { idAssignation: ass.idAssignation },
      data: { statut: 'Complété', statutReponses: 'verrouille', dateDerniereModification: now },
    });
    return { idReponse, dejaCloture: false };
  });

  return {
    idReponse: resultat.idReponse,
    titre: ass.titre,
    nbJours: joursActifs.length,
    dejaCloture: resultat.dejaCloture,
  };
}
