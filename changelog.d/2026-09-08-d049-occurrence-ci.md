### Note

- **`D-049` perd son arbitre absolu.** La décision fait du CI le palier E2E des
  PR de classe migration/scoring/clinique, sur un contexte qui affirmait
  « Jamais observé en CI (Linux) ». Le CI de #943 a rougi le 2026-09-07 sur
  `e2e/portail-bilan.spec.ts`, projet iPhone 13 (WebKit), sur `page.goto`. Le
  symptôme diffère du blocage local — une erreur rendue par le moteur, non une
  expiration à trace réseau vide — et **que ce soit le même blocage reste
  inconnu faute de preuve** (`D-125`).
- Consigné dans le même mouvement : devant ce rouge, **le job échoué a été
  relancé jusqu'au vert**, ce que `D-049` interdit explicitement. Le code de
  #943 a par ailleurs passé le CI complet sur la tête fusionnée — c'est le
  geste qui est noté, pas un doute sur ce lot.
- Écarté : **apprendre le symptôme du CI à `wn-diagnostic-e2e.mjs`**. L'outil
  classerait automatiquement « blocage connu, bénin » un échec dont on ignore
  s'il l'est — il automatiserait le mauvais raisonnement au lieu de l'empêcher.
- Reste à l'arbitrage : si le CI n'est plus un arbitre connu comme sûr,
  `D-049` en a-t-elle encore un ? La question change le régime de validation
  des PR sensibles ; elle n'est pas à la main du code.
