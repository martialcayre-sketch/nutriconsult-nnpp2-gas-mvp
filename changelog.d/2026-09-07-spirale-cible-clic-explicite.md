### Spirale : les deux clics de l'E2E visent un point prouvé, plus un point de chance

Les deux tests de `fiche-trajectoire-peuplee.spec.ts` étaient verts **parce que la
fixture n'a qu'un seul repère**, et pour aucune autre raison.

`epaisseurCible = max(épaisseur, espacement)` ne fait atteindre le centre de la
Spirale à la bande de l'anneau intérieur que lorsqu'il y a exactement un repère.
Le clic automatisé, qui vise le centre de la boîte de l'arc, tombait donc juste —
et tomberait dans le vide dès le deuxième repère. Le second test était plus
fragile encore : sa coordonnée était calculée dans le repère du SVG mais
appliquée à la boîte du bouton, laquelle exclut le trait ; dès deux repères elle
glisse vers l'intérieur et sélectionne un jalon **passé** — l'exact contraire du
retour au présent que ce test affirme vérifier.

Les deux clics visent désormais le trait de leur propre anneau, dans le repère du
SVG. Vérifié au navigateur — Chromium et WebKit iPhone 13, de 1 à 4 repères — et
non par raisonnement : la cible est correcte dans les huit configurations.

**Ce que ce correctif ne fait pas.** La même sonde montre que le centre de la
Spirale n'appartient à aucun arc dès deux repères confirmés : un appui au milieu
du dessin ne fait rien, alors que le composant énonce « il n'existe aucun
interstice mort ». Défaut *démontré dans le code, sans occurrence observée*
(`D-125`) ; il touche l'écran praticien d'un patient ayant au moins deux jalons.
Non corrigé ici — un changement de cible tactile n'est pas un correctif de test.

Coordonnée initialement proposée par Copilot (`1e422cad`) ; le motif qui
l'accompagnait — une superposition de l'arc « Aujourd'hui » sur mobile — est
réfuté par la sonde : le centre ne touche jamais cet arc, et les deux moteurs se
comportent à l'identique.
