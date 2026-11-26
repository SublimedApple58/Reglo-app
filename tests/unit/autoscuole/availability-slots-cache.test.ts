/**
 * REG-794 B2: `availability/slots` (POST `createAvailabilitySlots`, DELETE
 * `deleteAvailabilitySlots`) è il salvataggio della settimana tipo dall'app.
 * Non invalidava la cache dell'agenda, quindi il web mostrava le fasce vecchie
 * fino alla scadenza; ora invalida il segmento AGENDA come il salvataggio web
 * (`setAutoscuolaInstructorWeeklyAvailability`). Un rifiuto non tocca niente.
 */

const I_MARCO = "00000000-0000-4000-8000-000000000002";

const membership = { companyId: "c1", userId: "u1", role: "admin", autoscuolaRole: "OWNER" };
let denied: string | null = null;
const writes: string[] = [];

jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e), cn: () => "" }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: { AGENDA: "agenda", PAYMENTS: "payments" },
  invalidateAutoscuoleCache: jest.fn(),
}));
jest.mock("@/lib/autoscuole/availability-access", () => ({
  AVAILABILITY_WRITE_FORBIDDEN: "Non puoi modificare questa disponibilità.",
  assertCanWriteAvailability: jest.fn(async () => denied),
  canApproveAvailabilityOverride: jest.fn(() => true),
}));

// Ogni modello risponde «niente»; le scritture sulla settimana tipo si contano.
const mockModel = (name: string) =>
  new Proxy(
    {},
    {
      get: (_t, op: string) =>
        jest.fn(async () => {
          if (["upsert", "create", "update", "deleteMany", "updateMany"].includes(op)) writes.push(`${name}.${op}`);
          if (op === "deleteMany" || op === "updateMany") return { count: 0 };
          if (op === "findMany") return [];
          return op === "upsert" ? { id: "w1" } : null;
        }),
    },
  );
jest.mock("@/db/prisma", () => {
  const models: Record<string, unknown> = {};
  return {
    prisma: new Proxy(models, {
      get: (target, key: string) => target[key] ?? (target[key] = mockModel(key)),
    }),
  };
});

import { createAvailabilitySlots, deleteAvailabilitySlots } from "@/lib/actions/autoscuole-availability.actions";
import { invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";

const slot = {
  ownerType: "instructor" as const,
  ownerId: I_MARCO,
  startsAt: "2026-11-30T08:00:00.000Z",
  endsAt: "2026-11-30T12:00:00.000Z",
  daysOfWeek: [1, 2, 3],
};

beforeEach(() => {
  denied = null;
  writes.length = 0;
  jest.mocked(invalidateAutoscuoleCache).mockClear();
});

describe("REG-794 B2 slot della settimana tipo: cache dell'agenda", () => {
  it("salvare le fasce dall'app invalida l'agenda dell'autoscuola", async () => {
    const res = await createAvailabilitySlots(slot);
    expect(res).toMatchObject({ success: true });
    expect(writes).toContain("autoscuolaWeeklyAvailability.upsert");
    expect(invalidateAutoscuoleCache).toHaveBeenCalledWith({ companyId: "c1", segments: ["agenda"] });
  });

  it("anche cancellarle", async () => {
    const res = await deleteAvailabilitySlots(slot);
    expect(res).toMatchObject({ success: true });
    expect(invalidateAutoscuoleCache).toHaveBeenCalledWith({ companyId: "c1", segments: ["agenda"] });
  });

  it("un rifiuto non scrive e non invalida", async () => {
    denied = "Non puoi modificare questa disponibilità.";
    expect((await createAvailabilitySlots(slot)).success).toBe(false);
    expect((await deleteAvailabilitySlots(slot)).success).toBe(false);
    expect(writes).toHaveLength(0);
    expect(invalidateAutoscuoleCache).not.toHaveBeenCalled();
  });
});
