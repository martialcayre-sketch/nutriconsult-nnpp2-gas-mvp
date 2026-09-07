/**
 * TRUST V1 — configuration de gouvernance (LOT-01).
 * Valeurs factuelles vérifiées à l'audit (AUDIT_ETAT_REEL_TRUST.md, G-TRUST-02).
 * Règle du cadrage : aucune phrase générique ne remplace une information
 * inconnue — ce qui n'est pas encore formalisé est dit tel quel.
 *
 * CE MODULE N'A AUCUN CONSOMMATEUR, et le dossier RGPD l'avait nommé « copie
 * morte » dès le 2026-08-19 en prédisant le risque : « rien ne tient les deux
 * copies synchrones — une modification de `gouvernance.ts` n'atteindrait aucun
 * patient tout en paraissant l'avoir fait ».
 *
 * LA DÉRIVE A EU LIEU, DANS L'AUTRE SENS. Le 2026-09-07, `D-137` a établi que
 * « Google — connexion sécurisée du praticien uniquement (jamais des
 * patients) » était FAUX et l'a corrigé dans le document servi au patient. Ce
 * fichier, lui, a gardé la phrase démentie — plus « Vercel et Supabase », un
 * fournisseur d'e-mails anonyme depuis qu'il est identifié, et aucune mention
 * de Sentry.
 *
 * D'où le geste : `sousTraitants` n'est plus recopié, il est DÉRIVÉ du document
 * courant. Une liste qui se recopie diverge ; une liste qui se calcule ne le
 * peut pas.
 */

import { getDocumentCourant } from './contenus/registre';

/**
 * Les prestataires tels que le document COURANT les présente au patient.
 * `'Scalingo — hébergement…'` devient `{ nom: 'Scalingo', role: 'hébergement…' }`.
 */
function sousTraitantsDuDocumentCourant(): readonly { nom: string; role: string }[] {
  const section = getDocumentCourant('donnees_confidentialite').sections.find(
    s => s.titre === 'Quels prestataires techniques interviennent ?',
  );
  return Object.freeze(
    (section?.points ?? []).map(point => {
      // Le tiret cadratin sépare le nom du rôle dans chacun des points.
      const separation = point.indexOf(' — ');
      return Object.freeze(
        separation === -1
          ? { nom: point, role: '' }
          : { nom: point.slice(0, separation), role: point.slice(separation + 3) },
      );
    }),
  );
}

export const GOUVERNANCE_TRUST = Object.freeze({
  /** Responsable du traitement (décision G-TRUST-02, 2026-07-16). */
  responsable: 'Votre praticien Wellneuro',
  contactDroits: 'martialcayre@wellneuro.fr',
  /** DÉRIVÉ du document servi au patient — jamais recopié (voir l'en-tête). */
  sousTraitants: sousTraitantsDuDocumentCourant(),
  /** Politique de conservation : en cours de formalisation — dit honnêtement. */
  dureesConservation:
    'La politique détaillée de durées de conservation est en cours de formalisation. ' +
    'Vos données sont conservées le temps de votre accompagnement ; vous pouvez à tout ' +
    'moment demander des précisions ou l’exercice de vos droits au contact ci-dessous.',
  juridiction: 'FR',
} as const);

/** Bloc urgence France (contenu configurable par juridiction, défaut FR). */
export const NUMEROS_URGENCE_FR = Object.freeze([
  Object.freeze({ numero: '15', libelle: 'SAMU — urgence médicale' }),
  Object.freeze({ numero: '112', libelle: 'Numéro d’urgence européen' }),
  Object.freeze({ numero: '114', libelle: 'Urgence par SMS ou application (personnes sourdes, malentendantes, sourdaveugles ou aphasiques)' }),
  Object.freeze({ numero: '3114', libelle: 'Numéro national de prévention du suicide' }),
] as const);
