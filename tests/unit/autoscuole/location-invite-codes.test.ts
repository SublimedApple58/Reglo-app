const company = { findUnique: jest.fn() };
const autoscuolaInstructor = { findUnique: jest.fn(), updateMany: jest.fn() };
const autoscuolaLocation = { findUnique: jest.fn(), updateMany: jest.fn() };
jest.mock("@/db/prisma", () => ({ prisma: { company, autoscuolaInstructor, autoscuolaLocation } }));

import { ensureLocationInviteCode, isSignupCodeTaken } from "@/lib/autoscuole/invite-codes";

beforeEach(() => {
  jest.resetAllMocks();
  company.findUnique.mockResolvedValue(null);
  autoscuolaInstructor.findUnique.mockResolvedValue(null);
});

describe("isSignupCodeTaken", () => {
  it("libero se nessuna tabella lo usa", async () => {
    autoscuolaLocation.findUnique.mockResolvedValue(null);
    expect(await isSignupCodeTaken("ABC234")).toBe(false);
  });

  it.each([
    ["autoscuola", () => company.findUnique.mockResolvedValue({ id: "c" })],
    ["istruttore", () => autoscuolaInstructor.findUnique.mockResolvedValue({ id: "i" })],
    ["luogo", () => autoscuolaLocation.findUnique.mockResolvedValue({ id: "l" })],
  ])("occupato da un codice %s", async (_label, arrange) => {
    autoscuolaLocation.findUnique.mockResolvedValue(null);
    arrange();
    expect(await isSignupCodeTaken("ABC234")).toBe(true);
  });
});

describe("ensureLocationInviteCode", () => {
  it("restituisce il codice esistente senza generarne", async () => {
    autoscuolaLocation.findUnique.mockResolvedValueOnce({ inviteCode: "LOT234", archivedAt: null });
    expect(await ensureLocationInviteCode("l1")).toBe("LOT234");
    expect(autoscuolaLocation.updateMany).not.toHaveBeenCalled();
  });

  it("luogo archiviato: nessun codice", async () => {
    autoscuolaLocation.findUnique.mockResolvedValueOnce({ inviteCode: null, archivedAt: new Date() });
    expect(await ensureLocationInviteCode("l1")).toBeNull();
    expect(autoscuolaLocation.updateMany).not.toHaveBeenCalled();
  });

  it("salta i candidati già usati da un'altra tabella", async () => {
    autoscuolaLocation.findUnique
      .mockResolvedValueOnce({ inviteCode: null, archivedAt: null }) // il luogo
      .mockResolvedValue(null); // nessun luogo con quel codice
    company.findUnique.mockResolvedValueOnce({ id: "c" }).mockResolvedValue(null); // 1° candidato = codice autoscuola
    autoscuolaLocation.updateMany.mockResolvedValue({ count: 1 });

    const code = await ensureLocationInviteCode("l1");
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(company.findUnique).toHaveBeenCalledTimes(2);
    expect(autoscuolaLocation.updateMany).toHaveBeenCalledTimes(1);
    expect(autoscuolaLocation.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", inviteCode: null },
      data: { inviteCode: code },
    });
  });

  it("richiesta concorrente: restituisce il codice vincitore", async () => {
    autoscuolaLocation.findUnique
      .mockResolvedValueOnce({ inviteCode: null, archivedAt: null })
      .mockResolvedValueOnce(null) // controllo del candidato
      .mockResolvedValueOnce({ inviteCode: "WIN234" }); // rilettura
    autoscuolaLocation.updateMany.mockResolvedValue({ count: 0 });
    expect(await ensureLocationInviteCode("l1")).toBe("WIN234");
  });

  it("collisione P2002: riprova con un altro candidato", async () => {
    autoscuolaLocation.findUnique.mockResolvedValueOnce({ inviteCode: null, archivedAt: null }).mockResolvedValue(null);
    autoscuolaLocation.updateMany
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
      .mockResolvedValueOnce({ count: 1 });
    expect(await ensureLocationInviteCode("l1")).toMatch(/^[A-Z2-9]{6}$/);
    expect(autoscuolaLocation.updateMany).toHaveBeenCalledTimes(2);
  });
});
