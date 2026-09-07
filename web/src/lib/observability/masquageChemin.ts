// MASQUAGE DES CHEMINS D'URL AVANT ENVOI À UN TIERS.
//
// Ce module existe pour une raison précise : dans cette application, le CHEMIN
// d'une URL porte des identifiants, et parfois un credential vivant.
//
//   /portail/<idPatient>                     — identifiant de patient
//   /dashboard/patients/<idPatient>          — identifiant de patient
//   /portail/lien/<jeton>                    — LE LIEN MAGIQUE LUI-MÊME
//
// Le dernier est le plus grave : un jeton de lien magique déposé dans un
// événement d'observabilité donne l'entrée du portail à qui lit cet
// événement. Ce n'est pas une fuite de donnée, c'est une prise de compte.
//
// Couper la query string ne suffit donc pas — c'est ce que faisait le
// `beforeSend` avant ce module, et ce que son test vérifiait en cherchant la
// chaîne de caractères `split('?')[0]` dans le fichier source.
//
// PRINCIPE : LISTE D'AUTORISATION, JAMAIS LISTE D'INTERDICTION. Une liste des
// segments « sensibles » serait fausse le jour où quelqu'un ajoute une route,
// et personne ne s'en apercevrait — le défaut d'une liste d'interdiction est
// qu'elle échoue en silence, du bon côté pour le développeur et du mauvais
// pour le patient. Ici, un chemin qui ne reconnaît AUCUNE route déclarée est
// réduit à sa racine. Le diagnostic se dégrade, la donnée ne sort pas.

/**
 * Les routes de l'application. Un segment préfixé de `:` est dynamique — son
 * NOM est conservé, sa VALEUR ne l'est jamais. `:...nom` absorbe tous les
 * segments restants.
 *
 * Recensé le 2026-09-07, et SURVEILLÉ : `masquageChemin.routes.test.ts` parcourt
 * `web/src/app` et rougit dès qu'une page y apparaît sans gabarit ici. Sans ce
 * banc, la liste se serait périmée à la première route ajoutée — quatre pages
 * du portail y manquaient déjà le jour de son écriture.
 *
 * Une route absente n'est pas une faille — le repli fermé la réduit — mais elle
 * rend le diagnostic aveugle sur une page réelle, et c'est ce que le banc évite.
 */
const ROUTES: readonly string[] = [
  // Portail patient — tout ce qui suit `/portail/` hors segments réservés est
  // un idPatient (`portail/lien/[jeton]/route.ts:168` y redirige).
  '/portail/lien/indisponible',
  '/portail/lien/:jeton',
  '/portail/connexion',
  '/portail/google/retour',
  '/portail/:idPatient',
  '/portail/:idPatient/alimentation',
  '/portail/:idPatient/alimentation/boussole/:foodRef',
  '/portail/:idPatient/bilan',
  '/portail/:idPatient/ce-qui-compte',
  '/portail/:idPatient/comprehension',
  '/portail/:idPatient/dossier',
  '/portail/:idPatient/informations',
  '/portail/:idPatient/questionnaires',
  '/portail/:idPatient/questionnaires/:idAssignation',
  '/portail/:idPatient/suivi',
  // Dashboard praticien.
  '/dashboard',
  '/dashboard/patients/:idPatient',
  '/dashboard/:...section',
  // API.
  '/api/auth/:...action',
  '/api/dev/:...action',
  '/api/portail/boussole/:foodRef',
  '/api/portail/:...action',
  '/api/praticien/:...action',
  '/api/patient/:...action',
  '/api/internal/:...action',
  // Racines statiques.
  '/',
  '/login',
  '/patient/:...reste',
  // Vitrines de développement, hors production — masquées comme le reste :
  // les distinguer coûterait une exception, et une exception se périme.
  '/dev/:...reste',
]

const ROUTES_SEGMENTEES = ROUTES.map(route => ({
  gabarit: route,
  segments: route.split('/').filter(Boolean),
}))

/** Un segment de gabarit reconnaît-il un segment de chemin réel ? */
function reconnait(segmentGabarit: string, segmentReel: string): boolean {
  if (segmentGabarit.startsWith(':')) return segmentReel.length > 0;
  return segmentGabarit === segmentReel;
}

/**
 * Rend le gabarit du chemin, valeurs remplacées par des noms de paramètres.
 * `/portail/pat_42/questionnaires/ass_7` → `/portail/:idPatient/questionnaires/:idAssignation`
 *
 * Un chemin non reconnu est réduit à sa racine — `/inconnu/abc` → `/inconnu/…` —
 * et un chemin dont même la racine est inconnue rend `/…`. Le masquage se
 * trompe donc toujours du côté du silence.
 */
export function masquerChemin(chemin: string): string {
  const segments = chemin.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  for (const route of ROUTES_SEGMENTEES) {
    const gabarit = route.segments;
    const dernier = gabarit[gabarit.length - 1];
    const attrapeTout = typeof dernier === 'string' && dernier.startsWith(':...');

    if (attrapeTout) {
      // `:...action` absorbe un segment OU PLUS : un `/api/praticien` nu ne
      // doit pas se faire passer pour `/api/praticien/patients`.
      if (segments.length < gabarit.length) continue;
    } else if (segments.length !== gabarit.length) {
      continue;
    }

    const fixes = attrapeTout ? gabarit.length - 1 : gabarit.length;
    let concorde = true;
    for (let i = 0; i < fixes; i += 1) {
      if (!reconnait(gabarit[i], segments[i])) {
        concorde = false;
        break;
      }
    }
    if (concorde) return `/${gabarit.join('/')}`;
  }

  // Repli fermé. La racine n'est conservée que si elle est elle-même un
  // littéral déclaré : sans cette condition, `/pat_42` sortirait tel quel.
  const racinesConnues = new Set(
    ROUTES_SEGMENTEES.map(r => r.segments[0]).filter(
      (s): s is string => typeof s === 'string' && !s.startsWith(':'),
    ),
  );
  const racine = segments[0];
  return racinesConnues.has(racine) ? `/${racine}/…` : '/…';
}

/**
 * Masque une URL entière : origine conservée, chemin masqué, **query string et
 * fragment supprimés sans condition**. Une URL illisible rend `null` — mieux
 * vaut perdre le champ que laisser passer ce qu'on n'a pas su analyser.
 */
export function masquerUrl(url: string): string | null {
  try {
    const analysee = new URL(url, 'https://placeholder.invalid');
    const chemin = masquerChemin(analysee.pathname);
    // L'URL relative reçue sans origine ne doit pas repartir avec la nôtre.
    if (analysee.origin === 'https://placeholder.invalid') return chemin;
    return `${analysee.origin}${chemin}`;
  } catch {
    return null;
  }
}

/**
 * Masque un nom de transaction Sentry (« GET /portail/pat_42 »). Le verbe est
 * conservé, le chemin masqué. Sans verbe reconnaissable, la valeur entière est
 * traitée comme un chemin.
 */
export function masquerTransaction(transaction: string): string {
  const separe = transaction.match(/^([A-Z]+)\s+(\/.*)$/);
  if (separe) return `${separe[1]} ${masquerChemin(separe[2])}`;
  if (transaction.startsWith('/')) return masquerChemin(transaction);
  return transaction;
}
