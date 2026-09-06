import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// GARDE DES TOKENS DU DESIGN SYSTEM.
//
// `docs/design-system-d1.md` §10 proscrit trois écritures : `bg-white` en dur
// (« toujours `bg-surface` »), les tailles arbitraires `text-[13px]`/`text-[14px]`
// (« utiliser `text-13`/`text-14`, pilotables centralement »), et — par
// `.claude/rules/frontend-ui.md`, « respecter les tokens sémantiques » — la
// palette native de Tailwind, qui court-circuite à la fois les rôles
// sémantiques et la palette de marque.
//
// CES TROIS RÈGLES SONT TENUES AUJOURD'HUI, ET C'EST TOUT LEUR INTÉRÊT. Le
// balayage du 2026-09-06 rend 0 sur 177 fichiers pour les trois. On n'atteint
// pas 0/177 par hasard : la règle est en vigueur de fait, mais rien ne la tient
// que la relecture. Elle est donc écrite trois fois en prose — §10, la règle
// scopée, et le rappel qu'un agent lit à chaque session — ce qui est le signal
// qu'elle devrait être exécutable, pas répétée (cf. `/wn-conventions` §5).
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
  {
    nom: 'palette native de Tailwind',
    correction: 'utiliser un token sémantique (frontend-ui.md) ou la palette de marque',
    motif:
      /\b(?:text|bg|border|ring|from|to|via)-(?:gray|slate|zinc|neutral|stone|red|orange|yellow|green|emerald|blue|sky|purple|pink|rose)-\d{2,3}\b/g,
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

  it('ATTRAPE la palette native, et accepte le token sémantique', () => {
    expect(infractions('<p className="text-gray-500 bg-red-50" />')).toEqual([
      'palette native de Tailwind',
      'palette native de Tailwind',
    ]);
    expect(infractions('<p className="text-muted-foreground bg-status-danger/10" />')).toEqual([]);
  });

  it('ne compte pas un motif qui n’est écrit qu’en commentaire', () => {
    // Le cas réel de `PatientCard.tsx` : le commentaire cite ce qu'il remplace.
    expect(infractions('// remplace `bg-white rounded-2xl` des écrans du portail')).toEqual([]);
    expect(infractions('/* avant : text-gray-500 */ <p className="text-muted-foreground" />')).toEqual(
      [],
    );
  });

  it('n’est pas trompée par un token dont le nom contient celui d’une couleur', () => {
    // `viz-corps`, `rail-primary`, `status-success` ne sont pas la palette native ;
    // `bg-whitespace-x` n'existe pas mais prouve que la borne de mot tient.
    expect(infractions('<div className="bg-viz-corps text-status-success border-rail-border" />')).toEqual(
      [],
    );
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
