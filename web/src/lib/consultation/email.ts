import { creerTransportSmtp } from '@/lib/email/transportSmtp';
import { getGabarit, rendreGabarit } from '@/lib/correspondance/registreGabarits';
import { CHEMIN_CONNEXION } from '@/lib/portail/googleIdentite';
import {
  journaliserCorrespondancePatient,
  TYPES_CORRESPONDANCE_PATIENT,
  type TypeCorrespondancePatient,
} from '@/lib/correspondance/patient';

/**
 * Ce que l'appelant peut affirmer à l'écran. `Erreur` n'y figure pas : ce cas
 * relance (il ne se rend pas), et c'est le `catch` de la route qui le nomme.
 * Projection observable des statuts du journal de correspondance.
 */
export type StatutEnvoiAcces = 'Envoye' | 'Non_envoye';

/**
 * Ce que la RÉPONSE d'API dit de l'envoi. Trois cas, pas deux : trois `catch`
 * muets rendaient `success: true` sur un envoi mort, et l'écran annonçait
 * « envoyé ». `success` ne parle que de l'écriture en base.
 *
 * BORNE : 'envoye' signifie « le SMTP a accepté la transaction », pas « la
 * boîte du patient l'a reçu ». Un destinataire rejeté au sein d'une
 * transaction acceptée (`info.rejected` de nodemailer) résout et reste compté
 * 'envoye'. Ce résidu est antérieur et hors périmètre — il est nommé ici pour
 * que personne ne lise ce champ comme un accusé de réception.
 */
export type EnvoiAcces = 'envoye' | 'echoue' | 'non_configure';

async function envoyerAccesTrace({
  idPatient,
  type,
  objet,
  envoyer,
}: {
  idPatient?: string;
  type: TypeCorrespondancePatient;
  objet: string;
  envoyer: () => Promise<unknown>;
}): Promise<StatutEnvoiAcces> {
  if (!process.env.SMTP_URL) {
    if (idPatient) {
      await journaliserCorrespondancePatient({ idPatient, type, objet, statut: 'Non_envoye' });
    }
    // Rendu MÊME sans `idPatient` : le statut décrit l'envoi, pas la trace.
    return 'Non_envoye';
  }
  try {
    await envoyer();
    if (idPatient) {
      await journaliserCorrespondancePatient({ idPatient, type, objet, statut: 'Envoye' });
    }
    return 'Envoye';
  } catch (erreur) {
    if (idPatient) {
      await journaliserCorrespondancePatient({ idPatient, type, objet, statut: 'Erreur', erreur });
    }
    throw erreur;
  }
}

/**
 * URL d'un lien magique (gate G4). Le jeton n'apparaît que là : dans l'e-mail
 * du patient, et dans le chemin qu'il ouvrira une fois.
 */
export function buildMagicLinkUrl(jeton: string): string {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${baseUrl}/portail/lien/${jeton}`;
}

/**
 * URL de la page d'entrée Google (gate G5). Distincte de `buildMagicLinkUrl` :
 * elle ne porte aucun secret, donc rien à générer par appel — la même URL vaut
 * pour tout patient.
 */
export function buildGoogleConnexionUrl(): string {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${baseUrl}${CHEMIN_CONNEXION}`;
}

/**
 * Envoi d'un lien magique — 24 h, une seule ouverture.
 *
 * Distinct de `sendPortailLinkEmail`, qui pointe la page de connexion (Google +
 * redemande d'un lien) : ici l'e-mail porte un lien à usage unique qui ouvre
 * directement la session. Le texte le dit franchement, sans inquiéter.
 */
export async function sendMagicLinkEmail(
  patientEmail: string,
  prenom: string,
  lien: string,
  idPatient?: string,
): Promise<StatutEnvoiAcces> {
  const smtpUrl = process.env.SMTP_URL;
  return envoyerAccesTrace({
    idPatient,
    type: TYPES_CORRESPONDANCE_PATIENT.lienMagique,
    objet: 'Lien temporaire d’accès à l’espace patient',
    envoyer: async () => {
      if (!smtpUrl) return;
      const transport = creerTransportSmtp(smtpUrl);
      // Texte au registre des gabarits (Socle LOT-03, DC-26) — déménagé au
      // caractère près, fidélité prouvée par `registreGabarits.test.ts`.
      const gabarit = rendreGabarit(getGabarit('lien_magique'), { prenom, lien });
      await transport.sendMail({
        from: '"Wellneuro" <noreply@wellneuro.fr>',
        to: patientEmail,
        subject: gabarit.sujet,
        text: gabarit.corps,
      });
    },
  });
}

// Envoi best-effort du lien d'accès au portail patient. Sans SMTP_URL
// configuré, l'envoi est silencieusement ignoré (l'URL de connexion reste
// récupérable côté praticien dans la réponse de l'API).
//
// Aucune donnée clinique dans le corps (audit HDS 2026-07-24) : le motif de
// consultation n'y figure plus — une boîte e-mail n'est pas un canal maîtrisé.
// Il reste en base (`consultations.motif`), visible du praticien.
//
/**
 * Une adresse de dossier ne devient un EN-TÊTE d'e-mail qu'après contrôle de
 * forme. `praticienEmail` est écrit depuis la session Google (domaine
 * `@wellneuro.fr`) et n'a jamais été hostile, mais une ligne héritée ou
 * corrompue passerait sinon telle quelle dans un en-tête — les caractères de
 * contrôle, notamment, sont exactement ce qu'une injection d'en-tête
 * emprunte. Rejeter est sans conséquence : l'en-tête disparaît, l'e-mail part.
 *
 * La borne à 254 aligne sur `api/praticien/patients`, qui tronque à cette
 * longueur AVANT d'appliquer la même expression. Elle n'est pas décorative :
 * au-delà de 998 octets, la ligne d'en-tête viole RFC 5321 et le SMTP peut
 * refuser le message — or l'échec d'envoi est MUET côté praticien (les deux
 * appelants journalisent en console et rendent `success: true`). Un refus ici
 * coûte un en-tête ; un refus au SMTP coûte l'e-mail entier, sans le dire.
 */
function replyToValide(email: string | undefined): email is string {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/.test(email)
  );
}

// LOT-04 : plus aucun lien permanent secret dans l'e-mail. On pointe la page de
// connexion (non secrète, durable), où le patient choisit Google ou la réception
// d'un lien d'accès par e-mail. Ce sont les deux seuls chemins d'entrée.
export async function sendPortailLinkEmail(
  patientEmail: string,
  prenom: string,
  idPatient?: string,
  /** Adresse du praticien du dossier (`patients.praticien_email`), posée en
   * `Reply-To`. Facultative : sans elle, l'en-tête est simplement absent. */
  praticienEmail?: string,
  /** Lien à usage unique (gate G4), quand l'appelant a pu en émettre un.
   * ABSENT = comportement d'avant ce lot, au caractère près : même gabarit,
   * même sujet, même type journalisé. C'est ce qui rend le lot inerte drapeau
   * éteint — le seul état où le lien mènerait à un 404 nu. */
  lienMagique?: string,
): Promise<StatutEnvoiAcces> {
  const smtpUrl = process.env.SMTP_URL;
  const connexion = buildGoogleConnexionUrl();
  return envoyerAccesTrace({
    idPatient,
    type: TYPES_CORRESPONDANCE_PATIENT.accesPortail,
    objet: 'Accès à l’espace patient',
    envoyer: async () => {
      if (!smtpUrl) return;
      const transport = creerTransportSmtp(smtpUrl);
      // Texte au registre des gabarits (Socle LOT-03, DC-26).
      // Le TYPE journalisé ne bouge pas (`accesPortail`, plus haut) : c'est lui
      // que `api/praticien/nouveaux-patients` interroge pour la porte « e-mail
      // d'accès ». Seul le GABARIT change.
      const gabarit = lienMagique
        ? rendreGabarit(getGabarit('acces_portail_lien'), { prenom, connexion, lien: lienMagique })
        : rendreGabarit(getGabarit('acces_portail'), { prenom, connexion });
      await transport.sendMail({
        from: '"Wellneuro" <noreply@wellneuro.fr>',
        to: patientEmail,
        // Le gabarit v2 invite le patient à écrire en cas de doute — sans cet
        // en-tête, le bouton « Répondre » de son client vise `noreply@` et sa
        // réponse se perd. L'adresse vient du DOSSIER, pas d'une constante :
        // le corps du gabarit nomme le praticien en dur (dette assumée,
        // 2026-09-04), l'en-tête n'a pas besoin de reproduire cette limite.
        ...(replyToValide(praticienEmail) ? { replyTo: praticienEmail } : {}),
        subject: gabarit.sujet,
        text: gabarit.corps,
      });
    },
  });
}

/**
 * Notification « un objectif vous attend » ([[D-154]], constat `M02`).
 *
 * POURQUOI ICI, dans un module nommé « accès ». `envoyerAccesTrace` est le seul
 * endroit du dépôt qui tienne le triplet complet d'un envoi patient — pas de
 * SMTP → `Non_envoye` journalisé, succès → `Envoye`, échec → `Erreur` puis
 * relance. Le dupliquer laisserait les deux copies diverger ; c'est exactement
 * ce que [[D-148]] vient de corriger ailleurs.
 *
 * ELLE RELANCE, ET L'APPELANT DOIT L'ATTRAPER. L'objectif est DÉJÀ écrit quand
 * cet appel a lieu : un relais SMTP en panne ne doit pas transformer une
 * écriture réussie en 500. L'échec est journalisé — donc visible sur la fiche,
 * depuis [[D-148]] — puis absorbé par la route.
 */
export async function sendObjectifProposeEmail(
  patientEmail: string,
  prenom: string,
  idPatient: string,
): Promise<StatutEnvoiAcces> {
  const smtpUrl = process.env.SMTP_URL;
  const connexion = buildGoogleConnexionUrl();
  return envoyerAccesTrace({
    idPatient,
    type: TYPES_CORRESPONDANCE_PATIENT.objectifPropose,
    objet: 'Objectif de suivi à relire',
    envoyer: async () => {
      if (!smtpUrl) return;
      const transport = creerTransportSmtp(smtpUrl);
      // Le gabarit ne transporte PAS l'énoncé de l'objectif : il porte les mots
      // du patient sur ce qui l'amène, et une boîte e-mail n'est pas un canal
      // maîtrisé (audit HDS du 2026-07-24, qui a retiré le motif de
      // consultation de l'e-mail portail).
      const gabarit = rendreGabarit(getGabarit('objectif_propose'), { prenom, connexion });
      await transport.sendMail({
        from: '"Wellneuro" <noreply@wellneuro.fr>',
        to: patientEmail,
        subject: gabarit.sujet,
        text: gabarit.corps,
      });
    },
  });
}
