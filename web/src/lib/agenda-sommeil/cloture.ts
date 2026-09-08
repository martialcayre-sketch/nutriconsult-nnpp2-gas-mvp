import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { computeScoreFromDef } from '@/lib/questions';
import { resolveDefinition } from '@/lib/instruments';
import { createPublicId } from '@/lib/ids';
import { calculerAgregats, compterNuitsPlausibles } from './agregats';
import { resolveNuitsActives } from './nuit';
import { listNuits } from './persistence';
import { dateMesureAgenda } from '@/lib/agenda/dateMesureAgenda';
import { AGENDA_SOMMEIL_ID } from './types';

// Clôture d'un agenda du sommeil (Q_SOM_09) — chemin UNIQUE de production des
// agrégats et du score. Appelée par la route patient (fenêtre atteinte) comme
// par la route praticien (à tout moment). Produit une QuestionnaireReponse
// STANDARD (mêmes champs que /api/patient/submit) : compatibilité automatique
// avec la fiche, l'inbox, la mini-synthèse et (LOT-C) l'équilibre. Idempotente :
// une seconde clôture renvoie la réponse déjà produite.

export type ClotureResultat = { idReponse: string; titre: string; nbNuits: number; dejaCloture: boolean };

export async function cloturerAgenda(input: { idAssignation: string }): Promise<ClotureResultat> {
  const ass = await prisma.assignation.findUnique({ where: { idAssignation: input.idAssignation } });
  if (!ass) throw new TypeError('Agenda introuvable.');
  if (ass.idQuestionnaire !== AGENDA_SOMMEIL_ID) {
    throw new TypeError("Cette assignation n'est pas un agenda du sommeil.");
  }
  // Annulée par le praticien (Fil A) : la clôture PRODUIT une QuestionnaireReponse
  // et repasse `statut` à 'Complété'. Sans ce refus, une annulation serait
  // silencieusement écrasée et une donnée clinique fabriquée pour un instrument
  // retiré. Chemin UNIQUE de clôture (patient comme praticien) : le garde y suffit.
  if (ass.statut === 'Annulée') {
    throw new TypeError('Cet agenda du sommeil a été annulé et ne peut pas être clôturé.');
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
      const nbNuits = typeof raw?.AGD_NB_NUITS === 'number' ? raw.AGD_NB_NUITS : 0;
      return { idReponse: existante.idReponse, titre: ass.titre, nbNuits, dejaCloture: true };
    }
  }

  const nuitsActives = resolveNuitsActives(await listNuits(ass.idPatient, ass.idAssignation));
  if (nuitsActives.length === 0) {
    throw new TypeError('Aucune nuit renseignée : rien à clôturer.');
  }
  // `NuitRow` porte déjà `dateNuit` et `reponses` : l'agrégation a besoin des
  // deux (la règle de couverture week-end lit la date).
  const agregats = calculerAgregats(nuitsActives);
  const nbPlausibles = compterNuitsPlausibles(nuitsActives);
  // Agrégats complets si ≥ seuil ; sinon au moins le compte, pour que le scoring
  // rende scored:false avec la bonne note (jamais un 0 par défaut). Une métrique
  // non couverte reste `null` jusque dans `rawAnswers` — le scoring la traite
  // comme inconnue, il ne la lit pas comme un zéro.
  const rawAnswers = (agregats ?? { AGD_NB_NUITS: nbPlausibles }) as Record<
    string,
    number | null
  >;

  const def = await resolveDefinition(AGENDA_SOMMEIL_ID, { pourPassation: true });
  const scores = (def ? computeScoreFromDef(def, rawAnswers) : { error: 'Définition introuvable' }) as Record<
    string,
    unknown
  >;

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
  const dateMesure = dateMesureAgenda(nuitsActives.map(x => x.dateNuit), now);

  // Création de la réponse + verrouillage de l'assignation dans une seule
  // transaction, avec re-vérification du verrou : deux clôtures concurrentes ne
  // produisent qu'une réponse (la seconde retombe sur le chemin idempotent).
  const resultat = await prisma.$transaction(async (tx) => {
    // Verrou de LIGNE sur l'assignation (SELECT … FOR UPDATE) : il sérialise les
    // clôtures concurrentes. Sans lui, en READ COMMITTED, un double-clic patient
    // ou une clôture patient + praticien simultanées liraient toutes deux un
    // statut non verrouillé et créeraient chacune une QuestionnaireReponse
    // (doublon de dossier). Il n'existe pas de contrainte d'unicité sur
    // questionnaire_reponses.id_assignation (partagée par la re-soumission des
    // autres instruments) — c'est donc le verrou de ligne qui garantit l'unicité.
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
        idQuestionnaire: AGENDA_SOMMEIL_ID,
        titre: ass.titre || AGENDA_SOMMEIL_ID,
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
    nbNuits: typeof rawAnswers.AGD_NB_NUITS === 'number' ? rawAnswers.AGD_NB_NUITS : nbPlausibles,
    dejaCloture: resultat.dejaCloture,
  };
}
