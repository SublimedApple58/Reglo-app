"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { getBackofficeIdentity } from "@/lib/backoffice-auth";
import { formatError } from "@/lib/utils";
import { listFinanceCompanies } from "@/lib/finance/finance-data";
import { isYmd, todayYmdRome, ymdToDbDate } from "@/lib/finance/finance-math";

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
    await prisma.financeEntry.delete({ where: { id } });
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
