import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: { correspondancePatient: { create } },
}));

vi.mock('@/lib/anthropic', () => ({
  sanitizeAuditError: (erreur: unknown) => String(erreur),
}));

import {
  journaliserCorrespondancePatient,
  statutJournalDepuisAuditBooklet,
  TYPES_CORRESPONDANCE_PATIENT,
} from './patient';

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({});
});

describe('journaliserCorrespondancePatient', () => {
  it('ne persiste ni adresse ni corps de message', async () => {
    await journaliserCorrespondancePatient({
      idPatient: 'PAT_TEST',
      type: TYPES_CORRESPONDANCE_PATIENT.booklet,
      objet: 'Envoi du bilan neuronutritionnel',
      statut: 'Envoye',
      referenceType: 'synthese',
      referenceId: 'SYN_TEST',
    });

    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      idPatient: 'PAT_TEST',
      canal: 'email',
      sens: 'sortant',
      type: 'booklet',
      statut: 'Envoye',
    });
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('texte');
    expect(data).not.toHaveProperty('contenu');
  });

  it('reste best-effort si le journal est indisponible', async () => {
    create.mockRejectedValue(new Error('base indisponible'));
    await expect(
      journaliserCorrespondancePatient({
        idPatient: 'PAT_TEST',
        type: TYPES_CORRESPONDANCE_PATIENT.questionnaire,
        objet: 'Invitation à compléter un questionnaire',
        statut: 'Erreur',
        erreur: 'SMTP indisponible',
      }),
    ).resolves.toBeUndefined();
  });
});

// Le journal de correspondance n'a que trois états, et le vocabulaire d'audit
// du booklet en a davantage. La traduction se faisait par un ternaire
// « tout ce qui n'est pas Envoye est une Erreur » : au 2026-09-08, les cinq
// seules lignes `Erreur` que ce journal ait jamais portées (sur 222) étaient
// cinq demandes de confirmation. D-148.
describe('statutJournalDepuisAuditBooklet', () => {
  it('« Envoye » reste un envoi', () => {
    expect(statutJournalDepuisAuditBooklet('Envoye')).toBe('Envoye');
  });

  it('« Confirmation_Requise » n’est PAS une erreur : rien n’est parti, rien n’a échoué', () => {
    expect(statutJournalDepuisAuditBooklet('Confirmation_Requise')).toBe('Non_envoye');
  });

  it('« Erreur » reste une erreur', () => {
    expect(statutJournalDepuisAuditBooklet('Erreur')).toBe('Erreur');
  });

  // Défaut PRUDENT et assumé : un statut d'audit qu'on n'a pas prévu tombe en
  // « Erreur ». Sur un envoi au patient, l'alarme de trop se relit ; l'alarme
  // manquante ne se relit pas. Ce que la version fautive faisait était
  // l'inverse : elle traitait un cas CONNU comme un cas inconnu.
  it('un statut d’audit inconnu tombe en « Erreur », jamais en « Envoye »', () => {
    expect(statutJournalDepuisAuditBooklet('Quarantaine_2027')).toBe('Erreur');
    expect(statutJournalDepuisAuditBooklet('')).toBe('Erreur');
  });
});
