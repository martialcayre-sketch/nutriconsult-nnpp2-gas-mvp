// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { MESSAGE_ACCES_GOOGLE_REFUSE } from '@/lib/portail/googleIdentite';
import ConnexionPortailPage from './page';

afterEach(cleanup);

describe('/portail/connexion', () => {
  beforeEach(() => {
    delete process.env.WN_G5_GOOGLE_PATIENT;
    delete process.env.WN_G4_LIEN_MAGIQUE;
    delete process.env.WN_G4_REDEMANDE_PATIENT;
  });

  // LOT-04, anti-lock-out (revue adversariale) : le jeton permanent ne
  // fonctionne plus, un 404 ici enfermerait les patients dehors. Même tous
  // drapeaux éteints, la page reste rendue et indique comment obtenir un accès.
  it('aucun chemin ouvert : jamais 404, indique la voie praticien', async () => {
    render(await ConnexionPortailPage({}));
    expect(screen.getByText(/en demander un/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Continuer avec Google' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recevoir un nouveau lien' })).toBeNull();
  });

  it('Google seul : lien de départ Google + avertissement avant le clic', async () => {
    process.env.WN_G5_GOOGLE_PATIENT = 'true';
    render(await ConnexionPortailPage({}));
    expect(screen.getByRole('link', { name: 'Continuer avec Google' }).getAttribute('href')).toBe('/portail/google');
    // Le registre inscrit Google comme sous-traitant nouveau : dit avant le clic.
    expect(screen.getByText(/redirigé vers Google/i)).toBeTruthy();
    expect(screen.getByText(/aucune donnée de santé/i)).toBeTruthy();
    // L'autre voie reste nommée : Google est optionnel (décision D1).
    expect(screen.getByText(/en demander un/i)).toBeTruthy();
  });

  // Le levier « facile pour le patient » : sans Google, la redemande self-service
  // est offerte ici même — plus besoin d'aller d'abord sur `lien/indisponible`.
  it('redemande seule (sans Google) : formulaire de redemande, pas de 404, pas de Google', async () => {
    process.env.WN_G4_LIEN_MAGIQUE = 'true';
    process.env.WN_G4_REDEMANDE_PATIENT = 'true';
    render(await ConnexionPortailPage({}));
    expect(screen.getByRole('button', { name: 'Recevoir un nouveau lien' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Continuer avec Google' })).toBeNull();
  });

  it('les deux chemins ouverts : Google ET redemande', async () => {
    process.env.WN_G5_GOOGLE_PATIENT = 'true';
    process.env.WN_G4_LIEN_MAGIQUE = 'true';
    process.env.WN_G4_REDEMANDE_PATIENT = 'true';
    render(await ConnexionPortailPage({}));
    expect(screen.getByRole('link', { name: 'Continuer avec Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recevoir un nouveau lien' })).toBeTruthy();
  });

  it('sans refus, aucun message d’erreur n’est affiché', async () => {
    process.env.WN_G5_GOOGLE_PATIENT = 'true';
    render(await ConnexionPortailPage({}));
    expect(screen.queryByText(MESSAGE_ACCES_GOOGLE_REFUSE)).toBeNull();
  });

  it('le refus affiche le message unique, et ne nomme aucun motif', async () => {
    process.env.WN_G5_GOOGLE_PATIENT = 'true';
    render(await ConnexionPortailPage({ searchParams: Promise.resolve({ etat: 'refus' }) }));
    expect(screen.getByText(MESSAGE_ACCES_GOOGLE_REFUSE)).toBeTruthy();
    expect(screen.queryByText(/inconnue|révoqué|expiré|inactif|non vérifi/i)).toBeNull();
  });

  // Le paramètre ne prend qu'une valeur : rien d'autre ne doit produire d'écran
  // de refus, sans quoi une variante finirait par dire quelque chose de plus.
  it('une autre valeur du paramètre n’affiche rien de particulier', async () => {
    process.env.WN_G5_GOOGLE_PATIENT = 'true';
    render(await ConnexionPortailPage({ searchParams: Promise.resolve({ etat: 'adresse_inconnue' }) }));
    expect(screen.queryByText(MESSAGE_ACCES_GOOGLE_REFUSE)).toBeNull();
  });
});
