'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PatientButton } from '@/components/patient/ui/PatientButton';
import { PatientCard } from '@/components/patient/ui/PatientCard';
import { PatientErrorState } from '@/components/patient/PatientErrorState';
import { decalerDate } from '@/lib/agenda-sommeil/nuit';
import { horairesHabituels } from '@/lib/agenda-sommeil/agregats';
import type { FenetreAgenda } from '@/lib/agenda-sommeil/fenetre';
import { NB_JOURS_AGENDA, type NuitReponses } from '@/lib/agenda-sommeil/types';
import { FriseNuits } from './FriseNuits';
import { SaisieNuitForm } from './SaisieNuitForm';

type GetOk = {
  ok: true;
  fenetre: FenetreAgenda;
  nuits: { dateNuit: string; reponses: NuitReponses }[];
  derniereNuit: NuitReponses | null;
  statutReponses: string;
  aujourdHui: string;
};

type Props = { idAssignation: string; onRetourHub: () => void };

export function AgendaSommeilJournal({ idAssignation, onRetourHub }: Props) {
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [erreur, setErreur] = useState('');
  const [data, setData] = useState<GetOk | null>(null);
  const [mode, setMode] = useState<'frise' | 'saisie' | 'clos'>('frise');
  const [cibleDate, setCibleDate] = useState<string>('');
  const [envoi, setEnvoi] = useState(false);
  const [merci, setMerci] = useState(false);

  const charger = useCallback(async () => {
    setEtat('chargement');
    try {
      const res = await fetch(`/api/portail/agenda-sommeil?id=${encodeURIComponent(idAssignation)}`);
      const json = (await res.json()) as GetOk | { ok: false; error: string };
      if (!json.ok) {
        setErreur(json.error);
        setEtat('erreur');
        return;
      }
      setData(json);
      const dejaAujourdhui = json.nuits.some((n) => n.dateNuit === json.aujourdHui);
      if (json.statutReponses === 'verrouille') setMode('clos');
      else if (!dejaAujourdhui) {
        setCibleDate(json.aujourdHui);
        setMode('saisie');
      } else setMode('frise');
      setEtat('pret');
    } catch {
      setErreur('Connexion interrompue. Réessayez.');
      setEtat('erreur');
    }
  }, [idAssignation]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const nuitsParDate = useMemo(() => {
    const m = new Map<string, NuitReponses>();
    for (const n of data?.nuits ?? []) m.set(n.dateNuit, n.reponses);
    return m;
  }, [data]);

  // Position d'ouverture des poignées du cadran — une suggestion en pointillé,
  // pas une valeur : elle ne devient une réponse qu'au toucher.
  const habituels = useMemo(() => horairesHabituels(data?.nuits ?? []), [data]);

  async function enregistrer(reponses: NuitReponses) {
    setEnvoi(true);
    // L'ANCIEN REFUS S'EFFACE AU DÉPART, sans quoi une seconde tentative
    // réussie laisserait le message de la première à l'écran.
    setErreur('');
    try {
      const res = await fetch('/api/portail/agenda-sommeil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAssignation, dateNuit: cibleDate, reponses }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setErreur(json.error ?? 'Enregistrement impossible.');
        setEnvoi(false);
        return;
      }
      setEnvoi(false);
      setMerci(true);
      setTimeout(() => setMerci(false), 2200);
      await charger();
    } catch {
      setErreur('Connexion interrompue. Réessayez.');
      setEnvoi(false);
    }
  }

  async function transmettre() {
    setEnvoi(true);
    setErreur('');
    try {
      const res = await fetch('/api/portail/agenda-sommeil/cloture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAssignation }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setErreur(json.error ?? 'Transmission impossible.');
        setEnvoi(false);
        return;
      }
      setEnvoi(false);
      await charger();
    } catch {
      setErreur('Connexion interrompue. Réessayez.');
      setEnvoi(false);
    }
  }

  if (etat === 'chargement') {
    return (
      <PatientCard className="text-center">
        <p className="text-sm text-muted-foreground">Chargement de votre agenda…</p>
      </PatientCard>
    );
  }
  if (etat === 'erreur' || !data) {
    return (
      <PatientCard className="text-center">
        <PatientErrorState message={erreur || 'Agenda indisponible.'} aide="Réessayez plus tard." />
        <div className="mt-4">
          <PatientButton variant="neutral" onClick={onRetourHub}>
            Retour à mon parcours
          </PatientButton>
        </div>
      </PatientCard>
    );
  }

  const { fenetre, aujourdHui } = data;
  const dateHier = decalerDate(aujourdHui, -1);
  const hierDansFenetre = fenetre.dateDebut !== null && dateHier >= fenetre.dateDebut;
  const hierRenseignee = nuitsParDate.has(dateHier);

  // Agenda clôturé : frise en consultation seule, sans aucune saisie.
  if (mode === 'clos') {
    return (
      <div className="space-y-4">
        <PatientCard>
          <h2 className="font-display text-lg font-bold text-foreground mb-1">Merci pour vos trois semaines 🌙</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Votre agenda a été transmis à votre praticien. Voici la frise de vos nuits.
          </p>
          <FriseNuits emplacements={fenetre.emplacements} nuitsParDate={nuitsParDate} />
        </PatientCard>
        <PatientButton variant="neutral" onClick={onRetourHub}>
          Retour à mon parcours
        </PatientButton>
      </div>
    );
  }

  // Écran de saisie du matin.
  // UN REFUS D'ÉCRITURE NE RESTE PAS MUET, ET IL SE REND DANS LES DEUX VUES.
  //
  // `enregistrer` et `transmettre` posaient `erreur` sans basculer `etat`, et
  // `erreur` n'était rendu que par la branche `etat === 'erreur'` : le message
  // n'atteignait JAMAIS l'écran. Le patient validait sa nuit, ne voyait rien, et
  // repartait en croyant l'avoir enregistrée. Un refus invisible est pire qu'un
  // refus bavard — le praticien lira ensuite un agenda troué sans savoir que le
  // patient, lui, a cru répondre (`DC-24` dans l'autre sens : une nuit non
  // écrite n'est pas une nuit sans sommeil).
  //
  // DANS LES DEUX VUES, parce que les deux écrivent : `enregistrer` part de la
  // SAISIE, `transmettre` de la FRISE. Ne le poser que sur l'une laisserait
  // l'autre muette — c'est le défaut d'origine, à moitié.
  //
  // EN PLACE, JAMAIS EN PLEIN ÉCRAN : basculer `etat` remplacerait la page par
  // l'écran d'échec et emporterait la saisie en cours.
  const alerteRefus = erreur !== '' ? (
    <div
      role="alert"
      className="rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-status-warning text-center"
    >
      {erreur}
    </div>
  ) : null;

  if (mode === 'saisie') {
    const enCorrection = cibleDate !== aujourdHui;
    return (
      <div className="space-y-4">
        {alerteRefus}
        <PatientCard>
          <h2 className="font-display text-lg font-bold text-foreground mb-1">
            {enCorrection ? 'Corriger la nuit d’hier' : 'Votre nuit passée'}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            En une minute, sans regarder l’heure exacte — une estimation suffit.
          </p>
          {/* `initial` ne vaut QUE la nuit déjà saisie qu'on vient corriger.
              Jamais la nuit précédente : la v1 la reprenait en entier — latence
              et qualité comprises —, le bouton d'envoi était actif sans un seul
              geste, et vingt copies conformes de la première nuit passaient
              pour un recueil. Les horaires habituels passent à part, en
              suggestion fantôme. */}
          <SaisieNuitForm
            key={cibleDate}
            initial={nuitsParDate.get(cibleDate) ?? null}
            horairesHabituels={habituels}
            submitting={envoi}
            ctaLabel={enCorrection ? 'Corriger ✓' : 'C’est noté ✓'}
            onSubmit={enregistrer}
          />
        </PatientCard>
        <PatientButton variant="neutral" onClick={() => setMode('frise')}>
          Voir ma frise
        </PatientButton>
      </div>
    );
  }

  // Vue frise (par défaut si la nuit d'aujourd'hui est déjà notée).
  return (
    <div className="space-y-4">
      {alerteRefus}
      {merci && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary text-center">
          Merci, à demain matin. ☕
        </div>
      )}
      <PatientCard>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-display text-lg font-bold text-foreground">Vos nuits</h2>
          {fenetre.jourCourant !== null && (
            <span className="text-sm text-muted-foreground">
              Nuit {fenetre.jourCourant} sur {NB_JOURS_AGENDA}
            </span>
          )}
        </div>
        <FriseNuits emplacements={fenetre.emplacements} nuitsParDate={nuitsParDate} />
        {/* Constat ADOSSÉ À L'ACTE DE NOTER, jamais à ce qui est noté. Une
            formule de félicitation indexée sur la qualité déclarée apprendrait
            en quelques jours à déclarer de bonnes nuits : le design introduirait
            un biais de désirabilité dans l'instrument qu'il est censé servir.
            Ici le seul chiffre montré est un compte de saisies — aucune moyenne,
            aucune tendance, aucune couleur (réserves R1 et R2). */}
        <p className="text-xs text-muted-foreground mt-3 text-center">
          {fenetre.nbRenseignees} nuit{fenetre.nbRenseignees > 1 ? 's' : ''} notée
          {fenetre.nbRenseignees > 1 ? 's' : ''} sur {NB_JOURS_AGENDA}.
          {fenetre.nbRenseignees < fenetre.emplacements.length
            ? ' Une nuit non notée, ça arrive — reprenez simplement demain matin.'
            : ' Vous avez noté chaque nuit du recueil. Merci.'}
        </p>
      </PatientCard>

      <div className="flex flex-col gap-2">
        {!nuitsParDate.has(aujourdHui) ? (
          <PatientButton
            variant="primary"
            onClick={() => {
              setCibleDate(aujourdHui);
              setMode('saisie');
            }}
          >
            Noter ma nuit
          </PatientButton>
        ) : (
          <PatientButton
            variant="ghost"
            onClick={() => {
              setCibleDate(aujourdHui);
              setMode('saisie');
            }}
          >
            Modifier ma nuit
          </PatientButton>
        )}

        {hierDansFenetre && !hierRenseignee && (
          <PatientButton
            variant="neutral"
            onClick={() => {
              setCibleDate(dateHier);
              setMode('saisie');
            }}
          >
            Corriger la nuit d’hier
          </PatientButton>
        )}

        {fenetre.cloturablePatient && (
          <PatientButton variant="primary" loading={envoi} loadingLabel="Transmission…" onClick={transmettre}>
            Terminer et transmettre à mon praticien
          </PatientButton>
        )}
      </div>

      <PatientCard padding="sm" className="text-xs text-muted-foreground">
        Astuce : ajoutez cette page à l’écran d’accueil de votre téléphone pour la retrouver chaque matin, avec votre café.
      </PatientCard>

      <PatientButton variant="neutral" onClick={onRetourHub}>
        Retour à mon parcours
      </PatientButton>
    </div>
  );
}
