-- Contrat du claim fondateur d'une règle clinique ([[D-140]]).
--
-- Ce fichier éprouve ce que la BASE garde toute seule, et rien d'autre :
--   1. une règle citant un claim BIEN FORMÉ est acceptée (cas positif — sans
--      lui, un CHECK devenu trop serré passerait vert et la route casserait) ;
--   2. un `claim_id` hors format est REJETÉ (23514) ;
--   3. une `version_claim` hors format est REJETÉE (23514) ;
--   4. une référence DÉPAREILLÉE — l'un des deux seul — est REJETÉE (23502) ;
--   5. une règle qui ne nomme AUCUN claim est REJETÉE (23502).
--
-- LE MOTIF DES DEUX DERNIERS A CHANGÉ AVEC LE CONTRACT, et il faut le dire.
-- Pendant l'expand, une référence dépareillée était refusée par le CHECK de
-- PAIRE (23514) : le couple (claim_id, version_claim) est ce qui est UNIQUE
-- dans `rag_corpus_claims`, un membre seul ne désigne rien. Depuis
-- `20260907210000_regle_claim_obligatoire`, les deux colonnes sont NOT NULL —
-- et le NOT NULL mord AVANT le CHECK, qu'il rend du même coup inatteignable
-- par cette voie. Le refus est le même, sa raison a monté d'un cran. Le CHECK
-- de paire reste en base comme trace de l'invariant, sans plus être ce qui
-- l'applique : une mutation qui le retirerait ne ferait donc plus rougir ce
-- fichier, et c'est exact.
--
-- CE QU'IL NE PRÉTEND PAS GARDER : que le claim cité EXISTE et soit VALIDE.
-- Aucune clé étrangère n'est possible — `rag_corpus_claims` est une table
-- SQL-brut hors `schema.prisma` —, et cette vérification appartient donc à la
-- route (écriture) et à `lireCatalogueDecision` (lecture). Le dire ici évite de
-- croire que ce contrat garde plus qu'il ne garde.
--
-- Tout se déroule dans une transaction annulée à la fin.
BEGIN;

DO $$
DECLARE
  refuse boolean;
  nb integer;
  nullable text[];

  -- Chaque entrée : un libellé, une insertion qui DOIT échouer, et le SQLSTATE
  -- attendu — attendre le bon motif est ce qui distingue « la garde mord » de
  -- « quelque chose a échoué ». Toutes visent des clés étrangères qui EXISTENT
  -- (fixtures ci-dessous), pour que la garde visée soit le seul motif possible.
  cas CONSTANT text[][] := ARRAY[
    ['claim_id hors format', '23514',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad1', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, 'CL-2026-001', 'v1.0')$q$],
    ['version_claim hors format', '23514',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad2', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, 'WN-CL-2026-001', 'premiere')$q$],
    ['claim sans version — la référence ne désigne rien d''unique', '23502',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad3', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, 'WN-CL-2026-001', NULL)$q$],
    ['version sans claim — l''inverse, et tout aussi vide', '23502',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad4', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, NULL, 'v1.0')$q$],
    -- Le cas que le CONTRACT ferme, et que l'expand laissait passer : une règle
    -- clinique qui ne nomme AUCUN claim fondateur.
    ['règle sans claim fondateur', '23502',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at)
        VALUES ('r_bad5', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP)$q$]
  ];
BEGIN
  -- ── 0. Fixtures — vocabulaire, ingrédient et source de contrat ───────────
  INSERT INTO clinical_intent_tags (id, code, label_fr, categorie, updated_at)
  VALUES ('tag_contrat_c4', 'contrat_c4', 'Intention de contrat', 'fonctionnel', CURRENT_TIMESTAMP);

  INSERT INTO supplement_ingredients (id, code, nom_fr, updated_at)
  VALUES ('ing_contrat_c4', 'CONTRAT_C4', 'Ingrédient de contrat', CURRENT_TIMESTAMP);

  INSERT INTO supplement_source_references (id, citation)
  VALUES ('src_contrat_c4', 'Source de contrat, 2026.');

  -- ── 1. Cas POSITIF : une référence BIEN FORMÉE doit être ACCEPTÉE ────────
  BEGIN
    INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
      grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
    VALUES ('r_ok', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
            'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, 'WN-CL-2026-001', 'v1.0');
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION
        'RÈGLE/CLAIM: une référence de claim VALIDE a été refusée (SQLSTATE %) — un CHECK est trop serré, la route échouerait en production.',
        SQLSTATE;
  END;

  -- ── 2. Les cinq refus mordent, et chacun POUR SON MOTIF ──────────────────
  FOR i IN 1 .. array_length(cas, 1) LOOP
    refuse := false;
    BEGIN
      EXECUTE cas[i][3];
    EXCEPTION
      WHEN others THEN
        IF SQLSTATE <> cas[i][2] THEN
          RAISE EXCEPTION
            'RÈGLE/CLAIM test négatif: « % » rejeté pour le mauvais motif (SQLSTATE %, attendu %) — la garde visée a-t-elle disparu au profit d''une autre ?',
            cas[i][1], SQLSTATE, cas[i][2];
        END IF;
        refuse := true;
    END;
    IF NOT refuse THEN
      RAISE EXCEPTION 'RÈGLE/CLAIM test négatif: « % » a été ACCEPTÉ alors qu''il doit être rejeté', cas[i][1];
    END IF;
  END LOOP;

  -- ── 3. LE CONTRACT A EU LIEU : les deux colonnes sont NOT NULL ───────────
  -- L'expand avait ici le terme INVERSE — « les colonnes sont encore nullables »
  -- —, posé pour que l'oubli du resserrement ne puisse pas passer inaperçu. Le
  -- resserrement `20260907210000_regle_claim_obligatoire` l'a fait rougir, et ce
  -- terme-ci l'a remplacé : c'est la MÊME garde, retournée. Sans elle, un NOT
  -- NULL perdu à la faveur d'une migration future rendrait de nouveau
  -- représentable une règle clinique sans claim fondateur.
  SELECT array_agg(c.column_name::text ORDER BY c.column_name) INTO nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'clinical_rules'
    AND c.column_name IN ('claim_id', 'version_claim')
    AND c.is_nullable = 'YES';

  IF nullable IS NOT NULL THEN
    RAISE EXCEPTION
      'RÈGLE/CLAIM: colonne(s) de claim redevenue(s) NULLABLE(S) (%) — une règle clinique sans claim fondateur est de nouveau représentable.',
      nullable;
  END IF;

  -- ── 4. L'index de lecture par claim existe ───────────────────────────────
  -- « Quelles règles reposent sur ce claim ? » est la question que posera toute
  -- révision de corpus ; sans index elle balaierait la table.
  SELECT count(*) INTO nb
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public'
    AND tc.relname = 'clinical_rules'
    AND ic.relname = 'clinical_rules_claim_idx';
  IF nb <> 1 THEN
    RAISE EXCEPTION 'RÈGLE/CLAIM: index « clinical_rules_claim_idx » absent.';
  END IF;

  RAISE NOTICE 'RÈGLE/CLAIM: référence bien formée acceptée, % refus éprouvés (format ×2, colonne manquante ×3), colonnes NOT NULL (contract appliqué), index présent.',
    array_length(cas, 1);
END $$;

ROLLBACK;
