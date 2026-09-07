import { DocumentsPanel } from '@/components/patient-cockpit/DocumentsPanel';

// `?idPatient=` : même contrat de continuité que /dashboard/synthese — un
// praticien qui arrive depuis une fiche ouverte ne re-sélectionne pas son
// patient à la main (audit du cockpit 2026-09-02, sortie sans continuité).
export default async function DashboardDocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ idPatient?: string }>;
}) {
  const parametres = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-foreground">Documents contextuels</h2>
        <p className="text-base text-muted-foreground mt-1">
          Composer un document multi-destinataires (patient, médecin, praticien) à partir d’une synthèse validée —
          aperçu par destinataire et impression HTML
        </p>
      </div>
      <DocumentsPanel initialPatientId={parametres?.idPatient ?? ''} />
    </div>
  );
}
