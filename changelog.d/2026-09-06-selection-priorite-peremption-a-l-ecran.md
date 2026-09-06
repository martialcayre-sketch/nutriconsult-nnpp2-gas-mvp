### Cockpit praticien — une priorité écartée le dit, au lieu de disparaître (`D-127` §11)

Quand une sélection de priorité consignée ne tient plus sur le dossier — la
règle du candidat ne se déclenche plus, ou un constat de sécurité a bloqué la
décision — elle est écartée du calcul. L'écran affichait alors « aucune priorité
n'est retenue », strictement comme sur un dossier où personne n'avait jamais
choisi : la carte servie est celle construite sans la sélection, et rien ne
distinguait l'écart de l'oubli. Seul le journal serveur en gardait trace.

La réponse `ready` du cockpit porte désormais `selectionEcartee`, et le panneau
« Priorité retenue » le dit : la priorité n'est plus applicable, elle a été
écartée du calcul, et **rien n'a été effacé** — le fil des sélections est
append-only, la ligne demeure en base.

Le constat traverse les deux silences du panneau : décision bloquée et aucun
candidat classé continuent de masquer le GESTE — il n'y a rien à retenir — mais
plus le CONSTAT, qui n'a de propriétaire nulle part ailleurs à l'écran. Il est
servi par le GET (rejeu) comme par le POST, sans quoi une re-confirmation du
même épisode l'aurait fait disparaître.

Il ne nomme ni le candidat ni le motif consigné : le candidat écarté n'est plus
classé, son libellé n'existe donc plus dans la carte.
