'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  LABEL_DUREE_REVEILS,
  LABEL_FACTEURS,
  LABEL_LATENCE,
  LABEL_RIEN_DE_PARTICULIER,
} from '@/lib/agenda-sommeil/libelles';
import { dureeMinutes, estWeekend } from '@/lib/agenda-sommeil/nuit';
import { CLES_FACTEURS, type CleFacteur, type NuitRow } from '@/lib/agenda-sommeil/types';

// Chronogramme praticien — recharts, AVEC chiffres (contrairement à la frise
// patient). Barres flottantes extinction→lever sur un axe horaire réel
// 20 h → 12 h. Une nuit manquante ne trace pas de barre (trou visible, jamais 0).
//
// CE QUE LA BARRE MONTRE, ET CE QU'ELLE NE PEUT PAS MONTRER. Deux portions sont
// positionnellement VRAIES et sont donc dessinées en clair : la latence, au
// sommet de la barre, et l'éveil du matin au lit, à son pied — le patient a
// donné l'heure de son réveil final. L'éveil NOCTURNE, lui, n'est recueilli
// qu'en durée cumulée : l'agenda ne demande pas à quelle heure le patient s'est
// réveillé la nuit, et pour cause, ce serait l'inviter à regarder l'horloge. On
// ne trace donc aucun segment à une position inventée ; le WASO est lu dans
// l'infobulle et dans les agrégats. Un graphe qui placerait ces segments « pour
// l'illustration » ferait passer une estimation pour une observation.
//
// Trois lectures superposées : la teinte donne la semaine (S1 → S3, pour voir
// une dérive), le liseré marque les nuits de week-end (c'est là que les horaires
// dérivent), et deux lignes de référence portent les médianes d'extinction et de
// lever.

const COULEUR_SEMAINE = ['#a5b4fc', '#818cf8', '#4f46e5'] as const;

// Heures écoulées depuis 20 h (fenêtre visuelle 20 h → 12 h, 16 h), borné.
function heuresDepuis20(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const depuis = (((h * 60 + m - 1200) % 1440) + 1440) % 1440;
  return Math.min(16, depuis / 60);
}

const CENTRE_LATENCE_H: Record<string, number> = {
  lt15: 8 / 60,
  e15_30: 22 / 60,
  e30_60: 45 / 60,
  gt60: 75 / 60,
};

type Point = {
  label: string;
  plage: [number, number] | null;
  latenceH: number;
  // Éveil au lit après le réveil final, en heures. `0` quand le patient s'est
  // levé dès son réveil ; `null` pour les nuits d'avant la question (v1), où
  // l'ignorer est plus honnête que de dessiner un zéro.
  eveilMatinH: number | null;
  semaine: number; // 0..2
  weekend: boolean;
  nuit: NuitRow['reponses'] | null;
};

function tickHeure(t: number): string {
  const heure = (20 + Math.round(t)) % 24;
  return `${heure}h`;
}

function mediane(xs: number[]): number {
  const tri = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(tri.length / 2);
  return tri.length % 2 === 0 ? (tri[mid - 1] + tri[mid]) / 2 : tri[mid];
}

// Découpe d'une barre en trois portions, du haut vers le bas :
// endormissement → sommeil estimé → éveil au lit le matin. Exportée pour être
// testable : c'est la seule géométrie du graphe qui puisse mentir au praticien,
// et recharts ne rend rien sans dimensions en jsdom.
export function portionsBarre(
  hauteur: number,
  etendueHeures: number,
  latenceH: number,
  eveilMatinH: number,
): { hLatence: number; hSommeil: number; hEveilMatin: number } {
  const parHeure = etendueHeures > 0 ? hauteur / etendueHeures : 0;
  const hLatence = Math.min(hauteur, Math.max(0, latenceH) * parHeure);
  const hEveilMatin = Math.min(hauteur - hLatence, Math.max(0, eveilMatinH) * parHeure);
  return { hLatence, hEveilMatin, hSommeil: Math.max(0, hauteur - hLatence - hEveilMatin) };
}

// Barre d'une nuit : portions claires aux deux extrémités (endormissement en
// tête, éveil au lit du matin en pied), sommeil estimé entre les deux.
function BarreNuit(props: unknown) {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: Point;
  };
  if (!payload.plage || height <= 0) return null;
  const [debut, fin] = payload.plage;
  const { hLatence, hEveilMatin } = portionsBarre(
    height,
    fin - debut,
    payload.latenceH,
    payload.eveilMatinH ?? 0,
  );
  const couleur = COULEUR_SEMAINE[Math.min(2, payload.semaine)];
  return (
    <g>
      {/* Sommeil estimé : ce qui reste entre les deux éveils positionnés. */}
      <rect
        x={x}
        y={y + hLatence}
        width={width}
        height={Math.max(1, height - hLatence - hEveilMatin)}
        rx={3}
        fill={couleur}
      />
      {hLatence > 1 && (
        <rect x={x} y={y} width={width} height={hLatence} rx={3} fill={couleur} opacity={0.35} />
      )}
      {hEveilMatin > 1 && (
        <rect
          x={x}
          y={y + height - hEveilMatin}
          width={width}
          height={hEveilMatin}
          rx={3}
          fill={couleur}
          opacity={0.35}
        />
      )}
      {payload.weekend && (
        <rect
          x={x - 1}
          y={y - 1}
          width={width + 2}
          height={height + 2}
          rx={4}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5}
        />
      )}
    </g>
  );
}

function Tooltipilote({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p.nuit) return null;
  const n = p.nuit;
  const facteurs = n.facteurs
    ? CLES_FACTEURS.filter((cle) => n.facteurs?.[cle as CleFacteur]).map((cle) => LABEL_FACTEURS[cle])
    : [];
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground shadow-card">
      <p className="font-semibold">
        {p.label}
        {p.weekend ? ' · week-end' : ''}
      </p>
      <p>
        Extinction {n.heureCoucher} · lever {n.heureLever}
      </p>
      <p>Endormissement : {LABEL_LATENCE[n.latence]}</p>
      <p>
        Lever :{' '}
        {n.leverImmediat === true
          ? 'dès le réveil'
          : n.leverImmediat === false && n.heureReveilFinal
            ? `réveil ${n.heureReveilFinal}, soit ${dureeMinutes(n.heureReveilFinal, n.heureLever)} min éveillé au lit`
            : 'non renseigné'}
      </p>
      <p>
        Aide au sommeil :{' '}
        {n.aideSommeil === undefined
          ? 'non renseignée'
          : n.aideSommeil === 'prise'
            ? 'oui'
            : 'aucune'}
      </p>
      {/* Le WASO est une durée cumulée, jamais une position dans la nuit — il se
          lit ici, il ne se dessine pas dans la barre. */}
      <p>
        Éveil nocturne :{' '}
        {n.reveils
          ? `${LABEL_DUREE_REVEILS[n.reveils.dureeTotale]}${
              n.reveils.nombre !== undefined ? ` · ${n.reveils.nombre} réveil(s)` : ''
            }`
          : 'non renseigné'}
      </p>
      <p>
        Qualité : {n.qualite}/5{n.forme ? ` · forme ${n.forme}/5` : ''}
      </p>
      {n.facteurs?.rienDeParticulier && <p>{LABEL_RIEN_DE_PARTICULIER}</p>}
      {facteurs.length > 0 && <p>{facteurs.join(' · ')}</p>}
      {n.commentaire && <p className="italic">« {n.commentaire} »</p>}
    </div>
  );
}

export function ChronogrammeSommeil({ nuits }: { nuits: NuitRow[] }) {
  const points: Point[] = nuits.map((row, i) => {
    const r = row.reponses;
    // La barre court de l'extinction à la SORTIE DU LIT. Elle s'arrêtait
    // auparavant à `heureReveilFinal ?? heureLever` — inoffensif tant que ce
    // champ n'était jamais rempli, faux dès qu'il l'est : la barre s'arrêtait au
    // réveil, et la bande d'éveil du matin, posée en pied, tombait donc en plein
    // sommeil. L'infobulle disait le contraire du dessin.
    const debut = heuresDepuis20(r.heureCoucher);
    const fin = Math.max(debut + 0.1, heuresDepuis20(r.heureLever));
    return {
      label: `Nuit ${i + 1}`,
      plage: [debut, fin] as [number, number],
      latenceH: CENTRE_LATENCE_H[r.latence] ?? 0,
      eveilMatinH:
        r.leverImmediat === true
          ? 0
          : r.leverImmediat === false && r.heureReveilFinal !== undefined
            ? dureeMinutes(r.heureReveilFinal, r.heureLever) / 60
            : null,
      semaine: Math.floor(i / 7),
      weekend: estWeekend(row.dateNuit),
      nuit: r,
    };
  });

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune nuit renseignée pour le moment.</p>;
  }

  const medExtinction = mediane(points.map((p) => p.plage![0]));
  const medLever = mediane(points.map((p) => p.plage![1]));

  return (
    <div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-40}
              textAnchor="end"
              height={48}
            />
            <YAxis
              domain={[0, 16]}
              reversed
              ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16]}
              tickFormatter={tickHeure}
              tick={{ fontSize: 10 }}
              width={34}
            />
            <ReferenceLine y={medExtinction} stroke="#64748b" strokeDasharray="4 4" />
            <ReferenceLine y={medLever} stroke="#64748b" strokeDasharray="4 4" />
            <Tooltip content={<Tooltipilote />} />
            <Bar dataKey="plage" isAnimationActive={false} shape={<BarreNuit />} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">
        Teinte : semaine 1 → 3. Liseré ambré : nuit de week-end. Portions claires : temps
        d’endormissement (en tête) et éveil au lit le matin (en pied) — les deux seuls éveils
        dont l’heure est recueillie. L’éveil nocturne n’est connu qu’en durée cumulée : il se
        lit dans l’infobulle, il n’est pas dessiné à une position inventée. Pointillés :
        médianes d’extinction et de lever.
      </p>
    </div>
  );
}
