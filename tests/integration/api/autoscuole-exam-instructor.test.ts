/**
 * REG-795: l'esame creato dalla colonna di un istruttore (fantasma dell'agenda
 * «Tutti» dell'app titolare) deve salvare QUELL'istruttore, sia per il
 * titolare puro (ramo `createExamEvent`) sia per l'istruttore titolare (ramo
 * istruttore della rotta). Un istruttore fuori dall'autoscuola: 404.
 */

const I_MARCO = "00000000-0000-4000-8000-000000000002";
const I_LUCA = "00000000-0000-4000-8000-000000000003";
const S1 = "00000000-0000-4000-8000-000000000010";

const membership = {
  companyId: "c1",
  userId: "u1",
  role: "admin",
  autoscuolaRole: "OWNER" as string,
};

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: jest.fn() };
});
jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e) }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: { AGENDA: "agenda", PAYMENTS: "payments" },
  invalidateAutoscuoleCache: jest.fn(),
}));
jest.mock("@/lib/actions/autoscuole.actions", () => ({
  createExamEvent: jest.fn(async () => ({ success: true, data: { count: 1 } })),
  materializeExamSlot: jest.fn(async () => 1),
  notifyExamStudentsOnCreate: jest.fn(),
  updateExamTime: jest.fn(),
  updateExamInstructor: jest.fn(),
  updateExamDetails: jest.fn(),
}));
jest.mock("@/db/prisma", () => ({
  prisma: {
    autoscuolaInstructor: {
      // Marco e Luca sono istruttori attivi dell'autoscuola c1.
      findFirst: jest.fn(async (args: { where: { id?: string; companyId: string } }) =>
        args.where.companyId === "c1" && [I_MARCO, I_LUCA].includes(args.where.id ?? "")
          ? { id: args.where.id }
          : null,
      ),
    },
    companyMember: {
      findMany: jest.fn(async () => [{ userId: S1 }]),
    },
    autoscuolaAppointment: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    autoscuolaInstructorBlock: { findFirst: jest.fn(async () => null) },
  },
}));

import { POST } from "@/app/api/autoscuole/exam/route";
import { createExamEvent, materializeExamSlot } from "@/lib/actions/autoscuole.actions";

const create = (instructorId: string) =>
  POST(
    new Request("https://reglo.test/api/autoscuole/exam", {
      method: "POST",
      body: JSON.stringify({
        studentIds: [S1],
        startsAt: "2026-12-01T09:00:00.000Z",
        endsAt: "2026-12-01T10:00:00.000Z",
        instructorId,
      }),
    }),
  );

beforeEach(() => {
  jest.mocked(createExamEvent).mockClear();
  jest.mocked(materializeExamSlot).mockClear();
  membership.role = "admin";
  membership.autoscuolaRole = "OWNER";
});

describe("REG-795 esame creato dalla colonna di un istruttore", () => {
  it("titolare puro: l'esame va all'istruttore della colonna", async () => {
    const res = await create(I_MARCO);
    expect(res.status).toBe(200);
    expect(createExamEvent).toHaveBeenCalledWith(expect.objectContaining({ instructorId: I_MARCO }));
  });

  it("istruttore titolare sulla colonna di un collega: l'esame va al collega, non a sé", async () => {
    membership.autoscuolaRole = "INSTRUCTOR_OWNER";
    const res = await create(I_MARCO);
    expect(res.status).toBe(200);
    expect(materializeExamSlot).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c1", instructorId: I_MARCO, studentIds: [S1] }),
    );
  });

  it("istruttore di un'altra autoscuola: 404, niente esame", async () => {
    membership.autoscuolaRole = "INSTRUCTOR_OWNER";
    const res = await create("00000000-0000-4000-8000-0000000000ff");
    expect(res.status).toBe(404);
    expect(materializeExamSlot).not.toHaveBeenCalled();
  });
});
