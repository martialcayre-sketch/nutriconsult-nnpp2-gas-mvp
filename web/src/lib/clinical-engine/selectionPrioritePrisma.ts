import { prisma } from '../prisma';
import { construireChaineC1, type ChaineC1, type EntreeChaineC1 } from './chaineC1';
import type { DecisionPrioritySelection } from './types';

// LECTURE DE LA SÉLECTION PRATICIEN D'UNE PRIORITÉ — [[D-127]].
//
// MODULE À PART, et le motif est structurel, pas esthétique — même séparation
// que `effetsIndesirablesPrisma.ts` / `runtimeFromPrisma.ts` : un module qui
// TRADUIT peut être importé sans `DATABASE_URL`, un module qui LIT ne le peut
// pas. Y poser `import { prisma }` casserait les bancs au chargement, avant
// toute assertion.
//
// LA LECTURE EST PARTAGÉE, et c'est l'autre moitié du motif ([[D-101]]) : le
// cockpit ÉMET la carte, `verifierChaineC1` la RECALCULE, et deux lectures
// divergentes rendraient 409 sur une carte honnête. Une requête recopiée dans
// la route et dans le vérificateur finirait par diverger — c'est la dette
// exacte que `consultationPorteuse.ts` a fermée ailleurs.
//
// CE QUE CETTE LECTURE CHANGE POUR LE CONTRAT. `D-054` arbitrage 5 décrivait la
// sélection comme « le seul champ que le serveur ne peut pas dériver », et les
// deux points de persistance la réinjectaient donc TELLE QUE SOUMISE. Elle se
// dérive désormais, et `D-127` §1bis en tire la conséquence : le vérificateur
// cesse de lire le corps de requête pour ce champ. La comparaison canonique de
// contenu qu'il fait déjà transforme alors toute sélection forgée en refus.

/** Colonnes lues — jamais `selectedByEmail`, qui ne sort pas de la base. */
const CHAMPS = {
  id: true,
  candidateId: true,
  rationale: true,
  selectedAt: true,
  supersedesSelectionId: true,
} as const;

type LigneSelection = {
  id: string;
  candidateId: string;
  rationale: string;
  selectedAt: Date;
  supersedesSelectionId: string | null;
};

/**
 * La tête du fil, ou `null` — la fonction PURE, sans base, pour que le banc
 * puisse l'éprouver sans PostgreSQL.
 *
 * LE FIL EST STRICTEMENT LINÉAIRE PAR CONSTRUCTION ([[D-127]] §3bis) : la garde
 * de racine (unique partielle) et la garde de successeur (unique) rendent la
 * fourche NON REPRÉSENTABLE en base. Cette fonction n'a donc AUCUNE règle de
 * départage à appliquer — et c'est délibéré : élire entre deux sélections
 * concurrentes reviendrait à choisir lequel des deux praticiens a décidé.
 *
 * Ce qui reste possible malgré les gardes, et qui est traité : un fil dont la
 * tête a été effacée (aucune ligne non supplantée) — état qu'aucune route ne
 * produit, mais qui rendrait `undefined` en silence si on prenait `[0]` sans
 * regarder. On rend `null` : « pas de sélection lisible » plutôt qu'une
 * sélection choisie au hasard.
 */
export function teteDuFil(lignes: LigneSelection[]): LigneSelection | null {
  if (lignes.length === 0) return null;
  const supplantees = new Set(
    lignes
      .map(ligne => ligne.supersedesSelectionId)
      .filter((id): id is string => id !== null),
  );
  const tetes = lignes.filter(ligne => !supplantees.has(ligne.id));
  return tetes.length === 1 ? tetes[0] : null;
}

/**
 * La chaîne C1, construite avec la sélection consignée — et SANS elle si l'acte
 * ne tient plus. [[D-127]] §2.
 *
 * LE DÉFAUT QUE CETTE FONCTION FERME, et il n'est pas théorique.
 * `buildDecisionCard` JETTE sur une sélection devenue inapplicable : décision
 * bloquée par un constat de sécurité apparu depuis (`DC-12` retire les
 * candidats), ou candidat dont la règle ne se déclenche plus. Le rejeu du
 * cockpit rattrape cette exception et sert « proposition » — le praticien
 * verrait donc son épisode CONFIRMÉ redevenir un formulaire à confirmer, ce que
 * [[D-118]] a précisément fermé. Persister la sélection sans traiter sa
 * péremption aurait rendu cette régression atteignable.
 *
 * CE QUI EST ÉCARTÉ EST LA SÉLECTION, JAMAIS LA CHAÎNE. Le repli n'est tenté
 * qu'avec une sélection non nulle, et si la construction SANS elle échoue à son
 * tour, l'erreur remonte intacte : le seul cas absorbé est « la chaîne se
 * construit sans la sélection mais pas avec », c'est-à-dire exactement la
 * péremption. Aucune autre panne n'est masquée.
 *
 * PARTAGÉE ENTRE LE COCKPIT ET LE VÉRIFICATEUR, comme la lecture elle-même : un
 * repli fait d'un côté et pas de l'autre rendrait 409 sur une carte honnête
 * ([[D-101]]).
 *
 * `selectionEcartee` dit qu'un acte praticien n'est plus servi. Il est
 * journalisé par l'appelant ; le DIRE à l'écran reste dû ([[D-127]], dettes) —
 * la carte montre déjà qu'aucune priorité n'est retenue, elle n'explique pas
 * encore pourquoi.
 */
export function construireChaineC1Tolerante(
  entree: Omit<EntreeChaineC1, 'selectionPraticien'>,
  selection: DecisionPrioritySelection | null,
): { chaine: ChaineC1; selectionEcartee: boolean } {
  try {
    return {
      chaine: construireChaineC1({ ...entree, selectionPraticien: selection }),
      selectionEcartee: false,
    };
  } catch (erreur) {
    if (selection === null) throw erreur;
    return {
      chaine: construireChaineC1({ ...entree, selectionPraticien: null }),
      selectionEcartee: true,
    };
  }
}

/**
 * La sélection qui fait foi pour cette carte, au contrat C1 — ou `null`.
 *
 * `selectedBy` vaut la CONSTANTE `'practitioner'`, et jamais l'e-mail consigné
 * en base : `buildDecisionCard` refuse toute autre valeur, et c'est ce refus qui
 * interdit de faire passer la proposition du moteur pour la décision d'un
 * praticien. L'e-mail reste dans la ligne — il attribue l'acte — et ne traverse
 * pas un objet haché puis servi hors du dossier. Le `select` EST la garde.
 *
 * `selectedAt` est rendu en ISO canonique : c'est la forme que
 * `buildDecisionCard` exige, et elle entre dans l'empreinte de la carte.
 */
export async function lireSelectionPriorite(
  idPatient: string,
  decisionCardId: string,
): Promise<DecisionPrioritySelection | null> {
  const lignes = await prisma.decisionPrioritySelection.findMany({
    where: { idPatient, decisionCardId },
    select: CHAMPS,
  });
  const tete = teteDuFil(lignes);
  if (tete === null) return null;
  return {
    candidateId: tete.candidateId,
    selectedAt: tete.selectedAt.toISOString(),
    selectedBy: 'practitioner',
    rationale: tete.rationale,
  };
}
