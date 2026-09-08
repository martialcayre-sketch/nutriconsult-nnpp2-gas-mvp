// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CockpitRuntimeApiResponse } from '@/app/api/praticien/cockpit/route';
import type { AbstentionAssessment, ProposedAssessmentEpisode } from '@/lib/clinical-engine/types';
import type { PlainteDominante } from '@/lib/clinical-engine/chaineC1';
import type { PreconditionsT0 } from '@/lib/clinical-engine/preconditionsT0';
import { buildValidationErgoC1Fixture } from '@/lib/clinical-engine/validationErgoFixture';
import { ClinicalRuntimeSection } from './ClinicalRuntimeSection';
import { EpisodeConfirmationPanel } from './EpisodeConfirmationPanel';
import { C5FeatureProvider } from './C5FeatureProvider';

const proposal: ProposedAssessmentEpisode = {
  assessmentEpisodeId: 'episode-T0',
  patientId: 'PAT_TEST',
  milestone: 'T0',
  targetAt: '2026-07-01T12:00:00.000Z',
  window: { start: '2026-06-28T12:00:00.000Z', end: '2026-07-04T12:00:00.000Z', toleranceDays: 3 },
  candidateResponses: [
    { responseId: 'R-IN', questionnaireId: 'Q-IN', observedAt: '2026-07-01T12:00:00.000Z', scoreVersion: null },
    { responseId: 'R-OUT', questionnaireId: 'Q-OUT', observedAt: '2026-07-10T12:00:00.000Z', scoreVersion: null },
  ],
  inWindowResponseIds: ['R-IN'],
  outOfWindowResponseIds: ['R-OUT'],
  includedResponseIds: ['R-IN'],
  sourceDateRange: { min: '2026-07-01T12:00:00.000Z', max: '2026-07-10T12:00:00.000Z' },
  status: 'proposed',
};

const proposalResponse: CockpitRuntimeApiResponse = {
  status: 'proposal_required',
  proposal,
  proposalHash: 'hash-proposal',
};

// Checklist minimale : tout est satisfait sauf ce que le cas décrit.
function preconditions(surcharge: Partial<PreconditionsT0> = {}): PreconditionsT0 {
  return {
    dures: [{ id: 'rideau_t0', libelle: 'Premier rideau renseigné et cotable', satisfaite: true, detail: null }],
    souples: [],
    bloquant: false,
    contournementsRequis: [],
    ...surcharge,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Depuis le LOT-07, le cockpit lit la TRAJECTOIRE avant de demander une
// proposition : le jalon n'est plus codé en dur, il s'en dérive. Les mocks
// ordonnés d'avant (`mockResolvedValueOnce` en cascade) décalaient donc d'un
// cran. Ils répondent désormais PAR URL — plus robuste, et indifférent à
// l'ordre comme au nombre d'appels.
type ReponseMock = { ok: boolean; status: number; json: () => Promise<unknown> };
const rep = (payload: unknown, ok = true, status = 200): ReponseMock => ({
  ok, status, json: async () => payload,
});

/**
 * TOUTES LES ROUTES SONT NOMMÉES, ET PLUS SEULEMENT DEUX.
 *
 * Le harnais ne connaissait que `trajectoire` et `propositions-objectif` : les
 * SEPT autres routes du runtime — quatre du rayon biologie, trois des
 * protocoles — tombaient dans les files génériques `cockpitGet`/`cockpitPost`
 * et y consommaient une réponse destinée au cockpit. Le symptôme n'est pas un
 * banc rouge, c'est un banc qui teste autre chose que ce qu'il annonce : la
 * réponse cockpit attendue au rang N est servie à un appel biologie, et le
 * cockpit reçoit le 500 de fin de file.
 *
 * ORDRE SIGNIFICATIF : les préfixes les plus longs d'abord.
 * `…/proposition/courrier` doit être reconnu AVANT `…/proposition`, sinon il
 * n'est jamais atteint.
 */
const ROUTES_NOMMEES = [
  ['/api/praticien/biologie/proposition/document-patient', 'cbDocumentPatient'],
  ['/api/praticien/biologie/proposition/courrier', 'cbCourrier'],
  ['/api/praticien/biologie/proposition', 'cbProposition'],
  ['/api/praticien/biologie/arbitrage', 'cbArbitrage'],
  ['/api/praticien/protocoles/checkins', 'protocolesCheckins'],
  ['/api/praticien/protocoles/diffusion', 'protocolesDiffusion'],
  ['/api/praticien/protocoles/versions', 'protocolesVersions'],
  ['/api/praticien/propositions-objectif', 'propositions'],
  ['/api/praticien/trajectoire', 'trajectoire'],
] as const;

type RouteNommee = (typeof ROUTES_NOMMEES)[number][1];

/**
 * UNE ROUTE PEUT PORTER DEUX VERBES, et le préfixe seul ne les distingue pas.
 *
 * Depuis le LOT-01 « Biologie exploitée », `…/document-patient` répond en GET
 * (relecture des pièces remises) ET en POST (consignation). Un cas qui ne
 * déclarait que `cbDocumentPatient` voyait sa réponse de POST consommée par le
 * GET qui la précède — un banc vert qui teste autre chose que ce qu'il
 * annonce, le défaut même que le routage par URL avait fermé.
 *
 * Un cas peut donc suffixer la clé par le verbe ; la clé nue sert les deux
 * quand elle est seule.
 */
type CleRoute = RouteNommee | `${RouteNommee}Get` | `${RouteNommee}Post`;

/**
 * Une route NON DÉCLARÉE par le cas répond en échec, pas en succès vide.
 *
 * Le réflexe inverse a été essayé et rejeté sur mesure : servir un
 * `{ ok: true }` minimal à une route dont le cas ne parle pas fait emprunter au
 * composant des chemins de succès qu'il ne prenait pas, avec des charges utiles
 * incomplètes — trois bancs sont tombés, dont un sur un DOM entièrement démonté
 * par un rejet non géré. L'échec, lui, est exactement ce que ces routes
 * recevaient déjà avant ce routage (la file générique épuisée rendait un 500),
 * et chaque chargeur du runtime l'absorbe dans son `catch` en le traitant comme
 * une donnée indicative absente.
 *
 * `trajectoire` et `propositions` font exception, et c'est leur histoire : le
 * runtime les lit AVANT de savoir quoi demander, si bien qu'un échec y change
 * la séquence au lieu d'omettre un panneau. Elles gardent le succès vide
 * qu'elles servaient déjà.
 */
const DEFAUTS: Partial<Record<RouteNommee, unknown>> = {
  propositions: { ok: true, propositions: [], disposees: [], caduques: [] },
  trajectoire: { ok: true, trajectoire: null },
};

const ECHEC_ROUTE_NON_DECLAREE = () => rep({}, false, 500);

function fetchParRoute(
  routes: {
    cockpitGet?: ReponseMock[];
    cockpitPost?: ReponseMock[];
  } & Partial<Record<CleRoute, ReponseMock | ReponseMock[]>>,
) {
  const get = [...(routes.cockpitGet ?? [])];
  const post = [...(routes.cockpitPost ?? [])];
  // Une route peut être servie par une réponse unique (rejouée à chaque appel)
  // ou par une file (consommée dans l'ordre) — le rechargement d'une même route
  // après un geste est courant dans ce runtime.
  const declarees = routes as Record<string, ReponseMock | ReponseMock[] | undefined>;
  const files = new Map<string, ReponseMock[]>();
  for (const [cle, valeur] of Object.entries(declarees)) {
    if (cle !== 'cockpitGet' && cle !== 'cockpitPost' && Array.isArray(valeur)) {
      files.set(cle, [...valeur]);
    }
  }

  return vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const cible = String(url);
    const entree = ROUTES_NOMMEES.find(([prefixe]) => cible.includes(prefixe));
    if (entree) {
      const nom = entree[1];
      const defaut = () =>
        nom in DEFAUTS ? rep(DEFAUTS[nom]) : ECHEC_ROUTE_NON_DECLAREE();
      // La clé qualifiée par le verbe l'emporte ; la clé nue sert de repli.
      const qualifiee = `${nom}${init?.method === 'POST' ? 'Post' : 'Get'}`;
      for (const cle of [qualifiee, nom]) {
        const file = files.get(cle);
        if (file) return file.shift() ?? defaut();
        const unique = declarees[cle];
        if (unique && !Array.isArray(unique)) return unique;
      }
      return defaut();
    }
    if (init?.method === 'POST') return post.shift() ?? rep({}, false, 500);
    return get.shift() ?? rep({}, false, 500);
  });
}

/** Toutes les URLs de GET cockpit, dans l'ordre d'appel. */
function urlsCockpit(mock: { mock: { calls: unknown[][] } }): string[] {
  return mock.mock.calls
    .map(appel => String(appel[0]))
    .filter(url => url.includes('/api/praticien/cockpit'));
}

/** La première d'entre elles. */
function urlCockpit(mock: { mock: { calls: unknown[][] } }): string | undefined {
  return urlsCockpit(mock)[0];
}

/** Le corps du POST cockpit, quel que soit son rang. */
function corpsPoste(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> | null {
  const appel = mock.mock.calls.find(
    candidat =>
      (candidat[1] as { method?: string } | undefined)?.method === 'POST'
      && String(candidat[0]).includes('/api/praticien/cockpit'),
  );
  const corps = (appel?.[1] as { body?: string } | undefined)?.body;
  return corps ? (JSON.parse(corps) as Record<string, unknown>) : null;
}

/** Le corps du POST d'assemblage vers le moteur de proposition, s'il a eu lieu. */
function corpsAssemblage(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> | null {
  const appel = mock.mock.calls.find(
    candidat =>
      (candidat[1] as { method?: string } | undefined)?.method === 'POST'
      && String(candidat[0]).includes('/api/praticien/propositions-objectif'),
  );
  const corps = (appel?.[1] as { body?: string } | undefined)?.body;
  return corps ? (JSON.parse(corps) as Record<string, unknown>) : null;
}

describe('EpisodeConfirmationPanel', () => {
  // L'écran annonçait « Cette confirmation reste en mémoire et ne modifie
  // aucune donnée » au-dessus du geste qui écrit l'épisode — et que [[D-129]]
  // vient de rendre ÉCRASANT sur une re-confirmation divergente. La phrase
  // n'était gardée par aucun banc ; c'est désormais le cas.
  it('annonce que confirmer écrit, et que la date de l’acte ne bouge pas', () => {
    render(<EpisodeConfirmationPanel proposal={proposal} submitting={false} onConfirm={vi.fn()} />);

    expect(screen.queryByText(/ne modifie aucune donnée/)).toBeNull();
    expect(screen.queryByText(/reste en mémoire/)).toBeNull();
    expect(screen.getByText(/Confirmer enregistre l’épisode/)).not.toBeNull();
    expect(screen.getByText(/sans déplacer la date de l’acte/)).not.toBeNull();
  });

  it('sélectionne les réponses dans la fenêtre par défaut et permet une correction hors fenêtre', () => {
    const onConfirm = vi.fn();
    render(<EpisodeConfirmationPanel proposal={proposal} submitting={false} onConfirm={onConfirm} />);

    expect((screen.getByLabelText(/Q-IN/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Q-OUT/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText(/Q-OUT/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));

    expect(onConfirm).toHaveBeenCalledWith(['R-IN', 'R-OUT'], []);
    expect(screen.queryByText(/scoresJson/)).toBeNull();
  });

  // REMPLACE « exige aussi une confirmation explicite pour un épisode vide ».
  // Ce banc encodait le comportement que [[D-052]] supprime : le panneau
  // invitait à confirmer un dossier vide, et rien côté API ne s'y opposait.
  it('une condition dure non remplie interdit la confirmation', () => {
    const onConfirm = vi.fn();
    render(
      <EpisodeConfirmationPanel
        proposal={proposal}
        preconditions={preconditions({
          dures: [{
            id: 'rideau_t0', libelle: 'Premier rideau renseigné et cotable',
            satisfaite: false, detail: 'Premier rideau incomplet — non renseignés : Q_MOD_03, Q_MOD_01.',
          }],
          bloquant: true,
        })}
        submitting={false}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Premier rideau incomplet/)).toBeTruthy();
    const bouton = screen.getByRole('button', { name: 'Confirmer l’épisode T0' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    fireEvent.click(bouton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('une condition souple se contourne, mais jamais sans motif', () => {
    const onConfirm = vi.fn();
    render(
      <EpisodeConfirmationPanel
        proposal={proposal}
        preconditions={preconditions({
          souples: [{
            id: 'contradictions_ouvertes', libelle: 'Aucune contradiction ouverte',
            satisfaite: false, detail: '2 contradictions ouvertes sur ce dossier.',
          }],
          contournementsRequis: ['contradictions_ouvertes'],
        })}
        submitting={false}
        onConfirm={onConfirm}
      />,
    );

    const bouton = screen.getByRole('button', { name: 'Confirmer l’épisode T0' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Pourquoi confirmer/), {
      target: { value: 'Discordance déjà reprise en entretien.' },
    });
    expect(bouton.disabled).toBe(false);
    fireEvent.click(bouton);
    expect(onConfirm).toHaveBeenCalledWith(
      ['R-IN'],
      [{ conditionId: 'contradictions_ouvertes', motif: 'Discordance déjà reprise en entretien.' }],
    );
  });

  // D-119 — le motif de contournement se rédige DEVANT les constats, plus
  // devant un compte : la description et les passations recopiées du service
  // s'affichent dans l'avertissement lui-même.
  it('les constats de contradiction s’affichent dans l’avertissement', () => {
    render(
      <EpisodeConfirmationPanel
        proposal={proposal}
        preconditions={preconditions({
          souples: [{
            id: 'contradictions_ouvertes',
            libelle: 'Aucune contradiction ouverte',
            satisfaite: false,
            detail: '1 contradiction ouverte sur ce dossier — confirmer ne la résout pas : votre motif est tracé avec l’épisode.',
            constats: [{
              description: 'Stress déclaré discordant entre instruments.',
              passations: ['Q_MOD_01 — 12/03/2026', 'Q_STR_04 — 10/08/2026'],
            }],
          }],
          contournementsRequis: ['contradictions_ouvertes'],
        })}
        submitting={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('Stress déclaré discordant entre instruments.')).toBeTruthy();
    expect(screen.getByText(/Q_MOD_01 — 12\/03\/2026 · Q_STR_04 — 10\/08\/2026/)).toBeTruthy();
    // Le geste reste exigé : les constats éclairent le motif, ils ne le remplacent pas.
    expect(screen.getByPlaceholderText(/Pourquoi confirmer/)).toBeTruthy();
  });

  it('nomme ce qui n’est pas requis pour un T0, plutôt que de le taire', () => {
    render(
      <EpisodeConfirmationPanel
        proposal={proposal}
        preconditions={preconditions()}
        submitting={false}
        onConfirm={vi.fn()}
      />,
    );
    // Le nom MÉTIER, jamais l'identifiant d'instrument — Q_SOM_09 relevait de
    // la fuite dev à l'écran (audit du cockpit 2026-09-02).
    expect(screen.getByText(/agenda du sommeil, bien qu’il figure au pack de base/)).toBeTruthy();
    expect(screen.queryByText(/Q_SOM_09/)).toBeNull();
    // [[D-158]] — LA DISPENSE EST BORNÉE AU PREMIER RIDEAU, et la phrase le dit
    // dans les deux sens. « Les agendas ne sont pas requis » tout court est
    // devenu faux : un agenda assigné après la synthèse EST attendu.
    expect(screen.getByText(/pas requis au premier rideau/)).toBeTruthy();
    expect(screen.getByText(/après la synthèse/)).toBeTruthy();
  });
});

describe('ClinicalRuntimeSection', () => {

  // ── Le déclencheur d'assemblage (Alliance 6.0-B, LOT-03) ─────────────────
  //
  // C'EST LE CŒUR DU LOT, et il n'avait aucun banc (relevé en revue). La carte
  // de décision n'est persistée nulle part : elle n'existe que dans cette
  // réponse-là. Si ce POST ne part pas, la table `propositions_objectif` reste
  // vide et la surface entière est inerte.

  function readyAvecCandidats(): CockpitRuntimeApiResponse {
    const fixture = buildValidationErgoC1Fixture();
    return {
      status: 'ready',
      snapshot: fixture.snapshot,
      review: fixture.review,
      decisionCard: {
        ...fixture.decisionCard,
        priorityCandidates: [
          {
            candidateId: 'priority:PRIO-SOM-01',
            origin: 'engine',
            label: 'Explorer le sommeil',
            rank: 1,
            confidence: 'à_documenter',
            ruleId: 'PRIO-SOM-01',
            rationale: 'Déclencheur atteint.',
            provenance: { responseIds: ['R-IN'], needIds: [], clinicalObjectCodes: [] },
            limitations: [],
          },
        ],
      },
      contradictions: [],
      plainteDominante: { domaine: 'sommeil', libelle: 'Sommeil', valeur: 8, bande: 'Restitution publiée' },
      perimetreSigne: 'a'.repeat(64),
      canalPlainte: 'Q_MOD_03',
    };
  }

  async function confirmer(fetchMock: ReturnType<typeof fetchParRoute>) {
    vi.stubGlobal('fetch', fetchMock);
    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));
    await screen.findByText(/Épisode T0 confirmé/);
  }

  it('demande l’assemblage sur `ready`, en citant la source et jamais le rang', async () => {
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(readyAvecCandidats())],
    });
    await confirmer(fetchMock);

    await waitFor(() => expect(corpsAssemblage(fetchMock)).toBeTruthy());
    const charge = corpsAssemblage(fetchMock)!;
    expect(charge).toMatchObject({ action: 'assembler', idPatient: 'PAT_TEST' });

    // L'instrument vient de la RÉPONSE, pas d'un import : le composant est
    // `'use client'`, et importer la table signée pour une seule chaîne
    // embarquerait ses règles dans le bundle du navigateur.
    expect(charge.plainte).toEqual({
      instrument: 'Q_MOD_03',
      domaine: 'sommeil',
      restitution: 'Restitution publiée',
    });
    // L'INTENSITÉ DÉCLARÉE NE PART PAS : c'est un nombre, et un nombre déposé
    // dans une proposition se trierait.
    expect(JSON.stringify(charge.plainte)).not.toContain('8');

    expect(charge.candidats).toEqual([{ regle: 'PRIO-SOM-01', texte: 'Explorer le sommeil' }]);
    // NI `rank`, NI `confidence` — ce qu'on n'envoie pas ne peut pas se
    // persister, donc ne peut pas se trier (`D-093`).
    const envoye = JSON.stringify(charge);
    expect(envoye).not.toContain('rank');
    expect(envoye).not.toContain('confidence');

    expect(charge.shaPerimetre).toBe('a'.repeat(64));
  });

  it('délègue la relecture de trajectoire une fois, après la confirmation', async () => {
    const recharger = vi.fn();
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(readyAvecCandidats())],
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ClinicalRuntimeSection
        idPatient="PAT_TEST"
        fixture={null}
        protocolDraft={null}
        onFixtureReviewed={vi.fn()}
        trajectoirePartagee={null}
        statutTrajectoirePartage="chargee"
        onRechargerTrajectoire={recharger}
      />,
    );

    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    expect(recharger).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));
    await screen.findByText(/Épisode T0 confirmé/);
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('n’assemble PAS tant que la réponse n’est pas `ready`', async () => {
    // La proposition périmée (409) recharge et ne confirme rien : il n'y a pas
    // de carte, donc rien à citer.
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse), rep(proposalResponse)],
      cockpitPost: [rep({ status: 'unavailable', reason: 'proposal_stale', error: 'Rechargez.' }, false, 409)],
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    expect(corpsAssemblage(fetchMock)).toBeNull();
  });

  it('UN ÉCHEC D’ASSEMBLAGE NE FAIT PAS ÉCHOUER LA CONFIRMATION', async () => {
    // Le drapeau est éteint à la livraison : le `503` est l'état NOMINAL. Le
    // praticien a confirmé son épisode et voit sa carte — c'est le résultat
    // qu'il attendait ; une proposition absente est une surface en moins,
    // jamais une raison de retirer ce qui a réussi.
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(readyAvecCandidats())],
      propositions: rep({ ok: false, reason: 'feature_disabled', error: 'Fonctionnalité non ouverte.' }, false, 503),
    });
    const signal = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ClinicalRuntimeSection
        idPatient="PAT_TEST"
        fixture={null}
        protocolDraft={null}
        onFixtureReviewed={vi.fn()}
        onPropositionsAssemblees={signal}
      />,
    );
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));

    await screen.findByText(/Épisode T0 confirmé/);
    await waitFor(() => expect(corpsAssemblage(fetchMock)).toBeTruthy());
    // Le signal n'est PAS émis : rien n'a été assemblé, le panneau n'a rien à
    // relire.
    expect(signal).not.toHaveBeenCalled();
  });

  it('prévient le poste de pilotage quand l’assemblage a abouti', async () => {
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(readyAvecCandidats())],
    });
    const signal = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ClinicalRuntimeSection
        idPatient="PAT_TEST"
        fixture={null}
        protocolDraft={null}
        onFixtureReviewed={vi.fn()}
        onPropositionsAssemblees={signal}
      />,
    );
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));

    await waitFor(() => expect(signal).toHaveBeenCalledTimes(1));
  });
  it('enchaîne GET, confirmation POST et rendu prudent des objets C1', async () => {
    const fixture = buildValidationErgoC1Fixture();
    const ready: CockpitRuntimeApiResponse = {
      status: 'ready',
      snapshot: fixture.snapshot,
      review: { ...fixture.review, abstention: { status: 'not_evaluated', ruleIds: [], limitations: ['Règles non validées.'] } },
      decisionCard: {
        ...fixture.decisionCard,
        priorityCandidates: [],
        proposedMainPriorityId: null,
        selectedMainPriority: null,
        abstention: { status: 'not_evaluated', ruleIds: [], limitations: ['Règles non validées.'] },
      },
      // Table non signée : c'est la réponse que la production sert aujourd'hui.
      contradictions: [],
      plainteDominante: null,
      // Alliance 6.0-B, LOT-03 : le SHA voyage à côté de la carte, jamais dedans.
      perimetreSigne: null,
      canalPlainte: 'Q_MOD_03',
    };
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(ready)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));

    await screen.findByText(/Épisode T0 confirmé/);
    expect(screen.getByText('Aucune priorité proposée')).toBeTruthy();
    expect(screen.getByText('Protocole indisponible — bloqueurs décisionnels à revoir')).toBeTruthy();
    expect(urlCockpit(fetchMock)).toBe('/api/praticien/cockpit?idPatient=PAT_TEST&milestone=T0');
    expect(corpsPoste(fetchMock)).toMatchObject({
      idPatient: 'PAT_TEST', milestone: 'T0', includedResponseIds: ['R-IN'], proposalHash: 'hash-proposal',
    });
  });

  it('recharge automatiquement une proposition périmée et redemande confirmation', async () => {
    const stale: CockpitRuntimeApiResponse = { status: 'unavailable', reason: 'proposal_stale', error: 'Périmée.' };
    const refreshed = { ...proposalResponse, proposalHash: 'hash-refreshed' } satisfies CockpitRuntimeApiResponse;
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse), rep(refreshed)],
      cockpitPost: [rep(stale, false, 409)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('button', { name: 'Confirmer l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));

    expect(await screen.findByText(/proposition a été rechargée/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirmer l’épisode T0' }) as HTMLButtonElement).disabled).toBe(false);
    // Trajectoire + GET initial + POST périmé + GET rechargé.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['unauthenticated', 401, /Votre session a expiré/],
    ['patient_not_found', 404, /Patient introuvable/],
    ['exception', 500, /Erreur technique/],
  ] as const)('affiche l’état indisponible %s', async (reason, status, expected) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ status: 'unavailable', reason, error: 'Indisponible.' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />,
    );
    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it('ne contacte jamais le runtime avec la fixture ergonomique', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ClinicalRuntimeSection
        idPatient="PAT_TEST"
        fixture={buildValidationErgoC1Fixture()}
        protocolDraft={null}
        onFixtureReviewed={vi.fn()}
      />,
    );
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('n’affiche l’Observatoire que lorsque le flag serveur est actif', async () => {
    const fixture = buildValidationErgoC1Fixture();
    const ready: CockpitRuntimeApiResponse = {
      status: 'ready',
      snapshot: fixture.snapshot,
      review: fixture.review,
      decisionCard: fixture.decisionCard,
      contradictions: [],
      plainteDominante: null,
      // Alliance 6.0-B, LOT-03 : le SHA voyage à côté de la carte, jamais dedans.
      perimetreSigne: null,
      canalPlainte: 'Q_MOD_03',
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ready });
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(
      <ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />,
    );
    expect(screen.queryByRole('heading', { name: /Boussole alimentaire/ })).toBeNull();
    rerender(
      <C5FeatureProvider enabled>
        <ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />
      </C5FeatureProvider>,
    );
    expect(await screen.findByRole('heading', { name: /Boussole alimentaire/ })).toBeTruthy();
  });
});

// LE CÂBLAGE DE BOUT EN BOUT — [[D-050]].
//
// La capacité d'affichage existait depuis l'étape 5 ; aucun site d'appel ne la
// nourrissait, et le critère de sortie du LOT-01 n'était donc pas tenu. Ce banc
// tient le fil entier : ce que la route rend arrive à l'écran. Les bancs de
// `MissingDataPanel.test.tsx` gardent le rendu lui-même ; celui-ci garde la
// LIAISON, qui se coupe sans bruit — un `contradictions={[]}` codé en dur
// laisserait tous les autres bancs verts.
describe('ClinicalRuntimeSection — les constats déterministes atteignent l’écran', () => {
  it('un constat rendu par la route est affiché dans le panneau', async () => {
    const fixture = buildValidationErgoC1Fixture();
    const ready: CockpitRuntimeApiResponse = {
      status: 'ready',
      snapshot: fixture.snapshot,
      review: fixture.review,
      decisionCard: fixture.decisionCard,
      contradictions: [{
        id: 'C-STR',
        forme: 'DISCORDANCE' as const,
        description: 'Une contradiction que le praticien doit voir.',
        actionSuggeree: 'Clarifier en entretien avant toute conclusion.',
        hypotheses: ['Une charge de stress que les échelles ne captent pas.'],
        limitations: ['Un questionnaire isolé ne suffit pas à conclure.'],
        passations: [
          { idQuestionnaire: 'Q_MOD_01', date: '2026-03-12', dateLisible: '12/03/2026' },
          { idQuestionnaire: 'Q_STR_04', date: '2026-08-10', dateLisible: '10/08/2026' },
        ],
        ecartJours: 151,
        claims: [{ claimId: 'WN-CL-0238-002', versionClaim: 'v1.0' }],
        importance: 'useful_not_urgent',
        resolution: { statut: 'ouverte' },
        regleId: 'C-STR',
      }],
      plainteDominante: null,
      // Alliance 6.0-B, LOT-03 : le SHA voyage à côté de la carte, jamais dedans.
      perimetreSigne: null,
      canalPlainte: 'Q_MOD_03',
    };
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(ready)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));

    // Le niveau 1 du panneau, sans dépliage : la description doit se lire
    // d'emblée — une contradiction que le praticien doit cliquer pour voir est
    // une contradiction qu'il peut manquer.
    await screen.findByText('Une contradiction que le praticien doit voir.');
  });
});

// LE CANAL PLAINTE ET L'ÉTAT RÉEL DE LA DÉCISION — [[D-054]].
//
// Le bandeau annonçait « Décision suspendue : l'abstention clinique n'est pas
// encore évaluée » QUEL QUE SOIT l'état réel : il devenait faux le jour où
// l'abstention est évaluée, et rien ne l'aurait dit. Ce banc tient les trois
// positions, et l'ordre d'affichage — la plainte AVANT l'agrégat, sans quoi un
// score global honorable recouvre une plainte à 9/10.
describe('ClinicalRuntimeSection — plainte du patient et état de la décision', () => {
  function reponsePrete(
    abstention: AbstentionAssessment,
    plainteDominante: PlainteDominante | null,
  ): CockpitRuntimeApiResponse {
    const fixture = buildValidationErgoC1Fixture();
    return {
      status: 'ready',
      snapshot: {
        ...fixture.snapshot,
        patientContext: { ...fixture.snapshot.patientContext, priorityGoal: 'Retrouver un confort digestif' },
      },
      review: { ...fixture.review, abstention },
      decisionCard: { ...fixture.decisionCard, abstention },
      contradictions: [],
      plainteDominante,
      // Alliance 6.0-B, LOT-03 : le SHA voyage à côté de la carte, jamais dedans.
      perimetreSigne: null,
      canalPlainte: 'Q_MOD_03',
    };
  }

  async function afficher(reponse: CockpitRuntimeApiResponse) {
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(reponse)],
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));
  }

  it('affiche la plainte dominante et l’objectif prioritaire en tête, avant la décision', async () => {
    await afficher(reponsePrete(
      { status: 'not_required', ruleIds: ['PRIO-PON-01'], limitations: [] },
      { domaine: 'surpoids', libelle: 'Surpoids', valeur: 9, bande: 'Intensité très élevée' },
    ));

    const panneau = await screen.findByRole('region', { name: 'Plainte et objectif du patient' });
    expect(panneau.textContent).toContain('Surpoids — 9/10 (Intensité très élevée)');
    expect(panneau.textContent).toContain('Retrouver un confort digestif');

    // EN TÊTE, et pas seulement « présent » : la position est ce que le lot
    // demande, et un panneau juste sous l'agrégat serait vert sans elle.
    const bandeau = screen.getByText(/Abstention clinique évaluée/);
    expect(panneau.compareDocumentPosition(bandeau) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('dit l’état réel de l’abstention, et non une phrase figée', async () => {
    await afficher(reponsePrete(
      { status: 'required', ruleIds: ['PRIO-PON-01'], limitations: [] },
      { domaine: 'digestion', libelle: 'Digestion', valeur: 8, bande: 'Intensité élevée' },
    ));
    expect(await screen.findByText(/l’abstention clinique est requise/)).toBeTruthy();
    expect(screen.queryByText(/n’est pas encore évaluée/)).toBeNull();
  });

  it('conserve le message d’origine tant que l’abstention n’est pas évaluée', async () => {
    await afficher(reponsePrete(
      { status: 'not_evaluated', ruleIds: [], limitations: ['Règles non validées.'] },
      null,
    ));
    expect(await screen.findByText(/n’est pas encore évaluée/)).toBeTruthy();
    // La plainte est absente, l'objectif ne l'est pas : le panneau reste utile.
    const panneau = screen.getByRole('region', { name: 'Plainte et objectif du patient' });
    expect(panneau.textContent).toContain('Non renseignée');
  });

  // Proposition J21 telle que la route la rendrait : même forme que le T0,
  // jalon et hash propres. Le panneau doit NOMMER ce jalon (revue LOT-07, M2).
  const propositionJ21: CockpitRuntimeApiResponse = {
    status: 'proposal_required',
    proposal: { ...proposal, assessmentEpisodeId: 'episode-J21', milestone: 'J21' },
    proposalHash: 'hash-J21',
  };

  function trajectoireAncreConfirmeeIlYA(jours: number, ancre: 'T0' | 'T1' = 'T0') {
    const dateAncre = new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString();
    return rep({
      ok: true,
      trajectoire: {
        index: [{ milestone: ancre, date: dateAncre, cycleId: 'cycle-1' }],
        cycles: [{
          cycleId: 'cycle-1', ancre, dateAncre, versionScore: 'v15', jalons: [], momentum: null,
          momentumParBesoin: [],
        }],
        comparaison: { disponible: false, raison: 'un_seul_cycle' },
        discordanceOrdreCycles: false,
      },
    });
  }

  it('demande le J21 quand sa fenêtre est ouverte, et le panneau NOMME le jalon', async () => {
    // LE COMPORTEMENT NEUF DU LOT-07. Avant, `milestone=T0` était codé en dur :
    // J21, J42 et J90 étaient inatteignables depuis l'interface alors que le
    // back les acceptait déjà.
    const fetchMock = fetchParRoute({
      trajectoire: trajectoireAncreConfirmeeIlYA(21),
      cockpitGet: [rep(proposalResponse), rep(propositionJ21)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    // Le T0 part d'abord — c'est le plancher, la trajectoire ne doit jamais
    // retarder la proposition. Le J21 suit dès qu'elle a répondu.
    await waitFor(() => expect(urlsCockpit(fetchMock).some(url => url.includes('milestone=J21'))).toBe(true));
    expect(urlCockpit(fetchMock)).toContain('milestone=T0');
    // Le panneau dit « J21 » partout où il disait « T0 » en dur (M2) : un
    // praticien qui confirme un J21 ne doit lire T0 nulle part.
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode J21' });
    expect(screen.queryByRole('button', { name: 'Confirmer l’épisode T0' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmer l’épisode J21' })).toBeTruthy();
  });

  it('le POST porte le jalon et le hash de la proposition AFFICHÉE', async () => {
    const fixture = buildValidationErgoC1Fixture();
    const confirme: CockpitRuntimeApiResponse = {
      status: 'ready',
      snapshot: fixture.snapshot,
      review: fixture.review,
      decisionCard: fixture.decisionCard,
      contradictions: [],
      plainteDominante: null,
      // Alliance 6.0-B, LOT-03 : le SHA voyage à côté de la carte, jamais dedans.
      perimetreSigne: null,
      canalPlainte: 'Q_MOD_03',
    };
    const fetchMock = fetchParRoute({
      trajectoire: trajectoireAncreConfirmeeIlYA(21),
      cockpitGet: [rep(proposalResponse), rep(propositionJ21)],
      cockpitPost: [rep(confirme)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer l’épisode J21' }));
    await waitFor(() => expect(corpsPoste(fetchMock)).not.toBeNull());
    expect(corpsPoste(fetchMock)).toMatchObject({ milestone: 'J21', proposalHash: 'hash-J21' });
  });

  it('hors fenêtre : le motif se dit ET aucun bouton de confirmation n’existe', async () => {
    // T0 confirmé il y a 31 jours : la fenêtre du J21 est fermée (29), celle du
    // J42 pas encore ouverte (34). Le GET rend `proposal_required` — la SEULE
    // forme que la route émette avec `unavailable`. Le banc précédent jouait un
    // `ready` que le GET ne rend jamais, et cette fabrication masquait le
    // défaut : le panneau de confirmation restait actif sous le message
    // « aucun jalon confirmable » (revue LOT-07, M1).
    const fetchMock = fetchParRoute({
      trajectoire: trajectoireAncreConfirmeeIlYA(31),
      cockpitGet: [rep(proposalResponse)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    // Le motif se dit : un cockpit muet se lirait comme une panne.
    expect(await screen.findByText(/s’ouvrira/)).toBeTruthy();
    // HORS FENÊTRE, RIEN N'EST PROPOSÉ — le panneau non plus, pas seulement
    // le message. Le T0 du plancher est resté chargé : il ne doit PAS être
    // confirmable.
    expect(screen.queryByRole('button', { name: /Confirmer l’épisode/ })).toBeNull();
    // Et AUCUN jalon hors fenêtre n'est demandé : seul le T0 du plancher part.
    expect(urlsCockpit(fetchMock)).toEqual(['/api/praticien/cockpit?idPatient=PAT_TEST&milestone=T0']);
  });
});

// ---------------------------------------------------------------------------
// `D-113` §8 — ouvrir un nouveau cycle est un GESTE, jamais une proposition.
// ---------------------------------------------------------------------------
describe('ClinicalRuntimeSection — ouverture d’un nouveau cycle (`D-113`)', () => {
  const propositionJ21: CockpitRuntimeApiResponse = {
    status: 'proposal_required',
    proposal: { ...proposal, assessmentEpisodeId: 'episode-J21', milestone: 'J21' },
    proposalHash: 'hash-J21',
  };
  const propositionT1: CockpitRuntimeApiResponse = {
    status: 'proposal_required',
    proposal: { ...proposal, assessmentEpisodeId: 'episode-T1', milestone: 'T1' },
    proposalHash: 'hash-T1',
  };

  function trajectoireAncre(jours: number, ancre: 'T0' | 'T1' = 'T0') {
    const dateAncre = new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString();
    return rep({
      ok: true,
      trajectoire: {
        index: [{ milestone: ancre, date: dateAncre, cycleId: 'cycle-1' }],
        cycles: [{
          cycleId: 'cycle-1', ancre, dateAncre, versionScore: 'v15', jalons: [], momentum: null,
          momentumParBesoin: [],
        }],
        comparaison: { disponible: false, raison: 'un_seul_cycle' },
        discordanceOrdreCycles: false,
      },
    });
  }

  it('propose l’ouverture en NOMMANT l’ancre et ce que le geste coûte', async () => {
    // T0 confirmé il y a 31 jours : aucun jalon confirmable. Le cockpit disait
    // le motif et s'arrêtait là — le praticien n'avait aucun moyen de rouvrir.
    const fetchMock = fetchParRoute({
      trajectoire: trajectoireAncre(31),
      cockpitGet: [rep(proposalResponse)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Ouvrir un nouveau cycle (T1)' })).toBeTruthy();
    // La fermeture des fenêtres restantes était un effet de bord silencieux :
    // elle est désormais ÉCRITE au-dessus du bouton.
    expect(screen.getByText(/ferme les fenêtres de jalon encore ouvertes/i)).toBeTruthy();
  });

  it('le geste demande la proposition de la NOUVELLE ancre, et rien n’est écrit avant confirmation', async () => {
    const fetchMock = fetchParRoute({
      trajectoire: trajectoireAncre(31),
      cockpitGet: [rep(proposalResponse), rep(propositionT1)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir un nouveau cycle (T1)' }));

    await waitFor(() => expect(urlsCockpit(fetchMock).some(url => url.includes('milestone=T1'))).toBe(true));
    // Le panneau de confirmation rouvre : le motif « aucun jalon confirmable »
    // portait sur les jalons du cycle COURANT, pas sur le suivant.
    expect(await screen.findByRole('button', { name: 'Confirmer l’épisode T1' })).toBeTruthy();
    // Tant qu'il n'est pas confirmé, rien n'a changé pour le patient.
    expect(corpsPoste(fetchMock)).toBeNull();
    expect(screen.getByText(/rien n’a changé pour ce patient/i)).toBeTruthy();
  });

  it('l’ouverture demandée n’est jamais écrasée par la resynchronisation du jalon dû', async () => {
    // Un jalon EST dû (J21 ouvert) : sans le drapeau d'ouverture, l'effet de
    // resynchronisation aurait immédiatement redemandé `J21` et le geste
    // aurait été impossible à mener à son terme.
    const fetchMock = fetchParRoute({
      trajectoire: trajectoireAncre(21),
      cockpitGet: [rep(proposalResponse), rep(propositionJ21), rep(propositionT1)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    // Le geste reste offert PENDANT qu'un jalon est dû : c'est le cas clinique
    // qui a motivé la décision (un nouveau départ, J90 encore ouvert).
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir un nouveau cycle (T1)' }));

    expect(await screen.findByRole('button', { name: 'Confirmer l’épisode T1' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmer l’épisode J21' })).toBeNull());
  });

  it('sans aucun cycle, aucun geste d’ouverture : le jalon dû EST l’ouverture', async () => {
    const fetchMock = fetchParRoute({
      trajectoire: rep({ ok: true, trajectoire: { index: [], cycles: [], comparaison: { disponible: false, raison: 'aucun_cycle' }, discordanceOrdreCycles: false } }),
      cockpitGet: [rep(proposalResponse)],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('button', { name: 'Confirmer l’épisode T0' });
    expect(screen.queryByRole('button', { name: /Ouvrir un nouveau cycle/ })).toBeNull();
  });
});

// D-118 — UN ÉPISODE PERSISTÉ SE REJOUE, ET L'ÉTAT « CONFIRMÉ » SURVIT À LA PAGE.
//
// Le défaut d'origine : T0 confirmé le matin, page rechargée, et le rail
// affichait « Décision : en attente » sur un acte déjà posé. Trois propriétés
// à tenir, chacune son banc : le rejeu s'affiche sans redemander le geste ;
// l'état « confirmé » dérive de la base (trajectoire) et non du seul écran ;
// et un rejeu ne verrouille pas le jalon dû.
describe('ClinicalRuntimeSection — rejeu d’un épisode persisté (`D-118`)', () => {
  function pretRejoue(): CockpitRuntimeApiResponse {
    const fixture = buildValidationErgoC1Fixture();
    return {
      status: 'ready',
      snapshot: fixture.snapshot,
      review: fixture.review,
      decisionCard: fixture.decisionCard,
      contradictions: [],
      plainteDominante: null,
      perimetreSigne: null,
      canalPlainte: 'Q_MOD_03',
      rejoue: true,
    };
  }

  function trajectoireAvecCycle(joursDepuisAncre: number) {
    const dateAncre = new Date(Date.now() - joursDepuisAncre * 24 * 60 * 60 * 1000).toISOString();
    return {
      ok: true,
      trajectoire: {
        index: [{ milestone: 'T0', date: dateAncre, cycleId: 'cycle-1' }],
        cycles: [{
          cycleId: 'cycle-1', ancre: 'T0', dateAncre, versionScore: 'v15', jalons: [], momentum: null,
          momentumParBesoin: [],
        }],
        comparaison: { disponible: false, raison: 'un_seul_cycle' },
        discordanceOrdreCycles: false,
      },
    };
  }

  /**
   * Routage par URL, jamais par file : le rejeu déclenche la cascade
   * versions/diffusion/check-ins, dont les GET consommeraient une file
   * ordonnée avant la resynchronisation du jalon dû — le banc deviendrait
   * sensible à un ordre d'effets qui ne lui appartient pas.
   */
  function fetchParUrl(reponses: {
    trajectoire: unknown;
    cockpitT0: CockpitRuntimeApiResponse;
    cockpitJ21?: CockpitRuntimeApiResponse;
  }) {
    return vi.fn(async (url: string, _init?: { method?: string; body?: string }) => {
      const cible = String(url);
      if (cible.includes('/api/praticien/trajectoire')) return rep(reponses.trajectoire);
      if (cible.includes('/api/praticien/cockpit')) {
        if (cible.includes('milestone=J21') && reponses.cockpitJ21) return rep(reponses.cockpitJ21);
        return rep(reponses.cockpitT0);
      }
      return rep({}, false, 500);
    });
  }

  it('un rejeu s’affiche confirmé au chargement — sans redemander le geste, sans POST', async () => {
    const fetchMock = fetchParUrl({
      trajectoire: trajectoireAvecCycle(1),
      cockpitT0: pretRejoue(),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);

    expect(await screen.findByText(/Épisode T0 confirmé/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Confirmer l’épisode/ })).toBeNull();
    expect(fetchMock.mock.calls.some(appel =>
      (appel[1] as { method?: string } | undefined)?.method === 'POST')).toBe(false);
  });

  it('« épisode confirmé » dérive de la trajectoire : vrai même quand l’écran montre autre chose', async () => {
    // L'écran sert la PROPOSITION (aucune carte rejouable), mais la trajectoire
    // porte un cycle — donc une ligne d'épisode en base, donc un acte posé.
    // Avant `D-118`, le rail retombait « en attente » ici.
    const onEtatChange = vi.fn();
    const fetchMock = fetchParUrl({
      trajectoire: trajectoireAvecCycle(1),
      cockpitT0: proposalResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ClinicalRuntimeSection
        idPatient="PAT_TEST"
        fixture={null}
        protocolDraft={null}
        onFixtureReviewed={vi.fn()}
        onEtatChange={onEtatChange}
      />,
    );

    await waitFor(() => {
      const dernier = onEtatChange.mock.calls.at(-1)?.[0] as { episodeConfirme: boolean; chargement: boolean };
      expect(dernier?.chargement).toBe(false);
      expect(dernier?.episodeConfirme).toBe(true);
    });
  });

  it('un rejeu ne verrouille pas le jalon dû : le J21 reprend la main sur un T0 rejoué', async () => {
    // T0 confirmé il y a 21 jours : le J21 est dû. Sans la distinction
    // frais/rejoué, la garde Mo4 aurait épinglé l'écran sur la carte T0
    // rejouée et le J21 dû serait resté invisible.
    const propositionJ21: CockpitRuntimeApiResponse = {
      status: 'proposal_required',
      proposal: { ...proposal, assessmentEpisodeId: 'episode-J21', milestone: 'J21' },
      proposalHash: 'hash-J21',
    };
    const fetchMock = fetchParUrl({
      trajectoire: trajectoireAvecCycle(21),
      cockpitT0: pretRejoue(),
      cockpitJ21: propositionJ21,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Confirmer l’épisode J21' })).toBeTruthy();
    expect(urlsCockpit(fetchMock).some(url => url.includes('milestone=J21'))).toBe(true);
  });
});

// D-119 — LE RECOUPEMENT FACTUEL S'AFFICHE PRÈS DE LA CARTE, ET LUI SEUL.
// Une contradiction ouverte qui confronte le canal de plainte (ou un
// instrument fondant un candidat) est nommée à côté de la décision ; sans
// intersection, rien — le détail complet vit déjà en « Données fiables ».
describe('ClinicalRuntimeSection — recoupement contradiction ↔ décision (`D-119`)', () => {
  function pretAvecContradiction(idQuestionnaire: string): CockpitRuntimeApiResponse {
    const fixture = buildValidationErgoC1Fixture();
    return {
      status: 'ready',
      snapshot: fixture.snapshot,
      review: fixture.review,
      decisionCard: fixture.decisionCard,
      contradictions: [{
        id: 'C-STR',
        forme: 'DISCORDANCE',
        description: 'Stress déclaré discordant entre instruments.',
        actionSuggeree: 'Reprendre en entretien.',
        hypotheses: [],
        limitations: [],
        passations: [{ idQuestionnaire, date: '2026-08-19', dateLisible: '19/08/2026' }],
        ecartJours: null,
        claims: [],
        importance: 'useful_not_urgent',
        resolution: { statut: 'ouverte' },
        regleId: 'C-STR',
      }],
      plainteDominante: null,
      perimetreSigne: null,
      canalPlainte: 'Q_MOD_03',
    };
  }

  async function afficherReady(reponse: CockpitRuntimeApiResponse) {
    const fetchMock = fetchParRoute({
      cockpitGet: [rep(proposalResponse)],
      cockpitPost: [rep(reponse)],
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ClinicalRuntimeSection idPatient="PAT_TEST" fixture={null} protocolDraft={null} onFixtureReviewed={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Confirmation de l’épisode T0' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’épisode T0' }));
  }

  it('nomme la contradiction qui confronte le canal de plainte, à côté de la carte', async () => {
    await afficherReady(pretAvecContradiction('Q_MOD_03'));
    const bloc = await screen.findByRole('region', { name: 'Contradictions touchant cette décision' });
    expect(bloc.textContent).toContain('Stress déclaré discordant entre instruments.');
    expect(bloc.textContent).toContain('le canal de plainte');
    // Le bloc montre, il ne tranche pas (`DC-30`).
    expect(bloc.textContent).toContain('La machine ne tranche pas');
  });

  it('sans intersection avec la décision, aucun bloc — pas de bruit près de la carte', async () => {
    await afficherReady(pretAvecContradiction('Q_GAS_01'));
    await screen.findByText(/Épisode T0 confirmé/);
    expect(screen.queryByRole('region', { name: 'Contradictions touchant cette décision' })).toBeNull();
  });
});
