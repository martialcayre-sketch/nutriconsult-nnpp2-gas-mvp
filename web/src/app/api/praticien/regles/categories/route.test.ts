import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: { functionalCategory: { create: vi.fn(), findMany: vi.fn() } },
}));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { DESCRIPTION_MAX } from '@/lib/supplement-library/gouvernance';
import { GET, POST } from './route';

const URL_BASE = 'http://localhost/api/praticien/regles/categories';

function requete(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/praticien/regles/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C4_ENABLED = 'true';
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    prisma.functionalCategory.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'cat_1', ...data }),
    );
  });

  it('refuse sans session, et drapeau éteint, sans rien écrire', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST(requete({ code: 'antioxydant', labelFr: 'Antioxydant' }))).status).toBe(401);

    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    delete process.env.WN_C4_ENABLED;
    const res = await POST(requete({ code: 'antioxydant', labelFr: 'Antioxydant' }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { reason: string }).reason).toBe('flag_eteint');
    expect(prisma.functionalCategory.create).not.toHaveBeenCalled();
  });

  it('crée une catégorie, description facultative rendue nulle', async () => {
    const res = await POST(requete({ code: 'antioxydant', labelFr: '  Antioxydant  ' }));
    expect(res.status).toBe(201);
    expect(prisma.functionalCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'antioxydant', labelFr: 'Antioxydant', description: null } }),
    );
  });

  it('refuse un code hors vocabulaire gouverné', async () => {
    for (const code of ['Antioxydant', 'anti-oxydant', '1antioxydant', '', 'a']) {
      const res = await POST(requete({ code, labelFr: 'Antioxydant' }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { reason: string }).reason).toBe('code_invalide');
    }
    expect(prisma.functionalCategory.create).not.toHaveBeenCalled();
  });

  it('refuse un libellé vide et une description trop longue', async () => {
    const sansLabel = await POST(requete({ code: 'antioxydant', labelFr: '   ' }));
    expect(sansLabel.status).toBe(400);
    expect(((await sansLabel.json()) as { reason: string }).reason).toBe('label_requis');

    const trop = await POST(requete({
      code: 'antioxydant', labelFr: 'Antioxydant', description: 'a'.repeat(DESCRIPTION_MAX + 1),
    }));
    expect(trop.status).toBe(400);
    expect(((await trop.json()) as { reason: string }).reason).toBe('description_trop_longue');
  });

  // Le code est UNIQUE en base : la garde existe, la route la traduit.
  it('traduit le doublon de code en 409', async () => {
    prisma.functionalCategory.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await POST(requete({ code: 'antioxydant', labelFr: 'Antioxydant' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe('code_deja_pris');
  });

  it('n’écrit que ce que la route valide — jamais `actif` reçu du client', async () => {
    await POST(requete({ code: 'antioxydant', labelFr: 'Antioxydant', actif: false }));
    const data = prisma.functionalCategory.create.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['code', 'description', 'labelFr']);
  });

  // UN RÉFÉRENTIEL QU'ON ÉCRIT SANS LE RELIRE N'EN EST PAS UN : le code est
  // unique, et sans liste une ressaisie rendrait 409 devant un écran muet.
  it('GET ne sert que les catégories ACTIVES, ordonnées par code', async () => {
    prisma.functionalCategory.findMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(prisma.functionalCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actif: true }, orderBy: { code: 'asc' } }),
    );
  });

  it('GET suit les mêmes portes que le POST', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    getServerSession.mockResolvedValue({ user: { email: 'praticien@wellneuro.fr' } });
    delete process.env.WN_C4_ENABLED;
    expect((await GET()).status).toBe(404);
    expect(prisma.functionalCategory.findMany).not.toHaveBeenCalled();
  });
});
