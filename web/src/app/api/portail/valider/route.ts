import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readPatientSession } from '@/lib/patient-session';
import {
  resolvePortailPatientFromSession,
  consultationCourante,
  CONSENTEMENT_VERSION,
  FINALITE_CONSENTEMENT,
} from '@/lib/consultation/portail';
import { normaliserAnamnese, ANAMNESE_CHAMP_REQUIS } from '@/lib/consultation/anamnese';
import { assignPackToPatient, echeancePackBase, qidsConsultation, qidsSuspendus } from '@/lib/consultation/assignBasePack';
import { resolvePackQuestionnaireIds } from '@/lib/consultation/packRegistry';
import { isMotifValide } from '@/lib/consultation/motifs';
import { logger } from '@/lib/observability/logger';
import { EVENT_CODES } from '@/lib/observability/eventCodes';
import { createRequestContext, finalizeLogContext } from '@/lib/observability/requestContext';

export type PortailValiderResponse =
  | { ok: true; premiereAssignation: string | null; count: number }
  | { ok: false; reason: string; error: string };

type Payload = { anamnese?: unknown; motif?: string };

const NOM_PACK_BASE = 'Base de consultation';

// Résout le pack de base : le pack `parDefaut` actif en priorité, sinon le
// pack actif nommé « Base de consultation » (repli).
//
// LOT-03 — CE REPLI DEVIENT VIVANT POUR LA PREMIÈRE FOIS. Il comparait le nom
// en égalité EXACTE contre `'BASE DE CONSULTATION'`, alors que le pack réel
// s'appelle « Base de consultation » (`prisma/seed.ts`) : l'égalité Prisma /
// PostgreSQL étant sensible à la casse, la seconde requête ne pouvait rendre
// que `null`. Le pack `parDefaut` actif était donc, en pratique, l'unique
// chemin de résolution. Le rendre insensible à la casse n'est pas une
// correction de typo : c'est un CHANGEMENT DE COMPORTEMENT — en production
// l'effet immédiat est nul (un seul pack porte ce nom), mais le repli peut
// désormais résoudre, ce qu'il n'a jamais fait.
//
// D'où l'`orderBy` : `findFirst` sans tri rend une ligne arbitraire, et le
// pack assigné à un patient dépendrait d'un ordre non spécifié s'il existait
// des homonymes. Le plus ancien gagne, départagé par `idPack` (unique) — deux
// exécutions rendent la même ligne.
//
// CE FILET NE REMPLACE PAS LE GARDE `parDefaut` : il dépend d'un libellé que
// le praticien peut renommer depuis l'UI des packs, donc il peut cesser de
// résoudre sans qu'aucune ligne de code ne change.
async function resoudrePackBase() {
  const parDefaut = await prisma.pack.findFirst({ where: { parDefaut: true, actif: true } });
  if (parDefaut && parDefaut.qids.length > 0) return parDefaut;
  const parNom = await prisma.pack.findFirst({
    where: { nom: { equals: NOM_PACK_BASE, mode: 'insensitive' }, actif: true },
    orderBy: [{ createdAt: 'asc' }, { idPack: 'asc' }],
  });
  return parNom;
}

// POST /api/portail/valider — enregistre l'anamnèse, valide l'onboarding et
// assigne automatiquement le pack de base.
export async function POST(req: Request): Promise<NextResponse<PortailValiderResponse>> {
  // Un seul contexte pour toute la requête : deux appels produiraient deux
  // `correlationId` distincts, et un onboarding émettant les deux warns
  // deviendrait impossible à recoudre dans le journal.
  const requestContext = createRequestContext(req);
  const session = readPatientSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'unauthenticated', error: 'Session expirée. Reconnectez-vous.' }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_payload', error: 'JSON invalide.' }, { status: 400 });
  }

  const anamnese = normaliserAnamnese(payload.anamnese);
  if (!anamnese[ANAMNESE_CHAMP_REQUIS]) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_payload', error: 'Merci de décrire ce qui vous amène à consulter.' },
      { status: 400 }
    );
  }

  const motif = (payload.motif ?? '').trim();
  if (motif && !isMotifValide(motif)) {
    return NextResponse.json({ ok: false, reason: 'invalid_payload', error: 'Motif de consultation invalide.' }, { status: 400 });
  }

  try {
    const patient = await resolvePortailPatientFromSession(session);
    if (!patient) {
      return NextResponse.json({ ok: false, reason: 'forbidden', error: 'Accès non reconnu ou révoqué.' }, { status: 403 });
    }
    const consultation = await consultationCourante(patient.idPatient);
    if (!consultation) {
      return NextResponse.json({ ok: false, reason: 'no_consultation', error: 'Aucune consultation en cours.' }, { status: 404 });
    }
    if (consultation.consentement !== 'donne') {
      return NextResponse.json({ ok: false, reason: 'consent_required', error: 'Consentement requis avant la validation.' }, { status: 409 });
    }
    if (consultation.ficheSignaletique == null) {
      return NextResponse.json({ ok: false, reason: 'fiche_required', error: 'Fiche de renseignements requise avant la validation.' }, { status: 409 });
    }

    const pack = await resoudrePackBase();
    if (!pack || pack.qids.length === 0) {
      return NextResponse.json(
        { ok: false, reason: 'pack_not_found', error: 'Pack de base introuvable. Contactez votre praticien.' },
        { status: 404 }
      );
    }

    // Assignation du pack de base (consentement déjà donné au niveau consultation).
    const { qids, raison, registryCount } = await resolvePackQuestionnaireIds({ idPack: pack.idPack, qids: pack.qids });

    // Le pack de base est celui qui part à CHAQUE onboarding : c'est là que la
    // dérive compte le plus, et c'est justement là qu'elle était muette (5 qids
    // legacy contre 4 au registre, mesuré le 2026-08-03).
    //
    // Seule `ensembles_divergents` alerte. Un registre absent ou vide est le cas
    // d'un pack jamais synchronisé : le signaler ici allumerait l'alarme en
    // permanence, ce qui revient à ne rien signaler.
    if (raison === 'ensembles_divergents') {
      logger.warn({
        event: EVENT_CODES.PACK_REGISTRE_REPLI_LEGACY,
        domain: 'ASSIGNATION',
        message: `Dérive du pack de base ${pack.idPack} : ${pack.qids.length} qids côté packs.qids contre ${registryCount} au registre relationnel. Composition legacy retenue.`,
        context: finalizeLogContext(requestContext, { retryable: false }),
        metadata: { raison, registryCount },
      });
    } else if (raison === 'registre_absent' || raison === 'registre_vide') {
      logger.info({
        event: EVENT_CODES.PACK_REGISTRE_REPLI_LEGACY,
        domain: 'ASSIGNATION',
        message: `Repli legacy du pack de base ${pack.idPack} (${raison}) : composition legacy retenue.`,
        context: finalizeLogContext(requestContext, { retryable: false }),
        metadata: { raison, registryCount },
      });
    }

    // Ce chemin n'a aucun praticien pour lire un écart de comptage : le patient
    // valide son onboarding et reçoit ce qui reste. Sans cette trace,
    // l'amputation du pack de base serait strictement invisible.
    const ecartes = qidsSuspendus(qids);
    if (ecartes.length > 0) {
      logger.warn({
        event: EVENT_CODES.ASSIGNATION_PACK_INSTRUMENT_SUSPENDU,
        domain: 'ASSIGNATION',
        message: `Questionnaires suspendus écartés du pack de base : ${ecartes.join(', ')}`,
        context: finalizeLogContext(requestContext, { retryable: false }),
      });
    }
    // Même trace pour l'écartement « consultation » ([[D-066]]) : la ceinture
    // d'`assignPackToPatient` ampute en silence, et un pack de base amputé sans
    // journal serait indétectable en exploitation (revue, finding MAJ-2).
    const ecartesConsultation = qidsConsultation(qids);
    if (ecartesConsultation.length > 0) {
      logger.warn({
        event: EVENT_CODES.ASSIGNATION_PACK_INSTRUMENT_SUSPENDU,
        domain: 'ASSIGNATION',
        message: `Instruments de consultation écartés du pack de base : ${ecartesConsultation.join(', ')}`,
        context: finalizeLogContext(requestContext, { retryable: false }),
      });
    }

    const { cree, dejaOuverts } = await assignPackToPatient({
      idPatientBusiness: patient.idPatient,
      emailPatient: patient.email,
      qids,
      packNom: pack.nom,
      options: {
        consentementDonne: true,
        consentementVersion: CONSENTEMENT_VERSION,
        idConsultation: consultation.idConsultation,
        // Le pack de base partait SANS échéance, et la lecture du Fil filtre
        // `dateLimite: { not: null }` avant même d'atteindre
        // `cartesAssignationsEnRetard` : un pack de base oublié ne pouvait
        // rougir nulle part. Une date suffit à le faire exister au Fil. Les
        // agendas du pack en sont exemptés au moment de la création
        // (`QIDS_SANS_DATE_LIMITE`), pas ici : la règle appartient à
        // l'instrument.
        dateLimite: echeancePackBase(),
      },
    });
    // Seconde cause d'amputation, même doctrine que les suspendus ci-dessus :
    // sans trace, un pack de base réduit par une assignation préexistante
    // serait strictement invisible.
    if (dejaOuverts.length > 0) {
      logger.warn({
        event: EVENT_CODES.ASSIGNATION_DEJA_ASSIGNE_ECARTE,
        domain: 'ASSIGNATION',
        message: `Questionnaires déjà assignés (ouverts) écartés du pack de base : ${dejaOuverts.join(', ')}`,
        context: finalizeLogContext(requestContext, { retryable: false }),
      });
    }

    await prisma.consultation.update({
      where: { idConsultation: consultation.idConsultation },
      data: {
        anamnese,
        motif: motif || consultation.motif,
        statut: 'validee',
        dateValidation: new Date(),
        idPackAssigne: pack.idPack,
        consentementVersion: consultation.consentementVersion ?? CONSENTEMENT_VERSION,
        finaliteConsentement: consultation.finaliteConsentement ?? FINALITE_CONSENTEMENT,
      },
    });

    return NextResponse.json({ ok: true, premiereAssignation: cree[0]?.idAssignation ?? null, count: cree.length });
  } catch (err) {
    console.error('[portail/valider POST]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, reason: 'exception', error: 'Erreur technique.' }, { status: 500 });
  }
}
