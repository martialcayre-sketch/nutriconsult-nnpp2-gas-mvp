import { prisma } from '@/lib/prisma';
import { isG4LienMagiqueEnabled } from '@/lib/portail/featureFlag';
import { buildMagicLinkUrl } from '@/lib/consultation/email';
import { creerJeton, empreinteJeton, expirationDepuis, originePraticien } from '@/lib/portail/lienMagique';

/**
 * Émet un lien magique pour le geste PAR DÉFAUT du praticien (création de
 * consultation, « Renvoyer le lien »), ou rend `null`.
 *
 * DEUX SORTIES `null`, ET LES DEUX COMPTENT.
 *
 * 1. Drapeau éteint. `portail/lien/[jeton]` répond alors un 404 À CORPS NUL —
 *    pas l'écran « lien indisponible ». Un lien émis ici serait une page
 *    blanche dans la boîte du patient : strictement pire que la page de
 *    connexion d'aujourd'hui. La garde est donc la condition de livrabilité du
 *    lot, pas une précaution.
 * 2. Échec d'écriture (y compris `NEXTAUTH_SECRET` absent, sur quoi
 *    `empreinteJeton` lève). L'appelant a DÉJÀ créé sa consultation quand il
 *    nous appelle : propager ferait rendre `success: false` sur un dossier bel
 *    et bien créé, et le praticien recommencerait. On dégrade vers l'e-mail
 *    d'avant — la page d'accès durable, qui ne dépend de rien.
 *
 * CE QUE CETTE FONCTION NE GARDE PAS. La RÉVOCATION est levée par les deux
 * appelants juste au-dessus : le portail est ouvert à l'instant de l'émission.
 * La CLÔTURE DE SUIVI, non — `api/praticien/consultations` la garde
 * (`accepteNouvelEnvoi`), `api/praticien/token` (issue/resend) ne la garde pas,
 * et l'atterrissage ne lit que `actif` et `accessTokenRevoked`. Un futur
 * appelant doit poser sa garde de clôture lui-même ; celle-ci n'en tient pas
 * lieu.
 */
export async function emettreLienMagiquePourPraticien(
  idPatient: string,
  emailPraticienSession: string,
): Promise<string | null> {
  if (!isG4LienMagiqueEnabled()) return null;
  try {
    const jeton = creerJeton();
    await prisma.portailMagicLink.create({
      data: {
        idPatient,
        jetonEmpreinte: empreinteJeton(jeton),
        expireLe: expirationDepuis(new Date()),
        creePar: originePraticien(emailPraticienSession),
      },
    });
    // Le jeton ne sort que par ce retour, vers l'e-mail. Jamais journalisé.
    return buildMagicLinkUrl(jeton);
  } catch (e) {
    console.error('[emissionLienMagique]', (e as Error).message);
    return null;
  }
}
