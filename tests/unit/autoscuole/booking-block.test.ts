import fs from "fs";
import path from "path";

import {
  blockUntilDateToInstant,
  blockUntilInstantToDateLabel,
  bookingBlockStops,
  isBookingBlockActive,
  isBookingBlockExpired,
} from "@/lib/autoscuole/booking-block";

/**
 * Blocco prenotazioni a tempo (REG-442). La parte delicata è la conversione
 * "ultimo giorno bloccato" → istante: il giorno scelto deve restare bloccato
 * per intero, e la mezzanotte va presa in ora di Roma (ora legale compresa).
 */
describe("blockUntilDateToInstant", () => {
  it("punta alla mezzanotte di Roma del giorno DOPO quello scelto (ora legale)", () => {
    // 20 giugno 2026 è CEST (UTC+2) → 00:00 del 21/06 a Roma = 22:00 UTC del 20.
    const instant = blockUntilDateToInstant("2026-06-20");
    expect(instant?.toISOString()).toBe("2026-06-20T22:00:00.000Z");
  });

  it("gestisce l'ora solare (UTC+1)", () => {
    // 20 gennaio 2026 è CET (UTC+1) → 00:00 del 21/01 a Roma = 23:00 UTC del 20.
    const instant = blockUntilDateToInstant("2026-01-20");
    expect(instant?.toISOString()).toBe("2026-01-20T23:00:00.000Z");
  });

  it("gestisce l'ultimo giorno del mese e dell'anno", () => {
    expect(blockUntilDateToInstant("2026-01-31")?.toISOString()).toBe(
      "2026-01-31T23:00:00.000Z",
    );
    expect(blockUntilDateToInstant("2026-12-31")?.toISOString()).toBe(
      "2026-12-31T23:00:00.000Z",
    );
  });

  it("rifiuta i formati non YYYY-MM-DD", () => {
    expect(blockUntilDateToInstant("20/06/2026")).toBeNull();
    expect(blockUntilDateToInstant("")).toBeNull();
    expect(blockUntilDateToInstant("2026-6-2")).toBeNull();
  });
});

describe("blockUntilInstantToDateLabel", () => {
  it("torna al giorno scelto dal titolare, non a quello dopo", () => {
    const instant = blockUntilDateToInstant("2026-06-20")!;
    expect(blockUntilInstantToDateLabel(instant)).toBe("20 giugno 2026");
    expect(blockUntilInstantToDateLabel(instant, { short: true })).toBe("20 giu");
  });

  it("accetta anche la stringa ISO che arriva dal server", () => {
    const iso = blockUntilDateToInstant("2026-01-31")!.toISOString();
    expect(blockUntilInstantToDateLabel(iso)).toBe("31 gennaio 2026");
  });

  it("è null quando non c'è scadenza", () => {
    expect(blockUntilInstantToDateLabel(null)).toBeNull();
    expect(blockUntilInstantToDateLabel(undefined)).toBeNull();
  });
});

describe("isBookingBlockActive / isBookingBlockExpired", () => {
  const now = new Date("2026-06-20T10:00:00.000Z");

  it("allievo non bloccato: mai attivo, mai scaduto", () => {
    const state = { bookingBlocked: false, bookingBlockUntil: null };
    expect(isBookingBlockActive(state, now)).toBe(false);
    expect(isBookingBlockExpired(state, now)).toBe(false);
  });

  it("blocco indefinito: sempre attivo, mai scaduto", () => {
    const state = { bookingBlocked: true, bookingBlockUntil: null };
    expect(isBookingBlockActive(state, now)).toBe(true);
    expect(isBookingBlockExpired(state, now)).toBe(false);
  });

  it("blocco a tempo non ancora scaduto: attivo", () => {
    const state = {
      bookingBlocked: true,
      bookingBlockUntil: new Date("2026-06-20T22:00:00.000Z"),
    };
    expect(isBookingBlockActive(state, now)).toBe(true);
    expect(isBookingBlockExpired(state, now)).toBe(false);
  });

  it("l'ultimo giorno scelto resta bloccato fino a sera", () => {
    const until = blockUntilDateToInstant("2026-06-20")!;
    // 23:30 di Roma dell'ultimo giorno = 21:30 UTC: ancora bloccato.
    expect(
      isBookingBlockActive(
        { bookingBlocked: true, bookingBlockUntil: until },
        new Date("2026-06-20T21:30:00.000Z"),
      ),
    ).toBe(true);
    // 00:30 di Roma del giorno dopo = 22:30 UTC: libero.
    expect(
      isBookingBlockActive(
        { bookingBlocked: true, bookingBlockUntil: until },
        new Date("2026-06-20T22:30:00.000Z"),
      ),
    ).toBe(false);
  });

  it("blocco a tempo scaduto: non attivo e da ripulire", () => {
    const state = {
      bookingBlocked: true,
      bookingBlockUntil: new Date("2026-06-19T22:00:00.000Z"),
    };
    expect(isBookingBlockActive(state, now)).toBe(false);
    expect(isBookingBlockExpired(state, now)).toBe(true);
  });

  it("accetta la scadenza come stringa ISO (payload serializzato)", () => {
    expect(
      isBookingBlockActive(
        { bookingBlocked: true, bookingBlockUntil: "2026-06-19T22:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("una scadenza illeggibile non sblocca nessuno", () => {
    const state = { bookingBlocked: true, bookingBlockUntil: "non-una-data" };
    expect(isBookingBlockActive(state, now)).toBe(true);
    expect(isBookingBlockExpired(state, now)).toBe(false);
  });
});

/**
 * Chi ferma il blocco (REG-499). È una regola di prodotto, non tecnica: il
 * titolare blocca l'allievo per togliergli il self-service, non per impedire
 * all'autoscuola di metterlo in agenda. Fino al 19/09/2026 l'istruttore veniva
 * fermato come l'allievo.
 */
describe("bookingBlockStops", () => {
  it("ferma l'allievo che si prenota da solo", () => {
    expect(bookingBlockStops("student")).toBe(true);
  });

  it("NON ferma l'istruttore che prenota per l'allievo", () => {
    expect(bookingBlockStops("instructor")).toBe(false);
  });

  it("NON ferma titolare/segreteria", () => {
    expect(bookingBlockStops("staff")).toBe(false);
  });
});

/**
 * Guardia sulle due porte d'ingresso staff della prenotazione: una svista qui
 * rimette l'istruttore dentro il blocco senza che nessun test puro se ne accorga
 * (la regola è giusta, è il punto di enforcement che sbaglia a usarla).
 */
describe("enforcement del blocco nelle action di prenotazione", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "lib/actions/autoscuole.actions.ts"),
    "utf8",
  );

  /** Corpo di una `export async function` fino alla export successiva. */
  const bodyOf = (name: string): string => {
    const start = source.indexOf(`export async function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  };

  it("createAutoscuolaAppointment rifiuta solo passando da bookingBlockStops", () => {
    const body = bodyOf("createAutoscuolaAppointment");
    expect(body).toContain("getStudentBookingBlockStatus(");
    expect(body).toContain("bookingBlockStops(bookingInitiator)");
    // Il rifiuto non deve più dipendere dal ruolo letto a mano.
    expect(body).not.toMatch(/studentBlocked[\s\S]{0,80}isInstructorActor/);
  });

  it("createAutoscuolaAppointmentBatch (solo staff) non guarda affatto il blocco", () => {
    const body = bodyOf("createAutoscuolaAppointmentBatch");
    expect(body).not.toContain("getStudentBookingBlockStatus(");
  });
});
