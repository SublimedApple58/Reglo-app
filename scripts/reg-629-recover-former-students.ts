/**
 * REG-629 — recupera come «ex allievi» gli account eliminati PRIMA della feature.
 *
 * Fino a REG-629 la cancellazione (dall'app o dall'ufficio) toglieva il legame
 * allievo–autoscuola e sovrascriveva il nome con «Account eliminato»: guide e
 * pagamenti restavano nel DB, ma l'ufficio non vedeva più chi doveva pagare.
 * Questo script ricrea la riga `AutoscuolaFormerStudent` per ogni account
 * eliminato di cui si ricostruisce l'autoscuola:
 *
 * - autoscuola: dalle guide dell'allievo. Chi non ha nemmeno una guida in
 *   quell'autoscuola non si recupera (decisione di Tiziano, 2026-10-22): senza
 *   storico l'ufficio non avrebbe niente da riconoscere né da incassare. Le
 *   guide tolte come pulizia (`record_cleanup`) non contano, come nella scheda;
 * - motivo: dal registro (self_delete → «Ha eliminato l'account»,
 *   directory_removal → «Rimosso dall'ufficio»), altrimenti «unknown»;
 * - nome: solo se sopravvive nelle notifiche all'ufficio (`studentName`);
 *   altrimenti resta vuoto e l'ufficio lo assegna dalla scheda («Assegna nome»);
 * - percorso patente: dall'ultimo `AutoscuolaLicensePath` in quell'autoscuola.
 *
 * Idempotente: crea solo le righe che mancano (`skipDuplicates`), non tocca mai
 * una riga esistente — un nome già assegnato dall'ufficio resta com'è.
 * Senza `--apply` non scrive niente: stampa solo i conteggi.
 *
 * Su prod serve anche `--prod` (ok di Tiziano al rilascio, 2026-10-22).
 *
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/reg-629-recover-former-students.ts          # prova
 *   ... scripts/reg-629-recover-former-students.ts --apply        # scrive
 */

import { PrismaClient } from "@prisma/client";

const DELETED_USER_NAME = "Account eliminato";
const apply = process.argv.includes("--apply");

const REASON_BY_TRIGGER: Record<string, string> = {
  self_delete: "self_delete",
  directory_removal: "office_removed",
};

const realName = (name: string | null | undefined) => {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || trimmed === DELETED_USER_NAME || trimmed === "NO_NAME") return null;
  return trimmed;
};

async function main() {
  const prisma = new PrismaClient();
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\/.*$/, "");
  if (/prod/i.test(process.env.DOTENV_CONFIG_PATH ?? "") && !process.argv.includes("--prod")) {
    throw new Error("REG-629: su prod serve anche --prod.");
  }
  console.log(`→ ${apply ? "ESECUZIONE" : "PROVA (nessuna scrittura)"} su ${host}`);

  try {
    const deleted = await prisma.user.findMany({
      where: { role: "deleted" },
      select: { id: true, updatedAt: true },
    });
    const ids = deleted.map((u) => u.id);
    const updatedAtById = new Map(deleted.map((u) => [u.id, u.updatedAt]));

    const [lessonPairs, audits, notifications, paths, existing, members] = await Promise.all([
      prisma.autoscuolaAppointment.groupBy({
        by: ["companyId", "studentId"],
        where: {
          studentId: { in: ids },
          OR: [{ cancellationKind: null }, { cancellationKind: { not: "record_cleanup" } }],
        },
        _min: { createdAt: true },
      }),
      prisma.accountDeletionAudit.findMany({
        where: { deletedUserId: { in: ids } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.autoscuolaNotification.findMany({
        where: { studentId: { in: ids }, studentName: { not: null } },
        select: { companyId: true, studentId: true, studentName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.autoscuolaLicensePath.findMany({
        where: { studentId: { in: ids } },
        select: { companyId: true, studentId: true, licenseCategory: true, transmission: true, startedAt: true },
        orderBy: { startedAt: "desc" },
      }),
      // In prova la tabella può non esserci ancora (staging prima del
      // migrate): si conta come vuota. In esecuzione l'errore resta.
      prisma.autoscuolaFormerStudent
        .findMany({
          where: { userId: { in: ids } },
          select: { companyId: true, userId: true },
        })
        .catch((error: { code?: string }) => {
          if (apply || error.code !== "P2021") throw error;
          console.log("  (tabella AutoscuolaFormerStudent assente: migrazione non ancora applicata)");
          return [] as Array<{ companyId: string; userId: string }>;
        }),
      prisma.companyMember.findMany({
        where: { userId: { in: ids } },
        select: { companyId: true, userId: true },
      }),
    ]);

    const key = (companyId: string, userId: string) => `${companyId}:${userId}`;
    type Candidate = { companyId: string; userId: string; joinedAt: Date | null };
    const candidates = new Map<string, Candidate>();
    for (const p of lessonPairs) {
      if (!p.studentId) continue;
      candidates.set(key(p.companyId, p.studentId), {
        companyId: p.companyId,
        userId: p.studentId,
        joinedAt: p._min.createdAt ?? null,
      });
    }
    const auditByUser = new Map<string, (typeof audits)[number]>();
    // Il registro dà solo il motivo e la data: non aggiunge autoscuole.
    for (const a of audits) {
      if (!auditByUser.has(a.deletedUserId)) auditByUser.set(a.deletedUserId, a);
    }
    const nameByPair = new Map<string, string>();
    for (const n of notifications) {
      const name = realName(n.studentName);
      if (n.studentId && name && !nameByPair.has(key(n.companyId, n.studentId))) {
        nameByPair.set(key(n.companyId, n.studentId), name);
      }
    }
    const pathByPair = new Map<string, (typeof paths)[number]>();
    for (const p of paths) {
      if (!pathByPair.has(key(p.companyId, p.studentId))) pathByPair.set(key(p.companyId, p.studentId), p);
    }
    const skip = new Set([
      ...existing.map((e) => key(e.companyId, e.userId)),
      ...members.map((m) => key(m.companyId, m.userId)),
    ]);

    const rows = [...candidates.entries()]
      .filter(([k]) => !skip.has(k))
      .map(([k, c]) => {
        const audit = auditByUser.get(c.userId);
        const path = pathByPair.get(k);
        return {
          companyId: c.companyId,
          userId: c.userId,
          name: nameByPair.get(k) ?? null,
          reason: (audit && REASON_BY_TRIGGER[audit.trigger]) ?? "unknown",
          leftAt: audit?.createdAt ?? updatedAtById.get(c.userId) ?? new Date(),
          actorUserId: audit?.actorUserId ?? null,
          joinedAt: c.joinedAt ?? path?.startedAt ?? null,
          licenseCategory: path?.licenseCategory ?? null,
          transmission: path?.transmission ?? null,
        };
      });

    const byReason = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.reason] = (acc[r.reason] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`  account eliminati:          ${ids.length}`);
    console.log(`  coppie autoscuola–allievo:  ${candidates.size}`);
    console.log(`  già presenti / rientrati:   ${candidates.size - rows.length}`);
    console.log(`  da creare:                  ${rows.length}`, byReason);
    console.log(`    con nome recuperato:      ${rows.filter((r) => r.name).length}`);
    console.log(`    senza nome (assegna nome): ${rows.filter((r) => !r.name).length}`);
    console.log(`  autoscuole coinvolte:       ${new Set(rows.map((r) => r.companyId)).size}`);
    const companies = await prisma.company.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.companyId))] } },
      select: { id: true, name: true },
    });
    const companyName = new Map(companies.map((c) => [c.id, c.name]));
    const perCompany = new Map<string, { total: number; named: number }>();
    for (const r of rows) {
      const entry = perCompany.get(r.companyId) ?? { total: 0, named: 0 };
      entry.total += 1;
      if (r.name) entry.named += 1;
      perCompany.set(r.companyId, entry);
    }
    for (const [id, c] of [...perCompany.entries()].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`    ${companyName.get(id) ?? id}: ${c.total} (con nome ${c.named})`);
    }

    if (!apply) {
      console.log("→ Prova finita. Rilancia con --apply per scrivere.");
      return;
    }
    const res = await prisma.autoscuolaFormerStudent.createMany({ data: rows, skipDuplicates: true });
    console.log(`→ Create ${res.count} righe ex allievo.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
