### E2E — la saisie d'une mesure attend le panneau au repos

`consigner` remplissait le formulaire dès que la réponse du POST précédent
était arrivée. Or `EstimeMesurePanel` ne s'arrête pas là : après la réponse, il
enchaîne `chargerResultats()` — un **second** aller-retour —, relâche
`envoiEnCours`, et n'appelle `setValeur('')` qu'**en dernier**.

La seconde saisie commençait donc avant ce reset, qui effaçait ensuite ce que
le test venait de taper. `prete` retombe à faux, le bouton « Consigner la
mesure » reste `disabled`, et Playwright réessaie 225 fois pendant 120 s avant
d'abandonner — en accusant la saisie d'un défaut qui n'est qu'un ordre
d'arrivée.

Le helper attend désormais le champ vide avant de remplir. `setValeur('')`
étant la dernière écriture d'état de la séquence, le voir atterri, c'est savoir
que tout le reste l'est aussi. Le champ est contrôlé (`value={valeur}`) :
l'assertion observe bien l'état, pas un DOM initial.

Observé en CI le 2026-09-07 sur `#929` — une PR de dépendances —, et déjà une
fois sur `#918`, une PR de commentaires et de markdown. Deux diffs incapables
de causer l'échec : c'est ce qui l'a désigné.

Aucun `retries`, aucune suite rejouée jusqu'au vert : `D-049` l'interdit
nommément, et c'est ce refus qui a rendu la cause visible les deux fois.
