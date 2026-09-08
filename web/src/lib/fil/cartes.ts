/**
 * Le Fil du jour (SP-FIL LOT-01) — construction des cartes depuis les données
 * existantes. Fonctions pures, sans accès base : la route
 * `api/praticien/fil` fournit les lignes, ce module décide quoi montrer et
 * pourquoi. Chaque carte porte son « pourquoi maintenant » et une action
 * explicite — proposition, jamais capture (décision A6, REGISTRE_FRONTIERES).
 */

import { bornesJourParis, formatHeureParis } from './fuseau';
import { filtrerPassationsExploitables } from '@/lib/scoring/validite';

// `reponse_recente` a été retiré (accueil-observatoire LOT-02, décision
// propriétaire 2026-07-23) : les questionnaires reçus vivent dans l'inbox par
// patient (`lib/fil/inbox.ts`), plus dans le Fil. Les refus déjà posés sur ces
// clés restent en base, inertes (append-only). Mais l'inbox retire une réponse
// dès sa lecture confirmée — sans rien d'autre, un patient lu sans synthèse
// générée devient invisible partout. `synthese_a_generer` couvre ce trou.
export type TypeCarteFil =
  | 'consultation_prevue'
  | 'signalement_trust'
  | 'synthese_a_valider'
  | 'synthese_a_generer'
  | 'jalon_j21'
  | 't0_a_confirmer'
  | 'biologie_arbitree'
  | 'assignation_en_retard'
  | 'reprise';

export type CarteFil = {
  type: TypeCarteFil;
  idPatient: string;
  patient: string;
  titre: string;
  pourquoi: string;
  /** Date de l'événement (ISO), null si non datable. */
  date: string | null;
  href: string;
  actionLabel: string;
  /** Identité stable de la carte — voir `cleCarte`. */
  cle: string;
  /** Nombre de lignes sources portées par la carte (cartes agrégées) — 1 sinon. */
  nbElements?: number;
};

/**
 * Identité d'une carte du Fil (prérequis de G1 — refus persisté).
 *
 * Les cartes sont des projections recalculées à chaque ouverture : sans clé,
 * on ne peut pas dire ce qui a été refusé. La clé est **ancrée sur la ligne
 * source**, pas sur un triplet `type + patient + date` : une carte sans date
 * n'aurait pas de clé, et deux cartes de même type au même instant se
 * confondraient — le refus « sauterait » et la carte reviendrait le lendemain.
 *
 * Trois cartes font exception parce qu'elles sont agrégées et n'ont donc pas
 * de ligne source unique : `reprise` (clé = `idPatient + date de référence`,
 * stable tant que le patient reste inactif), `synthese_a_valider` (clé =
 * `agregat + idPatient + date de la synthèse la plus récente`) et
 * `synthese_a_generer` (même schéma, clé ancrée sur la lecture confirmée la
 * plus récente). Dans les trois cas, un fait nouveau déplace la date de
 * référence, donc la clé : la carte écartée REVIENT — c'est voulu, un fait
 * nouveau mérite une nouvelle décision. Les refus posés sur l'ancienne clé
 * restent en base, inertes (append-only, jamais nettoyés).
 */
export function cleCarte(type: TypeCarteFil, identifiant: string): string {
  return `${type}:${identifiant}`;
}

export type SignalementRow = {
  /** Identifiant de la ligne source, dans sa table d'origine. */
  id: string;
  idPatient: string;
  kind: 'effet_indesirable' | 'incident_confidentialite' | 'demande_droit';
  soumisLe: Date;
};
export type AssignationRow = {
  idAssignation: string;
  idPatient: string;
  titre: string;
  dateLimite: string | null;
  statut: string;
};
export type SyntheseRow = { idSynthese: string; idPatient: string; dateGeneration: Date };
/** Lecture confirmée la plus récente d'un patient — pas de ligne source
 * unique, cf. `cleCarte`. */
export type LectureRow = { idPatient: string; derniereLecture: Date };
/** Carte agrégée : pas de ligne source, donc pas d'identifiant à remonter. */
export type DerniereActiviteRow = { idPatient: string; derniereReponse: Date };

/** Sens du momentum tel que le porte l'équilibre (T0 → dernier jalon mesuré). */
export type TendanceMomentumCarte = 'hausse' | 'stable' | 'baisse';
/**
 * Jalon J21 atteint sans décision consignée. La ligne source est le check-in
 * J21 (`idCheckin`) : ancre stable pour le refus G1. `adhesion` et `momentum`
 * sont des enrichissements FACTUELS et OPTIONNELS — cités seulement s'ils
 * existent réellement, jamais inventés (A8-2 : jamais un 0 à la place d'un
 * jalon non mesuré).
 */
export type JalonRow = {
  idCheckin: string;
  idPatient: string;
  soumisLe: Date;
  adhesion?: string | null;
  momentum?: { tendance: TendanceMomentumCarte; delta: number } | null;
};

/** Inactivité au-delà de laquelle un patient est signalé en reprise. */
export const SEUIL_REPRISE_MOIS = 6;
/** Plafond de cartes par type pour garder le Fil lisible. */
export const MAX_CARTES_PAR_TYPE = 5;

const JOUR_MS = 24 * 60 * 60 * 1000;

const formatDateFr = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);

function nomPatient(noms: Map<string, string>, idPatient: string): string {
  return noms.get(idPatient) ?? 'Patient';
}

/** `dateLimite` est stockée en chaîne `YYYY-MM-DD` (cf. api/praticien/assignations). */
function parseDateLimite(dateLimite: string | null): Date | null {
  if (!dateLimite || !/^\d{4}-\d{2}-\d{2}$/.test(dateLimite)) return null;
  const d = new Date(`${dateLimite}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const LIBELLE_SIGNALEMENT: Record<SignalementRow['kind'], string> = {
  effet_indesirable: 'Effet indésirable suspecté',
  incident_confidentialite: 'Incident de confidentialité',
  demande_droit: 'Demande d’exercice de droit',
};

/** Rendez-vous planifié (accueil-observatoire LOT-04). Ligne source réelle. */
export type RendezVousRow = { id: string; idPatient: string; dateHeure: Date };

/** Délai (min) sous lequel une consultation est annoncée « dans X min » plutôt
 * qu'à son heure — au-delà, ou passée, on affiche l'heure. */
const IMMINENCE_CONSULTATION_MIN = 60;

/**
 * Consultations prévues aujourd'hui → cartes « Pré-vol prêt » horodatées.
 * Réutilise le pré-vol SP-COP (href `/dashboard/copilote?idPatient=`), rien de
 * nouveau côté préparation. Bornées au jour civil de `maintenant`.
 */
export function cartesConsultationsPrevues(
  rdvs: RendezVousRow[],
  noms: Map<string, string>,
  maintenant: Date,
): CarteFil[] {
  // Jour civil de Paris (le cabinet), pas le jour UTC du serveur.
  const { debut, fin } = bornesJourParis(maintenant);

  return rdvs
    .filter(r => r.dateHeure >= debut && r.dateHeure < fin)
    .sort((a, b) => a.dateHeure.getTime() - b.dateHeure.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(r => {
      const minutes = Math.round((r.dateHeure.getTime() - maintenant.getTime()) / 60000);
      const pourquoi =
        minutes >= 0 && minutes <= IMMINENCE_CONSULTATION_MIN
          ? `Consultation dans ${minutes} min.`
          : `Consultation à ${formatHeureParis(r.dateHeure)}.`;
      return {
        type: 'consultation_prevue' as const,
        idPatient: r.idPatient,
        patient: nomPatient(noms, r.idPatient),
        titre: 'Pré-vol prêt',
        pourquoi,
        date: r.dateHeure.toISOString(),
        href: `/dashboard/copilote?idPatient=${encodeURIComponent(r.idPatient)}`,
        actionLabel: 'Ouvrir le pré-vol',
        cle: cleCarte('consultation_prevue', r.id),
      };
    });
}

/** Signalements TRUST non traités : toujours en tête du Fil — c'est un
 * patient qui attend une réponse humaine. */
export function cartesSignalementsTrust(
  signalements: SignalementRow[],
  noms: Map<string, string>,
): CarteFil[] {
  return signalements
    .slice()
    .sort((a, b) => b.soumisLe.getTime() - a.soumisLe.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(s => ({
      type: 'signalement_trust' as const,
      idPatient: s.idPatient,
      patient: nomPatient(noms, s.idPatient),
      titre: LIBELLE_SIGNALEMENT[s.kind],
      pourquoi: `Déposé le ${formatDateFr(s.soumisLe)} — en attente de votre examen.`,
      date: s.soumisLe.toISOString(),
      href: '/dashboard/droits',
      actionLabel: 'Examiner',
      // Trois tables sources distinctes : le `kind` les désambiguïse.
      cle: cleCarte('signalement_trust', `${s.kind}:${s.id}`),
    }));
}

/**
 * Synthèses en brouillon, agrégées PAR PATIENT (« N relectures en attente »,
 * maquette Spirale). L'agrégat global de la maquette est impossible : le refus
 * G1 est ancré sur un patient (FK), une carte trans-patients n'aurait pas de
 * refus valide. Voir `cleCarte` pour la sémantique de la clé d'agrégat.
 */
export function cartesSynthesesAValider(
  syntheses: SyntheseRow[],
  noms: Map<string, string>,
): CarteFil[] {
  const parPatient = new Map<string, { nb: number; dateRef: Date }>();
  for (const s of syntheses) {
    const agregat = parPatient.get(s.idPatient);
    if (!agregat) {
      parPatient.set(s.idPatient, { nb: 1, dateRef: s.dateGeneration });
    } else {
      agregat.nb += 1;
      if (s.dateGeneration > agregat.dateRef) agregat.dateRef = s.dateGeneration;
    }
  }
  return [...parPatient.entries()]
    .sort((a, b) => b[1].dateRef.getTime() - a[1].dateRef.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(([idPatient, { nb, dateRef }]) => ({
      type: 'synthese_a_valider' as const,
      idPatient,
      patient: nomPatient(noms, idPatient),
      titre: `${nb} relecture${nb > 1 ? 's' : ''} en attente`,
      pourquoi: `Dernière synthèse générée le ${formatDateFr(dateRef)} — rien n'est diffusé sans votre validation.`,
      date: dateRef.toISOString(),
      href: '/dashboard/synthese',
      actionLabel: 'Relire',
      cle: cleCarte('synthese_a_valider', `agregat:${idPatient}:${dateRef.toISOString()}`),
      nbElements: nb,
    }));
}

/**
 * Questionnaire(s) lu(s) par le praticien sans qu'aucune synthèse n'ait été
 * générée depuis (ou jamais) — le trou laissé par l'inbox, qui retire une
 * réponse dès sa lecture confirmée (`lib/fil/inbox.ts`). Une carte par
 * patient, datée sur sa lecture confirmée la plus récente ; écartée dès
 * qu'une synthèse plus récente que cette lecture existe.
 */
export function cartesSynthesesAGenerer(
  lectures: LectureRow[],
  dernieresSyntheses: Map<string, Date>,
  noms: Map<string, string>,
): CarteFil[] {
  return lectures
    .filter(l => {
      const derniereGeneration = dernieresSyntheses.get(l.idPatient);
      return !derniereGeneration || l.derniereLecture > derniereGeneration;
    })
    .sort((a, b) => b.derniereLecture.getTime() - a.derniereLecture.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(l => ({
      type: 'synthese_a_generer' as const,
      idPatient: l.idPatient,
      patient: nomPatient(noms, l.idPatient),
      titre: 'Synthèse à générer',
      pourquoi: `Questionnaire lu le ${formatDateFr(l.derniereLecture)} — aucune synthèse générée depuis.`,
      date: l.derniereLecture.toISOString(),
      href: `/dashboard/synthese?idPatient=${encodeURIComponent(l.idPatient)}`,
      actionLabel: 'Générer la synthèse',
      cle: cleCarte('synthese_a_generer', `agregat:${l.idPatient}:${l.derniereLecture.toISOString()}`),
    }));
}

/**
 * Jalons J21 atteints sans décision de 21 jours consignée. Une carte par
 * patient, ancrée sur son check-in J21 (ligne source réelle → refus G1
 * standard). Le « pourquoi maintenant » cite la date du check-in, et — quand
 * ils existent réellement — l'action principale observée et le momentum.
 */
export type PassationRideauRow = {
  idPatient: string;
  idQuestionnaire: string;
  dateReponse: Date;
  statutValidite?: string | null;
};

/**
 * « Ce dossier attend son T0 » — la carte qui manquait ([[D-150]], constat
 * `M08`).
 *
 * CE QUE LA PRODUCTION DISAIT AVANT ELLE : quatre épisodes T0, quatre
 * patients, confirmés en moyenne **43 jours** après leur `targetAt`, de 27 à
 * 56 jours. La tolérance est de ±8 jours. Aucun des quatre n'est dans la
 * fenêtre — pas « la plupart », aucun. Le praticien recevait les réponses sans
 * qu'aucun écran ne lui dise qu'un geste était attendu à ce stade ; il
 * confirmait un mois plus tard, avec les réponses de la deuxième et de la
 * troisième semaine hors fenêtre, à réinclure une par une.
 *
 * CETTE CARTE APPELLE, ELLE NE JUGE PAS. Elle ne dit pas « le T0 est
 * confirmable » : les préconditions dures (rideau cotable, anamnèse consignée,
 * synthèse validée) s'évaluent par dossier et ont leur propre écran, qui reste
 * l'autorité. Elle dit ce qui est vrai et vérifiable à l'échelle du Fil — les
 * quatre instruments du rideau sont renseignés, aucun T0 n'est consigné — et
 * elle ouvre la fiche. Promettre davantage exigerait une évaluation par
 * patient au chargement de l'écran d'accueil, et ferait dire à une carte ce
 * que seul le dossier peut établir.
 *
 * LE STATUT DE VALIDITÉ PASSE PAR LE FILTRE GATÉ, jamais par un `where` SQL :
 * `validite.ts` le dit en toutes lettres — filtrer sans le drapeau ferait
 * disparaître des lignes que le LOT-00 s'est engagé à transmettre.
 */
export function cartesT0AConfirmer(
  /** Passations DÉJÀ bornées aux instruments du rideau par la route. */
  passationsRideau: PassationRideauRow[],
  premieresPassations: Map<string, Date>,
  patientsAvecEpisodeT0: Set<string>,
  /**
   * Taille du rideau, passée et non importée : `RIDEAU_T0` vit dans le module
   * des préconditions, dont la chaîne d'imports atteint `prisma`. Ce module
   * est pur par contrat — la route, qui a déjà la constante pour son `where`,
   * la lui transmet.
   */
  tailleRideau: number,
  noms: Map<string, string>,
  maintenant: Date,
): CarteFil[] {
  const instrumentsParPatient = new Map<string, Set<string>>();
  for (const p of filtrerPassationsExploitables(passationsRideau)) {
    const deja = instrumentsParPatient.get(p.idPatient) ?? new Set<string>();
    deja.add(p.idQuestionnaire);
    instrumentsParPatient.set(p.idPatient, deja);
  }

  return [...instrumentsParPatient.entries()]
    .filter(([idPatient, instruments]) =>
      instruments.size === tailleRideau && !patientsAvecEpisodeT0.has(idPatient))
    .map(([idPatient]) => ({ idPatient, cible: premieresPassations.get(idPatient) ?? null }))
    .filter((x): x is { idPatient: string; cible: Date } => x.cible !== null)
    // Le plus ancien d'abord : c'est le dossier qui attend son T0 depuis le
    // plus longtemps.
    .sort((x, y) => x.cible.getTime() - y.cible.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(({ idPatient, cible }) => {
      const jours = Math.floor((maintenant.getTime() - cible.getTime()) / JOUR_MS);
      // LA TOLÉRANCE A DISPARU DE CE TEXTE AVEC [[D-156]], et ce n'était pas
      // une reformulation : la carte annonçait que « les réponses arrivées
      // depuis devront être réincluses une à une ». C'était vrai — c'est
      // précisément ce que le praticien a fait trente-trois fois — et ça ne
      // l'est plus : l'ancre initiale embarque tout l'état d'entrée. Une carte
      // qui promet un travail supprimé apprend à se méfier de la carte.
      //
      // LE DÉLAI RESTE LE SIGNAL, lui, et c'est ce que [[D-150]] a mesuré
      // (43 jours en moyenne entre la cible et l'acte). Il se dit désormais
      // pour ce qu'il est — un dossier qui attend —, sans emprunter à une
      // fenêtre qui ne gouverne plus rien ici.
      const pourquoi =
        `Les ${tailleRideau} instruments du premier rideau sont renseignés et aucun T0 n'est consigné. `
        + `La première passation date du ${formatDateFr(cible)}, il y a ${jours} jour${jours > 1 ? 's' : ''}. `
        + `Toutes les réponses du dossier entreront dans l'épisode.`;
      return {
        type: 't0_a_confirmer' as const,
        idPatient,
        patient: nomPatient(noms, idPatient),
        titre: 'Premier rideau complet, T0 non consigné',
        pourquoi,
        date: cible.toISOString(),
        href: `/dashboard/patients/${idPatient}`,
        actionLabel: 'Ouvrir la fiche',
        // Clé agrégée, ancrée sur la date de référence du T0 : un dossier dont
        // la première passation change (reprise, réinclusion) mérite une
        // nouvelle décision, comme `reprise` et `synthese_a_valider`.
        cle: cleCarte('t0_a_confirmer', `agregat:${idPatient}:${cible.toISOString()}`),
        nbElements: tailleRideau,
      };
    });
}

export function cartesJalons(jalons: JalonRow[], noms: Map<string, string>): CarteFil[] {
  return jalons
    .slice()
    .sort((a, b) => b.soumisLe.getTime() - a.soumisLe.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(j => {
      const morceaux = [
        `Check-in J21 reçu le ${formatDateFr(j.soumisLe)} — décision de 21 jours à consigner.`,
      ];
      if (j.adhesion) morceaux.push(`Action principale : « ${j.adhesion} ».`);
      if (j.momentum) {
        morceaux.push(
          j.momentum.tendance === 'stable'
            ? 'Momentum stable.'
            : `Momentum en ${j.momentum.tendance} de ${Math.abs(j.momentum.delta)}.`,
        );
      }
      return {
        type: 'jalon_j21' as const,
        idPatient: j.idPatient,
        patient: nomPatient(noms, j.idPatient),
        titre: 'Jalon J21 atteint — décision attendue',
        pourquoi: morceaux.join(' '),
        date: j.soumisLe.toISOString(),
        href: `/dashboard/patients/${j.idPatient}`,
        actionLabel: 'Ouvrir la fiche',
        cle: cleCarte('jalon_j21', j.idCheckin),
      };
    });
}

/**
 * Ligne source d'une carte biologie (LOT-06) : une version de protocole
 * arbitrée (`confirme`/`infirme`) qu'aucune version ne supplante — la
 * différence entre deux artefacts persistés vit dans
 * `biologieArbitree.ts` (`arbitragesSansRevision`), même patron que J21.
 */
export type BiologieArbitreeCarteRow = {
  idPatient: string;
  protocolDraftId: string;
  arbitreLe: Date;
  nbIntentions: number;
};

/**
 * Biologie arbitrée, protocole pas encore révisé. Une carte par version
 * arbitrée, ancrée sur `protocolDraftId` (ligne source stable → refus G1
 * standard : une révision crée une NOUVELLE version, donc la carte disparaît
 * d'elle-même, jamais par nettoyage).
 */
export function cartesBiologieArbitree(
  lignes: BiologieArbitreeCarteRow[],
  noms: Map<string, string>,
): CarteFil[] {
  return lignes
    .slice()
    .sort((a, b) => b.arbitreLe.getTime() - a.arbitreLe.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(ligne => ({
      type: 'biologie_arbitree' as const,
      idPatient: ligne.idPatient,
      patient: nomPatient(noms, ligne.idPatient),
      titre: 'Biologie arbitrée — protocole à réviser',
      pourquoi:
        `Bilan arbitré le ${formatDateFr(ligne.arbitreLe)} `
        + `(${ligne.nbIntentions} intention${ligne.nbIntentions > 1 ? 's' : ''} en attente de résolution) : `
        + 'la version diffusée ne reflète pas encore le bilan.',
      date: ligne.arbitreLe.toISOString(),
      href: `/dashboard/patients/${ligne.idPatient}`,
      actionLabel: 'Ouvrir la fiche',
      cle: cleCarte('biologie_arbitree', ligne.protocolDraftId),
      nbElements: ligne.nbIntentions,
    }));
}

export function cartesAssignationsEnRetard(
  assignations: AssignationRow[],
  noms: Map<string, string>,
  maintenant: Date,
): CarteFil[] {
  const debutJour = new Date(maintenant);
  debutJour.setHours(0, 0, 0, 0);

  return assignations
    .filter(a => a.statut !== 'Complété')
    .map(a => ({ a, limite: parseDateLimite(a.dateLimite) }))
    .filter((x): x is { a: AssignationRow; limite: Date } => x.limite !== null && x.limite < debutJour)
    .sort((x, y) => x.limite.getTime() - y.limite.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(({ a, limite }) => {
      const joursRetard = Math.max(1, Math.floor((debutJour.getTime() - limite.getTime()) / JOUR_MS));
      return {
        type: 'assignation_en_retard' as const,
        idPatient: a.idPatient,
        patient: nomPatient(noms, a.idPatient),
        titre: a.titre,
        pourquoi: `Échéance dépassée depuis ${joursRetard} jour${joursRetard > 1 ? 's' : ''} (limite : ${formatDateFr(limite)}).`,
        date: limite.toISOString(),
        href: `/dashboard/patients/${a.idPatient}`,
        actionLabel: 'Ouvrir la fiche',
        cle: cleCarte('assignation_en_retard', a.idAssignation),
      };
    });
}

/**
 * Signal de reprise v1 : purement informatif, sans pack pré-composé (le pack
 * de réévaluation pré-composé arrive avec SP-SPI, après C2A — décision A6-5).
 */
export function cartesReprise(
  activites: DerniereActiviteRow[],
  noms: Map<string, string>,
  maintenant: Date,
): CarteFil[] {
  const seuil = new Date(maintenant);
  seuil.setMonth(seuil.getMonth() - SEUIL_REPRISE_MOIS);

  return activites
    .filter(a => a.derniereReponse < seuil)
    .sort((a, b) => a.derniereReponse.getTime() - b.derniereReponse.getTime())
    .slice(0, MAX_CARTES_PAR_TYPE)
    .map(a => {
      const mois = Math.max(
        SEUIL_REPRISE_MOIS,
        Math.floor((maintenant.getTime() - a.derniereReponse.getTime()) / (30 * JOUR_MS)),
      );
      return {
        type: 'reprise' as const,
        idPatient: a.idPatient,
        patient: nomPatient(noms, a.idPatient),
        titre: 'Suivi interrompu',
        pourquoi: `Dernières réponses il y a environ ${mois} mois — une réévaluation peut se discuter.`,
        date: a.derniereReponse.toISOString(),
        href: `/dashboard/patients/${a.idPatient}`,
        actionLabel: 'Ouvrir la fiche',
        // Seule carte agrégée du Fil : sa clé se fonde sur la date de référence
        // à défaut de ligne source. Voir `cleCarte`.
        cle: cleCarte('reprise', `${a.idPatient}:${a.derniereReponse.toISOString()}`),
      };
    });
}

/**
 * Résumé qualitatif du panneau « Aujourd'hui » (maquette : « 3 consultations ·
 * 2 relectures ») — remplace le compteur brut « N cartes ». Les consultations
 * ouvrent le résumé (maquette), même si dans le Fil les signalements passent
 * devant ; les cartes agrégées comptent leurs lignes sources (`nbElements`).
 */
const LIBELLES_RESUME: { type: TypeCarteFil; singulier: string; pluriel: string }[] = [
  { type: 'consultation_prevue', singulier: 'consultation', pluriel: 'consultations' },
  { type: 'signalement_trust', singulier: 'signalement', pluriel: 'signalements' },
  { type: 'synthese_a_valider', singulier: 'relecture', pluriel: 'relectures' },
  { type: 'synthese_a_generer', singulier: 'synthèse à générer', pluriel: 'synthèses à générer' },
  { type: 'jalon_j21', singulier: 'jalon', pluriel: 'jalons' },
  { type: 'biologie_arbitree', singulier: 'biologie arbitrée', pluriel: 'biologies arbitrées' },
  { type: 'assignation_en_retard', singulier: 'retard', pluriel: 'retards' },
  { type: 'reprise', singulier: 'reprise', pluriel: 'reprises' },
];

export function resumeFil(cartes: CarteFil[]): string {
  return LIBELLES_RESUME.map(({ type, singulier, pluriel }) => {
    const duType = cartes.filter(c => c.type === type);
    if (duType.length === 0) return null;
    const nb = duType.reduce((somme, c) => somme + (c.nbElements ?? 1), 0);
    return `${nb} ${nb > 1 ? pluriel : singulier}`;
  })
    .filter((libelle): libelle is string => libelle !== null)
    .join(' · ');
}

/**
 * Carte imminente : celle que la timeline met en avant (badge « Maintenant »,
 * action primaire). Avec des heures réelles (rendez-vous, LOT-04), c'est la
 * consultation À VENIR la plus proche ; à défaut, la tête de l'ordre fixe — ce
 * qui attend le praticien d'abord.
 */
export function indexCarteImminente(cartes: CarteFil[], maintenant?: Date): number {
  if (cartes.length === 0) return -1;
  if (maintenant) {
    const t = maintenant.getTime();
    let meilleur = -1;
    let plusProche = Infinity;
    cartes.forEach((c, i) => {
      if (c.type !== 'consultation_prevue' || !c.date) return;
      const d = new Date(c.date).getTime();
      if (d >= t && d < plusProche) {
        plusProche = d;
        meilleur = i;
      }
    });
    if (meilleur !== -1) return meilleur;
  }
  return 0;
}

/** Ordre du Fil : ce qui attend le praticien d'abord, les signaux ensuite. */
export function construireFil(entrees: {
  consultations?: RendezVousRow[];
  signalements?: SignalementRow[];
  syntheses: SyntheseRow[];
  lectures?: LectureRow[];
  dernieresSyntheses?: Map<string, Date>;
  jalons?: JalonRow[];
  passationsRideau?: PassationRideauRow[];
  premieresPassations?: Map<string, Date>;
  patientsAvecEpisodeT0?: Set<string>;
  tailleRideauT0?: number;
  biologiesArbitrees?: BiologieArbitreeCarteRow[];
  assignations: AssignationRow[];
  activites: DerniereActiviteRow[];
  noms: Map<string, string>;
  maintenant: Date;
}): CarteFil[] {
  const {
    consultations = [],
    signalements = [],
    syntheses,
    lectures = [],
    dernieresSyntheses = new Map<string, Date>(),
    jalons = [],
    passationsRideau = [],
    premieresPassations = new Map<string, Date>(),
    patientsAvecEpisodeT0 = new Set<string>(),
    tailleRideauT0 = 0,
    biologiesArbitrees = [],
    assignations,
    activites,
    noms,
    maintenant,
  } = entrees;
  return [
    // Un signalement TRUST attend une réponse humaine : il précède tout, même
    // une consultation imminente. Viennent ensuite les consultations du jour.
    ...cartesSignalementsTrust(signalements, noms),
    ...cartesConsultationsPrevues(consultations, noms, maintenant),
    ...cartesSynthesesAValider(syntheses, noms),
    ...cartesSynthesesAGenerer(lectures, dernieresSyntheses, noms),
    // Le T0 précède le J21 : un dossier qui n'a pas son repère de départ ne
    // peut pas produire de jalon suivant. La carte passe donc devant.
    ...cartesT0AConfirmer(
      passationsRideau, premieresPassations, patientsAvecEpisodeT0, tailleRideauT0, noms, maintenant,
    ),
    ...cartesJalons(jalons, noms),
    // Une biologie arbitrée sans révision retient une décision déjà prise :
    // elle passe après les jalons (décision à prendre), avant les retards.
    ...cartesBiologieArbitree(biologiesArbitrees, noms),
    ...cartesAssignationsEnRetard(assignations, noms, maintenant),
    ...cartesReprise(activites, noms, maintenant),
  ];
}
