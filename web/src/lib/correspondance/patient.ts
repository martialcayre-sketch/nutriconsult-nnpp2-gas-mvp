import { sanitizeAuditError } from '@/lib/anthropic';

export const TYPES_CORRESPONDANCE_PATIENT = {
  booklet: 'booklet',
  accesPortail: 'acces_portail',
  lienMagique: 'lien_magique',
  questionnaire: 'questionnaire',
  questionnaires: 'questionnaires',
  accuseQuestionnaire: 'accuse_questionnaire',
  relanceAgendaSommeil: 'relance_agenda_sommeil',
} as const;

export type TypeCorrespondancePatient =
  (typeof TYPES_CORRESPONDANCE_PATIENT)[keyof typeof TYPES_CORRESPONDANCE_PATIENT];

export type StatutCorrespondancePatient = 'Envoye' | 'Erreur' | 'Non_envoye';

type EntreeCorrespondancePatient = {
  idPatient: string;
  type: TypeCorrespondancePatient;
  objet: string;
  statut: StatutCorrespondancePatient;
  referenceType?: string;
  referenceId?: string;
  sourceType?: string;
  sourceId?: string;
  erreur?: unknown;
};

/**
 * Journal best-effort : une panne du registre ne transforme jamais un e-mail
 * effectivement envoyé en échec fonctionnel. Le corps et l'adresse du message
 * ne font volontairement pas partie du contrat.
 */
export async function journaliserCorrespondancePatient(
  entree: EntreeCorrespondancePatient,
): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.correspondancePatient.create({
      data: {
        idPatient: entree.idPatient,
        canal: 'email',
        sens: 'sortant',
        type: entree.type,
        objet: entree.objet.slice(0, 200),
        statut: entree.statut,
        referenceType: entree.referenceType,
        referenceId: entree.referenceId,
        sourceType: entree.sourceType,
        sourceId: entree.sourceId,
        erreurCourte: entree.erreur ? sanitizeAuditError(entree.erreur).slice(0, 200) : undefined,
      },
    });
  } catch {
    // Traçabilité non bloquante, comme l'audit historique des booklets.
  }
}

/**
 * Le journal de correspondance a TROIS états, et « en attente de confirmation »
 * n'en est pas un quatrième : rien n'est parti, et rien n'a échoué.
 *
 * L'appelant historique rangeait « tout ce qui n'est pas `Envoye` » dans
 * `Erreur`. La fiche patient affichait donc « Échec d'envoi » pour un bilan
 * qui attendait un clic. Lecture de production du 2026-09-08 (conteneur
 * one-off, agrégats seuls) : sur 222 lignes de journal, 217 `Envoye` et
 * 5 `Erreur` — et les 5 `Erreur` sont exactement les 5 lignes d'audit
 * `Confirmation_Requise`. La SEULE erreur que ce journal ait jamais montrée
 * au praticien était fausse.
 *
 * Le vocabulaire d'audit du booklet (`booklet_envois.statut`) est plus large
 * que celui du journal : cette fonction est le seul endroit qui traduise l'un
 * dans l'autre, et elle le fait par énumération — un statut d'audit nouveau
 * tombe dans `Erreur`, ce qui reste le défaut prudent pour un envoi.
 */
export function statutJournalDepuisAuditBooklet(
  statutAudit: string,
): StatutCorrespondancePatient {
  if (statutAudit === 'Envoye') return 'Envoye';
  if (statutAudit === 'Confirmation_Requise') return 'Non_envoye';
  return 'Erreur';
}
