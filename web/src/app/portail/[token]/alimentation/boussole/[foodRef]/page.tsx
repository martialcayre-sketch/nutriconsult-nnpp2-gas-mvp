import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PatientFoodCompassZoom } from '@/components/patient-food-compass/PatientFoodCompassZoom';
import { isC5Enabled } from '@/lib/food-compass/featureFlag';

export default async function PatientFoodCompassPage({
  params,
}: {
  params: Promise<{ token: string; foodRef: string }>;
}) {
  // L'`await` vient APRÈS la garde de drapeau : `notFound()` doit rester le
  // premier geste, sans quoi le refus dépendrait d'une résolution de promesse.
  if (!isC5Enabled(process.env.WN_C5_ENABLED)) notFound();
  const { token, foodRef } = await params;
  return (
    <div className="w-full max-w-2xl space-y-4">
      <Link href={`/portail/${token}/alimentation`} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
        ← Mon carnet alimentaire
      </Link>
      <PatientFoodCompassZoom foodRef={foodRef} />
    </div>
  );
}
