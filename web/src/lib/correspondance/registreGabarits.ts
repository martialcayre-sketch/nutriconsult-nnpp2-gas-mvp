// Registre des gabarits de messages sortants vers le patient (Socle LOT-03).
//
// DC-26 : les règles vivent dans le registre, jamais seulement dans le code.
// Avant ce fichier, huit gabarits étaient dispersés — cinq inline dans des
// handlers de route — sans version, sans date, sans contrainte opposable. Le
// registre les ACCUEILLE tels quels : il n'a réécrit aucun contenu (DC-19,
// DC-20) — le déménagement est fidèle au caractère près, prouvé par les bancs
// d'email existants restés verts sans modification.
//
// ── LE PATRON, ET SES DEUX ÉCARTS ASSUMÉS ───────────────────────────────────
// Patron : `trust/contenus/registre.ts` — version immuable, hash canonique
// (`canonicalSha256`), `Object.freeze`, garde structurelle par test
// (`registreGabarits.test.ts` : hash-lock, liste figée, déclarations).
// Deux écarts au patron, décidés au cadrage (CAMPAGNE.md, état réel) :
//   • DEUX dates au lieu d'une — `redigeLe` (mesurée : dernier commit
//     touchant le sujet du gabarit, `git log -S`) et `valideLe`, qui vaut
//     `null` tant que le responsable n'a pas validé formellement le texte.
//     Aucun des huit n'a jamais été validé : le registre le DIT au lieu de
//     l'inventer.
//   • PAS de chaîne cryptographique — comme le trust : append-only par
//     convention + liste figée par test, chaque hash couvre sa seule version.
//
// ── LA CONTRAINTE DE CONTENU — DÉCLARÉE, PAS IMPOSÉE ────────────────────────
// Référence : le banc de `agenda-sommeil/relanceEmail.ts` — « aucune donnée
// de santé dans un e-mail : ni titre d'instrument, ni domaine, ni chiffre ».
// Quatre gabarits N'Y SONT PAS conformes aujourd'hui (titres d'instruments,
// note libre du praticien) : leur écart est DÉCLARÉ ci-dessous, gabarit par
// gabarit. Le corriger changerait le contenu servi aux patients — décision
// praticien, hors campagne (précédent : l'audit HDS du 2026-07-24 a retiré le
// motif de consultation de l'e-mail portail).
//
// ── ÉVOLUTION D'UN GABARIT ──────────────────────────────────────────────────
// Une version publiée est IMMUABLE : toute évolution du texte = NOUVEL objet
// version ajouté ici (version + 1), l'ancien reste. Modifier un `corps` sans
// changer de version casse la CI (hash-lock). La validation formelle d'un
// texte existant, elle, ne touche pas le hash : `valideLe` est hors empreinte,
// c'est un acte du responsable, pas une réécriture.
//
// Ce module n'importe PAS `canonicalSha256` (node:crypto) : il est atteint par
// un composant client via `relanceEmail` → le recalcul d'empreinte vit dans le
// banc, comme dans le patron trust — les hashs sont des littéraux ici.

export type ConformiteDonneesSante =
  | { statut: 'conforme' }
  | { statut: 'ecart'; ecart: string };

export type VersionGabaritPatient = {
  /** Clé stable du gabarit (alignée sur `TYPES_CORRESPONDANCE_PATIENT` quand le type existe). */
  key: string;
  version: number;
  titre: string;
  /** Sujet EXACT de l'e-mail. */
  sujet: string;
  /** Corps EXACT, variables en `{{nom}}` — rendu par `rendreGabarit`. */
  corps: string;
  /** Variables attendues (toutes obligatoires au rendu). */
  variables: readonly string[];
  donneesSante: ConformiteDonneesSante;
  /** Dernier remaniement du texte, mesuré (`git log -S` sur le sujet). */
  redigeLe: string;
  /** Validation formelle du responsable — `null` tant qu'elle n'a pas eu lieu. */
  valideLe: string | null;
  /** `canonicalSha256({ key, version, sujet, corps, variables })`. */
  hash: string;
};

// Segments optionnels partagés par trois gabarits (assignation, pack, file
// d'envoi). C'est ici que vivent la date limite et la NOTE LIBRE du praticien
// — l'écart « données de santé » le plus ouvert du registre : un texte libre
// part tel quel dans l'e-mail.
export const SEGMENTS_GABARITS = Object.freeze({
  dateLimite: '\nÀ compléter avant le : {{dateLimite}}',
  notePraticien: '\nNote de votre praticien : {{notes}}',
} as const);

export const REGISTRE_GABARITS_PATIENT: readonly VersionGabaritPatient[] = Object.freeze([
  {
    key: 'lien_magique',
    version: 1,
    titre: "Lien temporaire d'accès à l'espace patient",
    sujet: 'Votre lien d’accès — Wellneuro',
    corps:
      'Bonjour {{prenom}},\n\n' +
      "Voici votre lien d'accès à votre espace patient Wellneuro :\n{{lien}}\n\n" +
      "Ce lien est valable 24 heures et ne s'ouvre qu'une fois. " +
      "Passé ce délai, ou si vous l'avez déjà utilisé, vous pourrez en redemander " +
      'un nouveau depuis la page qui s\'affichera — sans passer par votre praticien.\n\n' +
      "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message : " +
      'sans clic de votre part, ce lien expirera seul.\n\n' +
      "L'équipe Wellneuro",
    variables: ['prenom', 'lien'],
    donneesSante: { statut: 'conforme' },
    redigeLe: '2026-07-20',
    valideLe: null,
    hash: '20542552ef304ba7906c997402838f31bf40b7d2e92306706c903b9c222fc03d',
  },
  {
    key: 'acces_portail',
    version: 1,
    titre: "Ouverture de l'accès à l'espace patient",
    sujet: 'Accès à votre espace patient — Wellneuro',
    corps:
      'Bonjour {{prenom}},\n\n' +
      "Votre praticien vous ouvre l'accès à votre espace patient Wellneuro.\n\n" +
      "Rendez-vous sur votre page d'accès :\n{{connexion}}\n\n" +
      "Vous pourrez vous connecter avec Google, ou recevoir un lien d'accès " +
      'par e-mail à l\'adresse enregistrée par votre praticien.\n\n' +
      'Lors de votre première connexion, il vous sera demandé de donner votre consentement, ' +
      "de remplir une courte fiche de renseignements puis un questionnaire d'anamnèse. " +
      'Vos questionnaires de suivi seront ensuite mis à votre disposition.\n\n' +
      "L'équipe Wellneuro",
    variables: ['prenom', 'connexion'],
    // L'audit HDS du 2026-07-24 a retiré le motif de consultation de ce
    // gabarit — le texte ne porte plus aucune donnée propre au patient.
    donneesSante: { statut: 'conforme' },
    redigeLe: '2026-07-08',
    valideLe: null,
    hash: '895273177cabdc3f74f6fe381dd8408bee769e469781d923367aa3d38b118bf7',
  },
  {
    key: 'relance_agenda_sommeil',
    version: 1,
    titre: 'Relance du recueil agenda du sommeil',
    sujet: 'Un recueil en cours dans votre espace — Wellneuro',
    // La salutation est calculée par l'appelant (`relanceEmail.ts` — prénom
    // vide → « Bonjour, ») : le gabarit la reçoit rendue.
    corps:
      '{{salutation}}\n\n' +
      "Votre praticien vous signale qu'un recueil est à votre disposition dans votre\n" +
      'espace patient Wellneuro. Il se remplit en une minute par jour, au moment qui\n' +
      'vous convient.\n\n' +
      'Accéder à votre espace :\n{{lien}}\n\n' +
      "Il n'y a rien à rattraper : commencez ou reprenez simplement au prochain matin.\n\n" +
      "L'équipe Wellneuro",
    variables: ['salutation', 'lien'],
    // Le SEUL gabarit dont la conformité est tenue par un banc dédié
    // (`relanceEmail.test.ts`) : ni instrument, ni « sommeil », ni chiffre.
    donneesSante: { statut: 'conforme' },
    redigeLe: '2026-07-30',
    valideLe: null,
    hash: '3626875e5045effb6a2b85c865dda391d8ba30c717c568f413893c50db265250',
  },
  {
    key: 'assignation_questionnaire',
    version: 1,
    titre: "Invitation à compléter un questionnaire",
    sujet: 'Questionnaire à compléter avant votre consultation — Wellneuro',
    corps:
      'Bonjour,\n\n' +
      'Votre praticien vous invite à compléter le questionnaire suivant avant votre consultation :\n' +
      '« {{titre}} »{{dateInfo}}{{noteInfo}}\n\n' +
      'Accédez à votre espace patient ici :\n{{portalUrl}}\n\n' +
      "L'équipe Wellneuro",
    variables: ['titre', 'dateInfo', 'noteInfo', 'portalUrl'],
    donneesSante: {
      statut: 'ecart',
      ecart:
        "Porte le titre de l'instrument assigné (révèle le domaine exploré) et, " +
        'via le segment note, un texte libre du praticien envoyé tel quel.',
    },
    redigeLe: '2026-06-30',
    valideLe: null,
    hash: 'fd98f9d154fefb1d1f0c28cc7caf2d2a88b9d374474e71370205df9d3e49677f',
  },
  {
    key: 'assignation_pack',
    version: 1,
    titre: "Invitation à compléter les questionnaires d'un pack",
    sujet: 'Questionnaires à compléter avant votre consultation — Wellneuro',
    // `liste` : préformatée par l'appelant, une ligne « • titre » par
    // questionnaire.
    corps:
      'Bonjour,\n\n' +
      'Votre praticien vous invite à compléter les questionnaires du pack « {{packNom}} » avant votre consultation :\n' +
      '{{liste}}{{dateInfo}}{{noteInfo}}\n\n' +
      "Un seul lien suffit : après confirmation de votre email, vous pourrez accéder à tous les questionnaires en attente du pack et les remplir dans l'ordre de votre choix.\n\n" +
      'Accéder à vos questionnaires :\n{{portalUrl}}\n\n' +
      "L'équipe Wellneuro",
    variables: ['packNom', 'liste', 'dateInfo', 'noteInfo', 'portalUrl'],
    donneesSante: {
      statut: 'ecart',
      ecart:
        'Porte le nom du pack et les titres de tous ses instruments, et, via le ' +
        'segment note, un texte libre du praticien envoyé tel quel.',
    },
    redigeLe: '2026-07-07',
    valideLe: null,
    hash: 'f09e03dab17c5cab5360724f5520d1dd18ff4d25bb398a9fa5ac705cfcf79188',
  },
  {
    key: 'file_envoi',
    version: 1,
    titre: "Invitation à compléter une sélection de questionnaires",
    sujet: 'Questionnaires à compléter avant votre consultation — Wellneuro',
    corps:
      'Bonjour,\n\n' +
      'Votre praticien vous invite à compléter les questionnaires suivants :\n' +
      '{{liste}}{{dateInfo}}{{noteInfo}}\n\n' +
      "Un seul lien suffit : après confirmation de votre email, vous pourrez accéder à tous les questionnaires en attente et les remplir dans l'ordre de votre choix.\n\n" +
      'Accéder à vos questionnaires :\n{{portalUrl}}\n\n' +
      "L'équipe Wellneuro",
    variables: ['liste', 'dateInfo', 'noteInfo', 'portalUrl'],
    donneesSante: {
      statut: 'ecart',
      ecart:
        'Porte les titres des instruments sélectionnés et, via le segment note, ' +
        'un texte libre du praticien envoyé tel quel.',
    },
    redigeLe: '2026-07-23',
    valideLe: null,
    hash: '46bd71ed3af24c1db5d5b491e6bfacfb63b5520bd04a60ab5e7b28693cabf2e7',
  },
  {
    key: 'accuse_reception',
    version: 1,
    titre: "Accusé de réception d'un questionnaire",
    sujet: 'Vos réponses ont bien été reçues — Wellneuro',
    corps:
      'Bonjour,\n\n' +
      'Nous confirmons la bonne réception de vos réponses au questionnaire :\n' +
      '« {{titre}} »\n\n' +
      'Votre praticien Wellneuro en prendra connaissance prochainement.\n\n' +
      "L'équipe Wellneuro",
    variables: ['titre'],
    donneesSante: {
      statut: 'ecart',
      ecart: "Porte le titre de l'instrument complété (révèle le domaine exploré).",
    },
    redigeLe: '2026-06-30',
    valideLe: null,
    hash: '67b5239b0337d734a6b60c27e4f2a74bcdb9303375da8d501282d8f45e51e7d3',
  },
  {
    key: 'envoi_bilan',
    version: 1,
    titre: 'Transmission du bilan (booklet)',
    sujet: 'Votre bilan neuronutritionnel validé — Wellneuro',
    // Seul gabarit à double corps : ce texte est le corps `text`, le corps
    // `html` est le booklet rendu (`buildBookletHTML`), gardé ailleurs
    // (carte des chemins sortants, `documents/vocabulaire.ts`).
    corps:
      'Bonjour,\n\n' +
      'Votre praticien vous transmet votre bilan neuronutritionnel Wellneuro.\n' +
      'Ce document a été préparé après validation humaine et ne constitue pas un diagnostic médical.\n\n' +
      'Bien cordialement,\n' +
      "L'équipe Wellneuro",
    variables: [],
    donneesSante: { statut: 'conforme' },
    redigeLe: '2026-06-30',
    valideLe: null,
    hash: 'c67f70beb29b025c6cb93eb8397bf35e32d85a556d6142439f2da93b1fd74780',
  },
  // Ajoutée en fin de liste, comme le veut l'append-only : la v1 ci-dessus ne
  // bouge pas d'un caractère, elle cesse simplement d'être servie
  // (`getGabarit` rend la version la plus haute).
  //
  // POURQUOI UNE V2. Le texte v1 ouvrait un accès sans jamais dire QUI
  // l'ouvre : « Votre praticien » à la troisième personne, signé « L'équipe
  // Wellneuro » — une entreprise que le patient n'a jamais rencontrée, sur un
  // domaine qu'il ne connaît pas, à propos d'un service dont le prix n'était
  // pas dit. Cinq dossiers ouverts entre le 2026-08-20 et le 2026-09-04 ont
  // reçu ce message : aucun n'a ouvert son espace. C'est la seule lecture
  // qu'on ait, et elle ne prouve rien à elle seule — mais le texte, lui, était
  // bel et bien ambigu.
  //
  // PREMIER GABARIT DU REGISTRE PORTANT UNE VALIDATION FORMELLE : `valideLe`
  // valait `null` sur les huit versions publiées. Le champ existait pour cet
  // acte-là, il n'avait encore jamais servi.
  //
  // LE NOM DU PRATICIEN EST EN DUR, décision assumée (arbitrage praticien du
  // 2026-09-04) : un gabarit qui dirait « {{praticien}} » ne dirait plus
  // « c'est moi », et c'est tout l'objet de cette version. Le dépôt tient
  // l'hypothèse mono-praticien ; le jour où un second compte praticien
  // s'ouvre, ce texte devra passer par une variable — alimentée par un nom
  // d'affichage qui n'existe pas encore en base, les dossiers ne portant que
  // `praticienEmail`. C'est la dette, elle est connue.
  //
  // LA QUALITÉ DU PRATICIEN EST ÉCRITE DANS LES TERMES DE CELUI QUI LA
  // DÉLIVRE, vérifiés sur le site de l'Institut SIIN le 2026-09-04
  // (`siin-nutrition.com/fr/institut-siin/neuro-nutrition/`) :
  //
  //   • « Neuro-Nutrition® » PREND UN TRAIT D'UNION. La page déclare que
  //     « toute utilisation du terme : Neuro-Nutrition® NeuroNutrition ou
  //     toute déclinaison susceptible de créer une confusion est strictement
  //     encadrée ». Une première rédaction écrivait « NeuroNutrition® » : sur
  //     une marque déposée, l'orthographe n'est pas une préférence.
  //   • L'INSTITUT SIIN DÉLIVRE le label, il n'EST pas le label. Une première
  //     rédaction disait « label S.I.I.N. », inversant les deux. Le nom exact
  //     est « Label Neuro-Nutrition® (NN®) », et l'institut s'écrit « Institut
  //     SIIN » (Scientific Institute for Intelligent Nutrition®), sans points.
  //   • « praticien labellisé » est le terme de la page elle-même.
  //
  // CE QUE LE TEXTE NE DIT PAS, ET NE DOIT PAS DIRE : aucune reconnaissance
  // par l'État, les autorités de santé ou un ordre professionnel. Le site n'en
  // revendique aucune — sa seule certification est Qualiopi, « au titre de la
  // catégorie Actions de formation », qui porte sur le PROCESSUS de formation.
  // Le gabarit énonce un diplôme et un label, et s'arrête là.
  //
  // DEUX PHRASES ONT ÉTÉ RETIRÉES EN REVUE (2026-09-04), toutes deux fausses
  // sans qu'aucun banc puisse le dire — un gabarit se relit seul, et ce qu'il
  // PROMET vit ailleurs dans le dépôt :
  //
  //   • « taper app.wellneuro.fr : c'est la même page ». La racine redirige
  //     hors session vers `/login`, l'écran PRATICIEN, dont le seul bouton
  //     passe par `ALLOWED_DOMAINS = ['wellneuro.fr']` (`lib/auth.ts`) et
  //     refuse tout compte Google personnel. La phrase existait pour rassurer
  //     contre l'hameçonnage : elle envoyait donc au mur le patient le PLUS
  //     méfiant, celui qui tape plutôt que de cliquer. Le texte pointe
  //     désormais l'URL rendue par `{{connexion}}`, qui est bien la sienne.
  //   • « sans échéance ». `SEGMENTS_GABARITS.dateLimite` est servi par les
  //     trois gabarits d'assignation : la promesse portait nommément sur ce
  //     qui peut porter une date limite. Le pack de base, lui, part sans date
  //     (`api/portail/valider` n'en passe aucune) — mais pas le reste.
  //
  // L'ADRESSE DE RÉPONSE EST ÉCRITE DANS LE CORPS, et l'en-tête `Reply-To` la
  // double depuis le même jour (`sendPortailLinkEmail`, alimenté par
  // `patients.praticien_email`) : l'expéditeur reste `noreply@wellneuro.fr`,
  // donc sans cet en-tête le bouton « Répondre » du client viserait une boîte
  // morte. Les deux se justifient — l'en-tête sert le geste réflexe, le corps
  // reste lisible là où le client masque l'adresse de réponse.
  {
    key: 'acces_portail',
    version: 2,
    titre: "Ouverture de l'accès à l'espace patient",
    sujet: 'Votre espace de suivi — Martial Cayre (Wellneuro)',
    corps:
      'Bonjour {{prenom}},\n\n' +
      'Je vous ouvre l’accès à votre espace de suivi.\n\n' +
      'Wellneuro est l’outil que j’utilise pour le suivi de mes patients, et ' +
      'wellneuro.fr est mon site : ce message, et ceux qui suivront depuis ' +
      'noreply@wellneuro.fr, viennent de mon cabinet. L’accès à cet espace et le ' +
      'suivi qui s’y fait sont gratuits — il n’y a rien à payer, ni maintenant ni ' +
      'plus tard.\n\n' +
      'Votre page d’accès :\n{{connexion}}\n\n' +
      'Vous pouvez taper cette adresse vous-même dans votre navigateur plutôt que de ' +
      'cliquer : elle mène au même endroit. Vous vous y connecterez avec Google, ou ' +
      'en demandant un lien d’accès par e-mail, à l’adresse à laquelle vous recevez ' +
      'ce message.\n\n' +
      'À la première connexion : votre consentement, une courte fiche de ' +
      'renseignements, puis quelques questions sur ce qui vous amène. Vos ' +
      'questionnaires sont mis à disposition ensuite, et vous avancez à votre ' +
      'rythme ; si l’un d’eux porte une date limite, elle vous sera indiquée.\n\n' +
      'On ne vous demandera jamais de coordonnées bancaires, de numéro de carte ni ' +
      'de mot de passe. Une question, un doute sur un message reçu : écrivez-moi à ' +
      'martialcayre@wellneuro.fr.\n\n' +
      'Martial Cayre\n' +
      'Docteur en Pharmacie — praticien en santé fonctionnelle\n' +
      'Labellisé Neuro-Nutrition® (Institut SIIN)\n' +
      'Wellneuro — wellneuro.fr',
    variables: ['prenom', 'connexion'],
    // Ni instrument, ni domaine clinique, ni chiffre : « ce qui vous amène »
    // ne nomme rien du dossier. La qualité du praticien n'est pas une donnée
    // du patient.
    donneesSante: { statut: 'conforme' },
    redigeLe: '2026-09-04',
    valideLe: '2026-09-04',
    hash: '565610165965e90f611d6f315e07a6392956cdcf0e48547c1b4391fb6a8153eb',
  },
  // Le MÊME texte que `acces_portail@2`, augmenté du lien qui ouvre. Clé
  // DISTINCTE et non version 3 : `getGabarit` rend la version la plus haute
  // d'une clé, et une v3 serait servie aussi au chemin SANS lien, où le rendu
  // lèverait sur `{{lien}}` manquant. Le type de correspondance journalisé
  // reste `acces_portail` — c'est lui que lit l'encart des dossiers neufs.
  {
    key: 'acces_portail_lien',
    version: 1,
    titre: "Ouverture de l'accès à l'espace patient, avec lien direct",
    sujet: 'Votre espace de suivi — Martial Cayre (Wellneuro)',
    corps:
      'Bonjour {{prenom}},\n\n' +
      'Je vous ouvre l’accès à votre espace de suivi.\n\n' +
      'Wellneuro est l’outil que j’utilise pour le suivi de mes patients, et ' +
      'wellneuro.fr est mon site : ce message, et ceux qui suivront depuis ' +
      'noreply@wellneuro.fr, viennent de mon cabinet. L’accès à cet espace et le ' +
      'suivi qui s’y fait sont gratuits — il n’y a rien à payer, ni maintenant ni ' +
      'plus tard.\n\n' +
      'Pour entrer directement, ouvrez ce lien :\n{{lien}}\n\n' +
      'Il est valable 24 heures et ne s’ouvre qu’une fois. Passé ce délai, ou si ' +
      'vous l’avez déjà ouvert, votre page d’accès, elle, reste ouverte et ne ' +
      'change jamais :\n{{connexion}}\n\n' +
      'Vous pouvez taper cette adresse vous-même dans votre navigateur plutôt que de ' +
      'cliquer : elle mène au même endroit. Vous vous y connecterez avec Google, ou ' +
      'en demandant un lien d’accès par e-mail, à l’adresse à laquelle vous recevez ' +
      'ce message.\n\n' +
      'À la première connexion : votre consentement, une courte fiche de ' +
      'renseignements, puis quelques questions sur ce qui vous amène. Vos ' +
      'questionnaires sont mis à disposition ensuite, et vous avancez à votre ' +
      'rythme ; si l’un d’eux porte une date limite, elle vous sera indiquée.\n\n' +
      'On ne vous demandera jamais de coordonnées bancaires, de numéro de carte ni ' +
      'de mot de passe. Une question, un doute sur un message reçu : écrivez-moi à ' +
      'martialcayre@wellneuro.fr.\n\n' +
      'Martial Cayre\n' +
      'Docteur en Pharmacie — praticien en santé fonctionnelle\n' +
      'Labellisé Neuro-Nutrition® (Institut SIIN)\n' +
      'Wellneuro — wellneuro.fr',
    variables: ['prenom', 'connexion', 'lien'],
    // Ni instrument, ni domaine clinique, ni chiffre — comme la v2 dont il
    // reprend le texte au caractère près, hors le paragraphe du lien.
    donneesSante: { statut: 'conforme' },
    redigeLe: '2026-09-07',
    valideLe: '2026-09-07',
    hash: '0e65572d94cc85966add63e7891136a552169d777a971e16319ec7e082694e86',
  },
]);

/** Le gabarit courant d'une clé : version la plus haute (les versions
 * coexistent, l'ancienne ne se supprime jamais). */
export function getGabarit(key: string): VersionGabaritPatient {
  const versions = REGISTRE_GABARITS_PATIENT.filter(g => g.key === key);
  if (versions.length === 0) throw new Error(`Gabarit inconnu au registre : ${key}`);
  return versions.reduce((a, b) => (b.version >= a.version ? b : a));
}

/**
 * Rendu d'un gabarit : substitue chaque `{{nom}}`. Fail-loud dans les deux
 * sens — variable manquante ou placeholder résiduel lèvent : un e-mail
 * partiellement rendu ne doit jamais partir.
 */
export function rendreGabarit(
  gabarit: VersionGabaritPatient,
  vars: Record<string, string>,
): { sujet: string; corps: string } {
  let corps = gabarit.corps;
  for (const nom of gabarit.variables) {
    if (!(nom in vars)) throw new Error(`Gabarit ${gabarit.key}@${gabarit.version} : variable manquante « ${nom} »`);
    corps = corps.replaceAll(`{{${nom}}}`, vars[nom]);
  }
  const residu = corps.match(/\{\{[a-zA-Z]+\}\}/);
  if (residu) throw new Error(`Gabarit ${gabarit.key}@${gabarit.version} : placeholder non rendu ${residu[0]}`);
  return { sujet: gabarit.sujet, corps };
}

/** Rendu d'un segment optionnel — chaîne vide si la donnée est falsy, comme
 * les ternaires historiques des appelants (`dateLimite ? … : ''`) : pas de
 * `trim`, la fidélité au caractère près prime sur l'élégance. */
export function rendreSegment(
  segment: keyof typeof SEGMENTS_GABARITS,
  valeur: string | null | undefined,
): string {
  if (!valeur) return '';
  return SEGMENTS_GABARITS[segment].replaceAll(
    segment === 'dateLimite' ? '{{dateLimite}}' : '{{notes}}',
    valeur,
  );
}
