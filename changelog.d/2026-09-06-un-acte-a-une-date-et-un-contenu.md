### `D-129` — un acte a une date et un contenu : un écrivain chacun (2026-09-06)

Les trois points de persistance écrivaient l'épisode par `upsert(..., update: {})`,
présenté comme de l'idempotence. Ce n'en était pas : c'était du SILENCE. Quand la
ligne existait avec un contenu divergent, rien n'était écrit et la route
répondait succès — le praticien lisait « confirmé » pendant que la base gardait
la mesure précédente. **Une confirmation clinique perdue, sans trace.**

- **Une re-confirmation remplace ce que l'épisode RETIENT**, et rien d'autre :
  `payload`, `payloadHash`, `contractVersion`. **Huit** colonnes restent hors de
  portée, chacune pour son motif nommé (`createdAt` compris, posé par la base).
- **`confirmedAt` a un écrivain unique, la création.** C'est la date de l'acte :
  le cycle en fait sa date de référence et le portail patient y adosse la
  fermeture de ses jalons. La réécrire déplacerait le parcours du patient.
- **La justification de contournement se REPREND, elle ne se recompare pas.**
  Le motif reçu est ignoré sans être comparé — le comparer aurait bloqué un
  praticien sur une virgule, l'écran ne lui remontrant jamais le motif d'origine.
- **La trace d'un arbitrage SURVIT à la résolution de sa condition.** Une
  condition souple se résout ; ne reconstruire que les conditions encore
  requises effaçait, en silence, qui avait passé outre, quand et pourquoi.
- **Une trace se reconnaît à sa PRÉSENCE EN BASE, jamais à sa date.** Une
  première rédaction acceptait un contournement non requis daté avant la
  confirmation : elle était inversée dans les deux sens. Le cockpit tamponnant
  `decideLe = confirmedAt` sur le premier contournement, aucune trace réelle
  n'était reconnue — et une date se forge de toute façon.
- **Un contournement NOUVEAU se date du jour, sur un acte qui garde le sien.**
  La règle `decideLe = confirmedAt` devient la borne
  `confirmedAt <= decideLe <= maintenant` : rien n'est antidaté, rien n'est
  projeté, et la re-confirmation a lieu. La règle d'origine interdisait de
  justifier un avertissement apparu APRÈS l'acte, ce qui bloquait précisément la
  re-confirmation divergente que cette décision existe pour ne plus perdre.
- **Trois branches explicites** : `create` (jamais `upsert`, qui ne sait pas
  dire « la ligne est née entre-temps »), `updateMany` en compare-and-swap sur
  l'empreinte lue, ou aucune écriture. C'est seulement dans ce dernier cas que
  l'idempotence annoncée est vraie.
- **Les deux routes protocole refusent la divergence** au lieu de l'avaler sous
  `ok: true` : elles ne sont pas l'écrivain de l'acte.

Aucune migration, aucun seuil de scoring touché.
