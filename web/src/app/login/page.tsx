'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { messageErreurConnexion } from '@/lib/messagesErreurLogin';

function EcranCentre({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="praticien" className="min-h-screen flex items-center justify-center bg-background">
      {children}
    </div>
  );
}

function ContenuLogin() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const parametres = useSearchParams();
  const codeErreur = parametres.get('error');
  const erreur = messageErreurConnexion(codeErreur);

  useEffect(() => {
    if (session) router.replace('/dashboard');
  }, [session, router]);

  if (status === 'loading') {
    return <div className="text-muted-foreground">Chargement…</div>;
  }

  return (
    <div className="max-w-sm w-full bg-surface rounded-2xl shadow-lg p-8 flex flex-col items-center gap-6">
      {/* Logo / titre */}
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-primary">
          Wellneuro
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Espace praticien</p>
      </div>

      {/* Échec de connexion : NextAuth renvoie ici avec `?error=`. Sans ce
          bandeau, l'échec est indiscernable d'un premier affichage. */}
      {erreur && (
        <div
          role="alert"
          className="w-full rounded-xl border border-border p-4 flex flex-col gap-1"
        >
          <p
            className={`text-sm font-medium ${
              erreur.registre === 'refus' ? 'text-status-warning' : 'text-status-danger'
            }`}
          >
            {erreur.titre}
          </p>
          <p className="text-xs text-muted-foreground">{erreur.detail}</p>
          {/* Le code brut : ce qui permet à un appel au support de partir d'un
              fait plutôt que d'un « ça ne marche pas ». */}
          <p className="text-2xs text-muted-foreground/70 mt-1">Code : {codeErreur}</p>
        </div>
      )}

      {/* Connexion Google */}
      <button
        onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition"
      >
        {/* Icône Google SVG inline */}
        <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Se connecter avec Google Workspace
      </button>

      <p className="text-xs text-muted-foreground text-center">
        Accès réservé aux praticiens wellneuro.fr
      </p>
    </div>
  );
}

export default function LoginPage() {
  // `useSearchParams` impose une frontière Suspense : sans elle, le build de
  // production échoue au prérendu de cette page (Next 14, App Router).
  return (
    <EcranCentre>
      <Suspense fallback={<div className="text-muted-foreground">Chargement…</div>}>
        <ContenuLogin />
      </Suspense>
    </EcranCentre>
  );
}
