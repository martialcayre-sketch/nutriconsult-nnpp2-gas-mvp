'use client';

import { useState } from 'react';
import { isDecisionBloquee } from '@/lib/clinical-engine/decisionGuards';
import type { DecisionCard } from '@/lib/clinical-engine/types';

// LE GESTE QUI MANQUAIT — [[D-127]].
//
// Le protocole 21 jours exige une priorité choisie PAR LE PRATICIEN, et aucun
// écran ne permettait de la choisir : `ProtocolMiniBuilder` affichait
// « Protocole indisponible — priorité praticien non sélectionnée » sans dire où
// aller. Ce panneau est le « où aller ».
//
// IL NE DÉCIDE RIEN, IL TRANSMET. L'auteur et l'horodatage sont posés par le
// serveur ; l'empreinte de la carte est recalculée là-bas (`canonical.ts`
// importe `node:crypto`, le navigateur ne sait pas la produire). L'écran envoie
// un candidat et un motif, puis RECHARGE — il ne fabrique pas la carte
// résultante.
//
// LE MOTIF EST OBLIGATOIRE ICI COMME AU SERVEUR, et ce n'est pas de la
// politesse de formulaire : c'est ce que la version de protocole citera, et ce
// qui se relit six semaines plus tard. Le bouton reste donc désactivé tant que
// le motif est vide — la route refuserait de toute façon, mais un refus après
// coup ferait perdre la saisie.

export type EtatSelectionPriorite = 'idle' | 'saving' | 'error';

export function SelectionPrioritePanel({
  decisionCard,
  selectionEcartee = false,
  etat,
  erreur,
  onRetenir,
}: {
  decisionCard: DecisionCard | null;
  /**
   * Une sélection consignée a été écartée du calcul parce qu'elle ne tient plus
   * ([[D-127]] §11). NON DÉDUCTIBLE ICI : la carte servie est celle construite
   * sans elle, identique en tout point à celle d'un dossier où personne n'a
   * jamais choisi. Le serveur est le seul à savoir qu'un acte existait.
   */
  selectionEcartee?: boolean;
  etat: EtatSelectionPriorite;
  erreur: string | null;
  onRetenir: (candidateId: string, motif: string) => void;
}) {
  const dejaRetenu = decisionCard?.selectedMainPriority ?? null;
  const [ouvert, setOuvert] = useState(false);
  const [candidatChoisi, setCandidatChoisi] = useState<string | null>(null);
  const [motif, setMotif] = useState('');

  // TROIS SILENCES, ET CHACUN A SON PROPRIÉTAIRE AILLEURS. Pas de carte : la
  // phase n'est pas ouverte. Décision bloquée : « Priorité et limites » l'a déjà
  // dit, avec le motif signé — un second bloc répéterait sans ajouter, et
  // proposerait un choix que `buildDecisionCard` refuserait. Aucun candidat : la
  // table des règles n'est pas signée, il n'y a rien à retenir et la carte le
  // dit déjà (« Aucune priorité proposée »).
  //
  // ILS PORTENT SUR LE GESTE, JAMAIS SUR LE CONSTAT ([[D-127]] §11). « Il n'y a
  // rien à retenir » et « ce que vous aviez retenu n'est plus servi » sont deux
  // énoncés différents, et le second n'a de propriétaire NULLE PART ailleurs à
  // l'écran : la carte servie est celle construite sans la sélection, donc
  // indiscernable de celle d'un dossier où personne n'a jamais choisi. Une
  // décision bloquée est d'ailleurs le cas où la péremption est la PLUS
  // probable — `DC-12` retire les candidats — et la taire là serait taire
  // l'essentiel.
  if (!decisionCard) return null;

  const gesteDisponible =
    !isDecisionBloquee(decisionCard) && decisionCard.priorityCandidates.length > 0;
  if (!gesteDisponible && !selectionEcartee) return null;

  const candidatRetenu = dejaRetenu
    ? decisionCard.priorityCandidates.find(c => c.candidateId === dejaRetenu.candidateId) ?? null
    : null;
  const formulaireVisible = gesteDisponible && (ouvert || dejaRetenu === null);
  const motifRenseigne = motif.trim() !== '';
  const enregistrement = etat === 'saving';

  return (
    <section aria-labelledby="selection-priorite-title" className="mt-4">
      <h3
        id="selection-priorite-title"
        className="text-xs font-semibold text-solar-ink uppercase tracking-[.06em] mb-3"
      >
        Priorité retenue
      </h3>
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        {/* LA PHRASE DE PÉREMPTION — la dette que `D-127` avait nommée sans la
            traiter. Sans elle, le praticien retrouvait « aucune priorité
            retenue » sur un dossier où il en avait retenu une, et rien à
            l'écran ne distinguait ce cas de l'oubli.

            ELLE NE NOMME PAS LE CANDIDAT ÉCARTÉ : il n'est plus classé — c'est
            la raison même de l'écart — et son libellé n'existe donc plus dans
            la carte. Le fabriquer serait citer une règle qui ne se déclenche
            pas.

            ELLE DIT QUE RIEN N'EST EFFACÉ, parce que c'est vrai et parce que
            c'est la question suivante : le fil est append-only, la ligne reste
            en base, et la relecture d'un dossier en rendra compte. */}
        {selectionEcartee && (
          <p
            role="status"
            className="mb-3 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-status-warning"
          >
            Une priorité avait été retenue sur ce dossier : elle n’est plus applicable et a été
            écartée du calcul. Elle reste consignée — rien n’a été effacé — mais le dossier a
            changé depuis ce choix.
          </p>
        )}
        {gesteDisponible && (dejaRetenu !== null ? (
          <div>
            <p className="text-base font-semibold text-foreground">
              {candidatRetenu?.label ?? 'Priorité retenue'}
            </p>
            {/* LE MOTIF EST RE-AFFICHÉ, jamais seulement stocké : c'est la
                moitié de l'acte, et le praticien qui rouvre le dossier six
                semaines plus tard vient d'abord lire pourquoi. */}
            <p className="mt-1 text-base text-muted-foreground">{dejaRetenu.rationale}</p>
            {!ouvert && (
              <button
                type="button"
                onClick={() => {
                  setOuvert(true);
                  setCandidatChoisi(dejaRetenu.candidateId);
                  setMotif('');
                }}
                className="mt-3 min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
              >
                Retenir une autre priorité
              </button>
            )}
          </div>
        ) : (
          <p className="text-base text-foreground">
            Aucune priorité n’est retenue pour l’instant : le protocole 21 jours attend ce choix.
          </p>
        ))}

        {formulaireVisible && (
          <form
            className="mt-3 space-y-3"
            onSubmit={event => {
              event.preventDefault();
              if (candidatChoisi === null || !motifRenseigne || enregistrement) return;
              onRetenir(candidatChoisi, motif.trim());
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                Priorité à retenir
              </legend>
              {decisionCard.priorityCandidates.map(candidat => (
                <label
                  key={candidat.candidateId}
                  className="flex min-h-11 items-start gap-2 rounded-lg border border-border p-3"
                >
                  <input
                    type="radio"
                    name="priorite-candidate"
                    value={candidat.candidateId}
                    checked={candidatChoisi === candidat.candidateId}
                    onChange={() => setCandidatChoisi(candidat.candidateId)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{candidat.label}</span>
                    {/* Le RANG et le STATUT viennent de la carte : ils disent ce
                        que le moteur a classé, et le praticien décide CONTRE ou
                        AVEC. Les masquer ferait choisir à l'aveugle. */}
                    <span className="block font-mono text-xs text-muted-foreground">
                      rang {candidat.rank} · {candidat.confidence}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{candidat.rationale}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {/* Étiquette ENVELOPPANTE, patron `ArbitrageBiologiquePanel` : le
                champ est associé par imbrication, sans dépendre d'un `htmlFor`
                que jsdom relie mal à un `textarea`. L'aide vit dans
                l'étiquette, donc dans le nom accessible du champ. */}
            <label className="block text-sm font-medium text-foreground">
              Pourquoi cette priorité
              <span className="block text-xs font-normal text-muted-foreground">
                Ce motif accompagne la version de protocole et se relit avec elle.
              </span>
              <textarea
                value={motif}
                onChange={event => setMotif(event.target.value)}
                rows={3}
                maxLength={2000}
                className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-sm text-foreground"
              />
            </label>

            {erreur !== null && (
              <p role="alert" className="text-sm text-status-danger">
                {erreur}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={candidatChoisi === null || !motifRenseigne || enregistrement}
                className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {enregistrement ? 'Enregistrement…' : 'Retenir cette priorité'}
              </button>
              {dejaRetenu !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setOuvert(false);
                    setMotif('');
                  }}
                  className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
