/**
 * Inbox des questionnaires en attente de consultation (accueil Observatoire,
 * LOT-02) — domaine PUR, aucun accès base.
 *
 * Décision propriétaire 2026-07-23 : l'inbox REMPLACE les cartes « Reçu » du
 * Fil. Une ligne PAR PATIENT (nombre + dernière date + derniers titres),
 * jamais une ligne par questionnaire — c'est la « liste interminable » que
 * l'accueil ne doit plus être.
 *
 * « En attente de consultation » : réponses postérieures à la dernière
 * consultation VALIDÉE du patient — la même ancre que le pré-vol SP-COP
 * (`Consultation.dateValidation`). Sans consultation validée, toutes les
 * réponses attendent.
 */

export type ReponseInboxRow = { idReponse: string; idPatient: string; titre: string; dateReponse: Date };

export type LigneInbox = {
  idPatient: string;
  patient: string;
  nb: number;
  /** ISO — la réponse la plus récente du patient. */
  derniereDate: string;
  /** Titres des dernières réponses (au plus 3, sans doublon), plus récent d'abord. */
  titres: string[];
};

export type LigneEcartee = {
  idPatient: string;
  patient: string;
  /** Nombre de réponses que l'ancre a retirées de l'accueil. */
  nb: number;
  /** ISO — la consultation validée qui les a écartées. */
  ancre: string;
};

const MAX_TITRES = 3;

export function lignesInbox(
  reponses: ReponseInboxRow[],
  derniereConsultationValidee: Map<string, Date>,
  noms: Map<string, string>,
  reponsesLues = new Set<string>(),
): LigneInbox[] {
  const parPatient = new Map<string, ReponseInboxRow[]>();
  for (const r of reponses) {
    if (reponsesLues.has(r.idReponse)) continue;
    const ancre = derniereConsultationValidee.get(r.idPatient);
    if (ancre && r.dateReponse <= ancre) continue; // déjà vue en consultation
    const liste = parPatient.get(r.idPatient);
    if (liste) liste.push(r);
    else parPatient.set(r.idPatient, [r]);
  }

  return [...parPatient.entries()]
    .map(([idPatient, lignes]) => {
      const triees = lignes.slice().sort((a, b) => b.dateReponse.getTime() - a.dateReponse.getTime());
      const titres: string[] = [];
      for (const l of triees) {
        if (!titres.includes(l.titre)) titres.push(l.titre);
        if (titres.length >= MAX_TITRES) break;
      }
      return {
        idPatient,
        patient: noms.get(idPatient) ?? 'Patient',
        nb: lignes.length,
        derniereDate: triees[0].dateReponse.toISOString(),
        titres,
      };
    })
    .sort((a, b) => b.derniereDate.localeCompare(a.derniereDate));
}

/**
 * Ce que l'ancre a ÉCARTÉ de l'accueil — pour que l'écran cesse d'affirmer
 * « tout a été vu en consultation ».
 *
 * RIEN N'EST PERDU, ET C'EST LE POINT. La fiche patient lit toutes les
 * réponses d'un dossier, sans ancre et sans filtre : ce que l'inbox coupe est
 * le SIGNAL, jamais la pièce. Mais l'ancre est `Consultation.dateValidation`,
 * dont l'unique écrivain est le geste du PATIENT au portail — il valide son
 * anamnèse, et à cette seconde tout ce qu'il avait rendu avant quitte
 * l'accueil, y compris ce que personne n'a ouvert.
 *
 * Cette fonction ne change pas la règle d'écartement : elle la rend visible.
 * `reponsesLues` reste exclu des deux côtés — une réponse dont le praticien a
 * signé la lecture n'est pas « écartée sans avoir été vue », elle est traitée.
 */
export function lignesEcarteesParAncre(
  reponses: ReponseInboxRow[],
  derniereConsultationValidee: Map<string, Date>,
  noms: Map<string, string>,
  reponsesLues = new Set<string>(),
): LigneEcartee[] {
  const parPatient = new Map<string, { nb: number; ancre: Date }>();
  for (const r of reponses) {
    if (reponsesLues.has(r.idReponse)) continue;
    const ancre = derniereConsultationValidee.get(r.idPatient);
    if (!ancre || r.dateReponse > ancre) continue;
    const compte = parPatient.get(r.idPatient);
    if (compte) compte.nb += 1;
    else parPatient.set(r.idPatient, { nb: 1, ancre });
  }
  return [...parPatient.entries()]
    .map(([idPatient, { nb, ancre }]) => ({
      idPatient,
      patient: noms.get(idPatient) ?? 'Patient',
      nb,
      ancre: ancre.toISOString(),
    }))
    .sort((a, b) => b.nb - a.nb || a.patient.localeCompare(b.patient));
}
