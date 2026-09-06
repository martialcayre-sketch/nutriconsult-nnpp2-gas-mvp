'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BanniereDiffere } from '@/components/ui/BanniereDiffere';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PanneauSuperpose } from '@/components/ui/PanneauSuperpose';
import { QuestionField } from '@/components/patient/QuestionField';
import { ECHELLES_NOMMEES, interditTouteBande, type EchelleNommee } from '@/lib/echelles-cabinet';
import {
  LIBELLE_INSTRUMENT_CABINET,
  TEXTE_INSTRUMENTS_CABINET,
  libelleCertificationBibliotheque,
} from '@/lib/certification-libelles';
import type { BibliothequeEntree } from '@/lib/bibliotheque';
import type { BibliothequeApiResponse } from '@/app/api/praticien/bibliotheque/route';
import type { ApercuApiResponse } from '@/app/api/praticien/bibliotheque/apercu/route';
import type {
  InstrumentCabinetDetailDto,
  InstrumentCabinetDto,
  InstrumentsApiResponse,
  MutateInstrumentResponse,
} from '@/app/api/praticien/instruments/route';
import type { ImportInstrumentResponse } from '@/app/api/praticien/instruments/import/route';
import type {
  FileEnvoiApiResponse,
  FileEnvoiBrouillon,
  MutateFileEnvoiResponse,
} from '@/app/api/praticien/file-envoi/route';
import type { EnvoyerFileResponse } from '@/app/api/praticien/file-envoi/envoyer/route';

type Rayon = 'questionnaires' | 'analyses' | 'conseils';

type PatientOption = { email: string; prenom: string; nom: string };

// Rayon Questionnaires de la Bibliothèque (arbitrages 2026-07-23) :
// chercher → prévisualiser tel que le patient le verra → ajouter à la file →
// envoyer, un seul mail et un seul lien portail par patient.
export function BibliothequePanel({
  entrees,
  rayonBiologieOuvert = false,
}: {
  entrees: BibliothequeEntree[];
  /** État du drapeau WN_CB_ENABLED, lu par la page serveur (CB-08) : la puce
   *  « Analyses biologiques » et sa bannière doivent dire la même chose que le
   *  rayon rendu plus bas sur la même page. */
  rayonBiologieOuvert?: boolean;
}) {
  const [rayon, setRayon] = useState<Rayon>('questionnaires');
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState<string | null>(null);
  const [selectionId, setSelectionId] = useState<string>(entrees[0]?.id ?? '');
  const [apercu, setApercu] = useState<ApercuApiResponse['apercu']>(null);
  const [apercuEnCours, setApercuEnCours] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [brouillons, setBrouillons] = useState<FileEnvoiBrouillon[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  // Instruments du cabinet : la liste serveur (prop) ne les connaît pas — le
  // panneau recharge les entrées via l'API, qui les fusionne au catalogue.
  const [entreesCourantes, setEntreesCourantes] = useState<BibliothequeEntree[]>(entrees);
  const [instrumentsCabinet, setInstrumentsCabinet] = useState<InstrumentCabinetDto[]>([]);
  const [erreurInstruments, setErreurInstruments] = useState(false);
  const [tiroirEditeur, setTiroirEditeur] = useState(false);
  const [tiroirImport, setTiroirImport] = useState(false);
  const [tiroirRelecture, setTiroirRelecture] = useState(false);
  const [editionInitiale, setEditionInitiale] = useState<InstrumentCabinetDetailDto | null>(null);
  const [relecture, setRelecture] = useState<InstrumentCabinetDetailDto | null>(null);

  const selection = useMemo(
    () => entreesCourantes.find(e => e.id === selectionId) ?? null,
    [entreesCourantes, selectionId],
  );

  const categories = useMemo(
    () =>
      [...new Set(entreesCourantes.map(e => e.categorie))].sort((a, b) => a.localeCompare(b, 'fr')),
    [entreesCourantes],
  );

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return entreesCourantes.filter(e => {
      if (categorie && e.categorie !== categorie) return false;
      if (!terme) return true;
      return (
        e.titre.toLowerCase().includes(terme) ||
        e.id.toLowerCase().includes(terme) ||
        e.categorie.toLowerCase().includes(terme)
      );
    });
  }, [entreesCourantes, recherche, categorie]);

  const chargerFile = useCallback(async () => {
    try {
      const res = await fetch('/api/praticien/file-envoi');
      const json = (await res.json()) as FileEnvoiApiResponse;
      setBrouillons(json.brouillons ?? []);
    } catch {
      setBrouillons([]);
    }
  }, []);

  const chargerBibliotheque = useCallback(async () => {
    try {
      const res = await fetch('/api/praticien/bibliotheque');
      const json = (await res.json()) as BibliothequeApiResponse;
      if (Array.isArray(json.entrees) && json.entrees.length > 0) {
        setEntreesCourantes(json.entrees);
      }
    } catch {
      // Les entrées serveur restent affichées.
    }
  }, []);

  const chargerInstruments = useCallback(async () => {
    try {
      const res = await fetch('/api/praticien/instruments');
      const json = (await res.json()) as InstrumentsApiResponse;
      if (!res.ok || json.unavailable) {
        // Un échec de chargement n'est pas « aucun instrument » : l'écran
        // doit le dire, pas le masquer.
        setErreurInstruments(true);
        setInstrumentsCabinet([]);
        return;
      }
      setErreurInstruments(false);
      setInstrumentsCabinet(json.instruments ?? []);
    } catch {
      setErreurInstruments(true);
      setInstrumentsCabinet([]);
    }
  }, []);

  const rafraichirCabinet = useCallback(async () => {
    await Promise.all([chargerBibliotheque(), chargerInstruments()]);
  }, [chargerBibliotheque, chargerInstruments]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const res = await fetch('/api/praticien/patients');
        const json = (await res.json()) as {
          patients?: { email: string; prenom: string; nom: string; actif: string; suiviClotureLe: string | null }[];
        };
        if (!actif) return;
        setPatients(
          (json.patients ?? [])
            .filter(p => p.actif === 'OUI' && !p.suiviClotureLe)
            .map(p => ({ email: p.email, prenom: p.prenom, nom: p.nom })),
        );
      } catch {
        if (actif) setPatients([]);
      }
    })();
    void chargerFile();
    void rafraichirCabinet();
    return () => {
      actif = false;
    };
  }, [chargerFile, rafraichirCabinet]);

  useEffect(() => {
    if (!selectionId) return;
    let actif = true;
    setApercuEnCours(true);
    (async () => {
      try {
        const res = await fetch(`/api/praticien/bibliotheque/apercu?id=${encodeURIComponent(selectionId)}`);
        const json = (await res.json()) as ApercuApiResponse;
        if (actif) setApercu(json.apercu);
      } catch {
        if (actif) setApercu(null);
      } finally {
        if (actif) setApercuEnCours(false);
      }
    })();
    return () => {
      actif = false;
    };
  }, [selectionId]);

  function basculerPick(email: string) {
    setPicks(prev => {
      const suivant = new Set(prev);
      if (suivant.has(email)) suivant.delete(email);
      else suivant.add(email);
      return suivant;
    });
  }

  async function ajouterALaFile() {
    if (!selection?.assignable || picks.size === 0) return;
    setOccupe(true);
    setMessage(null);
    setErreur(null);
    const echecs: string[] = [];
    for (const email of picks) {
      try {
        const res = await fetch('/api/praticien/file-envoi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailPatient: email, qids: [selection.id] }),
        });
        const json = (await res.json()) as MutateFileEnvoiResponse;
        if (!json.success) echecs.push(json.error ?? email);
      } catch {
        echecs.push(email);
      }
    }
    await chargerFile();
    setOccupe(false);
    if (echecs.length === 0) {
      setMessage(`« ${selection.titre} » ajouté à la file — rien ne part sans votre validation.`);
    } else {
      setErreur(`Ajout impossible pour : ${echecs.join(' · ')}`);
    }
  }

  async function retirer(idBrouillon: string, qid: string) {
    setErreur(null);
    await fetch(
      `/api/praticien/file-envoi?idBrouillon=${encodeURIComponent(idBrouillon)}&qid=${encodeURIComponent(qid)}`,
      { method: 'DELETE' },
    );
    await chargerFile();
  }

  async function envoyer(brouillon: FileEnvoiBrouillon) {
    setOccupe(true);
    setMessage(null);
    setErreur(null);
    try {
      const res = await fetch('/api/praticien/file-envoi/envoyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idBrouillon: brouillon.idBrouillon }),
      });
      const json = (await res.json()) as EnvoyerFileResponse;
      if (json.success) {
        setMessage(
          `${json.count} questionnaire(s) envoyé(s) à ${brouillon.prenom} ${brouillon.nom} — un seul mail, un seul lien portail.`,
        );
      } else {
        setErreur(json.error ?? "L'envoi a échoué.");
      }
    } catch {
      setErreur("L'envoi a échoué.");
    }
    await chargerFile();
    setOccupe(false);
  }

  async function chargerDetail(idInstrument: string): Promise<InstrumentCabinetDetailDto | null> {
    try {
      const res = await fetch(`/api/praticien/instruments?id=${encodeURIComponent(idInstrument)}`);
      const json = (await res.json()) as InstrumentsApiResponse;
      return json.instrument ?? null;
    } catch {
      return null;
    }
  }

  async function ouvrirEdition(idInstrument: string) {
    setErreur(null);
    const detail = await chargerDetail(idInstrument);
    if (!detail) {
      setErreur('Instrument introuvable.');
      return;
    }
    setEditionInitiale(detail);
    setTiroirEditeur(true);
  }

  async function ouvrirRelecture(idInstrument: string) {
    setErreur(null);
    const detail = await chargerDetail(idInstrument);
    if (!detail) {
      setErreur('Instrument introuvable.');
      return;
    }
    setRelecture(detail);
    setTiroirRelecture(true);
  }

  async function publier(idInstrument: string) {
    setOccupe(true);
    setMessage(null);
    setErreur(null);
    try {
      const res = await fetch('/api/praticien/instruments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInstrument, action: 'publier' }),
      });
      const json = (await res.json()) as MutateInstrumentResponse;
      if (json.success) {
        setMessage('Instrument publié — désormais assignable via la file d’envoi.');
        setTiroirRelecture(false);
        await rafraichirCabinet();
      } else {
        setErreur(json.error ?? 'Publication impossible.');
      }
    } catch {
      setErreur('Publication impossible.');
    }
    setOccupe(false);
  }

  async function desactiverInstrument(idInstrument: string) {
    setOccupe(true);
    setMessage(null);
    setErreur(null);
    try {
      const res = await fetch('/api/praticien/instruments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInstrument, action: 'desactiver' }),
      });
      const json = (await res.json()) as MutateInstrumentResponse;
      if (json.success) {
        setMessage('Instrument désactivé — retiré du catalogue du cabinet.');
        await rafraichirCabinet();
      } else {
        setErreur(json.error ?? 'Désactivation impossible.');
      }
    } catch {
      setErreur('Désactivation impossible.');
    }
    setOccupe(false);
  }

  const totalFile = brouillons.reduce((n, b) => n + b.items.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rayons de la bibliothèque">
        <BoutonRayon actif={rayon === 'questionnaires'} onClick={() => setRayon('questionnaires')}>
          Questionnaires
        </BoutonRayon>
        <BoutonRayon
          actif={rayon === 'analyses'}
          onClick={() => setRayon('analyses')}
          aVenir={!rayonBiologieOuvert}
        >
          Analyses biologiques
        </BoutonRayon>
        <BoutonRayon actif={rayon === 'conseils'} onClick={() => setRayon('conseils')} aVenir>
          Fiches conseils
        </BoutonRayon>
      </div>

      {rayon === 'analyses' &&
        (rayonBiologieOuvert ? (
          <div
            role="status"
            className="rounded-xl border border-border bg-surface p-5 text-base text-muted-foreground shadow-card"
          >
            Le rayon Analyses biologiques est ouvert : catalogue des bilans et fiches
            d&apos;analytes, plus bas sur cette page —{' '}
            <a
              href="#rayon-biologie-titre"
              className="font-medium text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              aller au rayon
            </a>
            . La saisie de résultats reste un second temps, ouvert par une décision dédiée.
          </div>
        ) : (
          <BanniereDiffere>
            Le rayon Analyses biologiques ouvrira avec le catalogue et les fiches
            d&apos;analytes ; la saisie de résultats patients restera un second temps, ouvert par
            une décision dédiée.
          </BanniereDiffere>
        ))}
      {rayon === 'conseils' && (
        <BanniereDiffere>
          Le rayon Fiches conseils reprendra la bibliothèque d&apos;interventions — compléments,
          boussole alimentaire et fiches conseils — avec le branchement du corpus. Provenance,
          statut et compatibilité avec le protocole actif resteront explicites.
        </BanniereDiffere>
      )}

      {rayon === 'questionnaires' && (
        <>
          <div className="flex flex-wrap gap-2">
            <PanneauSuperpose
              largeur="standard"
              declencheur={
                <Button className="min-h-11" onClick={() => setEditionInitiale(null)}>
                  Créer un questionnaire
                </Button>
              }
              titre={editionInitiale ? 'Modifier l’instrument' : 'Créer un questionnaire'}
              description="Instrument privé au cabinet — son scoring n’est jamais vérifié par WellNeuro : la grille est relue puis publiée avant tout envoi."
              open={tiroirEditeur}
              onOpenChange={setTiroirEditeur}
            >
              <EditeurInstrument
                initiale={editionInitiale}
                onRafraichir={rafraichirCabinet}
                onTermine={m => {
                  setTiroirEditeur(false);
                  setMessage(m);
                }}
              />
            </PanneauSuperpose>
            <PanneauSuperpose
              largeur="standard"
              declencheur={
                <Button variant="outline" className="min-h-11">
                  Importer
                </Button>
              }
              titre="Importer un questionnaire"
              description="JSON ou CSV — le résultat entre en brouillon, grille à relire avant publication."
              open={tiroirImport}
              onOpenChange={setTiroirImport}
            >
              <ImportInstrument onRafraichir={rafraichirCabinet} />
            </PanneauSuperpose>
            <PanneauSuperpose
              largeur="standard"
              titre="Relire la grille"
              description="Vérifiez l’échelle, les bandes et le score maximal avant de publier."
              open={tiroirRelecture}
              onOpenChange={setTiroirRelecture}
            >
              {relecture && (
                <RelectureGrille
                  detail={relecture}
                  occupe={occupe}
                  onPublier={() => void publier(relecture.idInstrument)}
                />
              )}
            </PanneauSuperpose>
          </div>
          {(message || erreur) && (
            <p
              role="status"
              className={`rounded-lg border px-4 py-2.5 text-sm ${
                erreur
                  ? 'border-status-danger/40 bg-status-danger/10 text-status-danger'
                  : 'border-status-success/40 bg-status-success/10 text-status-success'
              }`}
            >
              {erreur ?? message}
            </p>
          )}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr),minmax(0,1fr),minmax(280px,0.7fr)]">
            {/* Catalogue */}
            <section className="rounded-xl border border-border bg-surface shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                <h3 className="font-display text-lg font-semibold text-foreground">Catalogue</h3>
                <span className="font-mono text-2xs text-muted-foreground">
                  {filtres.length}/{entrees.length} instruments
                </span>
              </div>
              <div className="border-b border-border px-5 py-3">
                <input
                  type="search"
                  value={recherche}
                  onChange={e => setRecherche(e.target.value)}
                  placeholder="Rechercher un titre, un code, un domaine…"
                  aria-label="Rechercher dans le catalogue"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto border-b border-border px-5 py-2.5">
                <ChipFiltre actif={categorie === null} onClick={() => setCategorie(null)}>
                  Tous
                </ChipFiltre>
                {categories.map(c => (
                  <ChipFiltre key={c} actif={categorie === c} onClick={() => setCategorie(c)}>
                    {c}
                  </ChipFiltre>
                ))}
              </div>
              <ul className="max-h-[520px] overflow-y-auto p-2">
                {filtres.map(e => {
                  // Badge explicite : évite de laisser « sans badge » ambigu sur un instrument actif.
                  const badgeCertif = libelleCertificationBibliotheque(e);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelectionId(e.id)}
                        aria-pressed={selectionId === e.id}
                        className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                          selectionId === e.id
                            ? 'bg-indigo-600/10 ring-1 ring-inset ring-indigo-600/40'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <span className="block font-display text-sm font-semibold text-foreground">
                          {e.titre}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-2xs text-muted-foreground">
                            {e.id}
                            {e.nbQuestions != null ? ` · ${e.nbQuestions} questions` : ''}
                            {e.scoreMax != null ? ` · /${e.scoreMax}` : ''}
                          </span>
                          <Badge variant="neutral">{e.categorie}</Badge>
                          <Badge variant={badgeCertif.variant}>{badgeCertif.label}</Badge>
                          {e.passationPraticien && <Badge variant="warning">Passation praticien</Badge>}
                          {e.aliasVers && <Badge variant="neutral">Alias historique</Badge>}
                          {e.cabinet && <Badge variant="warning">{LIBELLE_INSTRUMENT_CABINET}</Badge>}
                          {e.cabinet && e.cabinet.statutRelecture !== 'valide' && (
                            <BadgeStatutInstrument statut={e.cabinet.statutRelecture} />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filtres.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Aucun instrument ne correspond à cette recherche.
                  </li>
                )}
              </ul>
              <div data-testid="instruments-cabinet" className="border-t border-border px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold text-foreground">
                    Instruments du cabinet
                  </h4>
                  <span className="font-mono text-2xs text-muted-foreground">
                    {instrumentsCabinet.length}
                  </span>
                </div>
                <p className="mt-1 text-2xs text-muted-foreground">{TEXTE_INSTRUMENTS_CABINET}</p>
                {erreurInstruments ? (
                  <p role="alert" className="mt-3 text-xs text-status-danger">
                    Impossible de charger les instruments — réessayez.
                  </p>
                ) : instrumentsCabinet.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Aucun instrument — créez ou importez un questionnaire.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {instrumentsCabinet.map(i => (
                      <li key={i.idInstrument} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 font-display text-sm font-semibold text-foreground">
                            {i.titre}
                          </span>
                          <BadgeStatutInstrument statut={i.statutRelecture} />
                        </div>
                        <p className="mt-1 font-mono text-2xs text-muted-foreground">
                          {i.idInstrument}
                          {i.nbQuestions != null ? ` · ${i.nbQuestions} questions` : ''}
                          {i.scoreMax != null ? ` · /${i.scoreMax}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {i.statutRelecture === 'grille_a_relire' && (
                            <button
                              type="button"
                              disabled={occupe}
                              onClick={() => void ouvrirRelecture(i.idInstrument)}
                              className="rounded-lg border border-indigo-600 bg-indigo-600/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-indigo-600/20 disabled:opacity-60"
                            >
                              Relire la grille
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={occupe}
                            onClick={() => void ouvrirEdition(i.idInstrument)}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            disabled={occupe}
                            onClick={() => void desactiverInstrument(i.idInstrument)}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-status-danger transition-colors hover:bg-status-danger/10 disabled:opacity-60"
                          >
                            Désactiver
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Aperçu vierge */}
            <section className="rounded-xl border border-border bg-surface shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                <h3 className="font-display text-lg font-semibold text-foreground">Aperçu vierge</h3>
                <span className="text-2xs text-muted-foreground">Tel que le patient le verra</span>
              </div>
              <div className="max-h-[430px] overflow-y-auto px-5 py-4">
                {apercuEnCours && <p className="text-sm text-muted-foreground">Chargement…</p>}
                {!apercuEnCours && !apercu && (
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez un instrument du catalogue pour l&apos;ouvrir ici.
                  </p>
                )}
                {!apercuEnCours && apercu && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="font-display text-base font-semibold text-foreground">
                        {apercu.titre}
                      </p>
                      <p className="mt-1 font-mono text-2xs text-muted-foreground">
                        {apercu.id}
                        {apercu.nbQuestions != null ? ` · ${apercu.nbQuestions} questions` : ''}
                        {apercu.scoreMax != null ? ` · score /${apercu.scoreMax}` : ''}
                      </p>
                      {apercu.aliasDe && (
                        <p className="mt-1 text-2xs text-muted-foreground">
                          Grille portée par {apercu.id} — l&apos;entrée {apercu.aliasDe} est un
                          alias historique.
                        </p>
                      )}
                      {apercu.administrationMode === 'clinicien' && (
                        <p className="mt-1 text-2xs text-status-warning">
                          Instrument à faire passer en consultation — ne l&apos;assignez que pour
                          une passation avec vous, jamais en autonomie.
                        </p>
                      )}
                    </div>
                    {apercu.instructions && (
                      <p className="text-sm italic leading-relaxed text-muted-foreground">
                        « {apercu.instructions} »
                      </p>
                    )}
                    <div className="pointer-events-none flex flex-col gap-4" aria-hidden="true">
                      {apercu.sections.map(section => (
                        <div key={section.id} className="flex flex-col gap-3">
                          {section.titre && (
                            <p className="text-2xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
                              {section.titre}
                            </p>
                          )}
                          {section.questions.map(question => (
                            <QuestionField
                              key={question.id}
                              question={question}
                              value=""
                              onChange={() => undefined}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
                <p className="text-2xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
                  Ajouter pour
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {patients.map(p => (
                    <label
                      key={p.email}
                      className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        picks.has(p.email)
                          ? 'border-mint-600 bg-mint-600/10 text-mint-ink'
                          : 'border-border bg-surface text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={picks.has(p.email)}
                        onChange={() => basculerPick(p.email)}
                        className="sr-only"
                      />
                      {p.prenom} {p.nom}
                    </label>
                  ))}
                  {patients.length === 0 && (
                    <span className="text-2xs text-muted-foreground">Aucun patient éligible.</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={ajouterALaFile}
                    disabled={occupe || !selection?.assignable || picks.size === 0}
                  >
                    Ajouter à la file
                  </Button>
                  <span className="text-2xs text-muted-foreground">
                    {selection && !selection.assignable
                      ? selection.passationPraticien
                        ? 'Passation en consultation — cet instrument ne peut pas être envoyé.'
                        : selection.cabinet
                          ? 'Instrument du cabinet non publié — faites relire puis publiez la grille avant l’envoi.'
                          : 'Alias historique — non assignable tel quel.'
                      : selection?.passationPraticien
                        ? 'Instrument de consultation — assignation pour une passation avec vous, jamais en autonomie.'
                        : "L'ajout ne déclenche aucun envoi."}
                  </span>
                </div>
              </div>
            </section>

            {/* File d'envoi */}
            <section className="rounded-xl border border-border bg-surface shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                <h3 className="font-display text-lg font-semibold text-foreground">File d&apos;envoi</h3>
                <Badge variant="info">1 mail par patient</Badge>
              </div>
              <div className="max-h-[430px] overflow-y-auto px-5 py-4">
                {brouillons.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    La file est vide — ajoutez des questionnaires depuis l&apos;aperçu.
                  </p>
                )}
                <ul className="flex flex-col gap-4">
                  {brouillons.map(b => (
                    <li key={b.idBrouillon} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display text-sm font-semibold text-foreground">
                          {b.prenom} {b.nom}
                        </p>
                        <span className="font-mono text-2xs text-muted-foreground">
                          {b.items.length} élément{b.items.length > 1 ? 's' : ''} · 1 mail
                        </span>
                      </div>
                      <ul className="mt-2 flex flex-col">
                        {b.items.map(item => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-2 border-b border-dashed border-border py-1.5 text-xs text-foreground last:border-b-0"
                          >
                            <span className="min-w-0">
                              {item.titre}
                              <span className="ml-1 font-mono text-2xs text-muted-foreground">
                                {item.id}
                              </span>
                              {item.indisponible && (
                                <span className="ml-1.5 inline-flex">
                                  <Badge variant="danger">Indisponible</Badge>
                                </span>
                              )}
                              {item.consultation && (
                                <span className="ml-1.5 inline-flex">
                                  <Badge variant="warning">Passation en consultation</Badge>
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => retirer(b.idBrouillon, item.id)}
                              aria-label={`Retirer ${item.titre} de la file`}
                              className="rounded p-1 text-muted-foreground hover:bg-status-danger/10 hover:text-status-danger"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 w-full"
                        disabled={occupe}
                        onClick={() => envoyer(b)}
                      >
                        Envoyer ({b.items.length}) — un seul mail
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-border px-5 py-3">
                <p className="font-mono text-2xs text-muted-foreground">
                  {brouillons.length} patient{brouillons.length > 1 ? 's' : ''} · {totalFile}{' '}
                  élément{totalFile > 1 ? 's' : ''}
                </p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  Un seul lien portail par patient. Rien ne part sans votre validation.
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function BoutonRayon({
  actif,
  aVenir = false,
  onClick,
  children,
}: {
  actif: boolean;
  aVenir?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`inline-flex min-h-[34px] items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors ${
        actif
          ? 'border-indigo-600 bg-indigo-600/10 text-primary'
          : 'border-border bg-surface text-muted-foreground hover:border-primary/40'
      }`}
    >
      {children}
      {aVenir && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-3xs font-bold uppercase tracking-[.08em] text-muted-foreground">
          à venir
        </span>
      )}
    </button>
  );
}

function ChipFiltre({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`inline-flex flex-none items-center rounded-full border px-3 py-1 text-2xs font-semibold transition-colors ${
        actif
          ? 'border-indigo-600 bg-indigo-600/10 text-primary'
          : 'border-border bg-surface text-muted-foreground hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

function BadgeStatutInstrument({ statut }: { statut: string }) {
  if (statut === 'valide') return <Badge variant="success">Publié</Badge>;
  if (statut === 'grille_a_relire') return <Badge variant="warning">Grille à relire</Badge>;
  return <Badge variant="neutral">Brouillon</Badge>;
}

const CLASSE_CHAMP =
  'rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary';

const COULEURS_BANDE: { valeur: 'success' | 'warning' | 'danger'; libelle: string }[] = [
  { valeur: 'success', libelle: 'Favorable' },
  { valeur: 'warning', libelle: 'À surveiller' },
  { valeur: 'danger', libelle: 'Préoccupant' },
];

function libelleCouleur(color: string): string {
  return COULEURS_BANDE.find(c => c.valeur === color)?.libelle ?? color;
}

function detecterEchelle(initiale: InstrumentCabinetDetailDto | null): EchelleNommee {
  const premiere = initiale?.definition.sections[0]?.questions[0];
  const options = premiere && premiere.type === 'likert' ? premiere.options : null;
  if (!options) return 'frequence_0_4';
  for (const nom of Object.keys(ECHELLES_NOMMEES) as EchelleNommee[]) {
    const echelle = ECHELLES_NOMMEES[nom];
    if (
      echelle.options.length === options.length &&
      echelle.options.every((o, i) => o.v === options[i]?.v)
    ) {
      return nom;
    }
  }
  return 'frequence_0_4';
}

type BandeEdition = { min: string; max: string; label: string; color: 'success' | 'warning' | 'danger' };

// Éditeur d'instrument du cabinet — création et modification. L'échelle
// choisie s'applique à toutes les questions ; la grille est de type « somme »
// avec bandes contiguës. Le tiroir Radix démonte le contenu à la fermeture :
// l'état repart de `initiale` à chaque ouverture.
function EditeurInstrument({
  initiale,
  onRafraichir,
  onTermine,
}: {
  initiale: InstrumentCabinetDetailDto | null;
  onRafraichir: () => Promise<void>;
  onTermine: (message: string) => void;
}) {
  const [idInstrument, setIdInstrument] = useState<string | null>(initiale?.idInstrument ?? null);
  const [titre, setTitre] = useState(initiale?.titre ?? '');
  const [domaine, setDomaine] = useState(initiale?.categorie ?? 'Cabinet');
  const [consigne, setConsigne] = useState(initiale?.definition.instructions ?? '');
  const [echelle, setEchelle] = useState<EchelleNommee>(() => detecterEchelle(initiale));
  const [questions, setQuestions] = useState<string[]>(() =>
    initiale ? initiale.definition.sections.flatMap(s => s.questions.map(q => q.texte)) : [''],
  );
  const [bandes, setBandes] = useState<BandeEdition[]>(() =>
    initiale
      ? // `?? []` — la famille sans interprétation ne porte aucune bande, et
        // n'atteint de toute façon pas cet éditeur (refus plus bas).
        (initiale.scoring.interpretation ?? []).map(b => ({
          min: String(b.min),
          max: String(b.max),
          label: b.label,
          color: b.color,
        }))
      : [{ min: '', max: '', label: 'Grille à définir — relecture requise', color: 'warning' }],
  );
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [messageLocal, setMessageLocal] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const optionsEchelle = ECHELLES_NOMMEES[echelle].options;
  const nbQuestionsValides = questions.filter(q => q.trim().length > 0).length;
  const minPossible = nbQuestionsValides * Math.min(...optionsEchelle.map(o => o.v));
  const maxPossible = nbQuestionsValides * Math.max(...optionsEchelle.map(o => o.v));

  function construirePayload() {
    const textes = questions.map(q => q.trim()).filter(q => q.length > 0);
    return {
      titre: titre.trim(),
      categorie: domaine.trim() || 'Cabinet',
      definition: {
        ...(consigne.trim() ? { instructions: consigne.trim() } : {}),
        sections: [
          {
            id: 'S1',
            questions: textes.map((texte, i) => ({
              id: `Q${i + 1}`,
              texte,
              type: 'likert',
              options: optionsEchelle,
            })),
          },
        ],
      },
      scoring: {
        type: 'sum',
        // Bornes vides auto-complétées : la première bande démarre au score
        // minimal, la dernière finit au score maximal.
        interpretation: bandes.map((b, i) => ({
          min: b.min === '' && i === 0 ? minPossible : Number(b.min),
          max: b.max === '' && i === bandes.length - 1 ? maxPossible : Number(b.max),
          label: b.label,
          color: b.color,
        })),
      },
    };
  }

  async function enregistrer(avecRelecture: boolean) {
    setOccupe(true);
    setErreurs([]);
    setMessageLocal(null);
    try {
      const payload = construirePayload();
      const res = await fetch('/api/praticien/instruments', {
        method: idInstrument ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(idInstrument ? { idInstrument, ...payload } : payload),
      });
      const json = (await res.json()) as MutateInstrumentResponse;
      if (!json.success) {
        setErreurs(json.erreurs ?? [json.error ?? 'Enregistrement impossible.']);
        return;
      }
      const id = json.idInstrument ?? idInstrument;
      setIdInstrument(id ?? null);
      await onRafraichir();
      if (!avecRelecture) {
        setMessageLocal('Brouillon enregistré.');
        return;
      }
      const resRelecture = await fetch('/api/praticien/instruments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idInstrument: id, action: 'demander_relecture' }),
      });
      const jsonRelecture = (await resRelecture.json()) as MutateInstrumentResponse;
      if (!jsonRelecture.success) {
        setErreurs(jsonRelecture.erreurs ?? [jsonRelecture.error ?? 'Demande de relecture impossible.']);
        return;
      }
      await onRafraichir();
      onTermine('Relecture demandée — ouvrez « Relire la grille » pour publier.');
    } catch {
      setErreurs(['Enregistrement impossible.']);
    } finally {
      setOccupe(false);
    }
  }

  // GARDE ANTI-BANDE-PAR-DÉFAUT, côté écran (`D-088`). Cet éditeur ne sait
  // produire qu'une chose : des items likert sur une échelle nommée, et une
  // grille « somme » à bandes contiguës — dont l'amorce « Grille à définir ».
  // Ouvrir un instrument SANS INTERPRÉTATION dedans le détruirait deux fois :
  // ses saisies chiffrées repartiraient en likert, et il ressortirait avec la
  // bande d'attente que sa famille interdit. L'éditeur le dit et s'arrête —
  // le contenu se modifie par import, sa relecture par le tiroir dédié.
  if (interditTouteBande(initiale?.scoring)) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-foreground">{initiale?.titre}</p>
        <p className="text-xs text-muted-foreground">
          Cet instrument est déclaré <strong>sans interprétation</strong> : il pilote la
          conversation, il ne classe pas. L’éditeur de questionnaire ne le modifie pas — il ne sait
          écrire que des échelles à options et des bandes d’interprétation, que cet instrument
          n’admet pas.
        </p>
        <p className="text-xs text-muted-foreground">
          Pour en changer le contenu, réimportez-le ; pour le publier, ouvrez « Relire la grille ».
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {erreurs.length > 0 && (
        <ul
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger"
        >
          {erreurs.map(e => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {messageLocal && (
        <p
          role="status"
          className="rounded-lg border border-status-success/40 bg-status-success/10 px-3 py-2 text-xs text-status-success"
        >
          {messageLocal}
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Titre
        <input
          value={titre}
          onChange={e => setTitre(e.target.value)}
          placeholder="Ex. Auto-évaluation sommeil — cabinet"
          className={CLASSE_CHAMP}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Domaine
          <input
            value={domaine}
            onChange={e => setDomaine(e.target.value)}
            placeholder="Cabinet"
            className={CLASSE_CHAMP}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Échelle
          <select
            value={echelle}
            onChange={e => setEchelle(e.target.value as EchelleNommee)}
            className={CLASSE_CHAMP}
          >
            {(Object.keys(ECHELLES_NOMMEES) as EchelleNommee[]).map(nom => (
              <option key={nom} value={nom}>
                {ECHELLES_NOMMEES[nom].libelle}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Consigne
        <textarea
          value={consigne}
          onChange={e => setConsigne(e.target.value)}
          rows={2}
          placeholder="Ex. Répondez spontanément, en pensant aux deux dernières semaines."
          className={CLASSE_CHAMP}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold text-foreground">Questions</legend>
        {questions.map((q, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Question ${i + 1}`}
              value={q}
              onChange={e =>
                setQuestions(prev => prev.map((texte, j) => (j === i ? e.target.value : texte)))
              }
              placeholder={`Texte de la question ${i + 1}`}
              className={`min-w-0 flex-1 ${CLASSE_CHAMP}`}
            />
            <button
              type="button"
              aria-label={`Retirer la question ${i + 1}`}
              disabled={questions.length === 1}
              onClick={() => setQuestions(prev => prev.filter((_, j) => j !== i))}
              className="rounded p-1 text-muted-foreground hover:bg-status-danger/10 hover:text-status-danger disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={questions.length >= 60}
          onClick={() => setQuestions(prev => [...prev, ''])}
        >
          Ajouter une question
        </Button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold text-foreground">
          Bandes d’interprétation{' '}
          <span className="font-normal text-muted-foreground">
            (score possible {minPossible}–{maxPossible})
          </span>
        </legend>
        {bandes.map((b, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Score minimal de la bande ${i + 1}`}
              inputMode="numeric"
              value={b.min}
              onChange={e =>
                setBandes(prev => prev.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))
              }
              placeholder="min"
              className={`w-16 ${CLASSE_CHAMP}`}
            />
            <input
              aria-label={`Score maximal de la bande ${i + 1}`}
              inputMode="numeric"
              value={b.max}
              onChange={e =>
                setBandes(prev => prev.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))
              }
              placeholder="max"
              className={`w-16 ${CLASSE_CHAMP}`}
            />
            <input
              aria-label={`Libellé de la bande ${i + 1}`}
              value={b.label}
              onChange={e =>
                setBandes(prev => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
              placeholder="Libellé"
              className={`min-w-0 flex-1 ${CLASSE_CHAMP}`}
            />
            <select
              aria-label={`Couleur de la bande ${i + 1}`}
              value={b.color}
              onChange={e =>
                setBandes(prev =>
                  prev.map((x, j) =>
                    j === i ? { ...x, color: e.target.value as BandeEdition['color'] } : x,
                  ),
                )
              }
              className={CLASSE_CHAMP}
            >
              {COULEURS_BANDE.map(c => (
                <option key={c.valeur} value={c.valeur}>
                  {c.libelle}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Retirer la bande ${i + 1}`}
              disabled={bandes.length === 1}
              onClick={() => setBandes(prev => prev.filter((_, j) => j !== i))}
              className="rounded p-1 text-muted-foreground hover:bg-status-danger/10 hover:text-status-danger disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={bandes.length >= 6}
          onClick={() =>
            setBandes(prev => [...prev, { min: '', max: '', label: '', color: 'warning' }])
          }
        >
          Ajouter une bande
        </Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="button" disabled={occupe} onClick={() => void enregistrer(false)}>
          Enregistrer le brouillon
        </Button>
        <Button type="button" variant="outline" disabled={occupe} onClick={() => void enregistrer(true)}>
          Demander la relecture
        </Button>
      </div>
      <p className="text-2xs text-muted-foreground">
        Son scoring n’est jamais vérifié par WellNeuro : la grille doit être relue puis publiée
        avant tout envoi. Toute modification repasse l’instrument en brouillon.
      </p>
    </div>
  );
}

// Import JSON/CSV — le résultat entre toujours en brouillon ; les
// avertissements (échelle par défaut, grille à définir) restent affichés.
function ImportInstrument({ onRafraichir }: { onRafraichir: () => Promise<void> }) {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [contenu, setContenu] = useState('');
  const [titreImport, setTitreImport] = useState('');
  const [echelleImport, setEchelleImport] = useState<EchelleNommee | ''>('');
  const [resultat, setResultat] = useState<ImportInstrumentResponse | null>(null);
  const [occupe, setOccupe] = useState(false);

  async function importer() {
    setOccupe(true);
    setResultat(null);
    try {
      const res = await fetch('/api/praticien/instruments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          contenu,
          ...(titreImport.trim() ? { titre: titreImport.trim() } : {}),
          ...(echelleImport ? { echelle: echelleImport } : {}),
        }),
      });
      const json = (await res.json()) as ImportInstrumentResponse;
      setResultat(json);
      if (json.success) await onRafraichir();
    } catch {
      setResultat({ success: false, error: "L'import a échoué." });
    }
    setOccupe(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {resultat && !resultat.success && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger"
        >
          <p>{resultat.error ?? "L'import a échoué."}</p>
          {(resultat.erreurs ?? []).map(e => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {resultat?.success && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-lg border border-status-success/40 bg-status-success/10 px-3 py-2 text-xs text-status-success"
        >
          <p>
            Importé en brouillon ({resultat.nbQuestions} question
            {(resultat.nbQuestions ?? 0) > 1 ? 's' : ''}). La relecture reste obligatoire avant
            publication.
          </p>
        </div>
      )}
      {(resultat?.avertissements?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          {resultat?.avertissements?.map(a => <li key={a}>{a}</li>)}
        </ul>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Format
        <select
          value={format}
          onChange={e => setFormat(e.target.value as 'json' | 'csv')}
          className={CLASSE_CHAMP}
        >
          <option value="json">JSON</option>
          <option value="csv">CSV (une question par ligne)</option>
        </select>
      </label>
      {format === 'csv' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Titre
            <input
              value={titreImport}
              onChange={e => setTitreImport(e.target.value)}
              placeholder="Titre de l’instrument"
              className={CLASSE_CHAMP}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Échelle
            <select
              value={echelleImport}
              onChange={e => setEchelleImport(e.target.value as EchelleNommee | '')}
              className={CLASSE_CHAMP}
            >
              <option value="">Par défaut (Fréquence 0–4)</option>
              {(Object.keys(ECHELLES_NOMMEES) as EchelleNommee[]).map(nom => (
                <option key={nom} value={nom}>
                  {ECHELLES_NOMMEES[nom].libelle}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Contenu
        <textarea
          value={contenu}
          onChange={e => setContenu(e.target.value)}
          rows={10}
          placeholder={
            format === 'json'
              ? '{ "titre": "…", "questions": [{ "texte": "…" }], "echelle": "frequence_0_4" }'
              : 'question\nPremière question…\nDeuxième question…'
          }
          className={`font-mono text-xs ${CLASSE_CHAMP}`}
        />
      </label>
      <div className="border-t border-border pt-4">
        <Button type="button" disabled={occupe || contenu.trim().length === 0} onClick={() => void importer()}>
          Importer en brouillon
        </Button>
        <p className="mt-2 text-2xs text-muted-foreground">
          Sans grille fournie, une bande unique « Grille à définir — relecture requise » est posée.
        </p>
      </div>
    </div>
  );
}

// Récapitulatif de relecture : échelle, bandes, score maximal — puis le geste
// explicite « Grille relue — publier ». C'est LE passage obligé vers
// l'assignabilité d'un instrument du cabinet.
//
// Sur la famille SANS INTERPRÉTATION (`D-088`), il n'y a pas de grille à relire
// : ce qui se relit, c'est l'énoncé et ses ancres. L'écran le dit au lieu
// d'afficher une section « Bandes » vide, qui se lirait comme une grille
// oubliée — et le bouton cesse de promettre une relecture de grille.
function RelectureGrille({
  detail,
  occupe,
  onPublier,
}: {
  detail: InstrumentCabinetDetailDto;
  occupe: boolean;
  onPublier: () => void;
}) {
  const sansInterpretation = interditTouteBande(detail.scoring);
  const premiere = detail.definition.sections[0]?.questions[0];
  const options = premiere && premiere.type === 'likert' ? premiere.options : [];
  const items = detail.definition.sections.flatMap(s => s.questions);
  // `?? []` — la famille sans interprétation ne porte AUCUNE bande en base :
  // le champ y est absent, et un `.map` nu plantait l'écran de relecture.
  const bandes = detail.scoring.interpretation ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-display text-base font-semibold text-foreground">{detail.titre}</p>
        <p className="mt-1 font-mono text-2xs text-muted-foreground">
          {detail.idInstrument}
          {detail.nbQuestions != null ? ` · ${detail.nbQuestions} questions` : ''}
          {detail.scoreMax != null ? ` · score /${detail.scoreMax}` : ''}
        </p>
      </div>
      {sansInterpretation ? (
        <>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
              Énoncés et ancres
            </p>
            <ul className="mt-1 flex flex-col">
              {items.map(item => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b border-dashed border-border py-1.5 text-xs text-foreground last:border-b-0"
                >
                  <span className="min-w-0 flex-1">{item.texte}</span>
                  <span className="font-mono text-2xs text-muted-foreground">
                    {item.type === 'number'
                      ? `${item.min}–${item.max}${item.unit ? ` ${item.unit}` : ''}`
                      : item.options.map(o => o.v).join('/')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
              Interprétation
            </p>
            <p className="mt-1 text-xs text-foreground">
              Aucune interprétation : cet instrument pilote la conversation, il ne classe pas.
            </p>
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
              Échelle
            </p>
            <p className="mt-1 text-xs text-foreground">
              {options.map(o => `${o.v} = ${o.l}`).join(' · ')}
            </p>
          </div>
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
              Bandes d’interprétation
            </p>
            <ul className="mt-1 flex flex-col">
              {bandes.map(b => (
                <li
                  key={`${b.min}-${b.max}`}
                  className="flex items-center justify-between gap-2 border-b border-dashed border-border py-1.5 text-xs text-foreground last:border-b-0"
                >
                  <span className="font-mono text-2xs text-muted-foreground">
                    {b.min}–{b.max}
                  </span>
                  <span className="min-w-0 flex-1">{b.label}</span>
                  <Badge variant={b.color}>{libelleCouleur(b.color)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="border-t border-border pt-4">
        <Button type="button" disabled={occupe} onClick={onPublier}>
          {sansInterpretation ? 'Relu — publier' : 'Grille relue — publier'}
        </Button>
        <p className="mt-2 text-2xs text-muted-foreground">
          La publication rend l’instrument assignable via la file d’envoi. Son scoring reste non
          vérifié par WellNeuro.
        </p>
      </div>
    </div>
  );
}
