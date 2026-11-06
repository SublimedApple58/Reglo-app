/**
 * REG-729: il pagellino di una guida (`getAppointmentEvaluation`, route
 * `/api/autoscuole/appointments/[id]/evaluation`) bastava essere della stessa
 * autoscuola per leggerlo. Ora un allievo legge solo le SUE guide, e solo se
 * l'autoscuola gli ha aperto le note.
 */

const membership = { companyId: "c1", userId: "u1", role: "member", autoscuolaRole: "STUDENT" as string };
let notesEnabled = true;
const appointmentWhere: Array<Record<string, unknown>> = [];

jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e) }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: { SETTINGS: "settings" },
  invalidateAutoscuoleCache: jest.fn(),
}));
jest.mock("@/db/prisma", () => ({
  prisma: {
    autoscuolaAppointment: {
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        appointmentWhere.push(args.where);
        // La guida "a1" è dell'allievo u1.
        const w = args.where;
        if (w.id !== "a1") return null;
        if (w.studentId && w.studentId !== "u1") return null;
        return { id: "a1" };
      }),
    },
    companyService: {
      findFirst: jest.fn(async () => ({ limits: { studentNotesEnabled: notesEnabled, evaluationSheetEnabled: true } })),
    },
    autoscuolaEvaluationItem: { findMany: jest.fn(async () => []) },
    autoscuolaAppointmentEvaluation: { findMany: jest.fn(async () => []) },
  },
}));

import { getAppointmentEvaluation } from "@/lib/actions/autoscuole-evaluation.actions";

beforeEach(() => {
  appointmentWhere.length = 0;
  notesEnabled = true;
  membership.userId = "u1";
  membership.autoscuolaRole = "STUDENT";
});

describe("REG-729 getAppointmentEvaluation: chi può leggere il pagellino", () => {
  it("l'allievo legge il pagellino della sua guida", async () => {
    const res = await getAppointmentEvaluation("a1");
    expect(res.success).toBe(true);
    expect(appointmentWhere[0]).toMatchObject({ studentId: "u1", companyId: "c1" });
  });

  it("un altro allievo della stessa autoscuola no", async () => {
    membership.userId = "u2";
    const res = await getAppointmentEvaluation("a1");
    expect(res.success).toBe(false);
  });

  it("l'allievo con le note spente no", async () => {
    notesEnabled = false;
    const res = await getAppointmentEvaluation("a1");
    expect(res.success).toBe(false);
  });

  it("l'istruttore legge qualunque guida dell'autoscuola, note spente o no", async () => {
    membership.userId = "i1";
    membership.autoscuolaRole = "INSTRUCTOR";
    notesEnabled = false;
    const res = await getAppointmentEvaluation("a1");
    expect(res.success).toBe(true);
    expect(appointmentWhere[0]).not.toHaveProperty("studentId");
  });
});
