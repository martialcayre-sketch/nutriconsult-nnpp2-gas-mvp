-- Le claim qui fonde la règle ([[D-139]], arbitrage du 2026-09-07 : « un claim,
-- comme les plages biologiques »).
--
-- CE QUE CETTE MIGRATION FERME. `deciderIntentionAvantBiologie` vérifie
-- `claimsValides` en PREMIER — avant la sécurité, le déclencheur, le critère et
-- la biologie. `lireCatalogueDecision` rend une carte VIDE, donc `false` pour
-- chaque règle : la prévisualisation de l'atelier, seul appelant du moteur,
-- refuse TOUTE règle avec `claims_non_valides`. Et le motif de ce refus dit
-- quelque chose de faux — « les claims cités par la règle ne sont pas valides »
-- — alors qu'aucun claim n'est cité : `clinical_rules` n'avait aucun champ pour
-- en nommer un. Le corpus n'est pourtant pas le problème : la production compte
-- 8 224 claims `VALIDE` (lecture du 2026-09-07, one-off-1163).
--
-- L'INVARIANT N'EST PAS INVENTÉ, IL EST RECOPIÉ. `biology_functional_ranges`
-- porte `claim_id` + `version_claim` NOT NULL, avec cette phrase au schéma :
-- « une plage fonctionnelle sans claim validé n'existe pas, donc n'est jamais
-- servie ». Les règles d'orientation suivent la même règle. `clinical_rules`
-- était la seule à y échapper.
--
-- PAS DE CLÉ ÉTRANGÈRE, ET CE N'EST PAS UN OUBLI : `rag_corpus_claims` est une
-- table SQL-brut hors `schema.prisma` (`prisma.config.ts`, `tables.external`).
-- Le lien se vérifie à la lecture — comme pour `biology_functional_ranges` et
-- pour les claims des règles d'orientation. Les CHECK de FORMAT ci-dessous sont
-- ce que la base peut garder toute seule : ils interdisent d'écrire une
-- référence qui ne pourrait désigner aucun claim.
--
-- NULLABLES ICI, ET C'EST L'EXPAND D'UN EXPAND/CONTRACT. Poser NOT NULL
-- maintenant ferait échouer toute création de règle pendant la fenêtre entre
-- l'application de cette migration et le déploiement du code qui remplit les
-- colonnes — [[D-087]] l'écrit noir sur blanc : « le code déployé tolère une
-- base en avance À CONDITION que la migration soit additive : colonnes
-- nullables, rien de retiré ni renommé ». Le resserrement en NOT NULL est la
-- migration `20260907210000_regle_claim_obligatoire`, livrée AVEC le code.
--
-- SANS REPRISE DE DONNÉES : `clinical_rules` compte 0 ligne en production
-- (lecture du 2026-09-07, one-off-442).

ALTER TABLE "public"."clinical_rules" ADD COLUMN "claim_id" TEXT;
ALTER TABLE "public"."clinical_rules" ADD COLUMN "version_claim" TEXT;

-- Formats RECOPIÉS de `rag_corpus_claims` : une référence hors format ne
-- pourrait désigner aucun claim, et la base sait le refuser sans rien lire
-- d'autre. `IS NULL OR …` parce que la colonne est encore nullable — le NULL
-- est refusé par la migration de resserrement, pas par ces CHECK.
ALTER TABLE "public"."clinical_rules"
  ADD CONSTRAINT "clinical_rules_claim_format"
  CHECK ("claim_id" IS NULL OR "claim_id" ~ '^WN-CL-[0-9]{4}-[0-9]{3}$');

ALTER TABLE "public"."clinical_rules"
  ADD CONSTRAINT "clinical_rules_version_claim_format"
  CHECK ("version_claim" IS NULL OR "version_claim" ~ '^v?[0-9]+\.[0-9]+$');

-- LES DEUX VONT PAR PAIRE. Une règle qui nommerait un claim sans dire quelle
-- version, ou l'inverse, ne désignerait rien d'unique : `rag_corpus_claims`
-- porte son unicité sur le COUPLE (claim_id, version_claim). C'est le même
-- motif que « dose et unité vont par paire » (compositions.ts), et il se garde
-- ici en base plutôt qu'en prose.
ALTER TABLE "public"."clinical_rules"
  ADD CONSTRAINT "clinical_rules_claim_paire"
  CHECK (("claim_id" IS NULL) = ("version_claim" IS NULL));

-- Lecture par claim : « quelles règles reposent sur ce claim ? » est la
-- question que posera toute révision de corpus.
CREATE INDEX "clinical_rules_claim_idx"
  ON "public"."clinical_rules"("claim_id", "version_claim");
