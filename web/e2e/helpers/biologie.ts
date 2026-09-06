// Gestes partagés par les parcours du rayon biologie.
//
// Extraits de `biologie-proposition-courrier.spec.ts` quand un second parcours
// (`biologie-document-patient.spec.ts`) a eu besoin des mêmes : deux copies
// d'une logique aussi subtile que `confirmerEpisodeT0` auraient divergé au
// premier changement de l'écran.
import { expect, type Page } from '@playwright/test';

/**
 * LE GESTE QUI OUVRE TOUT — et que le cadrage avait manqué.
 *
 * Le panneau de proposition n'est monté que sur un runtime `ready`. Depuis
 * `D-118`, ce `ready` a DEUX origines légitimes, et ce helper accepte les
 * deux :
 *
 *  - la CONFIRMATION — le bouton, cliqué ici, sur la première traversée du
 *    dossier : le POST persiste alors l'épisode ;
 *  - le REJEU — au chargement suivant, le GET rejoue l'épisode persisté et le
 *    bandeau « Épisode T0 confirmé » s'affiche sans redemander le geste.
 *    C'est le comportement que `D-118` installe : un test qui exigerait le
 *    bouton à chaque page exigerait le défaut que la décision vient de fermer.
 *
 * L'ATTENTE RESTE EXPLICITE, jamais un `isVisible()` conditionnel sur
 * l'instant : on attend que L'UN des deux états soit rendu — le cockpit a pu
 * ne pas finir son aller-retour —, puis on ne clique que si c'est le bouton.
 *
 * Le bouton, quand c'est lui, doit être ACTIF : désactivé, il dit que la
 * fixture ne satisfait pas les préconditions dures (rideau cotable, anamnèse
 * consignée, synthèse validée postérieure au rideau), et la checklist
 * affichée nomme laquelle.
 */
export async function confirmerEpisodeT0(page: Page): Promise<void> {
  const confirmerT0 = page.getByRole('button', { name: 'Confirmer l’épisode T0' });
  // LE SIGNAL DU REJEU EST LE RAIL, PAS LE BANDEAU. Sur un épisode rejoué, la
  // fiche n'ouvre plus la phase Décision — elle n'est plus « exigible » — et le
  // bandeau « Épisode T0 confirmé », filtré par phase affichée, peut être monté
  // hors écran. L'onglet du rail, lui, est visible quelle que soit la phase, et
  // son libellé « renseignée » dérive de la base (trajectoire) depuis `D-118`.
  const railRenseigne = page.getByRole('tab', { name: 'Décision 21 j renseignée' });
  await expect(confirmerT0.or(railRenseigne).first()).toBeVisible();
  if ((await railRenseigne.count()) > 0) return;
  await expect(
    confirmerT0,
    'le bouton de confirmation T0 est désactivé : une précondition dure manque '
      + 'à la fixture (rideau, anamnèse ou synthèse) — la checklist à l’écran dit laquelle',
  ).toBeEnabled();
  await confirmerT0.click();
}

/**
 * Ouvre la sous-vue « Biologie » de la phase Actions.
 *
 * Deux clics, et le premier n'est pas décoratif : la vérification que la phase
 * Actions s'affiche bien évite qu'une absence de panneau plus bas passe pour un
 * défaut de biologie alors qu'elle ne dirait que la navigation. Depuis l'audit
 * du 2026-09-02, la phase se structure en sous-vues et la biologie vit sous la
 * sienne.
 */
export async function ouvrirSousVueBiologie(page: Page): Promise<void> {
  await page
    .getByRole('tablist', { name: 'Cycle clinique' })
    .getByRole('tab', { name: /Actions/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Protocole 21 jours' })).toBeVisible();
  await page
    .getByRole('group', { name: 'Sections de la phase Actions' })
    .getByRole('button', { name: 'Biologie' })
    .click();
}
