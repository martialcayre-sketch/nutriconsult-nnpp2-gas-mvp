### release-db : la garde d'approbation juge les migrations, plus l'identité de la tête (2026-09-06)

Le run 33966114073 (migration D-124, commit 7d8e997) a échoué après près de
20 h d'attente d'approbation : un push **documentaire** (b40e699) était arrivé
sur `main` pendant la délibération, et la garde refusait de déployer dès que la
tête n'était plus le commit approuvé — bien qu'aucune migration non approuvée
n'existe sur la branche. L'ensemble à écrire était exactement celui approuvé.

La garde juge désormais le contenu : refus entier si la tête a quitté la ligne
du commit approuvé (force-push) ou si le diff `web/prisma/migrations/` entre
les deux n'est pas vide (migrations nouvelles non approuvées) ; poursuite sinon,
avec repointage de la garde « dernier déployé » sur la tête réellement
déployée. Invariants CI étendus (`release-db-invariants.test.mjs`), récit dans
`docs/adr/2026-08-07-commentaires-workflows.md`, conduite à tenir dans
`docs/DEPLOIEMENT_RELEASE_DB.md`.
