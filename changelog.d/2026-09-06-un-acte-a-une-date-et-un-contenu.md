### `D-129` — un acte a une date et un contenu : un écrivain chacun (2026-09-06)

Les trois points de persistance écrivaient l'épisode par `upsert(..., update: {})`,
présenté comme de l'idempotence. Ce n'en était pas : c'était du SILENCE. Quand la
ligne existait avec un contenu divergent, rien n'était écrit et la route
répondait succès — le praticien lisait « confirmé » pendant que la base gardait
la mesure précédente. **Une confirmation clinique perdue, sans trace.**

- **Une re-confirmation remplace ce que l'épisode RETIENT**, et rien d'autre :
  `payload`, `payloadHash`, `contractVersion`. Sept colonnes restent hors de
  portée, chacune pour son motif nommé.
- **`confirmedAt` a un écrivain unique, la création.** C'est la date de l'acte :
  le cycle en fait sa date de référence et le portail patient y adosse la
  fermeture de ses jalons. La réécrire déplacerait le parcours du patient.
- **La justification de contournement se REPREND, elle ne se recompare pas.**
  Le motif reçu est ignoré sans être comparé — le comparer aurait bloqué un
  praticien sur une virgule, l'écran ne lui remontrant jamais le motif d'origine.
- **Un contournement nouveau sur un acte ancien est refusé** : il n'y a pas
  d'écriture honnête, `decideLe` devant égaler `confirmedAt`. Le refus dit par
  où sortir.
- **Trois branches explicites** : `create` (jamais `upsert`, qui ne sait pas
  dire « la ligne est née entre-temps »), `updateMany` en compare-and-swap sur
  l'empreinte lue, ou aucune écriture. C'est seulement dans ce dernier cas que
  l'idempotence annoncée est vraie.
- **Les deux routes protocole refusent la divergence** au lieu de l'avaler sous
  `ok: true` : elles ne sont pas l'écrivain de l'acte.

La conception d'abord arbitrée comparait la justification et refusait en cas de
divergence. La revue adversariale l'a mise en NO GO : le refus se déclenchait
sur un parcours nominal — une nouvelle passation rend une condition souple
satisfaite, l'ensemble des contournements rétrécit, et le praticien était bloqué
parce que son patient avait fait ce qu'on lui demandait.

Aucune migration, aucun seuil de scoring touché.
