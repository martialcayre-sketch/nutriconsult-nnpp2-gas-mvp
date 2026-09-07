import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: { portailMagicLink: { create: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { emettreLienMagiquePourPraticien } from './emissionLienMagique';

describe('emettreLienMagiquePourPraticien', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.portailMagicLink.create.mockResolvedValue({});
    // `empreinteJeton` échoue EXPLICITEMENT sans secret, et `buildMagicLinkUrl`
    // a besoin de l'origine : les deux se posent ici, sans quoi les cas
    // « drapeau allumé » mesureraient une sortie d'erreur en croyant mesurer
    // le chemin nominal.
    vi.stubEnv('NEXTAUTH_SECRET', 'secret-de-banc');
    vi.stubEnv('NEXTAUTH_URL', 'https://app.wellneuro.fr');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('drapeau éteint : rend null et n’écrit RIEN', () => {
    // LA CONDITION DE LIVRABILITÉ DU LOT, pas une précaution.
    // `portail/lien/[jeton]` répond un 404 À CORPS NUL quand le drapeau est
    // éteint : un lien émis ici serait une page blanche dans la boîte du
    // patient — strictement pire que la page de connexion d'aujourd'hui.
    vi.stubEnv('WN_G4_LIEN_MAGIQUE', '');
    return emettreLienMagiquePourPraticien('PAT_1', 'p@wellneuro.fr').then(lien => {
      expect(lien).toBeNull();
      expect(prisma.portailMagicLink.create).not.toHaveBeenCalled();
    });
  });

  it('drapeau allumé : rend l’URL, et n’écrit que l’EMPREINTE du jeton', async () => {
    vi.stubEnv('WN_G4_LIEN_MAGIQUE', 'true');
    const avant = Date.now();
    const lien = await emettreLienMagiquePourPraticien('PAT_1', 'p@wellneuro.fr');

    expect(lien).toMatch(/^https:\/\/app\.wellneuro\.fr\/portail\/lien\/.+$/);
    const jetonDansLUrl = (lien as string).split('/portail/lien/')[1];
    const data = prisma.portailMagicLink.create.mock.calls[0][0].data as {
      idPatient: string; jetonEmpreinte: string; expireLe: Date; creePar: string;
    };
    expect(data.idPatient).toBe('PAT_1');
    // LE SECRET NE DOIT JAMAIS ENTRER EN BASE EN CLAIR : un dump ouvrirait des
    // espaces patients. C'est l'empreinte qui est stockée, le jeton ne sort que
    // vers l'e-mail.
    expect(data.jetonEmpreinte).not.toBe(jetonDansLUrl);
    expect(data.jetonEmpreinte.length).toBeGreaterThan(0);
    expect(data.creePar).toBe('praticien:p@wellneuro.fr');
    const heures = (data.expireLe.getTime() - avant) / 3_600_000;
    expect(heures).toBeGreaterThan(23.9);
    expect(heures).toBeLessThan(24.1);
  });

  it('une écriture qui échoue rend null, elle ne relance pas', async () => {
    // L'appelant a DÉJÀ créé sa consultation : propager ferait rendre
    // `success: false` sur un dossier bel et bien créé, et le praticien
    // recommencerait. On dégrade vers l'e-mail d'avant.
    vi.stubEnv('WN_G4_LIEN_MAGIQUE', 'true');
    prisma.portailMagicLink.create.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(emettreLienMagiquePourPraticien('PAT_1', 'p@wellneuro.fr')).resolves.toBeNull();
  });

  it('sans NEXTAUTH_SECRET, rend null sans lever', async () => {
    // `empreinteJeton` lève explicitement plutôt que de calculer une empreinte
    // avec un secret vide. Cette sortie-là passait inaperçue tant que le banc
    // ne posait pas le secret : il mesurait `null` en croyant mesurer le
    // drapeau.
    vi.stubEnv('WN_G4_LIEN_MAGIQUE', 'true');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    await expect(emettreLienMagiquePourPraticien('PAT_1', 'p@wellneuro.fr')).resolves.toBeNull();
    expect(prisma.portailMagicLink.create).not.toHaveBeenCalled();
  });
});
