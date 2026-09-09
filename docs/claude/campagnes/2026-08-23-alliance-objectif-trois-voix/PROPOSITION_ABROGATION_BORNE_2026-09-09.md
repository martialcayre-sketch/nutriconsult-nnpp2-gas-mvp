# Proposition — abroger la borne du 2026-10-04, garder le périmètre

- Date de rédaction : 2026-09-09
- Statut : **ADOPTÉE le 2026-09-09** — arbitrage du praticien, enregistré au
  registre sous `D-162` dans la même PR que ce fichier.
- Porte sur : `D-093`, point 4 (« borne de six semaines »). Rien d'autre.

Ce fichier porte les trois pièces telles qu'elles ont été prises : le texte de la
décision, l'addendum inséré sous le point 4 de `D-093`, le fragment de changelog.
Le numéro `D-162` a été acquis après le merge de la PR #971, qui prenait `D-160`
et `D-161`.

---

## Ce qui est constaté

### 1. La borne compte depuis une date où la décision se déclare non commencée

`D-093` intitule sa propre précondition « **Précondition à lever avant que
l'observation puisse commencer** » (point 1), puis fait courir six semaines
depuis le 2026-08-23 (point 4). Le délai court donc sur une fenêtre que le texte
déclare fermée le jour de sa signature. Ce n'est pas une dérive survenue depuis :
c'est une contradiction interne, présente à la rédaction.

### 2. La condition (b) porte sur une trace que `D-094` interdit d'écrire

`D-093` (3)(b) exige un bilan sur le classement des candidats « tel qu'il s'est
comporté sur ces dossiers ». Or l'ordre effectivement servi n'est persisté nulle
part — ni rang, ni score, ni numéro d'ordre — par un interdit de `D-094` §3,
lui-même fondé sur `D-093` :

- `web/prisma/schema.prisma:2405-2408`
- `web/src/lib/praticien/propositionObjectif.ts:20-23`

Les deux décisions du 2026-08-23 se contrarient : l'une réclame l'observation
d'un comportement, l'autre en efface la trace à sa demande. La moitié
descriptive du bilan (producteur, ordre à trois termes, textes `LIMITATION_*`,
périmètre du SHA) reste rédigeable aujourd'hui sans aucune lecture de production
— `web/src/lib/clinical-engine/chaineC1.ts:422-482` et `:470-482`,
`web/src/lib/clinical/priorityRulesV1.ts:489-495`. La moitié comportementale, non :
elle ne s'obtiendrait que par rejeu de `construireChaineC1`, déterministe
(`chaineC1.ts:336-345`), ce que personne n'a programmé.

### 3. La précondition EST levée — sur `PAT017` — et le silence est fabriqué

**Révisé le 2026-09-09, après désignation par le praticien.** La rédaction
initiale de ce fichier concluait à une précondition « inattribuable », faute que
le dépôt nomme le dossier porteur. Le praticien l'a nommé : l'unique objectif
négocié de production porte sur **`PAT017`**, qui appartient au périmètre de
`D-093`. Le constat qui suit remplace celui-là ; il ne l'efface pas.

La précondition du point 1 de `D-093` est donc **levée** : un objectif existe sur
l'un des trois dossiers, il y a bien quelque chose à ratifier. La fenêtre
d'observation a matière.

Ce qui n'a pas pu se produire, c'est la **réponse**. À la date de cette écriture,
il n'y avait ni client au cockpit praticien pour porter le geste, ni envoi vers
le patient. Le patient de `PAT017` n'a jamais été informé qu'un objectif
l'attendait.

Et cette impossibilité est **permanente en l'état**, pas seulement passée :

- `notifierObjectifPropose` n'est appelée que sur les deux chemins de `create`
  (`web/src/app/api/praticien/objectifs/route.ts:877` et `:912`). **L'envoi se
  déclenche à l'écriture, jamais sur l'état.**
- Aucune relance, aucun renvoi n'existe : rien dans la route praticien ni dans le
  cockpit ne permet de faire partir le courrier d'un objectif déjà écrit.
- Un objectif écrit avant la mise en service de l'expéditeur ne produira donc
  jamais de courrier. Celui de `PAT017` est **muet par construction**.

Il n'est pas pour autant hors d'atteinte : la surface patient lit l'état, pas le
courrier. Si le patient de `PAT017` se connectait, la sonde du hub ouvrirait le
lien et l'objectif serait ratifiable. Mais rien ne lui donne de raison de se
connecter.

**Conséquence pour `D-093`.** Les six semaines n'ont pas mesuré une indifférence
du patient : elles ont mesuré une absence de réponse sur un canal qui n'existait
pas. C'est exactement le cas contre lequel `DC-24` met en garde, à l'envers — ici
l'absence de constat ne serait pas prise pour un feu vert, elle serait prise pour
un feu rouge, alors qu'elle n'est le constat de rien.

**Deux façons d'ouvrir réellement l'observation, aucune ne demandant de code :**

1. **Écrire une révision qui supersède la ligne existante.** Réviser AJOUTE une
   ligne — c'est un `create`, donc le courrier part. La chaîne reste à une seule
   tête si `supersedesObjectifId` est renseigné ; omis, elle en crée une seconde,
   et deux têtes ferment le geste des deux côtés (`route.ts:490` et `:618-624`).
   Réserve : réviser pour déclencher un envoi se sert d'un geste clinique comme
   d'un transport. Cela ne se fait que si la révision a par ailleurs lieu d'être.
2. **Prévenir le patient hors du produit**, et le laisser se connecter — la
   surface l'attend.

Une troisième voie demanderait du code : une action « relancer » qui envoie le
courrier d'un objectif déjà écrit, sans toucher à la chaîne. Elle relève de la
file d'attente, pas de cette décision.

### 4. La borne n'a ni exécutant ni définition

`D-093` se conclut par « Aucun code, aucun drapeau, aucune migration ». Rien ne
refermerait le périmètre le 2026-10-04 ; il y faudrait une décision de constat,
qui n'existe pas. Et « le périmètre se referme » n'est défini nulle part : ses
quatre occurrences au dépôt — `D-093` point 4, `D-112`, le `BILAN.md:112-116`, la
`GRILLE_CONSTATS_2026-10-04.md:223-225` — redisent toutes la même glose négative,
« il ne s'étend pas par défaut ». Aucune ne dit que `PAT006`, `PAT007` ou
`PAT017` perdraient quoi que ce soit. La lecture littérale du verbe (retour à
l'état antérieur) et la seule glose écrite (non-extension) ne coïncident pas.

### 5. Pourquoi abroger la borne et non la prolonger

Le dépôt refuse ailleurs de repousser une échéance, et il a raison : `D-078` §5
tient qu'« un écart sans terme cesse d'être un écart borné ». Cette règle vaut
pour un **écart**, c'est-à-dire pour une permission — une permission sans terme
devient illimitée, il lui faut une date.

`D-093` est l'inverse : une **restriction**. Une restriction sans terme ne dérive
pas, elle persiste. Lui retirer sa date ne l'affaiblit pas — cela la rend
inexpirable, ce qui sert `DC-24` mieux qu'une borne expirant dans une ambiguïté
que quatre textes n'ont pas levée.

Aucun précédent du dépôt ne prolonge une borne : il remplace (`D-089`), il abroge
(`D-121`), il neutralise une branche de clause (`D-155`), il gèle une échéance en
déplaçant l'objet voisin (`D-037`).

---

## Pièce 1 — texte de la décision, à placer en tête de `docs/DECISIONS.md`

### D-162 — La borne de six semaines de `D-093` est abrogée : une restriction n'a pas besoin de terme

- Date : 2026-09-09
- Statut : accepté (arbitrage du praticien)
- Amende : [[D-093]], point 4 (« borne de six semaines »). **Le reste de `D-093`
  est inchangé** — le périmètre, la relecture praticien, les deux conditions de
  sortie et la condition nommée de la généralisation demeurent.
- Domaine : gouvernance clinique — périmètre restreint des recommandations
  élargies

**Constat.** `D-093` intitule sa précondition « Précondition à lever avant que
l'observation puisse commencer », puis compte six semaines depuis sa propre date
de signature : le délai courait sur une fenêtre déclarée fermée le jour même.
`D-094` §3, prise le même jour et fondée sur `D-093`, interdit de persister
l'ordre servi (`schema.prisma:2405-2408`) — soit exactement la trace que la
condition (b) demande d'observer. Au 2026-09-08, un objectif négocié existe en
production, sur `PAT017`, dans le périmètre : la précondition est levée. Mais son
patient n'a jamais été informé — il n'y avait alors ni client au cockpit ni envoi
— et il ne peut plus l'être, `notifierObjectifPropose` ne partant qu'à l'écriture
(`route.ts:877`, `:912`) sans qu'aucune relance existe. Les six semaines ont
mesuré une absence de réponse sur un canal inexistant. Enfin la borne n'a
aucun exécutant — `D-093` ne pose ni code, ni drapeau, ni migration — et son verbe
« se referme » n'est glosé nulle part autrement que par « il ne s'étend pas par
défaut ».

**Décision :**

1. **La borne du 2026-10-04 est abrogée.** Elle n'est pas repoussée : l'index
   calendaire est retiré. Le 2026-10-04 ne redevient pas un point de contrôle à
   ce titre.
2. **Le périmètre n'est ni reconduit ni refermé ici.** Le praticien a annoncé le
   2026-09-09 un amendement propre l'ouvrant à tous les dossiers. La présente
   décision ne le préjuge pas et ne le porte pas : **elle retire la borne, et
   rien d'autre.** Jusqu'à cet amendement, le périmètre reste ce que `D-093`
   écrit, sans date d'expiration.
3. **Les deux conditions de sortie perdent leur objet si le périmètre s'ouvre.**
   Elles existaient pour sortir d'une restriction ; on ne sort pas d'une
   restriction qui n'existe plus. La condition (a) — une réponse patient réelle
   observée sur un objectif du périmètre — tombe avec elle, et c'est heureux :
   elle n'était atteignable ni en droit, l'objectif de `PAT017` étant muet par
   construction, ni en fait, aucun texte ne nommant le dossier porteur avant ce
   jour.
4. **Le bilan du classement survit, détaché de la mécanique de sortie.** Il
   n'était une condition que par accident de rédaction ; sa valeur propre est de
   documenter ce que la signature ne couvre pas. **Sa moitié descriptive est due
   et rédigeable aujourd'hui**, sans aucune lecture de production : producteur de
   candidats, ordre à trois termes, textes `LIMITATION_*`, périmètre du SHA.
   Sa moitié comportementale ne s'obtient que par rejeu de `construireChaineC1`,
   `D-094` §3 interdisant la trace en base ; elle n'est pas exigible et devient
   une pièce du futur dossier de signature.
5. **La clause de généralisation demeure, et elle vise l'amendement annoncé.**
   `D-093` conditionne la généralisation à l'entrée du classement, des textes
   `LIMITATION_*` et de l'ordre d'évaluation des motifs d'abstention dans un
   périmètre **signé** : « tant que ce n'est pas fait, aucune généralisation ne
   peut se réclamer d'une provenance certifiée » (`DC-01`, `DC-26`). Le classement
   n'est pas signé à ce jour (`lib/clinical/priorityRulesV1.ts:489-495`).
   **L'amendement qui ouvre le périmètre doit donc dire lequel des deux il fait**
   : signer d'abord, ou généraliser en ne se réclamant d'aucune provenance
   certifiée — ce que `D-094` §3 pratique déjà en retirant toute saillance à
   l'ordre servi (au plus trois propositions, sans numérotation ni mise en avant
   de la première). La seconde voie est ouverte ; elle n'est pas tacite.
6. **Ce que `D-093` garde d'intact** : la relecture praticien de chaque
   recommandation avant remise, et ses trois interdits — pas de recommandation
   élargie sans relecture, pas de modification du classement ni des textes
   `LIMITATION_*`. Ce sont eux, et non la borne, qui portaient la retenue.

**Ce que cette décision N'AUTORISE PAS** : l'envoi d'une recommandation élargie
sans relecture, et toute modification du classement ou des textes `LIMITATION_*`.
Elle n'ouvre par elle-même aucun périmètre : l'élargissement annoncé se fait par
son propre amendement, daté, qui dira s'il signe d'abord ou s'il généralise sans
provenance certifiée.

- Conséquences : fragment `changelog.d/2026-09-09-abrogation-borne-d093.md`.
  Aucun code, aucun drapeau, aucune migration.

---

## Pièce 2 — addendum à insérer sous le point 4 de `D-093`

À placer immédiatement sous le point 4, sans toucher une ligne au-dessus, selon
la forme employée par `D-155` sous `D-049` :

```
> **AMENDÉE le 2026-09-09 par [[D-162]] — la borne est abrogée ; le périmètre
> relève d'une décision propre.** Le délai courait depuis une date à laquelle le point 1 ci-dessus
> déclare l'observation non commencée ; `D-094` §3 interdit par ailleurs la trace
> que la condition (b) demande d'observer. L'objectif écrit sur `PAT017` n'a
> jamais atteint son patient — ni cockpit ni envoi à l'époque, et
> `notifierObjectifPropose` ne part qu'à l'écriture : les six semaines ont mesuré
> un silence sur un canal inexistant. Le 2026-10-04 ne redevient pas un point de
> contrôle. **Le périmètre n'est pas touché ici** : il ne porte plus de date, et
> ne s'étend que par une décision propre.
```

---

## Pièce 3 — fragment `changelog.d/2026-09-09-abrogation-borne-d093.md`

```markdown
### Gouvernance

- La borne de six semaines de `D-093` (échéance 2026-10-04) est abrogée. Elle
  comptait depuis une date à laquelle la décision déclarait sa propre fenêtre
  d'observation non ouverte, et sa condition (b) portait sur une trace que
  `D-094` §3 interdit d'écrire. Le périmètre des recommandations élargies reste
  restreint à trois dossiers, désormais **sans terme** : il ne s'étend que par
  une décision datée. Aucun code, aucun drapeau, aucune migration (`D-162`).
```

---

## Ce que cette proposition ne tranche pas

- ~~Sur quel dossier porte l'unique objectif négocié de production.~~ **Répondu
  le 2026-09-09 par le praticien : `PAT017`, dans le périmètre.** Aucune lecture
  de production n'est donc plus nécessaire pour trancher la borne.
- **Comment porter à son patient l'objectif déjà écrit de `PAT017`** — révision
  qui supersède, avis hors produit, ou action « relancer » à construire. Le choix
  décide de la date à laquelle l'observation commence pour de bon.
- ~~Si le praticien accepte la moitié descriptive du bilan comme condition (b)
  suffisante.~~ **Tranché le 2026-09-09** : le bilan cesse d'être une condition
  de sortie et devient un document dû en propre ; sa moitié descriptive est due,
  sa moitié comportementale ne l'est pas.
- ~~Le sort du périmètre.~~ **Tranché le 2026-09-09** : le praticien amendera
  `D-093` pour l'ouvrir à tous les dossiers, par une décision propre. Reste à
  cet amendement de dire s'il signe le classement d'abord, ou s'il généralise
  sans se réclamer d'une provenance certifiée (point 5 ci-dessus).
- **Le rejeu de `construireChaineC1`** — s'il vaut la peine d'être programmé, ou
  si la moitié comportementale du bilan est abandonnée en connaissance de cause.
