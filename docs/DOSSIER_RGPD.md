# Dossier RGPD de l'expérimentation Wellneuro

> Écrit le 2026-08-07 pour l'item 7 de « Ce qu'il resterait à faire » de
> `docs/claude/campagnes/2026-07-15-trust-information-patient-droits-v1/CHECKLIST_ACTIVATION_G_TRUST_04.md`.
>
> **Alerte, pas avis juridique.** Ce document est rédigé par l'assistant, dont la
> connaissance a une date de coupure et qui n'est pas juriste. Il doit être
> **confirmé par un conseil qualifié** avant d'être opposé à qui que ce soit —
> la revue juridique externe est une dette nommée
> (`docs/claude/campagnes/2026-07-15-trust-information-patient-droits-v1/DETTE_TRUST.md`,
> gate G-TRUST-03).
>
> **Ce document recense, il ne qualifie pas.** Chaque rubrique porte soit une
> **source** dans le dépôt, soit la mention **TROU** — parce que la valeur ne se
> déduit d'aucun fichier et qu'une valeur plausible serait pire que son absence.
> Le tableau de la section 14 récapitule les trous, leur porteur et leur
> échéance.

**Ce dossier ne lève rien.** Le gate G-TRUST-04 reste non levé ; il est couvert
par une dérogation datée du 2026-07-21, bornée au **2026-10-21**.

> **Deux dates, deux évènements — ne pas les confondre ni les « aligner ».** Le
> **2026-07-21** est celui de l'instruction de l'hébergement (Supabase et Vercel
> absents de l'annuaire ANS) et de la dérogation ci-dessus. Le **2026-07-22** est
> celui de l'**arbitrage** qui en a tiré la conséquence — rester sur
> l'hébergement actuel, borner la phase de test, n'instruire aucune migration
> HDS (`docs/claude/campagnes/2026-08-05-cloture-des-dettes-wellneuro-5-0/CAMPAGNE.md`,
> point 8). L'échéance, elle, est la même partout : **2026-10-21**.
>
> **Cet arbitrage n'est plus l'orientation courante.** `docs/DECISIONS.md`
> D-006 (2026-07-28, six jours plus tard) décide la migration vers Scalingo, et
> D-037 (2026-08-09) la confirme. Les deux dates ci-dessus restent vraies comme
> évènements ; la conséquence « n'instruire aucune migration HDS » ne l'est
> plus. **La dérogation, elle, court inchangée jusqu'au 2026-10-21.**

---

## 1. Responsable du traitement

**Source.** Le praticien Wellneuro, contact `martialcayre@wellneuro.fr` —
qualification G-TRUST-02, décision du 2026-07-16
(`docs/claude/campagnes/2026-07-15-trust-information-patient-droits-v1/GATES_GO_NO_GO.md`).
Le même contact est affiché au patient — par le document
`DONNEES_CONFIDENTIALITE_V1` (`web/src/lib/trust/contenus/registre.ts`), seul
chemin servi ; voir la note de la rubrique 6 sur `gouvernance.ts` — et repris
comme point d'entrée de la procédure d'incident
(`docs/PROCEDURE_VIOLATION_DONNEES.md` §Rôles).

**TROU.** L'identité juridique exacte du responsable — personne physique ou
morale, dénomination, SIRET, adresse postale — n'apparaît nulle part dans le
dépôt. Un dossier RGPD opposable la porte.

> ⚠ **Contradiction relevée, non tranchée ici.** G-TRUST-02 et
> `PROCEDURE_VIOLATION_DONNEES.md` écrivent « **pas de DPO désigné** : le point
> de contact est le responsable lui-même ». `docs/DECISIONS.md` D-005 écrit
> « **confirmé par le DPO le 2026-07-27** ». Les deux ne peuvent pas être vrais
> en même temps. Trancher relève du responsable, pas de ce document ; la
> réponse conditionne la rubrique 9 (qui reçoit les demandes de droits) et la
> valeur de D-005 comme pièce d'audit.

## 2. Finalité du traitement

**Source.** `web/src/lib/trust/contenus/registre.ts`, section « Pourquoi ? » du
document `DONNEES_CONFIDENTIALITE_V1` : préparer et suivre l'accompagnement en
neuronutrition — comprendre la situation, préparer les consultations, suivre
l'évolution, remettre des documents validés par le praticien.

Le même document écrit, et c'est une limite de finalité opposable :
« cet accompagnement relève du bien-être et du suivi ; **il n'établit pas de
diagnostic médical** ». L'étage des résultats biologiques réels est
construit (table `resultats_biologiques`, `D-122` §2, 2026-09-03) et reste
**fermé en production** : `WN_CB_RESULTS_ENABLED` est éteint, aucune valeur
n'est saisie ni stockée. Son ouverture est un geste d'exploitation daté,
conditionné à la mise à jour **préalable** du registre des traitements et du
document d'information patient (nouvelle catégorie « résultats
biologiques »).

## 3. Base légale

**TROU intégral.** Aucune base légale n'est qualifiée dans le dépôt, et ce
document n'en qualifie pas.

Ce qui existe, et qui n'en tient pas lieu :

- des **consentements recueillis** en phase de test
  (`CHECKLIST_ACTIVATION_G_TRUST_04.md` §« Le consentement recueilli », et le
  document `CONSENTEMENT_SUIVI_V1` du registre trust) ;
- une **décision du responsable** invoquant ces consentements et l'information
  RGPD déjà délivrée pour autoriser des données réelles (`docs/DECISIONS.md`
  D-006, 2026-07-28).

Un consentement recueilli n'est pas la même chose qu'une base légale
qualifiée, et la qualification d'un traitement de données de santé ne se déduit
pas d'un fichier. **Ne pas écrire ici d'article du RGPD** — ni 6.1.a, ni 9.2.h,
ni aucun autre — tant qu'un conseil qualifié ne l'a pas posé. La checklist du
gate porte déjà, sur un sujet voisin, la démonstration de ce qu'une intuition
juridique non vérifiée coûte (§ consentement ≠ HDS).

## 4. Catégories de personnes concernées

**Source.** Patients du cabinet, et le praticien lui-même (données de connexion
et journal d'accès). Relevé **daté du 2026-07-21**
(`CHECKLIST_ACTIVATION_G_TRUST_04.md`) : **17 patients, dont 3 graines
fictives**, et **13 accès portail ouverts**.

Ce chiffre est un relevé, pas un effectif courant : il n'est pas régénéré par
ce document.

**TROU.** Le traitement de données de **mineurs** n'est ni exclu ni encadré
(point resté « à valider » dans
`docs/claude/campagnes/2026-07-15-trust-information-patient-droits-v1/SOURCES_ET_VALIDATIONS.md`).

## 5. Catégories de données

**Source.** `web/prisma/schema.prisma`, 67 modèles au 2026-08-07. La
qualification « données de santé, art. 9, catégorie particulière » n'est pas
tirée du schéma — qui ne la porte pas — mais reprise de
`docs/PROCEDURE_VIOLATION_DONNEES.md`, où elle est déjà écrite. Les données
personnelles se répartissent ainsi :

| Catégorie | Modèles | Nature |
|---|---|---|
| Identité et contact | `Patient` (email, prénom, nom, date de naissance, téléphone) | Données ordinaires |
| **Santé (art. 9)** | `Consultation`, `QuestionnaireReponse`, `SyntheseIA`, `AssessmentEpisode`, `ProtocolDraft`, `ProtocolCheckin`, `AgendaSommeilNuit`, `AgendaAlimentaireJour`, `CorrespondanceMedecin`, `CorrespondancePatient`, `BookletEnvoi`, `RelectureNote`, `TrustAdverseEffectReport` | **Catégorie particulière** |
| Preuves de transparence | `TrustAcknowledgement`, `TrustChoiceEvent`, `TrustRightsRequest`, `TrustPrivacyIncident` | Traces d'information, de choix et de demandes |
| Authentification et accès | `Patient.accessTokenRevoked` (drapeau de révocation, non secret — les valeurs du jeton permanent ont été **purgées le 2026-08-22**, `D-085` §5), `PortailMagicLink`, `PortailConnexionGoogle`, `PortailDemandeTentative` | Drapeau, liens hachés expirants, traces de connexion, anti-abus |
| Journalisation | `JournalAccesDossier` (`id_patient`, `praticien_email`, route, méthode, horodatage) | Piste d'audit des accès praticien |
| Résidu d'effacement | `DossierEfface` (année de naissance, initiales, date) | Preuve d'effacement, volontairement non ré-identifiante |

**Hors périmètre personnel**, et à ne pas confondre : les référentiels
(`Biology*`, `Supplement*`, `Ciqual*`, catalogues de questionnaires) ne portent
aucune donnée personnelle.

## 6. Destinataires et sous-traitants

**Source.** La liste **montrée au patient** est celle du document
`DONNEES_CONFIDENTIALITE_V1` (`web/src/lib/trust/contenus/registre.ts`), servi
par les pages du portail. Elle est identique à celle de G-TRUST-02 :

| Sous-traitant | Rôle |
|---|---|
| Vercel | hébergement de l'application |
| Supabase | hébergement de la base de données |
| Anthropic | assistance d'IA pour la préparation des synthèses |
| Fournisseur d'envoi d'e-mails | acheminement des e-mails |
| Google | connexion du praticien **uniquement** — jamais des patients |

Aucun autre destinataire : « votre praticien, dans le cadre de votre
accompagnement ; personne d'autre n'y accède au sein de Wellneuro », et aucun
partage à un tiers (médecin traitant compris) sans choix explicite du patient
(`registre.ts`).

> **Attribution corrigée le 2026-08-19 (LOT-03), et dette qui en résulte.**
> Cette rubrique et la rubrique 1 citaient `web/src/lib/trust/gouvernance.ts`
> comme la source « montrée au patient ». C'est faux : ses deux exports n'ont
> **aucun consommateur** dans `web/src` ni `web/e2e` — le module est une
> **copie morte**. Le contenu servi est celui de `contenus/registre.ts`.
> **Rien ne tient les deux copies synchrones** : une modification de
> `gouvernance.ts` — la liste des sous-traitants, le contact des droits —
> n'atteindrait aucun patient tout en paraissant l'avoir fait. Dette nommée,
> sans lot d'accueil ; à traiter avec le lot TRUST qui publiera la v2 du
> document d'information.

**TROUS.**

1. **Aucun DPA n'est signé**, avec aucun de ces sous-traitants
   (`CHECKLIST_ACTIVATION_G_TRUST_04.md` item 7 ;
   `docs/claude/propositions/2026-07-24-audit-migration-hds/CHECKLIST_FINALISATION.md:67`).
   ~~**Nuance posée le 2026-08-09 (D-037)** : pour Scalingo, il n'y a pas de
   signature à obtenir — l'accord de sous-traitance vit dans les documents
   généraux, acceptés à la souscription.~~ **Démentie par la réponse écrite du
   2026-08-11 (`D-047`, section ci-dessous) : une annexe HDS distincte est
   bien à signer.** Ce qui manque au dossier reste la **copie horodatée de la
   version acceptée**, demandée au fournisseur le 2026-08-09 — ~~**question de
   forme non posée à ce ticket**, à poser au prochain échange (D-037)~~ —
   **posée depuis** : la forme a reçu réponse le 2026-08-11, et la copie
   horodatée est redemandée au message du 2026-08-12 puis relancée le
   2026-08-19, sans réponse à ce jour (« Canal et trace de la demande
   d'annexe », ci-dessous). Ce point vaut pour Scalingo seul ; les autres
   sous-traitants de la liste ci-dessus restent sans DPA archivé.
2. ~~Le **fournisseur SMTP réel n'est pas identifié** — ni son nom, ni sa
   localisation (`CHECKLIST_FINALISATION.md:68`).~~ **Identifié le
   2026-08-22 : Google Workspace** — établi sans lire aucun secret, par
   concordance de trois traces publiques et d'une du code : le SPF de
   `wellneuro.fr` n'autorise que `_spf.google.com`, le MX est
   `smtp.google.com`, la clé DKIM active est celle de Google, et
   l'expéditeur du code est `"Wellneuro" <noreply@wellneuro.fr>`
   (`web/src/lib/consultation/email.ts`). La ligne « Fournisseur d'envoi
   d'e-mails » de la liste patient reste exacte ; Google y figure déjà, mais
   au titre de la seule connexion praticien — le cumul des deux rôles est un
   fait à porter au document d'information v2 (lot TRUST). **Restent dus** :
   la localisation du traitement et la couverture DPA
   (`CHECKLIST_FINALISATION.md` §F).
3. ~~**Sentry est un sous-traitant de fait non déclaré au patient.**~~
   **TRANCHÉ le 2026-09-07 (`D-141`), dans le second sens : la liste patient
   était incomplète, elle se corrige.** Sentry a été câblé sur demande du
   responsable et figure désormais dans `donnees_confidentialite@v5`, avec ce
   qu'il reçoit (type d'erreur, navigateur, adresse de page anonymisée) et ce
   qu'il ne reçoit jamais (réponses, documents, identité). **La résidence UE
   n'est plus une déclaration mais un invariant de code** :
   `web/src/lib/observability/sentryRegion.ts` refuse tout DSN hors
   `.ingest.de.sentry.io`, et l'observabilité reste éteinte plutôt que
   d'émettre ailleurs. Le volet client est tranché de la même façon
   (`NEXT_PUBLIC_SENTRY_DSN`, même garde, Session Replay à zéro).
   **Reste dû : le DPA Sentry**, avec les autres (rubrique 6).
   Historique : écart ouvert le 2026-08-07, `CHECKLIST_FINALISATION.md:42, 68`.
4. **Scalingo** est décidé (D-006, 2026-07-28 ; confirmé par D-037,
   2026-08-09) ~~mais **pas en service** : il n'entre dans cette liste qu'au
   basculement, et la décision subordonne toute donnée réelle à deux conditions
   préalables — l'accord de sous-traitance en vigueur et archivé, et le
   périmètre HDS de la région confirmé par écrit.~~ **Les données réelles y
   résident depuis le 2026-08-22, 03:24 CEST** (ordre des conditions suspendu
   par `D-078` §4 ; chronologie complète : rubrique 12). **Toujours pas en
   service** : l'application servie aux personnes reste sur Vercel/Supabase
   jusqu'au cutover DNS, et c'est au basculement de service que Scalingo entre
   dans la liste montrée au patient. Mais la résidence des données, elle, est
   un fait depuis cette date — c'est précisément ce que le renouvellement
   d'information (rubrique 11) doit dire.

### Certification HDS de Scalingo — pièce au dossier

Lue le 2026-08-09. Le document est conservé sur Drive (dossier « Scalingo »,
déposé le 2026-07-28) ; il est par ailleurs public.

| Élément | Valeur |
|---|---|
| Numéro de certificat | **LNE n° 38436-2** (renouvelle le 38436-1) |
| Titulaire | **SCALINGO**, 13 rue Jacques Peirotes, 67000 Strasbourg |
| Référentiel | Hébergeur de Données de Santé **version 2.0** |
| Validité | **2025-09-12 → 2028-09-11** |
| Activités couvertes | **les six**, dont la **5** (administration et exploitation du SI) et la **6** (sauvegardes externalisées) |
| Déclaration d'applicabilité | ISO/IEC 27001:2022 et HDS 2.0, v1.0.0 du 2025-04-14 |
| Organisme certificateur | LNE, accréditation Cofrac n° 4-0038 |
| Sites couverts | 9 rue de la Krutenau, 67000 Strasbourg ; sites virtuels / bureaux distants |

Trois points à ne pas perdre :

- **La validité est conditionnelle.** Le certificat n'est valide que sous
  réserve de la validité, **à isopérimètre**, du certificat **ISO/IEC 27001
  n° 38435**. Le dossier doit porter les deux numéros ; avec le seul 38436-2, la
  pièce est incomplète pour un auditeur.
- **Les activités 5 et 6 sont couvertes**, ce qui place le PostgreSQL managé
  **et ses sauvegardes** dans le périmètre — le motif exact pour lequel l'audit
  du 2026-07-24 avait écarté un autre fournisseur.
- **Le certificat ne nomme aucune région.** Il **ne suffit donc pas** à établir
  que les ressources créées `--hds-resource` en `osc-fr1` sont couvertes : cela
  relève des conditions de l'offre, demandées par écrit au fournisseur le
  2026-08-09. Élément à charge côté plateforme : `scalingo apps-info` rend
  `HDS: true` sur l'application. **TROU répondu par écrit le 2026-08-11**, voir
  ci-dessous.

### Réponse écrite du fournisseur (2026-08-11)

Reçue par courriel (Jennifer, Scalingo), en réponse aux questions posées le
2026-08-09.

- **Périmètre géographique — TROU fermé.** Les ressources créées avec
  `--hds-resource` en région `osc-fr1` (application, add-on PostgreSQL et ses
  sauvegardes) sont couvertes par le certificat **LNE n° 38436-2**, pour les
  six activités du référentiel dont la **5** (administration et exploitation)
  et la **6** (sauvegardes externalisées).
- **ISO/IEC 27001 n° 38435** — certificat public,
  <https://scalingo.com/fr/certification-iso-27001>.
- **Forme de l'accord de sous-traitance — précisée, encore non archivée.**
  L'accord se compose de deux pièces distinctes : le DPA
  (<https://scalingo.com/fr/contrat-gestion-traitements-donnees-personnelles>)
  et une **annexe HDS séparée**, à signer indépendamment — l'acceptation des
  CGU seule ne l'active pas. La forme posée en rubrique 14 (« forme non posée
  au ticket du 2026-08-09 ») est donc connue ; **la signature et l'archivage
  de l'annexe HDS restent à faire** ~~avant toute donnée réelle (condition
  D-037)~~ — **ordre suspendu par `D-078` (2026-08-19)** : la migration est
  engagée sans attendre l'annexe, par arbitrage du responsable informé de la
  fenêtre de moindre couverture qui en résulte. La signature et l'archivage
  restent **dus** ; ils conditionnent désormais le **décommissionnement** de
  Vercel/Supabase (seul geste irréversible) et constituent la sortie « par le
  haut » de la revue du 2026-10-21.
- **Sous-traitant ultérieur.** OUTSCALE, opérateur d'infrastructure, France
  (région Paris), certifié HDS pour les six activités ; l'intégralité des
  données reste dans ses datacenters français.
- **Région `osc-secnum-fr1`** — non utilisée par ce projet. Réservée aux
  clients demandant, en plus de HDS, la Visa SecNumCloud (accès soumis à
  validation InfoSec Scalingo). Mentionnée ici pour mémoire, hors périmètre
  de la migration actuelle.
- **Journalisation Scalingo** — logs d'accès applicatifs conservés 90 jours à
  1 an, logs d'infrastructure 1 an, les deux inclus dans le périmètre HDS
  (activité 5). Distinct du TROU rubrique 8, qui porte sur la conservation
  des données de santé elles-mêmes, non sur les journaux de la plateforme.

### Canal et trace de la demande d'annexe — vérifié le 2026-08-20

Trace produite au titre du premier critère du LOT-01 (campagne
`2026-08-18-echeance-hds-g-trust-04`) : les dates de la demande et de la
relance ne reposaient jusqu'ici que sur l'affirmation de `D-078`. Elles sont
ici **établies par lecture du fil**, pas par déclaration.

- **Canal** : un fil de courriel unique avec le support du fournisseur
  (relayé par Intercom), objet « Périmètre HDS de la région `osc-fr1` et
  pièces contractuelles — compte wellneuro », ouvert le **2026-08-09
  09:42 UTC** depuis l'adresse du responsable. **Le fournisseur n'émet aucun
  numéro de ticket** : la référence du canal est l'objet du fil et ses dates.
- **2026-08-11 08:19 UTC** — réponse de fond, celle que `D-047` a tranchée
  (section ci-dessus).
- **2026-08-12 02:55 UTC** — **demande de l'annexe HDS** : le document et sa
  procédure de signature (point 1), la copie horodatée du DPA (point 2).
  Confirme la date affirmée par `D-078`.
- **2026-08-19 09:37 UTC** — **relance**, l'annexe posée comme le point
  bloquant (document, procédure et délai de signature, préalable éventuel
  côté compte), avec demande d'un interlocuteur direct si sa délivrance ne
  relève pas du support. Deux points repris comme non bloquants : la **copie
  horodatée du DPA** et la couverture rétroactive des ressources déjà
  provisionnées. Confirme la date affirmée par `D-078`.
- **État au 2026-08-20 : sans réponse.** Le dernier message du fil est la
  relance ; la demande initiale est pendante depuis huit jours.

Ce constat ne dit rien de l'annexe elle-même : elle n'est **ni reçue, ni
signée, ni archivée**, et la ligne correspondante du tableau §14 reste
ouverte.

## 7. Transferts hors Union européenne

**Source.**

- **Supabase** — projet `Wellneuro-app`, région `eu-central-1` (Francfort),
  lecture du 2026-08-07 via l'outil de lecture Supabase. Dans l'UE.
- **Vercel** — région `fra1` (`web/vercel.json`). Dans l'UE. Vercel Inc. reste
  une société de droit américain, ce qui est une question distincte de la
  localisation d'exécution.
- **Anthropic** — transfert qualifié **hors UE** par
  `docs/claude/propositions/2026-07-24-audit-migration-hds/AUDIT_MIGRATION_HDS.md:94`
  (« DPA art. 28, transfert hors UE, TIA »). C'est le transfert principal, et il
  porte des données de santé au titre des synthèses. **Réserve** : le même audit
  demande, sans y avoir répondu, de vérifier « l'existence contractuelle d'une
  inférence UE » et la rétention d'inférence (`:251-253`, le prompt caching
  étant activé). La localisation réelle de l'inférence n'est donc **pas
  établie** — ni dans un sens ni dans l'autre.
- **Google** — connexion du praticien seul.

**TROU.** Le **mécanisme de transfert invoqué** (clauses contractuelles types,
annexe d'un DPA, décision d'adéquation) n'est écrit nulle part, pour aucun de
ces flux. Ne rien affirmer avant vérification contractuelle.

## 8. Durées de conservation

**Source — une seule durée est réellement écrite et arbitrée :**

- **Journal d'accès aux dossiers** : **12 mois glissants**, purge opportuniste
  à l'écriture, plus effacement avec le dossier — règle GD-2, alignée sur un
  arbitrage du responsable du 2026-07-22
  (`docs/claude/campagnes/2026-07-22-g-trust-04-durcissement-et-reliquats/CAMPAGNE.md`).
- **Traces d'identité Google** : 12 mois
  (`docs/claude/propositions/2026-07-25-audit-identites-google/AUDIT_IDENTITES_GOOGLE.md`).
- **Effacement sur demande** : le dossier et ses tables filles sont effacés, et
  `DossierEfface` conserve une preuve non ré-identifiante (année de naissance,
  initiales, date).
- **Append-only assumé** : `TrustAcknowledgement` et `TrustChoiceEvent` sont des
  preuves d'information et de choix ; elles ne sont pas réécrites.

**TROU pour tout le reste** — et le produit le dit déjà publiquement, dans ces
termes exacts (`gouvernance.ts`, repris dans `registre.ts`) :

> « La politique détaillée de durées de conservation est **en cours de
> formalisation**. Vos données sont conservées le temps de votre
> accompagnement ; vous pouvez à tout moment demander des précisions ou
> l'exercice de vos droits. »

Cet aveu est honnête ; il n'est pas une politique. Aucune durée n'est fixée pour
les données de santé elles-mêmes (consultations, réponses, synthèses,
correspondances). Porteur : responsable, avec conseil qualifié. Échéance
proposée : **2026-10-21**, date de revue de la dérogation.

## 9. Droits des personnes et modalités d'exercice

**Source.** `registre.ts`, section « Exercer mes droits » : accès,
rectification, effacement, limitation, opposition, retrait d'une autorisation.
Deux canaux — la carte « Signaler un problème » de l'espace patient (choix
« Je souhaite exercer un droit », enregistré en `TrustRightsRequest`) et
l'adresse `martialcayre@wellneuro.fr`. Un canal d'incident de confidentialité
distinct existe (`TrustPrivacyIncident`).

Le texte patient précise déjà que « certains droits dépendent du cadre
applicable au traitement concerné » — formulation prudente, cohérente avec le
trou de la rubrique 3.

**TROUS.** Le **délai de réponse** annoncé, la **procédure de vérification
d'identité** du demandeur, et le **circuit interne de traitement** d'une demande
reçue ne sont écrits nulle part. Une demande arrivant aujourd'hui serait traitée
sans procédure écrite.

## 10. Mesures de sécurité

**Source.** Le tableau des sept exigences de
`CHECKLIST_ACTIVATION_G_TRUST_04.md` fait foi. En synthèse :

- **Cloisonnement** — RLS `deny-all` sur 71 tables `public` (migration
  `20260707123710_enable_rls_security`) **plus** gardes applicatifs
  (`web/src/lib/praticien/appartenance.ts`, portail résolu par cookie signé).
  Posture retenue et motivée en `docs/DECISIONS.md` D-005 — sous réserve de la
  contradiction DPO signalée en rubrique 1.
- **Accès patient** — lien magique haché, expirant en 24 h, à usage unique
  (G4, activé en production le 2026-07-21) ; coupe-circuit de session
  `sessionsInvalidesAvant`.
- **Piste d'audit** — `journal_acces_dossiers`, écriture branchée sur les
  24 routes GET « dossier nommé » (23ᵉ le 2026-09-03 : lecture des résultats
  biologiques, étage 2 du rayon — D-122 §2 ; 24ᵉ le 2026-09-04 : relecture des
  documents patient déjà consignés — LOT-01 « Biologie exploitée », une pièce
  remise se relit telle qu'elle est partie). **Cette 24ᵉ lecture est
  AUTOMATIQUE, pas gestuelle** : elle part avec l'affichage du panneau de
  proposition, donc une ouverture de fiche inscrit deux accès pour ce rayon là
  où elle en inscrivait un. C'est assumé — ce que la route rapporte est
  affiché, et journaliser une lecture faite vaut mieux qu'un affichage muet.
  **Limites écrites** : pas
  d'écran de consultation (lecture par requête SQL), POST exclus — y compris
  la saisie d'un résultat, qui ne lit rien du dossier et dont l'écriture est
  tracée par la ligne consignée elle-même (`saisi_par`, `saisi_le`) ; les
  POST courrier/document patient, eux, journalisent parce qu'ils DÉRIVENT le
  dossier entier —, liste vide non journalisée.
- **Procédure de violation** — `docs/PROCEDURE_VIOLATION_DONNEES.md`, écrite
  **et exercée sur table** le 2026-07-22 (fiche 2026-EX1, scénario fictif).
- **Hygiène du dépôt** — `docs/securite_rgpd.md`, garde anti-secrets
  (`scripts/check_no_secrets.sh`).

**TROUS.** Aucun **pentest** ni **revue de sécurité externe** (exigence 7 du
gate, restée entière). Le **registre physique des violations** n'existe pas
(EX-3). ~~La preuve fonctionnelle en production de la piste d'audit reste à
faire.~~ **Produite le 2026-08-22** (revue G-TRUST-04 reprise) : 947 accès
journalisés, 14 dossiers distincts, 27 routes, du 2026-07-23 au 2026-08-22,
dont 99 écritures après la bascule Scalingo — historique porté, journal
vivant post-cutover (sonde lecture seule, agrégats sans identité). Trou
nouveau relevé le même jour : **`docs/RUNBOOK.md` est périmé depuis le
cutover** (chapitres infra Vercel/Supabase), à réécrire pour Scalingo.

## 11. Information des participants

**Source.** Le document `DONNEES_CONFIDENTIALITE_V1`, publié le **2026-07-16**,
versionné et haché (`registre.ts`, hash `b4a5551b…`). Les acquittements sont
tracés (`TrustAcknowledgement`), les choix aussi (`TrustChoiceEvent`).

**TROU — partiellement comblé le 2026-08-19.** L'information délivrée aux
personnes **sur l'écart d'hébergement** — le fait que les données sont
hébergées hors d'un hébergeur certifié HDS pendant la phase de test — n'était
**consignée nulle part** : ni sa date, ni sa forme, ni son contenu, ni la
modalité de retrait. C'est la première recommandation de la décision du
responsable du 2026-07-21 (« Tracer l'information délivrée »), et elle porte
la moitié de l'argumentaire qui autorise la phase de test.

**Ce qui est consigné**, sur déclaration du responsable de traitement rendue
en session le 2026-08-19 — **cette déclaration est la seule source ; il
n'existe aucune trace au dépôt de l'information elle-même** :

- **Forme** : orale, en consultation.
- **Contenu** : l'écart d'hébergement — les données sont hébergées hors d'un
  hébergeur certifié HDS pendant la phase de test.
- **Période, telle que déclarée** : en continu, « depuis la souscription HDS
  Scalingo ». **Cet ancrage n'est pas une date établie** : le dépôt refuse de
  tenir cette souscription pour acquise (« une souscription inférée n'est pas
  une preuve produite », `docs/claude/propositions/2026-07-24-audit-migration-hds/RUNBOOK_MIGRATION_SCALINGO.md`), et `D-047` puis
  `D-078` rappellent qu'**aucune option HDS n'est active tant que l'annexe
  n'est pas signée**. Le staging HDS a été provisionné le 2026-07-24 — cette
  date **date le staging, pas l'information**.

**Ce qui reste ouvert dans ce trou, et n'est donc pas comblé** :

- la **date de délivrance** — une période déclarée « en continu » n'en est
  pas une, et le point de départ n'est pas établi (ci-dessus) ;
- la **modalité de retrait**, qui n'a pas été consignée ;
- l'**absence de trace écrite par participant** : aucun acquittement
  individuel ne porte cette information — le dispositif TRUST couvre
  `DONNEES_CONFIDENTIALITE_V1`, qui ne mentionne pas l'écart HDS ;
- le **périmètre des personnes couvertes** : la déclaration ne dit pas si les
  personnes vues avant le point de départ ont été informées.

**Ce qui reste dû — et `D-078` l'aggrave.** La décision du 2026-08-19 (gate
levé par écart assumé, migration engagée sans attendre l'annexe, fenêtre de
moindre couverture acceptée) change la nature de l'écart : l'information
délivrée jusqu'ici décrit un état antérieur. Elle est donc **à renouveler**,
et un support durable est préparé pour validation du responsable :
`docs/claude/campagnes/2026-08-18-echeance-hds-g-trust-04/sources/brouillon-information-hebergement-v2.md`.
Sa publication (v2 du document versionné, re-acquittement éventuel) est un
geste TRUST distinct, hors de ce dossier.

## 12. Hébergement — écart assumé et daté

**Source.** Ni Supabase ni Vercel ne figurent à l'annuaire ANS des hébergeurs
certifiés HDS — établi le 2026-07-21, sur 404 hébergeurs recensés. Le
responsable du traitement a néanmoins autorisé une phase de test avec des
personnes réelles, **décision datée du 2026-07-21**, **bornée au 2026-10-21**,
« sans reconduction écrite, la règle du dépôt reprend »
(`CHECKLIST_ACTIVATION_G_TRUST_04.md`, relayée par
`docs/claude/REGISTRE_FRONTIERES.md` §1).

Une migration vers **Scalingo** (certifié HDS) est décidée (D-006, 2026-07-28 ;
confirmée par D-037, 2026-08-09) ~~et non exécutée~~ — **exécutée pour les
données le 2026-08-22** (bloc « État au 2026-08-22 » ci-dessous) ; cutover DNS
et décommissionnement restants. ~~Elle est subordonnée, dans
l'ordre : accord de sous-traitance **en vigueur et archivé** (D-037 : la pièce
s'archive, elle ne s'e-signe pas — et elle n'est pas au dossier au 2026-08-09),
puis confirmation écrite du périmètre HDS de la région cible, puis seulement
données réelles.~~ **Les cinq réserves de D-006 restent entières**, dont la (3),
confirmation DPO — elle-même suspendue à la contradiction DPO de la rubrique 1.

**État au 2026-08-19 — deux décisions ont modifié cet ordre, sans le rendre
caduc :**

- **`D-047` (2026-08-11)** : la confirmation écrite du périmètre HDS de
  `osc-fr1` est **obtenue** — par la **réponse écrite de Scalingo du
  2026-08-11** (rubrique 6), et non par le certificat LNE n° 38436-2, qui ne
  nomme aucune région et ne suffirait donc pas. En
  revanche, la lecture de `D-037` (« la pièce s'archive, elle ne s'e-signe
  pas ») est **démentie par le fournisseur** : le DPA et une **annexe HDS
  distincte** se signent séparément.
- **`D-078` (2026-08-19)** : le gate G-TRUST-04 est **levé par arbitrage du
  responsable** — écart assumé, **pas** mise en conformité : l'état des sept
  exigences est inchangé (une ❌, six partielles, aucune ✅), le gate est levé
  **malgré** cet état. La **migration est engagée sans attendre la signature
  de l'annexe**. Point accepté sciemment, à garder lisible : entre la bascule
  et cette signature, les données réelles ne sont couvertes **ni** par la
  dérogation en vigueur — qui vise l'implantation Vercel — **ni** par une
  option HDS active ; sur cette fenêtre, la posture est **moins couverte
  qu'avant la migration**. Le **décommissionnement** de Vercel/Supabase reste
  subordonné à la signature (seul geste irréversible). **La date de revue est
  inchangée : 2026-10-21.**

**État au 2026-08-22 — la bascule des données a eu lieu.** Le chargement des
données réelles vers Scalingo (app `wellneuro`, région `osc-fr1`,
`--hds-resource`, add-on PostgreSQL Business) s'est achevé le **2026-08-22 à
03:24:09 CEST** (dump de la source le même jour à 02:13 CEST). Comptes
vérifiés conformes à la référence figée côté source — dont 19 patients et 118
réponses de questionnaires ; déroulé et leçons :
`docs/claude/propositions/2026-07-24-audit-migration-hds/RUNBOOK_MIGRATION_SCALINGO.md`,
section « Ce que l'exécution de la migration des données a appris ».
**La fenêtre de moindre couverture de `D-078` est ouverte depuis cette date.**
Elle se ferme par la signature de l'annexe HDS (pendante — demandée le
2026-08-12, relancée le 2026-08-19, sans réponse au 2026-08-22) ou se rejuge à
la revue du 2026-10-21. ~~Le **cutover DNS n'est pas fait** — le service aux
personnes reste rendu par Vercel/Supabase — et le **décommissionnement reste
interdit** jusqu'à la signature.~~

**Cutover fait le 2026-08-22 au matin.** La bascule DNS
(`app.wellneuro.fr` → `wellneuro.osc-fr1.scalingo.io`, TTL 300 s) est
constatée propagée avec certificat TLS émis vers **04:05 CEST** ;
`NEXTAUTH_URL` alignée et portée par un redémarrage à **09:53 CEST** (la
boucle OAuth praticien vérifiée sur le domaine) ; l'envoi SMTP validé en
production à **10:16 CEST** (`250 OK`, après correction de l'identifiant —
fournisseur : Google Workspace, rubrique 6). Depuis, **le service aux
personnes est rendu par Scalingo** ; Vercel et Supabase sont gardés chauds
comme filet de retour. **Le décommissionnement est reprogrammé par `D-080`**
(2026-08-22) : fenêtre de stabilité de dix jours, puis décommissionnement au
**2026-09-01**, annexe signée ou non — la subordination de `D-078` est levée
à cette date, la preuve d'effacement écrite reste due.

**Ce n'est pas une conformité. C'est un écart assumé, compté et daté** — et
`D-078` l'élargit sans en changer le terme ; depuis le 2026-08-22, il n'est
plus une intention mais un état de fait, daté à la minute.

**Annexe HDS signée le 2026-08-30** — déclaration du responsable, consignée
le 2026-08-31 (`D-121`) : **la fenêtre de moindre couverture de `D-078` est
fermée**, et l'écart ci-dessus cesse d'être un écart. Le même soir, le
responsable a **validé expressément l'exécution du décommissionnement**
(`D-120`, anticipation d'un jour actée sur le terme de `D-080`) : gestes
réversibles d'abord (domaine détaché du projet Vercel, intégration GitHub
déconnectée), suppressions ensuite — projet Vercel puis projet Supabase gelé.
**La preuve d'effacement écrite de chaque suppression se consignera ici, au
moment du geste** (écran de confirmation daté, e-mail du fournisseur,
confirmation d'effacement des backups) ; tant que cette entrée n'existe pas,
les suppressions ne sont pas faites.

**Suppression du projet Supabase — faite le 2026-09-01, entre 00:12 et
00:18 CEST.** Geste du responsable, par le CLI Supabase depuis son propre
terminal (après authentification `supabase login`), conformément à `D-080`
(« geste du responsable ») et `D-120`. Préflight santé rejoué le jour même —
le terme exact de `D-080` — à 00:14 CEST : production Scalingo
`running`/`HDS=true`, deux conteneurs web, DNS exclusivement Scalingo,
service HTTP sain. **Preuve écrite** : transcript avant/après de la session
d'assistance, archivé hors dépôt par le responsable — à 00:12, le connecteur
listait l'**unique** projet de l'organisation `dshxeplvjhhbkxnllwdd`
(`Wellneuro-app`, ref `ohnbmypinamzzfhqymlt`, eu-central-1,
`ACTIVE_HEALTHY`) ; à 00:18-00:20, **deux canaux indépendants** (CLI
authentifié sur la même organisation, et connecteur de session) renvoient
zéro projet et la ref ne résout plus. Aucune capture d'écran ni e-mail
capturés au moment du geste : le transcript biface tient lieu de preuve
écrite principale. **Restent dus** : la confirmation écrite par le support
Supabase de l'effacement des backups automatiques (demande à envoyer),
l'archivage de tout e-mail de confirmation reçu, et la **partie Vercel** du
décommissionnement (détacher le domaine, déconnecter GitHub, supprimer le
projet — preuve à consigner ici au moment du geste).

**Suppression du projet Vercel — faite le 2026-09-01, constatée à
00:39 CEST.** Gestes du responsable au dashboard, dans l'ordre prévu par
`D-120` : domaine `app.wellneuro.fr` détaché, intégration GitHub déconnectée
(fin des déploiements fantômes constatés depuis le ~2026-08-28), puis
suppression du projet `wellneuro-app`
(`prj_9sg8HgiCvxQfZiULTnmXIaU5c12k`). **Vérification indépendante au même
moment** : l'équipe Vercel du compte ne contient plus aucun projet.
Transcript archivé hors dépôt par le responsable, avec celui de Supabase.
**Le décommissionnement `D-080` est intégralement exécuté.** Il ne reste, au
titre de la preuve, que la confirmation écrite d'effacement des backups
automatiques Supabase (demande au support à envoyer, réponse à archiver et à
référencer ici).

## 13. Analyse d'impact (AIPD)

**TROU.** Aucune AIPD n'existe. Elle est listée comme réserve à lever dans
D-006 et dans `CHECKLIST_FINALISATION.md:67`. Un traitement de données de santé
à grande échelle ou systématique en requiert une ; savoir si l'expérimentation
actuelle franchit ce seuil est une question de conseil qualifié, pas de dépôt.
**Elle n'est pas rédigée ici**, et ce document ne doit pas être confondu avec
elle.

## 14. Récapitulatif des trous

| # | Rubrique | Ce qui manque | Porteur | Échéance | Où la réponse se consignera |
|---|---|---|---|---|---|
| 1 | Responsable | Identité juridique exacte | Responsable | 2026-10-21 | ici, rubrique 1 |
| 1 | Responsable | Contradiction DPO (G-TRUST-02 vs D-005) | Responsable | 2026-10-21 | `docs/DECISIONS.md` |
| 3 | Base légale | Qualification, non rédigée à ce jour | Conseil qualifié | 2026-10-21 | ici, rubrique 3 |
| 4 | Personnes | Cas des mineurs | Responsable | 2026-10-21 | `SOURCES_ET_VALIDATIONS.md` |
| 6 | Sous-traitants | Aucun DPA archivé — forme connue depuis la réponse du 2026-08-11 (DPA + annexe HDS distincte, signature séparée requise) mais ~~**signature et archivage non faits**~~ — **annexe HDS signée le 2026-08-30** (déclaration du responsable, consignée le 2026-08-31, `D-121`) ; **restent dus : l'archivage du document signé, et la signature + archivage du DPA** | Responsable | ~~avant bascule Scalingo~~ — ordre suspendu par `D-078` : **dès réception de l'annexe** (demandée 2026-08-12, relancée 2026-08-19 — **canal et dates vérifiés au fil le 2026-08-20**, rubrique 6 ; **signée le 2026-08-30**) ; ~~en tout état de cause **avant tout décommissionnement**~~ — **plus depuis `D-080`** (2026-08-22) ; archivage dû **avant la revue du 2026-10-21** | `CHECKLIST_FINALISATION.md` §F |
| 6 | Sous-traitants | ~~Périmètre HDS de la région `osc-fr1` non confirmé~~ — **répondu par écrit le 2026-08-11** : couvert, activités 5 et 6 incluses | Responsable | fermé | ici, rubrique 6 |
| 6 | Sous-traitants | ~~Fournisseur SMTP réel non identifié~~ — **identifié le 2026-08-22 : Google Workspace** (rubrique 6, TROU 2 — SPF/MX/DKIM du domaine + expéditeur du code) ; **restent dus** : localisation du traitement et couverture DPA | Responsable | 2026-10-21 | ici, rubrique 6 |
| 6 | Sous-traitants | ~~Sentry non déclaré au patient~~ — **déclaré le 2026-09-07** dans `donnees_confidentialite@v5` (`D-141`), résidence UE rendue invariante par `sentryRegion.ts` ; **reste dû : le DPA Sentry** | Responsable | 2026-10-21 (DPA seul) | `contenus/registre.ts`, rubrique 6 |
| 7 | Transferts | Mécanisme invoqué (CCT/DPA) | Conseil qualifié | 2026-10-21 | ici, rubrique 7 |
| 8 | Conservation | Durées des données de santé | Responsable + conseil | 2026-10-21 | ici, rubrique 8 puis `gouvernance.ts` |
| 9 | Droits | Délai, vérification d'identité, circuit interne | Responsable | 2026-10-21 | ici, rubrique 9 |
| 10 | Sécurité | Pentest / revue externe | Prestataire à engager | 2026-10-21 | checklist du gate, exigence 7 |
| 10 | Sécurité | Registre physique des violations (EX-3) | Responsable | 2026-10-21 | `PROCEDURE_VIOLATION_DONNEES.md` |
| 10 | Sécurité | Preuve fonctionnelle de la piste d'audit | Responsable | ~~premier dossier ouvert~~ — **échéance dépassée** : des dossiers réels sont ouverts et utilisés (`D-075`, 2026-08-18), la production porte des passations (`D-077`) ; la preuve reste à produire, échéance reportée au 2026-10-21 | checklist du gate, item 4 |
| 11 | Information | ~~Information sur l'écart HDS non consignée~~ — **partiellement consignée le 2026-08-19** (forme orale et contenu, sur déclaration du responsable, rubrique 11). **Reste dû** : renouvellement après `D-078`, qui change la nature de l'écart — brouillon de support prêt, publication = geste TRUST distinct | Responsable | ~~**avant la bascule Scalingo** (c'est elle qui ouvre la fenêtre de moindre couverture, `D-078` §3)~~ — **échéance dépassée le 2026-08-22** : la bascule des données a eu lieu (03:24 CEST, rubrique 12) **sans** que le renouvellement soit publié. Relevé le jour même, pas découvert après coup ; à rattraper **au plus tôt**, en tout état de cause avant le 2026-10-21 | ici, rubrique 11 |
| 11 | Information | **Date de délivrance non établie** et **modalité de retrait non consignée** — deux des quatre composantes du trou d'origine ; la période déclarée (« en continu depuis la souscription HDS ») ne fournit pas de point de départ tenu pour établi par le dépôt | Responsable | 2026-10-21 | ici, rubrique 11 |
| 11 | Information | **Aucune trace écrite par participant** de l'information sur l'écart HDS — aucun acquittement individuel ne la porte ; périmètre des personnes couvertes non établi | Responsable | 2026-10-21 | ici, rubrique 11 |
| 13 | AIPD | Absente | Conseil qualifié | 2026-10-21 | document dédié |

L'échéance par défaut est le **2026-10-21**, date de revue de la dérogation :
au-delà, sans reconduction écrite, la règle du dépôt reprend et la phase de test
avec des personnes réelles n'est plus couverte.

---

## Ce que ce dossier ne fait pas

- Il **ne lève pas** le gate G-TRUST-04.
- Il **ne qualifie pas** de base légale et **ne cite aucun article** du RGPD à
  l'appui d'une conformité.
- Il **ne remplace pas** l'AIPD.
- Il **n'invente aucune durée de conservation** : celles qui manquent sont
  marquées comme manquantes.
- Il **ne tranche pas** la contradiction sur le DPO ; il l'expose.

Voir aussi : `docs/PROCEDURE_VIOLATION_DONNEES.md` (violations),
`docs/securite_rgpd.md` (hygiène du dépôt),
`docs/claude/campagnes/2026-07-15-trust-information-patient-droits-v1/CHECKLIST_ACTIVATION_G_TRUST_04.md`
(gate et exigences).
