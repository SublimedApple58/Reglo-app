"use server";

import { z } from "zod";
import { after } from "next/server";
import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { requireServiceAccess } from "@/lib/service-access";
import { GLOBAL_ADMIN_EMAIL, SERVER_URL } from "@/lib/constants";

/**
 * Centro assistenza + feedback (vedi docs/features/support-center.md).
 * Lato company: chat con il team Reglo (un thread per autoscuola, scrivono i
 * ruoli staff, non gli allievi) + invio feedback prodotto.
 * Lato backoffice: inbox delle conversazioni, risposta, elenco feedback.
 * Ogni nuovo messaggio/feedback dell'autoscuola notifica il team via email
 * (no-op su staging via externalSendsDisabled dentro sendDynamicEmail).
 */

const MESSAGE_MAX_LENGTH = 4000;
const PREVIEW_LENGTH = 140;
const THREAD_MESSAGES_LIMIT = 300;

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Il messaggio è vuoto.").max(MESSAGE_MAX_LENGTH),
});

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  message: z.string().trim().max(MESSAGE_MAX_LENGTH).optional(),
});

const backofficeReplySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1, "Il messaggio è vuoto.").max(MESSAGE_MAX_LENGTH),
});

export type SupportMessageDto = {
  id: string;
  sender: "company" | "reglo";
  senderName: string | null;
  body: string;
  createdAt: string;
};

export type BackofficeSupportThreadDto = {
  id: string;
  companyId: string;
  companyName: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadForAdmin: number;
};

export type BackofficeFeedbackDto = {
  id: string;
  companyName: string | null;
  userName: string | null;
  rating: number;
  tags: string[];
  message: string | null;
  createdAt: string;
};

function toMessageDto(message: {
  id: string;
  sender: string;
  senderName: string | null;
  body: string;
  createdAt: Date;
}): SupportMessageDto {
  return {
    id: message.id,
    sender: message.sender === "reglo" ? "reglo" : "company",
    senderName: message.senderName,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function preview(body: string) {
  return body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH - 1)}…` : body;
}

// La chat è dello staff dell'autoscuola: titolare, segretaria, istruttori.
// Gli allievi usano l'app mobile e non vedono il centro assistenza web.
async function requireSupportAccess() {
  const context = await requireServiceAccess("AUTOSCUOLE");
  if (context.membership.autoscuolaRole === "STUDENT") {
    throw new Error("Non hai accesso al centro assistenza.");
  }
  return context;
}

async function resolveSenderName(
  sessionName: string | null | undefined,
  userId: string,
) {
  if (sessionName && sessionName !== "NO_NAME") return sessionName;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return user?.name && user.name !== "NO_NAME" ? user.name : null;
}

// ── Lato company (web app) ───────────────────────────────────────────────────

/**
 * Conversazione dell'autoscuola col team Reglo. Legge gli ultimi messaggi e
 * azzera i non-letti lato company (aprire la chat = leggere). Il thread viene
 * creato solo al primo messaggio: qui un'autoscuola senza thread riceve lista
 * vuota senza scritture.
 */
export async function getSupportConversation() {
  try {
    const { membership } = await requireSupportAccess();

    const thread = await prisma.supportThread.findUnique({
      where: { companyId: membership.companyId },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: THREAD_MESSAGES_LIMIT,
        },
      },
    });

    if (!thread) {
      return { success: true, data: { messages: [] as SupportMessageDto[] } };
    }

    if (thread.unreadForCompany > 0) {
      await prisma.supportThread.update({
        where: { id: thread.id },
        data: { unreadForCompany: 0 },
      });
    }

    return {
      success: true,
      data: {
        messages: thread.messages.reverse().map(toMessageDto),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function sendSupportMessage(input: z.infer<typeof sendMessageSchema>) {
  try {
    const { session, membership, company } = await requireSupportAccess();
    const { body } = sendMessageSchema.parse(input);
    const senderName = await resolveSenderName(session?.user?.name, membership.userId);

    const message = await prisma.$transaction(async (tx) => {
      const thread = await tx.supportThread.upsert({
        where: { companyId: membership.companyId },
        create: { companyId: membership.companyId },
        update: {},
      });
      const created = await tx.supportMessage.create({
        data: {
          threadId: thread.id,
          sender: "company",
          senderUserId: membership.userId,
          senderName,
          body,
        },
      });
      await tx.supportThread.update({
        where: { id: thread.id },
        data: {
          status: "open",
          lastMessageAt: created.createdAt,
          lastMessagePreview: preview(body),
          unreadForAdmin: { increment: 1 },
        },
      });
      return created;
    });

    // Avviso al team Reglo fuori dal percorso di risposta (latency + resilienza).
    const companyName = company.name;
    after(async () => {
      try {
        await sendDynamicEmail({
          to: GLOBAL_ADMIN_EMAIL,
          subject: `Assistenza — nuovo messaggio da ${companyName}`,
          body: [
            `Nuovo messaggio nel centro assistenza da ${companyName}${senderName ? ` (${senderName})` : ""}:`,
            "",
            body,
            "",
            `Rispondi dal backoffice: ${SERVER_URL}/it/backoffice/support`,
          ].join("\n"),
        });
      } catch (err) {
        console.error("[support] admin notify email failed", err);
      }
    });

    return { success: true, data: toMessageDto(message) };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Non-letti lato company — alimenta il badge sul menu della shell. */
export async function getSupportUnreadCount() {
  try {
    const { membership } = await requireSupportAccess();
    const thread = await prisma.supportThread.findUnique({
      where: { companyId: membership.companyId },
      select: { unreadForCompany: true },
    });
    return { success: true, data: { unread: thread?.unreadForCompany ?? 0 } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function submitProductFeedback(input: z.infer<typeof feedbackSchema>) {
  try {
    const { session, membership, company } = await requireSupportAccess();
    const parsed = feedbackSchema.parse(input);
    const userName = await resolveSenderName(session?.user?.name, membership.userId);

    await prisma.productFeedback.create({
      data: {
        companyId: membership.companyId,
        userId: membership.userId,
        userName,
        rating: parsed.rating,
        tags: parsed.tags,
        message: parsed.message || null,
      },
    });

    const companyName = company.name;
    after(async () => {
      try {
        await sendDynamicEmail({
          to: GLOBAL_ADMIN_EMAIL,
          subject: `Feedback ${parsed.rating}★ da ${companyName}`,
          body: [
            `Nuovo feedback da ${companyName}${userName ? ` (${userName})` : ""}:`,
            "",
            `Valutazione: ${"★".repeat(parsed.rating)}${"☆".repeat(5 - parsed.rating)} (${parsed.rating}/5)`,
            parsed.tags.length ? `Aree segnalate: ${parsed.tags.join(", ")}` : null,
            parsed.message ? `Messaggio: ${parsed.message}` : null,
            "",
            `Tutti i feedback: ${SERVER_URL}/it/backoffice/feedback`,
          ]
            .filter((line): line is string => line !== null)
            .join("\n"),
        });
      } catch (err) {
        console.error("[support] feedback notify email failed", err);
      }
    });

    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const NEWS_MODULE_LABELS: Record<string, string> = {
  road: "Reglo Road",
  rinnovi: "Reglo Rinnovi",
  guide: "Guide certificate",
};

const newsFeedbackSchema = z.object({
  type: z.enum(["request", "suggestion"]),
  modules: z.array(z.enum(["road", "rinnovi", "guide"])).max(3).default([]),
  message: z.string().trim().min(1, "Il messaggio è vuoto.").max(MESSAGE_MAX_LENGTH),
});

/**
 * Richieste/consigli inviati dal dialog "Novità" (annuncio pausa richieste
 * agenda). Salva su NewsFeedback e notifica il team via email (no-op su staging
 * come gli altri invii). Vedi docs/features/news-announcement.md.
 */
export async function submitNewsFeedback(input: z.infer<typeof newsFeedbackSchema>) {
  try {
    const { session, membership, company } = await requireSupportAccess();
    const parsed = newsFeedbackSchema.parse(input);
    const userName = await resolveSenderName(session?.user?.name, membership.userId);

    await prisma.newsFeedback.create({
      data: {
        companyId: membership.companyId,
        userId: membership.userId,
        userName,
        type: parsed.type,
        modules: parsed.modules,
        message: parsed.message,
      },
    });

    const companyName = company.name;
    const isRequest = parsed.type === "request";
    const kindLabel = isRequest ? "Richiesta agenda" : "Consiglio moduli";
    after(async () => {
      try {
        await sendDynamicEmail({
          to: GLOBAL_ADMIN_EMAIL,
          subject: `${kindLabel} da ${companyName}`,
          body: [
            `Nuovo${isRequest ? "a richiesta" : " consiglio"} dal dialog Novità di ${companyName}${userName ? ` (${userName})` : ""}:`,
            "",
            parsed.modules.length
              ? `Moduli: ${parsed.modules.map((m) => NEWS_MODULE_LABELS[m] ?? m).join(", ")}`
              : null,
            `Messaggio: ${parsed.message}`,
          ]
            .filter((line): line is string => line !== null)
            .join("\n"),
        });
      } catch (err) {
        console.error("[support] news feedback notify email failed", err);
      }
    });

    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Lato backoffice (team Reglo) ─────────────────────────────────────────────

export async function getBackofficeSupportThreads() {
  try {
    await requireGlobalAdmin();
    const threads = await prisma.supportThread.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { lastMessageAt: "desc" },
    });
    return {
      success: true,
      data: threads.map((thread) => ({
        id: thread.id,
        companyId: thread.companyId,
        companyName: thread.company.name,
        lastMessageAt: thread.lastMessageAt.toISOString(),
        lastMessagePreview: thread.lastMessagePreview,
        unreadForAdmin: thread.unreadForAdmin,
      })) satisfies BackofficeSupportThreadDto[],
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Messaggi di un thread; aprirlo azzera i non-letti lato admin. */
export async function getBackofficeSupportThread(threadId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(threadId);
    const thread = await prisma.supportThread.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: THREAD_MESSAGES_LIMIT },
      },
    });
    if (!thread) {
      return { success: false, message: "Conversazione non trovata." };
    }
    if (thread.unreadForAdmin > 0) {
      await prisma.supportThread.update({
        where: { id: thread.id },
        data: { unreadForAdmin: 0 },
      });
    }
    return {
      success: true,
      data: {
        companyName: thread.company.name,
        messages: thread.messages.reverse().map(toMessageDto),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function sendBackofficeSupportReply(
  input: z.infer<typeof backofficeReplySchema>,
) {
  try {
    await requireGlobalAdmin();
    const { threadId, body } = backofficeReplySchema.parse(input);

    const message = await prisma.$transaction(async (tx) => {
      const thread = await tx.supportThread.findUnique({ where: { id: threadId } });
      if (!thread) throw new Error("Conversazione non trovata.");
      const created = await tx.supportMessage.create({
        data: {
          threadId,
          sender: "reglo",
          senderName: "Team Reglo",
          body,
        },
      });
      await tx.supportThread.update({
        where: { id: threadId },
        data: {
          status: "open",
          lastMessageAt: created.createdAt,
          lastMessagePreview: preview(body),
          unreadForCompany: { increment: 1 },
        },
      });
      return created;
    });

    return { success: true, data: toMessageDto(message) };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Totale non-letti lato admin — alimenta il badge nell'header del backoffice. */
export async function getBackofficeSupportUnreadTotal() {
  try {
    await requireGlobalAdmin();
    const result = await prisma.supportThread.aggregate({
      _sum: { unreadForAdmin: true },
    });
    return { success: true, data: { unread: result._sum.unreadForAdmin ?? 0 } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getBackofficeFeedback() {
  try {
    await requireGlobalAdmin();
    const items = await prisma.productFeedback.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return {
      success: true,
      data: items.map((item) => ({
        id: item.id,
        companyName: item.company?.name ?? null,
        userName: item.userName,
        rating: item.rating,
        tags: item.tags,
        message: item.message,
        createdAt: item.createdAt.toISOString(),
      })) satisfies BackofficeFeedbackDto[],
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
