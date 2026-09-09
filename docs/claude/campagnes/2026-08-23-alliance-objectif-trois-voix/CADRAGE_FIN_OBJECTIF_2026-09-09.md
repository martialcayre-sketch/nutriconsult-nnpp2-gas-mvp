# Cadrage — la fin de l'objectif, et ce qui vaut accord

- Date : 2026-09-09
- Objet : la pièce qui manque pour passer de l'objectif partagé à la prise de
  décision (protocole, biologie, compléments)
- Statut : **texte de décision prêt à prendre.** Le numéro s'acquiert au merge.
- Numérotation : trois textes de décision sont en vol au 2026-09-09 — abrogation
  de la borne `D-093`, deux listes de sources citables, et celui-ci. Chacun
  écrit un numéro parce qu'un trou est refusé par
  `scripts/lib/decisions-numerotation.mjs` ; ils se renumérotent dans l'ordre
  des merges.

## Le constat : deux faits de chaîne mal logés

Une chaîne d'objectif porte deux faits qui ne sont **pas** des propriétés d'une
version : **s'est-on accordé**, et **est-ce fini**. Aujourd'hui le premier est
logé dans une colonne de version et le second n'existe pas.

**L'état d'accord fonctionne, et il ne doit pas être terminal.** `etatRatification`
lit le dernier geste sur les deux tables ensemble, filtré sur l'identifiant exact
de version (`lib/praticien/objectifNegocie.ts`). Une révision repart donc à
`en_attente`, ce qui est juste : un accord donné sur une formulation ne vaut pas
sur la suivante. Mais cela interdit d'en faire une fin — un objet qui se refermerait
à la ratification se refermerait au moment même où le travail commence, et chaque
révision de suivi rouvrirait un objet « clos ».

**La fin de chaîne n'existe pas.** Aucune colonne de statut au modèle
(`schema.prisma`, `model ObjectifNegocie`) : ni atteint, ni abandonné, ni clos.
Le seul renoncement exprimable est le couple `nonTraiteMotif` /
`nonTraiteDepuisLe`, porté par une version et perdu si la révision suivante ne le
recopie pas.

**Et `negocieLe` est le symptôme des deux.** La date « Convenu le », lue par le
patient, est une colonne de version saisie à la main. Deux conséquences, et la
seconde est la grave :

- elle ne survit pas à une révision — ce qui est **défendable**, pour la raison
  ci-dessus, et n'est donc pas le défaut ;
- le formulaire n'est **jamais démonté** et aucune des annulations ne le vide
  (`ObjectifNegociePanel.tsx:383`, `:528`, `:1251` ; la reprise à la révision
  repropage `reformulation`, `priorite`, `nonTraiteMotif`, `nonTraiteDepuisLe` —
  jamais `negocieLe`, `:1084-1089`). Une date saisie puis abandonnée survit dans
  l'état et **part avec la version choisie ensuite**. Ce n'est pas une perte,
  c'est une **date fausse affichée au patient**.

Un fait de chaîne rangé dans une colonne de version est à la fois perdable et
falsifiable. C'est la même erreur de logement qui produit les deux.

## L'arbitrage : une preuve et un témoignage ne se rangent pas dans le même champ

`negocieLe` est déclarée **à la main par le praticien**. Dans un dossier à deux
voix, une voix peut donc affirmer un accord que l'autre n'a pas donné : « Convenu
le 3 septembre » s'affiche chez un patient qui n'a jamais rien ratifié.

**Deux réponses simples sont fausses, et il faut le dire.**

*Ne compter que la ratification au portail* falsifierait le dossier. Un accord se
conclut le plus souvent dans le cabinet, pas derrière un écran. Exiger un clic
pour enregistrer ce qui a été dit en face à face reviendrait à effacer un fait
réel, et à pousser la pratique vers un théâtre — faire cliquer un patient sur ce
qu'il vient de dire.

*Garder le champ tel quel* laisse une voix parler pour deux, sans que le patient
puisse le savoir.

**Ce qui les départage est leur nature, pas leur exactitude.** Une ratification au
portail est un **geste du patient**, daté par la base, indéclarable : c'est une
**preuve**. Un accord conclu en consultation est une **attestation du praticien**,
datée par lui : c'est un **témoignage**. Les deux sont légitimes et souvent vrais.
Ils ne sont pas de la même espèce, et les ranger dans un seul champ nullable fait
passer la parole de l'un pour l'acte de l'autre — devant l'intéressé.

D'où la règle qui suit, et qui est la seule asymétrie à retenir : **le témoignage
cède à la preuve, jamais l'inverse.**

---

## Texte de décision, à placer en tête de `docs/DECISIONS.md`

### D-161 — La fin de l'objectif se dit par une ligne, et l'accord a deux formes qui ne se confondent pas

- Date : 2026-09-09
- Statut : accepté (arbitrage du praticien, rendu en session le 2026-09-09)
- Porte sur : [[D-094]] (régime de l'objectif à trois voix), la chaîne
  `objectifs_negocies` et les deux tables de retour patient. N'amende aucune
  clause existante : ajoute ce qu'aucune ne dit.
- Domaine : doctrine produit — campagne Alliance 6.0-B, passage de l'objectif
  partagé à la prise de décision

**Constat.** Une chaîne d'objectif porte deux faits qui ne sont pas des
propriétés d'une version — s'est-on accordé, est-ce fini. Le premier est logé
dans une colonne de version saisie à la main, ce qui le rend à la fois perdable
et falsifiable ; le second n'existe pas. Rien ne permet donc de dire qu'une
négociation est conclue, et le protocole se poserait sur un accord que le modèle
ne sait pas exprimer.

**Décision :**

1. **Deux états distincts, et l'un n'est pas l'autre.** L'**état d'accord** est
   une propriété de version, déjà dérivée du dernier geste, et **n'est jamais
   terminal**. La **fin de chaîne** est une propriété de chaîne, et c'est elle
   qui manque. Confondre les deux ferme l'objet au moment où le travail commence.
2. **L'accord a deux formes, également recevables.** La **ratification au
   portail** est un geste du patient, daté par la base : une preuve. L'**accord
   attesté en consultation** est une déclaration du praticien, datée par lui : un
   témoignage. Un accord se conclut le plus souvent dans le cabinet — exiger un
   clic pour l'enregistrer effacerait un fait réel.
3. **Le témoignage cède à la preuve, jamais l'inverse.** Un accord attesté par le
   praticien reste contredisible par le patient au portail, et cette contradiction
   l'emporte. Une ratification ne se défait par aucune déclaration du praticien.
4. **Le patient voit laquelle des deux il lit.** « Convenu le » sans mention de
   provenance laisse croire à un accord qu'il aurait donné. Chaque affichage
   d'accord porte sa source — son geste, ou la parole du praticien.
5. **La fin de chaîne se dit par une LIGNE, jamais par une colonne qu'on
   écrase**, et cette ligne référence la **racine** de la chaîne — l'objectif dont
   `supersedesObjectifId` est nul —, pas sa tête. La racine ne bouge jamais : une
   fin ainsi attachée survit à toute révision, et ne peut pas se retrouver
   orpheline. Se rouvrir est une ligne de plus, dans le régime déjà tenu par le
   dépôt.
6. **Trois motifs de fin, et trois seulement** : **atteint**, **abandonné** — avec
   son motif écrit, dont `nonTraiteMotif` est la graine à promouvoir de la version
   à la chaîne — et **remplacé**, portant la racine de la chaîne qui prend la
   suite. Toute extension de cette liste est une décision `D-xxx` nouvelle.
7. **« Atteint » se déclare à DEUX VOIX ; « abandonné » se prend seul.** Une
   réussite ne se constate pas seul : il y faut le geste du praticien ET celui du
   patient. L'ordre est libre — l'un propose la fin, l'autre la confirme —, et
   c'est exactement la forme sous laquelle l'objectif s'est négocié : la fin se
   négocie comme le début. Tant qu'une seule voix s'est prononcée, **la chaîne
   n'est pas achevée** : elle porte une fin **proposée**, que l'autre voix peut
   confirmer ou refuser. Un refus n'est pas une panne du mécanisme, c'est un
   signal — il reste lisible et ne s'efface pas, au même titre qu'une
   contestation.

   **Le renoncement, lui, reste unilatéral et motivé.** Exiger deux voix pour
   abandonner condamnerait à l'inachèvement toute chaîne dont le patient ne
   répond plus — on aurait rebâti, à la sortie, le défaut que cette décision
   existe pour fermer. La règle tient en une phrase : *on ne conclut pas seul à
   une réussite ; on renonce seul, et on le dit.* « Remplacé » suit le même
   régime que l'abandon, étant un geste d'organisation du suivi et non un
   jugement sur le résultat.

8. **La clôture du suivi rend la chaîne INACTIVE, elle ne l'achève pas.** Rien ne
   s'écrit : l'état se dérive de la clôture, et se défait si le suivi rouvre. Une
   fin est un geste, pas une conséquence administrative.
9. **« Atteint » ne dit rien d'une cause.** Il dit que l'objectif n'est plus ce
   sur quoi on travaille, jamais qu'une intervention l'a produit (`DC-27`). Aucun
   décompte, aucune moyenne, aucune note — ni des accords, ni des fins
   (`DC-19`, `DC-24`).
10. **Ce qui autorise le passage à la prise de décision** — protocole, bilan
   biologique, compléments — tient en trois conditions cumulatives : une **seule
   tête** de chaîne ; un **accord** sur cette tête, sous l'une ou l'autre forme ;
   la chaîne **non achevée**. Le rail ne peut pas servir de feu : le statut de la
   phase 3 ne lit aujourd'hui que les couvertures des douze besoins
   (`FichePatientPanel.tsx:747-749`), et affiche « renseignée » sur un dossier
   sans le moindre objectif.
11. **`negocieLe` cesse d'être saisie sur la version.** La date d'accord se lit
    depuis le fait qui la porte — geste du patient, ou attestation du praticien.
    Tant que la colonne subsiste, le formulaire doit être vidé à chaque bascule
    de mode, sans quoi une date abandonnée repart avec la version suivante.

**Ce que cette décision N'AUTORISE PAS** : déclarer un accord au nom du patient
sans dire que c'est le praticien qui parle ; faire de la ratification un terminus ; conclure seul à un « atteint » ;
écraser une fin par un `UPDATE` ; compter, moyenner ou noter des accords ou des
fins ; tirer d'un « atteint » une affirmation causale.

**Ce que cette décision NE FAIT PAS.** Aucune migration n'est écrite ici et
`schema.prisma` n'est pas touché : le modèle requis est décrit, sa mise en œuvre
demande un feu vert explicite. Et elle ne corrige pas le blocage connu — deux
têtes de chaîne sans verbe de départage ferment les trois gestes du patient en
409 ; tant qu'il n'existe pas, la première des trois conditions du point 10 n'est
pas garantie.

- Conséquences : fragment `changelog.d/2026-09-09-fin-objectif-et-formes-de-accord.md`.
  Aucun code, aucune migration, aucun drapeau dans cette décision.

---

## Fragment `changelog.d/2026-09-09-fin-objectif-et-formes-de-accord.md`

```markdown
### Doctrine produit

- Une chaîne d'objectif porte deux faits qui ne sont pas des propriétés d'une
  version : **s'est-on accordé** et **est-ce fini**. L'état d'accord existe déjà
  et n'est **jamais terminal** — le rendre terminal fermerait l'objet au moment
  où le travail commence. La fin de chaîne, elle, se dit par une **ligne**
  append-only référençant la **racine** de la chaîne, avec trois motifs :
  atteint, abandonné, remplacé. La clôture du suivi rend la chaîne inactive sans
  l'achever. Et l'accord a deux formes qui ne se confondent pas : la ratification
  au portail est une **preuve**, l'accord attesté en consultation est un
  **témoignage** — le témoignage cède à la preuve, jamais l'inverse, et le patient
  voit toujours laquelle des deux il lit. Enfin **« atteint » se déclare à deux
  voix** — la fin se négocie comme le début, et tant qu'une seule s'est prononcée
  la chaîne porte une fin *proposée* — tandis que le renoncement reste
  unilatéral et motivé : on ne conclut pas seul à une réussite, on renonce seul
  et on le dit (`D-161`).
```

---

## Ce que le cadrage laisse à faire, et dans quel ordre

1. **Le verbe de départage de deux têtes.** Inchangé depuis le cadrage précédent :
   c'est le seul vrai blocage, il conditionne le bouton « Reprendre cette phrase »,
   et sans lui la première condition du point 9 n'est jamais garantie.
2. **Le vidage du formulaire à chaque bascule de mode** (6-12 lignes) : il retire
   la date fausse sans attendre le modèle. À faire en premier parmi les
   réparations, parce qu'un patient lit aujourd'hui une date qui peut être
   inventée.
3. **Le modèle de la fin** — une table d'événement, racine référencée, trois
   motifs — qui demande une migration, donc un feu vert explicite.
4. **La source de l'accord à l'affichage**, côté patient comme côté praticien.
5. **Le rail**, qui doit cesser de dire « renseignée » sur un dossier sans
   objectif : point 10, dernière phrase.

**Question tranchée le 2026-09-09 : les deux voix déclarent « atteint ».** Elle
était laissée ouverte à la rédaction ; le praticien l'a rendue le jour même. Le
point 7 ci-dessus la porte, avec l'asymétrie qui en découle — atteint à deux,
renoncement seul.

**Ce que cette règle hérite, et qu'il faut regarder en face.** Un « atteint » qui
attend la voix du patient hérite de TOUS les défauts du chemin de retour
inventoriés le 2026-09-09 : l'envoi ne part qu'à l'écriture et aucune relance
n'existe, le courrier ne conduit pas au dossier, aucune surface du portail ne
signale qu'une chose attend, et rien ne revient au praticien quand le patient
s'est prononcé. Une chaîne pourrait donc rester inachevée non parce que le
patient est en désaccord, mais parce qu'il n'a **jamais été prévenu** — le même
mécanisme, exactement, qui a rendu les six semaines de `D-093` inobservables.

**La question qui reste, et elle est du même ordre que la précédente** : que fait
un « atteint » proposé que la seconde voix ne vient jamais confirmer ? Trois
réponses se tiennent — le laisser en attente indéfiniment, autoriser le praticien
à le convertir en renoncement motivé, ou lui permettre d'**attester** la fin comme
il atteste un accord en consultation, marquée comme telle et cédant à la preuve
si le patient se prononce ensuite. La troisième est la plus cohérente avec le
point 3, mais elle rouvre exactement ce que le point 7 vient de fermer. Elle
n'est pas tranchée ici.
