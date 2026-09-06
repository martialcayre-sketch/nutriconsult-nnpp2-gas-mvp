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
// CE QUE LA GARDE NE DIT PAS : LES PALIERS NATIFS SONT LÉGITIMES.
// `text-lg`/`xl`/`2xl`/`3xl` (18/20/24/30px) ne sont pas gardés, et c'est
// délibéré — décision du 2026-09-06. `fontSize` vit sous `theme.extend`, donc
// ils survivent, et la configuration les pilote centralement : ils satisfont le
// principe du §10. Le tableau du §10 est l'échelle de l'UI DENSE (10 → 16px)
// plus la métrique ; entre 16 et 32px il n'y avait aucun palier, et 117 usages
// natifs remplissaient ce trou sans que rien ne le dise. C'est désormais écrit.

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
    correction: 'utiliser un palier nommé ou natif (design-system-d1.md §10)',
    // ÉLARGIE LE 2026-09-06 À TOUTE VALEUR ARBITRAIRE, la question de l'échelle
    // ayant été tranchée : arbitraires proscrites, paliers natifs de Tailwind
    // admis. Le motif borné aux deux paliers que le §10 nommait laissait passer
    // dix-sept autres magic numbers, dont `text-[15.5px]` et un `text-[1.875rem]`
    // qui valait déjà exactement `text-3xl`. Les dix-neuf sont migrés.
    motif: /\btext-\[[^\]]+\]/g,
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

  it('ATTRAPE les arbitraires que le §10 ne nommait pas — c’est l’élargissement', () => {
    // Les trois formes réellement trouvées dans l'arbre le 2026-09-06, que le
    // motif borné à `text-[13px]`/`[14px]` laissait toutes passer.
    for (const forme of ['text-[26px]', 'text-[15.5px]', 'text-[1.875rem]']) {
      expect(infractions(`<p className="${forme}" />`), forme).toEqual([
        'taille typographique arbitraire',
      ]);
    }
  });

  it('ACCEPTE les paliers natifs de Tailwind — ils sont pilotables centralement', () => {
    expect(infractions('<h1 className="text-3xl" /><h2 className="text-2xl" />')).toEqual([]);
    expect(infractions('<p className="text-lg" /><span className="text-3xs" />')).toEqual([]);
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
