-- Contrat du claim fondateur d'une règle clinique ([[D-140]]).
--
-- Ce fichier éprouve ce que la BASE garde toute seule, et rien d'autre :
--   1. une règle citant un claim BIEN FORMÉ est acceptée (cas positif — sans
--      lui, un CHECK devenu trop serré passerait vert et la route casserait) ;
--   2. un `claim_id` hors format est REJETÉ (23514) ;
--   3. une `version_claim` hors format est REJETÉE (23514) ;
--   4. une référence DÉPAREILLÉE — l'un des deux seul — est REJETÉE : le couple
--      (claim_id, version_claim) est ce qui est UNIQUE dans `rag_corpus_claims`,
--      un membre seul ne désigne rien ;
--   5. les deux colonnes existent et sont encore NULLABLES — c'est l'expand
--      d'un expand/contract, et le contract est nommé ici.
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

  -- Chaque entrée : une insertion qui DOIT échouer sur un CHECK. Toutes visent
  -- des clés étrangères qui EXISTENT (fixtures ci-dessous), pour que le CHECK
  -- soit le SEUL motif de rejet possible.
  cas CONSTANT text[][] := ARRAY[
    ['claim_id hors format',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad1', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, 'CL-2026-001', 'v1.0')$q$],
    ['version_claim hors format',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad2', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, 'WN-CL-2026-001', 'premiere')$q$],
    ['claim sans version — la référence ne désigne rien d''unique',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad3', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, 'WN-CL-2026-001', NULL)$q$],
    ['version sans claim — l''inverse, et tout aussi vide',
     $q$INSERT INTO clinical_rules (id, intent_tag_id, type_regle, poids, justification, ingredient_id,
        grade_preuve_scientifique, source_reference_id, updated_at, claim_id, version_claim)
        VALUES ('r_bad4', 'tag_contrat_c4', 'recommande', 1, 'Justification.', 'ing_contrat_c4',
                'modere', 'src_contrat_c4', CURRENT_TIMESTAMP, NULL, 'v1.0')$q$]
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

  -- ── 2. Les quatre CHECK mordent ──────────────────────────────────────────
  FOR i IN 1 .. array_length(cas, 1) LOOP
    refuse := false;
    BEGIN
      EXECUTE cas[i][2];
    EXCEPTION
      WHEN check_violation THEN
        refuse := true;
      WHEN others THEN
        RAISE EXCEPTION
          'RÈGLE/CLAIM test négatif: « % » rejeté pour le mauvais motif (SQLSTATE %, attendu 23514 check_violation) — le CHECK visé a-t-il disparu ?',
          cas[i][1], SQLSTATE;
    END;
    IF NOT refuse THEN
      RAISE EXCEPTION 'RÈGLE/CLAIM test négatif: « % » a été ACCEPTÉ alors qu''il doit être rejeté', cas[i][1];
    END IF;
  END LOOP;

  -- ── 3. L'ÉTAPE EST BIEN L'EXPAND : les colonnes sont encore NULLABLES ────
  -- Le jour où ce cas rougira, c'est que la migration de resserrement
  -- (`20260907210000_regle_claim_obligatoire`) a eu lieu — et il faudra alors
  -- retirer ce terme, pas le contourner. Sans lui, l'oubli du contract passerait
  -- inaperçu : une règle sans claim resterait possible en base, exactement ce
  -- que l'invariant interdit.
  SELECT array_agg(c.column_name::text ORDER BY c.column_name) INTO nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'clinical_rules'
    AND c.column_name IN ('claim_id', 'version_claim')
    AND c.is_nullable = 'YES';

  IF nullable IS DISTINCT FROM ARRAY['claim_id', 'version_claim'] THEN
    RAISE EXCEPTION
      'RÈGLE/CLAIM: les colonnes de claim ne sont plus toutes deux nullables (%). Si le resserrement a eu lieu, ce terme du contrat doit être RETIRÉ — pas contourné.',
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

  RAISE NOTICE 'RÈGLE/CLAIM: référence bien formée acceptée, % CHECK rejetants (format ×2, paire ×2), colonnes encore nullables (expand), index présent.',
    array_length(cas, 1);
END $$;

ROLLBACK;
