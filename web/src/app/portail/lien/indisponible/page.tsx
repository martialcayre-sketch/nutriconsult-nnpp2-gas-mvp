import { notFound } from 'next/navigation';
import {
  isG4LienMagiqueEnabled,
  isG4RedemandePatientEnabled,
  isG5GooglePatientEnabled,
} from '@/lib/portail/featureFlag';
import { MESSAGE_LIEN_INDISPONIBLE } from '@/lib/portail/lienMagique';
import { DemandeLienForm } from '@/components/patient/DemandeLienForm';
import { PatientCard } from '@/components/patient/ui/PatientCard';
import { PatientInlineMessage } from '@/components/patient/ui/PatientInlineMessage';
import { PatientPageHeader } from '@/components/patient/ui/PatientPageHeader';
import { patientButtonClassName } from '@/components/patient/ui/PatientButton';

// Atterrissage unique de tous les refus de lien magique (gate G4) : consommé,
// expiré, inconnu, portail révoqué. Un seul écran, un seul message — c'est ce
// qui empêche d'apprendre quoi que ce soit en sondant des jetons.
//
// Le segment statique `lien/indisponible` prime sur `lien/[jeton]` en App
// Router : cette page n'est jamais confondue avec une tentative d'ouverture.
//
// `force-dynamic` n'est pas décoratif : sans lui, Next prérend cette page au
// build et y fige la valeur du drapeau de ce moment-là. Une bascule de
// `WN_G4_LIEN_MAGIQUE` dans l'environnement Vercel resterait alors sans effet
// jusqu'au déploiement suivant — un drapeau qu'il faut redéployer pour changer
// n'en est pas un.
export const dynamic = 'force-dynamic';

export default function LienIndisponiblePage() {
  if (!isG4LienMagiqueEnabled()) notFound();

  return (
    <div className="w-full max-w-md space-y-4">
      <PatientCard className="space-y-4">
        <PatientPageHeader
          center
          title="Votre lien n’est plus valable"
          subtitle={MESSAGE_LIEN_INDISPONIBLE}
        />
        {/* Le titre et le message ne varient jamais : consommé, expiré, inconnu
            ou révoqué se lisent pareil. Seule l'ACTION proposée dépend de
            l'ouverture du canal public — jamais la raison du refus. */}
        {isG4RedemandePatientEnabled() ? (
          <DemandeLienForm />
        ) : (
          <PatientInlineMessage tone="info">
            Demandez un nouveau lien à votre praticien : il vous en enverra un par e-mail.
          </PatientInlineMessage>
        )}
        {/* Gate G5 : quand l'entrée par Google est ouverte, ce cul-de-sac cesse
            d'en être un — la personne peut entrer sans attendre d'e-mail. Le
            lien n'apparaît que si le chemin existe vraiment. */}
        {isG5GooglePatientEnabled() && (
          // Navigation pleine page ASSUMÉE : `connexion` est `force-dynamic` pour
          // relire ses drapeaux à chaque requête, et ce cul-de-sac doit repartir
          // d'un état propre. Passer à `<Link>` changerait le comportement — pas
          // le rôle d'une PR de version.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/portail/connexion" className={patientButtonClassName('ghost', 'w-full')}>
            Continuer avec Google
          </a>
        )}
      </PatientCard>
    </div>
  );
}
