'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EpisodeAgendaAli } from '@/app/api/praticien/agenda-alimentaire/route';
import type { AgregatsAgendaAli } from '@/lib/agenda-alimentaire/agregats';
import type { JourRow, PriseJour } from '@/lib/agenda-alimentaire/types';
import { MIN_JOURS_AGREGATS, NB_JOURS_AGENDA_ALI } from '@/lib/agenda-alimentaire/types';
import { axesEnSurdeclaration, discordanceRythme, type RythmeDeclare } from '@/lib/equilibre/discordanceRythme';
import { useAgendaAliEnabled } from './AgendaAliFeatureProvider';

// Même conversion que le panneau du sommeil (`minutesEnHeures`,
// `AgendaSommeilPraticienPanel.tsx`) : « 660 min » n'est pas une grandeur
// interdite par la frontière de campagne (ce n'est ni un gramme, ni un kcal,
// ni un score, ni un indice), mais elle est illisible en l'état.
function minutesEnHeures(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

// Panneau praticien de l'agenda alimentaire : dossier de contrôle jour par
// jour (horaires de prises, cinq champs booléens), frise des 21 jours,
// agrégats sous condition de couverture, et compte de lignes en quarantaine.
//
// AUCUN score, indice, gramme, kcal ni quantité à l'écran — frontière de
// campagne assertée en base par `web/prisma/checks/agenda_alimentaire_v1.sql`
// et ici par la garde de test qui scanne le DOM rendu.

/**
 * Rendu d'un champ `boolean | null | undefined` — TROIS voire QUATRE états,
 * jamais réduits à `if (x)` / `!x` / `Boolean(x)` : `null` est une abstention
 * EXPLICITE du patient (« je ne sais pas »), distincte de `false` (observé
 * absent) et de `undefined` (clé absente, ligne écrite sous un contrat qui ne
 * la portait pas encore).
 */
function renduBooleen(valeur: boolean | null | undefined): string {
  if (valeur === true) return 'Oui';
  if (valeur === false) return 'Non';
  if (valeur === null) return 'Sans réponse (abstention)';
  return 'Non renseigné';
}

function ChampBooleen({ libelle, valeur }: { libelle: string; valeur: boolean | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 py-1 text-sm last:border-b-0">
      <span className="text-muted-foreground">{libelle}</span>
      <span className="font-medium text-foreground">{renduBooleen(valeur)}</span>
    </div>
  );
}

function naturePriseLabel(nature: PriseJour['nature']): string {
  return nature === 'repas' ? 'repas' : 'hors repas';
}

const formatSoumisLe = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

function JourneeCard({ jour }: { jour: JourRow }) {
  const { dateJour, reponses, soumisLe, supersedesJourId, canal } = jour;
  const prises = reponses.prises ?? [];
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="text-sm font-semibold text-foreground">{dateJour}</p>
        <p className="text-xs text-muted-foreground">Noté le {formatSoumisLe.format(new Date(soumisLe))}</p>
      </div>

      {supersedesJourId !== null && (
        <p className="text-xs text-muted-foreground">Journée corrigée — remplace une version antérieure.</p>
      )}

      {/*
       * `canal` n'est affiché que s'il diffère de `'portail'`. `CANAUX`
       * (`persistence.ts:41`) est aujourd'hui une liste fermée à
       * `['portail']` : cette branche est donc DORMANTE PAR CONSTRUCTION,
       * et c'est délibéré — le champ existe pour un second canal à venir.
       * L'afficher inconditionnellement poserait la même ligne 21 fois par
       * épisode pour une valeur qui ne varie jamais aujourd'hui.
       */}
      {canal !== 'portail' && <p className="text-xs text-muted-foreground">Saisie hors portail : {canal}</p>}

      {reponses.aucunePrise ? (
        <p className="text-sm text-muted-foreground">Aucune prise notée ce jour.</p>
      ) : prises.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune prise renseignée.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {prises.map((p, i) => (
            <li key={`${p.heure}-${i}`} className="flex items-center justify-between text-sm tabular-nums">
              <span className="text-foreground">{p.heure}</span>
              <span className="text-muted-foreground">{naturePriseLabel(p.nature)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 flex flex-col">
        <ChampBooleen libelle="Première prise riche en protéines" valeur={reponses.premierePriseProteines} />
        <ChampBooleen libelle="Repas du soir plus copieux" valeur={reponses.soirPlusCopieux} />
        <ChampBooleen libelle="Légumes à deux prises" valeur={reponses.legumesDeuxPrises} />
        <ChampBooleen libelle="Fruits ou oléagineux" valeur={reponses.fruitsOuOleagineux} />
        <ChampBooleen libelle="Aliments ultra-transformés" valeur={reponses.ultraTransformes} />
      </div>
    </section>
  );
}

// Sous MIN_JOURS_AGREGATS journées, `calculerAgregatsAli` rend `null` : la
// couverture insuffisante doit être DITE, jamais laisser une zone vide sans
// explication (le même signal trompeur que D-025 reproche à la bibliothèque).
function CouvertureInsuffisante({ nbJours }: { nbJours: number }) {
  return (
    <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
      Couverture insuffisante pour des moyennes — {nbJours}/{MIN_JOURS_AGREGATS} journées.
    </p>
  );
}

// Réserve nommée de D-027 (« L'écran ne dit pas que le recueil est fermé »),
// fermée ici. Ce panneau *rapporte* la position du drapeau, il ne s'y *garde*
// pas : la route reste lisible drapeau éteint (append-only, D-015), et cette
// bannière n'ajoute aucune condition d'accès — seulement un texte informatif.
function BanniereRecueilFerme() {
  return (
    <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
      Recueil fermé — le patient ne peut plus noter de journée. Les journées déjà notées restent lisibles ici.
    </p>
  );
}

function ResumeAgregats({ a }: { a: AgregatsAgendaAli }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-surface px-3 py-2">
        <p className="text-xs text-muted-foreground">Jeûne nocturne médian</p>
        <p className="text-base font-semibold text-foreground tabular-nums">
          {a.jeuneMedian === null ? 'Non renseigné' : minutesEnHeures(a.jeuneMedian)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-3 py-2">
        <p className="text-xs text-muted-foreground">Fenêtre alimentaire moyenne</p>
        <p className="text-base font-semibold text-foreground tabular-nums">
          {a.fenetreAliMoyenne === null ? 'Non renseigné' : minutesEnHeures(a.fenetreAliMoyenne)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-3 py-2">
        <p className="text-xs text-muted-foreground">Journées avec prises</p>
        <p className="text-base font-semibold text-foreground tabular-nums">
          {a.nbJoursAvecPrises} / {a.nbJours}
        </p>
      </div>
    </div>
  );
}

// Lecture de discordance rythme DÉCLARÉ vs OBSERVÉ (LOT-01, D-040). Ne rend QUE
// les axes en sur-déclaration — le patient dit favorable, l'agenda observe
// défavorable. Rien pour un axe concordant, non mesurable, ou déclaré
// défavorable (D-040 ne signale que l'asymétrie actionnable). Aucun score,
// aucun indice, aucun écart chiffré : seulement le rappel déclaré/observé porté
// par la fonction pure, dans la frontière de campagne du panneau.
//
// N'est appelée QUE sur un épisode CLÔTURÉ (voir le rendu) : D-040 confronte le
// déclaré à l'observé de l'agenda *clôturé*, pas à des agrégats partiels d'un
// recueil en cours. `ResumeAgregats` montre déjà les médianes d'un `en_cours`
// couvert, mais une lecture DIRECTIONNELLE sur données incomplètes tromperait —
// la consolidation, comme au LOT-00, est le fait de la clôture.
function LectureDiscordance({
  rythmeDeclare,
  agregats,
}: {
  rythmeDeclare: RythmeDeclare | null | undefined;
  agregats: AgregatsAgendaAli | null;
}) {
  const surdeclares = axesEnSurdeclaration(discordanceRythme(rythmeDeclare ?? null, agregats));
  if (surdeclares.length === 0) return null;
  return (
    <div className="rounded-lg border border-status-warning/50 bg-status-warning/10 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-status-warning">
        Rythme déclaré à confronter à l’observé
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {surdeclares.map(a => (
          <li key={a.axe} className="text-sm text-foreground">
            <span className="font-medium">{a.libelle}</span> — {a.declare}, {a.observe}.
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        À explorer en consultation — repère d’écart, non chiffré.
      </p>
    </div>
  );
}

function FriseJours({ episode }: { episode: EpisodeAgendaAli }) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label={`Frise des ${NB_JOURS_AGENDA_ALI} jours`}
    >
      {episode.fenetre.emplacements.map((e) => {
        const classe = e.estAujourdHui
          ? 'border-primary bg-primary/10 text-primary'
          : e.illisible
            ? 'border-status-danger/60 bg-status-danger/10 text-status-danger'
            : e.renseignee
              ? 'border-border bg-surface text-foreground'
              : 'border-border/50 bg-background text-muted-foreground';
        return (
          <span
            key={e.index}
            title={e.dateJour}
            className={`inline-flex h-6 w-6 items-center justify-center rounded text-3xs font-medium tabular-nums ${classe}`}
          >
            {e.index}
          </span>
        );
      })}
    </div>
  );
}

export function AgendaAlimentairePraticienPanel({
  idPatient,
  rythmeDeclare,
}: {
  idPatient: string;
  /** Rythme déclaré (Q_ALI_01), pour la lecture de discordance D-040. Optionnel
   *  et additif : absent, le panneau se comporte comme avant ce lot. */
  rythmeDeclare?: RythmeDeclare | null;
}) {
  const drapeauActif = useAgendaAliEnabled();
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [episodes, setEpisodes] = useState<EpisodeAgendaAli[]>([]);
  const [message, setMessage] = useState('');
  const [clotureEnCours, setClotureEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setEtat('chargement');
    // Un message d'échec précédent ne doit pas survivre à un rechargement
    // réussi : sans cette remise à zéro, un premier chargement en échec suivi
    // d'un second réussi laissait une ligne d'erreur au-dessus d'un agenda
    // correctement chargé.
    setMessage('');
    try {
      const res = await fetch(`/api/praticien/agenda-alimentaire?idPatient=${encodeURIComponent(idPatient)}`);
      const json = (await res.json()) as { ok: boolean; episodes?: EpisodeAgendaAli[]; error?: string };
      if (!json.ok || !json.episodes) {
        setMessage(json.error ?? 'Chargement impossible.');
        setEtat('erreur');
        return;
      }
      setEpisodes(json.episodes);
      setEtat('pret');
    } catch {
      setMessage('Connexion interrompue.');
      setEtat('erreur');
    }
  }, [idPatient]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Patron du jumeau sommeil (`AgendaSommeilPraticienPanel.cloturer`). Les
  // refus restent au SERVEUR — quarantaine avec dates nommées, recueil vide,
  // assignation annulée : les re-implémenter ici dupliquerait la règle, et
  // c'est le message nommé de la route qui apprend au praticien quoi régler.
  async function cloturer(idAssignation: string) {
    setClotureEnCours(idAssignation);
    try {
      const res = await fetch('/api/praticien/agenda-alimentaire/cloture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPatient, idAssignation }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) setMessage(json.error ?? 'Clôture impossible.');
      else await charger();
    } catch {
      setMessage('Connexion interrompue.');
    } finally {
      setClotureEnCours(null);
    }
  }

  if (etat === 'chargement') {
    return <p className="text-sm text-muted-foreground">Chargement de l’agenda alimentaire…</p>;
  }
  if (etat === 'erreur') {
    return <p className="text-sm text-status-danger">{message}</p>;
  }
  if (episodes.length === 0) {
    // Descriptif, sans impératif (D-027) : drapeau `WN_AGENDA_ALI` éteint,
    // `IDS_SUSPENDUS` retire `Q_ALI_09` à la fois de la bibliothèque et de la
    // route d'assignation — le geste « Assignez l'instrument » ne serait alors
    // possible nulle part. Cette réponse ne lit ni ne sert la position du
    // drapeau : c'est le sens même de D-027.
    return (
      <p className="text-sm text-muted-foreground">Aucun agenda alimentaire n’est assigné à ce patient.</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {message && <p className="text-sm text-status-danger">{message}</p>}
      {/*
       * `=== false` et non `!drapeauActif` : le contexte est à TROIS états et
       * `null` (position inconnue, provider absent) ne doit rien affirmer. Un
       * `!` aplatirait « je ne sais pas » en « fermé », c'est-à-dire en une
       * affirmation fausse sur l'état du dossier. Voir D-028.
       */}
      {drapeauActif === false && <BanniereRecueilFerme />}
      {episodes.map((ep) => (
        <section key={ep.idAssignation} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{ep.titre}</p>
              <p className="text-xs text-muted-foreground">
                {ep.statut === 'annulee' ? 'Annulée' : ep.statut === 'cloture' ? 'Clôturé' : 'En cours'} ·{' '}
                {ep.fenetre.nbRenseignees} journée{ep.fenetre.nbRenseignees > 1 ? 's' : ''} notée
                {ep.fenetre.nbRenseignees > 1 ? 's' : ''}
                {ep.fenetre.jourCourant !== null ? ` · jour ${ep.fenetre.jourCourant}/${NB_JOURS_AGENDA_ALI}` : ''}
              </p>
              {ep.illisibles > 0 && (
                // Un dossier de contrôle qui tait ses lignes en quarantaine ment
                // par omission : ce compte reste visible même sans détail par ligne.
                <p className="text-xs text-status-danger">
                  {ep.illisibles} ligne{ep.illisibles > 1 ? 's' : ''} en quarantaine, illisible
                  {ep.illisibles > 1 ? 's' : ''} — signalé pour intégrité, non affiché en détail ici.
                </p>
              )}
            </div>
            {/* « verser au dossier », pas « agréger » : la clôture alimentaire
                ne cote rien (D-039) — elle rend le recueil lisible du dossier.
                Le bouton reste rendu même avec des lignes en quarantaine : le
                serveur refuse alors en NOMMANT les dates, et c'est ce message
                qui dit au praticien quoi régler. */}
            {ep.statut === 'en_cours' && ep.fenetre.nbRenseignees > 0 && (
              <button
                type="button"
                onClick={() => void cloturer(ep.idAssignation)}
                disabled={clotureEnCours === ep.idAssignation}
                className="inline-flex min-h-9 items-center rounded-lg border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {clotureEnCours === ep.idAssignation ? 'Clôture…' : 'Clôturer et verser au dossier'}
              </button>
            )}
          </div>

          <FriseJours episode={ep} />

          {ep.agregats ? (
            <ResumeAgregats a={ep.agregats} />
          ) : (
            <CouvertureInsuffisante nbJours={ep.fenetre.nbRenseignees} />
          )}

          {ep.statut === 'cloture' && (
            <LectureDiscordance rythmeDeclare={rythmeDeclare} agregats={ep.agregats} />
          )}


          <div className="flex flex-col gap-2">
            {ep.jours.map((j) => (
              <JourneeCard key={j.id} jour={j} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
