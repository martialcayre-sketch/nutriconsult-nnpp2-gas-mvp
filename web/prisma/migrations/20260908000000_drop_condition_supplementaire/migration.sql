-- D-145 — Retrait de `clinical_rules.condition_supplementaire`.
--
-- Troisième et dernier temps de la séparation ouverte par D-138 :
--   1. D-138 : les deux natures sont séparées en colonnes propres ;
--   2. D-142 : plus personne n'ÉCRIT l'ancien champ (les routes écrivaient
--      encore le JSON hérité que le moteur ne lisait plus — une règle
--      conditionnée à un critère était donc INCONDITIONNELLE pour le moteur) ;
--   3. ici    : plus personne ne le LIT, et la colonne part.
--
-- Ordre imposé par D-087 (expand/contract) : le code qui cesse de lire est
-- déployé AVANT que cette migration soit approuvée. Un déploiement où la
-- colonne existe encore et où plus rien ne la lit est parfaitement valide —
-- c'est même l'état attendu pendant la fenêtre d'approbation.

-- ── Garde ────────────────────────────────────────────────────────────────────
-- Lecture de production du 2026-09-08 (conteneur one-off-209) : `clinical_rules`
-- compte 0 ligne, dont 0 portant une condition héritée. Cette garde n'est donc
-- pas censée mordre — et c'est précisément pourquoi elle est écrite. Une
-- suppression de colonne qui repose sur ce qu'on a lu la veille repose sur une
-- lecture ; celle-ci repose sur l'état au moment où elle s'applique.
--
-- Ce qui serait détruit sans elle n'est pas rattrapable : le JSON hérité est la
-- SEULE trace de la condition clinique d'une telle règle. La perdre, ce serait
-- transformer une règle conditionnée en règle inconditionnelle — exactement le
-- défaut que D-142 vient de fermer, mais dans l'autre sens et sans retour.
DO $$
DECLARE heritees integer;
BEGIN
  SELECT count(*) INTO heritees
  FROM public.clinical_rules
  WHERE "condition_supplementaire" IS NOT NULL;

  IF heritees > 0 THEN
    RAISE EXCEPTION
      'SUPPRESSION REFUSÉE : % règle(s) clinique(s) portent encore une condition au format hérité (condition_supplementaire). Ce JSON est la seule trace de leur condition clinique ; la colonne ne peut pas être supprimée sans la perdre, et aucune condition ne peut être devinée à leur place (DC-19, DC-20, DC-24). Migrer ces lignes vers condition_critere_id / condition_biologie AVANT de rejouer cette migration.',
      heritees;
  END IF;
END $$;

-- ── Suppression ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."clinical_rules" DROP COLUMN "condition_supplementaire";
