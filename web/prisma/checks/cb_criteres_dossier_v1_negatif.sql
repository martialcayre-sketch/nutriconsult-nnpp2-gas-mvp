-- Contrat des constats de critères sur un dossier ([[D-138]]).
--
-- La table promet sept choses, et ce fichier les éprouve toutes :
--   1. un constat valide est ACCEPTÉ (sans ce cas positif, un CHECK devenu
--      trop serré passerait vert et la route casserait en production) ;
--   2. un doublon (patient, critère) est REJETÉ en 23505 — l'unicité RÉELLE,
--      pas un index qui porte le bon nom ;
--   3. les CHECK sur le signataire et sur la note MORDENT (23514) ;
--   4. la table porte EXACTEMENT huit colonnes, liste blanche ;
--   5. `present` est NOT NULL — c'est le verrou `DC-24` : un NULL y serait un
--      troisième état MUET, indiscernable de « constaté absent », alors que
--      l'inconnu doit s'exprimer par l'ABSENCE de ligne ;
--   6. les deux clés étrangères existent et sont en ON DELETE RESTRICT ;
--   7. la RLS deny-all est active et sans policy.
--
-- La ligne dit « ce praticien a constaté ce critère sur ce dossier ». C'est
-- une donnée de santé nominative, et c'est tout ce qu'elle est : aucune
-- colonne ne porte de mesure, de score ni de valeur d'analyse — la liste
-- blanche de colonnes fait de toute colonne future un geste arbitré.
--
-- Tout se déroule dans une transaction annulée à la fin : les fixtures posées
-- ci-dessous ne survivent pas au fichier.
BEGIN;

DO $$
DECLARE
  refuse boolean;
  nb integer;
  colonnes text[];
  est_unique boolean;
  cible text;

  COLONNES_ATTENDUES CONSTANT text[] := ARRAY[
    'constate_le', 'constate_par', 'created_at', 'critere_id',
    'id', 'id_patient', 'note', 'present'
  ];

  -- Chaque entrée : une insertion qui DOIT échouer sur un CHECK. Elle vise des
  -- clés étrangères qui EXISTENT et un critère distinct de celui du cas
  -- positif : le CHECK est alors le SEUL motif de rejet possible. Si le CHECK
  -- visé disparaît, l'insertion est ACCEPTÉE et le cas le dit — au lieu d'être
  -- masquée par une violation de clé étrangère ou d'unicité.
  cas CONSTANT text[][] := ARRAY[
    ['signataire vide',
     $q$INSERT INTO criteres_dossier_constates (id, id_patient, critere_id, present, constate_par)
        VALUES ('t1', 'PAT_CONTRAT_CRIT', 'crit_contrat_b', true, '')$q$],
    ['signataire réduit à des espaces',
     $q$INSERT INTO criteres_dossier_constates (id, id_patient, critere_id, present, constate_par)
        VALUES ('t2', 'PAT_CONTRAT_CRIT', 'crit_contrat_b', true, '   ')$q$],
    ['note au-delà de 2000 caractères',
     $q$INSERT INTO criteres_dossier_constates (id, id_patient, critere_id, present, note, constate_par)
        VALUES ('t3', 'PAT_CONTRAT_CRIT', 'crit_contrat_b', true, repeat('x', 2001), 'praticien@wellneuro.fr')$q$]
  ];
BEGIN
  -- ── 0. Fixtures — patient fictif autorisé et deux critères de contrat ────
  INSERT INTO patients (id, id_patient, email, prenom, nom, praticien_email, updated_at)
  VALUES ('pat_contrat_crit', 'PAT_CONTRAT_CRIT', 'michel.dogne@example.test',
          'Michel', 'Dogné', 'praticien@wellneuro.fr', CURRENT_TIMESTAMP);

  INSERT INTO clinical_criteria (id, code, label_fr, updated_at)
  VALUES ('crit_contrat_a', 'critere_contrat_a', 'Critère de contrat A', CURRENT_TIMESTAMP),
         ('crit_contrat_b', 'critere_contrat_b', 'Critère de contrat B', CURRENT_TIMESTAMP);

  -- ── 1. Cas POSITIF : un constat valide doit être ACCEPTÉ ─────────────────
  BEGIN
    INSERT INTO criteres_dossier_constates (id, id_patient, critere_id, present, constate_par)
    VALUES ('ok1', 'PAT_CONTRAT_CRIT', 'crit_contrat_a', true, 'praticien@wellneuro.fr');
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION
        'CRITÈRES DOSSIER: un constat VALIDE a été refusé (SQLSTATE %) — une contrainte est trop serrée, la route échouerait en production.',
        SQLSTATE;
  END;

  -- ── 2. L'unicité MORD pour de vrai : même patient, même critère ──────────
  -- Le second constat porte le verdict INVERSE : c'est le cas qui compte. Deux
  -- lignes contradictoires laisseraient le moteur choisir selon l'ordre de
  -- lecture — donc conditionner une règle clinique à un tri.
  refuse := false;
  BEGIN
    INSERT INTO criteres_dossier_constates (id, id_patient, critere_id, present, constate_par)
    VALUES ('ok2', 'PAT_CONTRAT_CRIT', 'crit_contrat_a', false, 'praticien@wellneuro.fr');
  EXCEPTION
    WHEN unique_violation THEN
      refuse := true;
    WHEN others THEN
      RAISE EXCEPTION
        'CRITÈRES DOSSIER: doublon (patient, critère) rejeté pour le mauvais motif (SQLSTATE %, attendu 23505).',
        SQLSTATE;
  END;
  IF NOT refuse THEN
    RAISE EXCEPTION
      'CRITÈRES DOSSIER: DEUX constats acceptés pour le même (patient, critère), l''un présent l''autre absent — le verdict dépendrait de l''ordre de lecture.';
  END IF;

  -- ── 3. Les CHECK mordent ─────────────────────────────────────────────────
  FOR i IN 1 .. array_length(cas, 1) LOOP
    refuse := false;
    BEGIN
      EXECUTE cas[i][2];
    EXCEPTION
      WHEN check_violation THEN
        refuse := true;
      WHEN others THEN
        RAISE EXCEPTION
          'CRITÈRES DOSSIER test négatif: « % » rejeté pour le mauvais motif (SQLSTATE %, attendu 23514 check_violation) — le CHECK visé a-t-il disparu ?',
          cas[i][1], SQLSTATE;
    END;

    IF NOT refuse THEN
      RAISE EXCEPTION 'CRITÈRES DOSSIER test négatif: « % » a été ACCEPTÉ alors qu''il doit être rejeté', cas[i][1];
    END IF;
  END LOOP;

  -- ── 4. Liste blanche de colonnes, pas un motif ───────────────────────────
  -- La table consigne qu'un MOT du vocabulaire s'applique ou non. Une colonne
  -- neuve — `valeur`, `score`, `payload` jsonb — y ferait entrer du contenu
  -- clinique par la porte la moins coûteuse. La liste exacte fait de tout
  -- ajout un geste qui doit modifier ce contrat, quel que soit son nom.
  SELECT array_agg(c.column_name::text ORDER BY c.column_name) INTO colonnes
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'criteres_dossier_constates';

  IF colonnes IS DISTINCT FROM COLONNES_ATTENDUES THEN
    RAISE EXCEPTION
      'CRITÈRES DOSSIER: colonnes inattendues (%). Attendu exactement % — une colonne neuve doit être arbitrée.',
      colonnes, COLONNES_ATTENDUES;
  END IF;

  -- ── 5. `present` NOT NULL — le verrou DC-24 ──────────────────────────────
  -- Rendu nullable, un NULL serait un troisième état MUET : le moteur ne
  -- pourrait plus distinguer « le praticien a constaté que non » de « personne
  -- ne s'est prononcé », alors que les deux ne se disent pas de la même façon
  -- au praticien et qu'un seul est une dette. L'inconnu s'exprime par
  -- l'ABSENCE de ligne, jamais par un NULL.
  SELECT count(*) INTO nb
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'criteres_dossier_constates'
    AND c.column_name IN ('id_patient', 'critere_id', 'present', 'constate_par')
    AND c.is_nullable = 'NO';
  IF nb <> 4 THEN
    RAISE EXCEPTION
      'CRITÈRES DOSSIER: % colonne(s) porteuse(s) NOT NULL sur 4 attendues — `present` nullable rouvrirait un état muet (DC-24).',
      nb;
  END IF;

  -- ── 6. L'index unique est UNIQUE, et sur les BONNES colonnes ─────────────
  -- Compter un index par son NOM ne garde rien : recréé non unique, ou sur
  -- (critere_id) seul, il porterait le même nom et le contrat resterait vert.
  SELECT i.indisunique,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
    INTO est_unique, colonnes
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public'
    AND tc.relname = 'criteres_dossier_constates'
    AND ic.relname = 'cb_critere_dossier_unique';

  IF est_unique IS NULL THEN
    RAISE EXCEPTION 'CRITÈRES DOSSIER: index « cb_critere_dossier_unique » absent.';
  END IF;
  IF NOT est_unique THEN
    RAISE EXCEPTION 'CRITÈRES DOSSIER: « cb_critere_dossier_unique » existe mais N''EST PAS UNIQUE.';
  END IF;
  IF colonnes IS DISTINCT FROM ARRAY['id_patient', 'critere_id'] THEN
    RAISE EXCEPTION
      'CRITÈRES DOSSIER: « cb_critere_dossier_unique » porte % au lieu de {id_patient, critere_id} — l''unicité ou l''index de lecture du dossier est faux.',
      colonnes;
  END IF;

  -- ── 7. Les deux clés étrangères sont en ON DELETE RESTRICT ───────────────
  -- `confdeltype = 'r'`, invisible du drift check. Passée en CASCADE côté
  -- `patients`, la suppression nommée de `patient/effacement.ts` deviendrait
  -- du CODE MORT en silence. Passée en CASCADE côté `clinical_criteria`,
  -- supprimer un mot du vocabulaire effacerait des constats de dossier — et
  -- les règles qui en dépendent repasseraient « critère non constaté », donc
  -- refusées, sans que personne ait rien décidé.
  FOREACH cible IN ARRAY ARRAY['patients', 'clinical_criteria'] LOOP
    SELECT count(*) INTO nb
    FROM pg_constraint con
    JOIN pg_class enfant ON enfant.oid = con.conrelid
    JOIN pg_class ref ON ref.oid = con.confrelid
    WHERE con.contype = 'f'
      AND enfant.relname = 'criteres_dossier_constates'
      AND ref.relname = cible
      AND con.confdeltype = 'r';
    IF nb <> 1 THEN
      RAISE EXCEPTION
        'CRITÈRES DOSSIER: clé étrangère vers % absente ou hors ON DELETE RESTRICT (% trouvée[s])', cible, nb;
    END IF;
  END LOOP;

  -- ── 8. Deny-all RLS (posture D-005) ──────────────────────────────────────
  -- Prisma ne l'introspecte pas : une migration ultérieure pourrait la retirer
  -- sans qu'un seul test ne parle.
  SELECT count(*) INTO nb
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'criteres_dossier_constates'
    AND c.relrowsecurity;
  IF nb <> 1 THEN
    RAISE EXCEPTION 'CRITÈRES DOSSIER: RLS désactivée sur criteres_dossier_constates';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'criteres_dossier_constates'
  ) THEN
    RAISE EXCEPTION 'CRITÈRES DOSSIER: policy inattendue (deny-all attendu)';
  END IF;

  -- ── 9. La règle pointe le vocabulaire par une VRAIE clé étrangère ────────
  -- C'est la moitié « séparation » de la migration : jusqu'ici la référence au
  -- critère vivait dans un JSON, et rien n'empêchait une règle de pointer un
  -- critère supprimé.
  SELECT count(*) INTO nb
  FROM pg_constraint con
  JOIN pg_class enfant ON enfant.oid = con.conrelid
  JOIN pg_class ref ON ref.oid = con.confrelid
  WHERE con.contype = 'f'
    AND enfant.relname = 'clinical_rules'
    AND ref.relname = 'clinical_criteria'
    AND con.confdeltype = 'r';
  IF nb <> 1 THEN
    RAISE EXCEPTION
      'CRITÈRES DOSSIER: `clinical_rules.condition_critere_id` sans clé étrangère RESTRICT vers `clinical_criteria` (% trouvée[s]) — la référence pourrait pendre, comme du temps du JSON.',
      nb;
  END IF;

  RAISE NOTICE 'CRITÈRES DOSSIER: constat valide accepté, doublon contradictoire rejeté, % CHECK rejetants, 8 colonnes exactes, present NOT NULL, unicité réelle, 2 FK RESTRICT, RLS deny-all, FK règle→critère.',
    array_length(cas, 1);
END $$;

ROLLBACK;
