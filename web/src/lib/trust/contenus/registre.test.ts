import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '@/lib/clinical-engine/canonical';
import {
  getDocumentCourant,
  getVersion,
  REGISTRE_DOCUMENTS_TRUST,
  VERSION_CONSENTEMENT_COURANTE,
} from './registre';

describe('registre des documents TRUST', () => {
  it('verrouille le hash de chaque version publiée — modifier un texte sans créer de version casse ce test', () => {
    for (const doc of REGISTRE_DOCUMENTS_TRUST) {
      const recalcule = canonicalSha256({
        key: doc.key,
        version: doc.version,
        titre: doc.titre,
        resume: doc.resume,
        sections: doc.sections,
      });
      expect(recalcule, `${doc.key}@${doc.version}`).toBe(doc.hash);
    }
  });

  it('expose les neuf documents attendus', () => {
    const cles = REGISTRE_DOCUMENTS_TRUST.map(d => `${d.key}@${d.version}`);
    expect(cles).toEqual([
      'cadre_accompagnement@v1',
      'limites_securite@v1',
      'donnees_confidentialite@v1',
      'donnees_confidentialite@v2',
      'donnees_confidentialite@v3',
      // Append-only : la v4 s'ajoute derrière la v3, qui garde sa place.
      'donnees_confidentialite@v4',
      'usage_ia@v1',
      'droits_patient@v1',
      'consentement_suivi@v2',
    ]);
  });

  it('chaque version porte un résumé, au moins une section et une date de publication', () => {
    for (const doc of REGISTRE_DOCUMENTS_TRUST) {
      expect(doc.resume.length).toBeGreaterThan(10);
      expect(doc.sections.length).toBeGreaterThan(0);
      expect(doc.publieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('getDocumentCourant retourne la version la plus récemment publiée et getVersion retrouve une version exacte', () => {
    expect(getDocumentCourant('consentement_suivi').version).toBe('v2');
    expect(getVersion('consentement_suivi', 'v2')?.hash).toBe(
      getDocumentCourant('consentement_suivi').hash,
    );
    expect(getVersion('consentement_suivi', 'v99')).toBeNull();
    expect(() => getDocumentCourant('inconnu' as never)).toThrow();
  });

  it('la version de consentement courante est celle du document consentement_suivi', () => {
    expect(VERSION_CONSENTEMENT_COURANTE).toBe('v2');
  });

  it("aucun document n'utilise le lexique interdit ni ne promet une surveillance", () => {
    const texte = JSON.stringify(REGISTRE_DOCUMENTS_TRUST).toLowerCase();
    for (const interdit of ['ordonnance', 'prescription', 'diagnostic médical établi', 'neuroscore', 'surveillance 24']) {
      expect(texte).not.toContain(interdit);
    }
    // « diagnostic » n'apparaît que dans des négations (« hors diagnostic », « pas de diagnostic »).
    const occurrences = texte.match(/[^«»]{30}diagnostic/g) ?? [];
    for (const contexte of occurrences) {
      expect(/n['’]établit pas|hors diagnostic|pas un diagnostic|ne constitue pas/.test(contexte)).toBe(true);
    }
  });

  it('la v4 est servie, et elle ne nie plus la connexion patient par Google', () => {
    // LE DÉFAUT : la v3 écrivait « Google — connexion sécurisée du praticien
    // uniquement (jamais des patients) ». C'est une négation explicite, et elle
    // était fausse depuis le 2026-07-22 — la porte Google patient est ouverte
    // en production, relue par `env-get` le 2026-09-07.
    const courant = getDocumentCourant('donnees_confidentialite');
    expect(courant.version).toBe('v4');
    const points = courant.sections.flatMap(sec => sec.points ?? []);
    expect(points.some(p => p.includes('jamais des patients'))).toBe(false);
    expect(points.some(p => p.includes('si vous le choisissez, votre propre connexion'))).toBe(true);
  });

  it('la v4 nomme le prestataire d’envoi et dit ce que les emails transportent', () => {
    // NOMMER LE PRESTATAIRE SANS DIRE CE QUE LES E-MAILS PORTENT aurait
    // fabriqué une nouvelle fausseté : `/portail/connexion` affirme « seule
    // votre adresse email est transmise — aucune donnée de santé », vrai de la
    // CONNEXION, et les deux surfaces se seraient lues ensemble comme
    // « Google, aucune donnée de santé ». Or le bilan validé part par ce relais.
    const points = getDocumentCourant('donnees_confidentialite').sections.flatMap(s => s.points ?? []);
    const envoi = points.find(p => p.startsWith('Google Workspace'));
    expect(envoi).toBeTruthy();
    expect(envoi).toContain('les documents que votre praticien vous adresse');
  });

  it('la v4 dit que les connexions sont enregistrées, là où elle invite à les signaler', () => {
    // Le document invitait à signaler « une connexion que vous ne reconnaissez
    // pas » sans dire nulle part que les connexions étaient enregistrées.
    const paragraphes = getDocumentCourant('donnees_confidentialite').sections.flatMap(s => s.paragraphes ?? []);
    expect(paragraphes.some(p => p.includes('enregistrées pendant douze mois'))).toBe(true);
  });

  it('la v4 ne redemande AUCUN accusé aux patients déjà consentants', () => {
    // LE PIÈGE DE CET ITEM. `AvantDeCommencer` ne s'ajoute pas : il REMPLACE la
    // page. Exiger un accusé remettrait quatre écrans devant tous les patients
    // en cours — y compris celui qui note sa quatorzième nuit sur vingt et une
    // — pour un texte qui ne parle même pas de Google. Et aucun banc ne
    // l'aurait vu : les fixtures e2e résolvent la version depuis le registre.
    expect(getDocumentCourant('donnees_confidentialite').requiresAcknowledgement).toBe(false);
  });
});
