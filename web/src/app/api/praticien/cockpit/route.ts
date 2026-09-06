import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emailPraticien, filtrePatientsDuPraticien } from '@/lib/praticien/appartenance';
import { journaliserAccesDossier } from '@/lib/praticien/journalAcces';
import { construireReperes, resoudreAsOf, tronquerA } from '@/lib/praticien/lectureAsOf';
import { ORDRE_CONSULTATION_PORTEUSE, whereConsultationPorteuse } from '@/lib/consultation/consultationPorteuse';
import { filtrerPassationsExploitables } from '@/lib/scoring/validite';
import { confirmAssessmentEpisode } from '@/lib/clinical-engine/assessmentEpisode';
import { canonicalJson, canonicalSha256 } from '@/lib/clinical-engine/canonical';
import { type PlainteDominante } from '@/lib/clinical-engine/chaineC1';
import {
  adaptRuntimeInputs,
  isRuntimeMilestone,
  proposeRuntimeEpisode,
  type AncreCycleCourant,
} from '@/lib/clinical-engine/runtimeFromPrisma';
import { lireEffetsIndesirables } from '@/lib/clinical-engine/effetsIndesirablesPrisma';
import {
  construireChaineC1Tolerante,
  lireSelectionPriorite,
} from '@/lib/clinical-engine/selectionPrioritePrisma';
import {
  messageRefusPreconditions,
  type PreconditionsT0,
} from '@/lib/clinical-engine/preconditionsT0';
import { preconditionsT0PourPatient } from '@/lib/clinical-engine/preconditionsT0Prisma';
import {
  ancreCourante,
  lireAncresPersistees,
  refusAncreNonRecevable,
  type AncrePersistee,
} from '@/lib/protocol/ancresPersistees';
import { ancreRecevable, estAncreDeCycle } from '@/lib/protocol/cycles';
import { resolveCycleId, toEpisodeCreateInput, toEpisodeUpdateInput } from '@/lib/protocol/versioning';
import type {
  ClinicalReview,
  ClinicalSnapshot,
  ConfirmedAssessmentEpisode,
  DecisionCard,
  PreconditionOverride,
  ProposedAssessmentEpisode,
} from '@/lib/clinical-engine/types';
import {
  conflitsSourcesActifs,
  contradictionsPourPatient,
  type ContradictionAffichee,
} from '@/lib/clinical/contradictionsService';
import { CANAL_PLAINTE, PRIORITY_RULES_METADATA, tablePrioritesSignee } from '@/lib/clinical/priorityRulesV1';
import { claimsCitesParLaPropositionBilan } from '@/lib/biology-library/propositionService';
import type { JalonMomentum } from '@/lib/equilibre/types';

type CockpitUnavailableReason =
  | 'unauthenticated'
  | 'invalid_payload'
  | 'patient_not_found'
  | 'proposal_stale'
  | 'preconditions_non_remplies'
  | 'motif_contournement_manquant'
  | 'exception';

export type CockpitRuntimeApiResponse =
  | {
      status: 'proposal_required';
      proposal: ProposedAssessmentEpisode;
      proposalHash: string;
      /**
       * Checklist de confirmation T0 ([[D-052]]) : conditions dures bloquantes,
       * souples contournables avec motif.
       *
       * ABSENTE EN LECTURE D'UN ÉTAT PASSÉ, délibérément : présenter un verdict
       * calculé sur le dossier d'aujourd'hui à côté d'une lecture datée d'hier
       * mêlerait deux instants dans le même écran. Le mode passé ne confirme
       * rien de toute façon (le POST y est refusé).
       */
      preconditions?: PreconditionsT0;
      // Instant de lecture quand la fiche est relue à une date passée (SP-TT).
      // `null` ou absent = état présent, comportement historique.
      asOf?: string | null;
    }
  | {
      status: 'ready';
      snapshot: ClinicalSnapshot;
      review: ClinicalReview;
      decisionCard: DecisionCard;
      /**
       * Constats du moteur DÉTERMINISTE de contradictions ([[D-050]]), à côté
       * des `discordances` de `review`, qui viennent de la revue clinique LLM.
       *
       * Ce champ n'entre PAS dans `ClinicalReview` : ce type est celui du moteur
       * clinique historique, dont `DiscordanceFinding` porte un `confidence` que
       * le garde de [[D-041]] interdit à un constat déterministe. Les deux
       * familles voyagent donc côte à côte, sans conversion de l'une vers
       * l'autre.
       *
       * Liste vide tant que la table n'est pas signée — le verrou est appliqué
       * dans le service, jamais ici ni chez le client.
       */
      contradictions: ContradictionAffichee[];
      /**
       * Le domaine de plainte que le patient déclare le plus intensément
       * ([[D-054]]), ou `null` si le canal de plainte n'est pas mesurable sur
       * l'épisode confirmé.
       *
       * PAS DERRIÈRE LE VERROU DE SIGNATURE, contrairement aux candidats : ce
       * n'est pas une sortie de règle, mais la restitution d'une bande déjà
       * publiée par un instrument certifié. Elle voyage à côté de la carte de
       * décision plutôt qu'à l'intérieur : la carte est hachée et persistée, et
       * y ajouter un champ d'affichage déplacerait toutes les empreintes.
       */
      plainteDominante: PlainteDominante | null;
      /**
       * Le SHA du périmètre signé sous lequel les candidats ci-dessus ont été
       * produits — `null` tant que la table des priorités n'est pas signée,
       * auquel cas il n'y a de toute façon aucun candidat.
       *
       * IL VOYAGE À CÔTÉ DE LA CARTE, PAS DEDANS : même motif que
       * `plainteDominante` ci-dessus — la carte est hachée et persistée, y
       * ajouter un champ déplacerait toutes les empreintes déjà émises.
       *
       * POURQUOI L'EXPOSER (Alliance 6.0-B, LOT-03). Le moteur de proposition
       * ne peut pas le lire lui-même : il vit sous `lib/clinical/`, que la
       * garde G7 lui interdit d'importer. Sans ce champ, l'écran ne peut pas
       * transmettre la provenance des candidats qu'il vient de recevoir, et un
       * fragment de règle serait cité sans pouvoir montrer sa signature
       * (`DC-17`, `DC-26`).
       *
       * IL SUIT LE VERROU, PAS LA CONSTANTE : lu à travers
       * `tablePrioritesSignee()`, il reste `null` si la signature n'est pas
       * active. Servir le SHA d'une table non signée laisserait l'écran se
       * réclamer d'une signature qui ne commande rien.
       */
      perimetreSigne: string | null;
      /**
       * L'instrument du canal de plainte, tel que la table signée le nomme.
       *
       * IL VOYAGE PARCE QUE L'ÉCRAN NE PEUT PAS L'IMPORTER. Le fragment
       * d'instrument doit citer sa source par son identifiant de catalogue,
       * mais le composant qui compose la citation est `'use client'` : y
       * importer la table embarquerait ses règles, ses seuils et ses motifs
       * dans le bundle du navigateur, pour une seule chaîne. Une constante
       * recopiée à la main, elle, dériverait en silence le jour où le canal
       * changerait.
       */
      canalPlainte: string;
      /**
       * `true` quand ce `ready` est le REJEU d'un épisode persisté (`D-118`),
       * servi par le GET — jamais posé par le POST, dont le `ready` sanctionne
       * une confirmation fraîche.
       *
       * L'écran s'en sert pour une seule chose : un rejeu ne VERROUILLE pas le
       * jalon affiché. Une carte fraîchement confirmée ne doit pas être écrasée
       * par une resynchronisation de trajectoire ; une carte rejouée, si — le
       * jalon dû peut avoir avancé pendant que la page était fermée, et épingler
       * l'écran sur un `T0` rejoué masquerait un `J21` devenu dû.
       */
      rejoue?: true;
    }
  | {
      status: 'unavailable';
      reason: CockpitUnavailableReason;
      error: string;
    };

export type ConfirmCockpitEpisodePayload = {
  idPatient?: string;
  milestone?: JalonMomentum;
  includedResponseIds?: string[];
  proposalHash?: string;
  /**
   * Contournements des conditions souples : la condition et son motif, rien de
   * plus. L'auteur et l'horodatage sont posés par le serveur ([[D-052]]).
   */
  overrides?: { conditionId?: string; motif?: string }[];
};

// Gabarit littéral pour le journal des accès (G-TRUST-04) — jamais l'URL reçue.
const ROUTE_JOURNAL = '/api/praticien/cockpit';

function unavailable(reason: CockpitUnavailableReason, error: string, status: number) {
  return NextResponse.json<CockpitRuntimeApiResponse>({ status: 'unavailable', reason, error }, { status });
}

// `emailPraticien` scope la lecture au praticien connecté : un patient d'un
// autre praticien est traité comme introuvable, ce qui évite d'en révéler
// l'existence. Point de passage unique du GET comme du POST.
// `asOfBrut` : lecture d'un état passé (SP-TT). Absent ⇒ présent, comportement
// strictement inchangé. Présent ⇒ doit correspondre à un repère réel du patient,
// sinon la lecture est refusée — jamais silencieusement ramenée au présent.
async function loadRuntimeInputs(idPatient: string, emailPraticien: string, asOfBrut?: string | null) {
  const patient = await prisma.patient.findFirst({
    where: { idPatient, ...filtrePatientsDuPraticien(emailPraticien) },
    select: { idPatient: true, createdAt: true },
  });
  if (!patient) return null;

  const [responses, consultation] = await Promise.all([
    prisma.questionnaireReponse.findMany({
      where: { idPatient },
      select: { idReponse: true, idQuestionnaire: true, dateReponse: true, scoresJson: true, statutValidite: true },
      orderBy: [{ dateReponse: 'asc' }, { idReponse: 'asc' }],
    }),
    prisma.consultation.findFirst({
      where: whereConsultationPorteuse(idPatient),
      select: { anamnese: true },
      orderBy: ORDRE_CONSULTATION_PORTEUSE,
    }),
  ]);

  const episodes = asOfBrut
    ? await prisma.assessmentEpisode.findMany({
        where: { idPatient },
        select: { milestone: true, confirmedAt: true },
      })
    : [];
  const resolution = resoudreAsOf(asOfBrut, construireReperes({ episodes, reponses: responses }));
  if (resolution.mode === 'refus') return { refus: resolution.raison } as const;

  const asOf = resolution.mode === 'passe' ? resolution.date : null;
  // Le passé est RECALCULÉ depuis les données brutes tronquées, jamais relu
  // depuis un snapshot : aucune donnée postérieure ne peut fuir dans la lecture.
  //
  // Filtre de validité (LOT-00, drapeau éteint par défaut) sur les entrées du
  // runtime clinique SEULEMENT : les repères as-of, eux, restent calculés sur
  // la liste complète — un repère est un fait administratif, pas une mesure.
  return {
    ...adaptRuntimeInputs(patient, filtrerPassationsExploitables(tronquerA(responses, asOf)), consultation),
    asOf: asOf ? asOf.toISOString() : null,
  };
}

// Ancre du cycle courant pour un jalon de MESURE : `confirmedAt` de l'ancre du
// rang le plus haut — la même ancre que la trajectoire et `resoudreJalonDu`
// (LOT-08 A8-1 ; revue LOT-07 B2 : deux ancres rendaient les fenêtres du
// client et du serveur disjointes). Une ancre, elle, ne se compte depuis
// aucune autre : c'est le jour 0 de son propre cycle, et sa date de référence
// est résolue par `proposeRuntimeEpisode`. En lecture datée (`asOf`), seules
// les ancres confirmées à cette date comptent — un épisode postérieur ne doit
// pas fuir dans une lecture du passé.
function ancreCycleDepuis(
  ancres: readonly AncrePersistee[],
  milestone: JalonMomentum,
): AncreCycleCourant | null {
  if (estAncreDeCycle(milestone)) return null;
  const ancre = ancreCourante([...ancres]);
  // Le NOM autant que la date : il entre dans l'identifiant de l'épisode, que
  // deux cycles partageraient sinon (`identifiantEpisode`, `runtimeFromPrisma`).
  return ancre ? { ancre: ancre.milestone, confirmedAt: ancre.confirmedAt.toISOString() } : null;
}

async function ancreCycleCourant(
  idPatient: string,
  milestone: JalonMomentum,
  asOf: string | null,
): Promise<AncreCycleCourant | null> {
  if (estAncreDeCycle(milestone)) return null;
  return ancreCycleDepuis(await lireAncresPersistees(idPatient, asOf ? new Date(asOf) : null), milestone);
}

/**
 * L'épisode persisté est-il REJOUABLE sur la proposition courante (`D-118`) ?
 *
 * Deux conditions, et chacune protège une propriété distincte :
 *
 * 1. L'INTÉGRITÉ — le blob relu se re-hache à son `payloadHash`. Un payload qui
 *    ne se recoupe pas ne se rejoue pas : on journalise et on sert la
 *    proposition, jamais une chaîne calculée sur un épisode altéré.
 * 2. LE SOCLE — les champs de PROPOSITION de l'épisode persisté (identifiant,
 *    jalon, fenêtre, candidats) sont canoniquement identiques à la proposition
 *    recalculée à l'instant. C'est ce qui garantit que le `proposalHash`
 *    courant est celui de la confirmation, donc que les identifiants
 *    d'enveloppe (`runtime-decision-…`) — par lesquels versions, diffusion et
 *    check-ins sont retrouvés — sont EXACTEMENT ceux de la carte d'origine.
 *    Un dossier qui a bougé (nouvelle passation, fenêtre déplacée) fait
 *    diverger le socle : on retombe sur `proposal_required`, le flux « les
 *    réponses ont changé » d'aujourd'hui.
 */
function episodeRejouable(
  persiste: { payload: unknown; payloadHash: string },
  proposal: ProposedAssessmentEpisode,
): ConfirmedAssessmentEpisode | null {
  const episode = persiste.payload as ConfirmedAssessmentEpisode;
  try {
    if (canonicalSha256(episode) !== persiste.payloadHash) {
      console.error('[cockpit GET] payload d’épisode incohérent avec son empreinte', episode.assessmentEpisodeId);
      return null;
    }
    const {
      status: _statut,
      includedResponseIds: _incluses,
      sourceDateRange: _plage,
      confirmedAt: _confirme,
      preconditionOverrides: _contournements,
      ...soclePersiste
    } = episode;
    const {
      status: _statutCourant,
      includedResponseIds: _inclusesCourantes,
      sourceDateRange: _plageCourante,
      ...socleCourant
    } = proposal;
    if (canonicalJson(soclePersiste) !== canonicalJson(socleCourant)) return null;
  } catch {
    // Sérialisation canonique impossible : un épisode qu'on ne sait pas hacher
    // est un épisode qu'on ne rejoue pas.
    return null;
  }
  return episode;
}

/**
 * La réponse `ready`, assemblée d'un seul geste pour la confirmation (POST) et
 * le rejeu (GET, `D-118`) : deux assemblages divergeraient un jour sur ce que
 * « prêt » veut dire.
 *
 * LES CLAIMS CITÉS PAR LA PROPOSITION DE BILAN, et eux seuls pour l'instant
 * ([[D-103]]) : c'est la seule sortie de dossier qui épingle aujourd'hui un
 * claim visé par un conflit déclaré (`WN-CL-0312-018`, la répétition
 * annuelle). LA DÉRIVATION NE PART QUE SI LE REGISTRE EST SIGNÉ — verrou
 * fermé, aucune requête de plus.
 *
 * BEST-EFFORT, ET C'EST LE POINT (relevé en revue) : sans ce `catch`, un
 * catalogue mal formé ou un timeout base ferait tomber la confirmation — un
 * service secondaire éteindrait le chemin principal. Liste vide ⇒ aucun
 * conflit, le repli déclaré du module.
 */
async function reponsePrete(
  idPatient: string,
  chaine: {
    snapshot: ClinicalSnapshot;
    review: ClinicalReview;
    decisionCard: DecisionCard;
    plainteDominante: PlainteDominante | null;
  },
  options?: { rejoue: true },
): Promise<NextResponse<CockpitRuntimeApiResponse>> {
  let claimsCites: Awaited<ReturnType<typeof claimsCitesParLaPropositionBilan>> = [];
  if (conflitsSourcesActifs()) {
    try {
      claimsCites = await claimsCitesParLaPropositionBilan(idPatient, new Date().toISOString());
    } catch (bioErr) {
      console.error(
        '[cockpit] claims cités indisponibles, conflits de sources non évalués',
        bioErr instanceof Error ? bioErr.message : String(bioErr),
      );
    }
  }
  const contradictions = await contradictionsPourPatient(idPatient, claimsCites);
  return NextResponse.json({
    status: 'ready',
    snapshot: chaine.snapshot,
    review: chaine.review,
    decisionCard: chaine.decisionCard,
    contradictions,
    plainteDominante: chaine.plainteDominante,
    perimetreSigne: tablePrioritesSignee() ? PRIORITY_RULES_METADATA.shaPerimetre : null,
    canalPlainte: CANAL_PLAINTE,
    ...(options?.rejoue ? { rejoue: true as const } : {}),
  });
}

// GET /api/praticien/cockpit?idPatient=PAT001&milestone=T0
export async function GET(req: Request): Promise<NextResponse<CockpitRuntimeApiResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) return unavailable('unauthenticated', 'Non authentifié.', 401);

  const searchParams = new URL(req.url).searchParams;
  const idPatient = (searchParams.get('idPatient') ?? '').trim();
  const milestoneRaw = searchParams.get('milestone') ?? 'T0';
  const asOfBrut = searchParams.get('asOf');
  if (!idPatient || !isRuntimeMilestone(milestoneRaw)) {
    return unavailable('invalid_payload', 'Patient ou jalon invalide.', 400);
  }

  try {
    const email = emailPraticien(session) ?? '';
    const inputs = await loadRuntimeInputs(idPatient, email, asOfBrut);
    if (!inputs) return unavailable('patient_not_found', 'Patient introuvable.', 404);
    // Journalisé ICI et non dans loadRuntimeInputs : le helper sert aussi le
    // POST, et GD-1 ne porte que sur les lectures de dossier nommé par un GET.
    // Le POST, lui, écrit depuis `D-118` et relève donc de la dispense
    // d'écriture de GD-1 — voir le commentaire de la confirmation plus bas.
    // AVANT le refus `asOf` : le dossier a été résolu et ses données lues —
    // même principe que booklet et documents avec leur 422.
    await journaliserAccesDossier({ idPatient, praticienEmail: email, route: ROUTE_JOURNAL, methode: 'GET' });
    if ('refus' in inputs) {
      // Une date hors repères n'est jamais ramenée au présent en silence : la
      // lecture serait alors présentée comme passée tout en étant actuelle.
      return unavailable('invalid_payload', 'Date de lecture inconnue pour ce patient.', 400);
    }
    const { proposal, proposalHash } = proposeRuntimeEpisode(
      inputs,
      milestoneRaw,
      await ancreCycleCourant(idPatient, milestoneRaw, inputs.asOf),
    );

    // ── LE REJEU D'UN ÉPISODE PERSISTÉ (`D-118`) ────────────────────────────
    //
    // Un épisode confirmé est un acte posé : depuis `D-118`, le POST le
    // persiste, et ce GET le REJOUE — la carte de décision est « recalculable »
    // par contrat (`schema.prisma`), et le chemin de construction est celui,
    // unique, que `verifierChaineC1` emprunte déjà (`D-054`, arbitrage 6).
    // Avant cela, l'écran affichait « en attente » sur un geste déjà fait, et
    // le praticien recommençait au mieux une relecture, au pire une saisie.
    //
    // JAMAIS EN LECTURE DATÉE : le mode `asOf` recompose un passé, il ne
    // sanctionne rien — et la proposition y reste le seul état servi.
    //
    // Rejouable ⇒ mêmes identifiants d'enveloppe que la carte d'origine (le
    // socle garantit le `proposalHash`), avec l'horodatage DE LA CONFIRMATION :
    // versions, diffusion et check-ins retrouvent leur fil. Non rejouable —
    // dossier qui a bougé, payload illisible — ⇒ `proposal_required`, le flux
    // d'aujourd'hui, sans rien inventer.
    if (!inputs.asOf) {
      const persiste = await prisma.assessmentEpisode.findUnique({
        where: { id: proposal.assessmentEpisodeId },
        select: { payload: true, payloadHash: true },
      });
      const episode = persiste ? episodeRejouable(persiste, proposal) : null;
      if (episode) {
        try {
          const idSuffix = `${milestoneRaw}-${proposalHash.slice(0, 16)}`;
          const decisionCardIdRejeu = `runtime-decision-${idSuffix}`;
          // La sélection praticien, relue en base ([[D-127]]) par la MÊME
          // fonction que `verifierChaineC1` — deux lectures divergentes
          // rendraient 409 sur une carte honnête ([[D-101]]) — et construite par
          // le MÊME repli : une sélection devenue inapplicable est écartée, elle
          // n'emporte pas l'épisode confirmé ([[D-118]]).
          const { chaine, selectionEcartee } = construireChaineC1Tolerante({
            snapshotId: `runtime-snapshot-${idSuffix}`,
            reviewId: `runtime-review-${idSuffix}`,
            decisionCardId: decisionCardIdRejeu,
            patientId: idPatient,
            horodatage: episode.confirmedAt as string,
            episode,
            patientContext: inputs.patientContext,
            responses: inputs.responses,
            signauxAlerte: inputs.signauxAlerte,
            etatPopulation: inputs.etatPopulation,
            effetsIndesirables: await lireEffetsIndesirables(idPatient),
          }, await lireSelectionPriorite(idPatient, decisionCardIdRejeu));
          if (selectionEcartee) {
            // Un acte praticien n'est plus servi : le dire au journal en
            // attendant de le dire à l'écran ([[D-127]], dettes). Jamais le
            // motif ni le candidat — la ligne nomme un dossier, pas un choix.
            console.warn('[cockpit GET] sélection de priorité écartée : elle ne tient plus sur ce dossier');
          }
          return await reponsePrete(idPatient, chaine, { rejoue: true });
        } catch (erreurRejeu) {
          // Le dossier ne porte plus ce que l'épisode cite (passation retirée,
          // contexte incohérent) : le rejeu ne force rien, la proposition
          // reprend la main — et la confirmation re-signera un état lisible.
          console.error(
            '[cockpit GET] rejeu impossible, proposition servie',
            erreurRejeu instanceof Error ? erreurRejeu.message : String(erreurRejeu),
          );
        }
      }
    }
    // Après `loadRuntimeInputs`, donc après la vérification d'appartenance.
    // LES ANCRES SEULEMENT : les jalons de suivi (J21, J42, J90) ne sont pas
    // gouvernés par cette porte — le lot pose les préconditions du point
    // d'entrée, il ne touche pas aux jalons ([[D-052]]).
    //
    // « Point d'entrée » se lisait `=== 'T0'`. Depuis `D-113`, OUVRIR UN CYCLE
    // EST LE MÊME ACTE, quel que soit son rang : `T1` est l'entrée du deuxième
    // suivi comme `T0` était celle du premier. Restreindre la porte au premier
    // cycle aurait ouvert un chemin d'ancrage sans rideau, ce que `D-052`
    // interdit précisément. Le seuil ne bouge pas ; c'est la clé qui s'ouvre.
    const preconditions = inputs.asOf || !estAncreDeCycle(milestoneRaw)
      ? undefined
      : await preconditionsT0PourPatient(idPatient);
    return NextResponse.json({
      status: 'proposal_required',
      proposal,
      proposalHash,
      asOf: inputs.asOf,
      ...(preconditions ? { preconditions } : {}),
    });
  } catch (error) {
    console.error('[cockpit GET]', error instanceof Error ? error.message : String(error));
    return unavailable('exception', 'Erreur technique.', 500);
  }
}

// POST /api/praticien/cockpit — confirme l'épisode, calcule la chaîne C1, et
// PERSISTE l'épisode confirmé (`D-118`) : un acte posé ne redevient pas
// invisible au rechargement de page. La carte, elle, reste recalculable et
// n'est toujours persistée nulle part.
export async function POST(req: Request): Promise<NextResponse<CockpitRuntimeApiResponse>> {
  const session = await getServerSession(authOptions);
  if (!session) return unavailable('unauthenticated', 'Non authentifié.', 401);

  // Le mode passé est strictement en lecture : on ne confirme jamais un épisode
  // depuis un état qui n'est plus celui du patient (SP-TT).
  if (new URL(req.url).searchParams.get('asOf')) {
    return unavailable('invalid_payload', 'Aucune écriture possible en lecture d’un état passé.', 400);
  }

  let payload: ConfirmCockpitEpisodePayload;
  try {
    payload = await req.json() as ConfirmCockpitEpisodePayload;
  } catch {
    return unavailable('invalid_payload', 'JSON invalide.', 400);
  }
  const idPatient = (payload.idPatient ?? '').trim();
  const includedResponseIds = payload.includedResponseIds;
  const proposalHash = (payload.proposalHash ?? '').trim();
  if (
    !idPatient
    || !isRuntimeMilestone(payload.milestone)
    || !Array.isArray(includedResponseIds)
    || includedResponseIds.some(id => typeof id !== 'string' || !id.trim())
    || !proposalHash
  ) {
    return unavailable('invalid_payload', 'Confirmation d’épisode invalide.', 400);
  }

  try {
    const inputs = await loadRuntimeInputs(idPatient, emailPraticien(session) ?? '');
    if (!inputs) return unavailable('patient_not_found', 'Patient introuvable.', 404);
    if ('refus' in inputs) return unavailable('invalid_payload', 'Date de lecture inconnue pour ce patient.', 400);
    // UNE SEULE LECTURE DES ANCRES, réutilisée par l'identité de l'épisode, la
    // recevabilité et la résolution de cycle (patron `protocoles/route.ts`) :
    // deux lectures pourraient rendre deux verdicts.
    const ancres = await lireAncresPersistees(idPatient);
    const current = proposeRuntimeEpisode(
      inputs,
      payload.milestone,
      ancreCycleDepuis(ancres, payload.milestone),
    );
    if (current.proposalHash !== proposalHash) {
      return unavailable('proposal_stale', 'Les réponses ont changé. Rechargez la proposition.', 409);
    }

    const now = new Date().toISOString();

    // LA LIGNE D'ABORD : un acte a une date, et cette date a UN écrivain.
    //
    // Ce POST était le seul point où un praticien pose l'acte, mais la
    // persistance était un `upsert(..., update: {})` : re-confirmer un épisode
    // déjà enregistré avec un contenu DIVERGENT n'écrivait RIEN, sous une
    // réponse de succès. Le praticien lisait « confirmé » à l'écran pendant que
    // la base gardait la mesure précédente — une confirmation clinique perdue
    // en silence (`D-129`).
    //
    // On lit donc la ligne AVANT de construire quoi que ce soit. Elle sert
    // trois fois : elle donne la date de l'acte, elle donne la justification de
    // contournement déjà rendue, et son empreinte sert de jeton au
    // compare-and-swap de l'écriture.
    const ligneEnregistree = await prisma.assessmentEpisode.findUnique({
      where: { id: current.proposal.assessmentEpisodeId },
      select: { confirmedAt: true, payloadHash: true, payload: true },
    });
    // L'INSTANT DE L'ACTE, PAS CELUI DU CLIC. `confirmedAt` est à sens unique :
    // `runtimeFromPrisma` en fait la date de référence de tout jalon de mesure
    // du cycle, et le portail patient y adosse la fermeture de ses jalons. Le
    // réécrire à chaque re-confirmation déplacerait le parcours du patient.
    const instantActe = ligneEnregistree
      ? ligneEnregistree.confirmedAt.toISOString()
      : now;

    // PRÉCONDITIONS T0 ([[D-052]]), recalculées DEPUIS LA BASE et jamais lues
    // dans le corps de requête. Depuis `D-118` ce POST est un point de
    // persistance : le refus posé ici n'est plus un pré-refus d'ergonomie, il
    // garde la base au même titre que ceux de `protocoles` et
    // `protocoles/versions` — qui rejouent le même calcul sur ce qui leur
    // arrive du navigateur.
    const preconditionOverrides: PreconditionOverride[] = [];
    if (estAncreDeCycle(payload.milestone)) {
      // L'ANCRE DEMANDÉE EST-ELLE CELLE QUI PEUT ÊTRE POSÉE ? `isRuntimeMilestone`
      // n'a validé qu'une FORME (`T` suivi d'un rang) : le corps de requête vient
      // du navigateur, et un `T7` posté sur un dossier qui n'a que `T0` créerait
      // un cycle de rang 7 en laissant six rangs à jamais vides. Refus en amont,
      // pour la même raison que les préconditions : éviter au praticien de
      // composer un protocole que la persistance rejettera.
      if (!ancreRecevable(
        payload.milestone,
        ancres.map((ancre) => ancre.milestone),
      )) {
        return unavailable(
          'invalid_payload',
          'Ce cycle ne peut pas être ouvert sous ce nom. Rechargez la fiche pour reprendre le cycle en cours.',
          422,
        );
      }
      const preconditions = await preconditionsT0PourPatient(idPatient);
      if (preconditions.bloquant) {
        return unavailable('preconditions_non_remplies', messageRefusPreconditions(preconditions), 422);
      }
      const motifsRecus = new Map(
        (payload.overrides ?? [])
          .filter(o => typeof o?.conditionId === 'string' && typeof o?.motif === 'string')
          .map(o => [o.conditionId as string, (o.motif as string).trim()]),
      );
      // LA JUSTIFICATION DÉJÀ RENDUE SE REPREND, ELLE NE SE RECOMPARE PAS.
      // Sur un acte déjà enregistré, l'arbitrage de contournement a été rendu à
      // sa date : le reprendre VERBATIM est le même traitement que la date de
      // l'acte elle-même. Le motif reçu du navigateur est alors ignoré, sans
      // être comparé — le comparer bloquerait un praticien sur une virgule,
      // d'autant que le panneau vide ses motifs à chaque remontage et ne lui
      // remontre jamais celui d'origine.
      // LA LIGNE PEUT PORTER N'IMPORTE QUEL JSON : on ne la croit pas sur parole.
      const brut = ligneEnregistree?.payload;
      const rendusEnBase: PreconditionOverride[] =
        brut !== null && typeof brut === 'object' && !Array.isArray(brut)
          ? (() => {
              const champ = (brut as { preconditionOverrides?: unknown }).preconditionOverrides;
              return Array.isArray(champ) ? (champ as PreconditionOverride[]) : [];
            })()
          : [];
      const dejaRendus = new Map(rendusEnBase.map(o => [o.conditionId, o]));

      // LA TRACE D'UN ARBITRAGE SURVIT À LA RÉSOLUTION DE SA CONDITION
      // (`D-129`, arbitrage du 2026-09-06). Une condition souple SE RÉSOUT — la
      // contradiction est levée, la passation est repassée. Ne reconstruire que
      // les conditions ENCORE requises effaçait alors, en silence et au premier
      // geste anodin, qui avait passé outre, quand et pourquoi. C'est la seule
      // ligne qui en fasse foi : elle est reportée telle quelle.
      const requisMaintenant = new Set(preconditions.contournementsRequis);
      for (const rendu of rendusEnBase) {
        if (!requisMaintenant.has(rendu.conditionId)) preconditionOverrides.push(rendu);
      }

      for (const conditionId of preconditions.contournementsRequis) {
        const rendu = dejaRendus.get(conditionId);
        if (rendu) {
          preconditionOverrides.push(rendu);
          continue;
        }
        // UN CONTOURNEMENT NOUVEAU SE DATE DU JOUR, SUR UN ACTE QUI GARDE LE
        // SIEN. Un avertissement peut APPARAÎTRE après la confirmation — une
        // contradiction s'ouvre, une passation devient ambiguë. Le refuser
        // bloquait précisément la re-confirmation divergente que `D-129` existe
        // pour ne plus perdre. `refusPreconditionsPersistance` borne désormais
        // `confirmedAt <= decideLe <= maintenant` au lieu d'exiger l'égalité :
        // rien n'est antidaté, rien n'est projeté, et l'écriture a lieu.
        const motif = motifsRecus.get(conditionId);
        if (!motif) {
          return unavailable(
            'motif_contournement_manquant',
            'Un motif est requis pour passer outre un avertissement.',
            422,
          );
        }
        // Auteur et horodatage posés ICI, côté serveur : l'épisode voyage par
        // le navigateur avant d'être persisté, et tracer un auteur choisi par
        // le client ne trace rien.
        preconditionOverrides.push({
          conditionId,
          motif: motif.slice(0, 2000),
          decidePar: emailPraticien(session) ?? '',
          // `now`, et non `instantActe` : cet arbitrage-ci est rendu AUJOURD'HUI.
          decideLe: now,
        });
      }
    }

    const episode = confirmAssessmentEpisode(
      current.proposal,
      includedResponseIds,
      instantActe,
      preconditionOverrides,
    );
    const idSuffix = `${payload.milestone}-${proposalHash.slice(0, 16)}`;
    // UN SEUL CHEMIN DE CONSTRUCTION, partagé avec le recalcul des deux points
    // de persistance ([[D-054]], arbitrage 6) : deux constructions divergentes
    // rendraient 409 sur une carte que ce POST vient d'émettre.
    //
    // UN SEUL HORODATAGE (`instantActe`) pour l'épisode, le snapshot, la revue
    // et la carte — celui de l'ACTE, jamais celui du clic (`D-129`) : `createdAt` et `asOf` entrent dans les empreintes, et le
    // vérificateur les réutilise tels qu'ils ont été soumis.
    // Une confirmation d'épisode ne sélectionne RIEN — la sélection reste un
    // geste praticien DISTINCT. Ce qui a changé avec [[D-127]], c'est qu'une
    // sélection déjà posée sur cette carte se relit ici : confirmer à nouveau le
    // même épisode ne l'efface donc pas. Lecture ET repli sont ceux du
    // vérificateur ([[D-101]]) — sinon 409 sur une carte que ce POST émet.
    const { chaine: { snapshot, review, decisionCard, plainteDominante } } = construireChaineC1Tolerante({
      snapshotId: `runtime-snapshot-${idSuffix}`,
      reviewId: `runtime-review-${idSuffix}`,
      decisionCardId: `runtime-decision-${idSuffix}`,
      patientId: idPatient,
      horodatage: instantActe,
      episode,
      patientContext: inputs.patientContext,
      responses: inputs.responses,
      signauxAlerte: inputs.signauxAlerte,
      etatPopulation: inputs.etatPopulation,
      // Lus par la fonction PARTAGÉE avec `verifierChaineC1` ([[D-101]]) : ce
      // POST émet la carte que le vérificateur recalculera, et deux lectures
      // divergentes rendraient 409 sur une carte que cette route vient
      // d'écrire. Drapeau éteint ⇒ `undefined`, aucune requête neuve.
      effetsIndesirables: await lireEffetsIndesirables(idPatient),
    }, await lireSelectionPriorite(idPatient, `runtime-decision-${idSuffix}`));
    // Après `loadRuntimeInputs`, donc après que l'appartenance du patient au
    // praticien a été vérifiée — un patient d'un autre praticien est sorti en
    // 404 bien avant cette ligne. Le service ne pose ni authentification, ni
    // contrôle d'appartenance, ni journal : c'est l'appelant qui les porte.
    //
    // Ce POST ÉCRIT (`D-118`) et ne journalise toujours pas — mais plus pour la
    // même raison. La rédaction antérieure disait « un POST qui n'écrit rien » ;
    // ce motif est mort avec la persistance de l'épisode. Ce qui s'applique
    // désormais est la dispense d'écriture de GD-1, la même que les deux points
    // de persistance du protocole : une écriture laisse déjà sa propre trace
    // datée et attribuée.
    //
    // PÉRIMÈTRE DIFFÉRENT DE CELUI DE `review`, et c'est nommé plutôt que
    // supposé : `snapshot`/`review` sont calculés sur les réponses INCLUSES
    // dans l'épisode T0 confirmé, alors que les contradictions sont évaluées
    // sur le dossier entier. Un constat peut donc reposer sur une passation que
    // le praticien a laissée hors de l'épisode. Les constats portent leurs
    // passations datées, ce qui rend l'écart lisible à l'écran ; réduire le
    // moteur au périmètre de l'épisode est un arbitrage clinique qui n'a pas
    // été rendu ([[D-050]]).

    // ── LA PERSISTANCE DE L'ÉPISODE (`D-118`) ───────────────────────────────
    //
    // APRÈS la chaîne C1 : un épisode dont la chaîne ne se construit pas ne
    // s'écrit pas. AVANT la réponse : un épisode montré « confirmé » à l'écran
    // sans ligne en base serait exactement le défaut que `D-118` ferme.
    //
    // LES MÊMES GARDES QUE LES POINTS DE PERSISTANCE DU PROTOCOLE, à trois
    // exceptions près, chacune nommée :
    //  - `refusAncreNonRecevable` : reprise telle quelle — c'est elle qui
    //    porte le refus « ancre déjà posée sous un autre épisode » (`N1.1`) que
    //    le pré-refus d'ergonomie `ancreRecevable` plus haut ne couvre pas ;
    //  - `refusPreconditionsPersistance` : SANS OBJET ici — elle vérifie des
    //    contournements qui ont transité par le navigateur, or ce POST les
    //    CONSTRUIT côté serveur quelques lignes plus haut (auteur et horodatage
    //    posés par la session) ;
    //  - `refusChaineC1` : structurellement satisfait — cette route EST
    //    l'émetteur de la chaîne qu'il recalculerait.
    //
    // L'ÉCRITURE DIT CE QU'ELLE FAIT (`D-129`). C'était un
    // `upsert(..., update: {})` présenté comme de l'idempotence — « une ligne
    // déjà posée ne se réécrit pas ». Il n'était pas idempotent, il était
    // MUET : une re-confirmation au contenu divergent n'écrivait rien et
    // repartait en succès. Trois branches explicites, une par cas réel.
    const refusAncre = refusAncreNonRecevable(episode, ancres);
    if (refusAncre) {
      return unavailable('preconditions_non_remplies', refusAncre, 422);
    }
    const empreinte = canonicalSha256(episode);
    if (!ligneEnregistree) {
      // `create` et non `upsert` : l'`upsert` ne SAIT PAS dire « la ligne est
      // née entre-temps ». Il écrirait par-dessus une ligne posée par une autre
      // requête, avec un payload épinglé à notre horloge.
      try {
        await prisma.assessmentEpisode.create({
          data: toEpisodeCreateInput(episode, {
            cycleId: resolveCycleId({ episode, ancresCandidates: [...ancres] }),
          }),
        });
      } catch (erreur) {
        // SEULE LA COLLISION D'UNICITÉ EST UN 409. Un `catch` nu déguisait toute
        // panne — base indisponible, timeout, CHECK violé, validation Prisma —
        // en « confirmé ailleurs » : message faux, aucun log, et côté client un
        // 409 `proposal_stale` recharge la proposition SANS rien afficher. Le
        // praticien recliquait dans le vide, en silence : le défaut même que
        // `D-129` ferme, déplacé sur la première confirmation.
        if ((erreur as { code?: string })?.code !== 'P2002') throw erreur;
        return unavailable(
          'proposal_stale',
          'Cet épisode vient d’être confirmé ailleurs. Rechargez la proposition.',
          409,
        );
      }
    } else if (ligneEnregistree.payloadHash !== empreinte) {
      // COMPARE-AND-SWAP sur l'empreinte lue plus haut : si une autre requête a
      // réécrit la ligne entre notre lecture et ici, le prédicat ne matche plus
      // et l'on refuse au lieu d'écraser. Même mécanique que la consommation du
      // lien magique (`D-128`) : on compare à la valeur LUE.
      const { count } = await prisma.assessmentEpisode.updateMany({
        where: { id: episode.assessmentEpisodeId, payloadHash: ligneEnregistree.payloadHash },
        data: toEpisodeUpdateInput(episode),
      });
      if (count !== 1) {
        return unavailable(
          'proposal_stale',
          'Cet épisode vient d’être modifié ailleurs. Rechargez la proposition.',
          409,
        );
      }
    }
    // Troisième branche, implicite : empreintes égales, AUCUNE écriture. C'est
    // ici, et ici seulement, que l'idempotence annoncée est vraie.

    return await reponsePrete(idPatient, { snapshot, review, decisionCard, plainteDominante });
  } catch (error) {
    if (error instanceof TypeError) {
      return unavailable('invalid_payload', error.message, 400);
    }
    console.error('[cockpit POST]', error instanceof Error ? error.message : String(error));
    return unavailable('exception', 'Erreur technique.', 500);
  }
}
