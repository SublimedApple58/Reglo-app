/**
 * `studentBookingPolicyForMember`: la policy calcolata dalla riga del membro.
 * È la funzione usata dai broadcast (slot liberato, guide di gruppo, scambi,
 * nuove disponibilità) e dal job dei posti vuoti per scegliere i destinatari:
 * se sbaglia, la notifica arriva a chi non può prenotare (o non arriva a chi può).
 */
jest.mock("@/db/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/autoscuole/cached-service", () => ({ getCachedCompanyServiceLimits: jest.fn() }));

import { buildCompanyBookingDefaults } from "@/lib/autoscuole/instructor-clusters";
import {
  studentBookingPolicyForMember,
  type StudentBookingPolicyMemberRow,
} from "@/lib/autoscuole/student-booking-policy-loader";
import { canStudentUseBookingChannel } from "@/lib/autoscuole/student-booking-policy";

const NOW = new Date("2026-11-10T10:00:00Z");

const exceptions = (patch: Record<string, unknown> = {}) => ({
  enabled: true,
  slotFill: false,
  groupSeats: false,
  lastMinute: false,
  lastMinuteHours: 24,
  ...patch,
});

const member = (patch: Partial<StudentBookingPolicyMemberRow> = {}): StudentBookingPolicyMemberRow => ({
  licenseCategory: "B",
  bookingBlocked: false,
  bookingBlockUntil: null,
  studentPhase: "PRATICA",
  selfRegistered: false,
  assignedInstructor: null,
  ...patch,
});

const cluster = (settings: Record<string, unknown>, patch: Record<string, unknown> = {}) => ({
  autonomousMode: true,
  status: "active",
  settings,
  ...patch,
});

describe("studentBookingPolicyForMember", () => {
  it("autoscuola «Attiva» senza gruppo: prenotazione libera", () => {
    const defaults = buildCompanyBookingDefaults({ appBookingActors: "students" });
    const p = studentBookingPolicyForMember(defaults, member(), NOW);
    expect(p.mode).toBe("open");
    expect(canStudentUseBookingChannel(p, "free")).toBe(true);
  });

  it("autoscuola su «Solo istruttori» che non ha mai salvato le eccezioni: «Disattiva»", () => {
    const defaults = buildCompanyBookingDefaults({ appBookingActors: "instructors" });
    const p = studentBookingPolicyForMember(defaults, member(), NOW);
    expect(p.mode).toBe("closed");
    expect(canStudentUseBookingChannel(p, "slot_fill")).toBe(false);
  });

  it("eccezioni diverse per percorso: la moto prende le sue, l'auto quelle di default", () => {
    const defaults = buildCompanyBookingDefaults({
      appBookingActors: "instructors",
      studentBookingExceptions: exceptions({ slotFill: true }),
      studentBookingExceptionsByPath: { moto: exceptions({ groupSeats: true }) },
    });
    const moto = studentBookingPolicyForMember(defaults, member({ licenseCategory: "A2" }), NOW);
    const auto = studentBookingPolicyForMember(defaults, member({ licenseCategory: "B" }), NOW);
    expect(canStudentUseBookingChannel(moto, "group_seat")).toBe(true);
    expect(canStudentUseBookingChannel(moto, "slot_fill")).toBe(false);
    expect(canStudentUseBookingChannel(auto, "slot_fill")).toBe(true);
    expect(canStudentUseBookingChannel(auto, "group_seat")).toBe(false);
  });

  it("gruppo autonomo attivo: vince sull'autoscuola (modalità ed eccezioni)", () => {
    const defaults = buildCompanyBookingDefaults({ appBookingActors: "students" });
    const p = studentBookingPolicyForMember(
      defaults,
      member({
        assignedInstructor: cluster({
          appBookingActors: "instructors",
          studentBookingExceptions: exceptions({ lastMinute: true, lastMinuteHours: 12 }),
        }),
      }),
      NOW,
    );
    expect(p.mode).toBe("exceptions");
    expect(p.exceptions.lastMinuteHours).toBe(12);
    expect(canStudentUseBookingChannel(p, "free")).toBe(true);
    expect(canStudentUseBookingChannel(p, "slot_fill")).toBe(false);
  });

  it("gruppo che non salva eccezioni proprie eredita quelle dell'autoscuola", () => {
    const defaults = buildCompanyBookingDefaults({
      appBookingActors: "students",
      studentBookingExceptions: exceptions({ slotFill: true }),
    });
    const p = studentBookingPolicyForMember(
      defaults,
      member({ assignedInstructor: cluster({ appBookingActors: "instructors" }) }),
      NOW,
    );
    expect(p.mode).toBe("exceptions");
    expect(canStudentUseBookingChannel(p, "slot_fill")).toBe(true);
  });

  it.each([
    ["istruttore non autonomo", { autonomousMode: false }],
    ["istruttore disattivato", { status: "inactive" }],
  ])("%s: il gruppo non conta, vale l'autoscuola", (_label, patch) => {
    const defaults = buildCompanyBookingDefaults({ appBookingActors: "students" });
    const p = studentBookingPolicyForMember(
      defaults,
      member({ assignedInstructor: cluster({ appBookingActors: "instructors" }, patch) }),
      NOW,
    );
    expect(p.mode).toBe("open");
  });

  it("blocco a tempo scaduto non ferma più; blocco attivo ferma tutto", () => {
    const defaults = buildCompanyBookingDefaults({ appBookingActors: "students" });
    const expired = studentBookingPolicyForMember(
      defaults,
      member({ bookingBlocked: true, bookingBlockUntil: new Date("2026-11-09T00:00:00Z") }),
      NOW,
    );
    const active = studentBookingPolicyForMember(defaults, member({ bookingBlocked: true }), NOW);
    expect(expired.hold).toBeNull();
    expect(active.hold).toBe("blocked");
    expect(canStudentUseBookingChannel(active, "swap")).toBe(false);
  });

  it("allievo in teoria: nessun canale, anche con prenotazione aperta", () => {
    const defaults = buildCompanyBookingDefaults({ appBookingActors: "students" });
    const p = studentBookingPolicyForMember(defaults, member({ studentPhase: "TEORIA" }), NOW);
    expect(p.hold).toBe("theory");
    expect(canStudentUseBookingChannel(p, "free")).toBe(false);
  });
});
