// Accès DB direct pour le nettoyage des tests Playwright — même schéma de
// connexion que web/prisma/seed.ts (imports relatifs, pas d'alias @/, ce
// fichier n'est pas exécuté via le resolver Next.js).
// N'agit que sur le patient fictif Michel Dogné (PAT_SEED_03, déjà seedé par
// `npm run prisma:seed`) : jamais de patient réel, jamais de DROP/TRUNCATE.
// La provision de la consultation/du token d'accès passe par la vraie route
// praticien (POST /api/praticien/consultations, cf. le spec) plutôt que par
// une écriture DB directe ici — sinon le patient atterrit dans un état
// ("aucune consultation") que le parcours normal ne produit jamais.
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../src/generated/prisma';
import { withSupabaseSslMode, supabasePoolSsl } from '../../src/lib/postgres';
import { getDocumentCourant } from '../../src/lib/trust/contenus/registre';
import { PRATICIEN_EMAIL } from './auth';
// Dossier de référence qui PASSE les préconditions T0. RÉUTILISÉ, jamais
// recopié : son en-tête dit pourquoi il existe — « sans lui, chacune [des
// routes] décrirait un dossier confirmable à sa façon, et une condition qui
// changerait devrait être retrouvée dans trois fixtures divergentes ». Une
// quatrième description, ici, rouvrirait exactement ce trou. Bénéfice
// concret : les `rawAnswers` sont dérivées du CATALOGUE, donc `Q_ALI_01` suit
// sa forme courante (57 items en position production) sans qu'aucun item soit
// écrit à la main.
import {
  passationsRideauT0,
  PLAINTES_DIGESTIF_ET_PONDERAL,
  SYNTHESE_VALIDEE_FIXTURE,
  CONSULTATION_VALIDEE_FIXTURE,
  DATE_RIDEAU_FIXTURE,
} from '../../src/lib/clinical-engine/dossierT0Fixture';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://node@localhost:5433/wellneuro_dev?host=/home/node/pgdata&schema=public';

const pool = new Pool({
  connectionString: withSupabaseSslMode(DATABASE_URL),
  ssl: supabasePoolSsl(DATABASE_URL),
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Nettoie l'état "portail" laissé par un run de test précédent (assignations,
 * consultations, réponses liées) avant de reprovisionner une consultation
 * fraîche via l'API praticien. Ne touche jamais aux 5 réponses historiques
 * seedées par `npm run prisma:seed` (elles ont idAssignation=null, filtrées
 * ici).
 */
export async function resetPortailState(idPatient: string): Promise<void> {
  // Les nuits d'agenda AVANT les assignations : la clé étrangère
  // `agenda_sommeil_nuits_id_assignation_fkey` n'a pas de cascade, si bien
  // qu'une seule nuit laissée en base faisait échouer ce reset — et donc tous
  // les specs suivants du même patient, avec un message qui ne désignait pas
  // le coupable.
  await prisma.agendaSommeilNuit.deleteMany({ where: { idPatient } });
  // Journées d'agenda alimentaire : même FK RESTRICT vers `assignations`, donc
  // même piège, ajouté AVANT qu'une seule ligne n'existe. Attendre que le
  // symptôme revienne aurait coûté le diagnostic une seconde fois.
  await prisma.agendaAlimentaireJour.deleteMany({ where: { idPatient } });
  await prisma.assignation.deleteMany({ where: { idPatient } });
  await prisma.consultation.deleteMany({ where: { idPatient } });
  await prisma.questionnaireReponse.deleteMany({ where: { idPatient, idAssignation: { not: null } } });
  // TRUST : purge des traces du patient fictif pour que la séquence « Avant
  // de commencer » se représente à chaque run (idempotence du parcours).
  await prisma.trustAcknowledgement.deleteMany({ where: { idPatient } });
  await prisma.trustChoiceEvent.deleteMany({ where: { idPatient } });
  await prisma.trustAdverseEffectReport.deleteMany({ where: { idPatient } });
  await prisma.trustPrivacyIncident.deleteMany({ where: { idPatient } });
  await prisma.trustRightsRequest.deleteMany({ where: { idPatient } });
  // Le bilan transmis : sans ça, un run interrompu entre la provision et son
  // `afterAll` laisse le patient fictif avec un bilan visible dans la base
  // partagée — et un lien de plus dans la nav des specs suivants.
  await cleanupBilanTransmis();
  // Les cinq tables de l'alliance (LOT-01). Elles n'étaient nettoyées par RIEN :
  // les lots 02, 03 et 04 n'ont posé aucun E2E, et le trou ne se voyait donc
  // pas. Sur la base PARTAGÉE du Mac, un objectif ou une synthèse laissés par
  // un run précédent rendent le parcours du dossier à deux voix non idempotent
  // — et le rouge n'accuserait pas le run qui a écrit la ligne.
  await nettoyerDossierDeuxVoix(idPatient);
}

/**
 * L'ORDRE COMPTE, et il est l'inverse des références. `desaccords_comprehension`
 * et `ratifications_objectif` pointent vers les lignes qu'ils commentent : les
 * effacer d'abord évite d'avoir à s'en remettre à une cascade que le schéma
 * n'accorde pas (les FK patient sont en `RESTRICT`, délibérément — l'effacement
 * d'un dossier est un geste nommé, jamais un effet de bord).
 */
export async function nettoyerDossierDeuxVoix(idPatient: string): Promise<void> {
  await prisma.desaccordComprehension.deleteMany({ where: { idPatient } });
  // Les gestes du patient sur son objectif, effacés AVANT les objectifs
  // eux-mêmes — `id_objectif` est une référence souple, mais laisser des
  // lignes orphelines ferait fuir l'état d'un run dans le suivant.
  await prisma.reponseJalonObjectif.deleteMany({ where: { idPatient } });
  await prisma.amendementObjectif.deleteMany({ where: { idPatient } });
  await prisma.ratificationObjectif.deleteMany({ where: { idPatient } });
  await prisma.syntheseComprehension.deleteMany({ where: { idPatient } });
  await prisma.entreeCeQuiCompte.deleteMany({ where: { idPatient } });
  await prisma.objectifNegocie.deleteMany({ where: { idPatient } });
}

/**
 * Le dossier à deux voix d'un patient de fixture : un objectif négocié, une
 * entrée « ce qui compte », une synthèse de compréhension PUBLIÉE.
 *
 * Écrit directement en base plutôt que par les routes praticien : celles-ci
 * exigent une session NextAuth du domaine, et le parcours qu'on veut couvrir
 * est celui du PATIENT. Provisionner par l'API praticien ferait dépendre ce
 * spec d'une authentification qui n'est pas son sujet.
 *
 * `publieeLe` est renseignée À L'INSERT, jamais par une mise à jour : c'est
 * l'invariant du LOT-04, et un helper de test qui le contournerait donnerait un
 * exemple à recopier.
 */
export async function provisionnerDossierDeuxVoix(idPatient: string): Promise<{
  idObjectif: string;
  idSynthese: string;
}> {
  await nettoyerDossierDeuxVoix(idPatient);

  const objectif = await prisma.objectifNegocie.create({
    data: {
      idPatient,
      praticienEmail: PRATICIEN_EMAIL,
      enoncePatient: 'Je voudrais me réveiller sans avoir l’impression de n’avoir pas dormi.',
      reformulationPraticien:
        'Un sommeil qui ne restaure pas, plutôt qu’une difficulté à s’endormir.',
      priorite: 'Le sommeil d’abord',
    },
    select: { id: true },
  });

  await prisma.entreeCeQuiCompte.create({
    data: {
      idPatient,
      texte: 'Pouvoir reprendre la marche du dimanche avec ma fille.',
    },
  });

  const synthese = await prisma.syntheseComprehension.create({
    data: {
      idPatient,
      praticienEmail: PRATICIEN_EMAIL,
      texte: 'Vous venez pour un sommeil qui se casse au milieu de la nuit.',
      publieeLe: new Date(),
    },
    select: { id: true },
  });

  return { idObjectif: objectif.id, idSynthese: synthese.id };
}

/**
 * Pose l'accusé de lecture du cadre d'accompagnement, celui que la séquence
 * « Avant de commencer » produit.
 *
 * POURQUOI, ET C'EST UN CONSTAT DU LOT-06 : le hub du portail rend cette
 * séquence AVANT tout le reste (`questionnaires/page.tsx`, `avantRequis`) —
 * tant qu'elle n'est pas franchie, la navigation « Autres espaces » n'existe
 * pas dans le DOM. Un spec qui veut prouver qu'un lien y est ATTEIGNABLE doit
 * donc franchir ce gate, sinon il mesure l'absence du gate, pas celle du lien.
 *
 * On le pose en base plutôt qu'en rejouant les quatre écrans : `portail-parcours`
 * couvre déjà ce parcours-là, et le recopier ferait de ce spec un second banc
 * de la séquence de confiance — qui rougirait pour une raison étrangère à son
 * sujet le jour où elle change.
 *
 * La VERSION vient du registre, jamais d'un littéral : une version figée ici
 * cesserait de satisfaire la route au premier document révisé, et le spec
 * rougirait sans que rien de son sujet n'ait bougé.
 */
export async function provisionnerAccuseCadre(idPatient: string): Promise<void> {
  const cadre = getDocumentCourant('cadre_accompagnement');
  await prisma.trustAcknowledgement.deleteMany({ where: { idPatient } });
  await prisma.trustAcknowledgement.create({
    data: {
      idPatient,
      documentKey: 'cadre_accompagnement',
      documentVersion: cadre.version,
      // Le hash vient du registre lui aussi : la route de lecture le pose
      // ainsi (), et un littéral divergerait au
      // premier document révisé.
      contentHash: cadre.hash,
      type: 'pris_connaissance',
    },
  });
}

/** Les ratifications posées par le parcours, dans l'ordre où elles ont été
 *  écrites — le spec vérifie qu'un changement d'avis en AJOUTE une. */
export async function lireRatifications(
  idPatient: string,
): Promise<{ sens: string; idObjectif: string }[]> {
  return prisma.ratificationObjectif.findMany({
    where: { idPatient },
    select: { sens: true, idObjectif: true },
    orderBy: { creeLe: 'asc' },
  });
}

/**
 * Met un patient fictif dans l'état « reprise » attendu par la proposition de
 * pack de réévaluation (SP-SPI / LOT-01).
 *
 * Réservé à un patient qu'aucun autre spec n'utilise (Jennifer Martin,
 * PAT_SEED_02) : ce helper mute ses réponses et son état de compte, et deux
 * specs s'exécutent en parallèle sur la même base éphémère. L'appliquer à
 * `PAT_SEED_03` casserait `portail-parcours`.
 *
 * Trois écritures, toutes fidèles à un vrai patient qui revient après une longue
 * absence :
 *  1. un compte actif et non révoqué, sans coupe-circuit de session (le jeton
 *     permanent n'existe plus : colonnes de valeur purgées, D-085) ;
 *  2. ses réponses transmises antidatées au-delà du seuil de reprise
 *     (`SEUIL_REPRISE_MOIS`), pour que « la dernière fois » soit lointaine ;
 *  3. l'accusé de lecture du cadre TRUST déjà donné — un patient qui revient a
 *     consenti à l'origine —, ce qui fait sauter « Avant de commencer ».
 * Et une remise à zéro : aucune proposition antérieure, sinon la question ne se
 * reposerait pas.
 */
export async function preparerReprisePourTest(idPatient: string): Promise<void> {
  await prisma.patient.update({
    where: { idPatient },
    data: {
      accessTokenRevoked: false,
      actif: true,
      sessionsInvalidesAvant: null,
    },
  });

  // Bien au-delà de six mois : la reprise se déclenche sur la réponse la plus
  // récente, on antidate donc toutes les réponses seedées du patient.
  await prisma.questionnaireReponse.updateMany({
    where: { idPatient },
    data: { dateReponse: new Date('2025-01-01T00:00:00.000Z') },
  });

  const cadre = getDocumentCourant('cadre_accompagnement');
  await prisma.trustAcknowledgement.deleteMany({
    where: { idPatient, documentKey: 'cadre_accompagnement' },
  });
  await prisma.trustAcknowledgement.create({
    data: {
      idPatient,
      documentKey: 'cadre_accompagnement',
      documentVersion: cadre.version,
      contentHash: 'e2e-reprise',
      type: 'pris_connaissance',
    },
  });

  await prisma.packProposition.deleteMany({ where: { idPatient } });
}

/**
 * Pose l'accusé de lecture du cadre TRUST, et rien d'autre.
 *
 * `resetPortailState` l'efface, si bien qu'un spec qui ouvre le hub tombe sur
 * la séquence « Avant de commencer » (4 écrans) au lieu de l'écran qu'il teste.
 * `preparerReprisePourTest` le pose aussi, mais en antidatant les réponses —
 * ce qui déclencherait la bannière de reprise. D'où ce helper minimal.
 */
export async function accuserCadreTrust(idPatient: string): Promise<void> {
  const cadre = getDocumentCourant('cadre_accompagnement');
  await prisma.trustAcknowledgement.deleteMany({
    where: { idPatient, documentKey: 'cadre_accompagnement' },
  });
  await prisma.trustAcknowledgement.create({
    data: {
      idPatient,
      documentKey: 'cadre_accompagnement',
      documentVersion: cadre.version,
      contentHash: 'e2e-cadre',
      type: 'pris_connaissance',
    },
  });
}

/** Nettoie l'état de reprise laissé par un run (propositions ; le jeton n'existe plus). */
export async function nettoyerReprise(idPatient: string): Promise<void> {
  await prisma.packProposition.deleteMany({ where: { idPatient } });
}

export async function closePrisma(): Promise<void> {
  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
// Fixture « orientation → file d'envoi » (LOT-01, spec
// `orientation-file-envoi.spec.ts`). Réservée à Sophie Nicola (PAT_SEED_01) —
// c'est le patient de tous les specs praticien de fiche-trajectoire.
//
// `Q_STR_02` (PSS-10) est un moteur `sum` : `computeScoreFromDefBrut` calcule
// le total par simple SOMME des dix items (les items « inversés » du PSS-10
// portent déjà leurs valeurs retournées dans leur propre jeu d'options,
// `O_PSS_INVERSE` — `sumItems` ne réinverse rien ici, son second argument est
// un tableau vide en dur). Mettre chaque item à sa valeur maximale (5) suffit
// donc à atteindre le total maximal (50), fermement dans la bande `danger`
// (27-50) — prouvé par un test Vitest jetable avant d'écrire ce fichier :
// `calculateScore('Q_STR_02', RAW_ANSWERS_Q_STR_02_DANGER)` rend
// `{total: 50, interpretation: {color: 'danger', ...}}`. La règle exploitée,
// `R-STR-01`, se déclenche sur toute zone `warning`/`danger`/`dark` : le choix
// du maximum n'est pas arbitraire, il évite toute ambiguïté sur la borne.
const RAW_ANSWERS_Q_STR_02_DANGER: Record<string, number> = {
  P1: 5, P2: 5, P3: 5, P4: 5, P5: 5, P6: 5, P7: 5, P8: 5, P9: 5, P10: 5,
};

const ID_REPONSE_ORIENTATION_E2E_PREFIX = 'E2E_ORIENT_';

/**
 * Écrit une réponse `Q_STR_02` dont le `rawAnswers` recalcule en zone
 * `danger` — ce que `scoresRecalculesPourRaisonnement` exige pour ne pas rendre `null`
 * (voir `orientationService.ts`, qui IGNORE tout `scoresJson.total` déjà
 * stocké et recalcule depuis `rawAnswers`). Sans cette réponse, la règle
 * `R-STR-01` ne peut mordre : aucune passation du seed ne porte de
 * `rawAnswers`.
 *
 * `idAssignation: null` — comme les réponses historiques du seed — pour ne
 * pas se faire happer par le filtre `idAssignation: { not: null } }` d'autres
 * nettoyages (`resetPortailState`), qu'on n'utilise pas ici mais qu'on ne
 * veut pas non plus perturber.
 */
export async function provisionnerReponseOrientation(idPatient: string): Promise<void> {
  const patient = await prisma.patient.findUnique({ where: { idPatient }, select: { email: true } });
  if (!patient) throw new Error(`provisionnerReponseOrientation : patient introuvable (${idPatient})`);
  await prisma.questionnaireReponse.create({
    data: {
      idReponse: `${ID_REPONSE_ORIENTATION_E2E_PREFIX}${idPatient}`,
      idPatient,
      emailPatient: patient.email,
      idAssignation: null,
      idQuestionnaire: 'Q_STR_02',
      titre: 'Échelle de stress perçu (PSS-10)',
      dateReponse: new Date(),
      scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02_DANGER },
    },
  });
}

/**
 * Nettoyage chirurgical, PAS `resetPortailState` — et la raison n'est pas
 * celle qu'on croit. `resetPortailState` filtre ses réponses sur
 * `idAssignation: { not: null }` : elle ne supprimerait donc JAMAIS la
 * réponse posée ci-dessus, qui porte `idAssignation: null` comme le seed.
 * Elle est inadaptée à cette fixture, pas dangereuse pour elle — la garder
 * aurait laissé la passation `Q_STR_02` en place d'un run à l'autre.
 * On ne touche qu'à ce que ce spec a pu produire, dans un ordre sûr
 * vis-à-vis des clés étrangères :
 *   1. l'assignation `Q_STR_05` que l'étape « envoyer » a pu créer — sans ce
 *      nettoyage, une assignation ouverte laissée par un run précédent (ou
 *      par le projet Desktop Chromium avant que le projet iPhone 13 ne
 *      démarre) fait rendre `dejaAssigne: true` d'entrée, et le bouton
 *      « Ajouter à la file d'envoi » n'existe plus à cliquer ;
 *   2. le brouillon de file d'envoi de ce patient, RESTREINT au statut
 *      `brouillon` — l'ajout de l'étape 2 du spec. Sans ce filtre, le
 *      nettoyage emporterait aussi les brouillons `parti`, qui sont la trace
 *      des envois passés : inerte sur base éphémère, une perte d'historique
 *      silencieuse sur une base partagée. Toutes les lectures et écritures de
 *      la file filtrent déjà sur `brouillon`, le filtre n'affaiblit rien ;
 *   3. la réponse `Q_STR_02` fabriquée par `provisionnerReponseOrientation`,
 *      reconnue par son préfixe d'identifiant.
 */
export async function nettoyerOrientationFileEnvoi(idPatient: string): Promise<void> {
  await prisma.assignation.deleteMany({ where: { idPatient, idQuestionnaire: 'Q_STR_05' } });
  await prisma.envoiBrouillon.deleteMany({ where: { idPatient, statut: 'brouillon' } });
  await prisma.questionnaireReponse.deleteMany({
    where: { idPatient, idReponse: { startsWith: ID_REPONSE_ORIENTATION_E2E_PREFIX } },
  });
}

// ---------------------------------------------------------------------------
// Fixture « bilan transmis » — une synthèse validée ET l'envoi réussi qui la
// rend visible au patient. Les deux lignes comptent : la page « Mon bilan » ne
// sert QUE ce que le praticien a transmis (`BookletEnvoi.statut = 'Envoye'`),
// jamais une synthèse seulement validée. La fixture porte donc la paire.
//
// Le JSON embarque volontairement les trois blocs réservés au praticien (axes,
// vigilance, questions d'entretien) : sans eux, le spec ne prouverait pas
// qu'ils ne s'affichent pas.
const ID_SYNTHESE_E2E = 'SYN_E2E_BILAN_TRANSMIS';

export async function provisionBilanTransmis(
  idPatient: string,
  emailPatient: string,
  // `statutEnvoi` permet de jouer le contrôle NÉGATIF : un envoi en `Erreur`
  // n'a pas atteint le patient et ne doit rien rendre visible. Sans ce
  // paramètre, le spec ne prouverait que la moitié de la règle.
  options: { statutEnvoi?: 'Envoye' | 'Erreur' } = {},
): Promise<void> {
  await cleanupBilanTransmis();
  await prisma.syntheseIA.create({
    data: {
      idSynthese: ID_SYNTHESE_E2E,
      idPatient,
      emailPatient,
      modele: 'claude-opus-5',
      donneesEntree: { source: 'e2e-bilan-transmis' },
      syntheseJson: {
        resume_praticien: 'Résumé réservé au praticien',
        axes_prioritaires: [
          {
            axe: 'Sommeil',
            niveau_priorite: 'eleve',
            arguments: ['Réveils nocturnes répétés'],
            points_a_confirmer: ['Doser la ferritine'],
          },
        ],
        points_de_vigilance: ['Fatigue persistante à surveiller'],
        questions_entretien: ['Depuis quand dormez-vous mal ?'],
        narratif_patient: 'Vos réponses évoquent un sommeil fragmenté depuis plusieurs semaines.',
        limites: 'À valider en consultation.',
      },
      statut: 'Validee_Praticien',
      dateValidation: new Date('2026-07-18T09:00:00.000Z'),
      notesPraticien: 'On en reparle à votre prochain rendez-vous.',
    },
  });
  await prisma.bookletEnvoi.create({
    data: {
      idSynthese: ID_SYNTHESE_E2E,
      idPatient,
      emailPatientMasque: 'm***@fictif.wellneuro.fr',
      statut: options.statutEnvoi ?? 'Envoye',
      operation: 'Envoi',
      dateEnvoi: new Date('2026-07-18T09:30:00.000Z'),
      // L'instantané de ce qui est parti — ce que le portail sert. Il vaut ici
      // la note de la synthèse : c'est l'état juste après un envoi réel.
      noteTransmise: 'On en reparle à votre prochain rendez-vous.',
    },
  });
}

/**
 * Réécrit la note de la SYNTHÈSE après coup, sans rien envoyer — le geste
 * `annoter`, qui n'a aucune garde de cycle de vie. L'instantané de l'envoi
 * n'est pas touché : c'est exactement ce que le portail doit continuer de
 * servir, sans quoi un praticien publierait au patient un texte jamais
 * transmis, y compris sur un dossier clôturé.
 */
export async function annoterApresEnvoi(texte: string): Promise<void> {
  await prisma.syntheseIA.update({
    where: { idSynthese: ID_SYNTHESE_E2E },
    data: { notesPraticien: texte },
  });
}

/**
 * Rejette la synthèse déjà transmise — le geste du praticien qui s'aperçoit
 * après coup que le bilan était erroné. L'envoi reste en base (il a bien eu
 * lieu) ; c'est le rejet qui doit retirer le document de l'écran du patient.
 */
export async function rejeterBilanTransmis(): Promise<void> {
  await prisma.syntheseIA.update({
    where: { idSynthese: ID_SYNTHESE_E2E },
    data: { statut: 'Rejetee' },
  });
}

// L'envoi avant la synthèse : `booklet_envois.id_synthese` référence
// `syntheses_ia` sans cascade.
export async function cleanupBilanTransmis(): Promise<void> {
  await prisma.bookletEnvoi.deleteMany({ where: { idSynthese: ID_SYNTHESE_E2E } });
  await prisma.syntheseIA.deleteMany({ where: { idSynthese: ID_SYNTHESE_E2E } });
}

/**
 * Peuple la trajectoire d'un patient fictif d'un épisode T0 confirmé
 * (SP-TRAJ LOT-06) — le strict nécessaire pour que la Spirale ait un repère :
 * l'index se construit sur les épisodes confirmés, pas sur les valeurs. La
 * ligne est marquée par son id pour un nettoyage idempotent.
 *
 * Réservé à `PAT_SEED_03` (Michel Dogné) : aucun autre spec ne lit ses
 * épisodes — les parcours portail ne touchent pas `assessment_episodes`, et
 * les captures pixel du cockpit portent sur PAT_SEED_01.
 *
 * CETTE DERNIÈRE PHRASE N'EST PLUS VRAIE DEPUIS LE LOT-05 DE 6.0-B :
 * `provisionAncreJalon` pose un épisode T0 sur PAT_SEED_01, parce que la
 * fenêtre de jalon en a besoin. La contrainte tient toujours — trois specs
 * assertent que ce patient n'a aucun épisode confirmé — mais elle est
 * désormais tenue par le nettoyage de fin ET par `e2e/globalSetup.ts`, qui
 * répare un run tué. Toute fixture d'épisode neuve doit passer par le même
 * couple : un id réservé, et le balayage d'entrée.
 */
const ID_EPISODE_E2E = 'ep_e2e_spirale_peuplee';

export async function provisionEpisodeTrajectoire(idPatient: string): Promise<Date> {
  await cleanupEpisodeTrajectoire();
  const dateT0 = new Date('2026-06-01T09:00:00.000Z');
  await prisma.assessmentEpisode.create({
    data: {
      id: ID_EPISODE_E2E,
      idPatient,
      milestone: 'T0',
      targetAt: dateT0,
      confirmedAt: dateT0,
      payload: { source: 'e2e-spirale-peuplee' },
      payloadHash: 'e2e-spirale-peuplee',
      contractVersion: 'objets-cliniques-v1',
      cycleId: ID_EPISODE_E2E,
      versionScore: 'v1',
    },
  });
  return dateT0;
}

export async function cleanupEpisodeTrajectoire(): Promise<void> {
  await prisma.assessmentEpisode.deleteMany({ where: { id: ID_EPISODE_E2E } });
}

/**
 * L'ANCRE D'UNE FENÊTRE DE JALON, posée pour que `jalonObjectifDu` en ouvre une
 * MAINTENANT (Alliance 6.0-B, LOT-05).
 *
 * `confirmedAt` est calculé À REBOURS DE L'INSTANT COURANT, jamais figé au
 * calendrier : les fenêtres se mesurent contre l'horloge du serveur, et une
 * date en dur ouvrirait la bonne fenêtre le jour de son écriture puis plus
 * jamais. C'est exactement le défaut qu'un E2E est censé attraper.
 *
 * Id dédié, distinct de celui de la Spirale : les deux fixtures visent des
 * patients différents et ne doivent pas s'effacer l'une l'autre.
 */
const ID_EPISODE_JALON_E2E = 'ep_e2e_ancre_jalon';

export async function provisionAncreJalon(idPatient: string, joursDepuisT0: number): Promise<Date> {
  await cleanupAncreJalon();
  const dateT0 = new Date(Date.now() - joursDepuisT0 * 24 * 60 * 60 * 1000);
  await prisma.assessmentEpisode.create({
    data: {
      id: ID_EPISODE_JALON_E2E,
      idPatient,
      milestone: 'T0',
      targetAt: dateT0,
      confirmedAt: dateT0,
      payload: { source: 'e2e-ancre-jalon' },
      payloadHash: 'e2e-ancre-jalon',
      contractVersion: 'objets-cliniques-v1',
      cycleId: ID_EPISODE_JALON_E2E,
      versionScore: 'v1',
    },
  });
  return dateT0;
}

export async function cleanupAncreJalon(): Promise<void> {
  await prisma.assessmentEpisode.deleteMany({ where: { id: ID_EPISODE_JALON_E2E } });
}

/**
 * Une ratification posée EN BASE, pour amener un dossier de fixture à l'état
 * qu'un autre parcours exige. Le geste lui-même est couvert par sa propre
 * série : le rejouer par l'écran ferait dépendre le parcours d'étape d'un
 * parcours qui n'est pas son sujet.
 */
export async function provisionnerRatification(
  idPatient: string,
  idObjectif: string,
): Promise<void> {
  await prisma.ratificationObjectif.create({ data: { idPatient, idObjectif, sens: 'ratifie' } });
}

/** Les réponses d'étape d'un dossier de fixture, du plus récent au plus ancien. */
export async function lireReponsesJalon(
  idPatient: string,
): Promise<{ jalon: string; texte: string; eva: number | null }[]> {
  return prisma.reponseJalonObjectif.findMany({
    where: { idPatient },
    select: { jalon: true, texte: true, eva: true },
    orderBy: { creeLe: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Fixture « tirage caduc » (Atelier corpus, voie rapide) — reproduit l'état de
// WN-SRC-0056 : un tirage OUVERT dont le lot d'éligibles a divergé (ici : un
// claim VALIDÉ individuellement, donc plus aucun éligible voie rapide), rendant
// le tirage ni signable (etat_divergent) ni relançable → à clôturer par la
// nouvelle issue tirage_caduc. Tables SQL-brut (rag_corpus_*), hors modèles
// Prisma : SQL direct. Le claim est VALIDE (pas EN_ATTENTE) pour ne PAS peupler
// la file « En attente » que d'autres specs attendent vide.
const CADUC_SOURCE_ID = 'WN-SRC-0056';
const CADUC_CLAIM_PK = 'E2E_CADUC_0056_CLAIM';

export async function seedTirageCaducFixture(): Promise<string> {
  // Idempotence : claim propre à chaque run (table normale, DELETE permis).
  await prisma.$executeRawUnsafe(
    `DELETE FROM public.rag_corpus_claims WHERE id = '${CADUC_CLAIM_PK}'`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO public.rag_corpus_claims
       (id, claim_id, source_id, version_claim, texte_normalise, content_sha256,
        typologie_lecture, prescriptif, statut, validateur, valide_at,
        embedding_model, embedding_dimensions, embedding)
     VALUES
       ('${CADUC_CLAIM_PK}', 'WN-CL-0056-901', '${CADUC_SOURCE_ID}', 'v1.0',
        'claim e2e caduc', repeat('e', 64), 'déclaré', false,
        'VALIDE', 'e2e@wellneuro.fr', now(), 'e2e', 1536,
        ('[' || repeat('0,', 1535) || '0]')::extensions.vector)`,
  );
  // Tirage OUVERT (sans issue) dont les éligibles figés ne correspondent plus
  // au lot courant (vide, le claim étant VALIDE) → tirageOuvertDeSource le rend
  // avec caduc = true, et la modale propose la clôture.
  await prisma.$executeRawUnsafe(
    `INSERT INTO public.rag_corpus_claim_decisions (type_acte, validateur, source_id, echantillon)
     VALUES ('tirage_echantillon', 'e2e@wellneuro.fr', '${CADUC_SOURCE_ID}',
             '{"seed":1,"taux":0.3,"taille":1,"lot":1,"eligibles":["E2E_CADUC_0056_GHOST"],"tires":["E2E_CADUC_0056_GHOST"]}'::jsonb)`,
  );
  return CADUC_SOURCE_ID;
}

// Le journal des décisions est append-only (DELETE bloqué par trigger) : on ne
// nettoie que le claim — la source disparaît alors de la vue d'ensemble ; les
// lignes de tirage/clôture restent comme trace, inertes pour les autres specs.
export async function cleanupTirageCaducFixture(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM public.rag_corpus_claims WHERE id = '${CADUC_CLAIM_PK}'`,
  );
}

// ---------------------------------------------------------------------------
// Fixture « surface biologie » (LOT-02 de 2026-08-18-biologie-consolidee) —
// de quoi rendre la proposition de bilan NON VIDE, et la phase Actions
// ATTEIGNABLE. Les deux conditions comptent, et la seconde ne va pas de soi :
//
// LE T0 CONFIRMÉ EST LA CONDITION D'EXISTENCE DU PANNEAU, et c'est ce que le
// cadrage n'avait pas vu : `ClinicalRuntimeSection` n'appelle
// `loadProposition()` que si `readyDecisionCardId` existe, donc seulement
// après confirmation d'un épisode T0. La proposition ne peut pas être demandée
// avant. La fixture provisionne donc les TROIS conditions dures recalculées en
// base par `preconditionsT0Prisma.ts` — rideau cotable, anamnèse consignée,
// synthèse validée postérieure au rideau — puis le spec pose le geste
// praticien de confirmation.
//
// Une passation `Q_STR_02` en zone `danger` suffit : c'est le déclencheur de
// `PANEL_STRESS_1` (indicationsBiologieV1.ts, BIO-STR-01, mode `conditionnel`,
// lui-même dans `STATUTS_PROPOSES`), donc la proposition porte au moins une
// ligne ET le formulaire de courrier s'affiche.
//
// PAS d'épisode confirmé, et c'est un correctif de revue : la première version
// en provisionnait un « pour rendre la phase Actions atteignable ». C'était
// FAUX — `ClinicalRuntimeSection` reste monté en permanence et les onglets de
// phase sont toujours cliquables (FichePatientPanel.tsx, [[D-072]] §4) : seul
// l'affichage est filtré. L'épisode n'aurait fait qu'ajouter de l'état à un
// patient fictif partagé, sur une justification inventée.
//
// Le catalogue des panels n'est PAS provisionné ici : il entre par la migration
// de données `20260817090000_catalogue_biologie_niveau_1_donnees`, que toute
// base éphémère applique. Le fabriquer ici masquerait sa disparition.
//
// Tout ce que cette fixture produit porte une MARQUE, et le nettoyage ne
// reconnaît qu'elle : préfixe d'identifiant pour la passation, libellé de
// médecin pour la lettre, date de bilan pour le panel déclaré. Sur la base
// partagée du Mac, un `deleteMany` sur le seul `idPatient` emporterait des
// données faites à la main sur ce dossier fictif — le spec n'est pas
// propriétaire du patient, seulement de ce qu'il y écrit.
const ID_REPONSE_BIO_E2E_PREFIX = 'E2E_BIO_';
/** Consultation et synthèse de la fixture — marquées, comme le reste. */
const ID_CONSULTATION_BIO_E2E = 'E2E_BIO_CONSULT';
const ID_SYNTHESE_BIO_E2E = 'E2E_BIO_SYNTHESE';
/** Destinataire de la lettre établie par le parcours — sa seule marque. */
export const MEDECIN_BIO_E2E = 'Dr Dogné (banc E2E biologie)';
/** Date du bilan déclaré par le parcours — la marque du panel documenté. */
export const DATE_BILAN_BIO_E2E = new Date('2026-07-15T00:00:00.000Z');

export async function provisionnerDossierBiologie(idPatient: string): Promise<void> {
  const patient = await prisma.patient.findUnique({ where: { idPatient }, select: { email: true } });
  if (!patient) throw new Error(`provisionnerDossierBiologie : patient introuvable (${idPatient})`);

  await nettoyerDossierBiologie(idPatient);

  await prisma.questionnaireReponse.create({
    data: {
      idReponse: `${ID_REPONSE_BIO_E2E_PREFIX}${idPatient}`,
      idPatient,
      emailPatient: patient.email,
      idAssignation: null,
      idQuestionnaire: 'Q_STR_02',
      titre: 'Échelle de stress perçu (PSS-10)',
      dateReponse: new Date(),
      scoresJson: { rawAnswers: RAW_ANSWERS_Q_STR_02_DANGER },
    },
  });

  // ── Condition dure 1 : le premier rideau, renseigné et COTABLE ───────────
  // `statutValidite: 'VALID'` et des `rawAnswers` réelles : un `scoresJson`
  // précalculé (la forme du seed) ne compte PAS — `passationExploitable`
  // recalcule par `scoresRecalculesPourRaisonnement`, qui exige `rawAnswers`.
  await prisma.questionnaireReponse.createMany({
    data: passationsRideauT0(DATE_RIDEAU_FIXTURE, PLAINTES_DIGESTIF_ET_PONDERAL).map(
      passation => ({
        idReponse: `${ID_REPONSE_BIO_E2E_PREFIX}${passation.idQuestionnaire}_${idPatient}`,
        idPatient,
        emailPatient: patient.email,
        idAssignation: null,
        idQuestionnaire: passation.idQuestionnaire,
        titre: `${passation.idQuestionnaire} — rideau T0 (banc E2E biologie)`,
        dateReponse: passation.dateReponse,
        // `rawAnswers` est un `Record<string, unknown>` dérivé du catalogue :
        // le typage Json de Prisma ne l'accepte pas tel quel. Cast local, la
        // valeur est bien un objet JSON pur.
        scoresJson: passation.scoresJson as unknown as Prisma.InputJsonValue,
        statutValidite: passation.statutValidite,
      }),
    ),
  });

  // ── Condition dure 2 : une consultation VALIDÉE portant un motif ─────────
  await prisma.consultation.create({
    data: {
      idConsultation: `${ID_CONSULTATION_BIO_E2E}_${idPatient}`,
      idPatient,
      emailPatient: patient.email,
      praticienEmail: PRATICIEN_EMAIL,
      statut: 'validee',
      anamnese: CONSULTATION_VALIDEE_FIXTURE.anamnese,
      dateValidation: SYNTHESE_VALIDEE_FIXTURE.dateValidation,
    },
  });

  // ── Condition dure 3 : une synthèse validée POSTÉRIEURE au rideau ────────
  // `dateValidation` fait foi, et la fixture partagée la place déjà après
  // `DATE_RIDEAU_FIXTURE` — la reprendre telle quelle plutôt que d'en choisir
  // une, c'est laisser la condition et la fixture bouger ensemble.
  await prisma.syntheseIA.create({
    data: {
      idSynthese: `${ID_SYNTHESE_BIO_E2E}_${idPatient}`,
      idPatient,
      emailPatient: patient.email,
      modele: 'banc-e2e-biologie',
      donneesEntree: { source: 'fixture E2E biologie — aucune génération réelle' },
      syntheseJson: { source: 'fixture E2E biologie — aucun contenu clinique' },
      statut: SYNTHESE_VALIDEE_FIXTURE.statut,
      dateValidation: SYNTHESE_VALIDEE_FIXTURE.dateValidation,
    },
  });
}

/**
 * Nettoyage CHIRURGICAL — jamais `resetPortailState` : elle filtre ses
 * réponses sur `idAssignation: { not: null }` et laisserait donc en place la
 * passation fabriquée ci-dessus, qui porte `idAssignation: null` comme le
 * seed. D'un run à l'autre, la proposition resterait alimentée par une donnée
 * que le run courant n'a pas posée.
 *
 * Ordre sûr vis-à-vis des clés étrangères, et chaque ligne bornée à ce que ce
 * spec produit :
 *   1. la lettre du parcours, reconnue à son DESTINATAIRE — pas « toutes les
 *      correspondances sortantes du patient », qui emporterait les lettres
 *      posées à la main sur ce dossier (constat de revue) ;
 *   2. le panel déclaré, reconnu à la DATE de bilan que le parcours saisit ;
 *   3. la passation fabriquée, reconnue à son préfixe.
 */
/**
 * Les versions de protocole et les arbitrages posés PAR LE RUN COURANT.
 *
 * Les arbitrages PARTENT EN PREMIER : ils citent une version
 * (`protocol_draft_id`), et ce qui s'appuie sur une ligne part avant elle.
 *
 * Borne temporelle, comme les documents et les mesures — `arbitre_le` et
 * `created_at` sont posés par la base. Le fil de versions du dossier de fixture
 * n'appartient à personne d'autre, mais le borner évite d'emporter une version
 * qu'un autre parcours aurait laissée derrière lui.
 */
export async function nettoyerProtocoleEtArbitrages(
  idPatient: string,
  depuis: Date,
): Promise<void> {
  await prisma.arbitrageBiologique.deleteMany({
    where: { idPatient, arbitreLe: { gte: depuis } },
  });
  await prisma.protocolDraft.deleteMany({
    where: { idPatient, createdAt: { gte: depuis } },
  });
}

/**
 * Les résultats biologiques consignés PAR LE RUN COURANT, et eux seuls.
 *
 * Même borne temporelle que les documents patient, et pour la même raison :
 * `saisi_le` est posé par la base (c'est ce qui rend une mesure
 * inantidatable) et la table est append-only. Sans ramassage, la garde
 * anti-doublon du run suivant buterait sur une mesure qu'il n'a pas posée.
 */
export async function nettoyerResultatsBiologiques(
  idPatient: string,
  depuis: Date,
): Promise<void> {
  await prisma.resultatBiologique.deleteMany({
    where: { idPatient, saisiLe: { gte: depuis } },
  });
}

/**
 * Les documents patient consignés PAR LE RUN COURANT, et eux seuls.
 *
 * La table n'a aucune marque exploitable — pas de destinataire comme la
 * lettre, pas de date saisie comme le panel déclaré : le texte est dérivé, et
 * `genere_le` est posé par la base. Supprimer « tous les documents du dossier »
 * emporterait ceux qu'un autre geste aurait posés sur la fixture ; la borne est
 * donc TEMPORELLE — l'instant relevé avant le premier geste du parcours.
 *
 * Append-only : ces lignes ne s'effacent jamais en production, et c'est le
 * régime. Ici, la fixture est un dossier de test dont le parcours est seul
 * producteur ; ne pas ramasser ferait grossir la table à chaque run et rendrait
 * la garde anti-doublon dépendante de l'historique des runs précédents.
 */
export async function nettoyerDocumentsPatientBiologie(
  idPatient: string,
  depuis: Date,
): Promise<void> {
  await prisma.documentPatientBiologie.deleteMany({
    where: { idPatient, genereLe: { gte: depuis } },
  });
}

export async function nettoyerDossierBiologie(idPatient: string): Promise<void> {
  // L'épisode que la confirmation du spec a PERSISTÉ (`D-118`). Avant cette
  // décision le POST cockpit n'écrivait rien et il n'y avait rien à ramasser ;
  // depuis, une ligne oubliée ici ferait rejouer la carte au projet suivant —
  // et le bouton « Confirmer l'épisode T0 » que le spec attend n'apparaîtrait
  // jamais. Supprimé AVANT les passations : l'épisode cite des réponses, ce
  // qui s'appuie sur une passation part avant elle.
  await prisma.assessmentEpisode.deleteMany({
    where: { idPatient, id: `runtime-episode-${idPatient}-T0` },
  });
  await prisma.correspondanceMedecin.deleteMany({
    where: { idPatient, medecinLibelle: MEDECIN_BIO_E2E },
  });
  await prisma.panelBiologieDocumente.deleteMany({
    where: { idPatient, documenteLe: DATE_BILAN_BIO_E2E },
  });
  await prisma.syntheseIA.deleteMany({
    where: { idPatient, idSynthese: `${ID_SYNTHESE_BIO_E2E}_${idPatient}` },
  });
  await prisma.consultation.deleteMany({
    where: { idPatient, idConsultation: `${ID_CONSULTATION_BIO_E2E}_${idPatient}` },
  });
  // Les passations en dernier : la synthèse et la consultation ne les
  // référencent pas, mais l'ordre reste celui du dossier — ce qui s'appuie sur
  // une passation part avant elle.
  await prisma.questionnaireReponse.deleteMany({
    where: { idPatient, idReponse: { startsWith: ID_REPONSE_BIO_E2E_PREFIX } },
  });
}
