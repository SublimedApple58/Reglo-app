/**
 * REG-629: ex allievi. La cancellazione (dall'app o dall'ufficio) deve lasciare
 * all'autoscuola nome, motivo e percorso dell'allievo PRIMA di togliere il
 * legame, e anonimizzare tutto il resto (contatti, login, foto, firma).
 */

const r2Send = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/storage/r2", () => ({
  getR2Client: () => ({ send: r2Send }),
  getR2Bucket: () => "bucket",
}));
jest.mock("@/lib/autoscuole/operational-cancellation", () => ({
  cancelOpenLessonsForDeletedStudent: jest.fn().mockResolvedValue({ cancelled: 2 }),
}));

type Member = {
  companyId: string;
  userId: string;
  autoscuolaRole: string;
  createdAt: Date;
  licenseCategory: string | null;
  transmission: string | null;
};
type Former = { companyId: string; userId: string; [k: string]: unknown };

const db = {
  user: { id: "u1", email: "mario@example.com", name: "Mario Rossi", image: "users/u1/photo.jpg", signatureKey: "users/u1/signature.png" },
  members: [] as Member[],
  formers: [] as Former[],
  calls: [] as string[],
  userUpdate: null as null | Record<string, unknown>,
};

const tx = {
  mobileAccessToken: { deleteMany: jest.fn() },
  mobilePushDevice: { deleteMany: jest.fn() },
  session: { deleteMany: jest.fn() },
  account: { deleteMany: jest.fn() },
  companyInvite: { updateMany: jest.fn() },
  autoscuolaInstructor: { updateMany: jest.fn() },
  companyMember: {
    findMany: jest.fn(async ({ where }: { where: { userId: string; autoscuolaRole: string; companyId?: { in: string[] } } }) =>
      db.members
        .filter(
          (m) =>
            m.userId === where.userId &&
            m.autoscuolaRole === where.autoscuolaRole &&
            (!where.companyId || where.companyId.in.includes(m.companyId)),
        )
        .map((m) => ({ ...m, user: { name: db.user.name } })),
    ),
    deleteMany: jest.fn(async () => {
      db.calls.push("companyMember.deleteMany");
      db.members = [];
    }),
  },
  autoscuolaFormerStudent: {
    upsert: jest.fn(
      async ({ where, create, update }: { where: { companyId_userId: { companyId: string; userId: string } }; create: Former; update: Record<string, unknown> }) => {
        db.calls.push("formerStudent.upsert");
        const { companyId, userId } = where.companyId_userId;
        const existing = db.formers.find((f) => f.companyId === companyId && f.userId === userId);
        if (existing) Object.assign(existing, update);
        else db.formers.push({ ...create });
      },
    ),
  },
  user: {
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.userUpdate = data;
    }),
  },
};

jest.mock("@/db/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(async () => db.user) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    accountDeletionAudit: { create: jest.fn() },
  },
}));

import { deleteAndAnonymizeUserAccount } from "@/lib/account-deletion";
import {
  archiveFormerStudentMemberships,
  asFormerStudentReason,
  realStudentName,
} from "@/lib/autoscuole/former-students";

const member = (companyId: string, role = "STUDENT"): Member => ({
  companyId,
  userId: "u1",
  autoscuolaRole: role,
  createdAt: new Date("2026-03-01T09:00:00Z"),
  licenseCategory: "B",
  transmission: "manual",
});

beforeEach(() => {
  db.user.name = "Mario Rossi";
  db.members = [];
  db.formers = [];
  db.calls = [];
  db.userUpdate = null;
  r2Send.mockClear();
});

describe("realStudentName", () => {
  it("scarta il segnaposto dell'anonimizzazione e i nomi vuoti", () => {
    expect(realStudentName("Account eliminato")).toBeNull();
    expect(realStudentName("  ")).toBeNull();
    expect(realStudentName("NO_NAME")).toBeNull();
    expect(realStudentName(" Giulia Bianchi ")).toBe("Giulia Bianchi");
  });
});

describe("asFormerStudentReason", () => {
  it("riporta a «unknown» ogni valore non previsto", () => {
    expect(asFormerStudentReason("self_delete")).toBe("self_delete");
    expect(asFormerStudentReason("office_removed")).toBe("office_removed");
    expect(asFormerStudentReason("boh")).toBe("unknown");
    expect(asFormerStudentReason(null)).toBe("unknown");
  });
});

describe("archiveFormerStudentMemberships", () => {
  it("archivia solo le iscrizioni da ALLIEVO, con nome e percorso", async () => {
    db.members = [member("c1"), member("c2", "INSTRUCTOR")];
    const n = await archiveFormerStudentMemberships(tx as never, { userId: "u1", reason: "self_delete" });
    expect(n).toBe(1);
    expect(db.formers).toHaveLength(1);
    expect(db.formers[0]).toMatchObject({
      companyId: "c1",
      name: "Mario Rossi",
      reason: "self_delete",
      licenseCategory: "B",
      transmission: "manual",
    });
  });

  it("limita l'archiviazione alle autoscuole indicate (rimozione dall'ufficio)", async () => {
    db.members = [member("c1"), member("c2")];
    await archiveFormerStudentMemberships(tx as never, {
      userId: "u1",
      reason: "office_removed",
      companyIds: ["c2"],
    });
    expect(db.formers.map((f) => f.companyId)).toEqual(["c2"]);
  });

  it("è idempotente e non cancella un nome assegnato a mano se manca quello vero", async () => {
    db.members = [member("c1")];
    db.formers = [{ companyId: "c1", userId: "u1", name: "Nome assegnato", reason: "unknown" }];
    db.user.name = "Account eliminato";
    await archiveFormerStudentMemberships(tx as never, { userId: "u1", reason: "self_delete" });
    expect(db.formers).toHaveLength(1);
    expect(db.formers[0]).toMatchObject({ name: "Nome assegnato", reason: "self_delete" });
  });
});

describe("deleteAndAnonymizeUserAccount (REG-629)", () => {
  it("scrive l'ex allievo PRIMA di togliere il legame con l'autoscuola", async () => {
    db.members = [member("c1")];
    await deleteAndAnonymizeUserAccount("u1", { trigger: "self_delete", actorUserId: "u1" });
    expect(db.calls).toEqual(["formerStudent.upsert", "companyMember.deleteMany"]);
    expect(db.formers[0]).toMatchObject({ companyId: "c1", name: "Mario Rossi", reason: "self_delete" });
  });

  it("la rimozione dalla Directory diventa «Rimosso dall'ufficio»", async () => {
    db.members = [member("c1")];
    await deleteAndAnonymizeUserAccount("u1", { trigger: "directory_removal", actorUserId: "owner" });
    expect(db.formers[0]).toMatchObject({ reason: "office_removed", actorUserId: "owner" });
  });

  it("anonimizza contatti, login, foto e firma e cancella i file", async () => {
    db.members = [member("c1")];
    await deleteAndAnonymizeUserAccount("u1", { trigger: "self_delete" });
    expect(db.userUpdate).toMatchObject({
      name: "Account eliminato",
      email: "deleted+u1@deleted.reglo.local",
      phone: null,
      password: null,
      image: null,
      signatureKey: null,
    });
    const keys = r2Send.mock.calls.map(([cmd]) => (cmd as { input: { Key: string } }).input.Key);
    expect(keys).toEqual(["users/u1/photo.jpg", "users/u1/signature.png"]);
  });
});
