-- Sélection praticien d'une priorité — l'acte qui manquait à la chaîne C1
-- (`D-127`, arbitrages 1 à 3).
--
-- CE QUE LA TABLE FERME. `buildProtocolDraft` exige depuis toujours une
-- priorité sélectionnée par le praticien, et AUCUN module de `src/` n'en
-- produisait : les deux sites de construction de carte du cockpit passaient
-- `selectionPraticien: null`. Enregistrer une version de protocole était donc
-- impossible depuis l'application — constat OBSERVÉ sur un parcours réel le
-- 2026-09-06 (`D-125`), et non plus seulement démontré dans le code. Lecture
-- de production du même jour : zéro version C1, quatre épisodes `T0` confirmés
-- arrêtés à cette coupure.
--
-- L'ACTE, PAS UN RÉGLAGE D'ÉCRAN. La ligne porte QUI a choisi, QUAND, QUOI et
-- POURQUOI — `rationale` est un motif écrit par le praticien, pas un champ
-- technique. C'est ce qui interdit l'`UPDATE` : voir le régime ci-dessous.
--
-- APPEND-ONLY CHAÎNÉ, ET CE N'EST PAS UNE PRÉFÉRENCE DE STYLE. `selected_at`
-- entre dans l'empreinte de la carte de décision, et chaque version de
-- protocole ancre sa provenance sur `protocol_drafts.decision_card_input_hash`.
-- Une sélection mise à jour EN PLACE ferait donc pointer l'ancre d'une version
-- DÉJÀ ENREGISTRÉE vers une carte que la base ne saurait plus reconstruire :
-- `refusChaineC1` refuserait une version que le praticien avait légitimement
-- écrite. Le chaînage est ce qui garde chaque version passée re-vérifiable.
-- Patron maison — treize chaînes `supersedes_*` au schéma avant celle-ci.
--
-- `decision_card_input_hash` NE BARRE RIEN, et c'est délibéré (`D-127` §2).
-- Le fail-closed existe déjà en amont : `buildDecisionCard` refuse une
-- sélection dont le recalcul serveur ne produit pas le candidat. Gater sur
-- l'empreinte refuserait en plus des sélections encore parfaitement valides —
-- le dossier ayant bougé sur un axe sans rapport. La colonne est là pour que
-- le DÉSACCORD SE DISE : sans elle, une sélection devenue inapplicable fait
-- jeter `construireChaineC1`, exception que le rejeu du cockpit rattrape en
-- servant « proposition » — le praticien verrait son épisode confirmé
-- redevenir un formulaire à confirmer, exactement ce que `D-118` a fermé.
--
-- Aucune donnée n'est touchée : la table est neuve et rien n'est rétro-posé
-- (`D-127` §4 — une priorité posée aujourd'hui sur un dossier d'hier serait un
-- acte que personne n'a posé, `DC-01`).

-- CreateTable
CREATE TABLE "decision_priority_selections" (
    "id" TEXT NOT NULL,
    "id_patient" TEXT NOT NULL,
    "decision_card_id" TEXT NOT NULL,
    "decision_card_input_hash" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selected_by_email" TEXT NOT NULL,
    "supersedes_selection_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_priority_selections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — UNE SEULE RACINE PAR CARTE. Unicité PARTIELLE, patron de
-- `cb_resultat_bio_patient_analyte_idx` depuis `D-124` : elle ne vise que les
-- lignes non chaînées. Deux clics simultanés sur « sélectionner » ne peuvent
-- donc pas ouvrir deux fils concurrents sur la même carte.
CREATE UNIQUE INDEX "c1_selection_priorite_racine_unique"
  ON "decision_priority_selections"("id_patient", "decision_card_id")
  WHERE "supersedes_selection_id" IS NULL;

-- CreateIndex — AU PLUS UN SUCCESSEUR PAR LIGNE. Avec la garde de racine
-- ci-dessus, le fil d'une carte est STRICTEMENT LINÉAIRE : aucune fourche
-- n'est représentable.
--
-- RESSERREMENT ASSUMÉ par rapport aux autres chaînes `supersedes_*` du dépôt,
-- qui tolèrent la fourche et la tranchent à la lecture (`filCorrection`). Ici
-- la lecture n'a pas de règle de départage à appliquer, et il vaut mieux
-- qu'elle n'en ait jamais besoin : deux sélections concurrentes de la MÊME
-- carte, c'est deux praticiens qui croient chacun avoir décidé. La base
-- refuse plutôt que d'élire. (`NULL` distinct en unicité PostgreSQL : cet
-- index ne contraint pas les racines, dont s'occupe le précédent.)
CREATE UNIQUE INDEX "c1_selection_priorite_supersedes_unique"
  ON "decision_priority_selections"("supersedes_selection_id");

-- CreateIndex — index de LECTURE : le fil ENTIER d'une carte, chaîne comprise,
-- que la garde partielle ci-dessus ne couvre pas (elle ignore les lignes
-- chaînées). Même raison que `cb_resultat_bio_serie_idx`.
CREATE INDEX "c1_selection_priorite_carte_idx"
  ON "decision_priority_selections"("id_patient", "decision_card_id", "selected_at");

-- AddForeignKey — RESTRICT : la suppression nommée reste celle de la
-- transaction d'effacement IDP2 (`lib/patient/effacement.ts`), jamais une
-- cascade silencieuse.
ALTER TABLE "decision_priority_selections"
  ADD CONSTRAINT "decision_priority_selections_id_patient_fkey"
    FOREIGN KEY ("id_patient") REFERENCES "patients"("id_patient")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contraintes métier — hors périmètre Prisma, portées par le SQL seul.
--
-- `btrim` reçoit sa LISTE DE CARACTÈRES explicite : `btrim/1` ne retire que
-- l'espace ASCII, et un champ réduit à des tabulations passerait un CHECK
-- écrit sans elle.
--
-- `rationale` EST LA DÉCISION, pas une note facultative : une priorité
-- choisie sans motif écrit ne se relit pas six semaines plus tard, et c'est
-- précisément ce que la version de protocole citera. Borne haute 2000, celle
-- de `note_courte` sur `arbitrages_biologiques` — même nature, même borne.
ALTER TABLE "decision_priority_selections"
  ADD CONSTRAINT "decision_priority_selections_rationale_check"
    CHECK (btrim("rationale", E' \t\r\n') <> '' AND char_length("rationale") <= 2000);

-- `candidate_id` vaut `priority:<id de règle>` : dérivé de la RÈGLE clinique,
-- jamais de l'instance de carte — c'est ce qui lui permet de survivre à un
-- recalcul. Le CHECK ne borne que la forme non vide ; l'existence du candidat
-- est vérifiée par `buildDecisionCard`, qui seul connaît la table signée.
ALTER TABLE "decision_priority_selections"
  ADD CONSTRAINT "decision_priority_selections_candidate_id_check"
    CHECK (btrim("candidate_id", E' \t\r\n') <> '');

-- `selected_by_email` est l'e-mail de session, posé CÔTÉ SERVEUR — l'écran ne
-- transmet ni auteur ni horodatage (patron `arbitre_par`). 320 = borne
-- technique d'une adresse (RFC 5321), aucune sémantique clinique.
--
-- À NE PAS CONFONDRE avec le `selectedBy` du contrat C1, qui vaut la constante
-- `'practitioner'` : `buildDecisionCard` refuse toute autre valeur, et c'est
-- ce refus qui interdit de faire passer la proposition du moteur pour la
-- décision d'un praticien (`D-127`, forme refusée).
ALTER TABLE "decision_priority_selections"
  ADD CONSTRAINT "decision_priority_selections_selected_by_check"
    CHECK (btrim("selected_by_email", E' \t\r\n') <> ''
           AND char_length("selected_by_email") <= 320);

-- L'empreinte de carte est un SHA-256 canonique : 64 caractères hexadécimaux
-- minuscules, la forme que rend `canonicalSha256`. Une valeur d'une autre
-- forme ne vient pas de la chaîne.
ALTER TABLE "decision_priority_selections"
  ADD CONSTRAINT "decision_priority_selections_carte_empreinte_check"
    CHECK ("decision_card_input_hash" ~ '^[0-9a-f]{64}$');

-- Une sélection ne se supplante pas elle-même : elle disparaîtrait du fil
-- (aucune ligne n'est jamais tête si elle se pointe). Même garde que
-- `resultats_biologiques_supersedes_non_reflexif_check`, posée par `D-124`.
ALTER TABLE "decision_priority_selections"
  ADD CONSTRAINT "decision_priority_selections_supersedes_non_reflexif_check"
    CHECK ("supersedes_selection_id" IS NULL
           OR "supersedes_selection_id" <> "id");

-- Sécurité : deny-all RLS par défaut (posture D-005). La table porte une
-- DONNÉE DE SANTÉ nominative — « pour ce patient, le praticien a retenu cette
-- priorité clinique, et voici pourquoi ». L'application accède en connexion
-- Postgres directe via Prisma ; aucun accès Data API n'est requis.
ALTER TABLE "public"."decision_priority_selections" ENABLE ROW LEVEL SECURITY;
