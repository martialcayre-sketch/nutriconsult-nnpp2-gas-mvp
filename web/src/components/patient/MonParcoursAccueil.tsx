import { patientButtonClassName } from '@/components/patient/ui/PatientButton';
import { PatientCard } from '@/components/patient/ui/PatientCard';
import { evaluerReprise, phraseReprise } from '@/lib/patient/reprise';

/*
 * Accueil « Mon parcours » (SP-SPI / LOT-01).
 *
 * Ce bloc porte l'étape du moment — UNE seule chose mise en avant. C'est la
 * réponse à l'écart E11 de l'audit 5.0 : la page d'atterrissage empilait une
 * dizaine de blocs autonomes, contre le principe A6-R1 « une étape à la fois
 * (séquentiel, pas de hub empilé) » côté patient.
 *
 * Le nom : « Mon parcours », et non « Ma spirale » — « Ma spirale
 * alimentaire » désigne déjà le journal alimentaire (lib/food-observation/
 * labels.ts). Deux « spirale » sur la même surface auraient été ambigus.
 *
 * Interdits tenus ici : aucun score chiffré, aucun pourcentage, aucune
 * gamification, aucun pronostic, aucun compte à rebours. Un statut n'est
 * jamais porté par la seule couleur — chaque état porte sa phrase.
 */

export type EtapeDuMoment =
  // `appui` : une phrase FACTUELLE sous le bouton (« 5 nuits notées sur 21 »).
  // Jamais un compte à rebours, jamais un reproche — cf. lib/agenda-sommeil/
  // rappelPortail.ts, qui la produit et dont le banc tient le vocabulaire.
  | { kind: 'action'; idAssignation: string; cta: string; appui?: string }
  | { kind: 'attente'; texte: string }
  | { kind: 'stable' }
  | { kind: 'vide' };

export type MonParcoursAccueilProps = {
  token: string;
  prenom: string | null;
  /** Dernière réponse transmise (ISO), `null` si le patient n'a jamais répondu. */
  derniereReponseLe: string | null;
  etape: EtapeDuMoment;
  /** Injectable pour les tests ; par défaut l'instant courant. */
  maintenant?: Date;
};

export function MonParcoursAccueil({
  token,
  prenom,
  derniereReponseLe,
  etape,
  maintenant,
}: MonParcoursAccueilProps) {
  const reprise = evaluerReprise(derniereReponseLe, maintenant ?? new Date());

  return (
    <PatientCard padding="lg" className="border-primary/30">
      <h1 className="font-display text-2xl font-bold leading-tight text-foreground">Mon parcours</h1>
      <p className="mt-1 text-base text-muted-foreground">
        {prenom ? `Bonjour ${prenom}.` : 'Bonjour.'}
      </p>

      {/*
        La reprise passe AVANT l'étape du moment : quelqu'un qui revient après
        des mois a d'abord besoin d'être accueilli, pas mis au travail.
      */}
      {reprise.enReprise && (
        <p className="mt-4 text-base text-foreground">{phraseReprise(reprise.moisEcoules)}</p>
      )}

      <div className="mt-5 border-t border-border pt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {reprise.enReprise ? 'Pour reprendre' : 'Votre étape du moment'}
        </p>

        {etape.kind === 'action' && (
          <>
            <a
              href={`/portail/${token}/questionnaires/${etape.idAssignation}`}
              className={`inline-flex items-center justify-center ${patientButtonClassName('primary')}`}
            >
              {etape.cta}
            </a>
            {etape.appui && <p className="mt-2 text-sm text-foreground">{etape.appui}</p>}
            {/* La garde de verrouillage ne vaut QUE pour une transmission :
                noter une nuit ne transmet ni ne verrouille rien, et l'écrire
                là ferait différer une saisie quotidienne par prudence. */}
            {!etape.appui && (
              <p className="mt-2 text-xs text-muted-foreground">
                Une fois transmis, un questionnaire est verrouillé et votre praticien en est informé.
              </p>
            )}
          </>
        )}

        {/*
          Une correction demandée n'est PAS un appel à l'action : le patient ne
          peut rien faire tant que le praticien ne l'a pas déverrouillée. On
          l'énonce, on ne la met pas en bouton.
        */}
        {etape.kind === 'attente' && <p className="text-base text-muted-foreground">{etape.texte}</p>}

        {etape.kind === 'stable' && (
          <p className="text-base text-muted-foreground">
            Vous avez transmis tout ce qui vous était demandé. Votre praticien vous recontactera pour la suite.
          </p>
        )}

        {etape.kind === 'vide' && (
          <p className="text-base text-muted-foreground">
            Aucun questionnaire pour le moment. Votre praticien les mettra à disposition prochainement.
          </p>
        )}
      </div>
    </PatientCard>
  );
}
