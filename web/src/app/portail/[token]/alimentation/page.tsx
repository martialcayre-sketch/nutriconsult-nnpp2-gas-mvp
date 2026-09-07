import Link from 'next/link';
import { cookies } from 'next/headers';
import { PatientFoodObservationPanel } from '@/components/food-observation/PatientFoodObservationPanel';
import { PatientFoodCompassProtocolSection } from '@/components/patient-food-compass/PatientFoodCompassProtocolSection';
import { PORTAIL_COOKIE_NAME, verifyPatientSession } from '@/lib/patient-session';

// Le brouillon local du Journal Alimentaire est nommé d'après l'identité de la
// session portail, pas d'après le jeton de l'URL (préalable G4). Cette page
// étant rendue côté serveur, l'identité se lit directement du cookie signé :
// pas d'aller-retour réseau, et le jeton n'a plus à descendre jusqu'au panneau.
export default async function PortailAlimentationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = verifyPatientSession((await cookies()).get(PORTAIL_COOKIE_NAME)?.value);

  return (
    <div className="w-full max-w-2xl space-y-4">
      <Link href={`/portail/${token}/questionnaires`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        ← Mon parcours
      </Link>
      <PatientFoodCompassProtocolSection token={token} />
      <PatientFoodObservationPanel idPatient={session?.idPatient ?? null} />
    </div>
  );
}
