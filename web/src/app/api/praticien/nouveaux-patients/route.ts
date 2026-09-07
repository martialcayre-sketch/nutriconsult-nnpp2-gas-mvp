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
    // Les tentatives refusées s'agrègent HORS dossiers désactivés et révoqués.
    //
    // CE FILTRE EST UNE CEINTURE SUR DES BRETELLES, ET IL FAUT LE SAVOIR :
    // `etapeNouveauPatient` retourne `dossier_desactive` et `acces_revoque`
    // AVANT de regarder `entreeRefusee`, donc un dossier fermé n'affiche déjà
    // jamais « Entrée refusée ». Ce que le filtre ajoute est ailleurs : il
    // garde le DTO honnête — `entreeRefusee` ne vaut `true` que sur un dossier
    // qu'on peut encore débloquer — et il borne la requête. Retirer l'un des
    // deux ne casse rien de visible : ne retirer NI l'un NI l'autre.
    //
    // AUCUNE FERMETURE PRATICIEN N'ÉCRIT `rejeux_refuses`. Les deux gestes
    // ramènent `expireLe` (`D-126`, `D-128`) ; c'est la présentation suivante
    // du lien qui se fait refuser. Le compteur n'est donc pas pollué — c'est le
    // refus qui n'est pas actionnable tant que la porte est fermée.
    //
    // IL PORTE SUR L'ÉTAT COURANT, PAS SUR CELUI DU JOUR DE LA TENTATIVE. Un
    // dossier révoqué puis ROUVERT ressort avec ses refus d'alors — et c'est ce
    // qu'il faut : la porte est rouverte, personne n'est entré, le lien d'alors
    // est mort.
    const idsOuverts = patients.filter(p => p.actif && !p.accessTokenRevoked).map(p => p.idPatient);

    // Six lectures bornées par les identifiants du lot, jamais une par patient.
    const [correspondances, liensConsommes, connexionsGoogle, validees, assignations, liensRefuses] =
      await Promise.all([
        // LES DEUX E-MAILS QUI OUVRENT LE DOSSIER, pas un seul. `acces_portail`
        // pointe la page de connexion (`sendPortailLinkEmail` — création de
        // consultation, et « Renvoyer l'accès ») ; `lien_magique` porte un lien
        // à usage unique (`sendMagicLinkEmail` — action `lien_magique` de
        // `api/praticien/token`, et redemande patient `api/portail/lien/demande`).
        //
        // NE COMPTER QUE LE PREMIER FAISAIT AFFICHER « Accès non envoyé » À DES
        // DOSSIERS DÉJÀ ENTRÉS : l'entrée suit le lien magique bien plus souvent
        // que l'accès portail. Le relevé chiffré et sa date vivent au fragment de
        // changelog, pas ici — un nombre dans un commentaire ne se vérifie pas.
        //
        // LES DRAPEAUX. `sendMagicLinkEmail` n'est appelé que sous
        // `WN_G4_LIEN_MAGIQUE` (et `WN_G4_REDEMANDE_PATIENT` pour le canal
        // public), tous deux RELUS POSÉS sur Scalingo le 2026-09-07
        // (`docs/FEATURE_FLAGS.md`). L'élargissement ne rend de toute façon rien
        // de plus si personne n'écrit : il ne dépend pas de leur état.
        //
        // Les booklets, packs et accusés partent APRÈS et restent hors du
        // filtre : ils ne prouvent rien de l'ouverture de l'accès.
        prisma.correspondancePatient.findMany({
          where: { idPatient: { in: ids }, type: { in: ['acces_portail', 'lien_magique'] } },
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
        // Groupé par STATUT en plus du patient : la même lecture rend le total
        // (pack assigné) et la part rendue (`Complété`). Une seconde requête
        // aurait posé une lecture de plus pour un compte que celle-ci porte.
        prisma.assignation.groupBy({
          by: ['idPatient', 'statut'],
          where: { idPatient: { in: ids } },
          _count: { _all: true },
        }),
        // TENTATIVES REFUSÉES (M07). `rejeuxRefuses` n'est incrémenté que par
        // l'atterrissage (`portail/lien/[jeton]`) : lien expiré, lien déjà
        // consommé, lien fermé par une fermeture praticien, compte fermé.
        //
        // `groupBy` ET NON `findMany`, POUR DEUX RAISONS. La PRÉSENCE suffit —
        // le compte exact ne s'affiche nulle part, `_count` n'est demandé que
        // pour coller à l'idiome éprouvé ci-dessus. Et surtout, le banc
        // `'ne lit que les liens magiques CONSOMMÉS…'` assère
        // `portailMagicLink.findMany.mock.calls[0][0]` : une seconde lecture
        // par `findMany` partagerait ce mock, glisserait `calls[0]` et rendrait
        // plusieurs bancs existants faux.
        //
        // PAS DE VERSANT GOOGLE : le seul refus Google qui nomme un dossier est
        // écrit sous la garde `!actif || accessTokenRevoked`. Croisé avec
        // `idsOuverts`, il ne ramènerait que des refus périmés. Voir le champ
        // `entreeRefusee` de `SourceNouveauPatient`.
        prisma.portailMagicLink.groupBy({
          by: ['idPatient'],
          where: { idPatient: { in: idsOuverts }, rejeuxRefuses: { gt: 0 } },
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
    // UNE DATE DE CONSOMMATION EST UNE ENTRÉE — DEPUIS `D-128`, ET PAS AVANT.
    // Les deux fermetures praticien passent maintenant par `expireLe` : la
    // désactivation depuis `D-126`, la révocation depuis `D-128`. Plus aucun
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
    // la table des liens ». C'était faux, et `D-128` le montre : il ne fallait
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
    // Un patient rend désormais PLUSIEURS lignes (une par statut) : les poser
    // par affectation écraserait tout sauf la dernière.
    const nbAssignations = new Map<string, number>();
    const nbAssignationsRendues = new Map<string, number>();
    for (const a of assignations) {
      nbAssignations.set(a.idPatient, (nbAssignations.get(a.idPatient) ?? 0) + a._count._all);
      if (a.statut === 'Complété') {
        nbAssignationsRendues.set(
          a.idPatient,
          (nbAssignationsRendues.get(a.idPatient) ?? 0) + a._count._all,
        );
      }
    }
    const aEteRefuse = new Set(liensRefuses.map(l => l.idPatient));

    const lignes = lignesNouveauxPatients(
      patients.map(p => ({
        idPatient: p.idPatient,
        patient: `${p.prenom} ${p.nom}`.trim(),
        creeLe: p.createdAt.toISOString(),
        dossierDesactive: !p.actif,
        accesRevoque: p.accessTokenRevoked,
        accesEnvoyeLe: dernierEnvoi.get(p.idPatient)?.toISOString() ?? null,
        // UN ÉCHEC D'ENVOI NE PARLE QUE TANT QUE LA PORTE EST FERMÉE. Depuis que
        // `lien_magique` compte, un e-mail d'ouverture peut échouer APRÈS
        // l'entrée : la redemande patient (`api/portail/lien/demande`) est un
        // canal public, rejouable, et sert précisément les patients déjà entrés.
        //
        // Sans cette garde, un dossier entré, validé et servi rebasculait en
        // « Accès non envoyé » ET REMONTAIT EN TÊTE de l'encart :
        // `etapeNouveauPatient` teste cette porte AVANT `connecteLe`, et
        // `estEnAttente` compte `acces_non_envoye`. Cet ordre est délibéré et
        // figé par `nouveauxPatients.test.ts` (cas « un envoi en échec ne vaut
        // pas un envoi », posé sur une source COMPLÈTE) : on ne le déplace pas.
        //
        // C'est exactement le geste que ce correctif existe pour supprimer —
        // renvoyer un accès à un patient déjà servi. La garde se pose donc à la
        // SOURCE du signal, pas dans la fonction pure qui le lit.
        accesEnEchec:
          !premiereConnexion.has(p.idPatient) &&
          dernierStatut.has(p.idPatient) &&
          dernierStatut.get(p.idPatient) !== 'Envoye',
        connecteLe: premiereConnexion.get(p.idPatient)?.toISOString() ?? null,
        entreeRefusee: aEteRefuse.has(p.idPatient),
        onboardingValide: idsValides.has(p.idPatient),
        nbAssignations: nbAssignations.get(p.idPatient) ?? 0,
        nbAssignationsRendues: nbAssignationsRendues.get(p.idPatient) ?? 0,
      })),
    );
    return NextResponse.json({ ok: true, lignes, fenetreJours: FENETRE_JOURS });
  } catch (err) {
    console.error('[nouveaux-patients GET]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ...INDISPONIBLE, error: 'Erreur technique.' }, { status: 500 });
  }
}
