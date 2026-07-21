/**
 * Festività nazionali non prenotabili (preset del pane Prenotazioni).
 *
 * Il titolare attiva il toggle (limits.nationalHolidaysEnabled) e può spegnere
 * singole ricorrenze (limits.nationalHolidaysDisabled = array di id). Le date
 * attive vengono MATERIALIZZATE come righe AutoscuolaHoliday con `presetId`
 * valorizzato: così il motore prenotazioni, l'agenda e i warning esistenti le
 * trattano come qualunque festivo dichiarato, senza modifiche. I festivi
 * manuali (presetId null) non vengono mai toccati dalla sync.
 *
 * Ricorrenza: la sync copre anno corrente + successivo, da oggi in avanti; il
 * cron giornaliero (trigger/autoscuole-national-holidays.ts) tiene il rolling
 * window aggiornato anno dopo anno.
 */

export type NationalHoliday = {
  id: string;
  label: string;
  /** Festività fissa (1-12 / 1-31) … */
  month?: number;
  day?: number;
  /** … oppure mobile: giorni di offset da Pasqua. */
  easterOffset?: number;
};

export const NATIONAL_HOLIDAYS: NationalHoliday[] = [
  { id: "capodanno", label: "Capodanno", month: 1, day: 1 },
  { id: "epifania", label: "Epifania", month: 1, day: 6 },
  { id: "pasqua", label: "Pasqua", easterOffset: 0 },
  { id: "pasquetta", label: "Lunedì dell'Angelo", easterOffset: 1 },
  { id: "liberazione", label: "Festa della Liberazione", month: 4, day: 25 },
  { id: "lavoro", label: "Festa del Lavoro", month: 5, day: 1 },
  { id: "repubblica", label: "Festa della Repubblica", month: 6, day: 2 },
  { id: "ferragosto", label: "Ferragosto", month: 8, day: 15 },
  { id: "ognissanti", label: "Ognissanti", month: 11, day: 1 },
  { id: "immacolata", label: "Immacolata Concezione", month: 12, day: 8 },
  { id: "natale", label: "Natale", month: 12, day: 25 },
  { id: "stefano", label: "Santo Stefano", month: 12, day: 26 },
];

export const NATIONAL_HOLIDAY_IDS = NATIONAL_HOLIDAYS.map((h) => h.id);

/** Pasqua gregoriana (algoritmo di Meeus/Butcher). Mese 1-12, giorno 1-31. */
export function easterDate(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Data "yyyy-mm-dd" della festività per l'anno dato. */
export function nationalHolidayDate(holiday: NationalHoliday, year: number): string {
  if (holiday.easterOffset !== undefined) {
    const easter = easterDate(year);
    const date = new Date(Date.UTC(year, easter.month - 1, easter.day + holiday.easterOffset));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  return `${year}-${pad(holiday.month!)}-${pad(holiday.day!)}`;
}

/** Etichetta breve "1 gen" / "5 apr" per l'anno dato (per la lista UI). */
export function nationalHolidayDateLabel(holiday: NationalHoliday, year: number): string {
  const dateStr = nationalHolidayDate(holiday, year);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function parseNationalHolidaySettings(limits: Record<string, unknown>) {
  const enabled = limits.nationalHolidaysEnabled === true;
  const disabled = Array.isArray(limits.nationalHolidaysDisabled)
    ? (limits.nationalHolidaysDisabled as unknown[]).filter(
        (id): id is string => typeof id === "string" && NATIONAL_HOLIDAY_IDS.includes(id),
      )
    : [];
  return { enabled, disabled };
}
