import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPublicId } from '@/lib/ids';
import { isMotifValide } from '@/lib/consultation/motifs';
import { sendPortailLinkEmail, type EnvoiAcces } from '@/lib/consultation/email';
import { emailPraticien, verifierAppartenancePatient } from '@/lib/praticien/appartenance';
import { journaliserAccesDossier } from '@/lib/praticien/journalAcces';
import { accepteNouvelEnvoi, MESSAGE_DOSSIER_CLOS, RAISON_DOSSIER_CLOS } from '@/lib/patient/cycleDeVie';

export type Consultation = {
  idConsultation: string;
  idPatient: string;
  motif: string | null;
  statut: string;
  dateValidation: string | null;
  createdAt: string;
};

export type ConsultationsApiResponse = {
  consultations: Consultation[];
  unavailable?: boolean;
  reason?: 'unauthenticated' | 'invalid_payload' | 'exception';
};

export type CreateConsultationResponse = {
  success: boolean;
  idConsultation?: string;
  /**
   * La consultation est créée quoi qu'il arrive (`success: true`) ; ce champ,
   * et lui seul, dit si l'e-mail est parti. Toujours posé par le POST.
   */
  envoi?: EnvoiAcces;
  error?: string;
  reason?:
    | 'unauthenticated'
    | 'invalid_payload'
    | 'patient_not_found'
    | 'forbidden'
    // Distinct de `patient_not_found` : le dossier existe et vous est
    // accessible, c'est son suivi qui est clos.
    | 'dossier_cloture'
    | 'exception';
};

type CreateConsultationPayload = {
  idPatient?: string;
  motif?: string;
};

// Gabarit littéral pour le journal des accès (G-TRUST-04) — jamais l'URL reçue.
const ROUTE_JOURNAL = '/api/praticien/consultations';

// GET /api/praticien/consultations?idPatient=... — historique des consultations d'un patient.
export async function GET(req: Request): Promise<NextResponse<ConsultationsApiResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ consultations: [], unavailable: true, reason: 'unauthenticated' }, { status: 401 });
  }
  const idPatient = (new URL(req.url).searchParams.get('idPatient') ?? '').trim();
  if (!idPatient) {
    return NextResponse.json({ consultations: [], unavailable: true, reason: 'invalid_payload' }, { status: 400 });
  }
  const emailSession = emailPraticien(session);
  if (!emailSession) {
    return NextResponse.json({ consultations: [], unavailable: true, reason: 'unauthenticated' }, { status: 401 });
  }
  try {
    // Garde d'appartenance : `Consultation` n'a pas de relation Prisma vers
    // `Patient`, seulement la colonne `praticienEmail` écrite à la création
    // (POST ci-dessous) — on scope directement dessus.
    const rows = await prisma.consultation.findMany({
      where: { idPatient, praticienEmail: emailSession },
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length > 0) {
      // Liste non vide = appartenance prouvée par le scope. Liste vide = rien
      // (anti-oracle) — limite assumée (LOT-00) : dossier sans consultation
      // non journalisé.
      await journaliserAccesDossier({ idPatient, praticienEmail: emailSession, route: ROUTE_JOURNAL, methode: 'GET' });
    }
    const consultations: Consultation[] = rows.map(c => ({
      idConsultation: c.idConsultation,
      idPatient: c.idPatient,
      motif: c.motif,
      statut: c.statut,
      dateValidation: c.dateValidation ? c.dateValidation.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
    return NextResponse.json({ consultations });
  } catch {
    return NextResponse.json({ consultations: [], unavailable: true, reason: 'exception' }, { status: 500 });
  }
}

// POST /api/praticien/consultations — crée une consultation pour un patient,
// s'assure qu'un token d'accès existe, et envoie le lien du portail.
export async function POST(req: Request): Promise<NextResponse<CreateConsultationResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, reason: 'unauthenticated', error: 'Session absente.' }, { status: 401 });
  }

  let payload: CreateConsultationPayload;
  try {
    payload = (await req.json()) as CreateConsultationPayload;
  } catch {
    return NextResponse.json({ success: false, reason: 'invalid_payload', error: 'JSON invalide.' }, { status: 400 });
  }

  const idPatient = (payload.idPatient ?? '').trim();
  const motifRaw = (payload.motif ?? '').trim();
  if (!idPatient) {
    return NextResponse.json({ success: false, reason: 'invalid_payload', error: 'Identifiant patient requis.' }, { status: 400 });
  }
  if (motifRaw && !isMotifValide(motifRaw)) {
    return NextResponse.json({ success: false, reason: 'invalid_payload', error: 'Motif de consultation invalide.' }, { status: 400 });
  }

  // Garde d'appartenance : sans elle, un praticien pouvait lever la révocation
  // d'accès et faire envoyer le lien du portail pour le patient d'un autre.
  const verdict = await verifierAppartenancePatient(idPatient, emailPraticien(session));
  if (verdict === 'introuvable') {
    return NextResponse.json(
      { success: false, reason: 'patient_not_found', error: 'Patient introuvable ou inactif.' },
      { status: 404 }
    );
  }
  if (verdict === 'autre_praticien') {
    return NextResponse.json(
      { success: false, reason: 'forbidden', error: 'Patient non accessible.' },
      { status: 403 }
    );
  }

  try {
    const patient = await prisma.patient.findUnique({ where: { idPatient } });
    if (!patient || !patient.actif) {
      return NextResponse.json(
        { success: false, reason: 'patient_not_found', error: 'Patient introuvable ou inactif.' },
        { status: 404 }
      );
    }

    // Dossier clos : cette route CRÉE une consultation, réactive au besoin un
    // jeton révoqué et envoie un e-mail au patient — soit exactement ce que la
    // clôture interdit. Le garde manquait ici alors qu'assignation, pack et
    // envoi de booklet l'avaient déjà : une interdiction incomplète est une
    // interdiction contournable, et le libellé de la clôture promet au
    // praticien qu'aucun document ne partira.
    if (!accepteNouvelEnvoi(patient)) {
      return NextResponse.json(
        { success: false, reason: RAISON_DOSSIER_CLOS, error: MESSAGE_DOSSIER_CLOS },
        { status: 409 }
      );
    }

    // Créer une consultation ré-ouvre le suivi : si le praticien avait révoqué
    // l'accès portail de ce patient, on lève la révocation. LOT-04 — plus de
    // jeton à (re)créer, l'accès passe par le cookie de session ; seul le drapeau
    // de révocation est remis à zéro.
    if (patient.accessTokenRevoked) {
      await prisma.patient.update({
        where: { idPatient },
        data: { accessTokenRevoked: false },
      });
    }

    const idConsultation = createPublicId('CONS');
    await prisma.consultation.create({
      data: {
        idConsultation,
        idPatient: patient.idPatient,
        emailPatient: patient.email,
        praticienEmail: (session.user?.email ?? '').toLowerCase(),
        statut: 'creee',
        motif: motifRaw || null,
      },
    });

    // L'envoi ne conditionne PAS la consultation : elle est créée, la réponse
    // reste `success: true`. Ce que le `catch` avalait devient un champ, faute
    // de quoi l'écran annonce « envoyé » sur un envoi mort.
    let envoi: EnvoiAcces = 'envoye';
    try {
      // En serverless, on attend explicitement la promesse pour eviter que
      // l'envoi best-effort soit interrompu juste apres la reponse HTTP.
      // Le motif ne part plus dans l'e-mail (audit HDS) — il reste en base.
      const statut = await sendPortailLinkEmail(patient.email, patient.prenom, patient.idPatient, patient.praticienEmail);
      if (statut === 'Non_envoye') envoi = 'non_configure';
    } catch (e) {
      envoi = 'echoue';
      console.error('[praticien/consultations POST] email:', (e as Error).message);
    }

    return NextResponse.json({ success: true, idConsultation, envoi });
  } catch {
    return NextResponse.json({ success: false, reason: 'exception', error: 'Erreur technique lors de la création de la consultation.' });
  }
}
