// Validation et chaînage des journées (domaine PUR). Patron `agenda-sommeil/nuit.ts` :
// `ensureJourReponses` rejette (`ErreurJourAlimentaire`, qui étend `TypeError` →
// 400 côté route), `resolveJoursActifs` résout la tête de chaîne par date,
// `estDateSaisissable` borne la saisie.

import {
  ANCRE_JOURNEE_MIN,
  FENETRE_ALI_MAX_PLAUSIBLE,
  NATURES_PRISE,
  NB_PRISES_MAX,
  type JourReponses,
  type JourRow,
  type NaturePrise,
  type PriseJour,
} from './types';

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_HEURE = /^([01]\d|2[0-3]):(00|15|30|45)$/; // HH:MM au pas de 15 min

// ─── Codes de domaine ────────────────────────────────────────────────────────

/**
 * Un code par contrôle — la piste consignée à [[D-015]], posée ici ([[D-144]]).
 *
 * LE DÉFAUT QU'ILS FERMENT. La route d'écriture masque le message de toute
 * erreur avant de la journaliser, parce qu'un `PrismaClientValidationError`
 * recopie l'invocation fautive dans son message, `data.reponses` COMPRISE — les
 * horaires de prises du patient, c'est-à-dire de la donnée de santé, partiraient
 * en clair dans les journaux. Le prix payé : un refus de domaine ne disait plus
 * LEQUEL des onze contrôles avait mordu. Un `400` sans motif ne se diagnostique
 * pas ; il s'accumule.
 *
 * POURQUOI UN CODE ET NON UN DÉMASQUAGE. Le `catch` de la route n'attrape pas
 * que ce module : il attrape aussi les `TypeError` levées par la persistance et
 * par la lecture de contrat, dont certains messages interpolent une valeur reçue
 * ou relue. Démasquer les messages au motif que CEUX-CI sont sûrs ouvrirait donc
 * la porte à ceux qui ne le sont pas. Un code énuméré, lui, est sûr PAR
 * CONSTRUCTION : c'est une constante de ce fichier, jamais une donnée.
 */
export const CODES_JOUR_ALIMENTAIRE = [
  'reponses_illisibles',
  'heure_invalide',
  'booleen_attendu',
  'booleen_ou_abstention',
  'prise_illisible',
  'nature_prise_invalide',
  'sans_prise_avec_prises',
  'sans_prise_observee',
  'aucune_prise_declaree',
  'trop_de_prises',
  'prises_desordonnees',
] as const;

export type CodeJourAlimentaire = (typeof CODES_JOUR_ALIMENTAIRE)[number];

/**
 * LONGUEUR MAXIMALE D'UN CODE, ET CE N'EST PAS UNE COQUETTERIE.
 *
 * Le code voyage dans `metadata`, qui traverse `sanitizeMetadata` →
 * `sanitizeAny` → `sanitizeString`, dont la dernière règle remplace tout mot de
 * **24 caractères ou plus** par `[id]` — elle vise les identifiants longs. Trois
 * des onze codes de ce fichier la franchissaient à la première écriture et
 * sortaient anonymisés : le journal disait `erreurCode: "[id]"`, soit
 * exactement l'absence de diagnostic que ces codes existent pour combler.
 *
 * C'est le même piège qui avait déjà coûté la trace des classes d'erreur Prisma
 * (voir `traceErreur`, route de l'agenda alimentaire). Il se referme ici par un
 * banc, pas par une note.
 */
export const CODE_JOUR_LONGUEUR_MAX = 23;

/**
 * L'erreur de DOMAINE de l'agenda alimentaire — et le marqueur qui la distingue
 * d'une panne ([[D-144]]).
 *
 * ELLE ÉTEND `TypeError` À DESSEIN : la route branche son `400` sur
 * `err instanceof TypeError`, et changer de base changerait le statut rendu au
 * patient. Ce qu'elle ajoute est un `code`, que `traceErreur` sait déjà lire et
 * journaliser — le chemin existait, il n'avait rien à y mettre.
 *
 * LA CLASSE EST LE MARQUEUR, LE CODE EST LA CHARGE. Une `TypeError` nue venue
 * d'ailleurs dans la pile ne porte pas de `code` et reste donc masquée, sans
 * qu'aucun tri au cas par cas n'ait à être écrit ni tenu à jour.
 */
export class ErreurJourAlimentaire extends TypeError {
  constructor(readonly code: CodeJourAlimentaire, message: string) {
    super(message);
    // Le `name` traverse `sanitizeError` VERBATIM (il n'est pas soumis à la
    // règle des 24 caractères, qui ne frappe que `metadata`). Le journal
    // distingue donc d'un coup d'œil un refus de domaine d'une panne.
    this.name = 'ErreurJourAlimentaire';
  }
}

// ─── Primitives de temps ─────────────────────────────────────────────────────

/**
 * Minutes écoulées depuis l'ancre de journée (04:00). C'est l'échelle sur
 * laquelle les prises s'ordonnent et sur laquelle les statistiques d'heures se
 * calculent : depuis minuit, 23:45 et 00:15 sembleraient distants de douze
 * heures alors qu'ils le sont d'une demi-heure.
 */
export function minutesDepuisAncre(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60 + m - ANCRE_JOURNEE_MIN + 1440) % 1440;
}

/** Durée d'un intervalle horaire, minuit traversé (modulo 1440). */
export function dureeMinutes(hDebut: string, hFin: string): number {
  const [hd, md] = hDebut.split(':').map(Number);
  const [hf, mf] = hFin.split(':').map(Number);
  return (hf * 60 + mf - (hd * 60 + md) + 1440) % 1440;
}

export function decalerDate(date: string, n: number): string {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function estDateValide(value: unknown): value is string {
  if (typeof value !== 'string' || !RE_DATE.test(value)) return false;
  const [a, m, j] = value.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/**
 * La saisie est bornée à aujourd'hui ou la veille — plus strict que l'agenda du
 * sommeil, et délibérément. Au-delà de 24 heures, un rappel alimentaire est une
 * reconstruction de mémoire et non une observation : le remplir ferait passer
 * du souvenir pour de la mesure, dans un instrument dont tout le régime de
 * preuve tient au mot « observé ». Le trou est assumé.
 */
export function estDateSaisissable(dateJour: string, aujourdHui: string): boolean {
  // Les deux arguments sont validés AVANT toute comparaison : sans cela,
  // `estDateSaisissable('pouet', 'pouet')` rendait `true`, et le garde ne
  // valait que ce que valait son appelant.
  if (!estDateValide(dateJour) || !estDateValide(aujourdHui)) return false;
  return dateJour === aujourdHui || dateJour === decalerDate(aujourdHui, -1);
}

// ─── Validation des formats atomiques ────────────────────────────────────────

function ensureHeure(value: unknown, champ: string): string {
  if (typeof value !== 'string' || !RE_HEURE.test(value)) {
    throw new ErreurJourAlimentaire('heure_invalide', `Heure invalide pour « ${champ} ».`);
  }
  return value;
}

function ensureBooleen(value: unknown, champ: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ErreurJourAlimentaire('booleen_attendu', `Réponse invalide pour « ${champ} ».`);
  }
  return value;
}

/**
 * Variante des QUATRE présences obligatoires, qui acceptent l'abstention.
 *
 * `null` est une réponse — « je ne sais pas » — et se distingue de la clé
 * absente. C'est pourquoi l'écriture exige la CLÉ, pas une valeur non nulle :
 * exiger un booléen strict poussait le patient à répondre au hasard ou à sauter
 * la journée entière, donc à perdre aussi ses horaires.
 *
 * `soirPlusCopieux` n'utilise PAS cette fonction : il ne porte pas d'abstention.
 */
function ensureBooleenOuNull(value: unknown, champ: string): boolean | null {
  if (value === null) return null;
  if (typeof value !== 'boolean') {
    throw new ErreurJourAlimentaire('booleen_ou_abstention', `Réponse invalide pour « ${champ} ».`);
  }
  return value;
}

function ensurePrise(value: unknown, index: number): PriseJour {
  if (!value || typeof value !== 'object') {
    throw new ErreurJourAlimentaire('prise_illisible', `Prise n° ${index + 1} illisible.`);
  }
  const v = value as Record<string, unknown>;
  const nature = v.nature;
  if (typeof nature !== 'string' || !(NATURES_PRISE as readonly string[]).includes(nature)) {
    throw new ErreurJourAlimentaire('nature_prise_invalide', `Nature invalide pour la prise n° ${index + 1}.`);
  }
  return {
    heure: ensureHeure(v.heure, `heure de la prise n° ${index + 1}`),
    nature: nature as NaturePrise,
  };
}

// ─── Validation d'une journée complète ───────────────────────────────────────

/**
 * `exigerObligatoires` sépare l'ÉCRITURE de la LECTURE, comme côté sommeil. En
 * écriture, les protéines du matin et les trois présences sont obligatoires dès
 * qu'il y a des prises : sans elles, l'agrégation devrait inventer un « non ».
 * En lecture elles restent facultatives — une ligne écrite sous une version
 * antérieure doit rester relisible.
 *
 * Les clés supplémentaires (`contractVersion` rangé dans le JSON stocké) sont
 * ignorées.
 */
export function ensureJourReponses(
  value: unknown,
  options: { exigerObligatoires?: boolean } = {},
): JourReponses {
  if (!value || typeof value !== 'object') {
    throw new ErreurJourAlimentaire('reponses_illisibles', 'Réponses de journée illisibles.');
  }
  const v = value as Record<string, unknown>;

  const exiger = options.exigerObligatoires === true;
  const aucunePrise = v.aucunePrise === true;
  const prisesBrutes = v.prises;

  if (aucunePrise) {
    // Une journée sans prise est une réponse entière : elle ne se panache pas
    // avec des observations qui la contrediraient. Contrôle d'ÉCRITURE
    // seulement — une ligne déjà en base, même bancale, doit rester relisible,
    // sans quoi une seule ligne rendrait tout l'agenda du patient illisible
    // (leçon `agenda-sommeil/nuit.ts`).
    if (exiger && Array.isArray(prisesBrutes) && prisesBrutes.length > 0) {
      throw new ErreurJourAlimentaire('sans_prise_avec_prises',
        'Une journée sans prise ne peut pas porter de prises.');
    }
    for (const champ of exiger ? ([
      'premierePriseProteines',
      'soirPlusCopieux',
      'legumesDeuxPrises',
      'fruitsOuOleagineux',
      'ultraTransformes',
    ] as const) : []) {
      if (v[champ] !== undefined && v[champ] !== null) {
        throw new ErreurJourAlimentaire('sans_prise_observee',
          'Une journée sans prise ne porte aucune observation de contenu.');
      }
    }
    return { aucunePrise: true };
  }

  if (!Array.isArray(prisesBrutes) || prisesBrutes.length === 0) {
    throw new ErreurJourAlimentaire('aucune_prise_declaree',
      'Renseignez au moins une prise, ou déclarez une journée sans prise.');
  }
  if (exiger && prisesBrutes.length > NB_PRISES_MAX) {
    throw new ErreurJourAlimentaire('trop_de_prises', `Au plus ${NB_PRISES_MAX} prises par journée.`);
  }

  const prises = prisesBrutes.map((p, i) => ensurePrise(p, i));

  // Strictement croissantes sur l'échelle ancrée : deux prises à la même heure
  // ne se distinguent pas, et un ordre inversé ferait un jeûne négatif. Contrôle
  // d'ÉCRITURE : en lecture, on TRIE plutôt que de lever — refuser une ligne
  // historique un peu bancale ferait disparaître tout l'agenda du patient.
  for (let i = 1; i < prises.length; i += 1) {
    if (minutesDepuisAncre(prises[i].heure) <= minutesDepuisAncre(prises[i - 1].heure)) {
      if (exiger) {
        throw new ErreurJourAlimentaire('prises_desordonnees',
          'Les prises doivent être renseignées dans l’ordre, sans doublon d’heure.');
      }
      prises.sort((a, b) => minutesDepuisAncre(a.heure) - minutesDepuisAncre(b.heure));
      break;
    }
  }

  const out: JourReponses = { prises };

  if (options.exigerObligatoires) {
    // ÉCRITURE — la CLÉ est exigée, sa VALEUR peut être `null`. `undefined` ne
    // passe pas `ensureBooleenOuNull` : sauter la question reste refusé, mais
    // dire « je ne sais pas » devient possible. C'est toute la différence entre
    // obliger à répondre et obliger à inventer.
    out.premierePriseProteines = ensureBooleenOuNull(
      v.premierePriseProteines,
      'protéines à la première prise',
    );
    out.legumesDeuxPrises = ensureBooleenOuNull(
      v.legumesDeuxPrises,
      'légumes à au moins deux prises',
    );
    out.fruitsOuOleagineux = ensureBooleenOuNull(v.fruitsOuOleagineux, 'fruits ou fruits à coque');
    out.ultraTransformes = ensureBooleenOuNull(v.ultraTransformes, 'produits ultra-transformés');
  } else {
    // LECTURE — `null` est SIGNIFIANT et doit survivre au passage. Une version
    // antérieure de ce bloc l'écartait comme une absence : l'abstention aurait
    // été relue en non-réponse, et la journée serait sortie du dénominateur
    // pour une raison qui n'était pas la sienne. Seule la clé absente reste une
    // non-réponse.
    if (v.premierePriseProteines !== undefined) {
      out.premierePriseProteines = ensureBooleenOuNull(v.premierePriseProteines, 'protéines');
    }
    if (v.legumesDeuxPrises !== undefined) {
      out.legumesDeuxPrises = ensureBooleenOuNull(v.legumesDeuxPrises, 'légumes');
    }
    if (v.fruitsOuOleagineux !== undefined) {
      out.fruitsOuOleagineux = ensureBooleenOuNull(v.fruitsOuOleagineux, 'fruits ou fruits à coque');
    }
    if (v.ultraTransformes !== undefined) {
      out.ultraTransformes = ensureBooleenOuNull(v.ultraTransformes, 'produits ultra-transformés');
    }
  }

  // `soirPlusCopieux` NE porte pas d'abstention : le `!== null` reste, et il est
  // le seul de ce fichier. Sans lui, un `null` reçu entrerait dans `out`, et le
  // prédicat de couverture d'`agregats.ts` — qui teste la CONNAISSANCE — verrait
  // une journée renseignée là où elle ne l'est pas. `null !== undefined` est vrai
  // en JavaScript : c'est exactement le piège que cette ligne ferme.
  if (v.soirPlusCopieux !== undefined && v.soirPlusCopieux !== null) {
    out.soirPlusCopieux = ensureBooleen(v.soirPlusCopieux, 'repas du soir le plus copieux');
  }

  return out;
}

/**
 * Fenêtre alimentaire d'une journée : première → dernière prise, en minutes.
 * `null` sur une journée sans prise ou à prise unique — une fenêtre suppose
 * deux bornes, et 0 se lirait comme « toutes les prises au même instant ».
 */
export function fenetreAlimentaire(reponses: JourReponses): number | null {
  const prises = reponses.prises;
  if (!prises || prises.length < 2) return null;
  return minutesDepuisAncre(prises[prises.length - 1].heure) - minutesDepuisAncre(prises[0].heure);
}

/**
 * La FENÊTRE de cette journée est-elle dans les bornes ?
 *
 * Ce prédicat porte sur une grandeur, pas sur la journée. Une fenêtre hors
 * bornes rend `fenetreAlimentaire` inconnue et rien d'autre : la journée reste
 * comptée, avec son week-end, ses présences et ses jeûnes. L'écarter
 * entièrement retirerait du recueil les journées les plus dysrégulées — celles
 * pour lesquelles l'instrument existe — et rendrait la moyenne d'un patient qui
 * grignote de 05:00 à 00:30 identique à celle d'un patient régulier.
 */
export function fenetrePlausible(reponses: JourReponses): boolean {
  const fenetre = fenetreAlimentaire(reponses);
  return fenetre === null || fenetre <= FENETRE_ALI_MAX_PLAUSIBLE;
}

// ─── Chaînage ────────────────────────────────────────────────────────────────

/**
 * Têtes de chaîne par date : une correction crée une ligne qui en supplante une
 * autre, jamais un `update`. La ligne active d'une date est celle qu'aucune
 * autre ne supplante ; à égalité, la plus récemment soumise.
 */
export function resolveJoursActifs(lignes: JourRow[]): JourRow[] {
  // Regroupement par date AVANT toute résolution : un `supersedesJourId` qui
  // désignerait une ligne d'une autre date ne doit pas faire disparaître cette
  // autre date. Un ensemble global de supplantées le permettrait.
  const parDate = new Map<string, JourRow[]>();
  for (const ligne of lignes) {
    const lot = parDate.get(ligne.dateJour) ?? [];
    lot.push(ligne);
    parDate.set(ligne.dateJour, lot);
  }

  const actifs: JourRow[] = [];
  for (const [, lot] of parDate) {
    const supplantees = new Set(
      lot.map((l) => l.supersedesJourId).filter((id): id is string => Boolean(id)),
    );
    const tetes = lot.filter((l) => !supplantees.has(l.id));
    // Repli sur le lot entier si aucune tête ne survit : un cycle A↔B ferait
    // sinon disparaître la date, ce qui se lirait comme « le patient n'a rien
    // saisi ce jour-là » — une absence fabriquée par une anomalie de chaînage.
    const candidats = tetes.length > 0 ? tetes : lot;
    // Départage par `soumisLe` puis par `id` : sans le second, le résultat
    // dépendrait de l'ordre dans lequel la requête a rendu les lignes.
    const gagnante = candidats.reduce((meilleure, ligne) =>
      ligne.soumisLe > meilleure.soumisLe
      || (ligne.soumisLe === meilleure.soumisLe && ligne.id > meilleure.id)
        ? ligne
        : meilleure,
    );
    actifs.push(gagnante);
  }
  return actifs.sort((a, b) => a.dateJour.localeCompare(b.dateJour));
}
