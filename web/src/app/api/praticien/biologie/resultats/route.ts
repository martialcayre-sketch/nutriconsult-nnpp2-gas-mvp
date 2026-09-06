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
    'Une mesure de cet analyte — ou sa correction — existe déjà pour ce patient à cet '
    + 'horodatage exact. Deux prélèvements du même jour se distinguent par l’heure ; '
    + 'une valeur à reprendre se corrige depuis la série.',
  correction_cible_invalide:
    'La mesure à corriger est mal désignée. Reprenez le geste depuis la série plutôt que '
    + 'de consigner une mesure neuve.',
  correction_source_labo:
    'Une mesure issue d’un import laboratoire ne se corrige pas par une saisie praticien : '
    + 'ce chemin-là a son propre arbitrage, il n’est pas ouvert.',
  correction_cible_inconnue:
    'La mesure à corriger est introuvable dans ce dossier. Relisez la série : elle a pu '
    + 'être corrigée ailleurs entre-temps.',
  correction_deja_corrigee:
    'Cette mesure a déjà été corrigée : c’est la correction la plus récente qui se corrige, '
    + 'jamais une version dépassée. Relisez la série.',
};

/**
 * Ce qu'on a le droit d'écrire d'une erreur : son NOM et son CODE Prisma, et
 * rien d'autre. `err.message` rendrait les arguments d'un
 * `PrismaClientValidationError` — valeur mesurée, identifiant de dossier. Le
 * nom seul ne dit presque rien en production (`Error`,
 * `PrismaClientKnownRequestError`) ; le code, lui, est structurel et sans
 * donnée patient — c'est lui qui rend un 500 diagnosticable.
 */
function signature(err: unknown): string {
  const nom = err instanceof Error ? err.name : 'inconnue';
  // `?.` : `throw null` est légal en JavaScript, et lire `.code` dessus lèverait
  // DANS le gestionnaire d'erreur — la réponse `server_error` ne serait jamais
  // construite et la route rendrait un 500 hors contrat. La fonction dont le
  // métier est de rendre les pannes inoffensives ne doit pas en être une.
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? `${nom}/${code}` : nom;
}

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
    console.error('[praticien/biologie/resultats GET] lecture refusée :', signature(err));
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
    // PAS d'`acces` ici, AU TITRE DE LA DISPENSE D'ÉCRITURE DE `GD-1` — et
    // c'est ce fondement-là qui vaut, pas « ce POST ne lit rien du dossier »,
    // qui devient faux avec la correction (elle lit la ligne visée). `GD-1`
    // exclut les écritures parce qu'elles « laissent déjà une trace datée et
    // attribuée » : ici `saisi_par` et `saisi_le`, plus le maillon. Le dépôt a
    // déjà tranché ce cas exact au même endroit — voir `D-118`, « le
    // non-journal du POST change de justification, pas de comportement ».
    // Les POST courrier/document patient, eux, journalisent : ils DÉRIVENT la
    // proposition entière, soit une lecture substantielle qui s'ajoute à
    // l'écriture. Recopier l'analyte et la date d'une ligne n'en est pas une.
    const garde = await garderResultats(idPatient);
    if (!garde.ok) return depuisVerdictPost(garde);

    const patient = await prisma.patient.findUnique({
      where: { idPatient },
      select: { actif: true, suiviClotureLe: true },
    });
    if (!patient || !accepteNouvelEnvoi(patient)) {
      return echecPost(RAISON_DOSSIER_CLOS, MESSAGE_DOSSIER_CLOS, 409);
    }

    // UNE CHAÎNE MALFORMÉE EST UN REFUS, PAS UNE BASCULE SILENCIEUSE. Un champ
    // présent mais illisible (nombre, objet, blancs) valait auparavant
    // « absent » : le client croyait corriger et posait une mesure NEUVE, avec
    // l'analyte et la date qu'il avait envoyés. Changer de geste sans le dire
    // est pire que refuser. `null` seul vaut « pas de chaîne » — c'est la
    // valeur que porte la colonne pour une saisie neuve.
    const chaineDemandee =
      body.supersedesResultatId !== undefined && body.supersedesResultatId !== null;
    const supersedesResultatId =
      typeof body.supersedesResultatId === 'string' ? body.supersedesResultatId.trim() : '';
    if (chaineDemandee && (supersedesResultatId === '' || supersedesResultatId.length > 64)) {
      // Même discipline de borne que `idPatient` dans `garderResultats` : une
      // chaîne arbitrairement longue ne part pas en requête.
      return echecPost(
        'correction_cible_invalide',
        MESSAGES_REFUS_SAISIE.correction_cible_invalide,
        400,
      );
    }

    // LA CIBLE D'UNE CORRECTION, en une seule requête : `where { id, idPatient }`
    // pose l'existence ET l'appartenance au dossier d'un coup. Une cible d'un
    // AUTRE dossier est « introuvable » — le refus ne dit pas qu'elle existe
    // ailleurs, et un identifiant deviné n'apprend rien à celui qui l'essaie.
    const cible = supersedesResultatId
      ? await prisma.resultatBiologique.findFirst({
          where: { id: supersedesResultatId, idPatient },
          select: { id: true, analyteCode: true, preleveLe: true, source: true },
        })
      : null;
    if (supersedesResultatId && !cible) {
      return echecPost(
        'correction_cible_inconnue',
        MESSAGES_REFUS_SAISIE.correction_cible_inconnue,
        409,
      );
    }
    if (cible && cible.source !== 'saisie_praticien') {
      // UNE MESURE DE LABORATOIRE NE SE CORRIGE PAS PAR UNE SAISIE PRATICIEN.
      // `source` est posée serveur à `saisie_praticien` : sans cette garde, la
      // valeur rendue par un laboratoire passerait barrée sous une valeur
      // frappée à la main, dans une surface dont l'en-tête dit qu'`import_labo`
      // attend son propre chemin. Latent aujourd'hui (aucune ligne d'import
      // n'existe) ; la garde est posée AVANT que le cas n'arrive, et la
      // question est portée au registre plutôt que tranchée en silence.
      return echecPost(
        'correction_source_labo',
        MESSAGES_REFUS_SAISIE.correction_source_labo,
        409,
      );
    }
    if (cible) {
      // TÊTE DE FIL — DÉFINIE EXACTEMENT COMME À LA LECTURE. La base ACCEPTE
      // la fourche (le contrat SQL le prouve exprès), la route la refuse : on
      // corrige la version qui fait foi, pas une version déjà dépassée.
      //
      // La garde relit le FIL ENTIER, pas le seul successeur DIRECT. Sur une
      // fourche préexistante, la branche perdante n'est supplantée par
      // personne au sens du chaînage : elle passait la garde alors qu'elle ne
      // fait pas foi, et la corriger faisait basculer l'autorité en silence
      // vers la branche qui avait perdu — la route permettait précisément ce
      // que son refus dit interdire (contre-revue du 2026-09-06, m13).
      //
      // Le fil tient ENTIER dans cette lecture : une correction hérite de
      // l'analyte et de la date de sa cible, donc toute ligne du fil porte la
      // clé de la cible — servie par `cb_resultat_bio_serie_idx`. Détection
      // applicative, donc même portée que la garde du document patient
      // (`D-123`) : elle ferme le cas séquentiel, pas la course de deux
      // corrections simultanées, que l'élection du fil rend inoffensive à
      // l'affichage.
      const fil = await prisma.resultatBiologique.findMany({
        where: { idPatient, analyteCode: cible.analyteCode, preleveLe: cible.preleveLe },
        select: { id: true, supersedesResultatId: true, saisiLe: true },
      });
      const deja = correctionsParLigne(
        fil.map(l => ({
          id: l.id,
          supersedesResultatId: l.supersedesResultatId,
          saisiLe: l.saisiLe.toISOString(),
        })),
      ).has(cible.id);
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
      console.error('[praticien/biologie/resultats POST] consignation refusée :', signature(err));
      return echecPost('server_error', 'Erreur technique.', 500);
    }
  } catch (err) {
    // Même discipline que le catch intérieur, qui l'écrivait déjà en toutes
    // lettres : JAMAIS `err.message`. Ce catch-ci enveloppe les lectures du
    // dossier (cible, tête de fil) — un `PrismaClientValidationError` y rendrait
    // ses arguments, et une valeur mesurée partirait dans les logs.
    console.error('[praticien/biologie/resultats POST] refus :', signature(err));
    return echecPost('server_error', 'Erreur technique.', 500);
  }
}
