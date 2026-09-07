// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AtelierReglesPanel } from './AtelierReglesPanel';

const fetchMock = vi.fn();

const json = (payload: unknown, ok = true) => ({ ok, json: async () => payload });

const URL_LISTE_PREFIX = '/api/praticien/regles?';
const URL_CREATION = '/api/praticien/regles';
const URL_VOCABULAIRE = '/api/praticien/regles/vocabulaire';
const URL_VALIDATION = '/api/praticien/regles/validation';
const URL_DESACTIVATION = '/api/praticien/regles/desactivation';
const URL_REVISION = '/api/praticien/regles/revision';
const URL_PREVISUALISATION = '/api/praticien/regles/previsualisation';
const URL_SOURCES = '/api/praticien/regles/sources';
const URL_CATEGORIES = '/api/praticien/regles/categories';
const URL_ALERTES = '/api/praticien/regles/alertes';

const CATEGORIE = { id: 'cat_1', code: 'antioxydant', labelFr: 'Antioxydant', description: null };
const ALERTE = {
  id: 'alerte_1',
  code: 'levure_riz_rouge',
  messageFr: 'Monacoline K : interaction avec les statines.',
  niveauAlerte: 'orange',
};

const REGLE = {
  id: 'regle_1',
  statut: 'brouillon',
  versionRegle: 2,
  typeRegle: 'recommande',
  poids: 1,
  intention: { id: 'tag_sommeil', code: 'sommeil_fragmente', labelFr: 'Sommeil fragmenté', categorie: 'sommeil' },
  ingredient: { id: 'ing_mag', code: 'magnesium', nomFr: 'Magnésium' },
  formePreferee: { id: 'forme_bisg', code: 'bisglycinate', labelFr: 'Bisglycinate' },
  doseCibleBasse: 100,
  doseCibleHaute: 300,
  gradePreuve: 'modere',
  justification: 'Justification sourcée du magnésium.',
  conditionSupplementaire: null,
  // Les deux natures séparées ([[D-138]]), servies par l'API ([[D-141]]).
  conditionCritere: { id: 'crit_1', code: 'sous_isrs', labelFr: 'Sous ISRS' },
  conditionBiologie: { type: 'biologie', cible: 'ferritine' },
  source: { id: 'src_1', citation: 'Revue Micronutrition, 2024', lienUrl: null },
  // La base l'exige depuis [[D-140]] : une règle servie porte son claim.
  claim: { claimId: 'WN-CL-2026-001', versionClaim: 'v1.0' },
  creeLe: '2026-07-20T10:00:00.000Z',
  validePar: null,
  valideLe: null,
  lignee: [
    {
      id: 'regle_0',
      versionRegle: 1,
      statut: 'desactivee',
      gradePreuve: 'faible',
      justification: 'Ancienne justification.',
      validePar: 'praticien@wellneuro.fr',
      valideLe: '2026-07-01T00:00:00.000Z',
      creeLe: '2026-06-20T00:00:00.000Z',
    },
  ],
};

const REGLE_VALIDEE = {
  ...REGLE,
  id: 'regle_2',
  statut: 'validee',
  validePar: 'praticien@wellneuro.fr',
  valideLe: '2026-07-22T00:00:00.000Z',
  lignee: [],
};

const LISTE = {
  ok: true,
  statut: 'brouillon',
  total: 1,
  regles: [REGLE],
  compteurs: { brouillons: 1, validees: 1, desactivees: 0 },
};

const VOCABULAIRE = {
  ok: true,
  intentions: [REGLE.intention],
  criteres: [{ id: 'crit_1', code: 'sous_isrs', labelFr: 'Sous ISRS', categorie: null }],
  ingredients: [
    {
      id: 'ing_mag',
      code: 'magnesium',
      nomFr: 'Magnésium',
      formes: [{ id: 'forme_bisg', code: 'bisglycinate', labelFr: 'Bisglycinate' }],
    },
  ],
  ingredientsTotal: 1,
  sources: [{ id: 'src_1', citation: 'Revue Micronutrition, 2024', lienUrl: null }],
};

/** Un ingrédient qui n'est PAS dans la page servie au chargement. */
const INGREDIENT_ZINC = {
  id: 'ing_zinc',
  code: 'zinc',
  nomFr: 'Zinc',
  formes: [{ id: 'forme_zbis', code: 'zinc_bisglycinate', labelFr: 'Zinc bisglycinate' }],
};

const RESOLUTION_PREVIEW = {
  ok: true,
  resolution: {
    contractVersion: 'c4b-resolution-v1',
    intentions: [
      {
        intention: REGLE.intention,
        regles: [
          {
            regleId: 'regle_1',
            versionRegle: 2,
            typeRegle: 'recommande',
            ingredient: REGLE.ingredient,
            formePreferee: REGLE.formePreferee,
            doseCibleBasse: 100,
            doseCibleHaute: 300,
            gradePreuve: 'modere',
            justification: REGLE.justification,
            conditionSupplementaire: null,
            claim: REGLE.claim,
            source: REGLE.source,
            creeLe: REGLE.creeLe,
            validePar: null,
            valideLe: null,
            regleValidee: false,
          },
        ],
      },
    ],
    codesInconnus: [],
    aucunScoreAgrege: true,
  },
  // Le verdict du moteur voyage avec la résolution (`D-133`) : sur un catalogue
  // vide, c'est la sentinelle — « rien n'a été examiné », pas « aucune
  // intention indiquée ».
  verdicts: [
    {
      verdict: 'refus',
      contractVersion: 'c4-decision-avant-biologie-v1',
      cause: 'catalogue_decision_vide',
      ingredient: null,
      regleId: null,
      motif: 'Aucune règle clinique validée n’atteint le moindre ingrédient : le catalogue de '
        + 'décision est vide. Rien n’a été examiné — ce n’est pas un feu vert.',
    },
  ],
};

/**
 * Route les appels sur leurs URLs EXACTES, comme le ferait le serveur : un
 * POST hors des routes de l'atelier ou un GET inconnu échoue — le test
 * vérifie donc l'endpoint, pas seulement la méthode.
 */
function router(
  surcharges: {
    listes?: Record<string, unknown>;
    listeDefaut?: unknown;
    posts?: Record<string, { payload: unknown; ok?: boolean }>;
    /** Réponses du vocabulaire indexées par `requete` (C4-1c). */
    recherches?: Record<string, unknown>;
    /** Réponses du vocabulaire indexées par `ingredientId` (C4-1c). */
    hydratations?: Record<string, unknown>;
    /** Fait échouer toute lecture du vocabulaire portant des paramètres. */
    vocabulaireEnEchec?: boolean;
    /** Remplace la réponse du chargement initial (appel nu). */
    vocabulaire?: unknown;
    /** Référentiels de sécurité ([[D-132]]). */
    categories?: unknown;
    alertes?: unknown;
  } = {},
) {
  return (url: string, options?: { method?: string }) => {
    if (options?.method === 'POST') {
      const surcharge = surcharges.posts?.[url];
      if (surcharge) return Promise.resolve(json(surcharge.payload, surcharge.ok ?? true));
      if (url === URL_VALIDATION) {
        return Promise.resolve(
          json({ ok: true, regle: { ...REGLE, statut: 'validee' }, versionsDesactivees: 1 }),
        );
      }
      if (url === URL_DESACTIVATION) {
        return Promise.resolve(json({ ok: true, regle: { ...REGLE, statut: 'desactivee' } }));
      }
      if (url === URL_REVISION) {
        return Promise.resolve(json({ ok: true, regle: { ...REGLE, id: 'regle_3', versionRegle: 3 } }));
      }
      if (url === URL_CREATION) {
        return Promise.resolve(json({ ok: true, regle: { ...REGLE, id: 'regle_4', versionRegle: 1 } }));
      }
      if (url === URL_PREVISUALISATION) return Promise.resolve(json(RESOLUTION_PREVIEW));
      if (url === URL_VOCABULAIRE) {
        return Promise.resolve(
          json({ ok: true, type: 'intention', entree: VOCABULAIRE.intentions[0] }),
        );
      }
      if (url === URL_CATEGORIES) {
        return Promise.resolve(json({ ok: true, categorie: CATEGORIE }, true));
      }
      if (url === URL_ALERTES) {
        return Promise.resolve(json({ ok: true, alerte: ALERTE }, true));
      }
      if (url === URL_SOURCES) {
        return Promise.resolve(
          json({ ok: true, source: { id: 'src_2', citation: 'ANSES, avis du 2024-03-12.', lienUrl: null } }, true),
        );
      }
      return Promise.resolve(json({}, false));
    }
    if (url === URL_CATEGORIES) {
      return Promise.resolve(json(surcharges.categories ?? { ok: true, categories: [CATEGORIE] }));
    }
    if (url === URL_ALERTES) {
      return Promise.resolve(json(surcharges.alertes ?? { ok: true, alertes: [ALERTE] }));
    }
    if (url.startsWith(URL_VOCABULAIRE)) {
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const ingredientId = params.get('ingredientId');
      const requete = params.get('requete');
      // Le chargement initial du panneau est l'appel NU : ni recherche ni
      // hydratation. Lui doit toujours répondre, même quand le test fait
      // échouer les lectures paramétrées.
      const parametre = ingredientId !== null || requete !== null;
      if (parametre && surcharges.vocabulaireEnEchec) return Promise.resolve(json({}, false));
      if (ingredientId !== null) {
        const hydrate = surcharges.hydratations?.[ingredientId];
        return Promise.resolve(
          json(hydrate ?? { ...VOCABULAIRE, ingredients: [], ingredientsTotal: 0 }),
        );
      }
      if (requete) {
        const trouve = surcharges.recherches?.[requete];
        return Promise.resolve(
          json(trouve ?? { ...VOCABULAIRE, ingredients: [], ingredientsTotal: 0 }),
        );
      }
      return Promise.resolve(json(surcharges.vocabulaire ?? VOCABULAIRE));
    }
    if (url.startsWith(URL_LISTE_PREFIX)) {
      const statut = new URLSearchParams(url.split('?')[1]).get('statut') ?? '';
      const parStatut = surcharges.listes?.[statut];
      return Promise.resolve(json(parStatut ?? surcharges.listeDefaut ?? LISTE));
    }
    return Promise.resolve(json({}, false));
  };
}

const appelsPost = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
const appelsListe = () =>
  fetchMock.mock.calls.filter(
    ([url, options]) => options?.method !== 'POST' && String(url).startsWith(URL_LISTE_PREFIX),
  );

async function attendreLaListe() {
  render(<AtelierReglesPanel />);
  await waitFor(() => expect(screen.getByText(/Justification sourcée du magnésium/)).toBeTruthy());
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AtelierReglesPanel (Atelier de règles cliniques v1)', () => {
  it('charge les brouillons (statut, limit, offset dans l’URL) et affiche règle, lignée et compteurs', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();

    const [urlInitiale] = appelsListe()[0];
    expect(urlInitiale).toBe('/api/praticien/regles?statut=brouillon&limit=20&offset=0');

    // La règle : ingrédient, version, type, verbatim de justification, source.
    expect(screen.getByText(/Magnésium — Bisglycinate/)).toBeTruthy();
    expect(screen.getAllByText('v2').length).toBeGreaterThan(0);
    expect(screen.getByText('recommande')).toBeTruthy();
    expect(screen.getByText('Source : Revue Micronutrition, 2024')).toBeTruthy();

    // Le grade est étiqueté « preuve scientifique » (échelle GRADE) — jamais
    // un A/B/C/D nu qui prêterait à confusion avec le moteur d'équilibre.
    expect(screen.getByText('preuve scientifique — Modéré')).toBeTruthy();

    // Statut honnête : un brouillon n'est PAS servi par la résolution.
    expect(screen.getByText('Brouillon — non servie par la résolution')).toBeTruthy();

    // La lignée est visible, version supersédée et signataire compris.
    expect(screen.getByText(/Lignée — 1 autre version/)).toBeTruthy();
    expect(screen.getByText(/Ancienne justification/)).toBeTruthy();

    // Tuiles de compteurs (les libellés existent AUSSI en onglets — d'où le All).
    expect(screen.getAllByText('Brouillons').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Validées').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Désactivées').length).toBeGreaterThan(1);
  });

  it('valide en deux temps : armer, puis signer sur la route validation — et recharge la liste', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();
    const listesAvant = appelsListe().length;

    // 1er clic : arme la confirmation, RIEN n'est envoyé.
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(appelsPost()).toHaveLength(0);
    expect(screen.getByText(/Signer la validation de cette règle/)).toBeTruthy();

    // 2e clic : signe, avec le statut vu à l'écran (anti-écrasement).
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la validation' }));
    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_VALIDATION);
      expect(JSON.parse(posts[0][1].body)).toEqual({
        regleId: 'regle_1',
        statutAttendu: 'brouillon',
      });
    });
    await waitFor(() => expect(appelsListe().length).toBeGreaterThan(listesAvant));
  });

  it('l’annulation de l’armement ne signe rien', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: 'Valider' })).toBeTruthy();
    expect(appelsPost()).toHaveLength(0);
  });

  it('désactive en deux temps : raison OBLIGATOIRE avant confirmation, transmise à la route', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    expect(appelsPost()).toHaveLength(0);
    const champRaison = screen.getByLabelText(/Raison de la désactivation/);

    // La confirmation reste bloquée tant que la raison est vide.
    expect(
      (screen.getByRole('button', { name: 'Confirmer la désactivation' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(champRaison, { target: { value: 'Doublon d’une lignée existante.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la désactivation' }));

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_DESACTIVATION);
      expect(JSON.parse(posts[0][1].body)).toEqual({
        regleId: 'regle_1',
        statutAttendu: 'brouillon',
        raison: 'Doublon d’une lignée existante.',
      });
    });
  });

  it('change d’onglet : recharge avec le statut demandé, offset remis à zéro', async () => {
    fetchMock.mockImplementation(
      router({
        listes: {
          validee: { ...LISTE, statut: 'validee', regles: [REGLE_VALIDEE] },
        },
      }),
    );
    await attendreLaListe();

    fireEvent.click(screen.getByRole('tab', { name: 'Validées' }));
    await waitFor(() => {
      const urls = appelsListe().map(([url]) => url);
      expect(urls).toContain('/api/praticien/regles?statut=validee&limit=20&offset=0');
    });
    expect(await screen.findByText(/validée par praticien@wellneuro.fr/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réviser' })).toBeTruthy();
  });

  it('réviser n’édite JAMAIS en place : le formulaire soumet une nouvelle version sur la route revision', async () => {
    fetchMock.mockImplementation(
      router({
        listes: {
          validee: { ...LISTE, statut: 'validee', regles: [REGLE_VALIDEE] },
        },
      }),
    );
    await attendreLaListe();
    fireEvent.click(screen.getByRole('tab', { name: 'Validées' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Réviser' }));

    // Le formulaire annonce la mécanique append-only.
    expect(screen.getByText(/une nouvelle version \(v3\) naîtra en brouillon/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Justification de la révision'), {
      target: { value: 'Justification mise à jour, méta-analyse 2026.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la révision (brouillon)' }));

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_REVISION);
      expect(JSON.parse(posts[0][1].body)).toEqual({
        regleId: 'regle_2',
        gradePreuveScientifique: 'modere',
        justification: 'Justification mise à jour, méta-analyse 2026.',
        sourceReferenceId: 'src_1',
        // [[D-140]] — le claim de la version en place est REPRIS sans ressaisie :
        // une révision est une réécriture complète, et repartir vide ferait
        // retaper à la main ce que la règle porte déjà.
        claimId: 'WN-CL-2026-001',
        versionClaim: 'v1.0',
        // [[D-141]] — LES CONDITIONS AUSSI, et c'est le correctif qui compte :
        // le formulaire n'en envoyait AUCUNE. Réviser une règle conditionnée à
        // un critère la rendait inconditionnelle, en silence.
        conditionCritereId: 'crit_1',
        conditionBiologie: { type: 'biologie', cible: 'ferritine' },
        formePrefereeId: 'forme_bisg',
        doseCibleBasse: 100,
        doseCibleHaute: 300,
      });
    });
    // Aucun PUT/PATCH nulle part : la révision est un POST de création.
    expect(fetchMock.mock.calls.every(([, options]) => !['PUT', 'PATCH'].includes(options?.method ?? ''))).toBe(true);
  });

  it('crée un brouillon depuis le formulaire : lignée neuve, champs requis, POST sur la route de création', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();

    const bouton = screen.getByRole('button', { name: 'Créer le brouillon' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true); // rien de rempli : pas de création possible

    fireEvent.change(screen.getByLabelText('Intention clinique'), { target: { value: 'tag_sommeil' } });
    fireEvent.click(screen.getByRole('button', { name: /^Magnésium/ }));
    fireEvent.change(screen.getByLabelText('Grade de preuve scientifique (échelle GRADE)'), {
      target: { value: 'fort' },
    });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'src_1' } });
    fireEvent.change(screen.getByLabelText('Justification'), {
      target: { value: 'Nouvelle règle sourcée.' },
    });
    // [[D-140]] — le claim fondateur est un champ REQUIS : tant qu'il manque,
    // le bouton reste fermé. La route refuserait de toute façon, mais un
    // formulaire qui laisse envoyer ce qui sera rejeté fait perdre la saisie.
    expect(bouton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Identifiant du claim fondateur'), {
      target: { value: 'WN-CL-2026-001' },
    });
    expect(bouton.disabled).toBe(true); // l'identifiant seul ne désigne rien
    fireEvent.change(screen.getByLabelText('Version du claim fondateur'), {
      target: { value: 'v1.0' },
    });
    expect(bouton.disabled).toBe(false);
    fireEvent.click(bouton);

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_CREATION);
      expect(JSON.parse(posts[0][1].body)).toEqual({
        intentTagId: 'tag_sommeil',
        ingredientId: 'ing_mag',
        typeRegle: 'recommande',
        gradePreuveScientifique: 'fort',
        justification: 'Nouvelle règle sourcée.',
        sourceReferenceId: 'src_1',
        claimId: 'WN-CL-2026-001',
        versionClaim: 'v1.0',
        poids: 1,
      });
      // L'ancien champ à deux natures n'est plus envoyé du tout ([[D-141]]).
      expect(JSON.parse(posts[0][1].body)).not.toHaveProperty('conditionSupplementaire');
    });
    expect(await screen.findByText(/Brouillon créé/)).toBeTruthy();
  });

  // ─── C4-1c : le sélecteur d'ingrédients face à un référentiel de milliers ──

  it('le choix d’ingrédient SURVIT à un changement de recherche qui l’exclut', async () => {
    // Le piège : déduire l'ingrédient choisi de la liste de résultats. La liste
    // change à chaque frappe ; le choix s'évaporerait dès qu'elle cesse de le
    // contenir, emportant en silence la forme préférée déjà sélectionnée.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchMock.mockImplementation(
        router({ recherches: { zinc: { ...VOCABULAIRE, ingredients: [INGREDIENT_ZINC], ingredientsTotal: 1 } } }),
      );
      await attendreLaListe();

      fireEvent.click(screen.getByRole('button', { name: /^Magnésium/ }));
      fireEvent.change(screen.getByLabelText('Forme préférée (optionnelle)'), {
        target: { value: 'forme_bisg' },
      });

      // Changer d'avis : rouvrir la recherche et taper autre chose.
      fireEvent.click(screen.getByRole('button', { name: 'Changer' }));
      fireEvent.change(screen.getByLabelText('Rechercher un ingrédient'), {
        target: { value: 'zinc' },
      });
      await vi.advanceTimersByTimeAsync(400);
      await waitFor(() => expect(screen.getByRole('button', { name: /^Zinc/ })).toBeTruthy());

      // Choisir le nouvel ingrédient : la forme préférée de l'ANCIEN ne doit
      // pas suivre — une forme appartient à un ingrédient et à un seul.
      fireEvent.click(screen.getByRole('button', { name: /^Zinc/ }));
      expect(screen.getByText('Ingrédient : Zinc')).toBeTruthy();
      const formes = screen.getByLabelText('Forme préférée (optionnelle)') as HTMLSelectElement;
      expect(formes.value).toBe('');
      expect(screen.getByRole('option', { name: 'Zinc bisglycinate' })).toBeTruthy();

      fireEvent.change(screen.getByLabelText('Intention clinique'), { target: { value: 'tag_sommeil' } });
      fireEvent.change(screen.getByLabelText('Grade de preuve scientifique (échelle GRADE)'), {
        target: { value: 'fort' },
      });
      fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'src_1' } });
      fireEvent.change(screen.getByLabelText('Justification'), {
        target: { value: 'Règle sourcée sur le zinc.' },
      });
      fireEvent.change(screen.getByLabelText('Identifiant du claim fondateur'), {
        target: { value: 'WN-CL-2026-001' },
      });
      fireEvent.change(screen.getByLabelText('Version du claim fondateur'), {
        target: { value: 'v1.0' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

      await waitFor(() => {
        const posts = appelsPost();
        expect(posts).toHaveLength(1);
        // C'est bien le zinc qui part, et sans forme préférée héritée.
        expect(JSON.parse(posts[0][1].body).ingredientId).toBe('ing_zinc');
        expect(JSON.parse(posts[0][1].body)).not.toHaveProperty('formePrefereeId');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('annonce la troncature au lieu de la taire', async () => {
    // 50 résultats sur 1 240, sans le dire, se lisent « il n'y en a que 50 ».
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchMock.mockImplementation(
        router({ recherches: { mag: { ...VOCABULAIRE, ingredients: [INGREDIENT_ZINC], ingredientsTotal: 1240 } } }),
      );
      await attendreLaListe();

      fireEvent.change(screen.getByLabelText('Rechercher un ingrédient'), { target: { value: 'mag' } });
      await vi.advanceTimersByTimeAsync(400);

      expect(
        await screen.findByText(/1240 ingrédients correspondent — les 1 premiers sont proposés/),
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tient la charge MAXIMALE que le serveur peut désormais émettre', async () => {
    // Le référentiel Compl'Alim compte ~2 000 ingrédients ; la borne serveur
    // (INGREDIENTS_MAX) fait que l'écran n'en voit jamais plus de 50, formes
    // comprises. C'est ce plafond-là qu'on éprouve — pas les 2 000, qui ne
    // peuvent plus l'atteindre.
    const CHARGE = Array.from({ length: 50 }, (_, i) => ({
      id: `ing_${i}`,
      code: `ingredient_${i}`,
      nomFr: `Ingrédient ${i}`,
      formes: Array.from({ length: 10 }, (_, j) => ({
        id: `forme_${i}_${j}`,
        code: `forme_${i}_${j}`,
        labelFr: `Forme ${i}-${j}`,
      })),
    }));
    fetchMock.mockImplementation(
      router({ vocabulaire: { ...VOCABULAIRE, ingredients: CHARGE, ingredientsTotal: 1965 } }),
    );
    await attendreLaListe();

    // La troncature est annoncée : 1 965 correspondent, 50 sont proposés.
    expect(screen.getByText(/1965 ingrédients correspondent — les 50 premiers sont proposés/)).toBeTruthy();

    // Et le choix reste faisable : les formes suivent l'ingrédient retenu.
    fireEvent.click(screen.getByRole('button', { name: /^Ingrédient 37 / }));
    expect(screen.getByText('Ingrédient : Ingrédient 37')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Forme 37-4' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Forme 12-4' })).toBeNull();
  });

  it('une réponse de recherche en retard n’écrase pas la frappe qui l’a suivie', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const base = router({
        recherches: {
          mag: { ...VOCABULAIRE, ingredients: [VOCABULAIRE.ingredients[0]], ingredientsTotal: 1 },
          zinc: { ...VOCABULAIRE, ingredients: [INGREDIENT_ZINC], ingredientsTotal: 1 },
        },
      });
      // « mag » répond APRÈS « zinc » : sans garde d'obsolescence, la liste
      // finirait sur le magnésium alors que le champ porte « zinc ».
      const differe: { relacher: (() => void) | null } = { relacher: null };
      fetchMock.mockImplementation((url: string, options?: { method?: string }) => {
        const reponse = base(url, options);
        if (String(url).includes('requete=mag')) {
          return new Promise((resolve) => {
            differe.relacher = () => resolve(reponse);
          });
        }
        return reponse;
      });
      await attendreLaListe();

      const champ = screen.getByLabelText('Rechercher un ingrédient');
      fireEvent.change(champ, { target: { value: 'mag' } });
      await vi.advanceTimersByTimeAsync(400);
      fireEvent.change(champ, { target: { value: 'zinc' } });
      await vi.advanceTimersByTimeAsync(400);
      await waitFor(() => expect(screen.getByRole('button', { name: /^Zinc/ })).toBeTruthy());

      differe.relacher?.();
      await vi.advanceTimersByTimeAsync(50);

      expect(screen.getByRole('button', { name: /^Zinc/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Magnésium/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('la révision affiche la forme préférée COURANTE avant l’arrivée des formes, et la soumet', async () => {
    // Le piège : la révision lisait les formes dans le vocabulaire complet.
    // Bornée, la liste ne contient plus l'ingrédient de la règle ; sans option
    // de repli, le `<select>` afficherait autre chose que ce qui est soumis.
    fetchMock.mockImplementation(
      router({
        vocabulaireEnEchec: true,
        listes: { validee: { ...LISTE, statut: 'validee', regles: [REGLE_VALIDEE] } },
      }),
    );
    await attendreLaListe();
    fireEvent.click(screen.getByRole('tab', { name: 'Validées' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Réviser' }));

    const formes = (await screen.findByLabelText(
      'Forme préférée de la révision',
    )) as HTMLSelectElement;
    // La valeur affichée EST la forme préférée en base, dès le premier rendu.
    expect(formes.value).toBe('forme_bisg');
    expect(screen.getByRole('option', { name: 'Bisglycinate' })).toBeTruthy();
    // L'échec est dit, et la forme actuelle explicitement conservée.
    expect(
      await screen.findByText(/n’ont pas pu être lues ; la forme actuelle est conservée/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Créer la révision (brouillon)' }));
    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_REVISION);
      expect(JSON.parse(posts[0][1].body).formePrefereeId).toBe('forme_bisg');
    });
  });

  it('la forme courante reste une option même quand l’hydratation RÉUSSIT sans elle', async () => {
    // Le cas le plus traître, et celui qu'un repli sur `formes === null` rate :
    // l'hydratation aboutit, mais l'ingrédient a été désactivé (la route ne sert
    // que l'actif) — la liste revient VIDE sans être `null`. Le `<select>`
    // retomberait sur « Sans forme préférée » tout en soumettant la forme, que
    // la route de révision accepte : affiché ≠ soumis, au référentiel.
    fetchMock.mockImplementation(
      router({
        hydratations: { ing_mag: { ...VOCABULAIRE, ingredients: [], ingredientsTotal: 0 } },
        listes: { validee: { ...LISTE, statut: 'validee', regles: [REGLE_VALIDEE] } },
      }),
    );
    await attendreLaListe();
    fireEvent.click(screen.getByRole('tab', { name: 'Validées' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Réviser' }));

    const formes = (await screen.findByLabelText(
      'Forme préférée de la révision',
    )) as HTMLSelectElement;
    await waitFor(() => expect(formes.disabled).toBe(false));
    expect(formes.value).toBe('forme_bisg');
    expect(screen.getByRole('option', { name: 'Bisglycinate' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Créer la révision (brouillon)' }));
    await waitFor(() =>
      expect(JSON.parse(appelsPost()[0][1].body).formePrefereeId).toBe('forme_bisg'),
    );
  });

  it('la forme préférée reste RETIRABLE quand l’hydratation échoue', async () => {
    // Un champ bloqué faute d'avoir pu lire la liste enferme le praticien dans
    // un choix qu'il voulait défaire.
    fetchMock.mockImplementation(
      router({
        vocabulaireEnEchec: true,
        listes: { validee: { ...LISTE, statut: 'validee', regles: [REGLE_VALIDEE] } },
      }),
    );
    await attendreLaListe();
    fireEvent.click(screen.getByRole('tab', { name: 'Validées' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Réviser' }));

    const formes = (await screen.findByLabelText(
      'Forme préférée de la révision',
    )) as HTMLSelectElement;
    await waitFor(() => expect(formes.disabled).toBe(false));
    fireEvent.change(formes, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la révision (brouillon)' }));

    await waitFor(() => {
      const corps = JSON.parse(appelsPost()[0][1].body);
      expect(corps).not.toHaveProperty('formePrefereeId');
    });
  });

  it('ne relance pas une recherche au montage, et gèle les résultats pendant un envoi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchMock.mockImplementation(router());
      await attendreLaListe();
      await vi.advanceTimersByTimeAsync(600);

      // Le chargement initial du panneau a déjà rapporté la première page :
      // aucune lecture PARAMÉTRÉE ne doit partir tant que rien n'est tapé.
      const parametrees = fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith(`${URL_VOCABULAIRE}?`),
      );
      expect(parametrees).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('la révision hydrate les formes de SON ingrédient, absent de la page servie', async () => {
    fetchMock.mockImplementation(
      router({
        hydratations: {
          ing_mag: {
            ...VOCABULAIRE,
            ingredients: [
              {
                ...VOCABULAIRE.ingredients[0],
                formes: [
                  { id: 'forme_bisg', code: 'bisglycinate', labelFr: 'Bisglycinate' },
                  { id: 'forme_citrate', code: 'citrate', labelFr: 'Citrate' },
                ],
              },
            ],
            ingredientsTotal: 1,
          },
        },
        listes: { validee: { ...LISTE, statut: 'validee', regles: [REGLE_VALIDEE] } },
      }),
    );
    await attendreLaListe();
    fireEvent.click(screen.getByRole('tab', { name: 'Validées' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Réviser' }));

    // L'appel cible l'ingrédient de la règle, pas une recherche.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === `${URL_VOCABULAIRE}?ingredientId=ing_mag`,
        ),
      ).toBe(true),
    );
    expect(await screen.findByRole('option', { name: 'Citrate' })).toBeTruthy();
  });

  it('teste une intention : la prévisualisation marque les brouillons comme non servis', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();

    fireEvent.change(screen.getByLabelText('Codes d’intention à tester'), {
      target: { value: ' sommeil_fragmente , stress_chronique ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tester la résolution' }));

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_PREVISUALISATION);
      // Codes nettoyés (espaces, vides) avant l'envoi.
      expect(JSON.parse(posts[0][1].body)).toEqual({
        codes: ['sommeil_fragmente', 'stress_chronique'],
      });
    });
    // Le brouillon apparaît, MARQUÉ — jamais présenté comme une règle servie.
    expect(await screen.findByText('brouillon — non servie')).toBeTruthy();
  });

  it('ajoute une intention au vocabulaire gouverné', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();

    fireEvent.change(screen.getByLabelText('Code de l’entrée'), {
      target: { value: 'stress_chronique' },
    });
    fireEvent.change(screen.getByLabelText('Libellé français de l’entrée'), {
      target: { value: 'Stress chronique' },
    });
    fireEvent.change(screen.getByLabelText('Catégorie de l’entrée'), {
      target: { value: 'stress' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au vocabulaire' }));

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_VOCABULAIRE);
      expect(JSON.parse(posts[0][1].body)).toEqual({
        type: 'intention',
        code: 'stress_chronique',
        labelFr: 'Stress chronique',
        categorie: 'stress',
      });
    });
  });

  // ── RÉFÉRENCES SOURCES (`D-131`) ──────────────────────────────────────────
  //
  // Le formulaire de règle EXIGE une source et la propose en liste ; rien ne
  // pouvait l'alimenter. Ces cas prouvent le geste qui manquait — et le
  // rechargement, sans lequel la source serait créée puis introuvable.
  it('ajoute une référence source et RECHARGE le vocabulaire qui la sert', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();
    const lecturesVocabulaire = () => fetchMock.mock.calls.filter(
      (appel) => appel[0] === URL_VOCABULAIRE
        && (appel[1] as { method?: string } | undefined)?.method !== 'POST',
    ).length;
    const lecturesAvant = lecturesVocabulaire();

    fireEvent.change(screen.getByLabelText('Citation de la source'), {
      target: { value: '  ANSES, avis du 2024-03-12.  ' },
    });
    fireEvent.change(screen.getByLabelText('Lien de la source'), {
      target: { value: 'https://www.anses.fr/avis' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la source' }));

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_SOURCES);
      // Détourée à l'écran comme au serveur : deux blancs de copier-coller ne
      // doivent pas produire deux sources.
      expect(JSON.parse(posts[0][1].body)).toEqual({
        citation: 'ANSES, avis du 2024-03-12.',
        lienUrl: 'https://www.anses.fr/avis',
      });
    });
    // La liste déroulante des sources est relue : sans cela, la source
    // existerait en base et resterait absente du formulaire de règle.
    await waitFor(() => {
      expect(lecturesVocabulaire()).toBeGreaterThan(lecturesAvant);
    });
  });

  it('n’envoie pas de lien vide, et ferme le bouton tant que la citation manque', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();
    const bouton = screen.getByRole('button', { name: 'Ajouter la source' });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Citation de la source'), { target: { value: '   ' } });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Citation de la source'), {
      target: { value: 'ANSES, avis du 2024-03-12.' },
    });
    fireEvent.click(bouton);
    await waitFor(() => {
      // La clé `lienUrl` est ABSENTE, pas vide : la route distingue « pas de
      // lien » d'un lien illisible, et une chaîne vide serait le second.
      expect(JSON.parse(appelsPost()[0][1].body)).toEqual({
        citation: 'ANSES, avis du 2024-03-12.',
      });
    });
  });

  it('rend le refus du serveur tel quel — la source déjà présente', async () => {
    fetchMock.mockImplementation(
      router({
        posts: {
          [URL_SOURCES]: {
            ok: false,
            payload: {
              ok: false,
              reason: 'citation_deja_presente',
              error: 'Cette source figure déjà au référentiel — citez celle qui existe plutôt que d’en créer une seconde.',
            },
          },
        },
      }),
    );
    await attendreLaListe();
    fireEvent.change(screen.getByLabelText('Citation de la source'), {
      target: { value: 'Revue Micronutrition, 2024' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la source' }));

    await waitFor(() => {
      expect(screen.getByText(/figure déjà au référentiel/)).toBeTruthy();
    });
  });

  // ── SÉCURITÉ ET CATÉGORIES (`D-132`) ──────────────────────────────────────
  //
  // La LISTE compte autant que le formulaire : le code est unique en base, et
  // sans relecture une ressaisie rendrait 409 devant un écran muet. Pour les
  // alertes, c'est davantage — le catalogue publié est ce que le moteur exige
  // avant de proposer quoi que ce soit.
  it('montre les référentiels de sécurité déjà enregistrés', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();
    await waitFor(() => {
      expect(screen.getByText('Antioxydant')).toBeTruthy();
      expect(screen.getByText(/Monacoline K/)).toBeTruthy();
    });
  });

  it('ajoute une catégorie fonctionnelle et relit le référentiel', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();
    const lecturesAvant = fetchMock.mock.calls.filter((appel) => appel[0] === URL_CATEGORIES).length;

    fireEvent.change(screen.getByLabelText('Code de la catégorie fonctionnelle'), {
      target: { value: 'chelateur' },
    });
    fireEvent.change(screen.getByLabelText('Libellé de la catégorie fonctionnelle'), {
      target: { value: 'Chélateur' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la catégorie' }));

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe(URL_CATEGORIES);
      expect(JSON.parse(posts[0][1].body)).toEqual({ code: 'chelateur', labelFr: 'Chélateur' });
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter((appel) => appel[0] === URL_CATEGORIES).length)
        .toBeGreaterThan(lecturesAvant);
    });
  });

  it('ajoute une alerte — le niveau reste un champ LIBRE, sans échelle imposée', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();

    fireEvent.change(screen.getByLabelText('Code de l’alerte de sécurité'), {
      target: { value: 'millepertuis' },
    });
    fireEvent.change(screen.getByLabelText('Message de l’alerte'), {
      target: { value: 'Inducteur enzymatique : interactions multiples.' },
    });
    // Une valeur hors du seul mot qu'on croise dans le code : l'écran ne
    // prétend pas connaître l'échelle, il ne l'invente donc pas.
    fireEvent.change(screen.getByLabelText('Niveau de l’alerte'), {
      target: { value: 'vigilance renforcée' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’alerte' }));

    await waitFor(() => {
      const posts = appelsPost();
      expect(posts[0][0]).toBe(URL_ALERTES);
      expect(JSON.parse(posts[0][1].body)).toEqual({
        code: 'millepertuis',
        messageFr: 'Inducteur enzymatique : interactions multiples.',
        niveauAlerte: 'vigilance renforcée',
      });
    });
  });

  it('rend le refus du serveur sur une alerte, tel quel', async () => {
    fetchMock.mockImplementation(
      router({
        posts: {
          [URL_ALERTES]: {
            ok: false,
            payload: { ok: false, reason: 'code_deja_pris', error: 'Ce code d’alerte existe déjà.' },
          },
        },
      }),
    );
    await attendreLaListe();
    fireEvent.change(screen.getByLabelText('Code de l’alerte de sécurité'), {
      target: { value: 'levure_riz_rouge' },
    });
    fireEvent.change(screen.getByLabelText('Message de l’alerte'), { target: { value: 'Doublon.' } });
    fireEvent.change(screen.getByLabelText('Niveau de l’alerte'), { target: { value: 'orange' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’alerte' }));

    await waitFor(() => {
      expect(screen.getByText('Ce code d’alerte existe déjà.')).toBeTruthy();
    });
  });

  it('affiche l’erreur renvoyée par le serveur sur une action', async () => {
    fetchMock.mockImplementation(
      router({
        posts: {
          [URL_VALIDATION]: {
            payload: {
              ok: false,
              reason: 'version_depassee',
              error:
                'Une version au moins aussi récente de cette lignée est déjà validée — repartez d’une révision.',
            },
            ok: false,
          },
        },
      }),
    );
    await attendreLaListe();

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la validation' }));
    await waitFor(() =>
      expect(screen.getByText(/Une version au moins aussi récente de cette lignée/)).toBeTruthy(),
    );
  });

  it('montre l’état vide sans le confondre avec une erreur, et propose de réessayer sur un échec de lecture', async () => {
    fetchMock.mockImplementation(router({ listeDefaut: { ...LISTE, total: 0, regles: [] } }));
    render(<AtelierReglesPanel />);
    await waitFor(() => expect(screen.getByText(/Aucun brouillon en attente/)).toBeTruthy());
    cleanup();

    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ ok: false, reason: 'exception', error: 'Erreur technique.' }, false)),
    );
    render(<AtelierReglesPanel />);
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  // LE VERDICT DU MOTEUR EST MONTRÉ, pas seulement transporté (`D-133`).
  // L'atelier affichait les règles résolues sans dire qu'aucune n'irait plus
  // loin ; c'est ce silence que le bloc referme.
  it('montre ce que le moteur déciderait, sentinelle comprise', async () => {
    fetchMock.mockImplementation(router());
    await attendreLaListe();
    fireEvent.change(screen.getByLabelText('Codes d’intention à tester'), {
      target: { value: 'sommeil_fragmente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tester la résolution' }));

    await waitFor(() => {
      expect(screen.getByText('Décision avant biologie')).toBeTruthy();
      expect(screen.getByText(/n’est pas un feu vert/)).toBeTruthy();
    });
  });

});
