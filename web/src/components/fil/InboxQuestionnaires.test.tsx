// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxQuestionnaires } from './InboxQuestionnaires';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as unknown as Response;
}

function stubInbox(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => json(payload)));
}

describe('InboxQuestionnaires', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rend une ligne par patient — nombre, titres, ouverture en lecture', async () => {
    stubInbox({
      ok: true,
      lignes: [
        {
          idPatient: 'PAT_SEED_01',
          patient: 'Sophie Nicola',
          nb: 2,
          derniereDate: '2026-07-15T08:00:00.000Z',
          titres: ['Plaintes', 'Sommeil'],
        },
      ],
    });
    render(<InboxQuestionnaires />);
    await waitFor(() => expect(screen.getByText('Sophie Nicola')).toBeTruthy());
    expect(screen.getByText('Plaintes · Sommeil')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sophie Nicola/ })).toBeTruthy();
  });

  it('un fil vide dit ce qu’il SAIT, et n’affirme pas que tout a été vu', async () => {
    // L'ANCIEN LIBELLÉ ÉTAIT UNE AFFIRMATION FAUSSE : « tout a été vu en
    // consultation », sur la foi de `Consultation.dateValidation` — dont
    // l'unique écrivain est le geste du PATIENT au portail. Rien n'y prouvait
    // une lecture praticien.
    stubInbox({ ok: true, lignes: [] });
    render(<InboxQuestionnaires />);
    await waitFor(() => expect(screen.getByText(/Aucune réponse reçue depuis la dernière consultation/i)).toBeTruthy());
    expect(screen.queryByText(/tout a été vu/i)).toBeNull();
  });

  it('les réponses écartées par l’ancre sont comptées et pointées, repliées', async () => {
    // RIEN N'EST PERDU — la fiche patient affiche tout —, mais l'accueil
    // taisait ce silence. Il le nomme, et pointe l'écran qui montre tout.
    stubInbox({
      ok: true,
      lignes: [],
      ecartees: [
        { idPatient: 'PAT_SEED_03', patient: 'Michel Dogné', nb: 3, ancre: '2026-09-04T10:00:00.000Z' },
        { idPatient: 'PAT_SEED_01', patient: 'Sophie Nicola', nb: 1, ancre: '2026-09-02T10:00:00.000Z' },
      ],
    });
    render(<InboxQuestionnaires />);

    await waitFor(() => expect(screen.getByText(/4 réponses reçues avant la dernière consultation/i)).toBeTruthy());
    const lien = screen.getByRole('link', { name: 'Michel Dogné' });
    expect(lien.getAttribute('href')).toBe('/dashboard/patients/PAT_SEED_03');
    expect(screen.getByText(/3 avant le 04\/09\/2026/)).toBeTruthy();
  });

  it('sans écart, aucun repli ne s’affiche', async () => {
    // Le cas courant. La décision du 2026-07-23 tient : l'accueil reste une
    // liste courte, et n'ajoute rien quand il n'a rien à dire.
    stubInbox({ ok: true, lignes: [], ecartees: [] });
    render(<InboxQuestionnaires />);
    await waitFor(() => expect(screen.getByText(/Aucune réponse reçue/i)).toBeTruthy());
    expect(screen.queryByText(/avant la dernière consultation du dossier/i)).toBeNull();
  });

  it('ouvre la fenêtre de lecture et confirme les questionnaires lus', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') return json({ ok: true, lignes: [] });
      if (url.includes('idPatient=PAT_SEED_01')) {
        return json({
          ok: true,
          lignes: [],
          patient: { idPatient: 'PAT_SEED_01', nom: 'Sophie Nicola' },
          reponses: [
            {
              idReponse: 'REP001',
              idPatient: 'PAT_SEED_01',
              idAssignation: 'ASS001',
              idQuestionnaire: 'NEU_03',
              titre: 'Sommeil',
              dateSoumission: '2026-07-15T08:00:00.000Z',
              scoresParsed: { total: 7, rawAnswers: { MM1: 2 } },
              rawAnswers: { MM1: 2 },
              scorePrincipal: 7,
              interpretation: 'Vigilance',
              subScoreRanges: null,
              reponsesLisibles: [
                {
                  idQuestion: 'MM1',
                  libelleQuestion: "J'oublie des informations récentes (noms, rendez-vous, mots)",
                  libelleReponse: 'Rarement',
                  valeurBrute: '2',
                  section: 'Mémoire',
                },
              ],
            },
          ],
        });
      }
      return json({
        ok: true,
        lignes: [
          {
            idPatient: 'PAT_SEED_01',
            patient: 'Sophie Nicola',
            nb: 1,
            derniereDate: '2026-07-15T08:00:00.000Z',
            titres: ['Sommeil'],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<InboxQuestionnaires />);

    await waitFor(() => expect(screen.getByText('Sophie Nicola')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sophie Nicola/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('Sommeil');
    expect(dialog.textContent).toContain("J'oublie des informations récentes");
    expect(dialog.textContent).toContain('Rarement');
    expect(dialog.textContent).toContain('Valeur brute : 2');
    expect(dialog.textContent).toContain('Score brut : 7');

    fireEvent.click(screen.getByRole('button', { name: /Confirmer la lecture/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/praticien/inbox-questionnaires',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idPatient: 'PAT_SEED_01', idsReponses: ['REP001'] }),
        }),
      ),
    );
  });

  // Moitié « écran » du réservoir Q_SOM_07. Sans ce test, supprimer la pastille
  // et le motif laissait la suite ENTIÈREMENT verte (mesuré en revue le
  // 2026-07-27 : 2168 tests passants après la mutation) — et la passation
  // invalide redevenait indiscernable d'un questionnaire sans score.
  function stubDetail(reponse: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') return json({ ok: true, lignes: [] });
      if (url.includes('idPatient=PAT_SEED_01')) {
        return json({
          ok: true,
          lignes: [],
          patient: { idPatient: 'PAT_SEED_01', nom: 'Sophie Nicola' },
          reponses: [reponse],
        });
      }
      return json({
        ok: true,
        lignes: [{
          idPatient: 'PAT_SEED_01', patient: 'Sophie Nicola', nb: 1,
          derniereDate: '2026-07-21T08:00:00.000Z', titres: ['MFI-20'],
        }],
      });
    }));
  }

  const BASE_SOM07 = {
    idReponse: 'REP_SOM07',
    idPatient: 'PAT_SEED_01',
    idAssignation: 'ASS1',
    idQuestionnaire: 'Q_SOM_07',
    titre: 'MFI-20 — Échelle multidimensionnelle de fatigue',
    dateSoumission: '2026-07-21T08:00:00.000Z',
    // Tel que la route le sert désormais : neutralisé côté serveur.
    scoresParsed: { rawAnswers: { M1: 2 } },
    rawAnswers: { M1: 2 },
    scorePrincipal: null,
    interpretation: '',
    subScoreRanges: null,
    reponsesLisibles: [],
  };

  async function ouvrirDetail() {
    render(<InboxQuestionnaires />);
    await waitFor(() => expect(screen.getByText('Sophie Nicola')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sophie Nicola/ }));
    return screen.findByRole('dialog');
  }

  it('une passation non interprétable dit POURQUOI, et ne dit pas « sans score »', async () => {
    stubDetail({ ...BASE_SOM07, nonInterpretable: 'Motif de test : instrument non conforme à sa source.' });
    const dialog = await ouvrirDetail();
    expect(dialog.textContent).toContain('Interprétation retirée');
    expect(dialog.textContent).toContain('Motif de test : instrument non conforme à sa source.');
    // « Sans score principal » serait faux : la passation en portait un. C'est
    // la formulation exacte que ce lot remplace.
    expect(dialog.textContent).not.toContain('Sans score principal');
    expect(dialog.textContent).not.toContain('Score brut');
  });

  it('contrôle négatif — un instrument courant garde sa pastille de score', async () => {
    // Sans lui, afficher inconditionnellement « Interprétation retirée » ferait
    // passer le test ci-dessus au vert.
    stubDetail({
      ...BASE_SOM07,
      idQuestionnaire: 'NEU_03',
      titre: 'Sommeil',
      scoresParsed: { total: 7, rawAnswers: { MM1: 2 } },
      scorePrincipal: 7,
      interpretation: 'Vigilance',
      nonInterpretable: null,
    });
    const dialog = await ouvrirDetail();
    expect(dialog.textContent).toContain('Score brut : 7');
    expect(dialog.textContent).toContain('Vigilance');
    expect(dialog.textContent).not.toContain('Interprétation retirée');
  });
});
