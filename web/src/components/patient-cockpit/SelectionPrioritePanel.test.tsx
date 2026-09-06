// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectionPrioritePanel } from './SelectionPrioritePanel';
import type { DecisionCard, DecisionPriorityCandidate } from '@/lib/clinical-engine/types';

function candidat(over: Partial<DecisionPriorityCandidate> = {}): DecisionPriorityCandidate {
  return {
    candidateId: 'priority:P1',
    origin: 'engine',
    label: 'Axe pondéral',
    rank: 1,
    confidence: 'à_documenter',
    ruleId: 'P1',
    rationale: 'Plainte pondérale dominante.',
    provenance: { responseIds: [], needIds: [], clinicalObjectCodes: [] },
    limitations: [],
    ...over,
  };
}

function card(over: Partial<DecisionCard> = {}): DecisionCard {
  return {
    decisionCardId: 'card-1', snapshotId: 'snapshot-1', snapshotInputHash: 'snapshot-hash',
    reviewId: 'review-1', reviewInputHash: 'review-hash', createdAt: '2026-01-01T00:00:00.000Z',
    version: 'c1-decision-card-v1', status: 'draft',
    priorityCandidates: [candidat(), candidat({ candidateId: 'priority:P2', label: 'Axe sommeil', rank: 2, ruleId: 'P2' })],
    proposedMainPriorityId: 'priority:P1', selectedMainPriority: null,
    counterfactuals: [], missingDataFindingIds: [], discordanceFindingIds: [], safetyFindingIds: [],
    abstention: { status: 'not_required', ruleIds: ['P1'], limitations: [] }, limitations: [], inputHash: 'hash',
    ...over,
  };
}

// Les rendus s'ACCUMULENT dans le document (aucun `cleanup` global n'est
// configuré ici) : les requêtes passent donc par `within(container)`, comme le
// banc voisin `ProtocolMiniBuilder.test.tsx`. `screen` trouverait les éléments
// du cas précédent et rendrait « Found multiple elements ».
function rendre(
  over: Partial<DecisionCard> | null = {},
  onRetenir = vi.fn(),
  etat: 'idle' | 'saving' | 'error' = 'idle',
  erreur: string | null = null,
  selectionEcartee = false,
) {
  const decisionCard = over === null ? null : card(over);
  const { container } = render(
    <SelectionPrioritePanel
      decisionCard={decisionCard}
      selectionEcartee={selectionEcartee}
      etat={etat}
      erreur={erreur}
      onRetenir={onRetenir}
    />,
  );
  return { container, ecran: within(container), onRetenir };
}

const PHRASE_PEREMPTION = /Une priorité avait été retenue sur ce dossier/;

describe('SelectionPrioritePanel', () => {
  // LES TROIS SILENCES. Chacun a son propriétaire ailleurs à l'écran : un
  // second bloc répéterait, ou proposerait un choix que le moteur refuserait.
  it('ne rend rien sans carte de décision', () => {
    const { container } = rendre(null);
    expect(container.innerHTML).toBe('');
  });

  it('ne rend rien quand la décision est bloquée par un constat de sécurité', () => {
    const { container } = rendre({ safetyFindingIds: ['SEC-1'] });
    expect(container.innerHTML).toBe('');
  });

  it('ne rend rien quand une abstention est requise', () => {
    const { container } = rendre({
      abstention: { status: 'required', ruleIds: ['ABST-CAN-01'], limitations: ['Canal non mesurable.'] },
    });
    expect(container.innerHTML).toBe('');
  });

  it('ne rend rien quand aucun candidat n’est classé (table non signée)', () => {
    const { container } = rendre({ priorityCandidates: [], proposedMainPriorityId: null });
    expect(container.innerHTML).toBe('');
  });

  it('dit ce qui manque, et pourquoi cela bloque le protocole', () => {
    const { ecran } = rendre();
    expect(ecran.getByText(/Aucune priorité n’est retenue pour l’instant/)).toBeTruthy();
    expect(ecran.getByText(/le protocole 21 jours attend ce choix/)).toBeTruthy();
  });

  // LE RANG ET LE STATUT SONT MONTRÉS : le praticien décide AVEC ou CONTRE le
  // classement du moteur, il ne choisit pas à l'aveugle.
  it('montre chaque candidat avec son rang et son statut de confiance', () => {
    const { ecran } = rendre();
    expect(ecran.getByText('Axe pondéral')).toBeTruthy();
    expect(ecran.getByText('rang 1 · à_documenter')).toBeTruthy();
    expect(ecran.getByText('rang 2 · à_documenter')).toBeTruthy();
  });

  // LE MOTIF EST LA DÉCISION. Le bouton reste fermé tant qu'il manque — la
  // route refuserait de toute façon, mais un refus après coup ferait perdre la
  // saisie.
  it('n’autorise pas l’envoi sans candidat ni motif', () => {
    const { ecran } = rendre();
    const bouton = ecran.getByRole('button', { name: 'Retenir cette priorité' });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(ecran.getByLabelText(/Axe pondéral/));
    expect((bouton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(ecran.getByLabelText(/Pourquoi cette priorité/), { target: { value: '   ' } });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
  });

  it('transmet le candidat et le motif détouré des blancs', () => {
    const { ecran, onRetenir } = rendre();
    fireEvent.click(ecran.getByLabelText(/Axe sommeil/));
    fireEvent.change(ecran.getByLabelText(/Pourquoi cette priorité/), {
      target: { value: '  Réveils nocturnes au premier plan.  ' },
    });
    fireEvent.click(ecran.getByRole('button', { name: 'Retenir cette priorité' }));
    expect(onRetenir).toHaveBeenCalledWith('priority:P2', 'Réveils nocturnes au premier plan.');
  });

  it('ferme le bouton pendant l’enregistrement et le dit', () => {
    const { ecran } = rendre({}, vi.fn(), 'saving');
    const bouton = ecran.getByRole('button', { name: 'Enregistrement…' });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
  });

  // LE MESSAGE DU SERVEUR EST LE MESSAGE : il nomme le refus (carte périmée,
  // course concurrente, candidat inconnu). Le remplacer perdrait la seule
  // information utile.
  it('affiche le refus du serveur tel quel, en alerte', () => {
    const { ecran } = rendre({}, vi.fn(), 'error', 'Une autre sélection vient d’être posée sur cette décision.');
    const alerte = ecran.getByRole('alert');
    expect(alerte.textContent).toBe('Une autre sélection vient d’être posée sur cette décision.');
  });

  // LA PÉREMPTION D'UNE SÉLECTION ([[D-127]] §11). La carte servie est celle
  // construite SANS la sélection : elle est indiscernable, ici, de celle d'un
  // dossier où personne n'a jamais choisi. Seul le serveur sait qu'un acte
  // existait, et sans cette phrase il cessait d'être servi en silence.
  describe('quand une sélection consignée a été écartée', () => {
    it('le dit, et dit que rien n’a été effacé', () => {
      const { ecran } = rendre({}, vi.fn(), 'idle', null, true);
      const constat = ecran.getByRole('status');
      expect(constat.textContent).toMatch(PHRASE_PEREMPTION);
      expect(constat.textContent).toMatch(/rien n’a été effacé/);
      // Le geste reste offert : le dossier porte encore des candidats.
      expect(ecran.getByRole('button', { name: 'Retenir cette priorité' })).toBeTruthy();
    });

    // LES SILENCES PORTENT SUR LE GESTE, PAS SUR LE CONSTAT. Une décision
    // bloquée est le cas où la péremption est la PLUS probable (`DC-12` retire
    // les candidats) : s'y taire serait se taire là où il faut parler.
    it('parle même quand la décision est bloquée, sans proposer de choix', () => {
      const { ecran } = rendre({ safetyFindingIds: ['SEC-1'] }, vi.fn(), 'idle', null, true);
      expect(ecran.getByRole('status').textContent).toMatch(PHRASE_PEREMPTION);
      expect(ecran.queryByRole('button')).toBeNull();
      expect(ecran.queryByLabelText(/Pourquoi cette priorité/)).toBeNull();
    });

    it('parle même quand plus aucun candidat n’est classé', () => {
      const { ecran } = rendre(
        { priorityCandidates: [], proposedMainPriorityId: null }, vi.fn(), 'idle', null, true,
      );
      expect(ecran.getByRole('status').textContent).toMatch(PHRASE_PEREMPTION);
      expect(ecran.queryByRole('button')).toBeNull();
    });

    // Sans carte, il n'y a pas de réponse `ready`, donc pas de drapeau — et le
    // silence tient de toute façon : il n'y a rien à quoi rattacher le constat.
    it('se tait quand même sans carte de décision', () => {
      const { container } = rendre(null, vi.fn(), 'idle', null, true);
      expect(container.innerHTML).toBe('');
    });

    it('ne dit rien de tel quand aucune sélection n’a été écartée', () => {
      const { ecran } = rendre();
      expect(ecran.queryByText(PHRASE_PEREMPTION)).toBeNull();
    });
  });

  describe('quand une priorité est déjà retenue', () => {
    const retenue = {
      selectedMainPriority: {
        candidateId: 'priority:P1',
        selectedAt: '2026-01-02T00:00:00.000Z',
        selectedBy: 'practitioner' as const,
        rationale: 'Plainte dominante pondérale, patient demandeur.',
      },
    };

    // LE MOTIF EST RE-AFFICHÉ, jamais seulement stocké : c'est la moitié de
    // l'acte, et c'est ce qu'on vient relire six semaines plus tard.
    it('montre la priorité retenue ET son motif, sans formulaire ouvert', () => {
      const { ecran } = rendre(retenue);
      expect(ecran.getByText('Axe pondéral')).toBeTruthy();
      expect(ecran.getByText('Plainte dominante pondérale, patient demandeur.')).toBeTruthy();
      expect(ecran.queryByLabelText(/Pourquoi cette priorité/)).toBeNull();
    });

    // CHANGER D'AVIS EST UN ACTE, PAS UNE RATURE : le champ repart VIDE, on ne
    // recycle pas le motif du choix précédent pour justifier le suivant.
    it('rouvre le formulaire avec un motif vierge', () => {
      const { ecran } = rendre(retenue);
      fireEvent.click(ecran.getByRole('button', { name: 'Retenir une autre priorité' }));
      const champ = ecran.getByLabelText(/Pourquoi cette priorité/) as HTMLTextAreaElement;
      expect(champ.value).toBe('');
      expect((ecran.getByRole('button', { name: 'Retenir cette priorité' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('referme le formulaire sans rien transmettre', () => {
      const { ecran, onRetenir } = rendre(retenue);
      fireEvent.click(ecran.getByRole('button', { name: 'Retenir une autre priorité' }));
      fireEvent.click(ecran.getByRole('button', { name: 'Annuler' }));
      expect(ecran.queryByLabelText(/Pourquoi cette priorité/)).toBeNull();
      expect(onRetenir).not.toHaveBeenCalled();
    });
  });
});
