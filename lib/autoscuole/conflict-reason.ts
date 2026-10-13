/**
 * Perché uno slot è occupato, detto con il NOME del mezzo (REG-609).
 *
 * Fino a oggi ogni conflitto diceva la stessa cosa — "istruttore o veicolo non
 * disponibile" — e chi prenotava non sapeva nemmeno se la colpa fosse
 * dell'istruttore, della moto o dell'auto al seguito. Da quando una guida
 * riserva più veicoli insieme (moto + moto aggiuntive + auto al seguito) quel
 * messaggio è diventato inservibile: nella prenotazione multipla il titolare
 * vedeva solo "conflitto", senza sapere che a bloccare tutto era un'auto al
 * seguito occupata da un collega (segnalazione Macchiavello, 12/10/2026).
 *
 * Modulo PURO: niente Prisma, niente I/O, niente date. Prende gli id già
 * raccolti dalle query e ne ricava la frase. Unit test in
 * `tests/unit/autoscuole/conflict-reason.test.ts`.
 */

/** Il ruolo con cui una guida tiene impegnato un veicolo. */
export type ReservedVehicleRole = "primary" | "extra_moto" | "follow";

export type ReservedVehicle = { id: string; role: ReservedVehicleRole };

/** Cosa ha bloccato lo slot. `inGroupLesson` = l'impegno è un container di guida di gruppo. */
export type ConflictReason =
  | { kind: "instructor"; inGroupLesson?: boolean }
  | { kind: "block" }
  | {
      kind: "vehicle";
      vehicleId: string;
      role: ReservedVehicleRole;
      inGroupLesson?: boolean;
    };

/**
 * Tutti i veicoli che una riga (appuntamento o container di gruppo) tiene
 * occupati: il principale più quelli della join / della flotta. Un'auto usata
 * come "al seguito" altrove occupa esattamente come un veicolo principale.
 */
export function busyVehicleIds(row: {
  vehicleId?: string | null;
  followVehicleId?: string | null;
  appointmentVehicles?: Array<{ vehicleId: string }> | null;
  fleetVehicles?: Array<{ vehicleId: string }> | null;
}): string[] {
  const ids = [
    row.vehicleId,
    row.followVehicleId,
    ...(row.appointmentVehicles ?? []).map((v) => v.vehicleId),
    ...(row.fleetVehicles ?? []).map((v) => v.vehicleId),
  ].filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids));
}

/**
 * Il primo veicolo riservato che risulta occupato, **nell'ordine in cui il
 * chiamante li ha elencati** (principale → moto aggiuntive → auto al seguito).
 * L'ordine conta: se sono occupati sia la moto sia l'auto al seguito, il
 * problema da raccontare è la moto, perché è quella che non si può sostituire.
 */
export function pickConflictingVehicle(
  reserved: readonly ReservedVehicle[],
  busy: readonly string[],
): ReservedVehicle | null {
  const busySet = new Set(busy);
  return reserved.find((v) => busySet.has(v.id)) ?? null;
}

const ROLE_SUBJECT: Record<ReservedVehicleRole, { noun: string; busy: string }> = {
  primary: { noun: "il veicolo", busy: "impegnato" },
  extra_moto: { noun: "la moto aggiuntiva", busy: "impegnata" },
  follow: { noun: "l'auto al seguito", busy: "impegnata" },
};

/**
 * La frase che spiega il conflitto, **senza maiuscola iniziale e senza punto**:
 * così si incastra sia da sola (passandola a `asSentence`) sia in coda a
 * "Conflitto per lo slot del 17/10 09:00: …" della prenotazione multipla.
 */
export function describeConflict(
  reason: ConflictReason,
  vehicleName?: string | null,
): string {
  if (reason.kind === "block") return "l'istruttore ha uno slot bloccato in quell'orario";
  if (reason.kind === "instructor") {
    return reason.inGroupLesson
      ? "l'istruttore è impegnato in una guida di gruppo"
      : "l'istruttore ha già un impegno in quell'orario";
  }
  const { noun, busy } = ROLE_SUBJECT[reason.role];
  // Senza nome (veicolo cancellato, o non caricato) la frase regge lo stesso:
  // meglio "l'auto al seguito è impegnata" che un messaggio generico.
  const subject = vehicleName ? `${noun} ${vehicleName}` : noun;
  return reason.inGroupLesson
    ? `${subject} è ${busy} in una guida di gruppo`
    : `${subject} è già ${busy} in quell'orario`;
}

/** Trasforma la frase in un messaggio a sé stante: maiuscola iniziale e punto. */
export function asSentence(clause: string): string {
  if (!clause) return clause;
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
}
