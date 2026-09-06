'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';
import { PanneauSuperpose } from '@/components/ui/PanneauSuperpose';
import {
  Activity,
  Check,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  HelpCircle,
  ListChecks,
  Moon,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { EquilibreApiResponse, PrioriteBesoin } from '@/app/api/praticien/equilibre/route';
import type { PatientsApiResponse } from '@/app/api/praticien/patients/route';
import type { PatchAssignationResponse } from '@/app/api/praticien/assignations/route';
import type { ReponsesApiResponse, ReponseQuestionnaire } from '@/app/api/praticien/reponses/route';
import type { ResultatMomentum } from '@/lib/equilibre/types';
// Import de VALEUR depuis un module FEUILLE (il n'importe rien) : la mention
// suit la doctrine sans traîner le moteur d'équilibre dans le bundle client.
import { MENTION_NATURE_INDICE_GLOBAL } from '@/lib/equilibre/natureIndiceGlobal';
import type { ScoreSubScore } from '@/lib/scoring/types';
import type { Trajectoire } from '@/lib/protocol/trajectoire';
import type { ModeVieDate } from '@/lib/equilibre/modeVie';
import type { OngletFiche, PhaseFiche } from '@/lib/praticien/ongletsFiche';
import { buildMiniSynthese } from '@/lib/scoring/miniSynthese';
import { ETIQUETTE_NON_INTERPRETABLE } from '@/lib/scoring/passationsNonInterpretables';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { ScoreZones } from '@/components/ui/ScoreZones';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { CerclesConcentriques } from '@/components/ui/CerclesConcentriques';
import { Chip } from '@/components/ui/Chip';
import { SpiraleTrajectoire } from '@/components/ui/SpiraleTrajectoire';
import { ModeConsultation } from '@/components/ui/ModeConsultation';
import { PatientPreview } from '@/components/PatientPreview';
import { DetailBesoinsPanel } from '@/components/DetailBesoinsPanel';
import { PractitionerFoodObservationPanel } from '@/components/food-observation/PractitionerFoodObservationPanel';
import { CorrespondanceMedecinPanel } from '@/components/correspondance/CorrespondanceMedecinPanel';
import {
  ClinicalRuntimeSection,
  type EtatRuntimeClinique,
  type PhaseCycleClinique,
} from '@/components/patient-cockpit/ClinicalRuntimeSection';
import { ObjectifNegociePanel } from '@/components/patient-cockpit/ObjectifNegociePanel';
import { ComprehensionPanel } from '@/components/patient-cockpit/ComprehensionPanel';
import { TrajectoirePanel } from '@/components/patient-cockpit/TrajectoirePanel';
import { CeQuiComptePanel } from '@/components/patient-cockpit/CeQuiComptePanel';
import { AgendaSommeilPraticienPanel } from '@/components/agenda-sommeil/AgendaSommeilPraticienPanel';
import { AgendaAlimentairePraticienPanel } from '@/components/agenda-alimentaire/AgendaAlimentairePraticienPanel';
import { rythmeDeclareDeReponses } from '@/lib/equilibre/discordanceRythme';
import { deriverEpisodeBandeau, phaseDue, phaseInitiale } from '@/lib/trajectoire-partagee/contrat';
import {
  type CertificationLue,
  libelleCertificationPassation,
} from '@/lib/certification-libelles';
import type { ValidationErgoC1Fixture } from '@/lib/clinical-engine/validationErgoFixture';
import type { RelectureProtocoleSoumission } from '@/components/patient-cockpit/ProtocolMiniBuilder';
import type { ProtocolDraft } from '@/lib/clinical-engine/types';

function getArrayField(scores: Record<string, unknown> | null, key: string): string[] {
  const value = scores?.[key];
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Les SIX porteurs d'un découpage descriptif, ramenés à une même ligne.
 *
 * `dimensions` était seul rendu ; `components` (PSQI, QIF, Francis),
 * `categories` (Berlin), `parts` (IDTAS-AE) et `phases` (5 mots de Dubois) ne
 * l'étaient nulle part. Tant que ces moteurs fabriquaient un total, la colonne
 * Score affichait au moins ce total. Depuis que le total tombe avec l'axe non
 * mesuré (2026-07-29), elle n'affiche plus rien — un « — » qui se lit comme un
 * incident technique, alors que les composantes réellement mesurées sont là.
 *
 * Deux formes de valeur (`total` ou `val`) et deux de dénominateur (`max` ou
 * `maxTotal`) selon le moteur. Les catégories du Berlin, elles, ne portent pas
 * de nombre du tout : leur mesure EST leur positivité.
 */
type AxeDescriptif = { cle: string; id: string; label: string; texte: string };

function descriptifsDeScores(scores: Record<string, unknown> | null): AxeDescriptif[] {
  // `apports` (2026-07-31) : deux grandeurs en UNITÉS PHYSIQUES, sans
  // dénominateur — des grammes et des kilocalories par jour, pas un x/y. Sans
  // ce porteur, un instrument qui calcule ce que sa description promet
  // n'afficherait rien du tout au praticien.
  const PORTEURS = ['dimensions', 'components', 'categories', 'parts', 'phases', 'apports'];
  const sortie: AxeDescriptif[] = [];
  for (const cle of PORTEURS) {
    const axes = scores?.[cle];
    if (!Array.isArray(axes)) continue;
    for (const axe of axes as Array<Record<string, unknown>>) {
      const valeur = [axe.total, axe.val, axe.count, axe.score]
        .find(v => typeof v === 'number') as number | undefined;
      const max = [axe.max, axe.maxTotal].find(v => typeof v === 'number') as number | undefined;
      let texte: string;
      if (typeof valeur === 'number') {
        // Une unité écrite l'emporte sur le dénominateur : « 86,6 g/jour » est
        // une mesure, « 86,6 » un nombre nu que le praticien devrait deviner.
        const unite = typeof axe.unite === 'string' ? axe.unite : null;
        if (unite) texte = `${valeur} ${unite}`;
        else texte = typeof max === 'number' ? `${valeur}/${max}` : String(valeur);
      } else if (axe.positive === true) {
        texte = 'positive';
      } else if (axe.positive === false) {
        texte = 'négative';
      } else {
        // Jamais « — » : la distinction entre « pas de mesure » et « pas de
        // donnée » est exactement ce que ce lot rend visible.
        texte = 'non mesuré';
      }

      sortie.push({
        cle,
        id: `${cle}:${String(axe.id ?? sortie.length)}`,
        label: String(axe.label ?? axe.id ?? ''),
        texte,
      });
    }
  }
  return sortie;
}

function syntheseSansRedondanceSousScores(texte: string, aDesSousScores: boolean): string {
  if (!aDesSousScores || !texte) return texte;
  const marqueurs = ['. Détail — ', '. Rubriques à noter — '];
  for (const marqueur of marqueurs) {
    const idx = texte.indexOf(marqueur);
    if (idx > 0) return texte.slice(0, idx).trim();
  }
  return texte;
}

function interpColorToVariant(color?: string): BadgeVariant {
  if (color === 'success' || color === 'warning' || color === 'danger') return color;
  return 'neutral';
}

function ObjetGauge({
  label,
  value,
  mention,
}: {
  label: string;
  value: number | null;
  /** Nature du chiffre, servie sous la jauge quand il n'est pas un score
   *  clinique (`DC-20`). Absente pour les objets qui n'en ont pas besoin. */
  mention?: string;
}) {
  if (value === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 bg-surface border border-border rounded-xl p-4 h-[148px]">
        <span className="text-sm text-muted-foreground">Non mesuré</span>
        <span className="text-xs text-muted-foreground uppercase tracking-wide text-center">{label}</span>
      </div>
    );
  }
  if (!mention) return <ScoreGauge value={value} label={label} />;
  return (
    <div className="flex flex-col items-center">
      <ScoreGauge value={value} label={label} />
      <span className="mt-1 text-xs text-muted-foreground text-center">{mention}</span>
    </div>
  );
}

function MomentumCard({ momentum }: { momentum: ResultatMomentum | null }) {
  if (!momentum) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 bg-surface border border-border rounded-xl p-4 h-[148px]">
        <span className="text-sm text-muted-foreground">Non mesuré</span>
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Momentum</span>
        <span className="text-xs text-muted-foreground text-center">Historique insuffisant</span>
      </div>
    );
  }
  const signe = momentum.delta > 0 ? '+' : '';
  return (
    <div className="flex flex-col items-center justify-center gap-1 bg-surface border border-border rounded-xl p-4 h-[148px]">
      <span className="text-2xl font-bold text-foreground">
        {signe}
        {momentum.delta}
      </span>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">Momentum</span>
      {/* VARIANTE NEUTRE DANS LES TROIS SENS — [[D-106]], `DC-22`.
          Ce badge portait `success` sur une hausse et `warning` sur une baisse.
          Or ce delta est la variation du TOTAL, dont l'arbitrage du 2026-08-24
          établit qu'il n'a aucune interprétation clinique : le colorer en vert
          ou en orange EST cette interprétation, servie au praticien sous forme
          de couleur au lieu de mots. C'est exactement ce que la décision retire
          au libellé patient (« En progression ») ; le laisser ici aurait
          corrigé la phrase et gardé le jugement. */}
      <Badge variant="neutral">{momentum.tendance}</Badge>
      <span className="text-3xs text-muted-foreground text-center leading-tight">
        {MENTION_NATURE_INDICE_GLOBAL}
      </span>
    </div>
  );
}

function LegendeNiveauxPreuve() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span><span className="font-medium text-foreground">A</span> — questionnaire clinique validé</span>
      <span><span className="font-medium text-foreground">B</span> — référentiel neuronutrition</span>
      <span><span className="font-medium text-foreground">C</span> — biologie fonctionnelle interprétative</span>
      <span><span className="font-medium text-foreground">D</span> — hypothèse WellNeuro</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Poste de pilotage (A6-R1) — ossature
// ---------------------------------------------------------------------------

const ONGLETS: { id: OngletFiche; libelle: string }[] = [
  { id: 'cockpit', libelle: 'Poste de pilotage' },
  { id: 'besoins', libelle: 'Les 12 besoins' },
  { id: 'alimentation', libelle: 'Alimentation' },
  { id: 'trajectoire', libelle: 'Trajectoire' },
  { id: 'correspondance', libelle: 'Correspondance' },
];

// LA LISTE VIT DANS `lib/praticien/ongletsFiche.ts`, pas ici : la page serveur
// doit valider `?phase=` avant de le passer, et un module `'use client'` ne
// s'appelle pas côté serveur. Deux listes dériveraient, et la dérive se lirait
// comme un deep-link qui « ne marche pas » sur la phase qu'une seule connaît.
type IdPhase = PhaseFiche;
// `inconnu` : l'état réel n'a pas pu être établi (runtime en chargement ou en
// erreur) — on l'affiche tel quel plutôt que d'affirmer « à ouvrir ».
type StatutPhase = 'fait' | 'en_attente' | 'a_ouvrir' | 'inconnu';

// Colonne vertébrale = le cycle clinique 3.x. Une phase = une zone focale ;
// on navigue par phase, jamais par défilement (A6-R1).
const PHASES: { id: IdPhase; libelle: string; runtime: PhaseCycleClinique | null }[] = [
  { id: 'patient', libelle: 'Patient', runtime: null },
  { id: 'donnees', libelle: 'Données fiables', runtime: 'donnees' },
  { id: 'comprehension', libelle: 'Compréhension', runtime: 'comprehension' },
  { id: 'decision', libelle: 'Décision 21 j', runtime: 'decision' },
  { id: 'actions', libelle: 'Actions', runtime: 'actions' },
  { id: 'suivi', libelle: 'Suivi', runtime: 'suivi' },
  { id: 'reevaluation', libelle: 'Réévaluation', runtime: 'reevaluation' },
];

const LIBELLE_STATUT: Record<StatutPhase, string> = {
  fait: 'renseignée',
  en_attente: 'en attente',
  a_ouvrir: 'à ouvrir',
  inconnu: 'indéterminée',
};

/**
 * Le libellé de statut, QUALIFIÉ PAR LA PHASE pour « en attente » — le même
 * mot désignait deux situations opposées (audit du cockpit 2026-09-02) : sur
 * « Données fiables » ou « Compréhension », le praticien attend une matière
 * qui vient du patient (questionnaires, scores) ; sur Patient, Décision,
 * Actions ou Suivi, c'est à lui d'agir. Les trois autres statuts restent
 * inchangés — leurs mots ne portaient pas d'ambiguïté.
 */
function libelleStatut(id: IdPhase, statut: StatutPhase): string {
  if (statut !== 'en_attente') return LIBELLE_STATUT[statut];
  return id === 'donnees' || id === 'comprehension' ? 'en attente du patient' : 'à traiter';
}

// Le statut n'est jamais porté par la seule couleur : icône + texte.
function IconeStatut({ statut }: { statut: StatutPhase }) {
  if (statut === 'fait') return <Check aria-hidden="true" size={14} strokeWidth={2.5} className="text-status-success" />;
  if (statut === 'en_attente') return <Clock aria-hidden="true" size={14} strokeWidth={2} className="text-accent" />;
  if (statut === 'inconnu') return <HelpCircle aria-hidden="true" size={14} strokeWidth={2} className="text-muted-foreground" />;
  return <Circle aria-hidden="true" size={14} strokeWidth={2} className="text-muted-foreground" />;
}

// Instrument à tiroir — mince habillage de la primitive `PanneauSuperpose`
// (audit 2026-09-02, lot 2) : le bouton d'instrument et le sur-titre restent
// ici, la mécanique Radix (portail, thème, fermeture) vit dans la primitive.
// `onOpenChange` remonte l'ouverture pour les tiroirs à chargement paresseux.
function InstrumentTiroir({
  libelle,
  description,
  icone: Icone,
  children,
  large = false,
  onOpenChange,
}: {
  libelle: string;
  description: string;
  icone: LucideIcon;
  children: ReactNode;
  /** Dérogation de largeur (maquette : 440px par défaut ; les tableaux
   * denses comme « Détail des réponses » gardent la pane large). */
  large?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
}) {
  return (
    <PanneauSuperpose
      variante="tiroir"
      largeur={large ? 'large' : 'focale'}
      titre={libelle}
      description={description}
      surtitre="Instrument"
      onOpenChange={onOpenChange}
      declencheur={
        <button
          type="button"
          className="flex min-h-12 w-full items-center gap-2 rounded-[11px] border border-border bg-surface px-3 py-2 text-left text-14 font-medium text-foreground shadow-card hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Icone aria-hidden="true" size={18} strokeWidth={2} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">{libelle}</span>
          <ChevronRight aria-hidden="true" size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
        </button>
      }
    >
      {children}
    </PanneauSuperpose>
  );
}

/**
 * Le tiroir « Synthèse IA & booklet » AFFICHE la dernière synthèse validée
 * sur place, en lecture seule (audit 2026-09-02, constat « 3 clics et un
 * changement de route pour lire un texte ») — la génération et l'édition
 * restent dans l'espace dédié. Chargement PARESSEUX : rien ne part tant que
 * le tiroir n'est pas ouvert (l'ouverture d'une fiche déclenche déjà ~30
 * requêtes — angle mort perf du contre-audit), puis une seule lecture.
 */
function TiroirSyntheseInline({ idPatient }: { idPatient: string }) {
  const [etat, setEtat] = useState<'repos' | 'chargement' | 'chargee' | 'erreur'>('repos');
  const [validee, setValidee] = useState<{
    statut: string;
    dateValidation: string | null;
    resume: string | null;
    narratif: string | null;
  } | null>(null);

  const charger = useCallback(async () => {
    setEtat('chargement');
    try {
      const r = await fetch(`/api/praticien/synthese?idPatient=${encodeURIComponent(idPatient)}`);
      const d = (await r.json()) as {
        syntheses?: { statut?: string; dateValidation?: string | null; syntheseJson?: unknown }[];
      };
      if (!r.ok) {
        setEtat('erreur');
        return;
      }
      // La plus récente VALIDÉE (le tri du serveur fait foi) ; les brouillons
      // ne se montrent pas ici — les relire est un geste d'édition, pas de
      // consultation de dossier.
      const derniere = (d.syntheses ?? []).find(
        s => s.statut === 'Validee_Praticien' || s.statut === 'Corrigee_Praticien',
      );
      if (!derniere) {
        setValidee(null);
        setEtat('chargee');
        return;
      }
      const json = derniere.syntheseJson;
      const champ = (cle: string): string | null => {
        if (typeof json !== 'object' || json === null) return null;
        const valeur = (json as Record<string, unknown>)[cle];
        return typeof valeur === 'string' && valeur.trim() ? valeur : null;
      };
      setValidee({
        statut: derniere.statut ?? '',
        dateValidation: derniere.dateValidation ?? null,
        resume: champ('resume_praticien'),
        narratif: champ('narratif_patient'),
      });
      setEtat('chargee');
    } catch {
      setEtat('erreur');
    }
  }, [idPatient]);

  return (
    <InstrumentTiroir
      libelle="Synthèse IA & booklet"
      description="Relire la dernière synthèse validée ; générer et éditer dans l’espace dédié."
      icone={Sparkles}
      onOpenChange={ouvert => {
        if (ouvert && etat === 'repos') void charger();
      }}
    >
      <div className="flex flex-col gap-3">
        {etat === 'chargement' && (
          <p role="status" className="text-sm text-muted-foreground">Chargement de la synthèse…</p>
        )}
        {etat === 'erreur' && (
          <p role="alert" className="text-sm text-status-warning">
            La synthèse n’a pas pu être lue — ce n’est pas une absence de synthèse.
          </p>
        )}
        {etat === 'chargee' && !validee && (
          <p className="text-sm text-muted-foreground">Aucune synthèse validée pour ce dossier.</p>
        )}
        {etat === 'chargee' && validee && (
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {validee.statut === 'Corrigee_Praticien' ? 'Validée et corrigée' : 'Validée'}
              {validee.dateValidation
                ? ` le ${new Date(validee.dateValidation).toLocaleDateString('fr-FR')}`
                : ''}
              {' '}— lecture seule.
            </p>
            {validee.resume && (
              <>
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Résumé praticien
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{validee.resume}</p>
              </>
            )}
            {validee.narratif && (
              <>
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Narratif patient
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{validee.narratif}</p>
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/synthese?idPatient=${encodeURIComponent(idPatient)}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Sparkles aria-hidden="true" size={16} />
            Ouvrir la synthèse IA
          </Link>
          {/* Continuité vers la composition de document — la page accepte
              ?idPatient= depuis le lot 2a ; plus de re-sélection à la main. */}
          <Link
            href={`/dashboard/documents?idPatient=${encodeURIComponent(idPatient)}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Composer un document
          </Link>
        </div>
      </div>
    </InstrumentTiroir>
  );
}

export function FichePatientPanel({
  idPatient,
  ongletInitial,
  phaseDemandee,
  fixtureValidationErgo = null,
}: {
  idPatient: string;
  /** Onglet d'ouverture (deep-link `?onglet=`, validé par la page serveur). */
  ongletInitial?: OngletFiche;
  /**
   * Phase d'ouverture (deep-link `?phase=`, validée par la page serveur).
   *
   * Vaut une navigation du praticien : elle prime sur la règle D5 et n'est pas
   * écrasée. Voir `phaseChoisieParPraticien` plus bas.
   */
  phaseDemandee?: PhaseFiche;
  fixtureValidationErgo?: ValidationErgoC1Fixture | null;
}) {
  const [data, setData] = useState<EquilibreApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reponses, setReponses] = useState<ReponseQuestionnaire[]>([]);
  const [loadingReponses, setLoadingReponses] = useState(true);
  const [assignationsModif, setAssignationsModif] = useState<PatientsApiResponse['assignations']>([]);
  // Un échec de lecture n'est JAMAIS rendu comme « aucune demande » : ce serait
  // la même affirmation fausse que celle corrigée ici, et elle laisserait le
  // questionnaire verrouillé côté patient sans que rien ne le signale. Même
  // discipline que `etatTrajectoire` plus bas.
  const [etatCorrections, setEtatCorrections] = useState<'chargement' | 'chargees' | 'erreur'>('chargement');
  // Vrai seulement si le serveur a confirmé avoir appliqué NOS filtres et
  // compte en base plus de lignes qu'il n'en a rendues.
  const [correctionsTronquees, setCorrectionsTronquees] = useState(false);
  // Garde de fraîcheur : la lecture se relance au changement de patient et au
  // clic de « Réessayer ». Sans elle, une réponse lente concernant le patient
  // précédent écraserait celle du patient affiché — soit les demandes de
  // correction d'un autre dossier, avec leur bouton « Débloquer ».
  const generationCorrections = useRef(0);
  const [deverrouillageId, setDeverrouillageId] = useState<string | null>(null);
  const [modeConsultationActif, setModeConsultationActif] = useState(false);
  const [ongletActif, setOngletActif] = useState<OngletFiche>(ongletInitial ?? 'cockpit');
  // L'onglet actif se MÉMORISE comme la phase (par patient, en localStorage,
  // audit 2026-09-02) : après un aller-retour hors de la fiche, le praticien
  // retrouve l'onglet qu'il consultait. Le deep-link `?onglet=` prime
  // toujours (intention explicite) ; la mémoire ne se lit qu'à défaut, DANS
  // UN EFFET — jamais dans l'initialisateur d'état, où `window` casserait le
  // rendu serveur et désaccorderait l'hydratation.
  const clefOngletMemorise = `wn.fiche.dernier-onglet.${idPatient}`;
  const ongletRestaureRef = useRef(false);
  useEffect(() => {
    if (ongletRestaureRef.current) return;
    ongletRestaureRef.current = true;
    if (ongletInitial) return;
    try {
      const brut = window.localStorage.getItem(clefOngletMemorise);
      if (brut && ONGLETS.some(o => o.id === brut)) setOngletActif(brut as OngletFiche);
    } catch {
      // Stockage local indisponible : la mémoire est un confort, jamais une
      // condition (même doctrine que la mémoire de phase).
    }
  }, [ongletInitial, clefOngletMemorise]);
  useEffect(() => {
    try {
      window.localStorage.setItem(clefOngletMemorise, ongletActif);
    } catch {
      // Idem : jamais une condition.
    }
  }, [ongletActif, clefOngletMemorise]);
  // Phase focale. Point de départ : 'patient' — la PREMIÈRE étape annoncée
  // par le rail, jamais le milieu de la séquence (audit du cockpit
  // 2026-09-02 : s'initialiser sur 'decision' faisait s'ouvrir chaque dossier
  // sur la 4e étape pendant la fenêtre transitoire). La phase réellement due
  // est ensuite calculée par la règle D5 (SP-CONV LOT-02) dès que l'état
  // runtime est établi — sauf si le praticien a déjà navigué.
  //
  // `phaseDemandee` (deep-link `?phase=`) COURT-CIRCUITE ce point de départ et,
  // plus bas, la règle D5 elle-même : un lien qui désigne une phase doit
  // l'ouvrir, sinon il ne sert à rien. La valeur vient du serveur, elle est donc
  // identique au rendu et à l'hydratation — contrairement à la mémoire locale,
  // qui ne peut être lue qu'après le montage.
  const [phaseActive, setPhaseActive] = useState<IdPhase>(phaseDemandee ?? 'patient');
  // Sous-vue de la phase Compréhension (audit 2026-09-02) — voir le bloc de
  // rendu : bascule par `hidden`, jamais par démontage.
  const [sousVueComprehension, setSousVueComprehension] = useState<'objectif' | 'comprehension'>('objectif');
  // UN DEEP-LINK VAUT UNE NAVIGATION DU PRATICIEN : sans cela, la règle D5
  // s'exécuterait dès l'état runtime établi et écraserait la phase demandée par
  // celle qu'elle juge due — le lien partagé afficherait alors autre chose que
  // ce qu'il désigne, une seconde après l'ouverture.
  //
  // IL N'EST EN REVANCHE PAS MÉMORISÉ. `choisirPhase` écrit en localStorage ;
  // ici, non. Un lien reçu d'un confrère ne doit pas réécrire silencieusement la
  // phase par défaut du destinataire sur ce dossier : il ouvre une vue, il ne
  // change pas une habitude.
  const phaseChoisieParPraticien = useRef(phaseDemandee !== undefined);
  const phaseInitialiseeRef = useRef(false);
  const [trajectoire, setTrajectoire] = useState<Trajectoire | null>(null);
  // Mode de vie 7 domaines (LOT-02) — servi par la même lecture de trajectoire.
  const [modeViePresent, setModeViePresent] = useState<ModeVieDate | null>(null);
  const [modeVieT0CycleCourant, setModeVieT0CycleCourant] = useState<ModeVieDate | null>(null);
  // « inconnue » tant qu'aucune lecture n'a abouti : un échec de lecture ne
  // doit JAMAIS être présenté comme une absence d'épisode (affirmation fausse
  // sur l'historique clinique).
  const [etatTrajectoire, setEtatTrajectoire] = useState<'inconnue' | 'chargement' | 'chargee' | 'erreur'>('inconnue');
  const [erreurTrajectoire, setErreurTrajectoire] = useState<string | null>(null);
  const generationTrajectoire = useRef(0);
  const [etatRuntime, setEtatRuntime] = useState<EtatRuntimeClinique | null>(null);
  /**
   * COMPTEUR D'ASSEMBLAGES, pas un booléen (Alliance 6.0-B, LOT-03).
   *
   * Le panneau objectif est autonome ; la carte de décision, elle, n'existe que
   * dans la réponse de confirmation d'épisode que reçoit la section clinique.
   * Ce compteur est le seul lien entre les deux : la section dit « je viens de
   * demander un assemblage », le panneau relit la table.
   *
   * Un booléen ne marcherait qu'UNE FOIS. Un praticien peut confirmer un
   * épisode, écarter une proposition, puis confirmer de nouveau ; le compteur
   * change à chaque fois, un drapeau resterait à `true` et le second
   * rafraîchissement n'aurait jamais lieu.
   */
  const [assemblages, setAssemblages] = useState(0);
  const refsPhases = useRef<(HTMLButtonElement | null)[]>([]);
  const refsOnglets = useRef<(HTMLButtonElement | null)[]>([]);
  // Harnais de validation ergonomique C1 (dev uniquement — voir
  // validationErgoFixture.ts) : la fixture est construite côté serveur par la
  // page et reçue en prop ; le brouillon relu (Épreuve 2) est construit par le
  // moteur via la route dev /api/dev/validation-ergo. Rien n'est sauvegardé
  // ni transmis au patient.
  const fixtureErgo = fixtureValidationErgo;
  const [protocolDraftErgo, setProtocolDraftErgo] = useState<ProtocolDraft | null>(null);
  const [erreurErgo, setErreurErgo] = useState<string | null>(null);

  const relectureErgo = (soumission: RelectureProtocoleSoumission) => {
    fetch('/api/dev/validation-ergo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(soumission),
    })
      .then(async r => {
        const payload = await r.json();
        if (!r.ok || !payload.protocolDraft) {
          throw new Error(typeof payload.error === 'string' ? payload.error : 'Réponse inattendue.');
        }
        setProtocolDraftErgo(payload.protocolDraft as ProtocolDraft);
        setErreurErgo(null);
      })
      .catch((error: unknown) => {
        setProtocolDraftErgo(null);
        setErreurErgo(error instanceof Error ? error.message : 'Impossible de construire le brouillon relu.');
      });
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/praticien/equilibre?idPatient=${encodeURIComponent(idPatient)}`)
      .then(r => r.json())
      .then((d: EquilibreApiResponse) => setData(d))
      .catch(() => setData({ unavailable: true, reason: 'exception' }))
      .finally(() => setLoading(false));
  }, [idPatient]);

  useEffect(() => {
    if (!data || 'unavailable' in data) return;
    const email = data.patient.email;

    setLoadingReponses(true);
    fetch(`/api/praticien/reponses?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((d: ReponsesApiResponse) => setReponses(d.reponses ?? []))
      .catch(() => setReponses([]))
      .finally(() => setLoadingReponses(false));
  }, [data]);

  // Demandes de correction du dossier affiché. Les deux filtres partent au
  // serveur : appliqués en mémoire, ils l'étaient APRÈS la troncature à 40 de la
  // route, et sur les assignations de TOUS les patients — une demande hors des
  // 40 assignations les plus récentes du cabinet n'apparaissait nulle part et
  // n'était donc jamais débloquée. La route trie par `dateAssignation desc` :
  // ce sont précisément les dossiers anciens, ceux qu'on corrige le plus tard,
  // qui tombaient hors fenêtre.
  //
  // Ne dépend plus de `data` : l'identifiant du patient suffit, et faire
  // attendre ce signal la lecture de l'équilibre le retardait sans raison.
  const chargerCorrections = useCallback(async () => {
    const generation = ++generationCorrections.current;
    setEtatCorrections('chargement');
    const params = new URLSearchParams({ idPatient, statutReponses: 'modification_demandee' });
    try {
      const reponse = await fetch(`/api/praticien/patients?${params.toString()}`);
      const payload = (await reponse.json()) as PatientsApiResponse;
      if (!reponse.ok || payload.unavailable) throw new Error(payload.reason ?? 'exception');
      if (generation !== generationCorrections.current) return;

      // Second passage EN DÉFENSE, pas en filtre : c'est le serveur qui
      // restreint, et c'est lui qui supprime la troncature. Celui-ci garantit
      // seulement qu'aucune ligne d'un autre dossier ne s'affiche si la requête
      // n'a pas été honorée (serveur antérieur à ces paramètres) ; il ne peut
      // rien masquer que le serveur ait correctement rendu.
      const liste = (payload.assignations ?? []).filter(
        a => a.idPatient === idPatient && a.statutReponses === 'modification_demandee',
      );
      const meta = payload.assignationsMeta;
      const filtresHonores =
        meta !== undefined
        && meta.idPatient === idPatient
        && meta.statutReponses === 'modification_demandee';
      setAssignationsModif(liste);
      setCorrectionsTronquees(filtresHonores && meta.total > liste.length);
      setEtatCorrections('chargees');
    } catch {
      if (generation !== generationCorrections.current) return;
      setAssignationsModif([]);
      setCorrectionsTronquees(false);
      setEtatCorrections('erreur');
    }
  }, [idPatient]);

  useEffect(() => {
    void chargerCorrections();
  }, [chargerCorrections]);

  // Onglet « Trajectoire » : lecture seule. Une erreur de lecture est
  // distinguée d'une absence d'épisode et reste rejouable (aucun verrou
  // définitif posé avant la réponse).
  //
  // GARDE DE GÉNÉRATION, comme `chargerCorrections` — revue Codex du
  // 2026-09-04, P1-2. Depuis que la confirmation d'un épisode délègue ici son
  // rafraîchissement, deux lectures peuvent se croiser : celle de l'ouverture,
  // encore en vol, et celle du geste. La seconde répond la première (elle porte
  // le nouvel épisode), puis la PREMIÈRE arrive et écrase l'état frais avec
  // l'historique d'avant. Le praticien vient de confirmer, et le bandeau, le
  // jalon dû et le résumé de réévaluation restent sur l'état antérieur — voire
  // affirment qu'aucun cycle n'est lisible, ce que `DC-24` interdit.
  const chargerTrajectoire = useCallback(async () => {
    const generation = ++generationTrajectoire.current;
    setEtatTrajectoire('chargement');
    setErreurTrajectoire(null);
    try {
      const reponse = await fetch(`/api/praticien/trajectoire?idPatient=${encodeURIComponent(idPatient)}`);
      const payload = (await reponse.json()) as {
        ok?: boolean;
        reason?: string;
        trajectoire?: Trajectoire;
        modeViePresent?: ModeVieDate | null;
        modeVieT0CycleCourant?: ModeVieDate | null;
      };
      if (generation !== generationTrajectoire.current) return;
      if (!reponse.ok || !payload?.ok) {
        setEtatTrajectoire('erreur');
        setErreurTrajectoire(
          payload?.reason === 'unauthenticated'
            ? 'Votre session a expiré. Déconnectez-vous puis reconnectez-vous pour lire la trajectoire.'
            : payload?.reason === 'patient_not_found'
              ? 'Patient introuvable : la trajectoire n’a pas pu être lue.'
              : 'La trajectoire n’a pas pu être lue (erreur technique). L’historique clinique de ce patient n’est pas affiché.',
        );
        return;
      }
      setTrajectoire(payload.trajectoire ?? null);
      setModeViePresent(payload.modeViePresent ?? null);
      setModeVieT0CycleCourant(payload.modeVieT0CycleCourant ?? null);
      setEtatTrajectoire('chargee');
    } catch {
      if (generation !== generationTrajectoire.current) return;
      setEtatTrajectoire('erreur');
      setErreurTrajectoire(
        'La trajectoire n’a pas pu être lue (erreur réseau). L’historique clinique de ce patient n’est pas affiché.',
      );
    }
  }, [idPatient]);

  // Lecture désormais engagée dès l'ouverture de la fiche (SP-CONV LOT-02) :
  // le bandeau d'épisode (« Épisode N en cours · T0 + X j ») en a besoin au
  // niveau cockpit, pas seulement dans l'onglet Trajectoire.
  useEffect(() => {
    if (etatTrajectoire !== 'inconnue') return;
    void chargerTrajectoire();
  }, [etatTrajectoire, chargerTrajectoire]);

  // Statuts du rail — dérivés de l'état réel (réponses reçues, demandes de
  // correction, état remonté par le runtime clinique). Aucun statut inventé :
  // en l'absence d'information, la phase reste « à ouvrir » — et tant que
  // l'état réel n'est pas établi, « indéterminée ». Hissé avant les retours
  // anticipés (SP-CONV LOT-02) pour nourrir aussi la phase initiale D5.
  const statutPhase = useCallback(
    (id: IdPhase): StatutPhase => {
      if (!data || 'unavailable' in data) return 'inconnu';
      const priorites = data.priorites;
      // Une lecture en échec ne vaut pas « rien en attente » : sans cette
      // branche, le rail affirmerait « renseignée » alors que l'état réel des
      // demandes de correction n'a pas pu être établi.
      if (id === 'patient') {
        if (etatCorrections === 'erreur') return 'inconnu';
        return assignationsModif.length > 0 ? 'en_attente' : 'fait';
      }
      if (id === 'donnees') return reponses.length > 0 ? 'fait' : 'en_attente';
      if (id === 'comprehension') {
        return priorites.some(p => p.couverture !== null) ? 'fait' : 'en_attente';
      }
      // Phases dérivées du runtime : tant que son état n'est pas établi
      // (première mesure absente, chargement en cours ou erreur), le statut est
      // honnêtement « indéterminée » — jamais une affirmation par défaut.
      if (!etatRuntime || etatRuntime.chargement || etatRuntime.erreur !== null) return 'inconnu';
      if (id === 'decision') return etatRuntime.episodeConfirme ? 'fait' : 'en_attente';
      if (id === 'actions') {
        if (etatRuntime.nombreVersions > 0) return 'fait';
        return etatRuntime.episodeConfirme ? 'en_attente' : 'a_ouvrir';
      }
      if (id === 'suivi') {
        if (etatRuntime.suiviRenseigne) return 'fait';
        return etatRuntime.episodeConfirme ? 'en_attente' : 'a_ouvrir';
      }
      // Réévaluation : « renseignée » uniquement si un jalon POST-T0 (J21/J42/J90)
      // a réellement été mesuré (booléens `mesure` de la trajectoire, A8-2) — un
      // T0 confirmé ouvre un cycle mais ne constitue pas une réévaluation. Tant que
      // la lecture de la trajectoire n'a pas abouti (en vol) ou a échoué, l'état
      // est inconnu, jamais affirmé « à ouvrir ».
      if (etatRuntime.trajectoireErreur || etatRuntime.trajectoireEnLecture) return 'inconnu';
      return etatRuntime.reevaluationMesuree ? 'fait' : 'a_ouvrir';
    },
    [data, assignationsModif, etatCorrections, reponses, etatRuntime],
  );

  // Navigation praticien : le choix manuel prime définitivement sur la
  // sélection automatique, et la dernière phase consultée est mémorisée en
  // LOCAL uniquement (règle D5, 4e rang) — jamais en base.
  const clePhaseMemorisee = `wn.fiche.derniere-phase.${idPatient}`;
  const choisirPhase = useCallback(
    (id: IdPhase) => {
      phaseChoisieParPraticien.current = true;
      setPhaseActive(id);
      try {
        window.localStorage.setItem(clePhaseMemorisee, id);
      } catch {
        // Stockage local indisponible (navigation privée…) : la mémoire de
        // phase est un confort, jamais une condition.
      }
    },
    [clePhaseMemorisee],
  );

  // Phase initiale D5 (SP-CONV LOT-02) : premier bloqueur de sécurité >
  // première action exigible > première phase en attente > dernière phase
  // consultée. Une seule fois, jamais après une navigation du praticien, et
  // jamais tant que l'état runtime n'est pas établi (état neutre).
  useEffect(() => {
    if (phaseInitialiseeRef.current || phaseChoisieParPraticien.current) return;
    if (loading || !data || 'unavailable' in data) return;
    if (!etatRuntime || etatRuntime.chargement) return;

    let memoire: IdPhase | null = null;
    try {
      const brut = window.localStorage.getItem(clePhaseMemorisee);
      if (brut && PHASES.some(p => p.id === brut)) memoire = brut as IdPhase;
    } catch {
      memoire = null;
    }

    const cible = phaseInitiale({
      chargement: false,
      bloqueurs: etatRuntime.erreur === null && etatRuntime.decisionBloquee ? ['actions'] : [],
      actionsExigibles: [
        ...(assignationsModif.length > 0 ? (['patient'] as const) : []),
        ...(etatRuntime.erreur === null && !etatRuntime.episodeConfirme ? (['decision'] as const) : []),
      ],
      statuts: Object.fromEntries(PHASES.map(p => [p.id, statutPhase(p.id)])),
      dernierePhaseConsultee: memoire,
    });
    if (cible) {
      phaseInitialiseeRef.current = true;
      setPhaseActive(cible);
    }
  }, [loading, data, etatRuntime, assignationsModif, statutPhase, clePhaseMemorisee]);

  const onDebloquer = async (idAssignation: string) => {
    setDeverrouillageId(idAssignation);
    try {
      const r = await fetch('/api/praticien/assignations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAssignation }),
      });
      const json = (await r.json()) as PatchAssignationResponse;
      if (json.success) setAssignationsModif(prev => prev.filter(a => a.idAssignation !== idAssignation));
    } finally {
      setDeverrouillageId(null);
    }
  };

  // Navigation clavier du rail de phases (tablist vertical).
  const onClavierRail = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const suivant =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (index + 1) % PHASES.length
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? (index - 1 + PHASES.length) % PHASES.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? PHASES.length - 1
              : null;
    if (suivant === null) return;
    event.preventDefault();
    choisirPhase(PHASES[suivant].id);
    refsPhases.current[suivant]?.focus();
  };

  // Navigation clavier des onglets in-fiche (tablist horizontal, tabindex
  // roving) — sans quoi les onglets inactifs sortent de l'ordre de tabulation.
  const onClavierOnglets = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const suivant =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % ONGLETS.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + ONGLETS.length) % ONGLETS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ONGLETS.length - 1
              : null;
    if (suivant === null) return;
    event.preventDefault();
    setOngletActif(ONGLETS[suivant].id);
    refsOnglets.current[suivant]?.focus();
  };

  if (loading) {
    return <div className="text-base text-muted-foreground">Chargement de la fiche patient...</div>;
  }

  if (!data || 'unavailable' in data) {
    const reason = data && 'unavailable' in data ? data.reason : 'exception';
    const message =
      reason === 'patient_not_found'
        ? 'Patient introuvable.'
        : reason === 'unauthenticated'
          ? 'Votre session a expiré. Déconnectez-vous puis reconnectez-vous.'
          : 'Erreur technique. Vérifiez le terminal Next.js.';
    return <div className="bg-muted border border-border rounded-xl p-4 text-base text-muted-foreground">{message}</div>;
  }

  const { patient, objetsCliniques, priorites } = data;
  const derniereAssignationId = reponses[0]?.idAssignation || null;
  // Rythme DÉCLARÉ, lu de la dernière passation Q_ALI_01 (rawAnswers déjà
  // chargés, `reponses` trié par date décroissante) : passé au panneau agenda
  // pour la lecture de discordance (LOT-01, D-040). `null` si aucune passation
  // ou forme courte — le panneau n'affiche alors rien. L'extraction est une
  // fonction pure gardée par son propre banc.
  const rythmeDeclare = rythmeDeclareDeReponses(reponses);
  const nomComplet = `${patient.prenom} ${patient.nom}`.trim();
  const derniereReponse = reponses[0]?.dateSoumission
    ? new Date(reponses[0].dateSoumission).toLocaleDateString('fr-FR')
    : null;

  const phaseCourante = PHASES.find(p => p.id === phaseActive) ?? PHASES[0];

  // Bandeau d'épisode (SP-CONV LOT-02) — dérivé du contrat partagé sur les
  // cycles G2 persistés. Null tant que la trajectoire n'est pas lue ou sans
  // aucun cycle : le bandeau n'affirme alors rien.
  const bandeauEpisode =
    etatTrajectoire === 'chargee' && trajectoire
      ? deriverEpisodeBandeau(trajectoire.cycles, new Date())
      : null;

  // --- Contenus des instruments (tiroirs) -----------------------------------
  const tableauBesoins = (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Besoin</th>
            <th className="px-4 py-2 text-left">Couverture</th>
            <th className="px-4 py-2 text-left">Niveau de preuve</th>
          </tr>
        </thead>
        <tbody>
          {priorites.map((p: PrioriteBesoin) => (
            <tr key={p.besoin} className="border-t border-border">
              <td className="px-4 py-2">{p.libellePraticien}</td>
              <td className="px-4 py-2 text-muted-foreground">
                {p.couverture !== null ? (
                  /* Piste neutre (sans zones) : la couverture n'a pas de bornes
                     de référentiel — aucun seuil n'est suggéré, le chiffre
                     reste affiché à côté du point. */
                  <span className="flex items-center gap-2">
                    <ScoreZones
                      value={p.couverture}
                      max={100}
                      ariaLabel={`Couverture ${p.couverture} %`}
                      className="w-16"
                    />
                    {p.couverture}%
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-2"><EvidenceBadge niveau={p.niveauPreuve} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Légende en repli (audit 2026-09-02) : pédagogique, utile une fois,
          pas un pied de tableau permanent. */}
      <details className="px-4 py-3 border-t border-border">
        <summary className="cursor-pointer text-xs text-muted-foreground">Niveaux de preuve A–D</summary>
        <div className="mt-2">
          <LegendeNiveauxPreuve />
        </div>
      </details>
    </div>
  );

  const cartesObjetsCliniques = (
    /* 2 colonnes fixes : la pane de tiroir fait 440px (maquette), les
       breakpoints viewport de Tailwind n'y voient rien. */
    <div className="grid grid-cols-2 gap-3">
      {/* LE SEUL ENDROIT DU DÉPÔT OÙ LE TOTAL S'AFFICHE EN CHIFFRE ([[D-106]],
          `DC-22`). Le praticien lit donc la mention de nature : le total n'a
          pas d'interprétation clinique, aucune règle ne le lit, il ne déclenche
          rien. Le patient, lui, ne reçoit pas cette mention — il ne voit aucun
          chiffre (`showValue={false}`), et démentir un score qu'il n'a jamais lu
          ne l'informerait pas. */}
      <ObjetGauge
        label="Indice global"
        value={objetsCliniques.indiceGlobal}
        mention={MENTION_NATURE_INDICE_GLOBAL}
      />
      <ObjetGauge label="Stabilité métabolique" value={objetsCliniques.stabiliteMetabolique} />
      <ObjetGauge label="Réserve d'adaptation" value={objetsCliniques.reserveAdaptation} />
      <ObjetGauge label="Clarté" value={objetsCliniques.clarte} />
      <MomentumCard momentum={objetsCliniques.momentum} />
    </div>
  );

  const tableauReponses = (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {loadingReponses ? (
        <div className="px-4 py-4 text-base text-muted-foreground">Chargement...</div>
      ) : reponses.length === 0 ? (
        <div className="px-4 py-4 text-base text-muted-foreground">Aucun questionnaire complété pour ce patient.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Questionnaire</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Interprétation</th>
                <th className="px-4 py-2 text-left">Qualité</th>
              </tr>
            </thead>
            <tbody>
              {reponses.map(r => {
                const scores = r.scoresParsed;
                const certification = libelleCertificationPassation((scores?.certification as CertificationLue | undefined) ?? null);
                const missingIds = getArrayField(scores, 'missingIds');
                const notApplicable = getArrayField(scores, 'notApplicable');
                const note = typeof scores?.note === 'string' ? scores.note : '';
                const subScores = Array.isArray(scores?.subScores)
                  ? (scores!.subScores as ScoreSubScore[])
                  : [];
                // Les dimensions DÉTAILLENT un total qui reste la mesure — elles
                // ne le remplacent pas, contrairement aux sous-scores.
                //
                // Quatre autres porteurs disent la même chose sous d'autres noms
                // — `components` (PSQI, QIF, Francis), `categories` (Berlin),
                // `parts` (IDTAS-AE), `phases` (5 mots de Dubois) — et n'étaient
                // rendus NULLE PART. Tant que leur moteur fabriquait un total,
                // la ligne affichait au moins ce total ; depuis que le total
                // tombe avec l'axe non mesuré (2026-07-29), elle n'affichait plus
                // rien : un « — » qui se lit comme un incident technique, alors
                // que les composantes RÉELLEMENT mesurées existent dans
                // `scores_json`. Relevé en revue adversariale du même lot.
                const axesDescriptifs = descriptifsDeScores(scores);
                const miniSynthese = syntheseSansRedondanceSousScores(
                  buildMiniSynthese(scores),
                  subScores.length > 0,
                );
                return (
                  <tr key={r.idReponse} className="border-t border-border align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                      {r.dateSoumission ? new Date(r.dateSoumission).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-2 font-medium">
                      <div>{r.titre || r.idQuestionnaire || '—'}</div>
                      {/* La route a déjà vidé score et interprétation : sans
                          cette ligne, la passation s'afficherait en « — »
                          partout, ce qui se lit comme un incident technique et
                          non comme une décision clinique. Dire pourquoi est la
                          moitié du travail. */}
                      {r.nonInterpretable && (
                        <div
                          className="mt-1 max-w-md text-xs font-normal text-status-danger"
                          title={r.nonInterpretable}
                        >
                          {ETIQUETTE_NON_INTERPRETABLE} — {r.nonInterpretable}
                        </div>
                      )}
                      {/* « Résumé du score » et non « Synthèse » : la Synthèse
                          est un document distinct du dossier (onglet dédié,
                          rédigée puis diffusée). Le même mot pour les deux
                          faisait lire cette ligne comme un extrait de ce
                          document, alors qu'elle dérive des seuls scores. */}
                      {miniSynthese && (
                        <div className="mt-1 text-xs font-normal italic text-foreground/80 max-w-md" title={miniSynthese}>
                          Résumé du score : {miniSynthese}
                        </div>
                      )}
                      {note && (
                        <div className="mt-1 text-xs font-normal text-muted-foreground max-w-md" title={note}>
                          {note}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                      {subScores.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {subScores.map(sub => (
                            <div key={sub.id} className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-xs text-muted-foreground w-28 truncate" title={sub.label}>
                                {sub.label}
                              </span>
                              {/* La direction, quand l'instrument la définit. Sans elle,
                                  « Fatigue 100/100 » et « Fonctionnement physique 100/100 »
                                  s'affichent à l'identique alors qu'ils disent le contraire
                                  l'un de l'autre. La consigne du modèle décrit ce champ
                                  depuis la v12 ; le praticien y a droit aussi. */}
                              {sub.sens && (
                                <span
                                  className="text-3xs px-1 rounded bg-muted text-muted-foreground"
                                  title={sub.sens === 'symptome'
                                    ? 'Score élevé = symptômes plus importants'
                                    : 'Score élevé = meilleur fonctionnement'}
                                >
                                  {sub.sens === 'symptome' ? '↑ symptômes' : '↑ mieux'}
                                </span>
                              )}
                              {typeof sub.total === 'number' && typeof sub.max === 'number' && (
                                <ScoreZones
                                  value={sub.total}
                                  max={sub.max}
                                  ranges={r.subScoreRanges?.[sub.id] ?? null}
                                  ariaLabel={`${sub.label} : ${sub.total} sur ${sub.max}${sub.interpretation?.label ? ` — ${sub.interpretation.label}` : ''}`}
                                />
                              )}
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {sub.total ?? '—'}
                                {typeof sub.max === 'number' ? `/${sub.max}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : r.scorePrincipal !== null ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary self-start">
                          {r.scorePrincipal}
                        </span>
                      ) : '—'}
                      {/* Rendu HORS des branches ci-dessus, délibérément : un
                          découpage descriptif ne doit jamais dépendre de la
                          présence d'un sous-score ou d'un score principal pour
                          s'afficher. Aucun instrument n'émet aujourd'hui les
                          deux clés, mais l'oubli inverse est exactement ce qui
                          a effacé le total du MMSE avant correction. */}
                      {axesDescriptifs.length > 0 && (
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {axesDescriptifs.map(axe => (
                            <div key={axe.id} className="flex items-baseline gap-1.5 whitespace-nowrap">
                              <span className="w-28 truncate" title={axe.label}>{axe.label}</span>
                              <span className="tabular-nums">{axe.texte}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-w-xs">
                      {subScores.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {subScores.map(sub => (
                            <div key={sub.id}>
                              {sub.interpretation?.label ? (
                                <Badge variant={interpColorToVariant(sub.interpretation.color)}>
                                  {sub.interpretation.label}
                                </Badge>
                              ) : (
                                <span>—</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="block truncate" title={r.interpretation}>
                          {r.interpretation || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {r.nonInterpretable ? (
                          <Badge variant="danger">Non interprétable</Badge>
                        ) : certification ? (
                          <Badge variant={certification.variant}>{certification.label}</Badge>
                        ) : (
                          <Badge variant="neutral">Historique</Badge>
                        )}
                        {missingIds.length > 0 && (
                          <Badge variant="warning">{missingIds.length} manquant(s)</Badge>
                        )}
                        {notApplicable.length > 0 && (
                          <Badge variant="neutral">{notApplicable.length} n/a</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // --- Zone focale : contenu propre à la phase (hors runtime clinique) ------
  const focalLocal = () => {
    if (phaseActive === 'patient') {
      return (
        <div className="flex flex-col gap-4">
          {/* La date de dernière réponse N'EST PLUS répétée ici : le bandeau
              du cockpit la porte en permanence sur ce même onglet, et la
              double occurrence sans contexte ajouté était une pure
              duplication (audit 2026-09-02). L'e-mail, lui, n'est visible
              qu'ici. */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-base text-foreground">{nomComplet}</p>
            <p className="mt-1 break-all text-base text-muted-foreground">{patient.email}</p>
          </div>
          {assignationsModif.length > 0 && (
            <section aria-label="Demandes de correction en attente" className="bg-surface border border-accent rounded-xl overflow-hidden">
              {assignationsModif.map(a => (
                <div key={a.idAssignation} className="px-4 py-3 border-b border-border last:border-b-0 flex items-start justify-between gap-3 bg-status-warning/10">
                  <div className="min-w-0">
                    <span className="text-base text-status-warning">
                      Demande de correction — <span className="font-medium">{a.titre || a.idQuestionnaire}</span>
                    </span>
                    {a.correctionCommentaire && (
                      <p className="text-xs text-status-warning mt-1 italic">« {a.correctionCommentaire} »</p>
                    )}
                  </div>
                  <button
                    onClick={() => onDebloquer(a.idAssignation)}
                    disabled={deverrouillageId === a.idAssignation}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-status-warning text-white disabled:opacity-60"
                  >
                    {deverrouillageId === a.idAssignation ? 'Déblocage...' : 'Débloquer'}
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>
      );
    }

    if (phaseActive === 'donnees') {
      return (
        <div className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
          {loadingReponses
            ? 'Chargement des réponses...'
            : reponses.length === 0
              ? 'Aucun questionnaire complété pour ce patient.'
              : `${reponses.length} questionnaire(s) reçu(s). Le détail chiffré s’ouvre dans l’instrument « Détail des réponses ».`}
        </div>
      );
    }

    if (phaseActive === 'comprehension') {
      // SCINDÉE EN DEUX SOUS-VUES (audit 2026-09-02, constat bloquant : 13 à
      // 18 blocs empilés). Bascule par `hidden`, jamais par démontage : les
      // deux panneaux sont autonomes et leurs GET journalisent l'accès au
      // dossier (G-TRUST-04) — les démonter à chaque bascule gonflerait le
      // journal. Les deux montent donc UNE fois à l'entrée de phase, comme
      // avant ; seul l'affichage alterne.
      return (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-border rounded-xl p-4 flex justify-center">
            <CerclesConcentriques
              besoins={priorites.map(p => ({
                id: p.besoin,
                libelle: p.libellePraticien,
                strate: p.strate,
                couverture: p.couverture,
              }))}
            />
          </div>
          <div role="group" aria-label="Sections de la phase Compréhension" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
            {([
              ['objectif', 'Objectif négocié'],
              ['comprehension', 'Ce que j’ai compris'],
            ] as const).map(([id, libelle]) => (
              <button
                key={id}
                type="button"
                aria-pressed={sousVueComprehension === id}
                onClick={() => setSousVueComprehension(id)}
                className={`min-h-11 rounded-md px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                  sousVueComprehension === id
                    ? 'bg-accent/15 font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
          {/* Objectif négocié (Alliance 6.0-A, LOT-02) — HORS du runtime
              clinique : un objectif se négocie avant qu'un épisode soit
              confirmé, donc le panneau reste visible sans épisode. Vérifié
              par banc de rendu. */}
          <div hidden={sousVueComprehension !== 'objectif'}>
            <ObjectifNegociePanel idPatient={idPatient} signalAssemblage={assemblages} />
          </div>
          {/* « Ce que j'ai compris de vous » (Alliance 6.0-A, LOT-04) — même
              phase et même raison. Pas de 6e onglet — une sous-vue. */}
          <div hidden={sousVueComprehension !== 'comprehension'}>
            <ComprehensionPanel idPatient={idPatient} />
          </div>
        </div>
      );
    }

    // Phases branchées sur le runtime clinique. Quand aucun épisode n'est
    // confirmé, `ClinicalRuntimeSection` ne rend rien pour Suivi / Réévaluation :
    // on affiche un état vide explicite (le « pourquoi ») pour distinguer
    // « rien à voir ici » d'un chargement en échec.
    // `etatRuntime` à null = première mesure non encore remontée : le runtime
    // affiche alors son propre bandeau de chargement / d'erreur, on n'ajoute rien.
    const runtimePret = etatRuntime !== null && !etatRuntime.chargement && etatRuntime.erreur === null;

    if (phaseActive === 'suivi' && runtimePret && !etatRuntime!.episodeConfirme) {
      return (
        <div role="status" className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
          Une décision de 21 jours doit d’abord être ouverte pour suivre ce patient. Les points d’étape J7/J14/J21
          apparaîtront ici une fois l’épisode confirmé.
        </div>
      );
    }

    if (phaseActive === 'reevaluation' && runtimePret && !etatRuntime!.episodeConfirme) {
      // Formulation STRUCTURELLE (non « résultat de lecture ») : sans épisode
      // confirmé, la trajectoire n'est jamais lue — on n'affirme donc pas
      // « aucun cycle disponible » (qui laisserait croire à un historique
      // consulté puis trouvé vide), on rattache l'absence de cycle à l'absence
      // d'épisode.
      return (
        <div role="status" className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
          La réévaluation (jalons T0 → J21 → J42 → J90) se construit après confirmation d’un épisode. Aucun épisode
          n’étant confirmé, il n’y a pas encore de cycle daté à afficher.
        </div>
      );
    }

    return null;
  };

  return (
    <ModeConsultation active={modeConsultationActif} onToggle={() => setModeConsultationActif(false)}>
    <div className="flex flex-col gap-4">
      {/* Chrome condensé (D10, SP-CONV LOT-02) : identité et actions tiennent
          sur une ligne en desktop — le cockpit prend l'espace restant de
          l'écran (calc ci-dessous : 64px de NavBar + paddings du main + cette
          ligne + les onglets ≈ 11.75rem). Zéro scroll de page en usage
          courant ; les bannières critiques, exceptionnelles, peuvent décaler. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">{nomComplet}</h2>
          <p className="break-all text-xs text-muted-foreground">{patient.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {derniereAssignationId && (
            <PatientPreview patientId={idPatient} assignationId={derniereAssignationId} />
          )}
          {!modeConsultationActif && (
            <button
              type="button"
              onClick={() => setModeConsultationActif(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Stethoscope size={16} strokeWidth={2} />
              Mode consultation
            </button>
          )}
          {/* RETOUR CONTEXTUEL (audit 2026-09-02) : une entrée par
              ?onglet=trajectoire vient de la porte 5.0 (« Fiche-trajectoire »
              du rail, inbox du Fil) — la ramener vers la liste héritage
              perdait le praticien. Le paramètre d'entrée est le seul signal
              fiable dont la fiche dispose. */}
          {ongletInitial === 'trajectoire' ? (
            <Link href="/dashboard/trajectoires" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              ← Retour aux fiches-trajectoires
            </Link>
          ) : (
            <Link href="/dashboard/patients" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              ← Retour aux patients
            </Link>
          )}
        </div>
      </div>

      {/* Onglets in-fiche : plus de sous-vue en page pleine, plus de scroll. */}
      <div role="tablist" aria-label="Vues de la fiche patient" className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted p-1">
        {ONGLETS.map((onglet, index) => {
          const actif = ongletActif === onglet.id;
          return (
            <button
              key={onglet.id}
              ref={element => {
                refsOnglets.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`onglet-${onglet.id}`}
              aria-selected={actif}
              aria-controls={`panneau-${onglet.id}`}
              tabIndex={actif ? 0 : -1}
              onClick={() => setOngletActif(onglet.id)}
              onKeyDown={event => onClavierOnglets(event, index)}
              className={`min-h-11 rounded-lg px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                actif ? 'bg-surface font-semibold text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {onglet.libelle}
            </button>
          );
        })}
      </div>

      {fixtureErgo && (
        <div role="status" className="bg-status-warning/10 border border-accent rounded-xl px-4 py-3 text-base text-status-warning">
          Mode validation ergonomique — données fictives (fixture C1). Aucune sauvegarde, aucun envoi.
          {erreurErgo && <span className="block mt-1 font-medium">Erreur du harnais : {erreurErgo}</span>}
        </div>
      )}

      {/* Un échec de lecture ne se tait pas : sans ce bandeau, l'absence de
          signal serait indiscernable d'une absence de demande — et le
          questionnaire resterait verrouillé côté patient. Libellé de bouton
          distinct de celui de la trajectoire : deux nœuds portant le même nom
          accessible casseraient le mode strict des E2E. */}
      {etatCorrections === 'erreur' && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-accent bg-status-warning/10 px-4 py-2 text-base text-status-warning"
        >
          <ShieldAlert aria-hidden="true" size={16} strokeWidth={2} className="shrink-0" />
          <span className="min-w-0">
            Les demandes de correction n’ont pas pu être lues. Ce dossier peut en compter une en attente de déblocage.
          </span>
          <button
            type="button"
            onClick={() => void chargerCorrections()}
            className="ml-auto min-h-9 shrink-0 rounded-lg border border-accent px-3 py-1 text-xs font-medium text-solar-ink hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Réessayer la lecture des corrections
          </button>
        </div>
      )}

      {/* Signal permanent (B2) : une demande de correction patient doit rester
          perceptible quel que soit l'ONGLET affiché (« Les 12 besoins »,
          « Alimentation », « Trajectoire »…) et pas seulement dans le cockpit —
          sans quoi le questionnaire reste verrouillé côté patient sans que le
          praticien le voie. Hissé au niveau de la fiche pour cette raison. Le
          déblocage lui-même reste dans la phase Patient du cockpit. */}
      {assignationsModif.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-accent bg-status-warning/10 px-4 py-2 text-base text-status-warning"
        >
          <Clock aria-hidden="true" size={16} strokeWidth={2} className="shrink-0" />
          <span className="min-w-0">
            {assignationsModif.length === 1
              ? '1 demande de correction en attente de déblocage.'
              : `${assignationsModif.length} demandes de correction en attente de déblocage.`}
          </span>
          {/* Le plafond de la route s'applique désormais aux seules demandes de
              CE dossier — inatteignable en pratique (18 assignations pour le
              patient le plus fourni au 2026-07-29). S'il l'était un jour, le
              dire vaut mieux qu'afficher un compte partiel comme un total. */}
          {correctionsTronquees && (
            <span className="min-w-0 font-medium">
              Liste tronquée : ce dossier compte d’autres demandes, non affichées ici.
            </span>
          )}
          {!(ongletActif === 'cockpit' && phaseActive === 'patient') && (
            <button
              type="button"
              onClick={() => {
                setOngletActif('cockpit');
                setPhaseActive('patient');
              }}
              className="ml-auto min-h-9 shrink-0 rounded-lg border border-accent px-3 py-1 text-xs font-medium text-solar-ink hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Ouvrir la phase Patient
            </button>
          )}
        </div>
      )}

      {/* Fil conducteur GÉNÉRIQUE « prochaine étape » (audit du cockpit
          2026-09-02) : les deux bandeaux spécifiques ci-dessus et ci-dessous
          ne couvraient que deux cas ; pour tout le reste, le praticien devait
          lire lui-même les sept lignes du rail. La phase due vient de
          `phaseDue` — la même hiérarchie que la règle D5, mémoire exclue —
          et rien ne s'affiche quand rien n'est dû (`DC-24`, transposé).
          Les deux cas déjà couverts par un bandeau spécifique sont SUPPRIMÉS
          d'ici : deux bandeaux pour le même fait se liraient comme deux
          faits ; et le bandeau se tait quand la phase due est déjà affichée
          (le rail la montre sélectionnée). */}
      {(() => {
        if (!etatRuntime || etatRuntime.chargement || loading || !data || 'unavailable' in data) return null;
        const due = phaseDue({
          chargement: false,
          bloqueurs: etatRuntime.erreur === null && etatRuntime.decisionBloquee ? ['actions'] : [],
          actionsExigibles: [
            ...(assignationsModif.length > 0 ? (['patient'] as const) : []),
            ...(etatRuntime.erreur === null && !etatRuntime.episodeConfirme ? (['decision'] as const) : []),
          ],
          statuts: Object.fromEntries(PHASES.map(p => [p.id, statutPhase(p.id)])),
        });
        if (!due) return null;
        if (due === 'patient' && assignationsModif.length > 0) return null;
        if (due === 'actions' && etatRuntime.erreur === null && etatRuntime.decisionBloquee) return null;
        if (ongletActif === 'cockpit' && phaseActive === due) return null;
        const phaseDueDef = PHASES.find(p => p.id === due);
        if (!phaseDueDef) return null;
        return (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-base text-foreground"
          >
            <IconeStatut statut={statutPhase(due)} />
            <span className="min-w-0">
              Prochaine étape : {phaseDueDef.libelle} — {libelleStatut(due, statutPhase(due))}.
            </span>
            <button
              type="button"
              onClick={() => {
                setOngletActif('cockpit');
                choisirPhase(due);
              }}
              className="ml-auto min-h-9 shrink-0 rounded-lg border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Y aller
            </button>
          </div>
        );
      })()}

      {/* Signal permanent : un protocole bloqué (abstention non levée ou finding
          de sécurité) n'est détaillé que par ProtocolMiniBuilder, lequel vit
          dans la phase Actions — or la fiche s'ouvre sur Décision. Le praticien
          devait donc deviner qu'il fallait ouvrir un autre onglet pour
          apprendre qu'il était bloqué. Même traitement que les erreurs runtime,
          qui échappent déjà au filtre par phase : un bloqueur invisible est un
          bloqueur ignoré. Le libellé diffère volontairement de celui du panneau
          — deux nœuds portant le même texte casseraient le mode strict des E2E,
          et le panneau reste la source détaillée. */}
      {etatRuntime !== null
        && !etatRuntime.chargement
        && etatRuntime.erreur === null
        && etatRuntime.decisionBloquee && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-accent bg-status-warning/10 px-4 py-2 text-base text-status-warning"
        >
          <ShieldAlert aria-hidden="true" size={16} strokeWidth={2} className="shrink-0" />
          <span className="min-w-0">Protocole bloqué — bloqueurs décisionnels à revoir.</span>
          {!(ongletActif === 'cockpit' && phaseActive === 'actions') && (
            <button
              type="button"
              onClick={() => {
                setOngletActif('cockpit');
                setPhaseActive('actions');
              }}
              className="ml-auto min-h-9 shrink-0 rounded-lg border border-accent px-3 py-1 text-xs font-medium text-solar-ink hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Ouvrir la phase Actions
            </button>
          )}
        </div>
      )}

      {/* ------------------------------ Poste de pilotage ------------------ */}
      <div
        role="tabpanel"
        id="panneau-cockpit"
        aria-labelledby="onglet-cockpit"
        hidden={ongletActif !== 'cockpit'}
      >
        <section
          aria-label="Poste de pilotage clinique"
          className="overflow-hidden rounded-lg border border-border bg-muted shadow-card lg:h-[calc(100dvh-11.75rem)] lg:min-h-[420px] lg:grid lg:grid-rows-[auto,1fr]"
        >
          {/* En-tête du cockpit (bandeau trajectoire) = 1re rangée. Le signal
              de correction (B2) est hissé au niveau de la fiche pour rester
              visible depuis tous les onglets, pas seulement le cockpit. */}
          <div>
          {/* Bandeau trajectoire — toujours visible. Anatomie maquette cible :
              Spirale (emblème décoratif), identité en display `text-lg` (18px, la
              maquette disait 19), position en
              mono, chip d'état à droite. */}
          <div className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-[18px] py-3.5">
            <SpiraleTrajectoire enCours className="shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-lg font-bold leading-tight text-foreground">{nomComplet}</p>
              <p className="font-mono text-13 text-muted-foreground">
                {derniereReponse ? `Dernière réponse le ${derniereReponse}` : 'Aucune réponse reçue'}
              </p>
            </div>
            {/* Position d'épisode (SP-CONV LOT-02) — contrat partagé sur les
                cycles G2. Rien n'est affiché tant qu'aucun cycle n'existe. */}
            {bandeauEpisode && (
              <div className="min-w-0 border-l border-border pl-4">
                <p className="font-display text-sm font-semibold leading-tight text-foreground">
                  Épisode {bandeauEpisode.numeroEpisode} en cours
                </p>
                <p className="font-mono text-13 text-muted-foreground">{bandeauEpisode.positionLibelle}</p>
              </div>
            )}
            {/* Chip delta inter-tours : uniquement à version de score identique
                (A8-3) — sinon rien, jamais approximé. */}
            {bandeauEpisode?.deltaTourPrecedent && (
              <Chip variante="delta">
                Au tour précédent : momentum{' '}
                {bandeauEpisode.deltaTourPrecedent.tendance === 'hausse'
                  ? 'en hausse'
                  : bandeauEpisode.deltaTourPrecedent.tendance === 'baisse'
                    ? 'en baisse'
                    : 'stable'}{' '}
                ({bandeauEpisode.deltaTourPrecedent.delta > 0 ? '+' : ''}
                {bandeauEpisode.deltaTourPrecedent.delta})
              </Chip>
            )}
            <Chip variante="due" className="ml-auto">
              <IconeStatut statut={statutPhase(phaseCourante.id)} />
              Phase affichée : {phaseCourante.libelle} — {libelleStatut(phaseCourante.id, statutPhase(phaseCourante.id))}
            </Chip>
          </div>
          </div>

          <div className="lg:grid lg:min-h-0 lg:grid-cols-[13rem,1fr,15rem]">
            {/* Rail des 7 phases = colonne vertébrale */}
            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label="Cycle clinique"
              className="flex gap-1 overflow-x-auto border-b border-border p-2 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r"
            >
              <p className="hidden px-2 pb-1 text-2xs font-semibold uppercase tracking-[.07em] text-muted-foreground lg:block">
                Cycle clinique
              </p>
              {PHASES.map((phase, index) => {
                const actif = phaseActive === phase.id;
                const statut = statutPhase(phase.id);
                // Anatomie : ICÔNE de statut (les 4 statuts ont 4 formes —
                // l'audit du 2026-09-02 relevait que la puce colorée
                // confondait « à ouvrir » et « indéterminée ») + statut
                // textuel — jamais la couleur seule. La phase due (en attente)
                // porte le liseré solaire inset ; la phase affichée garde la
                // carte claire. Un seul box-shadow à la fois (ils ne se
                // composent pas entre classes Tailwind).
                const classesEtat = actif
                  ? 'bg-surface font-semibold text-foreground shadow-card'
                  : statut === 'en_attente'
                    ? 'bg-accent/10 font-semibold text-foreground shadow-[inset_3px_0_0_var(--color-accent)] hover:bg-accent/[.14]'
                    : 'text-muted-foreground hover:text-foreground';
                return (
                  <button
                    key={phase.id}
                    ref={element => {
                      refsPhases.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`phase-${phase.id}`}
                    aria-selected={actif}
                    aria-controls="zone-focale"
                    tabIndex={actif ? 0 : -1}
                    onClick={() => choisirPhase(phase.id)}
                    onKeyDown={event => onClavierRail(event, index)}
                    className={`flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 py-2 text-left text-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${classesEtat}`}
                  >
                    <IconeStatut statut={statut} />
                    {/* Le rang rend la SÉQUENCE visible : sans lui, les sept
                        libellés se lisaient comme des catégories
                        indépendantes, pas comme un cycle à parcourir. */}
                    <span className="min-w-0 flex-1 truncate">{index + 1}. {phase.libelle}</span>
                    <span className="shrink-0 text-2xs text-muted-foreground">{libelleStatut(phase.id, statut)}</span>
                  </button>
                );
              })}
            </div>

            {/* Zone focale unique */}
            <div
              role="tabpanel"
              id="zone-focale"
              aria-labelledby={`phase-${phaseCourante.id}`}
              tabIndex={0}
              className="flex flex-col gap-4 p-4 lg:min-h-0 lg:overflow-y-auto"
            >
              <div>
                {/* « Phase due » quand la phase affichée est celle qui attend
                    une action (maquette LOT-02) — sinon l'eyebrow neutre. */}
                <p className="text-xs font-semibold uppercase tracking-[.06em] text-solar-ink">
                  {statutPhase(phaseCourante.id) === 'en_attente' ? 'Phase due' : 'Zone focale'}
                </p>
                <h3 className="font-display text-xl font-bold text-foreground">{phaseCourante.libelle}</h3>
              </div>
              {focalLocal()}
              {/* Le runtime clinique reste monté en permanence : seul l'affichage
                  est filtré par phase — aucun rechargement, aucun brouillon perdu.
                  Le remontage au changement de dossier est porté PLUS HAUT, sur
                  ce composant lui-même ([[D-072]] §4, `page.tsx`) : c'est lui
                  qui détient l'état du dossier, pas seulement cette section. */}
              {/* LA FICHE EST PROPRIÉTAIRE DE LA LECTURE DE TRAJECTOIRE
                  (`trajectoirePartagee` / `onRechargerTrajectoire`). Elle la lit
                  déjà à l'ouverture — le bandeau d'épisode en a besoin — et la
                  section la relisait au montage : le MÊME GET, deux fois, pour
                  une seule ouverture de dossier. Les GET journalisant l'accès
                  (`G-TRUST-04`), le journal comptait deux accès là où le
                  praticien n'a ouvert le dossier qu'une fois. */}
              <ClinicalRuntimeSection
                idPatient={idPatient}
                fixture={fixtureErgo}
                protocolDraft={protocolDraftErgo}
                onFixtureReviewed={relectureErgo}
                phase={phaseCourante.runtime ?? 'aucune'}
                onAjusterProtocole={() => setPhaseActive('actions')}
                onOuvrirTrajectoire={() => {
                  setOngletActif('trajectoire');
                  requestAnimationFrame(() => document.getElementById('panneau-trajectoire')?.focus());
                }}
                onEtatChange={setEtatRuntime}
                trajectoirePartagee={trajectoire}
                statutTrajectoirePartage={etatTrajectoire}
                onRechargerTrajectoire={chargerTrajectoire}
                onPropositionsAssemblees={() => setAssemblages(n => n + 1)}
              />
            </div>

            {/* Instruments à tiroir */}
            <div className="flex flex-col gap-2 border-t border-border p-3 lg:border-l lg:border-t-0 lg:overflow-y-auto">
              <p className="px-1 text-2xs font-semibold uppercase tracking-[.07em] text-muted-foreground">Instruments</p>
              <InstrumentTiroir
                libelle="Les 12 besoins"
                description="Couverture descriptive et niveau de preuve, par besoin. Aucune priorité clinique n’est déduite ici."
                icone={ListChecks}
              >
                {tableauBesoins}
                <p className="mt-3 text-base text-muted-foreground">
                  Le détail complet (radar, sources) est disponible dans l’onglet « Les 12 besoins ».
                </p>
              </InstrumentTiroir>
              <InstrumentTiroir
                libelle="Objets cliniques & momentum"
                description="Cartographie neuro-fonctionnelle : les 5 objets cliniques et le momentum."
                icone={Activity}
              >
                {cartesObjetsCliniques}
              </InstrumentTiroir>
              <TiroirSyntheseInline idPatient={idPatient} />
              <InstrumentTiroir
                libelle="Agenda du sommeil"
                description="Recueil nuit par nuit (Q_SOM_09) : chronogramme, durée, efficacité, régularité."
                icone={Moon}
                large
              >
                <AgendaSommeilPraticienPanel idPatient={idPatient} />
              </InstrumentTiroir>
              <InstrumentTiroir
                libelle="Agenda alimentaire"
                description="Dossier de contrôle (Q_ALI_09) : horaires de prises, présences observées, jour par jour."
                icone={Utensils}
                large
              >
                <AgendaAlimentairePraticienPanel idPatient={idPatient} rythmeDeclare={rythmeDeclare} />
              </InstrumentTiroir>
              <InstrumentTiroir
                libelle="Détail des réponses"
                description="Détail technique des questionnaires reçus : scores, interprétations et qualité."
                icone={FileText}
                large
              >
                {tableauReponses}
              </InstrumentTiroir>
              <p className="px-1 text-xs text-muted-foreground">
                Chaque instrument s’ouvre au clic puis se referme : la densité ne s’empile plus dans la page.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------ Onglets in-fiche ------------------- */}
      <div role="tabpanel" id="panneau-besoins" aria-labelledby="onglet-besoins" hidden={ongletActif !== 'besoins'}>
        {ongletActif === 'besoins' && <DetailBesoinsPanel idPatient={idPatient} enteteMasquee />}
      </div>

      <div role="tabpanel" id="panneau-alimentation" aria-labelledby="onglet-alimentation" hidden={ongletActif !== 'alimentation'}>
        {ongletActif === 'alimentation' && <PractitionerFoodObservationPanel idPatient={idPatient} />}
      </div>

      <div
        role="tabpanel"
        id="panneau-correspondance"
        aria-labelledby="onglet-correspondance"
        hidden={ongletActif !== 'correspondance'}
      >
        {ongletActif === 'correspondance' && <CorrespondanceMedecinPanel idPatient={idPatient} />}
      </div>

      {/* HAUTEUR CONTENUE, DÉFILEMENT INTERNE (audit 2026-09-02, constat
          bloquant : « la pire page de défilement du produit » — l'onglet
          n'avait ni plafond ni overflow, tout partait en flux de page). Même
          patron que le Poste de pilotage (A6-R1 : on navigue, on ne
          défile pas la page) ; sous lg, le flux normal demeure, comme le
          cockpit. */}
      <div
        role="tabpanel"
        id="panneau-trajectoire"
        aria-labelledby="onglet-trajectoire"
        hidden={ongletActif !== 'trajectoire'}
        tabIndex={0}
        className="lg:h-[calc(100dvh-11.75rem)] lg:min-h-[420px] lg:overflow-y-auto"
      >
        {/* « Ce qui compte pour le patient » (Alliance 6.0-A, LOT-03) — ajout
            ADDITIF à l'onglet existant : la trajectoire de sens vit à côté des
            passations, elle ne s'y résume jamais. Aucun onglet n'est créé
            (`lib/praticien/ongletsFiche.ts`, module pur partagé serveur/client,
            n'est pas touché), et le panneau lit sa propre route — un échec de
            sa lecture ne dégrade pas la trajectoire affichée en dessous. */}
        {ongletActif === 'trajectoire' && (
          <div className="mb-4">
            <CeQuiComptePanel idPatient={idPatient} />
          </div>
        )}
        {ongletActif === 'trajectoire' &&
          (etatTrajectoire === 'chargement' || etatTrajectoire === 'inconnue' ? (
            <div role="status" className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground">
              Chargement de la trajectoire...
            </div>
          ) : etatTrajectoire === 'erreur' ? (
            // Un échec de lecture n'est JAMAIS présenté comme « aucun épisode » :
            // ce serait une affirmation fausse sur l'historique clinique.
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-accent bg-status-warning/10 p-4 text-base text-status-warning">
              <span>{erreurTrajectoire}</span>
              <button
                type="button"
                onClick={() => void chargerTrajectoire()}
                className="min-h-9 self-start rounded-lg border border-accent px-3 py-1 text-xs font-medium text-solar-ink hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <TrajectoirePanel
              trajectoire={trajectoire}
              idPatient={idPatient}
              nomComplet={nomComplet}
              // L'e-mail n'est passé que s'il désigne LE patient affiché : il
              // sert à déclencher un envoi au patient, et `data` peut porter
              // brièvement le dossier précédent après une navigation A→B.
              emailPatient={data?.patient?.idPatient === idPatient ? data.patient.email : undefined}
              modeViePresent={modeViePresent}
              modeVieT0CycleCourant={modeVieT0CycleCourant}
              needIdsPriorite={etatRuntime?.needIdsPrioriteSelectionnee}
            />
          ))}
      </div>
    </div>
    </ModeConsultation>
  );
}
