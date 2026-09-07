'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreatePatientResponse,
  PatchPatientResponse,
  PatientsApiResponse,
  PatientsPagination,
} from '@/app/api/praticien/patients/route';
import type { CycleDeVieAction, CycleDeVieResponse } from '@/app/api/praticien/patients/cycle-de-vie/route';
import type { CreateAssignationResponse } from '@/app/api/praticien/assignations/route';
import type { AnnulationAssignationResponse } from '@/app/api/praticien/assignations/annulation/route';
import type { QuestionnairesApiResponse } from '@/app/api/praticien/questionnaires/route';
import type { QuestionnairesRegistryApiResponse } from '@/app/api/praticien/questionnaires/registry/route';
import type { CreateConsultationResponse } from '@/app/api/praticien/consultations/route';
import type { TokenActionResponse } from '@/app/api/praticien/token/route';
import { MOTIFS_CONSULTATION } from '@/lib/consultation/motifs';
import { MESSAGE_DOSSIER_CLOS } from '@/lib/patient/cycleDeVie';
import { estAnnulable } from '@/lib/praticien/annulabilite';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { PatientRow, type ActionDossier, type PatientRowData } from '@/components/ui/PatientRow';
import { DossierConfirmDialog, type ModeConfirmation } from '@/components/ui/DossierConfirmDialog';
import { AnnulationAssignationDialog } from '@/components/ui/AnnulationAssignationDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { PanneauSuperpose } from '@/components/ui/PanneauSuperpose';
import { PacksPanel } from '@/components/PacksPanel';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

type SortBy = 'nom' | 'email';
type StatutFilter = '' | 'Complété' | 'En attente' | 'Annulée';

const STATUT_LABELS: Record<StatutFilter, string> = {
  '': 'Tous les statuts',
  'Complété': 'Complété',
  'En attente': 'En attente',
  'Annulée': 'Annulée',
};

function erreurLisible(reason?: string, fallback?: string): string {
  const map: Record<string, string> = {
    unauthenticated: 'Votre session a expiré. Déconnectez-vous puis reconnectez-vous.',
    invalid_payload: fallback ?? 'Données invalides.',
    duplicate_email: 'Un patient avec cet email existe déjà.',
    patient_not_found: 'Patient introuvable.',
    forbidden: 'Ce dossier n’est pas accessible depuis votre compte.',
    portal_revoked: 'Accès au portail révoqué : réactivez-le avant d’envoyer un lien.',
    // Refus servis par le cycle de vie du dossier (IDP2, LOT-01a).
    dossier_cloture: MESSAGE_DOSSIER_CLOS,
    confirmation_manquante: 'Effacement non confirmé : aucune donnée n’a été touchée.',
    questionnaire_not_found: 'Questionnaire introuvable.',
    // Annulation d'assignation (Fil A) : seules les ouvertes sont annulables.
    already_filled: 'Ce questionnaire a déjà été rempli — il ne peut pas être annulé.',
    exception: 'Erreur technique. Vérifiez le terminal Next.js.',
  };
  return (reason && map[reason]) ?? fallback ?? 'Erreur inconnue.';
}

/**
 * `success: true` ne dit que l'écriture en base ; c'est `envoi` qui dit si
 * l'e-mail est parti. Les trois libellés d'envoi passent par ici, chacun
 * nommant ses trois cas en toutes lettres.
 *
 * Le type vient du DTO de route, jamais de `lib/consultation/email` : ce
 * module-là importe `nodemailer` via `transportSmtp`, et un import de valeur
 * l'embarquerait au bundle client. Passer par `CreateConsultationResponse`
 * (déjà importé) rend cette faute impossible plutôt que surveillée.
 *
 * `undefined` vaut « envoyé » : les routes posent désormais toujours le champ
 * sur un chemin d'envoi, et son absence ne doit rougir ni un envoi réussi ni
 * une action qui n'envoie rien.
 */
function libelleEnvoi(
  envoi: CreateConsultationResponse['envoi'],
  textes: { envoye: string; echoue: string; nonConfigure: string },
): string {
  return envoi === 'echoue' ? textes.echoue
    : envoi === 'non_configure' ? textes.nonConfigure
    : textes.envoye;
}

/** Vrai tant qu'aucun envoi n'est mort : sert la COULEUR de la ligne de statut. */
function envoiReussi(envoi: CreateConsultationResponse['envoi']): boolean {
  return envoi !== 'echoue' && envoi !== 'non_configure';
}

function StatusBadge({ value }: { value: string }) {
  const status = value || '—';
  const variant: BadgeVariant =
    status === 'Complété' ? 'success' : status === 'Annulée' ? 'warning' : 'neutral';
  return <Badge variant={variant}>{status}</Badge>;
}

// Tiroir d'action (SP-TRAJ LOT-05) : les trois formulaires de création
// quittent l'empilement de cartes pour des tiroirs Radix ouverts depuis une
// barre d'actions — le tableau patients redevient le premier élément de la
// page. Composant DÉFINI AU NIVEAU MODULE (jamais dans le rendu du panneau :
// une définition imbriquée remonterait le formulaire à chaque rendu et ferait
// perdre le focus de saisie). Le déclencheur vit dans le Root Radix : le
// focus revient dessus à la fermeture.

type EditPatientState = {
  idPatient: string;
  telephone: string;
  actif: 'OUI' | 'NON';
};

type SuggestedPackSelection = {
  registryPackId: string;
  titre: string;
  nonce: number;
};

export function PatientsPanel({ lienMagiqueActif = false }: { lienMagiqueActif?: boolean }) {
  const [data, setData] = useState<PatientsApiResponse | null>(null);
  const [questionnaires, setQuestionnaires] = useState<QuestionnairesApiResponse['questionnaires']>([]);
  const [registry, setRegistry] = useState<QuestionnairesRegistryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAssignation, setSavingAssignation] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Fin de parcours en attente de confirmation. Un seul dialogue pour tout le
  // tableau : dix lignes ne doivent pas produire dix dialogues dans le DOM.
  const [confirmation, setConfirmation] = useState<{ mode: ModeConfirmation; patient: PatientRowData } | null>(null);
  const [cycleEnCours, setCycleEnCours] = useState(false);
  // L'échec d'une action de fin de parcours se dit DANS le dialogue : Radix
  // pose un voile et `aria-hidden` sur le reste de la page, un message affiché
  // ailleurs serait invisible et muet pour un lecteur d'écran.
  const [erreurConfirmation, setErreurConfirmation] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('nom');
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('');
  // Miroir du filtre courant, tenu à jour APRÈS commit — écrire un ref pendant
  // le rendu laisserait, sur un rendu concurrent abandonné, une valeur jamais
  // commitée qu'un gestionnaire d'événement lirait ensuite.
  // Il sert à deux choses : les rafraîchissements déclenchés ailleurs
  // (création, annulation…) conservent le filtre, et la garde de fraîcheur de
  // `loadData` sait à quel statut la réponse qui arrive devrait correspondre.
  const statutFilterRef = useRef<StatutFilter>('');
  useEffect(() => {
    statutFilterRef.current = statutFilter;
  }, [statutFilter]);
  // Échec du rechargement déclenché par le sélecteur de statut. Distinct de
  // `data.unavailable`, qui remplace le panneau entier : changer un filtre
  // d'affichage ne doit pas faire disparaître la surface praticien.
  const [erreurStatut, setErreurStatut] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [tablePatients, setTablePatients] = useState<PatientsApiResponse['patients']>([]);
  const [pagination, setPagination] = useState<PatientsPagination | null>(null);
  const [loadingTable, setLoadingTable] = useState(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [assignationFeedback, setAssignationFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  // Annulation d'assignation (Fil A) : cible de la modale, état d'envoi, erreur.
  const [annulationCible, setAnnulationCible] = useState<{ idAssignation: string; titre: string; emailPatient: string; nbJourneesAgenda: number | null } | null>(null);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  const [erreurAnnulation, setErreurAnnulation] = useState<string | null>(null);
  const [editFeedback, setEditFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editState, setEditState] = useState<EditPatientState | null>(null);
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', telephone: '', dateNaissance: '' });
  const [assignationForm, setAssignationForm] = useState({
    emailPatient: '',
    idQuestionnaire: '',
    dateLimite: '',
    notes: '',
  });
  // Filtre catégorie du sélecteur de questionnaire ('' = Toutes). Purement
  // côté client : restreint la liste sans appel réseau ni migration.
  const [categorieFilter, setCategorieFilter] = useState('');
  const [categorieView, setCategorieView] = useState<'fonctionnelle' | 'historique'>('fonctionnelle');
  // Consultation / accès portail patient.
  const [consultationForm, setConsultationForm] = useState({ idPatient: '', motif: '' });
  const [savingConsultation, setSavingConsultation] = useState(false);
  const [tokenAction, setTokenAction] = useState<'resend' | 'revoke' | 'copier' | 'lien_magique' | null>(null);
  const [consultationFeedback, setConsultationFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [suggestedPackSelection, setSuggestedPackSelection] = useState<SuggestedPackSelection | null>(null);
  // Tiroir d'action ouvert (LOT-05) — un seul à la fois.
  const [tiroirOuvert, setTiroirOuvert] = useState<'patient' | 'consultation' | 'assignation' | null>(null);

  // Le statut part au serveur : filtrer en mémoire une liste déjà plafonnée à 40
  // masquait les assignations situées au-delà du 40ᵉ rang — 8 « En attente »
  // au 2026-07-29, ni consultables ni annulables depuis ce tableau.
  // Le paramètre par défaut reprend le filtre courant, pour que les rafraîchis-
  // sements déclenchés ailleurs (création, annulation…) ne le perdent pas.
  const loadData = async (
    statut: StatutFilter = statutFilterRef.current,
    options?: { echecRemonte?: boolean },
  ) => {
    const qs = statut ? `?statut=${encodeURIComponent(statut)}` : '';
    const r = await fetch(`/api/praticien/patients${qs}`);
    const json = (await r.json()) as PatientsApiResponse;

    // Le sélecteur n'a pas de debounce : deux changements dans un aller-retour
    // lancent deux requêtes concurrentes, et sans garde c'est la dernière
    // ARRIVÉE qui gagne — la table listerait des « Complété » sous un filtre
    // affichant « En attente ». Le filtre en mémoire d'avant en était
    // structurellement immunisé ; celui-ci doit s'en protéger explicitement.
    // Une réponse muette sur son statut (serveur antérieur, charge d'erreur)
    // n'est pas un désaccord : on ne jette que ce qui contredit.
    const statutRendu = json.assignationsMeta?.statut;
    if (statutRendu !== undefined && (statutRendu ?? '') !== statutFilterRef.current) return;

    // Une session expirée ou une exception serveur remplace tout le panneau
    // (voir `data.unavailable` plus bas). Acceptable au chargement initial,
    // pas sur un simple changement de filtre : l'appelant traite l'échec.
    if (options?.echecRemonte && json.unavailable) {
      throw new Error(json.reason ?? 'exception');
    }
    setData(json);
  };

  // Pagination côté serveur (skip/take) : source de vérité pour le tableau
  // affiché. `data.patients` (chargé sans pagination par loadData) reste la
  // liste complète utilisée par le sélecteur "Nouvelle assignation".
  const loadPatientsTable = useCallback(async (targetPage: number, currentSearch: string, currentSortBy: SortBy) => {
    setLoadingTable(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
        sortBy: currentSortBy,
      });
      if (currentSearch.trim()) params.set('search', currentSearch.trim());
      const r = await fetch(`/api/praticien/patients?${params.toString()}`);
      const json = (await r.json()) as PatientsApiResponse;
      setTablePatients(json.patients ?? []);
      setPagination(json.pagination ?? null);
    } catch {
      setTablePatients([]);
      setPagination(null);
    } finally {
      setLoadingTable(false);
    }
  }, []);

  const loadQuestionnaires = async () => {
    const r = await fetch('/api/praticien/questionnaires');
    const json = (await r.json()) as QuestionnairesApiResponse;
    setQuestionnaires(json.questionnaires ?? []);
  };

  const loadRegistry = async () => {
    const r = await fetch('/api/praticien/questionnaires/registry');
    const json = (await r.json()) as QuestionnairesRegistryApiResponse;
    setRegistry(json);
  };

  useEffect(() => {
    Promise.all([loadData(), loadQuestionnaires(), loadRegistry()])
      .catch(() => setData({ patients: [], assignations: [], unavailable: true, reason: 'exception' }))
      .finally(() => setLoading(false));
  }, []);

  const categoriesRegistry = registry?.categories ?? [];
  const categoryById = new Map<string, (typeof categoriesRegistry)[number]>(
    categoriesRegistry.map(c => [c.id as string, c]),
  );
  // `packsRegistry` / `packById` ne servaient qu'aux libellés du bloc « Packs
  // suggérés » (retiré, LOT-03). `registry` reste passé tel quel à `PacksPanel`.

  const getFunctionalCategoryLabel = (id: string): string => categoryById.get(id)?.titre ?? id;
  const getFunctionalCategoryPhase = (id: string): 'mvp' | 'phase_2' => categoryById.get(id)?.phase ?? 'phase_2';

  // Recherche/tri changés : revient en page 1 et recharge (debounce sur la
  // recherche pour éviter une requête par frappe clavier). Ignoré au premier
  // rendu : le chargement initial est déjà couvert par l'effet [page].
  const isFirstSearchRender = useRef(true);
  useEffect(() => {
    if (isFirstSearchRender.current) {
      isFirstSearchRender.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      setPage(1);
      loadPatientsTable(1, search, sortBy);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search, sortBy, loadPatientsTable]);

  useEffect(() => {
    loadPatientsTable(page, search, sortBy);
  }, [page, search, sortBy, loadPatientsTable]);

  // Le filtre de statut se joue en base : changer de statut est un rechargement,
  // pas un tri en mémoire. Pas de debounce — c'est un <select>, pas une frappe
  // clavier. Ignoré au premier rendu, déjà couvert par le chargement initial.
  const isFirstStatutRender = useRef(true);
  useEffect(() => {
    if (isFirstStatutRender.current) {
      isFirstStatutRender.current = false;
      return;
    }
    setErreurStatut(null);
    // Seul chemin de chargement déclenché par un geste d'UI : sans ce `.catch`,
    // une coupure réseau ou un 502 rendant du HTML laisserait le sélecteur sur
    // « En attente » et la table sur l'ensemble précédent, sans un mot.
    loadData(statutFilter, { echecRemonte: true }).catch(() =>
      setErreurStatut('Impossible de recharger les assignations. Vérifiez votre connexion, puis réessayez.'),
    );
  }, [statutFilter]);

  const refreshPatients = () => Promise.all([loadData(), loadPatientsTable(page, search, sortBy)]);

  const onCreatePatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch('/api/praticien/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = (await r.json()) as CreatePatientResponse;
      if (!r.ok || !json.success) {
        setFeedback({ ok: false, msg: erreurLisible(json.reason, json.error) });
        return;
      }
      setFeedback({ ok: true, msg: `Patient ${form.prenom} ${form.nom} créé.` });
      setForm({ prenom: '', nom: '', email: '', telephone: '', dateNaissance: '' });
      await refreshPatients();
    } catch {
      setFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSaving(false);
    }
  };

  const onCreateAssignation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingAssignation(true);
    setAssignationFeedback(null);
    try {
      const selectedQ = questionnaires.find(q => q.id === assignationForm.idQuestionnaire);
      const r = await fetch('/api/praticien/assignations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailPatient: assignationForm.emailPatient,
          idQuestionnaire: assignationForm.idQuestionnaire,
          titre: selectedQ?.titre ?? '',
          dateLimite: assignationForm.dateLimite,
          notes: assignationForm.notes,
        }),
      });
      const json = (await r.json()) as CreateAssignationResponse;
      if (!r.ok || !json.success) {
        setAssignationFeedback({ ok: false, msg: erreurLisible(json.reason, json.error) });
        return;
      }
      setAssignationFeedback({ ok: true, msg: 'Assignation créée.' });
      setAssignationForm({ emailPatient: '', idQuestionnaire: '', dateLimite: '', notes: '' });
      await loadData();
    } catch {
      setAssignationFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSavingAssignation(false);
    }
  };

  const onConfirmerAnnulation = async () => {
    if (!annulationCible || annulationEnCours) return;
    setAnnulationEnCours(true);
    setErreurAnnulation(null);
    try {
      const r = await fetch('/api/praticien/assignations/annulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAssignation: annulationCible.idAssignation }),
      });
      const json = (await r.json()) as AnnulationAssignationResponse;
      if (!json.ok) {
        setErreurAnnulation(erreurLisible(json.reason, json.error));
        return;
      }
      setAnnulationCible(null);
      await loadData();
    } catch {
      setErreurAnnulation('Erreur réseau. Réessayez.');
    } finally {
      setAnnulationEnCours(false);
    }
  };

  const onCreateConsultation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingConsultation(true);
    setConsultationFeedback(null);
    try {
      const r = await fetch('/api/praticien/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: consultationForm.idPatient, motif: consultationForm.motif }),
      });
      const json = (await r.json()) as CreateConsultationResponse;
      if (!r.ok || !json.success) {
        setConsultationFeedback({ ok: false, msg: erreurLisible(json.reason, json.error) });
        return;
      }
      // `ok: true` MAINTENU même sur envoi mort : la consultation EST créée, le
      // tiroir doit se fermer et le formulaire se réinitialiser. Un `ok: false`
      // laisserait le tiroir ouvert sur un dossier déjà créé — invitation à la
      // double soumission. C'est le TEXTE qui porte l'échec, et il dit quoi
      // faire, pour que le vert ne se lise pas comme un succès d'envoi.
      setConsultationFeedback({
        ok: true,
        msg: libelleEnvoi(json.envoi, {
          envoye: 'Consultation créée, lien d’accès envoyé au patient.',
          echoue: 'Consultation créée, mais l’e-mail n’est pas parti. Renvoyez le lien depuis le menu du dossier.',
          nonConfigure: 'Consultation créée. Aucun e-mail n’est parti : la messagerie n’est pas configurée.',
        }),
      });
      setConsultationForm({ idPatient: '', motif: '' });
      // Succès → le tiroir se ferme, la ligne de statut de la page l'annonce.
      setTiroirOuvert(null);
    } catch {
      setConsultationFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSavingConsultation(false);
    }
  };

  // Les quatre actions d'accès prennent désormais leur patient en paramètre :
  // elles sont déclenchées depuis le menu d'une LIGNE, et non plus depuis le
  // sélecteur de la carte consultation. Le garde « Sélectionnez un patient »
  // n'a plus d'objet — une ligne désigne toujours un dossier.
  const onResendToken = async (idPatient: string) => {
    setTokenAction('resend');
    setConsultationFeedback(null);
    try {
      const r = await fetch('/api/praticien/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient, action: 'resend' }),
      });
      const json = (await r.json()) as TokenActionResponse;
      setConsultationFeedback(
        !r.ok || !json.success
          ? { ok: false, msg: erreurLisible(json.reason, json.error) }
          : {
              // Ici, pas de tiroir à refermer et l'action est répétable : un
              // envoi mort peut donc rougir franchement la ligne de statut.
              ok: envoiReussi(json.envoi),
              msg: libelleEnvoi(json.envoi, {
                envoye: 'Lien d’accès renvoyé au patient.',
                echoue: 'Le lien n’est pas parti : l’envoi de l’e-mail a échoué. Réessayez.',
                nonConfigure: 'Le lien n’est pas parti : la messagerie n’est pas configurée.',
              }),
            }
      );
    } catch {
      setConsultationFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setTokenAction(null);
    }
  };

  // Lien magique (gate G4) — action de nature différente des autres, qui
  // pointent la page de connexion : celui-ci expire en 24 h et ne s'ouvre qu'une
  // fois. Le libellé le dit, pour qu'on ne le confonde pas avec « Renvoyer le lien ».
  const onEnvoyerLienMagique = async (idPatient: string) => {
    setTokenAction('lien_magique');
    setConsultationFeedback(null);
    try {
      const r = await fetch('/api/praticien/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient, action: 'lien_magique' }),
      });
      const json = (await r.json()) as TokenActionResponse;
      setConsultationFeedback(
        !r.ok || !json.success
          ? { ok: false, msg: erreurLisible(json.reason, json.error) }
          : {
              ok: envoiReussi(json.envoi),
              msg: libelleEnvoi(json.envoi, {
                envoye: 'Lien à usage unique envoyé — valable 24 h.',
                echoue: 'Lien à usage unique émis, mais l’e-mail n’est pas parti. Réessayez.',
                nonConfigure: 'Lien à usage unique émis, mais aucun e-mail n’est parti : la messagerie n’est pas configurée.',
              }),
            }
      );
    } catch {
      setConsultationFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setTokenAction(null);
    }
  };

  const onCopierLien = async (idPatient: string) => {
    setTokenAction('copier');
    setConsultationFeedback(null);
    try {
      const r = await fetch('/api/praticien/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient, action: 'lien' }),
      });
      const json = (await r.json()) as TokenActionResponse;
      if (!r.ok || !json.success || !json.lien) {
        setConsultationFeedback({ ok: false, msg: erreurLisible(json.reason, json.error) });
        return;
      }
      await navigator.clipboard.writeText(json.lien);
      setConsultationFeedback({ ok: true, msg: 'Lien copié dans le presse-papiers.' });
    } catch {
      setConsultationFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setTokenAction(null);
    }
  };

  // Appelée UNIQUEMENT derrière la confirmation (LOT-02c) : un échec part donc
  // dans `erreurConfirmation`, à l'intérieur du dialogue. Rendu ailleurs dans la
  // page, il serait derrière l'overlay Radix et sous `aria-hidden` — le défaut
  // que la revue du LOT-01b avait rattrapé sur l'effacement.
  const onRevokeToken = async (idPatient: string) => {
    setTokenAction('revoke');
    setErreurConfirmation(null);
    setConsultationFeedback(null);
    try {
      const r = await fetch(`/api/praticien/token?idPatient=${encodeURIComponent(idPatient)}`, {
        method: 'DELETE',
      });
      const json = (await r.json()) as TokenActionResponse;
      if (!r.ok || !json.success) {
        setErreurConfirmation(erreurLisible(json.reason, json.error));
        return;
      }
      setConsultationFeedback({
        ok: true,
        msg: 'Accès révoqué : lien coupé, session en cours terminée, liens à usage unique annulés.',
      });
      setConfirmation(null);
      await refreshPatients();
    } catch {
      setErreurConfirmation('Erreur réseau. Réessayez.');
    } finally {
      setTokenAction(null);
    }
  };

  const openEdit = (p: PatientRowData) => {
    setEditState({ idPatient: p.idPatient, telephone: p.telephone, actif: p.actif === 'OUI' ? 'OUI' : 'NON' });
    setEditFeedback(null);
  };

  // Activation / désactivation par PATCH, dans les deux sens. Il n'y a plus de
  // route DELETE à appeler : elle ne savait que désactiver, et son nom laissait
  // croire à une suppression — précisément le malentendu que ce lot corrige.
  const onToggleActif = async (idPatient: string, actif: 'OUI' | 'NON') => {
    setErreurConfirmation(null);
    const r = await fetch('/api/praticien/patients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idPatient, actif }),
    });
    const json = (await r.json()) as PatchPatientResponse;
    if (!r.ok || !json.success) {
      setErreurConfirmation(erreurLisible(json.reason, json.error));
      return;
    }
    setConsultationFeedback({
      ok: true,
      msg: actif === 'OUI' ? 'Dossier réactivé.' : 'Dossier désactivé : l’accès au portail est coupé.',
    });
    setConfirmation(null);
    await refreshPatients();
  };

  // Le paramètre porte la SAISIE, pas l'état du dialogue — d'où `saisie` et non
  // `confirmation` : nommé ainsi, il masquait l'état `confirmation`, donc le
  // dossier concerné, et le message final ne pouvait plus le consulter.
  //
  // Le mode est typé `CycleDeVieAction` — l'union de la ROUTE — et non
  // `ModeConfirmation`, qui couvre aussi `desactivation`/`reactivation`. Ces
  // deux-là passent par `PATCH` : les accepter ici les aurait laissées typées
  // jusqu'à un 400 à l'exécution. Le dispatcher les écarte déjà, mais un garde
  // qui ne vit que dans une branche `if` ne protège pas le prochain appelant.
  const onCycleDeVie = async (idPatient: string, mode: CycleDeVieAction, saisie: string) => {
    // `confirmation` est le binding de CETTE fermeture de rendu : ni
    // `setConfirmation(null)` ni `refreshPatients()` ne le réassignent — ils
    // programment un rendu, qui produira une autre fermeture. La valeur reste
    // donc valide jusqu'au bout de la fonction, et l'alias ci-dessous ne fait
    // que nommer ce fait pour le lecteur.
    //
    // Ce qui garantit qu'il s'agit du BON dossier est ailleurs : l'unique
    // appelant (`onConfirmerFinDeParcours`) refuse d'entrer sans `confirmation`
    // et exclut la réentrance par `cycleEnCours`.
    const confirmationEnCours = confirmation;
    const r = await fetch('/api/praticien/patients/cycle-de-vie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idPatient,
        action: mode,
        // La saisie RÉELLE de l'utilisateur, jamais une constante recopiée :
        // si un jour l'activation du bouton régressait, le serveur refuserait
        // encore. Une constante en dur ferait de cette régression un
        // effacement.
        ...(mode === 'effacement' ? { confirmation: saisie } : {}),
      }),
    });
    const json = (await r.json()) as CycleDeVieResponse;
    if (!r.ok || !json.success) {
      setErreurConfirmation(
        erreurLisible(
          json.success === false ? json.reason : undefined,
          json.success === false ? json.error : undefined,
        ),
      );
      return;
    }
    // Le message de clôture suit la MÊME condition que le dialogue qui vient de
    // le précéder (`accesActif`) : sur un dossier désactivé, le portail refuse
    // déjà le lien, et le lui promettre ici serait faux. C'est ce texte-là que
    // le praticien lit systématiquement — les deux autres ne s'affichent qu'en
    // amont ou en cas de refus.
    const accesOuvert = confirmationEnCours?.patient.actif === 'OUI';
    setConsultationFeedback({
      ok: true,
      msg:
        mode === 'effacement'
          ? 'Dossier effacé définitivement. Il ne subsiste qu’une ligne anonyme.'
          : mode === 'cloture'
            ? accesOuvert
              ? 'Suivi clôturé : plus aucune assignation ni aucun envoi de document de suivi. Le patient garde l’accès à ses archives, et vous pouvez lui renvoyer son lien.'
              : 'Suivi clôturé : plus aucune assignation ni aucun envoi de document de suivi. Le dossier reste désactivé, donc sans accès au portail.'
            : 'Suivi rouvert.',
    });
    setConfirmation(null);
    await refreshPatients();
  };

  /** Exécute l'action confirmée, quelle qu'elle soit, avec un seul garde. */
  const onConfirmerFinDeParcours = async (saisie: string) => {
    if (!confirmation || cycleEnCours) return;
    const { mode, patient } = confirmation;
    setCycleEnCours(true);
    setErreurConfirmation(null);
    try {
      if (mode === 'desactivation') await onToggleActif(patient.idPatient, 'NON');
      else if (mode === 'reactivation') await onToggleActif(patient.idPatient, 'OUI');
      else if (mode === 'revocation') await onRevokeToken(patient.idPatient);
      else await onCycleDeVie(patient.idPatient, mode, saisie);
    } catch {
      setErreurConfirmation('Erreur réseau. Réessayez.');
    } finally {
      setCycleEnCours(false);
    }
  };

  // Un seul point d'entrée pour le menu d'une ligne. TOUTE action qui change
  // ce à quoi le patient a accès passe par un dialogue — y compris la
  // désactivation, qui coupe l'accès au portail : avant ce lot elle demandait
  // déjà deux gestes (« Supprimer » puis « Confirmer »), la renommer ne
  // justifiait pas de lui retirer sa confirmation.
  //
  // La révocation y entre au LOT-02c. Elle échappait à cette règle que le code
  // énonçait déjà : un clic, aucune question, alors qu'elle coupe désormais une
  // session en cours et les liens à usage unique en vol.
  const demanderConfirmation = (mode: ModeConfirmation, patient: PatientRowData) => {
    setErreurConfirmation(null);
    setConfirmation({ mode, patient });
  };

  const onActionDossier = (action: ActionDossier, patient: PatientRowData) => {
    switch (action) {
      case 'resend': return void onResendToken(patient.idPatient);
      case 'copier': return void onCopierLien(patient.idPatient);
      case 'lien_magique': return void onEnvoyerLienMagique(patient.idPatient);
      case 'revoke': return demanderConfirmation('revocation', patient);
      case 'desactiver': return demanderConfirmation('desactivation', patient);
      case 'reactiver': return demanderConfirmation('reactivation', patient);
      case 'cloturer': return demanderConfirmation('cloture', patient);
      case 'rouvrir': return demanderConfirmation('reprise', patient);
      case 'effacer': return demanderConfirmation('effacement', patient);
    }
  };

  const onSaveEdit = async () => {
    if (!editState) return;
    setSavingEdit(true);
    setEditFeedback(null);
    try {
      // LE FORMULAIRE NE POSTE QUE LE CONTACT. `actif` en est retiré depuis
      // `D-126` : désactiver ferme désormais les liens en vol, geste
      // IRRÉVERSIBLE, et ce chemin-ci était le seul sans dialogue de
      // confirmation. Un praticien venu corriger un numéro de téléphone
      // pouvait effleurer le select et tuer le lien envoyé deux heures plus
      // tôt, pour tout retour « Patient mis à jour. ». La règle que ce module
      // s'écrit à lui-même vaut ici comme ailleurs : toute action qui change ce
      // à quoi le patient a accès passe par un dialogue — celui du menu de
      // ligne, « Désactiver le dossier ».
      const r = await fetch('/api/praticien/patients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient: editState.idPatient, telephone: editState.telephone }),
      });
      const json = (await r.json()) as PatchPatientResponse;
      if (!r.ok || !json.success) {
        setEditFeedback({ ok: false, msg: erreurLisible(json.reason, json.error) });
        return;
      }
      setEditFeedback({ ok: true, msg: 'Patient mis à jour.' });
      await refreshPatients();
      setTimeout(() => setEditState(null), 800);
    } catch {
      setEditFeedback({ ok: false, msg: 'Erreur réseau. Réessayez.' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Plus de filtre ici : le serveur a déjà rendu les assignations du statut
  // demandé. Le filtre qui vivait à cet endroit s'appliquait APRÈS la troncature
  // à 40 et masquait tout ce qui la dépassait.
  const filteredAssignations = data?.assignations ?? [];

  // Ce que la troncature a laissé de côté. `null` tant que le serveur n'a rien
  // dit : un compte manquant n'est pas un compte nul, et on préfère ne rien
  // afficher plutôt qu'affirmer une exhaustivité invérifiable.
  const meta = data?.assignationsMeta ?? null;
  const assignationsTronquees = meta !== null && meta.total > filteredAssignations.length;

  if (loading) {
    return <div className="text-base text-muted-foreground">Chargement des données patients...</div>;
  }

  if (data?.unavailable) {
    return (
      <div className="bg-muted border border-border rounded-xl p-4 text-base text-muted-foreground">
        {erreurLisible(data.reason)}
      </div>
    );
  }

  // Catégories distinctes (tri alphabétique FR) pour le filtre d'assignation.
  const categories = categorieView === 'fonctionnelle'
    ? Array.from(new Set(questionnaires.map(q => q.categorieFonctionnellePrincipale).filter(Boolean))).sort((a, b) =>
      getFunctionalCategoryLabel(a).localeCompare(getFunctionalCategoryLabel(b), 'fr'),
    )
    : Array.from(new Set(questionnaires.map(q => q.categorie).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'fr'),
    );

  const questionnairesFiltres = categorieFilter
    ? questionnaires.filter(q =>
      categorieView === 'fonctionnelle'
        ? q.categorieFonctionnellePrincipale === categorieFilter
        : q.categorie === categorieFilter,
    )
    : questionnaires;

  // `questionnaireSelectionne` et `packsSuggeres` n'alimentaient QUE le bloc
  // « Packs suggérés », retiré plus bas (LOT-03, D-030) : les garder ici
  // laisserait du calcul sans lecteur.

  return (
    <div className="flex flex-col gap-6">

      {/* Confirmation de fin de parcours — un seul dialogue pour le tableau */}
      {confirmation && (
        <DossierConfirmDialog
          mode={confirmation.mode}
          nomPatient={`${confirmation.patient.prenom} ${confirmation.patient.nom}`.trim()}
          accesActif={confirmation.patient.actif === 'OUI'}
          open
          onOpenChange={ouvert => {
            if (!ouvert && !cycleEnCours) {
              setConfirmation(null);
              setErreurConfirmation(null);
            }
          }}
          enCours={cycleEnCours}
          erreur={erreurConfirmation}
          onConfirm={onConfirmerFinDeParcours}
        />
      )}

      {/* Barre d'actions (LOT-05) : les formulaires de création vivent en
          tiroirs — le tableau patients est le premier contenu de la page. */}
      <div className="flex flex-wrap items-center gap-3">
        <PanneauSuperpose
          largeur="standard"
          declencheur={<Button className="min-h-11">Nouveau patient</Button>}
          titre="Nouveau patient"
          description="Nouveau patient"
          descriptionMasquee
          open={tiroirOuvert === 'patient'}
          onOpenChange={ouvert => setTiroirOuvert(ouvert ? 'patient' : null)}
        >
          <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={onCreatePatient}>
          <Input required value={form.prenom} onChange={e => setForm(p => ({ ...p, prenom: e.target.value }))} placeholder="Prénom *" maxLength={100} />
          <Input required value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Nom *" maxLength={100} />
          <Input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email *" maxLength={254} />
          <Input value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))} placeholder="Téléphone" maxLength={30} />
          <Input type="date" value={form.dateNaissance} onChange={e => setForm(p => ({ ...p, dateNaissance: e.target.value }))} />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Création...' : 'Créer le patient'}
            </Button>
            {feedback && (
              <span role="status" className={`text-sm ${feedback.ok ? 'text-status-success' : 'text-status-danger'}`}>
                {feedback.msg}
              </span>
            )}
          </div>
          </form>
        </PanneauSuperpose>

        <PanneauSuperpose
          largeur="standard"
          declencheur={<Button className="min-h-11">Nouvelle consultation</Button>}
          titre="Nouvelle consultation"
          description="Ouvre une consultation et envoie au patient son lien d’accès : consentement, fiche de renseignements, anamnèse, puis assignation automatique du pack de base. Les actions sur un dossier existant sont dans « Gérer le dossier », au bout de sa ligne."
          open={tiroirOuvert === 'consultation'}
          onOpenChange={ouvert => setTiroirOuvert(ouvert ? 'consultation' : null)}
        >
          <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={onCreateConsultation}>
          <Select required value={consultationForm.idPatient} onChange={e => setConsultationForm(p => ({ ...p, idPatient: e.target.value }))}>
            <option value="">Patient *</option>
            {/* Un dossier clos est signalé ICI, et pas seulement refusé après
                coup : la route répond 409, mais découvrir la clôture au moment
                de l'échec est une mauvaise façon de l'apprendre. */}
            {(data?.patients ?? []).map(p => (
              <option key={p.idPatient} value={p.idPatient}>
                {`${p.prenom} ${p.nom} — ${p.email}${p.suiviClotureLe ? ' (suivi clôturé)' : ''}`}
              </option>
            ))}
          </Select>
          <Select value={consultationForm.motif} onChange={e => setConsultationForm(p => ({ ...p, motif: e.target.value }))} aria-label="Motif de consultation">
            <option value="">Motif de consultation (optionnel)</option>
            {MOTIFS_CONSULTATION.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={savingConsultation || tokenAction !== null}>
              {savingConsultation ? 'Envoi...' : 'Créer une consultation & envoyer le lien'}
            </Button>
            {/* Un échec se dit DANS le tiroir (Radix voile le reste de la
                page) ; le succès ferme le tiroir et s'annonce par la ligne
                de statut de la barre d'actions. */}
            {consultationFeedback && !consultationFeedback.ok && (
              <span role="status" className="text-sm text-status-danger">
                {consultationFeedback.msg}
              </span>
            )}
          </div>
          </form>
        </PanneauSuperpose>

        <PanneauSuperpose
          largeur="standard"
          declencheur={<Button className="min-h-11">Nouvelle assignation</Button>}
          titre="Nouvelle assignation questionnaire"
          description="Nouvelle assignation questionnaire"
          descriptionMasquee
          open={tiroirOuvert === 'assignation'}
          onOpenChange={ouvert => setTiroirOuvert(ouvert ? 'assignation' : null)}
        >
          <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={onCreateAssignation}>
          <Select required value={assignationForm.emailPatient} onChange={e => setAssignationForm(p => ({ ...p, emailPatient: e.target.value }))}>
            <option value="">Patient *</option>
            {(data?.patients ?? []).map(p => (
              <option key={p.idPatient} value={p.email}>{`${p.prenom} ${p.nom} — ${p.email}`}</option>
            ))}
          </Select>
          <Select
            value={categorieView}
            onChange={e => {
              setCategorieView(e.target.value as 'fonctionnelle' | 'historique');
              setCategorieFilter('');
              setAssignationForm(p => ({ ...p, idQuestionnaire: '' }));
            }}
            aria-label="Type de catégories"
          >
            <option value="fonctionnelle">Catégories fonctionnelles (recommandé)</option>
            <option value="historique">Catégories historiques</option>
          </Select>
          <Select
            value={categorieFilter}
            onChange={e => {
              setCategorieFilter(e.target.value);
              // Réinitialise le questionnaire sélectionné s'il n'est plus visible.
              setAssignationForm(p => ({ ...p, idQuestionnaire: '' }));
            }}
            aria-label="Filtrer par catégorie"
          >
            <option value="">Toutes les catégories</option>
            {categories.map(c => (
              <option key={c} value={c}>
                {categorieView === 'fonctionnelle'
                  ? `${getFunctionalCategoryLabel(c)}${getFunctionalCategoryPhase(c) === 'mvp' ? ' (MVP)' : ''}`
                  : c}
              </option>
            ))}
          </Select>
          <Select required value={assignationForm.idQuestionnaire} onChange={e => setAssignationForm(p => ({ ...p, idQuestionnaire: e.target.value }))}>
            <option value="">Questionnaire *</option>
            {questionnairesFiltres.map(q => (
              <option key={q.id} value={q.id}>
                {`${q.titre} (${categorieView === 'fonctionnelle' ? getFunctionalCategoryLabel(q.categorieFonctionnellePrincipale) : q.categorie})${q.passationPraticien ? ' — passation en consultation' : ''}`}
              </option>
            ))}
          </Select>
          {/* LOT-03 (D-030) — LE BLOC « PACKS SUGGÉRÉS » EST RETIRÉ D'ICI.
              Ses boutons se raccordaient au panneau Packs par TITRE NORMALISÉ
              parmi les packs ACTIFS : après le retrait des packs, ils
              citeraient des packs désactivés et le clic produirait un message
              rouge « n'existe pas encore » — faux après un retrait délibéré, et
              affiché dans un autre panneau une fois ce tiroir refermé. Le geste
              qu'il proposait (assigner un pack) est précisément celui que D-030
              remplace par la file d'envoi.

              LA SUTURE `suggestedPackSelection` RESTE EN PLACE, MORTE (état
              déclaré, type, passage à `PacksPanel`) : plus rien ne l'alimente,
              donc plus rien ne l'observe. La retirer voudrait dire toucher
              `PacksPanel` et sa prop, c'est-à-dire un refactor hors de ce lot ;
              elle est laissée inerte, à retirer d'un seul geste le jour où le
              raccordement par titre sera tranché. */}
          <Input type="date" value={assignationForm.dateLimite} onChange={e => setAssignationForm(p => ({ ...p, dateLimite: e.target.value }))} />
          <Input value={assignationForm.notes} onChange={e => setAssignationForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes praticien (optionnel)" maxLength={500} />
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={savingAssignation}>
              {savingAssignation ? 'Création...' : 'Créer l’assignation'}
            </Button>
            {assignationFeedback && (
              <span role="status" className={`text-sm ${assignationFeedback.ok ? 'text-status-success' : 'text-status-danger'}`}>
                {assignationFeedback.msg}
              </span>
            )}
          </div>
          </form>
        </PanneauSuperpose>

        {/* Retour des actions déclenchées depuis les lignes du tableau (lien
            renvoyé/copié/révoqué, consultation créée…) : loin du geste,
            `aria-live` le fait au moins annoncer. */}
        <span
          role="status"
          aria-live="polite"
          className={`text-sm ${consultationFeedback?.ok ? 'text-status-success' : 'text-status-danger'}`}
        >
          {consultationFeedback?.msg ?? ''}
        </span>
      </div>

      {/* Édition patient inline */}
      {editState && (
        <div className="bg-surface border border-accent rounded-xl p-4">
          <h3 className="font-display text-lg font-semibold text-foreground mb-3">
            Modifier patient <span className="font-normal text-muted-foreground">{editState.idPatient}</span>
          </h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Téléphone</label>
              <Input value={editState.telephone} onChange={e => setEditState(s => s ? { ...s, telephone: e.target.value } : s)} maxLength={30} placeholder="Téléphone" />
            </div>
            {/* L'état du dossier se change au menu de la ligne, derrière un
                dialogue — jamais ici : ce formulaire n'avait aucune
                confirmation et le geste est devenu irréversible (`D-126`). */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">État du dossier</label>
              <span className="text-sm text-foreground py-2">
                {editState.actif === 'OUI' ? 'Actif' : 'Inactif'}
                <span className="text-muted-foreground"> — se change au menu de la ligne</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onSaveEdit} disabled={savingEdit}>
                {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
              <Button variant="outline" onClick={() => setEditState(null)}>
                Annuler
              </Button>
            </div>
            {editFeedback && (
              <span className={`text-sm ${editFeedback.ok ? 'text-status-success' : 'text-status-danger'}`}>
                {editFeedback.msg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Barre recherche / tri */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (nom, prénom, email)" className="w-full sm:w-72" />
          <Select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}>
            <option value="nom">Tri : nom</option>
            <option value="email">Tri : email</option>
          </Select>
        </div>
        {/* Meta de panel façon maquette : compteur en mono. */}
        <div className="font-mono text-13 text-muted-foreground">
          {pagination ? `${pagination.total} patient(s)` : '—'}
        </div>
      </div>

      {/* Tableau patients */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-display text-lg font-semibold text-foreground">Patients</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-2xs uppercase tracking-[.07em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Nom</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Téléphone</th>
                <th className="px-4 py-2 text-left">Actif</th>
                <th className="px-4 py-2 text-left"></th>
                <th className="px-4 py-2 text-left"></th>
                <th className="px-4 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {!loadingTable && tablePatients.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-muted-foreground">Aucun patient.</td></tr>
              )}
              {tablePatients.map(p => (
                <PatientRow
                  key={p.idPatient}
                  patient={{ ...p, actif: p.actif === 'OUI' ? 'OUI' : 'NON' }}
                  onEdit={openEdit}
                  onAction={onActionDossier}
                  lienMagiqueActif={lienMagiqueActif}
                  actionAccesEnCours={tokenAction !== null}
                />
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border">
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Packs de questionnaires — cœur de la page « Questionnaires & packs »,
          après le tableau (LOT-05). La suture `suggestedPackSelection` avec le
          tiroir d'assignation est conservée telle quelle. */}
      <PacksPanel
        questionnaires={questionnaires}
        registry={registry}
        suggestedPackSelection={suggestedPackSelection}
        patients={(data?.patients ?? []).map(p => ({ email: p.email, prenom: p.prenom, nom: p.nom }))}
      />

      {/* Tableau assignations */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Assignations récentes
            <span className="ml-2 font-mono text-13 font-normal text-muted-foreground" data-testid="assignations-compte">
              ({assignationsTronquees ? `${filteredAssignations.length} sur ${meta?.total}` : filteredAssignations.length})
            </span>
          </h3>
          <select value={statutFilter} onChange={e => setStatutFilter(e.target.value as StatutFilter)} className="text-xs border border-border rounded-lg px-2 py-1 bg-surface text-muted-foreground">
            {(Object.keys(STATUT_LABELS) as StatutFilter[]).map(s => (
              <option key={s} value={s}>{STATUT_LABELS[s]}</option>
            ))}
          </select>
        </div>
        {erreurStatut && (
          <div className="px-4 py-2 border-b border-border bg-muted text-13 text-foreground" role="status" data-testid="assignations-erreur">
            {erreurStatut}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-2xs uppercase tracking-[.07em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Patient</th>
                <th className="px-4 py-2 text-left">Questionnaire</th>
                <th className="px-4 py-2 text-left">Statut</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignations.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                  {/* Sous filtre, « Aucune assignation. » se lirait comme une
                      affirmation sur l'ensemble du dossier : on nomme le filtre. */}
                  {statutFilter ? `Aucune assignation « ${statutFilter} ».` : 'Aucune assignation.'}
                </td></tr>
              )}
              {filteredAssignations.map(a => {
                // Annulable : prédicat PARTAGÉ avec la route (`estAnnulable`,
                // lib/praticien/annulabilite.ts) — c'est justement leur
                // divergence qui produisait ce lot. `estAnnulable` ne connaît
                // pas `Annulée` (l'idempotence côté route accepte un renvoi
                // sur une assignation déjà annulée, elle ne le refuse pas) ;
                // l'exclusion d'écran reste donc ICI, explicite : une ligne
                // déjà annulée n'a rien à proposer, sans que la route ait
                // besoin de le refuser en 409.
                //
                // `aPassation ?? false` : le seul cas où le champ manque est
                // un client neuf servi par une API ancienne (transitoire d'un
                // déploiement). `?? true` masquerait le bouton sur toutes les
                // lignes en attendant le redeploy ; `?? false` le laisse
                // proposé, et le 409 de la route tranche si besoin.
                const annulable =
                  a.statut !== 'Annulée' &&
                  estAnnulable({ statut: a.statut, statutReponses: a.statutReponses, aPassation: a.aPassation ?? false });
                return (
                <tr key={a.idAssignation} className="border-t border-border">
                  <td className="px-4 py-2">{a.dateAssignation ? new Date(a.dateAssignation).toLocaleDateString('fr-FR') : '—'}</td>
                  <td className="px-4 py-2">{a.emailPatient || a.idPatient || '—'}</td>
                  <td className="px-4 py-2">{a.titre || a.idQuestionnaire || '—'}</td>
                  <td className="px-4 py-2"><StatusBadge value={a.statut} /></td>
                  <td className="px-4 py-2">
                    {annulable ? (
                      <button
                        type="button"
                        onClick={() => {
                          setErreurAnnulation(null);
                          setAnnulationCible({
                            idAssignation: a.idAssignation,
                            titre: a.titre || a.idQuestionnaire || 'ce questionnaire',
                            emailPatient: a.emailPatient || '',
                            // Fait d'affichage seul (LOT-08) : n'entre dans
                            // aucune décision d'autorisation, `annulable` reste
                            // décidé par `estAnnulable` seul, juste au-dessus.
                            nbJourneesAgenda: a.nbJourneesAgenda ?? null,
                          });
                        }}
                        className="text-xs font-medium text-status-danger hover:underline"
                      >
                        Annuler
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AnnulationAssignationDialog
        titreQuestionnaire={annulationCible?.titre ?? ''}
        emailPatient={annulationCible?.emailPatient ?? ''}
        nbJourneesAgenda={annulationCible?.nbJourneesAgenda ?? null}
        open={annulationCible !== null}
        onOpenChange={ouvert => {
          if (!ouvert) {
            setAnnulationCible(null);
            setErreurAnnulation(null);
          }
        }}
        onConfirm={onConfirmerAnnulation}
        enCours={annulationEnCours}
        erreur={erreurAnnulation}
      />
    </div>
  );
}
