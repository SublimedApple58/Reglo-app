/**
 * REG-635: il contatore x/6 della lista Allievi non deve dipendere da quante
 * guide ha l'autoscuola. Prima le guide si leggevano tutte (annullate comprese)
 * con un tetto di 5000 per l'intera autoscuola e senza ordine: oltre il tetto,
 * ad allievi a caso mancavano guide. Ora si leggono solo le completate con una
 * fine registrata, tutte.
 */

const COMPANY = "c1";
const HOUR = 60 * 60 * 1000;

type Lesson = {
  id: string;
  studentId: string;
  caseId: string | null;
  type: string;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
};

const lessons: Lesson[] = [];
const lessonQueries: Array<Record<string, unknown>> = [];

const lesson = (studentId: string, i: number, status: string, minutes = 60): Lesson => {
  const startsAt = new Date(Date.UTC(2026, 0, 1) + i * HOUR);
  return {
    id: `${studentId}-${status}-${i}`,
    studentId,
    caseId: null,
    type: "guida",
    status,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60 * 1000),
  };
};

const member = (userId: string, i: number) => ({
  userId,
  companyId: COMPANY,
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * HOUR),
  assignedInstructorId: null,
  studentPhase: "pratica",
  licenseCategory: "B",
  transmission: null,
  groupLessonsOptIn: false,
  examReady: false,
  examReadyAt: null,
  defaultLocationId: null,
  defaultLocation: null,
  bookingBlocked: false,
  bookingBlockReason: null,
  bookingBlockUntil: null,
  unpaidBlockClearedAtCount: null,
  user: { id: userId, name: userId, email: `${userId}@example.com`, phone: null, image: null },
});

jest.mock("@/lib/utils", () => ({
  formatError: (e: unknown) => String(e),
  cn: () => "",
}));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership: { companyId: COMPANY } })),
}));
jest.mock("@/lib/autoscuole/cached-service", () => ({
  getCachedCompanyServiceLimits: jest.fn(async () => ({})),
}));
jest.mock("@/lib/autoscuole/unpaid-auto-block", () => ({
  readAutoBlockSettings: jest.fn(() => ({ enabled: false })),
  getStudentsUnpaidLessonCounts: jest.fn(async () => new Map()),
  reconcileUnpaidAutoBlock: jest.fn(async ({ state }: { state: unknown }) => state),
}));

jest.mock("@/db/prisma", () => ({
  prisma: {
    companyMember: {
      findMany: jest.fn(async () => [member("anna", 1), member("bruno", 2)]),
    },
    mobileAccessToken: { findMany: jest.fn(async () => []) },
    mobilePushDevice: { findMany: jest.fn(async () => []) },
    autoscuolaCase: { findMany: jest.fn(async () => []) },
    autoscuolaLicensePath: { findMany: jest.fn(async () => []) },
    autoscuolaAppointment: {
      // Come il DB: applica i filtri che la query chiede, e il `take` se c'è.
      findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
        lessonQueries.push(args);
        const { where } = args;
        const ids = (where.studentId as { in: string[] }).in;
        const rows = lessons.filter(
          (l) =>
            ids.includes(l.studentId) &&
            (where.status === undefined || l.status === where.status) &&
            (where.endsAt === undefined || l.endsAt !== null),
        );
        return args.take ? rows.slice(0, args.take) : rows;
      }),
    },
  },
}));

import { getAutoscuolaStudentsWithProgress } from "@/lib/actions/autoscuole.actions";

describe("lista Allievi: contatore guide (REG-635)", () => {
  beforeEach(() => {
    lessons.length = 0;
    lessonQueries.length = 0;
  });

  it("conta le guide anche quando l'autoscuola ne ha piu' di 5000", async () => {
    // Bruno ha 6000 guide annullate, che il DB restituirebbe per prime.
    for (let i = 0; i < 6000; i += 1) lessons.push(lesson("bruno", i, "cancelled"));
    for (let i = 0; i < 4; i += 1) lessons.push(lesson("anna", 7000 + i, "completed"));

    const res = await getAutoscuolaStudentsWithProgress();
    expect(res.success).toBe(true);
    const anna = (res.data as Array<{ id: string; summary: { completedLessons: number } }>).find(
      (s) => s.id === "anna",
    );
    expect(anna?.summary.completedLessons).toBe(4);
    expect(lessonQueries).toHaveLength(1);
    expect(lessonQueries[0].take).toBeUndefined();
  });

  it("legge solo le guide completate con una fine registrata", async () => {
    lessons.push(lesson("anna", 1, "completed"));
    lessons.push(lesson("anna", 2, "completed", 30));
    lessons.push(lesson("anna", 3, "scheduled"));
    lessons.push({ ...lesson("anna", 4, "completed"), endsAt: null });

    const res = await getAutoscuolaStudentsWithProgress();
    const anna = (res.data as Array<{ id: string; summary: { completedLessons: number } }>).find(
      (s) => s.id === "anna",
    );
    // La guida da 30 minuti passa il filtro ma non conta per l'obbligo.
    expect(anna?.summary.completedLessons).toBe(1);
    expect(lessonQueries[0].where).toMatchObject({ status: "completed", endsAt: { not: null } });
  });
});
