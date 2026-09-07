### Ajouté

- **Une garde tient le rattachement des passations à leur assignation**
  (`M15` de l'audit du 2026-09-06, `D-149`). `id_assignation` est nullable au
  schéma et 15 lignes de production le sont — mais aucun chemin vivant n'en
  produit. Le banc structurel le vérifie sur les trois écrivains, parce qu'un
  champ facultatif oublié ne fait rougir aucun banc d'écrivain.

### Mesuré

- **Les 15 passations détachées sont une cohorte close** : 3 patients, du 10 au
  20 juin 2026, dix-sept jours avant la première passation rattachée. Pas un
  import raté — l'avant-mécanisme. Les mêmes 15 lignes portent tout l'écart
  entre `date_reponse` et `created_at` ; toute ligne vivante est enregistrée le
  jour de la réponse.
- **Les 145 passations de production sont `VALID`, toutes.** La commande de
  retrait existe et est câblée (`InboxQuestionnaires`), elle n'a jamais servi.
  Conséquence pour `D-146` (lot `A03`) : le défaut qu'il a fermé était **armé et
  n'a jamais tiré** — aucun dommage clinique passé, une trappe fermée avant le
  premier pas.
