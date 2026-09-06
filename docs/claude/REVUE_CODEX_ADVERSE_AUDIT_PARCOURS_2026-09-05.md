# Contre-revue adverse de l’audit du parcours patient ↔ praticien

Date : 2026-09-05. Cible : les 23 affirmations du prompt `PROMPT_CONTRE_REVUE_CODEX_AUDIT_PARCOURS_2026-09-05.md`.

**Verdict de cadrage : ne pas utiliser l’audit en l’état pour commander les lots.** Deux affirmations de niveau 1 sont réfutées. Un chemin de confirmation peut annoncer le succès d’une sélection qui n’a pas été enregistrée : **P0 proposé selon la définition du prompt**, confirmé par lecture du chemin complet, sans incident de production établi.

La revue porte sur le code à `87f7f8eb`, HEAD du dépôt inspecté. La comparaison avec `2de210e1` ne change dans `web/src` que deux routes de biologie étrangères aux contre-exemples ci-dessous. Les décisions sont citées dans leur état à `87f7f8eb`. Les références `web/…:ligne` et `docs/…:ligne` sont relatives à `/Users/wellneuro/Developer/Wellneuro-app`.

`CONFIRMÉE` signifie ici « chemin lu de bout en bout », conformément au prompt. Les scénarios d’écriture décrits ne sont pas des requêtes exécutées. Aucun test, envoi, accès à la base, migration, changement de code, commit ou push n’a été effectué. Aucun fichier `.env` n’a été lu. Seul ce fichier de restitution a été créé.

L’artefact complet de 283 interactions, 106 constats, 118 objets non vivants et 27 propositions n’a pas été fourni ni retrouvé. Une demande de localisation est restée sans réponse pendant la passe. Cela ne bloque pas la contre-revue des affirmations autoportantes ; cela interdit de fabriquer les échantillons et rapprochements qui exigent ces listes.

## 1. Tableau des verdicts

| ID | Énoncé court | Verdict | Motif |
|---|---|---|---|
| N1.1 | Toute la chaîne aval est inaccessible | **RÉFUTÉE** | La sélection manque bien, dette D-058 déjà nommée ; elle n’explique ni les neuf tables ALLIANCE de D-112 ni l’absence d’objectif négocié, dont le producteur est indépendant. |
| N1.2 | Aucun P0 | **RÉFUTÉE** | Deux confirmations divergentes du même épisode peuvent réussir alors que seule la première est persistée ; voir K1. |
| N1.3 | Dateline complète | **NON VÉRIFIABLE** | Les 125 routes, 32 pages et 80 modèles sont recomptés ; les 283 événements à comparer manquent. |
| N1.4 | Gabarit conforme malgré le bilan HTML | **AFFAIBLIE** | Le registre précise explicitement que son gabarit est le corps texte ; le transport de santé dans le HTML demeure établi. |
| N1.5 | Confidentialité v3 fausse sur Google patient | **RÉSISTE** | La v3 courante du code contient la phrase ; la page publique propose effectivement Google pendant cette passe. |
| N1.6 | Révocation sans surface, annulée en silence | **AFFAIBLIE** | Le menu et la confirmation de révocation existent ; la réouverture silencieuse subsiste, sans réactiver les anciennes sessions invalidées. |
| N2.1 | Faux succès SMTP | **ÉLARGIE** | Les six chemins nommés avalent l’échec ; un septième existe et le journal d’erreur n’est pas garanti. |
| N2.2 | Portail terminé sans issue | **AFFAIBLIE** | Le pied de page conduit aux Informations, puis à Mon espace ; l’absence d’appel principal persiste. |
| N2.3 | Date de clôture substituée à la mesure | **RÉSISTE** | L’historique d’équilibre consomme la date de la réponse de clôture ; les nuits sont conservées ailleurs mais ne corrigent pas cette lecture. |
| N2.4 | Ancre de consultation posée par le patient | **RÉSISTE** | La validation patient écrit la date ensuite utilisée pour écarter les réponses antérieures de l’inbox. |
| N2.5 | Dossier invisible après 30 jours | **AFFAIBLIE** | Il sort des signaux automatiques visés, mais reste dans la liste Patients et ses recherches. |
| N2.6 | Aucun appel au geste d’objectif négocié | **RÉSISTE** | Les mécanismes proactifs cités ne le lisent pas ; le panneau manuel existe indépendamment. |
| N2.7 | Seuils patient dans le composant | **RÉSISTE** | Les bandes 70/40 sont locales ; la jauge est bien un choix maintenu par D-106, pas une nouvelle anomalie. |
| N2.8 | Correction silencieuse en échec | **RÉSISTE** | Ni le gestionnaire du clic ni son parent ne rendent l’échec de cette demande. |
| N2.9 | Confirmation présentée comme non persistante | **RÉSISTE** | Le libellé contredit l’upsert introduit par D-118. |
| N2.10 | Deux J21 se confondent | **ÉLARGIE** | A1 autorise les deux objets, mais le Fil les rapproche par patient sans cycle et peut supprimer une attente du cycle suivant. |
| N2.11 | Tous les envois suivent un clic praticien | **RÉFUTÉE** | Le compte 8 modules/9 appels est exact ; accusé patient, demande de lien et signalement TRUST constituent des contre-exemples. |
| N3.1 | 118 objets réellement sans client | **NON VÉRIFIABLE** | La liste des 118 manque : aucun tirage de dix objets appartenant à cette population n’est possible. |
| N3.2 | Silences et machines à états exacts | **NON VÉRIFIABLE** | Les transitions déclarées sans surface ne sont pas fournies. |
| N3.3 | 27 propositions respectant les invariants | **NON VÉRIFIABLE** | Le texte des propositions et de leurs migrations/gates manque. |
| N3.4 | F-096 et F-103 réfutés à juste titre | **AFFAIBLIE** | Les contre-exemples littéraux existent ; un hash de sources ne prouve pas que tout contenu 6.0-A/B est verrouillé. |
| N3.5 | F-031/F-030/F-007 seuls non adressés | **NON VÉRIFIABLE** | Ni les constats complets ni leur matrice de couverture ne sont disponibles. |
| N3.6 | Méthode couvrant les frontières | **AFFAIBLIE** | Les extraits présentent des erreurs de raccordement démontrables ; la corrélation des lecteurs reste une hypothèse, faute de leurs traces. |

## 2. Affirmations réfutées, affaiblies ou élargies

### N1.1 — RÉFUTÉE · CONFIRMÉE

**Le blocage local existe.** `web/src/components/patient-cockpit/ProtocolMiniBuilder.tsx:100` refuse le constructeur sans `selectedMainPriority`. Les deux constructions de la route cockpit passent `selectionPraticien: null` (`web/src/app/api/praticien/cockpit/route.ts:429`, `:603`). Le repli sur la priorité proposée (`web/src/components/patient-cockpit/ClinicalRuntimeSection.tsx:942`) alimente la re-passation ciblée ; il ne sélectionne pas la priorité du protocole.

La recherche des constructeurs, du symbole `selectionPraticien`, des écritures de `selectedMainPriority` et des clients `/api/praticien/protocoles` n’a pas établi de surface normale qui complète ce geste. Le producteur de validation ergonomique est explicitement interdit en production (`web/src/lib/clinical-engine/validationErgoFixture.ts:86` ; `web/src/app/api/dev/validation-ergo/route.ts:29`). Le client visible sauvegarde via `/protocoles/versions` (`ClinicalRuntimeSection.tsx:994`).

**Ce fait n’est pas une découverte.** D-058, amendement du 2026-08-14, le nomme déjà dans `docs/DECISIONS.md:4765` :

```text
4767  la sélection praticien d'une priorité (`selectedMainPriority`) n'a
4768  aucun producteur — la re-passation vise la priorité proposée tant qu'il
4769  n'existe pas
```

**L’inférence qui commande le cadrage est fausse.** Les neuf tables vides de D-112 sont celles de la campagne ALLIANCE : objectifs, propositions, ratifications, amendements et réponses d’étape (`docs/DECISIONS.md:576`). Ce ne sont pas neuf tables en aval du constructeur de protocole. Le chemin `FichePatientPanel → ObjectifNegociePanel → POST /api/praticien/objectifs` crée l’objectif indépendamment d’une priorité sélectionnée et d’un protocole (`web/src/components/FichePatientPanel.tsx:1269` ; `web/src/app/api/praticien/objectifs/route.ts:32`). Le geste demandé par D-112 demeure donc possible ; la sélection manquante ne le disqualifie pas.

D-118 du 2026-08-28 a, de plus, rendu persistant l’épisode dès la confirmation : clic → POST cockpit → `assessmentEpisode.upsert` → relecture de trajectoire (`ClinicalRuntimeSection.tsx:764`, `:817` ; route cockpit `:657`). D-118 nomme explicitement l’état « confirmé sans protocole » comme sain (`docs/DECISIONS.md:254`). La présence de panneaux Météo/J21 dans le rendu (`ClinicalRuntimeSection.tsx:1552`) n’établit toutefois pas que leurs données existent ou qu’un check-in est soumettable.

Enfin, `POST /api/praticien/protocoles` est un point d’écriture authentifié réel : appartenance → préconditions → recalcul de chaîne → transaction (`web/src/app/api/praticien/protocoles/route.ts:131`, `:160`, `:176`, `:192`). `verifierChaineC1` recalcule la sélection soumise (`web/src/lib/clinical-engine/verifierChaineC1.ts:140`). Cela ne constitue pas la preuve d’un client UI. Autre distinction de stockage : le journal alimentaire peut créer son propre instantané dans `protocol_drafts`, sans épisode clinique (`web/src/lib/food-observation/persistence.ts:191`). Une ligne de cette table ne prouverait donc pas, seule, un protocole clinique diffusé.

**Portée du verdict :** réfutation de la cause unique et de l’absolu « tout l’aval », pas démonstration que le parcours normal de création puis diffusion du protocole fonctionne. Aucun protocole clinique réellement enregistré en production n’a été établi pendant cette passe.

### N1.2 — RÉFUTÉE · CONFIRMÉE

Le contre-exemple K1 ci-dessous est une **écriture de confirmation perdue sous une réponse de succès**, catégorie explicitement proposée comme P0 dans le prompt. Le serveur calcule et renvoie la seconde décision tout en gardant la première en base. Aucun franchissement d’appartenance n’est nécessaire.

Les trois pistes suggérées ne doivent pas être amalgamées à ce défaut :

- **Packs globaux :** authentification puis lecture/édition d’un catalogue de cabinet (`web/src/app/api/praticien/packs/route.ts:235`, `:350` ; `web/prisma/schema.prisma:164`). L’absence de `praticienEmail` ne démontre pas une lecture de dossier d’un autre praticien. Pas de P0 démontré sur cette piste.
- **Soumission patient non atomique :** autorisation d’assignation, vérification annulation/verrou, création de réponse, puis verrouillage (`web/src/app/api/patient/submit/route.ts:100`, `:135`, `:144`, `:310`, `:326`). Deux requêtes qui passent le verrou avant son écriture peuvent créer deux réponses. Une panne entre les écritures laisse une réponse enregistrée avec une erreur HTTP (`:344`), et non une réponse effacée sous succès. **P1 proposé pour le scénario concurrent d’intégrité**, sans faire passer la seule absence de transaction pour un P0 démontré.
- **Append-only :** D-111 permet expressément plusieurs déclarations pour un même objectif et jalon (`docs/DECISIONS.md:686`). Un second geste légitime et le rejeu réseau du même geste ne sont pas équivalents. L’absence de clé d’idempotence ne démontre pas, seule, une perte de données. Une unicité patient/objectif/jalon contredirait cette décision.

Le service d’effacement a été lu jusqu’aux contrôles résiduels (`web/src/lib/patient/effacement.ts:38`). Ses suppressions sont transactionnelles ; aucun contre-exemple d’effacement partiel n’a été établi. Cela ne transforme pas cette passe ciblée en certification générale de sécurité.

### N1.4 — AFFAIBLIE · CONFIRMÉE

Le commentaire du registre répond explicitement à la question de portée. Extrait lu dans `web/src/lib/correspondance/registreGabarits.ts` :

```text
238  // Seul gabarit à double corps : ce texte est le corps `text`, le corps
239  // `html` est le booklet rendu (`buildBookletHTML`), gardé ailleurs
240  // (carte des chemins sortants, `documents/vocabulaire.ts`).
248  donneesSante: { statut: 'conforme' },
```

Le registre n’affirme donc pas sans distinction que le MIME complet est exempt de santé. L’audit doit retirer cette assimilation entre le texte enregistré et le message complet.

Le risque résiduel est concret : synthèse validée appartenant au praticien → narratif et note du praticien → `buildBookletHTML` → `sendMail({text, html})` au destinataire patient (`web/src/app/api/praticien/booklet/route.ts:166`, `:198`, `:269` ; `web/src/lib/documents/bookletHtml.ts:49`, `:89`, `:94`). L’échappement HTML protège le rendu ; il ne retire pas le contenu de santé. Le transport est configuré par `SMTP_URL` (`booklet/route.ts:253`).

Les recherches croisées bilan/booklet, e-mail/email, SMTP et données de santé dans les décisions et `docs/securite_rgpd.md` n’ont pas établi d’exception datée autorisant ce contenu au regard de la règle générale du registre. Les décisions de diffusion du bilan ne suffisent pas à prouver une telle exception. **P1 de gouvernance à conserver**, avec un périmètre précis : transport du bilan et déclaration applicable au message complet. Aucun destinataire non autorisé ni défaut contractuel du relais n’est démontré ; les métadonnées nécessaires du prestataire n’ont pas été inspectées.

### N1.6 — AFFAIBLIE · CONFIRMÉE

La surface existe quatre lignes après la plage où l’audit s’est arrêté. Extrait de `web/src/components/ui/PatientRow.tsx` :

```text
105  id: 'revoke',
106  libelle: 'Révoquer l’accès',
107  onSelect: agir('revoke'),
```

Chemin complet : menu → demande de confirmation dans `web/src/components/PatientsPanel.tsx:619` → action confirmée `:583` → requête DELETE `:464` → transaction de révocation (`web/src/app/api/praticien/token/route.ts:187`). Le fait « aucune surface » est faux.

La levée silencieuse est réelle : action de renvoi → POST token → `accessTokenRevoked: false` (`PatientsPanel.tsx:616` ; route token `:122`) ; nouvelle consultation → même remise à false (`web/src/app/api/praticien/consultations/route.ts:158`). Le DTO Patients ne donne pas l’état de révocation (`web/src/app/api/praticien/patients/route.ts:43`). Les confirmations ordinaires du parcours ne signalent pas cette conséquence de sécurité ; le journal des envois n’est pas une trace dédiée de levée de révocation.

**Contrepoids lu :** DELETE pose aussi `sessionsInvalidesAvant` et rend indisponibles les liens magiques encore ouverts (`token/route.ts:191`, `:195`). Le validateur de session contrôle date et révocation (`web/src/lib/patient-session.ts:91`). Le renvoi ne supprime pas cette borne : une ancienne session ou un ancien lien invalidé ne reprend pas vie. La réouverture permet une nouvelle entrée.

**P1 maintenu**, pas P0 démontré. RP-11 est une cible (`docs/RELATION_PRATICIEN_PATIENT_SOURCE.md:372`), donc le présenter comme violation d’une garantie déjà livrée serait incorrect. Le déficit de signalement de la réouverture reste observable indépendamment de ce statut.

### N2.1 — ÉLARGIE · CONFIRMÉE

Les six branches nommées ont été suivies jusqu’à leur réponse HTTP :

| Action | Chemin d’échec et réponse |
|---|---|
| Création de consultation | `web/src/app/api/praticien/consultations/route.ts:177` : exception d’envoi absorbée, succès de la route. |
| Lien magique praticien | `web/src/app/api/praticien/token/route.ts:108` : exception absorbée puis succès. |
| Renvoi/émission d’accès | Même route `:128` : exception absorbée puis succès `:137`. |
| Assignation de pack | `web/src/app/api/praticien/packs/assign/route.ts:278` : exception absorbée. |
| Assignation unitaire | `web/src/app/api/praticien/assignations/route.ts:214` : exception absorbée. |
| File d’envoi | `web/src/app/api/praticien/file-envoi/envoyer/route.ts:207` : exception absorbée. |

Chemin commun : création ou mise à jour métier → tentative SMTP → capture/log de l’échec → réponse qui ne distingue pas suffisamment l’enregistrement de la livraison. **Le succès de l’écriture métier n’est pas mensonger ; l’utiliser comme confirmation de livraison l’est.**

Septième chemin : `POST /api/patient/submit` appelle l’accusé après persistance, absorbe son échec (`web/src/app/api/patient/submit/route.ts:331`) puis renvoie `ok` (`:343`). Ici le succès atteste correctement la remise du questionnaire ; il ne prouve pas la remise de l’accusé. Ce chemin contredit néanmoins l’inventaire limité aux six actions et aux clics praticien.

**Le journal constitue un contrepoids réel mais incomplet.** Le helper d’accès tente `Erreur` puis relance l’exception (`web/src/lib/consultation/email.ts:34`). Les helpers d’assignation, de pack et de file font de même (`assignations/route.ts:347` ; `packs/assign/route.ts:342` ; `file-envoi/envoyer/route.ts:276`). Sans SMTP configuré, ils peuvent enregistrer `Non_envoye` et revenir sans exception. Surtout, l’écriture du journal absorbe sa propre panne (`web/src/lib/correspondance/patient.ts:33`). « Une ligne Erreur existe dans tous les cas » est donc faux comme garantie de code.

Le lecteur existe : API de correspondance (`web/src/app/api/praticien/correspondance-medecin/route.ts:241`) → panneau (`web/src/components/correspondance/CorrespondanceMedecinPanel.tsx:54`) → libellés Envoyé/Échec d’envoi/Non envoyé (`:175`). Le défaut n’est pas une absence totale de visibilité : il faut ouvrir une autre surface, et encore faut-il que le journal ait réussi.

Le livret renvoie une erreur à son appelant en cas de panne (`booklet/route.ts:285`), sans garantie générale d’une ligne `Erreur` pour toute exception SMTP. La relance d’agenda écrit l’échec puis répond 502 (`web/src/app/api/praticien/agenda-sommeil/relance/route.ts:256`). Aucun e-mail n’a été envoyé pour cette vérification.

### N2.2 — AFFAIBLIE · CONFIRMÉE

La branche « tout transmis » n’offre effectivement pas le bouton de retour principal attendu (`web/src/app/portail/[token]/page.tsx:528`). Mais elle reste dans le layout portail, qui rend le pied de page (`web/src/app/portail/layout.tsx:26`).

Chemin complet : racine terminée → **Informations** dans `web/src/components/patient/trust/PiedDePageInformations.tsx:8` → `/portail/[token]/informations` → **Mon espace** (`web/src/app/portail/[token]/informations/page.tsx:107`) → hub questionnaires → accès au bilan (`web/src/app/portail/[token]/questionnaires/page.tsx:272`) et aux surfaces du parcours.

La même construction fonctionne avec le segment de session utilisé par les nouvelles entrées. Aucun favori ni URL inventée n’est nécessaire. La portée se réduit donc d’une impasse à une navigation principale déficiente : deux liens visibles permettent de rejoindre le hub. Chemin statique confirmé ; aucun clic dans une session patient n’a été exécuté.

### N2.5 — AFFAIBLIE · CONFIRMÉE

Chemin du trou de signalement : validation patient → pack de base sans échéance (`web/src/lib/consultation/assignBasePack.ts:77` ; `web/src/app/api/portail/valider/route.ts:166`) → exclusion des cartes de retard faute de `dateLimite` (`web/src/lib/fil/cartes.ts:357`) → absence de carte de reprise faute de première réponse (`:383`) → sortie de la fenêtre des nouveaux dossiers (`web/src/app/api/praticien/nouveaux-patients/route.ts:23`, `:50`).

La troisième surface est la liste Patients : sa requête n’applique pas cette limite d’âge (`web/src/app/api/praticien/patients/route.ts:209`) et le praticien peut retrouver le dossier par recherche et consulter ses assignations en attente dans `web/src/components/PatientsPanel.tsx`.

**Portée restante :** perte de rappel automatique après la fenêtre de 30 jours pour un dossier sans réponse ni échéance, et non disparition du dossier du produit. La recherche manuelle ne réfute pas ce défaut de rappel ; elle réfute l’absolu « invisible ».

### N2.10 — ÉLARGIE · CONFIRMÉE

Deux calendriers distincts sont voulus : A1, daté du 2026-07-12, les sépare et réserve leur rapprochement au résumé J21 (`docs/claude/REGISTRE_FRONTIERES.md:81`, `:89`). Les points d’étape partent bien de l’approbation (`web/src/app/api/portail/protocole/checkin/route.ts:73`) et utilisent ±3 jours (`web/src/lib/protocol/checkinDomain.ts:31`). Les mesures utilisent l’ancre confirmée et ±8 jours (`web/src/lib/clinical-engine/runtimeFromPrisma.ts:215` ; `web/src/lib/protocol/fenetreJalon.ts` ; `web/src/lib/equilibre/constants.ts:362`).

L’écran `web/src/components/patient-cockpit/J21DecisionPanel.tsx:45` présente les deux lectures côte à côte. Ce rapprochement, à lui seul, respecte le point de jonction autorisé ; il ne justifie pas de fusionner les calendriers.

**Le défaut plus large est dans le Fil.** La route charge les check-ins J21 sans identité de cycle et les épisodes J21 en ne sélectionnant que `idPatient` (`web/src/app/api/praticien/fil/route.ts:84`, `:88`). Elle construit un ensemble de patients ayant au moins un épisode J21, puis le transmet à `jalonsSansDecision` (`:178`). Le filtre est :

```text
web/src/lib/fil/jalonsJ21.ts:29
if (!actifs.has(c.idPatient) || patientsAvecEpisodeJ21.has(c.idPatient)) continue;
```

Scénario : un dossier a un épisode de mesure J21 du cycle T0 ; un cycle T1 existe ensuite et reçoit son propre check-in J21, sans épisode J21 de ce nouveau cycle. L’ancien épisode suffit à supprimer la carte actuelle. L’API a déjà éliminé l’information qui permettrait de distinguer les cycles ; aucun filtre ultérieur ne la rétablit. **P1 proposé : attente du cycle suivant masquée.** L’existence de ces données dans la production actuelle n’a pas été vérifiée.

En outre, la carte issue du check-in s’intitule « Jalon J21 atteint — décision attendue » (`web/src/lib/fil/cartes.ts:295`), alors qu’A1 verrouille « jalon de mesure » et « point d’étape » dans leurs domaines respectifs (`REGISTRE_FRONTIERES.md:91`). Le problème est cette substitution d’objets et de cycles, pas le choix produit d’avoir deux calendriers.

### N2.11 — RÉFUTÉE · CONFIRMÉE

Le décompte est correct : **8 modules, 9 appels effectifs**, plus un commentaire contenant le motif recherché. La sortie exacte de la recherche figure en §5.

L’affirmation sur les déclencheurs est fausse :

- Patient qui remet un questionnaire → `POST /api/patient/submit` → accusé automatique (`web/src/app/api/patient/submit/route.ts:333`, `:378`).
- Patient qui demande son lien → `POST /api/portail/lien/demande` → `sendMagicLinkEmail` (`web/src/app/api/portail/lien/demande/route.ts:187` ; `web/src/lib/consultation/email.ts:146`).
- Patient qui dépose un signalement TRUST → route signalement → notification au praticien (`web/src/app/api/portail/trust/signalement/route.ts:190`, `:206`, `:225` ; `web/src/lib/trust/notification.ts:16`).

Ces contre-exemples suffisent à réfuter « tous déclenchés par un clic praticien ». Ils ne prouvent ni rappels d’échéance, ni réessais durables, ni notifications pour chacun des événements énumérés par l’audit.

Le suivi en pull demeure un choix explicite : D-111 exclut la relance du patient (`docs/DECISIONS.md:709`). Aucun défaut produit n’est déduit de cette décision. La recherche des notifications navigateur, push, webhooks et consommateurs apparentés n’a pas établi de canal proactif supplémentaire ; le lecteur SSE retrouvé (`web/src/lib/sse/readEventStream.ts:2`) ne constitue pas un ordonnanceur. **La configuration de l’ordonnanceur Scalingo reste non vérifiée.** Elle ne peut être déclarée vide à partir du dépôt. Cela limite la sous-affirmation sur la planification sans effacer les contre-exemples certains sur les déclencheurs.

### N3.4 — AFFAIBLIE · CONFIRMÉE sur les contre-exemples locaux

**F-096 :** « aucun test n’oppose deux acteurs » est bien faux. `web/src/app/api/praticien/objectifs/route.test.ts:145` oppose la session au propriétaire du dossier, attend 403 et vérifie l’absence d’écriture. `web/src/app/api/portail/comprehension/route.test.ts:274` injecte un identifiant adverse dans le corps et vérifie que la lecture reste sur le patient de session (`:296`). Ce sont des preuves de contenu de tests, pas une exécution à deux sessions réelles.

**F-103 :** « rien n’est hash-verrouillé » est également trop absolu. La source signée est résolue dans `web/src/lib/praticien/sourceSigneeVerifiee.ts:77`, consommée et contrôlée par la route de propositions (`web/src/app/api/praticien/propositions-objectif/route.ts:644`, `:652`). Le test `web/src/lib/clinical/priorityRulesV1.test.ts:418` compare l’empreinte à une valeur figée (`:426`).

Mais **empreinte des sources** et **gel de tout contenu patient** ne se confondent pas. `web/src/lib/praticien/propositionObjectif.test.ts:351` vérifie précisément que modifier le texte d’un fragment ne change pas `hashSources`. Les tests de `DossierDeuxVoixView` vérifient certains libellés rendus (`web/src/components/patient-companion/DossierDeuxVoixView.test.tsx:66`), pas une empreinte exhaustive de tout le module.

La réfutation littérale des deux « aucun/rien » est fondée. L’étendre à « couverture adversariale complète » ou « tous les contenus de 6.0-A/B sont verrouillés » ne l’est pas. **L’affaiblissement porte sur cette portée de la réfutation**, sans reconstituer un texte original de F-103 qui n’a pas été fourni et sans prétendre que toute absence de hash constitue un défaut.

### N3.6 — AFFAIBLIE · faits CONFIRMÉS, explication de méthode PLAUSIBLE

Les erreurs présentes dans les affirmations autoportantes portent bien sur des frontières : composant versus layout en N2.2 ; menu tronqué versus gestionnaire de révocation en N1.6 ; calendrier versus cycle en N2.10 ; état affiché versus ligne persistée en K1 ; validité sélectionnée versus validité transmise en K2 ; annulation d’un lien versus preuve de connexion en K3.

Ces chemins constituent des indices concrets d’une couverture insuffisante des raccordements. **Attribuer causalement ces erreurs à onze cartographes et dix lentilles reste PLAUSIBLE** : il manque leurs instructions, sorties, échanges et la liste des 106 constats. Aucun taux de faux positifs, aucune corrélation statistique ni responsabilité d’un lecteur particulier ne peut être calculé.

Une seconde passe devrait suivre des scénarios complets à travers plusieurs segments : deux onglets confirmant un même épisode ; deux cycles du même dossier ; invalidation après réponse ; révocation avant première connexion ; puis relecture de chaque geste dans le portail, le Fil, la trajectoire et le journal. Le contrôle décisif est la conservation du sens des champs entre producteur et lecteur, au-delà de leur simple présence dans un inventaire.

## 3. Preuves des sept affirmations qui résistent

### N1.5 — RÉSISTE · CONFIRMÉE pour le code et l’offre publique Google

Le code définit la confidentialité v3 (`web/src/lib/trust/contenus/registre.ts:298`), publiée le 2026-09-01 (`:385`), avec la phrase exacte à `:349` : « Google — connexion sécurisée du praticien uniquement (jamais des patients) ». `getDocumentCourant` sélectionne la date de publication la plus récente (`:519`), et la page Informations appelle cette fonction pour la confidentialité (`web/src/app/portail/[token]/informations/page.tsx:83`). Le même énoncé figure dans `web/src/lib/trust/gouvernance.ts:18`.

`docs/FEATURE_FLAGS.md:41` indique une valeur ON, pas une attestation de l’état de production : cette preuve de l’audit est insuffisante. La vérification a donc porté sur la [page publique de connexion](https://app.wellneuro.fr/portail/connexion), lue sans session et sans déclencher d’authentification. Elle propose « Continuer avec Google » et le lien `/portail/google` ; la sortie figure en §5. Cette branche est conditionnée au drapeau dans `web/src/app/portail/connexion/page.tsx:32`, `:53`.

Le contre-exemple « drapeau éteint, donc constat faux » ne tient pas au moment de la passe. **Limite précise :** le contenu de la page Informations authentifiée en production et le SHA déployé n’ont pas été lus ; la version rendue est établie dans le code cible. Le bon fonctionnement de l’échange OAuth complet n’a pas été testé.

### N2.3 — RÉSISTE · CONFIRMÉE, limitée au consommateur d’équilibre

Clôture manuelle → lecture des nuits → calcul des agrégats → création d’une réponse avec `dateReponse: now` (`web/src/lib/agenda-sommeil/cloture.ts:50`, `:81`, `:115` ; équivalent alimentaire `web/src/lib/agenda-alimentaire/cloture.ts:165`). L’historique filtre et ordonne les réponses selon `dateReponse`, puis ouvre ses lectures datées à partir de ces dates (`web/src/lib/equilibre/depuisPrisma.ts:58`, `:152`, `:164`). Il ne retourne pas chercher `dateNuit` dans l’agenda.

Un agenda renseigné en août mais clôturé en septembre entre donc comme nouvelle réponse en septembre dans cette projection. **Les dates des nuits ne sont pas détruites** : la route praticien expose encore les nuits (`web/src/app/api/praticien/agenda-sommeil/route.ts:87`). L’assertion résiste pour l’historique d’équilibre, pas comme allégation de perte physique des observations. Le choix de clôturer à la main n’est pas remis en cause.

### N2.4 — RÉSISTE · CONFIRMÉE

Validation de l’anamnèse par le patient → `Consultation.dateValidation = now` (`web/src/app/api/portail/valider/route.ts:189`) → sélection comme dernière consultation validée → exclusion dans l’inbox des réponses antérieures ou égales à cette date (`web/src/lib/fil/inbox.ts:10`, `:39`). Une réponse non lue peut ainsi disparaître de cette liste lorsque le patient valide une nouvelle consultation ; le registre réel de lecture praticien ne neutralise pas ce second filtre.

Les recherches `dateValidation`, `date_validation` et des appels `consultation.create/update/upsert`, étendues aux scripts et migrations, n’ont pas établi d’autre écriture de production correspondant à une consultation effectuée par le praticien. Le contrat local le dit également (`web/src/lib/consultation/consultationPorteuse.ts:35`). Une création de colonne en migration ou une valeur de fixture ne constituerait pas un tel geste métier.

### N2.6 — RÉSISTE · CONFIRMÉE dans les mécanismes énumérés

Les recherches ont croisé `objectif`, `objectifs`, `objectifs_negocies`, `ObjectifNegocie` et les variantes négocié/negocié, puis les imports des modules du Fil, du pré-vol et des préconditions T0. Leur lecture n’a pas révélé l’appel proactif allégué manquant. Le rail calcule sa compréhension depuis la couverture scorée (`web/src/components/FichePatientPanel.tsx:747`), pas depuis l’existence d’un objectif négocié.

Le panneau manuel à `FichePatientPanel.tsx:1274` reste accessible, et l’assemblage de propositions peut suivre une confirmation sous son drapeau (`web/src/components/patient-cockpit/ClinicalRuntimeSection.tsx:817`). Ce sont des mécanismes distincts. Aucun invariant exigeant qu’un objectif négocié bloque T0 n’est inventé ici : le constat porte sur l’absence de sollicitation dans les surfaces nommées.

### N2.7 — RÉSISTE · CONFIRMÉE, qualification de la jauge conservée

Le rendu du détail appelle une fonction locale qui découpe la couverture à 70 et 40 (`web/src/components/patient/MonEquilibreDetail.tsx:17`, `:114`). La recherche des libellés et de la fonction retrouve le composant et ses tests, sans établir une table signée contenant ces bandes. L’absence de provenance signée reste donc ouverte ; une duplication DC-26 n’est pas démontrée à la place de DC-19.

L’accueil trie trois couvertures à explorer (`web/src/components/patient/MonEquilibreAccueil.tsx:99`) et passe l’indice à une jauge proportionnelle sans valeur numérique (`:111` ; `web/src/components/ui/ScoreGauge.tsx:19`, `:44`). **D-106, 2026-08-24**, maintient cette présentation et son asymétrie (`docs/DECISIONS.md:1263`, `:1280`). L’audit a raison de distinguer ce choix daté de la provenance des libellés de bandes. Aucune appréciation clinique des seuils ou de la jauge n’est portée.

### N2.8 — RÉSISTE · CONFIRMÉE

Clic de demande de correction → `fetch` → traitement uniquement si la réponse métier est positive → `finally` qui retire l’état d’attente (`web/src/components/patient/ConsultationScreen.tsx:47`). Aucun `else` ni `catch` n’alimente un message pour cette action. L’état d’erreur préexistant sert au chargement initial (`:24`, `:37`, `:66`). Le parent possède lui aussi ses erreurs de chargement, sans callback d’échec de correction (`web/src/app/portail/[token]/questionnaires/[idAssignation]/page.tsx:46`, `:239`).

Une réponse négative laisse donc le patient sans retour de cette demande ; une erreur réseau rejette le gestionnaire asynchrone sans message de l’interface. Il n’est pas nécessaire que tous les codes 401/409/410 cités soient actuellement émis pour démontrer cette branche silencieuse.

### N2.9 — RÉSISTE · CONFIRMÉE

Le panneau annonce encore : « Cette confirmation reste en mémoire et ne modifie aucune donnée » (`web/src/components/patient-cockpit/EpisodeConfirmationPanel.tsx:68`). Son clic appelle le POST cockpit, qui persiste l’épisode (`web/src/app/api/praticien/cockpit/route.ts:657`). D-118 le décide expressément (`docs/DECISIONS.md:239`).

Les recherches mémoire/persistance/ne modifie/ne persiste dans les composants et leurs appels n’ont pas établi un second libellé utilisateur équivalent sur ce chemin. Les messages concernant un brouillon réellement local ne sont pas assimilés à ce défaut.

## 4. Ce que l’audit a manqué

Les trois trouvailles K1–K3 sont supplémentaires aux **23 affirmations fournies**. Leur absence de l’inventaire complet des 106 constats n’est pas vérifiable sans cet inventaire. Le défaut entre cycles décrit sous N2.10 est une extension de ce constat, non comptée une seconde fois ici.

### K1 — P0 proposé · CONFIRMÉE — Confirmation divergente acceptée mais non enregistrée

**Scénario :** deux onglets du même praticien ouvrent la proposition T0 d’un dossier. Le dossier remplit les préconditions ; les réponses disponibles restent inchangées. Chaque onglet choisit un sous-ensemble différent de réponses admissibles. Le premier confirme ; le second confirme ensuite sans avoir rechargé.

1. Le panneau autorise la sélection et la désélection (`web/src/components/patient-cockpit/EpisodeConfirmationPanel.tsx:52`). Chaque onglet poste ses `includedResponseIds`, mais le même `proposalHash` (`web/src/components/patient-cockpit/ClinicalRuntimeSection.tsx:775`).
2. L’identité est déterministe pour patient/T0, indépendamment du sous-ensemble choisi (`web/src/lib/clinical-engine/runtimeFromPrisma.ts:177`). Pour T0, les ancres persistées ne changent pas la référence de proposition (`web/src/app/api/praticien/cockpit/route.ts:241` ; runtime `:217`). Le hash porte sur les données candidates et le contexte, pas sur le choix du praticien (runtime `:252`). La première confirmation ne périme donc pas la seconde proposition à données inchangées.
3. La seconde requête passe le contrôle du hash (`cockpit/route.ts:518`), reconstruit un épisode avec la seconde sélection et son nouvel horodatage (`:578`), puis calcule la carte correspondante (`:592`). `confirmAssessmentEpisode` accepte tout sous-ensemble de candidats connus (`web/src/lib/clinical-engine/assessmentEpisode.ts:98`).
4. La garde d’ancre accepte la re-confirmation de la même identité (`web/src/lib/protocol/ancresPersistees.ts:124`). Elle ne compare pas les décisions. L’upsert retrouve la ligne du premier onglet mais n’écrit rien, car `update: {}`. Sa valeur de retour est ignorée.
5. Le serveur répond `ready` avec les objets fraîchement calculés pour le second choix ; l’interface les accepte et les affiche (`ClinicalRuntimeSection.tsx:791`, `:804`).
6. Au rechargement, GET relit le premier payload. Le contrôle de rejeu exclut justement de la comparaison les réponses sélectionnées, la date de confirmation et les contournements (`cockpit/route.ts:285`), puis retourne l’épisode persisté (`:305`). La sélection du premier onglet revient.

Extrait déterminant de [la route cockpit](/Users/wellneuro/Developer/Wellneuro-app/web/src/app/api/praticien/cockpit/route.ts:657), lu pendant la passe :

```text
657  await prisma.assessmentEpisode.upsert({
658    where: { id: episode.assessmentEpisodeId },
659    create: toEpisodeCreateInput(episode, {
660      cycleId: resolveCycleId({ episode, ancresCandidates: [...ancres] }),
661    }),
662    update: {},
663  });
665  return await reponsePrete(idPatient, { snapshot, review, decisionCard, plainteDominante });
```

**Effet établi par le chemin :** accusé de confirmation d’une sélection clinique qui n’a pas été enregistrée. Les réponses brutes ne sont pas supprimées ; c’est le second geste de sélection, sa date et, le cas échéant, son motif de contournement qui ne sont pas conservés comme affichés. Une immutabilité intentionnelle de l’épisode ne justifie pas de renvoyer une autre décision que celle conservée.

**Qualification :** P0 selon « écriture perdue sous une réponse ok » du prompt, pas allégation d’exfiltration ni preuve d’un dommage clinique. Ce défaut concerne une confirmation divergente **dans le même épisode** ; il ne re-signale pas la collision inter-cycles déjà corrigée par D-113 et documentée dans `runtimeFromPrisma.ts:159`. D-118 promet la persistance du geste (`docs/DECISIONS.md:239`). Le test local de route vérifie l’upsert vide avec un mock (`web/src/app/api/praticien/cockpit/route.test.ts:799`), sans démontrer la cohérence de deux confirmations divergentes face à une vraie ligne existante. Ce test n’a pas été exécuté.

### K2 — P1 proposé · CONFIRMÉE — Une passation invalidée réentre dans le momentum du Fil

**Préconditions du scénario :** validité des passations activée ; dossier éligible à une carte J21, avec une ancre confirmée et sans épisode J21 qui supprimerait cette carte ; une réponse de référence valide et une nouvelle réponse d’un questionnaire source, dotée de `rawAnswers`, au statut exclu du raisonnement, dans la période de lecture suivante.

Chemin complet :

1. `momentumJalonsParPatient` sélectionne bien `statutValidite` en base (`web/src/lib/fil/momentumJ21.ts:29`).
2. Il fabrique cependant des `ReponseBrute` en ne copiant que questionnaire, date et scores (`:53`). Le statut disparaît :

```text
31  select: { idPatient: true, idQuestionnaire: true, dateReponse: true, scoresJson: true, statutValidite: true },
56  liste.push({ idQuestionnaire: r.idQuestionnaire, dateReponse: r.dateReponse, scoresJson: r.scoresJson });
```

3. La projection appelle `construireTrajectoire` (`:61`), puis `construireHistoriqueEquilibre` (`web/src/lib/protocol/trajectoire.ts:140`). Le filtre de validité existe bien à l’entrée de l’historique (`web/src/lib/equilibre/depuisPrisma.ts:122`), mais il accepte un statut absent pour compatibilité (`web/src/lib/scoring/validite.ts:103`).
4. La réponse exclue peut alors compter comme nouveauté et contribuer au score (`depuisPrisma.ts:152`, `:164`, `:170`). Les lectures de mesure sont construites depuis les réponses ; un épisode de mesure J21 confirmé n’est pas requis pour ce calcul (`trajectoire.ts:142`, `:156`). L’absence d’un tel épisode dans les préconditions du Fil ne neutralise donc pas ce chemin.
5. Le delta remonte au Fil (`web/src/app/api/praticien/fil/route.ts:183`) et à son texte de momentum (`web/src/lib/fil/cartes.ts:284`).

**Effet :** une invalidation censée retirer une passation du raisonnement ne s’applique pas à cette projection. Le statut est correctement demandé puis perdu au raccordement. Aucun nouveau seuil clinique n’est proposé. L’état de production du drapeau `WN_ENABLE_VALIDITE_PASSATIONS` et l’existence d’un dossier répondant aux préconditions n’ont pas été vérifiés ; le défaut conditionnel du code est confirmé.

### K3 — P2 proposé · CONFIRMÉE — Révoquer un lien fabrique une première connexion

**Scénario :** dossier dans la fenêtre des 30 jours, accès envoyé avec succès, lien magique jamais utilisé, aucune connexion Google et aucune anamnèse validée. Le praticien révoque l’accès.

Chemin complet : menu de révocation → DELETE token → consommation administrative de tous les liens encore ouverts (`web/src/app/api/praticien/token/route.ts:193`) → lecture des nouveaux dossiers → tout `consommeLe` non nul est pris comme preuve d’entrée effective (`web/src/app/api/praticien/nouveaux-patients/route.ts:70`) → première connexion dérivée de cette date (`:105`) → champ `connecteLe` (`:125`) → état « Onboarding à finir » au lieu de « Jamais connecté » (`web/src/lib/fil/nouveauxPatients.ts:76`).

Extraits lus :

```text
token/route.ts:194  where: { idPatient, consommeLe: null },
token/route.ts:195  data: { consommeLe: maintenant },
nouveaux-patients/route.ts:73  where: { idPatient: { in: ids }, consommeLe: { not: null } },
nouveaux-patients/route.ts:107 premiereConnexion.set(l.idPatient, l.consommeLe);
```

**Effet :** le praticien voit la première porte d’accès comme franchie alors que son propre geste vient de la fermer. L’utilisation de `consommeLe` pour invalider les liens est documentée et intentionnelle (`token/route.ts:181`) ; le défaut est son interprétation univoque par un autre lecteur. Aucune authentification n’a réellement eu lieu dans ce scénario, et la révocation reste effective.

## 5. Commandes et sorties probantes

Les scénarios ci-dessus résultent des lectures `rg` et `nl -ba … | sed -n …` aux emplacements cités. Les extraits déterminants de ces sorties figurent au fil des constats. Les commandes d’inventaire et de contrôle externe suivantes ont réellement été exécutées ; aucune exécution de test n’est sous-entendue. Les recherches sur quelques chemins initialement mal orthographiés ont retourné « No such file or directory » ; ces essais ont été corrigés par inventaire des fichiers et n’ont jamais servi de preuve d’absence.

### Révision et comparaison

```text
$ git rev-parse --short HEAD
87f7f8eb

$ git cat-file -t 2de210e1
commit

$ git diff --numstat 87f7f8eb 2de210e1 -- web/src
7       2       web/src/app/api/praticien/biologie/proposition/document-patient/route.ts
7       0       web/src/app/api/praticien/biologie/resultats/route.ts
```

L’état initial, recontrôlé avant rédaction du résultat, était :

```text
$ git status --short
?? docs/claude/PROMPT_CONTRE_REVUE_CODEX_AUDIT_PARCOURS_2026-09-05.md
```

Ce fichier de prompt préexistait à la passe. Le présent résultat est le seul fichier ajouté par la contre-revue.

### Inventaire mécanique pour N1.3

```text
$ rg --files web/src/app/api | rg '/route\.ts$' | wc -l
125
$ rg --files web/src/app | rg '/page\.tsx$' | wc -l
32
$ rg -c '^model ' web/prisma/schema.prisma
80
```

Les listes correspondantes ont été lues. Ces nombres confirment le dénominateur du dépôt ; ils ne prouvent aucune inclusion dans les 283 événements absents.

### Appels SMTP pour N2.11

```text
$ rg -n 'sendMail\(' web/src -g '!*.test.*' -g '!*.spec.*'
web/src/lib/trust/notification.ts:16:    await transporter.sendMail({
web/src/lib/consultation/email.ts:83:      await transport.sendMail({
web/src/lib/consultation/email.ts:146:      await transport.sendMail({
web/src/app/api/praticien/assignations/route.ts:339:    await transport.sendMail({
web/src/lib/agenda-sommeil/relanceEmail.ts:4:// vérifie qu'un fichier contenant `sendMail(` contient aussi
web/src/app/api/praticien/packs/assign/route.ts:334:    await transport.sendMail({
web/src/app/api/praticien/booklet/route.ts:269:    await transporter.sendMail({
web/src/app/api/patient/submit/route.ts:378:    await transport.sendMail({
web/src/app/api/praticien/file-envoi/envoyer/route.ts:268:    await transporter.sendMail({
web/src/app/api/praticien/agenda-sommeil/relance/route.ts:258:      await transporter.sendMail({
```

Neuf appels effectifs dans huit fichiers. Le commentaire n’est pas compté comme appel ; les fins de ligne sont normalisées pour cette restitution.

### Offre publique Google pour N1.5

```text
$ curl --fail --silent --show-error --max-time 25 https://app.wellneuro.fr/portail/connexion | rg -o 'Continuer avec Google|/portail/google|Accéder à votre espace|Seule votre adresse e-mail est transmise'
Accéder à votre espace
/portail/google
Continuer avec Google
Seule votre adresse e-mail est transmise
Accéder à votre espace
/portail/google
Continuer avec Google
Seule votre adresse e-mail est transmise
```

Lecture publique seule, sans cookie, sans parcours OAuth. Les occurrences sont présentes dans le rendu et sa charge de page. L’ouverture préalable via l’outil web avait échoué avec « URL … is not safe to open (non-retryable error) » ; ce n’était pas un résultat sur l’état du service. La lecture HTTP publique ci-dessus a ensuite réussi.

## 6. Limites de couverture

| Affirmation | Élément manquant et conséquence |
|---|---|
| N1.3 | Liste des 283 événements : impossible de nommer avec preuve une route/page/table absente de cette dateline. K1 décrit une branche concurrente à y rechercher, sans prétendre qu’elle en est absente. |
| N3.1 | Liste des 118 objets et leurs catégories : aucun échantillon prétendument aléatoire de dix objets n’a été inventé. |
| N3.2 | Les 23 machines, leurs transitions déclarées sans surface et les 13 silences : les lectures de routes ne permettent pas de comparer à des transitions non décrites. |
| N3.3 | Texte des 27 propositions, en particulier les 16 propositions de vague 2 : les seuls titres R-08/R-27 ne permettent pas de juger leurs invariants ni leurs gates. |
| N3.5 | F-031/F-030/F-007 complets, autres P1 et matrice constat/proposition : impossible de vérifier leur non-couverture ou d’établir les autres P1 non adressés. |

Les cinq lignes ci-dessus sont des vérifications non exécutables à partir des seuls extraits, et non des affirmations réputées vraies par défaut.

La revue ne mesure pas la fréquence des scénarios ni leur présence dans les dossiers de production. Elle ne déduit pas l’état actuel des tables des observations historiques de D-112. Les drapeaux autres que l’offre publique Google, le contenu TRUST authentifié déployé, le relais SMTP et l’ordonnanceur externe n’ont pas été inspectés. Les invariants d’appartenance et d’effacement ont été recherchés sur les chemins pertinents, sans prétendre à une revue exhaustive de sécurité de toutes les routes.

La jauge maintenue par D-106, les deux objets J21 d’A1, l’append-only et le suivi en pull de D-111, ainsi que la sélection manquante déjà nommée par D-058, restent des décisions ou dettes datées. Les constats portent sur les écarts démontrés, leurs extensions et les inférences incorrectes de l’audit.

**3 réfutées (dont 2 au niveau 1), 6 affaiblies, 2 élargies, 7 résistent, 5 non vérifiables, plus 3 trouvailles neuves par rapport aux affirmations fournies.**
