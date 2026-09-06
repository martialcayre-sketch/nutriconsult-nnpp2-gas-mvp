'use client';

import type { ReactElement, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

// LA PRIMITIVE DE SUPERPOSITION — audit du cockpit 2026-09-02, lot 2.
//
// Onze fichiers recâblaient chacun Radix Dialog à la main : mêmes classes
// d'overlay, même correctif `data-theme` (Radix portale HORS du
// `[data-theme="praticien"]` posé par dashboard/layout.tsx — sans le
// re-poser sur l'overlay ET le contenu, le panneau s'affiche aux couleurs du
// thème portail), même bouton de fermeture. Trois « peaux » avaient déjà été
// éprouvées en production, jamais factorisées :
//   - `tiroir`  : panneau latéral droit plein écran (les Instruments du
//                 cockpit, repris de PatientPreview) ;
//   - `modale`  : boîte centrée (DossierConfirmDialog,
//                 AnnulationAssignationDialog) ;
//   - `feuille` : panneau glissant depuis le bas (nav mobile « Plus »).
//
// Ce composant ne porte AUCUN contenu clinique — le contenu est fourni par
// l'appelant, comme TwoLevelReading. La densité s'ouvre AU CLIC (jamais au
// survol) puis se referme : c'est le patron A6-R1 (« la densité ne s'empile
// plus dans la page »), désormais réutilisable partout.

type Variante = 'tiroir' | 'modale' | 'feuille';

/**
 * Les trois largeurs de tiroir RÉELLEMENT en usage — relevées, pas inventées.
 *
 * - `focale` : 440 px sur grand écran. La zone focale du cockpit (les
 *   Instruments de la fiche), pensée pour se lire à côté du dossier.
 * - `standard` : `max-w-xl`. Ce que les QUATRE tiroirs de formulaire ont choisi
 *   chacun de leur côté — Bibliothèque, Patients, rayon biologie, rayon
 *   compléments. La primitive ne le proposait pas : elle offrait 440 px ou
 *   `max-w-2xl`, et aucun des quatre n'aurait migré sans changer de largeur.
 *   L'unanimité de l'existant fait loi ici, pas la préférence de la primitive.
 * - `large` : `max-w-2xl`, pour les tableaux denses.
 *
 * MIGRER À APPARENCE CONSTANTE est la règle du lot : un lot de convergence
 * retire de la duplication, il ne redessine pas des écrans au passage. Sans
 * cette troisième valeur, l'adoption de la primitive aurait déplacé quatre
 * panneaux sans que personne l'ait demandé.
 */
type LargeurTiroir = 'focale' | 'standard' | 'large';

const CLASSES_LARGEUR: Record<LargeurTiroir, string> = {
  focale: 'lg:w-[min(440px,86%)] lg:max-w-none max-w-2xl',
  standard: 'max-w-xl',
  large: 'max-w-2xl',
};

const CLASSES_CONTENU: Record<Variante, string> = {
  tiroir:
    'fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l border-border bg-surface px-[22px] py-5 shadow-pop focus:outline-none',
  modale:
    'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl focus:outline-none',
  feuille:
    'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] w-full overflow-y-auto rounded-t-[1.5rem] border-t border-border bg-surface p-5 shadow-pop focus:outline-none',
};

/**
 * L'univers dont le panneau emprunte les couleurs.
 *
 * TYPÉ, ET PLUS `string`. Radix portale vers `document.body` : la valeur est
 * re-posée sur l'overlay ET le contenu, faute de quoi le panneau retombe sur
 * les tokens par défaut de `globals.css` — qui sont ceux du PORTAIL PATIENT.
 * C'est exactement le bug corrigé le 2026-09-03 sur les deux dialogues de
 * confirmation du cockpit : l'écran d'effacement définitif d'un dossier
 * s'affichait aux couleurs du patient.
 *
 * Le défaut reste `praticien` — la primitive est née dans le cockpit et neuf de
 * ses dix appelants y vivent. Une surface PATIENT doit donc passer
 * `theme="patient"` explicitement ; `PanneauSuperpose.guard.test.ts` refuse
 * qu'elle l'oublie, parce que l'oubli est silencieux et visible du patient.
 */
type ThemePanneau = 'praticien' | 'patient';

export function PanneauSuperpose({
  declencheur,
  titre,
  description,
  surtitre,
  descriptionMasquee = false,
  variante = 'tiroir',
  largeur = 'focale',
  theme = 'praticien',
  open,
  onOpenChange,
  children,
}: {
  /**
   * L'élément qui ouvre le panneau (rendu tel quel, `Trigger asChild`).
   *
   * FACULTATIF : un panneau piloté par son parent (`open`/`onOpenChange`) n'a
   * pas de déclencheur à lui — le bouton vit ailleurs, souvent dans une ligne
   * de liste ou un menu d'actions. Sans cette faculté, les dialogues de
   * confirmation ne pouvaient pas adopter la primitive : Radix rendait un
   * `Trigger` vide qu'aucun geste n'atteignait.
   */
  declencheur?: ReactElement;
  titre: string;
  /** Toujours fournie : Radix l'exige pour l'accessibilité du dialogue. */
  description: string;
  /**
   * Sort la description de la VUE, jamais du DOM : Radix la réclame pour
   * `aria-describedby`, et un lecteur d'écran l'annonce toujours.
   *
   * Deux tiroirs de `PatientsPanel` — « Nouveau patient », « Nouvelle
   * assignation » — n'ont pas de sous-titre à montrer : leur titre dit déjà
   * tout, et leur implémentation locale repliait la description en `sr-only`.
   * Sans cette faculté, les migrer aurait demandé d'INVENTER deux phrases pour
   * l'écran — c'est-à-dire d'ajouter du texte au nom d'un lot qui existe pour
   * en retirer.
   */
  descriptionMasquee?: boolean;
  /** Petit sur-titre en capitales au-dessus du titre (ex. « Instrument »). */
  surtitre?: string;
  variante?: Variante;
  /** `tiroir` seulement — voir `LargeurTiroir`. */
  largeur?: LargeurTiroir;
  /** Valeur `data-theme` re-posée sur le portail Radix. */
  theme?: ThemePanneau;
  open?: boolean;
  onOpenChange?: (ouvert: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {declencheur ? <Dialog.Trigger asChild>{declencheur}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay data-theme={theme} className="fixed inset-0 z-50 bg-foreground/35" />
        <Dialog.Content
          data-theme={theme}
          className={`${CLASSES_CONTENU[variante]}${variante === 'tiroir' ? ` ${CLASSES_LARGEUR[largeur]}` : ''}`}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {surtitre && (
                <p className="text-xs font-semibold uppercase tracking-[.06em] text-solar-ink">{surtitre}</p>
              )}
              <Dialog.Title className="font-display text-lg font-bold text-foreground">{titre}</Dialog.Title>
              <Dialog.Description
                className={descriptionMasquee ? 'sr-only' : 'mt-1 text-sm text-muted-foreground'}
              >
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={`Fermer ${titre}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <X aria-hidden="true" size={20} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
