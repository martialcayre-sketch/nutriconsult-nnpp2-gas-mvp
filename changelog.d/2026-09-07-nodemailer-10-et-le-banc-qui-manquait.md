### Sécurité — nodemailer 10, et le banc qui manquait

`nodemailer` passe de 7.0.13 à **10.0.1**. Six avis tombent, dont le seul
`high` : l'option `raw` d'un message contourne `disableFileAccess` et
`disableUrlAccess` (plage `<=9.0.0`). L'avis `next-auth` tombe avec eux — il ne
tenait qu'à cette dépendance. **17 → 15 paquets vulnérables.**

- **`@types/nodemailer` est retiré**, et il était en `dependencies`, non en
  `devDependencies`. La 10 embarque ses propres définitions
  (`types: ./dist/cjs/nodemailer.d.ts`).
- **Un `overrides` rabat l'exemplaire de `next-auth`** sur le nôtre : il exige
  `^7.0.7` et aucune version publiée n'admet la 10. Sans effet ici — seul
  `GoogleProvider` est instancié (`lib/auth.ts:54`), aucun `EmailProvider`, donc
  son chemin nodemailer est mort.
- `engines` (`node: 22.x || 24.x`) couvrait déjà le `>=20.0.0` de la 10.

**Le vrai risque du lot n'était pas la version majeure.** `transportSmtp.ts`
borne les trois timeouts SMTP en les APPENDANT à l'URL de connexion, et parie
que nodemailer les relise depuis ses query params — pari que le source déclarait
« vérifié sur la version installée », c'est-à-dire à la main, une fois, en 7. Or
le banc existant mocke `createTransport` de bout en bout : il prouve la **forme**
de l'URL, et rien du fait qu'elle soit lue. Un parseur qui diverge aurait fait
s'évaporer les trois bornes **en silence**, et un serveur SMTP qui pend aurait de
nouveau bloqué une requête indéfiniment sur un conteneur persistant — le défaut
exact que ce fichier existe pour tuer.

`transportSmtp.reel.test.ts` (neuf) tourne donc **sans `vi.mock`**, sur le vrai
module, et assère les options réellement parsées : les trois timeouts en nombres,
l'hôte, le port, les identifiants à caractères spéciaux non ré-encodés, et la
query préexistante préservée. Aucun réseau — `createTransport` ne fait que
construire et parser.

C'est ce banc qui rend la montée **vérifiée** plutôt que supposée : il est vert
sur la 10 comme il l'était sur la 7.
