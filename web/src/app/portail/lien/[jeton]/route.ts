import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isG4LienMagiqueEnabled } from '@/lib/portail/featureFlag';
import { empreinteJeton, etatLien } from '@/lib/portail/lienMagique';
import { urlPubliquePortail } from '@/lib/portail/urlPublique';
import { PORTAIL_COOKIE_NAME, PORTAIL_COOKIE_OPTIONS, signPatientSession } from '@/lib/patient-session';
import { logger } from '@/lib/observability/logger';
import { EVENT_CODES } from '@/lib/observability/eventCodes';
import { createRequestContext, finalizeLogContext } from '@/lib/observability/requestContext';
import type { RequestContext } from '@/lib/observability/types';

// GET /portail/lien/[jeton] — entrée par lien magique (gate G4).
//
// Un Route Handler et non une page : en App Router, un composant serveur ne
// peut pas poser de cookie. Celui-ci valide, consomme, ouvre la session, puis
// redirige vers l'espace patient existant.
//
// LE JETON NE SORT PAS DE CETTE FONCTION. Il n'est ni stocké, ni journalisé, ni
// transmis : seule son empreinte sert à retrouver la ligne.
//
// Après consommation, le patient atterrit sur `/portail/<idPatient>` — segment
// de routage non secret (LOT-04) — l'espace d'aujourd'hui, qui décide seul de
// l'étape à afficher (consentement, fiche, anamnèse, hub) d'après le cookie.

export const dynamic = 'force-dynamic';

/**
 * Route journalisée, écrite en dur.
 *
 * `createRequestContext` remplit `route` avec `sanitizeUrl(req.url)`, qui
 * conserve le chemin — et le chemin, ici, EST le jeton. Laisser faire écrirait
 * un secret d'accès dans les logs à chaque tentative. On journalise donc le
 * gabarit, jamais l'URL réelle.
 */
const ROUTE_JOURNALISEE = '/portail/lien/[jeton]';

function contexteSansJeton(req: Request): RequestContext {
  return { ...createRequestContext(req), route: ROUTE_JOURNALISEE };
}

/**
 * Le seul atterrissage possible en cas de refus. Consommé, expiré, inconnu,
 * portail révoqué : même destination, même code HTTP, même message. Rien à
 * apprendre en sondant.
 */
function refuser(req: Request): NextResponse {
  return NextResponse.redirect(urlPubliquePortail('/portail/lien/indisponible', req.url));
}

export async function GET(
  req: Request,
  { params }: { params: { jeton: string } },
): Promise<NextResponse> {
  // Drapeau éteint : la route n'existe pas. C'est ce qui rend le NO-GO réel —
  // merger la migration n'active rien.
  if (!isG4LienMagiqueEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const contexte = contexteSansJeton(req);
  const refuse = (motif: string, statusCode = 302) => {
    logger.security({
      event: EVENT_CODES.PORTAIL_LIEN_REJEU_REFUSE,
      domain: 'SECURITY',
      message: `Lien magique refusé (${motif})`,
      context: finalizeLogContext(contexte, { statusCode, retryable: false }),
    });
    return refuser(req);
  };

  const jeton = (params.jeton ?? '').trim();
  if (!jeton) return refuse('jeton_absent');

  try {
    const lien = await prisma.portailMagicLink.findUnique({
      where: { jetonEmpreinte: empreinteJeton(jeton) },
      select: { id: true, idPatient: true, expireLe: true, consommeLe: true },
    });

    const maintenant = new Date();

    // Empreinte inconnue : aucune ligne à incrémenter, mais l'événement est tracé.
    if (!lien) return refuse('inconnu');

    const etat = etatLien(lien, maintenant);
    if (etat !== 'valide') {
      // Trace durable, en base : un log Vercel est purgé, et une trace purgée
      // ne prouve plus rien le jour où on la cherche.
      await prisma.portailMagicLink.update({
        where: { id: lien.id },
        data: { rejeuxRefuses: { increment: 1 }, derniereTentative: maintenant },
      });
      return refuse(etat);
    }

    // GARDER AVANT DE CONSOMMER. Le patient doit toujours être actif et son
    // portail non révoqué — garde portée par `ensureActivePortalAccess` avant
    // le LOT-04, réécrite ici explicitement : sans elle, une révocation
    // cesserait silencieusement de bloquer l'entrée (invariant révocation).
    //
    // ELLE VIVAIT APRÈS LA CONSOMMATION, ET C'ÉTAIT UN DÉFAUT. Un compte fermé
    // voyait son lien BRÛLÉ au clic, puis refusé : le lien était perdu, le
    // patient n'entrait jamais, et la ligne restait avec `consommeLe`
    // renseigné et `rejeuxRefuses` à zéro — la forme exacte d'une entrée
    // réussie pour qui lit cette colonne. Relevé par la revue adversariale de
    // la PR #889 (voir `api/praticien/nouveaux-patients/route.ts`).
    const patient = await prisma.patient.findUnique({
      where: { idPatient: lien.idPatient },
      select: { email: true, actif: true, accessTokenRevoked: true },
    });
    if (!patient || !patient.actif || patient.accessTokenRevoked) {
      // Le refus se trace en base comme celui d'`etatLien` ci-dessus : sans
      // cette écriture, un jeton martelé sur un compte fermé ne laisserait plus
      // que le log applicatif, qui est purgé.
      await prisma.portailMagicLink.update({
        where: { id: lien.id },
        data: { rejeuxRefuses: { increment: 1 }, derniereTentative: maintenant },
      });
      return refuse('acces_indisponible');
    }

    // Consommation ATOMIQUE, et DERNIER geste de la route : `updateMany` filtré
    // fait de la vérification et de l'écriture une seule opération. Deux
    // requêtes concurrentes sur le même lien : une seule voit `count === 1`,
    // l'autre est refusée. Remonter la garde au-dessus ne déplace pas ce
    // contrôle de concurrence — le prédicat est réévalué sous le verrou de
    // ligne, ici et nulle part ailleurs.
    //
    // `expireLe` EST DANS LE PRÉDICAT, EN COMPARE-AND-SWAP. La garde de compte
    // ci-dessus lit un instantané : si une fermeture praticien commite entre
    // cette lecture et ici, elle a déjà ramené `expireLe` (révocation `D-127`,
    // désactivation `D-126`) mais un filtre limité à `consommeLe: null`
    // matcherait encore. Le lien serait BRÛLÉ sans que le patient entre, et la
    // ligne prendrait la forme exacte d'une entrée réussie — le défaut même que
    // `D-126` existe pour supprimer, reparu par la course.
    //
    // ON COMPARE `expireLe` À LA VALEUR LUE, PAS À UNE HORLOGE. Une horloge ne
    // ferme pas cette course, et `D-126` l'a d'abord cru : un `{ gt: new Date() }`
    // est évalué en JavaScript à la CONSTRUCTION de la requête, donc avant
    // l'attente du verrou de ligne ; la fermeture concurrente commite ensuite,
    // à un instant POSTÉRIEUR, et son nouvel horizon satisfait encore le
    // prédicat. Côté SQL, `now()` ne vaut pas mieux : Postgres le fige au début
    // de la transaction, elle aussi antérieure à l'attente.
    //
    // La valeur lue, elle, ne dépend d'aucune horloge : toute fermeture DÉPLACE
    // `expireLe`, donc la constante ne correspond plus. Postgres réévalue le
    // prédicat sur la version verrouillée de la ligne — c'est exactement ce que
    // ce mécanisme garantit pour une constante. Le lien n'a pas expiré au sens
    // du temps : `etatLien` l'a déjà vérifié plus haut sur ces mêmes valeurs.
    // Ce qu'on vérifie ici est autre chose — que RIEN n'a bougé depuis.
    const consommation = await prisma.portailMagicLink.updateMany({
      where: { id: lien.id, consommeLe: null, expireLe: lien.expireLe },
      data: { consommeLe: maintenant },
    });
    if (consommation.count !== 1) return refuse('concurrence');

    logger.security({
      event: EVENT_CODES.PORTAIL_LIEN_CONSOMME,
      domain: 'SECURITY',
      message: 'Lien magique consommé, session portail ouverte',
      context: finalizeLogContext(contexte, { statusCode: 302, retryable: false }),
    });

    // Depuis le LOT-04, le portail n'est plus indexé par un jeton secret : le
    // segment d'URL porte l'idPatient (non secret), et l'accès repose sur le
    // cookie de session posé ci-dessous. La révocation reste effective (garde
    // ci-dessus + `sessionsInvalidesAvant`, posé à la révocation).
    const res = NextResponse.redirect(urlPubliquePortail(`/portail/${lien.idPatient}`, req.url));
    res.cookies.set(
      PORTAIL_COOKIE_NAME,
      signPatientSession({
        idPatient: lien.idPatient,
        email: patient.email,
      }),
      PORTAIL_COOKIE_OPTIONS,
    );
    return res;
  } catch (err) {
    logger.error({
      event: EVENT_CODES.PORTAIL_SESSION_EXCEPTION,
      domain: 'PORTAIL_PATIENT',
      message: 'Échec de consommation d’un lien magique',
      context: finalizeLogContext(contexte, { statusCode: 302, retryable: true }),
      error: err,
    });
    return refuser(req);
  }
}
