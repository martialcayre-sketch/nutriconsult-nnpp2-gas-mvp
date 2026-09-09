# Bilan du classement des candidats — moitié descriptive

- Date : 2026-09-09
- Objet : `D-093` (3)(b), tel que `D-162` l'a redéfini — le bilan cesse d'être une
  condition de sortie et devient un **document dû en propre**, dont la valeur est
  de dire ce que la signature couvre et ce qu'elle laisse dehors.
- Méthode : **lecture du dépôt seule**, sur `origin/main` à `f47e0196`. Aucune
  base de production interrogée, aucun dossier réel lu. Le code est cité
  verbatim ; ce document ne conclut rien qu'il ne montre.
- Ce qu'il n'est pas : la **moitié comportementale** — le classement tel qu'il
  s'est comporté sur des dossiers — n'y figure pas et n'est pas exigible
  (`D-162` §4). `D-094` §3 interdit de persister l'ordre servi ; elle ne
  s'obtiendrait que par rejeu de `construireChaineC1`, que personne n'a programmé.

---

## 1. Ce que la signature couvre, exactement

L'empreinte porte sur **une seule chaîne**, et le mécanisme tient en trois lignes :

```ts
export const PRIORITY_RULES_SHA256 = sha256(
  JSON.stringify({ regles: PRIORITY_RULES_V1, abstention: ABSTENTION_PROCEDURE_V1 }),
);
```
`web/src/lib/clinical/priorityRulesV1.ts:732-734`

Pas de tri, pas de normalisation, pas de sel : **l'ordre du tableau de règles et
l'ordre des propriétés de chaque littéral font partie de l'empreinte.** Une
réorganisation cosmétique du fichier casserait donc le verrou — ce qui est un
comportement voulu, non un défaut.

Le bloc de gouvernance de la table déclare le périmètre dans ses propres mots :

> `PRIORITY_RULES_SHA256` porte sur `PRIORITY_RULES_V1` — déclencheurs, claims,
> libellés, motifs — ET, depuis `D-062`, sur `ABSTENTION_PROCEDURE_V1`, cadre et
> textes de motifs compris.

`priorityRulesV1.ts:472-477`

**Le verrou** est fail-closed, posé à un seul endroit (`reglesPrioritesValidees()`,
`:798`), et ne teste que **cinq propriétés de métadonnée** — jamais la production,
jamais un drapeau, jamais l'identité d'un signataire :

```ts
export function tablePrioritesSignee(): boolean {
  const dateValidation = PRIORITY_RULES_METADATA.dateValidation;
  return PRIORITY_RULES_METADATA.validationExterne
    && dateValidation !== null
    && !Number.isNaN(new Date(dateValidation).getTime())
    && new Date(dateValidation).toISOString() === dateValidation
    && PRIORITY_RULES_METADATA.claimsSource.length > 0
    && PRIORITY_RULES_METADATA.shaPerimetre === PRIORITY_RULES_SHA256;
}
```
`priorityRulesV1.ts:749-768`

Le SHA relu est **recopié en littéral figé**, jamais en référence à la constante
calculée, et un banc de source refuse la référence — sans quoi la comparaison
serait tautologique et la péremption invisible
(`shaPerimetreLitteral.guard.test.ts:35,53`). Valeur en vigueur :
`2dbd7b5d…fa43cc`, date de validation `2026-08-28T00:00:00.000Z`, vingt claims
épinglés (`:579-614`).

**État de la table** : quatre règles publiées — `PRIO-DIG-01` (digestion, priorité
intrinsèque 1), `PRIO-PON-01` (surpoids, 2), `PRIO-SOM-01` (sommeil, 3),
`PRIO-DOU-01` (douleurs, 4) — toutes déclenchées par **une comparaison unique
`>= 7` sur un sous-score de `Q_MOD_03`**. Trois axes sont écartés avec motif et
condition de retour (`PRIO-STR`, `PRIO-FAT`, `PRIO-MOB`), alors que l'instrument
porte **sept** domaines.

### Ce qui vit dans le fichier signé sans entrer dans le hash

Par simple lecture de l'argument sérialisé, deux tables du même fichier n'y sont
pas :

- `PRIORITY_RULES_ECARTEES_V1` (`:421`) — **les motifs d'écartement des trois axes
  et leurs conditions de retour sont donc modifiables sans que le verrou bouge** ;
- `PRIORITY_RULES_METADATA` (`:505`) — version, date, claims, `shaPerimetre`.

### Un écart de texte à signaler au signataire

Le bloc « À LIRE AVANT DE RE-SIGNER » écrit encore : « **Chacune des deux règles**
repose sur UN ITEM UNIQUE de `Q_MOD_03` » (`:496-502`). La table en porte **quatre**
depuis le 2026-08-28. L'arbitrage que ce paragraphe expose — `DC-28` mitigé, non
réfuté, par ce que la règle produit — reste valable ; son décompte ne l'est plus.

---

## 2. Le producteur de candidats

Le module ne lit aucune base : les entrées sont adaptées en amont
(`runtimeFromPrisma.ts:133`), et `chaineC1.ts:37` le dit — « ni authentification,
ni contrôle d'appartenance, ni lecture base, ni journalisation ».

**Deux gardes d'entrée, toutes deux rendant un tableau vide — jamais une liste
dégradée** :

```ts
function construireCandidats(input: { … }): DecisionPriorityCandidate[] {
  if (!tablePrioritesSignee()) return [];
  …
  if (input.abstention !== 'not_required') return [];
  const declenchees = evaluerPriorites(input.dernieres);
```
`chaineC1.ts:422`

L'éligibilité d'un axe est doublement bornée **dans le périmètre signé** : la règle
doit être `publiee` et porter au moins un claim (`priorityRulesV1.ts:771`), et son
unique déclencheur doit être atteint, un sous-score sans mesure rendant `null` et
n'allumant rien (`orientationEngine.ts:724`). **Quatre candidats au maximum**, un
par domaine.

**Une réserve de reproductibilité, et elle compte pour un dossier de signature.**
Le score n'est pas l'instantané stocké : il est **recalculé à la lecture**, et ce
recalcul lit un état de processus —

```ts
export function validitePassationsActive(): boolean {
  return process.env.WN_ENABLE_VALIDITE_PASSATIONS === '1';
}
```
`web/src/lib/scoring/validite.ts:62`, appelé depuis `chaineC1.ts:179`

Le producteur n'est donc pas une fonction pure des données stockées : **deux
lectures du même dossier sous deux valeurs d'environnement peuvent différer.** Un
rejeu, s'il est un jour programmé, devra fixer cette variable pour valoir preuve.

**La gate de population s'interpose entre le déclenchement et le tri** — et c'est
sa place qui fait la règle : un candidat écarté n'a jamais porté de rang
(`chaineC1.ts:460`). Sa table de curation est **vide** :
`EXCLUSIONS_INTERVENTIONS_V1 = {}` (`gatePopulationV1.ts:76`), de sorte qu'aucun
candidat n'est écarté aujourd'hui sur aucun dossier, chacun repartant avec le
motif « exclusions non curées ». Cette table est hors périmètre signé par décision
assumée : « elle ne porte aucun contenu clinique : elle déclare une ignorance »
(`:26`).

---

## 3. Le classement — le cœur du bilan

`D-093` écrit que « dans une recommandation élargie, c'est l'ordre qui décide de ce
qui est proposé en premier ». Le voici, en entier :

```ts
// CLASSEMENT — la plainte dominante d'abord, la priorité intrinsèque de la
// table ensuite, l'identifiant en dernier ressort. Le troisième terme n'est
// pas décoratif : sans lui, deux règles de même priorité s'ordonneraient selon
// l'ordre de la table, qu'une édition future déplacerait en silence.
const classees = [...retenues].sort((gauche, droite) => {
  const rangPlainte = (candidate: typeof gauche) => (
    candidate.regle.domainePlainte !== null
    && candidate.regle.domainePlainte === input.plainteDominante?.domaine
      ? 0 : 1
  );
  return rangPlainte(gauche) - rangPlainte(droite)
    || gauche.regle.priorite - droite.regle.priorite
    || (gauche.regle.id < droite.regle.id ? -1 : gauche.regle.id > droite.regle.id ? 1 : 0);
});
```
`chaineC1.ts:470-483`

**Terme 1 — la plainte dominante.** Un candidat dont `domainePlainte` égale le
domaine le plus intensément déclaré passe devant tous les autres, sans départage
entre eux. C'est le terme qui décide le plus souvent, et il est **explicitement
hors du verrou de signature** : « Ce n'est PAS une sortie de règle : c'est la
restitution d'une bande déjà publiée par un instrument certifié » (`:41-50`,
`D-054` arbitrage 7).

Son propre départage, à intensité égale, est **l'ordre de publication du catalogue**
— fatigue, douleurs, digestion, surpoids, sommeil, moral, mobilité
(`web/src/lib/questionnaires/mode-de-vie.ts:25-31`) — et le code le dit sans
détour :

> Ce n'est PAS une hiérarchie clinique : c'est le seul moyen de rendre l'affichage
> stable d'une lecture à l'autre. **Un départage clinique — quelle plainte prime à
> intensité égale — est un arbitrage praticien qui n'a pas été rendu.**

`chaineC1.ts:204-211`

**C'est le seul arbitrage ouvert que ce bilan met au jour**, et il est nommé dans
le code depuis `D-054`.

**Termes 2 et 3 — signés comme données, non comme usage.** `domainePlainte`,
`priorite` et `id` sont déclarés sur `PriorityRule` (`priorityRulesV1.ts:59-74`),
donc couverts par le SHA. **C'est le comparateur qui ne l'est pas** : la fonction
qui les combine, l'ordre des termes, et le choix même de ces trois termes vivent
dans `chaineC1.ts`, dont aucun octet n'entre dans l'empreinte. Le troisième terme
est aujourd'hui **inatteignable** : un banc exige des priorités intrinsèques
uniques (`priorityRulesV1.test.ts:155-160`).

**Le rang servi n'est pas la priorité signée.** Il est renuméroté séquentiellement
sur la liste déjà triée et déjà filtrée — `rank: index + 1` (`:498-501`) — puis
re-trié et contrôlé unique par `buildDecisionCard`, qui le fait entrer dans
l'`inputHash` de la carte (`decisionCard.ts:103-111,166,176-177`). **Le rang que
le praticien lit est donc un artefact du moteur, pas une donnée signée**, et il
est affiché en clair : `rang {candidat.rank} · {candidat.confidence}`
(`SelectionPrioritePanel.tsx:170-174`).

Le rang 1 devient `proposedMainPriorityId` (`chaineC1.ts:407-409`) : **l'ordre
décide bien de ce qui est offert en premier**, exactement le point de `D-093`.

**Ce que le dépôt fait déjà pour contenir ce risque, et il faut le porter au
crédit du dossier.** L'ordre n'est persisté nulle part : la carte n'est stockée
dans aucune table (`ClinicalRuntimeSection.tsx:909-923`), et le module des
propositions d'objectif refuse explicitement de transmettre `rank` —

> NI RANG, NI SCORE, NI NUMÉRO D'ORDRE (`D-094` §3, `DC-19`/`DC-20`) : l'ordre des
> candidats n'est couvert par aucune ligne signée (`D-093`), il ne doit pas se lire
> comme un classement.

`web/src/lib/praticien/propositionObjectif.ts:20-23`

**L'ordre d'évaluation des deux motifs d'abstention** est dans la même situation.
Les textes d'`ABST-SEC-01` et `ABST-CAN-01` sont signés ; la précédence « sécurité
d'abord, canal ensuite » n'existe que comme deux `if` successifs
(`chaineC1.ts:311-328`). La table signée l'affirme en commentaire — « Évalués dans
cet ordre ; le premier atteint l'emporte » (`priorityRulesV1.ts:663-666`) — mais un
commentaire n'entre pas dans un `JSON.stringify`. Un banc ordinaire tient cette
précédence (`chaineC1.test.ts:365-375`) ; aucune signature ne la relit.

---

## 4. Les textes `LIMITATION_*`

Sept constantes, toutes privées de module : **quatre** chez le producteur de
candidats (`chaineC1.ts:234-241`), **trois** chez le producteur de sécurité
(`safetyFindings.ts:83-93`). Aucune n'entre dans un périmètre haché.

| Texte | Attachement | Lu par | Figé par un banc |
|---|---|---|---|
| `LIMITATION_PROPOSITION` | inconditionnel | praticien | **verbatim** |
| `LIMITATION_CLASSEMENT` | inconditionnel | praticien | **aucun** |
| `LIMITATION_OBJECTIF` | si `priorityGoal` | praticien | **verbatim** |
| `LIMITATION_ETAT_INCONNU` | si état intégralement inconnu | praticien | regex partielle |
| `LIMITATION_PROVENANCE` | tout constat d'anamnèse | personne | aucun |
| `LIMITATION_HORS_COTATION` | si rang du signal inconnu | personne | sous-chaîne de 7 mots |
| `LIMITATION_EI_PROVENANCE` | effet indésirable non traité | personne | aucun |

Quatre observations, par ordre de gravité pour un dossier de signature.

**(a) Le texte qui qualifie le classement n'est figé par rien.**

> `Le classement est déterministe et sert la lisibilité : il ne mesure ni la
> gravité, ni l'urgence.`
> `chaineC1.ts:236-237`

C'est **le seul des sept dont aucune occurrence n'existe ailleurs dans le dépôt** :
ni banc unitaire, ni E2E. Une réécriture passerait au vert. Or c'est précisément la
phrase qui dit au praticien ce que l'ordre n'est pas — la seule contrepartie
textuelle au fait que l'ordre décide et n'est pas signé.

**(b) Trois textes n'atteignent aucun humain.** `buildDecisionCard` ne retient que
les `findingId` des constats (`decisionCard.ts:172`), et le seul composant qui
reçoit la revue n'en lit que `missingData` et `discordances`
(`ClinicalRuntimeSection.tsx:1431-1432`). Les trois textes de sécurité traversent
la réponse HTTP sans être rendus.

**(c) Seul le candidat courant voit ses limitations affichées** —
`const current = selected ?? proposed ?? null` (`DecisionSummaryCard.tsx:39,58-62`).
Les candidats de rang 2..n portent leurs textes dans le JSON et dans l'empreinte
de la carte, sans qu'aucun composant les rende.

**(d) Signé et non signé sont concaténés dans un tableau indistinct**, puis
dédupliqués à l'affichage : les limitations signées de la règle, les quatre textes
du moteur et le motif de la gate arrivent ensemble (`chaineC1.ts:513-534`). **Le
praticien ne peut pas distinguer ce qui est relu de ce qui ne l'est pas.**

S'y ajoute une boucle à noter : `LIMITATION_HORS_COTATION` invoque « la cotation
signée du 2026-08-23 » alors qu'aucune signature ne couvre la phrase l'invoquant —
ni `PRIORITY_RULES_SHA256`, ni `SAFETY_SIGNALS_SHA256`
(`safetySignalsV1.ts:165-167`).

---

## 5. Ce que la signature laisse dehors — liste consolidée

Le fichier signé nomme lui-même quatre objets (`priorityRulesV1.ts:489-494`). La
lecture en ajoute six. Les dix, réunis :

1. Le **producteur de candidats** `construireCandidats` (`chaineC1.ts:422-483`).
2. Le **comparateur du classement**, ses trois termes et leur ordre (`:470-483`).
3. Les **sept textes `LIMITATION_*`** (`chaineC1.ts:234-241`, `safetyFindings.ts:83-93`).
4. L'**ordre d'évaluation des deux motifs d'abstention** (`chaineC1.ts:311-328`).
5. Le **calcul de la plainte dominante**, premier terme du tri (`:41-50`, `:213-232`).
6. Son **départage à intensité égale** — l'ordre du catalogue (`mode-de-vie.ts:25-31`).
7. La **renumérotation séquentielle** `rank: index + 1` et l'affichage « rang N ».
8. Le choix de proposer le rang 1 comme priorité principale (`:407-409`).
9. La **gate de population**, sa table de curation vide et ses motifs, versés dans
   les limitations du candidat courant (`gatePopulationV1.ts:26-31,76`).
10. La **règle d'affichage** qui décide quels textes atteignent un humain
    (`DecisionSummaryCard.tsx:39`).

---

## 6. Ce que ce bilan établit, et ce qu'il laisse au signataire

Il établit que la retenue de `D-093` était fondée : **l'ordre décide de ce qui est
proposé en premier, et son premier terme comme sa fonction de tri sont hors
signature.** Il établit aussi que le dépôt a déjà bâti trois contrepoids réels —
l'ordre n'est jamais persisté, `D-094` §3 en interdit la transmission, et un texte
dit au praticien que le classement ne mesure ni gravité ni urgence.

Trois points relèvent d'un arbitrage et non d'une lecture :

- **Le départage clinique de la plainte dominante à intensité égale**, que le code
  nomme comme non rendu depuis `D-054`.
- **Faut-il figer les sept textes par un banc**, à commencer par
  `LIMITATION_CLASSEMENT`, qui n'en a aucun.
- **Faut-il distinguer à l'écran le signé du non signé**, aujourd'hui fondus dans
  une même liste.

Aucun de ces trois ne demande de production. Aucun n'est un préalable à la
signature du classement : ce sont les questions que cette signature aura à trancher.
