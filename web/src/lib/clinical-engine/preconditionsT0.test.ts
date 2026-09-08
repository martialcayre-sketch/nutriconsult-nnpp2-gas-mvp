import { describe, expect, it, vi } from 'vitest';

// Le module ne touche PAS la base : le mock ne sert qu'à couper l'import
// transitif de `prisma` par `orientationService`, dont ce module réutilise
// `scoresRecalculesPourRaisonnement` pour ne pas recopier ses cinq fermetures.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { CATALOGUE_DEFINITIONS } from '../bibliotheque';
import {
  RIDEAU_T0,
  evaluerPreconditionsT0,
  messageRefusPreconditions,
  type AssignationPourPreconditions,
  type EntreesPreconditionsT0,
  type PassationPourPreconditions,
} from './preconditionsT0';

// Les réponses brutes sont DÉRIVÉES DU CATALOGUE plutôt qu'écrites à la main :
// une définition qui gagne ou perd un item ne doit pas rendre ce banc vert par
// accident (un score partiel serait recalculé, mais plus complet).
function reponsesCompletes(idQuestionnaire: string): Record<string, unknown> {
  const definition = CATALOGUE_DEFINITIONS[idQuestionnaire];
  if (!definition) throw new Error(`Définition absente du catalogue : ${idQuestionnaire}`);
  const brutes: Record<string, unknown> = {};
  for (const section of (definition as { sections?: unknown[] }).sections ?? []) {
    const questions = (section as { questions?: unknown[] }).questions ?? [];
    for (const question of questions) {
      const q = question as { id: string; type?: string; min?: number; options?: { v: number }[] };
      if (q.options && q.options.length > 0) brutes[q.id] = q.options[0].v;
      else brutes[q.id] = q.min ?? 1;
    }
  }
  return brutes;
}

const LE_2026_08_01 = new Date('2026-08-01T09:00:00.000Z');
const LE_2026_08_05 = new Date('2026-08-05T09:00:00.000Z');

function passation(
  idQuestionnaire: string,
  surcharge: Partial<PassationPourPreconditions> = {},
): PassationPourPreconditions {
  return {
    idQuestionnaire,
    dateReponse: LE_2026_08_01,
    scoresJson: { rawAnswers: reponsesCompletes(idQuestionnaire) },
    statutValidite: 'VALID',
    ...surcharge,
  };
}

function rideauComplet(): PassationPourPreconditions[] {
  return RIDEAU_T0.map(id => passation(id));
}

const LE_2026_08_10 = new Date('2026-08-10T09:00:00.000Z');

/**
 * Le dossier de référence porte un second rideau RENDU ([[D-158]]) : un
 * instrument assigné après la validation de la synthèse, et complété. Sans lui,
 * les vingt-trois cas qui éprouvent AUTRE CHOSE seraient tous bloquants pour la
 * même raison, et ne prouveraient plus rien de ce qu'ils visent.
 */
function secondRideauRendu(): AssignationPourPreconditions[] {
  return [{
    idQuestionnaire: 'Q_GAS_01',
    titre: 'Confort digestif',
    dateAssignation: LE_2026_08_10,
    statut: 'Complété',
  }];
}

function entrees(surcharge: Partial<EntreesPreconditionsT0> = {}): EntreesPreconditionsT0 {
  return {
    passations: rideauComplet(),
    anamnese: { motif_principal: 'Fatigue persistante depuis six mois.' },
    consultationValidee: true,
    synthese: { statut: 'Validee_Praticien', dateValidation: LE_2026_08_05 },
    premiereValidationSynthese: LE_2026_08_05,
    assignations: secondRideauRendu(),
    confirmationAncreInitiale: null,
    contradictionsOuvertes: [],
    ...surcharge,
  };
}

/** Un constat de checklist, tel que le chargeur le recopie du service (`D-119`). */
function constatChecklist(description: string): { description: string; passations: string[] } {
  return { description, passations: ['Q_MOD_01 — 12/03/2026', 'Q_STR_04 — 10/08/2026'] };
}

function dure(resultat: ReturnType<typeof evaluerPreconditionsT0>, id: string) {
  const condition = resultat.dures.find(c => c.id === id);
  if (!condition) throw new Error(`Condition dure absente : ${id}`);
  return condition;
}

describe('préconditions de confirmation T0 (D-052)', () => {
  it('le dossier de référence passe les quatre conditions dures sans friction', () => {
    const resultat = evaluerPreconditionsT0(entrees(), 'T0');
    expect(resultat.bloquant).toBe(false);
    expect(resultat.dures.every(c => c.satisfaite)).toBe(true);
    expect(resultat.contournementsRequis).toEqual([]);
  });

  // Le défaut que le lot existe pour fermer : jusqu'ici un dossier vide se
  // confirmait, et l'écran y invitait explicitement.
  it('un dossier vide est bloquant', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      passations: [],
      anamnese: null,
      consultationValidee: false,
      synthese: null,
      premiereValidationSynthese: null,
      assignations: [],
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(resultat.dures.filter(c => !c.satisfaite)).toHaveLength(4);
  });

  it('chaque instrument du rideau manquant est nommé, un par un', () => {
    for (const idQuestionnaire of RIDEAU_T0) {
      const resultat = evaluerPreconditionsT0(entrees({
        passations: rideauComplet().filter(p => p.idQuestionnaire !== idQuestionnaire),
      }), 'T0');
      expect(resultat.bloquant).toBe(true);
      expect(dure(resultat, 'rideau_t0').detail).toContain(idQuestionnaire);
    }
  });

  // LE DÉFAUT TROUVÉ EN REVUE LE 2026-08-12, et la raison d'être de ces deux
  // cas : `calculateScore` rend un OBJET `{ scored: false, total: null }` sur
  // une passation sans réponse lisible. Un prédicat qui se contentait de
  // `scores !== null` acceptait donc quatre passations vides comme « rideau
  // complet », et le T0 est irrévocable.
  it('quatre passations SANS AUCUNE RÉPONSE ne font pas un rideau', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      passations: RIDEAU_T0.map(id => passation(id, { scoresJson: { rawAnswers: {} } })),
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'rideau_t0').detail).toContain('sans résultat exploitable');
    for (const id of RIDEAU_T0) expect(dure(resultat, 'rideau_t0').detail).toContain(id);
  });

  it('des réponses aux clés étrangères à la définition ne valent pas une mesure', () => {
    // Le cas Q_ALI_01 de [[D-051]] : une passation de la forme courte (AL*)
    // relue sous la définition SIIN ne partage aucun identifiant d'item.
    const resultat = evaluerPreconditionsT0(entrees({
      passations: [
        ...rideauComplet().filter(p => p.idQuestionnaire !== 'Q_ALI_01'),
        passation('Q_ALI_01', { scoresJson: { rawAnswers: { CLE_INEXISTANTE: 3 } } }),
      ],
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'rideau_t0').detail).toContain('Q_ALI_01');
  });

  it('une passation présente mais non cotable ne vaut pas une mesure', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      passations: [
        ...rideauComplet().filter(p => p.idQuestionnaire !== 'Q_MOD_03'),
        passation('Q_MOD_03', { scoresJson: { total: 42 } }),
      ],
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'rideau_t0').detail).toContain('sans résultat exploitable');
    expect(dure(resultat, 'rideau_t0').detail).toContain('Q_MOD_03');
  });

  it('un statut exclu du raisonnement écarte l’instrument, drapeau éteint compris', () => {
    // `statutExcluDuRaisonnement` ne dépend pas de WN_ENABLE_VALIDITE_PASSATIONS,
    // et c'est voulu : désigner une passation INVALID comme celle qui fait foi
    // serait faux même filtre éteint.
    const resultat = evaluerPreconditionsT0(entrees({
      passations: [
        ...rideauComplet().filter(p => p.idQuestionnaire !== 'Q_INF_03'),
        passation('Q_INF_03', { statutValidite: 'INVALID' }),
      ],
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'rideau_t0').detail).toContain('Q_INF_03');
  });

  it('pas de repli sur une passation antérieure quand la dernière est inexploitable', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      passations: [
        ...rideauComplet().filter(p => p.idQuestionnaire !== 'Q_MOD_01'),
        passation('Q_MOD_01', { dateReponse: LE_2026_08_01 }),
        passation('Q_MOD_01', { dateReponse: LE_2026_08_05, statutValidite: 'SUPERSEDED' }),
      ],
    }), 'T0');
    expect(dure(resultat, 'rideau_t0').satisfaite).toBe(false);
  });

  it('le rideau s’évalue sans contrainte de fenêtre', () => {
    // Une passation très ancienne reste une passation : la fenêtre gouverne la
    // composition de l'épisode, pas la précondition (D-052).
    const resultat = evaluerPreconditionsT0(entrees({
      passations: RIDEAU_T0.map(id => passation(id, { dateReponse: new Date('2025-01-05T09:00:00.000Z') })),
    }), 'T0');
    expect(dure(resultat, 'rideau_t0').satisfaite).toBe(true);
  });

  it('une anamnèse vide ne compte pas pour consignée', () => {
    const resultat = evaluerPreconditionsT0(entrees({ anamnese: {} }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'anamnese_consignee').detail).toContain('motif principal');
  });

  it('sépare « aucune consultation validée » de « validée sans motif »', () => {
    const sansConsultation = evaluerPreconditionsT0(entrees({ consultationValidee: false, anamnese: null }), 'T0');
    const sansMotif = evaluerPreconditionsT0(entrees({ anamnese: { taille: '170' } }), 'T0');
    expect(dure(sansConsultation, 'anamnese_consignee').detail)
      .not.toBe(dure(sansMotif, 'anamnese_consignee').detail);
  });

  it('une synthèse non validée bloque, une synthèse corrigée passe', () => {
    const brouillon = evaluerPreconditionsT0(entrees({
      synthese: { statut: 'Brouillon_IA', dateValidation: LE_2026_08_05 },
    }), 'T0');
    expect(dure(brouillon, 'synthese_validee').satisfaite).toBe(false);

    const corrigee = evaluerPreconditionsT0(entrees({
      synthese: { statut: 'Corrigee_Praticien', dateValidation: LE_2026_08_05 },
    }), 'T0');
    expect(dure(corrigee, 'synthese_validee').satisfaite).toBe(true);
  });

  it('une synthèse validée sans date de validation ne passe pas pour datée', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      synthese: { statut: 'Validee_Praticien', dateValidation: null },
    }), 'T0');
    expect(dure(resultat, 'synthese_validee').satisfaite).toBe(false);
  });

  it('une synthèse antérieure à la dernière passation du PREMIER rideau est périmée', () => {
    // Aucun second rideau ici — c'est le cas d'origine de [[D-052]] §4, et son
    // message reste le sien : la synthèse est simplement en retard. Le cas
    // symétrique (second rideau non lu, qui appelle une synthèse NEUVE) vit
    // dans le bloc `second rideau`, avec son propre message.
    const resultat = evaluerPreconditionsT0(entrees({
      synthese: { statut: 'Validee_Praticien', dateValidation: new Date('2026-07-01T09:00:00.000Z') },
      premiereValidationSynthese: null,
      assignations: [],
    }), 'T0');
    expect(dure(resultat, 'synthese_validee').satisfaite).toBe(false);
    expect(dure(resultat, 'synthese_validee').detail).toContain('antérieure');
    expect(dure(resultat, 'synthese_validee').detail).toContain('premier rideau');
  });

  it('une passation HORS rideau plus récente ne périme pas la synthèse', () => {
    // La fraîcheur se juge sur le rideau, pas sur le dossier (D-052).
    const resultat = evaluerPreconditionsT0(entrees({
      passations: [
        ...rideauComplet(),
        passation('Q_SOM_09', { dateReponse: new Date('2026-08-20T09:00:00.000Z') }),
      ],
    }), 'T0');
    expect(dure(resultat, 'synthese_validee').satisfaite).toBe(true);
  });

  it('une condition souple non satisfaite exige un contournement sans bloquer', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      contradictionsOuvertes: [constatChecklist('Stress déclaré discordant.'), constatChecklist('Sommeil déclaré discordant.')],
    }), 'T0');
    expect(resultat.bloquant).toBe(false);
    expect(resultat.contournementsRequis).toEqual(['contradictions_ouvertes']);
  });

  // D-119 — la condition porte les CONSTATS, plus seulement un compte : le
  // motif de contournement se rédige devant ce que la garde a vu.
  it('la condition de contradictions expose les constats recopiés, et dit ce que confirmer fait', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      contradictionsOuvertes: [constatChecklist('Stress déclaré discordant entre instruments.')],
    }), 'T0');
    const condition = resultat.souples.find(c => c.id === 'contradictions_ouvertes');
    expect(condition?.satisfaite).toBe(false);
    expect(condition?.constats).toEqual([constatChecklist('Stress déclaré discordant entre instruments.')]);
    // Le texte dit le GESTE (`DC-30`) : confirmer ne résout pas, le motif est tracé.
    expect(condition?.detail).toContain('confirmer ne la résout pas');
    expect(condition?.detail).toContain('tracé avec l’épisode');
    expect(condition?.detail).toContain('Données fiables');
  });

  it('le pluriel du détail suit le nombre de constats, et une liste vide n’en pose aucun', () => {
    const deux = evaluerPreconditionsT0(entrees({
      contradictionsOuvertes: [constatChecklist('A.'), constatChecklist('B.')],
    }), 'T0');
    expect(deux.souples.find(c => c.id === 'contradictions_ouvertes')?.detail)
      .toContain('2 contradictions ouvertes');
    expect(deux.souples.find(c => c.id === 'contradictions_ouvertes')?.detail)
      .toContain('confirmer ne les résout pas');
    const aucune = evaluerPreconditionsT0(entrees(), 'T0');
    const condition = aucune.souples.find(c => c.id === 'contradictions_ouvertes');
    expect(condition?.satisfaite).toBe(true);
    expect(condition?.detail).toBeNull();
    expect('constats' in (condition ?? {})).toBe(false);
  });

  it('une passation ambiguë du rideau est souple, jamais bloquante', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      passations: [
        ...rideauComplet().filter(p => p.idQuestionnaire !== 'Q_ALI_01'),
        passation('Q_ALI_01', { statutValidite: 'AMBIGUOUS' }),
      ],
    }), 'T0');
    expect(resultat.bloquant).toBe(false);
    expect(resultat.contournementsRequis).toContain('passation_ambigue');
  });

  it('le message de refus ne cite que les conditions dures manquantes', () => {
    const resultat = evaluerPreconditionsT0(entrees({ consultationValidee: false, anamnese: null }), 'T0');
    const message = messageRefusPreconditions(resultat);
    expect(message).toContain('Aucune consultation validée');
    expect(message).not.toContain('contradiction');
  });
});

// ---------------------------------------------------------------------------
// D-158 — LE SECOND RIDEAU : ce que le praticien a demandé au vu de la première
// synthèse, et que le patient a rendu.
//
// Production au 2026-09-08 : 14 dossiers portent une synthèse validée, 4 ont
// déjà leur T0. Des 10 restants, DEUX seulement ont un second rideau assigné
// (5 et 8 instruments, aucun partagé au-delà de 3), et aucun ne l'a rendu.
// C'est pourquoi ce rideau ne peut pas être une liste signée comme RIDEAU_T0 :
// il se compose dossier par dossier.
// ---------------------------------------------------------------------------
describe('second rideau (D-158)', () => {
  const APRES = new Date('2026-08-12T09:00:00.000Z');

  function assignation(
    surcharge: Partial<AssignationPourPreconditions> = {},
  ): AssignationPourPreconditions {
    return {
      idQuestionnaire: 'Q_NEU_11',
      titre: 'Charge mentale',
      dateAssignation: APRES,
      statut: 'Complété',
      ...surcharge,
    };
  }

  it('rien d’assigné depuis la synthèse : le T0 est bloqué, et le message dit quoi faire', () => {
    const resultat = evaluerPreconditionsT0(entrees({ assignations: [] }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'second_rideau').detail).toContain('reste à composer');
  });

  it('assigné mais pas rendu : bloquant, et chaque instrument en attente est nommé', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      assignations: [assignation({ statut: 'En attente' }), assignation({ titre: 'Confort digestif' })],
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'second_rideau').detail).toContain('Charge mentale');
    expect(dure(resultat, 'second_rideau').detail).not.toContain('Confort digestif');
  });

  it('une assignation ANNULÉE sort du compte : c’est le geste qui dit « je ne l’attends plus »', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      assignations: [assignation(), assignation({ titre: 'Abandonné', statut: 'Annulée' })],
    }), 'T0');
    expect(dure(resultat, 'second_rideau').satisfaite).toBe(true);
  });

  it('une assignation ANTÉRIEURE à la synthèse n’est pas un second rideau', () => {
    // Le premier rideau est assigné à l'entrée du dossier : le compter ici
    // ouvrirait le T0 sans qu'aucune seconde exploration ait eu lieu.
    const resultat = evaluerPreconditionsT0(entrees({
      assignations: [assignation({ dateAssignation: LE_2026_08_01 })],
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'second_rideau').detail).toContain('reste à composer');
  });

  // LE PIÈGE QUE LA BORNE BASSE ÉCARTE (§3). Si la borne était « la dernière
  // synthèse validée », valider une seconde synthèse APRÈS le second rideau la
  // déplacerait au-delà des assignations qu'elle doit compter : plus aucune ne
  // serait postérieure, et le dossier qui a fait exactement ce qu'on lui
  // demandait deviendrait DÉFINITIVEMENT inconfirmable.
  it('une SECONDE synthèse validée après le second rideau ne le périme pas', () => {
    const secondeValidation = new Date('2026-08-20T09:00:00.000Z');
    const resultat = evaluerPreconditionsT0(entrees({
      synthese: { statut: 'Validee_Praticien', dateValidation: secondeValidation },
      premiereValidationSynthese: LE_2026_08_05,
      assignations: [assignation()],
    }), 'T0');
    expect(dure(resultat, 'second_rideau').satisfaite).toBe(true);
    expect(resultat.bloquant).toBe(false);
  });

  // LE PIÈGE QUE LA BORNE HAUTE ÉCARTE (§5). La garde est rejouée à CHAQUE
  // écriture de protocole, T0 déjà confirmé compris : sans borne haute, le
  // premier questionnaire de suivi assigné après l'acte refuserait en 422 le
  // protocole d'un dossier vivant. C'est la panne que D-129 a dû rouvrir.
  it('une assignation POSTÉRIEURE à la confirmation ne re-bloque pas un dossier vivant', () => {
    const confirmation = new Date('2026-08-15T09:00:00.000Z');
    const resultat = evaluerPreconditionsT0(entrees({
      confirmationAncreInitiale: confirmation,
      assignations: [
        assignation(),
        // Un J21 assigné après l'acte, forcément non rendu le jour même.
        assignation({ titre: 'Suivi J21', dateAssignation: new Date('2026-09-05T09:00:00.000Z'), statut: 'En attente' }),
      ],
    }), 'T0');
    expect(dure(resultat, 'second_rideau').satisfaite).toBe(true);
  });

  it('sans aucune synthèse validée, la condition pointe la synthèse et non le praticien', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      synthese: null, premiereValidationSynthese: null, assignations: [],
    }), 'T0');
    expect(dure(resultat, 'second_rideau').detail).toContain('elle n’a pas encore eu lieu');
  });

  // §6 — ROUVRIR UN SUIVI N'EST PAS Y ENTRER. La borne du second rideau est la
  // PREMIÈRE synthèse du dossier : appliquée à un T1 posé des mois plus tard,
  // elle compterait comme « second rideau » tout ce qui a été assigné depuis,
  // jalons de suivi compris.
  it('la condition ne vaut QUE pour l’ancre initiale', () => {
    const sansSecondRideau = entrees({ assignations: [] });
    expect(evaluerPreconditionsT0(sansSecondRideau, 'T0').dures.map(c => c.id))
      .toContain('second_rideau');
    for (const jalon of ['T1', 'T2', 'J21', 'J42', 'J90']) {
      const resultat = evaluerPreconditionsT0(sansSecondRideau, jalon);
      expect(resultat.dures.map(c => c.id), jalon).not.toContain('second_rideau');
      // Le rideau d'ENTRÉE, lui, garde toute ancre depuis D-113 : ce banc ne
      // doit pas être lu comme un relâchement de cette porte-là.
      expect(resultat.dures.map(c => c.id), jalon).toContain('rideau_t0');
    }
  });

  // §4 — « RENDU » SE LIT SUR L'ASSIGNATION, PAS SUR LA COTABILITÉ. Q_ALI_03 ne
  // rend aucun total par construction, les agendas et Q_ALI_09 ne sont pas
  // scorés : sous le prédicat du PREMIER rideau, un second rideau qui en
  // contient un serait insatisfiable par nature.
  it('un instrument non cotable compte, s’il est rendu', () => {
    const resultat = evaluerPreconditionsT0(entrees({
      assignations: [assignation({ idQuestionnaire: 'Q_ALI_09', titre: 'Journal alimentaire' })],
    }), 'T0');
    expect(dure(resultat, 'second_rideau').satisfaite).toBe(true);
  });
  // ── LE CINQUIÈME TEMPS ([[D-158]] §3 bis, arbitrage du 2026-09-09) ────────
  // « T0 doit se valider sur une synthèse produite APRÈS le deuxième rideau. »
  // La condition sœur exige que le second rideau soit RENDU ; celle-ci exige
  // qu'il ait été LU.
  it('une synthèse antérieure aux passations du second rideau ne porte pas le T0', () => {
    const passationSecondRideau = new Date('2026-08-14T09:00:00.000Z');
    const resultat = evaluerPreconditionsT0(entrees({
      // La seule synthèse validée est celle qui a MOTIVÉ le second rideau.
      synthese: { statut: 'Validee_Praticien', dateValidation: LE_2026_08_05 },
      premiereValidationSynthese: LE_2026_08_05,
      assignations: [assignation()],
      passations: [
        ...rideauComplet(),
        passation('Q_NEU_11', { dateReponse: passationSecondRideau }),
      ],
    }), 'T0');
    expect(resultat.bloquant).toBe(true);
    expect(dure(resultat, 'synthese_validee').detail).toContain('il en faut une nouvelle');
    // Le second rideau, lui, est bien rendu : ce n'est PAS lui qui bloque.
    expect(dure(resultat, 'second_rideau').satisfaite).toBe(true);
  });

  it('une synthèse produite APRÈS le second rideau porte le T0', () => {
    const passationSecondRideau = new Date('2026-08-14T09:00:00.000Z');
    const secondeSynthese = new Date('2026-08-16T09:00:00.000Z');
    const resultat = evaluerPreconditionsT0(entrees({
      synthese: { statut: 'Validee_Praticien', dateValidation: secondeSynthese },
      premiereValidationSynthese: LE_2026_08_05,
      assignations: [assignation()],
      passations: [
        ...rideauComplet(),
        passation('Q_NEU_11', { dateReponse: passationSecondRideau }),
      ],
    }), 'T0');
    expect(resultat.bloquant).toBe(false);
  });

  // La chaîne complète, dans l'ordre où le praticien la vit — et le banc qui
  // dirait « c'est vert » si l'un des cinq temps sautait.
  it('les cinq temps s’enchaînent, et chacun bloque à son tour', () => {
    const p1 = new Date('2026-08-14T09:00:00.000Z');
    const avecPassation = [...rideauComplet(), passation('Q_NEU_11', { dateReponse: p1 })];

    // 1-2. Premier rideau + synthèse #1 : le second rideau manque.
    const t2 = evaluerPreconditionsT0(entrees({ assignations: [] }), 'T0');
    expect(dure(t2, 'second_rideau').satisfaite).toBe(false);

    // 3. Assigné, pas rendu.
    const t3 = evaluerPreconditionsT0(entrees({
      assignations: [assignation({ statut: 'En attente' })],
    }), 'T0');
    expect(dure(t3, 'second_rideau').satisfaite).toBe(false);

    // 4. Rendu, mais aucune synthèse ne l'a lu.
    const t4 = evaluerPreconditionsT0(entrees({
      assignations: [assignation()], passations: avecPassation,
    }), 'T0');
    expect(dure(t4, 'second_rideau').satisfaite).toBe(true);
    expect(dure(t4, 'synthese_validee').satisfaite).toBe(false);

    // 5. Synthèse #2 validée après : le T0 s'ouvre.
    const t5 = evaluerPreconditionsT0(entrees({
      assignations: [assignation()], passations: avecPassation,
      synthese: { statut: 'Validee_Praticien', dateValidation: new Date('2026-08-16T09:00:00.000Z') },
    }), 'T0');
    expect(t5.bloquant).toBe(false);
  });
});
