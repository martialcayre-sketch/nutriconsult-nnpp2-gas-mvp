import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { masquerChemin } from './masquageChemin';

// LE BANC QUI EMPÊCHE LA LISTE DE SE PÉRIMER.
//
// `masquageChemin.ts` tient une liste d'autorisation écrite à la main. Elle
// échoue du bon côté — une route inconnue est réduite, jamais rendue telle
// quelle — mais elle rend le diagnostic aveugle sur les pages qu'elle oublie.
// Elle en oubliait déjà QUATRE le jour de son écriture (`/portail/:idPatient`
// suivi de `bilan`, `ce-qui-compte`, `comprehension`, `dossier`), et personne
// ne l'aurait su : le repli fermé ne rougit pas, il se tait.
//
// Ce banc parcourt l'arborescence réelle de l'App Router et exige un gabarit
// pour chaque route servie. Il rougit à la PROCHAINE route ajoutée, pas six
// mois plus tard.

const RACINE_APP = path.resolve(__dirname, '../../app');

/** Une valeur plausible pour un segment dynamique — jamais une identité réelle. */
const VALEUR = 'cmf3k2p9x0000zz8h7q2v1abc';

function collecterRoutes(repertoire: string, prefixe = ''): string[] {
  const routes: string[] = [];
  for (const entree of fs.readdirSync(repertoire, { withFileTypes: true })) {
    if (entree.isDirectory()) {
      // Les groupes de routes `(nom)` ne paraissent pas dans l'URL.
      const segment = /^\(.*\)$/.test(entree.name) ? '' : `/${entree.name}`;
      routes.push(...collecterRoutes(path.join(repertoire, entree.name), prefixe + segment));
    } else if (entree.name === 'page.tsx' || entree.name === 'route.ts') {
      routes.push(prefixe === '' ? '/' : prefixe);
    }
  }
  return routes;
}

/** `/portail/[token]/bilan` → `/portail/<valeur>/bilan`, tel qu'un navigateur l'émet. */
function peupler(gabaritFichier: string): string {
  return gabaritFichier
    .split('/')
    .map(segment => (segment.startsWith('[') ? VALEUR : segment))
    .join('/');
}

const routesDuDisque = collecterRoutes(RACINE_APP).sort();

describe("la liste d'autorisation couvre l'App Router réel", () => {
  it('trouve les routes sur le disque — sinon ce banc ne prouverait rien', () => {
    expect(routesDuDisque.length).toBeGreaterThan(20);
    expect(routesDuDisque).toContain('/portail/[token]/bilan');
  });

  it.each(routesDuDisque)('%s a un gabarit, pas un repli', route => {
    const masque = masquerChemin(peupler(route));
    expect(
      masque.endsWith('/…'),
      `« ${route} » tombe dans le repli fermé (${masque}). Ajouter son gabarit à ROUTES dans masquageChemin.ts.`,
    ).toBe(false);
    // Et, quoi qu'il arrive, la valeur ne sort pas.
    expect(masque).not.toContain(VALEUR);
  });
});
