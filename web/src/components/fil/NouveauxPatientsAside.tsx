'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { NouveauxPatientsApiResponse } from '@/app/api/praticien/nouveaux-patients/route';
import { estEnAttente, type EtapeNouveauPatient } from '@/lib/fil/nouveauxPatients';
import { libelleTemporel } from '@/lib/fil/horodatage';
import { Badge } from '@/components/ui/Badge';
import type { BadgeVariant } from '@/components/ui/Badge';

/** Plafond d'affichage de l'encart — le reste vit dans la liste des patients.
 * Le tri de `lignesNouveauxPatients` garantit que ce qui tombe sous le
 * plafond est ce qui n'attend rien. */
const MAX_LIGNES = 6;

/** La couleur double toujours le libellé, jamais l'inverse (règle A5-R1) :
 * ces variantes ne portent aucun sens que le texte du badge ne dise déjà. */
const VARIANTE: Record<EtapeNouveauPatient, BadgeVariant> = {
  // États voulus, pas incidents : rien à relancer sur un dossier qu'on vient de
  // fermer, ni sur un accès qu'on vient de couper.
  dossier_desactive: 'neutral',
  acces_revoque: 'neutral',
  acces_non_envoye: 'danger',
  // Le lien a été présenté et la porte n'a pas cédé : ce n'est plus une
  // attente, c'est un incident — même registre que `acces_non_envoye`.
  entree_refusee: 'danger',
  jamais_connecte: 'warning',
  onboarding_a_finir: 'warning',
  // Anomalie, pas attente : l'onboarding validé aurait dû assigner le pack.
  pack_absent: 'danger',
  complet: 'success',
};

/**
 * Encart « Nouveaux patients » de l'aside du Fil du jour.
 *
 * Il répond à une question qu'aucun écran ne posait : le dossier ouvert la
 * semaine dernière est-il RÉELLEMENT en service ? Trois portes séparent la
 * création du dossier de son existence clinique — e-mail d'accès, entrée au
 * portail, pack de base — et un dossier resté derrière l'une d'elles est
 * indiscernable, partout ailleurs, d'un dossier qui commence.
 *
 * L'encart nomme la porte fermée et s'arrête là : renvoyer l'accès ou
 * assigner un pack reste au dossier, où ces gestes vivent déjà. Un encart
 * d'accueil montre, il ne double pas les surfaces d'action.
 */
export function NouveauxPatientsAside() {
  const [data, setData] = useState<NouveauxPatientsApiResponse | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch('/api/praticien/nouveaux-patients')
      .then(async r => (await r.json()) as NouveauxPatientsApiResponse)
      .then(setData)
      .catch(() => setData({ ok: false, lignes: [], fenetreJours: 30, unavailable: true }))
      .finally(() => setChargement(false));
  }, []);

  const lignes = data?.lignes ?? [];
  const nbEnAttente = lignes.filter(estEnAttente).length;
  // Rendu client uniquement (`useEffect` a déjà tourné) : pas d'écart
  // d'hydratation à craindre sur une horloge lue au rendu.
  const maintenant = new Date();

  return (
    <section
      data-testid="nouveaux-patients-aside"
      aria-label="Nouveaux patients"
      className="rounded-lg border border-border bg-surface p-5 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-foreground">Nouveaux patients</h3>
        {!chargement && !data?.unavailable && nbEnAttente > 0 && (
          <Badge variant="warning">
            {nbEnAttente} en attente
          </Badge>
        )}
      </div>

      {chargement ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-7 animate-pulse rounded-lg bg-muted" />
          <div className="h-7 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : !data || data.unavailable ? (
        // Une lecture qui échoue n'est PAS « aucun nouveau patient » : l'afficher
        // vide ferait conclure qu'il n'y a rien à mettre en service.
        <p className="mt-3 text-sm text-muted-foreground">
          Les nouveaux patients sont momentanément indisponibles. Rechargez la page.
        </p>
      ) : lignes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Aucun dossier ouvert depuis {data.fenetreJours} jours.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {lignes.slice(0, MAX_LIGNES).map(ligne => (
            <li key={ligne.idPatient} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/dashboard/patients/${ligne.idPatient}`}
                  className="min-w-0 truncate text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {ligne.patient}
                </Link>
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {libelleTemporel(ligne.creeLe, maintenant).texte}
                </span>
              </div>
              <span>
                <Badge variant={VARIANTE[ligne.etape]}>{ligne.libelle}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!chargement && lignes.length > MAX_LIGNES && (
        <p className="mt-2 text-xs text-muted-foreground">
          + {lignes.length - MAX_LIGNES} autre{lignes.length - MAX_LIGNES > 1 ? 's' : ''} dossier
          {lignes.length - MAX_LIGNES > 1 ? 's' : ''} ouvert{lignes.length - MAX_LIGNES > 1 ? 's' : ''}.
        </p>
      )}

      <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
        Le pack de base part quand le patient valide son onboarding.{' '}
        <Link href="/dashboard/patients" className="hover:text-foreground hover:underline">
          Renvoyer un accès depuis la fiche
        </Link>
      </p>
    </section>
  );
}
