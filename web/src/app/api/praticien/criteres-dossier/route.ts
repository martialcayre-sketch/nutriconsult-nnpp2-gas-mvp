import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emailPraticien, verifierAppartenancePatient } from '@/lib/praticien/appartenance';
import type { GabaritAcces } from '@/lib/praticien/journalAcces';
import {
  accepteNouvelEnvoi,
  MESSAGE_DOSSIER_CLOS,
  RAISON_DOSSIER_CLOS,
} from '@/lib/patient/cycleDeVie';
import { isC4Enabled } from '@/lib/supplement-library/featureFlag';
import type { CritereConstatable } from '@/lib/supplement-library/constatsCriteres';

// Constat praticien d'un critère sur un dossier ([[D-138]]).
//
// CE QUE CETTE ROUTE FERME. `criteres_dossier_constates` n'avait aucun
// écrivain : le moteur savait lire un constat, personne ne pouvait en poser un.
// C'est le défaut qui a traversé toute la journée du 2026-09-07 — un garde
// serveur dont l'entrée n'a pas de producteur (D-127, D-130 à D-134). Il ne se
// referme qu'ici.
//
// LE CRITÈRE NE SE CALCULE PAS. Rien dans le dépôt ne dit ce qu'un critère lit
// chez un patient ; le dériver d'un score ou d'une réponse serait inventer de la
// sémantique clinique (`DC-19`, `DC-20`). Le praticien CONSTATE, et il signe :
// `constatePar` est l'e-mail de session, `constateLe` est posé par la base — le
// client ne fournit ni l'un ni l'autre. Un constat est donc structurellement
// inantidatable et inattribuable à autrui, comme l'arbitrage biologique.
//
// TROIS ÉTATS, ET `present` NE SE DEVINE PAS. L'absence de ligne vaut INCONNU.
// Un constat d'absence porte sa ligne, `present = false`. C'est pourquoi
// `present` est exigé STRICTEMENT booléen : accepter `"false"`, `0` ou
// `undefined` et les faire tomber sur un défaut transformerait un silence du
// client en constat clinique (`DC-24`).
//
// LE GET EXISTE, ET CE N'EST PAS DE LA COURTOISIE. Un référentiel qu'on écrit
// sans pouvoir le relire n'en est pas un : sans lecture, un second constat sur
// le même critère partirait à l'aveugle contre une ligne qu'on ne voit pas.
// (Leçon [[D-132]], où deux routes d'écriture muettes avaient dû être rouvertes.)
//
// FAIL-CLOSED sur `WN_C4_ENABLED` : le vocabulaire de critères n'existe que sous
// ce drapeau, un constat n'a donc aucun sens sans lui.

const ID_PATIENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const NOTE_MAX = 2000;

// Gabarit littéral pour le journal des accès (G-TRUST-04) — jamais l'URL reçue.
const ROUTE_JOURNAL = '/api/praticien/criteres-dossier';

export type ConstatExpose = {
  critereId: string;
  code: string;
  labelFr: string;
  present: boolean;
  note: string | null;
  constateLe: string;
  constatePar: string;
};

export type { CritereConstatable };

export type CriteresDossierApiResponse =
  | { ok: true; criteres: CritereConstatable[] }
  | { ok: true; constat: ConstatExpose }
  | { ok: false; reason: string; error: string };

const SELECTION = {
  critereId: true,
  present: true,
  note: true,
  constateLe: true,
  constatePar: true,
  critere: { select: { code: true, labelFr: true } },
} as const;

function echec(reason: string, error: string, status: number) {
  return NextResponse.json<CriteresDossierApiResponse>({ ok: false, reason, error }, { status });
}

function exposer(ligne: {
  critereId: string;
  present: boolean;
  note: string | null;
  constateLe: Date;
  constatePar: string;
  critere: { code: string; labelFr: string };
}): ConstatExpose {
  return {
    critereId: ligne.critereId,
    code: ligne.critere.code,
    labelFr: ligne.critere.labelFr,
    present: ligne.present,
    note: ligne.note,
    constateLe: ligne.constateLe.toISOString(),
    constatePar: ligne.constatePar,
  };
}

type Garde =
  | { echec: NextResponse<CriteresDossierApiResponse>; email?: undefined }
  | { echec?: undefined; email: string };

async function garder(idPatient: string, acces?: GabaritAcces): Promise<Garde> {
  if (!isC4Enabled()) {
    return {
      echec: echec(
        'flag_eteint',
        'Constats de critères indisponibles (rayon compléments désactivé).',
        404,
      ),
    };
  }
  const session = await getServerSession(authOptions);
  if (!session) return { echec: echec('unauthenticated', 'Authentification requise.', 401) };
  if (!idPatient || !ID_PATIENT_PATTERN.test(idPatient) || idPatient.length > 64) {
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
  return { email: email ?? '' };
}

export async function GET(req: Request): Promise<NextResponse<CriteresDossierApiResponse>> {
  try {
    const url = new URL(req.url);
    const idPatient = (url.searchParams.get('idPatient') ?? '').trim();
    const garde = await garder(idPatient, { route: ROUTE_JOURNAL, methode: 'GET' });
    if (garde.echec) return garde.echec;

    // Le vocabulaire gouverné ACTIF, et les constats de ce dossier. Les deux
    // sont recousus ICI, une fois, plutôt que par chaque écran.
    const [vocabulaire, lignes] = await Promise.all([
      prisma.clinicalCriterion.findMany({
        where: { actif: true },
        orderBy: [{ labelFr: 'asc' }],
        select: { id: true, code: true, labelFr: true, categorie: true },
      }),
      prisma.critereDossierConstate.findMany({
        where: { idPatient },
        select: { critereId: true, present: true, note: true, constateLe: true, constatePar: true },
      }),
    ]);
    const parCritere = new Map(lignes.map((ligne) => [ligne.critereId, ligne]));
    const criteres: CritereConstatable[] = vocabulaire.map((critere) => {
      const ligne = parCritere.get(critere.id);
      return {
        critereId: critere.id,
        code: critere.code,
        labelFr: critere.labelFr,
        categorie: critere.categorie,
        // Pas de ligne = INCONNU. Jamais un `present: false` de repli : ce
        // serait affirmer que le praticien a constaté une absence.
        constat: ligne
          ? {
              present: ligne.present,
              note: ligne.note,
              constateLe: ligne.constateLe.toISOString(),
              constatePar: ligne.constatePar,
            }
          : null,
      };
    });
    return NextResponse.json<CriteresDossierApiResponse>({ ok: true, criteres });
  } catch (err) {
    console.error(
      '[praticien/criteres-dossier GET]',
      err instanceof Error ? err.message : String(err),
    );
    return echec('server_error', 'Erreur technique.', 500);
  }
}

type PostBody = {
  idPatient?: string;
  critereId?: unknown;
  present?: unknown;
  note?: unknown;
};

export async function POST(req: Request): Promise<NextResponse<CriteresDossierApiResponse>> {
  try {
    let body: PostBody;
    try {
      body = (await req.json()) as PostBody;
    } catch {
      return echec('invalid', 'Corps de requête illisible.', 400);
    }

    const idPatient = (body.idPatient ?? '').trim();
    const garde = await garder(idPatient);
    if (garde.echec) return garde.echec;

    // Dossier clos : un constat est une pièce du dossier, la consignation se
    // refuse dans la route, jamais seulement dans l'écran.
    const patient = await prisma.patient.findUnique({
      where: { idPatient },
      select: { actif: true, suiviClotureLe: true },
    });
    if (!patient || !accepteNouvelEnvoi(patient)) {
      return echec(RAISON_DOSSIER_CLOS, MESSAGE_DOSSIER_CLOS, 409);
    }

    const critereId = typeof body.critereId === 'string' ? body.critereId.trim() : '';
    if (!critereId) {
      return echec('critere_requis', 'Le critère à constater est obligatoire.', 400);
    }

    // STRICTEMENT booléen. Un `?? false`, un `Boolean(...)` ou un `=== 'true'`
    // feraient d'un champ oublié un constat d'absence — un silence du client
    // deviendrait un fait clinique signé du praticien (`DC-24`).
    if (typeof body.present !== 'boolean') {
      return echec(
        'present_requis',
        'Le constat doit dire si le critère est présent ou absent : ce champ ne se devine pas.',
        400,
      );
    }
    const present = body.present;

    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > NOTE_MAX) {
      return echec('note_trop_longue', `La note est trop longue (${NOTE_MAX} caractères au plus).`, 400);
    }

    // Le vocabulaire est gouverné : on ne constate que des critères qui existent
    // ET sont actifs — même garde que la création d'une règle.
    const critere = await prisma.clinicalCriterion.findUnique({
      where: { id: critereId },
      select: { id: true, actif: true },
    });
    if (!critere?.actif) {
      return echec('critere_introuvable', 'Critère clinique inconnu ou inactif.', 422);
    }

    // UN constat par critère et par dossier (`cb_critere_dossier_unique`).
    // Re-constater MET À JOUR — et le bloc `update` réécrit `constatePar`, sans
    // quoi la ligne attribuerait au premier praticien un constat posé par un
    // second. `constateLe` suit tout seul (`@updatedAt`).
    const ligne = await prisma.critereDossierConstate.upsert({
      where: { idPatient_critereId: { idPatient, critereId } },
      create: { idPatient, critereId, present, note: note || null, constatePar: garde.email },
      update: { present, note: note || null, constatePar: garde.email },
      select: SELECTION,
    });

    return NextResponse.json<CriteresDossierApiResponse>({ ok: true, constat: exposer(ligne) });
  } catch (err) {
    console.error(
      '[praticien/criteres-dossier POST]',
      err instanceof Error ? err.message : String(err),
    );
    return echec('server_error', 'Erreur technique.', 500);
  }
}

// PAS DE DELETE, ET C'EST UNE OMISSION DÉLIBÉRÉE, PAS UN OUBLI.
//
// Retirer un constat ramènerait le critère à « inconnu », c'est-à-dire
// effacerait une pièce signée du dossier. Corriger un constat se fait en le
// REPOSANT (présent ↔ absent), ce qui laisse une trace et un signataire à jour.
// Le geste « je retire ce que j'ai constaté » est d'une autre nature — il
// demande son propre arbitrage, et l'ouvrir sans l'avoir tranché serait ouvrir
// une suppression de donnée clinique par défaut.
