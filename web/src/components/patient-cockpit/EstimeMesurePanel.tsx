'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { useCbResultsEnabled } from './CbFeatureProvider';

// « Estimé ↔ mesuré » (maquette 5.0, écran Fiche-trajectoire) — étage 2 du
// rayon biologie (CB-09, [[D-122]] §2), derrière `isCbResultsEnabled` (posé
// avec ce code, geste daté [[D-081]]).
//
// LE PANNEAU CONFRONTE, IL NE FUSIONNE JAMAIS ([[A6-R2]]) : le déclaratif des
// questionnaires (estimé) vit dans les courbes de momentum ci-dessus ; ici
// s'affichent les MESURES, par analyte, côte à côte — aucun chiffre unique,
// aucun écart calculé, aucune interprétation (`DC-27` : score ≠ diagnostic ;
// l'interprétation appartient au praticien et, quand l'analyte l'exige, au
// médecin).
//
// LA SAISIE PORTE L'HEURE : l'unicité en base est (patient, analyte,
// horodatage) — deux prélèvements du même jour (cortisol salivaire
// matin/soir) ne coexistent que distingués par l'heure (frontière PR #838).
// L'unité n'est PAS saisie : la route la relit sur l'analyte au catalogue.

type AnalyteChoix = { code: string; libelle: string; unite: string | null };

type ResultatAffiche = {
  id: string;
  analyteCode: string;
  analyteLibelle: string;
  valeur: number;
  unite: string | null;
  /**
   * L'unité que l'analyte porte AUJOURD'HUI au catalogue — celle qui sera
   * consignée. `undefined` si la réponse est d'une version antérieure : on
   * n'affirme alors RIEN, on ne suppose pas qu'elle n'a pas bougé.
   */
  uniteCatalogue?: string | null;
  preleveLe: string;
  source: string;
  saisiLe: string;
  supersedesResultatId: string | null;
  /** Posé par le SERVEUR : `null` ⇒ cette ligne fait foi. */
  corrigeeParId: string | null;
};

function formatDateHeure(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatValeur(mesure: { valeur: number; unite: string | null }): string {
  return `${mesure.valeur}${mesure.unite ? ` ${mesure.unite}` : ''}`;
}

// Le second temps d'une correction : la valeur seule. L'analyte et la date ne
// sont pas offerts, et ce n'est pas une simplification d'écran — le serveur
// les relit sur la ligne visée ([[D-124]]). Les proposer ici laisserait croire
// qu'on peut corriger l'un ou l'autre, alors que ce serait annuler la mesure.
function CorrectionMesure({
  mesure,
  analyteAuCatalogue,
  catalogueLu,
  disabled,
  onCorriger,
  onAnnuler,
}: {
  mesure: ResultatAffiche;
  /** L'analyte TEL QU'IL EST AUJOURD'HUI, ou `null` s'il n'est plus servi. */
  analyteAuCatalogue: AnalyteChoix | null;
  /** Le catalogue a-t-il été lu JUSQU'AU BOUT ? Sinon `null` ne prouve rien. */
  catalogueLu: boolean;
  disabled: boolean;
  onCorriger: (valeur: number) => Promise<boolean>;
  onAnnuler: () => void;
}) {
  const [valeur, setValeur] = useState(String(mesure.valeur));
  const champ = useRef<HTMLInputElement | null>(null);
  const valeurNum = Number(valeur.replace(',', '.'));
  const prete = valeur.trim() !== '' && Number.isFinite(valeurNum);

  // LE LABEL DOIT DIRE L'UNITÉ QUI SERA CONSIGNÉE, pas celle d'origine. Le
  // serveur relit l'unité sur l'analyte au catalogue : si elle a changé depuis
  // la mesure, afficher l'ancienne ferait taper un nombre sous un libellé
  // faux — sur une donnée clinique, un facteur 1000 silencieux. Et le cas
  // n'est pas théorique : la correction est ouverte aux analytes retirés,
  // c'est-à-dire là où le catalogue a bougé (contre-revue du 2026-09-06, M2).
  //
  // L'UNITÉ QUI SERA CONSIGNÉE VIENT DE LA LIGNE, plus de la liste du
  // catalogue. La route du catalogue ne sert que les analytes ACTIFS : passer
  // par elle rendait l'alerte de divergence structurellement inatteignable
  // pour un analyte RETIRÉ — c'est-à-dire pour la population exacte que ce
  // lot ouvre à la correction, et celle où l'unité a justement pu bouger
  // (contre-revue du 2026-09-06, m17). Le serveur, lui, relit l'unité sur la
  // relation `analyte`, qui n'est pas filtrée par `actif`.
  //
  // La liste reste en SECOURS pour une réponse d'une version antérieure ; et
  // si aucune des deux ne renseigne, on n'affirme rien — on ne suppose pas
  // qu'une unité inconnue n'a pas bougé (`DC-24`, même discipline que la série).
  //
  // `!== undefined`, JAMAIS `??` — et le prédicat porte un nom pour que
  // l'intention survive au prochain refactor. `null` est une unité CONNUE et
  // vide (l'analyte n'en porte aucune au catalogue, cas clinique réel) ;
  // `undefined` est une ignorance. Les collapser en `mesure.uniteCatalogue ??
  // analyteAuCatalogue?.unite` se lit exactement pareil et ferait retomber
  // l'unité vide sur la liste, donc taire une divergence bien réelle.
  const catalogueRenseigne = mesure.uniteCatalogue !== undefined;
  const uniteConnue = catalogueRenseigne || analyteAuCatalogue !== null;
  const uniteConsignee = catalogueRenseigne
    ? mesure.uniteCatalogue
    : (analyteAuCatalogue?.unite ?? null);
  const uniteChange = uniteConnue && uniteConsignee !== mesure.unite;

  // Le focus suit le geste : sans cela, le bouton « Corriger » disparaît et le
  // focus retombe sur le document — un utilisateur clavier perd sa place et
  // n'apprend pas que le second temps s'est ouvert.
  useEffect(() => {
    champ.current?.focus();
  }, []);

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-medium text-foreground">
        Corriger la mesure du {formatDateHeure(mesure.preleveLe)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        La valeur d’origine ({formatValeur(mesure)}) <strong>reste lisible</strong> : la correction
        ajoute une ligne, elle n’efface rien. L’analyte et la date de prélèvement ne se corrigent
        pas — les changer serait une autre mesure.
      </p>
      {uniteChange && (
        <p role="alert" className="mt-1 text-xs text-status-warning">
          L’unité de cet analyte a changé au catalogue depuis cette mesure : la correction sera
          consignée en <strong>{uniteConsignee ?? 'aucune unité'}</strong>, alors que l’originale
          est en <strong>{mesure.unite ?? 'aucune unité'}</strong>.
        </p>
      )}
      {/* ÉCHEC DE LECTURE ≠ ABSENCE D'ANALYTE — même règle que la série
          quelques lignes plus bas (`DC-24`). `analytes` part vide et le
          chargement du catalogue a son propre `catch` : sans distinguer
          l'état, « n'est plus servi » s'affirmerait aussi CATALOGUE EN VOL et
          CATALOGUE EN PANNE, sur un analyte parfaitement actif
          (contre-revue du 2026-09-06, m11). */}
      {catalogueLu && analyteAuCatalogue === null && (
        // La phrase s'arrête là. La seconde moitié — « l'unité sera celle
        // qu'il y porte au moment de consigner » — était une ESQUIVE écrite
        // quand cette unité était inconnaissable ici. Elle l'est désormais :
        // le label la nomme et la bannière la compare. La garder ferait douter
        // des deux, dans le seul cas que ce diff existe pour éclairer.
        <p className="mt-1 text-xs text-muted-foreground">
          Cet analyte n’est plus servi par le catalogue.
        </p>
      )}
      {!uniteConnue && (
        <p className="mt-1 text-xs text-muted-foreground">
          Unité non vérifiable pour l’instant : elle sera reprise du catalogue au moment de
          consigner.
        </p>
      )}
      <label className="mt-2 block text-xs text-muted-foreground" htmlFor={`correction-${mesure.id}`}>
        Valeur corrigée
        {uniteConnue
          ? uniteConsignee
            ? ` (${uniteConsignee})`
            : ''
          : mesure.unite
            ? ` (${mesure.unite} — à confirmer au catalogue)`
            : ''}
      </label>
      <input
        id={`correction-${mesure.id}`}
        ref={champ}
        type="text"
        inputMode="decimal"
        value={valeur}
        onChange={event => setValeur(event.target.value)}
        className="min-h-11 w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !prete}
          onClick={() => void onCorriger(valeurNum)}
          className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Consigner la correction
        </button>
        <button
          type="button"
          onClick={onAnnuler}
          className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function SaisieMesure({
  analytes,
  disabled,
  onConsigner,
}: {
  analytes: AnalyteChoix[];
  disabled: boolean;
  /** Rend `true` au succès : la valeur saisie ne s'efface qu'alors. */
  onConsigner: (saisie: { analyteCode: string; valeur: number; preleveLe: string }) => Promise<boolean>;
}) {
  const [analyteCode, setAnalyteCode] = useState('');
  const [valeur, setValeur] = useState('');
  const [preleveLe, setPreleveLe] = useState('');
  const choisi = analytes.find(a => a.code === analyteCode) ?? null;
  const valeurNum = Number(valeur.replace(',', '.'));
  const prete = choisi !== null && valeur.trim() !== '' && Number.isFinite(valeurNum) && preleveLe !== '';

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <p className="text-xs font-medium text-foreground">Consigner une mesure</p>
      <label className="mt-2 block text-xs text-muted-foreground" htmlFor="mesure-analyte">
        Analyte (unité du catalogue)
      </label>
      <select
        id="mesure-analyte"
        value={analyteCode}
        onChange={event => setAnalyteCode(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      >
        <option value="">— choisir —</option>
        {analytes.map(analyte => (
          <option key={analyte.code} value={analyte.code}>
            {analyte.libelle}
            {analyte.unite ? ` (${analyte.unite})` : ''}
          </option>
        ))}
      </select>
      <div className="mt-2 flex flex-wrap gap-2">
        <div>
          <label className="block text-xs text-muted-foreground" htmlFor="mesure-valeur">
            Valeur{choisi?.unite ? ` (${choisi.unite})` : ''}
          </label>
          <input
            id="mesure-valeur"
            type="text"
            inputMode="decimal"
            value={valeur}
            onChange={event => setValeur(event.target.value)}
            placeholder="42,5"
            className="min-h-11 w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground" htmlFor="mesure-preleve-le">
            Prélevé le (avec l’heure)
          </label>
          <input
            id="mesure-preleve-le"
            type="datetime-local"
            value={preleveLe}
            onChange={event => setPreleveLe(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        L’heure distingue deux prélèvements du même jour (profils salivaires, glycémies).
        Une valeur saisie de travers se corrige depuis la série : la correction ajoute une ligne
        et laisse l’erreur visible.
      </p>
      <button
        type="button"
        disabled={disabled || !prete}
        onClick={() => {
          if (choisi === null) return;
          void onConsigner({
            analyteCode: choisi.code,
            valeur: valeurNum,
            preleveLe: new Date(preleveLe).toISOString(),
          }).then(ok => {
            if (ok) setValeur('');
          });
        }}
        className="mt-2 min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Consigner la mesure
      </button>
    </div>
  );
}

export function EstimeMesurePanel({ idPatient }: { idPatient?: string }) {
  const resultsEnabled = useCbResultsEnabled();
  const [resultats, setResultats] = useState<ResultatAffiche[]>([]);
  // ÉCHEC DE LECTURE ≠ ABSENCE DE MESURE (DC-24, même règle que le runtime
  // clinique deux panneaux plus haut) : l'état vide ne s'affirme qu'après une
  // lecture ABOUTIE — jamais pendant le chargement, jamais sur une panne.
  const [lecture, setLecture] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [analytes, setAnalytes] = useState<AnalyteChoix[]>([]);
  /** Même discipline que `lecture` : un catalogue non lu n'affirme rien. */
  const [catalogue, setCatalogue] = useState<'chargement' | 'ok' | 'erreur'>('chargement');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  /** Identifiant de la mesure en cours de correction — une seule à la fois. */
  const [correctionDe, setCorrectionDe] = useState<string | null>(null);
  const actif = resultsEnabled && typeof idPatient === 'string' && idPatient !== '';

  const chargerResultats = useCallback(async () => {
    if (!actif) return;
    try {
      const response = await fetch(
        `/api/praticien/biologie/resultats?idPatient=${encodeURIComponent(idPatient ?? '')}`,
      );
      const payload = (await response.json()) as { ok: boolean; resultats?: ResultatAffiche[] };
      if (response.ok && payload.ok) {
        setResultats(payload.resultats ?? []);
        setLecture('ok');
      } else {
        setLecture('erreur');
      }
    } catch {
      // Un échec n'efface pas une série déjà affichée — mais il se DIT.
      setLecture('erreur');
    }
  }, [actif, idPatient]);

  useEffect(() => {
    void chargerResultats();
  }, [chargerResultats]);

  useEffect(() => {
    if (!actif) return;
    let abandonne = false;
    (async () => {
      try {
        const response = await fetch('/api/praticien/biologie/catalogue');
        const payload = (await response.json()) as {
          ok: boolean;
          analytes?: Array<{ code: string; libelle: string; unite: string | null }>;
        };
        if (abandonne) return;
        if (response.ok && payload.ok) {
          setAnalytes(
            (payload.analytes ?? []).map(a => ({ code: a.code, libelle: a.libelle, unite: a.unite })),
          );
          setCatalogue('ok');
        } else {
          setCatalogue('erreur');
        }
      } catch {
        // Sans catalogue, la saisie reste fermée — la série se lit quand même.
        // Mais l'échec se DIT : sans lui, une liste vide passerait pour un
        // catalogue lu, et la correction affirmerait un analyte retiré.
        if (!abandonne) setCatalogue('erreur');
      }
    })();
    return () => {
      abandonne = true;
    };
  }, [actif, idPatient]);

  // Rend `true` au succès seulement : le formulaire ne vide la valeur saisie
  // qu'à ce moment — un refus (doublon, dossier clos, 500) laisse la saisie
  // intacte plutôt que de forcer une re-frappe de mémoire d'une donnée
  // clinique.
  const consigner = useCallback(
    async (
      saisie:
        | { analyteCode: string; valeur: number; preleveLe: string }
        | { supersedesResultatId: string; valeur: number },
    ): Promise<boolean> => {
      setEnvoiEnCours(true);
      setErreur(null);
      try {
        const response = await fetch('/api/praticien/biologie/resultats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idPatient, ...saisie }),
        });
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          setErreur(payload.error ?? 'La mesure n’a pas pu être consignée.');
          return false;
        }
        await chargerResultats();
        return true;
      } catch {
        setErreur('La mesure n’a pas pu être consignée.');
        return false;
      } finally {
        setEnvoiEnCours(false);
      }
    },
    [idPatient, chargerResultats],
  );

  if (!actif) {
    return (
      <section aria-label="Estimé et mesuré" className="rounded-lg border border-border/60 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground">Estimé ↔ mesuré</h4>
          <Badge variant="info">Second temps — à activer</Badge>
        </div>
        <p className="mt-2 text-base text-muted-foreground">
          Cet instrument confrontera le déclaratif des questionnaires (estimé) aux résultats de biologie
          fonctionnelle (mesuré) — jamais fusionnés en un chiffre unique. L’hébergement de données de santé
          est en place ; la saisie des résultats s’ouvre avec l’activation de l’étage 2 du rayon, et rien
          n’est affiché d’ici là.
        </p>
      </section>
    );
  }

  const parAnalyte = new Map<string, ResultatAffiche[]>();
  // Pour lire la correction d'une ligne corrigée : le serveur donne son
  // identifiant, l'écran ne fait que le suivre — la règle de départage d'une
  // fourche n'est PAS rejouée ici (elle vit dans `filCorrection`).
  const parId = new Map<string, ResultatAffiche>();
  for (const resultat of resultats) {
    const serie = parAnalyte.get(resultat.analyteCode) ?? [];
    serie.push(resultat);
    parAnalyte.set(resultat.analyteCode, serie);
    parId.set(resultat.id, resultat);
  }

  return (
    <section aria-label="Estimé et mesuré" className="rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">Estimé ↔ mesuré</h4>
        <Badge variant="info">Mesures consignées</Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Le déclaratif (estimé) se lit dans les courbes de trajectoire, dès qu’un cycle est
        confirmé ; les mesures se lisent ici, par analyte — <strong>jamais fusionnés en un
        chiffre unique</strong>, et sans interprétation : elle revient au praticien et, quand
        l’analyte l’exige, au médecin.
      </p>

      {/* L'état vide ne s'affirme qu'après lecture ABOUTIE : « aucune mesure »
          sur une panne serait une absence de donnée fabriquée (DC-24). */}
      {lecture === 'chargement' ? (
        <p className="mt-3 rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Lecture des mesures en cours — une lecture en cours n’est pas une absence.
        </p>
      ) : lecture === 'erreur' && parAnalyte.size === 0 ? (
        <div className="mt-3 rounded-lg border border-status-danger/60 p-3">
          <p role="alert" className="text-sm text-status-danger">
            La série n’a pas pu être lue : impossible d’affirmer qu’aucune mesure n’existe.
          </p>
          <button
            type="button"
            onClick={() => {
              setLecture('chargement');
              void chargerResultats();
            }}
            className="mt-2 min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
          >
            Relire la série
          </button>
        </div>
      ) : parAnalyte.size === 0 ? (
        <p className="mt-3 rounded-lg border border-border p-3 text-sm text-foreground">
          Aucune mesure consignée pour ce dossier.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {[...parAnalyte.entries()].map(([code, serie]) => (
            <li key={code} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">{serie[0].analyteLibelle}</p>
              <ul className="mt-1 space-y-1">
                {serie.map(mesure => {
                  const correction = mesure.corrigeeParId
                    ? (parId.get(mesure.corrigeeParId) ?? null)
                    : null;
                  // `Boolean`, pas `!== null` : un champ ABSENT (payload d'une
                  // version antérieure, réponse tronquée) vaut `undefined` et
                  // passerait pour « corrigée » — l'écran barrerait une mesure
                  // que personne n'a corrigée, et cacherait son geste.
                  const corrigee = Boolean(mesure.corrigeeParId);
                  return (
                    <li key={mesure.id} className="text-xs text-muted-foreground">
                      <span className={corrigee ? 'line-through' : undefined}>
                        {formatValeur(mesure)}
                      </span>{' '}
                      — prélevé le {formatDateHeure(mesure.preleveLe)} (
                      {mesure.source === 'import_labo' ? 'import laboratoire' : 'saisie praticien'})
                      {mesure.supersedesResultatId !== null && (
                        // La date de CHAQUE correction se lit sur SA ligne. Sans
                        // elle, `saisiLe` n'apparaîtrait nulle part (la série
                        // affiche `preleveLe`) et le fil ne se lirait plus
                        // pas-à-pas : sur a→b→c, la date à laquelle `a` a été
                        // reprise serait perdue, dans un lot dont tout le propos
                        // est que l'erreur reste lisible (`DC-30`).
                        <span className="ml-1 text-foreground">
                          · correction consignée le {formatDateHeure(mesure.saisiLe)}
                        </span>
                      )}
                      {corrigee && (
                        // L'erreur RESTE À L'ÉCRAN, barrée et datée : c'est le
                        // sens de DC-30, et c'est pour cela qu'on ne filtre pas.
                        //
                        // LA PHRASE NOMME UN ÉTAT, PAS UN ÉVÉNEMENT. `corrigeeParId`
                        // désigne la ligne qui FAIT FOI, pas le successeur direct :
                        // sur a→b→c, `a` pointe vers `c`, et « corrigée le [date de
                        // c] » affirmerait un geste qui n'a jamais eu lieu — c'est
                        // `b` qui a corrigé `a`, à une autre date, vers une autre
                        // valeur. Sur une fourche, `c` est même une SŒUR de `b`, et
                        // le verbe « corrigée » serait faux deux fois
                        // (contre-revue du 2026-09-06, M1-bis).
                        <span className="ml-1">
                          · remplacée
                          {correction
                            ? ` — la valeur qui fait foi est ${formatValeur(correction)},`
                              + ` consignée le ${formatDateHeure(correction.saisiLe)}`
                            : ''}
                        </span>
                      )}
                      {!corrigee && correctionDe !== mesure.id && (
                        <button
                          type="button"
                          // Désactivé tant qu'un autre second temps est ouvert :
                          // en changer démonterait le formulaire et jetterait
                          // la valeur en cours de frappe, alors qu'on protège
                          // soigneusement cette même saisie contre un refus.
                          disabled={envoiEnCours || correctionDe !== null}
                          // Un nom accessible DATÉ : sans lui, n boutons
                          // « Corriger » sont indiscernables au lecteur d'écran.
                          aria-label={`Corriger la mesure du ${formatDateHeure(mesure.preleveLe)}`}
                          onClick={() => {
                            setErreur(null);
                            setCorrectionDe(mesure.id);
                          }}
                          className="ml-2 min-h-11 rounded-lg border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
                        >
                          Corriger
                        </button>
                      )}
                      {correctionDe === mesure.id && (
                        <CorrectionMesure
                          mesure={mesure}
                          analyteAuCatalogue={
                            analytes.find(a => a.code === mesure.analyteCode) ?? null
                          }
                          catalogueLu={catalogue === 'ok'}
                          disabled={envoiEnCours}
                          onAnnuler={() => setCorrectionDe(null)}
                          onCorriger={async valeur => {
                            const ok = await consigner({
                              supersedesResultatId: mesure.id,
                              valeur,
                            });
                            if (ok) setCorrectionDe(null);
                            return ok;
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {erreur}
        </p>
      )}

      <SaisieMesure analytes={analytes} disabled={envoiEnCours} onConsigner={consigner} />
    </section>
  );
}
