// REG-632: nota del giorno dell'agenda. Modulo client-safe.

export const DAY_NOTE_MAX_LENGTH = 60;

export type AgendaDayNote = { date: string; text: string };

/** "2026-11-16" → mezzanotte UTC, come si salva una colonna `@db.Date`. */
export const dayNoteDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** Colonna `@db.Date` → "2026-11-16" (la data arriva a mezzanotte UTC). */
export const dayNoteKey = (date: Date) => date.toISOString().slice(0, 10);
