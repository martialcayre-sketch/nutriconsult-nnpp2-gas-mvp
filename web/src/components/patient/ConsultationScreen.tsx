'use client';

import { useEffect, useState } from 'react';
import { PatientCard } from '@/components/patient/ui/PatientCard';
import { PatientButton } from '@/components/patient/ui/PatientButton';
import { PatientInlineMessage } from '@/components/patient/ui/PatientInlineMessage';

// Écran de consultation en lecture seule (réponses verrouillées) + demande de
// modification. Composant présentationnel : la navigation « Mon équilibre » est
// confiée à onVoirEquilibre.
//
// `fetchUrl`/`readOnlyPreview` sont additifs pour le mécanisme
// PrévisualisationPatient (HC-F LOT-03) : par défaut (props absents), le
// comportement du portail réel est strictement inchangé.
export function ConsultationScreen({ idAssignation, email, statutReponses, onVoirEquilibre, fetchUrl, readOnlyPreview }: {
  idAssignation: string;
  email?: string;
  statutReponses: string;
  onVoirEquilibre: () => void;
  fetchUrl?: string;
  readOnlyPreview?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reponse, setReponse] = useState<{ titre: string; dateReponse: string } | null>(null);
  const [demandeEnvoyee, setDemandeEnvoyee] = useState(statutReponses === 'modification_demandee');
  const [demandeLoading, setDemandeLoading] = useState(false);
  const [commentaire, setCommentaire] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const emailQuery = email ? `&email=${encodeURIComponent(email)}` : '';
        const url = fetchUrl ?? `/api/patient/reponses?id=${encodeURIComponent(idAssignation)}${emailQuery}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.ok) { setError(data.error); }
        else { setReponse({ titre: data.titre, dateReponse: data.dateReponse }); }
      } catch {
        setError('Erreur réseau. Réessayez.');
      } finally {
        setLoading(false);
      }
    })();
  }, [email, fetchUrl, idAssignation]);

  const handleDemande = async () => {
    setDemandeLoading(true);
    // Remis à blanc à l'entrée : le message affiché doit porter sur CETTE
    // tentative, pas sur l'échec de chargement qui l'a précédée.
    setError('');
    try {
      const res = await fetch('/api/patient/consentement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAssignation, email, action: 'demander_modification', commentaire: commentaire.trim() }),
      });
      const data = await res.json();
      if (data.ok) setDemandeEnvoyee(true);
      // La route rend TOUJOURS un `error` rédigé quand `ok` est faux (401, 403,
      // 409 `invalid_state`, 410 expiré ou annulé…). Sans cette branche, tous
      // ces refus laissaient l'écran strictement inchangé : le patient
      // recliquait sur un geste déjà refusé, sans jamais savoir pourquoi.
      else { setError(data.error); }
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setDemandeLoading(false);
    }
  };

  return (
    <PatientCard maxWidth="md" className="text-center">
      <h2 className="font-display text-lg font-bold text-foreground mb-2">Vos réponses</h2>
      {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {error && <PatientInlineMessage tone="error">{error}</PatientInlineMessage>}
      {reponse && (
        <p className="text-sm text-muted-foreground mb-6">
          « {reponse.titre} » — envoyé le{' '}
          {new Date(reponse.dateReponse).toLocaleDateString('fr-FR')}.<br />
          Vos réponses sont verrouillées en lecture seule.
        </p>
      )}
      {readOnlyPreview ? (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
          Aperçu praticien — vue identique à celle du patient.
        </p>
      ) : (
        <>
          <PatientButton variant="primary" onClick={onVoirEquilibre} className="w-full mb-3">
            Voir Mon équilibre
          </PatientButton>

          {demandeEnvoyee ? (
            <p className="text-sm text-primary bg-primary/10 rounded-lg px-4 py-3">
              Votre demande de modification a été transmise à votre praticien. En attente de validation par votre praticien.
            </p>
          ) : (
            <div className="space-y-2 text-left">
              <label className="block text-sm text-muted-foreground">Précisez ce que vous souhaitez corriger <span className="text-muted-foreground/70">(facultatif)</span></label>
              <textarea
                value={commentaire}
                onChange={e => setCommentaire(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Ex. je me suis trompé·e à la question sur le sommeil…"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <PatientButton variant="ghost" onClick={handleDemande} loading={demandeLoading} loadingLabel="Envoi…" className="w-full">
                Demander une correction
              </PatientButton>
            </div>
          )}
        </>
      )}
    </PatientCard>
  );
}
