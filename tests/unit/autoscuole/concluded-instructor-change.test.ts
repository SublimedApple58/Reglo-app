/**
 * Macchiavello: il sostituto "al volo" si scopre a guida finita. Su una guida
 * completata o assente il titolare/admin può correggere l'istruttore entro 30
 * giorni, senza la verifica di disponibilità (sul passato non ha senso).
 * Istruttori, guide annullate, esami e guide più vecchie restano bloccati.
 */

const DAY = 24 * 60 * 60 * 1000;
const A1 = "00000000-0000-4000-8000-000000000001";
const I_OLD = "00000000-0000-4000-8000-000000000002";
const I_NEW = "00000000-0000-4000-8000-000000000003";

const membership = {
  companyId: "c1",
  userId: "u1",
  role: "admin",
  autoscuolaRole: "OWNER" as string,
};

type Appt = {
  id: string;
  companyId: string;
  instructorId: string | null;
  studentId: string | null;
  status: string;
  type: string;
  startsAt: Date;
  endsAt: Date | null;
  groupLessonId: string | null;
  vehicleId: string | null;
};

let appointment: Appt;
const updates: Array<Record<string, unknown>> = [];
const availabilityLookups: string[] = [];

const appt = (status: string, daysAgo: number, extra: Partial<Appt> = {}): Appt => {
  const startsAt = new Date(Date.now() - daysAgo * DAY);
  return {
    id: A1,
    companyId: "c1",
    instructorId: I_OLD,
    studentId: "s1",
    status,
    type: "guida",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
    groupLessonId: null,
    vehicleId: null,
    ...extra,
  };
};

jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e), cn: () => "" }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: { AGENDA: "agenda", PAYMENTS: "payments" },
  invalidateAutoscuoleCache: jest.fn(),
}));
jest.mock("@/lib/autoscuole/notify", () => ({
  EVENT_CHANNELS_WITH_WHATSAPP: [],
  PUSH_ONLY: [],
  notifyAutoscuolaUser: jest.fn(),
  notifyAutoscuolaUsers: jest.fn(),
}));
jest.mock("@/db/prisma", () => {
  const tx = {
    autoscuolaAppointment: {
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return { ...appointment, ...args.data };
      }),
      findUniqueOrThrow: jest.fn(async () => appointment),
    },
  };
  return {
    prisma: {
      autoscuolaAppointment: {
        findFirst: jest.fn(async (args: { where: { id?: string } }) => {
          // La prima lettura è la guida stessa; le altre (sovrapposizioni
          // nella verifica di disponibilità) non trovano niente.
          if (args.where.id === A1) return appointment;
          availabilityLookups.push("appointment");
          return null;
        }),
      },
      autoscuolaInstructor: {
        findFirst: jest.fn(async (args: { where: { id?: string } }) =>
          args.where.id === I_NEW ? { id: I_NEW, name: "Sostituto", status: "active" } : null,
        ),
      },
      companyService: { findFirst: jest.fn(async () => ({ limits: {} })) },
      autoscuolaHoliday: {
        findFirst: jest.fn(async () => {
          availabilityLookups.push("holiday");
          return null;
        }),
      },
      autoscuolaInstructorBlock: {
        findFirst: jest.fn(async () => {
          availabilityLookups.push("block");
          return null;
        }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

import { updateAutoscuolaAppointmentDetails } from "@/lib/actions/autoscuole.actions";

const change = () =>
  updateAutoscuolaAppointmentDetails({ appointmentId: A1, instructorId: I_NEW });

beforeEach(() => {
  updates.length = 0;
  availabilityLookups.length = 0;
  membership.role = "admin";
  membership.autoscuolaRole = "OWNER";
});

describe("cambio istruttore su guida conclusa", () => {
  it("il titolare cambia l'istruttore di una guida completata di ieri, senza verifica di disponibilità", async () => {
    appointment = appt("completed", 1);
    const res = await change();
    expect(res).toMatchObject({ success: true });
    expect(updates[0]).toMatchObject({ instructorId: I_NEW });
    expect(availabilityLookups).toEqual([]);
  });

  it("vale anche per una guida segnata assente, fino a 30 giorni", async () => {
    appointment = appt("no_show", 29);
    expect(await change()).toMatchObject({ success: true });
  });

  it("oltre i 30 giorni no", async () => {
    appointment = appt("completed", 31);
    const res = await change();
    expect(res.success).toBe(false);
    expect(res.message).toContain("30 giorni");
    expect(updates).toHaveLength(0);
  });

  it("un istruttore no, nemmeno sulla sua guida", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "INSTRUCTOR";
    appointment = appt("completed", 1);
    // L'istruttore deve essere quello della guida per arrivare al controllo.
    const { prisma } = jest.requireMock("@/db/prisma");
    prisma.autoscuolaInstructor.findFirst.mockImplementationOnce(async () => ({ id: I_OLD }));
    const res = await change();
    expect(res.success).toBe(false);
    expect(res.message).toBe("Non puoi cambiare l'istruttore di una guida già conclusa.");
    expect(updates).toHaveLength(0);
  });

  it("una guida annullata resta bloccata anche per il titolare", async () => {
    appointment = appt("cancelled", 1);
    const res = await change();
    expect(res.success).toBe(false);
    expect(res.message).toContain("annullata");
  });

  it("esami e posti di una guida di gruppo si cambiano dal loro foglio", async () => {
    appointment = appt("completed", 1, { type: "esame" });
    expect((await change()).success).toBe(false);
    appointment = appt("completed", 1, { groupLessonId: "00000000-0000-4000-8000-000000000009" });
    expect((await change()).success).toBe(false);
  });

  it("su una guida futura la disponibilità si verifica ancora", async () => {
    appointment = appt("scheduled", -2);
    const res = await change();
    expect(res).toMatchObject({ success: true });
    expect(availabilityLookups).toEqual(expect.arrayContaining(["holiday", "block", "appointment"]));
  });
});
