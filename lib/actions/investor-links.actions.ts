"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";

// Gestione dei link "KPI per investor" dal backoffice: creare, vedere quante
// volte sono stati aperti, revocare. Un link per destinatario.

export type InvestorLinkDTO = {
  id: string;
  token: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
};

const createSchema = z.object({
  label: z.string().trim().min(1, "Dai un nome al destinatario.").max(80),
  /** Giorni di validità; 0 o assente = non scade. */
  expiresInDays: z.number().int().min(0).max(365).optional(),
});

const toDto = (row: {
  id: string;
  token: string;
  label: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
}): InvestorLinkDTO => ({
  id: row.id,
  token: row.token,
  label: row.label,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
  revokedAt: row.revokedAt?.toISOString() ?? null,
  viewCount: row.viewCount,
  lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
});

export async function listInvestorLinks() {
  try {
    await requireGlobalAdmin();
    const rows = await prisma.investorKpiLink.findMany({
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    });
    return { success: true as const, data: rows.map(toDto) };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function createInvestorLink(input: z.infer<typeof createSchema>) {
  try {
    await requireGlobalAdmin();
    const payload = createSchema.parse(input);
    // 32 byte di entropia in base64url: indovinarlo non è una minaccia reale.
    const token = randomBytes(32).toString("base64url");
    const expiresAt =
      payload.expiresInDays && payload.expiresInDays > 0
        ? new Date(Date.now() + payload.expiresInDays * 86_400_000)
        : null;
    const row = await prisma.investorKpiLink.create({
      data: { token, label: payload.label, expiresAt },
    });
    return { success: true as const, data: toDto(row) };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Revoca definitiva: il link smette di funzionare subito, gli altri restano vivi. */
export async function revokeInvestorLink(id: string) {
  try {
    await requireGlobalAdmin();
    const row = await prisma.investorKpiLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { success: true as const, data: toDto(row) };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
