import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizePortail, resolveProtocoleDiffuse, resolvePatientFoodCompassView, reconstructProtocolDraft, prisma } = vi.hoisted(() => ({
  authorizePortail: vi.fn(),
  resolveProtocoleDiffuse: vi.fn(),
  resolvePatientFoodCompassView: vi.fn(),
  reconstructProtocolDraft: vi.fn(),
  prisma: { protocolDraft: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/protocol/portailProtocol', () => ({ authorizePortail, resolveProtocoleDiffuse }));
vi.mock('@/lib/protocol/fromPrisma', () => ({ reconstructProtocolDraft }));
vi.mock('@/lib/food-compass/patientReference', () => ({ resolvePatientFoodCompassView }));

import { GET } from './route';

const diffuse = {
  protocolDraftId: 'proto_DEC#approved', protocolDraftInputHash: 'approved',
  decisionCardInputHash: 'decision', approvedAt: new Date('2026-07-18T11:00:00.000Z'),
  approvedBy: 'practitioner', confirmation: 'content_approved_for_diffusion',
};
const actionRef = { foodRef: 'ciqual-2025-v1:26034', refHash: 'ref-hash' };
const safeView = {
  foodRef: '26034', foodLabel: 'Sardine',
  qualitativeSummary: 'Cet aliment fait partie de l’action relue avec votre praticien.',
  reasons: ['Cette lecture est reliée à la priorité choisie.'],
  sourceLabel: 'Table Ciqual, Anses',
  limitations: ['Cette lecture accompagne votre protocole.'], alternative: null,
};

function request() {
  return new Request('http://localhost/api/portail/boussole/26034');
}

describe('GET /api/portail/boussole/[foodRef]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WN_C5_ENABLED = 'true';
    authorizePortail.mockResolvedValue({ idPatient: 'PAT_1', idAssignation: 'ASS_1' });
    resolveProtocoleDiffuse.mockResolvedValue(diffuse);
    prisma.protocolDraft.findUnique.mockResolvedValue({ payload: {}, inputHash: 'approved' });
    reconstructProtocolDraft.mockReturnValue({ actions: [{ type: 'food', foodCompassRef: actionRef }] });
    resolvePatientFoodCompassView.mockResolvedValue(safeView);
  });

  it('reste introuvable lorsque C5 est désactivée', async () => {
    process.env.WN_C5_ENABLED = 'false';
    const response = await GET(request(), { params: Promise.resolve({ foodRef: '26034' }) });
    expect(response.status).toBe(404);
    expect(authorizePortail).not.toHaveBeenCalled();
  });

  it('exige une session portail', async () => {
    authorizePortail.mockResolvedValue({ ok: false, reason: 'unauthenticated', error: 'Connexion requise.' });
    expect((await GET(request(), { params: Promise.resolve({ foodRef: '26034' }) })).status).toBe(401);
  });

  it('répond toujours 404 pour un patient, protocole ou aliment non autorisé', async () => {
    authorizePortail.mockResolvedValue({ ok: false, reason: 'not_found', error: 'Suivi absent.' });
    const patientResponse = await GET(request(), { params: Promise.resolve({ foodRef: '26034' }) });
    expect(patientResponse.status).toBe(404);
    const patientBody = await patientResponse.json();

    authorizePortail.mockResolvedValue({ idPatient: 'PAT_1', idAssignation: 'ASS_1' });
    resolveProtocoleDiffuse.mockResolvedValue(null);
    const protocolResponse = await GET(request(), { params: Promise.resolve({ foodRef: '26034' }) });
    expect(protocolResponse.status).toBe(404);
    expect(await protocolResponse.json()).toEqual(patientBody);

    resolveProtocoleDiffuse.mockResolvedValue(diffuse);
    reconstructProtocolDraft.mockReturnValue({ actions: [] });
    const foodResponse = await GET(request(), { params: Promise.resolve({ foodRef: '26034' }) });
    expect(foodResponse.status).toBe(404);
    expect(await foodResponse.json()).toEqual(patientBody);
  });

  it('projette uniquement la vue qualitative autorisée', async () => {
    const response = await GET(request(), { params: Promise.resolve({ foodRef: '26034' }) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ ok: true, view: safeView });
    expect(JSON.stringify(payload)).not.toMatch(/score|percentile|inputHash|refHash|100\s*%/i);
    expect(resolvePatientFoodCompassView).toHaveBeenCalledWith(expect.objectContaining({
      idPatient: 'PAT_1', actionRef,
    }));
  });

  it('masque une projection partielle ou incohérente en 404', async () => {
    resolvePatientFoodCompassView.mockResolvedValue(null);
    expect((await GET(request(), { params: Promise.resolve({ foodRef: '26034' }) })).status).toBe(404);
  });
});
