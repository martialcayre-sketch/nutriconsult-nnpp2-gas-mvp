import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailPraticien, filtrePatientsDuPraticien } from '@/lib/praticien/appartenance';
import { lignesNouveauxPatients, type LigneNouveauPatient } from '@/lib/fil/nouveauxPatients';

export type NouveauxPatientsApiResponse = {
  ok: boolean;
  lignes: LigneNouveauPatient[];
  fenetreJours: number;
  unavailable?: boolean;
  error?: string;
};

/** Fenêtre de l'encart. Un dossier plus ancien qu'un mois sans accès ni pack
 * n'est plus « un nouveau patient » : c'est un dossier dormant, qui relève de
 * la liste des patients, pas du Fil du jour.
 *
 * NON EXPORTÉ : Next.js 14 refuse au build tout export runtime d'un `route.ts`
 * hors de sa liste connue (`GET`, `dynamic`, `revalidate`…). La valeur voyage
 * dans la réponse (`fenetreJours`), que l'encart affiche telle quelle. */
const FENETRE_JOURS = 30;

/** Garde-fou de volume : au-delà, la lecture n'est plus un encart d'accueil.
 * Le plafond d'AFFICHAGE, lui, vit dans le composant. */
const MAX_DOSSIERS = 60;

const INDISPONIBLE: Omit<NouveauxPatientsApiResponse, 'error'> = {
  ok: false,
  lignes: [],
  fenetreJours: FENETRE_JOURS,
  unavailable: true,
};

// GET /api/praticien/nouveaux-patients — dossiers ouverts dans les 30 derniers
// jours et état des trois portes de mise en service (e-mail d'accès, entrée au
// portail, pack de base). Lecture seule, agrégat calculé en mémoire, jamais
// persisté. Praticien seul : jamais importée d'une surface portail/patient.
export async function GET(): Promise<NextResponse<NouveauxPatientsApiResponse>> {
  const session = await getServerSession(authOptions);
  const emailSession = emailPraticien(session);
  if (!session || !emailSession) {
    return NextResponse.json({ ...INDISPONIBLE, error: 'Non authentifié.' }, { status: 401 });
  }

  try {
    const depuis = new Date(Date.now() - FENETRE_JOURS * 24 * 60 * 60 * 1000);
    const patients = await prisma.patient.findMany({
      where: { createdAt: { gte: depuis }, ...filtrePatientsDuPraticien(emailSession) },
      select: {
        idPatient: true,
        prenom: true,
        nom: true,
        createdAt: true,
        actif: true,
        accessTokenRevoked: true,
        sessionsInvalidesAvant: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_DOSSIERS,
    });
    if (patients.length === 0) {
      return NextResponse.json({ ok: true, lignes: [], fenetreJours: FENETRE_JOURS });
    }
    const ids = patients.map(p => p.idPatient);

    // Quatre lectures bornées par `ids`, jamais une par patient.
    const [correspondances, liensConsommes, connexionsGoogle, validees, assignations] =
      await Promise.all([
        // L'e-mail d'accès au portail — le seul type qui ouvre le dossier.
        // Les booklets et accusés partent APRÈS, ils ne prouvent rien ici.
        prisma.correspondancePatient.findMany({
          where: { idPatient: { in: ids }, type: 'acces_portail' },
          select: { idPatient: true, statut: true, enregistreLe: true },
          orderBy: { enregistreLe: 'asc' },
        }),
        // Entrée effective par lien magique : `consommeLe`, jamais `creeLe` —
        // un lien émis et jamais ouvert est précisément le cas à signaler.
        prisma.portailMagicLink.findMany({
          where: { idPatient: { in: ids }, consommeLe: { not: null } },
          select: { idPatient: true, consommeLe: true },
          orderBy: { consommeLe: 'asc' },
        }),
        // Second chemin d'entrée (G5). `issue: 'consomme'` seul : un `refuse`
        // est une tentative repoussée, pas une connexion.
        prisma.portailConnexionGoogle.findMany({
          where: { idPatient: { in: ids }, issue: 'consomme' },
          select: { idPatient: true, creeLe: true },
          orderBy: { creeLe: 'asc' },
        }),
        prisma.consultation.findMany({
          where: { idPatient: { in: ids }, statut: 'validee' },
          select: { idPatient: true },
        }),
        prisma.assignation.groupBy({
          by: ['idPatient'],
          where: { idPatient: { in: ids } },
          _count: { _all: true },
        }),
      ]);

    // Dernier envoi ABOUTI d'un côté, échec courant de l'autre : une ligne
    // `Erreur` suivie d'un `Envoye` est un incident résolu, et l'afficher
    // comme un blocage enverrait relancer un patient déjà servi.
    const dernierEnvoi = new Map<string, Date>();
    const dernierStatut = new Map<string, string>();
    for (const c of correspondances) {
      dernierStatut.set(c.idPatient, c.statut);
      if (c.statut === 'Envoye') dernierEnvoi.set(c.idPatient, c.enregistreLe);
    }
    // UNE DATE DE CONSOMMATION EST UNE ENTRÉE — DEPUIS `D-127`, ET PAS AVANT.
    // Les deux fermetures praticien passent maintenant par `expireLe` : la
    // désactivation depuis `D-126`, la révocation depuis `D-127`. Plus aucun
    // écrivain ne pose `consommeLe` sur un lien que personne n'a ouvert, et il
    // n'y a donc plus rien à discriminer sur les lignes écrites depuis.
    //
    // CE QUI SUIT EST UN FILET RÉTROSPECTIF, pour les lignes ANTÉRIEURES.
    // Révoquer datait alors les liens en vol (`consommeLe`, route `token`
    // DELETE) à l'instant exact de la révocation, écrit dans la même
    // transaction que `sessionsInvalidesAvant` : l'égalité stricte les écarte.
    // Sans elle, un dossier passait de « Jamais connecté » à « Onboarding à
    // finir » au moment précis où le praticien lui fermait la porte.
    //
    // LA LIMITE QUE CE FILET PORTE ENCORE, et qui ne concerne plus que le
    // passé : le compte ne retient qu'UNE date de révocation. Après deux
    // révocations, un tampon de la première redevient indiscernable d'une
    // entrée. Le code disait ici que « les distinguer demanderait une colonne à
    // la table des liens ». C'était faux, et `D-127` le montre : il ne fallait
    // pas ajouter une colonne, il fallait retirer un écrivain.
    //
    // `sessionsInvalidesAvant` NON NUL NE VEUT PAS DIRE « RÉVOQUÉ ». La
    // migration `20260721190000_idp2_sessions_invalides_avant` a rempli la
    // colonne par backfill. La carte ci-dessous n'écarte donc une date que si
    // elle tombe À LA MILLISECONDE sur celle d'un `consommeLe` — une collision
    // fortuite avec une date de backfill est hors de portée pratique, mais le
    // prédicat vaut par cette coïncidence, pas par un état « révoqué ».
    //
    // UN SECOND TAMPON A EXISTÉ, ET SES LIGNES SURVIVENT. L'atterrissage du
    // lien consommait AVANT de vérifier que le compte était actif et non
    // révoqué, puis refusait : l'estampille restait, posée à l'heure du clic,
    // donc indiscernable d'une vraie entrée. L'ordre est corrigé depuis
    // `D-126` (`portail/lien/[jeton]`, la garde passe devant), et la
    // désactivation ferme désormais les liens en vol par `expireLe`, sans
    // toucher `consommeLe`.
    //
    // MAIS LES LIGNES DÉJÀ POSÉES PAR L'ANCIEN ORDRE RESTENT EN BASE, et rien
    // ne les récupère : aucune lecture ne peut les distinguer d'une entrée
    // réelle. Qui interrogera cette table dans six mois doit le savoir — le
    // correctif vaut pour l'avenir, pas pour l'existant.
    const revoqueLe = new Map(
      patients
        .filter(p => p.sessionsInvalidesAvant)
        .map(p => [p.idPatient, p.sessionsInvalidesAvant!.getTime()]),
    );
    const premiereConnexion = new Map<string, Date>();
    for (const l of liensConsommes) {
      if (!l.consommeLe || premiereConnexion.has(l.idPatient)) continue;
      if (l.consommeLe.getTime() === revoqueLe.get(l.idPatient)) continue;
      premiereConnexion.set(l.idPatient, l.consommeLe);
    }
    for (const g of connexionsGoogle) {
      if (!g.idPatient) continue;
      const connu = premiereConnexion.get(g.idPatient);
      if (!connu || g.creeLe < connu) premiereConnexion.set(g.idPatient, g.creeLe);
    }
    const idsValides = new Set(validees.map(c => c.idPatient));
    const nbAssignations = new Map(assignations.map(a => [a.idPatient, a._count._all]));

    const lignes = lignesNouveauxPatients(
      patients.map(p => ({
        idPatient: p.idPatient,
        patient: `${p.prenom} ${p.nom}`.trim(),
        creeLe: p.createdAt.toISOString(),
        dossierDesactive: !p.actif,
        accesRevoque: p.accessTokenRevoked,
        accesEnvoyeLe: dernierEnvoi.get(p.idPatient)?.toISOString() ?? null,
        accesEnEchec: dernierStatut.has(p.idPatient) && dernierStatut.get(p.idPatient) !== 'Envoye',
        connecteLe: premiereConnexion.get(p.idPatient)?.toISOString() ?? null,
        onboardingValide: idsValides.has(p.idPatient),
        nbAssignations: nbAssignations.get(p.idPatient) ?? 0,
      })),
    );
    return NextResponse.json({ ok: true, lignes, fenetreJours: FENETRE_JOURS });
  } catch (err) {
    console.error('[nouveaux-patients GET]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ...INDISPONIBLE, error: 'Erreur technique.' }, { status: 500 });
  }
}
