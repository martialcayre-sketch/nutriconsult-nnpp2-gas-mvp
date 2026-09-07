'use client';

import { useCallback, useEffect, useState } from 'react';
import { PenLine, Sparkles, Trash2 } from 'lucide-react';
import { readEventStream } from '@/lib/sse/readEventStream';
import type { PatientsPgApiResponse } from '@/app/api/praticien/patients-pg/route';
import type { SyntheseSchema } from '@/lib/anthropic';
import { SynthesePraticienEditor } from '@/components/SynthesePraticienEditor';
import {
  estRedactionPraticien,
  MODELE_REDACTION_PRATICIEN,
  nouveauBrouillonPraticien,
} from '@/lib/synthese-praticien';

type SyntheseRecord = {
  idSynthese: string;
  idPatient: string;
  dateGeneration: string;
  modele: string;
  statut: string;
  dateValidation: string | null;
  notesPraticien: string | null;
  syntheseJson: SyntheseSchema;
  /* Renseigné quand la synthèse précède le retrait d'interprétation d'un des
   * questionnaires du dossier — calculé côté serveur, jamais ici. */
  avertissementMesureRetiree?: string | null;
};

const STATUT_LABEL: Record<string, string> = {
  Brouillon_IA: 'Brouillon IA',
  Brouillon_Praticien: 'Brouillon praticien',
  Validee_Praticien: 'Validée',
  Corrigee_Praticien: 'Corrigée',
  Rejetee: 'Rejetée',
};

const STATUT_COLOR: Record<string, string> = {
  Brouillon_IA: 'bg-status-warning/10 text-status-warning',
  Brouillon_Praticien: 'bg-status-info/10 text-status-info',
  Validee_Praticien: 'bg-status-success/10 text-status-success',
  Corrigee_Praticien: 'bg-status-info/10 text-status-info',
  Rejetee: 'bg-status-danger/10 text-status-danger',
};

const PRIORITE_COLOR: Record<string, string> = {
  eleve: 'bg-status-danger/10 text-status-danger',
  modere: 'bg-status-warning/10 text-status-warning',
  faible: 'bg-status-success/10 text-status-success',
};

const PRIORITE_LABEL: Record<string, string> = {
  eleve: 'Élevée',
  modere: 'Modérée',
  faible: 'Faible',
};

const inputCls = 'bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground';
const btnPrimary = 'px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60';

export function SynthesePanel({ initialPatientId = '' }: { initialPatientId?: string }) {
  const [patients, setPatients] = useState<PatientsPgApiResponse['patients']>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [syntheses, setSyntheses] = useState<SyntheseRecord[]>([]);
  const [selectedSynthese, setSelectedSynthese] = useState<SyntheseRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualDraft, setManualDraft] = useState<SyntheseSchema | null>(null);
  const [editedManual, setEditedManual] = useState<SyntheseSchema | null>(null);
  const [manualDirty, setManualDirty] = useState(false);
  const [bookletHtml, setBookletHtml] = useState<string | null>(null);
  const [bookletInfo, setBookletInfo] = useState<{ dejaEnvoye: boolean; emailMasque: string | null } | null>(null);
  const [loadingBooklet, setLoadingBooklet] = useState(false);
  const [sending, setSending] = useState(false);
  const [relectureConfirmee, setRelectureConfirmee] = useState(false);
  const [forceSend, setForceSend] = useState(false);
  // Garde de registre anxiogène : la route SAIT depuis toujours accepter
  // `confirmerRegistre` (« le praticien voit le mot, et décide »), mais aucun
  // écran ne l'envoyait. Le praticien recevait un avertissement lui demandant
  // d'« ajouter confirmerRegistre: true » — un champ JSON, sans commande pour
  // le poser. `registreATrancher` porte le mot signalé ; il n'apparaît qu'après
  // un refus de la garde, jamais avant : la case ne se coche pas à l'avance.
  const [registreATrancher, setRegistreATrancher] = useState<string | null>(null);
  const [confirmerRegistre, setConfirmerRegistre] = useState(false);
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadSyntheses = useCallback(async (idPatient: string) => {
    if (!idPatient) { setSyntheses([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/praticien/synthese?idPatient=${encodeURIComponent(idPatient)}`);
      const d = await r.json() as { syntheses: SyntheseRecord[] };
      setSyntheses(d.syntheses ?? []);
    } catch { setSyntheses([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch('/api/praticien/patients-pg')
      .then(r => r.json())
      .then((d: PatientsPgApiResponse) => setPatients(d.patients ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialPatientId || selectedPatient === initialPatientId) return;
    if (!patients.some(p => p.idPatient === initialPatientId)) return;
    setSelectedPatient(initialPatientId);
    setSelectedSynthese(null);
    setManualDraft(null);
    setEditedManual(null);
    setManualDirty(false);
    setBookletHtml(null);
    setBookletInfo(null);
    setFeedback(null);
    void loadSyntheses(initialPatientId);
  }, [initialPatientId, loadSyntheses, patients, selectedPatient]);

  const onSelectPatient = (id: string) => {
    setSelectedPatient(id);
    setSelectedSynthese(null);
    setManualDraft(null);
    setEditedManual(null);
    setManualDirty(false);
    setBookletHtml(null);
    setBookletInfo(null);
    setFeedback(null);
    loadSyntheses(id);
  };

  const onGenerate = async () => {
    if (!selectedPatient) return;
    setGenerating(true);
    setFeedback(null);
    try {
      const r = await fetch('/api/praticien/synthese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: selectedPatient }),
      });

      // Les gardes d'erreur répondent toujours en JSON (401/404/422/503/500),
      // quel que soit le transport de succès.
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setFeedback({ ok: false, msg: d.error ?? 'Erreur lors de la génération.' });
        return;
      }

      const msgSucces = 'Synthèse générée. Relisez et validez avant envoi.';

      // Transport SSE (Scalingo) : lire le flux jusqu'à l'événement terminal.
      if (r.headers.get('content-type')?.includes('text/event-stream')) {
        let terminal: { ok: boolean; msg: string } | null = null;
        await readEventStream(r, e => {
          if (e.event === 'done') {
            terminal = { ok: true, msg: msgSucces };
          } else if (e.event === 'error') {
            let msg = 'Erreur lors de la génération.';
            try {
              msg = (JSON.parse(e.data) as { error?: string }).error ?? msg;
            } catch {
              /* trame d'erreur illisible : message générique */
            }
            terminal = { ok: false, msg };
          }
        });
        if (!terminal) {
          setFeedback({ ok: false, msg: 'Réponse incomplète du serveur. Réessayez.' });
          return;
        }
        setFeedback(terminal);
        if ((terminal as { ok: boolean }).ok) await loadSyntheses(selectedPatient);
        return;
      }

      // Transport JSON historique.
      const d = (await r.json()) as { success?: boolean; error?: string };
      if (!d.success) {
        setFeedback({ ok: false, msg: d.error ?? 'Erreur lors de la génération.' });
        return;
      }
      setFeedback({ ok: true, msg: msgSucces });
      await loadSyntheses(selectedPatient);
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setGenerating(false);
    }
  };

  const onCreateManual = async () => {
    if (!selectedPatient || !manualDraft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch('/api/praticien/synthese', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: selectedPatient, synthese: manualDraft }),
      });
      const d = await r.json() as { success?: boolean; error?: string; synthese?: SyntheseRecord };
      if (!r.ok || !d.success || !d.synthese) {
        setFeedback({ ok: false, msg: d.error ?? 'Impossible de créer le brouillon.' });
        return;
      }
      setManualDraft(null);
      setSelectedSynthese(d.synthese);
      setEditedManual(d.synthese.syntheseJson);
      setManualDirty(false);
      setFeedback({ ok: true, msg: 'Brouillon praticien enregistré. Validez-le avant de préparer le booklet.' });
      await loadSyntheses(selectedPatient);
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSaving(false);
    }
  };

  const onSaveManual = async () => {
    if (!selectedSynthese || !editedManual) return;
    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch('/api/praticien/synthese', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idSynthese: selectedSynthese.idSynthese,
          action: 'enregistrer',
          synthese: editedManual,
        }),
      });
      const d = await r.json() as { success?: boolean; error?: string; syntheseJson?: SyntheseSchema };
      if (!r.ok || !d.success || !d.syntheseJson) {
        setFeedback({ ok: false, msg: d.error ?? 'Impossible d’enregistrer le brouillon.' });
        return;
      }
      setSelectedSynthese({ ...selectedSynthese, syntheseJson: d.syntheseJson });
      setEditedManual(d.syntheseJson);
      setManualDirty(false);
      setFeedback({ ok: true, msg: 'Brouillon praticien enregistré.' });
      await loadSyntheses(selectedPatient);
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSaving(false);
    }
  };

  const onAction = async (idSynthese: string, action: 'valider' | 'rejeter' | 'annoter') => {
    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch('/api/praticien/synthese', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idSynthese, action, notes }),
      });
      const d = await r.json() as { success?: boolean; error?: string; statut?: string };
      if (!r.ok || !d.success) {
        setFeedback({ ok: false, msg: d.error ?? 'Erreur.' });
        return;
      }
      const labels: Record<string, string> = { valider: 'Synthèse validée.', rejeter: 'Synthèse rejetée.', annoter: 'Notes enregistrées.' };
      setFeedback({ ok: true, msg: labels[action] ?? 'Mis à jour.' });
      await loadSyntheses(selectedPatient);
      setSelectedSynthese(null);
      setBookletHtml(null);
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSaving(false);
    }
  };

  const onResetSynthese = async () => {
    if (!selectedSynthese) return;
    const confirme = window.confirm(
      'Effacer le contenu de cette synthèse et la remettre en brouillon praticien vide ?',
    );
    if (!confirme) return;

    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch('/api/praticien/synthese', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idSynthese: selectedSynthese.idSynthese, action: 'effacer' }),
      });
      const d = await r.json() as {
        success?: boolean;
        error?: string;
        statut?: string;
        syntheseJson?: SyntheseSchema;
        modele?: string;
        dateValidation?: string | null;
        notesPraticien?: string | null;
      };
      if (!r.ok || !d.success || !d.syntheseJson || !d.statut) {
        setFeedback({ ok: false, msg: d.error ?? 'Impossible d’effacer la synthèse.' });
        return;
      }
      const syntheseVide = {
        ...selectedSynthese,
        statut: d.statut,
        modele: d.modele ?? MODELE_REDACTION_PRATICIEN,
        dateValidation: d.dateValidation ?? null,
        notesPraticien: d.notesPraticien ?? null,
        syntheseJson: d.syntheseJson,
      };
      setSelectedSynthese(syntheseVide);
      setEditedManual(d.syntheseJson);
      setManualDraft(null);
      setManualDirty(false);
      setNotes('');
      setBookletHtml(null);
      setBookletInfo(null);
      setRelectureConfirmee(false);
      setForceSend(false);
      setRegistreATrancher(null);
      setConfirmerRegistre(false);
      setFeedback({ ok: true, msg: 'Synthèse vidée. Complétez le brouillon avant validation et booklet.' });
      await loadSyntheses(selectedPatient);
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSaving(false);
    }
  };

  const onLoadBooklet = async (idSynthese: string) => {
    setLoadingBooklet(true);
    setBookletHtml(null);
    setBookletInfo(null);
    setRelectureConfirmee(false);
    setForceSend(false);
    setRegistreATrancher(null);
    setConfirmerRegistre(false);
    setFeedback(null);
    try {
      const r = await fetch(`/api/praticien/booklet?idSynthese=${encodeURIComponent(idSynthese)}`);
      const d = await r.json() as { html?: string; error?: string; dejaEnvoye?: boolean; dernierEnvoiEmailMasque?: string | null };
      if (!r.ok || !d.html) {
        setFeedback({ ok: false, msg: d.error ?? 'Impossible de générer le booklet.' });
        return;
      }
      setBookletHtml(d.html);
      setBookletInfo({ dejaEnvoye: d.dejaEnvoye ?? false, emailMasque: d.dernierEnvoiEmailMasque ?? null });
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setLoadingBooklet(false);
    }
  };

  const onClearBooklet = () => {
    setBookletHtml(null);
    setBookletInfo(null);
    setRelectureConfirmee(false);
    setForceSend(false);
    setRegistreATrancher(null);
    setConfirmerRegistre(false);
    setFeedback({ ok: true, msg: 'Prévisualisation du booklet effacée.' });
  };

  const onSend = async (idSynthese: string) => {
    if (!relectureConfirmee) {
      setFeedback({ ok: false, msg: 'Confirmez d\'abord la relecture du booklet.' });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const r = await fetch('/api/praticien/booklet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idSynthese, relectureConfirmee, forceSend, confirmerRegistre }),
      });
      const d = await r.json() as { success?: boolean; error?: string; warning?: string; needsConfirmation?: boolean; reason?: string; terme?: string; emailMasque?: string };
      if (d.needsConfirmation) {
        // Deux confirmations distinctes, deux cases distinctes : le renvoi
        // (déjà envoyé) et le registre (un mot du texte patient). La route
        // refuse de faire valoir l'une pour l'autre ; l'écran non plus.
        if (d.reason === 'REGISTRE_ANXIOGENE') setRegistreATrancher(d.terme ?? '');
        setFeedback({ ok: false, msg: d.warning ?? 'Booklet déjà envoyé. Cochez le renvoi forcé pour confirmer.' });
        return;
      }
      if (!r.ok || !d.success) {
        setFeedback({ ok: false, msg: d.error ?? 'Erreur lors de l\'envoi.' });
        return;
      }
      setFeedback({ ok: true, msg: `Booklet envoyé à ${d.emailMasque ?? 'patient'}.` });
      setRelectureConfirmee(false);
      setForceSend(false);
      setRegistreATrancher(null);
      setConfirmerRegistre(false);
      await loadSyntheses(selectedPatient);
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSending(false);
    }
  };

  const patient = patients.find(p => p.idPatient === selectedPatient);
  const brouillonEditable = selectedSynthese?.statut === 'Brouillon_Praticien' || selectedSynthese?.statut === 'Brouillon_IA';
  const validationBrouillonBloquee =
    brouillonEditable
    && (
      manualDirty
      || !editedManual?.resume_praticien.trim()
      || !editedManual?.narratif_patient.trim()
    );

  return (
    <div className="flex flex-col gap-6">

      {/* Sélection patient */}
      <div className="bg-surface border border-border rounded-xl shadow-card p-4">
        <h3 className="font-display text-lg font-semibold text-foreground mb-3">Patient</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={selectedPatient}
            onChange={e => onSelectPatient(e.target.value)}
            className={`${inputCls} w-full sm:w-96`}
          >
            <option value="">Sélectionner un patient</option>
            {patients.map(p => (
              <option key={p.idPatient} value={p.idPatient}>
                {`${p.prenom} ${p.nom} — ${p.email}`}
              </option>
            ))}
          </select>
          {selectedPatient && (
            <>
              <button
                onClick={onGenerate}
                disabled={generating || saving}
                className={`${btnPrimary} inline-flex items-center gap-2 bg-primary`}
              >
                <Sparkles size={16} aria-hidden="true" />
                {generating ? 'Génération en cours...' : 'Générer une synthèse IA'}
              </button>
              <button
                onClick={() => {
                  setSelectedSynthese(null);
                  setEditedManual(null);
                  setManualDraft(nouveauBrouillonPraticien());
                  setBookletHtml(null);
                  setFeedback(null);
                }}
                disabled={generating || saving}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
              >
                <PenLine size={16} aria-hidden="true" />
                Rédiger une synthèse
              </button>
            </>
          )}
        </div>
        {feedback && (
          <p className={`mt-2 text-base ${feedback.ok ? 'text-status-success' : 'text-status-danger'}`}>{feedback.msg}</p>
        )}
      </div>

      {manualDraft && selectedPatient && (
        <div className="bg-surface border border-border rounded-xl shadow-card p-4">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
            Nouveau brouillon praticien
          </h3>
          <SynthesePraticienEditor
            value={manualDraft}
            onChange={setManualDraft}
            onSave={onCreateManual}
            onCancel={() => setManualDraft(null)}
            saving={saving}
            saveLabel="Créer le brouillon"
          />
          {feedback && (
            <p className={`mt-3 text-base ${feedback.ok ? 'text-status-success' : 'text-status-danger'}`}>{feedback.msg}</p>
          )}
        </div>
      )}

      {/* Liste des synthèses */}
      {selectedPatient && (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Synthèses de {patient ? `${patient.prenom} ${patient.nom}` : selectedPatient}
              <span className="ml-2 text-muted-foreground font-normal">({syntheses.length})</span>
            </h3>
          </div>
          {loading ? (
            <div className="px-4 py-4 text-base text-muted-foreground">Chargement...</div>
          ) : syntheses.length === 0 ? (
            <div className="px-4 py-4 text-base text-muted-foreground">Aucune synthèse pour ce patient.</div>
          ) : (
            <div className="divide-y divide-border">
              {syntheses.map(s => (
                <div key={s.idSynthese} className="px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLOR[s.statut] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUT_LABEL[s.statut] ?? s.statut}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(s.dateGeneration).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {estRedactionPraticien(s.modele) ? 'Rédaction praticien' : s.modele}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSynthese(s);
                      setManualDraft(null);
                      setEditedManual(s.statut === 'Brouillon_Praticien' || s.statut === 'Brouillon_IA' ? s.syntheseJson : null);
                      setManualDirty(false);
                      setNotes(s.notesPraticien ?? '');
                      setBookletHtml(null);
                      setBookletInfo(null);
                      setFeedback(null);
                    }}
                    className="text-xs text-accent hover:underline"
                  >
                    Voir / gérer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Détail synthèse sélectionnée */}
      {selectedSynthese && (
        <div className="bg-surface border border-border rounded-xl shadow-card p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Synthèse {selectedSynthese.idSynthese}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLOR[selectedSynthese.statut] ?? 'bg-muted text-muted-foreground'}`}>
                {STATUT_LABEL[selectedSynthese.statut] ?? selectedSynthese.statut}
              </span>
            </h3>
            <button onClick={() => { setSelectedSynthese(null); setEditedManual(null); setManualDirty(false); setBookletHtml(null); }} className="text-xs text-muted-foreground hover:text-foreground">
              Fermer
            </button>
          </div>

          {/* Synthèse antérieure au retrait d'interprétation : elle a pu
              s'appuyer sur une mesure qui n'en était pas une, et elle reste la
              seule source du booklet patient et du courrier médecin. On ne la
              réécrit pas — on dit ce qu'elle vaut, avant que le praticien ne
              l'envoie. */}
          {selectedSynthese.avertissementMesureRetiree && (
            <p className="rounded-lg border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {selectedSynthese.avertissementMesureRetiree}
            </p>
          )}

          {brouillonEditable && editedManual ? (
            <>
              <SynthesePraticienEditor
                key={selectedSynthese.idSynthese}
                value={editedManual}
                onChange={value => {
                  setEditedManual(value);
                  setManualDirty(true);
                }}
                onSave={onSaveManual}
                saving={saving}
              />
              {manualDirty && (
                <p className="text-sm text-status-warning">
                  Enregistrez les modifications avant de valider le brouillon.
                </p>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Résumé praticien</p>
                <p className="text-base text-foreground leading-relaxed">{selectedSynthese.syntheseJson.resume_praticien}</p>
              </div>

              {selectedSynthese.syntheseJson.axes_prioritaires?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Axes prioritaires</p>
                  <div className="flex flex-col gap-2">
                    {selectedSynthese.syntheseJson.axes_prioritaires.map((axe, i) => (
                      <div key={i} className="bg-muted border border-border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-medium text-foreground">{axe.axe}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITE_COLOR[axe.niveau_priorite] ?? 'bg-muted text-muted-foreground'}`}>
                            {PRIORITE_LABEL[axe.niveau_priorite] ?? axe.niveau_priorite}
                          </span>
                        </div>
                        {axe.arguments?.length > 0 && (
                          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                            {axe.arguments.map((a, j) => <li key={j}>{a}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedSynthese.syntheseJson.points_de_vigilance?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Points de vigilance</p>
                  <ul className="text-base text-foreground list-disc pl-4 space-y-0.5">
                    {selectedSynthese.syntheseJson.points_de_vigilance.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              <p className="text-xs text-muted-foreground italic">{selectedSynthese.syntheseJson.limites}</p>
            </>
          )}

          {/* Actions validation */}
          {(selectedSynthese.statut === 'Brouillon_IA' || selectedSynthese.statut === 'Brouillon_Praticien') && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button
                onClick={() => onAction(selectedSynthese.idSynthese, 'valider')}
                disabled={saving || validationBrouillonBloquee}
                className={`${btnPrimary} bg-status-success`}
              >
                {saving ? '...' : 'Valider la synthèse'}
              </button>
              <button onClick={() => onAction(selectedSynthese.idSynthese, 'rejeter')} disabled={saving} className={`${btnPrimary} bg-status-danger`}>
                {saving ? '...' : 'Rejeter'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onResetSynthese}
              disabled={saving || sending}
              className="inline-flex items-center gap-2 rounded-lg border border-status-danger/40 px-4 py-2 text-sm font-medium text-status-danger hover:bg-status-danger/10 disabled:opacity-60"
            >
              <Trash2 size={16} aria-hidden="true" />
              {saving ? 'Effacement...' : 'Vider la synthèse'}
            </button>
          </div>

          {/* Notes praticien */}
          {(selectedSynthese.statut === 'Validee_Praticien' || selectedSynthese.statut === 'Corrigee_Praticien') && (
            <div className="pt-2 border-t border-border flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note / correction praticien</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Ajoutez une note ou une correction à inclure dans le booklet..."
                className={`${inputCls} resize-y`}
              />
              <button onClick={() => onAction(selectedSynthese.idSynthese, 'annoter')} disabled={saving} className={`${btnPrimary} bg-primary self-start`}>
                {saving ? '...' : 'Enregistrer la note'}
              </button>
            </div>
          )}

          {/* Booklet */}
          {(selectedSynthese.statut === 'Validee_Praticien' || selectedSynthese.statut === 'Corrigee_Praticien') && (
            <div className="pt-2 border-t border-border flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-foreground">Booklet patient</h4>
              <button
                onClick={() => onLoadBooklet(selectedSynthese.idSynthese)}
                disabled={loadingBooklet}
                className={`${btnPrimary} self-start bg-indigo-600`}
              >
                {loadingBooklet ? 'Préparation...' : 'Prévisualiser le booklet'}
              </button>

              {bookletHtml && (
                <div className="flex flex-col gap-3">
                  {bookletInfo?.dejaEnvoye && (
                    <div className="text-xs bg-status-warning/10 border border-status-warning/30 rounded-lg px-3 py-2 text-status-warning">
                      Booklet déjà envoyé à {bookletInfo.emailMasque ?? 'patient'}.
                    </div>
                  )}
                  <div className="border border-border rounded-lg overflow-hidden" style={{ height: 480 }}>
                    <iframe srcDoc={bookletHtml} title="Prévisualisation booklet" className="w-full h-full" sandbox="allow-same-origin" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={relectureConfirmee} onChange={e => setRelectureConfirmee(e.target.checked)} />
                      J&apos;ai relu et validé le booklet ci-dessus avant envoi au patient.
                    </label>
                    {bookletInfo?.dejaEnvoye && (
                      <label className="flex items-center gap-2 text-sm text-status-warning cursor-pointer">
                        <input type="checkbox" checked={forceSend} onChange={e => setForceSend(e.target.checked)} />
                        Confirmer le renvoi (déjà envoyé précédemment).
                      </label>
                    )}
                    {registreATrancher !== null && (
                      <label className="flex items-start gap-2 text-sm text-status-warning cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmerRegistre}
                          onChange={e => setConfirmerRegistre(e.target.checked)}
                          className="mt-1"
                        />
                        <span>
                          Envoyer tel quel malgré le mot{' '}
                          <strong>« {registreATrancher} »</strong> dans le texte lu par le patient.
                          Ce texte est lu seul, souvent avant la consultation : reformulez-le si vous
                          le pouvez, ou cochez pour l&apos;assumer.
                        </span>
                      </label>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onSend(selectedSynthese.idSynthese)}
                        disabled={sending || !relectureConfirmee}
                        className={`${btnPrimary} bg-status-success`}
                      >
                        {sending ? 'Envoi en cours...' : 'Envoyer au patient'}
                      </button>
                      <button
                        type="button"
                        onClick={onClearBooklet}
                        disabled={sending}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Effacer le booklet affiché
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {feedback && (
            <p className={`text-base ${feedback.ok ? 'text-status-success' : 'text-status-danger'}`}>{feedback.msg}</p>
          )}
        </div>
      )}
    </div>
  );
}
