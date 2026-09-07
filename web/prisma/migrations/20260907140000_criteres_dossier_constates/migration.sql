-- Séparation de `condition_supplementaire` et constat praticien des critères
-- ([[D-138]], arbitrage du 2026-09-07).
--
-- CE QUE CETTE MIGRATION FERME. `clinical_rules.condition_supplementaire`
-- portait DEUX natures dans une seule colonne JSON, et elles ne se
-- rencontraient jamais :
--   * l'API (`validerContenuRegle`) n'accepte QUE `{ critereId }` — tout le
--     reste est refusé `condition_invalide` (400) ;
--   * le moteur C4 (`lireConditionBiologique`) n'accepte QUE
--     `{ type: 'biologie', cible }` — tout le reste est ILLISIBLE, et une
--     condition illisible vaut REFUS, jamais règle inconditionnelle.
-- Une règle conditionnée à un critère — la seule que l'outil sache écrire —
-- refusait donc son intention, en la disant illisible.
--
-- SANS REPRISE DE DONNÉES. Lecture de production du 2026-09-07 (one-off-442) :
-- `clinical_rules` 0 ligne, `clinical_criteria` 0 ligne. Aucune ligne à
-- convertir, aucun risque de perte. L'ancienne colonne est CONSERVÉE : sa
-- suppression est destructive et demandera sa propre confirmation, une fois
-- que plus aucun code ne l'écrit.

-- 1. Les deux natures, séparées.
ALTER TABLE "public"."clinical_rules" ADD COLUMN "condition_critere_id" TEXT;
ALTER TABLE "public"."clinical_rules" ADD COLUMN "condition_biologie" JSONB;

-- La référence au critère devient une VRAIE clé étrangère. Jusqu'ici elle
-- vivait dans un JSON : `clinical_criteria` n'avait aucune relation entrante,
-- et rien n'empêchait une règle de pointer un critère supprimé.
ALTER TABLE "public"."clinical_rules"
  ADD CONSTRAINT "clinical_rules_condition_critere_id_fkey"
  FOREIGN KEY ("condition_critere_id") REFERENCES "public"."clinical_criteria"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "clinical_rules_condition_critere_id_idx"
  ON "public"."clinical_rules"("condition_critere_id");

-- 2. Le chaînon manquant : ce qui rend un critère vrai sur un dossier.
--
-- Un critère est un MOT du vocabulaire gouverné — un code, un libellé, une
-- catégorie. Rien dans le dépôt ne dit ce qu'il lit chez un patient, et
-- l'inventer serait inventer de la sémantique clinique (`DC-19`, `DC-20`).
-- Il ne se dérive donc pas : il se CONSTATE, par un praticien qui le signe.
-- Même patron que `panels_biologie_documentes` (déclaration d'un fait hors
-- outil) et `arbitrages_biologiques` (verdict tracé, jamais silencieux).
CREATE TABLE "public"."criteres_dossier_constates" (
    "id" TEXT NOT NULL,
    "id_patient" TEXT NOT NULL,
    "critere_id" TEXT NOT NULL,
    -- `true` = constaté présent, `false` = constaté absent. NOT NULL : un
    -- constat sans sens ne serait que du bruit. L'INCONNU s'exprime par
    -- l'absence de ligne, jamais par un troisième état muet (`DC-24`).
    "present" BOOLEAN NOT NULL,
    "note" TEXT,
    "constate_par" TEXT NOT NULL,
    "constate_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "criteres_dossier_constates_pkey" PRIMARY KEY ("id")
);

-- Le signataire n'est jamais vide : une pièce de dossier sans auteur ne se
-- relit pas. Même CHECK que `panels_biologie_documentes.declare_par`.
ALTER TABLE "public"."criteres_dossier_constates"
  ADD CONSTRAINT "cb_critere_dossier_constate_par_non_vide"
  CHECK (length(btrim("constate_par")) > 0);

-- La note explique le constat, elle ne le remplace pas — et elle est bornée,
-- comme toute zone de texte praticien du dossier.
ALTER TABLE "public"."criteres_dossier_constates"
  ADD CONSTRAINT "cb_critere_dossier_note_bornee"
  CHECK ("note" IS NULL OR length("note") <= 2000);

-- UN constat par critère et par dossier : re-constater met à jour, jamais
-- n'empile deux verdicts contradictoires que rien ne départagerait.
CREATE UNIQUE INDEX "cb_critere_dossier_unique"
  ON "public"."criteres_dossier_constates"("id_patient", "critere_id");

ALTER TABLE "public"."criteres_dossier_constates"
  ADD CONSTRAINT "criteres_dossier_constates_id_patient_fkey"
  FOREIGN KEY ("id_patient") REFERENCES "public"."patients"("id_patient")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT vers le vocabulaire : un critère cité par un constat ne se supprime
-- pas sous les pieds du dossier. Le vocabulaire se désactive (`actif`), il ne
-- s'efface pas.
ALTER TABLE "public"."criteres_dossier_constates"
  ADD CONSTRAINT "criteres_dossier_constates_critere_id_fkey"
  FOREIGN KEY ("critere_id") REFERENCES "public"."clinical_criteria"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS deny-all, posée DANS la migration qui crée la table — l'omission ne fait
-- rougir personne, c'est ainsi qu'`arbitrages_biologiques` est restée trois
-- jours la seule table de `public` sans RLS ([[D-072]]). La ligne dit « ce
-- praticien a constaté ce critère sur ce dossier » : c'est une donnée de santé
-- nominative. Aucune policy n'est posée — l'application accède en connexion
-- Postgres directe via Prisma.
ALTER TABLE "public"."criteres_dossier_constates" ENABLE ROW LEVEL SECURITY;
