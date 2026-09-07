### « Envoyé » ne s'affiche plus quand rien n'est parti (2026-09-07)

`envoyerAccesTrace` rendait `void`, et trois `catch` muets avalaient l'échec en
répondant `success: true`. L'écran annonçait donc « lien d'accès envoyé au
patient » sur un e-mail qui n'était jamais parti — et le patient attendait un
message qui n'arriverait pas.

La fonction rend désormais `'Envoye' | 'Non_envoye'`, et les routes portent un
champ `envoi` à trois valeurs. **`success` ne parle que de l'écriture en base ;
`envoi`, et lui seul, parle de l'e-mail.**

**Trois cas et non deux, parce qu'ils appellent trois gestes.** « Échoué »
invite à réessayer ; « messagerie non configurée » ne le fait pas — réessayer
n'a aucun sens tant qu'aucun SMTP n'est posé ; « envoyé » ne dit rien de plus.
La distinction se tient jusque dans la fonction : `Non_envoye` se REND, l'échec
se RELANCE. Les confondre rendrait un envoi mort indistinguable d'une
messagerie absente.

**« Copier le lien » ne dit RIEN de l'envoi**, et c'est une garde à part
entière : cette action n'envoie aucun e-mail, donc son champ `envoi` est
absent. Poser « envoyé » par défaut aurait fait annoncer un message parti là où
rien n'a jamais été tenté.

**Deux comportements d'écran, délibérément différents.** À la création de
consultation, le tiroir se ferme et la ligne reste verte même sur envoi mort :
la consultation EST créée, et laisser le tiroir ouvert sur un dossier existant
inviterait à la double soumission. C'est le texte qui porte l'échec, et il dit
quoi faire. Sur les deux actions du menu — répétables, sans tiroir — la ligne
rougit franchement.

**Ce qui a été retiré du correctif.** Un import de `lib/consultation/email`
dans le composant client : ce module tire `nodemailer` via `transportSmtp`, et
un import de valeur l'embarquerait au bundle. Le type vient du DTO de route,
déjà importé — la faute devient impossible plutôt que surveillée. Et un cas de
banc sur « Copier le lien », inexécutable en jsdom sans stub de
`navigator.clipboard` et sans assassin : ce chemin est gardé côté route.

**Trois prérequis de banc manquaient**, et sans eux les cas du lien magique
mesuraient l'inverse de ce qu'ils croyaient : le drapeau `WN_G4_LIEN_MAGIQUE`
(éteint par défaut, la route répond 404), `NEXTAUTH_SECRET` (sans quoi
l'empreinte du jeton lève), et `portailMagicLink.create` absent du double.

Onze mutants joués, onze tués.

Borne inscrite dans le type : « envoyé » signifie que le SMTP a accepté la
transaction, pas que la boîte du patient l'a reçu. Un destinataire rejeté au
sein d'une transaction acceptée reste compté « envoyé » — résidu antérieur,
nommé pour que personne ne lise ce champ comme un accusé de réception.

Aucune migration, aucun seuil de scoring.
