'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { PortailSessionResponse, PortailConsultationState } from '@/app/api/portail/session/route';
import { MOTIFS_CONSULTATION } from '@/lib/consultation/motifs';
import { FICHE_SECTIONS, FICHE_CHAMPS_REQUIS } from '@/lib/consultation/fiche';
import { ANAMNESE_SECTIONS, ANAMNESE_CHAMP_REQUIS } from '@/lib/consultation/anamnese';
import type { AnamneseChamp, AnamneseValeurs } from '@/lib/consultation/anamnese';
import { PatientCard } from '@/components/patient/ui/PatientCard';
import { PatientButton } from '@/components/patient/ui/PatientButton';
import { PatientField, patientInputClassName } from '@/components/patient/ui/PatientField';
import { PatientInlineMessage } from '@/components/patient/ui/PatientInlineMessage';
import { PatientPageHeader } from '@/components/patient/ui/PatientPageHeader';
import { SaveStatusIndicator, type SaveError } from '@/components/patient/SaveStatusIndicator';
import { PatientJourneyProgress, buildJourneySteps } from '@/components/patient/PatientJourneyProgress';
import { AvantDeCommencer } from '@/components/patient/trust/AvantDeCommencer';
import { DocumentTrust } from '@/components/patient/trust/DocumentTrust';
import { getDocumentCourant } from '@/lib/trust/contenus/registre';

// ─── autosave locale minimale (gate/fiche/anamnèse n'ont pas de idAssignation
// avant l'onboarding — clé scopée par patient plutôt que par assignation, sur
// le même principe que web/src/lib/questionnaire-draft.ts).
//
// La clé porte l'`idPatient` de la session vérifiée, jamais le jeton de l'URL.
// Deux raisons : le jeton est un secret d'accès et n'a rien à faire dans le
// stockage du navigateur ; et il est appelé à changer (lien magique à
// consommation unique, gate G4) — un brouillon indexé dessus deviendrait
// introuvable au lien suivant, alors que la personne, elle, n'a pas changé.
// ────────────────────────────────────────────────────────────────────────────
type WizardDraftKind = 'fiche' | 'anamnese';

// Fiche/anamnèse contiennent des données d'identité et de santé (plus
// sensibles qu'un simple brouillon de réponses) sur un lien token parfois
// utilisé depuis un appareil partagé : le brouillon local expire donc après
// un délai, au lieu d'être conservé indéfiniment.
const WIZARD_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type WizardDraftValidator<T> = (value: unknown) => value is T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(v => typeof v === 'string');
}

function isAnamneseValeursRecord(value: unknown): value is AnamneseValeurs {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((v) => {
    if (typeof v === 'string') return true;
    if (!Array.isArray(v)) return false;
    return v.every((item) => {
      if (typeof item === 'string') return true;
      if (!isPlainObject(item)) return false;
      return Object.values(item).every(field => typeof field === 'string');
    });
  });
}

function isAnamneseWizardDraft(value: unknown): value is { valeurs: AnamneseValeurs; motif: string } {
  if (!isPlainObject(value)) return false;
  if (typeof value.motif !== 'string') return false;
  return isAnamneseValeursRecord(value.valeurs);
}

function wizardDraftKey(kind: WizardDraftKind, idPatient: string): string {
  return `wellneuro:wizard-draft:${kind}:${idPatient}`;
}
function wizardDraftSavedAtKey(kind: WizardDraftKind, idPatient: string): string {
  return `wellneuro:wizard-draft-meta:${kind}:${idPatient}`;
}

// Pas d'identité, pas de brouillon : mieux vaut ne rien conserver qu'écrire
// dans un compartiment commun à tous les patients de l'appareil.
function readWizardDraft<T>(kind: WizardDraftKind, idPatient: string, validate: WizardDraftValidator<T>): T | null {
  if (typeof window === 'undefined' || !idPatient) return null;
  try {
    const savedAt = readWizardDraftSavedAt(kind, idPatient);
    if (savedAt && Date.now() - savedAt.getTime() > WIZARD_DRAFT_TTL_MS) {
      clearWizardDraft(kind, idPatient);
      return null;
    }
    const raw = window.sessionStorage.getItem(wizardDraftKey(kind, idPatient));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function writeWizardDraft(kind: WizardDraftKind, idPatient: string, value: unknown): void {
  if (typeof window === 'undefined' || !idPatient) return;
  try {
    window.sessionStorage.setItem(wizardDraftKey(kind, idPatient), JSON.stringify(value));
    window.sessionStorage.setItem(wizardDraftSavedAtKey(kind, idPatient), new Date().toISOString());
  } catch {
    /* quota / mode privé : on n'interrompt pas la saisie */
  }
}
function readWizardDraftSavedAt(kind: WizardDraftKind, idPatient: string): Date | null {
  if (typeof window === 'undefined' || !idPatient) return null;
  try {
    const raw = window.sessionStorage.getItem(wizardDraftSavedAtKey(kind, idPatient));
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}
function clearWizardDraft(kind: WizardDraftKind, idPatient: string): void {
  if (typeof window === 'undefined' || !idPatient) return;
  try {
    window.sessionStorage.removeItem(wizardDraftKey(kind, idPatient));
    window.sessionStorage.removeItem(wizardDraftSavedAtKey(kind, idPatient));
  } catch {
    /* no-op */
  }
}

// ─── (EmailGate retiré au LOT-04) ───────────────────────────────────────────
// Plus d'entrée par jeton+email : l'accès passe par le cookie de session posé à
// l'atterrissage magic-link/Google. Sans cookie valide, la page redirige vers
// `/portail/connexion` (voir le useEffect ci-dessous) au lieu d'afficher un gate.

// ─── étape : consentement ───────────────────────────────────────────────────
function ConsentScreen({ token, email, onAccepted }: { token: string; email: string; onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/portail/consentement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) setError(data.error ?? 'Erreur. Réessayez.');
      else onAccepted();
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  // Texte sourcé depuis le document versionné consentement_suivi (TRUST
  // LOT-02) : la version stockée en base correspond enfin au texte affiché.
  return (
    <PatientCard>
      <PatientPageHeader title="Votre consentement au suivi" />
      <div className="mt-2">
        <DocumentTrust document={getDocumentCourant('consentement_suivi')} />
      </div>
      <label className="flex items-start gap-3 mt-6 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1 accent-primary" />
        <span className="text-sm text-foreground">
          J’ai lu ces informations et j’accepte que mes données soient collectées et utilisées dans les conditions décrites ci-dessus.
        </span>
      </label>
      {error && <div className="mt-4"><PatientInlineMessage tone="error">{error}</PatientInlineMessage></div>}
      <PatientButton
        variant="primary" disabled={!checked} loading={loading} loadingLabel="Enregistrement…"
        onClick={handleContinue} className="w-full mt-6"
      >
        Donner mon consentement
      </PatientButton>
    </PatientCard>
  );
}

// ─── étape : fiche signalétique (paginée section par section) ──────────────
function FicheForm({ token, idPatient, email, onDone }: {
  token: string; idPatient: string; email: string; onDone: () => void;
}) {
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => readWizardDraft('fiche', idPatient, isStringRecord) ?? {});
  const [mentions, setMentions] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(() => readWizardDraftSavedAt('fiche', idPatient));
  const [saveError, setSaveError] = useState<SaveError | undefined>(undefined);
  const premierRendu = useRef(true);

  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    writeWizardDraft('fiche', idPatient, valeurs);
    setSavedAt(readWizardDraftSavedAt('fiche', idPatient));
  }, [valeurs, idPatient]);

  const set = (id: string, v: string) => setValeurs(prev => ({ ...prev, [id]: v }));
  const requisManquant = FICHE_CHAMPS_REQUIS.some(id => !(valeurs[id] ?? '').trim());

  const section = FICHE_SECTIONS[sectionIndex];
  const isLastSection = sectionIndex === FICHE_SECTIONS.length - 1;
  const sectionRequisManquant = section.champs.some(
    champ => FICHE_CHAMPS_REQUIS.includes(champ.id) && !(valeurs[champ.id] ?? '').trim(),
  );

  const soumettre = async () => {
    setError('');
    setSaveError(undefined);
    setLoading(true);
    try {
      const res = await fetch('/api/portail/fiche', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, fiche: valeurs }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? 'Erreur. Réessayez.'); setSaveError('submission-incomplete'); }
      else { clearWizardDraft('fiche', idPatient); onDone(); }
    } catch {
      setError('Erreur réseau. Réessayez.');
      setSaveError('network');
    } finally {
      setLoading(false);
    }
  };

  const handleSectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLastSection) { setSectionIndex(i => i + 1); window.scrollTo(0, 0); return; }
    void soumettre();
  };

  return (
    <PatientCard as="form" onSubmit={handleSectionSubmit} className="space-y-6">
      <div>
        <div className="text-xs text-muted-foreground/70 mb-2">Section {sectionIndex + 1} / {FICHE_SECTIONS.length}</div>
        <PatientPageHeader
          title="Fiche de renseignements"
          subtitle="Ces informations aident votre praticien à personnaliser votre suivi."
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">{section.titre}</legend>
        {section.champs.map(champ => {
          const requis = FICHE_CHAMPS_REQUIS.includes(champ.id);
          return (
            <PatientField key={champ.id} label={champ.label} requis={requis}>
              {champ.type === 'select' ? (
                <select value={valeurs[champ.id] ?? ''} onChange={e => set(champ.id, e.target.value)} required={requis} className={patientInputClassName}>
                  <option value="">Sélectionnez…</option>
                  {(champ.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : champ.type === 'textarea' ? (
                <textarea value={valeurs[champ.id] ?? ''} onChange={e => set(champ.id, e.target.value)} placeholder={champ.placeholder} rows={3} className={patientInputClassName} />
              ) : (
                <input type="text" value={valeurs[champ.id] ?? ''} onChange={e => set(champ.id, e.target.value)} required={requis} placeholder={champ.placeholder} className={patientInputClassName} />
              )}
            </PatientField>
          );
        })}
      </fieldset>

      {isLastSection && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={mentions} onChange={e => setMentions(e.target.checked)} className="mt-1 accent-primary" />
          <span className="text-sm text-muted-foreground">
            Je certifie l’exactitude des informations fournies. Elles sont traitées de manière confidentielle et
            uniquement dans le cadre de mon suivi (données personnelles, sans finalité de diagnostic médical).
          </span>
        </label>
      )}

      {error && <PatientInlineMessage tone="error">{error}</PatientInlineMessage>}
      <SaveStatusIndicator savedAt={savedAt} error={saveError} />

      <div className="flex gap-3">
        {sectionIndex > 0 && (
          <PatientButton
            variant="neutral" className="flex-1"
            onClick={() => { setSectionIndex(i => i - 1); window.scrollTo(0, 0); }}
          >
            ← Précédent
          </PatientButton>
        )}
        <PatientButton
          type="submit" variant="primary" className="flex-1"
          disabled={isLastSection ? (loading || requisManquant || !mentions) : sectionRequisManquant}
          loading={loading} loadingLabel="Enregistrement…"
        >
          {isLastSection ? 'Continuer vers l’anamnèse' : 'Suivant →'}
        </PatientButton>
      </div>
    </PatientCard>
  );
}

// ─── étape : anamnèse hiérarchisée (paginée section par section) ───────────
// Rendu d'un champ simple (text / textarea / radio / checkbox-multi).
function ChampSimple({ champ, valeur, onChange, requis }: {
  champ: AnamneseChamp;
  valeur: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  requis: boolean;
}) {
  if (champ.type === 'radio') {
    const courant = typeof valeur === 'string' ? valeur : '';
    return (
      <PatientField label={champ.label} requis={requis}>
        <div className="flex flex-wrap gap-2">
          {(champ.options ?? []).map(opt => {
            const actif = courant === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(actif ? '' : opt)}
                className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${actif ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface text-muted-foreground border-border hover:border-primary/60'}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </PatientField>
    );
  }

  if (champ.type === 'checkbox-multi') {
    const selection = Array.isArray(valeur) ? valeur : [];
    const toggle = (opt: string) =>
      onChange(selection.includes(opt) ? selection.filter(o => o !== opt) : [...selection, opt]);
    return (
      <PatientField label={champ.label} requis={requis}>
        <div className="flex flex-col gap-1.5">
          {(champ.options ?? []).map(opt => (
            <label key={opt} className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={selection.includes(opt)} onChange={() => toggle(opt)} className="mt-0.5 accent-primary" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </PatientField>
    );
  }

  const str = typeof valeur === 'string' ? valeur : '';
  return (
    <PatientField label={champ.label} requis={requis} suffixe={champ.suffixe}>
      {champ.type === 'textarea' ? (
        <textarea value={str} onChange={e => onChange(e.target.value)} required={requis} placeholder={champ.placeholder} rows={3} className={patientInputClassName} />
      ) : (
        <input type="text" value={str} onChange={e => onChange(e.target.value)} required={requis} placeholder={champ.placeholder} className={patientInputClassName} />
      )}
    </PatientField>
  );
}

function AnamneseForm({ token, idPatient, email, motifInitial, onDone }: {
  token: string; idPatient: string; email: string; motifInitial: string | null; onDone: (premiereAssignation: string | null) => void;
}) {
  type AnamneseDraft = { valeurs: AnamneseValeurs; motif: string };
  const draft = readWizardDraft<AnamneseDraft>('anamnese', idPatient, isAnamneseWizardDraft);
  const [valeurs, setValeurs] = useState<AnamneseValeurs>(() => draft?.valeurs ?? {});
  const [motif, setMotif] = useState(() => draft?.motif ?? motifInitial ?? '');
  const [sectionIndex, setSectionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(() => readWizardDraftSavedAt('anamnese', idPatient));
  const [saveError, setSaveError] = useState<SaveError | undefined>(undefined);
  const premierRendu = useRef(true);

  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    writeWizardDraft('anamnese', idPatient, { valeurs, motif });
    setSavedAt(readWizardDraftSavedAt('anamnese', idPatient));
  }, [valeurs, motif, idPatient]);

  const setChamp = (id: string, v: string | string[]) => setValeurs(prev => ({ ...prev, [id]: v }));

  // Groupes répétables : liste d'entrées (objets de champs texte).
  const entrees = (groupeId: string): Array<Record<string, string>> => {
    const v = valeurs[groupeId];
    return Array.isArray(v) && (v.length === 0 || typeof v[0] === 'object')
      ? (v as Array<Record<string, string>>)
      : [];
  };
  const ajouterEntree = (groupeId: string) =>
    setValeurs(prev => ({ ...prev, [groupeId]: [...entrees(groupeId), {}] }));
  const supprimerEntree = (groupeId: string, index: number) =>
    setValeurs(prev => ({ ...prev, [groupeId]: entrees(groupeId).filter((_, i) => i !== index) }));
  const setEntreeChamp = (groupeId: string, index: number, champId: string, v: string) =>
    setValeurs(prev => ({
      ...prev,
      [groupeId]: entrees(groupeId).map((e, i) => (i === index ? { ...e, [champId]: v } : e)),
    }));

  const requisValeur = valeurs[ANAMNESE_CHAMP_REQUIS];
  const requisManquant = typeof requisValeur !== 'string' || !requisValeur.trim();

  const section = ANAMNESE_SECTIONS[sectionIndex];
  const isLastSection = sectionIndex === ANAMNESE_SECTIONS.length - 1;
  const sectionRequisManquant = (section.champs ?? []).some(champ => {
    if (champ.id !== ANAMNESE_CHAMP_REQUIS) return false;
    const v = valeurs[champ.id];
    return typeof v !== 'string' || !v.trim();
  });

  const soumettre = async () => {
    setError('');
    setSaveError(undefined);
    setLoading(true);
    try {
      const res = await fetch('/api/portail/valider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, anamnese: valeurs, motif }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; premiereAssignation?: string | null };
      if (!data.ok) { setError(data.error ?? 'Erreur. Réessayez.'); setSaveError('submission-incomplete'); }
      else { clearWizardDraft('anamnese', idPatient); onDone(data.premiereAssignation ?? null); }
    } catch {
      setError('Erreur réseau. Réessayez.');
      setSaveError('network');
    } finally {
      setLoading(false);
    }
  };

  const handleSectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLastSection) { setSectionIndex(i => i + 1); window.scrollTo(0, 0); return; }
    void soumettre();
  };

  return (
    <PatientCard as="form" onSubmit={handleSectionSubmit} className="space-y-6">
      <div>
        <div className="text-xs text-muted-foreground/70 mb-2">Section {sectionIndex + 1} / {ANAMNESE_SECTIONS.length}</div>
        <PatientPageHeader
          title="Anamnèse"
          subtitle="Décrivez votre situation. Ces éléments complètent vos questionnaires et guideront votre accompagnement."
        />
      </div>

      {sectionIndex === 0 && (
        <PatientField label="Motif de consultation">
          <select value={motif} onChange={e => setMotif(e.target.value)} className={patientInputClassName}>
            <option value="">Sélectionnez un motif (optionnel)</option>
            {MOTIFS_CONSULTATION.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </PatientField>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">{section.titre}</legend>
        {section.description && <p className="text-xs text-muted-foreground/70 -mt-2">{section.description}</p>}

        {(section.champs ?? []).map(champ => (
          <ChampSimple
            key={champ.id}
            champ={champ}
            valeur={valeurs[champ.id] as string | string[] | undefined}
            onChange={v => setChamp(champ.id, v)}
            requis={champ.id === ANAMNESE_CHAMP_REQUIS}
          />
        ))}

        {(section.groupes ?? []).map(groupe => (
          <div key={groupe.id} className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">{groupe.label}</p>
              {groupe.description && <p className="text-xs text-muted-foreground/70">{groupe.description}</p>}
            </div>
            {entrees(groupe.id).map((entree, index) => (
              <div key={index} className="rounded-lg border border-border p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {groupe.champs.map(champ => (
                    <div key={champ.id}>
                      <label className="block text-xs text-muted-foreground/70 mb-1">{champ.label}</label>
                      <input
                        type="text"
                        value={entree[champ.id] ?? ''}
                        onChange={e => setEntreeChamp(groupe.id, index, champ.id, e.target.value)}
                        className={patientInputClassName}
                      />
                    </div>
                  ))}
                </div>
                <PatientButton variant="danger-text" onClick={() => supprimerEntree(groupe.id, index)}>
                  Supprimer cette ligne
                </PatientButton>
              </div>
            ))}
            <PatientButton variant="ghost" onClick={() => ajouterEntree(groupe.id)}>
              + {groupe.ajoutLabel}
            </PatientButton>
          </div>
        ))}
      </fieldset>

      {error && <PatientInlineMessage tone="error">{error}</PatientInlineMessage>}
      <SaveStatusIndicator savedAt={savedAt} error={saveError} />

      <div className="flex gap-3">
        {sectionIndex > 0 && (
          <PatientButton
            variant="neutral" className="flex-1"
            onClick={() => { setSectionIndex(i => i - 1); window.scrollTo(0, 0); }}
          >
            ← Précédent
          </PatientButton>
        )}
        <PatientButton
          type="submit" variant="primary" className="flex-1"
          disabled={isLastSection ? (loading || requisManquant) : sectionRequisManquant}
          loading={loading} loadingLabel="Validation…"
        >
          {isLastSection ? 'Valider et accéder à mon parcours' : 'Suivant →'}
        </PatientButton>
      </div>
    </PatientCard>
  );
}

// ─── étape : terminé / accès questionnaires ─────────────────────────────────
function DoneScreen({ token, premiereAssignation }: { token: string; premiereAssignation: string | null }) {
  return (
    <PatientCard maxWidth="md" className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-status-success/10 mb-4">
        <svg className="w-8 h-8 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="font-display text-xl font-bold text-foreground mb-2">Merci !</h2>
      <p className="text-muted-foreground text-sm leading-relaxed mb-6">
        Vos renseignements ont bien été transmis à votre praticien.<br />
        {premiereAssignation
          ? 'Vos questionnaires de suivi sont maintenant disponibles.'
          : 'Vous n’avez aucun questionnaire en attente pour le moment.'}
      </p>
      {/* Le lien ne dépend plus de `premiereAssignation`. La session ne compte
          que les assignations NON complétées (`statut: { not: 'Complété' }`) :
          le champ est donc null AUSSI pour un patient qui a tout rempli, à qui
          cet écran fermait la porte du hub — précisément l'écran qui sait dire
          « transmis / en préparation / restitution disponible ». Le libellé
          ci-dessus ne promet plus rien à sa place. */}
      <a href={`/portail/${token}/questionnaires`} className="inline-block py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
        Accéder à mon parcours
      </a>
    </PatientCard>
  );
}

// ─── page principale ─────────────────────────────────────────────────────────
type Step =
  | { name: 'loading' }
  | { name: 'avant' } // séquence TRUST « Avant de commencer », avant tout recueil
  | { name: 'consent' }
  | { name: 'fiche' }
  | { name: 'anamnese' }
  | { name: 'done'; premiereAssignation: string | null };

function prochaineEtape(c: PortailConsultationState | null, premiere: string | null): Step {
  if (!c || c.statut === 'validee') return { name: 'done', premiereAssignation: premiere };
  if (!c.consentementDonne) return { name: 'consent' };
  if (!c.ficheRemplie) return { name: 'fiche' };
  return { name: 'anamnese' };
}

export default function PortailPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'loading' });
  const [email, setEmail] = useState('');
  // Identité de session : elle nomme les brouillons locaux. Toujours renseignée
  // avant que fiche ou anamnèse ne s'affichent — ces étapes ne sont atteintes
  // que par `appliquerSession`.
  const [idPatient, setIdPatient] = useState('');
  const [consultation, setConsultation] = useState<PortailConsultationState | null>(null);
  const [premiere, setPremiere] = useState<string | null>(null);

  const appliquerSession = useCallback((data: Extract<PortailSessionResponse, { ok: true }>) => {
    setEmail(data.patient.email.toLowerCase());
    setIdPatient(data.patient.idPatient);
    setConsultation(data.consultation);
    setPremiere(data.premiereAssignation);
    // Séquence TRUST « Avant de commencer » : requise tant que la version
    // courante du cadre n'a pas d'accusé de lecture (patients existants
    // inclus, une fois). Jamais bloquante en cas d'erreur réseau : le
    // parcours de soin continue. Une réponse non-ok juste après l'ouverture
    // de session peut n'être qu'un défaut de propagation du cookie (WebKit,
    // serveur rapide) : brefs réessais bornés avant de dégrader — sinon la
    // séquence serait sautée en silence pour un simple aléa réseau.
    void (async () => {
      for (let essai = 0; essai < 3; essai++) {
        try {
          const res = await fetch(`/api/portail/trust/etat?token=${encodeURIComponent(String(token))}`);
          if (res.ok) {
            const etat = (await res.json()) as { ok: boolean; avantDeCommencerRequis?: boolean };
            if (etat.ok && etat.avantDeCommencerRequis) {
              setStep({ name: 'avant' });
              return;
            }
            break; // réponse saine : séquence non requise
          }
        } catch {
          /* réessai ci-dessous */
        }
        await new Promise(resolve => setTimeout(resolve, 300 * (essai + 1)));
      }
      setStep(prochaineEtape(data.consultation, data.premiereAssignation));
    })();
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/portail/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = (await response.json()) as PortailSessionResponse;
        if (!active) return;
        if (data.ok) appliquerSession(data);
        // Pas de cookie valide (lien permanent mort, session expirée) : plus de
        // gate email au LOT-04 — on renvoie vers la page de connexion.
        else router.replace('/portail/connexion');
      } catch {
        if (active) router.replace('/portail/connexion');
      }
    })();
    return () => { active = false; };
  }, [token, appliquerSession, router]);

  if (step.name === 'loading') {
    return (
      <PatientCard maxWidth="md">
        <p className="text-sm text-muted-foreground" role="status">Vérification de votre session…</p>
      </PatientCard>
    );
  }

  if (step.name === 'avant') {
    return (
      <div className="w-full max-w-2xl space-y-4">
        <AvantDeCommencer
          token={token}
          onDone={() => setStep(prochaineEtape(consultation, premiere))}
        />
      </div>
    );
  }

  if (step.name === 'consent') {
    return (
      <div className="w-full max-w-2xl space-y-4">
        <PatientJourneyProgress steps={buildJourneySteps(1)} />
        <ConsentScreen
          token={token}
          email={email}
          onAccepted={() => {
            const next = consultation ? { ...consultation, consentementDonne: true } : null;
            setConsultation(next);
            setStep(prochaineEtape(next, premiere));
          }}
        />
      </div>
    );
  }

  if (step.name === 'fiche') {
    return (
      <div className="w-full max-w-2xl space-y-4">
        <PatientJourneyProgress steps={buildJourneySteps(2)} />
        <FicheForm
          token={token}
          idPatient={idPatient}
          email={email}
          onDone={() => {
            const next = consultation ? { ...consultation, ficheRemplie: true } : null;
            setConsultation(next);
            setStep(prochaineEtape(next, premiere));
          }}
        />
      </div>
    );
  }

  if (step.name === 'anamnese') {
    return (
      <div className="w-full max-w-2xl space-y-4">
        <PatientJourneyProgress steps={buildJourneySteps(3)} />
        <AnamneseForm
          token={token}
          idPatient={idPatient}
          email={email}
          motifInitial={consultation?.motif ?? null}
          onDone={pa => setStep({ name: 'done', premiereAssignation: pa ?? premiere })}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <PatientJourneyProgress steps={buildJourneySteps(4)} />
      <DoneScreen token={token} premiereAssignation={step.premiereAssignation} />
    </div>
  );
}
