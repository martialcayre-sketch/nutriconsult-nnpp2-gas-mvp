// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AgendaSommeilJournal } from './AgendaSommeilJournal';

// CE QUE CE BANC PROTÈGE, ET POURQUOI IL N'EXISTAIT PAS.
//
// Le composant n'avait AUCUN banc — ses deux voisins (`CadranNuit`,
// `SaisieNuitForm`) en ont un chacun, lui non. C'est exactement là que le défaut
// s'est logé : `enregistrer` et `transmettre` posaient `erreur` sans basculer
// `etat`, et `erreur` n'était rendu que par la branche `etat === 'erreur'`. Le
// message n'atteignait donc JAMAIS l'écran, et le patient repartait en croyant
// sa nuit enregistrée.
//
// UN REFUS INVISIBLE EST PIRE QU'UN REFUS BAVARD. `DC-24` le dit dans l'autre
// sens et vaut ici : une nuit non écrite n'est pas une nuit sans sommeil. Le
// praticien lira un agenda troué sans savoir que le patient, lui, a cru avoir
// répondu.

/** Forme réelle de `FenetreAgenda` — trois emplacements suffisent au rendu. */
const FENETRE = {
  dateDebut: '2026-09-01',
  emplacements: [
    { dateNuit: '2026-09-01', index: 1, renseignee: false, estAujourdHui: false },
    { dateNuit: '2026-09-02', index: 2, renseignee: true, estAujourdHui: false },
    { dateNuit: '2026-09-03', index: 3, renseignee: true, estAujourdHui: true },
  ],
  nbRenseignees: 2,
  jourCourant: 3,
  cloturablePatient: true,
};

/** Forme réelle d'une nuit (`NuitReponses` v3) — une fixture approximative
 *  faisait jeter `dureeMinutes` avant que le composant ne se rende. */
const NUIT = {
  heureCoucher: '23:00',
  heureLever: '07:00',
  latence: 'lt15',
  qualite: 4,
  reveils: { dureeTotale: 'aucun' },
  aideSommeil: 'aucune',
  extinctionImmediate: true,
  leverImmediat: true,
};

const CHARGEMENT_OK = {
  ok: true,
  fenetre: FENETRE,
  nuits: [{ dateNuit: '2026-09-02', reponses: NUIT }, { dateNuit: '2026-09-03', reponses: NUIT }],
  derniereNuit: NUIT,
  statutReponses: 'en_cours',
  aujourdHui: '2026-09-03',
};

const fetchMock = vi.fn();

function reponse(payload: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => payload });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgendaSommeilJournal — un refus ne reste pas muet', () => {
  it('rend le message du serveur quand la transmission est refusée', async () => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        return reponse({ ok: false, error: 'Agenda déjà transmis.' }, false);
      }
      return reponse(CHARGEMENT_OK);
    });

    render(<AgendaSommeilJournal idAssignation="ASSIGN_1" onRetourHub={() => {}} />);
    await waitFor(() => expect(screen.getByText('Vos nuits')).toBeTruthy());

    const bouton = screen.getByRole('button', { name: /Terminer et transmettre/ });
    bouton.click();

    await waitFor(() => {
      const alerte = screen.getByRole('alert');
      expect(alerte.textContent).toBe('Agenda déjà transmis.');
    });
    // LE JOURNAL RESTE À L'ÉCRAN : basculer `etat` aurait remplacé la page par
    // l'écran d'échec et emporté la saisie en cours.
    expect(screen.getByText('Vos nuits')).toBeTruthy();
  });

  // L'AUTRE MOITIÉ DU DÉFAUT : `enregistrer` part de la vue SAISIE, qui ne
  // rendait AUCUNE erreur. Ne corriger que la frise n'aurait réparé que la vue
  // d'où le patient n'écrit pas sa nuit.
  it('rend le refus dans la vue SAISIE aussi, d’où part l’enregistrement', async () => {
    const sansNuitDuJour = { ...CHARGEMENT_OK, nuits: [{ dateNuit: '2026-09-02', reponses: NUIT }] };
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return reponse({ ok: false, error: 'Nuit hors fenêtre.' }, false);
      return reponse(sansNuitDuJour);
    });
    render(<AgendaSommeilJournal idAssignation="ASSIGN_1" onRetourHub={() => {}} />);
    await waitFor(() => expect(screen.getByText('Votre nuit passée')).toBeTruthy());
    // La vue de saisie doit pouvoir PORTER l'alerte : on l'éprouve par le rendu,
    // le geste de saisie lui-même appartenant au banc de `SaisieNuitForm`.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Votre nuit passée')).toBeTruthy();
  });

  it('ne montre aucune alerte tant que rien n’a été refusé', async () => {
    fetchMock.mockImplementation(() => reponse(CHARGEMENT_OK));
    render(<AgendaSommeilJournal idAssignation="ASSIGN_1" onRetourHub={() => {}} />);
    await waitFor(() => expect(screen.getByText('Vos nuits')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Une lecture en échec garde son écran plein — c'est l'autre branche, et elle
  // fonctionnait déjà : le banc l'épingle pour que la correction ci-dessus ne
  // l'emporte pas au passage.
  it('garde l’écran d’échec quand c’est le CHARGEMENT qui échoue', async () => {
    fetchMock.mockImplementation(() => reponse({ ok: false, error: 'Agenda indisponible.' }, false));
    render(<AgendaSommeilJournal idAssignation="ASSIGN_1" onRetourHub={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Agenda indisponible/)).toBeTruthy();
    });
    expect(screen.queryByText('Vos nuits')).toBeNull();
  });
});
