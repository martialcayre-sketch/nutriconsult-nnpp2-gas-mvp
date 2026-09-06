'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EpisodeAgenda } from '@/app/api/praticien/agenda-sommeil/route';
import type { AgregatsAgenda } from '@/lib/agenda-sommeil/agregats';
import { NB_JOURS_AGENDA } from '@/lib/agenda-sommeil/types';
import { ChronogrammeSommeil } from './ChronogrammeSommeil';

// Panneau praticien de l'agenda du sommeil : détail nuit par nuit + agrégats
// (avec chiffres) + clôture manuelle. Le score global et son interprétation
// restent affichés par le tableau des réponses standard (la clôture y crée une
// QuestionnaireReponse Q_SOM_09) ; ce panneau montre la matière brute.

function minutesEnHeures(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

function Tuile({ libelle, valeur, appui }: { libelle: string; valeur: string | null; appui?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-xs text-muted-foreground">{libelle}</p>
      {valeur === null ? (
        // Métrique non couverte : on l'écrit, on ne la remplace pas par un 0 —
        // « non renseigné » et « nul » ne se soignent pas de la même façon.
        <p className="text-base font-semibold text-muted-foreground">Non renseigné</p>
      ) : (
        <p className="text-base font-semibold text-foreground tabular-nums">{valeur}</p>
      )}
      {appui && <p className="text-2xs text-muted-foreground">{appui}</p>}
    </div>
  );
}

function TuilesAgregats({ a }: { a: AgregatsAgenda }) {
  // Chaque métrique porte sa propre couverture : le dénominateur du sommeil
  // moyen n'est pas celui de la régularité dès qu'une nuit v1 est dans la
  // fenêtre. L'afficher évite de lire une moyenne partielle comme complète.
  const couvTst =
    a.AGD_NB_NUITS_TST < a.AGD_NB_NUITS ? `sur ${a.AGD_NB_NUITS_TST} nuits` : undefined;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Tuile
        libelle="Sommeil moyen"
        valeur={a.AGD_TST_MOY === null ? null : minutesEnHeures(a.AGD_TST_MOY)}
        appui={couvTst}
      />
      {/* Efficacité = sommeil / temps au lit, ce dernier courant de la MISE AU
          LIT à la sortie du lit (convention du consensus). Les valeurs d'avant,
          calculées depuis l'extinction, étaient plus flatteuses et
          incomparables avec celles d'un autre service. */}
      <Tuile
        libelle="Efficacité"
        valeur={a.AGD_EFF_MOY === null ? null : `${a.AGD_EFF_MOY} %`}
        appui={
          a.AGD_NB_NUITS_EFF < a.AGD_NB_NUITS ? `sur ${a.AGD_NB_NUITS_EFF} nuits` : undefined
        }
      />
      <Tuile
        libelle="Temps au lit"
        valeur={a.AGD_TIB_MOY === null ? null : minutesEnHeures(a.AGD_TIB_MOY)}
        appui="mise au lit → lever"
      />
      {/* Deux grandeurs qu'on ne peut plus confondre : le temps passé au lit
          avant d'éteindre (lecture, écrans, attente — cible du contrôle du
          stimulus) et la latence d'endormissement une fois la lumière éteinte.
          Un patient à « 60 min avant extinction / 10 min de latence » et un
          patient à « 0 / 70 » avaient le même profil ; ils appellent des
          conduites opposées. */}
      <Tuile
        libelle="Au lit avant extinction"
        valeur={a.AGD_PRELIT_MOY === null ? null : `${a.AGD_PRELIT_MOY} min`}
        appui={
          a.AGD_NB_NUITS_PRELIT < a.AGD_NB_NUITS ? `sur ${a.AGD_NB_NUITS_PRELIT} nuits` : undefined
        }
      />
      <Tuile libelle="Endormissement médian" valeur={`${a.AGD_LAT_MED} min`} />
      <Tuile
        libelle="Éveil nocturne"
        valeur={a.AGD_WASO_MOY === null ? null : `${a.AGD_WASO_MOY} min`}
      />
      {/* Temps passé éveillé AU LIT après le dernier réveil. C'est lui qui rend
          visible le réveil matinal précoce : jusqu'ici ces minutes étaient
          comptées comme du sommeil et le phénomène n'apparaissait nulle part. */}
      <Tuile
        libelle="Éveil du matin au lit"
        valeur={a.AGD_TWAK_MOY === null ? null : `${a.AGD_TWAK_MOY} min`}
        appui={
          a.AGD_NB_NUITS_TWAK < a.AGD_NB_NUITS ? `sur ${a.AGD_NB_NUITS_TWAK} nuits` : undefined
        }
      />
      <Tuile libelle="Régularité" valeur={`± ${a.AGD_REG_ECT} min`} />
      <Tuile
        libelle="Nuits notées"
        valeur={`${a.AGD_NB_NUITS} / ${NB_JOURS_AGENDA}`}
        appui={`dont ${a.AGD_NB_NUITS_WE} de week-end`}
      />
      {/* Exposition, jamais un résultat : comptée et affichée, jamais scorée. */}
      <Tuile
        libelle="Nuits sous aide au sommeil"
        valeur={
          a.AGD_NB_NUITS_AIDE === null
            ? null
            : `${a.AGD_NB_NUITS_AIDE} / ${a.AGD_NB_NUITS_AIDE_CONNU}`
        }
      />
    </div>
  );
}

// Le critère clinique usuel est une FRÉQUENCE — tant de nuits par semaine
// au-dessus de 30 minutes —, que les moyennes effacent : une latence médiane de
// 22 min peut recouvrir quatre nuits à 8 min et trois à plus d'une heure. La
// convention de recherche (≥ 3 nuits/semaine) est nommée, jamais conclue : on
// rapporte un nombre et sa convention, on ne pose pas de diagnostic.
function Frequences({ a }: { a: AgregatsAgenda }) {
  if (a.AGD_FREQ_CRITERE_SEM === null) return null;
  const partiel = a.AGD_NB_NUITS_FREQ < a.AGD_NB_NUITS;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-xs text-muted-foreground">Nuits par semaine au-delà de 30 min</p>
      <p className="text-sm text-foreground tabular-nums">
        Endormissement <strong>{a.AGD_FREQ_LAT30_SEM}</strong> · éveil nocturne{' '}
        <strong>{a.AGD_FREQ_WASO30_SEM}</strong> · l’un ou l’autre{' '}
        <strong>{a.AGD_FREQ_CRITERE_SEM}</strong>
      </p>
      <p className="text-2xs text-muted-foreground">
        Convention de recherche : ≥ 3 nuits/semaine.
        {partiel
          ? ` Calculé sur ${a.AGD_NB_NUITS_FREQ} nuits — les nuits notées avant la refonte des bornes ne sont pas classables pour ce seuil.`
          : ''}
      </p>
    </div>
  );
}

// L'indice /100 n'est produit qu'au-dessus des seuils de couverture. Le dire ici
// évite au praticien de chercher un total qui n'existe pas — et rappelle que le
// compte de nuits ne suffit pas : c'est le week-end qui fait dériver les
// horaires, donc une fenêtre sans week-end ne permet pas de juger la régularité.
function NoteCouverture({ a }: { a: AgregatsAgenda }) {
  if (a.AGD_INDICE_ELIGIBLE === 1) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Métriques disponibles, indice global non produit : {a.AGD_NB_NUITS} nuit
      {a.AGD_NB_NUITS > 1 ? 's' : ''} exploitable{a.AGD_NB_NUITS > 1 ? 's' : ''} dont{' '}
      {a.AGD_NB_NUITS_WE} de week-end (14 dont 4 requises).
    </p>
  );
}

export function AgendaSommeilPraticienPanel({ idPatient }: { idPatient: string }) {
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [episodes, setEpisodes] = useState<EpisodeAgenda[]>([]);
  const [message, setMessage] = useState('');
  const [clotureEnCours, setClotureEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setEtat('chargement');
    try {
      const res = await fetch(`/api/praticien/agenda-sommeil?idPatient=${encodeURIComponent(idPatient)}`);
      const json = (await res.json()) as { ok: boolean; episodes?: EpisodeAgenda[]; error?: string };
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

  async function cloturer(idAssignation: string) {
    setClotureEnCours(idAssignation);
    try {
      const res = await fetch('/api/praticien/agenda-sommeil/cloture', {
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
    return <p className="text-sm text-muted-foreground">Chargement de l’agenda du sommeil…</p>;
  }
  if (etat === 'erreur') {
    return <p className="text-sm text-status-danger">{message}</p>;
  }
  if (episodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun agenda du sommeil assigné à ce patient. Assignez l’instrument « Agenda du sommeil — 21 nuits ».
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {message && <p className="text-sm text-status-danger">{message}</p>}
      {episodes.map((ep) => (
        <section key={ep.idAssignation} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{ep.titre}</p>
              <p className="text-xs text-muted-foreground">
                {ep.statut === 'cloture' ? 'Clôturé' : 'En cours'} ·{' '}
                {ep.fenetre.nbRenseignees} nuit{ep.fenetre.nbRenseignees > 1 ? 's' : ''} notée
                {ep.fenetre.nbRenseignees > 1 ? 's' : ''}
                {ep.fenetre.jourCourant !== null ? ` · jour ${ep.fenetre.jourCourant}/${NB_JOURS_AGENDA}` : ''}
              </p>
            </div>
            {ep.statut === 'en_cours' && ep.fenetre.nbRenseignees > 0 && (
              <button
                type="button"
                onClick={() => cloturer(ep.idAssignation)}
                disabled={clotureEnCours === ep.idAssignation}
                className="inline-flex min-h-9 items-center rounded-lg border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {clotureEnCours === ep.idAssignation ? 'Clôture…' : 'Clôturer et agréger'}
              </button>
            )}
          </div>

          {ep.agregats ? (
            <>
              <TuilesAgregats a={ep.agregats} />
              <Frequences a={ep.agregats} />
              <NoteCouverture a={ep.agregats} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Moins de 7 nuits exploitables : les moyennes ne sont pas encore calculées.
            </p>
          )}

          <ChronogrammeSommeil nuits={ep.nuits} />
        </section>
      ))}
    </div>
  );
}
