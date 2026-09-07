import registre from '../../../../../docs/claude/corpus/source_registry.json';

// Vue « notebooks » du registre sanitaire des sources
// (docs/claude/corpus/source_registry.json — source de vérité unique,
// importée STATIQUEMENT : le JSON est bundlé à la compilation, donc présent
// dans le déploiement Vercel dont le répertoire racine est web/).
//
// Le notebook (primaryNotebook) est l'unité d'organisation pédagogique du
// corpus : c'est par lui que le praticien filtre la file de revue et la
// validation par lot, et par lui que la bibliothèque NotebookLM est nourrie.

type NoticeRegistre = {
  sourceId?: string;
  title?: string;
  primaryNotebook?: string;
  lifecycleStatus?: string;
};

const NOTICES: ReadonlyArray<NoticeRegistre> = registre as NoticeRegistre[];

const PAR_SOURCE = new Map<
  string,
  { titre: string; notebook: string; lifecycleStatus: string }
>();
for (const notice of NOTICES) {
  if (!notice.sourceId) continue;
  PAR_SOURCE.set(notice.sourceId, {
    titre: notice.title || notice.sourceId,
    notebook: notice.primaryNotebook || 'Hors notebook',
    lifecycleStatus: notice.lifecycleStatus || 'inconnu',
  });
}

export type NotebookSource = { sourceId: string; titre: string; notebook: string };

/** Titre + notebook d'une source, ou null si absente du registre. */
export function noticeDeSource(sourceId: string): NotebookSource | null {
  const notice = PAR_SOURCE.get(sourceId);
  return notice ? { sourceId, titre: notice.titre, notebook: notice.notebook } : null;
}

/** Les sourceIds d'un notebook (registre entier — l'appelant croise avec la base). */
export function sourcesDuNotebook(notebook: string): string[] {
  const ids: string[] = [];
  for (const [sourceId, notice] of PAR_SOURCE) {
    if (notice.notebook === notebook) ids.push(sourceId);
  }
  return ids.sort();
}

/**
 * Une source sous QUARANTAINE SANITAIRE au registre — `lifecycleStatus:
 * 'quarantined'`, posé quand une notice attend une relecture scientifique ou de
 * sécurité (WN-SRC-0318 « premières ordonnances », vigilance Élevée, en est le
 * cas type). 28 notices le portent aujourd'hui.
 *
 * CE QUE CE PRÉDICAT NE DOIT PAS FILTRER, et c'est la moitié de son intérêt :
 * la FILE DE REVUE. Le praticien doit continuer d'y voir les claims des sources
 * en quarantaine — c'est là qu'il les arbitre, les rejette, ou les valide le
 * jour où la quarantaine est levée. Les masquer rendrait la quarantaine
 * définitive par accident. Le filtre appartient aux chemins qui SERVENT le
 * claim comme contenu clinique, jamais à ceux qui l'exposent pour décision.
 *
 * Le statut est relu au registre à chaque déploiement : une quarantaine levée
 * se répercute d'elle-même, sans liste figée en base ni chemin de démarquage à
 * inventer (contrairement au périmètre d'orientation, plus stable, gravé lui
 * dans `rag_claim_orientation_sources()`).
 */
export function estSourceEnQuarantaine(sourceId: string): boolean {
  return PAR_SOURCE.get(sourceId)?.lifecycleStatus === 'quarantined';
}

/** Retire les sources en quarantaine sanitaire d'une liste d'identifiants. */
export function sansSourcesEnQuarantaine(sourceIds: string[]): string[] {
  return sourceIds.filter((sourceId) => !estSourceEnQuarantaine(sourceId));
}

/** Annote des sourceIds avec titre et notebook (inconnues du registre incluses, marquées). */
export function annoterSources(sourceIds: string[]): NotebookSource[] {
  return sourceIds.map(
    (sourceId) =>
      noticeDeSource(sourceId) ?? { sourceId, titre: sourceId, notebook: 'Hors registre' },
  );
}
