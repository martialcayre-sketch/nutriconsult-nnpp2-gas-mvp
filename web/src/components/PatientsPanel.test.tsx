// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientsPanel } from './PatientsPanel';

// Deux choses se jouent dans ce panneau.
//
// La première est la surface d'émission du lien magique (gate G4) : quatre
// actions portent l'accès patient, dont trois concernent le jeton PERMANENT.
// La quatrième est d'une autre nature — 24 h, une seule ouverture — et
// n'existe que drapeau allumé.
//
// La seconde est le cycle de vie du dossier (IDP2, LOT-01b) : clôture de suivi
// et effacement réel. Ces actions ont quitté la carte du haut pour le menu
// « Gérer le dossier » de chaque ligne — d'où le passage par `ouvrirMenu()`.
//
// Seuls les patients fictifs du dépôt peuvent apparaître ici.

const PATIENT = {
  idPatient: 'PAT_SEED_03',
  prenom: 'Michel',
  nom: 'Dogné',
  email: 'michel.dogne@fictif.wellneuro.fr',
  telephone: '',
  actif: 'OUI',
  suiviClotureLe: null as string | null,
  accesRevoque: false,
};

const AUTRE_PATIENT = {
  idPatient: 'PAT_SEED_01',
  prenom: 'Sophie',
  nom: 'Nicola',
  email: 'sophie.nicola@fictif.wellneuro.fr',
  telephone: '',
  actif: 'OUI',
  suiviClotureLe: null as string | null,
  accesRevoque: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Le panneau charge plusieurs catalogues au montage ; on les rend vides.
 * `patient` permet de faire varier l'état du dossier affiché dans le tableau.
 */
function stubFetch(options?: {
  surToken?: (body: unknown) => unknown;
  surCycleDeVie?: (body: unknown) => unknown;
  surAnnulation?: (body: unknown) => unknown;
  patient?: typeof PATIENT;
  patients?: (typeof PATIENT)[];
  /** Assignations exposées par le tableau « Assignations récentes » (Fil A). */
  assignations?: Record<string, unknown>[];
  /** Compte serveur du même ensemble : c'est lui qui révèle une troncature. */
  assignationsMeta?: { total: number; plafond: number; statut: string | null };
  /** Diffère la réponse du cycle de vie, pour éprouver la double soumission. */
  delaiCycleDeVie?: number;
  /**
   * Prend la main sur `GET /api/praticien/patients` : reçoit l'URL appelée et
   * rend la charge, ou lève pour simuler une panne réseau. Nécessaire dès que
   * la réponse doit DÉPENDRE de la requête — course entre deux statuts, échec.
   */
  surConsultations?: (body: unknown) => unknown;
  surPatients?: (url: string) => unknown;
}) {
  const appels: { url: string; method?: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      appels.push({ url: String(url), method: init?.method, body });
      if (String(url).startsWith('/api/praticien/patients/cycle-de-vie')) {
        if (options?.delaiCycleDeVie) {
          await new Promise(resolve => setTimeout(resolve, options.delaiCycleDeVie));
        }
        return {
          ok: true,
          json: async () => options?.surCycleDeVie?.(body) ?? { success: true, action: 'cloture' },
        } as unknown as Response;
      }
      if (String(url).startsWith('/api/praticien/token')) {
        return {
          ok: true,
          json: async () => options?.surToken?.(body) ?? { success: true },
        } as unknown as Response;
      }
      // Sans cette branche, le POST consultation retombait sur le fourre-tout
      // du bas, qui rend `success: true` et RIEN d'autre. Le défaut ci-dessous
      // ne pose délibérément PAS `envoi` : c'est ce qui fait du banc existant
      // « la création de consultation refermée sur succès… » la garde du
      // défaut « champ absent ⇒ envoyé » de l'écran.
      if (String(url).startsWith('/api/praticien/consultations')) {
        return {
          ok: true,
          json: async () => options?.surConsultations?.(body) ?? { success: true, idConsultation: 'CONS_TEST' },
        } as unknown as Response;
      }
      if (String(url).startsWith('/api/praticien/assignations/annulation')) {
        return {
          ok: true,
          json: async () => options?.surAnnulation?.(body) ?? { ok: true },
        } as unknown as Response;
      }
      if (options?.surPatients && String(url).startsWith('/api/praticien/patients')) {
        const charge = await options.surPatients(String(url));
        return { ok: true, json: async () => charge } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          patients: options?.patients ?? [options?.patient ?? PATIENT],
          assignations: options?.assignations ?? [],
          ...(options?.assignationsMeta ? { assignationsMeta: options.assignationsMeta } : {}),
          questionnaires: [],
          packs: [],
          categories: [],
          success: true,
        }),
      } as unknown as Response;
    }),
  );
  return appels;
}

/**
 * Les actions sur un dossier vivent dans le menu de SA ligne. `rang` désigne
 * la ligne : c'est ce qui permet de vérifier qu'une confirmation porte bien
 * sur le patient dont on a ouvert le menu, et pas sur le premier du tableau.
 */
async function ouvrirMenu(rang = 0) {
  const declencheurs = await screen.findAllByRole('button', { name: /gérer le dossier/i });
  fireEvent.click(declencheurs[rang]);
  return declencheurs[rang];
}

const item = (motif: RegExp) => screen.getByRole('menuitem', { name: motif });

describe('PatientsPanel — émission d’un lien à usage unique (G4)', () => {
  beforeEach(() => vi.clearAllMocks());

  // Le drapeau éteint doit rendre l'action inatteignable, pas seulement grisée :
  // c'est ce qui garantit qu'un merge n'active rien.
  it('drapeau éteint : l’item n’existe pas', async () => {
    stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    expect(item(/renvoyer le lien/i)).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /usage unique/i })).toBeNull();
  });

  it('drapeau allumé : l’item apparaît, à côté des actions du lien permanent', async () => {
    stubFetch();
    render(<PatientsPanel lienMagiqueActif />);
    await ouvrirMenu();
    // Les trois actions historiques restent : la coexistence est visible.
    expect(item(/usage unique/i)).toBeTruthy();
    expect(item(/renvoyer le lien/i)).toBeTruthy();
    expect(item(/copier le lien/i)).toBeTruthy();
    expect(item(/révoquer l’accès/i)).toBeTruthy();
  });

  // Le libellé porte la différence de nature. Confondre les deux liens, c'est
  // promettre un accès permanent là où il expire en 24 h.
  it('le libellé annonce la durée et l’usage unique', async () => {
    stubFetch();
    render(<PatientsPanel lienMagiqueActif />);
    await ouvrirMenu();
    expect(item(/usage unique/i).textContent).toMatch(/24\s*h/);
  });

  it('l’action postée est `lien_magique`, jamais celle du lien permanent', async () => {
    const appels = stubFetch();
    render(<PatientsPanel lienMagiqueActif />);
    await ouvrirMenu();
    fireEvent.click(item(/usage unique/i));

    await waitFor(() => {
      const token = appels.filter(a => a.url === '/api/praticien/token');
      expect(token.length).toBe(1);
      expect(token[0].body).toMatchObject({ action: 'lien_magique', idPatient: 'PAT_SEED_03' });
    });
  });

  // Un échec silencieux ferait croire au praticien qu'un lien est parti, et le
  // patient attendrait un e-mail qui n'arrive jamais.
  it('un échec serveur est dit, et ne se présente pas comme un envoi', async () => {
    stubFetch({ surToken: () => ({ success: false, reason: 'portal_revoked', error: 'Accès portail révoqué.' }) });
    render(<PatientsPanel lienMagiqueActif />);
    await ouvrirMenu();
    fireEvent.click(item(/usage unique/i));

    await waitFor(() => expect(screen.getByText(/révoqué/i)).toBeTruthy());
    expect(screen.queryByText(/valable 24 h/i)).toBeNull();
  });

  // Le serveur ACCEPTE (`success: true`, le lien est émis en base) et l'e-mail
  // meurt quand même. C'est le cas que les trois `catch` muets rendaient
  // indistinguable d'un succès : deux faits à dire, pas un.
  it('un lien émis dont l’e-mail meurt dit les deux faits, et rougit', async () => {
    stubFetch({
      surToken: () => ({ success: true, lien: 'https://x/portail/lien/J', envoi: 'echoue' }),
    });
    render(<PatientsPanel lienMagiqueActif />);
    await ouvrirMenu();
    fireEvent.click(item(/usage unique/i));

    const ligne = await screen.findByText(/Lien à usage unique émis, mais l’e-mail n’est pas parti/);
    expect(ligne).toBeTruthy();
    // LA COULEUR, ET PAS PAR `getByRole('status')` : deux `span[role=status]`
    // coexistent dès qu'un tiroir est ouvert. L'assertion porte sur l'élément
    // du texte, seul endroit sans ambiguïté.
    expect(ligne.className).toContain('text-status-danger');
    expect(screen.queryByText(/valable 24 h/i)).toBeNull();
  });

  it('un renvoi d’accès mort rougit lui aussi, et dit quoi faire', async () => {
    stubFetch({ surToken: () => ({ success: true, envoi: 'echoue' }) });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));

    const ligne = await screen.findByText(/Le lien n’est pas parti/);
    expect(ligne.className).toContain('text-status-danger');
    expect(screen.queryByText(/renvoyé au patient/)).toBeNull();
  });
});

describe('PatientsPanel — cycle de vie du dossier (LOT-01b)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groupe les deux fins de parcours et nomme l’effacement pour ce qu’il est', async () => {
    stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    expect(item(/clôturer le suivi/i)).toBeTruthy();
    expect(item(/effacer définitivement/i)).toBeTruthy();
    // « Supprimer » désignait une désactivation : le mot a disparu de l'écran.
    expect(screen.queryByText(/^Supprimer$/)).toBeNull();
  });

  it('la clôture passe par une confirmation avant tout appel', async () => {
    const appels = stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/clôturer le suivi/i));

    // Le dialogue nomme le dossier, et rien n'est encore parti.
    await screen.findByRole('heading', { name: /michel dogné/i });
    expect(appels.some(a => a.url.includes('cycle-de-vie'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /^clôturer le suivi$/i }));
    await waitFor(() => {
      const appel = appels.find(a => a.url.includes('cycle-de-vie'));
      expect(appel?.body).toMatchObject({ idPatient: 'PAT_SEED_03', action: 'cloture' });
    });
  });

  // Le serveur exige `confirmation: 'EFFACER'`. L'écran ne doit pas inventer
  // un second contrat, il doit refléter celui-là.
  it('l’effacement poste la confirmation exacte attendue par la route', async () => {
    const appels = stubFetch({ surCycleDeVie: () => ({ success: true, action: 'effacement', lignesSupprimees: 7 }) });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/effacer définitivement/i));

    const champ = await screen.findByLabelText(/saisissez/i);
    fireEvent.change(champ, { target: { value: 'EFFACER' } });
    fireEvent.click(screen.getByRole('button', { name: /^effacer définitivement$/i }));

    await waitFor(() => {
      const appel = appels.find(a => a.url.includes('cycle-de-vie'));
      expect(appel?.body).toMatchObject({
        idPatient: 'PAT_SEED_03',
        action: 'effacement',
        confirmation: 'EFFACER',
      });
    });
  });

  it('sans le mot saisi, aucun effacement n’est posté', async () => {
    const appels = stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/effacer définitivement/i));

    await screen.findByLabelText(/saisissez/i);
    fireEvent.click(screen.getByRole('button', { name: /^effacer définitivement$/i }));

    await waitFor(() => expect(screen.getByLabelText(/saisissez/i)).toBeTruthy());
    expect(appels.some(a => a.url.includes('cycle-de-vie'))).toBe(false);
  });

  // Le message de succès est le SEUL des trois textes de clôture que le
  // praticien voit à chaque fois : le dialogue le précède, le refus n'arrive
  // qu'en cas d'échec. Il n'était couvert par aucun test — c'est pour cela
  // qu'il a continué de promettre « aucun envoi » quand tout le reste avait été
  // corrigé le 2026-07-21. Il doit dire les deux choses : ce qui s'arrête, et
  // que le lien d'accès reste renvoyable.
  it('le message de clôture borne le refus au suivi et annonce le lien qui reste', async () => {
    stubFetch({ surCycleDeVie: () => ({ success: true, action: 'cloture' }) });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/clôturer le suivi/i));
    fireEvent.click(await screen.findByRole('button', { name: /^clôturer le suivi$/i }));

    const message = await screen.findByText(/suivi clôturé\s*:/i);
    expect(message.textContent).toMatch(/document de suivi/i);
    expect(message.textContent).toMatch(/renvoyer son lien/i);
    // Le refus doit rester BORNÉ : « aucun envoi » tout court reviendrait à la
    // promesse absolue que ce lot retire. Seul « de document de suivi » l'excuse.
    expect(message.textContent).not.toMatch(/aucun envoi(?! de document de suivi)/i);
  });

  // Même clôture, dossier déjà désactivé : le portail refuse déjà l'entrée,
  // promettre un lien renvoyable y serait faux. Le message doit suivre la même
  // condition que le dialogue, qui branche déjà sur `accesActif`.
  it('sur un dossier désactivé, le message de clôture ne promet aucun accès', async () => {
    stubFetch({
      patient: { ...PATIENT, actif: 'NON' },
      surCycleDeVie: () => ({ success: true, action: 'cloture' }),
    });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/clôturer le suivi/i));
    fireEvent.click(await screen.findByRole('button', { name: /^clôturer le suivi$/i }));

    const message = await screen.findByText(/suivi clôturé\s*:/i);
    expect(message.textContent).not.toMatch(/renvoyer son lien/i);
    expect(message.textContent).toMatch(/sans accès au portail/i);
  });

  it('un dossier clos propose la reprise, pas une seconde clôture', async () => {
    stubFetch({ patient: { ...PATIENT, suiviClotureLe: '2026-07-21T10:00:00.000Z' } });
    render(<PatientsPanel />);
    await ouvrirMenu();
    expect(item(/rouvrir le suivi/i)).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /clôturer le suivi/i })).toBeNull();
  });

  it('un dossier clos est signalé par un libellé, pas par une nuance de gris', async () => {
    stubFetch({ patient: { ...PATIENT, suiviClotureLe: '2026-07-21T10:00:00.000Z' } });
    render(<PatientsPanel />);
    await waitFor(() => expect(screen.getByText('Suivi clôturé')).toBeTruthy());
  });

  // La clôture interdit les envois, pas la lecture : le patient garde ses
  // archives, donc lui renvoyer son lien reste légitime.
  it('un dossier clos conserve ses actions d’accès au portail', async () => {
    stubFetch({ patient: { ...PATIENT, suiviClotureLe: '2026-07-21T10:00:00.000Z' } });
    render(<PatientsPanel />);
    await ouvrirMenu();
    // `MenuActions` pose `aria-disabled`, jamais `disabled` : lire `.disabled`
    // rendait ce banc incapable de rougir.
    expect(item(/renvoyer le lien/i).getAttribute('aria-disabled')).toBe(null);
  });

  // Régression : la désactivation coupe l'accès au portail du patient. Avant
  // ce lot, la même écriture demandait deux gestes (« Supprimer » puis
  // « Confirmer ») ; la renommer ne justifiait pas de lui retirer sa garde.
  it('la désactivation demande confirmation avant de couper l’accès', async () => {
    const appels = stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/désactiver le dossier/i));

    await screen.findByRole('heading', { name: /désactiver le dossier de michel dogné/i });
    expect(appels.some(a => a.method === 'PATCH')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /^désactiver le dossier$/i }));
    await waitFor(() => {
      const patch = appels.find(a => a.method === 'PATCH');
      expect(patch?.body).toMatchObject({ idPatient: 'PAT_SEED_03', actif: 'NON' });
    });
  });

  // Régression `D-126`, point 5. Ce formulaire était la SEULE porte de
  // désactivation sans dialogue de confirmation. La désactivation étant
  // devenue irréversible — elle ferme les liens en vol —, un praticien venu
  // corriger un numéro de téléphone pouvait tuer le lien envoyé deux heures
  // plus tôt, pour tout retour « Patient mis à jour. ».
  it('le formulaire « Modifier » n’envoie jamais `actif`', async () => {
    const appels = stubFetch();
    render(<PatientsPanel />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^modifier$/i }))[0]);

    // L'état reste LISIBLE, il n'est plus modifiable ici.
    expect(screen.getByText(/se change au menu de la ligne/i)).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: /^enregistrer$/i }));
    await waitFor(() => {
      const patch = appels.find(a => a.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(patch!.body).not.toHaveProperty('actif');
    });
  });

  // Régression `D-126`, point 6, et symétrique du banc « un dossier clos
  // conserve ses actions d'accès » ci-dessus : ce que la clôture laisse
  // ouvert, la désactivation le ferme. Le serveur refusait déjà les trois,
  // mais en « Patient introuvable. » sur un dossier que le praticien a sous
  // les yeux — un bouton qui ment est pire qu'un bouton grisé.
  //
  // « Copier le lien » EST DEDANS : il poste lui aussi (`action: 'lien'`), et
  // le garde `actif` d'`api/praticien/token` précède l'aiguillage des actions.
  // La quatrième action, le lien magique, n'existe que drapeau allumé.
  it('un dossier désactivé grise ses actions d’accès au portail', async () => {
    stubFetch({ patient: { ...PATIENT, actif: 'NON' } });
    render(<PatientsPanel />);
    await ouvrirMenu();
    expect(item(/renvoyer le lien/i).getAttribute('aria-disabled')).toBe('true');
    expect(item(/copier le lien/i).getAttribute('aria-disabled')).toBe('true');
  });

  it('un dossier inactif propose la réactivation, et l’envoie par PATCH', async () => {
    const appels = stubFetch({ patient: { ...PATIENT, actif: 'NON' } });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/réactiver le dossier/i));
    fireEvent.click(await screen.findByRole('button', { name: /^réactiver le dossier$/i }));

    await waitFor(() => {
      const patch = appels.find(a => a.method === 'PATCH');
      expect(patch?.body).toMatchObject({ idPatient: 'PAT_SEED_03', actif: 'OUI' });
    });
  });

  // Radix pose un voile et `aria-hidden` sur le reste du document : un message
  // rendu hors du dialogue est derrière l'overlay, souvent hors du viewport, et
  // muet pour un lecteur d'écran. Sur une action irréversible, l'échec serait
  // alors silencieux. `getByText` seul ne prouve rien — on exige le
  // confinement.
  it('dit l’échec DANS le dialogue, qui reste ouvert', async () => {
    stubFetch({
      surCycleDeVie: () => ({ success: false, reason: 'exception', error: 'Erreur technique.' }),
    });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/clôturer le suivi/i));
    fireEvent.click(await screen.findByRole('button', { name: /^clôturer le suivi$/i }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.closest('[role="dialog"]')).not.toBeNull();
    // Le dialogue reste ouvert : on doit pouvoir réessayer ou annuler.
    expect(screen.getByRole('button', { name: /^clôturer le suivi$/i })).toBeTruthy();
  });

  it('rend lisible un refus serveur sur dossier clos', async () => {
    stubFetch({
      surCycleDeVie: () => ({ success: false, reason: 'dossier_cloture', error: 'Dossier clos.' }),
    });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/clôturer le suivi/i));
    fireEvent.click(await screen.findByRole('button', { name: /^clôturer le suivi$/i }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/suivi de ce dossier est clôturé/i);
  });

  // Le dialogue est unique pour tout le tableau : c'est là que se logerait un
  // effacement porté sur le mauvais dossier.
  it('la confirmation porte sur le patient dont le menu a été ouvert', async () => {
    const appels = stubFetch({ patients: [PATIENT, AUTRE_PATIENT] });
    render(<PatientsPanel />);
    await ouvrirMenu(1);
    fireEvent.click(item(/effacer définitivement/i));

    await screen.findByRole('heading', { name: /sophie nicola/i });
    fireEvent.change(screen.getByLabelText(/saisissez/i), { target: { value: 'EFFACER' } });
    fireEvent.click(screen.getByRole('button', { name: /^effacer définitivement$/i }));

    await waitFor(() => {
      const appel = appels.find(a => a.url.includes('cycle-de-vie'));
      expect(appel?.body).toMatchObject({ idPatient: 'PAT_SEED_01' });
    });
  });

  it('une saisie abandonnée sur un dossier ne se reporte pas sur le suivant', async () => {
    stubFetch({ patients: [PATIENT, AUTRE_PATIENT] });
    render(<PatientsPanel />);
    await ouvrirMenu(0);
    fireEvent.click(item(/effacer définitivement/i));
    fireEvent.change(await screen.findByLabelText(/saisissez/i), { target: { value: 'EFFACER' } });
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));

    await ouvrirMenu(1);
    fireEvent.click(item(/effacer définitivement/i));
    await screen.findByRole('heading', { name: /sophie nicola/i });
    expect((screen.getByLabelText(/saisissez/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: /^effacer définitivement$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('trois clics sur un effacement ne produisent qu’un seul appel', async () => {
    const appels = stubFetch({ delaiCycleDeVie: 30 });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/effacer définitivement/i));
    fireEvent.change(await screen.findByLabelText(/saisissez/i), { target: { value: 'EFFACER' } });

    const bouton = screen.getByRole('button', { name: /^effacer définitivement$/i });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    fireEvent.click(bouton);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(appels.filter(a => a.url.includes('cycle-de-vie'))).toHaveLength(1);
  });

  // `phaseDossier` fait primer la clôture, ce qui est juste pour décider d'un
  // envoi. Mais afficher le seul « Suivi clôturé » sur un dossier désactivé
  // laisserait croire que le patient consulte encore ses archives.
  it('un dossier clos ET désactivé affiche les deux états', async () => {
    stubFetch({
      patient: { ...PATIENT, actif: 'NON', suiviClotureLe: '2026-07-21T10:00:00.000Z' },
    });
    render(<PatientsPanel />);
    await waitFor(() => expect(screen.getByText('Suivi clôturé')).toBeTruthy());
    expect(screen.getByText('Inactif')).toBeTruthy();
  });

  it('ne promet pas la lecture des archives quand le dossier est désactivé', async () => {
    stubFetch({ patient: { ...PATIENT, actif: 'NON' } });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/clôturer le suivi/i));
    await screen.findByRole('heading', { name: /clôturer le suivi/i });

    expect(screen.queryByText(/conserve l’accès en lecture/i)).toBeNull();
    expect(screen.getByText(/n’a plus accès à son espace/i)).toBeTruthy();
  });

  // Les boutons remplacés portaient `disabled` pendant l'appel. Sans ce garde,
  // deux ouvertures successives du menu envoient deux fois le même lien.
  it('neutralise les actions d’accès pendant qu’un envoi est en vol', async () => {
    const appels = stubFetch({
      surToken: () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 40)) as never,
    });
    render(<PatientsPanel />);
    const declencheur = await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));

    fireEvent.click(declencheur);
    await waitFor(() =>
      expect(item(/renvoyer le lien/i).getAttribute('aria-disabled')).toBe('true'),
    );
    fireEvent.click(item(/renvoyer le lien/i));

    await waitFor(() => {
      expect(appels.filter(a => a.url === '/api/praticien/token')).toHaveLength(1);
    });
  });

  it('signale les dossiers clos dans le sélecteur de consultation', async () => {
    stubFetch({ patient: { ...PATIENT, suiviClotureLe: '2026-07-21T10:00:00.000Z' } });
    render(<PatientsPanel />);
    // Le formulaire vit désormais dans son tiroir (SP-TRAJ LOT-05).
    await screen.findAllByRole('button', { name: /gérer le dossier/i });
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle consultation' }));
    await waitFor(() => expect(screen.getByText(/Michel Dogné.*\(suivi clôturé\)/)).toBeTruthy());
  });
});

// La révocation partait sur un clic, sans question. Depuis le LOT-02b elle
// coupe une session en cours et les liens à usage unique en vol : elle rejoint
// la règle que le panneau énonçait déjà — toute action qui change ce à quoi le
// patient a accès passe par un dialogue.
describe('PatientsPanel — révocation d’accès (LOT-02c)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('demande confirmation avant tout appel, et dit ce qui est coupé', async () => {
    const appels = stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/révoquer l’accès/i));

    await screen.findByRole('heading', { name: /révoquer l’accès de michel dogné/i });
    expect(screen.getByText(/session en cours est coupée/i)).toBeTruthy();
    expect(screen.getByText(/usage unique déjà envoyés/i)).toBeTruthy();
    // Rien n'est parti tant que le praticien n'a pas confirmé.
    expect(appels.some(a => a.method === 'DELETE')).toBe(false);
  });

  it('annuler n’appelle rien', async () => {
    const appels = stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/révoquer l’accès/i));
    await screen.findByRole('heading', { name: /révoquer l’accès/i });

    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /révoquer l’accès de/i })).toBeNull());
    expect(appels.some(a => a.method === 'DELETE')).toBe(false);
  });

  it('confirmer révoque une fois, et le message nomme les trois portes fermées', async () => {
    const appels = stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/révoquer l’accès/i));
    fireEvent.click(await screen.findByRole('button', { name: /^révoquer l’accès$/i }));

    await waitFor(() => {
      const revocations = appels.filter(a => a.method === 'DELETE');
      expect(revocations).toHaveLength(1);
      expect(revocations[0].url).toContain('PAT_SEED_03');
    });

    const message = await screen.findByText(/accès révoqué\s*:/i);
    expect(message.textContent).toMatch(/session en cours/i);
    expect(message.textContent).toMatch(/usage unique/i);
  });

  // Leçon du LOT-01b : un message rendu hors du dialogue passe derrière
  // l'overlay Radix et sous `aria-hidden`. L'échec doit être DANS le dialogue.
  it('un refus s’affiche dans le dialogue, qui reste ouvert', async () => {
    stubFetch({ surToken: () => ({ success: false, reason: 'forbidden', error: 'Patient non accessible.' }) });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/révoquer l’accès/i));
    fireEvent.click(await screen.findByRole('button', { name: /^révoquer l’accès$/i }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/pas accessible depuis votre compte/i);
    expect(screen.getByRole('heading', { name: /révoquer l’accès de/i })).toBeTruthy();
  });
});

describe('PatientsPanel — tiroirs d’action (SP-TRAJ LOT-05)', () => {
  it('les formulaires ne sont plus empilés : chacun s’ouvre dans son tiroir', async () => {
    stubFetch();
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });

    // Fermés par défaut : aucun champ de création dans le DOM.
    expect(screen.queryByPlaceholderText('Prénom *')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau patient' }));
    const tiroir = await screen.findByRole('dialog', { name: 'Nouveau patient' });
    expect(tiroir).toBeTruthy();
    expect(screen.getByPlaceholderText('Prénom *')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer le patient' })).toBeTruthy();
  });

  // INVERSÉ LE 2026-08-07 (LOT-03, D-030). Ce test affirmait l'inverse — il
  // vérifiait la PRÉSENCE de la zone « Packs suggérés » dans le tiroir. Elle est
  // retirée : ses boutons se raccordaient au panneau Packs par titre normalisé
  // parmi les packs ACTIFS, donc après le retrait des packs ils citeraient des
  // packs désactivés, et le clic rendrait un « n'existe pas encore » faux. Le
  // test est retourné plutôt que supprimé : c'est la disparition du bloc qui
  // doit être gardée, sinon le rétablir passerait inaperçu.
  //
  // Ce qui reste vrai du tiroir — il s'ouvre, il porte le formulaire — est
  // conservé ici : sans cela, le retrait pourrait emporter le tiroir entier
  // sans faire rougir quoi que ce soit.
  it('le tiroir assignation n’offre plus de pack suggéré, et reste un tiroir d’assignation', async () => {
    stubFetch();
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle assignation' }));
    const tiroir = await screen.findByRole('dialog', { name: 'Nouvelle assignation questionnaire' });
    expect(tiroir).toBeTruthy();

    // Le titre ET le corps de la zone ont disparu : garder le seul titre
    // laisserait passer un bloc renommé.
    expect(screen.queryByText('Packs suggérés')).toBeNull();
    expect(screen.queryByText(/Sélectionnez un questionnaire pour voir les packs/)).toBeNull();
    expect(screen.queryByText(/Aucun pack recommandé pour ce questionnaire/)).toBeNull();

    // Le tiroir, lui, fait toujours son travail.
    expect(screen.getByRole('button', { name: 'Créer l’assignation' })).toBeTruthy();
  });

  it('la création de consultation refermée sur succès s’annonce par la ligne de statut de la page', async () => {
    stubFetch();
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle consultation' }));
    await screen.findByRole('dialog', { name: 'Nouvelle consultation' });

    // Sélectionne le patient puis soumet : le stub répond success.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'PAT_SEED_03' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer une consultation/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/Consultation créée, lien d’accès envoyé au patient/)).toBeTruthy();
  });

  async function creerConsultation() {
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle consultation' }));
    await screen.findByRole('dialog', { name: 'Nouvelle consultation' });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'PAT_SEED_03' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer une consultation/ }));
  }

  it('un envoi mort ne s’annonce plus « lien d’accès envoyé »', async () => {
    // LE TIROIR SE FERME QUAND MÊME. La consultation EST créée : le laisser
    // ouvert sur un dossier déjà créé inviterait à la double soumission. C'est
    // le TEXTE qui porte l'échec, et il dit quoi faire.
    stubFetch({ surConsultations: () => ({ success: true, idConsultation: 'CONS_1', envoi: 'echoue' }) });
    await creerConsultation();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/mais l’e-mail n’est pas parti/)).toBeTruthy();
    expect(screen.queryByText(/lien d’accès envoyé au patient/)).toBeNull();
  });

  it('une messagerie non configurée ne dit pas « réessayez »', async () => {
    // Deux causes, deux gestes : réessayer n'a aucun sens sans SMTP posé.
    stubFetch({ surConsultations: () => ({ success: true, envoi: 'non_configure' }) });
    await creerConsultation();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/la messagerie n’est pas configurée/)).toBeTruthy();
  });
});

describe('PatientsPanel — annulation d’une assignation (Fil A)', () => {
  beforeEach(() => vi.clearAllMocks());

  const ASSIGNATION_OUVERTE = {
    idAssignation: 'ASS_OUVERTE',
    idPatient: PATIENT.idPatient,
    emailPatient: PATIENT.email,
    idQuestionnaire: 'Q_NEU_03',
    titre: 'Questionnaire ouvert',
    statut: 'En attente',
    statutReponses: 'non_rempli',
    dateAssignation: '2026-07-28T10:00:00.000Z',
    dateLimite: null,
  };
  const ASSIGNATION_SOUMISE = {
    ...ASSIGNATION_OUVERTE,
    idAssignation: 'ASS_SOUMISE',
    titre: 'Questionnaire soumis',
    statut: 'Complété',
    statutReponses: 'verrouille',
  };
  // Réouverte par le praticien (`deverrouille`), sans passation : c'est un
  // geste de réouverture, pas une soumission — annulable.
  const ASSIGNATION_DEVERROUILLEE_SANS_PASSATION = {
    ...ASSIGNATION_OUVERTE,
    idAssignation: 'ASS_DEVERROUILLEE_SANS',
    titre: 'Questionnaire déverrouillé sans réponse',
    statutReponses: 'deverrouille',
    aPassation: false,
  };
  // Même statut, mais le serveur a trouvé une `QuestionnaireReponse` : une
  // réouverture peut recouvrir une soumission réelle — pas d'action.
  const ASSIGNATION_DEVERROUILLEE_AVEC_PASSATION = {
    ...ASSIGNATION_OUVERTE,
    idAssignation: 'ASS_DEVERROUILLEE_AVEC',
    titre: 'Questionnaire déverrouillé avec réponse',
    statutReponses: 'deverrouille',
    aPassation: true,
  };

  it('seule une assignation ouverte porte un bouton « Annuler »', async () => {
    stubFetch({ assignations: [ASSIGNATION_OUVERTE, ASSIGNATION_SOUMISE] });
    render(<PatientsPanel />);
    const ligneOuverte = (await screen.findByText('Questionnaire ouvert')).closest('tr')!;
    const ligneSoumise = screen.getByText('Questionnaire soumis').closest('tr')!;
    expect(within(ligneOuverte).getByRole('button', { name: 'Annuler' })).toBeTruthy();
    // Une soumise porte une passation : pas d'action d'annulation.
    expect(within(ligneSoumise).queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('une assignation déverrouillée sans passation porte un bouton « Annuler »', async () => {
    stubFetch({ assignations: [ASSIGNATION_DEVERROUILLEE_SANS_PASSATION] });
    render(<PatientsPanel />);
    const ligne = (await screen.findByText('Questionnaire déverrouillé sans réponse')).closest('tr')!;
    expect(within(ligne).getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('une assignation déverrouillée AVEC passation n’a pas de bouton « Annuler »', async () => {
    stubFetch({ assignations: [ASSIGNATION_DEVERROUILLEE_AVEC_PASSATION] });
    render(<PatientsPanel />);
    const ligne = (await screen.findByText('Questionnaire déverrouillé avec réponse')).closest('tr')!;
    expect(within(ligne).queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  // Le SEUL cas client qui échoue sur le code d'avant : l'ancien prédicat en
  // dur n'autorisait que `non_rempli` et ignorait `aPassation`, donc il aurait
  // proposé un bouton voué au 409. C'est la course avec `submit` vue de
  // l'écran ; les deux tests `deverrouille` ci-dessus, eux, rendaient déjà le
  // même verdict avant ce lot pour le cas AVEC passation.
  it('non_rempli mais une passation attestée : pas de bouton « Annuler »', async () => {
    stubFetch({
      assignations: [
        {
          ...ASSIGNATION_OUVERTE,
          idAssignation: 'ASS_NON_REMPLI_AVEC',
          titre: 'Questionnaire non rempli mais soumis',
          aPassation: true,
        },
      ],
    });
    render(<PatientsPanel />);
    const ligne = (await screen.findByText('Questionnaire non rempli mais soumis')).closest('tr')!;
    expect(within(ligne).queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('confirmer l’annulation appelle la route puis rafraîchit le tableau', async () => {
    const appels = stubFetch({ assignations: [ASSIGNATION_OUVERTE] });
    render(<PatientsPanel />);
    const ligne = (await screen.findByText('Questionnaire ouvert')).closest('tr')!;
    fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));

    // La modale dédiée s'ouvre en nommant le questionnaire.
    await screen.findByRole('dialog');
    expect(screen.getByText(/Annuler l’assignation « Questionnaire ouvert » \?/)).toBeTruthy();

    const nbGetAvant = appels.filter(
      a => a.url.startsWith('/api/praticien/patients') && !a.url.includes('cycle-de-vie'),
    ).length;

    fireEvent.click(screen.getByRole('button', { name: 'Annuler l’assignation' }));

    await waitFor(() =>
      expect(
        appels.some(a => a.url.startsWith('/api/praticien/assignations/annulation') && a.method === 'POST'),
      ).toBe(true),
    );
    const appel = appels.find(a => a.url.startsWith('/api/praticien/assignations/annulation'));
    expect((appel?.body as { idAssignation?: string })?.idAssignation).toBe('ASS_OUVERTE');

    // Rafraîchissement : un GET /api/praticien/patients de plus après l'annulation.
    await waitFor(() =>
      expect(
        appels.filter(a => a.url.startsWith('/api/praticien/patients') && !a.url.includes('cycle-de-vie')).length,
      ).toBeGreaterThan(nbGetAvant),
    );
  });

  // La modale ne dit pas combien de journées un recueil d'agenda alimentaire
  // emporte : le praticien retire un recueil qui porte des données sans que
  // l'écran le lui dise (LOT-08). `nbJourneesAgenda` est un fait d'affichage
  // seul — il n'entre dans AUCUNE décision d'autorisation.
  describe('nbJourneesAgenda dans la modale de confirmation (LOT-08)', () => {
    const ASSIGNATION_AGENDA_AVEC_JOURS = {
      ...ASSIGNATION_OUVERTE,
      idAssignation: 'ASS_AGENDA_AVEC_JOURS',
      idQuestionnaire: 'Q_ALI_09',
      titre: 'Agenda alimentaire — 21 jours',
      nbJourneesAgenda: 3,
    };
    const ASSIGNATION_AGENDA_SANS_JOUR = {
      ...ASSIGNATION_OUVERTE,
      idAssignation: 'ASS_AGENDA_SANS_JOUR',
      idQuestionnaire: 'Q_ALI_09',
      titre: 'Agenda alimentaire — 21 jours',
      nbJourneesAgenda: 0,
    };

    const ASSIGNATION_AGENDA_UNE_JOURNEE = {
      ...ASSIGNATION_OUVERTE,
      idAssignation: 'ASS_AGENDA_UNE_JOURNEE',
      idQuestionnaire: 'Q_ALI_09',
      titre: 'Agenda alimentaire — 21 jours',
      nbJourneesAgenda: 1,
    };

    it('N > 1 : la modale nomme le nombre de journées de saisie', async () => {
      stubFetch({ assignations: [ASSIGNATION_AGENDA_AVEC_JOURS] });
      render(<PatientsPanel />);
      const ligne = (await screen.findByText('Agenda alimentaire — 21 jours')).closest('tr')!;
      fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));
      await screen.findByRole('dialog');
      expect(screen.getByText(/Ce recueil contient 3 journées de saisie\. Elles restent/)).toBeTruthy();
    });

    // N = 1 est l'état RÉEL du recueil pilote en production (D-027 : « une
    // journée sur vingt et une ») : la première fois que cette modale sert,
    // elle sert le singulier. Le verbe et le pronom doivent s'accorder aussi,
    // pas seulement le substantif.
    it('N = 1 : accord au singulier sur toute la phrase, verbe et pronom compris', async () => {
      stubFetch({ assignations: [ASSIGNATION_AGENDA_UNE_JOURNEE] });
      render(<PatientsPanel />);
      const ligne = (await screen.findByText('Agenda alimentaire — 21 jours')).closest('tr')!;
      fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));
      await screen.findByRole('dialog');
      expect(screen.getByText(/Ce recueil contient 1 journée de saisie\. Elle reste enregistrée et lisible/)).toBeTruthy();
      expect(screen.queryByText(/Elles restent/)).toBeNull();
    });

    it('0 : la modale dit qu’aucune journée de saisie n’est enregistrée', async () => {
      stubFetch({ assignations: [ASSIGNATION_AGENDA_SANS_JOUR] });
      render(<PatientsPanel />);
      const ligne = (await screen.findByText('Agenda alimentaire — 21 jours')).closest('tr')!;
      fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));
      await screen.findByRole('dialog');
      expect(screen.getByText(/Aucune journée de saisie n’est encore enregistrée/)).toBeTruthy();
    });

    // Le mot n'est pas « journée notée », et c'est délibéré : le panneau de la
    // fiche affiche « N journées notées » = `fenetre.nbRenseignees`, qui
    // compte les lignes RELUES, hors quarantaine. Ce compte-ci porte sur les
    // dates distinctes de TOUTES les lignes. Deux nombres derrière le même mot
    // se contrediraient pendant un incident d'intégrité — précisément quand le
    // praticien a besoin de croire l'écran.
    it('ne réemploie pas le mot « journée notée » du panneau de la fiche', async () => {
      stubFetch({ assignations: [ASSIGNATION_AGENDA_AVEC_JOURS] });
      render(<PatientsPanel />);
      const ligne = (await screen.findByText('Agenda alimentaire — 21 jours')).closest('tr')!;
      fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));
      await screen.findByRole('dialog');
      expect(screen.queryByText(/journées? notées?/)).toBeNull();
    });

    // `ASSIGNATION_OUVERTE` ne porte pas `nbJourneesAgenda` (pas un agenda
    // alimentaire) : la modale doit rester identique à avant ce lot.
    it('null (pas un agenda alimentaire) : aucune des deux phrases', async () => {
      stubFetch({ assignations: [ASSIGNATION_OUVERTE] });
      render(<PatientsPanel />);
      const ligne = (await screen.findByText('Questionnaire ouvert')).closest('tr')!;
      fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));
      await screen.findByRole('dialog');
      expect(screen.queryByText(/journée/)).toBeNull();
    });

    // Non-régression LOT-07 : `nbJourneesAgenda` n'entre dans aucune décision
    // d'autorisation. Une passation attestée masque toujours le bouton, même
    // sur un agenda qui porte des journées notées.
    it('n’entre dans aucune décision d’autorisation : une passation attestée masque toujours le bouton', async () => {
      stubFetch({
        assignations: [
          {
            ...ASSIGNATION_AGENDA_AVEC_JOURS,
            idAssignation: 'ASS_AGENDA_AVEC_PASSATION',
            statutReponses: 'deverrouille',
            aPassation: true,
          },
        ],
      });
      render(<PatientsPanel />);
      const ligne = (await screen.findByText('Agenda alimentaire — 21 jours')).closest('tr')!;
      expect(within(ligne).queryByRole('button', { name: 'Annuler' })).toBeNull();
    });
  });

  // Le filtre par statut s'appliquait en mémoire, sur une liste que le serveur
  // avait déjà plafonnée à 40 : tout ce qui dépassait était masqué en silence,
  // et le compte affiché se présentait comme un total.
  describe('filtre de statut et troncature', () => {
    it('change de statut par une requête serveur, jamais par un tri en mémoire', async () => {
      const appels = stubFetch({ assignations: [ASSIGNATION_OUVERTE] });
      render(<PatientsPanel />);
      await screen.findByText('Questionnaire ouvert');

      fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'Complété' } });

      // L'URL exacte, accents percent-encodés : c'est ce que le serveur relit.
      await waitFor(() =>
        expect(
          appels.some(a => a.url === `/api/praticien/patients?statut=${encodeURIComponent('Complété')}`),
        ).toBe(true),
      );
    });

    it('dit qu’elle tronque quand le total dépasse ce qu’elle affiche', async () => {
      stubFetch({
        assignations: [ASSIGNATION_OUVERTE],
        assignationsMeta: { total: 48, plafond: 40, statut: null },
      });
      render(<PatientsPanel />);
      const compte = await screen.findByTestId('assignations-compte');
      expect(compte.textContent).toContain('1 sur 48');
    });

    // Une troncature affirmée sans troncature réelle serait le défaut inverse.
    it('n’invente pas une troncature quand tout est affiché', async () => {
      stubFetch({
        assignations: [ASSIGNATION_OUVERTE],
        assignationsMeta: { total: 1, plafond: 40, statut: null },
      });
      render(<PatientsPanel />);
      const compte = await screen.findByTestId('assignations-compte');
      expect(compte.textContent).toContain('1');
      expect(compte.textContent).not.toContain('sur');
    });

    // Compte manquant ≠ compte nul : sans réponse du serveur, on n'affirme rien.
    it('reste muet sur la troncature quand le serveur ne rend aucun compte', async () => {
      stubFetch({ assignations: [ASSIGNATION_OUVERTE] });
      render(<PatientsPanel />);
      const compte = await screen.findByTestId('assignations-compte');
      expect(compte.textContent).not.toContain('sur');
    });

    // Le message d'absence portait sur l'ensemble du dossier alors qu'un filtre
    // était actif : « Aucune assignation. » sous « En attente » se lit comme
    // « ce patient n'a rien », ce que la surface ne sait pas.
    it('nomme le filtre quand elle ne trouve rien sous ce filtre', async () => {
      stubFetch({
        surPatients: url => ({
          patients: [PATIENT],
          assignations: [],
          assignationsMeta: { total: 0, plafond: 40, statut: url.includes('statut=') ? 'Annulée' : null },
        }),
      });
      render(<PatientsPanel />);
      await screen.findByText('Aucune assignation.');
      fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'Annulée' } });
      await screen.findByText('Aucune assignation « Annulée ».');
    });

    // B1 — sans debounce, deux changements dans un aller-retour lancent deux
    // requêtes concurrentes. Sans garde, la dernière ARRIVÉE gagne : la table
    // listerait des « Complété » sous un sélecteur affichant « En attente ».
    it('jette une réponse qui ne correspond plus au statut affiché', async () => {
      const resolveurs: (() => void)[] = [];
      stubFetch({
        surPatients: async url => {
          const statut = new URL(url, 'http://x').searchParams.get('statut');
          const charge = {
            patients: [PATIENT],
            assignations: statut === 'Complété' ? [ASSIGNATION_SOUMISE] : [ASSIGNATION_OUVERTE],
            assignationsMeta: { total: 1, plafond: 40, statut },
          };
          // La réponse « Complété » est retenue, puis relâchée en dernier.
          if (statut === 'Complété') {
            await new Promise<void>(r => resolveurs.push(r));
          }
          return charge;
        },
      });
      render(<PatientsPanel />);
      await screen.findByText('Questionnaire ouvert');

      const select = screen.getByDisplayValue('Tous les statuts');
      fireEvent.change(select, { target: { value: 'Complété' } });
      fireEvent.change(select, { target: { value: 'En attente' } });
      await screen.findByText('Questionnaire ouvert');

      resolveurs.forEach(r => r());
      // La réponse tardive ne doit RIEN changer : le sélecteur dit « En attente ».
      await waitFor(() => expect(screen.queryByText('Questionnaire soumis')).toBeNull());
      expect(screen.getByText('Questionnaire ouvert')).toBeTruthy();
    });

    // B2 — seul chemin de chargement déclenché par un geste d'UI. Sans `.catch`,
    // le rejet est silencieux et la table garde l'ensemble précédent.
    it('dit l’échec d’un changement de statut au lieu de se figer en silence', async () => {
      stubFetch({
        surPatients: url => {
          if (url.includes('statut=')) throw new Error('réseau coupé');
          return { patients: [PATIENT], assignations: [ASSIGNATION_OUVERTE] };
        },
      });
      render(<PatientsPanel />);
      await screen.findByText('Questionnaire ouvert');

      fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'Complété' } });

      const erreur = await screen.findByTestId('assignations-erreur');
      expect(erreur.textContent).toContain('Impossible de recharger les assignations');
      // Le panneau reste debout : le tableau patients n'a pas disparu.
      expect(screen.getByText('Questionnaire ouvert')).toBeTruthy();
    });

    // B2, second visage : une session expirée remplaçait TOUT le panneau
    // praticien — au chargement initial c'est voulu, sur un filtre non.
    it('ne fait pas disparaître le panneau quand le serveur répond indisponible', async () => {
      stubFetch({
        surPatients: url =>
          url.includes('statut=')
            ? { patients: [], assignations: [], unavailable: true, reason: 'unauthenticated' }
            : { patients: [PATIENT], assignations: [ASSIGNATION_OUVERTE] },
      });
      render(<PatientsPanel />);
      await screen.findByText('Questionnaire ouvert');

      fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'Complété' } });

      await screen.findByTestId('assignations-erreur');
      expect(screen.getByText('Questionnaire ouvert')).toBeTruthy();
    });
  });

  // M1 — le paramètre par défaut `statut = statutFilterRef.current` est la
  // seule chose qui empêche un rafraîchissement de rendre la liste NON filtrée,
  // donc tronquée à 40 : le bug d'origine, ressuscité par un geste ordinaire.
  it('conserve le filtre lors du rafraîchissement qui suit une annulation', async () => {
    const appels = stubFetch({ assignations: [ASSIGNATION_OUVERTE] });
    render(<PatientsPanel />);
    await screen.findByText('Questionnaire ouvert');

    fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'En attente' } });
    await waitFor(() => expect(appels.some(a => a.url.includes('statut='))).toBe(true));

    const ligne = (await screen.findByText('Questionnaire ouvert')).closest('tr')!;
    fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));
    await screen.findByRole('dialog');
    const nbAvant = appels.length;
    fireEvent.click(screen.getByRole('button', { name: 'Annuler l’assignation' }));

    const attendue = `/api/praticien/patients?statut=${encodeURIComponent('En attente')}`;
    await waitFor(() => expect(appels.slice(nbAvant).some(a => a.url === attendue)).toBe(true));
  });
});

// Deux gestes de routine — créer une consultation, renvoyer le lien — levaient
// la révocation d'accès EN SILENCE. Le praticien défaisait sa propre décision
// de sécurité sans qu'on le lui dise, et sans qu'aucun écran ne porte l'état
// qu'il changeait hors de la fenêtre de 30 jours de l'encart.
describe('PatientsPanel — rétablissement d’un accès révoqué', () => {
  beforeEach(() => vi.clearAllMocks());

  const REVOQUE = { patient: { ...PATIENT, accesRevoque: true } };
  const titreDialogue = /rétablir l’accès de michel dogné/i;

  it('un dossier révoqué porte sa pastille au dossier', async () => {
    stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await waitFor(() => expect(screen.getByText('Accès révoqué')).toBeTruthy());
  });

  it('la pastille se CUMULE avec l’état du dossier, elle ne le remplace pas', async () => {
    // Trois états indépendants : `D-126` §2 interdit de déduire la révocation
    // d'une désactivation, et l'inverse est vrai aussi.
    stubFetch({ patient: { ...PATIENT, actif: 'NON', accesRevoque: true } });
    render(<PatientsPanel />);
    await waitFor(() => expect(screen.getByText('Accès révoqué')).toBeTruthy());
    expect(screen.getByText('Inactif')).toBeTruthy();
  });

  it('un dossier ouvert ne porte aucune pastille de révocation', async () => {
    stubFetch();
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });
    expect(screen.queryByText('Accès révoqué')).toBeNull();
  });

  it('renvoyer le lien à un dossier révoqué demande confirmation AVANT tout appel', async () => {
    const appels = stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));

    await screen.findByRole('heading', { name: titreDialogue });
    // RIEN N'A ÉTÉ POSTÉ : le dialogue s'interpose, il ne commente pas après coup.
    expect(appels.some(a => a.url === '/api/praticien/token')).toBe(false);
  });

  it('confirmer poste l’accord explicite', async () => {
    const appels = stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));
    await screen.findByRole('heading', { name: titreDialogue });
    fireEvent.click(screen.getByRole('button', { name: /^rétablir l’accès$/i }));

    await waitFor(() => {
      const token = appels.filter(a => a.url === '/api/praticien/token');
      expect(token.length).toBe(1);
      expect(token[0].body).toMatchObject({
        idPatient: 'PAT_SEED_03',
        action: 'resend',
        retablirAcces: true,
      });
    });
  });

  it('annuler n’appelle rien et laisse l’accès fermé', async () => {
    const appels = stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));
    await screen.findByRole('heading', { name: titreDialogue });
    fireEvent.click(screen.getByRole('button', { name: /^annuler$/i }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: titreDialogue })).toBeNull());
    expect(appels.some(a => a.url === '/api/praticien/token')).toBe(false);
  });

  it('un dossier NON révoqué n’ouvre aucun dialogue et poste SANS drapeau', async () => {
    // Une confirmation systématique userait la seule qui compte.
    const appels = stubFetch();
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));

    await waitFor(() => {
      const token = appels.filter(a => a.url === '/api/praticien/token');
      expect(token.length).toBe(1);
      expect((token[0].body as { retablirAcces?: boolean }).retablirAcces).toBeUndefined();
    });
    expect(screen.queryByRole('heading', { name: titreDialogue })).toBeNull();
  });

  it('un refus du rétablissement s’affiche DANS le dialogue, qui reste ouvert', async () => {
    // Derrière l'overlay, la ligne de statut de la page ne se lit pas.
    stubFetch({
      ...REVOQUE,
      surToken: () => ({ success: false, reason: 'forbidden', error: 'Patient non accessible.' }),
    });
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));
    await screen.findByRole('heading', { name: titreDialogue });
    fireEvent.click(screen.getByRole('button', { name: /^rétablir l’accès$/i }));

    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: titreDialogue })).toBeTruthy();
  });

  it('le sélecteur de consultation signale déjà l’accès révoqué', async () => {
    // Signalé À LA SÉLECTION, et pas seulement refusé après coup : le praticien
    // voit ce qu'il s'apprête à rouvrir avant de composer sa consultation.
    stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle consultation' }));
    await screen.findByRole('dialog', { name: 'Nouvelle consultation' });
    expect(screen.getByText(/Michel Dogné.*\(accès révoqué\)/)).toBeTruthy();
  });

  it('créer une consultation pour un dossier révoqué demande confirmation AVANT tout appel', async () => {
    const appels = stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle consultation' }));
    await screen.findByRole('dialog', { name: 'Nouvelle consultation' });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'PAT_SEED_03' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer une consultation/ }));

    await screen.findByRole('heading', { name: titreDialogue });
    expect(appels.some(a => a.url === '/api/praticien/consultations')).toBe(false);
  });

  it('confirmer la consultation poste l’accord ET le motif saisi', async () => {
    // Le motif est asserté parce qu'un remaniement qui reconstruirait le corps
    // sur le chemin confirmé le perdrait en silence : le praticien aurait
    // saisi son motif, la consultation partirait sans.
    const appels = stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await screen.findAllByRole('button', { name: /gérer le dossier/i });
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle consultation' }));
    await screen.findByRole('dialog', { name: 'Nouvelle consultation' });
    const listes = screen.getAllByRole('combobox');
    fireEvent.change(listes[0], { target: { value: 'PAT_SEED_03' } });
    fireEvent.change(listes[1], { target: { value: 'Sommeil et récupération' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer une consultation/ }));

    await screen.findByRole('heading', { name: titreDialogue });
    fireEvent.click(screen.getByRole('button', { name: /^rétablir l’accès$/i }));

    await waitFor(() => {
      const posts = appels.filter(a => a.url === '/api/praticien/consultations');
      expect(posts.length).toBe(1);
      expect(posts[0].body).toMatchObject({
        idPatient: 'PAT_SEED_03',
        motif: 'Sommeil et récupération',
        retablirAcces: true,
      });
    });
  });

  it('la table se recharge après un rétablissement confirmé', async () => {
    // Sans quoi la pastille resterait allumée sur un accès rouvert, et le
    // praticien recliquerait sur un dialogue qui n'a plus lieu d'être.
    const appels = stubFetch(REVOQUE);
    render(<PatientsPanel />);
    await ouvrirMenu();
    fireEvent.click(item(/renvoyer le lien/i));
    await screen.findByRole('heading', { name: titreDialogue });
    const avant = appels.filter(a => a.url.startsWith('/api/praticien/patients?page=')).length;
    fireEvent.click(screen.getByRole('button', { name: /^rétablir l’accès$/i }));

    await waitFor(() => {
      const apres = appels.filter(a => a.url.startsWith('/api/praticien/patients?page=')).length;
      expect(apres).toBeGreaterThan(avant);
    });
  });
});
