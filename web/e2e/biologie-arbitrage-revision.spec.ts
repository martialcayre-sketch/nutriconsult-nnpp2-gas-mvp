// Arbitrage biologique → révision de protocole, de bout en bout (campagne
// « Biologie exploitée », LOT-03 §3) : une intention en attente de biologie →
// verdict INFIRMÉ avec note → révision qui crée une nouvelle version, et une
// résolution CONTRAINTE — 422 tant que l'arbitrage ne la fonde pas.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE PARCOURS A ATTENDU UNE RÉPARATION, ET C'EST LA PREMIÈRE CHOSE QU'IL PROUVE
// ─────────────────────────────────────────────────────────────────────────────
// `buildProtocolDraft` exige une priorité choisie PAR LE PRATICIEN. Jusqu'à
// [[D-127]], aucun module de `src/` n'en produisait : enregistrer une version de
// protocole était IMPOSSIBLE depuis l'application, et ce spec — écrit, complet —
// ne pouvait pas passer sa première assertion. La chaîne réparée, il devient le
// seul banc qui la joue de bout en bout sur la vraie base.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI L'INTENTION EST POSÉE PAR L'API, ET NON PAR UN GESTE D'ÉCRAN
// ─────────────────────────────────────────────────────────────────────────────
// AUCUN PRODUCTEUR D'INTENTIONS N'EXISTE. Le moteur clinique ne génère pas
// d'action `conditionnelle_biologie` : c'est le praticien qui la pose en
// relisant son protocole, par le constructeur de la phase Actions. Piloter ce
// constructeur à l'écran ferait de ce parcours un banc du constructeur, pas de
// l'arbitrage — et le moindre changement d'ergonomie le casserait sans qu'aucun
// invariant biologique n'ait bougé.
//
// LA VERSION EST DONC POSÉE PAR LA ROUTE DE VERSIONNEMENT, exactement comme le
// fait le client (`ClinicalRuntimeSection.saveVersion`) : `episode` et
// `decisionCard` sont LUS AU COCKPIT, jamais fabriqués. C'est essentiel — la
// route recalcule la chaîne C1 sur le dossier réel et refuse en 409 toute carte
// qui ne correspond pas. Une carte de fixture est structurellement
// irrecevable ici, et la seule fonction qui en produit une (`chaineC1Fixture`)
// est verrouillée derrière `VITEST` : son garde existe pour qu'on ne signe pas
// une table clinique par appel de fonction, et on ne le crochète pas pour
// arranger un banc.
//
// LA SÉLECTION DE PRIORITÉ SUIT LA MÊME RÈGLE, et pour une raison plus forte
// encore : `selectedAt` entre dans l'empreinte de la carte, et `canonical.ts`
// importe `node:crypto`. Le navigateur ne PEUT PAS produire la carte qui suit
// une sélection. Le parcours poste donc le choix à SA route, puis RELIT le
// cockpit — le geste exact de l'écran ([[D-127]] §10).
//
// Ce que le parcours éprouve, du coup, est CE QUI NE PEUT PAS ÊTRE ÉPROUVÉ
// AILLEURS : la chaîne complète sélection → route de versionnement → arbitrage →
// route de versionnement, avec la vraie base, les vraies empreintes et la vraie
// garde. Les bancs de route valident chaque maillon isolément ; aucun ne joue la
// séquence.
//
// Patient fictif Jennifer Martin (PAT_SEED_02) : la fixture biologie fournit
// les préconditions T0 dures (rideau cotable, consultation validée, synthèse
// postérieure). `workers: 1` garantit qu'aucun autre parcours ne tourne pendant
// celui-ci.
//
// Mode sériel : la version 1 est ce que l'arbitrage vise et ce que la version 2
// révise. L'ordre EST le parcours.
import { test, expect, type APIRequestContext } from '@playwright/test';
import { praticienSessionCookie } from './helpers/auth';
import { confirmerEpisodeT0 } from './helpers/biologie';
import {
  provisionnerDossierBiologie,
  nettoyerDossierBiologie,
  nettoyerProtocoleEtArbitrages,
} from './helpers/db';

const PATIENT_ID = 'PAT_SEED_02';

/** L'intention en attente : un dosage que le protocole suspend à un bilan. */
const INTENTION_ID = 'act-e2e-attente-biologie';
const INTENTION_TITRE = 'Exploration martiale avant supplémentation';
const NOTE_ARBITRAGE =
  'Ferritine et coefficient de saturation dans les bornes du laboratoire : '
  + 'la carence supposée n’est pas documentée.';
/** Le motif de la sélection : exigé par la route, sans portée clinique ici. */
const MOTIF_SELECTION =
  'Parcours E2E — priorité retenue pour éprouver la chaîne, aucune portée clinique.';

/** L'action telle qu'elle est soumise, dans ses trois états successifs. */
function action(interventionStatus: 'conditionnelle_biologie' | 'active' | 'non_indiquee_actuellement') {
  return {
    actionId: INTENTION_ID,
    type: 'biological_exploration' as const,
    title: INTENTION_TITRE,
    idealPlan: 'Bilan martial complet avant toute supplémentation.',
    minimalPlan: 'Ferritine seule.',
    rescuePlan: 'Réévaluation clinique à J21 sans biologie.',
    limitations: [],
    interventionStatus,
    // `waitFor` est requis SI ET SEULEMENT SI le statut est
    // `conditionnelle_biologie` : le contrat V4 refuse une attente sans cible,
    // et refuse une cible sans attente.
    ...(interventionStatus === 'conditionnelle_biologie'
      ? { waitFor: { type: 'biologie' as const, cible: 'Ferritine' } }
      : {}),
  };
}

function soumission(
  interventionStatus: 'conditionnelle_biologie' | 'active' | 'non_indiquee_actuellement',
) {
  return {
    // LE CONTRAT EST DEMANDÉ, JAMAIS DÉDUIT ([[D-129]]) : un statut
    // d'intervention n'existe qu'en V4, et la route refuse de choisir le
    // contrat à la place de qui soumet. Les trois soumissions le portent — une
    // révision qui l'omettrait retomberait en V1 et serait refusée en 409.
    version: 'c1-protocol-draft-v4' as const,
    purpose: 'Parcours E2E — arbitrage biologique et révision (aucune portée clinique).',
    followUpCriterion: 'Aucun : version de banc.',
    actions: [action(interventionStatus)],
    therapeuticLoad: {
      level: 'light' as const,
      source: 'practitioner' as const,
      justification: null,
    },
    limitations: [],
  };
}

/** La part de la carte que ce parcours interroge — le reste voyage intact. */
type CarteLue = {
  decisionCardId: string;
  priorityCandidates: { candidateId: string; label: string }[];
  selectedMainPriority: { candidateId: string } | null;
};

let debutDuRun: Date;
/** Épisode et carte LUS AU COCKPIT — jamais fabriqués (voir l'en-tête). */
let episode: unknown;
let decisionCard: CarteLue;
/** L'identifiant de LIGNE de la version 1 : ce que l'arbitrage vise. */
let versionUnId: string;

test.describe.configure({ mode: 'serial' });

/**
 * L'état `ready` du cockpit, tel que l'écran le reçoit.
 *
 * Les objets rendus sont COMPLETS : `CarteLue` n'en type que la part utile au
 * parcours, et c'est bien la carte entière qui repart au serveur — la
 * tronquer ferait diverger l'empreinte et vaudrait 409.
 */
async function lireCockpitPret(
  request: APIRequestContext,
): Promise<{ episode: unknown; decisionCard: CarteLue }> {
  const runtime = await request.get(`/api/praticien/cockpit?idPatient=${PATIENT_ID}`);
  const corps = await runtime.text();
  expect(runtime.status(), `le cockpit n'a pas répondu 200 — corps : ${corps}`).toBe(200);
  const paye = JSON.parse(corps) as {
    status: string;
    snapshot?: { assessmentEpisode?: unknown };
    decisionCard?: CarteLue;
  };
  expect(
    paye.status,
    `le cockpit n'est pas « ready » — une précondition T0 manque : ${corps}`,
  ).toBe('ready');
  expect(paye.snapshot?.assessmentEpisode, 'le cockpit n’a pas rendu d’épisode confirmé').toBeTruthy();
  expect(paye.decisionCard, 'le cockpit n’a pas rendu de carte de décision').toBeTruthy();
  return {
    episode: paye.snapshot?.assessmentEpisode,
    decisionCard: paye.decisionCard as CarteLue,
  };
}

/**
 * Ce que la carte dit d'elle-même quand elle ne classe rien.
 *
 * Un « aucun candidat » nu ne distingue pas la table non signée d'une décision
 * bloquée par un signal, ni d'un canal de plainte hors épisode — trois causes
 * qui appellent trois corrections différentes.
 */
function pourquoiAucunCandidat(carte: CarteLue): string {
  const brut = carte as unknown as {
    abstention?: { status?: string; ruleIds?: string[]; limitations?: string[] };
    safetyFindingIds?: string[];
    limitations?: string[];
  };
  return JSON.stringify({
    abstention: brut.abstention,
    safetyFindingIds: brut.safetyFindingIds,
    limitations: brut.limitations,
  });
}

async function poserVersion(
  api: APIRequestContext,
  statut: 'conditionnelle_biologie' | 'active' | 'non_indiquee_actuellement',
  baseVersionId: string | null,
) {
  return api.post('/api/praticien/protocoles/versions', {
    data: { episode, decisionCard, submission: soumission(statut), baseVersionId },
  });
}

test.describe('Arbitrage biologique → révision — la résolution suit le verdict', () => {
  test.beforeAll(async () => {
    debutDuRun = new Date(Date.now() - 1_000);
    await provisionnerDossierBiologie(PATIENT_ID);
  });

  test.afterAll(async () => {
    await nettoyerProtocoleEtArbitrages(PATIENT_ID, debutDuRun);
    await nettoyerDossierBiologie(PATIENT_ID);
  });

  test('une intention EN ATTENTE de biologie se pose, et sa résolution est refusée sans arbitrage', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    // L'épisode doit être CONFIRMÉ pour que le cockpit serve une carte : c'est
    // le même geste que les autres parcours du rayon, et il passe par l'écran
    // parce que c'est là qu'il vit.
    await page.goto(`/dashboard/patients/${PATIENT_ID}`);
    await confirmerEpisodeT0(page);

    // ÉPISODE ET CARTE LUS AU COCKPIT. Les fabriquer ferait diverger la chaîne
    // C1 du dossier réel, et la route de versionnement le refuserait en 409 —
    // un refus qui décrit exactement ce que la garde existe pour faire, et
    // qu'un banc lirait à tort comme une régression.
    const avant = await lireCockpitPret(page.request);

    // ── LA PRIORITÉ RETENUE ([[D-127]]) ──────────────────────────────────────
    //
    // Sans elle, `buildProtocolDraft` refuse et AUCUNE des trois versions de ce
    // parcours n'existe. Elle passe par sa propre route : la carte qui en
    // résulte n'est pas dérivable au navigateur, son empreinte se calcule au
    // serveur. C'est aussi ce qui rend ce parcours utile — il prouve que la
    // chaîne réparée tient sur un dossier réel, pas seulement en banc unitaire.
    const candidat = avant.decisionCard.priorityCandidates[0];
    expect(
      candidat,
      'la carte ne classe aucune priorité — état de la carte : '
        + pourquoiAucunCandidat(avant.decisionCard),
    ).toBeTruthy();
    const selection = await page.request.post('/api/praticien/cockpit/priorite', {
      data: {
        episode: avant.episode,
        decisionCard: avant.decisionCard,
        candidateId: candidat.candidateId,
        rationale: MOTIF_SELECTION,
      },
    });
    expect(
      selection.status(),
      `la sélection de priorité a été refusée — corps : ${await selection.text()}`,
    ).toBe(200);

    // ON RELIT, ON NE FABRIQUE PAS. `selectedAt` entre dans l'empreinte de la
    // carte : celle d'avant la sélection est désormais périmée, et poser une
    // version dessus vaudrait 409. C'est exactement le geste de l'écran.
    const apres = await lireCockpitPret(page.request);
    episode = apres.episode;
    decisionCard = apres.decisionCard;
    expect(
      apres.decisionCard.selectedMainPriority?.candidateId,
      'le cockpit ne sert pas la sélection qui vient d’être posée',
    ).toBe(candidat.candidateId);

    // VERSION 1 — l'intention est posée, en attente de biologie.
    const v1 = await poserVersion(page.request, 'conditionnelle_biologie', null);
    const corpsV1 = await v1.text();
    expect(v1.status(), `la version 1 a été refusée — corps : ${corpsV1}`).toBe(200);
    const rendu = JSON.parse(corpsV1) as { versionId: string; unchanged: boolean };
    expect(rendu.unchanged).toBe(false);
    versionUnId = rendu.versionId;

    // RÉSOUDRE SANS ARBITRAGE EST REFUSÉ. C'est l'invariant du lot : une
    // intention en attente ne se résout pas parce qu'on l'a décidé à l'écran,
    // mais parce qu'un arbitrage lié à CETTE version la fonde.
    const sansArbitrage = await poserVersion(page.request, 'active', versionUnId);
    expect(sansArbitrage.status()).toBe(422);
    const refus = JSON.parse(await sansArbitrage.text()) as { reason: string; error: string };
    expect(refus.reason).toBe('resolution_sans_arbitrage');
    expect(refus.error).toContain('exige un arbitrage biologique lié');
  });

  test('le verdict INFIRMÉ se consigne avec sa note — inantidatable et inattribuable à autrui', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);

    // Un verdict `infirme` SANS note est refusé : ce qui a infirmé l'intention
    // doit rester lisible. Le refus est éprouvé avant le geste nominal — sans
    // quoi rien ne dirait que la note est exigée plutôt que polie.
    const sansNote = await page.request.post('/api/praticien/biologie/arbitrage', {
      data: {
        idPatient: PATIENT_ID,
        protocolDraftId: versionUnId,
        intentionId: INTENTION_ID,
        verdict: 'infirme',
      },
    });
    expect(sansNote.status()).toBe(422);
    expect((await sansNote.json()).reason).toBe('note_obligatoire_pour_infirme');

    const arbitrage = await page.request.post('/api/praticien/biologie/arbitrage', {
      data: {
        idPatient: PATIENT_ID,
        protocolDraftId: versionUnId,
        intentionId: INTENTION_ID,
        verdict: 'infirme',
        noteCourte: NOTE_ARBITRAGE,
      },
    });
    const corps = await arbitrage.text();
    expect(arbitrage.status(), `l'arbitrage a été refusé — corps : ${corps}`).toBe(201);

    // AUCUNE VALEUR D'ANALYSE NE TRANSITE : le corps envoyé n'en porte pas, et
    // ce qui revient non plus — seulement un verdict et une note.
    const rendu = JSON.parse(corps).arbitrage as {
      verdict: string;
      noteCourte: string;
      arbitrePar: string;
      arbitreLe: string;
    };
    expect(rendu.verdict).toBe('infirme');
    expect(rendu.noteCourte).toBe(NOTE_ARBITRAGE);
    // L'AUTEUR VIENT DE LA SESSION et la date de la base : le client n'a fourni
    // ni l'un ni l'autre, et n'aurait pas pu.
    expect(rendu.arbitrePar).toContain('@');
    expect(Number.isNaN(Date.parse(rendu.arbitreLe))).toBe(false);

    // Un second arbitrage sur la MÊME intention et la MÊME version est refusé :
    // l'historique vit dans les versions, pas dans des arbitrages empilés.
    const doublon = await page.request.post('/api/praticien/biologie/arbitrage', {
      data: {
        idPatient: PATIENT_ID,
        protocolDraftId: versionUnId,
        intentionId: INTENTION_ID,
        verdict: 'infirme',
        noteCourte: NOTE_ARBITRAGE,
      },
    });
    expect(doublon.status()).toBe(409);
    expect((await doublon.json()).reason).toBe('arbitrage_existant');
  });

  test('la révision SUIT le verdict : « active » reste refusée, « non indiquée » passe', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);

    // L'ARBITRAGE NE DONNE PAS CARTE BLANCHE. Il existe désormais, et pourtant
    // résoudre en « active » reste refusé — parce que le verdict INFIRME.
    // C'est la moitié de la garde qu'un banc naïf oublierait : vérifier
    // qu'un arbitrage est présent, sans vérifier qu'il dit la même chose.
    const contreVerdict = await poserVersion(page.request, 'active', versionUnId);
    expect(contreVerdict.status()).toBe(422);
    const refus = JSON.parse(await contreVerdict.text()) as { reason: string; error: string };
    expect(refus.reason).toBe('resolution_sans_arbitrage');
    expect(refus.error).toContain('ne peut être que « non indiquée actuellement »');

    // LA RÉSOLUTION CONFORME PASSE, et crée une VERSION DE PLUS — l'intention
    // n'est pas effacée, elle est conservée et motivée.
    const conforme = await poserVersion(page.request, 'non_indiquee_actuellement', versionUnId);
    const corps = await conforme.text();
    expect(conforme.status(), `la révision conforme a été refusée — corps : ${corps}`).toBe(200);
    const rendu = JSON.parse(corps) as {
      versionId: string;
      unchanged: boolean;
      supersedesDraftId: string | null;
    };
    expect(rendu.unchanged).toBe(false);
    expect(rendu.versionId).not.toBe(versionUnId);
    // LE CHAÎNAGE EST EXPLICITE : la nouvelle version supplante la première,
    // elle ne la remplace pas. C'est le même régime append-only que partout
    // ailleurs dans ce rayon.
    expect(rendu.supersedesDraftId).toBe(versionUnId);

    // ET L'INTENTION NE DISPARAÎT PAS DU PROTOCOLE : la version rendue par le
    // fil la porte toujours, non indiquée. Une intention en attente qui
    // s'évaporerait à la révision effacerait la question posée.
    const fil = await page.request.get(
      `/api/praticien/protocoles/versions?idPatient=${PATIENT_ID}`
        + `&decisionCardId=${encodeURIComponent(decisionCard.decisionCardId)}`,
    );
    expect(fil.status()).toBe(200);
    expect(await fil.text()).toContain(INTENTION_TITRE);
  });
});
