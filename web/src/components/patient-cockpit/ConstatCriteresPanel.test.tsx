// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ConstatCriteresPanel } from './ConstatCriteresPanel';
import type { CritereConstatable } from '@/lib/supplement-library/constatsCriteres';

function critere(over: Partial<CritereConstatable> = {}): CritereConstatable {
  return {
    critereId: 'crit_isrs',
    code: 'sous_isrs',
    labelFr: 'Sous ISRS',
    categorie: null,
    constat: null,
    ...over,
  };
}

const CONSTAT_PRESENT = {
  present: true,
  note: null,
  constateLe: '2026-09-07T10:00:00.000Z',
  constatePar: 'praticien@wellneuro.fr',
};

afterEach(cleanup);

describe('ConstatCriteresPanel', () => {
  it('ne rend rien sans vocabulaire — un panneau vide sur chaque dossier serait du bruit', () => {
    const { container } = render(<ConstatCriteresPanel criteres={[]} onConstater={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  // LE CŒUR DU PANNEAU. « Non renseigné » et « constaté absent » refusent tous
  // deux la règle conditionnée, mais un seul est un geste manquant. L'écran ne
  // doit jamais rendre le premier comme le second — c'est la distinction que
  // [[D-138]] tient jusqu'au moteur.
  it('distingue « non renseigné » de « constaté absent », en toutes lettres', () => {
    render(
      <ConstatCriteresPanel
        criteres={[
          critere({ critereId: 'c1', labelFr: 'Sous ISRS' }),
          critere({
            critereId: 'c2',
            labelFr: 'Grossesse',
            constat: { ...CONSTAT_PRESENT, present: false },
          }),
        ]}
        onConstater={vi.fn()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Non renseigné')).toBeTruthy();
    expect(within(items[1]).getByText(/Constaté absent/)).toBeTruthy();
    // Et le second n'est PAS annoncé comme non renseigné.
    expect(within(items[1]).queryByText('Non renseigné')).toBeNull();
  });

  it('compte les critères non renseignés — la dette est visible sans compter à la main', () => {
    render(
      <ConstatCriteresPanel
        criteres={[
          critere({ critereId: 'c1' }),
          critere({ critereId: 'c2' }),
          critere({ critereId: 'c3', constat: CONSTAT_PRESENT }),
        ]}
        onConstater={vi.fn()}
      />,
    );
    expect(screen.getByText('2 critères ne sont pas renseignés sur ce dossier.')).toBeTruthy();
  });

  // AUCUN ÉTAT PAR DÉFAUT. Le bouton reste inerte tant que le praticien n'a pas
  // choisi : sans ce garde, une consignation « au hasard » enverrait un
  // `present` que personne n'a voulu, et la route le refuserait — mais l'écran
  // n'a pas à produire une requête vouée au refus.
  it('n’offre pas de consigner tant qu’aucun état n’est choisi', () => {
    const onConstater = vi.fn();
    render(<ConstatCriteresPanel criteres={[critere()]} onConstater={onConstater} />);
    const bouton = screen.getByRole('button', { name: 'Consigner le constat' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    fireEvent.click(bouton);
    expect(onConstater).not.toHaveBeenCalled();
  });

  it('remonte un constat PRÉSENT avec sa note', () => {
    const onConstater = vi.fn();
    render(<ConstatCriteresPanel criteres={[critere()]} onConstater={onConstater} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Constaté présent' }));
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Sertraline depuis mars.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consigner le constat' }));
    expect(onConstater).toHaveBeenCalledWith('crit_isrs', true, 'Sertraline depuis mars.');
  });

  // Un constat d'ABSENCE est un constat : il doit pouvoir se poser, et remonter
  // `false` — pas rien.
  it('remonte un constat ABSENT comme un constat, pas comme un silence', () => {
    const onConstater = vi.fn();
    render(<ConstatCriteresPanel criteres={[critere()]} onConstater={onConstater} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Constaté absent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consigner le constat' }));
    expect(onConstater).toHaveBeenCalledWith('crit_isrs', false, '');
  });

  // Un critère DÉJÀ constaté n'ouvre pas son formulaire : le geste courant est
  // de lire, pas de re-saisir. Revenir dessus reste possible, explicitement.
  it('replie le formulaire d’un critère déjà constaté, et le rouvre sur demande', () => {
    render(
      <ConstatCriteresPanel criteres={[critere({ constat: CONSTAT_PRESENT })]} onConstater={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Consigner le constat' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revenir sur ce constat' }));
    expect(screen.getByRole('button', { name: 'Consigner le constat' })).toBeTruthy();
  });

  it('n’offre aucun retrait — corriger se fait en reposant le constat', () => {
    render(
      <ConstatCriteresPanel criteres={[critere({ constat: CONSTAT_PRESENT })]} onConstater={vi.fn()} />,
    );
    for (const bouton of screen.getAllByRole('button')) {
      expect(bouton.textContent ?? '').not.toMatch(/supprim|retir|efface/i);
    }
  });

  it('annonce un échec d’enregistrement plutôt que de le taire', () => {
    render(
      <ConstatCriteresPanel
        criteres={[critere()]}
        state="error"
        error="Critère clinique inconnu ou inactif."
        onConstater={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Critère clinique inconnu ou inactif.');
  });

  it('gèle la saisie pendant l’enregistrement', () => {
    render(<ConstatCriteresPanel criteres={[critere()]} state="saving" onConstater={vi.fn()} />);
    expect((screen.getByRole('radio', { name: 'Constaté présent' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Consigner le constat' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
