/**
 * Blocco prenotazioni a tempo (REG-442).
 *
 * Il blocco manuale del titolare può ora avere una **scadenza**:
 * `CompanyMember.bookingBlockUntil` = istante oltre il quale il blocco decade da
 * solo. Null = blocco indefinito (il comportamento storico) oppure nessun blocco.
 *
 * La scadenza vale SOLO per i blocchi manuali (`bookingBlockReason="manual"`):
 * l'auto-block per debito (`"unpaid_threshold"`, vedi `unpaid-auto-block.ts`) si
 * rilascia da sé quando il debito scende e non usa date.
 *
 * Due meccanismi, volutamente ridondanti:
 *  1. **Lettura** — ogni punto che decide "questo allievo può prenotare?" usa il
 *     predicato puro `isBookingBlockActive`, che tiene conto della scadenza
 *     anche se la riga non è ancora stata ripulita. Costo: zero query.
 *  2. **Scrittura** — `releaseExpiredManualBlocks` ripulisce davvero le righe
 *     scadute (pill "Bloccato" che sparisce, campo coerente per chi legge il
 *     booleano grezzo). Chiamata dalla lista allievi del titolare e una volta a
 *     notte dal cron `autoscuole-booking-block-expiry`.
 *
 * Nota sul watermark: la scadenza NON registra `unpaidBlockClearedAtCount` (che
 * lo sblocco manuale invece imposta). Uno sblocco manuale è una decisione sul
 * singolo allievo ("per me può prenotare"), la scadenza no: quando il blocco a
 * tempo finisce, l'automatismo per debito torna ad avere l'ultima parola.
 */

export const AUTOSCUOLA_TIMEZONE = "Europe/Rome";

export type BookingBlockState = {
  bookingBlocked: boolean;
  bookingBlockUntil?: Date | string | null;
};

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Predicato unico "le prenotazioni di questo allievo sono bloccate ADESSO".
 * Da usare al posto del booleano grezzo `bookingBlocked` in ogni enforcement,
 * così un blocco a tempo scaduto non blocca più nessuno anche prima che la riga
 * venga ripulita.
 */
export function isBookingBlockActive(
  state: BookingBlockState,
  now: Date = new Date(),
): boolean {
  if (!state.bookingBlocked) return false;
  const until = toDate(state.bookingBlockUntil);
  if (!until) return true; // blocco indefinito
  return until.getTime() > now.getTime();
}

/**
 * Chi ha fatto partire la prenotazione.
 *  - `student`    → l'allievo si prenota da solo dall'app (self-service)
 *  - `instructor` → l'istruttore prenota PER l'allievo (app istruttore o agenda web)
 *  - `staff`      → titolare / admin dal gestionale
 */
export type BookingInitiator = "student" | "instructor" | "staff";

/**
 * Il blocco prenotazioni ferma **solo** l'auto-prenotazione dell'allievo
 * (REG-499).
 *
 * "Blocca prenotazioni" è una leva che il titolare usa VERSO l'allievo (rate
 * non pagate, sospensione): gli toglie il self-service, non toglie
 * all'autoscuola la possibilità di metterlo in agenda. Anzi, il caso normale è
 * esattamente quello — l'allievo bloccato telefona e la segreteria o
 * l'istruttore gli fissano la guida a mano.
 *
 * Fino al 19/09/2026 l'istruttore veniva fermato come l'allievo, e con lo stesso
 * messaggio ("le TUE prenotazioni sono sospese") scritto per l'allievo. Il
 * titolare invece non è mai stato bloccato: questa funzione allinea l'istruttore
 * al titolare.
 */
export function bookingBlockStops(initiator: BookingInitiator): boolean {
  return initiator === "student";
}

/** True quando la riga porta un blocco a tempo ormai scaduto (da ripulire). */
export function isBookingBlockExpired(
  state: BookingBlockState,
  now: Date = new Date(),
): boolean {
  const until = toDate(state.bookingBlockUntil);
  return state.bookingBlocked && until != null && until.getTime() <= now.getTime();
}

/** Stato "post-scadenza": quello che va scritto quando il blocco a tempo decade. */
export const EXPIRED_BLOCK_PATCH = {
  bookingBlocked: false,
  bookingBlockReason: null,
  bookingBlockUntil: null,
} as const;

/**
 * Converte la data scelta dal titolare (YYYY-MM-DD, "bloccato fino al … incluso")
 * nell'istante di **fine di quella giornata** in Europe/Rome: il giorno scelto è
 * ancora bloccato per intero, la mezzanotte successiva no.
 *
 * Puro: nessun accesso al DB, testato in isolamento.
 */
export function blockUntilDateToInstant(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  // Mezzanotte del giorno DOPO quello scelto, in ora locale di Roma → l'istante
  // in cui il blocco smette di valere.
  const naiveUtcMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
  if (Number.isNaN(naiveUtcMs)) return null;
  // `naiveUtcMs` ignora l'offset: misura che ora è a Roma in quell'istante e
  // correggi della differenza (gestisce anche il cambio di ora legale).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(naiveUtcMs));
  const romeHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const romeMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const diffMinutes = -(romeHour * 60 + romeMinute);
  return new Date(naiveUtcMs + diffMinutes * 60000);
}

/**
 * Etichetta dell'ultimo giorno bloccato a partire dall'istante salvato: l'inverso
 * di `blockUntilDateToInstant` (che punta alla mezzanotte successiva), così la UI
 * mostra il giorno scelto dal titolare e non quello dopo.
 */
export function blockUntilInstantToDateLabel(
  value: Date | string | null | undefined,
  options?: { short?: boolean },
): string | null {
  const until = toDate(value);
  if (!until) return null;
  // −1 minuto: dalla mezzanotte di confine si torna dentro l'ultimo giorno bloccato.
  const lastMoment = new Date(until.getTime() - 60000);
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    day: "2-digit",
    month: options?.short ? "short" : "long",
    ...(options?.short ? {} : { year: "numeric" as const }),
  }).format(lastMoment);
}
