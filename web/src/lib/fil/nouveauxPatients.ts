/**
 * Encart « Nouveaux patients » du Fil du jour — fonctions pures, sans accès
 * base : la route `api/praticien/nouveaux-patients` fournit les lignes, ce
 * module décide ce qui manque et le nomme.
 *
 * POURQUOI CET ENCART. Un dossier neuf traverse trois portes AVANT d'exister
 * cliniquement, et aucune ne rend compte au praticien :
 *
 * 1. l'e-mail d'accès part à la CRÉATION DE LA CONSULTATION, pas à la
 *    création du compte (`api/praticien/consultations`) — un patient créé
 *    sans consultation n'a rien reçu, sauf lien magique émis depuis sa fiche
 *    (`api/praticien/token`, action `lien_magique`) ou redemandé par lui-même
 *    (`api/portail/lien/demande`) ;
 * 2. le patient doit ENTRER dans le portail par l'un des deux chemins (lien
 *    magique ou Google) — l'e-mail parti ne dit rien de l'entrée ;
 * 3. le pack de base n'est assigné qu'à la VALIDATION de l'onboarding par le
 *    patient (`api/portail/valider`) — jamais à la création du dossier.
 *
 * Chacune de ces portes peut rester fermée sans qu'aucun écran ne rougisse :
 * le dossier est simplement vide, et un dossier vide ressemble à un dossier
 * qui commence. L'encart nomme la porte fermée, il ne la force pas — l'action
 * (renvoyer l'accès, assigner un pack) reste au dossier, comme le reste.
 */

/** Étape franchie la plus avancée — l'ordre du type EST l'ordre du parcours.
 *
 * `dossier_desactive` et `acces_revoque` ouvrent la liste sans faire partie du
 * parcours : ce ne sont pas des portes restées fermées mais des portes
 * REFERMÉES, par le praticien lui-même. Elles priment donc sur les trois
 * autres, qui décrivent une mise en service en cours — ce qu'un dossier fermé
 * n'est plus. Entre les deux, l'ordre est une CONVENTION D'AFFICHAGE et non une
 * hiérarchie de gravité : les deux fermetures sont de largeur équivalente. La
 * révocation ferme elle aussi les liens en vol, et invalide en plus les
 * sessions déjà ouvertes (`sessionsInvalidesAvant`) que la désactivation, elle,
 * laisse simplement expirer. Aucune des deux ne compte « en attente », toutes
 * deux portent la même variante neutre : la place ne décide de rien d'autre. */
export type EtapeNouveauPatient =
  | 'dossier_desactive'
  | 'acces_revoque'
  | 'acces_non_envoye'
  | 'jamais_connecte'
  | 'onboarding_a_finir'
  | 'pack_absent'
  | 'complet';

export type SourceNouveauPatient = {
  idPatient: string;
  /** « Prénom Nom » — jamais l'adresse e-mail : l'encart identifie, il ne
   * republie pas un contact que le dossier porte déjà. */
  patient: string;
  /** Création du dossier (ISO). */
  creeLe: string;
  /** Le praticien a désactivé le dossier (`actif: false`). Fermeture la plus
   * large : les trois entrées sont coupées et les liens en vol fermés. */
  dossierDesactive: boolean;
  /** Le praticien a révoqué l'accès au portail (`accessTokenRevoked`). Aucune
   * porte n'est à ouvrir : il vient de la fermer. */
  accesRevoque: boolean;
  /** Dernier e-mail d'OUVERTURE D'ACCÈS effectivement parti (ISO), sinon null.
   * `acces_portail` et `lien_magique` indifféremment : les deux ouvrent le
   * dossier, et n'en compter qu'un affichait « Accès non envoyé » à des
   * dossiers déjà servis. */
  accesEnvoyeLe: string | null;
  /** Une tentative d'envoi a échoué ou n'est jamais partie, rien n'a abouti
   * depuis, ET LE PATIENT N'EST PAS ENTRÉ. Distinct de « jamais tenté » : l'un
   * se renvoie, l'autre se crée. La dernière condition est posée par la route :
   * un échec d'envoi postérieur à l'entrée est un incident de correspondance,
   * pas une porte restée fermée — et cette étape passe AVANT `connecteLe`. */
  accesEnEchec: boolean;
  /** Première entrée EFFECTIVE dans le portail (lien magique consommé ou
   * connexion Google aboutie), sinon null. */
  connecteLe: string | null;
  /** Onboarding validé par le patient — une consultation au statut `validee`. */
  onboardingValide: boolean;
  /** Assignations portées par le dossier, tous packs confondus. */
  nbAssignations: number;
};

export type LigneNouveauPatient = SourceNouveauPatient & {
  etape: EtapeNouveauPatient;
  /** Ce qui manque, en clair — jamais une couleur seule (règle de relief A5-R1). */
  libelle: string;
};

const LIBELLES: Record<EtapeNouveauPatient, string> = {
  dossier_desactive: 'Dossier désactivé',
  acces_revoque: 'Accès révoqué',
  acces_non_envoye: 'Accès non envoyé',
  jamais_connecte: 'Jamais connecté',
  onboarding_a_finir: 'Onboarding à finir',
  pack_absent: 'Pack de base absent',
  complet: 'Accès et pack de base OK',
};

/**
 * Première porte restée fermée. L'ordre des tests EST l'ordre du parcours :
 * inutile de signaler un pack absent à un patient qui n'a jamais reçu son
 * accès — la seule chose à faire pour lui est en amont.
 *
 * `pack_absent` est le seul état ANORMAL de la liste : l'onboarding validé
 * assigne le pack dans la même requête (`api/portail/valider`). Zéro
 * assignation après validation est donc une incohérence, pas une attente —
 * d'où un libellé qui ne se confond avec aucun des trois précédents.
 */
export function etapeNouveauPatient(source: SourceNouveauPatient): EtapeNouveauPatient {
  // Les deux fermetures passent AVANT les trois portes : elles sont le geste du
  // praticien lui-même. Présenter un dossier fermé comme un accès à renvoyer ou
  // un onboarding à finir l'enverrait défaire sa propre décision — et l'encart
  // le remonterait même en TÊTE, puisqu'il trie les dossiers en attente d'abord.
  if (source.dossierDesactive) return 'dossier_desactive';
  if (source.accesRevoque) return 'acces_revoque';
  if (!source.accesEnvoyeLe || source.accesEnEchec) return 'acces_non_envoye';
  if (!source.connecteLe) return 'jamais_connecte';
  if (!source.onboardingValide) return 'onboarding_a_finir';
  if (source.nbAssignations === 0) return 'pack_absent';
  return 'complet';
}

export function libelleEtape(etape: EtapeNouveauPatient): string {
  return LIBELLES[etape];
}

/** Un dossier complet n'appelle aucun geste : il reste listé (le praticien a
 * demandé à VOIR ses nouveaux patients), il ne se compte pas comme en attente.
 * Un dossier fermé non plus — l'attente qu'il porterait a été close exprès. */
export function estEnAttente(ligne: LigneNouveauPatient): boolean {
  return ligne.etape !== 'complet'
    && ligne.etape !== 'acces_revoque'
    && ligne.etape !== 'dossier_desactive';
}

/**
 * Lignes prêtes pour l'encart : les dossiers en attente d'abord, le plus
 * récent en tête dans chaque groupe.
 *
 * POURQUOI PAS L'ORDRE CHRONOLOGIQUE SEUL. L'encart est plafonné à l'écran ;
 * un tri purement chronologique pousserait hors du plafond le dossier bloqué
 * depuis trois semaines au profit de celui d'hier qui va bien — soit
 * exactement l'inverse de ce que l'encart existe pour montrer.
 */
export function lignesNouveauxPatients(sources: SourceNouveauPatient[]): LigneNouveauPatient[] {
  return sources
    .map(source => {
      const etape = etapeNouveauPatient(source);
      return { ...source, etape, libelle: LIBELLES[etape] };
    })
    .sort((a, b) => {
      const attenteA = estEnAttente(a) ? 0 : 1;
      const attenteB = estEnAttente(b) ? 0 : 1;
      if (attenteA !== attenteB) return attenteA - attenteB;
      return b.creeLe.localeCompare(a.creeLe);
    });
}
