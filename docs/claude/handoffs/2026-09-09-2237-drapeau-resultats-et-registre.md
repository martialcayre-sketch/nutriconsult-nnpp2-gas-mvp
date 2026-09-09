# Handoff — 2026-09-09 — Le drapeau des résultats biologiques, et le registre qui ne le savait pas (D-159)

## État Git

- Branche du lot : `cb/drapeau-resultats-pose` — **squashée et supprimée**
  (PR #968, merge `32ed7a87`). Cette clôture est donc écrite depuis `main`, en PR
  de doc séparée : la fenêtre de clôture était fermée.
- `main` déployé en production : `32ed7a87`, `success` en 6m53s, conteneurs
  recréés à 07:35:03 UTC.
- Phase `wn-cycle` au moment d'écrire : `hors-lot`.

## Objectif du lot

Terminer le rayon biologie. Il s'est avéré **déjà clos côté code** — quatre
campagnes, vingt-quatre lots — et ce qui restait n'était pas du TypeScript. Le
responsable a demandé la pose du drapeau qui ouvre l'étage 2.

## Décisions prises

- **`D-159`** — une condition d'ouverture qui ne vit que dans le dossier RGPD est
  une condition qu'on manque. Elle se pose désormais **sur la ligne de ce qu'elle
  conditionne**.
- Arbitrage du responsable, rendu sur constat d'écart : **laisser le drapeau posé
  et combler tout de suite**, plutôt que refermer. L'autre branche (retour au
  fail-closed) a été présentée.
- `requiresAcknowledgement: false` pour la v6 — tranché **par précédent** (v3, v4,
  v5), pas par droit.

## Ce qui a été fait en production

| Geste | Preuve |
|---|---|
| `env-set WN_CB_RESULTS_ENABLED=true` | `scalingo env` |
| `restart` — **obligatoire**, Scalingo n'applique rien aux conteneurs en cours | `ps`, conteneurs recréés |
| Effectivité | sonde non authentifiée : `401` et non `503 cb_resultats_desactives` |
| Exposition réelle | `resultats_biologiques = 0` (`one-off-8343`) |

**La sonde vaut d'être retenue** : `garderResultats` teste le drapeau **avant** la
session, donc `401` vs `503` distingue les deux états sans authentification et
sans toucher une donnée.

## Fichiers modifiés

- `docs/DECISIONS.md` — `D-159`
- `docs/DOSSIER_RGPD.md` — rubrique 2 (écart daté), rubrique 5 (4 tables), rubrique 14 (2 lignes)
- `docs/FEATURE_FLAGS.md` — la condition RGPD sur la ligne du drapeau
- `docs/ROADMAP_PRODUIT.md` — l'étage 2 n'est plus « éteint »
- `web/src/lib/trust/contenus/registre.ts` — `donnees_confidentialite@v6`
- `web/src/lib/trust/contenus/registre.test.ts` — 11 documents, cas v6, départage réécrit
- `web/src/lib/trust/contenus/rubrique5.modeles.test.ts` — **neuf**
- `changelog.d/2026-09-09-drapeau-resultats-pose-et-registre.md`

## Validations exécutées

- T1 `npm run check` — vert (389 cas)
- Bancs `src/lib/trust/` — vert (35 cas, 4 neufs)
- **Mutation dans les deux sens** : retrait de `ResultatBiologique` de la rubrique 5
  → 2 cas rouges, les bons noms, les 2 autres verts ; fantôme ajouté à la dette
  → le cas de péremption rougit seul. Retour au vert.
- T2 `--fast` — **rouge**, signature `D-049` seule (`portail-google-…-redemande-d'un-lien-LOT-04`,
  iPhone 13, navigation expirée sans requête de page). **Non relancé** (`D-155`).
- CI PR #968 — `wn-attendre-ci` exit `0`, `mergeable=MERGEABLE`, `mergeState=CLEAN`.

## Problèmes ouverts

1. **17 tables filles de `patients` non déclarées en rubrique 5** — 38 modèles liés
   à `Patient`, 21 cités. Sans rapport avec la biologie. Qualification article 9 =
   acte juridique, **pas une écriture de code**. Portées au récapitulatif des trous,
   porteur « responsable + conseil ». Nommées dans `rubrique5.modeles.test.ts`.
2. **`requiresAcknowledgement` de la v6** — seul arbitrage du lot qu'un conseil
   pourrait vouloir revoir.
3. `DOSSIER_RGPD` §3 — base légale, « TROU intégral », antérieur et inchangé.
4. Rayon biologie, matière : 2 plages fonctionnelles pour 47 analytes, 0 plage de
   référence, 0 ratio. Ces bornes ne s'inventent pas (`DC-19`/`DC-20`).

## Les deux promotions de clôture

**Décision structurante → registre : faite.** `D-159` y est (RGPD, hébergement,
frontière produit). Rien de plus à promouvoir.

**Règle oubliée → exécutable : à moitié faite, et voici la moitié qui manque.**
La règle manquée était « déclarer la catégorie avant d'ouvrir la surface qui
l'alimente ». Son versant *catégorie* est désormais exécutable
(`rubrique5.modeles.test.ts`). Son versant *drapeau* ne l'est pas : rien
n'oblige à ouvrir `DOSSIER_RGPD.md` avant de poser un drapeau, et
`FEATURE_FLAGS.md` ne porte la condition que **parce que je viens de l'y
écrire** — c'est un paragraphe, pas un mécanisme.

**Mécanisme visé, non écrit, proposé** : un banc qui vérifie que tout drapeau
`WN_*` **nommé dans `DOSSIER_RGPD.md`** apparaît aussi dans `FEATURE_FLAGS.md`
avec un renvoi vers la rubrique qui le conditionne. Il aurait rougi ici :
`WN_CB_RESULTS_ENABLED` était cité en rubrique 2 avec sa condition, et la ligne
de `FEATURE_FLAGS.md` ne pointait nulle part. C'est une **proposition** — elle
ne s'écrit pas sans accord.

## Prochaine action exacte

Aucune sur ce lot : il est mergé, déployé, constaté. Les quatre points ci-dessus
sont des arbitrages du responsable, pas des tâches.

## Interdits encore actifs

- **Ne pas relancer un rouge WebKit** (`D-155`) — il se rapporte, spec et projet
  nommés.
- **Ne pas inventer une borne, une plage ou un seuil** (`DC-19`/`DC-20`) — le
  corpus biologie est vide sur les bornes, et il le reste tant qu'un claim sourcé
  ne le remplit pas.
- **Ne pas déclarer une table en article 9 de sa propre autorité** — c'est ce que
  ce lot a explicitement refusé de faire pour les 17.
- `env-unset` sur ce drapeau a été **refusé par le classificateur** après que
  `env-set` a été autorisé : dans une session comme celle-ci, la pose est
  réversible par l'utilisateur, pas par l'agent.
