import type { ReactNode } from 'react';

// Titre + sous-titre + zone accessoire commune du portail patient — factorise
// le motif de tête d'écran répété dans chaque étape (gate, consentement,
// fiche, anamnèse, fin, hub).
export function PatientPageHeader({
  title,
  subtitle,
  accessory,
  center = false,
  as = 'h1',
}: {
  title: string;
  subtitle?: string;
  accessory?: ReactNode;
  center?: boolean;
  as?: 'h1' | 'h2';
}) {
  const Tag = as;
  return (
    <div className={center ? 'text-center mb-6' : 'mb-1'}>
      <div className="flex items-center justify-between gap-3">
        {/* `text-2xl` (24px) : palier natif le plus proche des 26px de la maquette
            cible, l'échelle s'étant fermée aux valeurs arbitraires le 2026-09-06. */}
        <Tag className={`font-display font-bold text-foreground ${as === 'h1' ? 'text-2xl leading-tight' : 'text-lg'}`}>{title}</Tag>
        {accessory}
      </div>
      {subtitle && <p className="text-muted-foreground text-base mt-2">{subtitle}</p>}
    </div>
  );
}
