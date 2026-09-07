// Spirale PEUPLÉE en vrai navigateur (SP-TRAJ LOT-06 — dette du LOT-01) :
// arcs cliquables, arc ≡ bouton texte, suture time-travel pilotée par un arc.
// Patient fictif Michel Dogné (PAT_SEED_03) : un épisode T0 confirmé est
// provisionné en base puis nettoyé — aucun autre spec ne lit ses épisodes.
// Mode sériel : l'épisode est un état partagé entre les deux tests du fichier.
import { test, expect } from '@playwright/test';
import { praticienSessionCookie } from './helpers/auth';
import { provisionEpisodeTrajectoire, cleanupEpisodeTrajectoire } from './helpers/db';

const PATIENT_ID = 'PAT_SEED_03';

test.describe.configure({ mode: 'serial' });

test.describe('Fiche-trajectoire peuplée (Spirale navigable)', () => {
  test.beforeAll(async () => {
    await provisionEpisodeTrajectoire(PATIENT_ID);
  });

  test.afterAll(async () => {
    await cleanupEpisodeTrajectoire();
  });

  test('la Spirale rend un arc par repère, et l’arc pilote la même relecture datée que le bouton texte', async ({
    page,
    context,
  }) => {
    await context.addCookies([await praticienSessionCookie()]);
    await page.goto(`/dashboard/patients/${PATIENT_ID}?onglet=trajectoire`);

    const panneau = page.getByRole('region', { name: 'Fiche-trajectoire' });
    await expect(panneau).toBeVisible();

    // En-tête d'identité : l'épisode est affirmé parce qu'il existe.
    await expect(panneau.getByRole('heading', { name: 'Michel Dogné — épisode 1' })).toBeVisible();
    await expect(panneau.getByText('Épisode 1 · T0 le 01/06/2026')).toBeVisible();

    // La Spirale existe et porte un arc-bouton par repère + « Aujourd'hui ».
    const spirale = panneau.getByRole('group', { name: /Spirale de trajectoire : 1 repère confirmé/ });
    await expect(spirale).toBeVisible();
    const arc = spirale.getByRole('button', { name: 'Jalon T0 du 01/06/2026 — épisode 1' });
    await expect(arc).toBeVisible();

    // Cliquer l'arc sélectionne le repère : le bouton texte reflète le même
    // état (une seule sélection, pas deux navigations) et la relecture datée
    // se monte (mécanique asOf, lecture seule).
    //
    // Position explicite, comme pour l'arc « Aujourd'hui » plus bas. Le clic
    // automatisé vise le centre de la boîte de l'arc, c'est-à-dire le centre
    // de la Spirale — or `epaisseurCible = max(épaisseur, espacement)` ne fait
    // atteindre ce centre à la bande intérieure QUE lorsqu'il y a exactement
    // un repère (espacement 32, bande [0, 32]). Dès deux repères la bande
    // devient [8, 24] ou plus étroite et le centre ne touche plus aucun arc :
    // le test tomberait pour la seule raison que la fixture a grandi.
    // Vérifié au navigateur (Chromium et WebKit iPhone 13) sur 1 à 4 repères.
    // On vise donc le haut du trait T0 : x = 86 (milieu), y = (60−16)×172/120.
    await spirale.click({ position: { x: 86, y: 63 } });
    await expect(panneau.getByRole('button', { name: 'T0 · 01/06/2026' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Vous lisez l’état du 01\/06\/2026/)).toBeVisible();

    // Une seule sortie, explicite.
    await page.getByRole('button', { name: 'Retour au présent' }).click();
    await expect(page.getByText(/Vous lisez l’état du/)).toHaveCount(0);

    // Pas de défilement horizontal.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
  });

  test('l’arc « Aujourd’hui » ramène au présent, au clavier comme au clic', async ({ page, context }) => {
    await context.addCookies([await praticienSessionCookie()]);
    await page.goto(`/dashboard/patients/${PATIENT_ID}?onglet=trajectoire`);

    const panneau = page.getByRole('region', { name: 'Fiche-trajectoire' });
    const spirale = panneau.getByRole('group', { name: /Spirale de trajectoire/ });
    await expect(spirale).toBeVisible();

    // Sélection au CLAVIER sur l'arc (Entrée), puis retour au présent par
    // l'arc « Aujourd'hui ».
    const arc = spirale.getByRole('button', { name: 'Jalon T0 du 01/06/2026 — épisode 1' });
    await arc.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Vous lisez l’état du 01\/06\/2026/)).toBeVisible();

    // Position explicite : le clic automatisé vise le CENTRE de l'élément,
    // or le centre du cercle « Aujourd'hui » (anneau extérieur, r=48 dans un
    // viewBox 120 rendu à 172 px) tombe dans la bande de l'anneau intérieur.
    // On vise le haut de son trait : x = 86 (milieu), y ≈ (60−48)×172/120.
    //
    // Le repère est celui du SVG, pas celui du bouton : la boîte d'un cercle
    // exclut son trait, donc la même coordonnée rapportée au bouton glisse
    // vers l'intérieur et touche un arc PASSÉ dès le deuxième repère —
    // l'inverse de ce que ce test affirme. Vérifié au navigateur (Chromium et
    // WebKit iPhone 13) sur 1 à 4 repères.
    await spirale.click({ position: { x: 86, y: 17 } });
    await expect(page.getByText(/Vous lisez l’état du/)).toHaveCount(0);
  });
});
