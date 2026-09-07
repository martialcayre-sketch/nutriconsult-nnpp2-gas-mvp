### Une porte qui n'a pas cédé ne se lit plus comme une porte jamais poussée (2026-09-07)

Deux dossiers vides de la même façon n'appellent pas le même geste. L'un
attend : personne n'a poussé la porte. L'autre appelle une action : le lien a
été présenté et refusé — expiré, déjà consommé, fermé par une révocation.
L'encart des dossiers neufs les confondait sous « Jamais connecté », et le
signal n'atteignait jamais le praticien.

Une étape `entree_refusee` s'intercale, et elle raffine `jamais_connecte`
plutôt qu'elle ne le remplace.

**Ce que la relecture a retiré du correctif, et pourquoi c'est mieux ainsi.**

- **Le versant Google ne sera pas lu.** L'intention était de compter aussi les
  refus Google. Ils ne peuvent rien remonter : le seul refus Google qui NOMME
  un dossier (`portail/google/retour`, motif `sans_espace_eligible`) est écrit
  sous la garde `!patient.actif || patient.accessTokenRevoked`. Croisé avec le
  filtre « dossiers ouverts », l'ensemble est vide par construction. Un banc
  l'aurait « prouvé » en nourrissant le double d'une ligne que la base ne peut
  pas contenir.
- **Le compteur ne dit pas « le patient a cliqué ».** L'atterrissage incrémente
  sur tout `GET` dont l'empreinte résout une ligne, sans authentification
  préalable : un scanner de liens de passerelle e-mail, un destinataire à qui
  le message a été fait suivre. Le libellé « Entrée refusée » survit — il nomme
  la porte, pas la personne — mais les commentaires qui affirmaient le contraire
  sont corrigés.
- **Le nombre de tentatives ne s'affiche pas.** L'item s'intitulait « cent
  tentatives » ; l'encart dit qu'il y en a eu. Afficher le compte demanderait
  une colonne de plus et un arbitrage d'affichage.

**L'arbitrage praticien est tenu deux fois.** L'agrégation se fait hors
dossiers désactivés et révoqués — et l'ordre des étapes nomme déjà ces deux
fermetures avant de regarder le refus. C'est une ceinture sur des bretelles, et
le commentaire le dit : retirer l'un des deux ne casse rien de visible, donc on
ne retire ni l'un ni l'autre.

**Le banc du filtre honore le `where`.** Un double à valeur fixe rendrait les
mêmes lignes filtre ou pas, et ne pourrait asserter que la forme de la requête.
Ici cent tentatives existent pour deux dossiers fermés, et seul le filtre décide
si elles remontent.

Cinq mutants joués, cinq tués : retirer l'étape, lire le refus sur un dossier
déjà entré, la placer avant « accès non envoyé », agréger sur tous les dossiers,
retirer le seuil « au-dessus de zéro ».

Aucune migration, aucun point d'écriture touché, aucun seuil de scoring.
