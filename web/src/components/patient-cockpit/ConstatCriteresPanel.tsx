'use client';

import { useState } from 'react';
import type { CritereConstatable } from '@/lib/supplement-library/constatsCriteres';

// Constats de critères sur un dossier ([[D-138]]) — panneau présentationnel.
//
// CE QU'IL SERT. Une règle clinique peut être conditionnée à un critère du
// vocabulaire gouverné. Rien dans l'outil ne dit ce qu'un critère lit chez un
// patient — le dériver serait inventer de la clinique (`DC-19`, `DC-20`). Le
// praticien CONSTATE donc, et il signe.
//
// TROIS ÉTATS, ET L'ÉCRAN NE LES CONFOND PAS. C'est la seule chose qui compte
// dans ce fichier :
//
//   - « Constaté présent »  → la règle conditionnée s'applique ;
//   - « Constaté absent »   → elle ne s'applique pas, et c'est un ACQUIS ;
//   - « Non renseigné »     → personne ne s'est prononcé, et la règle est
//                             refusée pour cette raison-là. C'est une DETTE.
//
// Un critère non renseigné ne doit donc jamais se lire comme un critère
// constaté absent : les deux refusent la règle, un seul est un geste manquant.
// D'où le libellé explicite « Non renseigné » plutôt qu'un état par défaut, un
// vide ou une case décochée — une case décochée dit « non », et personne n'a
// dit non.
//
// PAS DE RETRAIT. Corriger se fait en REPOSANT le constat ; retirer effacerait
// une pièce signée du dossier (la route n'expose aucun DELETE, et le panneau
// n'en propose donc aucun).
//
// RENDU CONDITIONNEL : sans vocabulaire, rien. Un panneau vide sur chaque
// dossier serait du bruit — et le vocabulaire est encore vide en production.

export type ConstatState = 'idle' | 'saving' | 'error';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('fr-FR');
}

function FormulaireConstat({
  critere,
  disabled,
  onConstater,
}: {
  critere: CritereConstatable;
  disabled: boolean;
  onConstater: (critereId: string, present: boolean, note: string) => void;
}) {
  const [present, setPresent] = useState<boolean | null>(critere.constat?.present ?? null);
  const [note, setNote] = useState(critere.constat?.note ?? '');
  const [ouvert, setOuvert] = useState(critere.constat === null);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        disabled={disabled}
        className="mt-2 min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50"
      >
        Revenir sur ce constat
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Constat pour ${critere.labelFr}`}>
        {([
          [true, 'Constaté présent'],
          [false, 'Constaté absent'],
        ] as const).map(([valeur, libelle]) => (
          <button
            key={String(valeur)}
            type="button"
            role="radio"
            aria-checked={present === valeur}
            onClick={() => setPresent(valeur)}
            disabled={disabled}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${
              present === valeur
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-foreground'
            } disabled:opacity-50`}
          >
            {libelle}
          </button>
        ))}
      </div>
      <label className="block text-sm text-muted-foreground">
        Note (facultative)
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          maxLength={2000}
          rows={2}
          disabled={disabled}
          className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-sm text-foreground"
        />
      </label>
      {/* Le bouton reste DÉSACTIVÉ tant qu'aucun des deux états n'est choisi :
          il n'existe pas de valeur par défaut, et la route refuse d'ailleurs un
          `present` qui ne serait pas strictement booléen. */}
      <button
        type="button"
        onClick={() => present !== null && onConstater(critere.critereId, present, note)}
        disabled={disabled || present === null}
        className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Consigner le constat
      </button>
    </div>
  );
}

export function ConstatCriteresPanel({
  criteres,
  state = 'idle',
  error = null,
  onConstater,
}: {
  /** Vocabulaire actif, chaque critère portant son constat — ou `null`. */
  criteres: CritereConstatable[];
  state?: ConstatState;
  error?: string | null;
  onConstater: (critereId: string, present: boolean, note: string) => void;
}) {
  // Aucun critère au vocabulaire : il n'y a rien à constater, donc rien à
  // montrer. Le panneau n'apparaît qu'avec la matière.
  if (criteres.length === 0) return null;

  const nonRenseignes = criteres.filter(critere => critere.constat === null).length;

  return (
    <section
      aria-labelledby="constat-criteres-title"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h3 id="constat-criteres-title" className="text-sm font-semibold text-foreground">
        Critères cliniques du dossier
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Une règle peut être conditionnée à un critère. Tant qu’un critère n’est pas renseigné, la
        règle qui en dépend est refusée — non parce que le critère est absent, mais parce que
        personne ne s’est prononcé.
      </p>
      {nonRenseignes > 0 && (
        <p className="mt-1 text-sm text-status-warning">
          {nonRenseignes === 1
            ? '1 critère n’est pas renseigné sur ce dossier.'
            : `${nonRenseignes} critères ne sont pas renseignés sur ce dossier.`}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {criteres.map(critere => (
          <li key={critere.critereId} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{critere.labelFr}</p>
              {/* L'état se dit en toutes lettres. « Non renseigné » n'est pas
                  un vide : c'est un état, et il se distingue d'« absent ». */}
              {critere.constat === null ? (
                <span className="rounded-full border border-status-warning/40 bg-status-warning/10 px-2 py-1 text-xs text-status-warning">
                  Non renseigné
                </span>
              ) : (
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                  {critere.constat.present ? 'Constaté présent' : 'Constaté absent'} le{' '}
                  {formatDate(critere.constat.constateLe)}
                </span>
              )}
            </div>
            {critere.constat?.note && (
              <p className="mt-1 text-xs text-muted-foreground">{critere.constat.note}</p>
            )}
            <FormulaireConstat
              critere={critere}
              disabled={state === 'saving'}
              onConstater={onConstater}
            />
          </li>
        ))}
      </ul>

      {state === 'error' && (
        <p role="alert" className="mt-2 text-base text-status-danger">
          {error ?? 'Échec de l’enregistrement du constat.'}
        </p>
      )}
    </section>
  );
}
