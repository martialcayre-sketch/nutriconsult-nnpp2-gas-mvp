### Atelier de règles — les références sources deviennent saisissables (`D-131`)

`clinical_rules.source_reference_id` est NOT NULL et la route de création refuse
toute règle dont la source n'existe pas. Or **aucun écrivain de
`supplement_source_references` n'existait** — ni route, ni seed, ni script.
L'atelier de règles, qui fonctionne par ailleurs, était structurellement
incapable de créer sa première règle : le catalogue C4 n'était pas vide par
politique, il n'était pas remplissable.

État lu en production par conteneur le 2026-09-06, première lecture de ces
tables depuis le cutover : les six tables de décision à 0, pour 3 444
ingrédients.

`POST /api/praticien/regles/sources` ouvre la curation manuelle praticien que
`LOT-00-AUDIT-SOURCES` prescrit et que la décision n°11 du moteur d'intention
autorise — aucun flux externe n'écrit dans ce référentiel. Le formulaire vit
dans l'atelier, sous le vocabulaire gouverné, et recharge la liste après ajout :
sans quoi la source existerait en base et resterait absente du formulaire de
règle.

Trois refus : citation vide (une source sans citation ne référence rien), lien
non `http(s)` (un lien qui ne s'ouvre pas promet une vérification qu'il ne
permet pas ; `javascript:` dans un champ rendu en lien est une injection), et
citation déjà présente — garde applicative, la contrainte d'unicité en base
restant due.

**Ce que ça n'ouvre pas** : alertes de sécurité, catégories et seuils
fonctionnels restent sans écrivain — ils portent du contenu clinique chiffré
(`DC-19`, `DC-20`) et leur chemin se pose avec le cadre qui le vérifie. Une
règle peut désormais naître ; elle ne produira encore aucune intention, faute de
catalogue d'alertes publié et de seuils actifs.
