### `D-125` — une fixture prouve un mécanisme, elle ne décrit pas un parcours (2026-09-06)

L'audit du parcours du 2026-09-05 avait demandé au contrôle de faire le travail
de l'observation : il a produit la carte des parcours **possibles** et l'a
présentée comme un classement de priorités. La contre-revue adverse en a réfuté
les deux inférences causales ; le responsable a nommé la cause plus profonde,
qu'aucune des deux contre-lectures n'avait marquée — aucune de ces gravités
n'est pesée par ce qui se passe réellement.

- **Partage des rôles écrit dans la doctrine** (`CLAUDE.md` §Données patients) :
  la fixture est un contrôle, déterministe et rejouable en CI, seule forme
  admise en seed et en E2E ; le dossier réel est une observation, lu par
  identifiant depuis un conteneur. Ne jamais conclure d'un parcours de fixture
  qu'un patient a été bloqué, oublié ou servi.
- **Étiquetage obligatoire des constats** (`.claude/rules/tests-validation.md`) :
  *observé sur un parcours réel*, *démontré dans le code sans occurrence
  observée*, ou *inconnu faute de preuve*. Un défaut démontré se corrige sans
  occurrence ; sa fréquence ne s'invente pas. Et un état incomplet n'est un
  défaut que si un geste était attendu à ce stade.
- **Les trois identités de fixture restent** : la suppression a été posée en
  question, examinée et écartée — le seed écrit des réponses de questionnaire
  (`DC-01`, `DC-24`), le CI n'a pas de base de production, un dossier réel bouge
  sous le banc, et `K1` exige une concurrence fabriquée. Elles ne manquent pas
  en nombre mais en variété : les enrichir est la réponse.

Aucun code touché, aucune migration. La reprise de l'audit sur les parcours
réels prendra chaque dossier comme unité, à sortie strictement dé-identifiée.
