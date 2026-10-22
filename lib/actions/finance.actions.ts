"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { getBackofficeIdentity } from "@/lib/backoffice-auth";
import { formatError } from "@/lib/utils";
import { listFinanceCompanies } from "@/lib/finance/finance-data";
import { isYmd, todayYmdRome, ymdToDbDate } from "@/lib/finance/finance-math";
import { ITALIAN_REGIONS, normalizeVatNumber } from "@/lib/finance/finance-schools";
import { monthBounds } from "@/lib/finance/finance-math";

/**
 * Scritture della sezione Finanza (REG-413). Ogni azione passa da
 * `requireGlobalAdmin`: sono i conti di Reglo, solo il backoffice li tocca.
 */

const ymd = z.string().refine(isYmd, "Data non valida");
const cents = z.number().int().min(1, "Importo mancante").max(100_000_000);
const vatRate = z.number().int().min(0).max(10000).nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  date: ymd,
  description: z.string().trim().min(1, "Scrivi una descrizione").max(200),
  categoryId: z.string().uuid(),
  direction: z.enum(["in", "out"]),
  amountCents: cents,
  vatRateBps: vatRate,
  status: z.enum(["settled", "due", "planned"]),
  settledOn: ymd.nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  invoiceNumber: optionalText(60),
  notes: optionalText(1000),
});

async function assertCategory(categoryId: string, direction: "in" | "out") {
  const category = await prisma.financeCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.direction !== direction) {
    throw new Error("La categoria non corrisponde al tipo di movimento.");
  }
}

async function assertFinanceCompany(companyId: string | null | undefined) {
  if (!companyId) return;
  const companies = await listFinanceCompanies();
  if (!companies.some((c) => c.id === companyId)) {
    throw new Error("Autoscuola non valida per i conti di Reglo.");
  }
}

export async function saveFinanceEntry(input: z.input<typeof entrySchema>) {
  try {
    await requireGlobalAdmin();
    const data = entrySchema.parse(input);
    await assertCategory(data.categoryId, data.direction);
    await assertFinanceCompany(data.companyId);
    const identity = await getBackofficeIdentity();

    const settledOn =
      data.status === "settled" ? ymdToDbDate(data.settledOn ?? data.date) : null;
    const payload = {
      date: ymdToDbDate(data.date),
      description: data.description,
      categoryId: data.categoryId,
      direction: data.direction,
      amountCents: data.amountCents,
      vatRateBps: data.vatRateBps,
      status: data.status,
      settledOn,
      // Le entrate sono sempre di un'autoscuola o di nessuno; le uscite mai.
      companyId: data.direction === "in" ? (data.companyId ?? null) : null,
      invoiceNumber: data.invoiceNumber,
      notes: data.notes,
    };

    if (data.id) {
      const current = await prisma.financeEntry.findUnique({
        where: { id: data.id },
        select: { salesAgentId: true, salesDealId: true },
      });
      if (current?.salesAgentId || current?.salesDealId) {
        throw new Error("È un pagamento ai sales: si modifica dalla tab Vendite.");
      }
      await prisma.financeEntry.update({ where: { id: data.id }, data: payload });
    } else {
      await prisma.financeEntry.create({
        data: {
          ...payload,
          nature: "one_off",
          createdById: identity?.kind === "personal" ? identity.adminId : null,
        },
      });
    }
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteFinanceEntry(input: { id: string }) {
  try {
    await requireGlobalAdmin();
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    await prisma.$transaction(async (tx) => {
      const entry = await tx.financeEntry.delete({ where: { id } });
      // Era il pagamento di una commissione: il contratto torna «da pagare».
      if (entry.salesDealId) {
        await tx.salesDeal.update({ where: { id: entry.salesDealId }, data: { paidOn: null } });
      }
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** «Segna incassato / pagato» con un clic, alla data di oggi o a quella scelta. */
export async function settleFinanceEntry(input: { id: string; settledOn?: string }) {
  try {
    await requireGlobalAdmin();
    const data = z.object({ id: z.string().uuid(), settledOn: ymd.optional() }).parse(input);
    await prisma.financeEntry.update({
      where: { id: data.id },
      data: { status: "settled", settledOn: ymdToDbDate(data.settledOn ?? todayYmdRome()) },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Spese fisse ─────────────────────────────────────────────────────────────

const recurringSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Dai un nome alla spesa").max(120),
    categoryId: z.string().uuid(),
    amountCents: cents,
    vatRateBps: vatRate,
    cadence: z.enum(["monthly", "quarterly", "annual"]),
    startsOn: ymd,
    endsOn: ymd.nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31),
    notes: optionalText(1000),
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: "La fine non può venire prima dell'inizio.",
  });

export async function saveRecurringExpense(input: z.input<typeof recurringSchema>) {
  try {
    await requireGlobalAdmin();
    const data = recurringSchema.parse(input);
    await assertCategory(data.categoryId, "out");
    const payload = {
      name: data.name,
      categoryId: data.categoryId,
      amountCents: data.amountCents,
      vatRateBps: data.vatRateBps,
      cadence: data.cadence,
      startsOn: ymdToDbDate(data.startsOn),
      endsOn: data.endsOn ? ymdToDbDate(data.endsOn) : null,
      dayOfMonth: data.dayOfMonth,
      notes: data.notes,
    };
    if (data.id) {
      await prisma.recurringExpense.update({ where: { id: data.id }, data: payload });
    } else {
      await prisma.recurringExpense.create({ data: payload });
    }
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function archiveRecurringExpense(input: { id: string; archived: boolean }) {
  try {
    await requireGlobalAdmin();
    const data = z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(input);
    await prisma.recurringExpense.update({
      where: { id: data.id },
      data: { archivedAt: data.archived ? new Date() : null },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Registra il pagamento di una scadenza: crea il movimento vero (uscita
 * pagata, legata alla spesa fissa). L'importo si può correggere se la bolletta
 * di questo mese è diversa dal solito.
 */
export async function payRecurringExpense(input: {
  id: string;
  date: string;
  amountCents: number;
  settledOn?: string;
}) {
  try {
    await requireGlobalAdmin();
    const data = z
      .object({ id: z.string().uuid(), date: ymd, amountCents: cents, settledOn: ymd.optional() })
      .parse(input);
    const expense = await prisma.recurringExpense.findUnique({ where: { id: data.id } });
    if (!expense) throw new Error("Spesa fissa non trovata.");
    const already = await prisma.financeEntry.findFirst({
      where: { recurringExpenseId: expense.id, date: ymdToDbDate(data.date) },
      select: { id: true },
    });
    if (already) throw new Error("Questa scadenza è già registrata.");
    const identity = await getBackofficeIdentity();
    await prisma.financeEntry.create({
      data: {
        date: ymdToDbDate(data.date),
        description: expense.name,
        categoryId: expense.categoryId,
        direction: "out",
        nature: "recurring",
        amountCents: data.amountCents,
        vatRateBps: expense.vatRateBps,
        status: "settled",
        settledOn: ymdToDbDate(data.settledOn ?? data.date),
        recurringExpenseId: expense.id,
        createdById: identity?.kind === "personal" ? identity.adminId : null,
      },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Saldo di partenza ───────────────────────────────────────────────────────

/**
 * Il saldo di cassa a una data: da lì la Panoramica calcola la cassa di oggi
 * e i mesi di autonomia. Lo scrive Tiziano dal conto, mai un valore d'esempio.
 */
export async function saveFinanceOpeningBalance(input: { balanceCents: number; date: string }) {
  try {
    await requireGlobalAdmin();
    const data = z
      .object({
        balanceCents: z.number().int().min(-100_000_000).max(1_000_000_000),
        date: ymd,
      })
      .parse(input);
    if (data.date > todayYmdRome()) throw new Error("La data del saldo non può essere nel futuro.");
    const payload = { openingBalanceCents: data.balanceCents, openingDate: ymdToDbDate(data.date) };
    await prisma.financeSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...payload },
      update: payload,
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Anagrafica commerciale delle autoscuole ─────────────────────────────────

const commercialSchema = z
  .object({
    companyId: z.string().uuid(),
    status: z.enum(["active", "paused", "churned"]),
    vatNumber: z.string().nullable().optional(),
    region: z.enum(ITALIAN_REGIONS).nullable().optional(),
    acquiredOn: ymd.nullable().optional(),
    churnedOn: ymd.nullable().optional(),
    agentId: z.string().uuid().nullable().optional(),
    notes: optionalText(1000),
  })
  .refine((v) => v.status !== "churned" || Boolean(v.churnedOn), {
    message: "Indica la data della disdetta.",
  })
  .refine((v) => !v.acquiredOn || !v.churnedOn || v.churnedOn >= v.acquiredOn, {
    message: "La disdetta non può venire prima dell'acquisizione.",
  });

export async function saveCompanyCommercial(input: z.input<typeof commercialSchema>) {
  try {
    await requireGlobalAdmin();
    const data = commercialSchema.parse(input);
    await assertFinanceCompany(data.companyId);
    if (data.agentId) {
      const agent = await prisma.salesAgent.findUnique({ where: { id: data.agentId } });
      if (!agent) throw new Error("Sales non trovato.");
    }
    const payload = {
      status: data.status,
      vatNumber: normalizeVatNumber(data.vatNumber),
      region: data.region ?? null,
      acquiredOn: data.acquiredOn ? ymdToDbDate(data.acquiredOn) : null,
      // La data di disdetta ha senso solo per una disdetta.
      churnedOn: data.status === "churned" && data.churnedOn ? ymdToDbDate(data.churnedOn) : null,
      agentId: data.agentId ?? null,
      notes: data.notes,
    };
    await prisma.companyCommercial.upsert({
      where: { companyId: data.companyId },
      create: { companyId: data.companyId, ...payload },
      update: payload,
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Vendite: sales, contratti, pagamenti ────────────────────────────────────

const bps = z.number().int().min(0).max(10000);

/** Categorie dei pagamenti ai sales (create dalla migrazione; ricreate se mancano). */
async function salesCategoryId(name: "Stipendi e compensi" | "Commissioni sales") {
  const row = await prisma.financeCategory.upsert({
    where: { name_direction: { name, direction: "out" } },
    create: { name, direction: "out", group: "persone", sortOrder: name === "Commissioni sales" ? 20 : 10 },
    update: {},
    select: { id: true },
  });
  return row.id;
}

const agentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Scrivi il nome del sales").max(120),
  email: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || z.string().email().safeParse(v).success, "Email non valida"),
  monthlyFixedCents: z.number().int().min(0).max(100_000_000),
  defaultCommissionBps: bps,
  archived: z.boolean(),
});

export async function saveSalesAgent(input: z.input<typeof agentSchema>) {
  try {
    await requireGlobalAdmin();
    const data = agentSchema.parse(input);
    const payload = {
      name: data.name,
      email: data.email,
      monthlyFixedCents: data.monthlyFixedCents,
      defaultCommissionBps: data.defaultCommissionBps,
    };
    if (data.id) {
      const current = await prisma.salesAgent.findUnique({ where: { id: data.id } });
      if (!current) throw new Error("Sales non trovato.");
      await prisma.salesAgent.update({
        where: { id: data.id },
        data: {
          ...payload,
          archivedAt: data.archived ? (current.archivedAt ?? new Date()) : null,
        },
      });
    } else {
      await prisma.salesAgent.create({ data: { ...payload, archivedAt: data.archived ? new Date() : null } });
    }
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Si cancella solo un sales senza contratti né pagamenti: altrimenti si archivia. */
export async function deleteSalesAgent(input: { id: string }) {
  try {
    await requireGlobalAdmin();
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    const [deals, payments] = await Promise.all([
      prisma.salesDeal.count({ where: { agentId: id } }),
      prisma.financeEntry.count({ where: { salesAgentId: id } }),
    ]);
    if (deals > 0 || payments > 0) {
      throw new Error("Ha contratti o pagamenti registrati: archivialo invece di cancellarlo.");
    }
    await prisma.$transaction([
      prisma.companyCommercial.updateMany({ where: { agentId: id }, data: { agentId: null } }),
      prisma.salesAgent.delete({ where: { id } }),
    ]);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const dealSchema = z
  .object({
    id: z.string().uuid().optional(),
    agentId: z.string().uuid({ message: "Scegli il sales" }),
    companyId: z.string().uuid({ message: "Scegli l'autoscuola" }),
    closedOn: ymd,
    contractValueCents: cents,
    commissionBps: bps,
    commissionCents: z.number().int().min(0).max(100_000_000),
    paidOn: ymd.nullable().optional(),
    notes: optionalText(1000),
  })
  .refine((v) => !v.paidOn || v.paidOn >= v.closedOn, {
    message: "La commissione non può essere pagata prima della firma.",
  })
  .refine((v) => !v.paidOn || v.commissionCents > 0, {
    message: "Senza commissione non c'è niente da pagare.",
  });

/**
 * Contratto firmato. La commissione matura alla firma; quando si indica
 * «pagata il» nasce (o si aggiorna) il movimento d'uscita, e la cassa scende.
 * Togliere la data cancella quel movimento.
 */
export async function saveSalesDeal(input: z.input<typeof dealSchema>) {
  try {
    await requireGlobalAdmin();
    const data = dealSchema.parse(input);
    await assertFinanceCompany(data.companyId);
    const [agent, company] = await Promise.all([
      prisma.salesAgent.findUnique({ where: { id: data.agentId } }),
      prisma.company.findUnique({ where: { id: data.companyId }, select: { name: true } }),
    ]);
    if (!agent) throw new Error("Sales non trovato.");
    if (!company) throw new Error("Autoscuola non trovata.");
    if (data.paidOn && data.paidOn > todayYmdRome()) {
      throw new Error("La data di pagamento non può essere nel futuro.");
    }
    const categoryId = data.paidOn ? await salesCategoryId("Commissioni sales") : null;
    const identity = await getBackofficeIdentity();

    await prisma.$transaction(async (tx) => {
      const payload = {
        agentId: data.agentId,
        companyId: data.companyId,
        companyName: company.name,
        closedOn: ymdToDbDate(data.closedOn),
        contractValueCents: data.contractValueCents,
        commissionBps: data.commissionBps,
        commissionCents: data.commissionCents,
        paidOn: data.paidOn ? ymdToDbDate(data.paidOn) : null,
        notes: data.notes,
      };
      const deal = data.id
        ? await tx.salesDeal.update({ where: { id: data.id }, data: payload })
        : await tx.salesDeal.create({ data: payload });

      const existing = await tx.financeEntry.findUnique({ where: { salesDealId: deal.id } });
      if (!data.paidOn) {
        if (existing) await tx.financeEntry.delete({ where: { id: existing.id } });
        return;
      }
      const entry = {
        date: ymdToDbDate(data.paidOn),
        settledOn: ymdToDbDate(data.paidOn),
        description: `Commissione ${company.name} · ${agent.name}`,
        amountCents: data.commissionCents,
      };
      if (existing) {
        await tx.financeEntry.update({ where: { id: existing.id }, data: entry });
      } else {
        await tx.financeEntry.create({
          data: {
            ...entry,
            categoryId: categoryId as string,
            direction: "out",
            nature: "one_off",
            status: "settled",
            vatRateBps: null,
            salesDealId: deal.id,
            createdById: identity?.kind === "personal" ? identity.adminId : null,
          },
        });
      }
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Cancella il contratto e, se la commissione era pagata, anche quel movimento. */
export async function deleteSalesDeal(input: { id: string }) {
  try {
    await requireGlobalAdmin();
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    await prisma.$transaction([
      prisma.financeEntry.deleteMany({ where: { salesDealId: id } }),
      prisma.salesDeal.delete({ where: { id } }),
    ]);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Registra il fisso di un mese come pagato: un movimento d'uscita con data il
 * 1° del mese a cui si riferisce (così conta in quel mese) e pagato il giorno
 * indicato (così la cassa scende quel giorno).
 */
export async function paySalesFixed(input: {
  agentId: string;
  month: string;
  amountCents: number;
  paidOn: string;
}) {
  try {
    await requireGlobalAdmin();
    const data = z
      .object({
        agentId: z.string().uuid(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        amountCents: cents,
        paidOn: ymd,
      })
      .parse(input);
    if (data.paidOn > todayYmdRome()) throw new Error("La data di pagamento non può essere nel futuro.");
    const agent = await prisma.salesAgent.findUnique({ where: { id: data.agentId } });
    if (!agent) throw new Error("Sales non trovato.");
    const { from, to } = monthBounds(data.month);
    const already = await prisma.financeEntry.findFirst({
      where: { salesAgentId: agent.id, date: { gte: ymdToDbDate(from), lte: ymdToDbDate(to) } },
      select: { id: true },
    });
    if (already) throw new Error("Il fisso di questo mese è già registrato.");
    const [categoryId, identity] = await Promise.all([
      salesCategoryId("Stipendi e compensi"),
      getBackofficeIdentity(),
    ]);
    await prisma.financeEntry.create({
      data: {
        date: ymdToDbDate(from),
        settledOn: ymdToDbDate(data.paidOn),
        description: `Fisso ${agent.name}`,
        categoryId,
        direction: "out",
        nature: "recurring",
        amountCents: data.amountCents,
        vatRateBps: null,
        status: "settled",
        salesAgentId: agent.id,
        createdById: identity?.kind === "personal" ? identity.adminId : null,
      },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
