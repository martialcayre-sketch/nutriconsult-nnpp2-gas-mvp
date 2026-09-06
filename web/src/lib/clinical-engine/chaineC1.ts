import {
  ABSTENTION_PROCEDURE_V1,
  CANAL_PLAINTE,
  evaluerPriorites,
  reglesPrioritesValidees,
  tablePrioritesSignee,
} from '@/lib/clinical/priorityRulesV1';
import { evaluerGatePopulation } from '@/lib/clinical/gatePopulationV1';
import type { ReponseOrientation } from '@/lib/clinical/orientationEngine';
import { scoresRecalculesPourRaisonnement } from '@/lib/clinical/orientationService';
import { etatIntegralementInconnu, type EtatPopulation } from '@/lib/consultation/etatPopulation';
import { buildClinicalReview } from './clinicalReview';
import { buildClinicalSnapshot } from './clinicalSnapshot';
import { buildDecisionCard } from './decisionCard';
import { construireSafetyFindings, type EffetIndesirableRuntime } from './safetyFindings';
import type {
  AbstentionAssessment,
  ClinicalReview,
  ClinicalSnapshot,
  ConfirmedAssessmentEpisode,
  DecisionCard,
  DecisionPriorityCandidate,
  DecisionPrioritySelection,
  PatientContext,
  QuestionnaireResponseInput,
} from './types';

// CONSTRUCTION DE LA CHAÎNE C1 — snapshot → revue → carte de décision.
//
// UN SEUL CHEMIN, DEUX APPELANTS ([[D-054]], arbitrage 6). Le cockpit
// (`POST /api/praticien/cockpit`) construit la chaîne ; les deux points de
// persistance la RECONSTRUISENT pour comparer les empreintes soumises
// (`verifierChaineC1.ts`). Deux constructions divergentes rendraient 409 sur une
// carte honnête — c'est exactement pourquoi ce module existe plutôt qu'un second
// bloc de code recopié dans le vérificateur.
//
// CE MODULE NE FAIT PAS : ni authentification, ni contrôle d'appartenance, ni
// lecture base, ni journalisation. Mêmes frontières qu'`orientationService` :
// l'appelant les porte, et il les porte AVANT.

/**
 * La plainte que le patient déclare le plus intensément, telle que `Q_MOD_03`
 * la publie.
 *
 * Ce n'est PAS une sortie de règle : c'est la restitution d'une bande déjà
 * publiée par un instrument certifié. Elle n'est donc pas derrière le verrou de
 * signature ([[D-054]], arbitrage 7), et elle ne conclut rien — l'échelle est
 * descriptive, sa source Drive le dit (« questionnaire de suivi longitudinal,
 * sans seuil diagnostique »).
 */
export type PlainteDominante = {
  /** Identifiant du domaine, tel que le catalogue le nomme (`digestion`…). */
  domaine: string;
  /** Libellé français publié par le catalogue (« Digestion »). */
  libelle: string;
  /** Intensité déclarée, de 1 à 10. */
  valeur: number;
  /** Bande d'interprétation publiée, ou `null` si le catalogue n'en sert pas. */
  bande: string | null;
};

export type ChaineC1 = {
  snapshot: ClinicalSnapshot;
  review: ClinicalReview;
  decisionCard: DecisionCard;
  plainteDominante: PlainteDominante | null;
};

export type EntreeChaineC1 = {
  /** Identifiants d'enveloppe — EXCLUS des trois empreintes, par construction. */
  snapshotId: string;
  reviewId: string;
  decisionCardId: string;
  patientId: string;
  /**
   * Horodatage unique de la chaîne : `snapshot.asOf`, `review.createdAt` et
   * `decisionCard.createdAt`. Le cockpit en pose UN SEUL (`new Date()` à la
   * confirmation) et le vérificateur réutilise celui qui a été soumis — ces
   * trois champs entrent dans les empreintes, contrairement aux identifiants.
   */
  horodatage: string;
  episode: ConfirmedAssessmentEpisode;
  patientContext: PatientContext;
  responses: QuestionnaireResponseInput[];
  /**
   * Sélection praticien, ou `null`.
   *
   * UN GESTE, PAS UNE DÉRIVATION — mais un geste désormais CONSIGNÉ ([[D-127]]).
   * `D-054` arbitrage 5 le nommait « le seul champ que le serveur ne peut pas
   * recalculer » : c'était vrai tant qu'aucune table ne le portait. Le cockpit
   * ET le vérificateur le relisent maintenant en base, par la même fonction
   * (`lireSelectionPriorite`), et plus depuis le corps de requête.
   *
   * `buildDecisionCard` le re-valide entièrement et JETTE si l'acte ne tient
   * plus — décision bloquée, ou candidat que le recalcul ne produit plus. Ce
   * refus est voulu ; ce qu'il ne faut pas, c'est qu'il emporte la chaîne
   * entière. `construireChaineC1Tolerante` s'en charge côté appelant.
   */
  selectionPraticien?: DecisionPrioritySelection | null;
  /**
   * Les signaux d'alerte déclarés à l'anamnèse, bruts et triés
   * (`signauxDeclares`, appelé par `adaptRuntimeInputs`).
   *
   * ENTRÉE OBLIGATOIRE, jamais optionnelle : un défaut `[]` ferait passer
   * « aucun signal » et « je n'ai pas regardé » pour la même chose, ce que
   * `DC-24` interdit. Un appelant qui n'a pas d'anamnèse passe explicitement la
   * liste vide que `signauxDeclares` rend sur une anamnèse absente.
   */
  signauxAlerte: string[];
  /**
   * L'état de population déclaré par le patient ([[D-101]], LOT-05).
   *
   * ENTRÉE OBLIGATOIRE, exactement comme `signauxAlerte` et pour la même
   * raison : `lireEtatPopulation` rend toujours les sept critères, et un défaut
   * posé ici ferait passer « état inconnu » pour un état lu. Un appelant sans
   * anamnèse passe explicitement ce que `lireEtatPopulation(null)` rend — un
   * état intégralement `inconnu`, qui se DIT au praticien.
   */
  etatPopulation: EtatPopulation;
  /**
   * Les signalements d'effet indésirable du dossier ([[D-101]], `DC-42`).
   *
   * OPTIONNEL, ET C'EST LE SEUL CHAMP DE CE TYPE QUI L'EST. Il ne dit pas
   * « aucun signalement » : il dit que l'appelant n'a pas interrogé la table —
   * ce que fait tout appelant tant que `interruptionEffetIndesirableActive()`
   * est faux, c'est-à-dire tant que la règle n'est pas signée ET le drapeau
   * posé. Le distinguer d'une liste vide n'apporterait rien ici : dispositif
   * éteint, il n'y a pas de lecture à qualifier. Le jour où il s'allume, les
   * DEUX appelants (cockpit et vérificateur) le passent par la même fonction,
   * sans quoi la carte recalculée divergerait de la carte émise.
   */
  effetsIndesirables?: EffetIndesirableRuntime[];
};

/** Un objet de score lisible — typage défensif, le JSON n'est pas garanti. */
type ScoresLus = Record<string, unknown> | null;

type SousScoreLu = { id?: unknown; label?: unknown; total?: unknown; interpretation?: unknown };

/**
 * Dernière passation exploitable par instrument, SCORE RECALCULÉ.
 *
 * RECALCUL À LA LECTURE, jamais le score figé en base : c'est la fermeture
 * qu'`orientationService` a posée le 2026-08-04 et que `preconditionsT0` réutilise
 * — une garde de scoring ajoutée après coup ne touche aucune passation déjà
 * enregistrée. Les cinq motifs d'annulation viennent avec la fonction ; les
 * recopier ici les aurait fait diverger.
 *
 * `statutValidite` n'est pas transporté par `QuestionnaireResponseInput` : la
 * chaîne C1 reçoit des passations DÉJÀ filtrées par
 * `filtrerPassationsExploitables` en amont (cockpit comme vérificateur). Le
 * cinquième motif est donc appliqué avant d'arriver ici, pas ignoré.
 *
 * PÉRIMÈTRE : les réponses INCLUSES dans l'épisode confirmé, et elles seules.
 * C'est ce qui garantit que toute `provenance` produite plus bas désigne une
 * source réellement présente au snapshot — `validateProvenance` jette sinon.
 */
function dernieresParInstrument(
  responses: QuestionnaireResponseInput[],
  episode: ConfirmedAssessmentEpisode,
): Map<string, ReponseOrientation & { responseId: string; scores: ScoresLus }> {
  const inclus = new Set(episode.includedResponseIds);
  const dernieres = new Map<string, ReponseOrientation & { responseId: string; scores: ScoresLus }>();
  for (const response of responses) {
    if (!inclus.has(response.responseId)) continue;
    const courante = dernieres.get(response.questionnaireId);
    // Départage stable : l'horodatage d'abord, l'identifiant ensuite. L'ordre
    // SQL ne l'est pas, et deux passations au même instant produiraient sinon
    // deux chaînes différentes pour un même dossier — donc un 409 sur une carte
    // honnête.
    if (courante && (
      courante.dateReponse > response.observedAt
      || (courante.dateReponse === response.observedAt && courante.responseId >= response.responseId)
    )) continue;
    dernieres.set(response.questionnaireId, {
      idQuestionnaire: response.questionnaireId,
      dateReponse: response.observedAt,
      responseId: response.responseId,
      scores: scoresRecalculesPourRaisonnement(
        response.questionnaireId,
        (response.scoresJson ?? null) as Record<string, unknown> | null,
        new Date(response.observedAt),
      ),
    });
  }
  return dernieres;
}

/** Le canal de plainte rend-il une MESURE — et non un simple objet de score ? */
function canalPlainteMesure(scores: ScoresLus): boolean {
  // Le piège du dépôt, une troisième fois : un objet de score N'EST PAS une
  // mesure. `calculateScore` rend `{scored:false, total:null}` sur une passation
  // vide, et le moteur `plaintes_actuelles` rend `total: null` dès qu'un des
  // sept domaines manque. Tester `scores !== null` dirait « mesuré » d'un
  // questionnaire sans une seule réponse (`DC-24`). Même prédicat que
  // `passationExploitable` dans `preconditionsT0.ts`.
  if (scores === null) return false;
  if (scores.scored === false) return false;
  return typeof scores.total === 'number';
}

/**
 * Le domaine de plainte le plus intense, ou `null`.
 *
 * DÉPARTAGE, ET IL EST TECHNIQUE — dit comme tel ([[D-054]], arbitrage 8). À
 * valeur égale, le premier domaine dans l'ordre où le catalogue les publie
 * l'emporte (fatigue, douleurs, digestion, surpoids, sommeil, moral, mobilité).
 * Ce n'est PAS une hiérarchie clinique : c'est le seul moyen de rendre
 * l'affichage stable d'une lecture à l'autre. Un départage clinique — quelle
 * plainte prime à intensité égale — est un arbitrage praticien qui n'a pas été
 * rendu.
 */
export function plainteDominanteDepuisScores(scores: ScoresLus): PlainteDominante | null {
  if (scores === null) return null;
  const sousScores = scores.subScores;
  if (!Array.isArray(sousScores)) return null;
  let dominante: PlainteDominante | null = null;
  for (const brut of sousScores as SousScoreLu[]) {
    // Un domaine sans réponse rend `total: null` : il n'entre pas. Une absence
    // n'est ni un zéro ni une plainte faible (`DC-24`).
    if (typeof brut?.total !== 'number' || typeof brut.id !== 'string') continue;
    if (dominante !== null && brut.total <= dominante.valeur) continue;
    const interpretation = brut.interpretation as { label?: unknown } | null | undefined;
    dominante = {
      domaine: brut.id,
      libelle: typeof brut.label === 'string' ? brut.label : brut.id,
      valeur: brut.total,
      bande: typeof interpretation?.label === 'string' ? interpretation.label : null,
    };
  }
  return dominante;
}

const LIMITATION_PROPOSITION =
  'Une priorité candidate est une proposition hiérarchisée soumise au praticien : elle n’est ni un diagnostic, ni une prescription.';
const LIMITATION_CLASSEMENT =
  'Le classement est déterministe et sert la lisibilité : il ne mesure ni la gravité, ni l’urgence.';
const LIMITATION_OBJECTIF =
  'L’objectif prioritaire déclaré par le patient est affiché au praticien ; il n’entre pas dans le déclenchement de cette règle.';
const LIMITATION_ETAT_INCONNU =
  'Aucun état de population n’a été déclaré sur ce dossier (grossesse, allaitement, pathologie rénale ou hépatique, chirurgie digestive, maladie cœliaque, exclusion alimentaire) : la gate de population n’avait rien à vérifier.';

/** Identifiants des deux motifs `required`, tels que la table signée les porte. */
const MOTIF_SECURITE = 'ABST-SEC-01';
const MOTIF_CANAL = 'ABST-CAN-01';

/**
 * Le motif d'abstention portant cet `id`, ou une ERREUR DE CONSTRUCTION.
 *
 * LIAISON PAR IDENTITÉ, JAMAIS PAR POSITION (finding M1 de la revue du
 * 2026-08-16). La lecture précédente déstructurait `motifsRequired` dans
 * l'ordre du tableau : permuter les deux motifs de la table signée aurait servi
 * le texte SÉCURITÉ sur la branche canal et réciproquement, et un troisième
 * motif inséré en tête aurait été ignoré en silence — deux mutations qu'aucun
 * banc n'aurait vues.
 *
 * Les deux `id` cités ici sont du CÂBLAGE — identité, pas contenu clinique —,
 * même statut que l'ordre d'évaluation resté dans ce module selon [[D-062]] ;
 * le moteur n'est pas dans le périmètre haché.
 *
 * L'ABSENCE JETTE, et ce n'est pas un cas clinique : c'est le moteur et la
 * table signée qui ont divergé. Servir `undefined` produirait une limitation
 * vide sous un verdict d'abstention — exactement ce qu'un fail-closed ne doit
 * pas faire.
 */
function motifRequis(id: string): (typeof ABSTENTION_PROCEDURE_V1.motifsRequired)[number] {
  const motif = ABSTENTION_PROCEDURE_V1.motifsRequired.find(candidat => candidat.id === id);
  if (!motif) {
    throw new Error(
      `Motif d’abstention introuvable dans la table signée : ${id}. `
      + 'Le moteur et la procédure d’abstention signée ont divergé.',
    );
  }
  return motif;
}

/**
 * Évaluation EXPLICITE de l'abstention ([[D-054]], [[D-062]]).
 *
 * Table non signée ⇒ `undefined` : `buildClinicalReview` retombe alors sur son
 * `not_evaluated` habituel, avec sa propre limitation.
 *
 * DEUX MOTIFS DE `required`, ET AUCUN N'AJOUTE DE POINTS (`DC-12`, `DC-23`) :
 * un constat de sécurité, qui prime sur tout score et appelle une revue ; ou un
 * canal de plainte non mesurable sur l'épisode confirmé, auquel cas la table ne
 * peut RIEN évaluer et l'absence de donnée ne devient pas une normalité
 * (`DC-24`, `DC-25`).
 *
 * LA DETTE BLOQUANTE DE [[D-054]] EST FERMÉE ([[D-062]]). Cette fonction ne
 * décide plus rien par elle-même : elle APPLIQUE `ABSTENTION_PROCEDURE_V1`,
 * qui vit dans la table signée et entre dans `PRIORITY_RULES_SHA256`. Les
 * textes servis au praticien sont des données signées, plus des littéraux du
 * moteur. Ce qui reste ici est l'ordre d'évaluation et le câblage des entrées —
 * mécanique, non clinique.
 *
 * LA BRANCHE `safetyFindings > 0` EST ATTEIGNABLE DEPUIS [[D-099]] (LOT-04) :
 * `construireSafetyFindings` alimente le terme depuis les signaux d'alerte
 * d'anamnèse de rang `adressage`. Elle a été inatteignable du 2026-08-12 au
 * 2026-08-23 — `construireChaineC1` posait `0` en dur faute de producteur —, et
 * c'est ce que disait la version précédente de ce bloc. L'export reste utile au
 * banc de la table (`priorityRulesV1.test.ts` joue les deux motifs sur une table
 * permutée, hors de tout dossier), et il reste sous surveillance :
 * `evaluerAbstentionImporteurs.guard.test.ts` refuse tout appelant nouveau qui
 * rendrait le verdict signé hors du verrou de signature.
 */
export function evaluerAbstention(input: {
  ruleIds: string[];
  safetyFindings: number;
  canalMesure: boolean;
}): AbstentionAssessment | undefined {
  if (input.ruleIds.length === 0) return undefined;
  const motifSecurite = motifRequis(MOTIF_SECURITE);
  const motifCanal = motifRequis(MOTIF_CANAL);
  const cadre = [ABSTENTION_PROCEDURE_V1.cadre];
  if (input.safetyFindings > 0) {
    return {
      status: 'required',
      ruleIds: input.ruleIds,
      limitations: [...cadre, motifSecurite.limitation],
    };
  }
  if (!input.canalMesure) {
    return {
      status: 'required',
      ruleIds: input.ruleIds,
      limitations: [...cadre, motifCanal.limitation],
    };
  }
  return {
    status: 'not_required',
    ruleIds: input.ruleIds,
    limitations: [...cadre, ABSTENTION_PROCEDURE_V1.notRequired.limitation],
  };
}

/**
 * Construit la chaîne C1 complète pour un épisode T0 confirmé.
 *
 * Fonction déterministe : mêmes entrées ⇒ mêmes empreintes. C'est la propriété
 * dont dépend tout le recalcul serveur.
 */
export function construireChaineC1(input: EntreeChaineC1): ChaineC1 {
  const snapshot = buildClinicalSnapshot({
    snapshotId: input.snapshotId,
    patientId: input.patientId,
    asOf: input.horodatage,
    assessmentEpisode: input.episode,
    patientContext: input.patientContext,
    responses: input.responses,
  });

  const dernieres = dernieresParInstrument(input.responses, input.episode);
  const canal = dernieres.get(CANAL_PLAINTE);
  const plainteDominante = canal ? plainteDominanteDepuisScores(canal.scores) : null;

  const regles = reglesPrioritesValidees();
  // LE PRODUCTEUR DE CONSTATS DE SÉCURITÉ ([[D-099]], LOT-04). `safetyFindings: 0`
  // était posé en dur ici, et le JSDoc d'`evaluerAbstention` documentait sa
  // branche `> 0` comme inatteignable : les deux affirmations tombent avec cette
  // ligne. Le chemin n'est plus câblé « pour le jour où », il est alimenté.
  const securite = construireSafetyFindings(input.signauxAlerte, input.effetsIndesirables);
  const abstention = evaluerAbstention({
    // Les règles de PRIORITÉ, et elles seules : `abstention.ruleIds` nomme ce
    // que l'abstention suspend, pas ce qui la déclenche. La règle de sécurité
    // est jointe à `rules` (elle doit y être pour que la revue accepte les
    // constats), jamais à cette liste.
    ruleIds: regles.map(regle => regle.ruleId),
    safetyFindings: securite.findings.length,
    canalMesure: canalPlainteMesure(canal?.scores ?? null),
  });

  const review = buildClinicalReview({
    reviewId: input.reviewId,
    createdAt: input.horodatage,
    snapshot,
    // `normalizeFindings` exige qu'un constat de sécurité cite une règle
    // cliniquement validée PRÉSENTE dans cette liste : sans la joindre, la revue
    // jetterait sur le premier signal déclaré.
    rules: [...regles, ...securite.rules],
    findings: {
      ...(abstention ? { abstention } : {}),
      safetyFindings: securite.findings,
    },
    // Ce que le second producteur a lu sans pouvoir conclure ([[D-101]]) : un
    // signalement ouvert que le patient n'a rattaché à aucun protocole. La
    // revue le porte, la carte le reprend, l'écran le rend.
    limitations: securite.limitations,
  });

  const candidats = construireCandidats({
    dernieres,
    plainteDominante,
    priorityGoal: input.patientContext.priorityGoal,
    // `review.abstention` et non l'objet local : c'est le statut NORMALISÉ, celui
    // que `buildClinicalReview` a pu ramener à `not_evaluated` faute de règle
    // validée. Lire l'intention plutôt que le verdict laisserait produire des
    // candidats sous une abstention que la revue n'a pas retenue.
    abstention: review.abstention.status,
    etatPopulation: input.etatPopulation,
  });
  const decisionCard = buildDecisionCard({
    decisionCardId: input.decisionCardId,
    createdAt: input.horodatage,
    snapshot,
    review,
    candidates: candidats,
    // Le rang 1 est PROPOSÉ, jamais sélectionné. `buildDecisionCard` le remet à
    // `null` dès que la décision est bloquée ou qu'aucun candidat n'existe.
    proposedMainPriorityId: candidats[0]?.candidateId ?? null,
    selectedMainPriority: input.selectionPraticien ?? null,
  });

  return { snapshot, review, decisionCard, plainteDominante };
}

/**
 * Les priorités candidates, classées — ou RIEN quand la table n'est pas signée.
 *
 * `origin: 'engine'` toujours : `buildDecisionCard` refuse toute autre valeur, et
 * l'interdit du lot est explicite — aucun candidat produit par le LLM.
 */
function construireCandidats(input: {
  dernieres: Map<string, ReponseOrientation & { responseId: string }>;
  plainteDominante: PlainteDominante | null;
  priorityGoal: string | null;
  abstention: AbstentionAssessment['status'];
  etatPopulation: EtatPopulation;
}): DecisionPriorityCandidate[] {
  if (!tablePrioritesSignee()) return [];
  // UNE ABSTENTION REQUISE FAIT TAIRE LA TABLE (`DC-25`) — relevé en revue le
  // 2026-08-12.
  //
  // Le cas qui l'impose n'est pas théorique : `Q_MOD_03` amputé d'un seul
  // domaine rend `total: null`, ce qui déclare le canal de plainte non
  // mesurable — et pourtant les six domaines répondus, eux, portaient encore
  // leurs valeurs. La table se déclenchait donc sur un recueil que la revue
  // venait de déclarer insuffisant, et la carte servait des priorités à côté
  // d'une abstention qui disait de ne pas conclure.
  //
  // `buildDecisionCard` aurait bien remis `proposedMainPriorityId` à `null` (la
  // décision est `blocked`), mais il aurait GARDÉ les candidats classés : le
  // praticien aurait lu une liste hiérarchisée sous un bandeau de suspension.
  // Données insuffisantes ⇒ on réduit la conclusion, on ne l'habille pas.
  if (input.abstention !== 'not_required') return [];
  const declenchees = evaluerPriorites(input.dernieres);

  // LA GATE DE POPULATION, ET ELLE EST ICI ([[D-101]], `DC-43`).
  //
  // ICI, C'EST-À-DIRE ENTRE `evaluerPriorites` ET LE `sort` QUI SUIT. La place
  // est la règle elle-même : « un candidat écarté par une gate ne doit jamais
  // avoir été classé ». Filtrer après le tri aurait donné le même tableau final
  // et une propriété différente — un candidat écarté aurait porté un rang, et
  // ce rang aurait existé. Le banc l'assertionne sur L'ORDRE, pas sur la
  // présence, précisément parce que les deux se ressemblent à l'arrivée.
  //
  // La table de curation est VIDE au 2026-08-23 : aucun candidat n'est écarté,
  // et chacun repart avec le motif « exclusions non curées » que la boucle plus
  // bas verse dans ses `limitations`. Le verdict est conservé par candidat —
  // pas recalculé plus loin — pour qu'un seul appel décide et parle.
  const verdicts = new Map(
    declenchees.map(declenchee => [
      declenchee.regle.id,
      evaluerGatePopulation(declenchee.regle.id, input.etatPopulation),
    ]),
  );
  const retenues = declenchees.filter(
    declenchee => verdicts.get(declenchee.regle.id)?.statut !== 'ecarte',
  );

  // CLASSEMENT — la plainte dominante d'abord, la priorité intrinsèque de la
  // table ensuite, l'identifiant en dernier ressort. Le troisième terme n'est
  // pas décoratif : sans lui, deux règles de même priorité s'ordonneraient selon
  // l'ordre de la table, qu'une édition future déplacerait en silence.
  const classees = [...retenues].sort((gauche, droite) => {
    const rangPlainte = (candidate: typeof gauche) => (
      candidate.regle.domainePlainte !== null
      && candidate.regle.domainePlainte === input.plainteDominante?.domaine
        ? 0 : 1
    );
    return rangPlainte(gauche) - rangPlainte(droite)
      || gauche.regle.priorite - droite.regle.priorite
      || (gauche.regle.id < droite.regle.id ? -1 : gauche.regle.id > droite.regle.id ? 1 : 0);
  });

  return classees.map((declenchee, index) => {
    // Les instruments viennent de l'ATTEINTE, plus de la forme statique de la
    // règle ([[D-060]] §4) : `evaluerPriorites` les collecte déclencheur par
    // déclencheur, et sous un `ou` seule la branche qui a décidé est citée.
    // Re-dériver ici depuis `regle.declencheurs` ferait entrer dans
    // `inputHash` des passations qui n'ont rien décidé.
    const responseIds = declenchee.instruments
      .map(idQuestionnaire => input.dernieres.get(idQuestionnaire)?.responseId)
      .filter((responseId): responseId is string => typeof responseId === 'string');
    return {
      candidateId: `priority:${declenchee.regle.id}`,
      origin: 'engine' as const,
      label: declenchee.regle.libelle,
      // Rang SÉQUENTIEL, jamais la priorité de la table : `buildDecisionCard`
      // exige des rangs uniques, et deux règles de même priorité intrinsèque le
      // feraient jeter.
      rank: index + 1,
      // `à_documenter`, la plus réservée des quatre valeurs, et toujours elle :
      // une règle déterministe ne produit aucune gradation de confiance
      // ([[D-041]]). Le champ est obligatoire au contrat C1 ; il dit ici que le
      // praticien reste celui qui documente.
      confidence: 'à_documenter' as const,
      ruleId: declenchee.regle.id,
      rationale: `${declenchee.regle.motif} Déclencheur atteint — ${declenchee.conditions.join(' ; ')}.`,
      // Uniquement des sources RÉELLEMENT présentes au snapshot : `dernieres` est
      // bornée aux réponses incluses dans l'épisode confirmé.
      provenance: { responseIds, needIds: declenchee.regle.needIds, clinicalObjectCodes: [] },
      limitations: [
        ...declenchee.regle.limitations,
        LIMITATION_PROPOSITION,
        LIMITATION_CLASSEMENT,
        ...(input.priorityGoal ? [LIMITATION_OBJECTIF] : []),
        // LE MOTIF DE LA GATE, DANS LE SENS QUI PASSE (`DC-35`). Le sens qui
        // mord — « écarté » — ne peut par construction pas s'afficher ici : le
        // candidat n'est plus dans la liste. C'est voulu, et c'est la règle ;
        // ce que le praticien doit lire sur un candidat PRÉSENT, c'est ce que
        // la gate n'a PAS pu vérifier. Sans cette ligne, « ouvert par défaut »
        // et « vérifié » auraient exactement la même apparence à l'écran.
        //
        // `!` plutôt qu'un repli : la carte est construite depuis `retenues`,
        // qui vient de `verdicts` — un candidat sans verdict serait une
        // incohérence de ce module, pas un cas clinique.
        verdicts.get(declenchee.regle.id)!.motif,
        // DEUX IGNORANCES DISTINCTES, ET LES CONFONDRE FERAIT PORTER À LA
        // CURATION UN MANQUE QUI VIENT DU DOSSIER. « Les exclusions ne sont pas
        // curées » parle du corpus ; « le patient n'a rien déclaré » parle de
        // l'anamnèse — un dossier antérieur à la section « État actuel » n'en
        // porte aucune réponse, et ce n'est la faute d'aucune curation.
        ...(etatIntegralementInconnu(input.etatPopulation) ? [LIMITATION_ETAT_INCONNU] : []),
      ],
    };
  });
}
