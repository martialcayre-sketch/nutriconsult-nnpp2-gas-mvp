import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    supplementSourceReference: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { CITATION_MAX } from '@/lib/supplement-library/gouvernance';
import { POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/regles/sources';

function requete(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CITATION = 'ANSES, avis du 2024-03-12 relatif aux compléments à base de levure de riz rouge.';

describe('POST /api/praticien/regles/sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.supplementSourceReference.findFirst.mockResolvedValue(null);
    prisma.supplementSourceReference.create.mockImplementation(
      ({ data }: { data: { citation: string; lienUrl: string | null } }) =>
        Promise.resolve({ id: 'src_1', ...data }),
    );
  });

  it('refuse sans session', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(requete({ citation: CITATION }));
    expect(res.status).toBe(401);
    expect(prisma.supplementSourceReference.create).not.toHaveBeenCalled();
  });

  // Le rayon C4 reste clos tant que son drapeau n'est pas ouvert : une source
  // écrite sur un environnement où le rayon n'existe pas serait une ligne que
  // personne n'a demandée.
  it('refuse drapeau éteint, sans rien écrire', async () => {
    delete process.env.WN_C4_ENABLED;
    const res = await POST(requete({ citation: CITATION }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { reason: string }).reason).toBe('flag_eteint');
    expect(prisma.supplementSourceReference.create).not.toHaveBeenCalled();
  });

  it('enregistre une citation seule, sans lien', async () => {
    const res = await POST(requete({ citation: `  ${CITATION}  ` }));
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { ok: boolean; source: { citation: string; lienUrl: string | null } };
    expect(payload.ok).toBe(true);
    // Détourée : un blanc de copier-coller ne doit pas rendre deux sources
    // distinctes de la même citation.
    expect(payload.source.citation).toBe(CITATION);
    expect(payload.source.lienUrl).toBeNull();
  });

  it('enregistre le lien quand il est ouvrable', async () => {
    const res = await POST(requete({ citation: CITATION, lienUrl: 'https://www.anses.fr/avis' }));
    expect(res.status).toBe(201);
    expect(prisma.supplementSourceReference.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { citation: CITATION, lienUrl: 'https://www.anses.fr/avis' } }),
    );
  });

  // UNE SOURCE SANS CITATION NE RÉFÉRENCE RIEN, et `validerContenuRegle` dit
  // déjà qu'une règle sans source ne peut pas exister : l'accepter vide
  // rendrait une telle règle possible par la bande.
  it('refuse une citation vide ou faite de blancs', async () => {
    for (const citation of ['', '   ', undefined]) {
      const res = await POST(requete({ citation }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { reason: string }).reason).toBe('citation_requise');
    }
    expect(prisma.supplementSourceReference.create).not.toHaveBeenCalled();
  });

  it('refuse une citation trop longue', async () => {
    const res = await POST(requete({ citation: 'a'.repeat(CITATION_MAX + 1) }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe('citation_trop_longue');
  });

  // UN LIEN QUI NE S'OUVRE PAS PROMET UNE VÉRIFICATION QU'IL NE PERMET PAS —
  // et `javascript:` dans un champ que l'écran rend en lien est une injection,
  // pas une référence.
  it('refuse un lien non http(s)', async () => {
    for (const lienUrl of ['javascript:alert(1)', 'data:text/html,<b>', 'anses.fr', 'ftp://x.y/z']) {
      const res = await POST(requete({ citation: CITATION, lienUrl }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { reason: string }).reason).toBe('lien_invalide');
    }
    expect(prisma.supplementSourceReference.create).not.toHaveBeenCalled();
  });

  // LE DOUBLON SCINDE LA LIGNÉE : deux règles citant « la même » source par deux
  // identifiants ne se relient plus. Garde applicative, faute d'unicité en base
  // (dette nommée à `D-131`).
  it('refuse une citation déjà présente, quelle que soit la casse', async () => {
    prisma.supplementSourceReference.findFirst.mockResolvedValue({ id: 'src_deja' });
    const res = await POST(requete({ citation: CITATION.toUpperCase() }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe('citation_deja_presente');
    expect(prisma.supplementSourceReference.create).not.toHaveBeenCalled();
    // La comparaison est bien insensible à la casse, et sur le texte détouré.
    expect(prisma.supplementSourceReference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { citation: { equals: CITATION.toUpperCase(), mode: 'insensitive' } },
      }),
    );
  });

  it('refuse un corps illisible', async () => {
    const res = await POST(new Request(URL_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe('invalid');
  });

  // `actif` n'est jamais reçu du client : une source naît active, et sa
  // désactivation est un autre geste que cette route n'ouvre pas.
  it('n’écrit que la citation et le lien — jamais `actif` reçu du client', async () => {
    await POST(requete({ citation: CITATION, actif: false }));
    const data = prisma.supplementSourceReference.create.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['citation', 'lienUrl']);
  });
});
