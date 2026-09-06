-- Contrat de la sélection praticien d'une priorité (`D-127`).
--
-- La table promet sept choses, et ce fichier les éprouve TOUTES :
--   1. une sélection valide est ACCEPTÉE, et une SECONDE sélection CHAÎNÉE sur
--      elle aussi — corriger son choix crée une ligne, jamais un `UPDATE` ;
--   2. DEUX RACINES sur la même carte sont REFUSÉES (unicité partielle) : deux
--      clics simultanés n'ouvrent pas deux fils concurrents ;
--   3. DEUX SUCCESSEURS de la même ligne sont REFUSÉS. C'est le resserrement
--      assumé par rapport aux autres chaînes `supersedes_*` du dépôt, qui
--      tolèrent la fourche et la tranchent à la lecture : ici deux sélections
--      concurrentes de la même carte seraient deux praticiens croyant chacun
--      avoir décidé, et la base refuse plutôt que d'élire. C'est aussi LE cas
--      qui distingue l'index livré d'un index faux plausible — une unicité
--      posée sur `(id_patient, decision_card_id, supersedes_selection_id)`
--      passerait 1 et 2 sans broncher et échouerait ici seulement ;
--   4. les CHECK mordent (23514) : motif vide, réduit à des blancs
--      (tabulations comprises) ou au-delà de 2000 ; candidat vide ; auteur
--      vide ou au-delà de 320 ; empreinte de carte qui n'est pas un SHA-256
--      canonique ; ligne qui se supplante elle-même ;
--   5. la table porte EXACTEMENT dix colonnes, liste blanche — un
--      `commentaire` ou un `verdict` arrivé sans arbitrage se verrait ici ;
--   6. la clé étrangère vers `patients` est en ON DELETE RESTRICT : la
--      suppression nommée reste celle de `patient/effacement.ts`, jamais une
--      cascade silencieuse ;
--   7. la RLS deny-all est active et sans policy (posture D-005) — la ligne
--      dit « pour ce patient, le praticien a retenu cette priorité, et voici
--      pourquoi », donnée de santé nominative.
--
-- Tout se déroule dans une transaction annulée à la fin : les fixtures posées
-- ci-dessous ne survivent pas au fichier.
BEGIN;

DO $$
DECLARE
  accepte boolean;
  nb integer;
  i integer;
  colonnes text[];

  -- 64 caractères hexadécimaux minuscules : la forme que rend
  -- `canonicalSha256`, et la seule que le CHECK d'empreinte admet.
  EMPREINTE CONSTANT text := repeat('ab', 32);

  COLONNES_ATTENDUES CONSTANT text[] := ARRAY[
    'candidate_id', 'created_at', 'decision_card_id',
    'decision_card_input_hash', 'id', 'id_patient', 'rationale',
    'selected_at', 'selected_by_email', 'supersedes_selection_id'
  ];

  -- Chaque entrée : une insertion qui DOIT échouer sur un CHECK. Toutes visent
  -- le patient de fixture : le CHECK est alors le SEUL motif de rejet
  -- possible. Si le CHECK visé disparaît, l'insertion est ACCEPTÉE et le cas
  -- le dit — au lieu d'être masqué par une violation de clé étrangère.
  cas CONSTANT text[][] := ARRAY[
    ['motif vide — une priorité choisie sans motif écrit ne se relit pas',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t1', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 32), 'priority:REGLE_CONTRAT', '', 'praticien@wellneuro.fr')$q$],
    ['motif réduit à des blancs, tabulations comprises',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t2', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 32), 'priority:REGLE_CONTRAT', E' \t\r\n', 'praticien@wellneuro.fr')$q$],
    ['motif au-delà de 2000 caractères',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t3', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 32), 'priority:REGLE_CONTRAT', repeat('x', 2001), 'praticien@wellneuro.fr')$q$],
    ['candidat vide',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t4', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 32), '   ', 'Motif de contrat.', 'praticien@wellneuro.fr')$q$],
    ['auteur vide — une sélection sans auteur lisible n''est pas attribuable',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t5', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 32), 'priority:REGLE_CONTRAT', 'Motif de contrat.', '')$q$],
    ['auteur au-delà de 320 caractères',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t6', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 32), 'priority:REGLE_CONTRAT', 'Motif de contrat.', repeat('x', 321))$q$],
    ['empreinte de carte trop courte',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t7', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 31), 'priority:REGLE_CONTRAT', 'Motif de contrat.', 'praticien@wellneuro.fr')$q$],
    ['empreinte de carte en majuscules — `canonicalSha256` rend du minuscule',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t8', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('AB', 32), 'priority:REGLE_CONTRAT', 'Motif de contrat.', 'praticien@wellneuro.fr')$q$],
    ['empreinte de carte hors hexadécimal',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
        VALUES ('t9', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('zz', 32), 'priority:REGLE_CONTRAT', 'Motif de contrat.', 'praticien@wellneuro.fr')$q$],
    -- Patron D-124 : une ligne qui se supplante elle-même ne serait JAMAIS
    -- tête de fil — la sélection disparaîtrait sans que rien ne le signale.
    ['une ligne qui se supplante elle-même',
     $q$INSERT INTO decision_priority_selections (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email, supersedes_selection_id)
        VALUES ('t10', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', repeat('ab', 32), 'priority:REGLE_CONTRAT', 'Motif de contrat.', 'praticien@wellneuro.fr', 't10')$q$]
  ];
BEGIN
  -- ── 0. Fixture — patient fictif autorisé ─────────────────────────────────
  INSERT INTO patients (id, id_patient, email, prenom, nom, praticien_email, updated_at)
  VALUES ('pat_contrat_selprio', 'PAT_CONTRAT_SELPRIO', 'michel.dogne@example.test',
          'Michel', 'Dogné', 'praticien@wellneuro.fr', CURRENT_TIMESTAMP);

  -- ── 1. Cas POSITIFS : la racine, puis la correction chaînée ──────────────
  BEGIN
    INSERT INTO decision_priority_selections
      (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
    VALUES ('racine', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', EMPREINTE,
            'priority:REGLE_CONTRAT', 'Plainte dominante digestive, patient demandeur.',
            'praticien@wellneuro.fr');
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION
        'D-127: une sélection VALIDE a été refusée (SQLSTATE %) — une contrainte est trop serrée, la route échouerait en production.',
        SQLSTATE;
  END;

  -- Changer d'avis est un ACTE, pas une rature : la seconde sélection porte la
  -- même carte et chaîne sur la première.
  BEGIN
    INSERT INTO decision_priority_selections
      (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email, supersedes_selection_id)
    VALUES ('corr1', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', EMPREINTE,
            'priority:REGLE_CONTRAT_BIS', 'Le sommeil prime après relecture du J7.',
            'praticien@wellneuro.fr', 'racine');
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION
        'D-127: la CORRECTION chaînée d''une sélection a été refusée (SQLSTATE %) — l''unicité est-elle devenue TOTALE ? Le praticien ne pourrait plus changer d''avis.',
        SQLSTATE;
  END;

  -- ── 2. DEUX RACINES sur la même carte : refusées ─────────────────────────
  accepte := false;
  BEGIN
    INSERT INTO decision_priority_selections
      (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
    VALUES ('racine2', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', EMPREINTE,
            'priority:REGLE_CONTRAT_TER', 'Second fil concurrent.',
            'praticien@wellneuro.fr');
    accepte := true;
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN others THEN
      RAISE EXCEPTION
        'D-127: la seconde RACINE a été rejetée pour le mauvais motif (SQLSTATE %, attendu 23505 unique_violation)',
        SQLSTATE;
  END;
  IF accepte THEN
    RAISE EXCEPTION
      'D-127: une SECONDE RACINE a été ACCEPTÉE sur la même carte — deux fils concurrents, donc deux praticiens croyant chacun avoir décidé.';
  END IF;

  -- Une racine sur une AUTRE carte reste légitime : la garde est par carte.
  BEGIN
    INSERT INTO decision_priority_selections
      (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email)
    VALUES ('racine_autre', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT_J21', EMPREINTE,
            'priority:REGLE_CONTRAT', 'Nouveau jalon, nouvelle carte.',
            'praticien@wellneuro.fr');
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION
        'D-127: une racine sur une AUTRE carte a été refusée (SQLSTATE %) — la garde de racine déborde son périmètre.',
        SQLSTATE;
  END;

  -- ── 3. DEUX SUCCESSEURS de la même ligne : refusés ───────────────────────
  -- LE cas qui distingue l'index livré d'un index faux plausible : une unicité
  -- posée sur (patient, carte, supersedes) passerait les cas 1 et 2 puis
  -- échouerait ici seulement.
  accepte := false;
  BEGIN
    INSERT INTO decision_priority_selections
      (id, id_patient, decision_card_id, decision_card_input_hash, candidate_id, rationale, selected_by_email, supersedes_selection_id)
    VALUES ('corr1bis', 'PAT_CONTRAT_SELPRIO', 'CARTE_CONTRAT', EMPREINTE,
            'priority:REGLE_CONTRAT_TER', 'Fourche.',
            'praticien@wellneuro.fr', 'racine');
    accepte := true;
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN others THEN
      RAISE EXCEPTION
        'D-127: la FOURCHE a été rejetée pour le mauvais motif (SQLSTATE %, attendu 23505 unique_violation)',
        SQLSTATE;
  END;
  IF accepte THEN
    RAISE EXCEPTION
      'D-127: une FOURCHE a été ACCEPTÉE — le fil d''une carte doit rester strictement linéaire, la lecture n''a aucune règle de départage à appliquer.';
  END IF;

  -- ── 4. Les CHECK mordent ─────────────────────────────────────────────────
  FOR i IN 1 .. array_length(cas, 1) LOOP
    accepte := false;
    BEGIN
      EXECUTE cas[i][2];
      accepte := true;
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN others THEN
        RAISE EXCEPTION
          'D-127: « % » rejeté pour le mauvais motif (SQLSTATE %, attendu 23514 check_violation) — le CHECK visé a-t-il disparu ?',
          cas[i][1], SQLSTATE;
    END;
    IF accepte THEN
      RAISE EXCEPTION 'D-127: « % » a été ACCEPTÉ alors qu''il doit être rejeté', cas[i][1];
    END IF;
  END LOOP;

  -- ── 5. Dix colonnes exactes, liste blanche ───────────────────────────────
  -- `column_name` est un `sql_identifier`, pas un `text` : sans la conversion,
  -- la comparaison avec `COLONNES_ATTENDUES` ne porte pas sur le même type.
  SELECT array_agg(c.column_name::text ORDER BY c.column_name) INTO colonnes
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'decision_priority_selections';
  IF colonnes IS DISTINCT FROM COLONNES_ATTENDUES THEN
    RAISE EXCEPTION
      'D-127: colonnes inattendues sur decision_priority_selections — attendu %, trouvé %',
      COLONNES_ATTENDUES, colonnes;
  END IF;

  -- Les colonnes porteuses sont NOT NULL : une sélection sans patient, sans
  -- carte, sans empreinte, sans candidat, sans motif ou sans auteur n'est pas
  -- un acte relisible.
  SELECT count(*) INTO nb
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'decision_priority_selections'
    AND is_nullable = 'NO'
    AND column_name IN ('id_patient', 'decision_card_id', 'decision_card_input_hash',
                        'candidate_id', 'rationale', 'selected_by_email');
  IF nb <> 6 THEN
    RAISE EXCEPTION 'D-127: % colonne(s) porteuse(s) NOT NULL au lieu de 6', nb;
  END IF;

  -- ── 6. La clé étrangère vers `patients` est en ON DELETE RESTRICT ────────
  SELECT count(*) INTO nb
  FROM pg_constraint con
  JOIN pg_class enfant ON enfant.oid = con.conrelid
  JOIN pg_class ref ON ref.oid = con.confrelid
  WHERE con.contype = 'f'
    AND enfant.relname = 'decision_priority_selections'
    AND ref.relname = 'patients'
    AND con.confdeltype = 'r';
  IF nb <> 1 THEN
    RAISE EXCEPTION
      'D-127: clé étrangère vers patients absente ou hors ON DELETE RESTRICT (% trouvée[s]) — l''effacement IDP2 deviendrait une cascade silencieuse', nb;
  END IF;

  -- ── 7. Deny-all RLS (posture D-005) ──────────────────────────────────────
  SELECT count(*) INTO nb
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'decision_priority_selections'
    AND c.relrowsecurity;
  IF nb <> 1 THEN
    RAISE EXCEPTION 'D-127: RLS désactivée sur decision_priority_selections';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_priority_selections'
  ) THEN
    RAISE EXCEPTION 'D-127: policy inattendue (deny-all attendu)';
  END IF;

  -- ── 8. La FORME des deux gardes, pas seulement leur comportement ─────────
  -- Les cas 2 et 3 disent ce que la base FAIT ; ceci dit ce qu'elle EST. Un
  -- `@@unique` redéclaré au schéma rendrait la garde de racine TOTALE sans que
  -- la dérive schéma ↔ migrations rougisse, puisque l'état serait cohérent —
  -- et plus aucune correction ne passerait.
  SELECT count(*) INTO nb
  FROM pg_index i
  JOIN pg_class ix ON ix.oid = i.indexrelid
  WHERE ix.relname = 'c1_selection_priorite_racine_unique'
    AND i.indrelid = 'public.decision_priority_selections'::regclass
    AND i.indisvalid AND i.indisunique AND i.indpred IS NOT NULL;
  IF nb <> 1 THEN
    RAISE EXCEPTION
      'D-127: `c1_selection_priorite_racine_unique` n''est plus un index UNIQUE À PRÉDICAT — soit l''unicité est devenue totale (plus aucune correction possible), soit le nom de la garde a été donné à autre chose.';
  END IF;

  SELECT count(*) INTO nb
  FROM pg_index i
  JOIN pg_class ix ON ix.oid = i.indexrelid
  WHERE ix.relname = 'c1_selection_priorite_supersedes_unique'
    AND i.indrelid = 'public.decision_priority_selections'::regclass
    AND i.indisvalid AND i.indisunique AND i.indpred IS NULL;
  IF nb <> 1 THEN
    RAISE EXCEPTION
      'D-127: `c1_selection_priorite_supersedes_unique` est absent, invalide ou devenu partiel — la fourche redeviendrait représentable.';
  END IF;

  RAISE NOTICE 'SELECTION PRIORITE: racine acceptée, correction chaînée acceptée, racine d''une autre carte acceptée, seconde racine refusée, fourche refusée, % cas rejetants dont un CHECK de non-réflexivité, 10 colonnes exactes, 6 NOT NULL, 1 FK RESTRICT, deux gardes sous leur forme attendue, RLS deny-all.',
    array_length(cas, 1);
END $$;

ROLLBACK;
