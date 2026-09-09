# Proposition — abroger la borne du 2026-10-04, garder le périmètre

- Date de rédaction : 2026-09-09
- Statut : **PROPOSÉE, NON ADOPTÉE**. L'arbitrage appartient au praticien, comme
  celui de `D-093` lui-même.
- Porte sur : `D-093`, point 4 (« borne de six semaines »). Rien d'autre.

Ce fichier contient trois pièces prêtes à prendre : le texte de la décision,
l'addendum à insérer sous `D-093`, le fragment de changelog. Le numéro `D-160`
y est écrit parce qu'un trou est refusé par
`scripts/lib/decisions-numerotation.mjs` ; il se reprend au merge.

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

### 3. La précondition n'est ni levée ni impossible à lever : elle est inattribuable

Au 2026-09-08 (lecture de production rapportée par `D-154` §1) : 4 propositions,
1 objectif négocié, 0 ratification, 0 amendement, 0 réponse de jalon. Un objectif
existe donc. Mais **aucun texte du dépôt ne nomme le dossier qui le porte**, et
`WN_OBJECTIF_PROPOSE_PATIENTS` est vide — la surface est ouverte à tous les
dossiers courants, pas aux trois du périmètre. La grille du 2026-08-28 avertit
elle-même qu'une proposition hors périmètre ne satisfait pas la condition (a)
(`GRILLE_CONSTATS_2026-10-04.md:33-42`).

Une borne qui tomberait le 2026-10-04 tomberait sur un état inconnu.

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

### D-160 — La borne de six semaines de `D-093` est abrogée : une restriction n'a pas besoin de terme

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
production mais aucun texte ne nomme son dossier, et `WN_OBJECTIF_PROPOSE_PATIENTS`
étant vide, rien ne garantit qu'il appartienne au périmètre. Enfin la borne n'a
aucun exécutant — `D-093` ne pose ni code, ni drapeau, ni migration — et son verbe
« se referme » n'est glosé nulle part autrement que par « il ne s'étend pas par
défaut ».

**Décision :**

1. **La borne du 2026-10-04 est abrogée.** Elle n'est pas repoussée : l'index
   calendaire est retiré. Le 2026-10-04 ne redevient pas un point de contrôle à
   ce titre.
2. **Le périmètre reste `PAT006`, `PAT007`, `PAT017`, et eux seuls, sans terme.**
   Il ne s'étend que par une décision datée qui le dise. Le défaut devient donc
   « reste restreint » au lieu de « expire dans une ambiguïté » — ce qui est une
   retenue plus forte, non plus faible, et conforme à `DC-24` : rien ne s'ouvre
   par silence.
3. **La condition (a) devient attribuable.** Une réponse patient ne vaut que si
   elle porte sur un objectif d'un dossier du périmètre, **nommé par identifiant
   au moment du constat**. Une proposition servie hors périmètre ne la satisfait
   pas, quel qu'en soit le retour.
4. **La condition (b) est scindée.** Sa moitié descriptive — producteur de
   candidats, ordre à trois termes, textes `LIMITATION_*`, ce que le SHA couvre et
   ce qu'il laisse dehors — est due et rédigeable sans aucune lecture de
   production. Sa moitié comportementale ne s'obtient que par **rejeu** de
   `construireChaineC1`, `D-094` §3 interdisant la trace en base ; à défaut de ce
   rejeu, elle n'est pas exigible et ne bloque pas la moitié descriptive.
5. **Ce qui ferme réellement le sujet reste inchangé** : faire entrer le
   classement, les textes `LIMITATION_*` et l'ordre d'évaluation des motifs
   d'abstention dans un périmètre signé (`D-093`, « condition nommée de la
   généralisation ultérieure »). C'est un travail, pas un délai — il ne reçoit
   donc pas de date ici.

**Ce que cette décision N'AUTORISE PAS** : la généralisation à d'autres dossiers,
l'envoi d'une recommandation élargie sans relecture, et toute modification du
classement ou des textes `LIMITATION_*`. Les trois interdits de `D-093` sont
repris tels quels.

- Conséquences : fragment `changelog.d/2026-09-09-abrogation-borne-d093.md`.
  Aucun code, aucun drapeau, aucune migration.

---

## Pièce 2 — addendum à insérer sous le point 4 de `D-093`

À placer immédiatement sous le point 4, sans toucher une ligne au-dessus, selon
la forme employée par `D-155` sous `D-049` :

```
> **AMENDÉE le 2026-09-09 par [[D-160]] — la borne est abrogée, le périmètre
> demeure.** Le délai courait depuis une date à laquelle le point 1 ci-dessus
> déclare l'observation non commencée ; `D-094` §3 interdit par ailleurs la trace
> que la condition (b) demande d'observer. Le 2026-10-04 ne redevient pas un
> point de contrôle. **Le périmètre reste `PAT006`, `PAT007`, `PAT017` sans
> terme, et ne s'étend que par décision datée.**
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
  une décision datée. Aucun code, aucun drapeau, aucune migration (`D-160`).
```

---

## Ce que cette proposition ne tranche pas

- **Sur quel dossier porte l'unique objectif négocié de production.** Une lecture
  par identifiants seuls le dirait ; elle n'a pas été faite ici. Tant qu'elle ne
  l'est pas, la condition (a) reste inattribuable, et c'est le seul point qui
  demanderait la production.
- **Si le praticien accepte la moitié descriptive du bilan comme condition (b)
  suffisante**, ou s'il la tient pour une simple pièce du futur dossier de
  signature.
- **Le rejeu de `construireChaineC1`** — s'il vaut la peine d'être programmé, ou
  si la moitié comportementale du bilan est abandonnée en connaissance de cause.
