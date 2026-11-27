/**
 * REG-802 — disponibilità dell'allievo lette dallo staff (dettaglio allievo
 * app, drawer web): titolare, istruttore e admin sì; allievo no; allievo di
 * un'altra autoscuola «non trovato».
 */
const STUDENT = "00000000-0000-4000-8000-0000000000aa";
let membership: Record<string, unknown> = {};
let studentInCompany = true;

jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e), cn: () => "" }));
jest.mock("@/lib/service-access", () => ({ requireServiceAccess: jest.fn(async () => ({ membership })) }));
jest.mock("@/db/prisma", () => ({
  prisma: {
    companyMember: { findFirst: jest.fn(async () => (studentInCompany ? { userId: STUDENT } : null)) },
  },
}));
jest.mock("@/lib/autoscuole/student-availability-store", () => ({
  getStudentAvailability: jest.fn(async () => ({ bands: [], days: { "1": ["evening"] }, confirmedAt: null, hasAvailability: true })),
}));

import { getStudentAvailabilityForStaff } from "@/lib/actions/autoscuole-student-availability.actions";

const as = (autoscuolaRole: string, role = "member") => ({ companyId: "c1", userId: "u", role, autoscuolaRole });

beforeEach(() => {
  studentInCompany = true;
});

it("titolare e istruttore leggono", async () => {
  for (const m of [as("OWNER", "admin"), as("INSTRUCTOR"), as("INSTRUCTOR_OWNER", "admin")]) {
    membership = m;
    const res = await getStudentAvailabilityForStaff({ studentId: STUDENT });
    expect(res.success).toBe(true);
  }
});

it("un allievo no", async () => {
  membership = as("STUDENT");
  expect(await getStudentAvailabilityForStaff({ studentId: STUDENT })).toEqual({
    success: false,
    message: "Non puoi vedere questa disponibilità.",
  });
});

it("allievo di un'altra autoscuola: non trovato", async () => {
  membership = as("OWNER", "admin");
  studentInCompany = false;
  expect(await getStudentAvailabilityForStaff({ studentId: STUDENT })).toEqual({ success: false, message: "Allievo non trovato." });
});
