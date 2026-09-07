import { prisma } from '@/lib/prisma';
import { filtrePatientsDuPraticien } from '@/lib/praticien/appartenance';
import { construireTrajectoire, type Trajectoire, type TrajectoireEpisode } from '@/lib/protocol/trajectoire';
import type { ReponseBrute } from '@/lib/equilibre/depuisPrisma';
import type { JalonMomentum } from '@/lib/equilibre/types';
import { estJalonMomentum } from '@/lib/protocol/cycles';

// Chargement « cabinet » partagé (SP-TRAJ LOT-03, réutilisé par la page
// Trajectoires au LOT-04) : les trajectoires de TOUS les patients du
// praticien en TROIS requêtes — patients, épisodes, réponses — puis
// construction en mémoire. Jamais une requête par patient.

export type LigneCabinet = {
  idPatient: string;
  prenom: string;
  nom: string;
  email: string;
  trajectoire: Trajectoire;
};

export async function chargerTrajectoiresCabinet(emailPraticien: string): Promise<LigneCabinet[]> {
  const patients = await prisma.patient.findMany({
    where: filtrePatientsDuPraticien(emailPraticien),
    select: { idPatient: true, prenom: true, nom: true, email: true },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });
  if (patients.length === 0) return [];
  const ids = patients.map((p) => p.idPatient);

  const episodes = await prisma.assessmentEpisode.findMany({
    where: { idPatient: { in: ids } },
    select: { id: true, idPatient: true, milestone: true, confirmedAt: true, cycleId: true, versionScore: true },
    orderBy: { confirmedAt: 'asc' },
  });
  const reponses = await prisma.questionnaireReponse.findMany({
    where: { idPatient: { in: ids } },
    select: { idPatient: true, idQuestionnaire: true, dateReponse: true, scoresJson: true, statutValidite: true },
    orderBy: { dateReponse: 'asc' },
  });

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

  return patients.map((patient) => ({
    ...patient,
    trajectoire: construireTrajectoire({
      episodes: episodesParPatient.get(patient.idPatient) ?? [],
      reponses: reponsesParPatient.get(patient.idPatient) ?? [],
    }),
  }));
}
