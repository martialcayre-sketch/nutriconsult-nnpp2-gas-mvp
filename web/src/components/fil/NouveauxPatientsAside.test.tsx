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
    accesRevoque: false,
    accesEnvoyeLe: '2026-08-24T12:05:00.000Z',
    accesEnEchec: false,
    connecteLe: '2026-08-25T09:00:00.000Z',
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
