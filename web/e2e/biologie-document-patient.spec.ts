// Le document remis au patient, de bout en bout (campagne « Biologie
// exploitée », LOT-03 §1) : proposition servie → geste d'établir → refus
// confirmable rejoué si une garde mord → pièce consignée avec son ancre →
// RECHARGEMENT, et la pièce est toujours là, relisible.
//
// CE DERNIER POINT EST LA RAISON D'ÊTRE DU SPEC. « Ce qui a été remis survit au
// rechargement » est la phrase centrale du changelog du LOT-01, et aucun banc
// de rendu ne peut la prouver : elle exige un aller-retour réel — une
// consignation, une navigation neuve, une relecture servie par la base. Un test
// de composant qui monterait le panneau avec la liste déjà en props
// prouverait le rendu de la liste, jamais sa persistance.
//
// Patient fictif Jennifer Martin (PAT_SEED_02), même fixture que le parcours
// proposition/courrier — `workers: 1` et `fullyParallel: false` garantissent
// qu'aucun des deux ne tourne pendant l'autre. Le seed n'est PAS touché.
//
// Mode sériel : les trois tests partagent un dossier qui s'accumule — la pièce
// consignée par le premier est ce que le deuxième relit et ce que le troisième
// fait refuser en doublon. L'ordre EST le parcours.
//
// Les drapeaux `WN_CB_ENABLED` et `WN_CB_PROPOSITION` sont posés par
// `webServer.env` et par la seule commande `npm run build` : sans eux la route
// rend 503 et ce spec passerait au vert en ne trouvant rien à cliquer.
import { test, expect, type Page } from '@playwright/test';
import { praticienSessionCookie } from './helpers/auth';
import { confirmerEpisodeT0, ouvrirSousVueBiologie } from './helpers/biologie';
import {
  provisionnerDossierBiologie,
  nettoyerDossierBiologie,
  nettoyerDocumentsPatientBiologie,
} from './helpers/db';

const PATIENT_ID = 'PAT_SEED_02';

/**
 * L'instant d'avant le premier geste : la borne du nettoyage.
 *
 * Relevé une seconde EN ARRIÈRE. `genere_le` est posé par la base et
 * `deleteMany` filtre sur `gte` : deux horloges (celle du runner, celle de
 * PostgreSQL) qui divergeraient de quelques millisecondes laisseraient sinon
 * la première pièce du run hors de la borne — donc en base, à faire échouer le
 * run suivant sur un doublon que personne n'a posé.
 */
let debutDuRun: Date;

test.describe.configure({ mode: 'serial' });

/**
 * Le panneau de proposition, atteint depuis une page neuve.
 *
 * Trois gestes indissociables — confirmer (ou rejouer) l'épisode T0, ouvrir la
 * phase Actions, ouvrir la sous-vue Biologie — et le parcours les refait à
 * CHAQUE test : c'est ce qui rend le rechargement du test 2 réel plutôt que
 * simulé.
 */
async function ouvrirPanneauProposition(page: Page) {
  await page.goto(`/dashboard/patients/${PATIENT_ID}`);
  await confirmerEpisodeT0(page);
  await ouvrirSousVueBiologie(page);
  const panneau = page.getByRole('region', { name: 'Biologie — proposition de bilan' });
  await expect(panneau).toBeVisible();
  return panneau;
}

test.describe('Document patient biologie — consigner, puis relire après rechargement', () => {
  test.beforeAll(async () => {
    debutDuRun = new Date(Date.now() - 1_000);
    await provisionnerDossierBiologie(PATIENT_ID);
  });

  test.afterAll(async () => {
    // Les documents AVANT le reste : ils ne référencent rien, mais l'ordre
    // reste celui du dossier — ce que le parcours a produit part en premier.
    await nettoyerDocumentsPatientBiologie(PATIENT_ID, debutDuRun);
    await nettoyerDossierBiologie(PATIENT_ID);
  });

  test('le document s’établit, porte son ancre, et un refus confirmable se tranche à l’écran', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    const panneau = await ouvrirPanneauProposition(page);

    // La surface est interrogée AVANT l'écran : sans cette sonde, une surface
    // fermée (drapeau absent au build) et un moteur qui s'abstient (motif
    // clinique) rendent le MÊME symptôme qu'un sélecteur faux — « élément
    // introuvable » — et le banc accuserait l'écran pour une cause qui n'y est
    // pas. Leçon payée au CI du 2026-08-21 sur le spec voisin.
    const sonde = await page.request.get(
      `/api/praticien/biologie/proposition?idPatient=${PATIENT_ID}`,
    );
    const corpsSonde = await sonde.text();
    expect(
      sonde.status(),
      `la route de proposition n'a pas répondu 200 — corps : ${corpsSonde}`,
    ).toBe(200);

    // Avant le geste, la relecture DIT qu'elle est vide — et le dit après une
    // lecture aboutie, jamais par défaut (`DC-24`). C'est l'état de référence
    // du test 2 : sans lui, une liste peuplée par un run précédent mal nettoyé
    // ferait passer le test 2 au vert sans que rien n'ait été consigné ici.
    await expect(
      panneau.getByText('Aucun document n’a encore été remis pour ce dossier.'),
    ).toBeVisible();

    const etablir = panneau.getByRole('button', {
      name: 'Établir et consigner le document patient',
    });
    await expect(etablir).toBeEnabled();
    await etablir.click();

    // DEUX ISSUES LÉGITIMES, et l'attente les accepte toutes les deux sans
    // jamais devenir conditionnelle sur l'instant : la consignation directe, ou
    // le REFUS CONFIRMABLE du registre patient (`D-090`) si le texte dérivé
    // emploie un terme signalé. Le second temps n'est pas un contournement du
    // refus : c'est le régime — le praticien a lu le terme et tranche.
    const consigne = panneau.getByText(/Document consigné au dossier/);
    const malgreRegistre = panneau.getByRole('button', {
      name: 'Consigner malgré le registre signalé',
    });
    await expect(consigne.or(malgreRegistre).first()).toBeVisible();
    if ((await malgreRegistre.count()) > 0) {
      // Le refus s'affiche AVANT d'être tranché : un second temps sans motif
      // lisible serait un clic à l'aveugle.
      await expect(panneau.getByRole('alert')).toBeVisible();
      await malgreRegistre.click();
    }

    // L'ANCRE FAIT PARTIE DE LA PIÈCE. Un document sans provenance ni empreinte
    // ne serait pas relisible comme trace : on ne saurait pas de quelle table de
    // règles il est sorti.
    // Les deux sur LA MÊME ligne, et le sélecteur le dit : chercher
    // « empreinte » dans tout le panneau en trouve DEUX — celle-ci et celle de
    // la liste des remises, que la consignation vient de rafraîchir sans
    // rechargement. Le constat est bon à prendre, mais il n'appartient pas à
    // cette assertion-ci : ce qu'on éprouve ici, c'est que la pièce fraîchement
    // établie porte sa provenance ET son empreinte, pas qu'il en existe une
    // quelque part dans l'écran.
    const statut = panneau.getByText(/Document consigné au dossier\. Provenance :/);
    await expect(statut).toBeVisible();
    await expect(statut).toContainText(/empreinte [0-9a-f]{12}…/);

    // `toHaveValue`, pas `not.toBeEmpty()` : le texte d'un `<textarea>` piloté
    // par React vit dans sa VALEUR, pas dans ses enfants DOM.
    const texte = panneau.getByLabel('Texte du document patient à remettre');
    await expect(texte).toBeVisible();
    await expect(texte).toHaveValue(/\S/);
  });

  test('la pièce SURVIT au rechargement et se relit — ce qu’aucun banc de rendu ne prouve', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    // Page NEUVE : l'état React du test précédent est perdu, et tout ce qui
    // s'affiche vient de la base.
    const panneau = await ouvrirPanneauProposition(page);

    // L'état vide a disparu — donc la liste ne dit pas seulement « je ne sais
    // pas », elle a lu quelque chose.
    await expect(
      panneau.getByText('Aucun document n’a encore été remis pour ce dossier.'),
    ).toHaveCount(0);
    await expect(panneau.getByText('Documents déjà remis')).toBeVisible();
    await expect(panneau.getByText(/Remis le .* · provenance .*, empreinte [0-9a-f]{12}…/)).toBeVisible();

    // RELIRE EST UN GESTE : le texte n'est pas déversé d'office. Le déplier est
    // ce qui prouve que la pièce est entière en base, pas seulement sa ligne
    // d'en-tête.
    const relire = panneau.getByRole('button', { name: 'Relire le texte' }).first();
    await expect(relire).toHaveAttribute('aria-expanded', 'false');
    await relire.click();
    // LE BOUTON CHANGE DE NOM EN S'OUVRANT : « Relire le texte » devient
    // « Masquer le texte », donc le retrouver par son nom d'avant ne désigne
    // plus rien. Un repère consommé par l'action qu'il sert à observer ne
    // prouve rien — la même faute que le spec voisin a payée au CI sur le
    // bouton « Déjà exploré hors outil… ».
    const masquer = panneau.getByRole('button', { name: 'Masquer le texte' });
    await expect(masquer).toHaveAttribute('aria-expanded', 'true');

    const texteRelu = panneau.getByRole('textbox', { name: /Texte du document remis le/ });
    await expect(texteRelu).toBeVisible();
    await expect(texteRelu).toHaveValue(/\S/);
  });

  test('établir deux fois le même texte est refusé — et la seconde copie se confirme', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    const panneau = await ouvrirPanneauProposition(page);

    // Le geste est REOFFERT après rechargement : `dejaConsigne` ne survit pas à
    // la page. C'est voulu — un nouveau passage sur la fiche rouvre le geste —,
    // et c'est ce qui rend la garde serveur nécessaire plutôt que décorative.
    const etablir = panneau.getByRole('button', {
      name: 'Établir et consigner le document patient',
    });
    await expect(etablir).toBeEnabled();
    await etablir.click();

    // LES DEUX GARDES SONT ORDONNÉES, et le rechargement a effacé les jetons
    // de confirmation du test 1 : le registre re-refuse d'abord s'il mord, et
    // ce n'est qu'une fois SON second temps tranché que le doublon apparaît.
    // Les enchaîner dans cet ordre n'est pas une précaution — c'est la
    // séquence que la route impose (« un texte inadapté au patient se signale
    // avant sa redondance »).
    const malgreRegistre = panneau.getByRole('button', {
      name: 'Consigner malgré le registre signalé',
    });
    const secondeCopie = panneau.getByRole('button', { name: 'Consigner une seconde copie' });
    await expect(malgreRegistre.or(secondeCopie).first()).toBeVisible();
    if ((await malgreRegistre.count()) > 0) await malgreRegistre.click();

    // Le texte dérivé ne porte que la DATE (pas l'heure) : deux consignations
    // du même jour produisent le MÊME texte, donc le doublon est déterministe.
    await expect(secondeCopie).toBeVisible();
    await expect(panneau.getByRole('alert')).toContainText(/déjà consigné à ce dossier/);

    // RIEN N'EST CONSIGNÉ TANT QUE LE PRATICIEN N'A PAS TRANCHÉ : la liste des
    // documents remis n'a pas bougé. C'est la moitié du refus qu'un banc de
    // route ne voit pas — l'écran pourrait très bien afficher le refus ET
    // avoir écrit.
    const avant = await panneau.getByRole('button', { name: 'Relire le texte' }).count();

    await secondeCopie.click();
    await expect(panneau.getByText(/Document consigné au dossier\. Provenance :/)).toBeVisible();

    // La relecture est rechargée par le geste : une pièce de plus, pas une de
    // remplacée — la table est append-only.
    await expect(async () => {
      expect(await panneau.getByRole('button', { name: 'Relire le texte' }).count()).toBe(avant + 1);
    }).toPass();
  });
});
