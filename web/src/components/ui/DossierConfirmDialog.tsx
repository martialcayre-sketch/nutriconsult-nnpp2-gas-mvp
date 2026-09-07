'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// Confirmations de fin de parcours — campagne IDP2, LOT-01b.
//
// DEUX INTENSITÉS, PARCE QUE LES CONSÉQUENCES SONT ASYMÉTRIQUES :
//
// - `cloture` — réversible. On énonce ce qui s'arrête et ce qui reste, et on
//   demande un clic.
// - `effacement` — irréversible. On NOMME le patient, on liste ce qui est
//   détruit ET ce qui subsiste, et on exige un geste qu'un clic distrait ne
//   produit pas : la saisie du mot `EFFACER`.
//
// CE MOT N'EST PAS UN GARDE INVENTÉ POUR L'ÉCRAN. C'est exactement la valeur
// que la route exige déjà dans son corps (`api/praticien/patients/
// cycle-de-vie/route.ts`). L'interface reflète le contrat serveur au lieu d'en
// créer un second, qui aurait divergé.

export type ModeConfirmation =
  | 'cloture'
  | 'reprise'
  | 'effacement'
  | 'desactivation'
  | 'reactivation'
  | 'revocation'
  | 'retablissement';

const CONFIRMATION_EFFACEMENT = 'EFFACER';

/** Reflète l'ordre de suppression de `lib/patient/effacement.ts`. */
const DETRUIT = [
  'ses réponses aux questionnaires et les scores associés',
  'les synthèses, protocoles, check-ins et notes de relecture',
  'les consultations et les documents qui lui ont été envoyés',
  'ses accès au portail, liens compris',
  'ses coordonnées : nom, prénom, e-mail, téléphone, date de naissance',
];

/** Reflète `residuEffacement` dans `lib/patient/cycleDeVie.ts`. */
const SUBSISTE = [
  'une ligne anonyme : l’année de naissance et les trois premières lettres du nom',
];

const ABSENT_DU_RESIDU =
  'Ni prénom, ni e-mail — pas même sous forme d’empreinte —, ni identifiant, ni lien vers le dossier.';

export function DossierConfirmDialog({
  mode,
  nomPatient,
  accesActif = true,
  open,
  onOpenChange,
  onConfirm,
  enCours = false,
  erreur = null,
}: {
  mode: ModeConfirmation;
  /** Affiché tel quel : la confirmation doit désigner un dossier, pas « ce patient ». */
  nomPatient: string;
  /**
   * `false` quand le dossier est désactivé. La clôture ne peut alors pas
   * promettre au praticien que « le patient conserve l'accès en lecture » : le
   * portail le refuse déjà.
   */
  accesActif?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reçoit la saisie réelle, et non une constante : voir le champ plus bas. */
  onConfirm: (confirmation: string) => void;
  enCours?: boolean;
  /**
   * Un échec DOIT être dit ici. Radix pose un voile et `aria-hidden` sur le
   * reste du document : un message rendu ailleurs dans la page serait derrière
   * l'overlay, souvent hors du viewport, et muet pour un lecteur d'écran.
   */
  erreur?: string | null;
}) {
  const [saisie, setSaisie] = useState('');

  // Un dialogue rouvert repart d'un champ vide : sans cela, une confirmation
  // annulée laisserait `EFFACER` en place et le second passage ne demanderait
  // plus rien.
  useEffect(() => {
    if (!open) setSaisie('');
  }, [open]);

  const estEffacement = mode === 'effacement';
  const confirmationValide = !estEffacement || saisie === CONFIRMATION_EFFACEMENT;

  const TITRES: Record<ModeConfirmation, string> = {
    effacement: `Effacer définitivement le dossier de ${nomPatient} ?`,
    cloture: `Clôturer le suivi de ${nomPatient} ?`,
    reprise: `Rouvrir le suivi de ${nomPatient} ?`,
    desactivation: `Désactiver le dossier de ${nomPatient} ?`,
    reactivation: `Réactiver le dossier de ${nomPatient} ?`,
    revocation: `Révoquer l’accès de ${nomPatient} au portail ?`,
    retablissement: `Rétablir l’accès de ${nomPatient} au portail ?`,
  };
  const LIBELLES: Record<ModeConfirmation, string> = {
    effacement: 'Effacer définitivement',
    cloture: 'Clôturer le suivi',
    reprise: 'Rouvrir le suivi',
    desactivation: 'Désactiver le dossier',
    reactivation: 'Réactiver le dossier',
    revocation: 'Révoquer l’accès',
    retablissement: 'Rétablir l’accès',
  };
  const titre = TITRES[mode];
  const libelleConfirmer = LIBELLES[mode];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* data-theme requis : Radix portale vers document.body, hors du
            conteneur [data-theme="praticien"] du layout. */}
        <Dialog.Overlay data-theme="praticien" className="fixed inset-0 z-50 bg-foreground/35" />
        <Dialog.Content
          data-theme="praticien"
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="text-base font-semibold text-foreground">
            {titre}
          </Dialog.Title>

          {mode === 'cloture' && (
            <Dialog.Description asChild>
              <div className="mt-4 text-sm leading-relaxed text-foreground">
                <p>
                  Plus aucun questionnaire ne lui sera assigné et plus aucun document de
                  suivi ne lui sera envoyé.
                </p>
                <p className="mt-2">
                  {accesActif
                    ? 'Le dossier reste en place et le patient conserve l’accès en lecture à ses archives : vous pourrez toujours lui renvoyer son lien d’accès. Vous pouvez rouvrir le suivi à tout moment.'
                    : 'Le dossier reste en place, mais il est désactivé : le patient n’a plus accès à son espace. Réactivez le dossier pour lui rendre la lecture de ses archives.'}
                </p>
              </div>
            </Dialog.Description>
          )}

          {mode === 'reprise' && (
            <Dialog.Description className="mt-4 text-sm leading-relaxed text-foreground">
              Les assignations de questionnaires et les envois de documents redeviennent
              possibles pour ce dossier.
            </Dialog.Description>
          )}

          {mode === 'desactivation' && (
            <Dialog.Description className="mt-4 text-sm leading-relaxed text-foreground">
              Le patient perdra l’accès à son espace : ses liens cesseront de fonctionner et
              une nouvelle demande de lien lui sera refusée. Les données sont conservées et
              vous pouvez réactiver le dossier à tout moment — mais un lien à usage unique
              déjà envoyé ne redeviendra pas valable : il faudra lui en réémettre un.
            </Dialog.Description>
          )}

          {/*
            Ce que la révocation coupe a changé au LOT-02b : elle ne fermait
            qu'un jeton, elle interrompt désormais une session en cours. Le
            praticien doit le savoir avant de cliquer — un patient au milieu
            d'un questionnaire perd sa place.
          */}
          {mode === 'revocation' && (
            <Dialog.Description asChild>
              <div className="mt-4 text-sm leading-relaxed text-foreground">
                <p>Trois choses cessent immédiatement :</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  <li>son lien d’accès au portail ne fonctionne plus ;</li>
                  <li>
                    sa session en cours est coupée — s’il est en train de répondre à un
                    questionnaire, il perd sa place ;
                  </li>
                  <li>les liens à usage unique déjà envoyés deviennent inutilisables.</li>
                </ul>
                <p className="mt-2">
                  Vous pourrez lui rouvrir l’accès en lui renvoyant un lien. Cela ne rendra
                  pas les sessions coupées : il devra se reconnecter.
                </p>
              </div>
            </Dialog.Description>
          )}

          {/*
            Le pendant exact de la révocation ci-dessus, et il ne naît PAS d'un
            geste dédié : il s'interpose devant deux gestes qui levaient la
            révocation en passant — créer une consultation, renvoyer le lien.
            Il doit donc dire ce que le praticien croyait faire ET ce qu'il
            ferait en plus.
          */}
          {mode === 'retablissement' && (
            <Dialog.Description asChild>
              <div className="mt-4 text-sm leading-relaxed text-foreground">
                <p>Son accès au portail est révoqué. Poursuivre le rétablira.</p>
                <p className="mt-2">
                  Il pourra de nouveau entrer dans son espace et y lire ses archives. Ce
                  que le rétablissement ne défait pas : les sessions coupées par la
                  révocation ne reviennent pas — il devra se reconnecter —, et les liens à
                  usage unique fermés alors restent inutilisables.
                </p>
                <p className="mt-2">
                  Pour garder l’accès fermé, annulez : ni consultation ni e-mail ne
                  partiront.
                </p>
              </div>
            </Dialog.Description>
          )}

          {mode === 'reactivation' && (
            <Dialog.Description className="mt-4 text-sm leading-relaxed text-foreground">
              Le patient retrouvera l’accès à son espace. Un lien à usage unique envoyé
              avant la désactivation reste inutilisable : renvoyez-lui un lien.
            </Dialog.Description>
          )}

          {estEffacement && (
            <>
              <Dialog.Description className="mt-4 text-sm font-medium text-foreground">
                Cette action est irréversible. Aucune restauration n’est possible.
              </Dialog.Description>

              <div className="mt-4 space-y-4 text-sm text-foreground">
                <section>
                  <h3 className="font-semibold">Ce qui est détruit</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {DETRUIT.map(ligne => (
                      <li key={ligne}>{ligne}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold">Ce qui subsiste</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {SUBSISTE.map(ligne => (
                      <li key={ligne}>{ligne}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">{ABSENT_DU_RESIDU}</p>
                </section>
              </div>

              <label className="mt-5 block text-sm text-foreground" htmlFor="confirmation-effacement">
                Pour confirmer, saisissez <span className="font-semibold">EFFACER</span> :
              </label>
              <Input
                id="confirmation-effacement"
                className="mt-1 w-full"
                value={saisie}
                onChange={e => setSaisie(e.target.value)}
                autoComplete="off"
                placeholder="EFFACER"
              />
            </>
          )}

          {erreur && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger"
            >
              {erreur}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enCours}>
              Annuler
            </Button>
            <Button
              variant={estEffacement ? 'danger' : 'primary'}
              onClick={() => onConfirm(saisie)}
              disabled={!confirmationValide || enCours}
            >
              {enCours ? 'En cours…' : libelleConfirmer}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
