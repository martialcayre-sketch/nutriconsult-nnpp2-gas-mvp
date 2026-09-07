'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  GRADES_PREUVE_SCIENTIFIQUE,
  labelGradePreuve,
  type GradePreuveScientifique,
} from '@/lib/supplement-library/types';
import type { RegleAtelier, StatutRegle } from '@/lib/supplement-library/gouvernance';
import type { RegleCreationApiResponse, ReglesApiResponse } from '@/app/api/praticien/regles/route';
import type { RegleRevisionApiResponse } from '@/app/api/praticien/regles/revision/route';
import type { RegleValidationApiResponse } from '@/app/api/praticien/regles/validation/route';
import type { RegleDesactivationApiResponse } from '@/app/api/praticien/regles/desactivation/route';
import type {
  EntreeIngredient,
  FormeIngredient,
  ReglesVocabulaireApiResponse,
  VocabulaireCreationApiResponse,
} from '@/app/api/praticien/regles/vocabulaire/route';
import type { ReglesPrevisualisationApiResponse } from '@/app/api/praticien/regles/previsualisation/route';
import type { SourceCreationApiResponse } from '@/app/api/praticien/regles/sources/route';
import type {
  CategorieCreee,
  CategoriesListeApiResponse,
} from '@/app/api/praticien/regles/categories/route';
import type {
  AlerteCreee,
  AlertesListeApiResponse,
} from '@/app/api/praticien/regles/alertes/route';

// Atelier de règles cliniques v1 (C4, LOT-03b) — le pendant de l'Atelier
// corpus pour le référentiel du moteur d'intention. L'écran matérialise le
// versioning append-only (décision actée n°5) :
//  - une règle NAÎT brouillon (création ou révision), et rien de son contenu
//    ne s'édite jamais en place — « réviser » crée la version suivante ;
//  - valider SIGNE (e-mail praticien + date) et désactive, côté serveur et
//    dans la même transaction, les versions validées antérieures de la lignée ;
//  - désactiver retire une version (raison obligatoire), sans effacer
//    signature ni contenu — la lignée reste auditable.
// Les gestes qui engagent le référentiel (valider, désactiver) sont en deux
// temps : le premier clic arme, le second confirme — et la désactivation exige
// SA raison avant confirmation.
//
// Le badge de grade est TOUJOURS étiqueté « preuve scientifique » (échelle
// GRADE : fort / modéré / faible / usage traditionnel) — à ne jamais confondre
// avec l'échelle A/B/C/D du moteur d'équilibre (provenance de donnée patient).
//
// Gardes d'écran (motif AtelierCorpusPanel) : une seule action en vol à la
// fois (verrou par ref), et chaque chargement porte un numéro de génération —
// une réponse arrivée après un changement d'onglet ou de page est jetée.

type Vocabulaire = Extract<ReglesVocabulaireApiResponse, { ok: true }>;
type Compteurs = { brouillons: number; validees: number; desactivees: number };

const ONGLETS: { statut: StatutRegle; libelle: string }[] = [
  { statut: 'brouillon', libelle: 'Brouillons' },
  { statut: 'validee', libelle: 'Validées' },
  { statut: 'desactivee', libelle: 'Désactivées' },
];

const LIMITE_PAGE = 20;

const LIBELLE_STATUT: Record<StatutRegle, string> = {
  brouillon: 'Brouillon — non servie par la résolution',
  validee: 'Validée',
  desactivee: 'Désactivée',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function classeChamp(): string {
  return 'rounded-lg border border-border bg-background px-3 py-1.5 text-sm';
}

/** Badge de grade — étiquette « preuve scientifique », jamais A/B/C/D nu. */
function BadgeGrade({ grade }: { grade: GradePreuveScientifique }) {
  return <Badge variant="neutral">preuve scientifique — {labelGradePreuve(grade)}</Badge>;
}

/**
 * La condition biologique servie par l'API, rendue affichable et ré-éditable
 * ([[D-138]], [[D-142]]).
 *
 * LECTURE DÉLIBÉRÉMENT PERMISSIVE, et c'est l'inverse du serveur : ici on rend
 * ce qu'on peut MONTRER. Une condition que le moteur jugerait illisible doit
 * rester visible au praticien — c'est précisément celle qu'il faut pouvoir
 * corriger. La validation stricte appartient au serveur, qui la refusera à
 * l'écriture avec le lecteur du moteur lui-même.
 */
function lireConditionBiologiqueAffichable(
  valeur: unknown,
): { cible: string; echeanceJour: string } | null {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return null;
  const condition = valeur as { cible?: unknown; echeance?: unknown };
  if (typeof condition.cible !== 'string' || !condition.cible.trim()) return null;
  // `<input type="date">` veut AAAA-MM-JJ ; la base garde un ISO complet.
  const echeanceJour = typeof condition.echeance === 'string'
    ? condition.echeance.slice(0, 10)
    : '';
  return { cible: condition.cible.trim(), echeanceJour };
}

type Etat = 'chargement' | 'chargee' | 'erreur';

/** Délai avant qu'une frappe ne devienne une requête (motif PatientsPanel). */
const DELAI_RECHERCHE_MS = 250;

// ─── Sélecteur d'ingrédient (C4-1c) ────────────────────────────────────────
//
// Le référentiel Compl'Alim verse ~2 000 ingrédients d'un coup : un `<select>`
// nu y devient inutilisable. D'où une recherche servie par le serveur, bornée à
// `INGREDIENTS_MAX`.
//
// L'ingrédient choisi est tenu ICI, comme OBJET COMPLET — jamais redéduit de la
// liste de résultats. C'est le point qui compte : la liste change à chaque
// frappe, et un choix déduit d'elle s'évaporerait dès que la recherche cesse de
// le contenir, emportant en silence la forme préférée déjà sélectionnée.

function SelecteurIngredient({
  choisi,
  initiaux,
  initialTotal,
  desactive,
  onChoix,
}: {
  choisi: EntreeIngredient | null;
  initiaux: EntreeIngredient[];
  initialTotal: number;
  desactive: boolean;
  onChoix: (ingredient: EntreeIngredient | null) => void;
}) {
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<EntreeIngredient[]>(initiaux);
  const [total, setTotal] = useState(initialTotal);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);
  const generationRef = useRef(0);
  const premierRenduRef = useRef(true);

  useEffect(() => {
    // Le premier rendu se contente de ce que le chargement initial du panneau a
    // déjà rapporté : une requête de plus pour le même résultat n'apprend rien.
    if (premierRenduRef.current) {
      premierRenduRef.current = false;
      return;
    }
    let monte = true;
    const minuteur = setTimeout(() => {
      const generation = ++generationRef.current;
      setEnCours(true);
      setEchec(false);
      void (async () => {
        try {
          const reponse = await fetch(
            `/api/praticien/regles/vocabulaire?requete=${encodeURIComponent(recherche.trim())}`,
          );
          const payload = (await reponse.json()) as ReglesVocabulaireApiResponse;
          // Garde d'obsolescence : une réponse en retard n'écrase pas la frappe
          // qui l'a suivie.
          if (!monte || generation !== generationRef.current) return;
          if (!reponse.ok || !payload.ok) {
            setEchec(true);
            return;
          }
          setResultats(payload.ingredients);
          setTotal(payload.ingredientsTotal);
        } catch {
          if (monte && generation === generationRef.current) setEchec(true);
        } finally {
          if (monte && generation === generationRef.current) setEnCours(false);
        }
      })();
    }, DELAI_RECHERCHE_MS);
    return () => {
      monte = false;
      clearTimeout(minuteur);
    };
  }, [recherche]);

  if (choisi) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
        <span className="flex-1 truncate text-foreground">Ingrédient : {choisi.nomFr}</span>
        <button
          type="button"
          disabled={desactive}
          onClick={() => onChoix(null)}
          className="shrink-0 text-xs font-medium text-primary underline disabled:opacity-50"
        >
          Changer
        </button>
      </div>
    );
  }

  const tronque = total > resultats.length;
  return (
    <div className="flex flex-col gap-1">
      <input
        type="search"
        aria-label="Rechercher un ingrédient"
        value={recherche}
        disabled={desactive}
        onChange={(event) => setRecherche(event.target.value)}
        placeholder="Rechercher un ingrédient (nom ou code)…"
        className={classeChamp()}
      />
      <div aria-live="polite" className="text-xs text-muted-foreground">
        {echec
          ? 'La recherche d’ingrédients a échoué. Réessayez.'
          : enCours
            ? 'Recherche en cours…'
            : resultats.length === 0
              ? 'Aucun ingrédient ne correspond.'
              : tronque
                ? `${total} ingrédients correspondent — les ${resultats.length} premiers sont proposés, précisez la recherche.`
                : `${resultats.length} ingrédient${resultats.length > 1 ? 's' : ''} proposé${resultats.length > 1 ? 's' : ''}.`}
      </div>
      {resultats.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">
          {resultats.map((entree) => (
            <li key={entree.id}>
              <button
                type="button"
                disabled={desactive}
                onClick={() => onChoix(entree)}
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
              >
                {entree.nomFr}{' '}
                {/* Le code est montré parce que la recherche porte AUSSI sur lui :
                    sans lui, chercher par code rend des lignes où le texte tapé
                    n'apparaît nulle part. */}
                <span className="text-xs text-muted-foreground">{entree.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Encart « tester une intention » (prévisualisation de résolution) ───────

function EncartPrevisualisation({ desactive }: { desactive: boolean }) {
  const [codes, setCodes] = useState('');
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'chargee' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');
  const [resolution, setResolution] = useState<
    Extract<ReglesPrevisualisationApiResponse, { ok: true }>['resolution'] | null
  >(null);
  const [verdicts, setVerdicts] = useState<
    Extract<ReglesPrevisualisationApiResponse, { ok: true }>['verdicts']
  >([]);

  const tester = async () => {
    const liste = codes.split(',').map((code) => code.trim()).filter(Boolean);
    if (liste.length === 0) return;
    setEtat('envoi');
    setErreur('');
    try {
      const reponse = await fetch('/api/praticien/regles/previsualisation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: liste }),
      });
      const payload = (await reponse.json()) as ReglesPrevisualisationApiResponse;
      if (!reponse.ok || !payload.ok) {
        setErreur(payload.ok ? 'La prévisualisation n’a pas pu être lue.' : payload.error);
        setEtat('erreur');
        return;
      }
      setResolution(payload.resolution);
      // `?? []` : une réponse servie par une version antérieure du serveur ne
      // doit pas casser l'écran — elle n'a simplement rien à dire du moteur.
      setVerdicts(payload.verdicts ?? []);
      setEtat('chargee');
    } catch {
      setErreur('La prévisualisation n’a pas pu être lue.');
      setEtat('erreur');
    }
  };

  return (
    <section
      aria-label="Tester une intention"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      <h3 className="font-display text-lg font-semibold text-foreground">Tester une intention</h3>
      <p className="text-sm text-muted-foreground">
        Prévisualisation d&apos;atelier : la résolution inclut ici les brouillons,
        marqués comme tels — elle n&apos;alimente jamais un protocole ni un patient.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="Codes d’intention à tester"
          value={codes}
          disabled={desactive || etat === 'envoi'}
          onChange={(event) => setCodes(event.target.value)}
          placeholder="codes d’intention, séparés par des virgules"
          className={`${classeChamp()} min-w-64 flex-1`}
        />
        <Button
          variant="outline"
          disabled={desactive || etat === 'envoi' || codes.trim().length === 0}
          onClick={() => void tester()}
        >
          {etat === 'envoi' ? 'Résolution…' : 'Tester la résolution'}
        </Button>
      </div>
      {etat === 'erreur' && (
        <p role="alert" className="rounded-lg border border-accent bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          {erreur}
        </p>
      )}
      {etat === 'chargee' && resolution && (
        <div className="flex flex-col gap-3">
          {resolution.codesInconnus.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Codes sans intention active : {resolution.codesInconnus.join(', ')}
            </p>
          )}
          {resolution.intentions.length === 0 && resolution.codesInconnus.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune intention résolue.</p>
          )}
          {/* CE QUE LE MOTEUR DÉCIDERAIT ([[D-133]]). Il n'avait aucun
              appelant ; il en a un ici, et ses refus disent LEQUEL des
              obstacles mord en premier — le catalogue vide, les alertes non
              publiées, l'absence de seuil. Invisible jusqu'ici : l'atelier
              montrait les règles résolues sans dire qu'aucune n'irait plus
              loin. Hors dossier, le déclencheur clinique n'est pas évalué. */}
          {verdicts.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2">
              <p className="text-sm font-medium text-foreground">Décision avant biologie</p>
              <ul className="flex flex-col gap-1">
                {verdicts.map((verdict, index) => (
                  <li
                    key={`${verdict.regleId ?? 'global'}-${index}`}
                    className="text-sm text-muted-foreground"
                  >
                    {verdict.verdict === 'refus'
                      ? <><Badge variant="warning">refus</Badge> {verdict.motif}</>
                      : <>
                          <Badge variant="warning">
                            {verdict.statut === 'conditionnelle_biologie'
                              ? 'en attente du bilan'
                              : 'intention'}
                          </Badge>{' '}
                          {verdict.motif}
                        </>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {resolution.intentions.map(({ intention, regles }) => (
            <div key={intention.id} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="text-sm font-medium text-foreground">
                {intention.labelFr} <span className="font-mono text-xs text-muted-foreground">({intention.code})</span>
              </p>
              {regles.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Aucune règle dans cette lignée.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {regles.map((regle) => (
                    <li key={regle.regleId} className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                      <span>
                        {regle.ingredient.nomFr}
                        {regle.formePreferee ? ` (${regle.formePreferee.labelFr})` : ''} · v{regle.versionRegle}
                      </span>
                      <BadgeGrade grade={regle.gradePreuve} />
                      {!regle.regleValidee && <Badge variant="warning">brouillon — non servie</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Formulaire de création (lignée neuve, brouillon v1) ────────────────────

function FormulaireCreation({
  vocabulaire,
  desactive,
  onCree,
}: {
  vocabulaire: Vocabulaire;
  desactive: boolean;
  onCree: () => void;
}) {
  const [intentTagId, setIntentTagId] = useState('');
  const [ingredient, setIngredient] = useState<EntreeIngredient | null>(null);
  const [formePrefereeId, setFormePrefereeId] = useState('');
  const [typeRegle, setTypeRegle] = useState('recommande');
  const [grade, setGrade] = useState<GradePreuveScientifique | ''>('');
  const [doseBasse, setDoseBasse] = useState('');
  const [doseHaute, setDoseHaute] = useState('');
  const [poids, setPoids] = useState('1');
  const [justification, setJustification] = useState('');
  const [sourceReferenceId, setSourceReferenceId] = useState('');
  const [critereId, setCritereId] = useState('');
  // La condition BIOLOGIQUE ([[D-138]]) : elle n'avait aucun champ de saisie —
  // donc aucun producteur, alors que le moteur la lit et en fait naître une
  // intention `conditionnelle_biologie`. Cible libre (un marqueur se nomme, il
  // ne se choisit pas dans une liste que le dépôt n'a pas), échéance optionnelle.
  const [cibleBio, setCibleBio] = useState('');
  const [echeanceBio, setEcheanceBio] = useState('');
  const [claimId, setClaimId] = useState('');
  const [versionClaim, setVersionClaim] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const ingredientId = ingredient?.id ?? '';
  const pret =
    intentTagId && ingredientId && typeRegle.trim() && grade && justification.trim()
    && sourceReferenceId && claimId.trim() && versionClaim.trim();

  const soumettre = async () => {
    if (!pret || envoi) return;
    setEnvoi(true);
    setErreur('');
    setSucces('');
    try {
      const reponse = await fetch('/api/praticien/regles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentTagId,
          ingredientId,
          typeRegle: typeRegle.trim(),
          gradePreuveScientifique: grade,
          justification: justification.trim(),
          sourceReferenceId,
          claimId: claimId.trim(),
          versionClaim: versionClaim.trim(),
          ...(formePrefereeId ? { formePrefereeId } : {}),
          ...(doseBasse.trim() ? { doseCibleBasse: Number(doseBasse) } : {}),
          ...(doseHaute.trim() ? { doseCibleHaute: Number(doseHaute) } : {}),
          ...(poids.trim() ? { poids: Number(poids) } : {}),
          // Les deux natures séparées ([[D-138]], producteurs posés par
          // [[D-142]]). L'ancien `conditionSupplementaire` n'est plus envoyé :
          // le moteur ne le lisait plus, et la règle naissait inconditionnelle.
          ...(critereId ? { conditionCritereId: critereId } : {}),
          ...(cibleBio.trim()
            ? {
                conditionBiologie: {
                  type: 'biologie',
                  cible: cibleBio.trim(),
                  ...(echeanceBio.trim()
                    ? { echeance: new Date(echeanceBio).toISOString() }
                    : {}),
                },
              }
            : {}),
        }),
      });
      const payload = (await reponse.json()) as RegleCreationApiResponse;
      if (!reponse.ok || !payload.ok) {
        setErreur(payload.ok ? 'La règle n’a pas pu être créée.' : payload.error);
        return;
      }
      setSucces(`Brouillon créé (v${payload.regle.versionRegle}) — à valider dans l’onglet Brouillons.`);
      setJustification('');
      setDoseBasse('');
      setDoseHaute('');
      setCritereId('');
      setCibleBio('');
      setEcheanceBio('');
      // Le claim est propre à CETTE règle : le laisser en place ferait fonder
      // la règle suivante sur la précédente sans que personne l'ait voulu.
      setClaimId('');
      setVersionClaim('');
      onCree();
    } catch {
      setErreur('La règle n’a pas pu être créée.');
    } finally {
      setEnvoi(false);
    }
  };

  const fige = desactive || envoi;
  return (
    <details className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <summary className="cursor-pointer font-display text-lg font-semibold text-foreground">
        Nouvelle règle (brouillon)
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Une règle naît en brouillon, invisible de la résolution tant qu&apos;elle
          n&apos;est pas validée. Justification, source et claim fondateur sont
          obligatoires : une règle ne peut reposer que sur un claim validé du
          corpus.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            aria-label="Intention clinique"
            value={intentTagId}
            disabled={fige}
            onChange={(event) => setIntentTagId(event.target.value)}
            className={classeChamp()}
          >
            <option value="">Intention clinique…</option>
            {vocabulaire.intentions.map((entree) => (
              <option key={entree.id} value={entree.id}>{entree.labelFr}</option>
            ))}
          </select>
          <SelecteurIngredient
            choisi={ingredient}
            initiaux={vocabulaire.ingredients}
            initialTotal={vocabulaire.ingredientsTotal}
            desactive={fige}
            onChoix={(entree) => {
              setIngredient(entree);
              // Changer d'ingrédient invalide la forme préférée : une forme
              // appartient à un ingrédient et à un seul.
              setFormePrefereeId('');
            }}
          />
          <select
            aria-label="Forme préférée (optionnelle)"
            value={formePrefereeId}
            disabled={fige || !ingredient}
            onChange={(event) => setFormePrefereeId(event.target.value)}
            className={classeChamp()}
          >
            <option value="">Forme préférée (optionnelle)…</option>
            {(ingredient?.formes ?? []).map((forme) => (
              <option key={forme.id} value={forme.id}>{forme.labelFr}</option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Type de règle"
            value={typeRegle}
            disabled={fige}
            onChange={(event) => setTypeRegle(event.target.value)}
            placeholder="type de règle (snake_case)"
            className={classeChamp()}
          />
          <select
            aria-label="Grade de preuve scientifique (échelle GRADE)"
            value={grade}
            disabled={fige}
            onChange={(event) => setGrade(event.target.value as GradePreuveScientifique | '')}
            className={classeChamp()}
          >
            <option value="">Preuve scientifique (échelle GRADE)…</option>
            {GRADES_PREUVE_SCIENTIFIQUE.map((valeur) => (
              <option key={valeur} value={valeur}>{labelGradePreuve(valeur)}</option>
            ))}
          </select>
          <select
            aria-label="Source"
            value={sourceReferenceId}
            disabled={fige}
            onChange={(event) => setSourceReferenceId(event.target.value)}
            className={classeChamp()}
          >
            <option value="">Source (obligatoire)…</option>
            {vocabulaire.sources.map((source) => (
              <option key={source.id} value={source.id}>{source.citation}</option>
            ))}
          </select>
          {/* Saisie libre plutôt que liste : le corpus compte des milliers de
              claims validés, et l'identifiant se recopie depuis le poste de
              revue qui l'a signé. Le format est vérifié ici ET côté serveur ;
              l'existence et le statut VALIDE, côté serveur seulement — ce que
              le navigateur affirme ne fonde rien. */}
          <input
            type="text"
            aria-label="Identifiant du claim fondateur"
            value={claimId}
            disabled={fige}
            onChange={(event) => setClaimId(event.target.value)}
            placeholder="claim fondateur (WN-CL-0000-000)"
            className={classeChamp()}
          />
          <input
            type="text"
            aria-label="Version du claim fondateur"
            value={versionClaim}
            disabled={fige}
            onChange={(event) => setVersionClaim(event.target.value)}
            placeholder="version du claim (v1.0)"
            className={classeChamp()}
          />
          <input
            type="number"
            aria-label="Dose cible basse"
            value={doseBasse}
            disabled={fige}
            min={0}
            onChange={(event) => setDoseBasse(event.target.value)}
            placeholder="dose cible basse (optionnelle)"
            className={classeChamp()}
          />
          <input
            type="number"
            aria-label="Dose cible haute"
            value={doseHaute}
            disabled={fige}
            min={0}
            onChange={(event) => setDoseHaute(event.target.value)}
            placeholder="dose cible haute (optionnelle)"
            className={classeChamp()}
          />
          <input
            type="number"
            aria-label="Poids de la règle"
            value={poids}
            disabled={fige}
            min={1}
            onChange={(event) => setPoids(event.target.value)}
            className={classeChamp()}
          />
          <select
            aria-label="Critère conditionnel (optionnel)"
            value={critereId}
            disabled={fige}
            onChange={(event) => setCritereId(event.target.value)}
            className={classeChamp()}
          >
            <option value="">Critère conditionnel (optionnel)…</option>
            {vocabulaire.criteres.map((critere) => (
              <option key={critere.id} value={critere.id}>{critere.labelFr}</option>
            ))}
          </select>
          {/* La condition BIOLOGIQUE, seconde nature de l'ancien champ ([[D-138]]).
              Sans ces deux champs, elle n'avait aucun producteur : le moteur la
              lit, personne ne l'écrivait. */}
          <input
            type="text"
            aria-label="Cible biologique conditionnelle (optionnelle)"
            value={cibleBio}
            disabled={fige}
            onChange={(event) => setCibleBio(event.target.value)}
            placeholder="cible biologique attendue (optionnelle)"
            className={classeChamp()}
          />
          <input
            type="date"
            aria-label="Échéance de la cible biologique (optionnelle)"
            value={echeanceBio}
            disabled={fige || !cibleBio.trim()}
            onChange={(event) => setEcheanceBio(event.target.value)}
            className={classeChamp()}
          />
        </div>
        {cibleBio.trim() && (
          <p className="text-xs text-muted-foreground">
            Cette règle ne produira qu&apos;une intention <em>suspendue à un bilan</em> :
            elle attendra « {cibleBio.trim()} » avant de rien proposer.
          </p>
        )}
        <textarea
          aria-label="Justification"
          value={justification}
          disabled={fige}
          maxLength={4000}
          rows={3}
          onChange={(event) => setJustification(event.target.value)}
          placeholder="Justification sourcée (obligatoire)"
          className={classeChamp()}
        />
        {erreur && (
          <p role="alert" className="rounded-lg border border-accent bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
            {erreur}
          </p>
        )}
        {succes && (
          <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {succes}
          </p>
        )}
        <Button className="self-start" disabled={fige || !pret} onClick={() => void soumettre()}>
          Créer le brouillon
        </Button>
      </div>
    </details>
  );
}

// ─── Formulaire de révision (nouvelle version en brouillon) ─────────────────

function FormulaireRevision({
  regle,
  vocabulaire,
  desactive,
  onSoumis,
  onAnnule,
}: {
  regle: RegleAtelier;
  vocabulaire: Vocabulaire;
  desactive: boolean;
  onSoumis: () => void;
  onAnnule: () => void;
}) {
  const [grade, setGrade] = useState<GradePreuveScientifique>(regle.gradePreuve);
  const [justification, setJustification] = useState(regle.justification);
  const [sourceReferenceId, setSourceReferenceId] = useState(regle.source.id);
  const [formePrefereeId, setFormePrefereeId] = useState(regle.formePreferee?.id ?? '');
  const [doseBasse, setDoseBasse] = useState(regle.doseCibleBasse?.toString() ?? '');
  const [doseHaute, setDoseHaute] = useState(regle.doseCibleHaute?.toString() ?? '');
  // LES CONDITIONS SONT REPRISES, ET C'EST UN CORRECTIF ([[D-142]]). Le
  // formulaire de révision n'envoyait AUCUNE condition : une révision étant une
  // réécriture complète, réviser une règle conditionnée à un critère la rendait
  // INCONDITIONNELLE, en silence et sans que rien ne l'affiche. Le praticien
  // croyait corriger une justification ; il retirait une garde clinique.
  const [critereId, setCritereId] = useState(regle.conditionCritere?.id ?? '');
  const conditionBio = lireConditionBiologiqueAffichable(regle.conditionBiologie);
  const [cibleBio, setCibleBio] = useState(conditionBio?.cible ?? '');
  const [echeanceBio, setEcheanceBio] = useState(conditionBio?.echeanceJour ?? '');
  // Le claim de la version révisée est REPRIS de la version en place — une
  // révision est une réécriture complète, et repartir vide ferait ressaisir à
  // la main ce que la règle porte déjà ([[D-140]]). Il reste modifiable :
  // réviser une règle, c'est parfois précisément changer ce sur quoi elle
  // repose.
  const [claimId, setClaimId] = useState(regle.claim?.claimId ?? '');
  const [versionClaim, setVersionClaim] = useState(regle.claim?.versionClaim ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Les formes de l'ingrédient de CETTE règle, chargées à la demande : depuis
  // C4-1c le vocabulaire ne porte plus qu'une page d'ingrédients, et l'ingrédient
  // d'une règle existante n'a aucune raison d'y figurer. Une seule révision est
  // ouverte à la fois, donc une seule requête.
  const [formes, setFormes] = useState<FormeIngredient[] | null>(null);
  const [formesEchec, setFormesEchec] = useState(false);

  useEffect(() => {
    let monte = true;
    setFormes(null);
    setFormesEchec(false);
    void (async () => {
      try {
        const reponse = await fetch(
          `/api/praticien/regles/vocabulaire?ingredientId=${encodeURIComponent(regle.ingredient.id)}`,
        );
        const payload = (await reponse.json()) as ReglesVocabulaireApiResponse;
        if (!monte) return;
        if (!reponse.ok || !payload.ok) {
          setFormesEchec(true);
          return;
        }
        setFormes(payload.ingredients[0]?.formes ?? []);
      } catch {
        if (monte) setFormesEchec(true);
      }
    })();
    return () => {
      monte = false;
    };
  }, [regle.ingredient.id]);

  // La forme préférée COURANTE est TOUJOURS une option, quel que soit l'état du
  // chargement — en cours, en échec, ou réussi mais sans elle. Ce dernier cas
  // est le plus traître : l'ingrédient a pu être désactivé (la route ne sert que
  // l'actif), ou la forme elle-même ; la liste revient alors vide ou amputée,
  // sans être `null`. Sans cette option, `formePrefereeId` n'aurait aucune
  // option correspondante, le `<select>` retomberait sur « Sans forme préférée »
  // — et soumettrait pourtant la forme, que la route de révision accepte.
  // Afficher autre chose que ce qui part est le défaut que ce lot ferme.
  const formesOptions: FormeIngredient[] = (() => {
    const chargees = formes ?? [];
    const courante = regle.formePreferee;
    if (!courante || chargees.some((forme) => forme.id === courante.id)) return chargees;
    return [courante, ...chargees];
  })();

  const soumettre = async () => {
    if (envoi || !justification.trim() || !sourceReferenceId
      || !claimId.trim() || !versionClaim.trim()) return;
    setEnvoi(true);
    setErreur('');
    try {
      const reponse = await fetch('/api/praticien/regles/revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regleId: regle.id,
          gradePreuveScientifique: grade,
          justification: justification.trim(),
          sourceReferenceId,
          claimId: claimId.trim(),
          versionClaim: versionClaim.trim(),
          // [[D-142]] — les conditions VOYAGENT avec la révision. Sans elles,
          // une réécriture complète retirait la condition de la règle en
          // silence : le praticien croyait corriger une justification, il
          // levait une garde clinique.
          ...(critereId ? { conditionCritereId: critereId } : {}),
          ...(cibleBio.trim()
            ? {
                conditionBiologie: {
                  type: 'biologie',
                  cible: cibleBio.trim(),
                  ...(echeanceBio.trim()
                    ? { echeance: new Date(echeanceBio).toISOString() }
                    : {}),
                },
              }
            : {}),
          ...(formePrefereeId ? { formePrefereeId } : {}),
          ...(doseBasse.trim() ? { doseCibleBasse: Number(doseBasse) } : {}),
          ...(doseHaute.trim() ? { doseCibleHaute: Number(doseHaute) } : {}),
        }),
      });
      const payload = (await reponse.json()) as RegleRevisionApiResponse;
      if (!reponse.ok || !payload.ok) {
        setErreur(payload.ok ? 'La révision n’a pas pu être créée.' : payload.error);
        return;
      }
      onSoumis();
    } catch {
      setErreur('La révision n’a pas pu être créée.');
    } finally {
      setEnvoi(false);
    }
  };

  const fige = desactive || envoi;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">
        Révision — une nouvelle version (v{regle.versionRegle + 1}) naîtra en brouillon ;
        la v{regle.versionRegle} reste servie jusqu&apos;à validation de la nouvelle.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          aria-label="Grade de preuve scientifique de la révision"
          value={grade}
          disabled={fige}
          onChange={(event) => setGrade(event.target.value as GradePreuveScientifique)}
          className={classeChamp()}
        >
          {GRADES_PREUVE_SCIENTIFIQUE.map((valeur) => (
            <option key={valeur} value={valeur}>{labelGradePreuve(valeur)}</option>
          ))}
        </select>
        <select
          aria-label="Source de la révision"
          value={sourceReferenceId}
          disabled={fige}
          onChange={(event) => setSourceReferenceId(event.target.value)}
          className={classeChamp()}
        >
          {vocabulaire.sources.map((source) => (
            <option key={source.id} value={source.id}>{source.citation}</option>
          ))}
        </select>
        <div className="flex flex-col gap-1">
          <select
            aria-label="Forme préférée de la révision"
            value={formePrefereeId}
            // Désactivé pendant le chargement seulement. Sur échec, le champ
            // redevient utilisable : sinon le praticien ne pourrait plus RETIRER
            // la forme préférée, un choix bloqué faute d'avoir pu lire la liste.
            disabled={fige || (formes === null && !formesEchec)}
            onChange={(event) => setFormePrefereeId(event.target.value)}
            className={classeChamp()}
          >
            <option value="">Sans forme préférée</option>
            {formesOptions.map((forme) => (
              <option key={forme.id} value={forme.id}>{forme.labelFr}</option>
            ))}
          </select>
          {formes === null && (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {formesEchec
                ? 'Les formes de cet ingrédient n’ont pas pu être lues ; la forme actuelle est conservée.'
                : 'Chargement des formes…'}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <input
            type="number"
            aria-label="Dose cible basse de la révision"
            value={doseBasse}
            disabled={fige}
            min={0}
            onChange={(event) => setDoseBasse(event.target.value)}
            placeholder="dose basse"
            className={`${classeChamp()} w-full`}
          />
          <input
            type="number"
            aria-label="Dose cible haute de la révision"
            value={doseHaute}
            disabled={fige}
            min={0}
            onChange={(event) => setDoseHaute(event.target.value)}
            placeholder="dose haute"
            className={`${classeChamp()} w-full`}
          />
        </div>
        <select
          aria-label="Critère conditionnel de la révision"
          value={critereId}
          disabled={fige}
          onChange={(event) => setCritereId(event.target.value)}
          className={classeChamp()}
        >
          <option value="">Sans critère conditionnel</option>
          {/* Le critère COURANT est toujours une option, même si le vocabulaire
              servi ne le contient plus (critère désactivé depuis) : sans quoi le
              select retomberait sur « sans critère » et la révision retirerait
              la condition sans que rien ne l'annonce. */}
          {(vocabulaire.criteres.some((c) => c.id === critereId) || !regle.conditionCritere
            ? vocabulaire.criteres
            : [{ id: regle.conditionCritere.id, code: regle.conditionCritere.code,
                 labelFr: regle.conditionCritere.labelFr, categorie: null },
               ...vocabulaire.criteres]
          ).map((critere) => (
            <option key={critere.id} value={critere.id}>{critere.labelFr}</option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Cible biologique conditionnelle de la révision"
          value={cibleBio}
          disabled={fige}
          onChange={(event) => setCibleBio(event.target.value)}
          placeholder="cible biologique attendue (optionnelle)"
          className={classeChamp()}
        />
        <input
          type="date"
          aria-label="Échéance de la cible biologique de la révision"
          value={echeanceBio}
          disabled={fige || !cibleBio.trim()}
          onChange={(event) => setEcheanceBio(event.target.value)}
          className={classeChamp()}
        />
        <input
          type="text"
          aria-label="Identifiant du claim fondateur de la révision"
          value={claimId}
          disabled={fige}
          onChange={(event) => setClaimId(event.target.value)}
          placeholder="claim fondateur (WN-CL-0000-000)"
          className={classeChamp()}
        />
        <input
          type="text"
          aria-label="Version du claim fondateur de la révision"
          value={versionClaim}
          disabled={fige}
          onChange={(event) => setVersionClaim(event.target.value)}
          placeholder="version du claim (v1.0)"
          className={classeChamp()}
        />
      </div>
      <textarea
        aria-label="Justification de la révision"
        value={justification}
        disabled={fige}
        maxLength={4000}
        rows={3}
        onChange={(event) => setJustification(event.target.value)}
        className={classeChamp()}
      />
      {erreur && (
        <p role="alert" className="rounded-lg border border-accent bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          {erreur}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={fige || !justification.trim() || !claimId.trim() || !versionClaim.trim()}
          onClick={() => void soumettre()}
        >
          Créer la révision (brouillon)
        </Button>
        <Button variant="outline" disabled={fige} onClick={onAnnule}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

// ─── Formulaire du vocabulaire gouverné ─────────────────────────────────────

function FormulaireVocabulaire({
  desactive,
  onAjoute,
}: {
  desactive: boolean;
  onAjoute: () => void;
}) {
  const [type, setType] = useState<'intention' | 'critere'>('intention');
  const [code, setCode] = useState('');
  const [labelFr, setLabelFr] = useState('');
  const [categorie, setCategorie] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const pret = code.trim() && labelFr.trim() && (type === 'critere' || categorie.trim());

  const soumettre = async () => {
    if (!pret || envoi) return;
    setEnvoi(true);
    setErreur('');
    setSucces('');
    try {
      const reponse = await fetch('/api/praticien/regles/vocabulaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          code: code.trim(),
          labelFr: labelFr.trim(),
          ...(categorie.trim() ? { categorie: categorie.trim() } : {}),
        }),
      });
      const payload = (await reponse.json()) as VocabulaireCreationApiResponse;
      if (!reponse.ok || !payload.ok) {
        setErreur(payload.ok ? 'L’entrée n’a pas pu être ajoutée.' : payload.error);
        return;
      }
      setSucces(
        type === 'intention'
          ? `Intention « ${payload.entree.labelFr} » ajoutée au vocabulaire.`
          : `Critère « ${payload.entree.labelFr} » ajouté au vocabulaire.`,
      );
      setCode('');
      setLabelFr('');
      setCategorie('');
      onAjoute();
    } catch {
      setErreur('L’entrée n’a pas pu être ajoutée.');
    } finally {
      setEnvoi(false);
    }
  };

  const fige = desactive || envoi;
  return (
    <details className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <summary className="cursor-pointer font-display text-lg font-semibold text-foreground">
        Vocabulaire gouverné (intentions et critères)
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Le vocabulaire est de la donnée, pas du code : ajouter une intention ou
          un critère ne demande aucun déploiement. Une condition de règle ne peut
          citer qu&apos;un critère de ce vocabulaire.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            aria-label="Type d’entrée de vocabulaire"
            value={type}
            disabled={fige}
            onChange={(event) => setType(event.target.value as 'intention' | 'critere')}
            className={classeChamp()}
          >
            <option value="intention">Intention clinique</option>
            <option value="critere">Critère clinique</option>
          </select>
          <input
            type="text"
            aria-label="Code de l’entrée"
            value={code}
            disabled={fige}
            onChange={(event) => setCode(event.target.value)}
            placeholder="code (snake_case)"
            className={classeChamp()}
          />
          <input
            type="text"
            aria-label="Libellé français de l’entrée"
            value={labelFr}
            disabled={fige}
            maxLength={200}
            onChange={(event) => setLabelFr(event.target.value)}
            placeholder="libellé français"
            className={classeChamp()}
          />
          <input
            type="text"
            aria-label="Catégorie de l’entrée"
            value={categorie}
            disabled={fige}
            maxLength={100}
            onChange={(event) => setCategorie(event.target.value)}
            placeholder={type === 'intention' ? 'catégorie (obligatoire)' : 'catégorie (optionnelle)'}
            className={classeChamp()}
          />
        </div>
        {erreur && (
          <p role="alert" className="rounded-lg border border-accent bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
            {erreur}
          </p>
        )}
        {succes && (
          <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {succes}
          </p>
        )}
        <Button className="self-start" disabled={fige || !pret} onClick={() => void soumettre()}>
          Ajouter au vocabulaire
        </Button>
      </div>
    </details>
  );
}

// ─── Encart « référence source » ([[D-131]]) ────────────────────────────────
//
// LE CHAMP QUE LE FORMULAIRE DE RÈGLE EXIGEAIT SANS QU'ON PUISSE LE REMPLIR. La
// source est obligatoire sur toute règle (`validerContenuRegle` : « une règle
// sans source ne peut pas exister »), la liste déroulante la propose — et rien
// ne pouvait l'alimenter. L'atelier ne pouvait donc pas créer sa première règle.
//
// SAISIE À LA MAIN, ET C'EST LA DOCTRINE : la décision n°11 du moteur
// d'intention interdit toute écriture en base active depuis une source externe,
// et l'audit des sources conclut à la curation manuelle praticien — l'ANSES ne
// publie aucun format machine.

function FormulaireSource({
  desactive,
  onAjoute,
}: {
  desactive: boolean;
  onAjoute: () => void;
}) {
  const [citation, setCitation] = useState('');
  const [lienUrl, setLienUrl] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const pret = citation.trim().length > 0;

  const soumettre = async () => {
    if (!pret || envoi) return;
    setEnvoi(true);
    setErreur('');
    setSucces('');
    try {
      const reponse = await fetch('/api/praticien/regles/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citation: citation.trim(),
          ...(lienUrl.trim() ? { lienUrl: lienUrl.trim() } : {}),
        }),
      });
      const payload = (await reponse.json()) as SourceCreationApiResponse;
      if (!reponse.ok || !payload.ok) {
        // LE MESSAGE DU SERVEUR EST LE MESSAGE : il nomme le refus (citation
        // vide, lien non ouvrable, source déjà présente). Le remplacer par un
        // texte d'écran perdrait la seule information utile.
        setErreur(payload.ok ? 'La source n’a pas pu être ajoutée.' : payload.error);
        return;
      }
      setSucces(`Source ajoutée : « ${payload.source.citation} ».`);
      setCitation('');
      setLienUrl('');
      onAjoute();
    } catch {
      setErreur('La source n’a pas pu être ajoutée.');
    } finally {
      setEnvoi(false);
    }
  };

  const fige = desactive || envoi;
  return (
    <details className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <summary className="cursor-pointer font-display text-lg font-semibold text-foreground">
        Références sources
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Toute règle cite une source, et la citation est saisie ici, à la main :
          aucun flux externe n&apos;écrit dans ce référentiel. Le lien est
          facultatif — s&apos;il est renseigné, il doit être ouvrable.
        </p>
        <label className="text-sm font-medium text-foreground">
          Citation
          <textarea
            aria-label="Citation de la source"
            value={citation}
            disabled={fige}
            rows={2}
            maxLength={1000}
            onChange={(event) => setCitation(event.target.value)}
            placeholder="auteur, titre, date — de quoi retrouver la source"
            className={`${classeChamp()} mt-1 w-full font-normal`}
          />
        </label>
        <label className="text-sm font-medium text-foreground">
          Lien (facultatif)
          <input
            type="url"
            aria-label="Lien de la source"
            value={lienUrl}
            disabled={fige}
            maxLength={2000}
            onChange={(event) => setLienUrl(event.target.value)}
            placeholder="https://…"
            className={`${classeChamp()} mt-1 w-full font-normal`}
          />
        </label>
        {erreur && (
          <p role="alert" className="rounded-lg border border-accent bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
            {erreur}
          </p>
        )}
        {succes && (
          <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {succes}
          </p>
        )}
        <Button className="self-start" disabled={fige || !pret} onClick={() => void soumettre()}>
          Ajouter la source
        </Button>
      </div>
    </details>
  );
}

// ─── Encart « sécurité et catégories fonctionnelles » ([[D-132]]) ───────────
//
// LES DEUX RÉFÉRENTIELS VONT ENSEMBLE parce qu'un seuil fonctionnel a besoin des
// deux : il se publie SUR une catégorie, et peut basculer une alerte. Les
// séparer à l'écran ferait chercher dans deux volets ce qu'un seul geste
// prépare.
//
// LA LISTE VAUT AUTANT QUE LE FORMULAIRE. Le code est unique en base : sans
// relecture, une ressaisie rendrait 409 devant un écran muet. Et pour les
// alertes, c'est plus que de l'ergonomie — le catalogue PUBLIÉ est exactement ce
// que `deciderIntentionAvantBiologie` exige avant de proposer quoi que ce soit
// (`D-056` arbitrage 2) ; le praticien doit pouvoir constater qu'il existe.

function EncartCatalogueC4({ desactive }: { desactive: boolean }) {
  const [categories, setCategories] = useState<CategorieCreee[]>([]);
  const [alertes, setAlertes] = useState<AlerteCreee[]>([]);
  const [codeCategorie, setCodeCategorie] = useState('');
  const [labelCategorie, setLabelCategorie] = useState('');
  const [codeAlerte, setCodeAlerte] = useState('');
  const [messageAlerte, setMessageAlerte] = useState('');
  const [niveauAlerte, setNiveauAlerte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const charger = useCallback(async () => {
    try {
      const [repCategories, repAlertes] = await Promise.all([
        fetch('/api/praticien/regles/categories'),
        fetch('/api/praticien/regles/alertes'),
      ]);
      const payloadCategories = (await repCategories.json()) as CategoriesListeApiResponse;
      const payloadAlertes = (await repAlertes.json()) as AlertesListeApiResponse;
      if (payloadCategories.ok) setCategories(payloadCategories.categories);
      if (payloadAlertes.ok) setAlertes(payloadAlertes.alertes);
    } catch {
      // Silencieux : la lecture n'est pas le geste, et un référentiel
      // momentanément illisible ne doit pas masquer les formulaires.
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const envoyer = async (url: string, corps: Record<string, string>, apres: () => void) => {
    if (envoi) return;
    setEnvoi(true);
    setErreur('');
    setSucces('');
    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const payload = (await reponse.json()) as { ok: boolean; error?: string };
      if (!reponse.ok || !payload.ok) {
        // Le message du serveur est le message : il nomme le refus.
        setErreur(payload.error ?? 'L’entrée n’a pas pu être ajoutée.');
        return;
      }
      apres();
      await charger();
    } catch {
      setErreur('L’entrée n’a pas pu être ajoutée.');
    } finally {
      setEnvoi(false);
    }
  };

  const fige = desactive || envoi;
  const categoriePrete = codeCategorie.trim() && labelCategorie.trim();
  const alertePrete = codeAlerte.trim() && messageAlerte.trim() && niveauAlerte.trim();

  return (
    <details className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <summary className="cursor-pointer font-display text-lg font-semibold text-foreground">
        Sécurité et catégories fonctionnelles
      </summary>
      <div className="mt-3 flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Tant que le catalogue d&apos;alertes n&apos;est pas publié, aucun
          complément n&apos;est proposable : « aucune alerte » ne serait pas un
          constat, seulement une absence d&apos;examen.
        </p>

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">
            Catégories fonctionnelles ({categories.length})
          </h4>
          {categories.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded-lg border border-border text-sm">
              {categories.map((categorie) => (
                <li key={categorie.id} className="px-3 py-1.5 text-foreground">
                  {categorie.labelFr}{' '}
                  <span className="text-xs text-muted-foreground">{categorie.code}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              aria-label="Code de la catégorie fonctionnelle"
              value={codeCategorie}
              disabled={fige}
              onChange={(event) => setCodeCategorie(event.target.value)}
              placeholder="code (snake_case)"
              className={classeChamp()}
            />
            <input
              type="text"
              aria-label="Libellé de la catégorie fonctionnelle"
              value={labelCategorie}
              disabled={fige}
              maxLength={200}
              onChange={(event) => setLabelCategorie(event.target.value)}
              placeholder="libellé français"
              className={classeChamp()}
            />
          </div>
          <Button
            variant="outline"
            className="self-start"
            disabled={fige || !categoriePrete}
            onClick={() => void envoyer(
              '/api/praticien/regles/categories',
              { code: codeCategorie.trim(), labelFr: labelCategorie.trim() },
              () => {
                setSucces(`Catégorie « ${labelCategorie.trim()} » ajoutée.`);
                setCodeCategorie('');
                setLabelCategorie('');
              },
            )}
          >
            Ajouter la catégorie
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">
            Alertes de sécurité ({alertes.length})
          </h4>
          {alertes.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded-lg border border-border text-sm">
              {alertes.map((alerte) => (
                <li key={alerte.id} className="px-3 py-1.5 text-foreground">
                  <span className="text-xs text-muted-foreground">{alerte.code}</span>{' '}
                  — {alerte.messageFr}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              aria-label="Code de l’alerte de sécurité"
              value={codeAlerte}
              disabled={fige}
              onChange={(event) => setCodeAlerte(event.target.value)}
              placeholder="code (snake_case)"
              className={classeChamp()}
            />
            {/* LE NIVEAU EST UN CHAMP LIBRE, et c'est délibéré : aucune échelle
                n'est définie dans le dépôt, et en proposer une ici — une liste
                déroulante « orange / rouge » — inventerait une gradation
                clinique que rien ne source. */}
            <input
              type="text"
              aria-label="Niveau de l’alerte"
              value={niveauAlerte}
              disabled={fige}
              maxLength={50}
              onChange={(event) => setNiveauAlerte(event.target.value)}
              placeholder="niveau"
              className={classeChamp()}
            />
          </div>
          <textarea
            aria-label="Message de l’alerte"
            value={messageAlerte}
            disabled={fige}
            rows={2}
            maxLength={1000}
            onChange={(event) => setMessageAlerte(event.target.value)}
            placeholder="message servi au praticien quand l’alerte refuse"
            className={`${classeChamp()} w-full`}
          />
          <Button
            variant="outline"
            className="self-start"
            disabled={fige || !alertePrete}
            onClick={() => void envoyer(
              '/api/praticien/regles/alertes',
              {
                code: codeAlerte.trim(),
                messageFr: messageAlerte.trim(),
                niveauAlerte: niveauAlerte.trim(),
              },
              () => {
                setSucces(`Alerte « ${codeAlerte.trim()} » ajoutée au catalogue.`);
                setCodeAlerte('');
                setMessageAlerte('');
                setNiveauAlerte('');
              },
            )}
          >
            Ajouter l’alerte
          </Button>
        </div>

        {erreur && (
          <p role="alert" className="rounded-lg border border-accent bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
            {erreur}
          </p>
        )}
        {succes && (
          <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {succes}
          </p>
        )}
      </div>
    </details>
  );
}

// ─── Panneau principal ──────────────────────────────────────────────────────

export function AtelierReglesPanel() {
  const [statut, setStatut] = useState<StatutRegle>('brouillon');
  const [offset, setOffset] = useState(0);
  const [regles, setRegles] = useState<RegleAtelier[]>([]);
  const [total, setTotal] = useState(0);
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);
  const [etat, setEtat] = useState<Etat>('chargement');
  const [erreur, setErreur] = useState('');
  const [vocabulaire, setVocabulaire] = useState<Vocabulaire | null>(null);

  /** Règle dont l'action est « armée » (1er clic) : le 2e clic confirme. */
  const [confirmation, setConfirmation] = useState<{ id: string; action: 'valider' | 'desactiver' } | null>(null);
  /** Raison saisie pour une désactivation armée (obligatoire avant confirmation). */
  const [raison, setRaison] = useState('');
  /** Règle dont la révision est ouverte. */
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [envoiId, setEnvoiId] = useState<string | null>(null);
  const [erreurAction, setErreurAction] = useState('');
  const [messageAction, setMessageAction] = useState('');

  const generationRef = useRef(0);
  const vueRef = useRef<{ statut: StatutRegle; offset: number }>({ statut: 'brouillon', offset: 0 });
  const envoiRef = useRef(false);
  const refsOnglets = useRef<Array<HTMLButtonElement | null>>([]);

  const annulerArmement = useCallback(() => {
    setConfirmation(null);
    setRaison('');
  }, []);

  const charger = useCallback(async (statutCourant: StatutRegle, offsetCourant: number) => {
    const generation = ++generationRef.current;
    setEtat('chargement');
    setConfirmation(null);
    setRaison('');
    setRevisionId(null);
    setErreurAction('');
    try {
      const reponse = await fetch(
        `/api/praticien/regles?statut=${encodeURIComponent(statutCourant)}&limit=${LIMITE_PAGE}&offset=${offsetCourant}`,
      );
      const payload = (await reponse.json()) as ReglesApiResponse;
      if (generation !== generationRef.current) return;
      if (!reponse.ok || !payload.ok) {
        setErreur(payload.ok ? 'La liste des règles n’a pas pu être lue.' : payload.error);
        setEtat('erreur');
        return;
      }
      if (payload.regles.length === 0 && payload.total > 0 && offsetCourant > 0) {
        setOffset(Math.max(0, offsetCourant - LIMITE_PAGE));
        return;
      }
      setRegles(payload.regles);
      setTotal(payload.total);
      setCompteurs(payload.compteurs);
      setEtat('chargee');
    } catch {
      if (generation !== generationRef.current) return;
      setErreur('La liste des règles n’a pas pu être lue.');
      setEtat('erreur');
    }
  }, []);

  const chargerVocabulaire = useCallback(async () => {
    try {
      const reponse = await fetch('/api/praticien/regles/vocabulaire');
      const payload = (await reponse.json()) as ReglesVocabulaireApiResponse;
      if (reponse.ok && payload.ok) setVocabulaire(payload);
    } catch {
      // Le panneau reste lisible sans vocabulaire (formulaires masqués).
    }
  }, []);

  useEffect(() => {
    vueRef.current = { statut, offset };
    void charger(statut, offset);
  }, [charger, statut, offset]);

  useEffect(() => {
    void chargerVocabulaire();
  }, [chargerVocabulaire]);

  const changerOnglet = (prochain: StatutRegle) => {
    if (prochain === statut) return;
    setMessageAction('');
    setStatut(prochain);
    setOffset(0);
  };

  // Navigation clavier du tablist (tabindex roving, motif AtelierCorpusPanel).
  const onClavierOnglets = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const suivant =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % ONGLETS.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + ONGLETS.length) % ONGLETS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ONGLETS.length - 1
              : null;
    if (suivant === null) return;
    event.preventDefault();
    changerOnglet(ONGLETS[suivant].statut);
    refsOnglets.current[suivant]?.focus();
  };

  const agir = useCallback(
    async (regle: RegleAtelier, action: 'valider' | 'desactiver', raisonSaisie?: string) => {
      if (envoiRef.current) return;
      envoiRef.current = true;
      setEnvoiId(regle.id);
      setErreurAction('');
      setMessageAction('');
      try {
        const reponse =
          action === 'valider'
            ? await fetch('/api/praticien/regles/validation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ regleId: regle.id, statutAttendu: regle.statut }),
              })
            : await fetch('/api/praticien/regles/desactivation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  regleId: regle.id,
                  statutAttendu: regle.statut,
                  raison: raisonSaisie ?? '',
                }),
              });
        const payload = (await reponse.json()) as
          | RegleValidationApiResponse
          | RegleDesactivationApiResponse;
        if (!reponse.ok || !payload.ok) {
          setErreurAction(payload.ok ? 'L’action n’a pas pu être enregistrée.' : payload.error);
          if (!payload.ok && payload.reason === 'etat_divergent') {
            void charger(vueRef.current.statut, vueRef.current.offset);
          }
          return;
        }
        if (action === 'valider' && 'versionsDesactivees' in payload) {
          setMessageAction(
            payload.versionsDesactivees > 0
              ? `Règle validée et signée — ${payload.versionsDesactivees} version antérieure désactivée.`
              : 'Règle validée et signée.',
          );
        } else {
          setMessageAction('Règle désactivée — la lignée reste auditable.');
        }
        void charger(vueRef.current.statut, vueRef.current.offset);
      } catch {
        setErreurAction('L’action n’a pas pu être enregistrée.');
      } finally {
        envoiRef.current = false;
        setEnvoiId(null);
        setConfirmation(null);
        setRaison('');
      }
    },
    [charger],
  );

  const enEnvoi = envoiId !== null;
  const idOngletActif = `onglet-regles-${statut}`;

  // Groupement par intention : la revue se fait intention par intention.
  const parIntention = new Map<string, { intention: RegleAtelier['intention']; regles: RegleAtelier[] }>();
  for (const regle of regles) {
    const groupe = parIntention.get(regle.intention.id) ?? { intention: regle.intention, regles: [] };
    groupe.regles.push(regle);
    parIntention.set(regle.intention.id, groupe);
  }

  return (
    <div className="flex flex-col gap-5">
      {compteurs && (
        <dl className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <dt className="text-xs font-medium text-muted-foreground">Brouillons</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-foreground">{compteurs.brouillons}</dd>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <dt className="text-xs font-medium text-muted-foreground">Validées</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-status-success">{compteurs.validees}</dd>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <dt className="text-xs font-medium text-muted-foreground">Désactivées</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-muted-foreground">{compteurs.desactivees}</dd>
          </div>
        </dl>
      )}

      <EncartPrevisualisation desactive={enEnvoi} />

      {vocabulaire && (
        <FormulaireCreation
          vocabulaire={vocabulaire}
          desactive={enEnvoi}
          onCree={() => {
            if (vueRef.current.statut === 'brouillon') {
              void charger('brouillon', vueRef.current.offset);
            } else {
              changerOnglet('brouillon');
            }
          }}
        />
      )}

      <FormulaireVocabulaire desactive={enEnvoi} onAjoute={() => void chargerVocabulaire()} />
      {/* La source suit le vocabulaire : même nature — de la donnée gouvernée à
          la main, jamais un déploiement — et c'est elle que le formulaire de
          règle exige ([[D-131]]). Le rechargement du vocabulaire est le même :
          la nouvelle source doit apparaître dans la liste déroulante sans
          recharger la page, sinon elle serait créée puis introuvable. */}
      <FormulaireSource desactive={enEnvoi} onAjoute={() => void chargerVocabulaire()} />
      {/* Sécurité et catégories ([[D-132]]) : les deux derniers référentiels
          gouvernés à la main que l'atelier sait écrire. Les seuils, eux,
          attendent — ils comparent des doses à des bornes, et la comparaison ne
          tient pas encore ses unités. */}
      <EncartCatalogueC4 desactive={enEnvoi} />

      <div role="tablist" aria-label="Statut des règles" className="flex gap-2">
        {ONGLETS.map((onglet, index) => {
          const actif = onglet.statut === statut;
          return (
            <button
              key={onglet.statut}
              ref={(element) => {
                refsOnglets.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`onglet-regles-${onglet.statut}`}
              aria-selected={actif}
              aria-controls="panneau-regles"
              tabIndex={actif ? 0 : -1}
              onClick={() => changerOnglet(onglet.statut)}
              onKeyDown={(event) => onClavierOnglets(event, index)}
              className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                actif
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {onglet.libelle}
            </button>
          );
        })}
      </div>

      <div id="panneau-regles" role="tabpanel" aria-labelledby={idOngletActif} className="flex flex-col gap-5">
        {erreurAction && (
          <p role="alert" className="rounded-lg border border-accent bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
            {erreurAction}
          </p>
        )}
        {messageAction && (
          <p role="status" aria-live="polite" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {messageAction}
          </p>
        )}

        {etat === 'chargement' && (
          <div role="status" className="rounded-xl border border-border bg-surface p-4 text-base text-muted-foreground shadow-card">
            Lecture des règles&hellip;
          </div>
        )}

        {etat === 'erreur' && (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-accent bg-status-warning/10 p-4 text-base text-status-warning">
            <span>{erreur}</span>
            <Button variant="outline" className="self-start" onClick={() => void charger(statut, offset)}>
              Réessayer
            </Button>
          </div>
        )}

        {etat === 'chargee' && regles.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-5 text-base text-muted-foreground shadow-card">
            {statut === 'brouillon'
              ? 'Aucun brouillon en attente. Une création ou une révision apparaîtra ici, à valider justification et source sous les yeux.'
              : 'Aucune règle dans cet état.'}
          </div>
        )}

        {etat === 'chargee' && regles.length > 0 && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              {regles.length === total
                ? `${total} règle${total > 1 ? 's' : ''}`
                : `${regles.length} règle${regles.length > 1 ? 's' : ''} affichée${regles.length > 1 ? 's' : ''} sur ${total}`}{' '}
              — groupées par intention, décision règle par règle.
            </p>

            {[...parIntention.values()].map(({ intention, regles: reglesIntention }) => (
              <section key={intention.id} aria-label={`Intention ${intention.labelFr}`} className="flex flex-col gap-3">
                <h3 className="font-display text-lg font-semibold text-foreground">
                  {intention.labelFr}{' '}
                  <span className="font-mono text-xs font-normal text-muted-foreground">({intention.code})</span>
                </h3>
                {reglesIntention.map((regle) => {
                  const armeeValider = confirmation?.id === regle.id && confirmation.action === 'valider';
                  const armeeDesactiver = confirmation?.id === regle.id && confirmation.action === 'desactiver';
                  return (
                    <article key={regle.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">v{regle.versionRegle}</span>
                        <Badge variant="info">{regle.typeRegle}</Badge>
                        <BadgeGrade grade={regle.gradePreuve} />
                        <Badge
                          variant={regle.statut === 'validee' ? 'success' : regle.statut === 'brouillon' ? 'warning' : 'neutral'}
                        >
                          {LIBELLE_STATUT[regle.statut]}
                        </Badge>
                      </div>

                      <p className="text-base font-medium text-foreground">
                        {regle.ingredient.nomFr}
                        {regle.formePreferee ? ` — ${regle.formePreferee.labelFr}` : ''}
                        {regle.doseCibleBasse !== null || regle.doseCibleHaute !== null ? (
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            cible {regle.doseCibleBasse ?? '—'}–{regle.doseCibleHaute ?? '—'}
                          </span>
                        ) : null}
                      </p>

                      <blockquote className="whitespace-pre-wrap border-l-2 border-border pl-3 text-sm text-muted-foreground">
                        {regle.justification}
                      </blockquote>

                      {/* LES CONDITIONS SE VOIENT ([[D-142]]). Aucun écran ne
                          les montrait : une règle conditionnée était
                          indiscernable d'une règle inconditionnelle, et c'est
                          ce qui a laissé passer des mois d'écriture au mauvais
                          endroit. Une garde clinique qui ne s'affiche pas ne se
                          vérifie pas. */}
                      {Boolean(regle.conditionCritere
                        || lireConditionBiologiqueAffichable(regle.conditionBiologie)
                        || regle.conditionSupplementaire) && (
                        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {regle.conditionCritere && (
                            <li>
                              Conditionnée au critère «&nbsp;{regle.conditionCritere.labelFr}&nbsp;» —
                              sans constat au dossier, cette règle ne produit rien.
                            </li>
                          )}
                          {(() => {
                            const bio = lireConditionBiologiqueAffichable(regle.conditionBiologie);
                            return bio ? (
                              <li>
                                Suspendue au bilan «&nbsp;{bio.cible}&nbsp;»
                                {bio.echeanceJour ? ` (échéance ${formatDate(bio.echeanceJour)})` : ''}.
                              </li>
                            ) : null;
                          })()}
                          {regle.conditionSupplementaire ? (
                            <li className="text-status-warning">
                              Cette règle porte encore une condition à l&apos;ancien format, que le
                              moteur ne lit plus. Rouvrez-la en révision pour la reposer.
                            </li>
                          ) : null}
                        </ul>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Source : {regle.source.citation}
                        {regle.source.lienUrl ? ` — ${regle.source.lienUrl}` : ''}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Créée le {formatDate(regle.creeLe)}</span>
                        {regle.validePar && regle.valideLe && (
                          <span>· validée par {regle.validePar} le {formatDate(regle.valideLe)}</span>
                        )}
                      </div>

                      {regle.lignee.length > 0 && (
                        <details className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                            Lignée — {regle.lignee.length} autre{regle.lignee.length > 1 ? 's' : ''} version
                            {regle.lignee.length > 1 ? 's' : ''}
                          </summary>
                          <ul className="mt-2 flex flex-col gap-2">
                            {regle.lignee.map((version) => (
                              <li key={version.id} className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
                                <span className="font-mono text-xs">v{version.versionRegle}</span>{' '}
                                · {LIBELLE_STATUT[version.statut]}
                                {version.validePar && version.valideLe
                                  ? ` · validée par ${version.validePar} le ${formatDate(version.valideLe)}`
                                  : ''}
                                <blockquote className="mt-1 whitespace-pre-wrap text-xs">
                                  {version.justification}
                                </blockquote>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {regle.statut === 'brouillon' && (
                        <div className="flex flex-wrap items-center gap-2">
                          {armeeValider ? (
                            <>
                              <span className="text-sm font-medium text-foreground">
                                Signer la validation de cette règle ? Les versions validées antérieures de la lignée seront désactivées.
                              </span>
                              <Button disabled={enEnvoi} onClick={() => void agir(regle, 'valider')}>
                                Confirmer la validation
                              </Button>
                              <Button variant="outline" disabled={enEnvoi} onClick={annulerArmement}>
                                Annuler
                              </Button>
                            </>
                          ) : armeeDesactiver ? (
                            <>
                              <span className="text-sm font-medium text-foreground">Raison de la désactivation</span>
                              <input
                                type="text"
                                aria-label={`Raison de la désactivation — v${regle.versionRegle} ${regle.ingredient.nomFr}`}
                                autoFocus
                                maxLength={2000}
                                value={raison}
                                disabled={enEnvoi}
                                onChange={(event) => setRaison(event.target.value)}
                                placeholder="Raison de la désactivation (obligatoire)"
                                className={classeChamp()}
                              />
                              <Button
                                variant="danger"
                                disabled={enEnvoi || raison.trim().length === 0}
                                onClick={() => void agir(regle, 'desactiver', raison)}
                              >
                                Confirmer la désactivation
                              </Button>
                              <Button variant="outline" disabled={enEnvoi} onClick={annulerArmement}>
                                Annuler
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                disabled={enEnvoi}
                                onClick={() => setConfirmation({ id: regle.id, action: 'valider' })}
                              >
                                Valider
                              </Button>
                              <Button
                                variant="danger"
                                disabled={enEnvoi}
                                onClick={() => {
                                  setConfirmation({ id: regle.id, action: 'desactiver' });
                                  setRaison('');
                                }}
                              >
                                Désactiver
                              </Button>
                            </>
                          )}
                        </div>
                      )}

                      {regle.statut === 'validee' && (
                        <div className="flex flex-col gap-3">
                          {revisionId === regle.id && vocabulaire ? (
                            <FormulaireRevision
                              regle={regle}
                              vocabulaire={vocabulaire}
                              desactive={enEnvoi}
                              onSoumis={() => {
                                setRevisionId(null);
                                setMessageAction(
                                  `Révision créée en brouillon (v${regle.versionRegle + 1}) — onglet Brouillons.`,
                                );
                                void charger(vueRef.current.statut, vueRef.current.offset);
                              }}
                              onAnnule={() => setRevisionId(null)}
                            />
                          ) : armeeDesactiver ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                Désactiver cette version validée ? Elle ne sera plus servie par la résolution.
                              </span>
                              <input
                                type="text"
                                aria-label={`Raison de la désactivation — v${regle.versionRegle} ${regle.ingredient.nomFr}`}
                                autoFocus
                                maxLength={2000}
                                value={raison}
                                disabled={enEnvoi}
                                onChange={(event) => setRaison(event.target.value)}
                                placeholder="Raison de la désactivation (obligatoire)"
                                className={classeChamp()}
                              />
                              <Button
                                variant="danger"
                                disabled={enEnvoi || raison.trim().length === 0}
                                onClick={() => void agir(regle, 'desactiver', raison)}
                              >
                                Confirmer la désactivation
                              </Button>
                              <Button variant="outline" disabled={enEnvoi} onClick={annulerArmement}>
                                Annuler
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                variant="outline"
                                disabled={enEnvoi || !vocabulaire}
                                onClick={() => setRevisionId(regle.id)}
                              >
                                Réviser
                              </Button>
                              <Button
                                variant="danger"
                                disabled={enEnvoi}
                                onClick={() => {
                                  setConfirmation({ id: regle.id, action: 'desactiver' });
                                  setRaison('');
                                }}
                              >
                                Désactiver
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {regle.statut === 'desactivee' && (
                        <p className="text-sm text-muted-foreground">
                          Version désactivée — la lignée continue par révision d&apos;une version active.
                        </p>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}

            {total > LIMITE_PAGE && (
              <nav aria-label="Pagination des règles" className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={offset === 0 || enEnvoi}
                  onClick={() => setOffset(Math.max(0, offset - LIMITE_PAGE))}
                >
                  Précédent
                </Button>
                <span className="text-sm text-muted-foreground">
                  Règles {offset + 1}–{offset + regles.length} sur {total}
                </span>
                <Button
                  variant="outline"
                  disabled={offset + LIMITE_PAGE >= total || enEnvoi}
                  onClick={() => setOffset(offset + LIMITE_PAGE)}
                >
                  Suivant
                </Button>
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
