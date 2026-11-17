/**
 * Durata massima di una guida singola (REG-757).
 *
 * Dal web una guida può durare fino a 4 ore con le scelte rapide, o finire a
 * un orario qualunque (es. un corso CQC di mezza giornata). Il tetto vero è
 * 10 ore: lo stesso che la modifica della durata (`durationMin`) e le
 * richieste di guida del consorzio applicano già. Oltre è quasi sempre un
 * errore di battitura sull'orario di fine.
 */
export const MAX_LESSON_DURATION_MINUTES = 600;

export const LESSON_TOO_LONG_MESSAGE = "Una guida può durare al massimo 10 ore.";

/** True se l'intervallo supera la durata massima di una guida. */
export function exceedsMaxLessonDuration(startsAt: Date, endsAt: Date): boolean {
  return endsAt.getTime() - startsAt.getTime() > MAX_LESSON_DURATION_MINUTES * 60 * 1000;
}

/** Scelte rapide del campo «Durata» (guide, esami): l'orario di fine copre il resto. */
export const DURATION_CHIPS = [30, 45, 60, 90, 120, 180, 240];

export const formatDurationChip = (min: number) => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
};

export const timeToMinutes = (t: string) => {
  const [h, m] = (t || "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesToTime = (min: number) => {
  const capped = Math.min(Math.max(min, 0), 1440);
  return `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
};

/** Durata ottenuta scegliendo un orario di fine: null se non è dopo l'inizio. */
export const durationFromEndTime = (startTime: string, endTime: string): number | null => {
  const d = timeToMinutes(endTime) - timeToMinutes(startTime);
  return d > 0 ? d : null;
};
