### Le praticien peut retenir une priorité, et le serveur cesse de croire l'écran sur parole (2026-09-06)

La table posée plus tôt dans la journée reçoit ce qui l'écrit et ce qui la lit.
Une priorité retenue par le praticien est désormais **un acte enregistré** :
quelle priorité, par qui, quand, et pourquoi. Le motif écrit est exigé — c'est ce
qu'une version de protocole citera, et ce qui se relit six semaines plus tard.

**Auteur et horodatage sont posés par le serveur.** L'écran transmet un choix ;
il ne date ni ne signe. Une sélection est donc inantidatable et inattribuable à
quelqu'un d'autre.

**Changer d'avis crée une ligne, jamais une rature.** Et si deux personnes
choisissent en même temps, la base **refuse** au lieu d'élire : deux sélections
concurrentes sur la même décision, ce seraient deux praticiens croyant chacun
avoir décidé. Celui qui arrive second lit « une autre sélection vient d'être
posée, rechargez et relisez avant de choisir » — pas une erreur technique.

**Un trou de confiance se referme au passage.** Jusqu'ici, le contrôle
d'intégrité qui garde les deux points d'enregistrement du protocole reprenait la
sélection **telle que le navigateur la lui donnait** : il vérifiait que la
priorité citée existait bien, jamais que quelqu'un l'avait réellement choisie.
Le serveur la relit maintenant dans le dossier. Une carte fabriquée qui
s'attribuerait une décision jamais prise ne passe plus.

**Un épisode confirmé ne redevient pas un formulaire.** Si une priorité retenue
cesse d'être applicable — un signal d'alerte apparu depuis, une règle qui ne se
déclenche plus — c'est **la sélection** qui est écartée, pas la décision entière.
Sans cette précaution, consigner une priorité aurait pu faire disparaître de
l'écran un épisode que le praticien avait pourtant confirmé.

**Et le praticien peut enfin choisir.** Sous « Priorité et limites », là où le
constructeur de protocole refusait jusqu'ici sans dire où aller, un panneau
présente les priorités candidates — **avec leur rang et leur statut de
confiance**, pour qu'on décide avec ou contre le classement du moteur, jamais à
l'aveugle — et demande le motif. Le bouton reste fermé tant que le motif manque.

La priorité retenue s'affiche ensuite **avec sa justification**, et non seulement
son nom : c'est la moitié de l'acte, et c'est ce qu'on vient relire. Changer
d'avis rouvre le formulaire avec un motif **vierge** — on ne recycle pas la
justification d'un choix pour fonder le suivant.

Le panneau **se tait** là où quelqu'un d'autre parle déjà : décision suspendue,
aucun candidat classé, pas de carte. Répéter aurait ajouté du bruit, et proposer
un choix que le moteur refuserait aurait été pire.

**Ce qui reste à faire.** Quand une sélection est écartée parce qu'elle ne tient
plus, l'écran montre qu'aucune priorité n'est retenue sans expliquer pourquoi.
Cette phrase-là reste due.
