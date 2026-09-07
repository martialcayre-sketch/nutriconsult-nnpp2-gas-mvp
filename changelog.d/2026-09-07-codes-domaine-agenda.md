### Corrigé

- **Un refus de journée alimentaire dit de nouveau lequel des onze contrôles a
  mordu** (`D-144`, piste consignée à `D-015`). Le message de toute erreur est
  masqué avant journalisation — un objet Prisma recopierait la saisie du
  patient, donc de la donnée de santé, en clair dans les journaux. Le prix
  était qu'un `400` de domaine devenait indiagnosticable. Chaque contrôle lève
  désormais un **code énuméré**, sûr par construction : c'est une constante du
  fichier, jamais une donnée.
- Le remède ne démasque **rien**. Le `catch` n'attrape pas que le domaine : il
  attrape aussi des erreurs de persistance et de contrat dont certains messages
  interpolent une valeur reçue. Une classe d'erreur dédiée sert de marqueur —
  ce qui n'en vient pas ne porte aucun code et reste masqué, sans tri à tenir à
  jour.
- La réponse rendue au patient est **inchangée** : même message, même motif,
  même statut. Le code va au journal, pas à l'écran.

### Sécurité

- Trois des onze codes dépassaient 24 caractères et sortaient anonymisés en
  `[id]` — l'assainisseur de journal remplace tout mot de cette longueur. Le
  défaut a été trouvé par le banc, pas par relecture ; une garde paramétrée sur
  la liste des codes le referme, et elle a été éprouvée par mutation. C'est le
  même piège qui avait déjà coûté la trace des classes d'erreur Prisma.
