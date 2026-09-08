// Contrôle d'une classe de défaut que rien d'autre ne voit : deux branches
// parallèles qui posent chacune une décision en tête de `docs/DECISIONS.md`
// prennent le MÊME numéro.
//
// Ce fichier reste délibérément à créneau unique. Contrairement au journal de
// session (`merge=union`, `.gitattributes`) et au handoff (un fragment par lot,
// `docs/claude/handoffs/`), on ne l'éclate pas : une décision se lit dans la
// suite des autres, s'amende, se contredit, et huit renvois croisés pointent
// déjà vers des `D-NNN` précis. Le remède n'est donc pas de supprimer le
// conflit — il est de rendre la collision IMPOSSIBLE À MANQUER. Un conflit de
// merge sur ce fichier est bruyant et se résout ; un doublon de numéro est
// silencieux et se propage : le 2026-08-03 puis le 2026-08-04, `D-013` puis
// `D-014` ont été pris deux fois, et chaque réparation a coûté huit renvois à
// renuméroter.
//
// Trois refus, et rien d'autre :
//   - **doublon** — le même `D-NNN` porté par deux titres ;
//   - **trou** — un numéro manquant dans la suite ; la numérotation est une
//     suite, pas une étiquette : un trou signifie qu'une décision a été perdue,
//     ou qu'un renvoi pointe vers le vide ;
//   - **désordre** — dans la section active, les décisions se lisent de la plus
//     récente à la plus ancienne. Une entrée insérée au mauvais endroit après
//     une résolution de conflit se voit ici et nulle part ailleurs.
//
// ── QUAND prendre le numéro ─────────────────────────────────────────────────
//
// **Un numéro ne se réserve qu'au MERGE.** Le choisir à l'ouverture de la
// branche, c'est parier que personne ne mergera pendant le CI — et le pari se
// perd dès que l'intervalle entre deux merges descend sous la durée d'un CI.
// Le 2026-09-08 il a été perdu CINQ fois en une journée (`D-142→144`,
// `D-145→147`, `D-152→153`), six décisions ayant atterri sur `main` en
// quelques heures.
//
// Ce n'est pas un défaut de ce garde : c'est le prix, assumé plus haut, de
// rendre la collision bruyante. Cinq conflits qui se résolvent valent mieux
// qu'un doublon qui se propage. Ce qu'on réduit, c'est leur FRÉQUENCE, jamais
// leur prix — une renumérotation coûte toujours un CI rejoué, et un T3 local
// de plus sur une PR migration.
//
// En pratique :
//   - relire `origin/main` fraîchement récupéré JUSTE AVANT le merge, CI déjà
//     vert, plutôt que de faire confiance au numéro choisi à l'ouverture ;
//   - ne pas rebaser pour renuméroter — fusionner `main` dans la branche,
//     résoudre le conflit ici, puis reprendre registre, fragment et code ;
//   - à plusieurs sessions, ce qui coordonne n'est pas le worktree (elles y
//     sont déjà, et la contention est un COMPTEUR, pas un répertoire) mais
//     d'annoncer le numéro qu'on prend au moment où on le prend.
//
// ── Le numéro écrit dans le SUJET de commit ─────────────────────────────────
//
// Une renumérotation tardive laisse une trace ailleurs, que ce garde ne voit
// pas : le sujet du commit de squash. Le réglage du dépôt est
// `squash_merge_commit_title = COMMIT_OR_PR_TITLE` — GitHub prend le titre du
// COMMIT quand la branche ne porte qu'un seul commit *réel* (les commits de
// fusion ne comptent pas). **Éditer le titre de la PR ne suffit donc pas**, et
// trois PR en portent la trace sur `main` : #943, #949 (dont le sujet cite un
// `D-145` qui EXISTE et désigne autre chose) et #950.
//
// Le levier, qui ne demande aucun `force`-push contrairement à un `--amend` :
//   gh pr merge <N> --squash --delete-branch --subject "<sujet exact>"
//
// ── Le jour où une décision est RETIRÉE ─────────────────────────────────────
//
// Le refus du trou a une conséquence qu'il faut avoir écrite quelque part,
// faute de quoi le CI bloquera un jour sur `main` sans que personne sache quoi
// faire : **un numéro ne se libère jamais.** Supprimer le titre `### D-NNN`
// d'une décision abandonnée, annulée ou remplacée creuse un trou dans la suite,
// et le garde le refuse — à raison : huit renvois du dépôt pointent vers des
// `D-NNN` précis, et l'un d'eux désignerait alors le vide.
//
// Trois gestes, et rien d'autre :
//   - **la décision est dépassée** → la déplacer sous la section « archivées »,
//     titre et numéro inchangés. La suite reste pleine, la section active
//     s'allège, et les renvois continuent de tomber juste.
//   - **la décision est annulée ou remplacée** → la garder en place et le dire
//     dans son corps (« annulée le …, remplacée par D-0xx »). Ce garde ne lit
//     pas le contenu : le statut est affaire humaine, la numérotation non.
//   - **le titre a été écrit par erreur, avant tout merge sur `main`** → alors
//     seulement, le retirer *et* renuméroter ce qui suit, puis reprendre les
//     renvois. C'est le seul cas où la suite se referme, et il ne concerne
//     qu'une branche qui n'a jamais été publiée.
//
// Ce que ce contrôle NE fait pas, délibérément : lire le contenu d'une
// décision. Ni la date, ni le statut, ni les champs. Un garde qui juge le fond
// d'un arbitrage clinique serait faux dans les deux sens ; celui-ci ne tient
// que la mécanique de la numérotation, qui est exacte.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FICHIER = "docs/DECISIONS.md";

const TITRE_SECTION = /^##\s+(.+?)\s*$/;
const TITRE_DECISION = /^###\s+D-(\d+)\b\s*(?:—\s*(.*))?$/;

const SECTION_ACTIVE = "actives";
const SECTION_ARCHIVE = "archivées";

/**
 * Les décisions du fichier, dans l'ordre du texte.
 * @param {string} texte
 * @returns {Array<{numero: number, brut: string, ligne: number, section: string, titre: string}>}
 */
export function extraireDecisions(texte) {
  const decisions = [];
  let section = "";
  texte.split(/\r?\n/).forEach((ligne, index) => {
    const s = TITRE_SECTION.exec(ligne);
    if (s) {
      const nom = s[1].toLowerCase();
      if (nom.includes(SECTION_ACTIVE)) section = SECTION_ACTIVE;
      else if (nom.includes(SECTION_ARCHIVE)) section = SECTION_ARCHIVE;
      else section = nom;
      return;
    }
    const d = TITRE_DECISION.exec(ligne);
    if (!d) return;
    decisions.push({
      numero: Number.parseInt(d[1], 10),
      brut: `D-${d[1]}`,
      ligne: index + 1,
      section,
      titre: (d[2] || "").trim(),
    });
  });
  return decisions;
}

/**
 * @param {ReturnType<typeof extraireDecisions>} decisions
 * @returns {{violations: Array<{genre: string, ligne: number, message: string}>, comptees: number, max: number}}
 */
export function auditerDecisions(decisions) {
  const violations = [];

  // 1. Doublons. Le défaut d'origine, et le seul qui se propage en silence :
  //    deux décisions distinctes rendues indiscernables par leurs renvois.
  const parNumero = new Map();
  for (const d of decisions) {
    if (!parNumero.has(d.numero)) parNumero.set(d.numero, []);
    parNumero.get(d.numero).push(d);
  }
  for (const [numero, liste] of [...parNumero.entries()].sort((a, b) => a[0] - b[0])) {
    if (liste.length < 2) continue;
    const lignes = liste.map((d) => d.ligne).join(", ");
    violations.push({
      genre: "doublon",
      ligne: liste[1].ligne,
      message:
        `D-${String(numero).padStart(3, "0")} est porté par ${liste.length} décisions ` +
        `(lignes ${lignes}) — renuméroter la plus récente et reprendre ses renvois.`,
    });
  }

  // 2. Trous. La suite doit être pleine de 1 au maximum : un numéro absent est
  //    soit une décision perdue, soit un renvoi qui pointe vers le vide.
  const numeros = [...parNumero.keys()].sort((a, b) => a - b);
  const max = numeros.length > 0 ? numeros[numeros.length - 1] : 0;
  const manquants = [];
  for (let n = 1; n <= max; n += 1) if (!parNumero.has(n)) manquants.push(n);
  if (manquants.length > 0) {
    violations.push({
      genre: "trou",
      ligne: 0,
      message:
        `la suite est trouée : ${manquants.map((n) => `D-${String(n).padStart(3, "0")}`).join(", ")} ` +
        `manque${manquants.length > 1 ? "nt" : ""} entre D-001 et D-${String(max).padStart(3, "0")}. ` +
        `Un numéro ne se libère jamais : une décision dépassée se DÉPLACE sous « archivées » ` +
        `(numéro inchangé), une décision annulée ou remplacée se garde en place en le disant ` +
        `dans son corps. Ne renuméroter que sur une branche jamais publiée.`,
    });
  }

  // 3. Ordre de la section active — décroissant, la plus récente en tête.
  //    C'est ce qui casse après une résolution de conflit à la main.
  const actives = decisions.filter((d) => d.section === SECTION_ACTIVE);
  for (let i = 1; i < actives.length; i += 1) {
    const precedente = actives[i - 1];
    const courante = actives[i];
    // `<=` et non `<` : deux numéros égaux sont déjà nommés comme doublon.
    // Les compter une seconde fois en désordre rendrait deux constats pour un
    // seul défaut, et le second désignerait un remède faux (« déplacer »).
    if (courante.numero <= precedente.numero) continue;
    violations.push({
      genre: "désordre",
      ligne: courante.ligne,
      message:
        `${courante.brut} suit ${precedente.brut} dans la section active, qui se lit du plus ` +
        `récent au plus ancien — la plus récente s'ajoute EN TÊTE.`,
    });
  }

  return { violations, comptees: decisions.length, max };
}

export function lireFichier(racine) {
  const chemin = path.join(racine, FICHIER);
  if (!fs.existsSync(chemin)) return null;
  return fs.readFileSync(chemin, "utf8");
}

// Exécuté directement : le contrôle bloquant du CI. Comme ses voisins de
// `scripts/lib/`, il refuse d'être vert sur un fichier absent ou sans aucune
// décision — un scan qui ne trouve rien rendrait « aucune violation »,
// c'est-à-dire la même sortie qu'un registre sain.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = process.cwd();
  const texte = lireFichier(racine);
  if (texte === null) {
    console.error(`✗ ${FICHIER} introuvable depuis ${racine} — contrôle sans objet, refus d'être vert.`);
    process.exit(2);
  }
  const decisions = extraireDecisions(texte);
  if (decisions.length === 0) {
    console.error(`✗ Aucune décision lue dans ${FICHIER} — contrôle sans objet, refus d'être vert.`);
    process.exit(2);
  }

  const { violations, comptees, max } = auditerDecisions(decisions);
  for (const v of violations) {
    const ou = v.ligne > 0 ? `${FICHIER}:${v.ligne}` : FICHIER;
    console.error(`✗ ${ou} — ${v.message}`);
  }
  if (violations.length > 0) {
    console.error(
      `\n→ La numérotation de ${FICHIER} est une suite : un numéro, une décision, ` +
        `et la plus récente en tête de la section active.`,
    );
    process.exit(1);
  }
  console.log(`OK : ${comptees} décisions, D-001 à D-${String(max).padStart(3, "0")}, sans doublon ni trou, section active en ordre.`);
}
