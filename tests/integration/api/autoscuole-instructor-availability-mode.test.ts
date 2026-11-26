/**
 * REG-794 B1: `GET|PATCH /api/autoscuole/instructors/[id]/availability-mode`.
 * Il titolare legge e cambia la modalità di disponibilità di un istruttore
 * della sua autoscuola toccando SOLO `settings.availabilityMode`: gli altri
 * campi, anche quelli che il parser non conosce, restano com'erano.
 */

const I_MARCO = "00000000-0000-4000-8000-000000000002";

const membership = {
  companyId: "c1",
  userId: "u1",
  role: "admin",
  autoscuolaRole: "OWNER" as string,
};
let storedSettings: unknown;
const updates: Array<Record<string, unknown>> = [];
const instructorWhere: Array<Record<string, unknown>> = [];

jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e) }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: { AGENDA: "agenda" },
  invalidateAutoscuoleCache: jest.fn(),
}));
jest.mock("@/db/prisma", () => ({
  prisma: {
    autoscuolaInstructor: {
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        instructorWhere.push(args.where);
        return args.where.id === I_MARCO && args.where.companyId === "c1"
          ? { id: I_MARCO, settings: storedSettings }
          : null;
      }),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return args.data;
      }),
    },
  },
}));

import { GET, PATCH } from "@/app/api/autoscuole/instructors/[id]/availability-mode/route";
import { invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";

const ctx = (id = I_MARCO) => ({ params: Promise.resolve({ id }) });
const url = (id = I_MARCO) => `https://reglo.test/api/autoscuole/instructors/${id}/availability-mode`;
const get = (id?: string) => GET(new Request(url(id)), ctx(id));
const patch = (body: unknown, id?: string) =>
  PATCH(new Request(url(id), { method: "PATCH", body: JSON.stringify(body) }), ctx(id));

beforeEach(() => {
  updates.length = 0;
  instructorWhere.length = 0;
  jest.mocked(invalidateAutoscuoleCache).mockClear();
  membership.companyId = "c1";
  membership.role = "admin";
  membership.autoscuolaRole = "OWNER";
  storedSettings = {
    roundedHoursOnly: true,
    weeklyLessonLimitMinutes: 240,
    campoCheIlParserNonConosce: { a: 1 },
  };
});

describe("REG-794 B1 modalità di disponibilità di un istruttore", () => {
  it("il titolare la legge: senza chiave è «Predefinita»", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ instructorId: I_MARCO, availabilityMode: "default" });
  });

  it("il titolare la passa a «A pubblicazione» senza perdere gli altri campi", async () => {
    const res = await patch({ availabilityMode: "publication" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ instructorId: I_MARCO, availabilityMode: "publication" });
    expect(updates[0].settings).toEqual({
      roundedHoursOnly: true,
      weeklyLessonLimitMinutes: 240,
      campoCheIlParserNonConosce: { a: 1 },
      availabilityMode: "publication",
    });
    expect(invalidateAutoscuoleCache).toHaveBeenCalledWith({ companyId: "c1", segments: ["agenda"] });
  });

  it("dopo il cambio la lettura la restituisce", async () => {
    storedSettings = { availabilityMode: "publication" };
    expect((await (await get()).json()).data.availabilityMode).toBe("publication");
  });

  it("anche con settings vuoto la scrittura crea solo la chiave", async () => {
    storedSettings = null;
    await patch({ availabilityMode: "default" });
    expect(updates[0].settings).toEqual({ availabilityMode: "default" });
  });

  it("anche l'istruttore titolare", async () => {
    membership.autoscuolaRole = "INSTRUCTOR_OWNER";
    expect((await patch({ availabilityMode: "publication" })).status).toBe(200);
  });

  it("istruttore e allievo no, né in lettura né in scrittura", async () => {
    membership.role = "member";
    for (const role of ["INSTRUCTOR", "STUDENT"]) {
      membership.autoscuolaRole = role;
      expect((await get()).status).toBe(403);
      expect((await patch({ availabilityMode: "publication" })).status).toBe(403);
    }
    expect(updates).toHaveLength(0);
  });

  it("istruttore di un'altra autoscuola: 404, niente scrittura", async () => {
    membership.companyId = "c2";
    expect((await patch({ availabilityMode: "publication" })).status).toBe(404);
    expect(instructorWhere[0]).toMatchObject({ id: I_MARCO, companyId: "c2" });
    expect(updates).toHaveLength(0);
    expect(invalidateAutoscuoleCache).not.toHaveBeenCalled();
  });

  it("valore non valido: 400", async () => {
    expect((await patch({ availabilityMode: "settimanale" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});
