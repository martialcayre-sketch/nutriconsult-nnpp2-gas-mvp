'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Le détail est volontairement minimal côté client pour éviter les fuites.
    console.error('Erreur globale application', {
      digest: error.digest,
    });
    // SANS CETTE LIGNE, CET ÉCRAN S'AFFICHE POUR UNE PERSONNE SUIVIE SANS QUE
    // PERSONNE NE L'APPRENNE. Le `digest` proposé en référence n'est posé que
    // par le rendu SERVEUR : une erreur survenue dans le navigateur — le cas
    // dominant, la plupart des pages du portail étant clientes — n'en porte
    // pas, donc la ligne « Référence » ne s'affiche même pas. C'était un
    // maillon manquant de la boucle de support, pas un maillon faible
    // (`docs/claude/OBSERVABILITE_PRODUCTION.md`).
    //
    // Inerte sans DSN, et nettoyé par `beforeSend` quand il y en a un.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>Une erreur est survenue</h1>
          <p style={{ lineHeight: 1.5, marginBottom: 20 }}>
            Nous rencontrons un problème technique temporaire. Réessayez dans quelques instants.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 14, color: '#555', marginBottom: 20 }}>
              Référence technique: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#1f2937',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
