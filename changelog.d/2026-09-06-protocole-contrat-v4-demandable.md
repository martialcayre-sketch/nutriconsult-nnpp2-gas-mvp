### Protocole — le contrat V4 devient demandable, et la chaîne biologie cesse d'être inatteignable (`D-130`)

`POST /api/praticien/protocoles/versions` — unique appelant de production de
`buildProtocolDraft` — ne passait aucune `version`. Le moteur retombait donc
toujours sur `c1-protocol-draft-v1`, qui **refuse** `interventionStatus` et
`waitFor`. Conséquence : aucune intention `conditionnelle_biologie` n'était
persistable, et **toute la chaîne LOT-03 était inatteignable depuis
l'application** — la route d'arbitrage refuse une intention d'un autre statut, et
la garde `refusResolutionSansArbitrage` itère des intentions qui n'existaient
jamais. Même forme que `D-127` : un invariant serveur sans producteur.

`submission.version` est désormais accepté. Trois refus l'encadrent :

- **`version_inconnue` (400)** — seul `c1-protocol-draft-v4` peut être demandé.
  La version se demande, elle ne se déduit pas d'un champ présent : c'est la
  doctrine du moteur, et un contrat déduit laisserait le client choisir sa
  validation par omission. `version` absent ⇒ V1, comportement inchangé, et
  aucune empreinte déjà persistée ne bouge.
- **`reference_non_verifiee` (400)** — V4 ouvre aussi `supplementCatalogRef` dans
  le moteur, et cette route ne le vérifie contre aucun catalogue. Il reste
  refusé, comme aujourd'hui.
- **`version_contrat_incompatible` (409)** — une version V4 ne se révise pas en
  V1. Le cas « statut conservé » était déjà refusé par le moteur ; c'est le cas
  « statut retiré » que ce refus ferme : une intention résolue
  `non_indiquee_actuellement` y redeviendrait une action ordinaire, effaçant la
  résolution clinique sans trace.

Un parcours E2E joue la séquence complète sur la vraie base — sélection de
priorité, version en attente de biologie, verdict infirmé, révision conforme —
là où les bancs existants n'éprouvaient chaque maillon qu'isolément.

**Une fixture E2E qui mutait sans savoir se défaire.** `preparerReprisePourTest`
antidatait toutes les réponses du dossier au 2025-01-01 et `nettoyerReprise` ne
restaurait rien. Le rideau T0 de la fixture biologie étant daté du 2026-01-01, la
fenêtre se recomposait ensuite sur 2025 et `Q_MOD_03` — le canal de plainte —
sortait de l'épisode : abstention requise, aucune priorité classée. Les dates
sont désormais capturées avant la mutation et restituées au nettoyage.

L'écran ne produit toujours aucune intention `conditionnelle_biologie` : la
chaîne devient atteignable par l'API, le geste d'écran reste dû.
