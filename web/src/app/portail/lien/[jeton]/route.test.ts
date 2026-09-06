import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, logger } = vi.hoisted(() => ({
  prisma: {
    portailMagicLink: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    patient: { findUnique: vi.fn() },
  },
  logger: { security: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/observability/logger', () => ({ logger }));

import { empreinteJeton } from '@/lib/portail/lienMagique';
import { GET } from './route';

const JETON = 'jeton-de-test-non-production';
const DEMAIN = new Date(Date.now() + 60 * 60 * 1000);
const HIER = new Date(Date.now() - 60 * 60 * 1000);

function requete(jeton = JETON): Request {
  return new Request(`http://localhost/portail/lien/${jeton}`);
}

function appeler(jeton = JETON) {
  return GET(requete(jeton), { params: { jeton } });
}

const LIEN_VALIDE = { id: 'lk_1', idPatient: 'PAT_TEST', expireLe: DEMAIN, consommeLe: null };
// LOT-04 : la garde de révocation qui vivait dans `ensureActivePortalAccess`
// (retiré) est désormais une lecture explicite du patient dans la route.
const PATIENT_ACTIF = { email: 'michel.dogne@fictif.wellneuro.fr', actif: true, accessTokenRevoked: false };

const NEXTAUTH_URL_AVANT = process.env.NEXTAUTH_URL;

describe('GET /portail/lien/[jeton]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = 'secret-de-test-non-production';
    // Posée pour tout le fichier : les redirections se bâtissent sur cette
    // base (branche de production d'`urlPubliquePortail`), quel que soit
    // l'environnement qui lance la suite. Le repli sans variable est couvert
    // par `lib/portail/urlPublique.test.ts`.
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.WN_G4_LIEN_MAGIQUE = 'true';
    prisma.portailMagicLink.findUnique.mockResolvedValue(LIEN_VALIDE);
    prisma.portailMagicLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.portailMagicLink.update.mockResolvedValue({});
    prisma.patient.findUnique.mockResolvedValue(PATIENT_ACTIF);
  });

  afterEach(() => {
    if (NEXTAUTH_URL_AVANT === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = NEXTAUTH_URL_AVANT;
  });

  // Ce qui rend le NO-GO réel : merger la migration n'active rien.
  it('drapeau éteint : la route n’existe pas', async () => {
    delete process.env.WN_G4_LIEN_MAGIQUE;
    const res = await appeler();
    expect(res.status).toBe(404);
    expect(prisma.portailMagicLink.findUnique).not.toHaveBeenCalled();
  });

  it('un lien valide ouvre la session et renvoie vers l’espace patient (segment = idPatient, jamais un secret)', async () => {
    const res = await appeler();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/portail/PAT_TEST');
    // Le jeton secret ne doit plus figurer dans l'URL d'atterrissage (LOT-04).
    expect(res.headers.get('location')).not.toContain('TOK');
    expect(res.headers.get('set-cookie')).toContain('wn_portail=');
  });

  // Régression du 2026-08-25 : derrière le routeur Scalingo, `req.url` porte
  // l'hôte interne du conteneur — l'atterrissage doit viser NEXTAUTH_URL.
  it('l’atterrissage vise l’hôte public même quand la requête porte l’hôte interne du conteneur', async () => {
    const res = await GET(
      new Request(`https://localhost:23577/portail/lien/${JETON}`),
      { params: { jeton: JETON } },
    );
    expect(res.headers.get('location')).toBe('http://localhost:3000/portail/PAT_TEST');
  });

  // Même exigence sur le REFUS — c'est l'atterrissage que la production du
  // 2026-08-25 montrait cassé (`Location: https://localhost:<port>/…`).
  it('le refus vise l’hôte public même quand la requête porte l’hôte interne du conteneur', async () => {
    prisma.portailMagicLink.findUnique.mockResolvedValue(null);
    const res = await GET(
      new Request('https://localhost:23577/portail/lien/inconnu'),
      { params: { jeton: 'inconnu' } },
    );
    expect(res.headers.get('location')).toBe('http://localhost:3000/portail/lien/indisponible');
  });

  // Le jeton n'est jamais stocké : c'est son empreinte qui sert de clé.
  it('la recherche se fait sur l’empreinte, jamais sur le jeton', async () => {
    await appeler();
    const where = prisma.portailMagicLink.findUnique.mock.calls[0][0].where;
    expect(where.jetonEmpreinte).toBe(empreinteJeton(JETON));
    expect(JSON.stringify(where)).not.toContain(JETON);
  });

  // L'invariant du gate : le second passage n'ouvre rien.
  it('un lien déjà consommé est refusé, et le refus est tracé en base', async () => {
    prisma.portailMagicLink.findUnique.mockResolvedValue({ ...LIEN_VALIDE, consommeLe: HIER });
    const res = await appeler();
    expect(res.headers.get('location')).toContain('/portail/lien/indisponible');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(prisma.portailMagicLink.update).toHaveBeenCalledWith({
      where: { id: 'lk_1' },
      data: { rejeuxRefuses: { increment: 1 }, derniereTentative: expect.any(Date) },
    });
  });

  it('un lien expiré est refusé, et le refus est tracé en base', async () => {
    prisma.portailMagicLink.findUnique.mockResolvedValue({ ...LIEN_VALIDE, expireLe: HIER });
    const res = await appeler();
    expect(res.headers.get('location')).toContain('/portail/lien/indisponible');
    expect(prisma.portailMagicLink.update).toHaveBeenCalled();
  });

  // La consommation ne doit pas être « lire puis écrire » : entre les deux,
  // une seconde requête passerait.
  it('la consommation est atomique — écriture conditionnée à `consommeLe: null`', async () => {
    await appeler();
    expect(prisma.portailMagicLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'lk_1', consommeLe: null },
      data: { consommeLe: expect.any(Date) },
    });
  });

  it('perdre la course de consommation vaut refus, pas ouverture', async () => {
    prisma.portailMagicLink.updateMany.mockResolvedValue({ count: 0 });
    const res = await appeler();
    expect(res.headers.get('location')).toContain('/portail/lien/indisponible');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  // INVARIANT RÉVOCATION (LOT-04) : sans la garde explicite ajoutée dans la
  // route, un patient révoqué rentrerait par lien magique — la garde vivait
  // avant dans `ensureActivePortalAccess`, désormais retiré.
  it('un accès portail révoqué est refusé au lien magique, sans rien dire de plus', async () => {
    prisma.patient.findUnique.mockResolvedValue({ ...PATIENT_ACTIF, accessTokenRevoked: true });
    const res = await appeler();
    expect(res.headers.get('location')).toContain('/portail/lien/indisponible');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('un compte inactif est refusé au lien magique', async () => {
    prisma.patient.findUnique.mockResolvedValue({ ...PATIENT_ACTIF, actif: false });
    const res = await appeler();
    expect(res.headers.get('location')).toContain('/portail/lien/indisponible');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  // L'ORDRE, ET NON SEULEMENT LE REFUS. Les deux bancs ci-dessus passaient déjà
  // quand la garde vivait APRÈS la consommation : le lien était brûlé, puis
  // refusé. Ils ne pouvaient donc pas voir que le patient perdait son lien sans
  // jamais entrer — et que la ligne restait avec `consommeLe` renseigné et
  // `rejeuxRefuses` à zéro, soit la forme exacte d'une entrée réussie pour qui
  // lit cette colonne. Ces deux-ci gardent l'ordre lui-même (`D-126`).
  it('un compte fermé ne fait pas BRÛLER le lien : rien n’est consommé', async () => {
    prisma.patient.findUnique.mockResolvedValue({ ...PATIENT_ACTIF, actif: false });
    await appeler();
    expect(prisma.portailMagicLink.updateMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    prisma.portailMagicLink.findUnique.mockResolvedValue(LIEN_VALIDE);
    prisma.patient.findUnique.mockResolvedValue({ ...PATIENT_ACTIF, accessTokenRevoked: true });
    await appeler();
    expect(prisma.portailMagicLink.updateMany).not.toHaveBeenCalled();
  });

  it('le refus sur compte fermé laisse une trace en base, comme les autres', async () => {
    prisma.patient.findUnique.mockResolvedValue({ ...PATIENT_ACTIF, actif: false });
    await appeler();
    const [appel] = prisma.portailMagicLink.update.mock.calls[0];
    expect(appel.where.id).toBe('lk_1');
    expect(appel.data.rejeuxRefuses).toEqual({ increment: 1 });
    expect(appel.data.derniereTentative).toBeInstanceOf(Date);
  });

  // Rien ne doit distinguer les quatre refus : ni l'URL, ni le code HTTP.
  it('consommé, expiré, inconnu et révoqué atterrissent au même endroit', async () => {
    const destinations: string[] = [];

    prisma.portailMagicLink.findUnique.mockResolvedValue({ ...LIEN_VALIDE, consommeLe: HIER });
    destinations.push((await appeler()).headers.get('location') ?? '');

    prisma.portailMagicLink.findUnique.mockResolvedValue({ ...LIEN_VALIDE, expireLe: HIER });
    destinations.push((await appeler()).headers.get('location') ?? '');

    prisma.portailMagicLink.findUnique.mockResolvedValue(null);
    destinations.push((await appeler()).headers.get('location') ?? '');

    prisma.portailMagicLink.findUnique.mockResolvedValue(LIEN_VALIDE);
    prisma.patient.findUnique.mockResolvedValue({ ...PATIENT_ACTIF, accessTokenRevoked: true });
    destinations.push((await appeler()).headers.get('location') ?? '');

    expect(new Set(destinations).size).toBe(1);
  });

  // `sanitizeUrl` conserve le chemin, et le chemin EST le jeton : sans route
  // journalisée en dur, chaque tentative écrirait un secret d'accès dans les
  // logs. Ce test garde cette substitution.
  it('le jeton n’apparaît jamais dans ce qui est journalisé', async () => {
    prisma.portailMagicLink.findUnique.mockResolvedValue(null);
    await appeler();
    await appeler();

    const journalise = JSON.stringify([
      ...logger.security.mock.calls,
      ...logger.error.mock.calls,
    ]);
    expect(journalise).not.toContain(JETON);
    expect(journalise).toContain('/portail/lien/[jeton]');
  });
});
