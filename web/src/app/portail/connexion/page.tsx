import {
  isG4LienMagiqueEnabled,
  isG4RedemandePatientEnabled,
  isG5GooglePatientEnabled,
} from '@/lib/portail/featureFlag';
import { MESSAGE_ACCES_GOOGLE_REFUSE } from '@/lib/portail/googleIdentite';
import { DemandeLienForm } from '@/components/patient/DemandeLienForm';
import { PatientCard } from '@/components/patient/ui/PatientCard';
import { PatientInlineMessage } from '@/components/patient/ui/PatientInlineMessage';
import { PatientPageHeader } from '@/components/patient/ui/PatientPageHeader';
import { patientButtonClassName } from '@/components/patient/ui/PatientButton';

// Entrée du portail SANS jeton — la porte unique de reprise d'accès (LOT-04).
//
// Depuis le retrait du lien permanent, c'est ICI qu'aboutissent les liens morts
// et les sessions expirées. La page offre les DEUX chemins d'entrée restants :
// Google (gate G5) et la réception d'un lien d'accès par e-mail (gate G4,
// redemande self-service). Elle ne rend JAMAIS `notFound()` : le jeton permanent
// ne fonctionne plus, un 404 ici enfermerait les patients dehors (revue
// adversariale). Si aucune voie n'est ouverte, elle indique au moins comment
// obtenir un accès (via le praticien) — jamais une page vide.
//
// `force-dynamic` n'est pas décoratif : sans lui, Next prérendrait la page au
// build et y figerait la valeur des drapeaux de ce moment-là.
export const dynamic = 'force-dynamic';

export default async function ConnexionPortailPage({
  searchParams,
}: {
  searchParams?: Promise<{ etat?: string }>;
}) {
  const parametres = await searchParams;
  const googleActif = isG5GooglePatientEnabled();
  // La redemande self-service exige les DEUX drapeaux (canal magique + canal
  // public non authentifié), exactement comme la route `lien/demande`.
  const redemandeActive = isG4LienMagiqueEnabled() && isG4RedemandePatientEnabled();

  // Le paramètre ne prend qu'une valeur : tous les refus du chemin Google
  // atterrissent ici, à l'identique. Rien dans cet écran ne dit lequel des
  // motifs s'applique — c'est la propriété de non-oracle.
  const refuse = parametres?.etat === 'refus';

  return (
    <div className="w-full max-w-md space-y-4">
      <PatientCard className="space-y-4">
        <PatientPageHeader
          center
          title="Accéder à votre espace"
          subtitle="Utilisez l’adresse e-mail que vous avez communiquée à votre praticien."
        />

        {refuse && <PatientInlineMessage tone="error">{MESSAGE_ACCES_GOOGLE_REFUSE}</PatientInlineMessage>}

        {googleActif && (
          <>
            {/* Un lien et non un bouton : la route pose un cookie puis redirige,
                elle se navigue. Pas de JavaScript nécessaire pour entrer. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                `/portail/google` est un ROUTE HANDLER (`app/portail/google/route.ts`),
                pas une page : il pose un cookie puis redirige. `<Link>` y ferait une
                navigation client vers une cible qui n'en est pas une. La règle, qui
                scanne désormais aussi l'app router, se trompe de cas. */}
            <a href="/portail/google" className={patientButtonClassName('primary', 'w-full')}>
              Continuer avec Google
            </a>
            {/* Dit AVANT le clic, pas après (registre : Google sous-traitant
                nouveau, scope `openid email`, aucune donnée de santé). */}
            <p className="text-xs text-muted-foreground text-center">
              Vous serez redirigé vers Google, qui apprendra que vous vous connectez à cette
              application. Seule votre adresse e-mail est transmise — aucune donnée de santé.
            </p>
          </>
        )}

        {/* Réception d'un lien d'accès par e-mail : le chemin pour qui n'utilise
            pas Google. Réponse indifférenciée (non-oracle) — voir DemandeLienForm.
            Sans le canal public, on rappelle au moins qu'un praticien peut en envoyer. */}
        {redemandeActive ? (
          <DemandeLienForm />
        ) : (
          <PatientInlineMessage tone="info">
            Vous avez reçu un lien d’accès par e-mail ? Il reste valable : ouvrez-le directement.
            Vous pouvez aussi en demander un à votre praticien.
          </PatientInlineMessage>
        )}
      </PatientCard>
    </div>
  );
}
