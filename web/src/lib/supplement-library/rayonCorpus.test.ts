import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, createEmbeddings } = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
  createEmbeddings: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/rag/embeddings', () => ({ createEmbeddings }));

import { servirRayonCorpus, RAYON_VERS_NOTEBOOK, RAYONS_RECHERCHE_CORPUS } from './rayonCorpus';
import {
  estSourceEnQuarantaine,
  sansSourcesEnQuarantaine,
  sourcesDuNotebook,
} from '@/lib/rag/claims/notebooks';

const NOTEBOOK_MICRO = '10 — Micronutrition et compléments';
// Ce que le rayon SERT : les sources du notebook, MOINS celles sous quarantaine
// sanitaire. Leur absence de la liste servie est le contrat, pas un effet de
// bord.
const SOURCES_MICRO_BRUTES = sourcesDuNotebook(NOTEBOOK_MICRO);
const SOURCES_MICRO = sansSourcesEnQuarantaine(SOURCES_MICRO_BRUTES);
// Les trois rayons de RECHERCHE suivent la MÊME règle : la quarantaine ne
// connaît pas le rayon qui l'interroge.
const NOTEBOOK_COGNITION = '05 — Cognition et mémoire';
const SOURCES_COGNITION = sansSourcesEnQuarantaine(sourcesDuNotebook(NOTEBOOK_COGNITION));
const NOTEBOOK_INTESTIN = '07 — Axe intestin-cerveau';
const SOURCES_INTESTIN = sansSourcesEnQuarantaine(sourcesDuNotebook(NOTEBOOK_INTESTIN));
const NOTEBOOK_DOULEUR = '06 — Douleurs chroniques';
const SOURCES_DOULEUR = sansSourcesEnQuarantaine(sourcesDuNotebook(NOTEBOOK_DOULEUR));

// La 4ᵉ valeur interpolée du $queryRaw est la liste des source_ids jointe par
// virgule (filter_source_ids). Ordre des interpolations : littéral, matchCount,
// minSimilarity, filtreSources.
function filtreSourcesDuDernierAppel(): string {
  const call = prisma.$queryRaw.mock.calls.at(-1);
  return call?.[4] as string;
}

// Le SELECT ne remonte plus metadata : le filtre rayon se fait au niveau SQL
// (filter_source_ids). Le mock rend donc des claims DÉJÀ filtrés par notebook.
function claim(over: Record<string, unknown> = {}) {
  return {
    claim_id: 'WN-CLAIM-0001',
    version_claim: 'v1',
    texte_normalise: 'Le magnésium bisglycinate soutient un sommeil de meilleure qualité.',
    classe_autorite: 'revue_systematique',
    niveau_preuve: 'modere',
    typologie_lecture: 'mecanistique',
    prescriptif: false,
    validateur: 'praticien@wellneuro.fr',
    valide_at: new Date('2026-07-20T00:00:00.000Z'),
    similarity: 0.82,
    ...over,
  };
}

describe('servirRayonCorpus (rayon corpus par notebook, barrière D-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
    prisma.$queryRaw.mockResolvedValue([]);
  });

  it('la correspondance micronutrition→notebook 10 a bien des sources (garde-fou fixture)', () => {
    expect(SOURCES_MICRO.length).toBeGreaterThan(0);
  });

  it('chaque rayon déclaré mappe un notebook du registre POURVU de sources (garde anti-typo)', () => {
    // Une faute de frappe dans un libellé de RAYON_VERS_NOTEBOOK rendrait
    // l'étagère silencieusement vide (fail-closed) — exactement le bug corrigé.
    // Ce garde couvre TOUS les rayons déclarés, y compris ceux encore inertes.
    for (const [rayon, notebook] of Object.entries(RAYON_VERS_NOTEBOOK)) {
      expect(
        sourcesDuNotebook(notebook).length,
        `rayon « ${rayon} » → notebook « ${notebook} » sans source (libellé erroné ?)`,
      ).toBeGreaterThan(0);
    }
  });

  // servirRayonCorpus ne gate plus sur un flag produit (retiré : un service
  // générique par rayon ne peut pas présumer lequel des flags — WN_C4_ENABLED
  // pour micronutrition, WN_RECHERCHE_CORPUS_ENABLED pour cognition/douleur/
  // intestin — s'applique à l'appelant). Le fail-closed vit désormais dans
  // chaque fonction d'accès par route (`getPractitionerC4Access`,
  // `getPractitionerRechercheCorpusAccess`, testées dans access.test.ts) ET
  // dans l'allowlist RAYONS_RECHERCHE_CORPUS que chaque route doit appliquer
  // (route.test.ts) — servirRayonCorpus lui-même ne restreint plus rien.

  it('RAYONS_RECHERCHE_CORPUS ne contient QUE cognition, douleur et intestin (allowlist de la route dédiée)', () => {
    expect([...RAYONS_RECHERCHE_CORPUS].sort()).toEqual(['cognition', 'douleur', 'intestin']);
  });

  it('sans requête : ne fait aucun appel, rend corpusVide sans erreur', async () => {
    const res = await servirRayonCorpus({ rayon: 'micronutrition', requete: '   ' });
    expect(res.corpusVide).toBe(true);
    expect(res.disponible).toBe(true);
    expect(res.claims).toEqual([]);
    expect(createEmbeddings).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rayon inconnu : résultat vide, JAMAIS un filtre ignoré (aucune requête base)', async () => {
    const res = await servirRayonCorpus({ rayon: 'rayon_inexistant', requete: 'magnésium' });
    expect(res.corpusVide).toBe(true);
    expect(res.claims).toEqual([]);
    expect(res.message).toMatch(/inconnu/i);
    expect(createEmbeddings).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('filtre AU NIVEAU SQL sur les sources du notebook du rayon (filter_source_ids)', async () => {
    prisma.$queryRaw.mockResolvedValue([claim()]);
    await servirRayonCorpus({ rayon: 'micronutrition', requete: 'magnésium' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    // Positions des interpolations : 1=vecteur, 2=matchCount, 3=minSimilarity, 4=filtreSources.
    const call = prisma.$queryRaw.mock.calls.at(-1)!;
    expect(call[2]).toBe(24);
    expect(call[3]).toBe(0.5);
    expect(call[4]).toBe(SOURCES_MICRO.join(','));
    expect(filtreSourcesDuDernierAppel()).toBe(SOURCES_MICRO.join(','));

    // Et la quarantaine sanitaire ne franchit pas la barrière : aucune des
    // sources servies n'est en quarantaine, alors que le notebook brut en
    // contient. Un claim VALIDÉ d'une notice mise en relecture pour raison de
    // sécurité n'a pas à être servi comme contenu clinique ordinaire.
    const servies = filtreSourcesDuDernierAppel().split(',');
    expect(servies.some((id) => estSourceEnQuarantaine(id))).toBe(false);
    expect(SOURCES_MICRO_BRUTES.some((id) => estSourceEnQuarantaine(id))).toBe(true);
    expect(servies.length).toBeLessThan(SOURCES_MICRO_BRUTES.length);
  });

  it('sert le rayon cognition avec le filter_source_ids du notebook 05', async () => {
    prisma.$queryRaw.mockResolvedValue([claim()]);
    await servirRayonCorpus({ rayon: 'cognition', requete: 'mémoire de travail' });
    expect(filtreSourcesDuDernierAppel()).toBe(SOURCES_COGNITION.join(','));
  });

  it('sert le rayon intestin avec le filter_source_ids du notebook 07', async () => {
    prisma.$queryRaw.mockResolvedValue([claim()]);
    await servirRayonCorpus({ rayon: 'intestin', requete: 'microbiote' });
    expect(filtreSourcesDuDernierAppel()).toBe(SOURCES_INTESTIN.join(','));
  });

  // Le garde anti-typo générique plus haut prouve que le libellé existe au
  // registre, PAS que « douleur » pointe le bon notebook : `douleur: '05 —
  // Cognition et mémoire'` passerait toute la suite au vert et servirait des
  // claims de cognition sous l'étiquette « Douleurs chroniques » — une
  // attribution clinique fausse sur un instrument de consultation.
  it('sert le rayon douleur avec le filter_source_ids du notebook 06', async () => {
    prisma.$queryRaw.mockResolvedValue([claim()]);
    await servirRayonCorpus({ rayon: 'douleur', requete: 'douleur neuropathique' });
    expect(SOURCES_DOULEUR.length).toBeGreaterThan(0);
    expect(filtreSourcesDuDernierAppel()).toBe(SOURCES_DOULEUR.join(','));
  });

  it('restitue tous les claims retournés par le filtre SQL, avec le rayon demandé', async () => {
    prisma.$queryRaw.mockResolvedValue([
      claim({ claim_id: 'WN-CLAIM-0001' }),
      claim({ claim_id: 'WN-CLAIM-0002' }),
    ]);
    const res = await servirRayonCorpus({ rayon: 'micronutrition', requete: 'magnésium' });
    expect(res.corpusVide).toBe(false);
    expect(res.claims.map(c => c.claimId)).toEqual(['WN-CLAIM-0001', 'WN-CLAIM-0002']);
    expect(res.claims.every(c => c.rayon === 'micronutrition')).toBe(true);
    expect(res.claims[0].validateur).toBe('praticien@wellneuro.fr');
  });

  it('conserve le drapeau prescriptif (servi, à baliser côté UI)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      claim({ claim_id: 'WN-CLAIM-0009', prescriptif: true }),
    ]);
    const res = await servirRayonCorpus({ rayon: 'micronutrition', requete: 'posologie' });
    expect(res.claims).toHaveLength(1);
    expect(res.claims[0].prescriptif).toBe(true);
  });

  it('corpus vide : aucun claim, corpusVide=true, message « en cours de constitution »', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const res = await servirRayonCorpus({ rayon: 'micronutrition', requete: 'magnésium sommeil' });
    expect(res.corpusVide).toBe(true);
    expect(res.claims).toEqual([]);
    expect(res.message).toMatch(/en cours de constitution/i);
  });

  it('embeddings indisponibles (chaîne non configurée) : dégrade en indisponible, jamais une erreur', async () => {
    createEmbeddings.mockRejectedValue(new Error('OPENAI_API_KEY est absent.'));
    const res = await servirRayonCorpus({ rayon: 'micronutrition', requete: 'magnésium' });
    expect(res.disponible).toBe(false);
    expect(res.corpusVide).toBe(true);
    expect(res.claims).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('un échec de récupération SQL dégrade proprement en indisponible', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('relation absente'));
    const res = await servirRayonCorpus({ rayon: 'micronutrition', requete: 'magnésium' });
    expect(res.disponible).toBe(false);
    expect(res.corpusVide).toBe(true);
  });
});
