# Cadrage — ce qui se cite dans l'objectif partagé

- Date : 2026-09-09
- Objet : la clause de fermeture de `D-094` §1, et les deux chantiers qu'elle bloque
- Statut : **texte de décision prêt à prendre.** Le numéro s'acquiert au merge —
  `D-160` y est écrit parce que `scripts/lib/decisions-numerotation.mjs` refuse
  un trou dans la suite.

Deux chantiers ont été tranchés en séance le 2026-09-09 et consignés à la file
d'attente. Tous deux butent sur la même clause — « toute extension de cette liste
est une décision `D-xxx` nouvelle » — mais **pas de la même façon**, et la file
laissait explicitement la question ouverte : « vérifier au cadrage si elle doit
être étendue ou doublée ». Ce fichier la referme.

## Le départage : le garant, pas la commodité

La liste de `D-094` §1 garantit une **provenance**. Son invariant est écrit dans
la décision elle-même : « un fragment sans source est inconstructible ». Il se
justifie par une asymétrie — le patient n'écrit pas la proposition, donc chaque
mot qu'on lui prête doit porter d'où il vient.

**« Ce qui compte pour moi aujourd'hui » est exactement de cette nature** : une
parole écrite du patient, verbatim, destinée à un fragment de proposition. Même
objet, même garant, même régime que la première entrée de la liste. Elle y entre.

**La synthèse de compréhension publiée, non.** Le praticien est l'auteur de sa
reformulation : sa provenance n'est pas en cause. Ce qui l'est, c'est que depuis
`D-154` cette reformulation est lue seule par le patient, au portail, avant la
consultation suivante — soit la condition même qui justifie le refus **bloquant**
sur le registre anxiogène à la publication d'une synthèse
(`api/praticien/comprehension/route.ts:419-422`), refus que la route des
objectifs n'a pas (0 occurrence de `termeAnxiogene`). Ce que garantirait la
citation ici n'est pas une origine, c'est le **franchissement d'une porte**.

Deux garants différents font deux listes. Trois motifs le confirment :

1. **`D-094` a déjà tenu ce raisonnement, dans son propre §2**, à propos d'autre
   chose : « un amendement porte un texte, une ratification n'en porte pas — les
   fusionner affaiblirait les deux objets. » Une liste mêlant parole de patient
   inviolable et prose de praticien publiable ne dirait plus quelle règle
   s'applique à quelle entrée.
2. **`D-094` §5 sépare les modules.** Étendre §1 à un texte praticien
   autoriserait le moteur de proposition à produire de la prose de praticien —
   ce que la garde G7 interdit.
3. **Les objets diffèrent** : §1 régit `enoncePatient`, champ « inviolable » qui
   ne se pré-remplit que par citation verbatim du patient. La reformulation est
   un autre champ, d'un autre auteur.

---

## Texte de décision, à placer en tête de `docs/DECISIONS.md`

### D-160 — Ce qui se cite dans l'objectif partagé : deux listes, pas une

- Date : 2026-09-09
- Statut : accepté (arbitrage du praticien, rendu en session le 2026-09-09)
- Amende : [[D-094]] §1, en portant sa liste fermée de trois à **quatre**
  entrées, et ouvre à côté d'elle une **seconde** liste, distincte, pour la
  reformulation praticien. Le reste de `D-094` est inchangé.
- Domaine : doctrine produit — campagne Alliance 6.0-B, objectif à trois voix

**Constat.** Deux chantiers tranchés le 2026-09-09 butent sur la clause de
fermeture de `D-094` §1. L'un est une parole écrite du patient destinée à un
fragment de proposition ; l'autre est un texte du praticien destiné à sa propre
reformulation. Ni la nature, ni l'objet, ni le garant ne coïncident. La première
entre dans la liste ; la seconde demande la sienne.

**Décision :**

1. **La liste de `D-094` §1 passe à quatre entrées.** Quatrième : « ce qui compte
   pour moi aujourd'hui », verbatim, jamais paraphrasé, marqué comme citation
   avec sa source — même régime que les trois autres. Quatre conditions, aucune
   négociable :
   - le fragment porte sa `saisiLe`, comme le fragment d'anamnèse porte sa
     `dateConsultation` — sans quoi on cite un « aujourd'hui » vieux de trois
     mois comme une demande actuelle ;
   - **un seul dépôt, le plus récent.** En citer plusieurs, c'est les ordonner,
     et la table n'a délibérément pas de `supersedes` (`lib/patient/ceQuiCompte.ts:21-29`,
     « une parole n'est pas une donnée qu'on rectifie ») ;
   - toute surface neuve rendant ces entrées entre dans `SURFACES_LOT`
     (`ceQuiCompteAntiAgregat.guard.test.ts:28`), faute de quoi l'anti-agrégat
     ne s'y applique pas ;
   - aucun décompte, aucun résumé, aucune moyenne, y compris à l'écran
     (`DC-19`, `DC-24`).
2. **Ce dépôt alimente l'ÉNONCÉ, jamais la PRIORITÉ.** Deux motifs, aucun de
   confort : la priorité est l'arbitrage du praticien — « ce sur quoi on
   travaille d'abord » — et y verser une parole de patient convertirait
   silencieusement l'une en l'autre, ce que le dossier à deux voix existe pour
   empêcher ; et elle est bornée à 200 caractères contre 4 000 pour un dépôt,
   donc il faudrait tronquer, que `lib/patient/ceQuiCompte.ts:44-50` nomme
   explicitement contre-patron et « altération de donnée ».
3. **Une SECONDE liste est ouverte, pour la reformulation praticien, fermée à
   une entrée** : une version **publiée** de la synthèse de compréhension, citée
   par identifiant de version, recopiée côté serveur, le fragment portant
   `idSynthese` et `publieeLe`. **Un brouillon n'est jamais citable** — sinon la
   garde de registre se contourne par le bas.
4. **La garde manquante se pose EN MÊME TEMPS.** La saisie libre de la
   reformulation reçoit le même refus bloquant sur le registre anxiogène que la
   publication d'une synthèse. Sans cela, la citation devient le chemin sûr et la
   frappe le chemin sale : on aurait déplacé le défaut au lieu de le fermer.
5. **Les deux textes praticien ne fusionnent pas et ne se pré-remplissent pas
   l'un l'autre.** Portées distinctes — la demande d'un côté, la personne de
   l'autre — et verbes patient distincts : ratifier ou contester pour l'objectif,
   signaler un désaccord pour la synthèse.
6. **La clause de fermeture est reconduite et s'étend à la seconde liste.** Toute
   extension de l'une ou de l'autre est une décision `D-xxx` nouvelle, pas un
   champ de plus.

**Ce que cette décision N'AUTORISE PAS** : faire rédiger par la machine l'une ou
l'autre moitié de l'objectif ; pré-remplir une synthèse de compréhension par une
sortie de moteur — la garde G3 nomme ce scénario mot pour mot
(`comprehensionAppendOnly.guard.test.ts:161-166`) ; lire `SyntheseIA` depuis une
autre route, ce qui serait un contournement et non une conformité ; tronquer un
dépôt pour le faire entrer dans la priorité ; citer un brouillon.

**Ce que cette décision NE RÈGLE PAS.** L'assemblage des propositions ne tourne
qu'à la confirmation d'un épisode (`ClinicalRuntimeSection.tsx:928`) : un dépôt
écrit après ne rafraîchit rien de lui-même, et rien n'apparaît en première
consultation. L'**étage minimal** — afficher le dépôt courant et la synthèse
publiée courante à côté des champs, comme le matériau d'anamnèse l'est déjà
(`ObjectifNegociePanel.tsx:689`) — ne demande aucune décision, se pose dès
maintenant, et c'est lui qui rend la chose utile au premier jour. Les deux étages
sont complémentaires, pas alternatifs.

- Conséquences : fragment `changelog.d/2026-09-09-deux-listes-de-sources-citables.md`.
  Code à venir dans la campagne 6.0-B ; aucune migration, aucun drapeau neuf.

---

## Fragment `changelog.d/2026-09-09-deux-listes-de-sources-citables.md`

```markdown
### Doctrine produit

- Ce qui se cite dans l'objectif partagé tient désormais en **deux listes, pas
  une**. Celle de `D-094` §1, qui garantit la provenance d'un fragment de
  proposition, passe à quatre entrées : « ce qui compte pour moi aujourd'hui »
  y entre, verbatim, un seul dépôt, le plus récent, et alimente l'énoncé —
  jamais la priorité. Une seconde liste, qui garantit tout autre chose — le
  franchissement du refus bloquant sur le registre anxiogène —, s'ouvre pour la
  reformulation praticien : une version publiée de la synthèse de compréhension,
  jamais un brouillon. La garde manquante sur la saisie libre se pose avec
  (`D-160`).
```

---

## Ce qui devient constructible, et dans quel ordre

Un rappel utile au cadrage : le troisième chantier voisin — **amorcer « Ce que
j'ai compris de vous » par les mots du patient** — ne demande **aucune décision**.
Il ne cite que des paroles du patient déjà en base, ne franchit aucun
`IMPORTS_INTERDITS`, et le geste est déjà admis dans le panneau (« Réviser cette
version » pré-remplit le texte). Seule la condition (3) ci-dessus le touche :
la surface entre dans `SURFACES_LOT`.

**Réserve d'ordonnancement, et elle est ferme.** Le bouton « Reprendre cette
phrase » que ces chantiers installent produit **mécaniquement une seconde tête de
chaîne** dès qu'un objectif courant existe : la route refuse le cumul
`supersedesObjectifId` + `sourcePropositionId` en 400, et l'écran offre la reprise
sans regarder combien d'objectifs existent (`api/praticien/objectifs/route.ts:755`).
Deux têtes ferment les trois gestes du patient en 409 sans qu'aucun verbe ne les
départage, et le nombre de têtes ne peut que croître. **Le verbe de départage se
livre avant, pas après.**
