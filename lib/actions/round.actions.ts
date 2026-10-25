"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { getBackofficeIdentity } from "@/lib/backoffice-auth";
import { formatError } from "@/lib/utils";
import { dbDateToYmd, isYmd, todayYmdRome, ymdToDbDate } from "@/lib/finance/finance-math";
import {
  LEAD_ROLES,
  MANUAL_INTERACTION_KINDS,
  OWNER_LABEL,
  PRIORITIES,
  ROUND_CATEGORIES,
  ROUND_CHANNELS,
  ROUND_OWNERS,
  ROUND_STATUSES,
  STATUS_LABEL,
  milestonesAfterStatus,
  type Milestones,
  type RoundOwner,
  type RoundStatus,
} from "@/lib/round/round-constants";
import {
  getActiveRound,
  toInteractionRow,
  toInvestorRow,
  type RoundInteractionRow,
  type RoundInvestorRow,
} from "@/lib/round/round-data";

/**
 * Scritture del Round pre-seed. Ogni azione ripete `requireGlobalAdmin`: il
 * layout del backoffice protegge le pagine, non le action.
 */

const ymd = z.string().refine(isYmd, "Data non valida");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));
const url = text(500);

async function authorName() {
  const identity = await getBackofficeIdentity();
  if (!identity) throw new Error("Accesso al backoffice scaduto.");
  return identity.kind === "personal" ? identity.name : "Accesso condiviso";
}

const dateOrNull = (value: string | null) => (value ? ymdToDbDate(value) : null);

const milestonesOf = (r: {
  contactedOn: Date | null;
  respondedOn: Date | null;
  callOn: Date | null;
  interestedOn: Date | null;
  committedOn: Date | null;
}): Milestones => ({
  contactedOn: r.contactedOn ? dbDateToYmd(r.contactedOn) : null,
  respondedOn: r.respondedOn ? dbDateToYmd(r.respondedOn) : null,
  callOn: r.callOn ? dbDateToYmd(r.callOn) : null,
  interestedOn: r.interestedOn ? dbDateToYmd(r.interestedOn) : null,
  committedOn: r.committedOn ? dbDateToYmd(r.committedOn) : null,
});

const milestonesData = (m: Milestones) => ({
  contactedOn: dateOrNull(m.contactedOn),
  respondedOn: dateOrNull(m.respondedOn),
  callOn: dateOrNull(m.callOn),
  interestedOn: dateOrNull(m.interestedOn),
  committedOn: dateOrNull(m.committedOn),
});

const statusLine = (from: RoundStatus | null, to: RoundStatus) =>
  from ? `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}` : `Stato: ${STATUS_LABEL[to]}`;

const asStatus = (value: string) => value as RoundStatus;

// ── Letture ───────────────────────────────────────────────────────────────────

export async function getRoundInvestorDetail(input: { id: string }) {
  try {
    await requireGlobalAdmin();
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    const investor = await prisma.roundInvestor.findUnique({
      where: { id },
      include: { interactions: { orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }] } },
    });
    if (!investor) throw new Error("Investitore non trovato.");
    return {
      success: true as const,
      data: {
        investor: toInvestorRow(investor) as RoundInvestorRow,
        interactions: investor.interactions.map(toInteractionRow) as RoundInteractionRow[],
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Modifiche veloci dalla lista ──────────────────────────────────────────────

const quickSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(ROUND_STATUSES).optional(),
  owner: z.enum(ROUND_OWNERS).nullable().optional(),
});

/** Stato o «chi se ne occupa» con un clic. Il cambio di stato finisce nello storico. */
export async function quickUpdateRoundInvestor(input: z.input<typeof quickSchema>) {
  try {
    await requireGlobalAdmin();
    const data = quickSchema.parse(input);
    const author = await authorName();
    const today = todayYmdRome();

    await prisma.$transaction(async (tx) => {
      const current = await tx.roundInvestor.findUniqueOrThrow({ where: { id: data.id } });
      const update: Prisma.RoundInvestorUpdateInput = { updatedByName: author };
      const logs: string[] = [];

      if (data.status && data.status !== current.status) {
        Object.assign(update, milestonesData(milestonesAfterStatus(milestonesOf(current), data.status, today)));
        update.status = data.status;
        if (data.status !== "bloccato") update.blockedReason = null;
        logs.push(statusLine(asStatus(current.status), data.status));
      }
      if (data.owner !== undefined && data.owner !== current.owner) {
        update.owner = data.owner;
        logs.push(`Se ne occupa: ${data.owner ? OWNER_LABEL[data.owner] : "nessuno"}`);
      }
      if (!logs.length) return;

      await tx.roundInvestor.update({ where: { id: data.id }, data: update });
      await tx.roundInteraction.create({
        data: {
          investorId: data.id,
          occurredOn: ymdToDbDate(today),
          kind: "stato",
          body: logs.join(" · "),
          authorName: author,
        },
      });
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Scheda ────────────────────────────────────────────────────────────────────

const investorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Scrivi il nome").max(200),
  organization: text(200),
  category: z.enum(ROUND_CATEGORIES),
  subcategory: text(120),
  city: text(120),
  email: text(200),
  phone: text(60),
  linkedinUrl: url,
  websiteUrl: url,
  channel: z.enum(ROUND_CHANNELS).nullable(),
  channelDetail: text(500),
  owner: z.enum(ROUND_OWNERS).nullable(),
  status: z.enum(ROUND_STATUSES),
  blockedReason: text(500),
  leadRole: z.enum(LEAD_ROLES).nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  ticket: text(200),
  fit: text(2000),
  source: text(1000),
  notes: text(5000),
  commitmentCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  lastContactOn: ymd.nullable(),
  nextStepOn: ymd.nullable(),
  nextStepNote: text(500),
});

export async function saveRoundInvestor(input: z.input<typeof investorSchema>) {
  try {
    await requireGlobalAdmin();
    const data = investorSchema.parse(input);
    if (data.status === "bloccato" && !data.blockedReason) {
      throw new Error("Scrivi cosa lo blocca.");
    }
    if (data.status === "impegno" && !data.commitmentCents) {
      throw new Error("Per un impegno serve l'importo.");
    }
    const author = await authorName();
    const today = todayYmdRome();

    const fields = {
      name: data.name,
      organization: data.organization,
      category: data.category,
      subcategory: data.subcategory,
      city: data.city,
      email: data.email,
      phone: data.phone,
      linkedinUrl: data.linkedinUrl,
      websiteUrl: data.websiteUrl,
      channel: data.channel,
      channelDetail: data.channelDetail,
      owner: data.owner,
      status: data.status,
      blockedReason: data.status === "bloccato" ? data.blockedReason : null,
      leadRole: data.leadRole,
      priority: data.priority,
      ticket: data.ticket,
      fit: data.fit,
      source: data.source,
      notes: data.notes,
      commitmentCents: data.commitmentCents,
      lastContactOn: dateOrNull(data.lastContactOn),
      nextStepOn: dateOrNull(data.nextStepOn),
      nextStepNote: data.nextStepNote,
      updatedByName: author,
    };

    const id = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const current = await tx.roundInvestor.findUniqueOrThrow({ where: { id: data.id } });
        const statusChanged = current.status !== data.status;
        const ownerChanged = current.owner !== data.owner;
        const milestones = statusChanged
          ? milestonesData(milestonesAfterStatus(milestonesOf(current), data.status, today))
          : {};
        await tx.roundInvestor.update({ where: { id: data.id }, data: { ...fields, ...milestones } });
        const logs: string[] = [];
        if (statusChanged) logs.push(statusLine(asStatus(current.status), data.status));
        if (ownerChanged)
          logs.push(`Se ne occupa: ${data.owner ? OWNER_LABEL[data.owner as RoundOwner] : "nessuno"}`);
        if (logs.length) {
          await tx.roundInteraction.create({
            data: {
              investorId: data.id,
              occurredOn: ymdToDbDate(today),
              kind: "stato",
              body: logs.join(" · "),
              authorName: author,
            },
          });
        }
        return data.id;
      }

      const round = await getActiveRound();
      if (!round) throw new Error("Nessun round attivo.");
      const empty: Milestones = {
        contactedOn: null,
        respondedOn: null,
        callOn: null,
        interestedOn: null,
        committedOn: null,
      };
      const created = await tx.roundInvestor.create({
        data: {
          ...fields,
          ...milestonesData(milestonesAfterStatus(empty, data.status, data.lastContactOn ?? today)),
          roundId: round.id,
        },
      });
      await tx.roundInteraction.create({
        data: {
          investorId: created.id,
          occurredOn: ymdToDbDate(today),
          kind: "stato",
          body: `Aggiunto al round · ${statusLine(null, data.status)}`,
          authorName: author,
        },
      });
      return created.id;
    });
    return { success: true as const, data: { id } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Esclusione ────────────────────────────────────────────────────────────────

export async function excludeRoundInvestor(input: { id: string; reason: string }) {
  try {
    await requireGlobalAdmin();
    const data = z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3, "Scrivi il motivo dell'esclusione").max(500),
      })
      .parse(input);
    const author = await authorName();
    await prisma.$transaction([
      prisma.roundInvestor.update({
        where: { id: data.id },
        data: { excludedAt: new Date(), excludedReason: data.reason, updatedByName: author },
      }),
      prisma.roundInteraction.create({
        data: {
          investorId: data.id,
          occurredOn: ymdToDbDate(todayYmdRome()),
          kind: "stato",
          body: `Escluso: ${data.reason}`,
          authorName: author,
        },
      }),
    ]);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function readmitRoundInvestor(input: { id: string }) {
  try {
    await requireGlobalAdmin();
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    const author = await authorName();
    await prisma.$transaction([
      prisma.roundInvestor.update({
        where: { id },
        data: { excludedAt: null, excludedReason: null, updatedByName: author },
      }),
      prisma.roundInteraction.create({
        data: {
          investorId: id,
          occurredOn: ymdToDbDate(todayYmdRome()),
          kind: "stato",
          body: "Riammesso nel round",
          authorName: author,
        },
      }),
    ]);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Storico ───────────────────────────────────────────────────────────────────

const interactionSchema = z.object({
  investorId: z.string().uuid(),
  kind: z.enum(MANUAL_INTERACTION_KINDS as [string, ...string[]]),
  occurredOn: ymd,
  body: z.string().trim().min(1, "Scrivi cosa è successo").max(5000),
});

/**
 * Una voce di storico. Un contatto aggiorna «ultimo contatto»; una risposta o
 * una call segnano anche la tappa dell'imbuto (lo stato non cambia da solo).
 */
export async function addRoundInteraction(input: z.input<typeof interactionSchema>) {
  try {
    await requireGlobalAdmin();
    const data = interactionSchema.parse(input);
    const author = await authorName();
    await prisma.$transaction(async (tx) => {
      const current = await tx.roundInvestor.findUniqueOrThrow({ where: { id: data.investorId } });
      const update: Prisma.RoundInvestorUpdateInput = {};
      if (data.kind !== "nota") {
        const last = current.lastContactOn ? dbDateToYmd(current.lastContactOn) : null;
        if (!last || data.occurredOn > last) update.lastContactOn = ymdToDbDate(data.occurredOn);
        const implied: RoundStatus =
          data.kind === "call" ? "call" : data.kind === "risposta" ? "risposto" : "contattato";
        Object.assign(
          update,
          milestonesData(milestonesAfterStatus(milestonesOf(current), implied, data.occurredOn, { onlyAdd: true })),
        );
      }
      await tx.roundInteraction.create({
        data: {
          investorId: data.investorId,
          occurredOn: ymdToDbDate(data.occurredOn),
          kind: data.kind,
          body: data.body,
          authorName: author,
        },
      });
      await tx.roundInvestor.update({
        where: { id: data.investorId },
        data: { ...update, updatedByName: author },
      });
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteRoundInteraction(input: { id: string }) {
  try {
    await requireGlobalAdmin();
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    await prisma.roundInteraction.delete({ where: { id } });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
