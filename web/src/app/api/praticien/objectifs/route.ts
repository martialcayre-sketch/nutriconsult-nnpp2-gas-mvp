import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emailPraticien, verifierAppartenancePatient } from '@/lib/praticien/appartenance';
import type { GabaritAcces } from '@/lib/praticien/journalAcces';
import { MESSAGE_DOSSIER_CLOS, RAISON_DOSSIER_CLOS, accepteNouvelEnvoi } from '@/lib/patient/cycleDeVie';
import { dossierDansPerimetreProposition, isObjectifProposeEnabled } from '@/lib/patient/featureFlag';
import { sendObjectifProposeEmail } from '@/lib/consultation/email';
import {
  chaineDObjectif,
  etatRatification,
  objectifsCourants,
  preparerObjectif,
  type CibleObjectif,
  type EtatRatification,
  type RefusObjectif,
} from '@/lib/praticien/objectifNegocie';
import {
  assembleeCourante,
  dispositionCourante,
  preparerDisposition,
} from '@/lib/praticien/propositionObjectif';

// L'objectif négocié (Alliance 6.0-A, LOT-02) — route PRATICIEN.
//
// APPEND-ONLY : reformuler, reprioriser ou assumer un « non traité pour
// l'instant » crée une NOUVELLE ligne chaînée. Cette route ne porte ni PATCH ni
// DELETE, et c'est la forme de l'invariant : il n'y a pas de verbe pour
// écraser. La garde `objectifNegocie.guard.test.ts` (G5) l'oppose à tout
// `web/src/app/api/**` et `web/src/lib/**`.
//
// PAS DE DRAPEAU SUR L'OBJECTIF LUI-MÊME, et l'absence est un CHOIX, pas un
// oubli (arbitrage du responsable, 6.0-A) : la surface est praticien, elle
// n'est visible que d'un compte authentifié du domaine, et la table est neuve —
// un drapeau n'aurait rien à protéger qu'une session ne protège déjà. Toute
// surface PATIENT de la campagne (LOT-06) relève d'un arbitrage distinct.
//
// MAIS LA REPRISE, ELLE, EST GARDÉE (Alliance 6.0-B, LOT-03, relevé en revue).
// Ce raisonnement valait pour un objectif que le praticien RÉDIGE ; il ne vaut
// pas pour le seul geste que `WN_OBJECTIF_PROPOSE` est censé pouvoir reprendre.
// Sans cette garde, éteindre le drapeau — ou retirer un dossier du périmètre de
// repli — laissait un onglet resté ouvert continuer d'écrire des reprises, et
// le matériau du bilan LOT-06 se remplir sur un dossier officiellement retiré.
// La seule manette de réversibilité de `D-094` ne couvrait pas l'unique
// écriture nouvelle du lot.
//
// La ratification (`ratifications_objectif`) est LUE ici et JAMAIS écrite :
// c'est un geste du patient, il appartient au LOT-06.
//
// LA REPRISE D'UNE PROPOSITION SE POSE ICI (Alliance 6.0-B, LOT-03), et pas
// dans la route des propositions. Reprendre, c'est CRÉER UN OBJECTIF ; deux
// routes qui créeraient un objectif seraient deux vérités sur ce qu'est un
// objectif. Le geste et sa conséquence s'écrivent donc ENSEMBLE, dans une même
// transaction — sinon un dossier pourrait porter une « reprise » sans objectif,
// c'est-à-dire un praticien ayant repris quelque chose qui n'existe pas.
//
// `enoncePatient` N'EST JAMAIS PRIS DU CORPS — ni pour une révision, ni pour une
// reprise, ni pour un amendement cité : il est RECOPIÉ, de la ligne visée, du
// fragment cité, ou du texte que le patient a écrit au portail. C'est ce qui
// rend l'invariant de `D-094` opposable plutôt que promis — le champ ne se
// pré-remplit que par citation verbatim de ce que le patient a écrit.
//
// LA BOUCLE SE REFERME ICI (Alliance 6.0-B, LOT-04, `D-110`). Le patient a
// « dit autrement » au portail ; le praticien pose une nouvelle version dont
// l'énoncé est SON texte à lui, mot pour mot. `amendements_objectif` est LU par
// cette route et JAMAIS écrit — l'écrivain unique reste le portail.

const ID_PATIENT_PATTERN = /^[A-Za-z0-9_-]+$/;

// Gabarit littéral pour le journal des accès (G-TRUST-04) — jamais l'URL reçue.
const ROUTE_JOURNAL = '/api/praticien/objectifs';

/** Borne technique sur la référence de version : un identifiant `cuid`. */
const LONGUEUR_MAX_ID = 64;

export type ObjectifExpose = {
  id: string;
  enoncePatient: string;
  reformulationPraticien: string | null;
  priorite: string | null;
  nonTraiteMotif: string | null;
  nonTraiteDepuisLe: string | null;
  negocieLe: string | null;
  creeLe: string;
  supersedesObjectifId: string | null;
  /** La proposition reprise, si c'en est une (6.0-B). `null` sinon — et c'est
   *  le cas ordinaire, jamais un manque. */
  sourcePropositionId: string | null;
};

/** La trajectoire d'une tête de chaîne : sa version courante puis ses
 *  antérieures. Rien n'est écrasé, donc rien n'est omis. */
export type TrajectoireObjectif = {
  idObjectif: string;
  lignes: ObjectifExpose[];
};

/**
 * Le MATÉRIAU d'ancrage : ce que le patient a déjà écrit à l'anamnèse. Il
 * s'affiche à côté de la saisie, il ne la pré-remplit pas.
 *
 * `consultationValidee` distingue « aucune consultation validée » de « champ
 * non renseigné » (`DC-24` : une donnée absente n'est jamais zéro ni normale).
 * Sans ce drapeau, l'écran ne pourrait pas dire lequel des deux il regarde.
 *
 * LA PLAINTE DOMINANTE Q_MOD_03 N'EST PAS ICI, délibérément : elle n'est
 * produite que par le POST de confirmation d'épisode, et la recalculer depuis
 * cette route serait toucher au moteur clinique.
 */
export type AncrageAnamnese = {
  consultationValidee: boolean;
  motifPrincipal: string | null;
  objectifPrioritaire: string | null;
  attentes: string[];
};

/**
 * L'AMENDEMENT DU PATIENT — « le dire autrement » (Alliance 6.0-B, LOT-04,
 * `D-110`), lu au cockpit. Il est SERVI TEL QUEL : ni résumé, ni compté, ni
 * comparé à l'énoncé courant. Un diff automatique entre les mots du patient et
 * ceux du praticien fabriquerait une mesure de l'écart entre deux personnes.
 *
 * `exprimeLe` n'y figure pas : la colonne reste nulle par construction.
 */
export type AmendementExpose = {
  id: string;
  idObjectif: string;
  texte: string;
  creeLe: string;
};

/**
 * LA RÉPONSE D'ÉTAPE DU PATIENT (Alliance 6.0-B, LOT-05, `D-111`), lue au
 * cockpit. Servie TELLE QUELLE : ni résumée, ni comptée, ni mise en courbe.
 *
 * `eva` PART BRUTE ET PEUT ÊTRE NULLE. Aucune moyenne, aucune tendance, aucun
 * delta d'un jalon à l'autre n'est calculé ici ni ailleurs — c'est le régime de
 * `D-088`, et `D-111` §3 l'applique sans l'élargir. Le praticien lit les
 * valeurs et les interprète avec son patient ; le dépôt ne conclut rien à sa
 * place. Une garde structurelle interdit `reduce`/`sort` sur cette collection.
 *
 * `reponduLe` n'y figure pas : la colonne reste nulle par construction.
 */
export type ReponseJalonExposee = {
  id: string;
  idObjectif: string;
  jalon: string;
  texte: string;
  eva: number | null;
  creeLe: string;
};

export type ObjectifsApiResponse =
  | {
      ok: true;
      objectifs: ObjectifExpose[];
      trajectoires: TrajectoireObjectif[];
      ancrage: AncrageAnamnese;
      ratifications: Record<string, EtatRatification>;
      /**
       * TOUS les amendements du dossier, du plus récent au plus ancien —
       * jamais filtrés sur les seules têtes courantes. Un amendement porté sur
       * une version depuis reformulée reste la parole du patient : le masquer
       * au premier geste du praticien effacerait ce que le lot recueille, et
       * c'est l'écran qui le range sous sa version.
       */
      amendements: AmendementExpose[];
      /**
       * TOUTES les réponses d'étape du dossier, du plus récent au plus ancien,
       * et jamais filtrées sur les seules têtes courantes — même motif qu'aux
       * amendements. Le praticien doit pouvoir lire un récit écrit avant sa
       * propre reformulation : c'est souvent lui qui l'a motivée.
       */
      reponsesJalon: ReponseJalonExposee[];
    }
  | { ok: true; objectif: ObjectifExpose }
  | { ok: false; reason: string; error: string };

// Table EXHAUSTIVE par le type, pas par convention : un motif de refus neuf
// sans message ferait rendre `error: undefined`, la clé disparaîtrait du JSON,
// et l'écran retomberait sur le message générique — le motif du refus serait
// perdu pour le praticien, sans que rien ne rougisse.
const MESSAGES_REFUS: Record<RefusObjectif, string> = {
  enonce_absent: 'L’énoncé du patient est vide.',
  enonce_trop_long: 'L’énoncé du patient est trop long.',
  reformulation_trop_longue: 'La reformulation est trop longue.',
  priorite_trop_longue: 'La priorité est trop longue.',
  motif_trop_long: 'Le motif du « non traité pour l’instant » est trop long.',
  non_traite_incomplet:
    'Un « non traité pour l’instant » porte un motif ET une date : renseignez les deux, ou aucun.',
  date_invalide: 'Date illisible.',
  date_future: 'Cette date est dans le futur : un accord à venir n’est pas un accord pris.',
};

function echec(reason: string, error: string, status: number) {
  return NextResponse.json<ObjectifsApiResponse>({ ok: false, reason, error }, { status });
}

const SELECTION_OBJECTIF = {
  id: true,
  enoncePatient: true,
  reformulationPraticien: true,
  priorite: true,
  nonTraiteMotif: true,
  nonTraiteDepuisLe: true,
  negocieLe: true,
  creeLe: true,
  supersedesObjectifId: true,
  sourcePropositionId: true,
} as const;

type LigneLue = {
  id: string;
  enoncePatient: string;
  reformulationPraticien: string | null;
  priorite: string | null;
  nonTraiteMotif: string | null;
  nonTraiteDepuisLe: Date | null;
  negocieLe: Date | null;
  creeLe: Date;
  supersedesObjectifId: string | null;
  sourcePropositionId: string | null;
};

function exposer(ligne: LigneLue): ObjectifExpose {
  return {
    id: ligne.id,
    enoncePatient: ligne.enoncePatient,
    reformulationPraticien: ligne.reformulationPraticien,
    priorite: ligne.priorite,
    nonTraiteMotif: ligne.nonTraiteMotif,
    nonTraiteDepuisLe: ligne.nonTraiteDepuisLe ? ligne.nonTraiteDepuisLe.toISOString() : null,
    negocieLe: ligne.negocieLe ? ligne.negocieLe.toISOString() : null,
    creeLe: ligne.creeLe.toISOString(),
    supersedesObjectifId: ligne.supersedesObjectifId,
    sourcePropositionId: ligne.sourcePropositionId,
  };
}

type Garde =
  | { echec: NextResponse<ObjectifsApiResponse>; email?: undefined }
  | { echec?: undefined; email: string };

/**
 * Session, forme de l'identifiant, puis appartenance — DANS CET ORDRE, et il
 * n'est pas décoratif : `verifierAppartenancePatient` JOURNALISE l'accès au
 * dossier (G-TRUST-04). Tester la session et le format après elle ferait
 * consigner un accès qui n'a pas eu lieu (motif de
 * `biology-library/gardeProposition.ts:11-14`).
 *
 * `acces` n'est transmis que par le GET : seule la lecture du dossier est une
 * consultation à journaliser — une écriture laisse déjà sa propre trace, datée
 * et attribuée.
 */
async function garder(idPatient: string, acces?: GabaritAcces): Promise<Garde> {
  const session = await getServerSession(authOptions);
  if (!session) return { echec: echec('unauthenticated', 'Authentification requise.', 401) };

  if (!idPatient || !ID_PATIENT_PATTERN.test(idPatient) || idPatient.length > LONGUEUR_MAX_ID) {
    return { echec: echec('invalid', 'Identifiant patient invalide.', 400) };
  }

  const email = emailPraticien(session);
  const appartenance = await verifierAppartenancePatient(idPatient, email, acces);
  if (appartenance === 'introuvable') {
    return { echec: echec('patient_not_found', 'Patient introuvable.', 404) };
  }
  if (appartenance === 'autre_praticien') {
    return { echec: echec('forbidden', 'Patient non accessible pour ce praticien.', 403) };
  }

  // Inatteignable aujourd'hui (`appartenance.ts` rend `autre_praticien` sur un
  // e-mail de session nul), mais un repli `''` heurterait le CHECK non-vide de
  // `praticien_email` et rendrait 500 là où 401 est la réponse juste.
  if (!email) return { echec: echec('unauthenticated', 'Authentification requise.', 401) };
  return { email };
}

/** Champ texte d'un JSON d'anamnèse. Absent, vide ou non textuel ⇒ `null`. */
function champTexte(anamnese: Record<string, unknown>, cle: string): string | null {
  const valeur = anamnese[cle];
  if (typeof valeur !== 'string') return null;
  const texte = valeur.trim();
  return texte.length === 0 ? null : texte;
}

/** Champ à choix multiples. Les entrées non textuelles sont écartées, pas devinées. */
function champListe(anamnese: Record<string, unknown>, cle: string): string[] {
  const valeur = anamnese[cle];
  if (!Array.isArray(valeur)) return [];
  return valeur
    .filter((entree): entree is string => typeof entree === 'string')
    .map((entree) => entree.trim())
    .filter((entree) => entree.length > 0);
}

const ANCRAGE_SANS_CONSULTATION: AncrageAnamnese = {
  consultationValidee: false,
  motifPrincipal: null,
  objectifPrioritaire: null,
  attentes: [],
};

// GET /api/praticien/objectifs?idPatient= — trajectoire complète + matériau.
export async function GET(req: Request): Promise<NextResponse<ObjectifsApiResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const idPatient = (searchParams.get('idPatient') ?? '').trim();
    const garde = await garder(idPatient, { route: ROUTE_JOURNAL, methode: 'GET' });
    if (garde.echec) return garde.echec;

    const [lignes, ratifications, amendements, reponsesJalon, consultation] = await Promise.all([
      prisma.objectifNegocie.findMany({
        where: { idPatient },
        select: SELECTION_OBJECTIF,
        orderBy: { creeLe: 'desc' },
      }),
      // LECTURE SEULE : le geste de ratification appartient au patient
      // (LOT-06). Cette route ne l'écrit jamais.
      prisma.ratificationObjectif.findMany({
        where: { idPatient },
        select: { id: true, idObjectif: true, sens: true, creeLe: true },
      }),
      // LECTURE SEULE, MÊME MOTIF (6.0-B, LOT-04) : l'amendement est une parole
      // de patient, et son écrivain unique est le portail. Une route praticien
      // qui l'écrirait fabriquerait des mots que le patient n'a pas écrits —
      // garde structurelle, pas promesse.
      prisma.amendementObjectif.findMany({
        where: { idPatient },
        select: { id: true, idObjectif: true, texte: true, creeLe: true },
        orderBy: { creeLe: 'desc' },
      }),
      // LECTURE SEULE, TROISIÈME FOIS (6.0-B, LOT-05) : la réponse d'étape est
      // une parole de patient sur lui-même, écrite depuis le seul portail.
      prisma.reponseJalonObjectif.findMany({
        where: { idPatient },
        select: { id: true, idObjectif: true, jalon: true, texte: true, eva: true, creeLe: true },
        orderBy: { creeLe: 'desc' },
      }),
      prisma.consultation.findFirst({
        where: { idPatient, statut: 'validee' },
        select: { anamnese: true },
        orderBy: [{ dateValidation: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const courants = objectifsCourants(lignes);

    return NextResponse.json({
      ok: true,
      objectifs: courants.map(exposer),
      // La trajectoire de CHAQUE tête, versions antérieures comprises : ce qui
      // a été reformulé reste lisible, rien n'est écrasé.
      trajectoires: courants.map((tete) => ({
        idObjectif: tete.id,
        lignes: chaineDObjectif(lignes, tete.id).map(exposer),
      })),
      ancrage: consultation ? lireAncrage(consultation.anamnese) : ANCRAGE_SANS_CONSULTATION,
      // Un état par tête, jamais un taux : `etatRatification` rend le DERNIER
      // geste porté sur cette version précise — LES DEUX TABLES CONFONDUES,
      // sans quoi le cockpit afficherait « ratifié » à un praticien dont le
      // patient vient d'écrire sa propre version.
      ratifications: Object.fromEntries(
        courants.map((tete) => [tete.id, etatRatification(tete.id, ratifications, amendements)]),
      ),
      amendements: amendements.map((ligne) => ({
        id: ligne.id,
        idObjectif: ligne.idObjectif,
        texte: ligne.texte,
        creeLe: ligne.creeLe.toISOString(),
      })),
      reponsesJalon: reponsesJalon.map((ligne) => ({
        id: ligne.id,
        idObjectif: ligne.idObjectif,
        jalon: ligne.jalon,
        texte: ligne.texte,
        // BRUTE. Ni arrondi, ni normalisation, ni `?? 0` : le `null` d'un
        // patient qui n'a pas répondu à l'échelle traverse la route intact.
        eva: ligne.eva,
        creeLe: ligne.creeLe.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[praticien/objectifs GET]', messageJournalisable(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}

/**
 * Les trois champs d'ancrage de l'anamnèse validée. Ils sont RECOPIÉS tels
 * quels, jamais transformés : `anamnese.ts` reste en lecture seule.
 * N'est appelée que si une consultation validée existe.
 */
/**
 * Ce qu'on a le droit d'écrire au journal — SÛR PAR CONSTRUCTION.
 *
 * DETTE NOMMÉE PAR LA REVUE DU LOT-04, SOLDÉE ICI. Les deux `catch` de cette
 * route journalisaient `err.message` brut sous un commentaire qui promettait
 * « jamais le payload ». La promesse était sincère et fausse :
 * `PrismaClientValidationError` RECOPIE le `data:` du `create` dans son message
 * — soit l'énoncé du patient, la reformulation du praticien et son e-mail. On
 * n'en garde que la CLASSE et le marqueur Prisma (`P2002`…), ni l'un ni l'autre
 * ne pouvant porter une valeur.
 *
 * `marqueurPrisma` et non `code` : la garde anti-diagnostic refuse tout nom
 * commençant par « code » — faux positif ici (c'est un code d'ERREUR), mais on
 * renomme plutôt que d'assouplir une garde contournable par un nom bien choisi.
 */
/**
 * L'objectif rédigé atteint le patient ([[D-153]], constat `M02`).
 *
 * MESURE QUI FONDE CE GESTE (production, 2026-09-08) : 4 propositions,
 * 1 objectif négocié, et **0 ratification, 0 amendement, 0 réponse de jalon** —
 * les trois drapeaux de la chaîne étant pourtant posés. Le patient ne pouvait
 * l'apprendre qu'en revenant spontanément au portail ; les chiffres démentent
 * cette hypothèse.
 *
 * TROIS PROPRIÉTÉS, ET AUCUNE N'EST ACCESSOIRE.
 *   1. RIEN NE PART D'UN DOSSIER CLOS OU DÉSACTIVÉ — mais la porte n'est PAS
 *      ici : le POST refuse déjà 409 à l'entrée (`accepteNouvelEnvoi`, plus
 *      bas), avant toute écriture. Un second contrôle ici serait INATTEIGNABLE,
 *      donc invérifiable — un banc l'a montré en survivant à sa suppression.
 *      Le dépôt vient d'apprendre ce que coûte un mécanisme qu'aucun chemin
 *      n'atteint ([[D-148]]) : on ne le refait pas pour se rassurer. Tout
 *      appelant NOUVEAU de cette fonction doit donc franchir la même porte.
 *   2. L'ÉCHEC N'ANNULE PAS L'ÉCRITURE. L'objectif est déjà en base : un
 *      relais SMTP en panne ne doit pas transformer une écriture réussie en
 *      500. L'échec est journalisé par l'envoyeur — donc visible sur la fiche
 *      depuis [[D-148]] — puis absorbé ici.
 *   3. L'ÉNONCÉ NE VOYAGE PAS. Le gabarit dit qu'un texte attend ; il ne le
 *      transporte pas (cf. `registreGabarits`).
 */
async function notifierObjectifPropose(idPatient: string): Promise<void> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { idPatient },
      select: { email: true, prenom: true },
    });
    if (!patient?.email) return;
    await sendObjectifProposeEmail(patient.email, patient.prenom, idPatient);
  } catch (err) {
    // Jamais le payload : il porte l'énoncé du patient.
    console.error('[praticien/objectifs] notification objectif', messageJournalisable(err));
  }
}

function messageJournalisable(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (!err.name.startsWith('PrismaClient')) return err.message;
  const marqueurPrisma = (err as { code?: unknown }).code;
  return typeof marqueurPrisma === 'string' ? `${err.name} (${marqueurPrisma})` : err.name;
}

function lireAncrage(anamnese: unknown): AncrageAnamnese {
  const source =
    anamnese !== null && typeof anamnese === 'object' && !Array.isArray(anamnese)
      ? (anamnese as Record<string, unknown>)
      : {};
  return {
    // Une consultation validée existe : à partir d'ici, un champ vide est un
    // champ NON RENSEIGNÉ, ce qui ne se dit pas comme « pas de consultation ».
    consultationValidee: true,
    motifPrincipal: champTexte(source, 'motif_principal'),
    objectifPrioritaire: champTexte(source, 'objectif_prioritaire'),
    attentes: champListe(source, 'attentes'),
  };
}

/**
 * La proposition reprise, VÉRIFIÉE, et l'énoncé qu'elle fournit.
 *
 * QUATRE REFUS, ET AUCUN N'EST DE FORME.
 *
 * `proposition_introuvable` (404) — inexistante OU d'un autre dossier, MÊME
 * réponse et MÊME message : les distinguer ferait de la route un oracle
 * d'existence de proposition, interrogeable avec une session praticien
 * quelconque (patron de la révision, ci-dessus).
 *
 * `proposition_caduque` (409) — elle n'appartient plus à la dernière assemblée,
 * donc ses données sources ont bougé. La reprendre attribuerait au patient une
 * citation tirée d'un état du dossier qui n'est plus le sien.
 *
 * `proposition_disposee` (409) — un geste a déjà été posé. Reprendre deux fois
 * la même proposition créerait deux objectifs se réclamant d'une seule parole.
 *
 * `fragment_non_citable` (422) — le fragment désigné n'est pas un verbatim
 * d'anamnèse. C'EST LE CŒUR DU LOT : `enoncePatient` ne se pré-remplit que par
 * citation de ce que le PATIENT a écrit (`D-094`). Le libellé d'une règle
 * signée ou la restitution d'un instrument sont des paroles de la machine ou de
 * l'instrument — les y déposer ferait dire au patient ce qu'il n'a pas dit,
 * avec l'apparence d'une citation.
 *
 * LE TEST DE VIVACITÉ EST « ASSEMBLÉE COURANTE ET NON DISPOSÉE », et non le
 * `propositionsVivantes` de la route des propositions : ce dernier applique en
 * plus le plafond de service de trois, qui borne ce qu'on AFFICHE. L'employer
 * ici refuserait une reprise parfaitement légitime au seul motif qu'une
 * assemblée anormalement grande l'aurait reléguée au quatrième rang.
 */
type Reprise =
  | { echec: NextResponse<ObjectifsApiResponse> }
  | { enoncePatient: string };

async function verifierReprise(
  idPatient: string,
  idProposition: string,
  indexBrut: unknown,
): Promise<Reprise> {
  const [propositions, dispositions] = await Promise.all([
    prisma.propositionObjectif.findMany({
      // Scopé au dossier : le seul index de la table est `(id_patient,
      // cree_le)`, et une table append-only ne fait que croître.
      where: { idPatient },
      select: { id: true, fragments: true, hashSources: true, assembleeLe: true, creeLe: true },
    }),
    prisma.dispositionProposition.findMany({
      where: { idPatient },
      select: { id: true, idProposition: true, geste: true, creeLe: true },
    }),
  ]);

  const visee = propositions.find((ligne) => ligne.id === idProposition);
  if (!visee) {
    return { echec: echec('proposition_introuvable', 'Proposition introuvable.', 404) };
  }

  const courante = assembleeCourante(propositions);
  if (!courante.some((ligne) => ligne.id === idProposition)) {
    return {
      echec: echec(
        'proposition_caduque',
        'Les données sources ont changé depuis cette proposition : elle ne se reprend plus. Rechargez le dossier.',
        409,
      ),
    };
  }

  // DETTE NOMMÉE — CE CONTRÔLE EST UN LIRE-PUIS-ÉCRIRE, HORS TRANSACTION
  // (relevée en revue). Deux reprises concurrentes de la même proposition —
  // double clic pendant une latence, deux onglets — passent toutes deux ici et
  // créent chacune un objectif. La conséquence est PLUS LOURDE que le doublon
  // d'assemblage déjà nommé côté propositions : deux têtes de chaîne portant le
  // même énoncé, donc un portail qui refuse toute ratification
  // (`objectif_discordant`) jusqu'à arbitrage praticien. L'écran réduit la
  // fenêtre en désactivant le bouton pendant l'envoi ; il ne la ferme pas.
  // Fermer demanderait un index unique — donc une migration.
  if (dispositionCourante(idProposition, dispositions) !== null) {
    return {
      echec: echec(
        'proposition_disposee',
        'Cette proposition a déjà été reprise ou écartée. Rechargez le dossier.',
        409,
      ),
    };
  }

  if (typeof indexBrut !== 'number' || !Number.isInteger(indexBrut) || indexBrut < 0) {
    return { echec: echec('invalid', 'Fragment cité invalide.', 400) };
  }
  const fragments = Array.isArray(visee.fragments) ? visee.fragments : [];
  const fragment = fragments[indexBrut];
  if (fragment === null || typeof fragment !== 'object' || Array.isArray(fragment)) {
    return { echec: echec('invalid', 'Fragment cité invalide.', 400) };
  }

  const { texte, source } = fragment as { texte?: unknown; source?: unknown };
  const nature =
    source !== null && typeof source === 'object' && !Array.isArray(source)
      ? (source as { nature?: unknown }).nature
      : undefined;
  if (nature !== 'anamnese') {
    return {
      echec: echec(
        'fragment_non_citable',
        'Seuls les mots écrits par le patient à l’anamnèse peuvent devenir son énoncé.',
        422,
      ),
    };
  }
  if (typeof texte !== 'string' || texte.trim().length === 0) {
    return { echec: echec('invalid', 'Fragment cité invalide.', 400) };
  }

  return { enoncePatient: texte.trim() };
}

type PostBody = {
  idPatient?: string;
  enoncePatient?: string;
  reformulationPraticien?: string;
  priorite?: string;
  nonTraiteMotif?: string;
  nonTraiteDepuisLe?: string;
  negocieLe?: string;
  supersedesObjectifId?: string | null;
  /** La proposition reprise (6.0-B, LOT-03). */
  sourcePropositionId?: string | null;
  /**
   * QUEL fragment de cette proposition fournit l'énoncé — un INDICE dans le
   * tableau `fragments`, stable parce que la ligne est append-only et n'est
   * jamais mise à jour.
   *
   * L'écran désigne, le serveur recopie. Transmettre le TEXTE aurait laissé
   * l'appelant écrire ce qu'il voulait sous l'étiquette « citation verbatim
   * d'anamnèse » — exactement ce que `D-094` interdit.
   */
  sourceFragmentIndex?: unknown;
  /**
   * L'AMENDEMENT CITÉ (Alliance 6.0-B, LOT-04, `D-110`) — la boucle de
   * négociation qui se referme : le patient a écrit sa version, le praticien
   * l'intègre en posant une NOUVELLE version dont l'énoncé sont ses mots à lui.
   *
   * L'écran désigne, le serveur RECOPIE : le texte n'est pas transmis, exactement
   * comme pour un fragment de proposition. Transmettre le texte laisserait
   * écrire n'importe quoi sous l'étiquette « parole du patient ».
   *
   * IL SE POSE AVEC `supersedesObjectifId`, jamais seul : intégrer un amendement
   * est une RÉVISION de la version qu'il vise. Un amendement cité sans version
   * révisée poserait une tête de chaîne neuve à côté de celle qui existe — deux
   * objectifs courants, donc un portail qui refuse toute réponse.
   */
  amendementCiteId?: string | null;
};

// `typeof`, et non `?? ''` : `PostBody` est un CAST, pas une validation. Un
// corps `{"enoncePatient": 123}` ferait lever `.trim()` et la route rendrait
// 500 là où elle doit rendre 400 — une entrée malformée n'est pas une panne du
// serveur, et la distinguer ainsi renseignerait un appelant hostile.
function texteDuCorps(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

// POST /api/praticien/objectifs — dépose un objectif ou sa révision.
export async function POST(req: Request): Promise<NextResponse<ObjectifsApiResponse>> {
  try {
    let body: PostBody;
    try {
      body = (await req.json()) as PostBody;
    } catch {
      return echec('invalid', 'Corps de requête illisible.', 400);
    }

    // `null`, `42`, `"texte"` et `[]` sont du JSON PARFAITEMENT VALIDE : le
    // `catch` ci-dessus ne les voit pas. Sans ce contrôle, `body.idPatient`
    // lève sur `null` et la route rend 500 — avant même `garder()`, donc
    // déclenchable SANS session. Le cast ne protège que les champs, pas la
    // forme du corps lui-même.
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return echec('invalid', 'Corps de requête illisible.', 400);
    }

    const idPatient = texteDuCorps(body.idPatient);
    const garde = await garder(idPatient);
    if (garde.echec) return garde.echec;

    // Dossier clos : un objectif négocié est une pièce du dossier, le refus
    // vit dans la ROUTE et pas seulement dans l'écran (#181).
    const patient = await prisma.patient.findUnique({
      where: { idPatient },
      select: { actif: true, suiviClotureLe: true },
    });
    if (!patient || !accepteNouvelEnvoi(patient)) {
      return echec(RAISON_DOSSIER_CLOS, MESSAGE_DOSSIER_CLOS, 409);
    }

    const referenceBrute = body.supersedesObjectifId;
    if (referenceBrute !== undefined && referenceBrute !== null && typeof referenceBrute !== 'string') {
      return echec('invalid', 'Référence de version invalide.', 400);
    }
    const supersedesObjectifId = texteDuCorps(referenceBrute);
    if (supersedesObjectifId.length > LONGUEUR_MAX_ID) {
      return echec('invalid', 'Référence de version invalide.', 400);
    }

    const referenceProposition = body.sourcePropositionId;
    if (
      referenceProposition !== undefined
      && referenceProposition !== null
      && typeof referenceProposition !== 'string'
    ) {
      return echec('invalid', 'Référence de proposition invalide.', 400);
    }
    const sourcePropositionId = texteDuCorps(referenceProposition);
    if (sourcePropositionId.length > LONGUEUR_MAX_ID) {
      return echec('invalid', 'Référence de proposition invalide.', 400);
    }

    const referenceAmendement = body.amendementCiteId;
    if (
      referenceAmendement !== undefined
      && referenceAmendement !== null
      && typeof referenceAmendement !== 'string'
    ) {
      return echec('invalid', 'Référence d’amendement invalide.', 400);
    }
    const amendementCiteId = texteDuCorps(referenceAmendement);
    if (amendementCiteId.length > LONGUEUR_MAX_ID) {
      return echec('invalid', 'Référence d’amendement invalide.', 400);
    }

    // AUCUN DRAPEAU SUR LA CITATION D'AMENDEMENT — CHOIX ASSUMÉ, PAS DÉDUCTION.
    //
    // La première rédaction de ce bloc raisonnait faux et a été reprise en revue :
    // elle disait « drapeau éteint, la table reste vide, la citation rend 404 ».
    // C'est vrai le jour de la livraison et faux le lendemain — `D-110` ouvre le
    // geste patient DÈS LE MERGE, donc des amendements existeront. Un raisonnement
    // périmé ne doit jamais tenir lieu de garde.
    //
    // Le motif réel : `WN_DOSSIER_DEUX_VOIX` garde la SURFACE DU PATIENT — sa
    // capacité à lire et à écrire. Ce qui est déjà écrit est une pièce du dossier,
    // et la lecture du dossier par le praticien comme sa faculté de REFORMULER un
    // objectif n'ont jamais été sous aucun drapeau (arbitrage de 6.0-A, en-tête de
    // ce fichier). Couper l'interrupteur ferme le portail ; cela ne rend pas
    // intouchables les mots que le patient a déjà écrits, et les masquer au
    // praticien le rendrait aveugle à une pièce réelle de son dossier.
    //
    // CE N'EST PAS LE CAS DE LA REPRISE DE PROPOSITION, gardée juste en dessous, et
    // la différence est de nature : celle-là consomme une matière que la MACHINE
    // produit. Éteindre `WN_OBJECTIF_PROPOSE` dit « nous ne voulons plus que la
    // machine propose » — continuer d'en reprendre le stock contredirait
    // l'interrupteur. Éteindre `WN_DOSSIER_DEUX_VOIX` ne dit rien de tel.
    //
    // Banc qui épingle ce choix : `route.test.ts`, « la citation reste ouverte
    // drapeau éteint ». S'il devient faux, c'est une décision, pas un réglage.
    if (amendementCiteId && sourcePropositionId) {
      return echec(
        'citation_double',
        'Un énoncé vient d’une seule source : soit la proposition citée, soit les mots que le patient a écrits.',
        400,
      );
    }
    if (amendementCiteId && !supersedesObjectifId) {
      return echec(
        'amendement_sans_revision',
        'Intégrer les mots du patient reformule la version qu’il visait : indiquez la version à reformuler.',
        400,
      );
    }

    // LE DRAPEAU GARDE LA REPRISE, ET ELLE SEULE. Un objectif rédigé de la main
    // du praticien reste servi drapeau éteint : c'est une surface de 6.0-A, que
    // ce lot n'a pas à fermer. MÊME RÉPONSE pour le drapeau et pour le repli —
    // les distinguer dirait à l'appelant qu'un dossier a été retiré du
    // périmètre, ce qui ne le regarde pas (patron de la route des propositions).
    if (sourcePropositionId && (!isObjectifProposeEnabled() || !dossierDansPerimetreProposition(idPatient))) {
      return echec('feature_disabled', 'Fonctionnalité non ouverte.', 503);
    }

    // UNE RÉVISION N'EST PAS UNE REPRISE, et les cumuler n'aurait pas de sens.
    // Reformuler un objectif issu d'une proposition ne « reprend » pas la
    // proposition une seconde fois : le lien appartient à la ligne d'origine et
    // reste lisible par la chaîne. Poser les deux ferait compter deux reprises
    // là où le praticien n'en a fait qu'une — et le bilan du LOT-06 lit
    // précisément ces gestes.
    if (supersedesObjectifId && sourcePropositionId) {
      return echec(
        'reprise_sur_revision',
        'Une reformulation ne reprend pas la proposition une seconde fois : le lien reste porté par la version d’origine.',
        400,
      );
    }

    // LA CIBLE SE VÉRIFIE AVANT LE MODULE PUR, et c'est une conséquence de
    // l'invariant, pas un raccourci : `enonce_patient` est NOT NULL non vide
    // sur CHAQUE ligne, et pour une révision cet énoncé est RECOPIÉ depuis la
    // cible — jamais repris du corps, sinon on ferait dire au patient, ligne
    // après ligne, autre chose que ce qu'il a dit. Le module ne peut donc pas
    // préparer ses données avant que la cible soit connue.
    let cible: CibleObjectif | undefined;
    if (supersedesObjectifId) {
      const [visee, dejaSupplantee] = await Promise.all([
        prisma.objectifNegocie.findUnique({
          where: { id: supersedesObjectifId },
          select: { idPatient: true, enoncePatient: true },
        }),
        prisma.objectifNegocie.findFirst({
          // Scopé au dossier, et ce n'est pas cosmétique : le seul index de la
          // table est `(id_patient, cree_le)` (`migration.sql:99`). Sans
          // `idPatient`, le prédicat ne peut pas l'emprunter et parcourt une
          // table append-only qui ne fait que croître. La cible est prouvée du
          // même dossier trois lignes plus bas, le scope est donc sûr.
          where: { idPatient, supersedesObjectifId },
          select: { id: true },
        }),
      ]);
      // INEXISTANTE OU D'UN AUTRE DOSSIER : MÊME réponse, MÊME message. Les
      // distinguer ferait de la route un oracle d'existence d'objectif,
      // interrogeable avec une session praticien quelconque (patron
      // `agenda-alimentaire/portail.ts:140-145`).
      if (!visee || visee.idPatient !== idPatient) {
        return echec('objectif_introuvable', 'Objectif à reformuler introuvable.', 404);
      }
      // Déjà reformulée : deux révisions concurrentes scinderaient la chaîne
      // en deux têtes. La lecture-puis-409 n'est pas étanche à la course — ce
      // qui passe malgré tout est RENDU VISIBLE par l'écran, jamais départagé
      // en silence (`objectifsCourants`).
      if (dejaSupplantee) {
        return echec('objectif_supplante', 'Cet objectif a déjà été reformulé. Rechargez le dossier.', 409);
      }
      cible = { enoncePatient: visee.enoncePatient, origine: 'revision' };
    }

    // L'AMENDEMENT CITÉ REMPLACE L'ÉNONCÉ RECOPIÉ DE LA VERSION RÉVISÉE — c'est
    // tout l'objet du geste : la nouvelle version porte les mots du patient à la
    // place de ceux qu'il avait contestés. Le reste de la révision ne change
    // pas ; la version précédente demeure lisible par la chaîne.
    if (amendementCiteId) {
      const [amendement, lignesDuDossier] = await Promise.all([
        prisma.amendementObjectif.findUnique({
          where: { id: amendementCiteId },
          select: { idPatient: true, idObjectif: true, texte: true },
        }),
        prisma.objectifNegocie.findMany({
          where: { idPatient },
          select: { id: true, supersedesObjectifId: true, creeLe: true },
        }),
      ]);

      // INEXISTANT ou D'UN AUTRE DOSSIER : MÊME réponse, même motif que
      // partout ailleurs — ne pas faire de la route un oracle d'existence.
      if (!amendement || amendement.idPatient !== idPatient) {
        return echec('amendement_introuvable', 'Texte du patient introuvable.', 404);
      }

      // IL DOIT VISER LA MÊME CHAÎNE QUE LA VERSION RÉVISÉE. Un amendement écrit
      // sur un AUTRE objectif du dossier parle d'autre chose ; le recopier ici
      // ferait porter les mots du patient sur une négociation à laquelle ils ne
      // répondaient pas. La chaîne, et non la seule version visée : le patient
      // peut avoir écrit sur `v1` alors que le praticien reformule `v2`, et sa
      // parole n'a pas cessé de concerner cet objectif-là parce qu'une version
      // s'est intercalée.
      const chaine = chaineDObjectif(lignesDuDossier, supersedesObjectifId);
      if (!chaine.some((ligne) => ligne.id === amendement.idObjectif)) {
        return echec(
          'amendement_hors_chaine',
          'Ce texte du patient porte sur un autre objectif : il ne peut pas devenir l’énoncé de celui-ci.',
          409,
        );
      }

      cible = { enoncePatient: amendement.texte, origine: 'amendement' };
    }

    if (sourcePropositionId) {
      const reprise = await verifierReprise(idPatient, sourcePropositionId, body.sourceFragmentIndex);
      if ('echec' in reprise) return reprise.echec;
      cible = { enoncePatient: reprise.enoncePatient, origine: 'reprise' };
    }

    const preparation = preparerObjectif(
      {
        idPatient,
        praticienEmail: garde.email,
        enoncePatient: texteDuCorps(body.enoncePatient),
        reformulationPraticien: texteDuCorps(body.reformulationPraticien),
        priorite: texteDuCorps(body.priorite),
        nonTraiteMotif: texteDuCorps(body.nonTraiteMotif),
        nonTraiteDepuisLe: texteDuCorps(body.nonTraiteDepuisLe),
        negocieLe: texteDuCorps(body.negocieLe),
        supersedesObjectifId: supersedesObjectifId || null,
        sourcePropositionId: sourcePropositionId || null,
      },
      cible,
    );
    if (!preparation.ok) {
      return echec(preparation.raison, MESSAGES_REFUS[preparation.raison], 400);
    }

    // `creeLe` n'est PAS transmis : la base pose le présent (@default(now())).
    // C'est ce qui rend une ligne d'objectif structurellement inantidatable.
    // Un seul `create`, jamais d'`update` : réviser AJOUTE une ligne.
    if (!sourcePropositionId) {
      const creee = await prisma.objectifNegocie.create({
        data: preparation.donnees,
        select: SELECTION_OBJECTIF,
      });
      await notifierObjectifPropose(idPatient);
      return NextResponse.json({ ok: true, objectif: exposer(creee) }, { status: 201 });
    }

    // LES DEUX ÉCRITURES SONT INDISSOCIABLES. L'objectif porte le lien, la
    // disposition porte le geste ; écrire l'un sans l'autre laisserait soit une
    // reprise sans objectif — un praticien ayant repris ce qui n'existe pas —,
    // soit un objectif se réclamant d'une proposition qu'aucun geste n'a
    // disposée, donc encore servie comme vivante.
    //
    // Le geste passe par `preparerDisposition` plutôt que par un littéral :
    // c'est lui qui porte l'arbitrage 3 (une reprise ne s'accompagne d'aucun
    // motif d'écart), et deux vocabulaires du même geste finiraient par diverger.
    const geste = preparerDisposition({
      idPatient,
      praticienEmail: garde.email,
      idProposition: sourcePropositionId,
      geste: 'reprise',
      motif: null,
    });
    if (!geste.ok) {
      // Inatteignable : les champs sont établis ci-dessus. Mais un refus
      // silencieusement ignoré ferait écrire l'objectif SANS son geste.
      console.error('[praticien/objectifs POST] disposition refusée', geste.raison);
      return echec('exception', 'Erreur technique.', 500);
    }

    const [creee] = await prisma.$transaction([
      prisma.objectifNegocie.create({ data: preparation.donnees, select: SELECTION_OBJECTIF }),
      prisma.dispositionProposition.create({ data: geste.donnees, select: { id: true } }),
    ]);

    // APRÈS la transaction, jamais dedans : un envoi réseau dans une
    // transaction la tiendrait ouverte le temps du SMTP, et un échec y
    // annulerait deux écritures que le praticien a bel et bien faites.
    await notifierObjectifPropose(idPatient);
    return NextResponse.json({ ok: true, objectif: exposer(creee) }, { status: 201 });
  } catch (err) {
    // Jamais le payload : il porte l'énoncé du patient et la compréhension du
    // praticien, le contenu le plus nominatif du dossier.
    console.error('[praticien/objectifs POST]', messageJournalisable(err));
    return echec('exception', 'Erreur technique.', 500);
  }
}
