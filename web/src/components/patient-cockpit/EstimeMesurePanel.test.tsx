// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CbFeatureProvider } from './CbFeatureProvider';
import { EstimeMesurePanel } from './EstimeMesurePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EstimeMesurePanel — drapeau éteint (fail-closed)', () => {
  it('documente l’instrument sans aucune donnée ni promesse fausse, et ne lit RIEN', () => {
    // Le stub est posé AVANT le rendu : la preuve du fail-closed est un
    // mock jamais appelé, pas une ternaire qui compare [] à [].
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // Hors provider (ou provider sans resultsEnabled) : éteint par défaut.
    render(<EstimeMesurePanel idPatient="PAT1" />);
    expect(screen.getByRole('region', { name: 'Estimé et mesuré' })).toBeTruthy();
    // Le badge ne parle plus d'un « HDS requis » : l'hébergement est en place
    // (D-081 requalifié) — c'est l'ACTIVATION de l'étage 2 qui manque.
    expect(screen.getByText('Second temps — à activer')).toBeTruthy();
    expect(screen.queryByText(/HDS requis/)).toBeNull();
    expect(screen.getByText(/jamais fusionnés en un chiffre unique/)).toBeTruthy();
    // Aucune valeur fabriquée : pas de nombre isolé dans le panneau.
    expect(screen.queryByText(/\d+ ?(ng\/mL|:1)/)).toBeNull();
    // Éteint, le panneau ne lit RIEN : aucune requête ne part.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sans idPatient, le panneau reste au second temps même drapeau levé', () => {
    render(
      <CbFeatureProvider enabled resultsEnabled>
        <EstimeMesurePanel />
      </CbFeatureProvider>,
    );
    expect(screen.getByText('Second temps — à activer')).toBeTruthy();
  });
});

describe('EstimeMesurePanel — drapeau levé (étage 2, D-122 §2)', () => {
  function mockFetch() {
    const fetchMock = vi.fn(async (entree: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(entree);
      if (url.includes('/api/praticien/biologie/resultats')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            resultats: [
              {
                id: 'r1',
                analyteCode: 'BIO_FERRITINE',
                analyteLibelle: 'Ferritine',
                valeur: 42.5,
                unite: 'µg/L',
                preleveLe: '2026-09-01T08:00:00.000Z',
                source: 'saisie_praticien',
              },
            ],
          }),
        } as Response;
      }
      if (url.includes('/api/praticien/biologie/catalogue')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            analytes: [{ code: 'BIO_FERRITINE', libelle: 'Ferritine', unite: 'µg/L' }],
          }),
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({ ok: false }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('lit la série, l’affiche par analyte avec unité et horodatage, et offre la saisie', async () => {
    mockFetch();
    render(
      <CbFeatureProvider enabled resultsEnabled>
        <EstimeMesurePanel idPatient="PAT1" />
      </CbFeatureProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Ferritine')).toBeTruthy();
    });
    expect(screen.getByText(/42\.5 µg\/L/)).toBeTruthy();
    // La confrontation reste dite, jamais fusionnée (A6-R2).
    expect(screen.getByText(/jamais fusionnés en un chiffre unique/)).toBeTruthy();
    // La saisie porte l'heure (frontière PR #838) et l'unité vient du
    // catalogue : aucun champ unité à saisir.
    expect(screen.getByLabelText(/Prélevé le \(avec l’heure\)/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Unité$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Consigner la mesure' })).toBeTruthy();
  });

  it('le GET de la série vise la route résultats avec l’idPatient', async () => {
    const fetchMock = mockFetch();
    render(
      <CbFeatureProvider enabled resultsEnabled>
        <EstimeMesurePanel idPatient="PAT1" />
      </CbFeatureProvider>,
    );
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) =>
          String(u).startsWith('/api/praticien/biologie/resultats?idPatient=PAT1'),
        ),
      ).toBe(true);
    });
  });

  it('échec de lecture : le panneau le DIT, jamais « aucune mesure » (DC-24)', async () => {
    // L'absence de donnée ne se fabrique pas : une panne de lecture n'est ni
    // zéro ni « rien à voir » — même règle que le runtime clinique.
    const fetchMock = vi.fn(async (entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/api/praticien/biologie/resultats')) {
        return { ok: false, status: 500, json: async () => ({ ok: false }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, analytes: [] }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <CbFeatureProvider enabled resultsEnabled>
        <EstimeMesurePanel idPatient="PAT1" />
      </CbFeatureProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByText(/n’a pas pu être lue/)).toBeTruthy();
    expect(screen.queryByText(/Aucune mesure consignée/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Relire la série' })).toBeTruthy();
  });

  it('deux mesures du même analyte à deux heures du même jour coexistent à l’écran', async () => {
    // Le cœur de la frontière PR #838 : l'heure distingue, l'écran montre les deux.
    const fetchMock = vi.fn(async (entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/api/praticien/biologie/resultats')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            resultats: [
              {
                id: 'r1', analyteCode: 'BIO_CORTISOL', analyteLibelle: 'Cortisol salivaire',
                valeur: 12.1, unite: 'nmol/L', preleveLe: '2026-09-01T06:30:00.000Z',
                source: 'saisie_praticien',
              },
              {
                id: 'r2', analyteCode: 'BIO_CORTISOL', analyteLibelle: 'Cortisol salivaire',
                valeur: 3.4, unite: 'nmol/L', preleveLe: '2026-09-01T15:30:00.000Z',
                source: 'saisie_praticien',
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, analytes: [] }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <CbFeatureProvider enabled resultsEnabled>
        <EstimeMesurePanel idPatient="PAT1" />
      </CbFeatureProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Cortisol salivaire')).toBeTruthy();
    });
    // UN groupe d'analyte, DEUX lignes horodatées.
    expect(screen.getAllByText('Cortisol salivaire')).toHaveLength(1);
    expect(screen.getByText(/12\.1 nmol\/L/)).toBeTruthy();
    expect(screen.getByText(/3\.4 nmol\/L/)).toBeTruthy();
  });

  it('le POST de saisie ne porte ni unité, ni source, ni auteur — le serveur les pose', async () => {
    const fetchMock = mockFetch();
    render(
      <CbFeatureProvider enabled resultsEnabled>
        <EstimeMesurePanel idPatient="PAT1" />
      </CbFeatureProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Analyte (unité du catalogue)')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Analyte (unité du catalogue)'), {
      target: { value: 'BIO_FERRITINE' },
    });
    fireEvent.change(screen.getByLabelText(/^Valeur/), { target: { value: '51,2' } });
    fireEvent.change(screen.getByLabelText(/Prélevé le/), {
      target: { value: '2026-09-02T08:15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Consigner la mesure' }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      const corps = JSON.parse(String((post?.[1] as RequestInit).body));
      expect(corps).toEqual({
        idPatient: 'PAT1',
        analyteCode: 'BIO_FERRITINE',
        valeur: 51.2,
        preleveLe: new Date('2026-09-02T08:15').toISOString(),
      });
    });
  });
});

describe('EstimeMesurePanel — le geste de correction (D-124)', () => {
  const ORIGINE = {
    id: 'r1',
    analyteCode: 'BIO_FERRITINE',
    analyteLibelle: 'Ferritine',
    valeur: 42.5,
    unite: 'µg/L',
    preleveLe: '2026-09-01T08:00:00.000Z',
    source: 'saisie_praticien',
    saisiLe: '2026-09-01T09:00:00.000Z',
    supersedesResultatId: null,
    corrigeeParId: null,
  };

  /** `resultats` sert le GET ; `poste` capte le corps du POST. */
  function monterAvec(
    resultats: unknown[],
    reponsePost?: { ok: boolean; status: number; error?: string },
    catalogue: 'ok' | 'panne' = 'ok',
  ) {
    const corps: unknown[] = [];
    const fetchMock = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      if (url.includes('/api/praticien/biologie/catalogue')) {
        if (catalogue === 'panne') throw new Error('réseau');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            analytes: [{ code: 'BIO_FERRITINE', libelle: 'Ferritine', unite: 'µg/L' }],
          }),
        } as Response;
      }
      if (init?.method === 'POST') {
        corps.push(JSON.parse(String(init.body)));
        const r = reponsePost ?? { ok: true, status: 201 };
        return {
          ok: r.ok,
          status: r.status,
          json: async () => ({ ok: r.ok, error: r.error }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, resultats }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <CbFeatureProvider enabled resultsEnabled>
        <EstimeMesurePanel idPatient="PAT1" />
      </CbFeatureProvider>,
    );
    return { corps };
  }

  it('l’écran ne promet plus que la correction n’existe pas', async () => {
    monterAvec([ORIGINE]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    expect(screen.queryByText(/n’existe pas encore/)).toBeNull();
  });

  it('une mesure corrigée RESTE à l’écran, barrée, avec la valeur et la date de sa correction', async () => {
    const correction = {
      ...ORIGINE,
      id: 'r2',
      valeur: 45.5,
      saisiLe: '2026-09-02T09:00:00.000Z',
      supersedesResultatId: 'r1',
    };
    monterAvec([{ ...ORIGINE, corrigeeParId: 'r2' }, correction]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());

    // L'ERREUR NE DISPARAÎT PAS (DC-30) : elle est barrée, pas filtrée.
    const origine = screen.getByText('42.5 µg/L');
    expect(origine.className).toContain('line-through');
    expect(screen.getByText(/remplacée — la valeur qui fait foi est 45\.5 µg\/L/)).toBeTruthy();
    // Et la correction se signale comme telle, AVEC SA PROPRE DATE.
    expect(screen.getByText(/· correction consignée le/)).toBeTruthy();
  });

  it('sur une CHAÎNE DE TROIS, aucune ligne ne s’attribue un geste qui n’a pas eu lieu', async () => {
    // `corrigeeParId` désigne la ligne qui FAIT FOI, pas le successeur direct :
    // sur a→b→c, `a` pointe vers `c`. Dire « corrigée le [date de c] »
    // affirmerait un geste qui n'a jamais eu lieu — c'est `b` qui a corrigé
    // `a` (contre-revue du 2026-09-06, M1-bis). La phrase nomme donc un ÉTAT,
    // et la date de CHAQUE correction se lit sur SA ligne.
    monterAvec([
      { ...ORIGINE, corrigeeParId: 'r3' },
      {
        ...ORIGINE,
        id: 'r2',
        valeur: 45.5,
        saisiLe: '2026-09-02T09:00:00.000Z',
        supersedesResultatId: 'r1',
        corrigeeParId: 'r3',
      },
      {
        ...ORIGINE,
        id: 'r3',
        valeur: 46,
        saisiLe: '2026-09-03T09:00:00.000Z',
        supersedesResultatId: 'r2',
        corrigeeParId: null,
      },
    ]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());

    // Personne n'affirme « corrigée le … » : le verbe raconterait un événement.
    expect(screen.queryByText(/· corrigée le/)).toBeNull();
    // Les deux dépassées nomment la MÊME ligne qui fait foi : la dernière.
    expect(
      screen.getAllByText(/remplacée — la valeur qui fait foi est 46 µg\/L/),
    ).toHaveLength(2);
    // Et le fil reste lisible pas-à-pas : DEUX dates de consignation
    // distinctes, celle de `r2` et celle de `r3`, chacune sur sa ligne.
    const dates = screen
      .getAllByText(/· correction consignée le/)
      .map(n => n.textContent);
    expect(dates).toHaveLength(2);
    expect(new Set(dates).size).toBe(2);
  });

  it('la branche PERDANTE d’une fourche est « remplacée », jamais « corrigée » par sa sœur', async () => {
    // `r3` n'a pas corrigé `r2` : elles sont SŒURS, toutes deux issues de `r1`.
    // Le verbe « corrigée » serait faux ; « remplacée » dit l'état, qui l'est.
    monterAvec([
      { ...ORIGINE, corrigeeParId: 'r3' },
      { ...ORIGINE, id: 'r2', valeur: 45.5, supersedesResultatId: 'r1', corrigeeParId: 'r3' },
      { ...ORIGINE, id: 'r3', valeur: 46, supersedesResultatId: 'r1', corrigeeParId: null },
    ]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    expect(screen.queryByText(/· corrigée/)).toBeNull();
    expect(screen.getByText('45.5 µg/L').className).toContain('line-through');
  });

  it('catalogue EN PANNE : l’écran n’affirme pas qu’un analyte a été retiré (DC-24)', async () => {
    // ÉCHEC DE LECTURE ≠ ABSENCE D'ANALYTE : sans état de lecture, la liste
    // vide passerait pour un catalogue lu et l'écran dirait « n'est plus
    // servi » d'un analyte parfaitement actif (contre-revue du 2026-09-06, m11).
    monterAvec([ORIGINE], undefined, 'panne');
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Corriger la mesure du/ }));
    expect(screen.queryByText(/n’est plus servi par le catalogue/)).toBeNull();
    expect(screen.getByText(/Unité non vérifiable pour l’instant/)).toBeTruthy();
  });

  it('une mesure DÉJÀ corrigée n’offre pas « Corriger » — on corrige la version qui fait foi', async () => {
    const correction = { ...ORIGINE, id: 'r2', valeur: 45.5, supersedesResultatId: 'r1' };
    monterAvec([{ ...ORIGINE, corrigeeParId: 'r2' }, correction]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    // Une seule ligne est corrigible : la tête de fil.
    expect(screen.getAllByRole('button', { name: /^Corriger la mesure du/ })).toHaveLength(1);
  });

  it('corriger poste la CHAÎNE et la valeur — jamais l’analyte ni la date', async () => {
    const { corps } = monterAvec([ORIGINE]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Corriger la mesure du/ }));

    // Le second temps ne propose que la valeur : offrir l'analyte ou la date
    // laisserait croire qu'on peut les corriger, alors que ce serait annuler.
    expect(screen.getByLabelText(/Valeur corrigée/)).toBeTruthy();
    expect(screen.getByText(/reste lisible/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Valeur corrigée/), { target: { value: '45,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consigner la correction' }));

    await waitFor(() => expect(corps).toHaveLength(1));
    expect(corps[0]).toEqual({
      idPatient: 'PAT1',
      supersedesResultatId: 'r1',
      valeur: 45.5,
    });
  });

  it('le champ s’ouvre PRÉ-REMPLI de la valeur d’origine : on corrige, on ne resaisit pas', async () => {
    monterAvec([ORIGINE]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Corriger la mesure du/ }));
    expect((screen.getByLabelText(/Valeur corrigée/) as HTMLInputElement).value).toBe('42.5');
  });

  it('un refus du serveur se DIT et laisse le second temps ouvert — pas de saisie perdue', async () => {
    monterAvec([ORIGINE], {
      ok: false,
      status: 409,
      error: 'Cette mesure a déjà été corrigée : relisez la série.',
    });
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Corriger la mesure du/ }));
    fireEvent.change(screen.getByLabelText(/Valeur corrigée/), { target: { value: '45,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consigner la correction' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/déjà été corrigée/)).toBeTruthy();
    // Le formulaire reste ouvert, la valeur frappée est encore là.
    expect((screen.getByLabelText(/Valeur corrigée/) as HTMLInputElement).value).toBe('45,5');
  });

  it('« Annuler » referme le second temps sans rien poster', async () => {
    const { corps } = monterAvec([ORIGINE]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Corriger la mesure du/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText(/Valeur corrigée/)).toBeNull();
    expect(corps).toHaveLength(0);
  });

  it('sur une FOURCHE, un seul geste est offert : une seule valeur fait foi', async () => {
    // Le serveur marque la branche perdante comme corrigée (contre-revue M1) :
    // l'écran ne doit offrir qu'UN bouton, sans quoi deux valeurs concurrentes
    // se prolongeraient chacune de son côté.
    monterAvec([
      { ...ORIGINE, corrigeeParId: 'r3' },
      { ...ORIGINE, id: 'r2', valeur: 45.5, supersedesResultatId: 'r1', corrigeeParId: 'r3' },
      { ...ORIGINE, id: 'r3', valeur: 46, supersedesResultatId: 'r1', corrigeeParId: null },
    ]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /^Corriger la mesure du/ })).toHaveLength(1);
  });

  it('le label annonce l’unité DU CATALOGUE, et signale qu’elle a changé', async () => {
    // Le serveur relit l'unité sur l'analyte : afficher celle d'origine ferait
    // taper un nombre sous un libellé faux — sur une donnée clinique, un
    // facteur 1000 silencieux (contre-revue M2).
    monterAvec([{ ...ORIGINE, unite: 'mg/L' }]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Corriger la mesure du/ }));
    expect(screen.getByLabelText(/Valeur corrigée \(µg\/L\)/)).toBeTruthy();
    expect(screen.getByText(/a changé au catalogue/)).toBeTruthy();
  });

  it('ouvrir le second temps porte le focus sur le champ, et ferme les autres gestes', async () => {
    monterAvec([
      ORIGINE,
      { ...ORIGINE, id: 'r9', preleveLe: '2026-09-02T08:00:00.000Z', valeur: 50 },
    ]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    const gestes = screen.getAllByRole('button', { name: /^Corriger la mesure du/ });
    expect(gestes).toHaveLength(2);
    fireEvent.click(gestes[0]);

    // Focus : sans lui, le bouton disparaît et l'utilisateur clavier perd sa
    // place sans savoir que le formulaire s'est ouvert.
    expect(document.activeElement).toBe(screen.getByLabelText(/Valeur corrigée/));
    // Et l'autre geste est fermé : en changer jetterait la valeur en frappe.
    const restant = screen.getByRole('button', { name: /^Corriger la mesure du/ });
    expect((restant as HTMLButtonElement).disabled).toBe(true);
  });

  it('un `corrigeeParId` ABSENT ne barre rien : une mesure que personne n’a corrigée reste corrigible', async () => {
    // Réponse d'une version antérieure, ou tronquée : `undefined` ne doit pas
    // se lire comme « corrigée » — sinon l'écran barre et retire le geste.
    const sansChamp = { ...ORIGINE } as Record<string, unknown>;
    delete sansChamp.corrigeeParId;
    monterAvec([sansChamp]);
    await waitFor(() => expect(screen.getByText('Ferritine')).toBeTruthy());
    expect(screen.getByText('42.5 µg/L').className).not.toContain('line-through');
    expect(screen.getByRole('button', { name: /^Corriger la mesure du/ })).toBeTruthy();
  });
});
