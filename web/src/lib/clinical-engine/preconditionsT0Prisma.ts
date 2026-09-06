import { prisma } from '../prisma';
import { estAncreDeCycle } from '../protocol/cycles';
import { ANAMNESE_CHAMP_REQUIS } from '../consultation/anamnese';
import { ORDRE_CONSULTATION_PORTEUSE, whereConsultationPorteuse } from '../consultation/consultationPorteuse';
import { contradictionsPourPatient } from '../clinical/contradictionsService';
import {
  STATUTS_SYNTHESE_VALIDEE,
  evaluerPreconditionsT0,
  messageRefusPreconditions,
  type EntreesPreconditionsT0,
  type PreconditionsT0,
} from './preconditionsT0';

/**
 * Lecture en base des entrées de préconditions T0 ([[D-052]]).
 *
 * TOUJOURS DEPUIS LA BASE, JAMAIS DEPUIS LE CORPS DE REQUÊTE. L'épisode qui
 * atteint les points de persistance transite par le navigateur
 * (`ClinicalRuntimeSection` le renvoie au POST) : une précondition qui lirait
 * ce qu'elle doit vérifier serait un contrôle client déguisé, ce que le lot
 * s'interdit explicitement.
 *
 * Ce module NE FAIT PAS : ni authentification, ni contrôle d'appartenance, ni
 * journalisation d'accès — mêmes frontières qu'`orientationService`. C'est
 * l'appelant qui les porte, et les trois routes appellent APRÈS leur garde
 * d'appartenance : on ne lit pas le dossier d'un patient qu'on n'a pas prouvé
 * sien.
 *
 * REQUÊTE DÉLIBÉRÉMENT REDONDANTE côté cockpit, qui a déjà lu les passations
 * dans `loadRuntimeInputs` : le prix d'une lecture de plus achète un chemin de
 * calcul UNIQUE pour les trois routes. Trois calculs qui divergeraient
 * refuseraient un T0 à un endroit et l'accepteraient à un autre.
 */
export async function chargerEntreesPreconditionsT0(idPatient: string): Promise<EntreesPreconditionsT0> {
  const [passations, consultation, synthese, contradictions] = await Promise.all([
    prisma.questionnaireReponse.findMany({
      where: { idPatient },
      select: {
        idQuestionnaire: true,
        dateReponse: true,
        scoresJson: true,
        statutValidite: true,
      },
      orderBy: [{ dateReponse: 'asc' }],
    }),
    // La consultation VALIDÉE la plus récente QUI PORTE UNE ANAMNÈSE : une
    // anamnèse portée par une consultation non validée n'est pas consignée,
    // elle est en cours ; et une consultation validée sans anamnèse ne dit
    // rien qu'on puisse lire ([[D-101]], `consultationPorteuse.ts`).
    prisma.consultation.findFirst({
      where: whereConsultationPorteuse(idPatient),
      select: { anamnese: true },
      orderBy: ORDRE_CONSULTATION_PORTEUSE,
    }),
    // La dernière synthèse VALIDÉE, et non la dernière ligne : chaque
    // génération crée une ligne neuve au statut `Brouillon_IA`. Sans ce
    // filtre, régénérer une synthèse pour la relire bloquait le T0 d'un
    // dossier qui en portait une validée, avec le message « Aucune synthèse
    // validée par le praticien » — factuellement faux (revue du 2026-08-12).
    // Tri sur `dateValidation` : c'est elle qui date la validation, quand
    // `createdAt` date la génération.
    prisma.syntheseIA.findFirst({
      where: { idPatient, statut: { in: [...STATUTS_SYNTHESE_VALIDEE] } },
      select: { statut: true, dateValidation: true },
      orderBy: [{ dateValidation: 'desc' }, { createdAt: 'desc' }],
    }),
    contradictionsPourPatient(idPatient),
  ]);

  return {
    passations: passations.map(passation => ({
      idQuestionnaire: passation.idQuestionnaire,
      dateReponse: passation.dateReponse,
      scoresJson: passation.scoresJson,
      statutValidite: passation.statutValidite,
    })),
    anamnese: consultation?.anamnese ?? null,
    consultationValidee: consultation !== null,
    synthese: synthese ? { statut: synthese.statut, dateValidation: synthese.dateValidation } : null,
    // RECOPIE, JAMAIS COMPOSITION (`D-119`) : la description est celle du
    // service, telle quelle ; la passation est son instrument et sa date
    // lisible, joints par un tiret de mise en page. Rien n'est reformulé —
    // la checklist cite, elle n'écrit pas.
    contradictionsOuvertes: contradictions.map((constat) => ({
      description: constat.description,
      passations: constat.passations.map(
        (passation) => `${passation.idQuestionnaire} — ${passation.dateLisible}`,
      ),
    })),
  };
}

/** Raccourci des trois routes : lire, puis évaluer. */
export async function preconditionsT0PourPatient(idPatient: string): Promise<PreconditionsT0> {
  return evaluerPreconditionsT0(await chargerEntreesPreconditionsT0(idPatient));
}

/**
 * Le jalon d'un épisode, DÉRIVÉ de son identifiant quand c'est possible.
 *
 * POURQUOI PAS `episode.milestone` SEUL : il vient du corps de requête. La
 * revue du 2026-08-12 l'a montré — déclarer `milestone: 'J21'` sur un épisode
 * dont l'identifiant est celui du T0 désactivait la porte, et comme la
 * persistance est un `upsert(..., update: {})`, l'identifiant T0 du patient
 * était squatté DÉFINITIVEMENT par une ligne de suivi.
 *
 * L'identifiant runtime est `runtime-episode-<patient>-<jalon>`
 * (`runtimeFromPrisma.ts`) : son suffixe fait foi contre le champ déclaré. Un
 * identifiant hors de ce format (fixtures, contrats externes) retombe sur le
 * champ, faute de mieux — c'est dit plutôt que supposé.
 */
// La série des ancres est OUVERTE depuis `D-113` : l'alternative littérale
// `T0` ne reconnaissait pas `-T1` en fin d'identifiant, et retombait donc sur
// le champ déclaré — exactement la source qu'on existe pour ne pas croire.
const SUFFIXE_JALON = /-(T(?:0|[1-9][0-9]*)|J21|J42|J90)$/;

/** Le jalon lisible dans l'identifiant, ou `null` hors format runtime. */
function suffixeJalon(assessmentEpisodeId?: string): string | null {
  return SUFFIXE_JALON.exec(assessmentEpisodeId ?? '')?.[1] ?? null;
}

function jalonEffectif(episode: { assessmentEpisodeId?: string; milestone: string }): string {
  return suffixeJalon(episode.assessmentEpisodeId) ?? episode.milestone;
}

/**
 * REFUS D'UN ÉPISODE QUI SE CONTREDIT LUI-MÊME.
 *
 * `jalonEffectif` faisait primer le suffixe de l'identifiant sur le champ
 * déclaré. Cela fermait un sens de l'écart — déclarer `J21` sur l'identifiant
 * d'une ancre ne désactive pas la porte — mais laissait l'autre grand ouvert :
 * poster l'identifiant d'un `J21` en déclarant `T1` faisait rendre `J21`, donc
 * la porte `D-052` ne s'évaluait PAS, et c'est pourtant `milestone: 'T1'` qui
 * partait en base et se relisait ensuite comme une ancre. Un cycle s'ouvrait
 * sans rideau d'entrée.
 *
 * DÉPARTAGER EST LE DÉFAUT, PAS LA CORRECTION : les deux champs viennent du
 * même corps de requête, aucun ne mérite plus de crédit que l'autre, et une
 * chaîne de provenance ne se construit pas sur un arbitrage muet (`DC-30`).
 * Un épisode dont l'identifiant et le jalon se contredisent est refusé.
 *
 * Un identifiant HORS format runtime (fixtures, contrats externes) ne
 * contredit rien : il n'affirme aucun jalon.
 */
export function refusJalonContredit(
  episode: { assessmentEpisodeId?: string; milestone: string },
): string | null {
  const suffixe = suffixeJalon(episode.assessmentEpisodeId);
  if (suffixe === null || suffixe === episode.milestone) return null;
  return `Épisode incohérent : son identifiant porte « ${suffixe} » et son jalon déclaré est « ${episode.milestone} ». Rechargez la proposition.`;
}

/**
 * Garde des points de persistance DU PROTOCOLE ([[D-052]]).
 *
 * Le cockpit — troisième point de persistance depuis `D-118` — n'en a pas
 * besoin : il CONSTRUIT la trace de contournement côté serveur (auteur et
 * horodatage posés par la session) avant d'écrire. Ici, l'épisode arrive du
 * NAVIGATEUR, donc rien de ce qu'il porte ne fait foi : les conditions dures
 * sont recalculées en base, et la trace de contournement est VÉRIFIÉE CHAMP
 * PAR CHAMP contre la session et contre les conditions réellement en défaut.
 *
 * Elle est vérifiée plutôt que réécrite : réécrire `decidePar` ferait diverger
 * l'épisode de celui qui a été haché dans `snapshot.inputHash`, et casserait
 * la chaîne de provenance que ces routes existent pour tenir.
 *
 * HORS ANCRE, aucune précondition : les jalons de suivi (J21, J42, J90) ne sont
 * pas gouvernés par cette porte. Le test portait sur le seul littéral `T0` :
 * ouvrir un deuxième cycle en `T1` aurait franchi la persistance SANS rideau,
 * alors qu'ouvrir un cycle est le même acte quel que soit son rang (`D-052`,
 * `D-113` §2).
 */
export async function refusPreconditionsPersistance(
  episode: {
    patientId: string;
    milestone: string;
    assessmentEpisodeId?: string;
    confirmedAt?: string | null;
    preconditionOverrides?: { conditionId?: string; motif?: string; decidePar?: string; decideLe?: string }[];
  },
  emailPraticienSession: string,
): Promise<string | null> {
  // La contradiction d'abord : elle se juge sans la base, et elle vaut pour
  // TOUT jalon — y compris ceux que la porte laisse passer. La trancher en
  // silence, c'est écrire une ancre sans rideau (`refusJalonContredit`).
  const contradiction = refusJalonContredit(episode);
  if (contradiction) return contradiction;

  if (!estAncreDeCycle(jalonEffectif(episode))) return null;

  const preconditions = await preconditionsT0PourPatient(episode.patientId);
  if (preconditions.bloquant) return messageRefusPreconditions(preconditions);

  const requis = new Set(preconditions.contournementsRequis);
  const overrides = episode.preconditionOverrides ?? [];

  for (const override of overrides) {
    const conditionId = override?.conditionId ?? '';
    // UN CONTOURNEMENT SANS OBJET N'EST PAS LA MÊME CHOSE QU'UNE TRACE
    // HISTORIQUE (`D-129`). La règle d'origine refusait tout override dont la
    // condition n'est plus en défaut, pour empêcher « la trace d'un arbitrage
    // qui n'a jamais eu lieu ». Mais une condition souple SE RÉSOUT : la
    // contradiction est levée, la passation est repassée. L'arbitrage, lui, a
    // bien eu lieu — et sa ligne est la seule à en faire foi. L'effacer au
    // premier geste anodin du praticien perdrait qui a passé outre, quand et
    // pourquoi.
    //
    // La distinction se fait sur la DATE, pas sur la condition : un override
    // dont la décision est ANTÉRIEURE à cette confirmation est une trace, et se
    // conserve. Un override fabriqué à l'instant pour une condition qui n'est
    // pas en défaut reste refusé — c'est ce que la règle protégeait.
    if (!requis.has(conditionId)) {
      const decideLe = override?.decideLe ?? '';
      const anterieur =
        typeof episode.confirmedAt === 'string' && decideLe !== '' && decideLe < episode.confirmedAt;
      if (!anterieur) {
        return `Contournement sans objet : la condition « ${conditionId || 'inconnue'} » n’est pas en défaut sur ce dossier.`;
      }
      // Trace historique : on ne recoupe ni l'auteur ni la borne de date
      // ci-dessous, qui valent pour un arbitrage rendu AVEC cet épisode.
      continue;
    }
    if (typeof override.motif !== 'string' || override.motif.trim() === '') {
      return `Un motif est requis pour passer outre l’avertissement « ${conditionId} ».`;
    }
    // L'auteur et l'horodatage sont posés par le serveur au moment de la
    // confirmation. Les recevoir du navigateur sans les recouper laisserait
    // attribuer un contournement à un autre praticien, ou le dater à volonté,
    // dans la seule ligne qui en fera foi pour toujours.
    // Une session sans email ne peut authentifier aucun auteur : le
    // contournement est alors refusé, jamais accepté par défaut.
    if (!emailPraticienSession || override.decidePar !== emailPraticienSession) {
      return 'La justification de contournement ne porte pas l’auteur de la session.';
    }
    const decideLe = override.decideLe ?? '';
    if (Number.isNaN(new Date(decideLe).getTime()) || new Date(decideLe).toISOString() !== decideLe) {
      return 'La justification de contournement porte une date invalide.';
    }
    // LA FORME NE SUFFISAIT PAS, et le commentaire ci-dessus décrivait déjà le
    // risque qu'il ne fermait pas : « le dater à volonté ». Toute date ISO
    // syntaxiquement valide était acceptée et persistée — un contournement
    // pouvait porter un horodatage arbitraire dans la seule ligne qui en fera
    // foi.
    //
    // RECOUPÉ, PAS RÉÉCRIT : réécrire ferait diverger l'épisode de celui qui a
    // été haché dans `snapshot.inputHash`, et casserait la chaîne de provenance
    // que ces routes existent pour tenir. Le recoupement n'invente aucune
    // tolérance : le cockpit pose UN SEUL horodatage pour l'épisode, le
    // snapshot, la revue et la carte (« UN SEUL HORODATAGE (`now`) »,
    // `cockpit/route.ts`). Un contournement décidé à la confirmation porte donc
    // EXACTEMENT l'instant de cette confirmation.
    //
    // Ce que ce contrôle NE ferme PAS, et qui reste ouvert : un épisode dont
    // `confirmedAt` lui-même serait forgé reste cohérent avec ses
    // contournements. L'ancrage de `confirmedAt` sur une preuve serveur est un
    // chantier distinct. Trouvé par la contre-revue adverse du 2026-08-27
    // (affirmation `N1.8`).
    // BORNE, ET NON ÉGALITÉ STRICTE (`D-129`, arbitrage du 2026-09-06).
    // L'égalité interdisait de justifier un avertissement APPARU depuis l'acte :
    // le dater de l'acte l'aurait antidaté, le dater du jour rendait le dossier
    // non enregistrable. Il n'y avait donc aucune écriture possible, et la
    // re-confirmation — celle que `D-129` existe pour ne plus perdre — était
    // refusée sur tout dossier où une condition souple était apparue.
    //
    // Ce que la règle protégeait est CONSERVÉ : elle existait pour empêcher un
    // horodatage arbitraire, « daté à volonté », dans la seule ligne qui en
    // fait foi. La borne `confirmedAt <= decideLe <= maintenant` l'empêche
    // toujours — on ne peut ni remonter avant l'acte, ni projeter dans le
    // futur. Elle autorise seulement ce qui est vrai : un arbitrage rendu
    // aujourd'hui porte la date d'aujourd'hui, sur un acte qui garde la sienne.
    if (typeof episode.confirmedAt !== 'string' || decideLe < episode.confirmedAt) {
      return 'La justification de contournement est datée avant la confirmation de l’épisode.';
    }
    if (decideLe > new Date().toISOString()) {
      return 'La justification de contournement est datée dans le futur.';
    }
  }

  const couvertes = new Set(overrides.map(override => override?.conditionId ?? ''));
  const nonJustifiees = preconditions.contournementsRequis.filter(id => !couvertes.has(id));
  if (nonJustifiees.length > 0) {
    return `Un motif est requis pour passer outre l’avertissement « ${nonJustifiees[0]} ».`;
  }
  return null;
}

// Ré-export : les routes n'ont besoin que de ce module, et le champ requis de
// l'anamnèse sert au message d'erreur comme à l'écran.
export { ANAMNESE_CHAMP_REQUIS };
