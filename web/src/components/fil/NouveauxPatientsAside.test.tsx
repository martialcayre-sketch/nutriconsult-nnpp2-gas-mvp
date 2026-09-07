// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NouveauxPatientsAside } from './NouveauxPatientsAside';
import { lignesNouveauxPatients, type SourceNouveauPatient } from '@/lib/fil/nouveauxPatients';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stub(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => payload }) as unknown as Response));
}

function source(over: Partial<SourceNouveauPatient> = {}): SourceNouveauPatient {
  return {
    idPatient: 'PAT_SEED_01',
    patient: 'Sophie Nicola',
    creeLe: '2026-08-24T12:00:00.000Z',
    dossierDesactive: false,
    accesRevoque: false,
    accesEnvoyeLe: '2026-08-24T12:05:00.000Z',
    accesEnEchec: false,
    connecteLe: '2026-08-25T09:00:00.000Z',
    entreeRefusee: false,
    onboardingValide: true,
    nbAssignations: 5,
    ...over,
  };
}

function reponse(sources: SourceNouveauPatient[]) {
  return { ok: true, lignes: lignesNouveauxPatients(sources), fenetreJours: 30 };
}

describe('NouveauxPatientsAside', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nomme la porte fermée en toutes lettres et compte les dossiers en attente', async () => {
    stub(
      reponse([
        source({
          idPatient: 'PAT_SEED_02',
          patient: 'Jennifer Martin',
          connecteLe: null,
          onboardingValide: false,
          nbAssignations: 0,
        }),
        source(),
      ]),
    );
    render(<NouveauxPatientsAside />);
    await waitFor(() => expect(screen.getByText('Jennifer Martin')).toBeTruthy());
    expect(screen.getByText('Jamais connecté')).toBeTruthy();
    expect(screen.getByText('1 en attente')).toBeTruthy();
    // Le dossier complet reste listé : le praticien a demandé à VOIR ses
    // nouveaux patients, pas seulement ses ennuis.
    expect(screen.getByText('Sophie Nicola')).toBeTruthy();
    expect(screen.getByText('Accès et pack de base OK')).toBeTruthy();
  });

  it('une entrée refusée se nomme à l’écran, et pas en simple attente', async () => {
    // LE TEXTE, PAS LA COULEUR. `VARIANTE` porte bien `danger` pour cette
    // étape, mais le composant pose en tête que « la couleur double toujours le
    // libellé, jamais l'inverse » (règle A5-R1) : asserter la teinte
    // encoderait un sens que le design refuse de lui donner.
    stub(
      reponse([
        source({
          idPatient: 'PAT_SEED_03',
          patient: 'Michel Dogné',
          connecteLe: null,
          onboardingValide: false,
          nbAssignations: 0,
          entreeRefusee: true,
        }),
      ]),
    );
    render(<NouveauxPatientsAside />);
    await waitFor(() => expect(screen.getByText('Entrée refusée')).toBeTruthy());
    // Le raffinement est tout l'objet de l'item : le dossier ne se lit plus
    // comme un dossier tout neuf que personne n'a encore ouvert.
    expect(screen.queryByText('Jamais connecté')).toBeNull();
    expect(screen.getByText('1 en attente')).toBeTruthy();
  });

  it('le dossier en attente passe devant le dossier complet plus récent', async () => {
    stub(
      reponse([
        source({ idPatient: 'PAT_OK', patient: 'Michel Dogné', creeLe: '2026-09-03T00:00:00.000Z' }),
        source({
          idPatient: 'PAT_BLOQUE',
          patient: 'Jennifer Martin',
          creeLe: '2026-08-21T00:00:00.000Z',
          accesEnvoyeLe: null,
          onboardingValide: false,
          connecteLe: null,
          nbAssignations: 0,
        }),
      ]),
    );
    render(<NouveauxPatientsAside />);
    await waitFor(() => expect(screen.getByText('Jennifer Martin')).toBeTruthy());
    const noms = screen.getAllByRole('link').map(a => a.textContent);
    expect(noms.indexOf('Jennifer Martin')).toBeLessThan(noms.indexOf('Michel Dogné'));
    expect(screen.getByText('Accès non envoyé')).toBeTruthy();
  });

  it('un onboarding validé sans assignation est signalé comme anomalie, pas comme attente d’accès', async () => {
    stub(reponse([source({ nbAssignations: 0 })]));
    render(<NouveauxPatientsAside />);
    await waitFor(() => expect(screen.getByText('Pack de base absent')).toBeTruthy());
    expect(screen.queryByText('Jamais connecté')).toBeNull();
  });

  it('une indisponibilité est dite, jamais présentée comme « aucun nouveau patient »', async () => {
    stub({ ok: false, lignes: [], fenetreJours: 30, unavailable: true });
    render(<NouveauxPatientsAside />);
    await waitFor(() => expect(screen.getByText(/momentanément indisponibles/i)).toBeTruthy());
    expect(screen.queryByText(/Aucun dossier ouvert/i)).toBeNull();
  });

  it('aucun dossier récent : l’encart le dit sans badge d’attente', async () => {
    stub({ ok: true, lignes: [], fenetreJours: 30 });
    render(<NouveauxPatientsAside />);
    await waitFor(() => expect(screen.getByText(/Aucun dossier ouvert depuis 30 jours/i)).toBeTruthy());
    expect(screen.queryByText(/en attente/)).toBeNull();
  });
});
