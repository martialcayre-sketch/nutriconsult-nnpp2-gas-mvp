import { prisma } from '@/lib/prisma';
import { residuEffacement } from './cycleDeVie';

// Effacement d'un dossier patient — campagne IDP2, LOT-01a.
//
// L'application PROMET l'effacement au patient
// (`lib/trust/contenus/registre.ts`) et le canal de demande existe depuis TRUST
// (`api/portail/trust/signalement`, type `effacement`). Jusqu'ici rien ne
// l'exécutait : le seul bouton nommé « suppression » écrivait `actif: false`.
//
// TOUT OU RIEN. La suppression et l'écriture du résidu se font dans une seule
// transaction : un effacement à moitié fait laisserait des lignes orphelines
// portant encore de la donnée patient, ce qui est exactement ce qu'on vient
// détruire.
//
// LE PIÈGE, ET LA RAISON DE L'ORDRE EXPLICITE : `audit_syntheses` et
// `booklet_envois` portent un `id_patient` SANS clé étrangère vers `patients`
// — ils référencent `SyntheseIA`. Une suppression qui se fierait aux seules
// contraintes les laisserait en place, avec l'identifiant du patient et, pour
// `booklet_envois`, une adresse e-mail masquée. Ils sont donc supprimés
// nommément, par `id_patient`, avant tout le reste.

export type ResultatEffacement = {
  /** Nombre de lignes supprimées, par table. Aucune donnée patient. */
  supprimees: Record<string, number>;
  residu: { anneeNaissance: number | null; initialesNom: string };
};

/**
 * Efface définitivement un dossier et tout ce qui s'y rattache.
 *
 * Ne vérifie NI l'authentification NI l'appartenance : c'est le rôle de la
 * route appelante, qui dispose de la session. Cette fonction ne fait qu'une
 * chose, et la fait entièrement.
 *
 * @throws si le patient n'existe pas — la transaction est alors annulée.
 */
export async function effacerDossier(idPatient: string): Promise<ResultatEffacement> {
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({
      where: { idPatient },
      select: { nom: true, dateNaissance: true },
    });
    if (!patient) throw new Error(`Dossier introuvable : ${idPatient}`);

    // Le résidu est calculé AVANT toute suppression : après, la matière a
    // disparu. Il ne retient que l'année et trois lettres — ni prénom, ni
    // e-mail, ni identifiant (voir `cycleDeVie.residuEffacement`).
    const residu = residuEffacement(patient);

    const supprimees: Record<string, number> = {};
    const par = { idPatient };

    // 1. Les deux tables SANS clé étrangère vers `patients`. En premier, parce
    //    que rien dans la base ne les protégerait d'un oubli.
    supprimees.auditSyntheses = (await tx.auditSynthese.deleteMany({ where: par })).count;
    supprimees.bookletEnvois = (await tx.bookletEnvoi.deleteMany({ where: par })).count;

    // 2. Petits-enfants : ce qui dépend d'un brouillon de protocole.
    supprimees.protocolCheckins = (await tx.protocolCheckin.deleteMany({ where: par })).count;
    // Nuits d'agenda du sommeil (Q_SOM_09) : FK RESTRICT vers patients ET
    // assignations — supprimées avant les assignations (ligne plus bas), sinon
    // l'effacement échouerait sur la contrainte.
    supprimees.agendaSommeilNuits = (await tx.agendaSommeilNuit.deleteMany({ where: par })).count;
    // Journées d'agenda alimentaire (Q_ALI_09) : mêmes FK RESTRICT que le
    // sommeil, vers patients ET assignations — même position, même raison.
    supprimees.agendaAlimentaireJours = (
      await tx.agendaAlimentaireJour.deleteMany({ where: par })
    ).count;
    supprimees.protocolDiffusionApprovals = (
      await tx.protocolDiffusionApproval.deleteMany({ where: par })
    ).count;
    // Arbitrages biologiques (D-059) : FK RESTRICT vers protocol_drafts ET
    // patients — supprimés avant les brouillons, sinon l'effacement échouerait
    // sur la contrainte.
    supprimees.arbitragesBiologiques = (
      await tx.arbitrageBiologique.deleteMany({ where: par })
    ).count;
    // Panels documentés hors outil (LOT-06) : FK RESTRICT vers patients ET
    // biology_panels — la déclaration est une pièce du dossier, elle part avec
    // lui. Le catalogue, lui, n'est pas touché : c'est du référentiel.
    supprimees.panelsBiologieDocumentes = (
      await tx.panelBiologieDocumente.deleteMany({ where: par })
    ).count;
    supprimees.protocolDrafts = (await tx.protocolDraft.deleteMany({ where: par })).count;
    supprimees.assessmentEpisodes = (await tx.assessmentEpisode.deleteMany({ where: par })).count;
    // Sélections praticien de priorité ([[D-127]]) : la seule clé étrangère va
    // vers `patients`, l'ordre est donc libre — la ligne est ici pour que la
    // chaîne C1 se lise d'un bloc. « Ce praticien a retenu cette priorité pour
    // ce patient, et voici pourquoi » part avec le dossier.
    supprimees.decisionPrioritySelections = (
      await tx.decisionPrioritySelection.deleteMany({ where: par })
    ).count;

    // 3. Enfants directs.
    supprimees.synthesesIA = (await tx.syntheseIA.deleteMany({ where: par })).count;
    supprimees.questionnaireLecturesPraticien = (
      await tx.questionnaireLecturePraticien.deleteMany({ where: par })
    ).count;
    supprimees.questionnaireReponses = (await tx.questionnaireReponse.deleteMany({ where: par })).count;
    supprimees.assignations = (await tx.assignation.deleteMany({ where: par })).count;
    supprimees.consultations = (await tx.consultation.deleteMany({ where: par })).count;

    // 4. Le dossier TRUST du patient — y compris la demande d'effacement
    //    elle-même, supprimée par son propre traitement. La ligne
    //    `dossiers_effaces` écrite plus bas en devient l'unique trace.
    supprimees.trustAcknowledgements = (await tx.trustAcknowledgement.deleteMany({ where: par })).count;
    supprimees.trustChoiceEvents = (await tx.trustChoiceEvent.deleteMany({ where: par })).count;
    supprimees.trustAdverseEffectReports = (
      await tx.trustAdverseEffectReport.deleteMany({ where: par })
    ).count;
    supprimees.trustPrivacyIncidents = (await tx.trustPrivacyIncident.deleteMany({ where: par })).count;
    supprimees.trustRightsRequests = (await tx.trustRightsRequest.deleteMany({ where: par })).count;

    // 5. Le reste, dont les liens magiques — en `onDelete: Restrict`, ils
    //    feraient échouer la suppression du patient s'ils subsistaient.
    supprimees.filCardRejections = (await tx.filCardRejection.deleteMany({ where: par })).count;
    supprimees.relectureNotes = (await tx.relectureNote.deleteMany({ where: par })).count;
    supprimees.portailMagicLinks = (await tx.portailMagicLink.deleteMany({ where: par })).count;
    supprimees.packPropositions = (await tx.packProposition.deleteMany({ where: par })).count;
    supprimees.envoiBrouillons = (await tx.envoiBrouillon.deleteMany({ where: par })).count;
    // Le journal de correspondance patient ne conserve ni corps ni adresse,
    // mais il nomme encore le dossier : il part explicitement avec lui.
    supprimees.correspondancesPatient = (
      await tx.correspondancePatient.deleteMany({ where: par })
    ).count;
    // La correspondance médecin est une pièce du dossier (FM-2, C3 LOT-06) :
    // le résidu D6 (année, prénom, trois lettres) ne couvre pas un texte
    // clinique. Elle part avec le dossier, nommément.
    supprimees.correspondancesMedecin = (
      await tx.correspondanceMedecin.deleteMany({ where: par })
    ).count;
    // Le document patient biologie (décision F, D-122) porte le texte remis
    // au patient — même régime que la correspondance médecin : une pièce du
    // dossier, elle part avec lui, nommément (FK RESTRICT côté patients).
    supprimees.documentsPatientBiologie = (
      await tx.documentPatientBiologie.deleteMany({ where: par })
    ).count;
    // Les résultats biologiques (étage 2 du rayon, D-122 §2) sont des données
    // de santé nominatives en FK RESTRICT : subsistant, ils feraient échouer
    // la suppression du patient. Ils partent avec le dossier, nommément.
    supprimees.resultatsBiologiques = (
      await tx.resultatBiologique.deleteMany({ where: par })
    ).count;
    // Les rendez-vous (accueil-observatoire LOT-04) sont en ON DELETE RESTRICT :
    // subsistant, ils feraient échouer la suppression du patient. Donnée
    // opérationnelle du dossier, ils partent avec lui, nommément.
    supprimees.rendezVous = (await tx.rendezVous.deleteMany({ where: par })).count;
    // La trace des entrées Google (gate G5) porte `id_patient` sans clé
    // étrangère, comme `audit_syntheses` : rien ne la protège d'un oubli. Un
    // journal d'accès qui survivrait à l'effacement le viderait de son sens —
    // c'est le dossier effacé qu'il continuerait à nommer. Les lignes sans
    // patient (refus sur adresse inconnue) ne sont pas concernées.
    supprimees.portailConnexionsGoogle = (
      await tx.portailConnexionGoogle.deleteMany({ where: par })
    ).count;
    // Le journal des lectures praticien (G-TRUST-04, exigence 5) porte lui
    // aussi `id_patient` sans clé étrangère : même raison, même geste — une
    // trace d'accès ne survit pas au dossier qu'elle nomme.
    supprimees.journalAccesDossiers = (
      await tx.journalAccesDossier.deleteMany({ where: par })
    ).count;

    // Le dossier à deux voix (Alliance 6.0-A LOT-01) : cinq tables FK
    // RESTRICT — subsistant, elles feraient échouer la suppression du
    // patient. Parole du patient et compréhension du praticien : elles
    // partent avec le dossier, nommément. Les références souples entre elles
    // (id_synthese, id_objectif, supersedes_*) tombent dans la même
    // transaction — aucun ordre interne requis.
    supprimees.objectifsNegocies = (await tx.objectifNegocie.deleteMany({ where: par })).count;
    supprimees.entreesCeQuiCompte = (await tx.entreeCeQuiCompte.deleteMany({ where: par })).count;
    supprimees.synthesesComprehension = (
      await tx.syntheseComprehension.deleteMany({ where: par })
    ).count;
    supprimees.desaccordsComprehension = (
      await tx.desaccordComprehension.deleteMany({ where: par })
    ).count;
    supprimees.ratificationsObjectif = (
      await tx.ratificationObjectif.deleteMany({ where: par })
    ).count;

    // L'objectif à trois voix (Alliance 6.0-B LOT-01, D-094) : trois tables
    // de plus, même régime FK RESTRICT. La proposition CITE la parole du
    // patient, l'amendement EST sa parole, la disposition porte le jugement
    // du praticien sur elle — rien de tout cela ne survit au dossier.
    supprimees.propositionsObjectif = (
      await tx.propositionObjectif.deleteMany({ where: par })
    ).count;
    supprimees.dispositionsProposition = (
      await tx.dispositionProposition.deleteMany({ where: par })
    ).count;
    supprimees.amendementsObjectif = (
      await tx.amendementObjectif.deleteMany({ where: par })
    ).count;

    // La réponse d'étape (Alliance 6.0-B LOT-05) : même régime FK RESTRICT.
    // C'est la parole du patient sur lui-même, aux jalons de son objectif —
    // elle ne survit pas plus au dossier que les précédentes.
    supprimees.reponsesJalonObjectif = (
      await tx.reponseJalonObjectif.deleteMany({ where: par })
    ).count;

    // 6. Le dossier lui-même. Toute contrainte oubliée échoue ICI, bruyamment,
    //    et annule l'ensemble — un effacement partiel serait pire que rien.
    supprimees.patient = (await tx.patient.deleteMany({ where: par })).count;

    await tx.dossierEfface.create({ data: residu });

    return { supprimees, residu };
  });
}
