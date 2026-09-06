import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  accepteNouvelEnvoi,
  MESSAGE_DOSSIER_CLOS,
  RAISON_DOSSIER_CLOS,
} from '@/lib/patient/cycleDeVie';
import { garderResultats, type VerdictGardeResultats } from '@/lib/biology-library/gardeResultats';
import { validerSaisieResultat } from '@/lib/biology-library/resultats';
import { correctionsParLigne } from '@/lib/biology-library/filCorrection';

// Résultats biologiques réels du dossier (étage 2, CB-09, [[D-122]] §2) —
// derrière `isCbResultsEnabled` (posé AVEC ce code, geste daté `D-081`).
//
// L'UNITÉ N'EST JAMAIS FOURNIE PAR LE CLIENT : elle est relue sur l'analyte
// au catalogue au moment de la saisie et consignée avec la mesure — la
// concordance unité résultat ↔ unité analyte (frontière tracée à la PR #838)
// tient PAR CONSTRUCTION, et le vocabulaire partagé (CHECK migration) n'a
// rien à re-juger. Un analyte sans unité au catalogue donne un résultat sans
// unité : on n'en invente pas.
//
// `source` est posée SERVEUR : cette surface est la saisie praticien —
// `import_labo`, l'autre origine de la décision, attend son propre chemin.
//
// LA CORRECTION EST UNE NOUVELLE LIGNE, JAMAIS UN `update` ([[D-124]]) —
// patron maison des chaînes `supersedes_*`, esprit `DC-30` : une erreur se
// signale, elle ne disparaît pas. Le POST porte donc deux gestes :
//
//   • `supersedesResultatId` ABSENT  → saisie neuve. Soumise à l'unicité
//     (partielle, `WHERE supersedes_resultat_id IS NULL`) : le 409
//     `doublon_mesure` est un `P2002` et n'a pas bougé d'un pouce.
//   • `supersedesResultatId` PRÉSENT → correction. La ligne sort de l'index
//     parce que sa chaîne n'est pas nulle — et c'est précisément pourquoi la
//     validation de la cible N'EST PAS FACULTATIVE : une chaîne acceptée sans
//     contrôle contournerait la garde anti-doublon autant de fois qu'on veut.
//
// LES QUATRE CONTRÔLES DUS, et comment ils sont tenus. `D-124` en exigeait
// quatre : cible existante, même dossier, même analyte, même date de
// prélèvement, tête de fil. Deux d'entre eux ne sont pas VÉRIFIÉS ici, ils
// sont rendus IMPOSSIBLES : l'analyte et la date de prélèvement ne sont pas
// pris du client, ils sont RELUS SUR LA LIGNE VISÉE — même discipline que
// `source` et que l'unité. Restent trois lectures : la cible existe et
// appartient au dossier (une seule requête, `where { id, idPatient }` — une
// cible d'un autre dossier est « introuvable », et rien ne fuite de son
// existence), et personne ne la supplante déjà.
//
// PÉRIMÈTRE V1 : valeur et unité seulement. L'unité se corrige comme elle se
// pose — relue sur l'analyte au catalogue, le client n'a aucune autorité
// dessus. Corriger l'analyte ou la date serait ANNULER une mesure et en
// saisir une autre : la suppression reste hors périmètre.

const ROUTE_JOURNAL = '/api/praticien/biologie/resultats';

export type ResultatConsigne = {
  id: string;
  analyteCode: string;
  analyteLibelle: string;
  valeur: number;
  unite: string | null;
  preleveLe: string;
  source: string;
  /** Horodatage serveur de la saisie — inantidatable, et il date la correction. */
  saisiLe: string;
  /** La ligne que celle-ci corrige, `null` si c'est une saisie neuve. */
  supersedesResultatId: string | null;
  /**
   * L'identifiant de la ligne qui CORRIGE celle-ci, `null` si elle est
   * courante. Calculé au SERVEUR, jamais à l'écran : la règle de départage
   * d'une fourche vit à un seul endroit, sinon deux surfaces raconteraient
   * deux histoires du même dossier.
   */
  corrigeeParId: string | null;
};

export type ResultatsGetResponse =
  | { ok: true; resultats: ResultatConsigne[] }
  | { ok: false; reason: string; error: string };

export type ResultatsPostResponse =
  | { ok: true; resultat: ResultatConsigne }
  | { ok: false; reason: string; error: string };

const MESSAGES_REFUS_SAISIE: Record<string, string> = {
  valeur_invalide: 'La valeur mesurée doit être un nombre.',
  valeur_hors_capacite:
    'La valeur dépasse la capacité de stockage (35 chiffres) : vérifiez la saisie.',
  date_invalide: 'La date de prélèvement est illisible.',
  date_future: 'La date de prélèvement est dans le futur : un prélèvement n’anticipe pas.',
  analyte_inconnu: 'Cet analyte n’existe pas au catalogue.',
  analyte_inactif: 'Cet analyte est inactif au catalogue : pas de nouvelle mesure.',
  doublon_mesure:
    'Une mesure de cet analyte existe déjà pour ce patient à cet horodatage exact. '
    + 'Deux prélèvements du même jour se distinguent par l’heure.',
  correction_cible_inconnue:
    'La mesure à corriger est introuvable dans ce dossier. Relisez la série : elle a pu '
    + 'être corrigée ailleurs entre-temps.',
  correction_deja_corrigee:
    'Cette mesure a déjà été corrigée : c’est la correction la plus récente qui se corrige, '
    + 'jamais une version dépassée. Relisez la série.',
};

function echecGet(reason: string, error: string, status: number) {
  return NextResponse.json<ResultatsGetResponse>({ ok: false, reason, error }, { status });
}

function echecPost(reason: string, error: string, status: number) {
  return NextResponse.json<ResultatsPostResponse>({ ok: false, reason, error }, { status });
}

function depuisVerdictGet(verdict: Exclude<VerdictGardeResultats, { ok: true }>) {
  return echecGet(verdict.reason, verdict.error, verdict.status);
}

function depuisVerdictPost(verdict: Exclude<VerdictGardeResultats, { ok: true }>) {
  return echecPost(verdict.reason, verdict.error, verdict.status);
}

type LigneLue = {
  id: string;
  analyteCode: string;
  /** `Decimal` du client Prisma — `Number()` le lit ; typé par sa capacité. */
  valeur: number | { toString(): string };
  unite: string | null;
  preleveLe: Date;
  source: string;
  saisiLe: Date;
  supersedesResultatId: string | null;
  analyte: { libelle: string };
};

function versConsigne(ligne: LigneLue, corrigeeParId: string | null = null): ResultatConsigne {
  return {
    id: ligne.id,
    analyteCode: ligne.analyteCode,
    analyteLibelle: ligne.analyte.libelle,
    valeur: Number(ligne.valeur),
    unite: ligne.unite,
    preleveLe: ligne.preleveLe.toISOString(),
    source: ligne.source,
    saisiLe: ligne.saisiLe.toISOString(),
    supersedesResultatId: ligne.supersedesResultatId,
    corrigeeParId,
  };
}

/** Les colonnes rendues à la frontière — une seule liste, deux appels. */
const CHAMPS_LUS = {
  id: true,
  analyteCode: true,
  valeur: true,
  unite: true,
  preleveLe: true,
  source: true,
  saisiLe: true,
  supersedesResultatId: true,
  analyte: { select: { libelle: true } },
} as const;

export async function GET(req: Request) {
  try {
    const idPatient = new URL(req.url).searchParams.get('idPatient')?.trim() ?? '';
    // Lecture de données de santé nommées : l'accès se journalise (GD-1).
    const garde = await garderResultats(idPatient, { route: ROUTE_JOURNAL, methode: 'GET' });
    if (!garde.ok) return depuisVerdictGet(garde);

    const lignes = await prisma.resultatBiologique.findMany({
      where: { idPatient },
      orderBy: [{ analyteCode: 'asc' }, { preleveLe: 'asc' }, { saisiLe: 'asc' }],
      select: CHAMPS_LUS,
    });

    // LA SÉRIE EST RENDUE ENTIÈRE, corrections ET corrigées : une erreur se
    // signale, elle ne disparaît pas (`DC-30`). C'est le marquage qui dit
    // laquelle fait foi — pas un filtre, qui effacerait la trace.
    const corrections = correctionsParLigne(
      lignes.map(l => ({
        id: l.id,
        supersedesResultatId: l.supersedesResultatId,
        saisiLe: l.saisiLe.toISOString(),
      })),
    );

    return NextResponse.json<ResultatsGetResponse>({
      ok: true,
      resultats: lignes.map(l => versConsigne(l, corrections.get(l.id)?.id ?? null)),
    });
  } catch (err) {
    // JAMAIS `err.message` : un `PrismaClientValidationError` rend ses
    // arguments — dont des valeurs du dossier — et partirait dans les logs.
    console.error('[praticien/biologie/resultats GET] lecture refusée :', err instanceof Error ? err.name : 'inconnue');
    return echecGet('server_error', 'Erreur technique.', 500);
  }
}

type PostBody = {
  idPatient?: unknown;
  analyteCode?: unknown;
  valeur?: unknown;
  preleveLe?: unknown;
  /** Présent ⇒ correction de cette ligne-là ; absent ⇒ saisie neuve. */
  supersedesResultatId?: unknown;
};

export async function POST(req: Request) {
  try {
    let body: PostBody;
    try {
      body = (await req.json()) as PostBody;
    } catch {
      return echecPost('invalid', 'Corps de requête illisible.', 400);
    }
    // `null`, `42`, `[]` sont du JSON valide : garde AVANT tout accès aux
    // champs, sinon un client anonyme fabrique des 500 pré-auth.
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return echecPost('invalid', 'Corps de requête illisible.', 400);
    }

    const idPatient = typeof body.idPatient === 'string' ? body.idPatient.trim() : '';
    // PAS d'`acces` ici, et le motif a changé de forme avec la correction, donc
    // il se réécrit plutôt qu'il ne se recopie. Ce POST ne DÉRIVE aucun contenu
    // clinique du dossier — contrairement aux POST courrier/document patient,
    // qui dérivent la proposition entière et journalisent pour cela. En
    // correction, il lit UNE ligne, et seulement pour en recopier l'analyte et
    // la date de prélèvement dans la nouvelle : rien que le praticien ne
    // vienne d'obtenir par le GET, qui lui a journalisé son accès. Journaliser
    // une seconde fois inscrirait au registre une lecture qui n'a pas eu lieu,
    // ce que `GD-1` refuse autant que l'omission inverse.
    // L'écriture, elle, est tracée par la ligne consignée (saisi_par, saisi_le).
    const garde = await garderResultats(idPatient);
    if (!garde.ok) return depuisVerdictPost(garde);

    const patient = await prisma.patient.findUnique({
      where: { idPatient },
      select: { actif: true, suiviClotureLe: true },
    });
    if (!patient || !accepteNouvelEnvoi(patient)) {
      return echecPost(RAISON_DOSSIER_CLOS, MESSAGE_DOSSIER_CLOS, 409);
    }

    const supersedesResultatId =
      typeof body.supersedesResultatId === 'string' ? body.supersedesResultatId.trim() : '';

    // LA CIBLE D'UNE CORRECTION, en une seule requête : `where { id, idPatient }`
    // pose l'existence ET l'appartenance au dossier d'un coup. Une cible d'un
    // AUTRE dossier est « introuvable » — le refus ne dit pas qu'elle existe
    // ailleurs, et un identifiant deviné n'apprend rien à celui qui l'essaie.
    const cible = supersedesResultatId
      ? await prisma.resultatBiologique.findFirst({
          where: { id: supersedesResultatId, idPatient },
          select: { id: true, analyteCode: true, preleveLe: true },
        })
      : null;
    if (supersedesResultatId && !cible) {
      return echecPost(
        'correction_cible_inconnue',
        MESSAGES_REFUS_SAISIE.correction_cible_inconnue,
        409,
      );
    }
    if (cible) {
      // TÊTE DE FIL. La base ACCEPTE la fourche — le contrat SQL le prouve
      // exprès —, la route la refuse : on corrige la version qui fait foi,
      // pas une version déjà dépassée. Détection applicative, donc même
      // portée que la garde du document patient (`D-123`) : elle ferme le cas
      // séquentiel, pas la course de deux corrections simultanées, que la
      // règle de départage du fil rend inoffensive à l'affichage.
      const deja = await prisma.resultatBiologique.findFirst({
        where: { idPatient, supersedesResultatId: cible.id },
        select: { id: true },
      });
      if (deja) {
        return echecPost(
          'correction_deja_corrigee',
          MESSAGES_REFUS_SAISIE.correction_deja_corrigee,
          409,
        );
      }
    }

    // L'ANALYTE EST RELU SUR LA CIBLE en correction : le client n'a aucune
    // autorité dessus, exactement comme sur l'unité et sur `source`. Corriger
    // l'analyte serait annuler une mesure et en saisir une autre.
    const analyteCode = cible
      ? cible.analyteCode
      : typeof body.analyteCode === 'string'
        ? body.analyteCode.trim()
        : '';
    const analyte = analyteCode
      ? await prisma.biologyAnalyte.findUnique({
          where: { code: analyteCode },
          select: { code: true, libelle: true, unite: true, actif: true },
        })
      : null;
    if (!analyte) {
      return echecPost('analyte_inconnu', MESSAGES_REFUS_SAISIE.analyte_inconnu, 409);
    }
    // Un analyte RETIRÉ du catalogue interdit une mesure NEUVE, jamais une
    // correction : refuser enfermerait une valeur fausse pour toujours dans le
    // dossier, sans aucun geste pour la reprendre.
    if (!analyte.actif && !cible) {
      return echecPost('analyte_inactif', MESSAGES_REFUS_SAISIE.analyte_inactif, 409);
    }

    const verdict = validerSaisieResultat(
      {
        valeur: body.valeur,
        // La date vient de la LIGNE en correction, jamais du corps : elle est
        // déjà passée par cette même validation le jour de la saisie.
        preleveLe: cible ? cible.preleveLe.toISOString() : body.preleveLe,
      },
      new Date(),
    );
    if (!verdict.ok) {
      // Refus de FORME : la faute est au corps de requête, 400.
      return echecPost(verdict.raison, MESSAGES_REFUS_SAISIE[verdict.raison], 400);
    }

    try {
      const ligne = await prisma.resultatBiologique.create({
        data: {
          idPatient,
          analyteCode: analyte.code,
          // La valeur transite en `number` JSON (flottant IEEE 754) : pour
          // une saisie manuelle à quelques chiffres significatifs, la
          // précision est exacte ; l'exactitude décimale de bout en bout
          // (chaîne → numeric) viendra avec l'import laboratoire si sa
          // source l'exige.
          valeur: verdict.valeur,
          // L'unité de l'ANALYTE, relue à l'instant de la saisie — jamais
          // celle du client.
          unite: analyte.unite,
          preleveLe: verdict.preleveLe,
          source: 'saisie_praticien',
          saisiPar: garde.email,
          // Le maillon. `null` en saisie neuve — c'est LUI qui décide si la
          // ligne tombe sous l'unicité partielle ou en sort.
          supersedesResultatId: cible?.id ?? null,
        },
        select: CHAMPS_LUS,
      });
      return NextResponse.json<ResultatsPostResponse>(
        { ok: true, resultat: versConsigne(ligne) },
        { status: 201 },
      );
    } catch (err) {
      // Duck-typing P2002 (convention du dépôt, cf. api/portail/trust/lecture) :
      // la contrainte unique (patient, analyte, horodatage) a mordu.
      if ((err as { code?: string }).code === 'P2002') {
        return echecPost('doublon_mesure', MESSAGES_REFUS_SAISIE.doublon_mesure, 409);
      }
      // JAMAIS `err.message` : un PrismaClientValidationError rend ses
      // arguments — valeur mesurée comprise — et partirait dans les logs.
      console.error(
        '[praticien/biologie/resultats POST] consignation refusée :',
        err instanceof Error ? err.name : 'inconnue',
      );
      return echecPost('server_error', 'Erreur technique.', 500);
    }
  } catch (err) {
    // Même discipline que le catch intérieur, qui l'écrivait déjà en toutes
    // lettres : JAMAIS `err.message`. Ce catch-ci enveloppe les lectures du
    // dossier (cible, tête de fil) — un `PrismaClientValidationError` y rendrait
    // ses arguments, et une valeur mesurée partirait dans les logs.
    console.error('[praticien/biologie/resultats POST] refus :', err instanceof Error ? err.name : 'inconnue');
    return echecPost('server_error', 'Erreur technique.', 500);
  }
}
