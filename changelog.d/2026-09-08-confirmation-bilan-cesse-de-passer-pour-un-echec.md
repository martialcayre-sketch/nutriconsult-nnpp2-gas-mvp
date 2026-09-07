### Corrigé

- **Une demande de confirmation s'affichait comme un échec d'envoi** (`M03` de
  l'audit du 2026-09-06, `D-147`). La ligne de correspondance était dérivée de
  la ligne d'audit par un ternaire « tout ce qui n'est pas envoyé est une
  erreur ». Sur les 222 lignes du journal en production, les 5 seules `Erreur`
  qu'il ait jamais portées étaient 5 demandes de confirmation.
- **Et une panne réelle du relais n'écrivait rien** : ni ligne d'audit, ni ligne
  de journal, seulement un `logger.error`. Un bilan perdu était invisible sur la
  fiche pendant qu'une confirmation en attente s'y affichait en rouge. Le patron
  appliqué est celui que le dépôt tient déjà pour l'envoi de questionnaires.
- **Le praticien peut enfin trancher la garde de registre.** La route acceptait
  `confirmerRegistre` depuis toujours et l'avertissement lui demandait
  d'« ajouter `confirmerRegistre: true` » — un champ JSON qu'aucun écran ne
  posait. La case existe désormais sur l'écran qui porte la prévisualisation, et
  n'apparaît qu'après que la garde a mordu. Le seuil de la garde est inchangé :
  ce lot lui rend son issue, il ne la desserre pas.
- **Les messages rendus au praticien ne renvoient plus vers « le terminal
  Next.js »** sur le chemin d'envoi du bilan.

### Ajouté

- **Une garde structurelle** (`confirmations.guard.test.ts`) compare les
  drapeaux de confirmation que la route exige aux clés que les écrans postent
  réellement. Les bancs de route prouvaient déjà que `confirmerRegistre: true`
  laisse passer — ils le prouvaient pendant les vingt-trois jours où le drapeau
  était inatteignable. Un banc de route ne voit pas l'absence d'un appelant.
