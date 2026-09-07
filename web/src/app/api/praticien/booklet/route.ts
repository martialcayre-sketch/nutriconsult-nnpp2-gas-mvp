import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { type SyntheseSchema, maskEmail, sanitizeAuditError } from '@/lib/anthropic';
import { buildBookletHTML } from '@/lib/documents/bookletHtml';
import { termeAnxiogene } from '@/lib/documents/vocabulaire';
import { estRedactionPraticien } from '@/lib/synthese-praticien';
import { creerTransportSmtp } from '@/lib/email/transportSmtp';
import { getGabarit, rendreGabarit } from '@/lib/correspondance/registreGabarits';
import { emailPraticien, filtrePatientsDuPraticien } from '@/lib/praticien/appartenance';
import { journaliserAccesDossier } from '@/lib/praticien/journalAcces';
import { avertissementSyntheseAnterieure } from '@/lib/scoring/passationsNonInterpretables';
import { logger } from '@/lib/observability/logger';
import { EVENT_CODES } from '@/lib/observability/eventCodes';
import { MESSAGE_DOSSIER_CLOS, RAISON_DOSSIER_CLOS, accepteNouvelEnvoi } from '@/lib/patient/cycleDeVie';
import {
  createRequestContext,
  finalizeLogContext,
  withCorrelationHeader,
} from '@/lib/observability/requestContext';
import {
  journaliserCorrespondancePatient,
  statutJournalDepuisAuditBooklet,
  TYPES_CORRESPONDANCE_PATIENT,
} from '@/lib/correspondance/patient';

// Gabarit littéral pour le journal des accès (G-TRUST-04) — jamais l'URL reçue.
const ROUTE_JOURNAL = '/api/praticien/booklet';

// GET /api/praticien/booklet?idSynthese=SYN...
// Génère et retourne le HTML du booklet (prévisualisation praticien)
export async function GET(req: Request) {
  const requestContext = createRequestContext(req);
  const session = await getServerSession(authOptions);
  if (!session) return withCorrelationHeader(NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }), requestContext);

  const { searchParams } = new URL(req.url);
  const idSynthese = (searchParams.get('idSynthese') ?? '').trim();

  if (!idSynthese) return withCorrelationHeader(NextResponse.json({ error: 'idSynthese requis.' }, { status: 400 }), requestContext);

  const emailSession = emailPraticien(session);
  if (!emailSession) return withCorrelationHeader(NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }), requestContext);

  try {
    // Même scoping que le POST : la synthèse d'un patient d'un autre praticien
    // est « introuvable », le 404 existant absorbe les deux cas (anti-oracle).
    const synthese = await prisma.syntheseIA.findFirst({
      where: { idSynthese, patient: filtrePatientsDuPraticien(emailSession) },
      include: { bookletEnvois: { where: { statut: 'Envoye' }, orderBy: { dateEnvoi: 'desc' }, take: 1 } },
    });

    if (!synthese) return withCorrelationHeader(NextResponse.json({ error: 'Synthèse introuvable.' }, { status: 404 }), requestContext);

    // La synthèse résolue et scopée nomme le dossier ; journalisé AVANT le
    // 422 — au refus « non validée », la synthèse a bien été lue.
    await journaliserAccesDossier({ idPatient: synthese.idPatient, praticienEmail: emailSession, route: ROUTE_JOURNAL, methode: 'GET' });

    if (synthese.statut !== 'Validee_Praticien' && synthese.statut !== 'Corrigee_Praticien') {
      return withCorrelationHeader(NextResponse.json(
        { error: 'La synthèse doit être validée par le praticien avant de préparer le booklet.' },
        { status: 422 }
      ), requestContext);
    }

    const patient = await prisma.patient.findUnique({ where: { idPatient: synthese.idPatient } });
    const patientNom = patient ? `${patient.prenom} ${patient.nom}` : '';
    const dateDocument = (synthese.dateValidation ?? synthese.dateGeneration)
      .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const syntheseData = synthese.syntheseJson as unknown as SyntheseSchema;
    const html = buildBookletHTML(
      patientNom,
      dateDocument,
      syntheseData,
      synthese.notesPraticien ?? '',
      { assistanceIA: !estRedactionPraticien(synthese.modele) },
    );

    const dernierEnvoi = synthese.bookletEnvois[0];

    // Le booklet part au PATIENT. Si la synthèse dont il est tiré précède le
    // retrait d'interprétation, le praticien doit le savoir AVANT d'envoyer,
    // pas après — d'où la mention sur la prévisualisation. Elle informe, elle
    // ne bloque pas : le praticien reste seul juge de ce qu'il expédie, et la
    // régénération est à un clic.
    const passations = await prisma.questionnaireReponse.findMany({
      where: { idPatient: synthese.idPatient },
      select: { idQuestionnaire: true },
    });
    const avertissementMesureRetiree = avertissementSyntheseAnterieure(
      passations.map(p => p.idQuestionnaire),
      synthese.dateGeneration,
    );

    return withCorrelationHeader(NextResponse.json({
      html,
      patientNom,
      patientEmail: synthese.emailPatient,
      idPatient: synthese.idPatient,
      dateDocument,
      dejaEnvoye: !!dernierEnvoi,
      dernierEnvoiDate: dernierEnvoi?.dateEnvoi?.toISOString() ?? null,
      dernierEnvoiEmailMasque: dernierEnvoi ? maskEmail(synthese.emailPatient) : null,
      avertissementMesureRetiree,
    }), requestContext);
  } catch (err) {
    logger.error({
      event: EVENT_CODES.BOOKLET_GET_EXCEPTION,
      domain: 'BOOKLET',
      message: 'Échec génération preview booklet',
      context: finalizeLogContext(requestContext, { statusCode: 500, retryable: true }),
      error: err,
    });
    return withCorrelationHeader(NextResponse.json({ error: 'Erreur technique.' }, { status: 500 }), requestContext);
  }
}

// POST /api/praticien/booklet/send
// Envoie le booklet par email au patient (confirmation relecture obligatoire)
export async function POST(req: Request) {
  const requestContext = createRequestContext(req);
  const session = await getServerSession(authOptions);
  if (!session) return withCorrelationHeader(NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }), requestContext);

  // `confirmerRegistre` est DISTINCT de `forceSend`, et volontairement.
  // `forceSend` confirme un renvoi ; réutiliser le même drapeau ferait
  // confirmer d'un seul clic deux choses sans rapport — « oui, renvoyez » vaudrait
  // aussi « oui, envoyez ce texte alarmiste », sans que le praticien l'ait lu.
  type SendBody = {
    idSynthese?: string;
    relectureConfirmee?: boolean;
    forceSend?: boolean;
    confirmerRegistre?: boolean;
  };
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return withCorrelationHeader(NextResponse.json({ error: 'JSON invalide.' }, { status: 400 }), requestContext);
  }

  const idSynthese = (body.idSynthese ?? '').trim();
  const relectureConfirmee = body.relectureConfirmee === true;
  const forceSend = body.forceSend === true;
  const confirmerRegistre = body.confirmerRegistre === true;

  if (!idSynthese) return withCorrelationHeader(NextResponse.json({ error: 'idSynthese requis.' }, { status: 400 }), requestContext);

  if (!relectureConfirmee) {
    await logBookletEnvoi(idSynthese, '', '', 'Erreur', 'Blocage_Relecture', false,
      'Relecture praticien non confirmée.');
    return withCorrelationHeader(NextResponse.json(
      { error: 'La relecture praticien doit être confirmée avant l\'envoi patient.' },
      { status: 422 }
    ), requestContext);
  }

  const emailSession = emailPraticien(session);
  if (!emailSession) return withCorrelationHeader(NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }), requestContext);

  try {
    // Garde d'appartenance AVANT tout envoi : c'est la route qui expédie
    // réellement un document au patient. Sans elle, un praticien pourrait
    // envoyer le booklet d'un patient qui n'est pas le sien.
    const synthese = await prisma.syntheseIA.findFirst({
      where: { idSynthese, patient: filtrePatientsDuPraticien(emailSession) },
      include: { bookletEnvois: { where: { statut: 'Envoye' }, orderBy: { dateEnvoi: 'desc' }, take: 1 } },
    });

    if (!synthese) return withCorrelationHeader(NextResponse.json({ error: 'Synthèse introuvable.' }, { status: 404 }), requestContext);

    if (synthese.statut !== 'Validee_Praticien' && synthese.statut !== 'Corrigee_Praticien') {
      await logBookletEnvoi(idSynthese, synthese.idPatient, synthese.emailPatient,
        'Erreur', 'Preparation', relectureConfirmee, 'Synthèse non validée.');
      return withCorrelationHeader(NextResponse.json(
        { error: 'La synthèse doit être validée avant l\'envoi.' },
        { status: 422 }
      ), requestContext);
    }

    if (!forceSend && synthese.bookletEnvois.length > 0) {
      await logBookletEnvoi(idSynthese, synthese.idPatient, synthese.emailPatient,
        'Confirmation_Requise', 'Renvoi', relectureConfirmee, 'Booklet déjà envoyé.');
      return withCorrelationHeader(NextResponse.json({
        needsConfirmation: true,
        // Ces deux avertissements sont RENDUS TELS QUELS au praticien. Ils
        // nommaient un champ JSON (`forceSend`, `confirmerRegistre`) : une
        // instruction qu'aucun écran ne permettait de suivre. Ils nomment
        // désormais la case qui existe, sur l'écran qui la porte.
        warning: 'Ce booklet a déjà été envoyé. Cochez « Confirmer le renvoi » pour l’envoyer de nouveau.',
        emailMasque: maskEmail(synthese.emailPatient),
      }), requestContext);
    }

    const patient = await prisma.patient.findUnique({ where: { idPatient: synthese.idPatient } });
    const patientNom = patient ? `${patient.prenom} ${patient.nom}` : '';
    const dateDocument = (synthese.dateValidation ?? synthese.dateGeneration)
      .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const syntheseData = synthese.syntheseJson as unknown as SyntheseSchema;
    const html = buildBookletHTML(
      patientNom,
      dateDocument,
      syntheseData,
      synthese.notesPraticien ?? '',
      { assistanceIA: !estRedactionPraticien(synthese.modele) },
    );

    // Dossier au suivi clôturé : plus aucun document ne part. La garde porte
    // sur l'ENVOI, pas sur l'aperçu — consulter le document d'un dossier clos
    // reste légitime. Elle est dans la route et non dans l'écran, sinon un
    // appel direct la contournerait. Elle passe AVANT l'avertissement de
    // registre : demander de reformuler un document qui ne partira jamais
    // serait un travail pour rien.
    if (patient && !accepteNouvelEnvoi(patient)) {
      return withCorrelationHeader(NextResponse.json(
        { success: false, reason: RAISON_DOSSIER_CLOS, error: MESSAGE_DOSSIER_CLOS },
        { status: 409 }
      ), requestContext);
    }

    // Registre anxiogène : le narratif est le seul texte libre qui parte au
    // patient. Quand il vient du modèle, celui-ci peut y recopier une
    // « Orientation » du catalogue (« Avis médical urgent »…) ; quand il vient
    // du praticien, la relecture reste utile. Reçue seule, sans praticien en
    // face, cette phrase inquiète sans orienter.
    //
    // AVERTISSEMENT, PAS REFUS — et c'est une revue adversariale qui a montré
    // pourquoi. Cette route ne s'exécute que sur une synthèse déjà
    // `Validee_Praticien`/`Corrigee_Praticien` (garde plus haut) : à ce stade,
    // qu'elle soit d'origine IA ou praticien, `action:'enregistrer'` la refuse
    // — seul un brouillon `Brouillon_IA`/`Brouillon_Praticien` reste modifiable
    // (voir `/api/praticien/synthese`). Un refus dur ici dirait donc
    // « reformulez » sans qu'aucun écran ne le permette encore à ce stade, et
    // rendrait indélivrables des booklets déjà validés en production — d'autant
    // que la garde ne lit pas la négation et signale « il n'y a ni urgence ni
    // danger ».
    //
    // On réemploie le patron `needsConfirmation` déjà en place pour le renvoi,
    // avec un drapeau à lui : le praticien voit le mot, et décide. La garde le
    // fait REGARDER ; elle ne se substitue pas à son jugement.
    const terme = termeAnxiogene(syntheseData.narratif_patient ?? '');
    if (terme && !confirmerRegistre) {
      await logBookletEnvoi(idSynthese, synthese.idPatient, synthese.emailPatient,
        'Confirmation_Requise', 'Registre', relectureConfirmee,
        `Registre anxiogène dans le narratif patient : « ${terme} ».`);
      return withCorrelationHeader(NextResponse.json({
        needsConfirmation: true,
        reason: 'REGISTRE_ANXIOGENE',
        terme,
        warning: `Le narratif patient emploie « ${terme} ». Ce texte est lu seul, souvent avant la consultation. Reformulez-le, ou cochez « Envoyer tel quel » pour l'assumer.`,
        emailMasque: maskEmail(synthese.emailPatient),
      }), requestContext);
    }

    // Envoi email via nodemailer (SMTP via compte noreply@wellneuro.fr)
    const smtpUrl = process.env.SMTP_URL;
    if (!smtpUrl) {
      await logBookletEnvoi(idSynthese, synthese.idPatient, synthese.emailPatient,
        'Erreur', forceSend ? 'Renvoi' : 'Envoi', relectureConfirmee, 'SMTP_URL non configurée.');
      return withCorrelationHeader(NextResponse.json(
        { error: 'SMTP_URL absente dans .env.local. Configurez l\'envoi email avant d\'envoyer le booklet.' },
        { status: 503 }
      ), requestContext);
    }

    const transporter = creerTransportSmtp(smtpUrl);

    // Corps `text` au registre des gabarits (Socle LOT-03, DC-26) ; le corps
    // `html` est le booklet rendu, gardé par le registre anxiogène plus haut.
    const gabarit = rendreGabarit(getGabarit('envoi_bilan'), {});
    // Un refus du relais SMTP tombait dans le `catch` général, qui n'écrit
    // qu'un `logger.error` : ni ligne d'audit, ni ligne de journal. Un bilan
    // réellement perdu ne laissait donc AUCUNE trace lisible sur la fiche,
    // pendant qu'une simple demande de confirmation, elle, s'y affichait en
    // « Échec d'envoi ». Le patron appliqué ici est celui que le dépôt tient
    // déjà un dossier plus loin (`file-envoi/envoyer`) : journaliser l'échec
    // avec le vocabulaire du domaine, puis rendre la main.
    try {
      await transporter.sendMail({
        from: '"Wellneuro" <noreply@wellneuro.fr>',
        to: synthese.emailPatient,
        subject: gabarit.sujet,
        text: gabarit.corps,
        html,
      });
    } catch (erreurEnvoi) {
      const detail = erreurEnvoi instanceof Error ? erreurEnvoi.message : String(erreurEnvoi);
      await logBookletEnvoi(idSynthese, synthese.idPatient, synthese.emailPatient,
        'Erreur', forceSend ? 'Renvoi' : 'Envoi', relectureConfirmee, detail);
      logger.error({
        event: EVENT_CODES.BOOKLET_SEND_EXCEPTION,
        domain: 'BOOKLET',
        message: 'Relais SMTP en echec : le booklet n a pas ete remis',
        context: finalizeLogContext(requestContext, { statusCode: 502, retryable: true }),
        error: sanitizeAuditError(detail),
      });
      return withCorrelationHeader(NextResponse.json(
        { error: "L'envoi n'a pas abouti : le bilan n'est pas parti. L'échec est consigné dans la correspondance du dossier. Réessayez ; s'il persiste, signalez-le." },
        { status: 502 }
      ), requestContext);
    }

    // La note passée ici est CELLE QUI VIENT DE PARTIR — `synthese` a été lue
    // en début de requête et `buildBookletHTML` l'a rendue depuis le même
    // objet. C'est ce que le portail servira.
    await logBookletEnvoi(idSynthese, synthese.idPatient, synthese.emailPatient,
      'Envoye', forceSend ? 'Renvoi' : 'Envoi', relectureConfirmee, '',
      synthese.notesPraticien);

    return withCorrelationHeader(NextResponse.json({ success: true, emailMasque: maskEmail(synthese.emailPatient) }), requestContext);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({
      event: EVENT_CODES.BOOKLET_SEND_EXCEPTION,
      domain: 'BOOKLET',
      message: 'Échec envoi booklet patient',
      context: finalizeLogContext(requestContext, { statusCode: 500, retryable: true }),
      error: sanitizeAuditError(msg),
    });
    // Message rendu au PRATICIEN, en production : « vérifiez le terminal
    // Next.js » n'y désignait rien qu'il puisse ouvrir. Le seul fait qu'il
    // doive connaître est l'état du document.
    return withCorrelationHeader(NextResponse.json({ error: "Erreur technique pendant l'envoi. Rien n'a été confirmé comme parti : vérifiez la correspondance du dossier avant de réessayer." }, { status: 500 }), requestContext);
  }
}

async function logBookletEnvoi(
  idSynthese: string, idPatient: string, emailPatient: string,
  statut: string, operation: string, relectureConfirmee: boolean, erreur: string,
  // Instantané de la note réellement partie. Renseigné sur le SEUL chemin de
  // succès : une ligne d'échec n'a rien transmis, sa note reste nulle.
  // `notes_praticien` reste modifiable après l'envoi (action `annoter`, sans
  // garde de cycle de vie) — la page « Mon bilan » du portail sert cet
  // instantané, jamais le champ vivant.
  noteTransmise?: string | null,
) {
  try {
    const audit = await prisma.bookletEnvoi.create({
      data: {
        idSynthese,
        idPatient,
        emailPatientMasque: emailPatient ? maskEmail(emailPatient) : '[inconnu]',
        statut,
        operation,
        relectureConfirmee,
        erreurCourte: erreur ? sanitizeAuditError(erreur) : undefined,
        noteTransmise: noteTransmise?.trim() ? noteTransmise : undefined,
      },
    });
    // Le journal ne connaît que trois états ; l'audit du booklet en connaît
    // davantage. La traduction est faite par `statutJournalDepuisAuditBooklet`,
    // et une confirmation en attente n'y est PAS une erreur : rien n'est parti,
    // rien n'a échoué. L'objet le dit en toutes lettres, parce que « Non
    // envoyé » seul ne dirait pas ce que le praticien doit faire.
    const objet = operation === 'Renvoi'
      ? 'Renvoi du bilan neuronutritionnel'
      : 'Envoi du bilan neuronutritionnel';
    await journaliserCorrespondancePatient({
      idPatient,
      type: TYPES_CORRESPONDANCE_PATIENT.booklet,
      objet: statut === 'Confirmation_Requise'
        ? `${objet} — en attente de votre confirmation`
        : objet,
      statut: statutJournalDepuisAuditBooklet(statut),
      referenceType: 'synthese',
      referenceId: idSynthese,
      sourceType: 'booklet_envoi',
      sourceId: audit.id,
      erreur,
    });
  } catch { /* audit non bloquant */ }
}
