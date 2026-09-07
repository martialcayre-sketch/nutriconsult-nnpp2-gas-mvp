import { prisma } from '@/lib/prisma';
import { construireTrajectoire, type TrajectoireEpisode } from '@/lib/protocol/trajectoire';
import type { ReponseBrute } from '@/lib/equilibre/depuisPrisma';
import type { JalonMomentum } from '@/lib/equilibre/types';
import { estJalonMomentum } from '@/lib/protocol/cycles';
import type { TendanceMomentumCarte } from './cartes';

// Momentum des patients au jalon J21 (accueil-observatoire LOT-03) —
// enrichissement FACTUEL et optionnel de la carte jalon. Réutilise
// `construireTrajectoire` : le momentum d'un cycle est T0 → dernier jalon
// mesuré. Souvent indisponible (le check-in J21 de pilotage et la re-mesure
// d'équilibre à J21 sont deux choses distinctes, A1) : dans ce cas la valeur
// est `null` et la carte n'affiche RIEN — jamais un 0 (A8-2).
//
// Bornée aux patients-jalon (petit sous-ensemble) : deux requêtes, pas de N+1.

export async function momentumJalonsParPatient(
  idsJalon: string[],
): Promise<Map<string, { tendance: TendanceMomentumCarte; delta: number } | null>> {
  const resultat = new Map<string, { tendance: TendanceMomentumCarte; delta: number } | null>();
  if (idsJalon.length === 0) return resultat;

  const [episodes, reponses] = await Promise.all([
    prisma.assessmentEpisode.findMany({
      where: { idPatient: { in: idsJalon } },
      select: { id: true, idPatient: true, milestone: true, confirmedAt: true, cycleId: true, versionScore: true },
      orderBy: { confirmedAt: 'asc' },
    }),
    prisma.questionnaireReponse.findMany({
      where: { idPatient: { in: idsJalon } },
      select: { idPatient: true, idQuestionnaire: true, dateReponse: true, scoresJson: true, statutValidite: true },
      orderBy: { dateReponse: 'asc' },
    }),
  ]);

  const episodesParPatient = new Map<string, TrajectoireEpisode[]>();
  for (const e of episodes) {
    // Une ligne dont le jalon n'est ni une ancre ni une mesure est ignorée. Le
    // test portait sur une liste littérale fermée : un `T1` confirmé en base y
    // était rejeté, et le cycle disparaissait de la lecture sans un mot.
    if (!estJalonMomentum(e.milestone)) continue;
    const liste = episodesParPatient.get(e.idPatient) ?? [];
    liste.push({
      id: e.id,
      milestone: e.milestone as JalonMomentum,
      confirmedAt: e.confirmedAt,
      cycleId: e.cycleId,
      versionScore: e.versionScore,
    });
    episodesParPatient.set(e.idPatient, liste);
  }

  const reponsesParPatient = new Map<string, ReponseBrute[]>();
  for (const r of reponses) {
    const liste = reponsesParPatient.get(r.idPatient) ?? [];
    liste.push({
      idQuestionnaire: r.idQuestionnaire,
      dateReponse: r.dateReponse,
      scoresJson: r.scoresJson,
      // LE STATUT ÉTAIT SÉLECTIONNÉ PLUS HAUT PUIS PERDU ICI (`A03`).
      // Le moteur porte le filtre ; cet adaptateur l'affamait, et le
      // champ optionnel faisait passer l'oubli pour un « VALID ».
      statutValidite: r.statutValidite,
    });
    reponsesParPatient.set(r.idPatient, liste);
  }

  for (const idPatient of idsJalon) {
    const trajectoire = construireTrajectoire({
      episodes: episodesParPatient.get(idPatient) ?? [],
      reponses: reponsesParPatient.get(idPatient) ?? [],
    });
    // Le cycle courant = le dernier T0 confirmé (cycles triés par date).
    const cycleCourant = trajectoire.cycles.at(-1);
    resultat.set(idPatient, cycleCourant?.momentum ?? null);
  }

  return resultat;
}
