// Garde de vocabulaire réglementaire (C3 LOT-03). Le rendu destiné au médecin
// traitant emploie le registre « explorations à discuter » : jamais de
// terminologie prescriptive. Cet utilitaire détecte les termes prescriptifs pour
// contrôler les contenus adressés au médecin (frontière A2 : C3 ne prescrit pas).
//
// ─── CARTE DES CHEMINS SORTANTS (Socle LOT-01, 2026-08-22) ───────────────────
//
// Tout texte clinique qui SORT de l'application passe une garde, et chaque
// câblage a son banc — un banc qui ROUGIT quand la garde est débranchée. Cette
// carte est le contrat posé par la campagne « Socle de restitution sûre » : un
// chemin de texte sortant absent d'ici est un chemin sans garde, et il n'a pas
// le droit d'exister. C'est le gate des campagnes 6.0.
//
// | Chemin | Garde | Régime | Banc de câblage |
// |---|---|---|---|
// | Synthèse (génération) | `verifierRestitutionOrientation` / `Complements` / `Discordances` (`api/praticien/synthese/route.ts`) | journalisant (`SYNTHESE_ORIENTATION_RESTITUTION_INFIDELE`) | `api/praticien/synthese/orientation.restitution.test.ts` |
// | Booklet (envoi au patient) | `termeAnxiogene` (ci-dessous) sur `narratif_patient` (`api/praticien/booklet/route.ts`) | refus CONFIRMABLE (`REGISTRE_ANXIOGENE`) | `api/praticien/booklet/route.test.ts` |
//
// LE BOOKLET SORT PAR E-MAIL, ET CETTE CARTE NE LE DISAIT PAS ([[D-136]]).
// Elle inscrit chaque chemin pour sa GARDE de vocabulaire ; celui-ci a la
// sienne. Mais il a aussi un CANAL que les autres n'ont pas : `sendMail` reçoit
// le booklet rendu en corps `html` — le narratif patient et la note praticien —
// à l'adresse du patient, hors de l'hébergement HDS. Aucun des sept autres
// chemins ne quitte l'application par un tiers de messagerie.
//
// Ce n'était déclaré nulle part : ni ici, ni au registre des gabarits (dont la
// déclaration `donneesSante` porte sur le corps TEXTE, qui est bien exempt),
// ni par une décision. Ce n'était pas un mensonge — c'était un non-dit, et un
// non-dit ne se relit pas.
// | Rendu médecin (courrier biologie, aperçus) | `assertRenduMedecinNonPrescriptif` (ci-dessous) au chokepoint `documents/rendu.ts` | refus dur (lève) | `documents/rendu.test.ts` |
// | Bilan portail (service) | `termeAnxiogene` sur narratif + note servis (`api/portail/bilan/route.ts`) | journalisant (`PORTAIL_BILAN_REGISTRE_ANXIOGENE`) | `api/portail/bilan/route.test.ts` |
// | Synthèse de compréhension (publication) | `termeAnxiogene` sur `texte` (`api/praticien/comprehension/route.ts`) | refus CONFIRMABLE (`REGISTRE_ANXIOGENE`) | `api/praticien/comprehension/route.test.ts` |
// | Synthèse de compréhension (service portail) | `termeAnxiogene` sur le texte servi (`api/portail/comprehension/route.ts`) | journalisant (`PORTAIL_COMPREHENSION_REGISTRE_ANXIOGENE`) | `api/portail/comprehension/route.test.ts` |
// | Dossier à deux voix (service portail) | `termeAnxiogene` sur les TROIS textes praticien servis — reformulation, priorité, synthèse (`api/portail/dossier/route.ts`) | journalisant (`PORTAIL_DOSSIER_REGISTRE_ANXIOGENE`) | `api/portail/dossier/route.test.ts` |
// | Document patient biologie (génération, décision F/D-122) | `termeAnxiogene` sur le texte généré avant consignation (`api/praticien/biologie/proposition/document-patient/route.ts`) | refus CONFIRMABLE (`REGISTRE_ANXIOGENE`) | `api/praticien/biologie/proposition/document-patient/route.test.ts` |
//
// LE DOSSIER À DEUX VOIX EST UN CHEMIN NEUF, PAS UN DOUBLON (Alliance LOT-06).
// Il sert au patient un texte praticien que RIEN d'autre ne lui sert — la
// REFORMULATION de l'objectif négocié, jusqu'ici visible du seul cockpit — et
// il le sert par une route qui n'est pas `api/portail/comprehension`. Une
// garde vit dans un appelant, pas dans un objet : la ligne du LOT-04 ne couvre
// pas cette route-ci, et le fichier de lot qui affirmait « le chemin est déjà
// inscrit » se trompait. Régime journalisant, par application de `D-090` — le
// geste est un SERVICE, comme le bilan et comme la synthèse au portail.
//
// DEUX LIGNES POUR UN SEUL OBJET, ET C'EST LE SENS DE `D-090` (Alliance
// LOT-04) : le régime suit le GESTE, pas le texte. Publier est un acte
// praticien explicite — un humain est là pour trancher, donc refus
// confirmable, comme le booklet. Afficher au portail est un service — personne
// n'est là pour arbitrer, et bloquer montrerait une page d'erreur au patient
// pour un texte qu'il n'a pas écrit et ne peut pas corriger, donc journalisant,
// comme le bilan. Les deux bancs sont VUS ROUGES au débranchement (preuve
// consignée au handoff du lot).
//
// Hors carte, et pourquoi : `correspondance-medecin` consigne un texte écrit
// par le praticien hors application (rien n'est généré ni envoyé) ; les emails
// templatés ne portent aucune prose générée — leur registre de gabarits est
// l'objet du LOT-03 du Socle.
//
// Consigne pour un chemin NEUF : l'ajouter ici AVEC sa garde et son banc de
// débranchement, dans la même PR que le chemin. Les régimes (journalisant /
// confirmable / refus dur) sont des choix datés et motivés — ils ne
// s'alignent pas entre eux sans décision : le durcissement éventuel est un
// arbitrage du responsable (instruit au handoff du Socle LOT-01, non tranché).

/** Racines de termes prescriptifs à proscrire d'un rendu médecin (minuscules). */
export const RACINES_PRESCRIPTIVES: readonly string[] = [
  'prescri', // prescription, prescrire, prescrit
  'ordonnance',
  'posologie',
  'dosage',
  'je recommande de prendre',
  'à administrer',
  'instaurer un traitement',
];

/** `true` si le texte contient un terme prescriptif (comparaison insensible à la casse). */
export function contientTermePrescriptif(texte: string): boolean {
  const t = texte.toLowerCase();
  return RACINES_PRESCRIPTIVES.some((racine) => t.includes(racine));
}

/**
 * Lève si un contenu destiné au médecin emploie un registre prescriptif.
 * À appeler sur les contenus médecin avant diffusion (garde en code).
 */
export function assertRenduMedecinNonPrescriptif(texte: string): void {
  if (contientTermePrescriptif(texte)) {
    throw new Error(
      'Rendu médecin : terminologie prescriptive interdite (registre « explorations à discuter » requis).',
    );
  }
}

// ─── Registre anxiogène (contenus lus par le patient) ────────────────────────
//
// Le patient lit le booklet SEUL, souvent avant d'avoir revu son praticien. Les
// libellés d'interprétation et les champs « Orientation » du catalogue sont
// écrits pour le praticien — « Avis médical urgent », « Consultation
// neurologique urgente » — et le modèle peut les recopier dans le narratif.
// Ces mots sont justes en consultation ; seuls, dans une boîte mail, ils
// inquiètent sans orienter.
//
// Cette garde ne juge pas du fond : elle attrape le registre. Les surfaces
// praticien (resume_praticien, points de vigilance, `protocol` du catalogue) ne
// sont PAS concernées — leur franchise clinique est utile et voulue.
//
// CE QU'ELLE NE SAIT PAS FAIRE. Elle ne lit pas la négation : « il n'y a ni
// urgence ni danger » est une phrase rassurante qu'elle signale quand même.
// Écrire un analyseur de négation française pour ça serait disproportionné et
// faillible. La conséquence est assumée AILLEURS : le signalement est un
// AVERTISSEMENT CONFIRMABLE côté route, jamais un refus définitif. Un faux
// positif coûte un clic ; il ne rend pas un document indélivrable.
//
// Une revue adversariale a mesuré le coût de la version précédente, qui
// cherchait ses racines par simple `includes` : « Rien ne s'aggrave » était
// attrapé par `grave`, et « je ne persévère pas » — libellé RÉEL du catalogue —
// par `sévère`. D'où les frontières de mot et la normalisation d'accents
// ci-dessous, réellement appliquées et non plus supposées par duplication.

/**
 * Racines de termes anxiogènes dans un contenu lu par le patient. Écrites SANS
 * accent : la comparaison normalise le texte avant de chercher.
 *
 * « critique » n'y figure pas : « un esprit critique », « la période critique »
 * et « un point critique » sont trop courants en français pour que la racine
 * porte un signal. Une garde qui crie tout le temps ne se lit plus.
 */
export const RACINES_ANXIOGENES: readonly string[] = [
  'urgence',
  'urgent',
  'danger',
  'dangereux',
  'alarmant',
  'alarme',
  'grave',
  'gravite',
  'severe',
  'inquietant',
  'immediatement',
  'risque eleve',
  'sans delai',
];

/**
 * Minuscules et sans accent, AVEC la carte des positions d'origine — pour
 * comparer « sévère » et « severe » sans les lister deux fois, tout en sachant
 * réextraire le mot exact du praticien.
 *
 * La carte n'est pas un luxe : `toLowerCase()` ne conserve pas la longueur dans
 * tous les cas (« İ » devient deux points de code), et un texte déjà décomposé
 * décalerait tout le reste. Normaliser caractère par caractère supprime la
 * question.
 */
function normaliserAvecIndices(brut: string): { norme: string; indices: number[] } {
  let norme = '';
  const indices: number[] = [];
  for (let i = 0; i < brut.length; i += 1) {
    const morceau = brut[i]
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
    for (const c of morceau) {
      norme += c;
      indices.push(i);
    }
  }
  return { norme, indices };
}

/**
 * Premier terme anxiogène trouvé, TEL QU'IL EST ÉCRIT DANS LE TEXTE, ou null.
 *
 * Renvoyer le mot du praticien plutôt que la racine est ce qui rend le message
 * utilisable : « le narratif emploie « urgente » » se comprend, « le narratif
 * emploie « urgen » » non — et la règle « UI en français » l'exige.
 */
export function termeAnxiogene(texte: string): string | null {
  const brut = texte ?? '';
  const { norme, indices } = normaliserAvecIndices(brut);
  for (const racine of RACINES_ANXIOGENES) {
    // Frontière de mot à gauche, suffixe libre à droite : `grave` ne doit pas
    // être trouvé dans « aggrave » ni `severe` dans « persevere », mais les
    // accords (urgent / urgente / urgents) doivent l'être sans multiplier les
    // entrées de la liste.
    const motif = new RegExp(`(?<![\\p{L}\\p{N}])${racine.replace(/ /g, '\\s+')}\\p{L}*`, 'u');
    const trouve = motif.exec(norme);
    if (!trouve) continue;
    const debut = indices[trouve.index];
    const dernier = indices[trouve.index + trouve[0].length - 1];
    return brut.slice(debut, dernier + 1);
  }
  return null;
}

/** `true` si le texte emploie un registre anxiogène. */
export function contientTermeAnxiogene(texte: string): boolean {
  return termeAnxiogene(texte) !== null;
}
