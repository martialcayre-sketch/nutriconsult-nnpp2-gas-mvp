# Feature flags — référence

Inventaire des drapeaux d'environnement qui **gâtent** des fonctionnalités, et
comment les ouvrir. Source de vérité : les modules `web/src/lib/*/featureFlag.ts`
et les lectures `process.env.*` dans les routes.

**Principe.** Les gâtes vivent dans le code pour que la **prod** reste
conservatrice pendant que le **dev** tourne à plein. On ne les retire **pas** du
code : on les **allume par environnement** (`web/.env.local` en local, variables
Scalingo/Vercel en déployé). Tous sont **fail-closed** : absents, ils laissent
fermé.

> ⚠️ **La convention d'activation n'est pas uniforme** — lire la colonne
> « Valeur ON ». La plupart exigent la chaîne exacte `'true'` ; deux exigent
> `'1'` **et** une validation en code.

## A. Flags produit — `'true'`, défaut OFF

Ouvrables par l'environnement seul. **ON en dev/staging** ; en prod, activation
datée **par feature**.

| Flag | Valeur ON | Ouvre | Si absent |
|---|---|---|---|
| `WN_C4_ENABLED` | `true` | rayon compléments | fermé |
| `WN_C5_ENABLED` | `true` | alimentation / CIQUAL | fermé |
| `WN_CB_ENABLED` | `true` | rayon biologie — **étage documentaire** | fermé |
| `WN_CB_PROPOSITION` | `true` | **proposition de bilan** servie au cockpit praticien (`GET/POST /api/praticien/biologie/proposition`) | fermé — exige AUSSI `WN_CB_ENABLED`. **POSÉE en Production le 2026-08-18** ([[D-072]]) |
| `WN_RECHERCHE_CORPUS_ENABLED` | `true` | recherche corpus clinique (rayons cognition, douleur, intestin — `dashboard/bibliotheque`) | fermé — **POSÉE en Production (Scalingo) le 2026-08-22** ([[D-081]]) |
| `WN_EI_INTERRUPTION` | `1` | **association d'un effet indésirable à un protocole** (`DC-42`, [[D-101]]) — capture au portail, puis interruption de la préparation automatique quand la règle `SAF-EI-01` est signée | fermé — **NEUF ET ÉTEINT à la livraison**. Ne se pose qu'APRÈS que la migration `20260823210000_association_effet_indesirable_intervention` est appliquée **et constatée** ([[D-087]]) : le code lit trois colonnes que la base n'a pas encore. Deux gestes dans cet ordre — le drapeau ouvre la CAPTURE, la signature ouvre l'INTERRUPTION |
| `WN_AGENDA_RELANCE` | `true` | relance praticien de l'agenda du sommeil (**envoi e-mail au clic**, jamais de cron) | fermé |
| `WN_SYNTHESE_STREAM` | `true` | synthèse IA en SSE (routeur 30 s Scalingo) | réponse JSON |
| `WN_CLAIMS_QUESTIONNAIRE_STREAM` | `true` | claims questionnaire en SSE | réponse JSON |
| `RAG_PGVECTOR_ENABLED` | `true` | RAG de production — exige aussi `RAG_INTERNAL_SECRET` + clés OpenAI | throw / fermé |
| `WN_ENABLE_VALIDITE_PASSATIONS` | `1` | filtre de validité des passations (LOT-00 chaîne T0) : `INVALID`/`SUPERSEDED`/`HISTORICAL_ONLY` sortent du raisonnement, et la route d'invalidation praticien répond (sinon **503**) | filtre **inerte** — la colonne `statut_validite` existe et vaut `VALID` par défaut de migration sur **toutes** les lignes ; ce `VALID` n'est donc pas un jugement clinique ([[D-052]]) — état **antérieur** au 2026-08-19. **POSÉ (`1`) en Production le 2026-08-19** ([[D-077]], arbitrage praticien en session, redéploiement porteur) : la route d'invalidation s'ouvre, aucun calcul ne change (111 passations, toutes `VALID`). ⚠️ [[D-050]] et [[D-052]] disent encore « éteint » : elles décrivent la vérification du 2026-08-12 et n'ont pas été révisées. **RELU SUR SCALINGO LE 2026-09-07** (`env-get`) : la variable y est bien posée. |

## B. Chemins d'accès patient — `'true'`, défaut OFF

ON en dev (données **fictives**). En prod, chaque activation est une décision
datée, avec ses dépendances.

> ⚠️ **Ces quatre drapeaux commandent toute la voie patient** — sans eux, aucun
> patient n'entre. Leur état de production se lit **ici**, daté, comme au § A :
> une activation non consignée dans ce tableau rend illisible tout classement de
> constat portant sur le portail (un défaut derrière un drapeau éteint et un
> défaut servi à des patients ne se traitent pas au même rang). Les dates
> ci-dessous datent d'AVANT la migration Scalingo — mais les quatre valeurs ont
> été **relues sur Scalingo le 2026-09-07** (`env-get`) : les quatre portes sont
> ouvertes en production. Toute extinction ou activation ultérieure se consigne
> ici, datée, comme au § A.

| Flag | Valeur ON | Ouvre | Dépendance / note |
|---|---|---|---|
| `WN_G4_LIEN_MAGIQUE` | `true` | entrée portail par lien magique | **POSÉ en Production le 2026-07-21** (`campagnes/2026-07-19-idp-identite-patient-durable/ACTIVATION_RUNBOOK_G4.md`, constaté à `CHECKLIST_ACTIVATION_G_TRUST_04.md:167`) — plateforme Vercel d'alors ; valeur reprise au dossier de migration le 2026-08-21 (`CHECKLIST_FINALISATION.md:25`, recopie prod → staging). **RELU SUR SCALINGO LE 2026-09-07** (`env-get`) : la variable y est bien posée. |
| `WN_G4_REDEMANDE_PATIENT` | `true` | canal public de redemande de lien | **surface publique non authentifiée**. **POSÉ en Production**, constaté actif le 2026-08-05 (`handoffs/2026-08-05-1634-parcours-patient-unique-revocation-fermee.md:18`, lecture des logs runtime) ; valeur reprise au dossier de migration le 2026-08-21 (`CHECKLIST_FINALISATION.md:25`). **RELU SUR SCALINGO LE 2026-09-07** (`env-get`) : la variable y est bien posée. |
| `WN_G5_GOOGLE_PATIENT` | `true` | entrée patient par Google | exige `WN_GOOGLE_PATIENT_CLIENT_ID` / `_SECRET` (client OAuth dédié). **POSÉ en Production le 2026-07-22** (`propositions/2026-07-25-audit-identites-google/AUDIT_IDENTITES_GOOGLE.md:50`) — une connexion patient réelle tracée le jour même (`SESSION_LOG.md:122`), donc une porte qui a effectivement servi. **RELU SUR SCALINGO LE 2026-09-07** (`env-get`) : la variable y est bien posée. |

## C. Double verrou clinique — `'1'` **ET** validation en code

**L'environnement seul ne les ouvre pas.** Il faut `= '1'` **et** que le contenu
clinique soit validé/signé dans le code (`validationExterne`, date, claims). Ce
n'est pas une gâte « juridique » ni un confort de dev : c'est la **validation
clinique**. Ne pas forcer la métadonnée de validation pour « voir » la feature.

| Flag | Valeur ON | 2ᵉ condition | État (daté) |
|---|---|---|---|
| `WN_ENABLE_CORPUS_CLINIQUE_V1` | `1` | `CORPUS_CLINIQUE_SIGNE` (4 termes depuis [[D-084]] : validation + date non nulle + forme ISO canonique + concordance `shaPerimetre` — pas de terme claims, le corpus n'en cite aucun) | **signée le 2026-08-22** ([[D-082]] — validation clinique du responsable, contenu inchangé ; ancrage `shaPerimetre` posé le même jour, [[D-084]]), **drapeau POSÉ en Production (Scalingo) le 2026-08-22 et CONSTATÉ par le comportement le jour même** ([[D-074]]) : pose dans l'ordre exigé (build signé déployé 09:21 UTC → `env-set` → conteneurs recréés 09:36 UTC), puis synthèse réelle de 10:22 UTC dont la trace d'audit porte `corpusActif: true`, `synthese-v27`, `corpus-clinique-v1`, le SHA signé `19a55478…`, et une mention de limites « avec référentiel clinique SIIN Snapshot V1 » → **les deux conditions sont remplies ; le corpus SERT** |
| `WN_ENABLE_ORIENTATION_NNPP2` | `1` | `tableSignee()` (5 termes depuis `D-067` : validation + date non nulle + forme ISO canonique + claims + concordance `shaPerimetre`) | **20 règles**, `validationExterne: true` depuis le 2026-08-04, et **drapeau POSÉ en Production** — constaté le 2026-08-18 par le comportement ([[D-074]]) → **les deux conditions sont remplies ; l'orientation SERT** |
| `WN_ENABLE_CONTRADICTIONS_NNPP2` | `1` | `tableSignee()` de `contradictionsService.ts` (5 termes depuis `D-067` : validation + date non nulle + forme ISO canonique + claims + concordance `shaPerimetre`) | **1 règle publiée (C-STR)**, table **signée le 2026-08-15** ([[D-061]]) et **drapeau posé en Production le 2026-08-16** ([[D-064]]) → **les deux conditions sont remplies ; les constats sortent au prochain déploiement de production**. L'affichage est câblé depuis [[D-050]] (route cockpit → panneau) |

**Les règles d'arrêt n'ont PAS de drapeau à elles** ([[D-053]], LOT-03 du
2026-08-12) — mais depuis [[D-065]], **elles héritent de celui des
contradictions**. `stopRulesV1.ts` est **signée depuis le 2026-08-15**
([[D-061]]), et le verrou `tableArretExploitable()` d'`orientationService.ts`
exige la signature ET `contradictionsActives()` avant de livrer les deux
effets de la table — l'extinction des recommandations et l'exclusion des
instruments déjà renseignés de façon exploitable. L'histoire qui a imposé ce
couplage : l'orientation étant allumée en production, la signature seule a
rendu **l'extinction effective dès le 2026-08-15** — et elle a tourné trois
jours sans le frein de [[D-053]] §5, le frein ne mordant que sur des constats
effectivement produits quand le drapeau des contradictions manquait
([[D-064]], qui l'a posé). [[D-065]] a rendu ce frein structurel : retirer
`WN_ENABLE_CONTRADICTIONS_NNPP2` ré-éteint désormais l'arrêt tout entier au
lieu de le laisser tourner sans frein. **Leçon pour la prochaine signature** :
vérifier non seulement ce que la signature allume, mais ce dont le
comportement allumé dépend pour rester borné.

**⚠ L'orientation a changé d'état le 2026-08-04.** Jusque-là, la valeur du
drapeau était sans effet : `tableSignee()` était faux, donc le ET aussi, dans
tous les environnements. Depuis la signature, **poser `WN_ENABLE_ORIENTATION_NNPP2=1`
suffit à ouvrir la route** — y compris là où la variable vaudrait déjà `1` sans
que personne s'en souvienne. Vérifier les trois scopes Vercel (Production,
Preview, Development) et les `.env.local` de poste avant de considérer la route
comme fermée. **Depuis le 2026-08-07 (LOT-01, `orientation-file-envoi.spec.ts`),
Playwright la pose** — `webServer.env` dans `web/playwright.config.ts` arme
`WN_ENABLE_ORIENTATION_NNPP2=1`, délibérément, pour aligner le test sur l'état
réel de production plutôt que de le simuler. Le risque de désalignement entre
scopes Vercel (Production, Preview, Development) et `.env.local` de poste reste
entier, lui, et rien côté CI ne le couvre.

Débloquer ces deux-là = **valider le contenu clinique** (décision clinique,
documentée au `CHANGELOG`), pas flipper un flag.

**Et signer ne suffit pas non plus** : le verrou est un ET. Sur l'orientation,
signer la table sans poser `WN_ENABLE_ORIENTATION_NNPP2=1` en production laisse
l'écran praticien du LOT-06 sur « Orientation non activée ». Les deux gestes
vont ensemble, dans cet ordre : validation clinique d'abord, flag ensuite.

### État des signatures — **gardé, ne pas éditer à la main sans le code**

Ce tableau a menti trois jours ([[D-064]]) : il annonçait « fermé quoi qu'on
pose » sur une table déjà signée. Il est désormais **épinglé par un banc**
(`web/src/lib/verrousSignatureDocumentes.guard.test.ts`) qui le compare aux
métadonnées réelles. Signer une table sans corriger ce tableau fait rougir le
CI ; une table signée neuve absente du tableau aussi.

<!-- >>> ETAT_VERROUS_SIGNATURE -->

| Table (fichier sous `web/src/lib/`) | `validationExterne` | `dateValidation` |
|---|---|---|
| `clinical/orientationRulesV1.ts` | `true` | `2026-08-06T00:00:00.000Z` |
| `clinical/contradictionsV1.ts` | `true` | `2026-08-15T00:00:00.000Z` |
| `clinical/stopRulesV1.ts` | `true` | `2026-08-15T00:00:00.000Z` |
| `biology-library/indicationsBiologieV1.ts` | `true` | `2026-08-17T00:00:00.000Z` |
| `clinical/corpusSyntheseV1.ts` | `true` | `2026-08-22T00:00:00.000Z` |
| `clinical/priorityRulesV1.ts` | `true` | `2026-08-28T00:00:00.000Z` |
| `clinical/safetySignalsV1.ts` | `true` | `2026-08-23T00:00:00.000Z` |
| `clinical/safetyEffetIndesirableV1.ts` | `false` | `null` |
| `clinical/gatePopulationV1.ts` | `false` | `null` |
| `clinical/conflitsSourcesV1.ts` | `true` | `2026-08-24T00:00:00.000Z` |

<!-- <<< ETAT_VERROUS_SIGNATURE -->

Trois lectures attentives sur ce tableau :

- **`indicationsBiologieV1.ts` est SIGNÉE aux cinq termes depuis `D-069`**
  (2026-08-17) : quinze règles, 29 claims, `shaPerimetre` figé. Le verrou de
  signature est OUVERT — et `WN_CB_ENABLED` est POSÉ à `true` en production,
  constaté le 2026-08-17 ([[D-070]] ; la date de pose n'est enregistrée nulle
  part et reste inconnue). Les deux termes du ET sont donc vrais. Ce qu'ils
  ouvrent est la surface d'**arbitrage** biologique, **pas** les indications.
  `deriverStatutsBiologie` a désormais un appelant de production —
  `propositionService.ts`, servi par `/api/praticien/biologie/proposition`
  ([[D-071]]) — mais il est gardé par un **troisième** terme :
  `WN_CB_PROPOSITION`. Il a été livré NEUF et ÉTEINT — délibérément :
  `WN_CB_ENABLED` valant déjà `true`, s'y adosser aurait exposé la proposition
  sur tous les dossiers dès le déploiement, sans geste d'exploitation. **Il est
  POSÉ en Production depuis le 2026-08-18**, et le déploiement qui le porte est
  `dpl_A8y6TawV` (build du 2026-08-18 12:31 UTC, aliasé `app.wellneuro.fr`).
  Les trois termes sont donc vrais et la table signée n'est plus dormante.

**POSER LA VARIABLE NE SUFFIT PAS : IL FAUT UN BUILD QUI LA PORTE.** Vercel fige
les variables dans le déploiement. Or `web/vercel.json` porte
`"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."` — la construction est
SAUTÉE quand le dernier commit ne touche rien sous `web/`. Le 2026-08-18, le
drapeau a été posé après un merge purement outillage (#707, `scripts/` et
`docs/` seulement) : les deux déploiements suivants ont été **annulés en trois
secondes** par cette règle, et la production a continué de servir un build
ANTÉRIEUR à la variable. Le drapeau existait dans le panneau et n'était porté
par rien — même classe que [[D-064]] et [[D-070]], sous une forme neuve.
Remède appliqué : redéployer un déploiement dont le commit touche `web/`
(ici celui de #706). **Vérifier la date du build, pas seulement celle de la
variable.**
- **Les quatre tables cliniques portent un `shaPerimetre` depuis `D-067`**
  (2026-08-16) : le verrou est passé à cinq termes — booléen, date, forme ISO
  canonique, claims, concordance du SHA de périmètre. Une règle retouchée
  après signature ferme désormais son verrou seule. `priorityRulesV1.ts` a été
  **re-signée le 2026-08-16** sur le périmètre agrandi par `D-062` — la dette
  de re-signature était soldée —, une **deuxième fois le 2026-08-23**
  ([[D-099]]) : le producteur de constats de sécurité du LOT-04 a rendu faux le
  texte signé d'`ABST-NR-01` (« aucun producteur n'existe à ce jour »), et le
  corriger a refermé le verrou. Le diff signé se limite à cette phrase. Enfin
  **deux fois le 2026-08-28** ([[D-116]] puis [[D-117]]) : la table porte
  désormais QUATRE règles — `PRIO-SOM-01` (axe sommeil et rythme circadien) et
  `PRIO-DOU-01` (axe douleur et perception). Ce sont les premières
  re-signatures dont le périmètre s'agrandit d'une RÈGLE et non d'un texte :
  `PRIO-SOM` et `PRIO-DOU` étaient écartées depuis le 2026-08-12, et leurs
  conditions de retour ont été levées par arbitrage praticien. `PRIO-DOU`
  couvrait `douleurs` ET `mobilite` ; seule la première revient, la seconde
  reste écartée sous `PRIO-MOB`.
- **`safetySignalsV1.ts` est la table neuve du 2026-08-23** ([[D-099]]) : la
  cotation des douze signaux d'alerte d'anamnèse en deux rangs. **Son verrou
  a un sens INVERSE des autres** — le refermer ne fait pas taire un moteur, il
  retire une **inhibition**. Une cotation retouchée sans re-signature laisse
  donc le dispositif moins prudent, et le seul contrepoids est la règle
  `SAF-ANAM-01` passée en `candidate`, dont la revue clinique publie
  l'inactivité. À lire avant d'y toucher.
- **`conflitsSourcesV1.ts` est le registre neuf du 2026-08-24** ([[D-103]]) :
  les conflits DÉCLARÉS entre deux claims du corpus. **Son verrou est le seul
  geste d'exploitation** — il n'a pas de drapeau propre, et les deux termes qui
  l'accompagnent sont DÉJÀ vrais en production
  (`WN_ENABLE_CONTRADICTIONS_NNPP2=1`, `WN_CB_PROPOSITION=true`).
  **SIGNÉ le 2026-08-24 ([[D-104]])**, après la revue : les trois termes sont
  donc vrais, et le constat `CS-BIO-01` atteint le cockpit sur tout dossier dont
  la proposition de bilan cite `WN-CL-0312-018` — la plupart. C'est le seul
  registre du dépôt dont la signature soit à elle seule la mise en service ;
  les autres ont un drapeau devant eux.
  **Deuxième effet de la signature, moins visible** : la route cockpit dérive
  désormais la proposition de bilan à chaque POST pour collecter les claims
  cités (cinq requêtes de plus, isolées par un `catch` — une panne n'emporte pas
  la confirmation d'épisode). Verrou refermé, ce coût disparaît.
- **`orientationRulesV1.ts` garde son jour de signature du 2026-08-06** : seule
  la FORME de la date a été portée à l'ISO canonique par `D-067` (réserve F5) —
  le fait attesté ne change pas.

## D. Gate dur HDS — requalifié par [[D-081]]

| Flag | Valeur ON | Ouvre | Garde |
|---|---|---|---|
| `WN_CB_RESULTS_ENABLED` | `true` | stockage de **résultats biologiques réels** (donnée de santé) | exige AUSSI `WN_CB_ENABLED` ; ~~« ne doit jamais passer à true avant l'attestation HDS »~~ — **requalifié le 2026-08-22 ([[D-081]])** : la condition est un **hébergement HDS effectif et exclusif**, satisfaite au décommissionnement de Vercel/Supabase ([[D-080]], 2026-09-01). **Posé le 2026-09-03 avec le code qui le lit** (étage 2, [[D-122]] §2, geste daté D-081) : appelants `gardeResultats.ts` (routes GET/POST `api/praticien/biologie/resultats`), `EstimeMesurePanel` (via `CbFeatureProvider`), et les générateurs courrier/document patient (phrase « aucun résultat conservé » conditionnée). Absent en production = éteint (fail-closed). **QUATRIÈME CONDITION, RGPD, et elle ne s'écrivait pas ici** : `docs/DOSSIER_RGPD.md` §2 exige la mise à jour **préalable** du registre des traitements (rubrique 5) et du document d'information patient (`donnees_confidentialite` dans `registre.ts`) — nouvelle catégorie « résultats biologiques ». Elle n'était mentionnée ni sur cette ligne ni dans `D-122` §2, et a donc été manquée. **Posé en production le 2026-09-09** (conteneurs redémarrés 06:34:55 ; effectivité constatée par sonde non authentifiée — `401` et non `503`), **avant** ces deux mises à jour, faites le jour même après constat (0 ligne en base, `one-off-8343`) : l'écart est daté au dossier RGPD §2 |

## E. Configuration / secrets — **pas** des gâtes

À ne pas confondre avec les flags : ces variables portent une valeur, elles
n'ouvrent rien.

`WN_CLAIMS_CLAUDE_MODEL` · `WN_DEPLOY_ENV` · `WN_RELEASE_SHA` ·
`NEXT_PUBLIC_WN_DEPLOY_ENV` · `NEXT_PUBLIC_WN_RELEASE_SHA` ·
`WN_PORTAIL_TOKEN_TTL_JOURS` (TTL, entier) · `RAG_INTERNAL_SECRET` ·
`RAG_EMBEDDING_MODEL` · `RAG_EMBEDDING_DIMENSIONS` ·
`WN_GOOGLE_PATIENT_CLIENT_ID` / `_SECRET`.

## Tout allumer pour le dev local

À coller dans `web/.env.local` (gitignoré, jamais committé) :

```bash
WN_C4_ENABLED=true
WN_C5_ENABLED=true
WN_CB_ENABLED=true
WN_SYNTHESE_STREAM=true
WN_CLAIMS_QUESTIONNAIRE_STREAM=true
RAG_PGVECTOR_ENABLED=true            # + RAG_INTERNAL_SECRET et clés OpenAI
WN_G4_LIEN_MAGIQUE=true
WN_G4_REDEMANDE_PATIENT=true
WN_G5_GOOGLE_PATIENT=true            # + WN_GOOGLE_PATIENT_CLIENT_ID / _SECRET
```

Les flags **C** (double verrou clinique) et **D** (gate dur HDS) n'y figurent pas
volontairement : les premiers ne s'ouvrent pas par l'environnement, le second ne
doit pas s'ouvrir hors HDS. Pour le staging Scalingo, mêmes lignes en
`scalingo --app <app> env-set <FLAG>=true >/dev/null 2>&1` (rediriger : `env-set`
réaffiche la valeur).
