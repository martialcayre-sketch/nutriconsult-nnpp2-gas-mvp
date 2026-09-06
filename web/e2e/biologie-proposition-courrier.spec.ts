// Surface biologie de bout en bout (LOT-02 de 2026-08-18-biologie-consolidee) :
// proposition de bilan → déclaration d'un panel documenté → courrier médecin
// ancré → verdict d'ancrage au fil de correspondance.
//
// `WN_CB_PROPOSITION` est posé en production depuis le 2026-08-18 et AUCUN
// parcours ne traversait ces écrans : ce qui y casserait ne serait vu que par
// un praticien. Ce spec est cette garde.
//
// Patient fictif Jennifer Martin (PAT_SEED_02) : un épisode T0 confirmé et une
// passation `Q_STR_02` en zone danger sont provisionnés en base puis nettoyés.
// Aucun autre spec ne lit ces données. Le seed n'est PAS touché — le modifier
// emporterait `visual.spec.ts` (capture pixel), `fiche-detail-reponses` et
// `seedCertification.guard`.
//
// Mode sériel : les trois tests partagent un état de dossier qui s'accumule
// (déclaration, puis courrier consigné) — l'ordre est le parcours lui-même.
//
// Les drapeaux `WN_CB_ENABLED` et `WN_CB_PROPOSITION` sont exportés par
// `scripts/wn-test-worktree.sh` et par le job `verify` : sans eux la route rend
// 503 et ce spec passerait au vert en ne trouvant rien à cliquer.
import { test, expect } from '@playwright/test';
import { praticienSessionCookie } from './helpers/auth';
import { confirmerEpisodeT0, ouvrirSousVueBiologie } from './helpers/biologie';
import {
  provisionnerDossierBiologie,
  nettoyerDossierBiologie,
  MEDECIN_BIO_E2E,
  DATE_BILAN_BIO_E2E,
} from './helpers/db';

const PATIENT_ID = 'PAT_SEED_02';

test.describe.configure({ mode: 'serial' });

test.describe('Surface biologie — proposition, déclaration, courrier', () => {
  test.beforeAll(async () => {
    await provisionnerDossierBiologie(PATIENT_ID);
  });

  test.afterAll(async () => {
    await nettoyerDossierBiologie(PATIENT_ID);
  });

  test('la proposition de bilan est servie, et déclarer un bilan hors outil la recalcule', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    await page.goto(`/dashboard/patients/${PATIENT_ID}`);

    // Le panneau vit dans la phase Actions du cycle clinique — pas dans un
    // onglet à part. Sans épisode confirmé la phase resterait « à ouvrir » :
    // c'est la fixture qui la rend atteignable.
    await confirmerEpisodeT0(page);

    // La surface est interrogée AVANT l'écran, et ce n'est pas du confort de
    // débogage : le panneau n'est monté que si la route répond `ok`. Sans cette
    // sonde, une surface fermée (drapeau absent) et un moteur qui s'abstient
    // (motif clinique) rendent le MÊME symptôme qu'un sélecteur faux —
    // « élément introuvable » —, et le banc accuse l'écran pour une cause qui
    // n'y est pas. Le premier run en CI a coûté exactement cette confusion.
    const sonde = await page.request.get(
      `/api/praticien/biologie/proposition?idPatient=${PATIENT_ID}`,
    );
    const corpsSonde = await sonde.text();
    expect(
      sonde.status(),
      `la route de proposition n'a pas répondu 200 — corps : ${corpsSonde}`,
    ).toBe(200);
    expect(
      JSON.parse(corpsSonde).ok,
      `la proposition est indisponible — corps : ${corpsSonde}`,
    ).toBe(true);

    await ouvrirSousVueBiologie(page);

    // Deux comptages avant l'assertion, et ils ne sont pas décoratifs : la
    // route répond `ok` et la phase Actions s'affiche, donc si le panneau
    // manque encore, c'est OU BIEN qu'il n'est pas rendu (le client n'a pas le
    // drapeau, `propositionDisponible` reste faux) OU BIEN qu'il est rendu et
    // que le rôle/nom ne le désigne pas. Le message d'échec doit le dire.
    const panneau = page.getByRole('region', { name: 'Biologie — proposition de bilan' });
    const nTexte = await page.getByText('Biologie — proposition de bilan').count();
    const nSection = await page.locator('section[aria-labelledby="proposition-bilan-title"]').count();
    await expect(
      panneau,
      `panneau introuvable — titre présent ${nTexte} fois dans le DOM, `
        + `sections étiquetées : ${nSection}. Zéro des deux = panneau NON RENDU `
        + `(drapeau client absent) ; au moins un = rendu mais non désigné.`,
    ).toBeVisible();

    // Point 1 — des LIGNES DE PROPOSITION, pas seulement un cadre. Compter les
    // `listitem` du panneau ne prouverait rien : la liste permanente « Ce que
    // cette vue ne sait pas » et les motifs imbriqués en portent aussi, si
    // bien qu'une proposition VIDE passerait le compte (constat de revue).
    // Le bouton de déclaration, lui, n'est rendu qu'une fois par ligne
    // proposée — et le message d'abstention doit être absent.
    await expect(
      panneau.getByText(/Aucun panel du catalogue n’est couvert/),
    ).toHaveCount(0);
    const declarations = panneau.getByRole('button', { name: 'Déjà exploré hors outil…' });
    await expect(declarations.first()).toBeVisible();

    // Le statut de la première ligne, AVANT déclaration — relevé pour le
    // message d'échec, PAS pour exiger qu'il bouge : voir plus bas.
    // `filter({ has })` veut une localisation RELATIVE, réenracinée dans chaque
    // `li` : lui passer `declarations.first()` — déjà résolu à un élément
    // précis de la page — ne filtre rien et fait expirer la lecture (constat du
    // CI, 2 min de timeout). C'est le rôle nu qu'il faut donner.
    const premiereLigne = panneau
      .locator('li')
      .filter({ has: page.getByRole('button', { name: 'Déjà exploré hors outil…' }) })
      .first();
    // Le LIBELLÉ de la ligne, relevé avant le geste : c'est la seule ancre
    // stable. Retrouver la ligne par son bouton « Déjà exploré hors outil… »
    // ne marche qu'AVANT la déclaration — le geste remplace ce bouton par
    // « Corriger la date du bilan… », donc le prédicat désigne ensuite une
    // AUTRE ligne, non déclarée (constat du CI). Un repère consommé par
    // l'action qu'il sert à observer ne prouve rien.
    const libelleLigne = (await premiereLigne.locator('p').first().innerText()).trim();
    const statutAvant = (await premiereLigne.getByText(
      /Recommandé|À répéter|Conditionnel|Optionnel|Déjà documenté|Non indiqué actuellement/,
    ).first().innerText()).trim();

    // Point 2 — la déclaration d'un bilan déjà réalisé hors outil. Aucun
    // résultat n'est demandé ni conservé : seule la DATE est saisie.
    await declarations.first().click();
    await panneau
      .getByLabel(/Date du bilan/)
      .fill(DATE_BILAN_BIO_E2E.toISOString().slice(0, 10));
    await panneau.getByRole('button', { name: 'Consigner la déclaration' }).click();

    await expect(
      panneau.getByText('Déclaration consignée : la proposition a été recalculée'),
    ).toBeVisible();

    // CE QUI CHANGE N'EST PAS LE STATUT, et le CI l'a démontré : la première
    // ligne est restée « Conditionnel ». C'est le code qui a raison — un panel
    // en mode `conditionnel` s'affiche TOUJOURS `conditionnel`, « déclencheur
    // rempli ou non » (`indicationsBiologieV1.ts`, [[D-059]] §5). Exiger un
    // changement de statut demandait au moteur de contredire sa doctrine.
    //
    // Ce que la déclaration change réellement et visiblement : la ligne SAIT
    // qu'elle est documentée, et le geste devient une CORRECTION. C'est cela
    // qu'on éprouve — avec le statut d'avant dans le message, pour qu'un
    // futur écart se lise sans relire le moteur.
    // Le formulaire RESTE OUVERT après une consignation réussie : `setOuvert`
    // ne repasse à faux que par « Annuler » (`PropositionBilanPanel`). Tant
    // qu'il est ouvert, la ligne ne rend NI « Déjà exploré hors outil… » NI
    // « Corriger la date du bilan… » — les deux sont l'affichage replié. Il
    // faut donc replier avant d'observer. Comportement existant, hors
    // périmètre de ce lot : noté, pas corrigé.
    await panneau.getByRole('button', { name: 'Annuler' }).click();

    const ligneDeclaree = panneau.locator('li').filter({ hasText: libelleLigne }).first();
    await expect(
      ligneDeclaree.getByRole('button', { name: 'Corriger la date du bilan…' }),
      `la ligne « ${libelleLigne} » (statut « ${statutAvant} ») ne porte pas le geste `
        + `de correction : la déclaration n'a pas été rattachée à ce panel`,
    ).toBeVisible();
  });

  test('le courrier s’établit, son texte est rendu pour transcription, et rien n’est envoyé', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    await page.goto(`/dashboard/patients/${PATIENT_ID}`);
    // Depuis `D-118`, la confirmation du test 1 a PERSISTÉ l'épisode : ce
    // chargement-ci le rejoue — le helper le constate au rail et ne reclique
    // rien. La fiche ouvre alors d'elle-même la phase Actions ; le clic
    // d'onglet ci-dessous reste correct dans les deux états.
    await confirmerEpisodeT0(page);

    await ouvrirSousVueBiologie(page);

    const panneau = page.getByRole('region', { name: 'Biologie — proposition de bilan' });
    await expect(panneau).toBeVisible();

    // Point 3 — le formulaire n'existe que s'il reste quelque chose à
    // proposer : il s'offre sur le même prédicat que le générateur.
    const formulaire = panneau.getByText('Courrier au médecin traitant');
    await expect(formulaire).toBeVisible();

    // Point 4 — l'absence d'envoi n'est pas une lacune du parcours, c'est la
    // propriété à prouver : la surface dit elle-même qu'elle n'envoie rien, et
    // le seul rendu du courrier est un texte à transcrire. Depuis la décision
    // F (D-122), DEUX gestes l'affirment — le courrier ET le document patient :
    // le compte est l'assertion, un des deux qui se tairait ferait rougir ici.
    await expect(panneau.getByText(/Aucun envoi automatique/)).toHaveCount(2);

    // Le geste jumeau du document patient s'offre sur le même prédicat. Il
    // n'est PAS cliqué ici : sa consignation est éprouvée au banc de la route,
    // et un clic E2E laisserait une ligne append-only sans nettoyage dédié.
    await expect(panneau.getByText('Document remis au patient')).toBeVisible();
    await expect(
      panneau.getByRole('button', { name: 'Établir et consigner le document patient' }),
    ).toBeVisible();

    // Le destinataire est la MARQUE de la lettre : le nettoyage ne supprime
    // que celle-ci, jamais toutes les correspondances sortantes du dossier.
    await panneau.getByLabel('Nom du médecin destinataire').fill(MEDECIN_BIO_E2E);
    const bouton = panneau.getByRole('button', { name: 'Établir et consigner le courrier' });
    await bouton.click();

    await expect(panneau.getByText(/Courrier consigné au dossier/)).toBeVisible();
    // `toHaveValue`, pas `not.toBeEmpty()` : le texte d'un `<textarea>` piloté
    // par React vit dans sa VALEUR, pas dans ses enfants DOM — l'assertion
    // naïve rougirait sur un courrier pourtant rendu.
    const texte = panneau.getByLabel('Texte du courrier à transcrire');
    await expect(texte).toBeVisible();
    await expect(texte).toHaveValue(/\S/);

    // Point 5 — une seconde consignation au MÊME destinataire est refusée.
    // Le verrou est côté écran (la campagne le nomme : deux onglets peuvent
    // encore établir deux lettres) : c'est bien le bouton qu'il faut éprouver,
    // aucune garde serveur ne rendrait 409 ici.
    await expect(bouton).toBeDisabled();
  });

  test('le fil de correspondance porte le verdict d’ancrage de la lettre', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    await page.goto(`/dashboard/patients/${PATIENT_ID}`);
    await page.getByRole('tab', { name: 'Correspondance' }).click();

    // Point 6 — la raison de la dépendance au LOT-01 : la lettre qui vient
    // d'être établie porte l'ancre de la table courante, donc « concordant ».
    // Une lettre sans ancre ne dirait RIEN (DC-24) — c'est ce silence-là que
    // le verdict ne doit pas confondre avec une péremption.
    await expect(page.getByText(/ancrage concordant/).first()).toBeVisible();
  });
});
