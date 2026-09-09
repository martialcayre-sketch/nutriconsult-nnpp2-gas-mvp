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

  it('expose les onze documents attendus', () => {
    const cles = REGISTRE_DOCUMENTS_TRUST.map(d => `${d.key}@${d.version}`);
    expect(cles).toEqual([
      'cadre_accompagnement@v1',
      'limites_securite@v1',
      'donnees_confidentialite@v1',
      'donnees_confidentialite@v2',
      'donnees_confidentialite@v3',
      // Append-only : la v4 s'ajoute derrière la v3, qui garde sa place.
      'donnees_confidentialite@v4',
      'donnees_confidentialite@v5',
      'donnees_confidentialite@v6',
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

  it('le document servi ne nie plus la connexion patient par Google', () => {
    // LE DÉFAUT : la v3 écrivait « Google — connexion sécurisée du praticien
    // uniquement (jamais des patients) ». C'est une négation explicite, et elle
    // était fausse depuis le 2026-07-22 — la porte Google patient est ouverte
    // en production, relue par `env-get` le 2026-09-07.
    const courant = getDocumentCourant('donnees_confidentialite');
    expect(courant.version).toBe('v6');
    const points = courant.sections.flatMap(sec => sec.points ?? []);
    expect(points.some(p => p.includes('jamais des patients'))).toBe(false);
    expect(points.some(p => p.includes('si vous le choisissez, votre propre connexion'))).toBe(true);
  });

  it('la v5 nomme Sentry, dit ce qu’il reçoit ET ce qu’il ne reçoit jamais', () => {
    // NOMMER UN PRESTATAIRE SANS DIRE CE QU'IL REÇOIT laisserait le patient
    // supposer le pire — ou le meilleur. Le dépôt refuse les deux :
    // `DOSSIER_RGPD.md:194` posait l'écart depuis le 2026-08-07, « soit il ne
    // traite aucune donnée personnelle et cela s'écrit, soit la liste patient
    // est incomplète et se corrige ». Elle se corrige.
    const courant = getDocumentCourant('donnees_confidentialite');
    const sentry = courant.sections.flatMap(s => s.points ?? []).find(p => p.startsWith('Sentry'));
    expect(sentry, 'Sentry absent de la liste des prestataires').toBeTruthy();
    expect(sentry).toContain('Union européenne');
    expect(sentry).toContain('jamais vos réponses');

    // Et la localisation est dite, pas seulement le nom.
    const hebergement = courant.sections.find(s => s.titre === 'Où sont hébergées vos données');
    expect(hebergement?.paragraphes.some(p => p.includes('région européenne'))).toBe(true);
  });

  it('À DATE ÉGALE, c’est la DERNIÈRE DÉCLARÉE qui est servie', () => {
    // Le piège que ce cas ferme : `getDocumentCourant` comparait avec `>=` et
    // gardait donc la PLUS ANCIENNE à date égale. Deux versions publiées le
    // même jour laissaient le patient sur le document périmé, sans signal.
    //
    // CE CAS A FAILLI S'ÉTEINDRE SANS BRUIT. Il s'écrivait « la v5 est servie
    // bien qu'elle partage sa date avec la v4 » — et la v6, publiée le
    // 2026-09-09, a pris la date maximale à elle seule : la paire à égalité
    // n'était plus sur le chemin de `getDocumentCourant`, le cas restait vert
    // en ne prouvant plus rien. Antidater la v6 pour le garder vivant aurait
    // été mentir sur la date de publication d'un document patient.
    //
    // Il est donc réécrit en PROPRIÉTÉ, vraie quel que soit le nombre de
    // versions : le document servi est le dernier déclaré parmi ceux qui
    // portent la date la plus récente. L'attente se dérive du registre, jamais
    // d'une copie de la comparaison qu'elle vérifie.
    const versions = REGISTRE_DOCUMENTS_TRUST.filter(d => d.key === 'donnees_confidentialite');
    const dateMax = [...versions].sort((a, b) => a.publieLe.localeCompare(b.publieLe)).at(-1)?.publieLe;
    const attendue = versions.filter(d => d.publieLe === dateMax).at(-1);
    expect(getDocumentCourant('donnees_confidentialite').version).toBe(attendue?.version);

    // La paire à égalité reste en place comme pièce à conviction : c'est elle
    // qui a révélé le défaut, et elle rougirait encore si `>=` revenait un jour
    // où la date maximale est partagée.
    const v4 = getVersion('donnees_confidentialite', 'v4');
    const v5 = getVersion('donnees_confidentialite', 'v5');
    expect(v4?.publieLe).toBe(v5?.publieLe);
    expect(versions.filter(d => d.publieLe === v4?.publieLe).at(-1)?.version).toBe('v5');
  });

  it('la v5 nomme le prestataire d’envoi et dit ce que les emails transportent', () => {
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

  it('la v6 nomme les résultats d’analyses ET dit ce qui n’en est pas fait', () => {
    // POURQUOI CETTE VERSION EXISTE. `WN_CB_RESULTS_ENABLED` a été posé en
    // production le 2026-09-09 : le dossier peut désormais porter des résultats
    // biologiques chiffrés. Or `DOSSIER_RGPD.md` §2 conditionnait cette
    // ouverture à la mise à jour PRÉALABLE de ce document et du registre des
    // traitements — condition écrite là et nulle part ailleurs, ni dans
    // `FEATURE_FLAGS.md`, ni dans `D-122` §2 qui décrit pourtant le geste. Elle
    // a été manquée ; le drapeau est resté posé et le retard se comble ici.
    //
    // Nommer la catégorie ne suffit pas : un patient qui lit « résultats
    // d'analyses » suppose qu'on en tire quelque chose. Le document dit donc
    // aussi la limite que l'écran tient réellement ([[D-157]]) — la plage est
    // POSÉE À CÔTÉ de la mesure, aucun calcul ne la qualifie.
    const courant = getDocumentCourant('donnees_confidentialite');
    const paragraphes = courant.sections.flatMap(s => s.paragraphes ?? []);

    const recueil = paragraphes.find(p => p.includes('exploration biologique'));
    expect(recueil, 'la catégorie « exploration biologique » est absente du document patient').toBeTruthy();
    expect(recueil).toContain('la valeur mesurée, son unité et la date du prélèvement');

    const limite = paragraphes.find(p => p.includes('Aucun calcul'));
    expect(limite, 'le document ne dit pas ce qui n’est PAS fait des résultats').toBeTruthy();
    expect(limite).toContain('le travail de votre praticien');

    // La conclusion de la section « Quelles données » reste la conclusion : les
    // deux phrases neuves s'insèrent AVANT elle, jamais après.
    const section = courant.sections.find(s => s.titre === 'Quelles données sont recueillies ?');
    expect(section?.paragraphes.at(-1)).toContain('uniquement les informations nécessaires');
  });
});
