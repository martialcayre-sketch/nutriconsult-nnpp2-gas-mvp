'use client';

import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';
import type { PatientEquilibreResponse } from '@/app/api/patient/equilibre/route';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { GrowthIllustration } from '@/components/patient/ui/GrowthIllustration';
// Doctrine « construction, jamais dégradation » (SP-CONV LOT-05, D7) ET nature
// du total ([[D-106]], `DC-22`) : les trois libellés vivent désormais avec la
// doctrine qui les motive, jamais en double.
import { TENDANCE_INDICE_GLOBAL_PATIENT } from '@/lib/equilibre/natureIndiceGlobal';

// Frise qualitative (SP-CONV LOT-05) : des repères temporels, pas des
// valeurs. L'ancienne frise encodait l'indice dans la hauteur des barres — le
// score était masqué mais toujours dessiné. Ici chaque bilan est un point
// identique ; seule la position dans le temps est racontée.
function Frise({ trajectoire }: { trajectoire: { date: string; valeur: number }[] }) {
  if (trajectoire.length < 2) return null;
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Votre parcours se construit
      </p>
      <div className="relative flex items-center justify-between px-1 py-2" aria-hidden="true">
        <div className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 bg-border" />
        {trajectoire.map((t, i) => (
          <span
            key={i}
            className={`relative h-3 w-3 rounded-full border-2 border-primary ${
              i === trajectoire.length - 1 ? 'bg-primary' : 'bg-surface'
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground/70 px-1 mt-1">
        <span>Début</span>
        <span>Aujourd&apos;hui</span>
      </div>
      <p className="sr-only">
        {trajectoire.length} bilans jalonnent votre parcours, du début à aujourd&apos;hui.
      </p>
    </div>
  );
}

export function MonEquilibreAccueil({
  idAssignation,
  email,
  onVoirDetail,
  onRetour,
}: {
  idAssignation: string;
  email?: string;
  onVoirDetail: () => void;
  onRetour: () => void;
}) {
  const [data, setData] = useState<PatientEquilibreResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const emailQuery = email ? `&email=${encodeURIComponent(email)}` : '';
    fetch(`/api/patient/equilibre?id=${encodeURIComponent(idAssignation)}${emailQuery}`)
      .then(r => r.json())
      .then((d: PatientEquilibreResponse) => setData(d))
      .catch(() => setData({ ok: false, reason: 'exception', error: 'Erreur réseau.' }))
      .finally(() => setLoading(false));
  }, [idAssignation, email]);

  if (loading) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-lg shadow-card border border-border p-8 text-center text-sm text-muted-foreground">
          Chargement de Mon équilibre…
        </div>
      </div>
    );
  }

  if (!data || 'ok' in data) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-lg shadow-card border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {data && 'error' in data ? data.error : 'Impossible de charger Mon équilibre pour le moment.'}
          </p>
          <button
            type="button"
            onClick={onRetour}
            className="w-full mt-6 min-h-11 py-2.5 px-4 border border-primary text-primary rounded-lg font-medium text-sm hover:bg-primary/10 transition-colors"
          >
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  const { indiceGlobal, momentum, besoins } = data;
  const priorites = besoins
    .filter(b => b.couverture !== null)
    .sort((a, b) => (a.couverture ?? 0) - (b.couverture ?? 0))
    .slice(0, 3);

  return (
    <div className="w-full max-w-md">
      <div className="bg-surface rounded-lg shadow-card border border-border p-8">
        <h1 className="font-display text-2xl font-bold leading-tight text-foreground mb-6 text-center">Mon équilibre</h1>

        <div className="flex justify-center mb-4">
          {indiceGlobal !== null ? (
            <ScoreGauge value={indiceGlobal} label="Mon équilibre" showValue={false} />
          ) : (
            <div className="flex flex-col items-center py-4">
              {/* Métaphore de construction (maquette) — décorative, le texte
                  porte l'information. */}
              <GrowthIllustration />
              <p className="text-base text-muted-foreground text-center">
                Pas encore assez de réponses pour calculer votre indice.
              </p>
            </div>
          )}
        </div>

        {momentum && (
          <p className="text-base text-primary bg-primary/10 rounded-xl px-4 py-2 text-center mb-4">
            {TENDANCE_INDICE_GLOBAL_PATIENT[momentum.tendance]}
          </p>
        )}

        <Frise trajectoire={data.trajectoire} />

        {priorites.length > 0 && (
          <div className="mb-6">
            {/* « Points à explorer », pas « priorités » (SP-CONV LOT-05) : ces
                items sont un tri automatique par couverture, pas une décision
                clinique — tant qu'aucune validation praticien n'existe, ils
                sont présentés comme matière de dialogue. */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[.06em] mb-2">
              Points à explorer avec votre praticien
            </p>
            <ul className="space-y-1.5">
              {/* Item priorité maquette : 15,5px, icône 19px encre cuivre. */}
              {priorites.map(p => (
                <li key={p.id} className="flex items-center gap-3 text-sm text-foreground bg-muted rounded-xl px-[15px] py-[13px]">
                  <Sprout aria-hidden="true" size={19} strokeWidth={2} className="shrink-0 text-copper-ink" />
                  {p.libellePatient}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onVoirDetail}
          className="w-full min-h-12 py-3 px-[22px] bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:opacity-90 transition-opacity mb-3"
        >
          Voir le détail de mes 12 besoins
        </button>
        <button
          type="button"
          onClick={onRetour}
          className="w-full min-h-12 py-3 px-[22px] border border-primary/30 text-primary rounded-xl font-semibold text-base hover:bg-primary/10 transition-colors"
        >
          ← Retour
        </button>
      </div>
    </div>
  );
}
