### Le bilan complet voyage par e-mail : c'est désormais écrit ([[D-136]], 2026-09-07)

Quand le praticien envoie un bilan, la route en passe le rendu complet — narratif
patient et note praticien — en corps `html` à `sendMail`. Le registre des
gabarits déclare pourtant ce chemin `conforme` au regard des données de santé.

**Cette déclaration n'était pas fausse.** Elle porte sur le `corps` du gabarit,
c'est-à-dire le texte de trois lignes, qui est bien exempt de donnée de santé.
La passer à `ecart` aurait déclaré un écart sur un texte qui n'en a pas.

**Ce qui manquait est ailleurs : le second corps n'était déclaré nulle part.**
Ni au registre, qui ne le contient pas ; ni à la carte des chemins sortants, qui
inscrit le booklet pour sa garde de vocabulaire et non pour son canal ; ni par
une décision. La question « le bilan complet a-t-il le droit de circuler par
e-mail ? » n'avait jamais été posée par écrit. Ce n'était pas un mensonge —
c'était un non-dit, et un non-dit ne se relit pas.

Ce chemin est **le seul des huit à quitter l'application par un tiers**. Les
sept autres textes sortants sont servis par l'application elle-même, sur
l'hébergement HDS. Celui-ci passe par un service de messagerie. C'est la
différence que la carte tait désormais moins.

**La donnée reste dans le canal**, et c'est l'arbitrage. La retirer était
possible : l'e-mail serait devenu une notification pointant « Mon bilan ». Le
perdant aurait été le patient qui n'entre jamais au portail — et le seul chiffre
du dépôt va dans ce sens, cinq dossiers ouverts fin août ayant reçu le message
d'accès sans qu'aucun n'ouvre son espace.

**Ce que la décision engage et qui reste dû** : l'envoi de données d'article 9
par un sous-traitant dont la localisation du traitement et la couverture DPA
sont encore dues, échéance 2026-10-21, sans AIPD. Elle rend l'écart visible et
daté plutôt que tacite ; elle ne le lève pas.

Deux défauts voisins sont nommés sans être traités : le POST ne lit pas l'état
de révocation, et l'échec SMTP n'est journalisé nulle part.

Aucun code de production modifié : deux commentaires et une décision.
