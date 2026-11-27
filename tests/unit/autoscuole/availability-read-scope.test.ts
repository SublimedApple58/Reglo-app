/**
 * REG-802 — guardia di lettura su `availability/default` e `availability/slots`:
 * l'allievo legge solo le sue disponibilità, lo staff tutte (nella sua autoscuola).
 * Prima bastava `requireServiceAccess`: un allievo leggeva le preferenze orarie
 * di qualunque altro allievo.
 */

const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

let membership: Record<string, unknown> = {};
const reads: string[] = [];

jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e), cn: () => "" }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/db/prisma", () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) =>
          jest.fn(async () => {
            reads.push(`${name}.${op}`);
            if (op === "findMany") return [];
            if (op === "findFirst" && name === "autoscuolaWeeklyAvailability") {
              return {
                daysOfWeek: [2],
                startMinutes: 18 * 60,
                endMinutes: 21 * 60,
                ranges: [{ startMinutes: 18 * 60, endMinutes: 21 * 60 }],
                rangesByDay: { "2": [{ startMinutes: 18 * 60, endMinutes: 21 * 60 }] },
              };
            }
            return null;
          }),
      },
    );
  const cache: Record<string, unknown> = {};
  return { prisma: new Proxy(cache, { get: (t, k: string) => t[k] ?? (t[k] = model(k)) }) };
});

import { getAvailabilitySlots, getDefaultAvailability } from "@/lib/actions/autoscuole-availability.actions";

const student = { companyId: "c1", userId: ME, role: "member", autoscuolaRole: "STUDENT" };
const instructor = { companyId: "c1", userId: "u-i", role: "member", autoscuolaRole: "INSTRUCTOR" };

beforeEach(() => {
  reads.length = 0;
});

describe("getDefaultAvailability", () => {
  it("allievo: le sue sì, con le fasce per giorno", async () => {
    membership = student;
    const res = await getDefaultAvailability({ ownerType: "student", ownerId: ME });
    expect(res.success).toBe(true);
    expect(res.data?.scheduleByDay).toEqual({ 2: [{ startMinutes: 1080, endMinutes: 1260 }] });
  });

  it("allievo: quelle di un altro allievo no, e il DB non viene letto", async () => {
    membership = student;
    const res = await getDefaultAvailability({ ownerType: "student", ownerId: OTHER });
    expect(res).toEqual({ success: false, message: "Non puoi vedere questa disponibilità." });
    expect(reads).toEqual([]);
  });

  it("istruttore: le disponibilità di un allievo sì", async () => {
    membership = instructor;
    const res = await getDefaultAvailability({ ownerType: "student", ownerId: OTHER });
    expect(res.success).toBe(true);
  });
});

describe("getAvailabilitySlots", () => {
  it("allievo senza ownerType (prima riceveva le fasce di tutti): no", async () => {
    membership = student;
    const res = await getAvailabilitySlots({ date: "2026-12-01" });
    expect(res).toEqual({ success: false, message: "Non puoi vedere questa disponibilità." });
    expect(reads).toEqual([]);
  });

  it("allievo: le proprie sì", async () => {
    membership = student;
    const res = await getAvailabilitySlots({ ownerType: "student", ownerId: ME, date: "2026-12-01" });
    expect(res.success).toBe(true);
  });
});
