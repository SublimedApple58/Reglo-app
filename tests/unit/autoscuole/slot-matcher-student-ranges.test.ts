/**
 * REG-802 — `findBestAutoscuolaSlot` (proposta della prossima guida
 * all'istruttore) legge le fasce dell'allievo PER GIORNO.
 *
 * Prima usava `startMinutes/endMinutes` della riga, cioè solo la prima fascia
 * del giorno rappresentativo: con le fasce per giorno proponeva orari dove
 * l'allievo non c'è, e con mattina + pomeriggio non proponeva mai il pomeriggio.
 */

const STUDENT = "00000000-0000-4000-8000-0000000000aa";
const INSTRUCTOR = "i1";
const h = (hours: number) => hours * 60;

let studentRow: Record<string, unknown> | null = null;
let instructorBlocks: Array<{ instructorId: string; startsAt: Date; endsAt: Date }> = [];

const findFirstByModel: Record<string, () => unknown> = {
  autoscuolaWeeklyAvailability: () => studentRow,
  companyService: () => ({ limits: { vehiclesEnabled: false, bookingSlotDurations: [60] } }),
};
const findManyByModel: Record<string, () => unknown[]> = {
  autoscuolaInstructor: () => [{ id: INSTRUCTOR }],
  autoscuolaInstructorBlock: () => instructorBlocks,
};

jest.mock("@/db/prisma", () => {
  const model = (name: string) => ({
    findFirst: jest.fn(async () => findFirstByModel[name]?.() ?? null),
    findUnique: jest.fn(async () =>
      name === "companyMember" ? { licenseCategory: "B", transmission: "manual" } : null,
    ),
    findMany: jest.fn(async () => findManyByModel[name]?.() ?? []),
  });
  const cache: Record<string, unknown> = {};
  return {
    prisma: new Proxy(cache, { get: (t, k: string) => t[k] ?? (t[k] = model(k)) }),
  };
});

// L'istruttore è disponibile 7–21 tutti i giorni, pubblicato.
jest.mock("@/lib/actions/autoscuole-availability.actions", () => ({
  getPublicationModeFilter: jest.fn(async () => () => true),
  buildAvailabilityResolver: jest.fn(async () => ({
    resolve: (_ownerId: string, date: Date) => {
      const dow = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Rome" })).getDay();
      return { daysOfWeek: [dow], ranges: [{ startMinutes: 7 * 60, endMinutes: 21 * 60 }] };
    },
    hasOverride: () => false,
    defaultMap: new Map(),
  })),
}));
jest.mock("@/lib/autoscuole/location-booking", () => ({
  loadStudentLocationContext: jest.fn(async () => ({ scope: null, bufferMinutes: 0 })),
  scopeResolver: (resolver: unknown) => resolver,
  loadInstructorLocatedBusy: jest.fn(async () => new Map()),
  locationOfCoveringRange: () => null,
  passesLocationChangeBuffer: () => true,
}));
jest.mock("@/lib/autoscuole/group-lesson-busy", () => ({
  fetchGroupLessonBusyRows: jest.fn(async () => []),
  addGroupLessonBusyIntervals: jest.fn(),
}));

import { findBestAutoscuolaSlot } from "@/lib/autoscuole/slot-matcher";

const romeHHMM = (d: Date) =>
  d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const romeDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

const base = {
  companyId: "c1",
  studentId: STUDENT,
  durationMinutes: 60,
  now: new Date("2026-11-27T10:00:00Z"), // venerdì
};

beforeEach(() => {
  instructorBlocks = [];
});

describe("findBestAutoscuolaSlot — fasce dell'allievo per giorno (REG-802)", () => {
  // Lunedì mattina, martedì sera. Campi piatti = primo giorno attivo (lunedì
  // 8–13), come li scrive `createAvailabilitySlots` con `scheduleByDay`.
  const perDay = {
    daysOfWeek: [1, 2],
    startMinutes: h(8),
    endMinutes: h(13),
    startMinutes2: null,
    endMinutes2: null,
    ranges: [{ startMinutes: h(8), endMinutes: h(13) }],
    rangesByDay: {
      "1": [{ startMinutes: h(8), endMinutes: h(13) }],
      "2": [{ startMinutes: h(18), endMinutes: h(21) }],
    },
  };

  it("martedì propone la sera, non la mattina del lunedì applicata al martedì", async () => {
    studentRow = perDay;
    const res = await findBestAutoscuolaSlot({ ...base, preferredDate: "2026-12-01", maxDays: 0 });
    expect(res).not.toBeNull();
    expect(romeDate(res!.start)).toBe("2026-12-01");
    expect(Number(romeHHMM(res!.start).slice(0, 2))).toBeGreaterThanOrEqual(18);
    expect(Number(romeHHMM(res!.end).slice(0, 2))).toBeLessThanOrEqual(21);
  });

  it("salta i giorni senza fasce (mercoledì → nessuna proposta)", async () => {
    studentRow = perDay;
    const res = await findBestAutoscuolaSlot({ ...base, preferredDate: "2026-12-02", maxDays: 0 });
    expect(res).toBeNull();
  });

  it("riga legacy mattina + pomeriggio: con la mattina piena propone il pomeriggio", async () => {
    studentRow = {
      daysOfWeek: [2],
      startMinutes: h(8),
      endMinutes: h(13),
      startMinutes2: h(14),
      endMinutes2: h(19),
      ranges: [
        { startMinutes: h(8), endMinutes: h(13) },
        { startMinutes: h(14), endMinutes: h(19) },
      ],
      rangesByDay: null,
    };
    // Istruttore occupato tutta la mattina di martedì 1 dicembre (ora di Roma).
    instructorBlocks = [
      {
        instructorId: INSTRUCTOR,
        startsAt: new Date("2026-12-01T07:00:00Z"), // 08:00 Roma
        endsAt: new Date("2026-12-01T12:00:00Z"), // 13:00 Roma
      },
    ];
    const res = await findBestAutoscuolaSlot({ ...base, preferredDate: "2026-12-01", maxDays: 0 });
    expect(res).not.toBeNull();
    const startHour = Number(romeHHMM(res!.start).slice(0, 2));
    expect(startHour).toBeGreaterThanOrEqual(14);
    expect(startHour).toBeLessThan(19);
  });

  it("nessuna riga di disponibilità: nessuna proposta (comportamento invariato)", async () => {
    studentRow = null;
    const res = await findBestAutoscuolaSlot({ ...base, preferredDate: "2026-12-01", maxDays: 3 });
    expect(res).toBeNull();
  });
});
