'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCheck, ExternalLink, Eye, X } from 'lucide-react';
import type { InboxQuestionnairesApiResponse } from '@/app/api/praticien/inbox-questionnaires/route';
import { libelleTemporel } from '@/lib/fil/horodatage';
import { MOTIF_MAX, MOTIF_MIN } from '@/lib/scoring/invalidation';
import { buildMiniSynthese } from '@/lib/scoring/miniSynthese';
import { ETIQUETTE_NON_INTERPRETABLE } from '@/lib/scoring/passationsNonInterpretables';
import type { ReponseQuestionnaireLisible } from '@/lib/questionnaire-reponses';

type DetailState = {
  idPatient: string;
  patient: string;
  payload: InboxQuestionnairesApiResponse | null;
  loading: boolean;
  error: string;
};

function valeurLisible(valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  if (typeof valeur === 'string' || typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  return JSON.stringify(valeur);
}

function ReponsesDetaillees({
  reponses,
  rawAnswers,
}: {
  reponses: ReponseQuestionnaireLisible[];
  rawAnswers: Record<string, unknown> | null;
}) {
  const lignes = reponses.length > 0
    ? reponses
    : Object.entries(rawAnswers ?? {}).map(([idQuestion, valeur]) => ({
        idQuestion,
        libelleQuestion: null,
        libelleReponse: null,
        valeurBrute: valeurLisible(valeur),
        section: null,
      }));
  if (lignes.length === 0) {
    return <p className="text-sm text-muted-foreground">Réponses brutes non disponibles pour ce questionnaire.</p>;
  }
  return (
    <dl className="divide-y divide-border border-y border-border">
      {lignes.map(ligne => {
        const reponseAffichee = ligne.libelleReponse ?? ligne.valeurBrute;
        const afficherValeurBrute = Boolean(
          ligne.libelleReponse && ligne.libelleReponse !== ligne.valeurBrute,
        );
        return (
          <div key={ligne.idQuestion} className="py-3 first:pt-2 last:pb-2">
            <dt>
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-2xs font-medium text-muted-foreground">
                  {ligne.idQuestion}
                </span>
                {ligne.section && (
                  <span className="text-2xs text-muted-foreground">{ligne.section}</span>
                )}
              </span>
              <span className="mt-1 block text-sm font-medium leading-5 text-foreground">
                {ligne.libelleQuestion ?? `Question ${ligne.idQuestion}`}
              </span>
            </dt>
            <dd className="mt-1.5 border-l-2 border-primary/35 pl-3">
              <span className="text-2xs font-semibold uppercase text-muted-foreground">Réponse</span>
              <p className="text-sm leading-5 text-foreground">{reponseAffichee}</p>
              {afficherValeurBrute && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Valeur brute : <span className="font-mono">{ligne.valeurBrute}</span>
                </p>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Inbox des questionnaires en attente de consultation (accueil Observatoire
 * LOT-02) : une ligne PAR PATIENT — nombre, dernière date, derniers titres —
 * jamais une ligne par questionnaire. Remplace les cartes « Reçu » du Fil
 * (décision propriétaire 2026-07-23). */
/** Total des réponses écartées par l'ancre, tous dossiers confondus. */
function nbEcartees(ecartees: InboxQuestionnairesApiResponse['ecartees']): number {
  return (ecartees ?? []).reduce((total, e) => total + e.nb, 0);
}

export function InboxQuestionnaires() {
  const [data, setData] = useState<InboxQuestionnairesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [saving, setSaving] = useState(false);
  // Passation en cours de retrait : identifiant de la passation visée, saisie du
  // motif, et erreur locale. Le retrait n'est jamais silencieux — il demande une
  // raison, et cette raison reste en base.
  const [retrait, setRetrait] = useState<{ idReponse: string; motif: string; erreur: string } | null>(null);

  const chargerInbox = useCallback(async () => {
    setLoading(true);
    await fetch('/api/praticien/inbox-questionnaires')
      .then(async r => (await r.json()) as InboxQuestionnairesApiResponse)
      .then(setData)
      .catch(() => setData({ ok: false, lignes: [], unavailable: true }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void chargerInbox();
  }, [chargerInbox]);

  const ouvrirDetail = async (idPatient: string, patient: string) => {
    setRetrait(null);
    setDetail({ idPatient, patient, payload: null, loading: true, error: '' });
    try {
      const reponse = await fetch(`/api/praticien/inbox-questionnaires?idPatient=${encodeURIComponent(idPatient)}`);
      const payload = (await reponse.json()) as InboxQuestionnairesApiResponse;
      if (!reponse.ok || !payload.ok) {
        setDetail({ idPatient, patient, payload: null, loading: false, error: payload.error ?? 'Lecture impossible.' });
        return;
      }
      setDetail({ idPatient, patient: payload.patient?.nom ?? patient, payload, loading: false, error: '' });
    } catch {
      setDetail({ idPatient, patient, payload: null, loading: false, error: 'Lecture impossible.' });
    }
  };

  const confirmerLecture = async () => {
    if (!detail?.payload?.reponses || detail.payload.reponses.length === 0) return;
    setSaving(true);
    const idsReponses = detail.payload.reponses.map(r => r.idReponse);
    try {
      const reponse = await fetch('/api/praticien/inbox-questionnaires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: detail.idPatient, idsReponses }),
      });
      const payload = (await reponse.json()) as InboxQuestionnairesApiResponse;
      if (!reponse.ok || !payload.ok) {
        setDetail(d => d ? { ...d, error: payload.error ?? 'Confirmation impossible.' } : d);
        return;
      }
      setRetrait(null);
      setDetail(null);
      await chargerInbox();
    } catch {
      setDetail(d => d ? { ...d, error: 'Confirmation impossible.' } : d);
    } finally {
      setSaving(false);
    }
  };

  const poserValidite = async (idReponse: string, statutDemande: 'VALID' | 'INVALID', motif?: string) => {
    if (!detail) return;
    setSaving(true);
    try {
      const reponse = await fetch('/api/praticien/questionnaires/validite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: detail.idPatient, idReponse, statutDemande, motif }),
      });
      const payload = (await reponse.json()) as { ok: boolean; error?: string };
      if (!reponse.ok || !payload.ok) {
        const message = payload.error ?? 'Enregistrement impossible.';
        if (statutDemande === 'INVALID') setRetrait(r => (r ? { ...r, erreur: message } : r));
        else setDetail(d => (d ? { ...d, error: message } : d));
        return;
      }
      setRetrait(null);
      await ouvrirDetail(detail.idPatient, detail.patient);
    } catch {
      const message = 'Enregistrement impossible.';
      if (statutDemande === 'INVALID') setRetrait(r => (r ? { ...r, erreur: message } : r));
      else setDetail(d => (d ? { ...d, error: message } : d));
    } finally {
      setSaving(false);
    }
  };

  const maintenant = new Date();
  const reponsesDetail = detail?.payload?.reponses ?? [];
  const validiteActive = detail?.payload?.validiteActive === true;

  return (
    <section
      data-testid="inbox-questionnaires"
      className="rounded-lg border border-border bg-surface p-5 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-foreground">Inbox questionnaires</h3>
        {data && !data.unavailable && data.lignes.length > 0 && (
          <span className="font-mono text-13 text-muted-foreground">
            {data.lignes.reduce((somme, l) => somme + l.nb, 0)}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">En attente de consultation</p>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : !data || data.unavailable ? (
        <p className="mt-3 text-sm text-muted-foreground">
          L&apos;inbox est momentanément indisponible. Rechargez la page.
        </p>
      ) : data.lignes.length === 0 ? (
        // L'ÉCRAN NE DIT PLUS CE QU'IL NE SAIT PAS. « tout a été vu en
        // consultation » était une affirmation, fondée sur un geste du PATIENT
        // (`Consultation.dateValidation`, saisi au portail au moment de son
        // anamnèse) qui ne prouve aucune lecture. Ce que l'accueil sait est
        // plus étroit : rien n'est arrivé DEPUIS la dernière consultation.
        <p className="mt-3 text-sm text-muted-foreground">
          Aucune réponse reçue depuis la dernière consultation.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {data.lignes.map(ligne => (
            <button
              key={ligne.idPatient}
              type="button"
              onClick={() => void ouvrirDetail(ligne.idPatient, ligne.patient)}
              className="group rounded-lg border border-border px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {ligne.patient}
                </span>
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {ligne.nb} · {libelleTemporel(ligne.derniereDate, maintenant).texte}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {ligne.titres.join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* CE QUE L'ANCRE A ÉCARTÉ, replié. Rien n'est perdu — la fiche patient
          affiche l'intégralité des réponses d'un dossier, sans ancre ni filtre —
          mais l'accueil taisait ce silence. Il le nomme désormais, et pointe
          l'écran qui montre tout. Replié, parce que le cas courant est vide et
          que la décision du 2026-07-23 tient : l'accueil est une liste courte. */}
      {!loading && data && !data.unavailable && (data.ecartees?.length ?? 0) > 0 && (
        <details className="mt-3 rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            {nbEcartees(data.ecartees)} réponse{nbEcartees(data.ecartees) > 1 ? 's' : ''} reçue
            {nbEcartees(data.ecartees) > 1 ? 's' : ''} avant la dernière consultation du dossier —
            {' '}les voir
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {(data.ecartees ?? []).map(e => (
              <li key={e.idPatient} className="text-xs">
                <a
                  href={`/dashboard/patients/${encodeURIComponent(e.idPatient)}`}
                  className="text-solar-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {e.patient}
                </a>
                <span className="text-muted-foreground">
                  {' '}— {e.nb} avant le {new Date(e.ancre).toLocaleDateString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog.Root open={detail !== null} onOpenChange={open => { if (!open) { setRetrait(null); setDetail(null); } }}>
        <Dialog.Portal>
          <Dialog.Overlay data-theme="praticien" className="fixed inset-0 z-50 bg-foreground/35" />
          <Dialog.Content
            data-theme="praticien"
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[86dvh] w-[min(920px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[.06em] text-solar-ink">Lecture questionnaires</p>
                <Dialog.Title className="font-display text-xl font-bold text-foreground">
                  {detail?.patient ?? 'Patient'}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  Questionnaires en attente de lecture praticien.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fermer la lecture des questionnaires"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <X aria-hidden="true" size={20} strokeWidth={2} />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {detail?.loading ? (
                <div className="flex flex-col gap-2">
                  <div className="h-24 animate-pulse rounded-lg bg-muted" />
                  <div className="h-24 animate-pulse rounded-lg bg-muted" />
                </div>
              ) : detail?.error ? (
                <p role="alert" className="rounded-lg border border-border bg-muted px-4 py-3 text-base text-foreground">
                  {detail.error}
                </p>
              ) : reponsesDetail.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted px-4 py-3 text-base text-muted-foreground">
                  Aucun questionnaire ne reste en attente pour ce patient.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {reponsesDetail.map(reponse => {
                    const miniSynthese = buildMiniSynthese(reponse.scoresParsed);
                    return (
                      <article key={reponse.idReponse} className="rounded-lg border border-border bg-background p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-display text-lg font-semibold text-foreground">{reponse.titre}</h4>
                            <p className="font-mono text-xs text-muted-foreground">
                              {new Date(reponse.dateSoumission).toLocaleString('fr-FR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          {/* « Sans score principal » serait faux ici : la
                              passation en portait un, il a été retiré. Un
                              libellé qui décrit l'absence sans en donner la
                              cause fait passer une décision clinique pour une
                              donnée manquante. */}
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                              reponse.nonInterpretable
                                ? 'border-status-danger/40 bg-status-danger/10 text-status-danger'
                                : 'border-border bg-surface text-foreground'
                            }`}
                          >
                            {reponse.nonInterpretable
                              ? ETIQUETTE_NON_INTERPRETABLE
                              : reponse.scorePrincipal !== null
                                ? `Score brut : ${reponse.scorePrincipal}`
                                : 'Sans score principal'}
                          </span>
                        </div>
                        {reponse.nonInterpretable && (
                          <p className="mt-2 text-sm text-status-danger">{reponse.nonInterpretable}</p>
                        )}
                        {reponse.interpretation && (
                          <p className="mt-2 text-sm font-medium text-foreground">{reponse.interpretation}</p>
                        )}
                        {miniSynthese && (
                          <p className="mt-2 text-sm italic text-foreground/80">Synthèse : {miniSynthese}</p>
                        )}
                        {reponse.statutValidite === 'INVALID' && (
                          <p className="mt-2 rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-foreground">
                            <span className="font-medium">Retirée du raisonnement clinique.</span>{' '}
                            {reponse.motifInvalidation ?? 'Motif non consigné.'}
                          </p>
                        )}
                        <div className="mt-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-[.06em] text-muted-foreground">
                            Réponses enregistrées
                          </p>
                          <ReponsesDetaillees
                            reponses={reponse.reponsesLisibles}
                            rawAnswers={reponse.rawAnswers}
                          />
                        </div>
                        {validiteActive && (
                          <div className="mt-3 border-t border-border pt-3">
                            {reponse.statutValidite === 'INVALID' ? (
                              <button
                                type="button"
                                onClick={() => void poserValidite(reponse.idReponse, 'VALID')}
                                disabled={saving}
                                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                              >
                                Rétablir dans le raisonnement
                              </button>
                            ) : retrait?.idReponse === reponse.idReponse ? (
                              <div className="flex flex-col gap-2">
                                <label
                                  htmlFor={`motif-${reponse.idReponse}`}
                                  className="text-xs font-semibold uppercase tracking-[.06em] text-muted-foreground"
                                >
                                  Motif du retrait
                                </label>
                                <textarea
                                  id={`motif-${reponse.idReponse}`}
                                  value={retrait.motif}
                                  onChange={e => setRetrait(r => (r ? { ...r, motif: e.target.value } : r))}
                                  rows={2}
                                  maxLength={MOTIF_MAX}
                                  placeholder="Ex. : doublon technique, passation interrompue, réponses manifestement aléatoires."
                                  className="rounded-lg border border-border bg-background p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                                />
                                {retrait.erreur && (
                                  <p className="text-sm text-status-danger">{retrait.erreur}</p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void poserValidite(reponse.idReponse, 'INVALID', retrait.motif)}
                                    disabled={saving || retrait.motif.trim().length < MOTIF_MIN}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                                  >
                                    {saving ? 'Enregistrement...' : 'Confirmer le retrait'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRetrait(null)}
                                    disabled={saving}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRetrait({ idReponse: reponse.idReponse, motif: '', erreur: '' })}
                                disabled={saving}
                                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                              >
                                Retirer du raisonnement clinique
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <Link
                href={detail ? `/dashboard/patients/${encodeURIComponent(detail.idPatient)}?onglet=trajectoire` : '#'}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <ExternalLink aria-hidden="true" size={16} />
                Ouvrir la fiche-trajectoire
              </Link>
              <button
                type="button"
                onClick={() => void confirmerLecture()}
                disabled={saving || reponsesDetail.length === 0 || Boolean(detail?.loading)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {saving ? <Eye aria-hidden="true" size={16} /> : <CheckCheck aria-hidden="true" size={16} />}
                {saving ? 'Confirmation...' : 'Confirmer la lecture'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
