// Contrat d'unicité de niveau CLIENT : `23505` → `P2002` ([[D-134]]).
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE CE CONTRAT PROUVE, ET QU'AUCUN AUTRE NE PROUVAIT
// ─────────────────────────────────────────────────────────────────────────────
// Trois routes traduisent `P2002` en 409 lisible : `selection_stale`
// ([[D-127]] §3bis), `code_deja_pris` des catégories et des alertes
// ([[D-132]]). Leurs bancs unitaires FABRIQUENT l'erreur `P2002` pour vérifier
// la traduction — aucun ne prouvait que la base la produise, ni que le client
// la rende sous ce code.
//
// LE CAS QUI COMPTE EST LE PREMIER : `c1_selection_priorite_racine_unique` est
// un index PARTIEL (`WHERE supersedes_selection_id IS NULL`) qui vit dans la
// MIGRATION SEULE — Prisma ne le déclare pas, ne le connaît pas, et n'a aucune
// raison a priori de le rattacher à un modèle. C'est pourtant lui qui arbitre la
// course de deux premières sélections. Si un adaptateur cessait de classer
// `23505` en violation d'unicité, `selection_stale` tomberait en 500 sans qu'un
// seul banc unitaire bouge : ils simulent tous l'erreur qu'ils attendent.
//
// LE SECOND CAS EST LE TÉMOIN : `@@unique([supersedesSelectionId])` est DÉCLARÉ
// au schéma. Sans lui, un `P2002` sur la racine ne dirait pas si la traduction
// vaut aussi pour l'inconnu — c'est la comparaison qui fait la preuve.
//
// SANS NAVIGATEUR, ET C'EST ASSUMÉ : ce contrat n'a pas d'écran. Il vit dans la
// suite E2E parce que c'est la seule lane du dépôt qui dispose d'une VRAIE base
// en T2, en T3 et en CI. `prisma/checks/*.sql` prouve ce que la base refuse — le
// contrat de `D-127` le fait déjà ; ce qui restait à prouver est la traduction,
// qui appartient au client. Ouvrir une lane dédiée aurait demandé de recopier
// une étape dans `ci.yml` ET dans `wn-test-worktree.sh`, la divergence
// silencieuse que ces deux fichiers refusent.
//
// Patient fictif Sophie Nicola (PAT_SEED_01), et rien d'autre : la sonde n'écrit
// que dans `decision_priority_selections`, sous un `decisionCardId` qui lui est
// propre, et supprime ses lignes dans son propre `finally`.
import { test, expect } from '@playwright/test';
import { sonderUniciteSelectionPriorite } from './helpers/db';

const PATIENT_ID = 'PAT_SEED_01';
/** Distinct du préfixe `runtime-decision-` que le rayon biologie ramasse. */
const CARTE = 'contrat-p2002-unicite';

test('une violation d’unicité remonte en P2002, index partiel compris', async () => {
  const { racine, successeur } = await sonderUniciteSelectionPriorite(PATIENT_ID, CARTE);

  // ── L'INDEX PARTIEL, INCONNU DE PRISMA ────────────────────────────────────
  expect(
    racine.code,
    'une seconde racine n’a pas rendu P2002 : `selection_stale` tomberait en 500',
  ).toBe('P2002');
  // La chaîne complète est visible, et c'est elle qu'on épingle : PostgreSQL
  // rend `23505`, l'adaptateur le classe, Prisma le rend en `P2002`.
  expect(racine.originalCode).toBe('23505');
  // La contrainte NOMMÉE : sans elle, un P2002 rendu par une AUTRE unicité
  // passerait pour la preuve de celle-ci.
  expect(racine.contrainte).toContain('decision_card_id');

  // ── LE TÉMOIN DÉCLARÉ AU SCHÉMA ───────────────────────────────────────────
  expect(successeur.code).toBe('P2002');
  expect(successeur.originalCode).toBe('23505');
  expect(successeur.contrainte).toContain('supersedes_selection_id');
});
