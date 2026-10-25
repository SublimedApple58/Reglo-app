import "server-only";

import type { RoundInteraction, RoundInvestor } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { dbDateToYmd } from "@/lib/finance/finance-math";
import {
  isOneOf,
  LEAD_ROLES,
  PRIORITIES,
  ROUND_CATEGORIES,
  ROUND_CHANNELS,
  ROUND_OWNERS,
  ROUND_STATUSES,
  INTERACTION_KINDS,
  type InteractionKind,
  type LeadRole,
  type RoundCategory,
  type RoundChannel,
  type RoundOwner,
  type RoundPriority,
  type RoundStatus,
} from "@/lib/round/round-constants";

/**
 * Letture del Round pre-seed. Solo da pagine sotto il layout del backoffice o
 * da action che passano da `requireGlobalAdmin`: i dati sono riservati.
 */

export type RoundInfo = { id: string; name: string; targetCents: number };

export type RoundInvestorRow = {
  id: string;
  name: string;
  organization: string | null;
  category: RoundCategory;
  subcategory: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  channel: RoundChannel | null;
  channelDetail: string | null;
  owner: RoundOwner | null;
  status: RoundStatus;
  blockedReason: string | null;
  leadRole: LeadRole | null;
  priority: RoundPriority | null;
  ticket: string | null;
  fit: string | null;
  source: string | null;
  notes: string | null;
  commitmentCents: number | null;
  lastContactOn: string | null;
  nextStepOn: string | null;
  nextStepNote: string | null;
  contactedOn: string | null;
  respondedOn: string | null;
  callOn: string | null;
  interestedOn: string | null;
  committedOn: string | null;
  excluded: boolean;
  excludedOn: string | null;
  excludedReason: string | null;
  updatedByName: string | null;
  updatedAt: string;
};

export type RoundInteractionRow = {
  id: string;
  occurredOn: string;
  kind: InteractionKind;
  body: string;
  authorName: string | null;
  createdAt: string;
};

const ymdOrNull = (d: Date | null) => (d ? dbDateToYmd(d) : null);
const pick = <T extends string>(list: readonly T[], value: string | null): T | null =>
  isOneOf(list, value) ? value : null;

export function toInvestorRow(r: RoundInvestor): RoundInvestorRow {
  return {
    id: r.id,
    name: r.name,
    organization: r.organization,
    category: pick(ROUND_CATEGORIES, r.category) ?? "altro",
    subcategory: r.subcategory,
    city: r.city,
    email: r.email,
    phone: r.phone,
    linkedinUrl: r.linkedinUrl,
    websiteUrl: r.websiteUrl,
    channel: pick(ROUND_CHANNELS, r.channel),
    channelDetail: r.channelDetail,
    owner: pick(ROUND_OWNERS, r.owner),
    status: pick(ROUND_STATUSES, r.status) ?? "da_contattare",
    blockedReason: r.blockedReason,
    leadRole: pick(LEAD_ROLES, r.leadRole),
    priority: pick(PRIORITIES, r.priority),
    ticket: r.ticket,
    fit: r.fit,
    source: r.source,
    notes: r.notes,
    commitmentCents: r.commitmentCents,
    lastContactOn: ymdOrNull(r.lastContactOn),
    nextStepOn: ymdOrNull(r.nextStepOn),
    nextStepNote: r.nextStepNote,
    contactedOn: ymdOrNull(r.contactedOn),
    respondedOn: ymdOrNull(r.respondedOn),
    callOn: ymdOrNull(r.callOn),
    interestedOn: ymdOrNull(r.interestedOn),
    committedOn: ymdOrNull(r.committedOn),
    excluded: r.excludedAt !== null,
    excludedOn: r.excludedAt ? r.excludedAt.toISOString().slice(0, 10) : null,
    excludedReason: r.excludedReason,
    updatedByName: r.updatedByName,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toInteractionRow(i: RoundInteraction): RoundInteractionRow {
  return {
    id: i.id,
    occurredOn: dbDateToYmd(i.occurredOn),
    kind: pick(INTERACTION_KINDS, i.kind) ?? "nota",
    body: i.body,
    authorName: i.authorName,
    createdAt: i.createdAt.toISOString(),
  };
}

/** Il round in corso: il primo creato (oggi ce n'è uno solo). */
export async function getActiveRound(): Promise<RoundInfo | null> {
  const round = await prisma.fundraisingRound.findFirst({ orderBy: { createdAt: "asc" } });
  return round ? { id: round.id, name: round.name, targetCents: round.targetCents } : null;
}

export async function listRoundInvestors(roundId: string): Promise<RoundInvestorRow[]> {
  const rows = await prisma.roundInvestor.findMany({
    where: { roundId },
    orderBy: [{ name: "asc" }],
  });
  return rows.map(toInvestorRow);
}

export type RecentInteraction = RoundInteractionRow & { investorId: string; investorName: string };

/** Le ultime cose successe nel round (per la dashboard). */
export async function listRecentInteractions(roundId: string, take = 8): Promise<RecentInteraction[]> {
  const rows = await prisma.roundInteraction.findMany({
    where: { investor: { roundId } },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take,
    include: { investor: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({ ...toInteractionRow(r), investorId: r.investor.id, investorName: r.investor.name }));
}
