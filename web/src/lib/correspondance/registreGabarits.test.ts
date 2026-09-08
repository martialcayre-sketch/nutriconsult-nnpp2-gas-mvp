// Garde structurelle du registre des gabarits patient (Socle LOT-03).
//
// Quatre volets, au patron de `trust/contenus/registre.test.ts` :
//   1. hash-lock — modifier un texte sans créer de version casse ici ;
//   2. liste figée — retirer ou réordonner une version publiée casse ici ;
//   3. déclarations — chaque gabarit dit sa conformité « données de santé »,
//      ses dates, et ses variables sont exactement celles de son corps ;
//   4. fidélité — chaque gabarit rendu avec des valeurs d'exemple reproduit
//      AU CARACTÈRE PRÈS ce que l'ancien code inline concaténait (les
//      chaînes attendues ci-dessous sont la copie des concaténations
//      historiques, pas du registre — c'est ce qui rend le volet probant).
import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '@/lib/clinical-engine/canonical';
import {
  REGISTRE_GABARITS_PATIENT,
  SEGMENTS_GABARITS,
  getGabarit,
  rendreGabarit,
  rendreSegment,
} from './registreGabarits';

// Le recalcul vit ici, pas dans le module : le registre est atteint par un
// composant client (via relanceEmail) et ne doit pas tirer node:crypto.
// `valideLe`/`redigeLe`/`donneesSante` hors champ — l'empreinte fige le TEXTE.
function empreinteGabarit(g: (typeof REGISTRE_GABARITS_PATIENT)[number]): string {
  return canonicalSha256({ key: g.key, version: g.version, sujet: g.sujet, corps: g.corps, variables: [...g.variables] });
}

describe('registre des gabarits patient — intégrité', () => {
  it('chaque version porte son empreinte exacte (hash-lock)', () => {
    for (const g of REGISTRE_GABARITS_PATIENT) {
      expect(empreinteGabarit(g), `${g.key}@${g.version}`).toBe(g.hash);
    }
  });

  it('expose les onze versions attendues, dans cet ordre', () => {
    expect(REGISTRE_GABARITS_PATIENT.map(g => `${g.key}@${g.version}`)).toEqual([
      'lien_magique@1',
      'acces_portail@1',
      'relance_agenda_sommeil@1',
      'assignation_questionnaire@1',
      'assignation_pack@1',
      'file_envoi@1',
      'accuse_reception@1',
      'envoi_bilan@1',
      // Append-only : la v2 s'ajoute en fin de liste, la v1 garde sa place.
      'acces_portail@2',
      // CLÉ DISTINCTE, ET NON UNE v3 : `getGabarit` rend la version la plus
      // haute d'une clé. Une v3 d'`acces_portail` serait servie AUSSI au chemin
      // sans lien, où le rendu lèverait sur `{{lien}}` manquant.
      'acces_portail_lien@1',
      // [[D-154]] — premier gabarit d'un message qui n'ouvre pas un accès mais
      // APPELLE UN GESTE : relire l'objectif proposé. Il ne transporte pas
      // l'énoncé, seulement l'adresse de l'espace.
      'objectif_propose@1',
    ]);
  });

  it('acces_portail : c’est la v2 qui est servie, la v1 reste au registre', () => {
    expect(getGabarit('acces_portail').version).toBe(2);
    expect(REGISTRE_GABARITS_PATIENT.filter(g => g.key === 'acces_portail')).toHaveLength(2);
  });

  it('les deux validations formelles sont datées — le reste du registre ne l’est pas', () => {
    // `valideLe` a existé huit versions durant sans jamais être renseigné. Ce
    // banc échoue si une validation est posée ailleurs sans décision.
    const valides = REGISTRE_GABARITS_PATIENT.filter(g => g.valideLe !== null);
    expect(valides.map(g => `${g.key}@${g.version}`)).toEqual([
      'acces_portail@2',
      // Validé par le praticien le 2026-09-07, sur lecture de la seule prose
      // neuve : le reste est le texte de la v2 au caractère près.
      'acces_portail_lien@1',
    ]);
    expect(valides.map(g => g.valideLe)).toEqual(['2026-09-04', '2026-09-07']);
  });

  it('les segments partagés sont figés', () => {
    expect(SEGMENTS_GABARITS.dateLimite).toBe('\nÀ compléter avant le : {{dateLimite}}');
    expect(SEGMENTS_GABARITS.notePraticien).toBe('\nNote de votre praticien : {{notes}}');
  });

  it('chaque gabarit déclare conformité, dates et variables cohérentes', () => {
    for (const g of REGISTRE_GABARITS_PATIENT) {
      expect(['conforme', 'ecart']).toContain(g.donneesSante.statut);
      if (g.donneesSante.statut === 'ecart') {
        expect(g.donneesSante.ecart.length, `${g.key} : un écart se décrit`).toBeGreaterThan(10);
      }
      expect(g.redigeLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (g.valideLe !== null) expect(g.valideLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Variables déclarées ⇔ placeholders du corps, dans les deux sens.
      for (const v of g.variables) {
        expect(g.corps, `${g.key} : {{${v}}} déclaré mais absent du corps`).toContain(`{{${v}}}`);
      }
      const placeholders = [...g.corps.matchAll(/\{\{([a-zA-Z]+)\}\}/g)].map(m => m[1]);
      for (const p of placeholders) {
        expect(g.variables, `${g.key} : {{${p}}} présent mais non déclaré`).toContain(p);
      }
    }
  });

  it('le rendu lève sur variable manquante ET sur placeholder résiduel', () => {
    const g = getGabarit('lien_magique');
    expect(() => rendreGabarit(g, { prenom: 'Sophie' })).toThrow(/variable manquante/);
    const factice = { ...g, corps: g.corps + ' {{intrus}}', variables: g.variables };
    expect(() => rendreGabarit(factice, { prenom: 'Sophie', lien: 'https://x' })).toThrow(/placeholder non rendu/);
  });

  it('rendreSegment : falsy → vide, valeur → segment exact (sans trim)', () => {
    expect(rendreSegment('dateLimite', null)).toBe('');
    expect(rendreSegment('dateLimite', '')).toBe('');
    expect(rendreSegment('dateLimite', '12/09/2026')).toBe('\nÀ compléter avant le : 12/09/2026');
    expect(rendreSegment('notePraticien', 'Prenez votre temps.')).toBe('\nNote de votre praticien : Prenez votre temps.');
  });
});

describe('registre des gabarits patient — fidélité aux textes historiques', () => {
  // Chaque chaîne attendue reproduit la CONCATÉNATION HISTORIQUE de
  // l'appelant, avec des valeurs d'exemple (fixtures neutres).

  it('lien magique', () => {
    const { sujet, corps } = rendreGabarit(getGabarit('lien_magique'), {
      prenom: 'Sophie',
      lien: 'https://app.wellneuro.fr/lien/abc',
    });
    expect(sujet).toBe('Votre lien d’accès — Wellneuro');
    expect(corps).toBe(
      `Bonjour Sophie,\n\n` +
      `Voici votre lien d'accès à votre espace patient Wellneuro :\nhttps://app.wellneuro.fr/lien/abc\n\n` +
      `Ce lien est valable 24 heures et ne s'ouvre qu'une fois. ` +
      `Passé ce délai, ou si vous l'avez déjà utilisé, vous pourrez en redemander ` +
      `un nouveau depuis la page qui s'affichera — sans passer par votre praticien.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message : ` +
      `sans clic de votre part, ce lien expirera seul.\n\n` +
      `L'équipe Wellneuro`,
    );
  });

  it("accès portail v1 — texte historique, conservé au registre", () => {
    // Épinglé sur la version 1 : `getGabarit` rend désormais la v2, et ce
    // banc existe pour prouver la fidélité au texte inline d'origine.
    const v1 = REGISTRE_GABARITS_PATIENT.find(g => g.key === 'acces_portail' && g.version === 1);
    if (!v1) throw new Error('acces_portail@1 retirée du registre');
    const { corps } = rendreGabarit(v1, {
      prenom: 'Jennifer',
      connexion: 'https://app.wellneuro.fr/portail/connexion',
    });
    expect(corps).toBe(
      `Bonjour Jennifer,\n\n` +
      `Votre praticien vous ouvre l'accès à votre espace patient Wellneuro.\n\n` +
      `Rendez-vous sur votre page d'accès :\nhttps://app.wellneuro.fr/portail/connexion\n\n` +
      `Vous pourrez vous connecter avec Google, ou recevoir un lien d'accès ` +
      `par e-mail à l'adresse enregistrée par votre praticien.\n\n` +
      `Lors de votre première connexion, il vous sera demandé de donner votre consentement, ` +
      `de remplir une courte fiche de renseignements puis un questionnaire d'anamnèse. ` +
      `Vos questionnaires de suivi seront ensuite mis à votre disposition.\n\n` +
      `L'équipe Wellneuro`,
    );
  });

  it('accès portail v2 — texte validé le 2026-09-04, au caractère près', () => {
    const { sujet, corps } = rendreGabarit(getGabarit('acces_portail'), {
      prenom: 'Jennifer',
      connexion: 'https://app.wellneuro.fr/portail/connexion',
    });
    expect(sujet).toBe('Votre espace de suivi — Martial Cayre (Wellneuro)');
    expect(corps).toBe(
      `Bonjour Jennifer,\n\n` +
      `Je vous ouvre l’accès à votre espace de suivi.\n\n` +
      `Wellneuro est l’outil que j’utilise pour le suivi de mes patients, et ` +
      `wellneuro.fr est mon site : ce message, et ceux qui suivront depuis ` +
      `noreply@wellneuro.fr, viennent de mon cabinet. L’accès à cet espace et le ` +
      `suivi qui s’y fait sont gratuits — il n’y a rien à payer, ni maintenant ni ` +
      `plus tard.\n\n` +
      `Votre page d’accès :\nhttps://app.wellneuro.fr/portail/connexion\n\n` +
      `Vous pouvez taper cette adresse vous-même dans votre navigateur plutôt que de ` +
      `cliquer : elle mène au même endroit. Vous vous y connecterez avec Google, ou ` +
      `en demandant un lien d’accès par e-mail, à l’adresse à laquelle vous recevez ` +
      `ce message.\n\n` +
      `À la première connexion : votre consentement, une courte fiche de ` +
      `renseignements, puis quelques questions sur ce qui vous amène. Vos ` +
      `questionnaires sont mis à disposition ensuite, et vous avancez à votre ` +
      `rythme ; si l’un d’eux porte une date limite, elle vous sera indiquée.\n\n` +
      `On ne vous demandera jamais de coordonnées bancaires, de numéro de carte ni ` +
      `de mot de passe. Une question, un doute sur un message reçu : écrivez-moi à ` +
      `martialcayre@wellneuro.fr.\n\n` +
      `Martial Cayre\n` +
      `Docteur en Pharmacie — praticien en santé fonctionnelle\n` +
      `Labellisé Neuro-Nutrition® (Institut SIIN)\n` +
      `Wellneuro — wellneuro.fr`,
    );
  });

  it('le texte servi ne promet rien que le dépôt ne tienne (revue 2026-09-04)', () => {
    const { corps } = rendreGabarit(getGabarit('acces_portail'), {
      prenom: 'Jennifer',
      connexion: 'https://app.wellneuro.fr/portail/connexion',
    });
    // La racine du domaine sert `/login`, l'écran praticien : l'annoncer au
    // patient comme « la même page » l'envoie au mur (`app/page.tsx`).
    expect(corps).not.toMatch(/taper\s+app\.wellneuro\.fr/);
    // `SEGMENTS_GABARITS.dateLimite` existe et part avec les assignations.
    expect(corps).not.toContain('sans échéance');
    // L'adresse annoncée reste celle de la page de connexion PATIENT.
    expect(corps).toContain('https://app.wellneuro.fr/portail/connexion');
    // Marque déposée, usage « strictement encadré » par l'Institut SIIN :
    // le trait d'union en fait partie, et l'institut DÉLIVRE le label.
    expect(corps).toContain('Neuro-Nutrition® (Institut SIIN)');
    expect(corps).not.toMatch(/NeuroNutrition/);
    expect(corps).not.toContain('S.I.I.N.');
  });

  it('le texte servi ne parle plus au nom d’une équipe anonyme', () => {
    const { corps } = rendreGabarit(getGabarit('acces_portail'), {
      prenom: 'Jennifer',
      connexion: 'https://app.wellneuro.fr/portail/connexion',
    });
    expect(corps).not.toContain("L'équipe Wellneuro");
    expect(corps).not.toContain('Votre praticien');
    expect(corps).toContain('gratuits');
  });

  it('assignation de questionnaire — avec et sans segments', () => {
    const g = getGabarit('assignation_questionnaire');
    const avec = rendreGabarit(g, {
      titre: 'Questionnaire de suivi',
      dateInfo: rendreSegment('dateLimite', '12/09/2026'),
      noteInfo: rendreSegment('notePraticien', 'Prenez votre temps.'),
      portalUrl: 'https://app.wellneuro.fr/portail',
    });
    expect(avec.corps).toBe(
      `Bonjour,\n\n` +
      `Votre praticien vous invite à compléter le questionnaire suivant avant votre consultation :\n` +
      `« Questionnaire de suivi »\nÀ compléter avant le : 12/09/2026\nNote de votre praticien : Prenez votre temps.\n\n` +
      `Accédez à votre espace patient ici :\nhttps://app.wellneuro.fr/portail\n\n` +
      `L'équipe Wellneuro`,
    );
    const sans = rendreGabarit(g, {
      titre: 'Questionnaire de suivi',
      dateInfo: rendreSegment('dateLimite', ''),
      noteInfo: rendreSegment('notePraticien', null),
      portalUrl: 'https://app.wellneuro.fr/portail',
    });
    expect(sans.corps).toContain('« Questionnaire de suivi »\n\nAccédez');
  });

  it("pack et file d'envoi — liste préformatée", () => {
    const liste = ['Questionnaire A', 'Questionnaire B'].map(t => `• ${t}`).join('\n');
    const pack = rendreGabarit(getGabarit('assignation_pack'), {
      packNom: 'Base de consultation',
      liste,
      dateInfo: '',
      noteInfo: '',
      portalUrl: 'https://app.wellneuro.fr/portail',
    });
    expect(pack.corps).toBe(
      `Bonjour,\n\n` +
      `Votre praticien vous invite à compléter les questionnaires du pack « Base de consultation » avant votre consultation :\n` +
      `• Questionnaire A\n• Questionnaire B\n\n` +
      `Un seul lien suffit : après confirmation de votre email, vous pourrez accéder à tous les questionnaires en attente du pack et les remplir dans l'ordre de votre choix.\n\n` +
      `Accéder à vos questionnaires :\nhttps://app.wellneuro.fr/portail\n\n` +
      `L'équipe Wellneuro`,
    );
    const file = rendreGabarit(getGabarit('file_envoi'), {
      liste,
      dateInfo: '',
      noteInfo: '',
      portalUrl: 'https://app.wellneuro.fr/portail',
    });
    expect(file.corps).toBe(
      `Bonjour,\n\n` +
      `Votre praticien vous invite à compléter les questionnaires suivants :\n` +
      `• Questionnaire A\n• Questionnaire B\n\n` +
      `Un seul lien suffit : après confirmation de votre email, vous pourrez accéder à tous les questionnaires en attente et les remplir dans l'ordre de votre choix.\n\n` +
      `Accéder à vos questionnaires :\nhttps://app.wellneuro.fr/portail\n\n` +
      `L'équipe Wellneuro`,
    );
  });

  it('accusé de réception et envoi du bilan', () => {
    const accuse = rendreGabarit(getGabarit('accuse_reception'), { titre: 'Questionnaire de suivi' });
    expect(accuse.corps).toBe(
      `Bonjour,\n\n` +
      `Nous confirmons la bonne réception de vos réponses au questionnaire :\n` +
      `« Questionnaire de suivi »\n\n` +
      `Votre praticien Wellneuro en prendra connaissance prochainement.\n\n` +
      `L'équipe Wellneuro`,
    );
    const bilan = rendreGabarit(getGabarit('envoi_bilan'), {});
    expect(bilan.sujet).toBe('Votre bilan neuronutritionnel validé — Wellneuro');
    expect(bilan.corps).toBe(
      'Bonjour,\n\nVotre praticien vous transmet votre bilan neuronutritionnel Wellneuro.\nCe document a été préparé après validation humaine et ne constitue pas un diagnostic médical.\n\nBien cordialement,\nL\'équipe Wellneuro',
    );
  });
});
