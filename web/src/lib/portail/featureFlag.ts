// Drapeau du gate G4 — lien magique d'accès patient.
//
// Il n'est pas là par prudence : c'est lui qui rend réel le NO-GO du registre
// (`REGISTRE_FRONTIERES.md`). Le gate est livrable en préproduction, mais
// « activation avec données réelles = décision distincte ». Sans drapeau,
// merger la PR **serait** activer.
//
// CE PARAGRAPHE DÉCRIT LA CRÉATION DU DRAPEAU, PAS SON ÉTAT. Il a été POSÉ en
// Production le 2026-07-21 (`docs/FEATURE_FLAGS.md` § B, `CHANGELOG.md`
// « Gate G4 — activé en production »), et RELU sur Scalingo le 2026-09-07 par
// `env-get` : la porte est ouverte. Le NO-GO du registre est LEVÉ dans ce
// périmètre par décision datée du responsable — et jusqu'au 2026-10-21
// seulement (`docs/claude/REGISTRE_FRONTIERES.md`, section IDP). Lire le
// tableau, pas ce commentaire, pour savoir quelle porte est ouverte.
//
// Éteint (défaut) : la route d'entrée et le canal de redemande répondent
// `notFound()`, l'action d'émission praticien est refusée — le comportement du
// portail est strictement celui d'avant le gate.
//
// Même convention que `lib/food-compass/featureFlag.ts` : la chaîne 'true', et
// rien d'autre, active.
export function isG4LienMagiqueEnabled(value = process.env.WN_G4_LIEN_MAGIQUE): boolean {
  return value === 'true';
}

// Second drapeau, pour le canal de redemande `POST /api/portail/lien/demande`.
//
// Ce canal est PUBLIC et NON AUTHENTIFIÉ. Sa réponse est indifférenciée — même
// code, même corps, mêmes en-têtes, ET MÊME DURÉE que l'adresse existe ou non.
//
// Les deux résidus relevés en revue de sécurité sont fermés le 2026-07-21 :
// le temps de réponse passe par un plancher commun à toutes les sorties
// (`delaiAvantReponse`), et les tentatives sont plafonnées par origine réseau
// en base (`portail_demande_tentatives`) — le plafond par patient ne bornait
// pas l'énumération, qui ne touche aucun patient.
//
// Le drapeau RESTE néanmoins séparé de `WN_G4_LIEN_MAGIQUE`, et pour la même
// raison qu'à sa création : allumer l'entrée par lien magique ne doit pas
// ouvrir d'office une surface publique sur des adresses réelles. Sa levée est
// une décision distincte, à consigner — d'autant que la coexistence des deux
// chemins d'accès le rend non indispensable : un patient dont le lien magique
// expire garde son lien permanent.
export function isG4RedemandePatientEnabled(value = process.env.WN_G4_REDEMANDE_PATIENT): boolean {
  return value === 'true';
}

// Troisième drapeau — entrée patient par Google (gate G5, IDP2 LOT-03c).
//
// Éteint (défaut) : `/portail/connexion`, `/portail/google` et son retour
// répondent 404. Le portail se comporte exactement comme avant le lot — les
// deux chemins existants (jeton permanent, lien magique) sont seuls debout.
//
// Séparé des deux drapeaux G4 délibérément : Google est un chemin d'entrée
// nouveau, avec un sous-traitant nouveau (inscrit au registre en 03a) et un
// client OAuth qui doit exister avant que la route serve à quoi que ce soit.
// Son allumage est le LOT-03d — une décision datée, pas un effet de bord de
// merge.
export function isG5GooglePatientEnabled(value = process.env.WN_G5_GOOGLE_PATIENT): boolean {
  return value === 'true';
}
