import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DossierDeuxVoixView } from '@/components/patient-companion/DossierDeuxVoixView';
import { isDossierDeuxVoixEnabled } from '@/lib/patient/featureFlag';

// Le « dossier à deux voix » (Alliance 6.0-A, LOT-06) — page mince, patron de
// `comprehension/page.tsx` : lien de retour + composant client. La session est
// portée par le cookie portail ; la lecture et la ratification passent par
// /api/portail/dossier, qui garde l'accès.
//
// Le drapeau garde l'écran ET la route. Ici `notFound()` plutôt qu'un message :
// tant que la surface n'est pas ouverte, elle n'existe pas pour le patient.
//
// LE JETON D'URL N'EST PAS UN FACTEUR D'AUTHENTIFICATION — il n'est transmis au
// composant que pour construire les liens vers les deux autres écrans du
// portail. C'est le cookie signé qui dit qui lit.
export default async function PortailDossierPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isDossierDeuxVoixEnabled()) notFound();

  return (
    <div className="w-full max-w-2xl space-y-4">
      <Link
        href={`/portail/${token}/questionnaires`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        ← Mon parcours
      </Link>
      <DossierDeuxVoixView token={token} />
    </div>
  );
}
