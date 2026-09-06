'use client';

import { useEffect, useRef, useState } from 'react';
import { PatientButton } from '@/components/patient/ui/PatientButton';
import { PatientInlineMessage } from '@/components/patient/ui/PatientInlineMessage';
import { minutesDepuisAncre } from '@/lib/agenda-alimentaire/jour';
import {
  ANCRE_JOURNEE_MIN,
  NB_PRISES_MAX,
  type NaturePrise,
  type PriseJour,
} from '@/lib/agenda-alimentaire/types';
import {
  AIDE_LIGNE_PRISES,
  ARIA_NATURE,
  EMOJI_NATURE,
  LABEL_AJOUTER_PRISE,
  LABEL_LIGNE_PRISES,
  LABEL_NATURE,
  LABEL_RETIRER_PRISE,
  MESSAGE_LIGNE_PLEINE,
  MESSAGE_MAX_PRISES,
  heureParlee,
} from './libelles';

// Ligne de temps des prises — 04:00 → 03:59, au pas de 15 minutes.
//
// AUCUN CLAVIER DE SAISIE, aucun `<input type="time">` : l'heure se pose au
// doigt. Mais le geste tactile est le chemin RAPIDE, pas le seul — jsdom ne
// calcule aucune géométrie, et surtout un lecteur d'écran ne glisse pas. D'où
// trois chemins pour chaque acte :
//
//   poser    → toucher la ligne          | bouton « Ajouter une prise »
//   basculer → toucher la prise          | Entrée / Espace sur la prise
//   retirer  → appui long sur la prise   | bouton « Retirer », touche Suppr
//
// Déplacer une prise se fait aux flèches ← → une fois qu'elle a le focus : c'est
// l'équivalent clavier du glissement, et le seul chemin observable en test.

/** Pas de la ligne, en minutes. Aligné sur `RE_HEURE` de `jour.ts` (00/15/30/45). */
const PAS_MIN = 15;
const MINUTES_JOUR = 1440;
/** Dernier emplacement posable : 03:45, soit 1425 minutes après l'ancre. */
const OFFSET_MAX = MINUTES_JOUR - PAS_MIN;
/** Emplacement proposé par le chemin non gestuel, à défaut de doigt : 08:00. */
const OFFSET_DEFAUT = 240;
const APPUI_LONG_MS = 600;

/** Minutes depuis l'ancre (04:00) → « HH:MM » en horloge murale. */
export function offsetVersHeure(offset: number): string {
  const total = (((offset + ANCRE_JOURNEE_MIN) % MINUTES_JOUR) + MINUTES_JOUR) % MINUTES_JOUR;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
}

/** Ratio horizontal [0,1] → emplacement de 15 min le plus proche, borné. */
export function offsetDepuisRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return OFFSET_DEFAUT;
  const brut = Math.round((ratio * MINUTES_JOUR) / PAS_MIN) * PAS_MIN;
  return Math.min(OFFSET_MAX, Math.max(0, brut));
}

/** Tri sur l'échelle ANCRÉE, jamais sur la chaîne : 00:30 suit 22:00. */
function trier(prises: PriseJour[]): PriseJour[] {
  return [...prises].sort((a, b) => minutesDepuisAncre(a.heure) - minutesDepuisAncre(b.heure));
}

/**
 * Premier emplacement libre à partir de `depuis`, puis en repartant du début.
 * Rend `null` si la ligne est saturée — 96 emplacements pour 10 prises au plus,
 * donc jamais en pratique ; le cas est traité quand même plutôt que supposé.
 */
function premierLibre(occupes: Set<number>, depuis: number): number | null {
  for (let i = 0; i < MINUTES_JOUR / PAS_MIN; i += 1) {
    const offset = (depuis + i * PAS_MIN) % MINUTES_JOUR;
    if (offset <= OFFSET_MAX && !occupes.has(offset)) return offset;
  }
  return null;
}

// Graduations : repères de lecture seulement, jamais des cibles.
const GRADUATIONS = [0, 240, 480, 720, 960, 1200];

type Props = {
  prises: PriseJour[];
  onChange: (prises: PriseJour[]) => void;
  desactive?: boolean;
};

export function LigneDePrises({ prises, onChange, desactive = false }: Props) {
  const [selection, setSelection] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appuiLongDeclenche = useRef(false);

  useEffect(() => () => {
    if (minuterie.current !== null) clearTimeout(minuterie.current);
  }, []);

  const occupes = new Set(prises.map((p) => minutesDepuisAncre(p.heure)));
  const triees = trier(prises);

  function poser(offset: number) {
    if (desactive) return;
    const heure = offsetVersHeure(offset);
    const existante = prises.find((p) => p.heure === heure);
    if (existante) {
      basculer(heure);
      return;
    }
    if (prises.length >= NB_PRISES_MAX) {
      setMessage(MESSAGE_MAX_PRISES);
      return;
    }
    setMessage('');
    setSelection(heure);
    onChange(trier([...prises, { heure, nature: 'repas' }]));
  }

  function ajouterSansGeste() {
    if (desactive) return;
    if (prises.length >= NB_PRISES_MAX) {
      setMessage(MESSAGE_MAX_PRISES);
      return;
    }
    const derniere = triees[triees.length - 1];
    const depuis =
      derniere === undefined
        ? OFFSET_DEFAUT
        : Math.min(OFFSET_MAX, minutesDepuisAncre(derniere.heure) + PAS_MIN);
    const libre = premierLibre(occupes, depuis);
    if (libre === null) {
      setMessage(MESSAGE_LIGNE_PLEINE);
      return;
    }
    poser(libre);
  }

  function basculer(heure: string) {
    if (desactive) return;
    setMessage('');
    setSelection(heure);
    onChange(
      prises.map((p) =>
        p.heure === heure
          ? { ...p, nature: (p.nature === 'repas' ? 'hors_repas' : 'repas') as NaturePrise }
          : p,
      ),
    );
  }

  function retirer(heure: string) {
    if (desactive) return;
    setMessage('');
    setSelection((s) => (s === heure ? null : s));
    onChange(prises.filter((p) => p.heure !== heure));
  }

  /** Équivalent clavier du glissement : un emplacement occupé bloque le pas. */
  function deplacer(heure: string, sens: -1 | 1) {
    if (desactive) return;
    const offset = minutesDepuisAncre(heure);
    const cible = offset + sens * PAS_MIN;
    if (cible < 0 || cible > OFFSET_MAX || occupes.has(cible)) return;
    const nouvelle = offsetVersHeure(cible);
    setMessage('');
    setSelection(nouvelle);
    onChange(trier(prises.map((p) => (p.heure === heure ? { ...p, heure: nouvelle } : p))));
  }

  function surPiste(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // Largeur nulle : environnement sans géométrie (jsdom) ou piste non montée.
    // On ne devine pas une heure à partir d'une division par zéro.
    if (!rect.width) return;
    poser(offsetDepuisRatio((e.clientX - rect.left) / rect.width));
  }

  function demarrerAppuiLong(heure: string) {
    appuiLongDeclenche.current = false;
    if (minuterie.current !== null) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      appuiLongDeclenche.current = true;
      retirer(heure);
    }, APPUI_LONG_MS);
  }

  function arreterAppuiLong() {
    if (minuterie.current !== null) {
      clearTimeout(minuterie.current);
      minuterie.current = null;
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p id="ligne-prises-label" className="text-sm font-medium text-foreground">
          {LABEL_LIGNE_PRISES}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{AIDE_LIGNE_PRISES}</p>
      </div>

      <div
        data-testid="piste-prises"
        onPointerDown={desactive ? undefined : surPiste}
        className={`relative h-24 w-full rounded-xl border border-border bg-muted/40 ${
          desactive ? 'opacity-40' : 'cursor-pointer'
        }`}
      >
        {/* Axe et graduations : décor de lecture, hors de l'arbre d'accessibilité. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
          {GRADUATIONS.map((g) => (
            <div key={g} className="absolute top-0 bottom-0" style={{ left: `${(g / MINUTES_JOUR) * 100}%` }}>
              <div className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border" />
              <span className="absolute bottom-0 -translate-x-1/2 text-3xs text-muted-foreground">
                {offsetVersHeure(g).slice(0, 2)}h
              </span>
            </div>
          ))}
        </div>

        {triees.map((prise) => {
          const offset = minutesDepuisAncre(prise.heure);
          const actif = selection === prise.heure;
          return (
            <button
              key={prise.heure}
              type="button"
              data-testid={`prise-${prise.heure}`}
              data-nature={prise.nature}
              disabled={desactive}
              aria-label={`Prise à ${heureParlee(prise.heure)}, ${ARIA_NATURE[prise.nature]}. Entrée pour changer, flèches pour déplacer, Suppr pour retirer.`}
              aria-pressed={actif}
              style={{ left: `${(offset / MINUTES_JOUR) * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                demarrerAppuiLong(prise.heure);
              }}
              onPointerUp={arreterAppuiLong}
              onPointerLeave={arreterAppuiLong}
              onPointerCancel={arreterAppuiLong}
              onClick={(e) => {
                e.stopPropagation();
                // L'appui long a déjà retiré la prise : le clic qui le suit ne
                // doit pas se transformer en bascule sur une prise disparue.
                if (appuiLongDeclenche.current) {
                  appuiLongDeclenche.current = false;
                  return;
                }
                basculer(prise.heure);
              }}
              onFocus={() => setSelection(prise.heure)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  deplacer(prise.heure, -1);
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  deplacer(prise.heure, 1);
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  retirer(prise.heure);
                }
              }}
              className={`absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg transition-transform ${
                prise.nature === 'repas'
                  ? 'bg-primary/20 border-2 border-primary'
                  : 'bg-surface border-2 border-dashed border-border'
              } ${actif ? 'ring-2 ring-primary/50 scale-110' : ''}`}
            >
              <span aria-hidden="true">{EMOJI_NATURE[prise.nature]}</span>
            </button>
          );
        })}
      </div>

      {/* Liste textuelle : l'état de la ligne dit à voix haute, et la seule vue
          possible quand la géométrie n'est pas rendue. Un COMPTE DE SAISIES, et
          rien d'autre — aucune moyenne, aucune tendance, aucun indice. */}
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {triees.length === 0
          ? 'Aucune prise posée pour l’instant.'
          : `${triees.length} prise${triees.length > 1 ? 's' : ''} : ${triees
              .map((p) => `${p.heure} ${LABEL_NATURE[p.nature].toLowerCase()}`)
              .join(', ')}.`}
      </p>

      <div className="flex flex-wrap gap-2">
        <PatientButton variant="ghost" disabled={desactive} onClick={ajouterSansGeste}>
          {LABEL_AJOUTER_PRISE}
        </PatientButton>
        {selection !== null && prises.some((p) => p.heure === selection) && (
          <PatientButton variant="danger-text" disabled={desactive} onClick={() => retirer(selection)}>
            {LABEL_RETIRER_PRISE} {selection}
          </PatientButton>
        )}
      </div>

      {message !== '' && <PatientInlineMessage tone="error">{message}</PatientInlineMessage>}
    </div>
  );
}
