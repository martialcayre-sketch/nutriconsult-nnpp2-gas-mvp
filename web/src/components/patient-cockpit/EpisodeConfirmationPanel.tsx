'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ProposedAssessmentEpisode } from '@/lib/clinical-engine/types';
import type { PreconditionsT0 } from '@/lib/clinical-engine/preconditionsT0';
import type { JalonMomentum } from '@/lib/equilibre/types';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}

export type ContournementSaisi = { conditionId: string; motif: string };

export function EpisodeConfirmationPanel({
  proposal,
  preconditions,
  submitting,
  onConfirm,
  jalon = 'T0',
}: {
  proposal: ProposedAssessmentEpisode;
  /**
   * Absente en lecture d'un état passé : l'écran n'affiche alors pas de
   * checklist, et la confirmation reste refusée par l'API de toute façon.
   */
  preconditions?: PreconditionsT0;
  submitting: boolean;
  onConfirm: (includedResponseIds: string[], contournements: ContournementSaisi[]) => void;
  /**
   * Jalon que ce panneau confirme (LOT-07) : depuis que le cockpit propose
   * aussi J21/J42/J90, un panneau qui écrirait « T0 » en dur annoncerait au
   * praticien un épisode qui n'est pas celui qu'il confirme.
   */
  jalon?: JalonMomentum;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(proposal.inWindowResponseIds);
  const [motifs, setMotifs] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedIds(proposal.inWindowResponseIds);
  }, [proposal.assessmentEpisodeId, proposal.inWindowResponseIds]);

  const aContourner = useMemo(
    () => preconditions?.contournementsRequis ?? [],
    [preconditions],
  );

  useEffect(() => {
    setMotifs({});
  }, [proposal.assessmentEpisodeId]);

  const toggle = (responseId: string) => {
    setSelectedIds(current => current.includes(responseId)
      ? current.filter(id => id !== responseId)
      : [...current, responseId]);
  };

  const bloque = preconditions?.bloquant ?? false;
  const motifsManquants = aContourner.filter(id => (motifs[id] ?? '').trim() === '');
  const peutConfirmer = !submitting && !bloque && motifsManquants.length === 0;

  return (
    <section aria-labelledby="episode-confirmation-title" className="rounded-xl border border-border bg-surface p-4">
      <h3 id="episode-confirmation-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Confirmation de l’épisode {jalon}
      </h3>
      <p className="mt-2 text-base text-muted-foreground">
        Vérifiez les conditions et les questionnaires à inclure. Confirmer enregistre l’épisode. Une nouvelle
        confirmation remplace la sélection retenue, sans déplacer la date de l’acte.
      </p>

      {preconditions && (
        <div className="mt-3 grid gap-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Conditions requises</h4>
            <ul className="mt-2 grid gap-1.5">
              {preconditions.dures.map(condition => (
                <li key={condition.id} className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true" className={condition.satisfaite ? 'text-status-success' : 'text-status-danger'}>
                    {condition.satisfaite ? '✓' : '✕'}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">
                      {condition.libelle}
                      <span className="sr-only">{condition.satisfaite ? ' — remplie' : ' — non remplie'}</span>
                    </span>
                    {condition.detail && (
                      <span className="block break-words text-muted-foreground">{condition.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {preconditions.souples.some(condition => !condition.satisfaite) && (
            <div>
              <h4 className="text-sm font-semibold text-foreground">Avertissements</h4>
              <ul className="mt-2 grid gap-2">
                {preconditions.souples.filter(condition => !condition.satisfaite).map(condition => (
                  <li key={condition.id} className="rounded-lg border border-accent bg-status-warning/10 p-3 text-sm">
                    <span className="block font-medium text-foreground">{condition.libelle}</span>
                    {condition.detail && (
                      <span className="block break-words text-muted-foreground">{condition.detail}</span>
                    )}
                    {/* LES CONSTATS EUX-MÊMES (`D-119`) : le motif de
                        contournement se rédige devant ce que la garde a vu —
                        description et passations RECOPIÉES du service, jamais
                        composées par l'écran. */}
                    {condition.constats && condition.constats.length > 0 && (
                      <ul className="mt-2 grid gap-2">
                        {condition.constats.map((constat, index) => (
                          <li key={`${condition.id}-${index}`} className="border-l-2 border-accent pl-2">
                            <span className="block break-words text-foreground">{constat.description}</span>
                            {constat.passations.length > 0 && (
                              <span className="block text-muted-foreground">
                                Passations confrontées : {constat.passations.join(' · ')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="mt-2 block">
                      <span className="block text-muted-foreground">
                        Je confirme malgré cet avertissement — motif obligatoire
                      </span>
                      <textarea
                        value={motifs[condition.id] ?? ''}
                        onChange={event => setMotifs(current => ({ ...current, [condition.id]: event.target.value }))}
                        rows={2}
                        maxLength={2000}
                        className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-sm text-foreground"
                        placeholder="Pourquoi confirmer malgré cet avertissement ?"
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dit plutôt que passé sous silence : sans cette ligne, l'absence de
              la biologie et des agendas se lirait comme un oubli. Q_SOM_09 est
              au pack de base et volontairement hors du rideau d'entrée
              (D-052). Le jalon est NOMMÉ : depuis `D-113` ce rideau garde
              l'ouverture de tout cycle, et « un T0 » serait faux devant un
              panneau qui confirme un T1. */}
          {/* Le nom métier suffit au praticien — l'identifiant Q_SOM_09
              relevait de la fuite dev (audit 2026-09-02) ; il reste dans le
              code et les contrats, pas à l'écran. */}
          <p className="text-sm text-muted-foreground">
            Biologie, agendas et journal alimentaire ne sont <strong>pas requis</strong> pour confirmer un {jalon}
            (phase 1). L’agenda du sommeil, bien qu’il figure au pack de base, court sur 21 nuits :
            il ne peut pas conditionner une décision prise au jour 0 du cycle.
          </p>
        </div>
      )}

      {proposal.candidateResponses.length === 0 ? (
        <div role="status" className="mt-3 rounded-lg border border-border bg-muted p-3 text-base text-muted-foreground">
          Aucune réponse disponible pour la fenêtre {jalon}.
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {proposal.candidateResponses.map(response => {
            const inWindow = proposal.inWindowResponseIds.includes(response.responseId);
            return (
              <label key={response.responseId} className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(response.responseId)}
                  onChange={() => toggle(response.responseId)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block break-words font-medium text-foreground">{response.questionnaireId}</span>
                  <span className="block text-muted-foreground">
                    {formatDate(response.observedAt)} · {inWindow ? `dans la fenêtre ${jalon}` : `hors fenêtre ${jalon}`}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {bloque && (
        <p role="status" className="mt-3 text-sm text-status-danger">
          Une ou plusieurs conditions requises ne sont pas remplies : l’épisode {jalon} ne peut pas être confirmé.
        </p>
      )}

      <button
        type="button"
        disabled={!peutConfirmer}
        onClick={() => onConfirm(
          selectedIds,
          aContourner.map(conditionId => ({ conditionId, motif: (motifs[conditionId] ?? '').trim() })),
        )}
        className="mt-4 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {submitting ? 'Confirmation en cours…' : `Confirmer l’épisode ${jalon}`}
      </button>
    </section>
  );
}
