/**
 * Saturazione dell'agenda istruttori: quante delle ore che un istruttore
 * dichiara disponibili finiscono davvero occupate da guide.
 *
 * Modulo puro di aritmetica su intervalli — niente Prisma, niente date "furbe":
 * ogni intervallo è una coppia di millisecondi. Sta qui e non dentro l'action
 * perché è l'unica parte che si può sbagliare in silenzio, e così si testa.
 */

export type Interval = { start: number; end: number };

/** Ordina e fonde gli intervalli che si toccano o si sovrappongono. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const current of valid) {
    const last = out[out.length - 1];
    // `>=`: due fasce attaccate (10-11 e 11-12) sono un'ora sola da 10 a 12.
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      out.push({ ...current });
    }
  }
  return out;
}

/** `base` meno `holes`. Entrambi vengono fusi prima, così l'ordine non conta. */
export function subtractIntervals(base: Interval[], holes: Interval[]): Interval[] {
  const merged = mergeIntervals(base);
  const cuts = mergeIntervals(holes);
  const out: Interval[] = [];
  for (const piece of merged) {
    let cursor = piece.start;
    for (const cut of cuts) {
      if (cut.end <= cursor || cut.start >= piece.end) continue;
      if (cut.start > cursor) out.push({ start: cursor, end: Math.min(cut.start, piece.end) });
      cursor = Math.max(cursor, cut.end);
      if (cursor >= piece.end) break;
    }
    if (cursor < piece.end) out.push({ start: cursor, end: piece.end });
  }
  return out.filter((i) => i.end > i.start);
}

/** Parte in comune fra due elenchi di intervalli. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (end > start) out.push({ start, end });
    if (left[i].end < right[j].end) i += 1;
    else j += 1;
  }
  return out;
}

/** Ritaglia un elenco dentro una finestra (il periodo scelto). */
export const clampIntervals = (intervals: Interval[], window: Interval): Interval[] =>
  intervals
    .map((i) => ({ start: Math.max(i.start, window.start), end: Math.min(i.end, window.end) }))
    .filter((i) => i.end > i.start);

const MINUTE = 60_000;

/**
 * Le fasce di disponibilità sono minuti di orologio ITALIANO ("dalle 9 alle
 * 13"), non istanti. In produzione il server gira a UTC: senza questa
 * conversione ogni fascia slitterebbe di un'ora o due e non combacerebbe più
 * con le guide, che invece hanno istanti veri.
 */
export function romeWallClockToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
): number {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0) + minutes * MINUTE;
  // Offset di Roma misurato su quell'istante (gestisce l'ora legale da sé).
  const probe = new Date(naiveUtc);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(probe);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
  );
  const offset = asIfUtc - naiveUtc;
  return naiveUtc - offset;
}

/** Giorno di calendario italiano di un istante. */
export function romeYmd(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [year, month, day] = parts.split("-").map(Number);
  return { year, month, day };
}

export const totalMinutes = (intervals: Interval[]): number =>
  mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start) / MINUTE, 0);

export const minutesToHours = (minutes: number) => minutes / 60;

export type SaturationTotals = {
  /** Ore dichiarate disponibili, già al netto di blocchi e festivi. */
  availableHours: number;
  /** Ore di guida che cadono DENTRO quelle fasce. */
  busyHours: number;
  /** Ore di guida fatte fuori dalle fasce dichiarate (non entrano nel rapporto). */
  outsideHours: number;
  /** busy / available, 0 se non c'è disponibilità dichiarata. */
  ratio: number;
};

/**
 * Somma per un singolo istruttore. `availability` sono le fasce dichiarate del
 * periodo (già ritagliate), `blocks` malattia/ferie/teoria e chiusure, `lessons`
 * le guide: si fondono prima, così due posti della stessa guida di gruppo non
 * contano due volte.
 */
export function instructorSaturation(
  availability: Interval[],
  blocks: Interval[],
  lessons: Interval[],
): Omit<SaturationTotals, "ratio"> {
  const free = subtractIntervals(availability, blocks);
  const busyAll = mergeIntervals(lessons);
  const inside = intersectIntervals(busyAll, free);
  const insideMinutes = totalMinutes(inside);
  return {
    availableHours: minutesToHours(totalMinutes(free)),
    busyHours: minutesToHours(insideMinutes),
    outsideHours: minutesToHours(totalMinutes(busyAll) - insideMinutes),
  };
}

export const withRatio = (totals: Omit<SaturationTotals, "ratio">): SaturationTotals => ({
  ...totals,
  ratio: totals.availableHours > 0 ? totals.busyHours / totals.availableHours : 0,
});
