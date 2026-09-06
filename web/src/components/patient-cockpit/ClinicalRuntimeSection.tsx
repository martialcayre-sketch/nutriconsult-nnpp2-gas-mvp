'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CockpitRuntimeApiResponse } from '@/app/api/praticien/cockpit/route';
import type { ValidationErgoC1Fixture } from '@/lib/clinical-engine/validationErgoFixture';
import type { ProtocolDraft } from '@/lib/clinical-engine/types';
import { isDecisionBloquee } from '@/lib/clinical-engine/decisionGuards';
import type { ProtocolSaveState, RelectureProtocoleSoumission } from './ProtocolMiniBuilder';
import { EpisodeConfirmationPanel, type ContournementSaisi } from './EpisodeConfirmationPanel';
import { recoupementsContradictions } from './recoupementContradictions';
import { MissingDataPanel } from './MissingDataPanel';
import { DecisionSummaryCard } from './DecisionSummaryCard';
import {
  SelectionPrioritePanel,
  type EtatSelectionPriorite,
} from './SelectionPrioritePanel';
import { ProtocolMiniBuilder } from './ProtocolMiniBuilder';
import { ProtocolConsultationPanel } from './ProtocolConsultationPanel';
import { ProtocolVersionHistory, type ProtocolVersionItem } from './ProtocolVersionHistory';
import { ProtocolDiffusionPanel, type DiffusionState } from './ProtocolDiffusionPanel';
import { J21DecisionPanel } from './J21DecisionPanel';
import { MeteoAdhesionPanel } from './MeteoAdhesionPanel';
import type { ResumeJ21 } from '@/lib/protocol/resumeJ21';
import { deriverMeteoAdhesion } from '@/lib/protocol/adhesion';
import type { CheckinRow } from '@/lib/protocol/checkinDomain';
import type { Trajectoire } from '@/lib/protocol/trajectoire';
import { resoudreJalonDu, type JalonDu } from '@/lib/protocol/jalonDu';
import { estJalonMesure, type AncreCycle } from '@/lib/protocol/cycles';
import { Button } from '@/components/ui/Button';
import type { JalonMomentum } from '@/lib/equilibre/types';
import type { FoodCompassActionRef } from '@/lib/food-compass/types';
import { PractitionerFoodCompassObservatory } from './PractitionerFoodCompassObservatory';
import { useC5Enabled } from './C5FeatureProvider';
import { useCbEnabled, useCbResultsEnabled } from './CbFeatureProvider';
import {
  ArbitrageBiologiquePanel,
  type ArbitrageState,
} from './ArbitrageBiologiquePanel';
import type { VerdictArbitrage } from '@/lib/biology-library/arbitrage';
import { appliquerArbitrages } from '@/lib/biology-library/revision';
import {
  PropositionBilanPanel,
  type CourrierEtabli,
  type DocumentPatientEtabli,
  type DocumentPatientConsigneAffiche,
  type DocumenteAffiche,
  type LectureDocumentsPatient,
  type PropositionState,
} from './PropositionBilanPanel';
import {
  ajouterConfirmation,
  type ConfirmationsDocument,
} from '@/lib/biology-library/confirmationsDocument';
import type { LimiteProposition } from '@/lib/biology-library/propositionService';
import type { LignePanelProposition } from '@/lib/biology-library/statuts';
import type { ProtocolAction, TherapeuticLoad } from '@/lib/clinical-engine/types';

// Contenu de la version active servi par le GET versions (LOT-06) : la matière
// d'une révision après arbitrage biologique — jamais recalculée côté client.
type ContenuVersionActive = {
  purpose: string;
  followUpCriterion: string;
  therapeuticLoad: TherapeuticLoad;
  actions: ProtocolAction[];
};

type VersionsApiResponse = {
  ok: boolean;
  active: { versionId: string; contenu?: ContenuVersionActive | null } | null;
  history: ProtocolVersionItem[];
  error?: string;
};

type ArbitrageRow = {
  id: string;
  protocolDraftId: string;
  intentionId: string;
  verdict: string;
  noteCourte: string | null;
  arbitreLe: string;
};

type DiffusionApiResponse = {
  ok: boolean;
  approval: { protocolDraftInputHash: string; approvedAt: string } | null;
  stale: boolean;
};

type RuntimeError = 'session' | 'patient' | 'technical';

// Identité STABLE pour « aucun besoin » : l'état observable ci-dessous entre
// dans le tableau de dépendances d'un effet, et un `?? []` recréerait un
// tableau neuf à chaque rendu — l'effet tirerait en boucle.
const NEED_IDS_VIDE: number[] = [];

// Phases du cycle clinique 3.x (A6-R1). Le poste de pilotage n'affiche qu'une
// phase à la fois ; `'tout'` (défaut) conserve l'empilement historique et reste
// le comportement de référence hors cockpit.
export type PhaseCycleClinique =
  | 'tout'
  | 'aucune'
  | 'donnees'
  | 'comprehension'
  | 'decision'
  | 'actions'
  | 'suivi'
  | 'reevaluation';

// État observable du runtime, remonté au poste de pilotage pour que le rail
// des phases reflète l'état réel (et non un statut inventé). Lecture seule :
// aucun de ces champs ne modifie le comportement du runtime.
export type EtatRuntimeClinique = {
  chargement: boolean;
  erreur: RuntimeError | null;
  episodeConfirme: boolean;
  nombreVersions: number;
  suiviRenseigne: boolean;
  // Vrai si la lecture de la trajectoire a échoué : le statut de la phase
  // Réévaluation est alors INCONNU, jamais affirmé.
  trajectoireErreur: boolean;
  // Vrai tant que la lecture de la trajectoire n'a pas abouti (état initial ou
  // requête en vol) : le statut Réévaluation reste INCONNU, jamais « à ouvrir ».
  trajectoireEnLecture: boolean;
  /**
   * Besoins qui FONDENT la priorité visée (`provenance.needIds`), pour la
   * re-passation ciblée au jalon (LOT-07, `D-058`). La priorité visée est la
   * priorité SÉLECTIONNÉE par le praticien quand elle existe, à défaut la
   * priorité PROPOSÉE par la carte (`proposedMainPriorityId`) — aucun
   * producteur de sélection n'existe encore en production (revue LOT-07, B3),
   * et la re-passation reste une proposition, pas un envoi. Vide sans
   * priorité — on ne repropose jamais « le pack entier » à sa place.
   */
  needIdsPrioriteSelectionnee: number[];
  // Une réévaluation n'est « renseignée » que si un jalon POST-T0 (J21/J42/J90)
  // a réellement été mesuré dans au moins un cycle — pure lecture des booléens
  // `jalons[].mesure` déjà produits par lib/protocol/trajectoire (A8-2). Un T0
  // confirmé seul ouvre un cycle mais ne constitue PAS une réévaluation.
  reevaluationMesuree: boolean;
  // Vrai quand aucun protocole ne peut être proposé (abstention non levée ou
  // finding de sécurité). Remonté pour que la fiche puisse le signaler hors de
  // la phase Actions : le panneau qui le détaille y est masqué par défaut, et
  // un bloqueur invisible est un bloqueur ignoré.
  decisionBloquee: boolean;
};

/**
 * Trajectoire LUE PAR LA FICHE, avec son statut et son rappel de lecture.
 *
 * La fiche lit déjà la trajectoire à l'ouverture (le bandeau d'épisode en a
 * besoin) ; sans ces props, la section relisait la MÊME URL au montage — deux
 * GET pour une ouverture, donc deux accès journalisés (`G-TRUST-04`) là où le
 * praticien n'a ouvert le dossier qu'une fois.
 *
 * TOUT OU RIEN, ET C'EST LE TYPE QUI LE TIENT. Les trois props étaient
 * indépendamment facultatives, et le mode ne dépendait que du rappel : le
 * triplet `statutTrajectoirePartage="chargee"` + `trajectoirePartagee=undefined`
 * était donc DÉCLARÉ VALIDE, et rendait « Aucun cycle lisible dans la
 * trajectoire » — une absence clinique affirmée à partir d'une donnée jamais
 * fournie, ce que `DC-24` interdit (revue Codex du 2026-09-04, P1-3). L'union
 * ci-dessous rend ce triplet impossible à écrire.
 *
 * La branche vide reste entière : la section demeure montable SEULE, et se
 * comporte alors exactement comme avant.
 */
type PilotageTrajectoireProps =
  | {
      trajectoirePartagee: Trajectoire | null;
      statutTrajectoirePartage: 'inconnue' | 'chargement' | 'chargee' | 'erreur';
      onRechargerTrajectoire: () => void;
    }
  | {
      trajectoirePartagee?: never;
      statutTrajectoirePartage?: never;
      onRechargerTrajectoire?: never;
    };

type ClinicalRuntimeSectionProps = {
  idPatient: string;
  fixture: ValidationErgoC1Fixture | null;
  protocolDraft: ProtocolDraft | null;
  onFixtureReviewed: (submission: RelectureProtocoleSoumission) => void;
  phase?: PhaseCycleClinique;
  onAjusterProtocole?: () => void;
  /** Ouvre l'onglet Trajectoire de la fiche — le résumé de la phase
   *  Réévaluation y renvoie pour le détail complet (audit 2026-09-02). */
  onOuvrirTrajectoire?: () => void;
  onEtatChange?: (etat: EtatRuntimeClinique) => void;
  /**
   * Prévient le poste de pilotage qu'une assemblée de propositions vient
   * d'être demandée (Alliance 6.0-B, LOT-03). Le panneau objectif s'en sert
   * pour relire ; sans ce signal, il lirait la table AVANT que l'assemblage y
   * ait écrit, et n'afficherait rien jusqu'au rechargement suivant.
   */
  onPropositionsAssemblees?: () => void;
} & PilotageTrajectoireProps;

export function ClinicalRuntimeSection({
  idPatient,
  fixture,
  protocolDraft,
  onFixtureReviewed,
  phase = 'tout',
  onAjusterProtocole,
  onOuvrirTrajectoire,
  onEtatChange,
  onPropositionsAssemblees,
  trajectoirePartagee,
  statutTrajectoirePartage,
  onRechargerTrajectoire,
}: ClinicalRuntimeSectionProps) {
  const c5Enabled = useC5Enabled();
  const cbEnabled = useCbEnabled();
  const cbResultatsActifs = useCbResultsEnabled();
  // Sous-vues de la phase Actions (audit 2026-09-02, constat « jusqu'à 7
  // panneaux lourds dans le même puits de défilement »). Bascule par `hidden`
  // pour le protocole — ProtocolMiniBuilder et la Boussole doivent rester
  // MONTÉS (le brouillon et l'aliment sélectionné vivent dans leur état) ;
  // les autres sous-vues sont pilotées par leurs props, un montage
  // conditionnel ne leur perd rien.
  const [sousVueActions, setSousVueActions] = useState<
    'protocole' | 'historique' | 'diffusion' | 'biologie'
  >('protocole');
  // Vrai UNE FOIS une lecture des versions aboutie : avant, `versions === []`
  // est un état inconnu, jamais un vide affirmable (revue I1).
  const [versionsLues, setVersionsLues] = useState(false);
  // ENTRER dans la phase Actions ramène à la sous-vue Protocole (revue I4) :
  // les deux affordances qui promettent le protocole — « Ouvrir la phase
  // Actions » du bandeau bloqueur, « Ajuster » de J21 — font
  // `setPhaseActive('actions')` côté fiche ; sans cette remise à zéro, elles
  // atterrissaient sur la dernière sous-vue consultée, sans constructeur à
  // l'écran. La sous-vue reste stable TANT QU'ON EST dans la phase.
  useEffect(() => {
    if (phase === 'actions') setSousVueActions('protocole');
  }, [phase]);
  const [runtime, setRuntime] = useState<CockpitRuntimeApiResponse | null>(null);
  const [loading, setLoading] = useState(!fixture);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<RuntimeError | null>(null);
  // Message de refus des préconditions T0, distinct de `error` : il n'est pas
  // technique et se lit tel quel.
  const [refus, setRefus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Versionnement persistant (C2A LOT-03) — actif hors mode fixture uniquement.
  const [versions, setVersions] = useState<ProtocolVersionItem[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  // Arbitrage biologique (LOT-06) : contenu de la version active (matière de
  // la révision) + arbitrages consignés. Inertes tant que `cbEnabled` est faux.
  const [contenuActif, setContenuActif] = useState<ContenuVersionActive | null>(null);
  const [arbitrages, setArbitrages] = useState<ArbitrageRow[]>([]);
  const [arbitrageState, setArbitrageState] = useState<ArbitrageState>('idle');
  const [arbitrageError, setArbitrageError] = useState<string | null>(null);
  // Proposition de bilan (D-071). `propositionDisponible` reste faux tant que
  // la route n'a pas répondu `ok` : c'est LUI qui porte le drapeau
  // `WN_CB_PROPOSITION`, sans second FeatureProvider — un 503 laisse
  // simplement le panneau absent.
  const [propositionDisponible, setPropositionDisponible] = useState(false);
  const [propositionLignes, setPropositionLignes] = useState<LignePanelProposition[]>([]);
  const [propositionLimites, setPropositionLimites] = useState<LimiteProposition[]>([]);
  const [propositionDocumentes, setPropositionDocumentes] = useState<DocumenteAffiche[]>([]);
  const [propositionMotif, setPropositionMotif] = useState<string | null>(null);
  const [propositionState, setPropositionState] = useState<PropositionState>('idle');
  const [propositionError, setPropositionError] = useState<string | null>(null);
  const [courrier, setCourrier] = useState<CourrierEtabli | null>(null);
  const [courrierErreur, setCourrierErreur] = useState<string | null>(null);
  const [documentPatient, setDocumentPatient] = useState<DocumentPatientEtabli | null>(null);
  // UN SEUL état de refus (raison + message + empreinte du texte refusé) : trois
  // useState synchronisés à la main se désynchronisent à la première branche
  // oubliée. `registreATrancher` et l'empreinte à confirmer s'en dérivent.
  const [documentPatientRefus, setDocumentPatientRefus] = useState<{
    reason?: string;
    error: string;
    texteSha256?: string;
  } | null>(null);
  // Compteur de réponses ABOUTIES : le verrou du formulaire se lève sur son
  // incrément — une référence fraîche par réponse, là où un même message
  // d'erreur répété ne changerait pas.
  const [documentPatientReponses, setDocumentPatientReponses] = useState(0);
  // Ce qui a DÉJÀ été remis, relu en base : c'est ce qui survit au
  // rechargement, là où l'état de session ci-dessus repart à zéro.
  const [documentsPatientConsignes, setDocumentsPatientConsignes] = useState<
    DocumentPatientConsigneAffiche[]
  >([]);
  const [lectureDocumentsPatient, setLectureDocumentsPatient] =
    useState<LectureDocumentsPatient>('chargement');
  // Les confirmations s'ACCUMULENT, chacune liée à l'empreinte du texte
  // qu'elle vise. Un texte peut être refusé deux fois de suite pour deux
  // motifs (registre puis doublon) : n'envoyer que la dernière ferait
  // re-refuser la première, et le geste tournerait en rond. Une empreinte
  // rassie ne correspond plus au texte re-dérivé : le serveur re-refuse, ce
  // qui est exactement le comportement voulu.
  const [confirmationsDocument, setConfirmationsDocument] = useState<ConfirmationsDocument>({});
  const [partageMedecin, setPartageMedecin] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ProtocolSaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  // Sélection d'une priorité ([[D-127]]) : état PROPRE à ce geste, jamais celui
  // du protocole — un refus de sélection ne doit pas s'afficher sur le
  // constructeur, ni l'inverse.
  const [selectionState, setSelectionState] = useState<EtatSelectionPriorite>('idle');
  const [selectionError, setSelectionError] = useState<string | null>(null);
  // Validation « pour diffusion » (C2A LOT-03 Part B).
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvalStale, setApprovalStale] = useState(false);
  const [diffusionState, setDiffusionState] = useState<DiffusionState>('idle');
  const [diffusionError, setDiffusionError] = useState<string | null>(null);
  // Résumé J21 « point de jonction » (C2A LOT-04) — lecture seule.
  const [resumeJ21, setResumeJ21] = useState<ResumeJ21 | null>(null);
  // Points d'étape bruts : la route les renvoyait déjà, le cockpit les ignorait.
  // Ils alimentent la météo d'adhésion (SP-MET), dérivée à la lecture seule.
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [trajectoireLue, setTrajectoire] = useState<Trajectoire | null>(null);
  // « inconnue » tant qu'aucune lecture n'a abouti (aligné sur l'onglet
  // Trajectoire) : ni une requête EN VOL ni un échec ne doivent être présentés
  // comme « aucun épisode confirmé » — affirmation fausse sur l'historique.
  const [statutLu, setStatutTrajectoire] =
    useState<'inconnue' | 'chargement' | 'chargee' | 'erreur'>('inconnue');

  // PILOTÉ OU AUTONOME. Quand la fiche fournit son rappel, elle est PROPRIÉTAIRE
  // de la lecture : le runtime lit ce qu'elle lui passe et lui délègue les
  // rechargements — un seul GET par ouverture, donc un seul accès au journal
  // (`G-TRUST-04`). Sans ce rappel — bancs qui montent la section seule, et tout
  // appelant futur —, il garde son état et sa lecture, à l'identique.
  const pilote = onRechargerTrajectoire !== undefined;
  const trajectoire = pilote ? trajectoirePartagee ?? null : trajectoireLue;
  const statutTrajectoire = pilote ? statutTrajectoirePartage ?? 'inconnue' : statutLu;
  const [jalonDu, setJalonDu] = useState<JalonDu | null>(null);
  // Le jalon effectivement demandé au serveur : évite de redemander le même.
  const [jalonDemande, setJalonDemande] = useState<JalonMomentum>('T0');
  /**
   * OUVERTURE D'UN NOUVEAU CYCLE (`D-113` §8) — l'ancre que le praticien a
   * DÉLIBÉRÉMENT demandé d'ouvrir, ou `null`.
   *
   * Un état à part, et non un simple `setJalonDemande` : l'effet ci-dessous
   * resynchronise en permanence le jalon demandé sur le jalon DÛ du cycle
   * courant. Sans ce drapeau, la proposition d'ouverture serait écrasée au
   * rendu suivant par le J42 encore ouvert du cycle précédent — le geste
   * serait littéralement impossible à mener à son terme.
   */
  const [ouvertureCycle, setOuvertureCycle] = useState<AncreCycle | null>(null);
  const [foodCompassSelection, setFoodCompassSelection] = useState<{
    foodLabel: string;
    actionRef: FoodCompassActionRef;
  } | null>(null);

  const loadTrajectoire = useCallback(async () => {
    // Un échec de lecture ne bloque pas le cockpit, mais il est SIGNALÉ, et la
    // requête en vol est un état « chargement » explicite : ni l'un ni l'autre
    // ne doivent être présentés comme « aucun épisode confirmé » (affirmation
    // fausse sur l'historique clinique).
    setStatutTrajectoire('chargement');
    try {
      const response = await fetch(`/api/praticien/trajectoire?idPatient=${encodeURIComponent(idPatient)}`);
      const payload = (await response.json()) as { ok: boolean; trajectoire?: Trajectoire };
      if (!response.ok || !payload.ok) {
        setStatutTrajectoire('erreur');
        return;
      }
      setTrajectoire(payload.trajectoire ?? null);
      setStatutTrajectoire('chargee');
    } catch {
      setStatutTrajectoire('erreur');
    }
  }, [idPatient]);

  // LE RECHARGEMENT VA AU PROPRIÉTAIRE DE LA LECTURE : la fiche quand elle
  // pilote, la section sinon. Sans cette indirection, un rafraîchissement en
  // mode piloté écrirait dans un état local que plus personne ne lit — l'écran
  // resterait sur la trajectoire d'avant le geste.
  const rechargerTrajectoire = useCallback(() => {
    if (onRechargerTrajectoire) onRechargerTrajectoire();
    else void loadTrajectoire();
  }, [onRechargerTrajectoire, loadTrajectoire]);

  const loadCheckins = useCallback(async (decisionCardId: string) => {
    try {
      const response = await fetch(
        `/api/praticien/protocoles/checkins?idPatient=${encodeURIComponent(idPatient)}&decisionCardId=${encodeURIComponent(decisionCardId)}`,
      );
      const payload = (await response.json()) as { ok: boolean; resume?: ResumeJ21; checkins?: CheckinRow[] };
      if (!response.ok || !payload.ok) return;
      setResumeJ21(payload.resume ?? null);
      setCheckins(payload.checkins ?? []);
    } catch {
      // Le résumé est indicatif : un échec de lecture ne bloque pas le cockpit.
    }
  }, [idPatient]);

  const loadDiffusion = useCallback(async (decisionCardId: string) => {
    try {
      const response = await fetch(
        `/api/praticien/protocoles/diffusion?idPatient=${encodeURIComponent(idPatient)}&decisionCardId=${encodeURIComponent(decisionCardId)}`,
      );
      const payload = (await response.json()) as DiffusionApiResponse;
      if (!response.ok || !payload.ok) return;
      setApprovedAt(payload.approval?.approvedAt ?? null);
      setApprovalStale(payload.stale);
    } catch {
      // L'état de diffusion est indicatif : un échec de lecture ne bloque pas.
    }
  }, [idPatient]);

  const loadVersions = useCallback(async (decisionCardId: string) => {
    try {
      const response = await fetch(
        `/api/praticien/protocoles/versions?idPatient=${encodeURIComponent(idPatient)}&decisionCardId=${encodeURIComponent(decisionCardId)}`,
      );
      const payload = (await response.json()) as VersionsApiResponse;
      if (!response.ok || !payload.ok) return;
      setVersions(payload.history);
      // La lecture a ABOUTI : les états vides des sous-vues Historique et
      // Diffusion ont le droit d'affirmer « aucune version » (revue I1 — un
      // `[]` en vol ou après échec est un état INCONNU, pas un vide).
      setVersionsLues(true);
      setActiveVersionId(payload.active?.versionId ?? null);
      setContenuActif(payload.active?.contenu ?? null);
    } catch {
      // L'historique est indicatif : un échec de lecture ne bloque pas la saisie.
    }
  }, [idPatient]);

  // Arbitrages biologiques du patient — lus seulement drapeau CB posé ; la
  // route est de toute façon fail-closed sans lui.
  const loadArbitrages = useCallback(async () => {
    if (!cbEnabled) return;
    try {
      const response = await fetch(
        `/api/praticien/biologie/arbitrage?idPatient=${encodeURIComponent(idPatient)}`,
      );
      const payload = (await response.json()) as { ok: boolean; arbitrages?: ArbitrageRow[] };
      if (!response.ok || !payload.ok) return;
      setArbitrages(payload.arbitrages ?? []);
    } catch {
      // L'arbitrage est rechargeable : un échec de lecture ne bloque pas le cockpit.
    }
  }, [idPatient, cbEnabled]);

  // Relecture des pièces déjà remises. Elle ne re-dérive rien : ce sont les
  // lignes consignées, telles qu'elles sont parties au patient.
  //
  // ELLE SE CHAÎNE À LA PROPOSITION, jamais à l'effet global : ce GET
  // journalise un accès au dossier (GD-1), et le déclencher là où le panneau
  // n'est même pas rendu inscrirait au registre une lecture que personne n'a
  // demandée — le défaut exact que la revue Codex a relevé sur l'effet voisin.
  // Le chaînage suit donc le RENDU du panneau (les deux branches qui posent
  // `propositionDisponible`), pas l'offre du geste d'établir : la relecture
  // s'affiche même quand plus aucune ligne n'est proposée.
  const chargerDocumentsPatient = useCallback(async () => {
    if (!cbEnabled) return;
    setLectureDocumentsPatient('chargement');
    try {
      const response = await fetch(
        `/api/praticien/biologie/proposition/document-patient?idPatient=${encodeURIComponent(idPatient)}`,
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        documents?: DocumentPatientConsigneAffiche[];
      };
      if (!response.ok || !payload.ok) {
        // Un 503 (étage fermé) comme une panne : dans les deux cas l'écran ne
        // SAIT pas ce qui a été remis, et ne doit pas l'affirmer (`DC-24`).
        setLectureDocumentsPatient('erreur');
        return;
      }
      setDocumentsPatientConsignes(payload.documents ?? []);
      setLectureDocumentsPatient('ok');
    } catch {
      setLectureDocumentsPatient('erreur');
    }
  }, [idPatient, cbEnabled]);

  // Proposition de bilan biologique — le drapeau `WN_CB_PROPOSITION` est lu
  // côté serveur seulement : ici, une route qui refuse (503) laisse le
  // panneau absent, et rien ne le distingue d'un rayon fermé.
  const loadProposition = useCallback(async () => {
    if (!cbEnabled) return;
    try {
      const response = await fetch(
        `/api/praticien/biologie/proposition?idPatient=${encodeURIComponent(idPatient)}`,
      );
      const payload = (await response.json()) as {
        ok: boolean;
        reason?: string;
        error?: string;
        lignes?: LignePanelProposition[];
        limites?: LimiteProposition[];
        documentes?: DocumenteAffiche[];
        partageMedecinTraitant?: string | null;
      };
      // Le moteur qui s'abstient (409) N'EST PAS une indisponibilité : son
      // motif est écrit pour le praticien et doit s'afficher tel quel — une
      // abstention expliquée vaut mieux qu'un panneau vide (`DC-34`).
      if (response.status === 409 && payload.error) {
        setPropositionDisponible(true);
        setPropositionMotif(payload.error);
        setPropositionLignes([]);
        setPropositionLimites([]);
        // Les déclarations déjà consignées NE sont PAS effacées de l'écran :
        // l'abstention porte sur la dérivation, pas sur ce que le praticien a
        // déclaré. Les vider ferait disparaître un fait du dossier.
        //
        // Le panneau est rendu, donc la liste des remises l'est aussi : elle a
        // lieu d'être lue. Ce que le moteur ne sait plus dériver aujourd'hui
        // ne retire rien à ce qui a été remis hier.
        void chargerDocumentsPatient();
        return;
      }
      if (!response.ok || !payload.ok) {
        setPropositionDisponible(false);
        return;
      }
      setPropositionDisponible(true);
      setPropositionMotif(null);
      setPropositionLignes(payload.lignes ?? []);
      setPropositionLimites(payload.limites ?? []);
      setPropositionDocumentes(payload.documentes ?? []);
      setPartageMedecin(payload.partageMedecinTraitant ?? null);
      // La proposition vient de changer : le document patient affiché et le
      // refus en attente (empreinte comprise) visaient l'ANCIENNE dérivation.
      // Les garder montrerait une pièce rassie à imprimer, et armerait une
      // confirmation contre un texte disparu — le point unique où « la
      // proposition a changé » est su, c'est ici.
      setDocumentPatient(null);
      setDocumentPatientRefus(null);
      setConfirmationsDocument({});
      setDocumentPatientReponses(n => n + 1);
      // Le panneau est rendu : la liste des remises l'est aussi, donc elle a
      // lieu d'être lue. Le GET journalise — il ne part que là où ce qu'il
      // rapporte sera affiché.
      void chargerDocumentsPatient();
    } catch {
      // La proposition est rechargeable : un échec de lecture ne bloque pas le
      // cockpit.
      setPropositionDisponible(false);
    }
  }, [idPatient, cbEnabled, chargerDocumentsPatient]);

  const declarerPanelDocumente = useCallback(
    async (panelCode: string, documenteLe: string) => {
      setPropositionState('saving');
      setPropositionError(null);
      try {
        const response = await fetch('/api/praticien/biologie/proposition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idPatient, panelCode, documenteLe }),
        });
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          setPropositionState('error');
          setPropositionError(payload.error ?? 'Échec de l’enregistrement de la déclaration.');
          return;
        }
        // Relire plutôt que patcher l'état : la déclaration change les statuts
        // dérivés du panel, et c'est le moteur qui les décide, pas l'écran.
        await loadProposition();
        setPropositionState('saved');
      } catch {
        setPropositionState('error');
        setPropositionError('Échec de l’enregistrement de la déclaration.');
      }
    },
    [idPatient, loadProposition],
  );

  // Courrier médecin : le texte est GÉNÉRÉ ET CONSIGNÉ côté serveur ; l'écran
  // ne fournit que le nom du destinataire et n'affiche que ce qui revient.
  const etablirCourrier = useCallback(
    async (medecinLibelle: string) => {
      setPropositionState('saving');
      setCourrierErreur(null);
      try {
        const response = await fetch('/api/praticien/biologie/proposition/courrier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idPatient, medecinLibelle }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          texte?: string;
          ancrageSha256?: string;
          ancrageVersion?: string;
        };
        setPropositionState('idle');
        if (!response.ok || !payload.ok || !payload.texte) {
          setCourrier(null);
          setCourrierErreur(payload.error ?? 'Le courrier n’a pas pu être établi.');
          return;
        }
        setCourrier({
          texte: payload.texte,
          ancrageSha256: payload.ancrageSha256 ?? '',
          ancrageVersion: payload.ancrageVersion ?? '',
        });
      } catch {
        setPropositionState('idle');
        setCourrier(null);
        setCourrierErreur('Le courrier n’a pas pu être établi.');
      }
    },
    [idPatient],
  );

  // Document patient (décision F, D-122) : généré et consigné côté serveur.
  // Le refus REGISTRE_ANXIOGENE est CONFIRMABLE (D-090), et la confirmation
  // est LIÉE AU TEXTE refusé : le 409 rend l'empreinte du texte jugé, le
  // second clic la renvoie — un dossier qui a bougé entre-temps re-refuse au
  // lieu de consigner un texte que personne n'a lu. Aucun état de refus n'est
  // effacé au départ du POST : il ne change qu'à l'arrivée d'une réponse
  // (sinon le verrou du formulaire se lèverait en plein vol).
  const etablirDocumentPatient = useCallback(
    async (confirmer: boolean) => {
      setPropositionState('saving');
      // Confirmer, c'est AJOUTER un jeton à ceux déjà tranchés, pas remplacer :
      // le motif du refus courant dit lequel. La règle vit dans un module pur,
      // gardée par ses bancs — pas enfouie ici.
      const confirmations = confirmer
        ? ajouterConfirmation(confirmationsDocument, documentPatientRefus)
        : confirmationsDocument;
      if (confirmations !== confirmationsDocument) setConfirmationsDocument(confirmations);
      try {
        const response = await fetch('/api/praticien/biologie/proposition/document-patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idPatient,
            confirmerTexteSha256: confirmations.registre,
            confirmerDoublonSha256: confirmations.doublon,
          }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          reason?: string;
          error?: string;
          texteSha256?: string;
          texte?: string;
          ancrageSha256?: string;
          ancrageVersion?: string;
        };
        setPropositionState('idle');
        if (!response.ok || !payload.ok || !payload.texte) {
          setDocumentPatient(null);
          setDocumentPatientRefus({
            reason: payload.reason,
            error: payload.error ?? 'Le document n’a pas pu être établi.',
            texteSha256: payload.texteSha256,
          });
          return;
        }
        setDocumentPatientRefus(null);
        setDocumentPatient({
          texte: payload.texte,
          ancrageSha256: payload.ancrageSha256 ?? '',
          ancrageVersion: payload.ancrageVersion ?? '',
        });
        // La pièce vient d'entrer au dossier : la liste des remises la montre
        // sans attendre un rechargement de page.
        void chargerDocumentsPatient();
      } catch {
        // Panne réseau : le CONTEXTE du refus précédent est conservé (raison,
        // empreinte) — perdre le second temps sur une saute de connexion
        // forcerait un POST non confirmant de plus, donc un accès journalisé
        // de plus, pour retrouver un bouton qui n'aurait jamais dû partir.
        setPropositionState('idle');
        setDocumentPatient(null);
        setDocumentPatientRefus(prev => ({
          ...(prev ?? {}),
          error: 'Le document n’a pas pu être établi. Vérifiez la connexion et réessayez.',
        }));
      } finally {
        setDocumentPatientReponses(n => n + 1);
      }
    },
    [idPatient, documentPatientRefus, confirmationsDocument, chargerDocumentsPatient],
  );

  // Jeton d'obsolescence des propositions (revue LOT-07, M3) : le GET T0 de
  // plancher et le GET du jalon dû partent en parallèle, et le T0 est
  // structurellement le plus lent (lui seul calcule les préconditions). Sans
  // jeton, l'ordre d'arrivée pouvait afficher la proposition T0 alors que le
  // jalon retenu était J21 — et le POST partait avec le hash de l'autre.
  // Règle : seule la DERNIÈRE demande écrit l'état.
  const seqProposition = useRef(0);

  const loadProposal = useCallback(async (jalon: JalonMomentum, stale = false) => {
    if (fixture) return;
    const seq = ++seqProposition.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/praticien/cockpit?idPatient=${encodeURIComponent(idPatient)}&milestone=${encodeURIComponent(jalon)}`,
      );
      const payload = await response.json() as CockpitRuntimeApiResponse;
      if (seq !== seqProposition.current) return;
      if (!response.ok || payload.status === 'unavailable') {
        const reason = payload.status === 'unavailable' ? payload.reason : 'exception';
        setRuntime(null);
        setError(reason === 'unauthenticated' ? 'session' : reason === 'patient_not_found' ? 'patient' : 'technical');
        return;
      }
      setRuntime(payload);
      setNotice(stale ? 'Les réponses ont changé. La proposition a été rechargée et doit être confirmée à nouveau.' : null);
    } catch {
      if (seq !== seqProposition.current) return;
      setRuntime(null);
      setError('technical');
    } finally {
      if (seq === seqProposition.current) setLoading(false);
    }
  }, [fixture, idPatient]);

  // Le jalon n'est plus codé en dur ([[D-058]], LOT-07). Il se dérive de la
  // trajectoire, désormais lue dès le montage — et non plus seulement après
  // confirmation d'un épisode.
  //
  // LA PROPOSITION T0 PART TOUT DE SUITE, sans attendre la trajectoire. La
  // première rédaction attendait, et un banc l'a prise en défaut : une lecture
  // de trajectoire laissée EN VOL gelait le cockpit entier — plus de
  // proposition, plus de décision, pour une requête SECONDAIRE. Le plancher
  // reste donc le comportement d'avant ce lot ; la trajectoire ne fait que
  // l'améliorer quand elle répond.
  useEffect(() => {
    if (fixture) {
      setLoading(false);
      return;
    }
    setJalonDemande('T0');
    setOuvertureCycle(null);
    void loadProposal('T0');
    // La fiche a déjà lu la trajectoire à l'ouverture : redemander ici tirait
    // le MÊME GET une seconde fois, et journalisait un second accès au dossier.
    if (!pilote) void loadTrajectoire();
  }, [fixture, loadProposal, loadTrajectoire, pilote]);

  // Trajectoire arrivée : si le jalon dû n'est pas celui déjà demandé, on
  // recharge sur le bon. Sinon on ne touche à rien — pas de second appel pour
  // le même jalon. Une décision DÉJÀ AFFICHÉE (`ready`) n'est jamais écrasée
  // par un rechargement de proposition (revue LOT-07, Mo4) : la relecture de
  // trajectoire après confirmation ne remet pas le praticien devant un
  // panneau de confirmation.
  //
  // SAUF SI ELLE EST REJOUÉE (`D-118`) : une carte servie par le GET depuis un
  // épisode persisté n'est pas le geste que Mo4 protège. Le jalon dû peut
  // avoir avancé pendant que la page était fermée — épingler l'écran sur un
  // `T0` rejoué masquerait un `J21` devenu dû.
  const decisionAffichee = runtime?.status === 'ready' && !runtime.rejoue;
  useEffect(() => {
    if (fixture || statutTrajectoire !== 'chargee') return;
    const du = resoudreJalonDu(trajectoire, new Date());
    setJalonDu(du);
    if (decisionAffichee) return;
    // Une ouverture de cycle demandée par le praticien n'est jamais reprise par
    // la resynchronisation automatique : c'est un geste, pas un défaut.
    if (ouvertureCycle !== null) return;
    if (du.statut === 'du' && du.jalon !== jalonDemande) {
      setJalonDemande(du.jalon);
      void loadProposal(du.jalon);
    }
  }, [fixture, statutTrajectoire, trajectoire, jalonDemande, loadProposal, decisionAffichee, ouvertureCycle]);

  /**
   * Le geste d'ouverture. Il ne confirme RIEN : il demande la proposition
   * d'épisode de la nouvelle ancre, et c'est le panneau de confirmation
   * habituel — préconditions comprises (`D-052`, désormais appliquées à toute
   * ancre) — qui garde l'écriture.
   */
  const ouvrirNouveauCycle = (ancre: AncreCycle) => {
    setOuvertureCycle(ancre);
    setJalonDemande(ancre);
    void loadProposal(ancre);
  };

  const confirm = async (includedResponseIds: string[], contournements: ContournementSaisi[] = []) => {
    if (!runtime || runtime.status !== 'proposal_required') return;
    // Le jalon confirmé est celui que la proposition AFFICHÉE porte — lu sur
    // la proposition elle-même, jamais sur un état voisin : reposter « T0 »
    // en dur (ou un `jalonDemande` qui aurait bougé entre-temps) confirmerait
    // un épisode qui n'est pas celui sous les yeux du praticien.
    const jalon = runtime.proposal.milestone;
    setSubmitting(true);
    setError(null);
    setRefus(null);
    try {
      const response = await fetch('/api/praticien/cockpit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPatient,
          milestone: jalon,
          includedResponseIds,
          proposalHash: runtime.proposalHash,
          overrides: contournements,
        }),
      });
      const payload = await response.json() as CockpitRuntimeApiResponse;
      if (response.status === 409 && payload.status === 'unavailable' && payload.reason === 'proposal_stale') {
        await loadProposal(jalon, true);
        return;
      }
      if (!response.ok || payload.status !== 'ready') {
        const reason = payload.status === 'unavailable' ? payload.reason : 'exception';
        // Un refus de précondition porte un message FRANÇAIS et ACTIONNABLE
        // (ce qui manque au dossier) : le replier sur « erreur technique »
        // laisserait le praticien sans le geste à faire (D-052).
        //
        // `episode_ecrit_ailleurs` EN FAIT PARTIE (`D-129`) : une collision
        // d'écriture n'est pas « les réponses ont changé ». La replier sur
        // `proposal_stale` rechargeait la proposition en posant un notice
        // emprunté, donc faux, et jetait le message du serveur.
        if (payload.status === 'unavailable'
          && (reason === 'preconditions_non_remplies'
            || reason === 'motif_contournement_manquant'
            || reason === 'episode_ecrit_ailleurs')) {
          setRefus(payload.error);
          return;
        }
        setError(reason === 'unauthenticated' ? 'session' : reason === 'patient_not_found' ? 'patient' : 'technical');
        return;
      }
      setRuntime(payload);
      setNotice(null);
      // LA TRAJECTOIRE SUIT LE GESTE, PAS LA CARTE — même règle que
      // `assemblerPropositions` juste en dessous, et pour la même raison
      // (`D-118`) : le `GET /cockpit` sait REJOUER une carte depuis l'épisode
      // persisté, et un rejeu n'est pas une confirmation.
      //
      // Accroché à `readyDecisionCardId`, ce rechargement repartait à CHAQUE
      // ouverture d'un dossier déjà confirmé — le cas le plus courant. Deux
      // accès inscrits au registre `G-TRUST-04` pour une seule ouverture,
      // c'est-à-dire le défaut même que ce lot prétendait corriger (revue Codex
      // du 2026-09-04, P1-1). Ici, il ne part que quand un épisode vient
      // réellement d'être confirmé.
      rechargerTrajectoire();
      void assemblerPropositions(payload);
    } catch {
      setError('technical');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * DEMANDE L'ASSEMBLAGE DES PROPOSITIONS D'OBJECTIF (Alliance 6.0-B, LOT-03).
   *
   * POURQUOI ICI, ET NULLE PART AILLEURS. L'assemblage suit le GESTE, pas la
   * carte : depuis `D-118`, le `GET /cockpit` sait REJOUER une carte depuis
   * l'épisode persisté, mais un rejeu n'est pas une confirmation — assembler à
   * chaque relecture ferait d'un affichage un acte. La carte n'est toujours
   * persistée nulle part ; ses candidats n'existent, pour ce panneau, que dans
   * la réponse de la confirmation qu'on vient de recevoir. Le panneau objectif,
   * lui, est autonome et ne voit jamais le runtime clinique — il ne peut pas
   * aller la chercher, et lui faire confirmer un épisode pour l'obtenir lui
   * ferait poser un acte qui appartient au praticien.
   *
   * ELLE NE FAIT PAS ÉCHOUER LA CONFIRMATION. L'épisode est confirmé, la carte
   * est affichée : c'est le résultat que le praticien attendait. Une
   * proposition d'objectif absente est une surface en moins, jamais une raison
   * de retirer ce qui a réussi — et le drapeau est éteint par défaut, donc le
   * refus le plus fréquent sera un `503` parfaitement normal.
   *
   * `rank` ET `confidence` NE SONT PAS TRANSMIS, bien que la carte les porte :
   * ce qu'on n'envoie pas ne peut pas se persister, donc ne peut pas se trier.
   * L'ordre des candidats n'est couvert par aucune ligne signée ([[D-093]]).
   */
  const assemblerPropositions = async (payload: CockpitRuntimeApiResponse) => {
    if (payload.status !== 'ready') return;
    try {
      const reponse = await fetch('/api/praticien/propositions-objectif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assembler',
          idPatient,
          plainte: payload.plainteDominante
            ? {
                // L'identifiant de l'instrument vient de la RÉPONSE, pas d'un
                // import : ce composant est `'use client'`, et importer la
                // table signée pour une seule chaîne embarquerait ses 667
                // lignes — règles, seuils, motifs — dans le bundle du
                // navigateur. La garde de fraîcheur de la matrice de
                // consommation l'a signalé.
                instrument: payload.canalPlainte,
                domaine: payload.plainteDominante.domaine,
                // Le LIBELLÉ publié, jamais l'intensité déclarée : un nombre
                // déposé dans une proposition se trierait.
                restitution: payload.plainteDominante.bande,
              }
            : null,
          candidats: payload.decisionCard.priorityCandidates.map(candidat => ({
            regle: candidat.ruleId ?? candidat.candidateId,
            texte: candidat.label,
          })),
          shaPerimetre: payload.perimetreSigne,
        }),
      });
      // Le drapeau éteint rend 503 : c'est l'état nominal à la livraison, il ne
      // se signale pas au praticien.
      if (reponse.ok) onPropositionsAssemblees?.();
    } catch {
      // Silencieux DÉLIBÉRÉMENT : voir ci-dessus. Journaliser ici écrirait dans
      // la console du navigateur du praticien un bruit qu'il ne peut pas
      // traiter.
    }
  };

  // Charge l'historique des versions et l'état de diffusion dès que le runtime
  // réel est prêt.
  const readyDecisionCardId =
    !fixture && runtime?.status === 'ready' ? runtime.decisionCard.decisionCardId : null;
  useEffect(() => {
    if (readyDecisionCardId) {
      void loadVersions(readyDecisionCardId);
      void loadDiffusion(readyDecisionCardId);
      void loadCheckins(readyDecisionCardId);
      // AUCUN RECHARGEMENT DE TRAJECTOIRE ICI : il appartient au geste de
      // confirmation (voir `confirm`). Cet effet se déclenche aussi sur une
      // carte simplement REJOUÉE à l'ouverture, où la trajectoire vient d'être
      // lue par son propriétaire.
      //
      // Le retirer d'ici ferme un second défaut : l'effet ne dépend plus de
      // l'IDENTITÉ de `rechargerTrajectoire`. Un appelant qui passerait un
      // rappel en ligne (`onRechargerTrajectoire={() => charger()}`) le
      // recréait à chaque rendu du parent, et l'effet repartait en boucle sans
      // que `readyDecisionCardId` ait bougé — chaque tour inscrivant un accès
      // au registre (revue Codex du 2026-09-04, P1-4).
      void loadArbitrages();
      void loadProposition();
    }
  }, [readyDecisionCardId, loadVersions, loadDiffusion, loadCheckins, loadArbitrages, loadProposition]);

  useEffect(() => {
    setFoodCompassSelection(null);
  }, [readyDecisionCardId, activeVersionId]);

  // Remontée de l'état observable (rail des phases). Dépendances primitives
  // uniquement : aucune boucle de rendu. `reevaluationMesuree` ne fait que lire
  // les booléens `mesure` déjà calculés par lib/protocol/trajectoire — aucune
  // logique clinique nouvelle.
  // « Une ré-évaluation a-t-elle été MESURÉE ? » — donc un jalon de MESURE, et
  // jamais l'ancre, qui est le point de départ. Le test excluait le littéral
  // `T0` : sur un cycle ancré en `T1`, l'ouverture du cycle aurait compté comme
  // une ré-évaluation, et le rail des phases aurait avancé d'un cran tout seul.
  const reevaluationMesuree = (trajectoire?.cycles ?? []).some(cycle =>
    cycle.jalons.some(jalon => estJalonMesure(jalon.jalon) && jalon.mesure),
  );
  const suiviRenseigne = resumeJ21 !== null;
  const nombreVersions = versions.length;
  // Drapeaux dérivés (booléens value-stables : aucune boucle de rendu).
  const trajectoireErreur = statutTrajectoire === 'erreur';
  const trajectoireEnLecture = statutTrajectoire === 'inconnue' || statutTrajectoire === 'chargement';
  // Remonté ici (et non plus bas avec `review`) parce que le tableau de
  // dépendances de l'effet ci-dessous est évalué au rendu : une déclaration
  // postérieure tomberait dans la zone morte temporelle.
  // Jalon de l'épisode confirmé, pour la restitution. Repli sur « T0 » quand
  // le jalon n'a pas pu être résolu : c'est le seul épisode qu'un patient sans
  // trajectoire lisible puisse avoir confirmé.
  const jalonConfirme: JalonMomentum = jalonDemande;
  const decisionCard = fixture?.decisionCard ?? (runtime?.status === 'ready' ? runtime.decisionCard : null);
  const decisionBloquee = isDecisionBloquee(decisionCard);
  // Priorité visée : la sélection praticien quand elle existe, à défaut la
  // priorité proposée par la carte. Le seul producteur en production pose
  // `selectionPraticien: null` (cockpit/route.ts) : sans ce repli, la
  // re-passation ciblée était structurellement inatteignable (revue LOT-07,
  // B3). Le repli reste sous les mêmes verrous que la carte elle-même —
  // `proposedMainPriorityId` est nul tant que la table des priorités n'est
  // pas signée.
  const idCandidatVise = decisionCard
    ? decisionCard.selectedMainPriority?.candidateId ?? decisionCard.proposedMainPriorityId
    : null;
  const candidatVise = idCandidatVise
    ? decisionCard?.priorityCandidates.find(candidat => candidat.candidateId === idCandidatVise) ?? null
    : null;
  const needIdsPrioriteSelectionnee = candidatVise?.provenance.needIds ?? NEED_IDS_VIDE;
  // « Un épisode a-t-il été confirmé ? » ne dépend plus du seul écran
  // (`D-118`) : un cycle présent dans la trajectoire vient d'une ligne
  // d'`assessment_episodes`, donc d'une confirmation persistée — l'état
  // survit au rechargement de page même quand l'écran affiche la proposition
  // d'un AUTRE jalon (le `J21` dû d'un `T0` confirmé). Booléen value-stable.
  const episodeConfirmeEnBase = (trajectoire?.cycles.length ?? 0) > 0;
  useEffect(() => {
    onEtatChange?.({
      chargement: loading,
      erreur: error,
      episodeConfirme: readyDecisionCardId !== null || episodeConfirmeEnBase,
      nombreVersions,
      suiviRenseigne,
      trajectoireErreur,
      trajectoireEnLecture,
      reevaluationMesuree,
      decisionBloquee,
      needIdsPrioriteSelectionnee,
    });
  }, [
    onEtatChange,
    loading,
    error,
    readyDecisionCardId,
    episodeConfirmeEnBase,
    nombreVersions,
    suiviRenseigne,
    trajectoireErreur,
    trajectoireEnLecture,
    reevaluationMesuree,
    decisionBloquee,
    needIdsPrioriteSelectionnee,
  ]);

  // LE GESTE DE SÉLECTION D'UNE PRIORITÉ ([[D-127]]). L'écran transmet un
  // candidat et un motif ; auteur, horodatage et empreinte de carte sont posés
  // au serveur.
  //
  // IL RECHARGE PLUTÔT QU'IL NE FABRIQUE. La carte qui suit une sélection n'est
  // pas dérivable ici — son empreinte passe par `node:crypto`. Reconstruire un
  // état local ferait diverger l'écran de ce que le serveur servira au prochain
  // GET, et le POST de version suivant partirait sur une carte que
  // `refusChaineC1` rejetterait en 409.
  const retenirPriorite = async (candidateId: string, motif: string) => {
    if (fixture || !runtime || runtime.status !== 'ready') return;
    setSelectionState('saving');
    setSelectionError(null);
    try {
      const response = await fetch('/api/praticien/cockpit/priorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode: runtime.snapshot.assessmentEpisode,
          decisionCard: runtime.decisionCard,
          candidateId,
          rationale: motif,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setSelectionState('error');
        // Le message du serveur EST le message : il nomme le refus (motif
        // manquant, candidat inconnu, carte périmée, course concurrente). Le
        // remplacer par un texte d'écran perdrait la seule information utile.
        setSelectionError(payload.error ?? 'Échec de l’enregistrement de la priorité.');
        return;
      }
      setSelectionState('idle');
      await loadProposal(jalonConfirme);
    } catch {
      setSelectionState('error');
      setSelectionError('Erreur technique lors de l’enregistrement de la priorité.');
    }
  };

  // Enregistrement EXPLICITE d'une version relue (jamais silencieux, jamais
  // d'envoi patient). Anti-écrasement via baseVersionId → 409 version_stale.
  const saveVersion = async (submission: RelectureProtocoleSoumission) => {
    if (fixture || !runtime || runtime.status !== 'ready') return;
    const episode = runtime.snapshot.assessmentEpisode;
    const decisionCard = runtime.decisionCard;
    setSaveState('saving');
    setSaveError(null);
    try {
      const response = await fetch('/api/praticien/protocoles/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode, decisionCard, submission, baseVersionId: activeVersionId }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (response.status === 409) {
        setSaveState('stale');
        await loadVersions(decisionCard.decisionCardId);
        return;
      }
      if (!response.ok || !payload.ok) {
        setSaveState('error');
        setSaveError(payload.error ?? 'Échec de l’enregistrement.');
        return;
      }
      setSaveState('saved');
      // Une nouvelle version rend l'approbation précédente caduque : recharger.
      await loadVersions(decisionCard.decisionCardId);
      await loadDiffusion(decisionCard.decisionCardId);
    } catch {
      setSaveState('error');
      setSaveError('Erreur technique lors de l’enregistrement.');
    }
  };

  // Validation explicite « pour diffusion » de la version active relue. Jamais
  // d'envoi patient : l'approbation ne fait qu'attester le contenu.
  const approveForDiffusion = async () => {
    if (fixture || !readyDecisionCardId) return;
    const activeVersion = versions.find((version) => version.isActive);
    if (!activeVersion || activeVersion.status !== 'practitioner_reviewed') return;
    setDiffusionState('saving');
    setDiffusionError(null);
    try {
      const response = await fetch('/api/praticien/protocoles/diffusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPatient,
          decisionCardId: readyDecisionCardId,
          protocolDraftInputHash: activeVersion.inputHash,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setDiffusionState('error');
        setDiffusionError(payload.error ?? 'Échec de la validation.');
        return;
      }
      setDiffusionState('idle');
      await loadDiffusion(readyDecisionCardId);
    } catch {
      setDiffusionState('error');
      setDiffusionError('Erreur technique lors de la validation.');
    }
  };

  // Consigne un verdict d'arbitrage biologique (LOT-06). Auteur et horodatage
  // sont posés côté serveur ; l'écran ne transmet que verdict + note.
  const arbitrerBiologie = async (intentionId: string, verdict: VerdictArbitrage, note: string) => {
    if (fixture || !activeVersionId) return;
    setArbitrageState('saving');
    setArbitrageError(null);
    try {
      const response = await fetch('/api/praticien/biologie/arbitrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPatient,
          protocolDraftId: activeVersionId,
          intentionId,
          verdict,
          noteCourte: note.trim() === '' ? undefined : note,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setArbitrageState('error');
        setArbitrageError(payload.error ?? 'Échec de l’enregistrement de l’arbitrage.');
        // Un 409 (arbitrage existant, version dépassée) se résout en rechargeant.
        if (response.status === 409) {
          await loadArbitrages();
          if (readyDecisionCardId) await loadVersions(readyDecisionCardId);
        }
        return;
      }
      setArbitrageState('idle');
      await loadArbitrages();
    } catch {
      setArbitrageState('error');
      setArbitrageError('Erreur technique lors de l’enregistrement de l’arbitrage.');
    }
  };

  // Révision après arbitrage : les verdicts deviennent une NOUVELLE version
  // via le chemin de versionnement existant (préconditions, chaîne C1, garde
  // `resolution_sans_arbitrage` côté serveur). La re-validation pour diffusion
  // redevient obligatoire d'elle-même (approbation caduque).
  const reviserApresArbitrages = async () => {
    if (fixture || !contenuActif || !activeVersionId) return;
    const lies = arbitrages
      .filter(a => a.protocolDraftId === activeVersionId)
      .map(a => ({
        intentionId: a.intentionId,
        verdict: a.verdict as VerdictArbitrage,
        noteCourte: a.noteCourte,
        arbitreLe: a.arbitreLe,
      }));
    if (lies.length === 0) return;
    await saveVersion({
      purpose: contenuActif.purpose,
      followUpCriterion: contenuActif.followUpCriterion,
      actions: appliquerArbitrages(contenuActif.actions, lies),
      therapeuticLoad: contenuActif.therapeuticLoad,
    });
    await loadArbitrages();
  };

  const review = fixture?.review ?? (runtime?.status === 'ready' ? runtime.review : null);
  // Lus depuis la réponse serveur, jamais recalculés ici : l'objectif prioritaire
  // vit dans le snapshot (donc dans son empreinte), le statut d'abstention dans
  // la revue. Un écran qui les redériverait pourrait afficher autre chose que ce
  // qui a été haché.
  // Chaînage optionnel assumé : le contrat garantit `patientContext`, mais un
  // objectif ABSENT et un snapshot partiel doivent tous deux se lire « non
  // renseigné » plutôt que faire tomber l'écran entier du cockpit.
  const snapshotPriorityGoal = runtime?.status === 'ready'
    ? runtime.snapshot?.patientContext?.priorityGoal ?? null
    : null;
  const abstentionStatut = review?.abstention?.status ?? null;
  const activeReviewedVersion = versions.find(
    (version) => version.isActive && version.status === 'practitioner_reviewed',
  );

  // Filtre d'affichage par phase — purement présentationnel : les chargements,
  // les états et les actions restent strictement identiques quelle que soit la
  // phase affichée (aucun contrat d'API ni règle clinique n'est touché).
  const affiche = (phaseInstrument: Exclude<PhaseCycleClinique, 'tout' | 'aucune'>) =>
    phase === 'tout' || phase === phaseInstrument;

  return (
    <>
      {/* Chargement, avis de rechargement et erreurs : JAMAIS filtrés par
          phase — une session expirée doit être lisible même si le praticien
          se trouve sur la phase Actions (sinon il saisit un protocole dans un
          formulaire qui ne pourra pas s'enregistrer). */}
      {!fixture && loading && (
        <div role="status" className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          Chargement de la proposition d&apos;épisode
          {jalonDu?.statut === 'du' ? ` ${jalonDu.jalon}` : ''}…
        </div>
      )}
      {!fixture && notice && (
        <div role="status" className="rounded-xl border border-accent bg-status-warning/10 p-4 text-base text-status-warning">{notice}</div>
      )}
      {!fixture && error && (
        <div role="alert" className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
          {error === 'session'
            ? 'Votre session a expiré. Déconnectez-vous puis reconnectez-vous.'
            : error === 'patient'
              ? 'Patient introuvable.'
              : 'Erreur technique lors de la préparation du cockpit clinique.'}
        </div>
      )}
      {!fixture && refus && (
        <div role="alert" className="rounded-xl border border-accent bg-status-warning/10 p-4 text-base text-status-warning">{refus}</div>
      )}
      {/* Aucun jalon confirmable : le motif se dit. Un cockpit qui n'affiche
          simplement rien se lit comme une panne, et le praticien cherche un
          bouton qui n'existe pas ([[D-058]]). */}
      {affiche('decision') && !fixture && !loading && !error && jalonDu?.statut === 'aucun'
        && ouvertureCycle === null && (
        <div role="status" className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
          {jalonDu.motif}
        </div>
      )}
      {/* OUVRIR UN NOUVEAU CYCLE ([[D-113]] §8) — un geste du praticien, jamais
          une proposition automatique. Il reste offert MÊME quand un jalon est
          encore dû : c'est le cas clinique qui a motivé la décision (un nouveau
          départ décidé alors que le J90 du cycle précédent était encore
          ouvert). Ce qu'il coûte est ÉCRIT au-dessus du bouton — la fermeture
          des fenêtres restantes était jusqu'ici un effet de bord silencieux. */}
      {affiche('decision') && !fixture && !loading && !error && !decisionAffichee
        && jalonDu?.ancreOuvrable && ouvertureCycle === null && (
        <div className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
          <p>
            Un nouveau cycle peut être ouvert : il portera l’ancre{' '}
            <strong className="text-foreground">{jalonDu.ancreOuvrable}</strong>.
          </p>
          <p className="mt-2 text-sm">
            L’ouvrir ferme les fenêtres de jalon encore ouvertes du cycle en cours. Rien n’est effacé ni recalculé :
            ce qui a déjà été confirmé reste lisible.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => ouvrirNouveauCycle(jalonDu.ancreOuvrable!)}
          >
            Ouvrir un nouveau cycle ({jalonDu.ancreOuvrable})
          </Button>
        </div>
      )}
      {affiche('decision') && !fixture && !loading && !error && ouvertureCycle !== null
        && !decisionAffichee && (
        <div role="status" className="rounded-xl border border-accent bg-status-warning/10 p-4 text-base text-status-warning">
          <p>
            Ouverture du cycle <strong>{ouvertureCycle}</strong> : confirmez l’épisode ci-dessous pour la rendre
            effective. Tant qu’elle n’est pas confirmée, rien n’a changé pour ce patient.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => {
              setOuvertureCycle(null);
              rechargerTrajectoire();
            }}
          >
            Annuler l’ouverture
          </Button>
        </div>
      )}
      {/* HORS FENÊTRE, RIEN N'EST PROPOSÉ — le panneau aussi, pas seulement le
          message (revue LOT-07, M1) : tant que le motif « aucun jalon
          confirmable » est affiché, aucun bouton de confirmation n'existe.
          `jalonDu` null (trajectoire illisible ou en vol) conserve le plancher
          T0 historique. Une ouverture de cycle DEMANDÉE rouvre le panneau : le
          motif portait sur les jalons du cycle courant, pas sur le suivant. */}
      {affiche('decision') && !fixture && !loading && !error && runtime?.status === 'proposal_required'
        && (jalonDu?.statut !== 'aucun' || ouvertureCycle !== null) && (
        <EpisodeConfirmationPanel
          proposal={runtime.proposal}
          preconditions={runtime.preconditions}
          submitting={submitting}
          onConfirm={confirm}
          jalon={runtime.proposal.milestone}
        />
      )}
      {/* CANAL PLAINTE — en tête de la phase Décision, AVANT tout agrégat
          ([[D-054]]). Ce que le patient déclare le plus intensément et
          l'objectif qu'il se donne traversaient toute la chaîne sans être
          affichés nulle part : un score global peut être honorable là où une
          plainte est à 9/10, et l'agrégat ne doit jamais recouvrir la plainte. */}
      {affiche('decision') && !fixture && runtime?.status === 'ready'
        && (runtime.plainteDominante !== null || snapshotPriorityGoal !== null) && (
        <section
          aria-label="Plainte et objectif du patient"
          className="rounded-xl border border-border bg-surface p-4 text-base"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ce que le patient met en avant
          </h3>
          <dl className="mt-3 flex flex-col gap-3">
            <div>
              <dt className="text-sm text-muted-foreground">Plainte la plus intense</dt>
              <dd className="text-base text-foreground">
                {runtime.plainteDominante
                  ? `${runtime.plainteDominante.libelle} — ${runtime.plainteDominante.valeur}/10${
                      runtime.plainteDominante.bande ? ` (${runtime.plainteDominante.bande})` : ''
                    }`
                  : 'Non renseignée — le questionnaire de plaintes actuelles ne rend aucune mesure sur cet épisode.'}
              </dd>
            </div>
            <div>
              {/* « figé à la confirmation » : le même libellé s'affiche en
                  phase Compréhension avec une LECTURE VIVANTE de l'anamnèse ;
                  ici la valeur vient du snapshot de l'épisode et peut avoir
                  changé depuis — sans ce qualificatif, rien ne distinguait
                  les deux sources (audit 2026-09-02, divergence silencieuse). */}
              <dt className="text-sm text-muted-foreground">
                Objectif prioritaire déclaré (figé à la confirmation de l’épisode)
              </dt>
              <dd className="text-base text-foreground">
                {snapshotPriorityGoal ?? 'Non renseigné à l’anamnèse.'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            Déclarations du patient sur une échelle descriptive : ni un diagnostic, ni une mesure d’instrument
            spécifique.
          </p>
        </section>
      )}
      {/* ÉTAT RÉEL DE LA DÉCISION, et non plus une phrase figée. Le bandeau
          annonçait « l'abstention clinique n'est pas encore évaluée » quel que
          soit l'état réel : il devient faux dès que la table des priorités est
          signée et que l'abstention est évaluée ([[D-054]]). */}
      {affiche('decision') && !fixture && runtime?.status === 'ready' && (
        <div role="status" className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
          {/* Le jalon nommé est celui qui vient d'être confirmé, jamais « T0 »
              par défaut : depuis le LOT-07 un J21 se confirme ici aussi, et
              annoncer « Épisode T0 confirmé » après un J21 serait faux. */}
          {abstentionStatut === 'not_required'
            ? `Épisode ${jalonConfirme} confirmé. Abstention clinique évaluée : aucune abstention requise.`
            : abstentionStatut === 'required'
              ? `Épisode ${jalonConfirme} confirmé. Décision suspendue : l’abstention clinique est requise.`
              : `Épisode ${jalonConfirme} confirmé. Décision suspendue : l’abstention clinique n’est pas encore évaluée.`}
        </div>
      )}

      {affiche('donnees') && (
        <MissingDataPanel
          missingData={review?.missingData ?? null}
          discordances={review?.discordances ?? null}
          // Constats déterministes ([[D-050]]) : ils ne viennent PAS de
          // `review`, qui est la revue clinique LLM. Le double verrou est
          // appliqué côté serveur — cette liste est vide tant que la table de
          // règles n'est pas signée, et le composant n'a aucune condition à
          // porter.
          contradictions={runtime?.status === 'ready' ? runtime.contradictions : []}
        />
      )}
      {affiche('decision') && <DecisionSummaryCard decisionCard={decisionCard} />}
      {/* LE GESTE, JUSTE SOUS LA CARTE QUI LE MOTIVE ([[D-127]]). Il se place
          entre « Priorité et limites » — qui montre ce que le moteur a classé —
          et le constructeur de protocole, qui refusait jusqu'ici sans dire où
          aller. En mode fixture, aucun geste : la fiche de démonstration
          n'écrit pas dans un dossier. */}
      {affiche('decision') && !fixture && (
        <SelectionPrioritePanel
          decisionCard={decisionCard}
          // Le constat vient du SERVEUR ([[D-127]] §11) : la carte servie est
          // celle construite sans la sélection écartée, indiscernable ici de
          // celle d'un dossier où personne n'a jamais choisi.
          selectionEcartee={runtime?.status === 'ready' && runtime.selectionEcartee === true}
          etat={selectionState}
          erreur={selectionError}
          onRetenir={(candidateId, motif) => { void retenirPriorite(candidateId, motif); }}
        />
      )}
      {/* RECOUPEMENT FACTUEL contradiction ↔ décision (`D-119`) : quand une
          contradiction ouverte confronte un instrument qui fonde aussi un
          candidat (ou le canal de plainte), le dire À CÔTÉ de la carte — le
          praticien choisissait sans voir que la matière de son choix était
          contestée. Intersection d'identifiants, aucune recommandation
          (`DC-30`) ; le détail complet reste en « Données fiables ». */}
      {affiche('decision') && !fixture && runtime?.status === 'ready'
        // GARDE DE FORME, PAS DE CONFIANCE : un payload sans ces tableaux
        // (fixture partielle, version antérieure en cache) ne doit pas faire
        // tomber la section — un bloc INFORMATIF s'éteint, il n'éteint pas le
        // chemin principal (même doctrine que les claims best-effort).
        && Array.isArray(runtime.contradictions) && Array.isArray(runtime.snapshot?.sourceRefs) && (() => {
        const recoupements = recoupementsContradictions({
          contradictions: runtime.contradictions,
          snapshot: runtime.snapshot,
          decisionCard: runtime.decisionCard,
          canalPlainte: runtime.canalPlainte,
        });
        if (recoupements.length === 0) return null;
        return (
          // COMPACT PRÈS DE LA CARTE, DÉTAIL EN REPLI (audit 2026-09-02) :
          // `D-119` exige la proximité et le contenu — pas un encart déplié en
          // permanence. Le repli est natif (`<details>`) : chaque phrase
          // arbitrée reste dans le DOM, les bancs sur le textContent passent
          // tels quels.
          <section
            aria-label="Contradictions touchant cette décision"
            className="rounded-xl border border-accent bg-status-warning/10 p-4 text-sm"
          >
            <details>
              <summary className="cursor-pointer font-semibold text-foreground">
                Contradictions touchant cette décision ({recoupements.length})
              </summary>
              <ul className="mt-2 grid gap-2">
                {recoupements.map(recoupement => (
                  <li key={recoupement.id} className="border-l-2 border-accent pl-2 text-foreground">
                    <span className="block break-words">{recoupement.description}</span>
                    <span className="block text-muted-foreground">
                      Confronte une passation qui fonde aussi
                      {recoupement.candidats.length > 0 && ` : ${recoupement.candidats.join(', ')}`}
                      {recoupement.candidats.length > 0 && recoupement.canalPlainte && ' ·'}
                      {recoupement.canalPlainte && ' le canal de plainte'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">
                La machine ne tranche pas : elle montre l’intersection. Le détail se lit dans « Données fiables ».
              </p>
            </details>
          </section>
        );
      })()}
      {/* ── Phase Actions : SOUS-VUES (audit 2026-09-02) ─────────────────────
          Jusqu'à sept panneaux lourds s'empilaient dans le même défilement.
          Quatre sous-vues les regroupent : Protocole (construction +
          consultation), Historique, Diffusion, Biologie. Le sélecteur
          n'apparaît qu'en phase Actions hors fixture (la fixture ne monte que
          le protocole, comme avant). */}
      {affiche('actions') && !fixture && readyDecisionCardId && (
        <div role="group" aria-label="Sections de la phase Actions" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {([
            ['protocole', 'Protocole'],
            ['historique', 'Historique'],
            ['diffusion', 'Diffusion'],
            ['biologie', 'Biologie'],
          ] as const).map(([id, libelle]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sousVueActions === id}
              onClick={() => setSousVueActions(id)}
              className={`min-h-11 rounded-md px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                sousVueActions === id
                  ? 'bg-accent/15 font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      )}
      {/* Boussole alimentaire : montée dès que les gardes métier sont
          satisfaites, puis seulement MASQUÉE hors phase Actions / hors
          sous-vue Protocole — la démonter rejouerait son chargement et
          réinitialiserait l'aliment sélectionné. */}
      {c5Enabled && !fixture && readyDecisionCardId && (
        <div hidden={!affiche('actions') || sousVueActions !== 'protocole'}>
          <PractitionerFoodCompassObservatory
            idPatient={idPatient}
            decisionCardId={readyDecisionCardId}
            onInsert={setFoodCompassSelection}
          />
        </div>
      )}
      <div id="protocol-version-builder" hidden={!affiche('actions') || (!fixture && sousVueActions !== 'protocole')}>
        <ProtocolMiniBuilder
          decisionCard={decisionCard}
          onReviewed={fixture ? onFixtureReviewed : undefined}
          onSaveVersion={fixture ? undefined : saveVersion}
          saveState={saveState}
          saveError={saveError}
          foodCompassSelection={foodCompassSelection}
          onClearFoodCompassSelection={() => setFoodCompassSelection(null)}
        />
      </div>
      {affiche('actions') && (fixture || sousVueActions === 'protocole') && (
        <ProtocolConsultationPanel decisionCard={decisionCard} protocolDraft={fixture ? protocolDraft : null} />
      )}
      {/* Historique et Diffusion : panneaux SANS état local (vérifié en
          revue) — le montage conditionnel ne leur perd rien. Les états vides
          ne s'affirment qu'une fois la lecture ABOUTIE (`versionsLues`) :
          « aucune version » pendant un fetch en vol ou après un échec serait
          une affirmation sur un état inconnu (même doctrine que la
          trajectoire, vingt lignes plus bas). */}
      {affiche('actions') && !fixture && sousVueActions === 'historique' && (
        versions.length > 0 ? (
          <ProtocolVersionHistory versions={versions} />
        ) : versionsLues ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
            Aucune version de protocole enregistrée pour ce dossier.
          </p>
        ) : (
          <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
            Lecture des versions en cours ou indisponible — rien n’est affirmé sur l’historique.
          </p>
        )
      )}
      {affiche('actions') && !fixture && sousVueActions === 'diffusion' && (
        versions.length > 0 ? (
          <ProtocolDiffusionPanel
            canApprove={Boolean(activeReviewedVersion)}
            approved={approvedAt !== null}
            stale={approvalStale}
            approvedAt={approvedAt}
            state={diffusionState}
            error={diffusionError}
            onApprove={approveForDiffusion}
          />
        ) : versionsLues ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
            Aucune version de protocole enregistrée : rien à diffuser pour l’instant.
          </p>
        ) : (
          <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
            Lecture des versions en cours ou indisponible — rien n’est affirmé sur la diffusion.
          </p>
        )
      )}
      {/* Biologie : les DEUX panneaux portent des saisies cliniques locales
          (verdict + note d'arbitrage, destinataire du courrier) — revue
          wn-reviewer B2 : un montage conditionnel par sous-vue les perdait à
          chaque bascule, et réarmait le verrou « déjà consigné » du courrier.
          Le bloc reste donc MONTÉ tant que la phase Actions l'est (mêmes
          conditions de données qu'avant le lot), la sous-vue ne fait que
          masquer. Aucun GET n'est déclenché par ces panneaux au montage : le
          `hidden` ne coûte rien au journal G-TRUST-04. */}
      {affiche('actions') && !fixture && (
        <div hidden={sousVueActions !== 'biologie'}>
          {propositionDisponible && (
            <PropositionBilanPanel
              lignes={propositionLignes}
              limites={propositionLimites}
              documentes={propositionDocumentes}
              motifIndisponible={propositionMotif}
              state={propositionState}
              error={propositionError}
              onDeclarer={declarerPanelDocumente}
              onNouvelleSaisie={() => setPropositionState('idle')}
              courrier={courrier}
              courrierErreur={courrierErreur}
              partageMedecinTraitant={partageMedecin}
              onEtablirCourrier={etablirCourrier}
              documentPatient={documentPatient}
              documentPatientErreur={documentPatientRefus?.error ?? null}
              documentPatientRegistreATrancher={
                documentPatientRefus?.reason === 'REGISTRE_ANXIOGENE'
                && documentPatientRefus.texteSha256 !== undefined
              }
              documentPatientDoublonATrancher={
                documentPatientRefus?.reason === 'DOUBLON_DOCUMENT'
                && documentPatientRefus.texteSha256 !== undefined
              }
              documentsPatientConsignes={documentsPatientConsignes}
              lectureDocumentsPatient={lectureDocumentsPatient}
              documentPatientReponses={documentPatientReponses}
              onEtablirDocumentPatient={etablirDocumentPatient}
              onRelireDocumentsPatient={chargerDocumentsPatient}
              resultatsActifs={cbResultatsActifs}
            />
          )}
          {cbEnabled && contenuActif && activeVersionId && (
            <ArbitrageBiologiquePanel
              resultatsActifs={cbResultatsActifs}
              intentions={contenuActif.actions
                .filter(action => action.interventionStatus === 'conditionnelle_biologie')
                .map(action => ({
                  actionId: action.actionId,
                  title: action.title,
                  cible: action.waitFor?.cible ?? null,
                }))}
              arbitrages={arbitrages
                .filter(a => a.protocolDraftId === activeVersionId)
                .map(a => ({
                  intentionId: a.intentionId,
                  verdict: a.verdict,
                  noteCourte: a.noteCourte,
                  arbitreLe: a.arbitreLe,
                }))}
              state={saveState === 'saving' ? 'saving' : arbitrageState}
              error={arbitrageError}
              revisionPossible={arbitrages.some(
                a => a.protocolDraftId === activeVersionId
                  && (a.verdict === 'confirme' || a.verdict === 'infirme'),
              )}
              onArbitrer={arbitrerBiologie}
              onReviser={reviserApresArbitrages}
            />
          )}
          {!cbEnabled && (
            <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
              Aucun outil de biologie ouvert sur ce dossier pour l’instant.
            </p>
          )}
          {/* L'état nominal de production à la livraison : CB actif mais
              proposition fermée (503) et aucune version active — sans cette
              branche, la sous-vue rendait un écran nu (revue I2). */}
          {cbEnabled && !propositionDisponible && !(contenuActif && activeVersionId) && (
            <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
              Rien à afficher ici pour l’instant : la proposition de bilan n’est pas ouverte sur ce
              dossier, et aucune version active de protocole ne porte d’arbitrage biologique.
            </p>
          )}
        </div>
      )}
      {affiche('suivi') && !fixture && readyDecisionCardId && (
        <MeteoAdhesionPanel meteo={deriverMeteoAdhesion(checkins)} />
      )}
      {affiche('suivi') && !fixture && readyDecisionCardId && (
        <J21DecisionPanel
          resume={resumeJ21}
          onAjuster={
            onAjusterProtocole ??
            (() => document.getElementById('protocol-version-builder')?.scrollIntoView({ behavior: 'smooth' }))
          }
        />
      )}
      {affiche('reevaluation') && !fixture && readyDecisionCardId && (
        trajectoireErreur ? (
          // Échec de lecture ≠ absence d'épisode : ne jamais laisser
          // TrajectoirePanel afficher « Aucun épisode confirmé » sur une erreur.
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-accent bg-status-warning/10 p-4 text-base text-status-warning">
            <span>
              La trajectoire n&apos;a pas pu être lue. L&apos;historique clinique de ce patient n&apos;est pas
              affiché — aucune conclusion à en tirer.
            </span>
            <button
              type="button"
              onClick={() => rechargerTrajectoire()}
              className="min-h-9 self-start rounded-lg border border-accent px-3 py-1 text-xs font-medium text-solar-ink hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Réessayer
            </button>
          </div>
        ) : trajectoireEnLecture ? (
          // Lecture en cours ≠ absence d'épisode : afficher un état « chargement »
          // explicite, jamais « Aucun épisode confirmé » tant que rien n'est établi.
          <div role="status" className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            Chargement de la trajectoire&hellip;
          </div>
        ) : (
          // RÉSUMÉ, PLUS LE PANNEAU ENTIER (audit 2026-09-02) : TrajectoirePanel
          // (620 lignes — cycles, spirale, comparateur) était monté une DEUXIÈME
          // fois ici, en plus de l'onglet Trajectoire. La phase Réévaluation dit
          // l'essentiel — dernier cycle, jalons mesurés ou non — et renvoie vers
          // l'onglet pour le détail.
          //
          // CE QUE LE RÉSUMÉ NE FAIT PAS (revue wn-reviewer du 2026-09-03) :
          // - il ne restitue PAS le momentum de l'indice global — toute surface
          //   qui le restitue doit porter la mention de nature et se déclarer
          //   au garde (`D-106`/`DC-22`, `natureIndiceGlobal.guard.test.ts`) ;
          //   l'onglet Trajectoire le fait déjà, sous garde — pas de seconde
          //   surface non déclarée ;
          // - il ne tranche PAS l'ordre des cycles : la discordance rang↔dates
          //   est rendue, mot pour mot comme dans TrajectoirePanel (`DC-30` —
          //   le doute se dit, il ne se tranche pas) ;
          // - un jalon non mesuré se dit « non mesuré », jamais zéro (DC-24),
          //   et « mesuré » reste neutre — aucune couleur de valence.
          (() => {
            const cycles = trajectoire?.cycles ?? [];
            const dernierCycle = cycles.length > 0 ? cycles[cycles.length - 1] : null;
            const formatDateFr = (iso: string) =>
              new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return (
              <section
                aria-label="Réévaluation — résumé du cycle"
                className="rounded-xl border border-border bg-surface p-4 text-sm"
              >
                <h3 className="font-semibold text-foreground">Réévaluation — où en est le cycle</h3>
                {trajectoire?.discordanceOrdreCycles && (
                  <p
                    role="status"
                    className="mt-2 rounded-lg border border-status-warning/40 bg-status-warning/10 p-2 text-xs text-foreground"
                  >
                    Ordre des cycles à vérifier : un cycle de rang supérieur a été confirmé avant un
                    cycle de rang inférieur. Les cycles restent affichés dans l’ordre de leur ancre
                    (T0, T1, …) ; les dates de confirmation, elles, ne suivent pas cet ordre.
                  </p>
                )}
                {!dernierCycle ? (
                  <p className="mt-2 text-muted-foreground">Aucun cycle lisible dans la trajectoire.</p>
                ) : (
                  <>
                    <p className="mt-2 text-muted-foreground">
                      Cycle {dernierCycle.ancre}
                      {dernierCycle.dateAncre ? ` · ancré le ${formatDateFr(dernierCycle.dateAncre)}` : ''}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {dernierCycle.jalons.map(jalon => (
                        <li
                          key={jalon.jalon}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            jalon.mesure ? 'border-accent/40 text-foreground' : 'border-border text-muted-foreground'
                          }`}
                        >
                          {jalon.jalon} — {jalon.mesure
                            ? `mesuré${jalon.date ? ` le ${formatDateFr(jalon.date)}` : ''}`
                            : 'non mesuré'}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-3 text-muted-foreground">
                  Le détail complet — momentum, cycles antérieurs, comparateur — vit dans
                  l’onglet Trajectoire.
                </p>
                {onOuvrirTrajectoire && (
                  <button
                    type="button"
                    onClick={onOuvrirTrajectoire}
                    className="mt-2 min-h-11 rounded-lg border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    Ouvrir l’onglet Trajectoire
                  </button>
                )}
              </section>
            );
          })()
        )
      )}
    </>
  );
}
