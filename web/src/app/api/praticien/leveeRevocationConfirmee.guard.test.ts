import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// GARDE : AUCUNE LEVÉE DE RÉVOCATION SANS ACCORD EXPLICITE.
//
// Deux routes praticien remettaient `accessTokenRevoked` à `false` EN SILENCE,
// au passage d'un geste de routine — créer une consultation, renvoyer le lien.
// Un praticien défaisait ainsi sa propre décision de sécurité sans qu'on le lui
// dise. Les deux exigent désormais `retablirAcces: true` dans le corps.
//
// POURQUOI UNE GARDE STRUCTURELLE, ET PAS SEULEMENT DES BANCS DE ROUTE. Les
// bancs tiennent les deux écrivains d'aujourd'hui. Ils ne diront rien d'un
// TROISIÈME qui naîtrait demain — et c'est exactement ainsi que le défaut
// s'était installé : la seconde levée avait été ajoutée par symétrie avec la
// première, sans que personne ne rejoue la question.
//
// LE BALAYAGE PORTE SUR `src/app/**/route.ts`, PAS SUR `src/app/api/**`. Deux
// `route.ts` du portail (`portail/lien/[jeton]`, `portail/google/retour`)
// lisent déjà ce drapeau : un écrivain qui naîtrait là échapperait à un
// balayage borné à `api/`.
//
// DEUX DÉTECTEURS, parce qu'un seul se contourne par l'orthographe :
//   D1 — le littéral `accessTokenRevoked: false` ;
//   D2 — l'écrivain de FAIT : le fichier nomme le drapeau ET appelle
//        `prisma.patient.update`/`updateMany`, quelle que soit la valeur
//        écrite (une variable, une négation, une paire coupée en deux lignes).
// D2 sur-capture volontairement : c'est la table ci-dessous qui sépare les
// lecteurs des écrivains, et toute entrée nouvelle doit y être arbitrée à la
// main plutôt que déduite.
//
// LIMITE ASSUMÉE : cette garde vérifie qu'un accord est MENTIONNÉ dans le
// fichier, pas qu'il est exigé au bon endroit. C'est le rôle des bancs de
// route (`consultations/route.test.ts`, `token/route.test.ts`), qui prouvent
// le 409, l'absence d'écriture, et la comparaison stricte à `true`.

const RACINE_WEB = path.resolve(__dirname, '../../../..');

/** Un fichier qui NOMME un motif ne l'EMPLOIE pas : les commentaires sortent. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function routesDe(racineRelative: string): string[] {
  const racine = path.join(RACINE_WEB, racineRelative);
  const trouvees: string[] = [];
  const descendre = (dossier: string) => {
    for (const entree of readdirSync(dossier)) {
      const complet = path.join(dossier, entree);
      if (statSync(complet).isDirectory()) descendre(complet);
      else if (entree === 'route.ts') trouvees.push(path.relative(RACINE_WEB, complet));
    }
  };
  descendre(racine);
  return trouvees;
}

const ROUTES = routesDe('src/app');

const litteral = (src: string) => src.includes('accessTokenRevoked: false');
const ecrivainDeFait = (src: string) =>
  src.includes('accessTokenRevoked')
  && (src.includes('prisma.patient.update') || src.includes('prisma.patient.updateMany'));

const releve = (detecteur: (src: string) => boolean) =>
  ROUTES.filter(f => detecteur(sansCommentaires(readFileSync(path.join(RACINE_WEB, f), 'utf8'))));

/**
 * Classement arbitré à la main. « écrivain » = remet le drapeau à `false` ;
 * « lecteur » = le nomme sans jamais l'écrire.
 *
 * `patients/route.ts` est entré dans D2 avec le lot qui a créé cette garde :
 * il EXPOSE désormais le drapeau au DTO (`accesRevoque`) et met à jour des
 * patients par ailleurs — deux faits vrais, aucun lien entre eux. Son `update`
 * ne porte que `actif` et la clôture ; `D-126` §2 a tranché que désactiver un
 * dossier ne pose PAS la révocation.
 */
const CLASSEMENT: Record<string, 'ecrivain' | 'lecteur'> = {
  'src/app/api/praticien/consultations/route.ts': 'ecrivain',
  'src/app/api/praticien/token/route.ts': 'ecrivain',
  'src/app/api/praticien/agenda-sommeil/suivi/route.ts': 'lecteur',
  'src/app/api/praticien/patients/route.ts': 'lecteur',
};

describe('levée de révocation : jamais sans accord explicite', () => {
  it('la table de classement n’est pas vide', () => {
    // DEUX PLANCHERS, UN PAR DÉTECTEUR. Un renommage qui viderait l'un des deux
    // rendrait la garde silencieusement inopérante — verte sur rien.
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(releve(litteral).length).toBeGreaterThanOrEqual(3);
    expect(releve(ecrivainDeFait).length).toBeGreaterThanOrEqual(3);
  });

  it('aucun fichier hors table ne touche au drapeau de révocation', () => {
    const horsTable = [...new Set([...releve(litteral), ...releve(ecrivainDeFait)])]
      .filter(f => !(f in CLASSEMENT))
      .sort();
    // Un nouveau venu n'est pas forcément fautif : il doit être ARBITRÉ, et
    // inscrit ici comme écrivain (avec son accord) ou comme lecteur.
    expect(horsTable).toEqual([]);
  });

  it('chaque écrivain garde sa levée derrière un accord explicite', () => {
    const sansAccord = Object.entries(CLASSEMENT)
      .filter(([, role]) => role === 'ecrivain')
      .map(([f]) => f)
      .filter(f => !readFileSync(path.join(RACINE_WEB, f), 'utf8').includes('retablirAcces'));
    expect(sansAccord).toEqual([]);
  });
});
