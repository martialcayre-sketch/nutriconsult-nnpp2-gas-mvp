### Corrigé

- **La rubrique 6 du dossier RGPD énumérait Vercel et Supabase** comme
  sous-traitants — seize jours après le cutover, six jours après leur fermeture
  définitive — sans nommer Scalingo, et reprenait la négation « Google —
  connexion du praticien uniquement, jamais des patients » que `D-137` a établie
  fausse le matin même. Le tableau est refait depuis le document servi au
  patient (v5), et il nomme Sentry.
- **`gouvernance.ts` ne recopie plus la liste, il la dérive.** Le dossier avait
  nommé ce module « copie morte » le 2026-08-19 en annonçant le risque : « rien
  ne tient les deux copies synchrones ». La dérive a bien eu lieu, dans l'autre
  sens — le document patient a été corrigé, cette copie a gardé la phrase
  démentie. Une liste qui se recopie diverge ; une liste qui se calcule ne le
  peut pas.

### Sécurité

- **`registre.dossier.test.ts` tient ensemble deux documents qui ne se
  parlaient pas** : la liste servie au patient et la rubrique 6, c'est-à-dire la
  pièce qu'on présenterait à un régulateur. Il compare les **noms**, pas les
  phrases — l'un parle au patient, l'autre à un juriste, exiger la même prose
  serait absurde ; ce qui ne peut pas diverger, c'est **qui reçoit des données**.
  Mutant prouvé rouge sur une divergence d'une lettre.

### Ajouté

- **`D-145` — un destinataire vivant que le dossier n'avait jamais nommé.**
  L'inventaire des tiers a été refait **depuis le code** plutôt que depuis les
  documents, et il rend OpenAI : `web/src/lib/rag/embeddings.ts:20-34` envoie à
  `api.openai.com` le texte libre saisi par le praticien dans la recherche de
  corpus. Les deux drapeaux qui commandent ce chemin sont posés en production
  (`WN_RECHERCHE_CORPUS_ENABLED` le 2026-08-22, `RAG_PGVECTOR_ENABLED` relue
  `true` le 2026-09-07). « OpenAI » n'apparaissait dans **aucune** pièce de
  conformité, ni dans aucune des 144 décisions du registre.
- C'est l'écart de Sentry, avec une différence qui joue dans le mauvais sens :
  Sentry n'émettait rien, celui-ci émet. **L'arbitrage n'est pas pris** — soit
  ce flux ne porte aucune donnée personnelle et cela s'écrit, soit la liste
  patient se corrige. Il engage l'information des personnes et un contrat de
  sous-traitance ; il appartient au responsable du traitement.

### Reste dû — au responsable de traitement

- L'arbitrage OpenAI ci-dessus.
- Les DPA : **aucun n'est signé, avec aucun sous-traitant** (rubrique 6, trou 1,
  inchangé). L'annexe HDS Scalingo signée le 2026-08-30 (`D-121`) est une pièce
  d'hébergement, pas un DPA ; son archivage reste dû, comme la signature du DPA
  Scalingo lui-même. `D-006` réserve (4) nomme Anthropic, SMTP, Google et Sentry
  depuis le 2026-07-28 ; OpenAI s'y ajoute.
