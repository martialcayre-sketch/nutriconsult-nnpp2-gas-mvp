// LA RÉGION DE SENTRY N'EST PAS UNE OPTION DE CONFIGURATION, C'EST UNE
// PROMESSE FAITE AU PATIENT.
//
// Le document d'information « Vos données personnelles et leur confidentialité »
// nomme chaque prestataire et dit où il traite. Pour Sentry, cette phrase ne
// pouvait pas s'écrire : la région dépend du DSN qu'on pose, et un DSN se pose
// dans une console d'hébergeur, loin de toute revue de code. Une affirmation
// invérifiable dans un document normatif est exactement ce que `D-137` a puni.
//
// Ce module renverse le problème : le code REFUSE tout DSN hors région
// européenne. La phrase du document devient alors vraie par construction, et
// vérifiable par un banc plutôt que par une déclaration.
//
// Sentry sert la région européenne sur `o<org>.ingest.de.sentry.io` ; la région
// américaine sur `.ingest.us.sentry.io` ou `.ingest.sentry.io`. Le suffixe est
// donc discriminant, et c'est le seul élément du DSN qui le soit.

/** Suffixe d'hôte de la région européenne de Sentry. */
export const SUFFIXE_HOTE_UE = '.ingest.de.sentry.io';

/**
 * Rend le DSN s'il désigne la région européenne, `null` sinon — y compris pour
 * une valeur absente, vide ou illisible.
 *
 * FERMÉ PAR DÉFAUT : tout ce qui n'est pas reconnu comme européen est refusé.
 * Un DSN américain posé par erreur n'ouvre donc pas un transfert hors UE ; il
 * laisse l'observabilité éteinte, ce qui se voit, plutôt qu'un transfert
 * silencieux, qui ne se voit pas.
 */
export function dsnRegionUe(dsn: string | undefined | null): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).hostname.endsWith(SUFFIXE_HOTE_UE) ? dsn : null;
  } catch {
    return null;
  }
}
