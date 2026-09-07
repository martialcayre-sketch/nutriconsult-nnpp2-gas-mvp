### E2E — la confirmation T0 est attendue, pas seulement déclenchée

`confirmerEpisodeT0` cliquait le bouton et rendait la main aussitôt. Or ses
appelants lisent ensuite le cockpit par un `APIRequestContext` **distinct de la
page**, qui ne partage pas son en-vol : rien ne garantissait que la
confirmation soit arrivée avant la lecture.

La course s'est matérialisée en CI le 2026-09-07, sur
`biologie-arbitrage-revision.spec.ts` : le cockpit répond `proposal_required`
alors que ses trois préconditions dures sont toutes `satisfaite: true` et
`bloquant: false`. L'échec accuse le code du dossier ; il ne dit que l'ordre
d'arrivée.

Le helper attend désormais le rail. Le libellé « renseignée » de l'onglet
Décision dérive de `etatRuntime.episodeConfirme` (`FichePatientPanel.tsx`),
c'est-à-dire du **même runtime** que les appelants interrogeront ensuite : le
voir posé, c'est savoir que la lecture suivante répondra `ready`.

Vaut pour les quatre sites d'appel, dans `biologie-arbitrage-revision`,
`biologie-proposition-courrier` et `biologie-document-patient`.

Aucun `retries` ajouté, aucune suite rejouée jusqu'au vert : `D-049` l'interdit
explicitement, et à raison — un réessai aurait transformé cette course en
succès silencieux, en emportant avec lui les vrais échecs intermittents.
