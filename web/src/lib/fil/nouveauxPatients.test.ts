import { describe, expect, it } from 'vitest';
import {
  estEnAttente,
  etapeNouveauPatient,
  libelleEtape,
  lignesNouveauxPatients,
  type SourceNouveauPatient,
} from './nouveauxPatients';

function source(over: Partial<SourceNouveauPatient> = {}): SourceNouveauPatient {
  return {
    idPatient: 'PAT_SEED_01',
    patient: 'Sophie Nicola',
    creeLe: '2026-08-24T12:00:00.000Z',
    dossierDesactive: false,
    accesRevoque: false,
    accesEnvoyeLe: '2026-08-24T12:05:00.000Z',
    accesEnEchec: false,
    connecteLe: '2026-08-25T09:00:00.000Z',
    entreeRefusee: false,
    onboardingValide: true,
    nbAssignations: 5,
    nbAssignationsRendues: 5,
    ...over,
  };
}

describe('etapeNouveauPatient', () => {
  it('nomme la PREMIÈRE porte fermée, pas la dernière', () => {
    // Rien n'est parti : le pack absent et l'absence de connexion sont des
    // conséquences, pas le geste à faire.
    const etape = etapeNouveauPatient(
      source({ accesEnvoyeLe: null, connecteLe: null, onboardingValide: false, nbAssignations: 0 }),
    );
    expect(etape).toBe('acces_non_envoye');
  });

  it('un envoi en échec ne vaut pas un envoi', () => {
    expect(etapeNouveauPatient(source({ accesEnEchec: true }))).toBe('acces_non_envoye');
  });

  it('e-mail parti mais jamais d’entrée dans le portail', () => {
    expect(
      etapeNouveauPatient(source({ connecteLe: null, onboardingValide: false, nbAssignations: 0 })),
    ).toBe('jamais_connecte');
  });

  it('connecté sans validation : l’onboarding reste à finir', () => {
    expect(etapeNouveauPatient(source({ onboardingValide: false, nbAssignations: 0 }))).toBe(
      'onboarding_a_finir',
    );
  });

  it('onboarding validé sans aucune assignation : incohérence nommée pour elle-même', () => {
    // `api/portail/valider` assigne le pack dans la même requête que la
    // validation : zéro assignation après validation n'est PAS une attente.
    expect(etapeNouveauPatient(source({ nbAssignations: 0 }))).toBe('pack_absent');
    expect(libelleEtape('pack_absent')).toBe('Pack de base absent');
  });

  it('un accès révoqué se nomme pour lui-même, avant toute porte', () => {
    // Le dossier n'a jamais été ouvert par le patient ET le praticien vient de
    // révoquer : c'est la révocation qui se dit, pas une mise en service à
    // poursuivre — et elle se dit aussi quand le patient était bien entré.
    const jamaisEntre = source({
      accesRevoque: true,
      connecteLe: null,
      onboardingValide: false,
      nbAssignations: 0,
    });
    expect(etapeNouveauPatient(jamaisEntre)).toBe('acces_revoque');
    expect(etapeNouveauPatient(source({ accesRevoque: true }))).toBe('acces_revoque');
    expect(libelleEtape('acces_revoque')).toBe('Accès révoqué');
  });

  it('une entrée refusée ne se dit pas « Jamais connecté »', () => {
    const refuse = source({ connecteLe: null, onboardingValide: false, nbAssignations: 0, entreeRefusee: true });
    expect(etapeNouveauPatient(refuse)).toBe('entree_refusee');
    expect(libelleEtape('entree_refusee')).toBe('Entrée refusée');
    const [ligne] = lignesNouveauxPatients([refuse]);
    expect(estEnAttente(ligne)).toBe(true);
    // Le même dossier sans tentative reste « Jamais connecté ».
    expect(etapeNouveauPatient({ ...refuse, entreeRefusee: false })).toBe('jamais_connecte');
  });

  it('un lien rouvert APRÈS une entrée réussie ne rouvre aucune porte', () => {
    // Le lien déjà consommé est présenté à nouveau : c'est un refus, ce n'est
    // pas un dossier bloqué. Le drapeau ne se lit que si `connecteLe` est null.
    expect(etapeNouveauPatient(source({ entreeRefusee: true }))).toBe('complet');
  });

  it('une entrée refusée ne prime jamais sur une fermeture praticien', () => {
    const base = { connecteLe: null, onboardingValide: false, nbAssignations: 0, entreeRefusee: true };
    expect(etapeNouveauPatient(source({ ...base, dossierDesactive: true }))).toBe('dossier_desactive');
    expect(etapeNouveauPatient(source({ ...base, accesRevoque: true }))).toBe('acces_revoque');
  });

  it('un accès jamais parti passe avant le refus d’entrée', () => {
    expect(
      etapeNouveauPatient(
        source({ accesEnvoyeLe: null, connecteLe: null, onboardingValide: false, nbAssignations: 0, entreeRefusee: true }),
      ),
    ).toBe('acces_non_envoye');
  });

  it('un pack assigné dont rien n’est rendu n’est pas un dossier en règle', () => {
    expect(etapeNouveauPatient(source({ nbAssignationsRendues: 0 }))).toBe('pack_sans_reponse');
    expect(libelleEtape('pack_sans_reponse')).toBe('Pack assigné, rien rendu');
  });

  it('un rendu PARTIEL franchit la dernière porte — on ne réclame pas le pack entier', () => {
    // CE BANC PASSERAIT SANS LE CORRECTIF. Il n'est là que pour un mutant : si
    // la condition devenait `nbAssignationsRendues < nbAssignations`, l'encart
    // réclamerait un pack COMPLET et garderait en attente un patient qui a
    // commencé à répondre. Le seuil est « au moins un », pas « tout ».
    expect(etapeNouveauPatient(source({ nbAssignations: 5, nbAssignationsRendues: 1 }))).toBe('complet');
  });

  it('un pack jamais commencé compte parmi les dossiers en attente', () => {
    const [ligne] = lignesNouveauxPatients([source({ nbAssignationsRendues: 0 })]);
    expect(estEnAttente(ligne)).toBe(true);
  });

  it('un pack ABSENT reste une incohérence, pas une attente du patient', () => {
    // L'ordre compte : tester les réponses d'abord ferait passer un dossier que
    // la validation aurait dû servir pour un patient qui traîne.
    expect(etapeNouveauPatient(source({ nbAssignations: 0, nbAssignationsRendues: 0 }))).toBe('pack_absent');
  });

  it('un dossier désactivé se nomme, et prime sur la révocation', () => {
    // La désactivation est la fermeture la plus large : elle coupe les trois
    // entrées ET ferme les liens en vol. Elle doit donc se dire même quand le
    // dossier porte aussi une révocation, sinon l'encart annonce le geste
    // étroit et tait le large.
    const ferme = source({ dossierDesactive: true, connecteLe: null });
    expect(etapeNouveauPatient(ferme)).toBe('dossier_desactive');
    expect(etapeNouveauPatient({ ...ferme, accesRevoque: true })).toBe('dossier_desactive');
    expect(libelleEtape('dossier_desactive')).toBe('Dossier désactivé');
    const [ligne] = lignesNouveauxPatients([ferme]);
    expect(estEnAttente(ligne)).toBe(false);
  });

  it('un dossier révoqué n’attend rien : le praticien a fermé lui-même', () => {
    const [ligne] = lignesNouveauxPatients([source({ accesRevoque: true, connecteLe: null })]);
    expect(ligne.etape).toBe('acces_revoque');
    expect(estEnAttente(ligne)).toBe(false);
  });

  it('les trois portes franchies : complet', () => {
    expect(etapeNouveauPatient(source())).toBe('complet');
    expect(estEnAttente({ ...source(), etape: 'complet', libelle: '' })).toBe(false);
  });
});

describe('lignesNouveauxPatients', () => {
  it('remonte les dossiers en attente avant les dossiers complets', () => {
    // Le complet est le PLUS RÉCENT : un tri chronologique seul le mettrait en
    // tête et pousserait le bloqué hors du plafond d'affichage.
    const lignes = lignesNouveauxPatients([
      source({ idPatient: 'PAT_OK', creeLe: '2026-09-03T00:00:00.000Z' }),
      source({
        idPatient: 'PAT_BLOQUE',
        creeLe: '2026-08-21T00:00:00.000Z',
        connecteLe: null,
        onboardingValide: false,
        nbAssignations: 0,
      }),
    ]);
    expect(lignes.map(l => l.idPatient)).toEqual(['PAT_BLOQUE', 'PAT_OK']);
    expect(lignes[0].libelle).toBe('Jamais connecté');
  });

  it('à statut égal, le plus récent d’abord', () => {
    const bloque = { connecteLe: null, onboardingValide: false, nbAssignations: 0 };
    const lignes = lignesNouveauxPatients([
      source({ idPatient: 'PAT_A', creeLe: '2026-08-21T00:00:00.000Z', ...bloque }),
      source({ idPatient: 'PAT_B', creeLe: '2026-09-01T00:00:00.000Z', ...bloque }),
    ]);
    expect(lignes.map(l => l.idPatient)).toEqual(['PAT_B', 'PAT_A']);
  });

  it('n’invente aucune ligne sur une entrée vide', () => {
    expect(lignesNouveauxPatients([])).toEqual([]);
  });
});
