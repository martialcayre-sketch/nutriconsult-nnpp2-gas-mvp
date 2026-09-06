import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// GARDE DES TOKENS DU DESIGN SYSTEM.
//
// `docs/design-system-d1.md` §10 proscrit deux écritures gardées ici :
// `bg-white` en dur (« toujours `bg-surface` ») et les tailles arbitraires
// `text-[13px]`/`text-[14px]` (« utiliser `text-13`/`text-14`, pilotables
// centralement »).
//
// LA PALETTE NATIVE DE TAILWIND N'EST PAS GARDÉE ICI : ELLE L'EST DÉJÀ. La
// garde E18 (`src/lib/tokens-couleur.guard.test.ts`) balaie tout `web/src`,
// dix-neuf échelles contre seize utilitaires, `.css` compris — strictement plus
// large que ce que ce fichier pourrait couvrir. Une première version de cette
// garde la rejouait ; le doublon a été attrapé par E18 elle-même, qui a rougi
// sur les sources fabriquées de la copie — une échelle brute ÉCRITE dans
// `web/src` en est une, fût-ce entre guillemets dans un cas de test, et E18 ne
// distingue pas la prose du code. Deux gardes qui se recouvrent rendent un
// verdict arbitraire : E18 garde le périmètre, celle-ci s'en tient à ce qu'E18
// ne couvre pas. Ne pas y réintroduire d'échelle brute, même en exemple.
//
// CES DEUX RÈGLES SONT TENUES AUJOURD'HUI, ET C'EST TOUT LEUR INTÉRÊT. Le
// balayage du 2026-09-06 rend 0 sur 177 fichiers pour les deux. On n'atteint
// pas 0/177 par hasard : la règle est en vigueur de fait, mais rien ne la tient
// que la relecture. Elle est écrite deux fois en prose — §10 et le rappel qu'un
// agent lit à chaque session — ce qui est le signal qu'elle devrait être
// exécutable, pas répétée (cf. `/wn-conventions` §5).
//
// LA GARDE NAÎT VERTE, DÉLIBÉRÉMENT. Ce n'est pas une garde décorative pour
// autant : chaque règle est PROUVÉE ROUGE sur des sources fabriquées avant
// d'être appliquée à l'arbre réel, exactement comme
// `PanneauSuperpose.guard.test.ts`. Une garde qu'on n'a jamais vue rougir ne
// prouve rien — ni sur ce qu'elle attrape, ni sur ce qu'elle laisse passer.
//
// CE QUI N'EST DÉLIBÉRÉMENT PAS GARDÉ ICI :
//   - les couleurs hexadécimales littérales. Les treize occurrences de l'arbre
//     sont légitimes : le logo Google de `login/page.tsx` (couleurs de marque
//     d'un tiers), `global-error.tsx` (qui remplace le layout racine, donc
//     s'affiche sans les variables CSS) et des attributs SVG de data-viz. Une
//     règle qui exige trois exceptions sur ses seuls usages réels ne paie pas.
//   - `shadow-sm`, dont les deux occurrences sont un commentaire et le point de
//     curseur de `ScoreZones` — le micro-élément que le §10 autorise nommément.
//
// QUESTION OUVERTE, VOLONTAIREMENT NON GARDÉE — L'ÉCHELLE EST-ELLE FERMÉE ?
// Le §10 énumère sept paliers sans dire si la liste est close. Comme
// `fontSize` vit sous `theme.extend`, les paliers natifs de Tailwind
// survivent et restent disponibles. L'arbre s'en sert massivement :
//   · 117 usages de `text-lg`/`xl`/`2xl`/`3xl` (paliers natifs, hors tableau) ;
//   · 19 tailles arbitraires `text-[…]` hors des deux que le §10 proscrit,
//     dont `text-[15.5px]`, `text-[10.5px]` et `text-[1.875rem]`.
// Les secondes contredisent le principe énoncé (« pilotables centralement »)
// même si le §10 ne les nomme pas. Mais les corriger DÉPLACE DES PIXELS sur
// douze fichiers, et les baselines visuelles ne comparent rien hors Linux :
// c'est une décision de design system, pas un ajustement de garde. Tant
// qu'elle n'est pas prise, ce fichier ne garde que ce qui a été tranché.

const RACINE_WEB = path.resolve(__dirname, '../../..');

/** Les arbres où les tokens font loi. */
const SURFACES = ['src/components', 'src/app'];

/**
 * Un fichier qui NOMME un motif proscrit ne l'EMPLOIE pas.
 *
 * Ce n'est pas une précaution théorique : au 2026-09-06, le seul `bg-white` de
 * l'arbre vit dans un commentaire de `PatientCard.tsx` qui documente les
 * déclarations locales que le composant a REMPLACÉES. Une garde qui déciderait
 * sur la présence du motif classerait en faute le fichier qui a corrigé la
 * faute.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

const REGLES = [
  {
    nom: 'bg-white en dur',
    correction: 'utiliser `bg-surface` (design-system-d1.md §10)',
    motif: /\bbg-white\b/g,
  },
  {
    nom: 'taille typographique arbitraire',
    correction: 'utiliser `text-13` / `text-14` (design-system-d1.md §10)',
    // BORNÉE AUX DEUX PALIERS QUE LE §10 PROSCRIT NOMMÉMENT. La forme large
    // (`text-[<taille>]`) rend 19 occurrences sur l'arbre — `text-[10px]`,
    // `text-[15.5px]`, `text-[26px]` — qu'aucune décision de design system ne
    // couvre : les élargir ici imposerait un changement de pixels sur douze
    // fichiers sous couvert de garde. Voir la question ouverte en tête de
    // fichier ; élargir ce motif le jour où l'échelle est déclarée fermée.
    motif: /\btext-\[1[34]px\]/g,
  },
] as const;

function infractions(source: string): string[] {
  const propre = sansCommentaires(source);
  return REGLES.flatMap((regle) => (propre.match(regle.motif) ?? []).map(() => regle.nom));
}

function fichiersTsx(racineRelative: string): string[] {
  const racine = path.join(RACINE_WEB, racineRelative);
  let entrees: string[];
  try {
    entrees = readdirSync(racine);
  } catch {
    return [];
  }
  return entrees.flatMap((entree) => {
    const complet = path.join(racine, entree);
    if (statSync(complet).isDirectory()) return fichiersTsx(path.join(racineRelative, entree));
    if (!entree.endsWith('.tsx') || entree.endsWith('.test.tsx')) return [];
    return [path.join(racineRelative, entree)];
  });
}

describe('Design system — les tokens ne se contournent pas', () => {
  // ── Chaque règle, vue rouge puis verte sur des sources fabriquées ──────────

  it('ATTRAPE `bg-white`, et accepte `bg-surface`', () => {
    expect(infractions('<div className="bg-white rounded-lg" />')).toEqual(['bg-white en dur']);
    expect(infractions('<div className="bg-surface rounded-lg" />')).toEqual([]);
  });

  it('ATTRAPE une taille arbitraire, et accepte le palier nommé', () => {
    expect(infractions('<p className="text-[13px]" />')).toEqual([
      'taille typographique arbitraire',
    ]);
    expect(infractions('<p className="text-13" />')).toEqual([]);
  });

  it('ne compte pas un motif qui n’est écrit qu’en commentaire', () => {
    // Le cas réel de `PatientCard.tsx` : le commentaire cite ce qu'il remplace.
    expect(infractions('// remplace `bg-white rounded-2xl` des écrans du portail')).toEqual([]);
    expect(infractions('/* avant : bg-white */ <p className="bg-surface" />')).toEqual([]);
  });

  // ── Application à l'arbre réel ────────────────────────────────────────────

  it('aucun composant ni aucune page ne contourne les tokens', () => {
    const fichiers = SURFACES.flatMap(fichiersTsx);

    // ANTI-VACUITÉ : un répertoire renommé viderait le balayage et rendrait ce
    // cas vert sans plus rien garder. On exige d'avoir réellement lu l'arbre.
    expect(fichiers.length).toBeGreaterThan(150);

    const fautifs = fichiers
      .map((fichier) => ({
        fichier,
        trouvees: infractions(readFileSync(path.join(RACINE_WEB, fichier), 'utf8')),
      }))
      .filter(({ trouvees }) => trouvees.length > 0)
      .map(({ fichier, trouvees }) => `${fichier} — ${[...new Set(trouvees)].join(', ')}`);

    expect(
      fautifs,
      `Tokens contournés :\n  ${fautifs.join('\n  ')}\n` +
        REGLES.map((r) => `  · ${r.nom} → ${r.correction}`).join('\n'),
    ).toEqual([]);
  });
});
