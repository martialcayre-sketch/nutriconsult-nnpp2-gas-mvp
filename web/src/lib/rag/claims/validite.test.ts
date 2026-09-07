import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import {
  CLAIM_ID_RE,
  VERSION_CLAIM_RE,
  claimValideAuCorpus,
  claimsValidesAuCorpus,
  cleClaim,
} from './validite';

// [[D-140]] — ce module est le SEUL endroit qui réponde « ce claim est-il
// valide ? » pour une règle clinique. Aucune clé étrangère ne peut le faire :
// `rag_corpus_claims` est SQL-brut hors `schema.prisma`.

/** Les paramètres interpolés dans le `$queryRaw` du dernier appel. */
function parametres(): unknown[] {
  const [, ...valeurs] = prisma.$queryRaw.mock.calls.at(-1) as unknown[];
  return valeurs;
}

/** Le texte SQL du dernier appel, fragments recollés. */
function sql(): string {
  const [fragments] = prisma.$queryRaw.mock.calls.at(-1) as [string[]];
  return fragments.join(' ? ');
}

describe('claimsValidesAuCorpus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
  });

  it('ne pose aucune question sans référence', async () => {
    expect((await claimsValidesAuCorpus([])).size).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rend les couples que le corpus reconnaît, et eux seuls', async () => {
    prisma.$queryRaw.mockResolvedValue([{ claim_id: 'WN-CL-2026-001', version_claim: 'v1.0' }]);
    const valides = await claimsValidesAuCorpus([
      { claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' },
      { claimId: 'WN-CL-2026-002', versionClaim: 'v1.0' },
    ]);
    expect(valides.has('WN-CL-2026-001::v1.0')).toBe(true);
    expect(valides.has('WN-CL-2026-002::v1.0')).toBe(false);
  });

  // Plusieurs règles peuvent reposer sur le même claim : une seule question.
  it('dédoublonne les références avant d’interroger le corpus', async () => {
    await claimsValidesAuCorpus([
      { claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' },
      { claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' },
      { claimId: 'WN-CL-2026-001', versionClaim: 'v2.0' },
    ]);
    expect(parametres()).toEqual([
      ['WN-CL-2026-001', 'WN-CL-2026-001'],
      ['v1.0', 'v2.0'],
    ]);
  });

  // LE POINT QUI COMPTE. `claim_id = ANY(...) AND version_claim = ANY(...)`
  // ferait le PRODUIT CROISÉ des deux listes : une règle citant la version d'un
  // AUTRE claim demandé passerait pour valide. `unnest(a, b)` apparie position
  // par position, et c'est ce que la requête doit faire.
  it('apparie les deux colonnes POSITION PAR POSITION, jamais en produit croisé', async () => {
    await claimsValidesAuCorpus([{ claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' }]);
    expect(sql()).toContain('unnest');
    expect(sql()).not.toContain('ANY');
  });

  // Les cinq prédicats de `match_wellneuro_rag_claims`, mot pour mot : un claim
  // que la voie de récupération refuserait de servir ne peut pas fonder une
  // règle. Deux réponses différentes sur le même claim seraient une incohérence
  // clinique, pas une nuance.
  it.each([
    ['actif', 'c.active = true'],
    ['statut validé', "c.statut = 'VALIDE'"],
    ['non patient', 'c.patient_identifiable = false'],
    ['compartiment actif', "c.compartment = 'ACTIF'"],
    ['adossé à un verbatim source', 'rag_corpus_claim_sources'],
  ])('exige que le claim soit %s', async (_libelle, fragment) => {
    await claimsValidesAuCorpus([{ claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' }]);
    expect(sql()).toContain(fragment);
  });

  // AUCUN TEXTE NE SORT : la sélection ne rend que l'identifiant déjà fourni
  // par l'appelant. Rien du corpus ne transite par ce chemin.
  it('ne sélectionne aucun contenu de claim', async () => {
    await claimsValidesAuCorpus([{ claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' }]);
    expect(sql()).not.toContain('texte_normalise');
  });
});

describe('claimValideAuCorpus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend vrai sur le couple EXACT, faux sur une autre version', async () => {
    prisma.$queryRaw.mockResolvedValue([{ claim_id: 'WN-CL-2026-001', version_claim: 'v1.0' }]);
    expect(await claimValideAuCorpus({ claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' })).toBe(true);

    prisma.$queryRaw.mockResolvedValue([]);
    expect(await claimValideAuCorpus({ claimId: 'WN-CL-2026-001', versionClaim: 'v2.0' })).toBe(false);
  });
});

describe('formats recopiés des CHECK de rag_corpus_claims', () => {
  it.each([
    ['WN-CL-2026-001', true],
    ['WN-CL-0047-008', true],
    ['CL-2026-001', false],
    ['WN-CL-26-001', false],
    ['WN-CL-2026-0011', false],
    ['', false],
  ])('claim « %s » → %s', (valeur, attendu) => {
    expect(CLAIM_ID_RE.test(valeur)).toBe(attendu);
  });

  it.each([
    ['v1.0', true],
    ['1.0', true],
    ['v12.34', true],
    ['premiere', false],
    ['v1', false],
  ])('version « %s » → %s', (valeur, attendu) => {
    expect(VERSION_CLAIM_RE.test(valeur)).toBe(attendu);
  });

  // La clé porte le COUPLE : `rag_corpus_claims` est UNIQUE sur (claim_id,
  // version_claim), et deux versions du même claim ne sont pas le même claim.
  it('la clé de carte distingue deux versions d’un même claim', () => {
    expect(cleClaim({ claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' }))
      .not.toBe(cleClaim({ claimId: 'WN-CL-2026-001', versionClaim: 'v2.0' }));
  });
});
