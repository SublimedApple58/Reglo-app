/**
 * REG-795: il titolare puro (OWNER, non istruttore) agisce dall'app sulle guide
 * di qualunque istruttore della sua autoscuola, come sul web; l'istruttore
 * resta limitato alle sue guide; nessuno esce dalla propria autoscuola.
 *
 * L'eliminazione definitiva (`permanent-cancel`, tasto «Elimina» dell'app) non
 * guardava il ruolo: qualunque membro dell'autoscuola poteva eliminare
 * qualunque guida. Ora: titolare su tutte, istruttore sulle sue, allievo mai.
 */

const A1 = "00000000-0000-4000-8000-000000000001";
const I_MARCO = "00000000-0000-4000-8000-000000000002";
const I_LUCA = "00000000-0000-4000-8000-000000000003";

const membership = {
  companyId: "c1",
  userId: "u1",
  role: "admin",
  autoscuolaRole: "OWNER" as string,
};
let ownInstructorId: string | null = null;
const updates: Array<Record<string, unknown>> = [];
const appointmentWhere: Array<Record<string, unknown>> = [];

jest.mock("next/server", () => ({ after: jest.fn() }));
jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e), cn: () => "" }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: { AGENDA: "agenda", PAYMENTS: "payments" },
  invalidateAutoscuoleCache: jest.fn(),
}));
jest.mock("@/lib/autoscuole/payments", () => ({
  refundLessonCreditIfEligible: jest.fn(),
}));
jest.mock("@/lib/autoscuole/notify", () => ({
  EVENT_CHANNELS_WITH_WHATSAPP: [],
  PUSH_ONLY: [],
  notifyAutoscuolaUser: jest.fn(),
  notifyAutoscuolaUsers: jest.fn(),
}));
jest.mock("@/lib/autoscuole/operational-cancellation", () => ({
  annulFutureAppointment: jest.fn(async (input: Record<string, unknown>) => ({ success: true, input })),
}));
// Le letture accessorie (notifiche, slot) non c'entrano coi permessi: ogni
// modello non descritto qui risponde «niente».
const mockEmptyModel = () =>
  new Proxy({}, { get: () => jest.fn(async () => null) });
jest.mock("@/db/prisma", () => {
  const known: Record<string, unknown> = {
    autoscuolaAppointment: {
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        appointmentWhere.push(args.where);
        // La guida A1 è di Marco, nell'autoscuola c1.
        if (args.where.id !== A1 || args.where.companyId !== "c1") return null;
        return {
          id: A1,
          companyId: "c1",
          instructorId: I_MARCO,
          studentId: "s1",
          status: "scheduled",
          type: "guida",
          startsAt: new Date("2026-12-01T09:00:00Z"),
          endsAt: new Date("2026-12-01T10:00:00Z"),
          slotId: null,
          vehicleId: null,
        };
      }),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return args.data;
      }),
    },
    autoscuolaInstructor: {
      findFirst: jest.fn(async () => (ownInstructorId ? { id: ownInstructorId } : null)),
    },
  };
  return {
    prisma: new Proxy(known, {
      get: (target, key: string) => target[key] ?? (target[key] = mockEmptyModel()),
    }),
  };
});

import {
  annulAutoscuolaAppointment,
  cancelAutoscuolaAppointment,
  permanentlyCancelAutoscuolaAppointment,
} from "@/lib/actions/autoscuole.actions";

const del = () => permanentlyCancelAutoscuolaAppointment({ appointmentId: A1 });

beforeEach(() => {
  updates.length = 0;
  appointmentWhere.length = 0;
  ownInstructorId = null;
  membership.companyId = "c1";
  membership.role = "admin";
  membership.autoscuolaRole = "OWNER";
});

describe("REG-795 permanent-cancel: chi può eliminare una guida", () => {
  it("il titolare puro elimina la guida di un istruttore", async () => {
    const res = await del();
    expect(res).toMatchObject({ success: true });
    expect(updates[0]).toMatchObject({ status: "cancelled", cancellationKind: "permanent_cancel" });
  });

  it("l'istruttore titolare elimina anche le guide dei colleghi", async () => {
    membership.autoscuolaRole = "INSTRUCTOR_OWNER";
    ownInstructorId = I_LUCA;
    expect(await del()).toMatchObject({ success: true });
  });

  it("l'istruttore elimina le sue guide", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "INSTRUCTOR";
    ownInstructorId = I_MARCO;
    expect(await del()).toMatchObject({ success: true });
  });

  it("l'istruttore non elimina le guide di un collega", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "INSTRUCTOR";
    ownInstructorId = I_LUCA;
    const res = await del();
    expect(res).toMatchObject({ success: false, message: "Puoi eliminare solo le tue guide." });
    expect(updates).toHaveLength(0);
  });

  it("l'allievo no", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "STUDENT";
    expect((await del()).success).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("il titolare di un'altra autoscuola non la trova", async () => {
    membership.companyId = "c2";
    const res = await del();
    expect(res).toMatchObject({ success: false, message: "Appuntamento non trovato." });
    expect(appointmentWhere[0]).toMatchObject({ companyId: "c2" });
    expect(updates).toHaveLength(0);
  });
});

describe("REG-795 annulla dall'app: il titolare puro sulle guide dei suoi istruttori", () => {
  it("cancel: il titolare annulla la guida di Marco", async () => {
    const res = await cancelAutoscuolaAppointment({ appointmentId: A1 });
    expect(res).toMatchObject({ success: true });
    expect(updates[0]).toMatchObject({ status: "cancelled", cancellationKind: "manual_cancel" });
  });

  it("cancel: l'istruttore Luca no", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "INSTRUCTOR";
    ownInstructorId = I_LUCA;
    expect((await cancelAutoscuolaAppointment({ appointmentId: A1 })).success).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("cancel: il titolare di un'altra autoscuola non la trova", async () => {
    membership.companyId = "c2";
    expect((await cancelAutoscuolaAppointment({ appointmentId: A1 })).success).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("annul: il titolare decide anche l'esito del tardivo, sulla sua autoscuola", async () => {
    const res = await annulAutoscuolaAppointment({ appointmentId: A1, lateOutcome: "penalize" });
    expect(res).toMatchObject({ success: true, input: { companyId: "c1", appointmentId: A1, lateOutcome: "penalize" } });
  });
});
