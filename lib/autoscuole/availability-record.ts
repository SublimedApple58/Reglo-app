/**
 * Disponibilità settimanale "risolta" — helper PURI condivisi (REG-802).
 *
 * `AutoscuolaWeeklyAvailability` ha due modelli sovrapposti:
 *  - condiviso/legacy: `daysOfWeek` + `ranges` (le stesse fasce su ogni giorno
 *    attivo), con fallback su `startMinutes/endMinutes(2)` quando `ranges` è vuoto;
 *  - per giorno: `rangesByDay` ({ "1": [...] }, 0=Dom..6=Sab), AUTORITATIVO quando c'è.
 *
 * Ogni lettore (motore prenotazioni, slot liberi, proposte all'istruttore,
 * lista d'attesa, scambi) deve leggere le fasce di un giorno SOLO con
 * `rangesForDay()`: con `rangesByDay` il campo piatto `ranges` del record è
 * vuoto apposta. Prima del REG-802 alcuni lettori degli allievi leggevano
 * `ranges`/`daysOfWeek` direttamente e con le fasce per giorno non trovavano
 * nessun orario.
 *
 * Nessun import da Prisma o dal server: il modulo è testabile in isolamento
 * e importabile anche da file `"use server"`.
 */

/** `locationId` (REG-705): luogo della fascia; assente = tutti i luoghi. */
export type TimeRange = { startMinutes: number; endMinutes: number; locationId?: string | null };

export type AvailabilityRecord = {
  daysOfWeek: number[];
  ranges: TimeRange[];
  /**
   * Quando presente le fasce cambiano per giorno (0=Dom..6=Sab) e prevalgono
   * su `ranges`. Unico accesso in lettura: `rangesForDay()`.
   */
  rangesByDay?: Record<number, TimeRange[]>;
};

/** Riga di `AutoscuolaWeeklyAvailability` (o forma compatibile) da convertire. */
export type WeeklyAvailabilityRow = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  startMinutes2?: number | null;
  endMinutes2?: number | null;
  ranges?: unknown;
  rangesByDay?: unknown;
};

export const parseRanges = (raw: unknown): TimeRange[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is TimeRange =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as TimeRange).startMinutes === "number" &&
      typeof (e as TimeRange).endMinutes === "number",
  );
};

/**
 * `rangesByDay` JSON ({ "1": [...], ... }) → mappa {giorno: fasce}, tenendo solo
 * i giorni con almeno una fascia valida. `null` se assente o vuoto, così chi
 * chiama ripiega sulle fasce condivise.
 */
export const parseRangesByDay = (raw: unknown): Record<number, TimeRange[]> | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const map: Record<number, TimeRange[]> = {};
  let any = false;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const ranges = parseRanges(v).filter((r) => r.endMinutes > r.startMinutes);
    if (ranges.length) {
      map[day] = ranges;
      any = true;
    }
  }
  return any ? map : null;
};

/** Fasce che valgono in un giorno della settimana, per entrambi i modelli. */
export const rangesForDay = (a: AvailabilityRecord, dayOfWeek: number): TimeRange[] => {
  if (a.rangesByDay) return a.rangesByDay[dayOfWeek] ?? [];
  return a.daysOfWeek.includes(dayOfWeek) ? a.ranges : [];
};

/**
 * Tutte le fasce dichiarate in settimana, su qualunque giorno. Per il modello
 * condiviso sono le `ranges` così come sono (anche senza giorni: è quello che
 * leggevano i controlli della fascia prioritaria prima del REG-802).
 */
export const allRangesOf = (a: AvailabilityRecord): TimeRange[] => {
  if (a.rangesByDay) return Object.values(a.rangesByDay).flat();
  return a.ranges;
};

/**
 * Restringe un record (anche per giorno) alle fasce di un solo giorno, nella
 * stessa forma del record legacy, così i consumatori esistenti non cambiano.
 */
export const narrowToDay = (a: AvailabilityRecord, dayOfWeek: number): AvailabilityRecord => {
  const ranges = rangesForDay(a, dayOfWeek);
  return { daysOfWeek: ranges.length ? [dayOfWeek] : [], ranges };
};

export const defaultToAvailabilityRecord = (record: WeeklyAvailabilityRow): AvailabilityRecord => {
  const rangesByDay = parseRangesByDay(record.rangesByDay);
  if (rangesByDay) {
    // daysOfWeek = giorni che hanno fasce; `ranges` piatto vuoto apposta (la
    // mappa per giorno è l'unica fonte e si legge con rangesForDay()).
    return {
      daysOfWeek: Object.keys(rangesByDay)
        .map(Number)
        .sort((a, b) => a - b),
      ranges: [],
      rangesByDay,
    };
  }
  const ranges = record.ranges ? parseRanges(record.ranges) : [];
  if (!ranges.length) {
    ranges.push({ startMinutes: record.startMinutes, endMinutes: record.endMinutes });
    if (
      record.startMinutes2 != null &&
      record.endMinutes2 != null &&
      record.endMinutes2 > record.startMinutes2
    ) {
      ranges.push({ startMinutes: record.startMinutes2, endMinutes: record.endMinutes2 });
    }
  }
  return { daysOfWeek: record.daysOfWeek, ranges };
};

/**
 * True se nel giorno `dayOfWeek` una fascia contiene per intero [startMin, endMin]
 * (minuti dalla mezzanotte, ora locale dell'autoscuola).
 */
export const isRecordCoveringMinutes = (
  availability: AvailabilityRecord | null | undefined,
  dayOfWeek: number,
  startMin: number,
  endMin: number,
): boolean => {
  if (!availability) return false;
  return rangesForDay(availability, dayOfWeek).some(
    (r) => r.endMinutes > r.startMinutes && startMin >= r.startMinutes && endMin <= r.endMinutes,
  );
};

/**
 * «Riempi le fasce più vuote» (`restrictedTimeRangeEnabled`): la priorità della
 * fascia si applica in un giorno se le disponibilità dell'allievo DI QUEL GIORNO
 * toccano la fascia. Se in quel giorno l'allievo non ha dichiarato niente si
 * guarda la settimana intera: è il comportamento di prima del REG-802 (che non
 * guardava il giorno), così per le righe legacy non cambia nulla.
 */
export const overlapsWindowOnDay = (
  availability: AvailabilityRecord | null | undefined,
  dayOfWeek: number,
  windowStartMin: number,
  windowEndMin: number,
): boolean => {
  if (!availability) return false;
  const dayRanges = rangesForDay(availability, dayOfWeek);
  const ranges = dayRanges.length ? dayRanges : allRangesOf(availability);
  return ranges.some((r) => r.startMinutes < windowEndMin && r.endMinutes > windowStartMin);
};
