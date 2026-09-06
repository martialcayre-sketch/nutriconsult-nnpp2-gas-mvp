'use client';

import Link from 'next/link';
import { Badge, type BadgeVariant } from './Badge';
import { MenuActions, type ElementMenu } from './MenuActions';
import { phaseDossier, type PhaseDossier } from '@/lib/patient/cycleDeVie';

export type PatientRowData = {
  idPatient: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  actif: 'OUI' | 'NON';
  suiviClotureLe: string | null;
};

export type ActionDossier =
  | 'resend'
  | 'copier'
  | 'lien_magique'
  | 'revoke'
  | 'desactiver'
  | 'reactiver'
  | 'cloturer'
  | 'rouvrir'
  | 'effacer';

// Le statut n'est JAMAIS porté par la seule couleur (registre §1) : chaque
// phase a son libellé propre. « Suivi clôturé » et « Inactif » ne se
// distingueraient pas d'un gris à l'autre.
const LIBELLE_PHASE: Record<PhaseDossier, string> = {
  en_suivi: 'Actif',
  suivi_cloture: 'Suivi clôturé',
  desactive: 'Inactif',
};

const VARIANT_PHASE: Record<PhaseDossier, BadgeVariant> = {
  en_suivi: 'success',
  suivi_cloture: 'neutral',
  desactive: 'neutral',
};

export function PatientRow({
  patient,
  onEdit,
  onAction,
  lienMagiqueActif = false,
  actionAccesEnCours = false,
}: {
  patient: PatientRowData;
  onEdit: (patient: PatientRowData) => void;
  onAction: (action: ActionDossier, patient: PatientRowData) => void;
  lienMagiqueActif?: boolean;
  /**
   * Une action d'accès est en vol. Les boutons remplacés portaient ce garde ;
   * sans lui, deux ouvertures successives du menu suffisent à envoyer deux
   * fois le même lien au patient.
   */
  actionAccesEnCours?: boolean;
}) {
  const phase = phaseDossier({
    actif: patient.actif === 'OUI',
    suiviClotureLe: patient.suiviClotureLe ? new Date(patient.suiviClotureLe) : null,
  });
  const estClos = phase === 'suivi_cloture';
  const estInactif = patient.actif === 'NON';

  const agir = (action: ActionDossier) => () => onAction(action, patient);

  // Les actions d'accès restent OUVERTES sur un dossier clos, et c'est
  // délibéré : la clôture interdit les assignations et les envois de
  // documents (D4), pas la lecture. Le patient conserve ses archives, donc
  // lui renvoyer son lien a du sens.
  //
  // SUR UN DOSSIER DÉSACTIVÉ, EN REVANCHE, LES TROIS ACTIONS D'ACCÈS SONT
  // FERMÉES ICI. Le serveur les refusait déjà, mais en `patient_not_found` —
  // que l'écran rend « Patient introuvable. » sur un dossier que le praticien a
  // sous les yeux. Un bouton qui ment est pire qu'un bouton grisé.
  //
  // « COPIER LE LIEN » COMPRIS : il poste, lui aussi (`action: 'lien'`), et le
  // garde `!patient.actif` d'`api/praticien/token` précède l'aiguillage des
  // actions — il le refuse donc au même titre que les deux envois.
  const elements: ElementMenu[] = [
    { type: 'groupe', libelle: 'Accès au portail' },
    {
      type: 'action',
      id: 'resend',
      libelle: 'Renvoyer le lien',
      onSelect: agir('resend'),
      desactive: actionAccesEnCours || estInactif,
    },
    {
      type: 'action',
      id: 'copier',
      libelle: 'Copier le lien',
      onSelect: agir('copier'),
      desactive: actionAccesEnCours || estInactif,
    },
    ...(lienMagiqueActif
      ? [
          {
            type: 'action' as const,
            id: 'lien_magique',
            libelle: 'Lien à usage unique (24 h)',
            onSelect: agir('lien_magique'),
            desactive: actionAccesEnCours || estInactif,
          },
        ]
      : []),
    {
      type: 'action',
      id: 'revoke',
      libelle: 'Révoquer l’accès',
      onSelect: agir('revoke'),
      desactive: actionAccesEnCours,
    },
    estInactif
      ? {
          type: 'action',
          id: 'reactiver',
          libelle: 'Réactiver le dossier',
          onSelect: agir('reactiver'),
        }
      : {
          type: 'action',
          id: 'desactiver',
          libelle: 'Désactiver le dossier',
          onSelect: agir('desactiver'),
        },
    { type: 'groupe', libelle: 'Fin de parcours' },
    estClos
      ? { type: 'action', id: 'rouvrir', libelle: 'Rouvrir le suivi', onSelect: agir('rouvrir') }
      : {
          type: 'action',
          id: 'cloturer',
          libelle: 'Clôturer le suivi',
          onSelect: agir('cloturer'),
        },
    {
      type: 'action',
      id: 'effacer',
      libelle: 'Effacer définitivement',
      onSelect: agir('effacer'),
      danger: true,
    },
  ];

  return (
    <tr className="border-t border-border hover:bg-muted/50">
      <td className="px-4 py-2">{`${patient.prenom} ${patient.nom}`.trim() || '—'}</td>
      <td className="px-4 py-2">{patient.email || '—'}</td>
      <td className="px-4 py-2">{patient.telephone || '—'}</td>
      <td className="px-4 py-2">
        {/* Les deux états se cumulent et ne se déduisent pas l'un de l'autre.
            `phaseDossier` fait primer la clôture, ce qui est juste pour
            décider d'un envoi — mais afficher le seul « Suivi clôturé » sur un
            dossier désactivé laisserait croire que le patient consulte encore
            ses archives, alors que le portail les lui refuse. */}
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant={VARIANT_PHASE[phase]}>{LIBELLE_PHASE[phase]}</Badge>
          {estClos && estInactif && <Badge variant="neutral">Inactif</Badge>}
        </span>
      </td>
      <td className="px-4 py-2">
        <button
          onClick={() => onEdit(patient)}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Modifier
        </button>
      </td>
      <td className="px-4 py-2">
        {/* UN SEUL lien par ligne (audit 2026-09-02) : deux destinations vers
            la même fiche, différenciées par le seul onglet d'ouverture, se
            lisaient comme deux objets. L'entrée trajectoire garde sa porte
            dédiée (/dashboard/trajectoires) et le deep-link ?onglet= vit
            toujours côté fiche. */}
        <Link
          href={`/dashboard/patients/${encodeURIComponent(patient.idPatient)}`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Fiche patient
        </Link>
      </td>
      <td className="px-4 py-2">
        <MenuActions libelleDeclencheur="Gérer le dossier" elements={elements} />
      </td>
    </tr>
  );
}
