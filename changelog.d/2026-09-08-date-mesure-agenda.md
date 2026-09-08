### Corrigé

- **Une passation d'agenda est datée de la dernière journée mesurée, plus du
  jour de sa clôture** (`M13` de l'audit du 2026-09-06, `D-152` — arbitrage du
  responsable rendu en session). Les deux clôtures écrivaient `dateReponse: now`
  et confondaient donc la mesure avec le geste.
- **Ce que ça déplaçait, mesuré** : sur les onze clôtures de production, cinq
  dataient de leur fin une période de 20 à 29 jours, et six portaient un écart
  de 3 à 31 jours avec leur dernière journée — dont une nuit unique du 29 juillet
  datée du 29 août. Pour une tolérance de jalon de 8 jours, 31 jours d'écart ne
  décalent pas la mesure : ils la sortent de toute fenêtre.

### Note

- **Les onze passations existantes ne sont pas reprises.** Aucune migration : le
  correctif vaut pour les clôtures à venir. Réécrire la date de mesures déjà
  servies demanderait son propre arbitrage.
- **Le geste garde sa date** : `dateDerniereModification` de l'assignation reste
  l'instant de clôture. Les deux dates disent deux choses ; c'est leur confusion
  qui était le défaut.
- **Le repère est partagé** entre les deux agendas, avec un banc à chaque bout :
  l'alimentaire n'a jamais produit une seule passation là où le sommeil en a
  onze, et une règle recopiée aurait dérivé sans que rien ne rougisse.
