import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

// Le CÂBLAGE du drapeau, et lui seul.
//
// `AgendaAliFeatureProvider` est le seul endroit d'où la position de
// `WN_AGENDA_ALI` atteint la bannière « recueil fermé » du panneau praticien
// (D-028). Les tests du panneau montent le provider à la main : ils prouvent le
// rendu, jamais le fil. Sans ce fichier, supprimer le provider ou figer
// `enabled` à une constante passerait toutes les suites — et le panneau
// n'affirmerait plus rien (contexte à `null`, cf. `AgendaAliFeatureProvider`),
// en silence.
//
// ── CE QUE CE TEST NE PEUT PAS ATTRAPER, ET POURQUOI ────────────────────────
// Pas le nom de la variable d'environnement. `isAgendaAlimentaireEnabled` est
// déclarée `(value = process.env.WN_AGENDA_ALI)` : un argument `undefined`
// — ce que rend `process.env.WN_AGENDA_XXX` après une faute de frappe —
// DÉCLENCHE le paramètre par défaut, qui relit la bonne variable. Vérifié par
// mutation : le nom fauté au point de montage rend exactement le même verdict.
// L'argument explicite y est donc décoratif, et un test qui prétendrait le
// couvrir mentirait. Ce qui reste testable, et qui casse pour de vrai, c'est
// que la page monte le provider ET l'alimente depuis cette fonction plutôt
// qu'avec une valeur en dur — c'est ce qui suit.
vi.mock('@/lib/agenda-alimentaire/featureFlag', () => ({
  isAgendaAlimentaireEnabled: vi.fn(() => false),
}));

import FichePatientPage from './page';
import { AgendaAliFeatureProvider } from '@/components/agenda-alimentaire/AgendaAliFeatureProvider';
import { isAgendaAlimentaireEnabled } from '@/lib/agenda-alimentaire/featureFlag';

// On n'appelle PAS `render` : la page est un composant serveur, son arbre
// suffit. Le marcher évite de monter `FichePatientPanel`, composant client
// avec ses propres appels réseau.
function trouverProvider(node: unknown): ReactElement | null {
  if (!node || typeof node !== 'object') return null;
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === AgendaAliFeatureProvider) return el;
  const enfants = el.props?.children;
  if (Array.isArray(enfants)) {
    for (const enfant of enfants) {
      const trouve = trouverProvider(enfant);
      if (trouve) return trouve;
    }
    return null;
  }
  return trouverProvider(enfants);
}

// La page est asynchrone depuis Next 15 (`params` et `searchParams` sont des
// promesses) : l'appeler sans l'attendre rendrait une promesse, et l'arbre
// serait introuvable — l'échec accuserait alors le câblage du drapeau.
async function enabledDuProvider() {
  const arbre = await FichePatientPage({
    params: Promise.resolve({ idPatient: 'PAT_1' }),
    searchParams: Promise.resolve({}),
  });
  const provider = trouverProvider(arbre);
  expect(provider, 'le provider de l’agenda alimentaire doit envelopper la fiche').not.toBeNull();
  return (provider?.props as { enabled?: unknown }).enabled;
}

const drapeau = vi.mocked(isAgendaAlimentaireEnabled);

beforeEach(() => {
  drapeau.mockReset();
});

describe('câblage de WN_AGENDA_ALI jusqu’au panneau agenda alimentaire', () => {
  it('monte le provider autour de la fiche', async () => {
    drapeau.mockReturnValue(true);
    expect(await enabledDuProvider()).toBe(true);
  });

  it('transporte `false` quand le drapeau est éteint', async () => {
    drapeau.mockReturnValue(false);
    expect(await enabledDuProvider()).toBe(false);
  });

  it('lit réellement le drapeau à chaque rendu, jamais une constante', async () => {
    drapeau.mockReturnValue(true);
    await enabledDuProvider();
    expect(drapeau).toHaveBeenCalled();
  });
});
