import { notFound } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { SpiraleTrajectoire } from '@/components/ui/SpiraleTrajectoire';
import { BanniereDiffere } from '@/components/ui/BanniereDiffere';
import { GrowthIllustration } from '@/components/patient/ui/GrowthIllustration';

// Vitrine interne du chantier « refonte visuelle 5.0 » — comparaison directe
// avec la maquette cible (docs/claude/propositions/2026-07-18-refonte-ux-5-0/
// maquette-cible-ux-5-0.html), les deux thèmes côte à côte. Hors production
// (même garde que /api/dev/*). V1 = socle (canvas, échelle typo, ombres,
// rayons, focus) ; V12 = primitives livrées (chips, Spirale, croissance,
// bannière différé).
//
// Données 100 % fictives — patients de démo autorisés uniquement.

const ECHELLE = [
  { classe: 'text-2xs', usage: 'Statuts du rail de phases, labels de jauge (11,5px)' },
  { classe: 'text-xs', usage: 'Eyebrows, labels uppercase (12,5px)' },
  { classe: 'text-13', usage: 'Chips, mono — heures, sources (13px)' },
  { classe: 'text-14', usage: 'UI dense — rail de phases, tableaux (14px)' },
  { classe: 'text-sm', usage: 'Nav, boutons, onglets, sous-titres (15px)' },
  { classe: 'text-base', usage: 'Corps (16px)' },
] as const;

function BlocSocle({ titre }: { titre: string }) {
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <p className="text-xs font-semibold uppercase tracking-[.06em] text-solar-ink">
        Vitrine 5.0 · socle V1
      </p>
      <h1 className="font-display text-3xl font-bold tracking-[-0.02em]">{titre}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Canvas, échelle typographique, ombres, rayons et focus clavier — à
        comparer avec la maquette cible.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <h2 className="font-display text-xl font-semibold">Échelle typographique</h2>
          <ul className="mt-3 space-y-2">
            {ECHELLE.map(({ classe, usage }) => (
              <li key={classe} className="flex items-baseline gap-3">
                <code className="w-24 shrink-0 font-mono text-13 text-muted-foreground">{classe}</code>
                <span className={classe}>{usage}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-display text-metric font-bold text-primary">32</p>
          <p className="text-xs font-semibold uppercase tracking-[.06em] text-muted-foreground">
            text-metric — valeur de métrique
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <h2 className="font-display text-xl font-semibold">Ombres, rayons, focus</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div className="rounded border border-border bg-surface p-4 shadow-card">
              <p className="text-sm font-semibold">shadow-card</p>
              <p className="text-13 text-muted-foreground">Carte au repos · radius 14px</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 shadow-pop">
              <p className="text-sm font-semibold">shadow-pop</p>
              <p className="text-13 text-muted-foreground">Tiroir, survol · radius 18px</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="min-h-[44px] rounded-[11px] bg-primary px-[18px] text-sm font-semibold text-primary-foreground"
            >
              Bouton primaire
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-[11px] border border-border bg-transparent px-[18px] text-sm font-semibold text-primary"
            >
              Bouton fantôme
            </button>
            <span className="text-13 text-muted-foreground">
              (Tab : anneau 3px, décalage 2px)
            </span>
          </div>
          <p className="mt-4 border-l-4 border-l-primary bg-surface pl-3 text-base font-semibold">
            Carte de décision — liseré primaire, lead 16px.
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Sources : instrument fictif · scoring v2 · démo Sophie Nicola
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <h2 className="font-display text-xl font-semibold">Primitives livrées (V3-V11)</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <SpiraleTrajectoire enCours />
            <Chip variante="delta">Delta : marche 20 min — tenue 4 j/7 (démo)</Chip>
            <Chip variante="due">Décision · en attente</Chip>
            <Chip variante="soon">C3</Chip>
            <Chip>Neutre</Chip>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <GrowthIllustration taille={80} />
            <p className="text-sm text-muted-foreground">
              Croissance (le Jardin) et Spirale (l&apos;Observatoire) — décoratives,
              jamais porteuses seules.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <BanniereDiffere>
            Exemple de bannière des écrans réservés — l&apos;intention, pas un
            calendrier.
          </BanniereDiffere>
        </section>
      </div>
    </div>
  );
}

export default function VitrinePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div data-theme="praticien">
        <BlocSocle titre="L'Observatoire — praticien" />
      </div>
      <div data-theme="patient">
        <BlocSocle titre="Le Jardin — patient" />
      </div>
    </div>
  );
}
