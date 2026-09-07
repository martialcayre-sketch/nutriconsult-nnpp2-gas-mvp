import { FichePatientPanel } from '@/components/FichePatientPanel';
import {
  estOngletFiche,
  estPhaseFiche,
  type OngletFiche,
  type PhaseFiche,
} from '@/lib/praticien/ongletsFiche';
import {
  buildValidationErgoC1Fixture,
  estModeValidationErgoActif,
  type ValidationErgoC1Fixture,
} from '@/lib/clinical-engine/validationErgoFixture';
import { isC5Enabled } from '@/lib/food-compass';
import { C5FeatureProvider } from '@/components/patient-cockpit/C5FeatureProvider';
import { isAgendaAlimentaireEnabled } from '@/lib/agenda-alimentaire/featureFlag';
import { AgendaAliFeatureProvider } from '@/components/agenda-alimentaire/AgendaAliFeatureProvider';
import { isCbEnabled, isCbResultsEnabled } from '@/lib/biology-library/featureFlag';
import { CbFeatureProvider } from '@/components/patient-cockpit/CbFeatureProvider';

export default async function FichePatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ idPatient: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { idPatient } = await params;
  const parametres = await searchParams;
  // Harnais de validation ergonomique C1 : actif uniquement en développement
  // local avec `?validationErgo=c1` — en production ce calcul vaut toujours
  // false et la fiche reste strictement identique. La fixture est construite
  // ici, côté serveur : le moteur clinique (canonical.ts → node:crypto) ne
  // peut pas être embarqué dans le bundle client.
  const modeValidationErgo = estModeValidationErgoActif(
    process.env.NODE_ENV,
    parametres?.validationErgo,
  );
  const fixtureValidationErgo: ValidationErgoC1Fixture | null = modeValidationErgo
    ? buildValidationErgoC1Fixture()
    : null;
  // Deep-link `?onglet=` (ex. `?onglet=trajectoire` depuis la future page
  // Trajectoires) : validé ici côté serveur, toute valeur inconnue est ignorée.
  const ongletBrut = Array.isArray(parametres?.onglet) ? parametres.onglet[0] : parametres?.onglet;
  const ongletInitial: OngletFiche | undefined = estOngletFiche(ongletBrut) ? ongletBrut : undefined;
  // Deep-link `?phase=` : un lien partageable vers une phase précise du rail
  // (« regarde la Réévaluation de ce dossier »). Même garde que `?onglet=` —
  // une valeur inconnue est ignorée et la règle D5 reprend la main.
  const phaseBrute = Array.isArray(parametres?.phase) ? parametres.phase[0] : parametres?.phase;
  const phaseDemandee: PhaseFiche | undefined = estPhaseFiche(phaseBrute) ? phaseBrute : undefined;
  return (
    <C5FeatureProvider enabled={isC5Enabled(process.env.WN_C5_ENABLED)}>
      <AgendaAliFeatureProvider enabled={isAgendaAlimentaireEnabled(process.env.WN_AGENDA_ALI)}>
        <CbFeatureProvider
          enabled={isCbEnabled(process.env.WN_CB_ENABLED)}
          resultsEnabled={isCbResultsEnabled()}
        >
          {/* `key` AU NIVEAU DU DOSSIER, et pas plus bas ([[D-072]] §4).
              `FichePatientPanel` détient l'état clinique du dossier —
              équilibre, réponses, trajectoire, mode de vie, assignations —
              rechargé par des effets sur `idPatient`. En App Router, un
              changement de segment le RÉCONCILIE sans le démonter : le contenu
              du patient précédent restait affiché sous le nom du suivant, le
              temps que chaque GET revienne. Keyer un seul enfant ne protégeait
              que sa sous-arborescence. Du contenu clinique sous le mauvais nom,
              même une seconde, ne se rattrape pas ; le coût assumé est la perte
              des brouillons en cours au changement de dossier. */}
          <FichePatientPanel
            key={idPatient}
            idPatient={idPatient}
            ongletInitial={ongletInitial}
            phaseDemandee={phaseDemandee}
            fixtureValidationErgo={fixtureValidationErgo}
          />
        </CbFeatureProvider>
      </AgendaAliFeatureProvider>
    </C5FeatureProvider>
  );
}
