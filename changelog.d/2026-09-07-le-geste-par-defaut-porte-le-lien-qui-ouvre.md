### Le geste par défaut porte enfin un lien qui ouvre (2026-09-07)

Créer une consultation et « Renvoyer le lien » envoyaient l'adresse d'une page
de **connexion**. Le patient arrivait devant une porte, pas dans son espace —
et si les deux autres chemins d'entrée lui étaient fermés, cette page se
réduisait à « demandez un lien à votre praticien ».

**Un seul e-mail, deux adresses.** Le lien à usage unique pour entrer tout de
suite ; la page durable juste en dessous, pour tous les autres jours. Rien n'est
retiré.

**Pourquoi pas simplement basculer d'e-mail.** Le correctif évident — remplacer
l'envoi par celui du lien magique — casse cinq choses, chacune vérifiée sur
pièces :

- le **seul gabarit validé** du registre disparaîtrait au premier contact, avec
  son bloc anti-hameçonnage, l'identité du praticien et la gratuité ;
- l'encart des dossiers neufs deviendrait **aveugle** : il lit le type
  `acces_portail`, et chaque dossier resterait « Accès non envoyé » après un
  envoi réussi ;
- le gabarit du lien magique **promet** une redemande sans passer par le
  praticien — faux si le second drapeau est éteint ;
- le **`Reply-To`** retomberait sur `noreply@` : `sendMagicLinkEmail` n'a pas de
  paramètre praticien ;
- et surtout un lien magique **meurt en 24 h** quand l'e-mail de premier contact
  peut s'ouvrir le lendemain.

Le type journalisé, le sujet et le `Reply-To` ne bougent donc pas. Seul le
gabarit change, et seulement quand un lien a pu être émis.

**Clé distincte, et non une version 3.** `getGabarit` rend la version la plus
haute d'une clé : une v3 d'`acces_portail` serait servie aussi au chemin SANS
lien, où le rendu lèverait. Le nouveau gabarit reprend le texte de la v2 au
caractère près, hors le paragraphe du lien — validé par le praticien le
2026-09-07 sur lecture de cette seule prose neuve. Empreinte recalculée et
vérifiée indépendamment du plan.

**Le lot est inerte drapeau éteint, et c'est ce qui le rend livrable.**
`portail/lien/[jeton]` répond un **404 à corps nul** quand `WN_G4_LIEN_MAGIQUE`
est absent : un lien émis alors serait une page blanche dans la boîte du
patient, strictement pire qu'aujourd'hui. Le module d'émission garde donc le
drapeau, et rend `null` — l'e-mail redevient exactement celui d'avant. Deux
bancs assertent ce cinquième argument `undefined` : c'est la preuve de
l'inertie, pas une formalité. Le drapeau a été relu posé sur Scalingo le
2026-09-07.

**Un mutant que le plan croyait couvert ne l'était pas.** Il affirmait que
servir le gabarit à lien de façon inconditionnelle ferait lever `rendreGabarit`
sur la variable manquante. Faux : la garde est `!(nom in vars)`, pas la
véracité de la valeur. Le rendu substituait donc la chaîne « undefined », et
l'e-mail serait parti aux patients en disant « ouvrez ce lien : undefined ». Le
banc porte désormais sur la substance du texte, pas sur l'absence d'une URL.

Dix mutants joués, dix tués — dont le jeton écrit en clair en base au lieu de
son empreinte, et l'émission remontée au-dessus de « Copier le lien », qui
écrirait un jeton à chaque clic sans qu'aucun e-mail ne parte.

Aucune migration, aucun seuil de scoring.
