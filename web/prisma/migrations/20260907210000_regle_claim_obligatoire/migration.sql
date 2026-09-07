-- Le contract de l'expand/contract ouvert par `20260907200000_regle_claim_fondateur`
-- ([[D-140]]). Les deux colonnes de claim deviennent NOT NULL : une règle
-- clinique sans claim fondateur cesse d'être représentable.
--
-- POURQUOI MAINTENANT, ET PAS AVANT. L'expand a posé les colonnes NULLABLES
-- parce que le code alors déployé ne les remplissait pas : les rendre
-- obligatoires aurait fait échouer toute création de règle pendant la fenêtre
-- [[D-087]]. Cette migration voyage AVEC le code qui les exige — la route de
-- création et la route de révision refusent désormais une règle sans claim, et
-- vérifient au corpus que le claim cité est VALIDE. L'ordre de `D-087` tient
-- toujours : ce code se déploie AVANT que cette migration soit approuvée, et
-- il n'écrit alors que des règles POURVUES d'un claim. Rien ne peut donc
-- naître entre-temps qui empêcherait le resserrement.
--
-- SANS REPRISE DE DONNÉES, ET SANS DÉFAUT INVENTÉ. `clinical_rules` compte
-- 0 ligne en production (lecture du 2026-09-07, one-off-442). Il n'y a rien à
-- migrer — et s'il y avait quelque chose, il n'y aurait rien à écrire : un
-- claim ne se devine pas (`DC-19`, `DC-20`), pas plus qu'une dose ou un seuil.
-- La garde ci-dessous refuse donc le resserrement en le DISANT, plutôt que de
-- laisser tomber une violation de contrainte nue — et surtout plutôt que de
-- remplir les lignes orphelines avec un identifiant fabriqué.

DO $$
DECLARE
  orphelines integer;
BEGIN
  SELECT count(*) INTO orphelines
  FROM public.clinical_rules
  WHERE "claim_id" IS NULL OR "version_claim" IS NULL;

  IF orphelines > 0 THEN
    RAISE EXCEPTION
      'RESSERREMENT REFUSÉ : % règle(s) clinique(s) ne nomment aucun claim fondateur. '
      'Aucun claim ne peut être inventé pour elles (DC-19, DC-20) : chaque règle doit '
      'être révisée à la main — par l''atelier, qui exige désormais le claim — ou '
      'désactivée, avant que ce resserrement puisse s''appliquer.',
      orphelines;
  END IF;
END $$;

ALTER TABLE "public"."clinical_rules" ALTER COLUMN "claim_id" SET NOT NULL;
ALTER TABLE "public"."clinical_rules" ALTER COLUMN "version_claim" SET NOT NULL;

-- LES TROIS CHECK DE L'EXPAND RESTENT EN PLACE, et ce n'est pas de l'inertie :
--   - les deux CHECK de format (`IS NULL OR … ~ '…'`) gardent le FORMAT, que
--     NOT NULL ne dit pas ; leur branche `IS NULL` devient inatteignable, et
--     les réécrire coûterait un DROP + ADD, donc un balayage de table, pour
--     zéro garde supplémentaire ;
--   - le CHECK de paire (`(claim_id IS NULL) = (version_claim IS NULL)`) devient
--     trivialement vrai, mais il reste la trace en base de la raison qui
--     l'a posé : le couple, et non chaque colonne, est ce qui est UNIQUE dans
--     `rag_corpus_claims`.
--
-- CE QUE CETTE MIGRATION NE GARDE TOUJOURS PAS : que le claim cité EXISTE et
-- soit VALIDE au corpus. Aucune clé étrangère n'est possible vers
-- `rag_corpus_claims` (table SQL-brut hors `schema.prisma`) ; cette
-- vérification vit dans les routes d'écriture et dans `lireCatalogueDecision`
-- à la lecture. La base garde la FORME, le code garde le LIEN.
