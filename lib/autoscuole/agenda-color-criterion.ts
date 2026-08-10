/**
 * Criterio colore dei blocchi guida in agenda (setting company, pannello
 * "Aspetto"). Vale SOLO per le guide individuali normali: esami (viola),
 * gruppi (teal/arancio), blocchi istruttore e stati no-show/annullata
 * mantengono sempre il loro colore per tipo/stato.
 *
 * - "durata": bucket per durata della guida (comportamento storico, default)
 * - "istruttore": tinta del colore istruttore (stessa della banda disponibilità)
 *
 * Modulo client-safe separato dall'action ("use server" non può esportare
 * costanti). Estendibile: aggiungere qui un nuovo criterio e gestirlo nei
 * siti di rendering di AutoscuoleAgendaPage.
 */
export const AGENDA_COLOR_CRITERIA = ["durata", "istruttore"] as const;

export type AgendaColorCriterion = (typeof AGENDA_COLOR_CRITERIA)[number];

export const DEFAULT_AGENDA_COLOR_CRITERION: AgendaColorCriterion = "durata";

export function asAgendaColorCriterion(value: unknown): AgendaColorCriterion {
  return AGENDA_COLOR_CRITERIA.includes(value as AgendaColorCriterion)
    ? (value as AgendaColorCriterion)
    : DEFAULT_AGENDA_COLOR_CRITERION;
}
