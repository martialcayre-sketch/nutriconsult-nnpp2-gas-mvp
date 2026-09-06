'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, CalendarClock, Flag, FlaskConical, PenLine, RotateCcw, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import type { FilApiResponse } from '@/app/api/praticien/fil/route';
import type { MeteoAdhesionApiResponse } from '@/app/api/praticien/meteo-adhesion/route';
import { indexCarteImminente, resumeFil, type CarteFil, type TypeCarteFil } from '@/lib/fil/cartes';
import { libelleTemporel } from '@/lib/fil/horodatage';
import type { EtatMeteoAdhesion } from '@/lib/protocol/adhesion';
import { BadgeMeteo } from '@/components/meteo/BadgeMeteo';

/** Identité visuelle de chaque type de carte — l'icône double toujours le
 * libellé textuel (jamais la couleur seule, règle de relief A5-R1). */
const TYPE_CARTE: Record<TypeCarteFil, { libelle: string; icon: LucideIcon }> = {
  consultation_prevue: { libelle: 'Consultation', icon: CalendarClock },
  signalement_trust: { libelle: 'Signalement', icon: ShieldCheck },
  synthese_a_valider: { libelle: 'À valider', icon: Sparkles },
  synthese_a_generer: { libelle: 'À générer', icon: PenLine },
  jalon_j21: { libelle: 'Jalon', icon: Flag },
  biologie_arbitree: { libelle: 'Biologie arbitrée', icon: FlaskConical },
  assignation_en_retard: { libelle: 'En retard', icon: AlarmClock },
  reprise: { libelle: 'Reprise', icon: RotateCcw },
};

/** Grille timeline de la maquette : heure | pastille | carte. Partagée entre
 * carte active et carte écartée pour que l'axe vertical ne « saute » pas. */
const GRILLE_TIMELINE =
  'grid grid-cols-[44px,26px,minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[56px,26px,minmax(0,1fr)]';

function CarteDuFil({
  carte,
  imminente,
  meteo,
  maintenant,
  onEcarter,
}: {
  carte: CarteFil;
  imminente: boolean;
  /** État d'adhésion du patient — badge affiché seulement s'il appelle une
   * conversation (fragile/interrompue). Absent = pas de badge. */
  meteo?: EtatMeteoAdhesion;
  maintenant: Date;
  onEcarter: () => void;
}) {
  const { libelle, icon: Icon } = TYPE_CARTE[carte.type];
  const { texte: heure, estAujourdhui } = libelleTemporel(carte.date, maintenant);
  return (
    <article className={GRILLE_TIMELINE}>
      <span
        className={`pt-2.5 text-right font-mono text-xs font-semibold ${
          estAujourdhui ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {heure}
      </span>
      {/* Pastille sur l'axe (relative : peinte au-dessus du trait absolu). */}
      <span
        className={`relative mt-1.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border ${
          imminente
            ? 'border-accent/60 bg-surface text-solar-ink'
            : 'border-border bg-muted text-muted-foreground'
        }`}
      >
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
      </span>
      {/* flex-wrap : à 390px les actions passent sous le texte au lieu de
          l'écraser dans une colonne de 50px (audit visuel 2026-07-22). */}
      <div
        className={`flex flex-wrap items-start gap-3 rounded-xl border bg-surface p-4 text-surface-foreground shadow-card ${
          imminente ? 'border-accent/60' : 'border-border'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xs font-semibold uppercase tracking-[.06em] text-muted-foreground">{libelle}</span>
            <span className="text-sm font-semibold text-foreground">{carte.patient}</span>
            {/* Marqueur textuel de l'imminence — jamais la couleur seule (A5-R1). */}
            {imminente && (
              <span className="rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 text-3xs font-bold uppercase tracking-[.06em] text-solar-ink">
                Maintenant
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{carte.titre}</p>
          {/* Badge d'adhésion inline (maquette : « Adhésion : fragile ») —
              seulement quand il appelle une conversation. Réutilise l'agrégat
              SP-MET ; jamais un score. */}
          {(meteo === 'fragile' || meteo === 'interrompue') && (
            <div className="mt-1.5">
              <BadgeMeteo etat={meteo} prefixe="Adhésion : " />
            </div>
          )}
          {/* Rangée d'actions maquette : bouton d'action + pill « Pourquoi
              maintenant » (le pourquoi garde son propre span — les tests le
              ciblent au texte exact). */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={carte.href}
              className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                imminente
                  ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border bg-surface text-foreground hover:bg-muted'
              }`}
            >
              {carte.actionLabel} →
            </Link>
            <span className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-border bg-muted px-3 py-0.5 text-13 text-muted-foreground">
              <span>Pourquoi maintenant :</span>
              <span>{carte.pourquoi}</span>
            </span>
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:shrink-0 sm:self-center">
          {/* Écarter est un geste réversible : rien n'est supprimé, la carte
              reste annulable juste après (garde-fou 5.0). La carte imminente
              reste écartable — « tout reste refusable ». */}
          <button
            type="button"
            onClick={onEcarter}
            aria-label={`Écarter cette carte — ${carte.titre}, ${carte.patient}`}
            className="min-h-11 min-w-11 rounded-lg border border-border px-2 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Écarter
          </button>
        </div>
      </div>
    </article>
  );
}

/** Trace laissée par une carte écartée : le refus n'est utile que s'il est
 * annulable sans quitter l'écran. Elle garde sa place et son heure sur la
 * timeline — écarter ne réécrit pas la journée. */
function CarteEcartee({
  carte,
  maintenant,
  onAnnuler,
}: {
  carte: CarteFil;
  maintenant: Date;
  onAnnuler: () => void;
}) {
  const { texte: heure } = libelleTemporel(carte.date, maintenant);
  return (
    <article className={GRILLE_TIMELINE}>
      <span className="pt-2.5 text-right font-mono text-xs font-semibold text-muted-foreground/60">{heure}</span>
      <span className="relative mt-1.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-background" />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
        <p className="min-w-0 truncate text-base text-muted-foreground">
          Carte écartée — {carte.titre}, {carte.patient}
        </p>
        <button
          type="button"
          onClick={onAnnuler}
          className="min-h-11 shrink-0 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Annuler
        </button>
      </div>
    </article>
  );
}

/** Le Fil du jour (SP-FIL LOT-01) : cartes « pourquoi maintenant » depuis les
 * données existantes. Proposition, jamais capture : chaque carte est une
 * information sourcée + une action explicite, rien n'est automatique. */
export function FilDuJour() {
  const [data, setData] = useState<FilApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [ecartees, setEcartees] = useState<string[]>([]);
  const [erreurRefus, setErreurRefus] = useState('');
  // Météo par patient pour le badge inline — chargée à part. Un échec ne
  // masque jamais le Fil : sans donnée, pas de badge, c'est tout.
  const [meteoParPatient, setMeteoParPatient] = useState<Map<string, EtatMeteoAdhesion>>(new Map());

  useEffect(() => {
    fetch('/api/praticien/fil')
      .then(async r => (await r.json()) as FilApiResponse)
      .then(setData)
      .catch(() => setData({ cartes: [], unavailable: true }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/praticien/meteo-adhesion')
      .then(async r => (await r.json()) as MeteoAdhesionApiResponse)
      .then(reponse => {
        if (reponse.unavailable) return;
        setMeteoParPatient(new Map(reponse.determinees.map(l => [l.idPatient, l.etat])));
      })
      .catch(() => {});
  }, []);

  // Le serveur fait foi : la carte n'est écartée à l'écran qu'une fois le refus
  // accepté. Sinon le praticien croirait avoir écarté une carte qui reviendra
  // au prochain chargement.
  const basculerRefus = useCallback(async (carte: CarteFil, refusee: boolean) => {
    setErreurRefus('');
    try {
      const reponse = await fetch('/api/praticien/fil/refus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: carte.idPatient, carteCle: carte.cle, refusee }),
      });
      const payload = (await reponse.json()) as { ok: boolean; error?: string };
      if (!reponse.ok || !payload.ok) {
        setErreurRefus(payload.error ?? 'Cette carte n’a pas pu être écartée.');
        return;
      }
      setEcartees(prev =>
        refusee ? [...prev, carte.cle] : prev.filter(cle => cle !== carte.cle),
      );
    } catch {
      setErreurRefus('Cette carte n’a pas pu être écartée.');
    }
  }, []);

  if (loading) {
    return (
      <div data-testid="fil-du-jour" className="flex flex-col gap-3">
        <div className="bg-surface rounded-xl border border-border p-4 animate-pulse h-20 shadow-card" />
        <div className="bg-surface rounded-xl border border-border p-4 animate-pulse h-20 shadow-card" />
      </div>
    );
  }

  if (!data || data.unavailable) {
    return (
      <div data-testid="fil-du-jour" className="bg-muted border border-border rounded-xl p-4 text-base text-muted-foreground">
        Le Fil est momentanément indisponible. Rechargez la page ou vérifiez votre session.
      </div>
    );
  }

  if (data.cartes.length === 0) {
    return (
      <div data-testid="fil-du-jour" className="bg-surface border border-border rounded-xl p-6 text-base text-muted-foreground shadow-card">
        Rien n&apos;appelle votre attention pour le moment. Le Fil se remplit à mesure
        que les signalements, les échéances et les synthèses arrivent.
      </div>
    );
  }

  const maintenant = new Date();
  // L'imminence se calcule sur les cartes encore visibles : écarter la carte
  // imminente promeut la suivante.
  const visibles = data.cartes.filter(c => !ecartees.includes(c.cle));
  const cleImminente = visibles[indexCarteImminente(visibles, maintenant)]?.cle ?? null;

  return (
    // Panneau « Aujourd'hui » de la maquette : en-tête display + résumé
    // qualitatif mono, timeline de cartes à l'intérieur.
    <section data-testid="fil-du-jour" className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h3 className="font-display text-lg font-semibold text-foreground">Aujourd&apos;hui</h3>
        <span className="font-mono text-13 text-muted-foreground">{resumeFil(data.cartes)}</span>
      </div>
      <div className="relative flex flex-col gap-3">
        {/* Axe vertical de la timeline, au centre de la colonne des pastilles
            (44px + 12px de gouttière + 13px ; 56px en ≥sm). */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-4 left-[69px] top-4 w-px bg-border sm:left-[81px]"
        />
        {erreurRefus && (
          <p role="alert" className="rounded-lg border border-border bg-muted px-4 py-2 text-base text-foreground">
            {erreurRefus}
          </p>
        )}
        {data.cartes.map(carte =>
          ecartees.includes(carte.cle) ? (
            <CarteEcartee
              key={carte.cle}
              carte={carte}
              maintenant={maintenant}
              onAnnuler={() => void basculerRefus(carte, false)}
            />
          ) : (
            <CarteDuFil
              key={carte.cle}
              carte={carte}
              imminente={carte.cle === cleImminente}
              meteo={meteoParPatient.get(carte.idPatient)}
              maintenant={maintenant}
              onEcarter={() => void basculerRefus(carte, true)}
            />
          ),
        )}
      </div>
    </section>
  );
}
