/**
 * REG-796: `PATCH /api/autoscuole/appointments/[id]`
 * (`updateAutoscuolaAppointmentDetails`) non escludeva l'allievo: un account
 * STUDENT che chiamava la rotta a mano poteva cambiare note, tipo e voto di una
 * guida della sua autoscuola. Ora la modifica è solo dello staff: titolare/admin
 * su tutte, istruttore sulle sue. In app e sul web la chiamano solo schermate
 * dello staff (scheda allievo, Gestisci guida, Road, dialoghi dell'agenda).
 */

const A1 = "00000000-0000-4000-8000-000000000001";
const I_MARCO = "00000000-0000-4000-8000-000000000002";
const I_LUCA = "00000000-0000-4000-8000-000000000003";

const membership = {
  companyId: "c1",
  userId: "u1",
  role: "admin",
  autoscuolaRole: "OWNER" as string | null,
};
let ownInstructorId: string | null = null;
const updates: Array<Record<string, unknown>> = [];
const appointmentLookups: Array<Record<string, unknown>> = [];

jest.mock("next/server", () => ({ after: jest.fn() }));
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

// Le letture accessorie non c'entrano coi permessi: ogni modello non descritto
// qui risponde «niente».
const mockEmptyModel = () =>
  new Proxy({}, { get: () => jest.fn(async () => null) });
jest.mock("@/db/prisma", () => {
  const appointment = () => ({
    id: A1,
    companyId: "c1",
    instructorId: I_MARCO,
    studentId: "s1",
    status: "scheduled",
    type: "guida",
    types: [],
    startsAt: new Date("2026-12-01T09:00:00Z"),
    endsAt: new Date("2026-12-01T10:00:00Z"),
    notes: null,
    rating: null,
    groupLessonId: null,
    vehicleId: null,
    locationId: null,
  });
  const appointmentModel = {
    findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
      appointmentLookups.push(args.where);
      return args.where.id === A1 && args.where.companyId === "c1" ? appointment() : null;
    }),
    update: jest.fn(async (args: { data: Record<string, unknown> }) => {
      updates.push(args.data);
      return { ...appointment(), ...args.data };
    }),
    findUniqueOrThrow: jest.fn(async () => appointment()),
  };
  const known: Record<string, unknown> = {
    autoscuolaAppointment: appointmentModel,
    autoscuolaInstructor: {
      findFirst: jest.fn(async () => (ownInstructorId ? { id: ownInstructorId } : null)),
    },
    companyService: { findFirst: jest.fn(async () => ({ limits: {} })) },
  };
  const prisma: Record<string, unknown> = new Proxy(known, {
    get: (target, key: string) => target[key] ?? (target[key] = mockEmptyModel()),
  });
  known.$transaction = jest.fn(async (fn: unknown) =>
    typeof fn === "function" ? fn(prisma) : Promise.all(fn as Promise<unknown>[]),
  );
  return { prisma };
});

import { updateAutoscuolaAppointmentDetails } from "@/lib/actions/autoscuole.actions";

const editNotes = () =>
  updateAutoscuolaAppointmentDetails({ appointmentId: A1, notes: "Rotonde da ripassare" });

beforeEach(() => {
  updates.length = 0;
  appointmentLookups.length = 0;
  ownInstructorId = null;
  membership.companyId = "c1";
  membership.role = "admin";
  membership.autoscuolaRole = "OWNER";
});

describe("REG-796 PATCH dettagli guida: solo lo staff", () => {
  it("l'allievo no: rifiutato prima ancora di cercare la guida", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "STUDENT";
    const res = await editNotes();
    expect(res).toMatchObject({ success: false, message: "Operazione non consentita." });
    expect(appointmentLookups).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("nemmeno sul pagellino o sul voto", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "STUDENT";
    const res = await updateAutoscuolaAppointmentDetails({ appointmentId: A1, rating: 5, evaluations: [] });
    expect(res).toMatchObject({ success: false, message: "Operazione non consentita." });
    expect(appointmentLookups).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("un membro senza ruolo autoscuola no", async () => {
    membership.role = "member";
    membership.autoscuolaRole = null;
    expect((await editNotes()).success).toBe(false);
    expect(appointmentLookups).toHaveLength(0);
  });

  it("il titolare modifica la guida di un istruttore", async () => {
    const res = await editNotes();
    expect(res).toMatchObject({ success: true });
    expect(appointmentLookups[0]).toMatchObject({ id: A1, companyId: "c1" });
  });

  it("l'istruttore modifica le sue guide", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "INSTRUCTOR";
    ownInstructorId = I_MARCO;
    expect(await editNotes()).toMatchObject({ success: true });
  });

  it("l'istruttore non modifica le guide di un collega", async () => {
    membership.role = "member";
    membership.autoscuolaRole = "INSTRUCTOR";
    ownInstructorId = I_LUCA;
    expect(await editNotes()).toMatchObject({ success: false, message: "Puoi modificare solo le tue guide." });
  });

  it("il titolare di un'altra autoscuola non trova la guida", async () => {
    membership.companyId = "c2";
    expect(await editNotes()).toMatchObject({ success: false, message: "Appuntamento non trovato." });
  });
});
