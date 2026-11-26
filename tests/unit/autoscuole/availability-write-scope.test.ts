/**
 * REG-794 B2: `assertCanWriteAvailability` (settimana tipo, slot, eccezioni
 * giornaliere, settimanali e ricorrenti, da app e da web) controllava solo il
 * ruolo: il titolare passava con l'id di un istruttore di un'altra autoscuola.
 * Ora il proprietario della disponibilità deve essere dell'autoscuola di chi
 * scrive.
 */

const I_MARCO = "00000000-0000-4000-8000-000000000002";
const I_ALTRA = "00000000-0000-4000-8000-0000000000ff";
const V_PANDA = "00000000-0000-4000-8000-000000000020";

jest.mock("@/db/prisma", () => ({
  prisma: {
    autoscuolaInstructor: {
      findFirst: jest.fn(async (args: { where: { id?: string; userId?: string; companyId: string } }) => {
        const w = args.where;
        // Marco è l'istruttore dell'utente u-marco, nell'autoscuola c1.
        if (w.companyId !== "c1") return null;
        if (w.userId) return w.userId === "u-marco" ? { id: I_MARCO } : null;
        return w.id === I_MARCO ? { id: I_MARCO } : null;
      }),
    },
    autoscuolaVehicle: {
      findFirst: jest.fn(async (args: { where: { id: string; companyId: string } }) =>
        args.where.id === V_PANDA && args.where.companyId === "c1" ? { id: V_PANDA } : null,
      ),
    },
    companyMember: {
      findFirst: jest.fn(async (args: { where: { userId: string; companyId: string } }) =>
        args.where.userId === "u-allievo" && args.where.companyId === "c1" ? { userId: "u-allievo" } : null,
      ),
    },
  },
}));

import {
  AVAILABILITY_WRITE_FORBIDDEN,
  assertCanWriteAvailability,
} from "@/lib/autoscuole/availability-access";

const owner = { role: "admin", autoscuolaRole: "OWNER", userId: "u-owner", companyId: "c1" };
const instructorMarco = { role: "member", autoscuolaRole: "INSTRUCTOR", userId: "u-marco", companyId: "c1" };
const student = { role: "member", autoscuolaRole: "STUDENT", userId: "u-allievo", companyId: "c1" };

describe("REG-794 B2 disponibilità: il proprietario dev'essere dell'autoscuola", () => {
  it("il titolare scrive le fasce di un suo istruttore e di un suo veicolo", async () => {
    expect(await assertCanWriteAvailability(owner, "instructor", I_MARCO)).toBeNull();
    expect(await assertCanWriteAvailability(owner, "vehicle", V_PANDA)).toBeNull();
  });

  it("il titolare non scrive le fasce di un istruttore o di un veicolo di un'altra autoscuola", async () => {
    expect(await assertCanWriteAvailability(owner, "instructor", I_ALTRA)).toBe(AVAILABILITY_WRITE_FORBIDDEN);
    expect(await assertCanWriteAvailability(owner, "vehicle", "00000000-0000-4000-8000-0000000000fe")).toBe(
      AVAILABILITY_WRITE_FORBIDDEN,
    );
  });

  it("il titolare di un'altra autoscuola non scrive quelle di Marco", async () => {
    expect(await assertCanWriteAvailability({ ...owner, companyId: "c2" }, "instructor", I_MARCO)).toBe(
      AVAILABILITY_WRITE_FORBIDDEN,
    );
  });

  it("l'istruttore scrive le sue, non quelle di un altro", async () => {
    expect(await assertCanWriteAvailability(instructorMarco, "instructor", I_MARCO)).toBeNull();
    expect(await assertCanWriteAvailability(instructorMarco, "instructor", I_ALTRA)).toBe(AVAILABILITY_WRITE_FORBIDDEN);
  });

  it("l'istruttore scrive i veicoli solo della sua autoscuola", async () => {
    expect(await assertCanWriteAvailability(instructorMarco, "vehicle", V_PANDA)).toBeNull();
    expect(await assertCanWriteAvailability(instructorMarco, "vehicle", "00000000-0000-4000-8000-0000000000fe")).toBe(
      AVAILABILITY_WRITE_FORBIDDEN,
    );
  });

  it("l'allievo scrive le sue preferenze", async () => {
    expect(await assertCanWriteAvailability(student, "student", "u-allievo")).toBeNull();
  });
});
