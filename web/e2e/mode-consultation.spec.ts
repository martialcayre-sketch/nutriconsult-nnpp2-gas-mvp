// Mécanisme ModeConsultation (HC-F LOT-03) : enveloppe de bascule de mise en
// page sur la fiche patient, sans logique clinique propre. Patient fictif
// Sophie Nicola (PAT_SEED_01, déjà seedé — pas besoin d'un parcours complet).
import { test, expect } from '@playwright/test';
import { praticienSessionCookie } from './helpers/auth';

const PATIENT_ID = 'PAT_SEED_01';

test.describe('Mode consultation (fiche patient)', () => {
  test('affiche le cockpit prudent avant les couvertures sur bureau, tablette et mobile', async ({ page, context }) => {
    await context.addCookies([await praticienSessionCookie()]);
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 900, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/dashboard/patients/${PATIENT_ID}`);

      // Poste de pilotage (A6-R1) : une phase à la fois via le rail du cycle
      // clinique. Les états prudents (aucune donnée qualifiée, aucune décision,
      // aucun protocole) sont désormais répartis par phase, non plus empilés
      // dans un défilement unique — on les vérifie phase par phase.
      const rail = page.getByRole('tablist', { name: 'Cycle clinique' });
      await expect(rail).toBeVisible();

      // Décision (phase par défaut) : décision clinique non préparée.
      await expect(page.getByRole('heading', { name: 'Priorité et limites' })).toBeVisible();
      await expect(page.getByText('Décision clinique non préparée')).toBeVisible();

      // Données : données manquantes non évaluées tant que rien n'est qualifié.
      await rail.getByRole('tab', { name: /Données fiables/ }).click();
      await expect(page.getByRole('heading', { name: 'Données manquantes' })).toBeVisible();

      // Actions : protocole et clôture indisponibles (aucune priorité sélectionnée).
      await rail.getByRole('tab', { name: /Actions/ }).click();
      await expect(page.getByRole('heading', { name: 'Protocole 21 jours' })).toBeVisible();
      await expect(page.getByText('Protocole indisponible — priorité praticien non sélectionnée')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Clôture et aperçu patient' })).toBeVisible();
      await expect(page.getByText(/Aperçu du protocole indisponible/)).toBeVisible();

      // Garde-fou responsive : jamais de défilement horizontal, quel que soit le
      // viewport ; le bouton « Mode consultation » reste une cible tactile ≥ 44px.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const modeButtonBox = await page.getByRole('button', { name: 'Mode consultation' }).boundingBox();
      expect(modeButtonBox?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('bascule la mise en page et revient à l\'état initial', async ({ page, context }) => {
    await context.addCookies([await praticienSessionCookie()]);
    await page.goto(`/dashboard/patients/${PATIENT_ID}`);

    const activer = page.getByRole('button', { name: 'Mode consultation' });
    await expect(activer).toBeVisible();

    const fiche = page.locator('[data-mode-consultation]');
    await expect(fiche).toHaveCount(0);

    const mutatingRequests: string[] = [];
    page.on('request', request => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutatingRequests.push(request.url());
    });
    await activer.focus();
    await page.keyboard.press('Enter');

    const ficheActive = page.locator('[data-mode-consultation="actif"]');
    await expect(ficheActive).toBeVisible();
    await expect(activer).toBeHidden();

    const quitter = page.getByRole('button', { name: 'Quitter' });
    const quitBox = await quitter.boundingBox();
    expect(quitBox?.height).toBeGreaterThanOrEqual(44);
    await quitter.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-mode-consultation]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mode consultation' })).toBeVisible();
    expect(mutatingRequests).toEqual([]);
  });

  // REMPLACE « confirme T0 et maintient le protocole indisponible ». Depuis
  // [[D-052]], le dossier de seed NE PEUT PLUS confirmer un T0 : Sophie Nicola
  // ne porte qu'un instrument du premier rideau (Q_INF_03) et le seed ne crée
  // ni consultation validée ni synthèse. C'est le comportement attendu, et ce
  // parcours l'asserte plutôt que de le contourner.
  //
  // NON-COUVERTURE NOMMÉE : le parcours NOMINAL (rideau complet, synthèse
  // validée, confirmation sans friction) n'a pas d'E2E — le peupler
  // déplacerait le seed partagé par l'orientation, les captures visuelles et
  // le garde de certification. Il est couvert par les bancs de route.
  test('un T0 dont les conditions ne sont pas remplies ne se confirme pas, sur bureau et mobile', async ({ page, context }) => {
    await context.addCookies([await praticienSessionCookie()]);
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/dashboard/patients/${PATIENT_ID}`);
      const confirm = page.getByRole('button', { name: 'Confirmer l’épisode T0' });
      await expect(confirm).toBeVisible();
      // La checklist dit CE QUI MANQUE, et le bouton ne se clique pas.
      await expect(page.getByText('Premier rideau renseigné et cotable')).toBeVisible();
      await expect(page.getByText(/Premier rideau incomplet/)).toBeVisible();
      await expect(confirm).toBeDisabled();
      // Ce qui n'est pas requis AU PREMIER RIDEAU est nommé, plutôt que passé
      // sous silence — et la phrase distingue les deux rideaux (D-158).
      await expect(page.getByText(/pas requis au premier rideau/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });
});
