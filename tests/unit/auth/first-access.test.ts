const findFirst = jest.fn();
const updateMany = jest.fn();
const releaseEmailIfOrphaned = jest.fn();

jest.mock("@/db/prisma", () => ({
  prisma: { user: { findFirst: (...a: unknown[]) => findFirst(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}));
jest.mock("@/lib/account-deletion", () => ({
  releaseEmailIfOrphaned: (...a: unknown[]) => releaseEmailIfOrphaned(...a),
}));

import {
  ACTIVATION_TOKEN_TTL_MS,
  completeFirstAccess,
  createActivationToken,
  isActivationPending,
  readActivationToken,
  splitName,
  startFirstAccess,
} from "@/lib/auth/first-access";
import { firstAccessCompleteSchema } from "@/lib/validators";

const details = {
  firstName: "Giulia",
  lastName: "Ferraris",
  email: " Giulia@Esempio.it ",
  password: "segreta1",
  birthDate: "2007-03-14",
};

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret";
  findFirst.mockReset();
  updateMany.mockReset();
  releaseEmailIfOrphaned.mockReset().mockResolvedValue(true);
});

describe("permesso di attivazione", () => {
  it("si legge finché non scade", () => {
    const now = 1_000_000;
    const token = createActivationToken("user-1", now);
    expect(readActivationToken(token, now + 1000)).toBe("user-1");
    expect(readActivationToken(token, now + ACTIVATION_TOKEN_TTL_MS + 1)).toBeNull();
  });

  it("non si può falsificare", () => {
    const token = createActivationToken("user-1");
    const [, exp, sig] = token.split(".");
    expect(readActivationToken(`user-2.${exp}.${sig}`)).toBeNull();
    expect(readActivationToken("spazzatura")).toBeNull();
  });
});

describe("splitName", () => {
  it("spezza sul primo spazio", () => {
    expect(splitName("Maria Grazia Rossi")).toEqual({ firstName: "Maria", lastName: "Grazia Rossi" });
    expect(splitName("NO_NAME")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("isActivationPending", () => {
  it("vale solo per account col telefono mai attivati", () => {
    expect(isActivationPending({ loginPhone: "+393331234567", password: null, profileCompletedAt: null })).toBe(true);
    expect(isActivationPending({ loginPhone: "+393331234567", password: "h", profileCompletedAt: null })).toBe(false);
    expect(isActivationPending({ loginPhone: null, password: null, profileCompletedAt: null })).toBe(false);
  });
});

describe("startFirstAccess", () => {
  it("cerca solo account mai attivati, col numero normalizzato", async () => {
    findFirst.mockResolvedValue({
      id: "user-1",
      name: "Giulia Ferraris",
      companyMembers: [{ company: { name: "Autoscuola Ricca" } }],
    });
    const res = await startFirstAccess("333 123 4567");

    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      loginPhone: "+393331234567",
      password: null,
      profileCompletedAt: null,
    });
    expect(res).toMatchObject({
      ok: true,
      firstName: "Giulia",
      lastName: "Ferraris",
      phone: "+393331234567",
      companyName: "Autoscuola Ricca",
    });
    if (res.ok) expect(readActivationToken(res.activationToken)).toBe("user-1");
  });

  it("numero sconosciuto o non valido: nessun dettaglio", async () => {
    findFirst.mockResolvedValue(null);
    expect(await startFirstAccess("333 000 0000")).toEqual({ ok: false });
    expect(await startFirstAccess("abc")).toEqual({ ok: false });
  });
});

describe("completeFirstAccess", () => {
  it("salva i dati solo se l'account non ha ancora una password", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    expect(await completeFirstAccess("user-1", details)).toEqual({ ok: true });

    const call = updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "user-1", password: null, profileCompletedAt: null });
    expect(call.data).toMatchObject({ name: "Giulia Ferraris", email: "giulia@esempio.it" });
    expect(call.data.password).not.toBe("segreta1");
    expect(call.data.birthDate.toISOString()).toBe("2007-03-14T00:00:00.000Z");
    expect(call.data.profileCompletedAt).toBeInstanceOf(Date);
  });

  it("un account già attivato non si riattiva", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const res = await completeFirstAccess("user-1", details);
    expect(res.ok).toBe(false);
  });

  it("rifiuta un'email di un altro account", async () => {
    releaseEmailIfOrphaned.mockResolvedValue(false);
    const res = await completeFirstAccess("user-1", details);
    expect(res).toEqual({ ok: false, message: "Questa email è già usata da un altro account." });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("validazione dei dati", () => {
  const base = { activationToken: "x".repeat(20), ...details };
  it("chiede email valida, password ≥ 6 e una data di nascita plausibile", () => {
    expect(firstAccessCompleteSchema.safeParse(base).success).toBe(true);
    expect(firstAccessCompleteSchema.safeParse({ ...base, email: "giulia" }).success).toBe(false);
    expect(firstAccessCompleteSchema.safeParse({ ...base, password: "123" }).success).toBe(false);
    expect(firstAccessCompleteSchema.safeParse({ ...base, birthDate: "2024-01-01" }).success).toBe(false);
    expect(firstAccessCompleteSchema.safeParse({ ...base, birthDate: "14/03/2007" }).success).toBe(false);
  });
});
