import Link from 'next/link';
import { ProtocolCheckinForm } from '@/components/patient-companion/ProtocolCheckinForm';

// Rendez-vous de suivi (C2A LOT-04) — check-ins J7/J14/J21 du protocole diffusé.
// La session est portée par le cookie portail ; le formulaire résout son état
// via /api/portail/protocole/checkin.
export default async function PortailSuiviPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="w-full max-w-2xl space-y-4">
      <Link
        href={`/portail/${token}/questionnaires`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        ← Mon parcours
      </Link>
      <ProtocolCheckinForm />
    </div>
  );
}
