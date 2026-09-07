import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailPraticien, filtrePatientsDuPraticien, verifierAppartenancePatient } from '@/lib/praticien/appartenance';
import { AGENDA_ALI_ID } from '@/lib/agenda-alimentaire/types';

const MAX_ASSIGNATIONS = 40;

// Statuts filtrables côté serveur. Le filtre vivait côté client, appliqué APRÈS
// la troncature à `MAX_ASSIGNATIONS` : filtrer une liste déjà tronquée ne cache
// pas des lignes en trop, il en cache en moins — et sans le dire. Au 2026-07-29,
// 8 assignations « En attente » tombaient hors des 40 plus récentes et devenaient
// donc invisibles ET inannulables depuis le tableau praticien.
const STATUTS_ASSIGNATION = ['En attente', 'Complété', 'Annulée'] as const;

// Statuts de RÉPONSE filtrables côté serveur — autre colonne, même défaut.
// `FichePatientPanel` filtrait `modification_demandee` en mémoire APRÈS la
// troncature à `MAX_ASSIGNATIONS`, et sur les assignations de TOUS les patients :
// une demande de correction au-delà du 40ᵉ rang n'apparaissait nulle part, et
// n'était donc jamais débloquée — le questionnaire restait verrouillé côté
// patient sans que rien ne le signale au praticien.
//
// Les quatre valeurs sont celles qu'écrit le code : `non_rempli` (défaut du
// schéma), `verrouille` (soumission patient, clôture d'agenda),
// `modification_demandee` (demande de correction du patient) et `deverrouille`
// (déblocage praticien). Au 2026-07-29, la base n'en porte que deux
// (`verrouille` 65, `non_rempli` 28) et aucune valeur hors de cette liste.
const STATUTS_REPONSES = ['non_rempli', 'verrouille', 'modification_demandee', 'deverrouille'] as const;

// Une valeur inconnue est IGNORÉE, pas rejetée : même choix que `sortBy` plus
// bas. Un 400 sur un paramètre d'affichage priverait le praticien de sa liste
// entière pour une faute de frappe dans une URL.
function valeurAutorisee(
  searchParams: URLSearchParams,
  cle: string,
  autorisees: readonly string[],
): string | null {
  const brut = searchParams.get(cle);
  return autorisees.includes(brut ?? '') ? brut : null;
}

type Patient = {
  idPatient: string;
  email: string;
  prenom: string;
  nom: string;
  telephone: string;
  actif: string;
  // Clôture de suivi (IDP2). DISTINCT de `actif` : un dossier clos garde son
  // accès en lecture, un dossier inactif le perd. L'écran ne peut pas déduire
  // l'un de l'autre — d'où ce champ, et non un booléen de plus.
  suiviClotureLe: string | null;
  // Accès au portail révoqué par le praticien (`accessTokenRevoked`). DISTINCT
  // d'`actif` comme de `suiviClotureLe`, et non déductible de l'un ni de
  // l'autre : `D-126` §2 a tranché que désactiver un dossier ne pose PAS ce
  // drapeau. Sans ce champ, la seule surface qui montrait la révocation était
  // l'encart « Nouveaux patients », borné à 30 jours — au 31ᵉ, le praticien ne
  // voyait plus l'état qu'un envoi de lien allait lever.
  accesRevoque: boolean;
};

type Assignation = {
  idAssignation: string;
  idPatient: string;
  emailPatient: string;
  idQuestionnaire: string;
  titre: string;
  dateAssignation: string;
  statut: string;
  statutReponses: string;
  correctionCommentaire: string | null;
  correctionDemandeeDate: string | null;
  // Fait, pas verdict : « au moins une QuestionnaireReponse existe pour cette
  // assignation », jamais « annulable » — la décision d'autorisation reste
  // dans `estAnnulable` (lib/praticien/annulabilite.ts), pas dans ce DTO de
  // liste. Optionnel comme `assignationsMeta` (cf. commentaire plus bas) : un
  // client déployé avant ce champ doit pouvoir constater son absence plutôt
  // que la supposer.
  aPassation?: boolean;
  // Tri-état, `null` n'est PAS `0` : `null` = cette assignation n'est pas un
  // agenda alimentaire (`Q_ALI_09`), il n'y a rien à dire ; `0` = c'en est un,
  // sans aucune journée notée — et ça se dit. Compte de DATES distinctes, pas
  // de lignes : le modèle est append-only, une journée corrigée porte deux
  // lignes `agenda_alimentaire_jours` pour une seule date. Fait d'affichage
  // seul, comme `aPassation` : n'entre dans aucune décision d'autorisation.
  nbJourneesAgenda?: number | null;
};

export type PatientsPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// Distinct de `PatientsPagination`, qui décrit les patients. `total` est le
// nombre d'assignations répondant au filtre EN BASE ; `assignations.length` est
// ce que la troncature en a laissé. Sans ce compte, le client ne peut pas savoir
// qu'il est tronqué — et affiche un plafond comme s'il était un total.
export type AssignationsMeta = {
  total: number;
  plafond: number;
  statut: string | null;
  // Écho des deux autres filtres. Facultatifs à dessein : ils décrivent ce que
  // CE serveur a appliqué, et un client déployé avant eux doit pouvoir constater
  // leur absence plutôt que la supposer. Le client s'en sert pour vérifier que
  // sa demande a bien été honorée avant de conclure quoi que ce soit sur la
  // troncature — un `total` de 93 sous un filtre ignoré se lirait sinon comme
  // une troncature massive.
  statutReponses?: string | null;
  idPatient?: string | null;
};

export type PatientsApiResponse = {
  patients: Patient[];
  assignations: Assignation[];
  assignationsMeta?: AssignationsMeta;
  pagination?: PatientsPagination;
  unavailable?: boolean;
  reason?: 'unauthenticated' | 'exception';
};

export type CreatePatientResponse = {
  success: boolean;
  patient?: Patient;
  error?: string;
  reason?: 'unauthenticated' | 'invalid_payload' | 'duplicate_email' | 'exception';
};

export type PatchPatientResponse = {
  success: boolean;
  error?: string;
  reason?: 'unauthenticated' | 'invalid_payload' | 'patient_not_found' | 'forbidden' | 'exception';
};

// Il n'y a PAS de `DeletePatientResponse` ni de handler `DELETE` ici, et c'est
// délibéré (2026-07-21, LOT-01b). La route existait, n'avait plus d'appelant
// depuis que « Supprimer » a rejoint le menu sous son vrai nom, et surtout elle
// écrivait `actif: false` : un verbe DELETE qui ne détruisait rien, désormais
// voisin d'un effacement qui détruit vraiment. Désactiver un dossier se fait
// par `PATCH { actif: 'NON' }`, qui dit ce qu'il fait ; l'effacement par
// `POST /api/praticien/patients/cycle-de-vie`.

// Prochain idPatient au format PATnnn, dérivé du max courant en base.
async function nextIdPatient(): Promise<string> {
  const patients = await prisma.patient.findMany({ select: { idPatient: true } });
  const maxId = patients.reduce((max, p) => {
    const m = /^PAT(\d+)$/.exec(p.idPatient);
    if (!m) return max;
    return Math.max(max, Number(m[1]));
  }, 0);
  return `PAT${String(maxId + 1).padStart(3, '0')}`;
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function GET(req: Request): Promise<NextResponse<PatientsApiResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { patients: [], assignations: [], unavailable: true, reason: 'unauthenticated' },
      { status: 401 }
    );
  }

  const email = emailPraticien(session);
  if (!email) {
    return NextResponse.json(
      { patients: [], assignations: [], unavailable: true, reason: 'unauthenticated' },
      { status: 401 }
    );
  }

  // `page` absent = comportement historique (liste complète, non paginée),
  // conservé pour les appelants qui ont besoin de tous les patients (ex.
  // le sélecteur de la nouvelle assignation). `page` présent = pagination
  // serveur avec recherche/tri, pour l'affichage tabulaire.
  const { searchParams } = new URL(req.url);
  const pageParam = Number(searchParams.get('page'));
  const isPaginated = Number.isInteger(pageParam) && pageParam >= 1;

  // Un seul `where` pour la liste ET pour le compte : c'est la seule façon que
  // « 40 sur 48 » parle du même ensemble que les 40 lignes rendues. La garde de
  // portée praticien reste en tête — le filtre de statut s'y ajoute, il ne la
  // remplace pas.
  const statut = valeurAutorisee(searchParams, 'statut', STATUTS_ASSIGNATION);
  const statutReponses = valeurAutorisee(searchParams, 'statutReponses', STATUTS_REPONSES);
  // Restriction à un patient. Contrairement aux statuts, une valeur inconnue
  // n'est PAS ignorée : l'ignorer rendrait les assignations de TOUS les patients
  // à un appelant qui en demande un seul, et la fiche afficherait alors les
  // demandes de correction d'un autre dossier. Le filtre est donc appliqué tel
  // quel — une valeur qui ne correspond à rien rend une liste vide, jamais celle
  // d'autrui. La garde de portée praticien reste en tête du `where` : elle n'est
  // pas remplacée, un idPatient d'un autre praticien ne rend rien.
  const idPatientDemande = (searchParams.get('idPatient') ?? '').trim().slice(0, 100) || null;
  const whereAssignations = {
    patient: filtrePatientsDuPraticien(email),
    ...(statut ? { statut } : {}),
    ...(statutReponses ? { statutReponses } : {}),
    ...(idPatientDemande ? { idPatient: idPatientDemande } : {}),
  };

  try {
    if (isPaginated) {
      const page = pageParam;
      const pageSize = clamp(Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
      const search = (searchParams.get('search') ?? '').trim().slice(0, 200);
      const sortBy = searchParams.get('sortBy') === 'email' ? 'email' : 'nom';

      const where = {
        ...filtrePatientsDuPraticien(email),
        ...(search
          ? {
              OR: [
                { nom: { contains: search, mode: 'insensitive' as const } },
                { prenom: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const orderBy =
        sortBy === 'email'
          ? [{ email: 'asc' as const }]
          : [{ nom: 'asc' as const }, { prenom: 'asc' as const }];

      const [dbPatients, total, dbAssignations, totalAssignations] = await Promise.all([
        prisma.patient.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.patient.count({ where }),
        prisma.assignation.findMany({
          where: whereAssignations,
          orderBy: { dateAssignation: 'desc' },
          take: MAX_ASSIGNATIONS,
        }),
        prisma.assignation.count({ where: whereAssignations }),
      ]);
      // Les deux comptages sont indépendants : en série ils ajouteraient deux
      // allers-retours à la page au lieu d'un. Même raison que le `Promise.all`
      // ci-dessus — le coût d'une requête de plus ne se voit qu'en prod.
      const [idsAvecPassation, nbJourneesParAssignation] = await Promise.all([
        idsAssignationsAvecPassation(dbAssignations.map(a => a.idAssignation)),
        nbJourneesAgendaParAssignation(
          dbAssignations.filter(a => a.idQuestionnaire === AGENDA_ALI_ID).map(a => a.idAssignation),
        ),
      ]);

      return NextResponse.json({
        patients: dbPatients.map(patientToDto),
        assignations: dbAssignations.map(a => assignationToDto(a, idsAvecPassation, nbJourneesParAssignation)),
        assignationsMeta: {
          total: totalAssignations,
          plafond: MAX_ASSIGNATIONS,
          statut,
          statutReponses,
          idPatient: idPatientDemande,
        },
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      });
    }

    const [dbPatients, dbAssignations, totalAssignations] = await Promise.all([
      prisma.patient.findMany({ where: filtrePatientsDuPraticien(email), orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] }),
      prisma.assignation.findMany({
        where: whereAssignations,
        orderBy: { dateAssignation: 'desc' },
        take: MAX_ASSIGNATIONS,
      }),
      prisma.assignation.count({ where: whereAssignations }),
    ]);
    // Même parallélisation que la branche paginée ci-dessus.
    const [idsAvecPassationNonPaginee, nbJourneesParAssignationNonPaginee] = await Promise.all([
      idsAssignationsAvecPassation(dbAssignations.map(a => a.idAssignation)),
      nbJourneesAgendaParAssignation(
        dbAssignations.filter(a => a.idQuestionnaire === AGENDA_ALI_ID).map(a => a.idAssignation),
      ),
    ]);

    return NextResponse.json({
      patients: dbPatients.map(patientToDto),
      assignations: dbAssignations.map(a => assignationToDto(a, idsAvecPassationNonPaginee, nbJourneesParAssignationNonPaginee)),
      assignationsMeta: {
        total: totalAssignations,
        plafond: MAX_ASSIGNATIONS,
        statut,
        statutReponses,
        idPatient: idPatientDemande,
      },
    });
  } catch (err) {
    console.error('[patients GET]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      patients: [],
      assignations: [],
      unavailable: true,
      reason: 'exception',
    });
  }
}

function patientToDto(p: {
  idPatient: string;
  email: string;
  prenom: string;
  nom: string;
  telephone: string | null;
  actif: boolean;
  suiviClotureLe: Date | null;
  accessTokenRevoked: boolean;
}): Patient {
  return {
    idPatient: p.idPatient,
    email: p.email,
    prenom: p.prenom,
    nom: p.nom,
    telephone: p.telephone ?? '',
    actif: p.actif ? 'OUI' : 'NON',
    suiviClotureLe: p.suiviClotureLe ? p.suiviClotureLe.toISOString() : null,
    // Même nom que celui déjà servi par `api/praticien/nouveaux-patients`
    // (`SourceNouveauPatient.accesRevoque`) : deux noms pour le même fait
    // obligeraient l'écran à savoir de quelle route vient sa ligne.
    accesRevoque: p.accessTokenRevoked,
  };
}

function assignationToDto(
  a: {
    idAssignation: string;
    idPatient: string;
    emailPatient: string;
    idQuestionnaire: string;
    titre: string;
    dateAssignation: Date;
    statut: string;
    statutReponses: string;
    correctionCommentaire: string | null;
    correctionDemandeeDate: Date | null;
  },
  idsAvecPassation: Set<string>,
  nbJourneesParAssignation: Map<string, number>,
): Assignation {
  return {
    idAssignation: a.idAssignation,
    idPatient: a.idPatient,
    emailPatient: a.emailPatient,
    idQuestionnaire: a.idQuestionnaire,
    titre: a.titre,
    dateAssignation: a.dateAssignation.toISOString(),
    statut: a.statut,
    statutReponses: a.statutReponses,
    correctionCommentaire: a.correctionCommentaire ?? null,
    correctionDemandeeDate: a.correctionDemandeeDate ? a.correctionDemandeeDate.toISOString() : null,
    aPassation: idsAvecPassation.has(a.idAssignation),
    nbJourneesAgenda: a.idQuestionnaire === AGENDA_ALI_ID ? (nbJourneesParAssignation.get(a.idAssignation) ?? 0) : null,
  };
}

// Une seule requête pour toute la page, jamais un `count` par ligne : sur
// `MAX_ASSIGNATIONS` lignes, N requêtes contre 1 est le genre de coût qui ne
// se voit qu'en prod. `distinct` suffit — seule l'EXISTENCE d'au moins une
// réponse compte, pas leur nombre exact.
async function idsAssignationsAvecPassation(idsAssignation: string[]): Promise<Set<string>> {
  if (idsAssignation.length === 0) return new Set();
  const reponses = await prisma.questionnaireReponse.findMany({
    where: { idAssignation: { in: idsAssignation } },
    select: { idAssignation: true },
    distinct: ['idAssignation'],
  });
  return new Set(reponses.map(r => r.idAssignation).filter((id): id is string => id !== null));
}

// Sœur de `idsAssignationsAvecPassation` juste au-dessus, même raison : une
// seule requête groupée pour toute la page, jamais un `count` par assignation
// — sur `MAX_ASSIGNATIONS` lignes, N requêtes contre 1 est le genre de coût
// qui ne se voit qu'en prod. N'est appelée qu'avec des ids d'agenda alimentaire
// (`idQuestionnaire === AGENDA_ALI_ID`) déjà filtrés par l'appelant.
//
// Compte des DATES distinctes, pas des lignes : la table est append-only, une
// journée corrigée porte deux lignes `agenda_alimentaire_jours` pour une seule
// date (`supersedesJourId` chaîne la correction) — le praticien veut le nombre
// de journées de saisie, pas le nombre d'écritures.
//
// **Ce compte n'est PAS celui de `fenetre.nbRenseignees`**, qui alimente
// « N journées notées » sur la fiche : celui-là ne retient que les lignes
// RELUES (JSONB valide, date au format), quarantaine exclue. Celui-ci prend
// toutes les lignes enregistrées — c'est le bon chiffre pour « qu'est-ce que
// l'annulation emporte ? », et c'en est un autre. D'où un libellé distinct
// côté modale (« journée de saisie »), pour que deux nombres ne se
// contredisent pas derrière le même mot.
//
// Le `WHERE id_assignation IN (…)` s'appuie sur l'index
// `agd_ali_assignation_date_idx`, déjà présent : aucune dette d'index créée.
// En revanche, où Prisma applique `distinct` — en base ou dans le moteur de
// requête — n'est vérifié par rien ici, d'où la déduplication applicative
// ci-dessous, qui rend le résultat vrai dans les deux hypothèses.
async function nbJourneesAgendaParAssignation(idsAgenda: string[]): Promise<Map<string, number>> {
  if (idsAgenda.length === 0) return new Map();
  const jours = await prisma.agendaAlimentaireJour.findMany({
    where: { idAssignation: { in: idsAgenda } },
    select: { idAssignation: true, dateJour: true },
    distinct: ['idAssignation', 'dateJour'],
  });
  // Déduplication applicative : c'est ELLE qui porte la correction, `distinct`
  // n'étant pas garanti côté base (voir l'en-tête). Le test du comptage prouve
  // donc cette moitié-là, pas l'autre.
  const vues = new Set<string>();
  const compte = new Map<string, number>();
  for (const j of jours) {
    const cle = `${j.idAssignation}::${j.dateJour}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    compte.set(j.idAssignation, (compte.get(j.idAssignation) ?? 0) + 1);
  }
  return compte;
}

export async function POST(req: Request): Promise<NextResponse<CreatePatientResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { success: false, reason: 'unauthenticated', error: 'Session absente.' },
      { status: 401 }
    );
  }

  type CreatePatientPayload = {
    prenom?: string;
    nom?: string;
    email?: string;
    telephone?: string;
    dateNaissance?: string;
  };

  let payload: CreatePatientPayload;
  try {
    payload = (await req.json()) as CreatePatientPayload;
  } catch {
    return NextResponse.json(
      { success: false, reason: 'invalid_payload', error: 'JSON invalide.' },
      { status: 400 }
    );
  }

  const prenom = (payload.prenom ?? '').trim().slice(0, 100);
  const nom = (payload.nom ?? '').trim().slice(0, 100);
  const email = (payload.email ?? '').trim().toLowerCase().slice(0, 254);
  const telephone = (payload.telephone ?? '').trim().slice(0, 30);
  const dateNaissance = (payload.dateNaissance ?? '').trim();

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isDateValid = !dateNaissance || /^\d{4}-\d{2}-\d{2}$/.test(dateNaissance);
  if (!prenom || !nom || !isEmailValid || !isDateValid) {
    return NextResponse.json(
      {
        success: false,
        reason: 'invalid_payload',
        error: !prenom || !nom
          ? 'Prénom et nom sont requis.'
          : !isEmailValid
            ? 'Email invalide.'
            : 'Date de naissance invalide (format attendu : AAAA-MM-JJ).',
      },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.patient.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, reason: 'duplicate_email', error: 'Un patient avec cet email existe déjà.' },
        { status: 409 }
      );
    }

    const idPatient = await nextIdPatient();
    const praticienEmail = (session.user?.email ?? '').toLowerCase();

    await prisma.patient.create({
      data: {
        idPatient,
        email,
        prenom,
        nom,
        dateNaissance: dateNaissance || null,
        telephone: telephone || null,
        praticienEmail,
        actif: true,
      },
    });

    return NextResponse.json({
      success: true,
      patient: {
        idPatient,
        email,
        prenom,
        nom,
        telephone,
        actif: 'OUI',
        suiviClotureLe: null,
        // Le défaut Prisma (`@default(false)`) : un dossier neuf n'est jamais révoqué.
        accesRevoque: false,
      },
    });
  } catch (err) {
    // Collision rare sur idPatient (créations quasi simultanées) : contrainte unique Prisma P2002
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({
        success: false,
        reason: 'exception',
        error: 'Conflit lors de la génération du numéro patient, réessayez.',
      });
    }
    console.error('[patients POST]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      success: false,
      reason: 'exception',
      error: 'Erreur technique lors de la création du patient.',
    });
  }
}

type PatchPatientPayload = {
  idPatient?: string;
  telephone?: string;
  actif?: 'OUI' | 'NON';
};

export async function PATCH(req: Request): Promise<NextResponse<PatchPatientResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { success: false, reason: 'unauthenticated', error: 'Session absente.' },
      { status: 401 }
    );
  }

  let payload: PatchPatientPayload;
  try {
    payload = (await req.json()) as PatchPatientPayload;
  } catch {
    return NextResponse.json(
      { success: false, reason: 'invalid_payload', error: 'JSON invalide.' },
      { status: 400 }
    );
  }

  const idPatient = (payload.idPatient ?? '').trim();
  const telephone = (payload.telephone ?? '').trim().slice(0, 30);
  const actif = payload.actif;

  // Même forme d'identifiant que `DELETE` (plus bas) et que la route
  // `cycle-de-vie` : `/^PAT\d+$/` rejetait les identifiants à tiret bas, dont
  // le patient fictif `PAT_SEED_03` — « Modifier » était donc inopérant sur le
  // dossier de seed. L'appartenance reste vérifiée juste en dessous.
  if (!idPatient || !/^[A-Za-z0-9_-]+$/.test(idPatient)) {
    return NextResponse.json(
      { success: false, reason: 'invalid_payload', error: 'idPatient invalide.' },
      { status: 400 }
    );
  }
  if (actif !== undefined && actif !== 'OUI' && actif !== 'NON') {
    return NextResponse.json(
      { success: false, reason: 'invalid_payload', error: 'Valeur actif invalide (OUI ou NON).' },
      { status: 400 }
    );
  }

  const verdict = await verifierAppartenancePatient(idPatient, emailPraticien(session));
  if (verdict === 'introuvable') {
    return NextResponse.json({ success: false, reason: 'patient_not_found', error: 'Patient introuvable.' }, { status: 404 });
  }
  if (verdict === 'autre_praticien') {
    return NextResponse.json({ success: false, reason: 'forbidden', error: 'Patient non accessible.' }, { status: 403 });
  }

  try {
    const maintenant = new Date();
    const donneesPatient = {
      ...(payload.telephone !== undefined && { telephone: telephone || null }),
      ...(actif !== undefined && { actif: actif === 'OUI' }),
    };

    if (actif === 'NON') {
      // DÉSACTIVER, C'EST FERMER LES LIENS EN VOL. Le dialogue de confirmation
      // le promet déjà — « ses liens cesseront de fonctionner » — et le code ne
      // le tenait pas : un lien émis avant la désactivation restait ouvrable
      // jusqu'à 24 h après, et l'atterrissage le brûlait avant de le refuser.
      //
      // ON FERME PAR L'HORIZON, PAS PAR L'ÉVÉNEMENT — et depuis `D-128` la
      // RÉVOCATION AUSSI : les deux gestes praticien sont devenus le même, au
      // mot près (`api/praticien/token` DELETE). Ce commentaire a d'abord dit
      // le contraire, parce que la révocation datait alors `consommeLe` et
      // payait ce choix par une égalité stricte avec `sessionsInvalidesAvant`,
      // seul moyen pour `api/praticien/nouveaux-patients` d'écarter un tampon
      // de fermeture. Recopier CE geste-là ici aurait fait de la désactivation
      // le second écrivain de `sessionsInvalidesAvant`, colonne à emplacement
      // unique dont chaque date écrase la précédente : on aurait refermé une
      // porte en rouvrant l'autre. `D-128` a réglé la question à la racine, en
      // retirant l'écrivain plutôt qu'en ajoutant une colonne.
      //
      // `expireLe` ne dilue pas `consommeLe`, seule trace d'entrée du versant
      // patient, et sa valeur est dérivée (`creeLe + 24 h`) : l'avancer ne
      // détruit aucun fait, `creeLe` le reconstruit. Une colonne dit une
      // chose : `expireLe` dit « jusqu'à quand ce lien ouvre », `consommeLe`
      // dit « le patient est entré ».
      //
      // FILTRE MONOTONE ET IDEMPOTENT. `expireLe: { gt: maintenant }` ne
      // rallonge jamais un lien et ne touche rien au second passage — ce qui
      // compte, parce que le formulaire « Modifier » renvoie `actif` à CHAQUE
      // enregistrement : sans ce filtre, une simple correction de téléphone sur
      // un dossier déjà inactif réécrirait des lignes.
      //
      // TRANSACTION : les deux écritures commitent ENSEMBLE, donc aucun lecteur
      // ne voit « liens fermés, dossier encore actif », ni l'inverse. C'est la
      // transaction qui l'assure, PAS l'ordre : sous READ COMMITTED aucun état
      // intermédiaire n'est visible, quel que soit l'ordre des deux écritures.
      //
      // L'ORDRE, LUI, SERT À AUTRE CHOSE. Il est identique à celui de la
      // révocation (`api/praticien/token` DELETE : `patient`, puis
      // `portailMagicLink`). Deux gestes concurrents sur le même dossier
      // prennent donc leurs verrous dans le même sens — pas d'interblocage.
      await prisma.$transaction([
        prisma.patient.update({ where: { idPatient }, data: donneesPatient }),
        prisma.portailMagicLink.updateMany({
          where: { idPatient, consommeLe: null, expireLe: { gt: maintenant } },
          data: { expireLe: maintenant },
        }),
      ]);
    } else {
      // Réactivation, ou téléphone seul : l'écriture d'origine, inchangée. La
      // réactivation ne défait RIEN — un lien fermé ne se rouvre pas, il se
      // réémet (`api/praticien/token`). Voir `D-126`.
      await prisma.patient.update({ where: { idPatient }, data: donneesPatient });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { success: false, reason: 'patient_not_found', error: 'Patient introuvable.' },
        { status: 404 }
      );
    }
    console.error('[patients PATCH]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      success: false,
      reason: 'exception',
      error: 'Erreur technique lors de la modification du patient.',
    });
  }
}
