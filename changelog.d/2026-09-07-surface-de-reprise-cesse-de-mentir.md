### Modifié

- **La surface de reprise cesse d'affirmer ce qui n'est plus vrai** (`A11` de
  l'audit du 2026-09-06). Quatre fichiers sont lus au démarrage d'une session et
  fournissent ses prémisses : `CLAUDE.md`, `.wn/state.json`,
  `docs/claude/PROJET_CONTEXTE.md` et `docs/ROADMAP_TECHNIQUE.md`. Trente-neuf
  affirmations y étaient fausses, périmées ou en contradiction avec un autre
  passage du même fichier — chacune recoupée sur source primaire, puis soumise à
  une contre-épreuve à charge de la réfuter, qui en a écarté quinze.
- **La constitution disait ses garde-fous absolus ; ils ne le sont pas.**
  `CLAUDE.md` affirmait « aucune variable d'environnement ne les désactive »
  alors que `.claude/hooks/block-risky-commands.mjs:16` sort sans rien lire si
  `WN_ALLOW_RISKY_COMMAND=1`, et que le crochet d'écriture n'arme que
  `Edit|Write` — une écriture par `Bash` n'y passe pas, ce que le fichier de
  détail disait déjà. Une garde qu'on croit absolue dispense de vérifier :
  c'était la plus coûteuse des trente-neuf.
- **Le socle annoncé rejoint le socle qui tourne** : Next.js 14 → 15 dans les
  trois fichiers qui le déclaraient, au lendemain de la marche en 15.5.25.
- **Vercel et Supabase quittent les documents comme ils ont quitté la
  production** le 2026-09-01 (`D-080`, `D-120`) : le schéma d'architecture
  dessinait encore « Vercel (Next.js 14) · région fra1 » au-dessus d'un
  « PostgreSQL (Supabase) », et les secrets de production étaient dits portés
  par des « variables Vercel ». La base de production est l'add-on PostgreSQL
  Scalingo, non exposé à Internet, et elle se lit par conteneur — pas par un
  outil MCP dont la base n'existe plus.
- **Le portail patient est décrit tel qu'il authentifie** : le segment de
  `/portail/[token]` est l'`idPatient` et non un secret, les colonnes de valeur
  du jeton ayant été purgées le 2026-08-22 (`D-085` §5). L'unique credential est
  le cookie signé `wn_portail`, posé par le lien magique ou par Google. Deux
  entités décrites comme « legacy » ne l'étaient pas : `api/patient/*` est le
  back-end vivant du portail, quand la page `patient/[idAssignation]`, elle,
  n'existe plus depuis le 2026-08-08 et figurait encore dans deux cartographies.
- **`.wn/state.json` : la tête de reprise est poussée, l'ancienne démotée.** Le
  champ `next_action` est une pile dont les entrées démotées portent
  `[trace … — ancienne tête remplacée]` ; personne n'avait poussé de tête depuis
  le 2026-08-23, si bien qu'elle annonçait une campagne **terminée depuis le
  2026-08-25** et que la campagne active n'était nommée dans aucune des trente
  et une entrées. Le champ `blocking_issues` retenait un gate clos par `D-121`
  et présentait le décommissionnement comme suspendu à une signature déjà
  obtenue ; `last_completed_lot` accusait vingt lots de retard en 7 750
  caractères, dont l'histoire est au registre (`D-068` à `D-073`). L'archive
  n'est pas réécrite : seules les entrées vives le sont.

### Outillage

- **Un quatrième garde de cohérence d'état** (`scripts/wn-etat-reel.mjs`,
  `comparerEtat`) : la tête de `next_action` est confrontée à `active_campaign`.
  Les trois gardes existants comparaient des dates et des ordinaux de lot ; aucun
  ne lisait ce que l'état **raconte**, et les vingt-quatre tests du banc passaient
  au vert au-dessus de la contradiction. Déterministe comme les gardes 2 et 3 —
  deux champs du même fichier, aucune horloge —, il ne lit que l'entrée 0 et ne
  touche jamais aux traces : les relire rendrait rouge toute campagne close
  correctement citée. Réparation nommée dans le message d'échec.
- Le banc passe de 24 à 29 tests, les 24 d'origine inchangés. Le garde a été
  posé **avant** la correction et constaté rouge sur le dépôt réel, puis vert
  après elle.
