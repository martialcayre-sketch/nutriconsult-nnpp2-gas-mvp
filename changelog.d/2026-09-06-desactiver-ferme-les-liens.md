### `D-126` — désactiver un dossier ferme les liens en vol, par l'horizon et non par l'événement (2026-09-06)

Le dialogue de désactivation promettait « ses liens cesseront de fonctionner » ;
le code ne le tenait pas. Un lien émis avant la désactivation restait ouvrable
24 h — et l'atterrissage le **consommait** avant de vérifier le compte, puis le
refusait : lien brûlé, patient jamais entré, et une ligne indiscernable d'une
entrée réussie.

- **La désactivation ferme les liens en vol** (`PATCH api/praticien/patients`),
  dans une transaction, en avançant `expireLe` — **jamais `consommeLe`**.
  Recopier la transaction de révocation aurait fait de ce geste le second
  écrivain de `sessionsInvalidesAvant`, colonne à emplacement unique, et
  converti d'un coup les tampons d'une révocation antérieure en fausses
  entrées : on aurait refermé une porte en rouvrant celle que la PR #889 vient
  de fermer. Filtre monotone et idempotent (`expireLe: { gt: maintenant }`).
- **L'atterrissage garde avant de consommer** (`portail/lien/[jeton]`), et son
  refus laisse une trace en base comme les autres refus. La consommation elle-
  même est conditionnée à `expireLe`, à une horloge fraîche : sans quoi une
  désactivation commitée entre la garde et l'écriture laissait le lien brûler
  quand même — le défaut de départ, reparu par la course.
- **Désactiver n'est pas révoquer** : `accessTokenRevoked` n'est pas posé — les
  quatre lecteurs exigent déjà `actif`, et le poser fabriquerait un cul-de-sac
  à la réactivation.
- **Le cockpit le dit** : étape `dossier_desactive` en tête de l'encart des
  dossiers neufs, hors du compte « en attente ». Sans elle le dossier fermé
  remontait en TÊTE, libellé « Jamais connecté ».
- **Le formulaire « Modifier » ne poste plus `actif`** : c'était la seule porte
  de désactivation sans confirmation, et le geste est devenu irréversible.
- **Les trois actions d'accès sont grisées sur un dossier inactif**, « Copier
  le lien » comprise — elle poste elle aussi. Le serveur les refusait déjà,
  mais en « Patient introuvable. » sur un dossier que le praticien a sous les
  yeux.
- **Les deux dialogues annoncent qu'un lien déjà envoyé ne redeviendra pas
  valable** : sans cela, la réactivation reproduisait à l'écran le cul-de-sac
  silencieux que cette décision reproche à la conception écartée.

Aucune migration, aucun backfill (les liens antérieurs s'éteignent seuls sous
24 h). Les tampons posés par l'ancien ordre, eux, survivent et ne se corrigent
pas côté lecture — c'est écrit à l'appel.
