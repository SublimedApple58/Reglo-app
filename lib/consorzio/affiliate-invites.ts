import { prisma } from "@/db/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Inviti al titolare di un'autoscuola consorziata (REG-454).
 *
 * La regola che complica tutto sta nei dati veri: le 37 consorziate in
 * produzione hanno **24 email distinte** — `amministrazione@autoscuola2go.it`
 * copre cinque sedi ODOS. `User.email` è unique, quindi non esiste "un account
 * per scuola": esiste **un titolare con più sedi**, cioè un utente con più
 * membership, esattamente quello che lo switcher "Le tue sedi" già mostra.
 *
 * Conseguenza operativa: invitare una sede significa preparare l'invito per
 * TUTTE le sedi di quel titolare dentro quel consorzio, e mandare **una sola**
 * mail. Quando accetta, le membership nascono tutte insieme
 * (`attachSiblingAffiliateInvites`).
 */

export const INVITE_TTL_DAYS = 7;

/** Sedi dello stesso consorzio che condividono l'email di questa scuola. */
export async function siblingSchoolsForEmail(input: {
  consorzioCompanyId: string;
  email: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email) return [];

  const schools = await prisma.consorzioSchool.findMany({
    where: {
      consorzioCompanyId: input.consorzioCompanyId,
      status: { not: "removed" },
      linkedCompanyId: { not: null },
    },
    select: { id: true, name: true, email: true, linkedCompanyId: true },
  });

  return schools.filter((school) => (school.email ?? "").trim().toLowerCase() === email);
}

/**
 * Crea o rinfresca l'invito per una company. Non manda niente: l'invio è del
 * chiamante, che manda UNA mail per tutto il gruppo.
 */
export async function upsertOwnerInvite(input: {
  companyId: string;
  email: string;
  invitedById: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  const email = input.email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const existing = await db.companyInvite.findFirst({
    where: { companyId: input.companyId, email, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    // Stesso token: un link già mandato su WhatsApp deve continuare a valere.
    return db.companyInvite.update({
      where: { id: existing.id },
      data: { expiresAt, role: "admin", autoscuolaRole: "OWNER" },
      select: { id: true, token: true, email: true, expiresAt: true },
    });
  }

  return db.companyInvite.create({
    data: {
      companyId: input.companyId,
      email,
      role: "admin",
      autoscuolaRole: "OWNER",
      token: crypto.randomUUID(),
      status: "pending",
      // L'app mobile non c'entra: la consorziata è web-only in fase 1.
      platform: null,
      expiresAt,
      invitedById: input.invitedById,
    },
    select: { id: true, token: true, email: true, expiresAt: true },
  });
}

/**
 * Dopo che un invito è stato accettato: aggancia al nuovo utente TUTTE le
 * altre sedi consorziate che lo aspettavano con la stessa email.
 *
 * Tocca solo inviti pendenti verso company con `limits.affiliateOf`: un invito
 * normale (istruttore, segreteria, un'altra autoscuola) non viene mai
 * risucchiato qui dentro.
 */
export async function attachSiblingAffiliateInvites(input: {
  userId: string;
  email: string;
  acceptedInviteId: string;
}): Promise<number> {
  const email = input.email.trim().toLowerCase();
  if (!email) return 0;

  const pending = await prisma.companyInvite.findMany({
    where: {
      email,
      status: "pending",
      id: { not: input.acceptedInviteId },
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      companyId: true,
      role: true,
      autoscuolaRole: true,
      company: {
        select: {
          services: {
            where: { serviceKey: "AUTOSCUOLE" },
            select: { limits: true },
          },
        },
      },
    },
  });

  const affiliateInvites = pending.filter((invite) => {
    const limits = (invite.company.services[0]?.limits ?? {}) as Record<string, unknown>;
    return typeof limits.affiliateOf === "string" && limits.affiliateOf.trim().length > 0;
  });
  if (affiliateInvites.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const invite of affiliateInvites) {
      const existing = await tx.companyMember.findFirst({
        where: { companyId: invite.companyId, userId: input.userId },
        select: { companyId: true },
      });
      if (!existing) {
        await tx.companyMember.create({
          data: {
            companyId: invite.companyId,
            userId: input.userId,
            role: invite.role,
            autoscuolaRole: "OWNER",
          },
        });
      }
      await tx.companyInvite.update({
        where: { id: invite.id },
        data: { status: "accepted" },
      });
    }
  });

  return affiliateInvites.length;
}
