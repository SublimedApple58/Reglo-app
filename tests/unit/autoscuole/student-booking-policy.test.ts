import {
  buildStudentBookingPolicy,
  canStudentUseBookingChannel,
  LEGACY_INSTRUCTORS_EXCEPTIONS,
  parseStudentBookingExceptions,
  parseStudentBookingExceptionsByPath,
  resolveStudentBookingExceptionsForBucket,
  resolveStudentBookingHold,
  resolveStudentBookingMode,
  STUDENT_BOOKING_EXCEPTIONS_OFF,
  studentFreeBookingUntil,
  type StudentBookingChannel,
  type StudentBookingExceptions,
} from "@/lib/autoscuole/student-booking-policy";

/**
 * Prenotazione allievi «solo eccezioni»: matrice modalità × canale × blocco.
 * È l'unica regola usata sia per scegliere i destinatari delle notifiche sia
 * per accettare: se questa matrice è giusta, notifica e prenotazione restano
 * coerenti.
 */
const ex = (patch: Partial<StudentBookingExceptions>): StudentBookingExceptions => ({
  ...STUDENT_BOOKING_EXCEPTIONS_OFF,
  enabled: true,
  ...patch,
});

const CHANNELS: StudentBookingChannel[] = ["free", "slot_fill", "group_seat", "swap"];

const allowedChannels = (policy: ReturnType<typeof buildStudentBookingPolicy>) =>
  CHANNELS.filter((c) => canStudentUseBookingChannel(policy, c));

describe("resolveStudentBookingMode", () => {
  it("students e both sono sempre «attiva», qualunque eccezione", () => {
    expect(resolveStudentBookingMode("students", STUDENT_BOOKING_EXCEPTIONS_OFF)).toBe("open");
    expect(resolveStudentBookingMode("both", ex({ slotFill: true }))).toBe("open");
  });

  it("instructors + eccezioni accese = «solo eccezioni»", () => {
    expect(resolveStudentBookingMode("instructors", ex({ slotFill: true }))).toBe("exceptions");
  });

  it("instructors + interruttore spento o nessuna eccezione = «disattiva»", () => {
    expect(resolveStudentBookingMode("instructors", { ...ex({ slotFill: true }), enabled: false })).toBe("closed");
    expect(resolveStudentBookingMode("instructors", ex({}))).toBe("closed");
  });
});

describe("canStudentUseBookingChannel — matrice", () => {
  it("attiva: tutti i canali", () => {
    const policy = buildStudentBookingPolicy({ appBookingActors: "students", exceptions: STUDENT_BOOKING_EXCEPTIONS_OFF });
    expect(allowedChannels(policy)).toEqual(CHANNELS);
  });

  it("disattiva: solo gli scambi (li governa swapEnabled)", () => {
    const policy = buildStudentBookingPolicy({ appBookingActors: "instructors", exceptions: STUDENT_BOOKING_EXCEPTIONS_OFF });
    expect(policy.mode).toBe("closed");
    expect(allowedChannels(policy)).toEqual(["swap"]);
  });

  it.each([
    [{ slotFill: true }, ["slot_fill", "swap"]],
    [{ groupSeats: true }, ["group_seat", "swap"]],
    [{ lastMinute: true }, ["free", "swap"]],
    [{ slotFill: true, groupSeats: true, lastMinute: true }, ["free", "slot_fill", "group_seat", "swap"]],
  ] as const)("solo eccezioni %o → %o", (patch, expected) => {
    const policy = buildStudentBookingPolicy({ appBookingActors: "instructors", exceptions: ex(patch) });
    expect(allowedChannels(policy)).toEqual(expected);
  });

  it.each(["blocked", "awaiting", "theory", "license_missing"] as const)(
    "allievo fermo (%s): nessun canale, in qualunque modalità",
    (hold) => {
      for (const actors of ["students", "both", "instructors"] as const) {
        const policy = buildStudentBookingPolicy({
          appBookingActors: actors,
          exceptions: ex({ slotFill: true, groupSeats: true, lastMinute: true }),
          hold,
        });
        expect(allowedChannels(policy)).toEqual([]);
      }
    },
  );

  it("fuori da «solo eccezioni» le eccezioni non contano (ma le ore restano per la UI)", () => {
    const policy = buildStudentBookingPolicy({
      appBookingActors: "students",
      exceptions: ex({ slotFill: true, lastMinute: true, lastMinuteHours: 6 }),
    });
    expect(policy.exceptions.slotFill).toBe(false);
    expect(policy.exceptions.lastMinuteHours).toBe(6);
  });
});

describe("studentFreeBookingUntil — ultimo minuto", () => {
  const now = new Date("2026-11-10T10:00:00Z");

  it("attiva: nessuna finestra", () => {
    const policy = buildStudentBookingPolicy({ appBookingActors: "both", exceptions: ex({ lastMinute: true }) });
    expect(studentFreeBookingUntil(policy, now)).toBeNull();
  });

  it("solo eccezioni: adesso + ore configurate", () => {
    const policy = buildStudentBookingPolicy({
      appBookingActors: "instructors",
      exceptions: ex({ lastMinute: true, lastMinuteHours: 36 }),
    });
    expect(studentFreeBookingUntil(policy, now)?.toISOString()).toBe("2026-11-11T22:00:00.000Z");
  });
});

describe("resolveStudentBookingHold", () => {
  it("il blocco vince sulla fase", () => {
    expect(resolveStudentBookingHold({ blocked: true, studentPhase: "TEORIA" })).toBe("blocked");
  });
  it("fasi e percorso mancante", () => {
    expect(resolveStudentBookingHold({ blocked: false, studentPhase: "AWAITING" })).toBe("awaiting");
    expect(resolveStudentBookingHold({ blocked: false, studentPhase: "TEORIA" })).toBe("theory");
    expect(resolveStudentBookingHold({ blocked: false, studentPhase: "PRATICA", selfRegistered: true, licenseCategory: null })).toBe("license_missing");
    expect(resolveStudentBookingHold({ blocked: false, studentPhase: "PRATICA", selfRegistered: true, licenseCategory: "B" })).toBeNull();
  });
});

describe("parse e cascata", () => {
  it("assente = undefined (eredita); ore limitate a 1…168", () => {
    expect(parseStudentBookingExceptions(undefined)).toBeUndefined();
    expect(parseStudentBookingExceptions([])).toBeUndefined();
    expect(parseStudentBookingExceptions({ enabled: true, lastMinuteHours: 999 })?.lastMinuteHours).toBe(168);
    expect(parseStudentBookingExceptions({ lastMinuteHours: 0 })?.lastMinuteHours).toBe(1);
    expect(parseStudentBookingExceptions({ lastMinuteHours: "x" })?.lastMinuteHours).toBe(24);
  });

  it("per percorso: solo bucket noti", () => {
    const parsed = parseStudentBookingExceptionsByPath({ moto: { enabled: true, slotFill: true }, camion: { enabled: true } });
    expect(Object.keys(parsed)).toEqual(["moto"]);
  });

  it("niente salvato da nessuna parte = valore storico (scelta in sospeso, una costante)", () => {
    expect(resolveStudentBookingExceptionsForBucket({ bucket: "auto" })).toBe(LEGACY_INSTRUCTORS_EXCEPTIONS);
  });

  it("gruppo per percorso → gruppo → autoscuola per percorso → autoscuola", () => {
    const a = ex({ slotFill: true });
    const b = ex({ groupSeats: true });
    const c = ex({ lastMinute: true });
    const d = { ...STUDENT_BOOKING_EXCEPTIONS_OFF };
    expect(resolveStudentBookingExceptionsForBucket({ bucket: "moto", clusterByPath: { moto: a }, clusterDefault: b, companyByPath: { moto: c }, companyDefault: d })).toBe(a);
    expect(resolveStudentBookingExceptionsForBucket({ bucket: "auto", clusterByPath: { moto: a }, clusterDefault: b, companyByPath: { auto: c }, companyDefault: d })).toBe(b);
    expect(resolveStudentBookingExceptionsForBucket({ bucket: "auto", companyByPath: { auto: c }, companyDefault: d })).toBe(c);
    expect(resolveStudentBookingExceptionsForBucket({ bucket: "pro", companyByPath: { auto: c }, companyDefault: d })).toBe(d);
  });
});
