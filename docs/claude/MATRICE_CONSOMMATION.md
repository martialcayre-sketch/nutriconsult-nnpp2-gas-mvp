# Matrice de consommation du savoir

> **Fichier généré — ne pas éditer à la main.**
> `node scripts/wn-matrice-consommation.mjs --markdown` le régénère depuis le code.
> Les arbitrages, eux, s’écrivent dans `docs/claude/corpus/consommation_decisions.json`.

La colonne « surface » est **dérivée des imports**, pas rédigée : une source
sans appelant y apparaît avec une surface vide. C’est l’information
recherchée, pas une omission.

Un **drapeau référencé n’est pas un drapeau posé** : ce tableau ne lit aucune
valeur d’environnement, seulement les `process.env.WN_*` du code. Un double
verrou (drapeau **et** condition de donnée, colonne « verrou donnée ») laisse la
surface fermée même drapeau posé.

Un drapeau lu par une surface directe est listé **même s’il ne garde qu’un aspect
de cette surface** : `WN_SYNTHESE_STREAM` choisit le transport de la route de
synthèse (flux ou JSON), pas l’accès au corpus clinique qu’elle sert. Éteindre un
drapeau de cette colonne ne ferme donc pas nécessairement la source — la colonne
dit « ce qui est lu sur ce chemin », pas « ce qui suffit à le fermer ».

| Source de savoir | Surface qui la consomme | Décision produite | Drapeau(x) | Verrou donnée | Patient | Arbitrage |
|---|---|---|---|---|---|---|
| Boussole alimentaire (C5) — distribution signée des aliments | `web/src/app/api/praticien/boussole/route.ts` (route-api)<br>+ 10 indirecte(s) | Lecture PRAL/densité d’un aliment servie au patient et au praticien. | WN_C5_ENABLED | — | oui | — |
| Bibliothèque de biologie fonctionnelle (987 actes NABM V105) | 1 surface(s) indirecte(s) seulement | Régime de remboursement d’un acte de biologie proposé. | WN_CB_ENABLED, WN_CB_PROPOSITION, WN_CB_RESULTS_ENABLED | — | non | — |
| Catalogue des compléments alimentaires (C4) | `web/src/app/api/praticien/complements/route.ts` (route-api)<br>`web/src/app/api/praticien/regles/previsualisation/route.ts` (route-api) | Fiche complément : composition, cumuls, compatibilités. | WN_C4_ENABLED | — | non | — |
| Tableau de compatibilité et de cumul entre compléments | 21 surface(s) indirecte(s) seulement | Cumul signalé ou absence de cumul, affichés sur la fiche. | WN_C4_ENABLED | — | non | — |
| Table de contradictions NNPP2 (règles signées) | `web/src/app/api/praticien/synthese/route.ts` (route-api)<br>+ 2 indirecte(s) | Constat de contradiction entre instruments, affiché au cockpit praticien (table non signée : rien ne sort). | WN_ENABLE_CONTRADICTIONS_NNPP2, WN_SYNTHESE_STREAM | tableSignee, validationExterne | non | — |
| Corpus clinique de synthèse V1 | `web/src/app/api/praticien/synthese/route.ts` (route-api)<br>+ 19 indirecte(s) | Cadrage clinique injecté dans la synthèse rédigée par le modèle. | WN_ENABLE_CORPUS_CLINIQUE_V1, WN_SYNTHESE_STREAM | validationExterne | oui | — |
| Table d’indications biologiques (15 règles signées) | 5 surface(s) indirecte(s) seulement | Proposition de bilan hiérarchisée et sourcée, servie au cockpit praticien. | WN_CB_ENABLED, WN_CB_PROPOSITION, WN_CB_RESULTS_ENABLED | validationExterne | non | — |
| Table d’orientation NNPP2 (règles signées) | 6 surface(s) indirecte(s) seulement | Orientation clinique proposée au praticien à partir des scores. | WN_ENABLE_ORIENTATION_NNPP2 | tableSignee, validationExterne | non | — |
| Packs de consultation (registre + repli legacy) | `web/src/app/api/portail/valider/route.ts` (route-api)<br>`web/src/app/api/praticien/packs/assign/route.ts` (route-api)<br>`web/src/app/api/praticien/packs/route.ts` (route-api) | Quels questionnaires composent une consultation. | — | — | oui | — |
| Catalogue des questionnaires et scoring | `web/src/app/api/patient/submit/route.ts` (route-api)<br>`web/src/app/api/praticien/assignations/route.ts` (route-api)<br>`web/src/app/api/praticien/packs/assign/route.ts` (route-api)<br>`web/src/app/api/praticien/packs/route.ts` (route-api)<br>+ 36 indirecte(s) | Score et sous-scores d’un instrument passé par le patient. | WN_ALI_01_SIIN57 | — | oui | — |
| Rayon de corpus « biologie » → notebook 08 — Biologie fonctionnelle | **aucune — dormante** | Claims validés servis pour ce rayon. | — | — | non | dormante (2026-09-01) |
| Rayon de corpus « cognition » → notebook 05 — Cognition et mémoire | `web/src/app/api/praticien/corpus/rayons/route.ts` (route-api) | Claims validés servis pour ce rayon. | WN_RECHERCHE_CORPUS_ENABLED | — | non | — |
| Rayon de corpus « douleur » → notebook 06 — Douleurs chroniques | `web/src/app/api/praticien/corpus/rayons/route.ts` (route-api) | Claims validés servis pour ce rayon. | WN_RECHERCHE_CORPUS_ENABLED | — | non | — |
| Rayon de corpus « humeur » → notebook 04 — Humeur | **aucune — dormante** | Claims validés servis pour ce rayon. | — | — | non | dormante (2026-08-05) |
| Rayon de corpus « intestin » → notebook 07 — Axe intestin-cerveau | `web/src/app/api/praticien/corpus/rayons/route.ts` (route-api) | Claims validés servis pour ce rayon. | WN_RECHERCHE_CORPUS_ENABLED | — | non | — |
| Rayon de corpus « micronutrition » → notebook 10 — Micronutrition et compléments | `web/src/app/api/praticien/complements/corpus/route.ts` (route-api) | Claims validés servis pour ce rayon. | WN_C4_ENABLED | — | non | — |
| Rayon de corpus « nutrition » → notebook 09 — Nutrition et aliments vedettes | **aucune — dormante** | Claims validés servis pour ce rayon. | — | — | non | dormante (2026-08-05) |
| Rayon de corpus « sommeil » → notebook 02 — Sommeil et chronobiologie | **aucune — dormante** | Claims validés servis pour ce rayon. | — | — | non | dormante (2026-08-05) |
| Rayon de corpus « stress » → notebook 03 — Stress et burnout | **aucune — dormante** | Claims validés servis pour ce rayon. | — | — | non | dormante (2026-08-05) |
| Registre sanitaire des sources — vue par notebook | `web/src/app/api/praticien/corpus/claims/route.ts` (route-api)<br>`web/src/app/api/praticien/corpus/claims/sources/route.ts` (route-api)<br>+ 2 indirecte(s) | Quelles sources bibliographiques adossent un rayon de corpus. | — | — | non | — |
| Résolution des intentions et compositions (lecture des compléments) | `web/src/app/api/praticien/regles/previsualisation/route.ts` (route-api)<br>+ 20 indirecte(s) | Quels ingrédients une fiche contient réellement, et à quelle dose. | WN_C4_ENABLED | — | non | — |

21 source(s) recensée(s), dont **5 dormante(s)**.

