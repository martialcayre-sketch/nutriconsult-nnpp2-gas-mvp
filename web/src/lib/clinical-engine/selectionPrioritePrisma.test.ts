import { afterEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: { decisionPrioritySelection: { findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('../prisma', () => ({ prisma }));

import {
  ANAMNESE_C1_FIXTURE,
  ANAMNESE_C1_FIXTURE_AVEC_SIGNAL,
  CANDIDAT_RANG_1,
  HORODATAGE_C1_FIXTURE,
  MOTIF_SELECTION_FIXTURE,
  passationsC1Fixture,
  retablirTablePriorites,
  signerTablePriorites,
} from './chaineC1Fixture';
import { adaptRuntimeInputs } from './runtimeFromPrisma';
import { proposeRuntimeEpisode } from './runtimeFromPrisma';
import { confirmAssessmentEpisode } from './assessmentEpisode';
import { DATE_RIDEAU_FIXTURE } from './dossierT0Fixture';
import { construireChaineC1Tolerante, lireSelectionPriorite, teteDuFil } from './selectionPrioritePrisma';

// Le fil d'une carte est STRICTEMENT LINÉAIRE en base (`D-127` §3bis) : deux
// index le garantissent, et le contrat SQL `c1_selection_priorite_v1_negatif`
// éprouve qu'ils mordent. Ce banc éprouve l'AUTRE moitié — ce que le code fait
// de ce que la base lui rend, y compris d'états que la base ne produit pas.

function ligne(over: Partial<Parameters<typeof teteDuFil>[0][number]> = {}) {
  return {
    id: 'S1',
    candidateId: CANDIDAT_RANG_1,
    rationale: MOTIF_SELECTION_FIXTURE,
    selectedAt: new Date(HORODATAGE_C1_FIXTURE),
    supersedesSelectionId: null,
    ...over,
  };
}

describe('teteDuFil', () => {
  it('rend null sur un fil vide — aucune sélection n’est pas une sélection nulle', () => {
    expect(teteDuFil([])).toBeNull();
  });

  it('rend la racine quand elle est seule', () => {
    expect(teteDuFil([ligne()])?.id).toBe('S1');
  });

  it('remonte un fil de trois maillons jusqu’à la ligne que rien ne supplante', () => {
    const fil = [
      ligne({ id: 'S1' }),
      ligne({ id: 'S2', supersedesSelectionId: 'S1' }),
      ligne({ id: 'S3', supersedesSelectionId: 'S2' }),
    ];
    // L'ordre de lecture ne décide pas : la base ne garantit aucun tri ici.
    expect(teteDuFil(fil)?.id).toBe('S3');
    expect(teteDuFil([...fil].reverse())?.id).toBe('S3');
  });

  // ÉTAT QUE LA BASE NE PRODUIT PAS, et qu'on refuse quand même de trancher.
  // Deux têtes, ce sont deux praticiens croyant chacun avoir décidé : élire
  // l'une des deux ferait servir un choix que personne n'a arbitré.
  it('rend null sur une fourche plutôt que d’élire une branche', () => {
    expect(teteDuFil([
      ligne({ id: 'S1' }),
      ligne({ id: 'S2', supersedesSelectionId: 'S1' }),
      ligne({ id: 'S3', supersedesSelectionId: 'S1' }),
    ])).toBeNull();
  });

  // Un fil dont toute ligne est supplantée n'a pas de tête lisible : rendre
  // `[0]` servirait une sélection prise au hasard.
  it('rend null quand aucune ligne n’est tête', () => {
    expect(teteDuFil([
      ligne({ id: 'S1', supersedesSelectionId: 'S2' }),
      ligne({ id: 'S2', supersedesSelectionId: 'S1' }),
    ])).toBeNull();
  });
});

describe('lireSelectionPriorite', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rend le contrat C1, `selectedBy` constant et horodatage ISO canonique', async () => {
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([ligne()]);
    const selection = await lireSelectionPriorite('PAT_1', 'runtime-decision-T0-fixture');
    expect(selection).toEqual({
      candidateId: CANDIDAT_RANG_1,
      selectedAt: HORODATAGE_C1_FIXTURE,
      selectedBy: 'practitioner',
      rationale: MOTIF_SELECTION_FIXTURE,
    });
    // `selectedBy` ne vient JAMAIS de la base : `buildDecisionCard` refuse toute
    // autre valeur, et c'est ce refus qui interdit de faire passer la
    // proposition du moteur pour la décision d'un praticien.
    expect(selection?.selectedBy).toBe('practitioner');
  });

  it('ne sélectionne pas l’e-mail de l’auteur — il n’a pas à traverser un objet haché', async () => {
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([ligne()]);
    await lireSelectionPriorite('PAT_1', 'CARTE');
    const args = prisma.decisionPrioritySelection.findMany.mock.calls[0][0];
    expect(args.select.selectedByEmail).toBeUndefined();
    expect(args.where).toEqual({ idPatient: 'PAT_1', decisionCardId: 'CARTE' });
  });

  it('rend null quand le dossier ne porte aucune sélection', async () => {
    prisma.decisionPrioritySelection.findMany.mockResolvedValue([]);
    expect(await lireSelectionPriorite('PAT_1', 'CARTE')).toBeNull();
  });
});

// LE BANC DE LA PÉREMPTION — `D-127` §2, et c'est le défaut que persister une
// sélection introduirait sans lui.
describe('construireChaineC1Tolerante', () => {
  afterEach(() => {
    retablirTablePriorites();
  });

  function entree(anamnese: typeof ANAMNESE_C1_FIXTURE) {
    const inputs = adaptRuntimeInputs(
      { idPatient: 'PAT_1', createdAt: DATE_RIDEAU_FIXTURE },
      passationsC1Fixture(),
      anamnese,
    );
    const { proposal } = proposeRuntimeEpisode(inputs, 'T0');
    const episode = confirmAssessmentEpisode(
      proposal,
      proposal.inWindowResponseIds,
      HORODATAGE_C1_FIXTURE,
    );
    return {
      snapshotId: 'runtime-snapshot-T0-fixture',
      reviewId: 'runtime-review-T0-fixture',
      decisionCardId: 'runtime-decision-T0-fixture',
      patientId: 'PAT_1',
      horodatage: HORODATAGE_C1_FIXTURE,
      episode,
      patientContext: inputs.patientContext,
      responses: inputs.responses,
      signauxAlerte: inputs.signauxAlerte,
      etatPopulation: inputs.etatPopulation,
    };
  }

  const selection = {
    candidateId: CANDIDAT_RANG_1,
    selectedAt: HORODATAGE_C1_FIXTURE,
    selectedBy: 'practitioner' as const,
    rationale: MOTIF_SELECTION_FIXTURE,
  };

  it('sert la sélection quand elle tient', () => {
    signerTablePriorites();
    const { chaine, selectionEcartee } = construireChaineC1Tolerante(entree(ANAMNESE_C1_FIXTURE), selection);
    expect(selectionEcartee).toBe(false);
    expect(chaine.decisionCard.selectedMainPriority?.candidateId).toBe(CANDIDAT_RANG_1);
  });

  // LE CAS QUI JUSTIFIE LA FONCTION. Un signal d'alerte apparu depuis bloque la
  // décision : `buildDecisionCard` JETTE sur la sélection. Sans repli, le rejeu
  // du cockpit rattraperait l'exception et servirait « proposition » — l'épisode
  // CONFIRMÉ redeviendrait un formulaire à confirmer, exactement ce que `D-118`
  // a fermé. Ce que la péremption écarte, c'est la SÉLECTION, pas la chaîne.
  it('écarte une sélection devenue inapplicable sans emporter la chaîne', () => {
    signerTablePriorites();
    const { chaine, selectionEcartee } = construireChaineC1Tolerante(
      entree(ANAMNESE_C1_FIXTURE_AVEC_SIGNAL),
      selection,
    );
    expect(selectionEcartee).toBe(true);
    expect(chaine.decisionCard.selectedMainPriority).toBeNull();
    // La chaîne est SERVIE, pas perdue : c'est tout l'objet.
    expect(chaine.decisionCard.decisionCardId).toBe('runtime-decision-T0-fixture');
  });

  // LE REPLI N'EST PAS UN AVALEUR D'ERREURS. Sans sélection à écarter, une
  // construction qui échoue échoue — sinon la fonction masquerait des pannes
  // qui n'ont rien à voir avec la péremption.
  it('laisse remonter une erreur quand il n’y a aucune sélection à écarter', () => {
    signerTablePriorites();
    const casse = { ...entree(ANAMNESE_C1_FIXTURE), horodatage: 'pas une date ISO' };
    expect(() => construireChaineC1Tolerante(casse, null)).toThrow();
  });

  it('laisse remonter une erreur que le retrait de la sélection ne répare pas', () => {
    signerTablePriorites();
    const casse = { ...entree(ANAMNESE_C1_FIXTURE), horodatage: 'pas une date ISO' };
    expect(() => construireChaineC1Tolerante(casse, selection)).toThrow();
  });
});
