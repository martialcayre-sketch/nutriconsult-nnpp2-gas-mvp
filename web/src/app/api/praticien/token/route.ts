import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildGoogleConnexionUrl, buildMagicLinkUrl, sendMagicLinkEmail, sendPortailLinkEmail, type EnvoiAcces } from '@/lib/consultation/email';
import { emailPraticien, verifierAppartenancePatient } from '@/lib/praticien/appartenance';
import { isG4LienMagiqueEnabled } from '@/lib/portail/featureFlag';
import { creerJeton, empreinteJeton, expirationDepuis, originePraticien } from '@/lib/portail/lienMagique';
import { emettreLienMagiquePourPraticien } from '@/lib/portail/emissionLienMagique';

export type TokenActionResponse = {
  success: boolean;
  lien?: string;
  /**
   * Absent quand la route n'envoie rien (`action: 'lien'`, DELETE) ; posé
   * sinon. `success: true` ne dit que l'écriture, jamais l'envoi.
   */
  envoi?: EnvoiAcces;
  error?: string;
  // `portal_revoked` (refus SEC de `lien_magique`) et
  // `retablissement_non_confirme` (levée possible, accord manquant) sont deux
  // refus différents : les confondre priverait la surface du seul moyen de
  // savoir si elle a une question à poser.
  reason?:
    | 'unauthenticated'
    | 'invalid_payload'
    | 'patient_not_found'
    | 'forbidden'
    | 'portal_revoked'
    | 'retablissement_non_confirme'
    | 'exception';
};

type TokenPayload = {
  idPatient?: string;
  action?: 'issue' | 'resend' | 'lien' | 'lien_magique';
  /** Accord explicite du praticien pour lever la révocation d'accès du patient.
   * Comparé à `true` STRICTEMENT. Sans objet pour `lien` (lecture seule) et
   * pour `lien_magique` (qui refuse sans jamais rétablir). */
  retablirAcces?: boolean;
};

// POST /api/praticien/token — envoie (ou renvoie) au patient l'accès à son
// espace. LOT-04 : plus de jeton permanent — le lien pointe la page de connexion
// (Google + réception d'un lien par e-mail). « issue »/« resend » envoient
// l'e-mail et lèvent une éventuelle révocation ; « lien » renvoie l'URL de
// connexion sans envoi ni écriture (copie côté dashboard) ; « lien_magique »
// émet un lien à usage unique valable 24 h.
export async function POST(req: Request): Promise<NextResponse<TokenActionResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, reason: 'unauthenticated', error: 'Session absente.' }, { status: 401 });
  }

  let payload: TokenPayload;
  try {
    payload = (await req.json()) as TokenPayload;
  } catch {
    return NextResponse.json({ success: false, reason: 'invalid_payload', error: 'JSON invalide.' }, { status: 400 });
  }

  const idPatient = (payload.idPatient ?? '').trim();
  const action =
    payload.action === 'resend' ? 'resend'
    : payload.action === 'lien' ? 'lien'
    : payload.action === 'lien_magique' ? 'lien_magique'
    : 'issue';
  if (!idPatient) {
    return NextResponse.json({ success: false, reason: 'invalid_payload', error: 'Identifiant patient requis.' }, { status: 400 });
  }

  // Garde d'appartenance, posée ici : cette route était la seule laissée sans
  // garde en #167, réservée à ce gate parce qu'elle en est un fichier cœur.
  // Elle couvre les trois actions historiques comme la nouvelle — émettre ou
  // renvoyer un lien d'accès au patient d'un autre praticien serait le pire
  // trou de la surface praticien.
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

    // Lien magique (gate G4) : émet un lien à usage unique 24 h et n'écrit rien
    // dans `patients` (hors la levée de révocation gérée plus bas). C'est l'un
    // des deux chemins d'entrée, avec Google.
    if (action === 'lien_magique') {
      if (!isG4LienMagiqueEnabled()) {
        return NextResponse.json(
          { success: false, reason: 'invalid_payload', error: 'Lien magique non activé.' },
          { status: 404 }
        );
      }
      // Motif distinct de `patient_not_found` : un portail révoqué est
      // réactivable par le praticien, un patient introuvable ne l'est pas. Les
      // confondre l'enverrait chercher le mauvais problème.
      if (patient.accessTokenRevoked) {
        return NextResponse.json(
          { success: false, reason: 'portal_revoked', error: 'Accès portail révoqué.' },
          { status: 409 }
        );
      }
      const jeton = creerJeton();
      await prisma.portailMagicLink.create({
        data: {
          idPatient,
          jetonEmpreinte: empreinteJeton(jeton),
          expireLe: expirationDepuis(new Date()),
          creePar: originePraticien(emailPraticien(session) ?? ''),
        },
      });
      const lienMagique = buildMagicLinkUrl(jeton);
      // Le lien est émis en base quoi qu'il arrive ; seul `envoi` dit si le
      // patient l'a reçu. Nom distinct de l'`envoi` du chemin « issue »/
      // « resend » plus bas : les deux blocs sont imbriqués, et deux `envoi`
      // homonymes de types différents sont un piège de relecture.
      let envoiMagique: EnvoiAcces = 'envoye';
      try {
        const statut = await sendMagicLinkEmail(patient.email, patient.prenom, lienMagique, patient.idPatient);
        if (statut === 'Non_envoye') envoiMagique = 'non_configure';
      } catch (e) {
        envoiMagique = 'echoue';
        console.error('[praticien/token lien_magique] email:', (e as Error).message);
      }
      // Le jeton est renvoyé au praticien qui vient de le faire émettre pour
      // son propre patient — même exposition que `action: 'lien'` aujourd'hui.
      return NextResponse.json({ success: true, lien: lienMagique, envoi: envoiMagique });
    }

    // « issue »/« resend » ré-ouvrent l'accès : si le praticien avait révoqué ce
    // patient, on lève la révocation (LOT-04 — plus de jeton à créer). « lien »
    // (copie) est en lecture seule : il renvoie l'URL de connexion sans rien
    // réactiver ni écrire.
    if (action !== 'lien' && patient.accessTokenRevoked) {
      // PLUS EN SILENCE : même refus et même mot qu'`api/praticien/
      // consultations`. Le praticien peut toujours lever sa révocation par ce
      // chemin — il doit seulement le vouloir. La garde reste DERRIÈRE le test
      // `action !== 'lien'` : la copie du lien ne rétablit rien, elle n'a rien
      // à faire confirmer.
      if (payload.retablirAcces !== true) {
        return NextResponse.json(
          {
            success: false,
            reason: 'retablissement_non_confirme',
            error: 'Accès au portail révoqué : confirmez son rétablissement.',
          },
          { status: 409 }
        );
      }
      await prisma.patient.update({ where: { idPatient }, data: { accessTokenRevoked: false } });
    }

    const lien = buildGoogleConnexionUrl();
    // `action: 'lien'` est une COPIE : aucun envoi, donc AUCUN champ `envoi`
    // dans la réponse. Poser 'envoye' par défaut ferait dire à l'écran qu'un
    // e-mail est parti là où rien n'a jamais été envoyé.
    let envoi: EnvoiAcces | undefined;
    if (action !== 'lien') {
      // MÊME GESTE QU'À LA CRÉATION DE CONSULTATION : « Renvoyer le lien »
      // porte désormais une porte qui s'ouvre, pas seulement l'adresse d'une
      // page de connexion. `null` drapeau éteint, et l'e-mail redevient celui
      // d'avant.
      const lienMagique = await emettreLienMagiquePourPraticien(
        patient.idPatient,
        emailPraticien(session) ?? '',
      ).catch(() => null);
      // Le `.catch` n'est pas décoratif : l'appelant a DÉJÀ créé sa consultation
      // quand il arrive ici. Laisser remonter un rejet ferait rendre
      // `success: false` sur un dossier bel et bien créé, et le praticien
      // recommencerait. Le module ne rejette pas aujourd'hui — ceci le tient s'il
      // régressait.
      envoi = 'envoye';
      try {
        // En serverless, on attend explicitement la promesse pour eviter que
        // l'envoi best-effort soit interrompu juste apres la reponse HTTP.
        const statut = await sendPortailLinkEmail(
          patient.email,
          patient.prenom,
          patient.idPatient,
          patient.praticienEmail,
          lienMagique ?? undefined,
        );
        if (statut === 'Non_envoye') envoi = 'non_configure';
      } catch (e) {
        envoi = 'echoue';
        console.error('[praticien/token POST] email:', (e as Error).message);
      }
    }

    return NextResponse.json({ success: true, lien, ...(envoi ? { envoi } : {}) });
  } catch {
    return NextResponse.json({ success: false, reason: 'exception', error: "Erreur technique lors de l'envoi du token." });
  }
}

// DELETE /api/praticien/token?idPatient=... — révoque l'accès au portail.
export async function DELETE(req: Request): Promise<NextResponse<TokenActionResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, reason: 'unauthenticated', error: 'Session absente.' }, { status: 401 });
  }

  const idPatient = (new URL(req.url).searchParams.get('idPatient') ?? '').trim();
  if (!idPatient) {
    return NextResponse.json({ success: false, reason: 'invalid_payload', error: 'Identifiant patient requis.' }, { status: 400 });
  }

  // Révoquer l'accès au portail du patient d'un autre praticien serait une
  // coupure de soin à distance : la garde vaut ici autant que sur le POST.
  const verdict = await verifierAppartenancePatient(idPatient, emailPraticien(session));
  if (verdict === 'introuvable') {
    return NextResponse.json({ success: false, reason: 'patient_not_found', error: 'Patient introuvable.' }, { status: 404 });
  }
  if (verdict === 'autre_praticien') {
    return NextResponse.json({ success: false, reason: 'forbidden', error: 'Patient non accessible.' }, { status: 403 });
  }

  try {
    const patient = await prisma.patient.findUnique({ where: { idPatient } });
    if (!patient) {
      return NextResponse.json({ success: false, reason: 'patient_not_found', error: 'Patient introuvable.' }, { status: 404 });
    }
    // TROIS PORTES, ET RÉVOQUER LES FERME TOUTES (invariant révocation LOT-04).
    //
    // `accessTokenRevoked` reste le drapeau « accès portail révoqué » : il est
    // relu à CHAQUE entrée — atterrissage magic-link (garde explicite) et Google,
    // redemande de lien — et par `isSessionValideForPatient`, qui coupe aussi une
    // session cookie en vol. `sessionsInvalidesAvant` invalide en plus les
    // cookies déjà émis ; un nouveau login légitime, postérieur, repart proprement.
    //
    // Restaient les liens à usage unique **encore en vol**, émis avant la
    // révocation : on les ferme ici pour qu'`etatLien` les refuse. Sans cela,
    // un lien émis avant la révocation resterait ouvrable jusqu'à 24 h après.
    //
    // ON FERME PAR L'HORIZON, PAS PAR L'ÉVÉNEMENT (`D-128`). Ce geste datait
    // `consommeLe` — une colonne qui dit « le patient est entré » — sur un lien
    // que PERSONNE n'avait ouvert. L'encart des dossiers neufs devait alors
    // écarter ces tampons par une égalité stricte avec `sessionsInvalidesAvant`,
    // et cette ruse ne tenait qu'une révocation : la colonne n'a qu'un
    // emplacement, la seconde écrasait la première et rendait ses tampons
    // indiscernables d'une entrée. Le code appelait cela une limite connue et la
    // disait insoluble sans une colonne de plus. Elle ne l'était pas : il ne
    // fallait pas AJOUTER une colonne, il fallait RETIRER un écrivain.
    //
    // Depuis, `consommeLe` ne dit plus qu'une chose, et l'encart n'a plus rien à
    // discriminer. La fermeture passe par `expireLe`, exactement comme la
    // désactivation (`D-126`, `api/praticien/patients`) : même filtre monotone
    // et idempotent, même transaction, même ordre de verrouillage — les deux
    // gestes sont désormais jumeaux.
    //
    // EFFET DE BORD ASSUMÉ : le motif journalisé par le refus d'atterrissage
    // passe de « consomme » à « expire » pour un lien fermé par révocation. La
    // destination et le message lus par le patient sont inchangés.
    //
    // Une transaction, parce que fermer le drapeau sans fermer les liens laisse
    // exactement le trou qu'on referme.
    const maintenant = new Date();
    await prisma.$transaction([
      prisma.patient.update({
        where: { idPatient },
        data: { accessTokenRevoked: true, sessionsInvalidesAvant: maintenant },
      }),
      prisma.portailMagicLink.updateMany({
        where: { idPatient, consommeLe: null, expireLe: { gt: maintenant } },
        data: { expireLe: maintenant },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, reason: 'exception', error: "Erreur technique lors de la révocation." });
  }
}
