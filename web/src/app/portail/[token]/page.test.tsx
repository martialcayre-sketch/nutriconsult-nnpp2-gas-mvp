// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'PAT_TEST' }),
  useRouter: () => ({ replace }),
}));

import PortailPage from './page';

describe('PortailPage — restauration de session', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    replace.mockClear();
  });

  it('restaure une session valide sans afficher le gate email', async () => {
    // `ok: true` : le code vérifie res.ok (Response réel) avant de parser —
    // sans lui, le fetch trust/etat partirait en réessais bornés (lenteur).
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        patient: { idPatient: 'PAT_TEST', prenom: 'Sophie', nom: 'Nicola', email: 'sophie.nicola@example.test' },
        consultation: null,
        premiereAssignation: 'ASS_TEST',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<PortailPage />);

    expect(screen.getByText('Vérification de votre session…')).not.toBeNull();
    await waitFor(() => expect(screen.getByText('Merci !')).not.toBeNull());
    expect(screen.queryByPlaceholderText('votre@email.fr')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  // `premiereAssignation` ne compte que les assignations NON complétées
  // (`session/route.ts`, `statut: { not: 'Complété' }`). Elle est donc null
  // AUSSI pour un patient qui a tout rempli — à qui cet écran fermait la porte
  // du hub, et annonçait des questionnaires « prochainement » alors qu'il n'en
  // attendait aucun.
  it('laisse le hub accessible et ne promet rien quand aucune assignation n’est en attente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        patient: { idPatient: 'PAT_TEST', prenom: 'Sophie', nom: 'Nicola', email: 'sophie.nicola@example.test' },
        consultation: null,
        premiereAssignation: null,
      }),
    }));

    render(<PortailPage />);

    await waitFor(() => expect(screen.getByText('Merci !')).not.toBeNull());
    const lien = screen.getByRole('link', { name: 'Accéder à mon parcours' });
    expect(lien.getAttribute('href')).toBe('/portail/PAT_TEST/questionnaires');
    expect(screen.queryByText(/mettra vos questionnaires à disposition prochainement/)).toBeNull();
    expect(screen.getByText(/aucun questionnaire en attente/)).not.toBeNull();
  });

  // LOT-04 : plus de gate email. Sans cookie valide, la page redirige vers la
  // page de connexion (Google + redemande de lien magique).
  it('redirige vers /portail/connexion lorsque la restauration est refusée', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: false, reason: 'forbidden', error: 'Accès refusé.' }),
    }));

    render(<PortailPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/portail/connexion'));
    // Le champ e-mail du gate n'existe plus.
    expect(screen.queryByPlaceholderText('votre@email.fr')).toBeNull();
  });
});
