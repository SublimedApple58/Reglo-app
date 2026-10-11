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

// ── I due convertitori di fuso ───────────────────────────────────────────────
// Erano il collo di bottiglia dei KPI del backoffice e del report ore del
// titolare: costruivano un `Intl.DateTimeFormat` NUOVO a ogni chiamata. Misurato
// su node 22: 27,8 µs costruendolo ogni volta contro 2,2 µs con il formatter già
// pronto. Il ciclo della saturazione li chiama una volta per ogni istruttore per
// ogni giorno del periodo — sul filtro "Anno" sono ~150.000 chiamate, cioè
// quattro secondi di CPU buttati a ricostruire sempre lo stesso oggetto.
//
// Due accorgimenti, nessun cambio di risultato:
//  1. il formatter nasce una volta sola, a livello di modulo;
//  2. i risultati si ricordano, perché le stesse domande tornano identiche
//     decine di volte (il giorno di calendario e l'inizio di una fascia sono
//     gli stessi per tutti gli istruttori della stessa giornata).
//
// L'ora legale resta gestita come prima: si memorizza la risposta per
// (giorno, minuto), non un offset valido per tutto il giorno — il 26 ottobre
// alle 02:00 l'offset cambia a metà giornata e un offset unico sbaglierebbe
// di un'ora.
//
// La memoria non cresce all'infinito: oltre il tetto la cache si svuota e
// riparte da zero. Fluid Compute riusa l'istanza per molte richieste, e una
// cache senza tetto è una perdita di memoria lenta.

const CACHE_CAP = 20_000;

const remember = <K, V>(cache: Map<K, V>, key: K, compute: () => V): V => {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  if (cache.size >= CACHE_CAP) cache.clear();
  cache.set(key, value);
  return value;
};

const ROME_WALL_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const ROME_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const instantCache = new Map<number, number>();
const ymdCache = new Map<number, { year: number; month: number; day: number }>();

const wallClockToInstant = (
  year: number,
  month: number,
  day: number,
  minutes: number,
): number => {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0) + minutes * MINUTE;
  // Offset di Roma misurato su quell'istante (gestisce l'ora legale da sé).
  const parts = ROME_WALL_CLOCK.formatToParts(new Date(naiveUtc));
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
};

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
  // Chiave numerica compatta. Fuori da questi intervalli (date assurde, minuti
  // negativi) si calcola e non si memorizza: la chiave collasserebbe.
  const cacheable =
    Number.isInteger(year) &&
    year > 0 &&
    year < 10_000 &&
    month >= 0 &&
    month < 100 &&
    day >= 0 &&
    day < 100 &&
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes < 10_000;
  if (!cacheable) return wallClockToInstant(year, month, day, minutes);
  const key = year * 100_000_000 + month * 1_000_000 + day * 10_000 + minutes;
  return remember(instantCache, key, () => wallClockToInstant(year, month, day, minutes));
}

/** Giorno di calendario italiano di un istante. */
export function romeYmd(date: Date): { year: number; month: number; day: number } {
  const stamp = date.getTime();
  if (!Number.isFinite(stamp)) return { year: NaN, month: NaN, day: NaN };
  return remember(ymdCache, stamp, () => {
    const [year, month, day] = ROME_DAY.format(date).split("-").map(Number);
    return { year, month, day };
  });
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
