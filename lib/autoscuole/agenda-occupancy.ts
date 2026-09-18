/**
 * Ore dichiarate disponibili in agenda vs ore davvero occupate, per un singolo
 * istruttore e un singolo periodo (REG-444, report "Ore guida").
 *
 * La matematica sugli intervalli sta in `lib/backoffice/agenda-saturation.ts`
 * (modulo puro, già coperto da test): qui sopra ci si mette solo la parte di
 * dominio — come si trasformano le fasce dell'agenda in intervalli veri e come
 * si legge il risultato. Niente Prisma: chi chiama porta le righe già lette,
 * così questo resta testabile a mano.
 *
 * Stessa definizione di "disponibile" dei KPI del backoffice, di proposito: se
 * il titolare e noi guardiamo lo stesso rapporto, deve venire lo stesso numero.
 */

import {
  intersectIntervals,
  mergeIntervals,
  romeWallClockToInstant,
  romeYmd,
  subtractIntervals,
  totalMinutes,
  type Interval,
} from "@/lib/backoffice/agenda-saturation";

export type { Interval };

/** `reason` delle pause automatiche fra una guida e l'altra (REG-484). */
export const LESSON_BUFFER_BLOCK_REASON = "lesson_buffer";

/** Cosa sappiamo dirgli dell'agenda di un istruttore in un periodo. */
export type AgendaOccupancy = {
  /** Fasce dichiarate nel periodo, PRIMA di togliere blocchi e chiusure. */
  declaredMinutes: number;
  /** Fasce dichiarate al netto di ferie, malattia, teoria e giorni di chiusura. */
  availableMinutes: number;
  /** Minuti occupati da appuntamenti che cadono DENTRO le fasce disponibili. */
  busyMinutes: number;
  /** Occupato fuori dalle fasce dichiarate: contato a parte, fuori dal rapporto. */
  outsideMinutes: number;
  /** `busyMinutes / availableMinutes`, 0 quando non c'è disponibilità. */
  ratio: number;
};

export const EMPTY_OCCUPANCY: AgendaOccupancy = {
  declaredMinutes: 0,
  availableMinutes: 0,
  busyMinutes: 0,
  outsideMinutes: 0,
  ratio: 0,
};

/** La fetta di `buildAvailabilityResolver` che serve qui. */
export type AvailabilityDayResolver = {
  resolve(
    ownerId: string,
    date: Date,
  ): { daysOfWeek: number[]; ranges: Array<{ startMinutes: number; endMinutes: number }> } | null;
};

const DAY_MS = 86_400_000;

/**
 * La finestra che si può davvero misurare: il futuro non si misura.
 * Un'agenda piena di fasce dichiarate per domani farebbe sembrare l'autoscuola
 * più vuota di quello che è, quindi si guarda solo la parte di periodo già
 * trascorsa.
 *
 * Il taglio vale per TUTTO — fasce, blocchi e occupato — non solo per le ore
 * disponibili. Non per via del rapporto (l'intersezione lo tiene già sotto
 * l'1), ma perché una guida di stasera, che sta dentro le fasce dichiarate,
 * finirebbe altrimenti contata come lavoro svolto FUORI fascia.
 *
 * `null` quando il periodo non è ancora iniziato: è un caso diverso da "non ha
 * fatto niente", e va raccontato con parole diverse.
 */
export function measurementWindow(period: Interval, now: number): Interval | null {
  const end = Math.min(period.end, now);
  return end > period.start ? { start: period.start, end } : null;
}

/**
 * Un `Date` a mezzogiorno per ogni giorno di calendario ITALIANO toccato dalla
 * finestra. Mezzogiorno e non mezzanotte: è l'unica ora che nessun cambio di
 * ora legale riesce a spostare nel giorno prima o in quello dopo.
 */
export function romeNoonDays(windowStart: Date, windowEnd: Date): Date[] {
  const days: Date[] = [];
  for (let cursor = windowStart.getTime(); cursor < windowEnd.getTime(); cursor += DAY_MS) {
    days.push(new Date(cursor + DAY_MS / 2));
  }
  return days;
}

/** `YYYY-MM-DD` del giorno italiano in cui cade un istante. */
export const romeYmdKey = (date: Date): string => {
  const { year, month, day } = romeYmd(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * Le fasce dell'agenda diventano intervalli veri. Le fasce sono minuti di
 * orologio italiano ("dalle 9 alle 13"), non istanti: in produzione il server
 * gira a UTC, quindi vanno convertite giorno per giorno o slittano di un'ora.
 */
export function buildDeclaredIntervals(input: {
  instructorId: string;
  /** Da `romeNoonDays`. */
  days: Date[];
  resolver: AvailabilityDayResolver;
  /** Giorni di chiusura dell'autoscuola, chiavi `YYYY-MM-DD` italiane. */
  closedDays: Set<string>;
}): Interval[] {
  const out: Interval[] = [];
  for (const day of input.days) {
    const { year, month, day: dayOfMonth } = romeYmd(day);
    if (input.closedDays.has(romeYmdKey(day))) continue;
    const record = input.resolver.resolve(input.instructorId, day);
    if (!record) continue;
    // Il giorno della settimana va letto sull'orologio italiano, non su quello
    // del server: a cavallo di mezzanotte UTC sarebbe quello sbagliato.
    const dayOfWeek = new Date(
      romeWallClockToInstant(year, month, dayOfMonth, 12 * 60),
    ).getUTCDay();
    if (!record.daysOfWeek.includes(dayOfWeek)) continue;
    for (const range of record.ranges) {
      if (range.endMinutes <= range.startMinutes) continue;
      out.push({
        start: romeWallClockToInstant(year, month, dayOfMonth, range.startMinutes),
        end: romeWallClockToInstant(year, month, dayOfMonth, range.endMinutes),
      });
    }
  }
  return out;
}

/**
 * I blocchi non sono tutti uguali. Ferie, malattia, lezioni teoriche e blocchi
 * manuali sono ore in cui l'istruttore NON c'è: tolgono disponibilità. Le pause
 * fra una guida e l'altra (REG-484, `reason: "lesson_buffer"`) sono blocchi
 * anche loro, ma di un'altra natura — sono ore consumate DA una prenotazione.
 *
 * Se finissero fra le indisponibilità, le ore disponibili si accorcerebbero a
 * ogni guida prenotata: un denominatore che si muove da solo, impossibile da
 * spiegare a un titolare. Vanno invece fra le ore occupate, perché è capacità
 * che non si può più vendere. Attaccandosi alla fine della guida si fondono
 * con essa e non contano due volte.
 */
export function splitBlocksByNature<T extends { reason?: string | null }>(
  blocks: T[],
): { unavailability: T[]; busy: T[] } {
  const unavailability: T[] = [];
  const busy: T[] = [];
  for (const block of blocks) {
    if (block.reason === LESSON_BUFFER_BLOCK_REASON) busy.push(block);
    else unavailability.push(block);
  }
  return { unavailability, busy };
}

/**
 * Il conto vero e proprio. Gli intervalli si fondono prima di essere misurati,
 * così due posti della stessa guida di gruppo — o una guida che sta dentro il
 * contenitore del gruppo — non contano due volte.
 */
export function computeAgendaOccupancy(input: {
  /** Fasce dichiarate, già ritagliate sul periodo. */
  declared: Interval[];
  /** Ferie, malattia, lezioni teoriche, blocchi manuali. */
  blocks: Interval[];
  /** Guide, esami e contenitori di gruppo non annullati. */
  busy: Interval[];
}): AgendaOccupancy {
  const declared = mergeIntervals(input.declared);
  const free = subtractIntervals(declared, input.blocks);
  const busyAll = mergeIntervals(input.busy);
  const inside = intersectIntervals(busyAll, free);

  const declaredMinutes = Math.round(totalMinutes(declared));
  const availableMinutes = Math.round(totalMinutes(free));
  const busyMinutes = Math.round(totalMinutes(inside));
  const outsideMinutes = Math.max(0, Math.round(totalMinutes(busyAll)) - busyMinutes);

  return {
    declaredMinutes,
    availableMinutes,
    busyMinutes,
    outsideMinutes,
    ratio: availableMinutes > 0 ? busyMinutes / availableMinutes : 0,
  };
}

/**
 * Somma di più istruttori. Il rapporto si rifà sui totali, non è la media dei
 * rapporti: un istruttore con due ore dichiarate non deve pesare come uno che
 * ne ha quaranta.
 */
export function sumOccupancy(entries: AgendaOccupancy[]): AgendaOccupancy {
  const totals = entries.reduce(
    (acc, entry) => ({
      declaredMinutes: acc.declaredMinutes + entry.declaredMinutes,
      availableMinutes: acc.availableMinutes + entry.availableMinutes,
      busyMinutes: acc.busyMinutes + entry.busyMinutes,
      outsideMinutes: acc.outsideMinutes + entry.outsideMinutes,
    }),
    { declaredMinutes: 0, availableMinutes: 0, busyMinutes: 0, outsideMinutes: 0 },
  );
  return {
    ...totals,
    ratio: totals.availableMinutes > 0 ? totals.busyMinutes / totals.availableMinutes : 0,
  };
}
