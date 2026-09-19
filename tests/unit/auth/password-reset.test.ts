/**
 * Cuore del recupero password (web + mobile): `lib/auth/password-reset.ts`.
 *
 * Qui stanno le regole di sicurezza che web e mobile condividono — niente
 * enumerazione degli account, codice bruciato dopo N tentativi, sessioni
 * revocate al cambio password. Sono test sul comportamento, non sui dettagli:
 * il `prisma` è finto ma `hash`/`compare` sono quelli veri.
 */

const sendDynamicEmail = jest.fn().mockResolvedValue(undefined);
const afterCallbacks: Array<() => Promise<void> | void> = [];

jest.mock("@/email", () => ({
  sendDynamicEmail: (...args: unknown[]) => sendDynamicEmail(...args),
}));

jest.mock("next/server", () => ({
  // `after()` differisce l'invio: qui raccolgo le callback e le eseguo a mano.
  after: (cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  },
}));

type CodeRow = {
  id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

const db = {
  users: [] as Array<{ id: string; email: string; name: string | null }>,
  codes: [] as CodeRow[],
  transactions: [] as unknown[][],
};

jest.mock("@/db/prisma", () => ({
  prisma: {
    user: {
      findFirst: jest.fn(async ({ where }: { where: { email: string } }) =>
        db.users.find((u) => u.email === where.email) ?? null,
      ),
      update: jest.fn(async (args: unknown) => args),
    },
    passwordResetCode: {
      findMany: jest.fn(
        async ({ where }: { where: { userId: string; createdAt?: { gt: Date } } }) =>
          db.codes
            .filter(
              (c) =>
                c.userId === where.userId &&
                (!where.createdAt || c.createdAt.valueOf() > where.createdAt.gt.valueOf()),
            )
            .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf()),
      ),
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        db.codes
          .filter(
            (c) => c.userId === where.userId && !c.consumedAt && c.expiresAt > new Date(),
          )
          .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())[0] ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Omit<CodeRow, "id" | "attempts" | "consumedAt" | "createdAt"> }) => {
        const row: CodeRow = {
          id: `code-${db.codes.length + 1}`,
          attempts: 0,
          consumedAt: null,
          createdAt: new Date(),
          ...data,
        };
        db.codes.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<CodeRow> }) => {
        const row = db.codes.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { userId: string; consumedAt: null }; data: Partial<CodeRow> }) => {
        db.codes
          .filter((c) => c.userId === where.userId && !c.consumedAt)
          .forEach((c) => Object.assign(c, data));
        return { count: 0 };
      }),
    },
    mobileAccessToken: { deleteMany: jest.fn(async (args: unknown) => args) },
    $transaction: jest.fn(async (ops: unknown[]) => {
      db.transactions.push(ops);
      return ops;
    }),
  },
}));

import {
  applyNewPassword,
  checkPasswordResetCode,
  requestPasswordResetCode,
  RESET_CODE_MAX_ATTEMPTS,
} from "@/lib/auth/password-reset";
import { compare, hash } from "@/lib/encrypt";

const flushAfter = async () => {
  while (afterCallbacks.length) await afterCallbacks.shift()!();
};

const seedUser = (email: string) => {
  const user = { id: `user-${email}`, email, name: "Mario" };
  db.users.push(user);
  return user;
};

/** Legge il codice in chiaro dall'email appena "spedita". */
const sentCode = () => {
  const body = sendDynamicEmail.mock.calls.at(-1)?.[0]?.body as string;
  return body.match(/^\d{6}$/m)?.[0] ?? "";
};

beforeEach(() => {
  db.users = [];
  db.codes = [];
  db.transactions = [];
  afterCallbacks.length = 0;
  sendDynamicEmail.mockClear();
});

describe("richiesta del codice", () => {
  it("manda un codice a 6 cifre a chi ha un account", async () => {
    const user = seedUser("mario@example.com");

    await requestPasswordResetCode("mario@example.com", "browser");
    await flushAfter();

    expect(sendDynamicEmail).toHaveBeenCalledTimes(1);
    expect(sentCode()).toMatch(/^\d{6}$/);
    expect(db.codes).toHaveLength(1);
    expect(db.codes[0].userId).toBe(user.id);
    // In chiaro il codice non finisce da nessuna parte.
    expect(db.codes[0].codeHash).not.toBe(sentCode());
    expect(await compare(sentCode(), db.codes[0].codeHash)).toBe(true);
  });

  it("normalizza l'email (maiuscole e spazi) prima di cercare l'account", async () => {
    seedUser("mario@example.com");

    await requestPasswordResetCode("  Mario@Example.com  ", "browser");
    await flushAfter();

    expect(sendDynamicEmail).toHaveBeenCalledTimes(1);
  });

  it("non manda niente e non crea codici se l'email è sconosciuta", async () => {
    await requestPasswordResetCode("nessuno@example.com", "browser");
    await flushAfter();

    expect(sendDynamicEmail).not.toHaveBeenCalled();
    expect(db.codes).toHaveLength(0);
  });

  it("si ferma quando l'utente ha già chiesto troppi codici", async () => {
    seedUser("mario@example.com");

    // Il limite è 5 per finestra; il 6° non parte.
    for (let i = 0; i < 6; i++) {
      // Sposta indietro i codici già creati per aggirare il cooldown di 60s
      // e provare SOLO il tetto per finestra.
      db.codes.forEach((c) => {
        c.createdAt = new Date(c.createdAt.valueOf() - 61_000);
      });
      await requestPasswordResetCode("mario@example.com", "browser");
    }
    await flushAfter();

    expect(sendDynamicEmail).toHaveBeenCalledTimes(5);
  });

  it("rispetta il cooldown fra due richieste ravvicinate", async () => {
    seedUser("mario@example.com");

    await requestPasswordResetCode("mario@example.com", "browser");
    await requestPasswordResetCode("mario@example.com", "browser");
    await flushAfter();

    expect(sendDynamicEmail).toHaveBeenCalledTimes(1);
  });

  it("un codice nuovo brucia quello precedente", async () => {
    seedUser("mario@example.com");

    await requestPasswordResetCode("mario@example.com", "browser");
    await flushAfter();
    const first = sentCode();

    db.codes.forEach((c) => {
      c.createdAt = new Date(c.createdAt.valueOf() - 61_000);
    });
    await requestPasswordResetCode("mario@example.com", "browser");
    await flushAfter();

    expect(await checkPasswordResetCode("mario@example.com", first)).toEqual({ ok: false });
    expect((await checkPasswordResetCode("mario@example.com", sentCode())).ok).toBe(true);
  });

  it("il testo dell'email dice dove usare il codice", async () => {
    seedUser("mario@example.com");

    await requestPasswordResetCode("mario@example.com", "app");
    await flushAfter();
    expect(sendDynamicEmail.mock.calls[0][0].body).toContain("nell'app");

    db.codes.forEach((c) => {
      c.createdAt = new Date(c.createdAt.valueOf() - 61_000);
    });
    await requestPasswordResetCode("mario@example.com", "browser");
    await flushAfter();
    expect(sendDynamicEmail.mock.calls[1][0].body).toContain("nella pagina di recupero");
  });
});

describe("verifica del codice", () => {
  const prepare = async () => {
    const user = seedUser("mario@example.com");
    await requestPasswordResetCode("mario@example.com", "browser");
    await flushAfter();
    return { user, code: sentCode() };
  };

  it("accetta il codice giusto senza consumarlo", async () => {
    const { user, code } = await prepare();

    const first = await checkPasswordResetCode("mario@example.com", code);
    expect(first).toMatchObject({ ok: true, userId: user.id, email: "mario@example.com" });

    // Riusabile finché non è /confirm a bruciarlo: il passo password può
    // essere ritentato senza rifare tutto.
    expect((await checkPasswordResetCode("mario@example.com", code)).ok).toBe(true);
  });

  it("brucia il codice dopo troppi tentativi sbagliati", async () => {
    const { code } = await prepare();

    for (let i = 0; i < RESET_CODE_MAX_ATTEMPTS; i++) {
      expect(await checkPasswordResetCode("mario@example.com", "000000")).toEqual({ ok: false });
    }

    expect(db.codes[0].consumedAt).not.toBeNull();
    // Anche quello giusto ormai non vale più.
    expect(await checkPasswordResetCode("mario@example.com", code)).toEqual({ ok: false });
  });

  it("rifiuta un codice scaduto", async () => {
    const { code } = await prepare();
    db.codes[0].expiresAt = new Date(Date.now() - 1000);

    expect(await checkPasswordResetCode("mario@example.com", code)).toEqual({ ok: false });
  });

  it("rifiuta il codice di un altro account", async () => {
    const { code } = await prepare();
    seedUser("luigi@example.com");

    expect(await checkPasswordResetCode("luigi@example.com", code)).toEqual({ ok: false });
  });

  it("rifiuta un'email senza account", async () => {
    await prepare();

    expect(await checkPasswordResetCode("nessuno@example.com", "123456")).toEqual({ ok: false });
  });
});

describe("cambio password", () => {
  it("salva l'hash, brucia il codice e revoca le sessioni mobile", async () => {
    const user = seedUser("mario@example.com");
    await requestPasswordResetCode("mario@example.com", "browser");
    await flushAfter();
    const check = await checkPasswordResetCode("mario@example.com", sentCode());
    if (!check.ok) throw new Error("codice non valido");

    await applyNewPassword({
      userId: check.userId,
      codeId: check.codeId,
      password: "nuova-password",
    });

    // Le tre scritture stanno in una transazione sola.
    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0]).toHaveLength(3);

    const { prisma } = jest.requireMock("@/db/prisma");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { password: await hash("nuova-password") },
    });
    expect(prisma.mobileAccessToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
    expect(prisma.passwordResetCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: check.codeId },
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
  });
});
