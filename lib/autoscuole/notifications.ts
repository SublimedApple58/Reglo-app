import { prisma } from "@/db/prisma";

/** Max notifications returned to the bell panel (scrollable, no separate page). */
const RECENT_LIMIT = 50;

/** One row as rendered by the owner bell/inbox panel. */
export type AutoscuolaNotificationItem = {
  id: string;
  kind: string;
  studentName: string | null;
  /** ISO string of the cancelled guide's start, or null. */
  startsAt: string | null;
  instructorName: string | null;
  lessonType: string | null;
  /** Payload extra per i kind consorzio (requestId, schoolName, vehicleName). */
  meta: Record<string, unknown> | null;
  read: boolean;
  /** ISO string of when the notification was created (i.e. the cancellation). */
  createdAt: string;
};

export type AutoscuolaNotificationsPayload = {
  items: AutoscuolaNotificationItem[];
  unreadCount: number;
};

/** Recent notifications for a company + unread count (company-scoped read state). */
export async function listAutoscuolaNotifications(
  companyId: string,
): Promise<AutoscuolaNotificationsPayload> {
  const [rows, unreadCount] = await Promise.all([
    prisma.autoscuolaNotification.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    }),
    prisma.autoscuolaNotification.count({
      where: { companyId, readAt: null },
    }),
  ]);

  return {
    unreadCount,
    items: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      studentName: n.studentName,
      startsAt: n.startsAt ? n.startsAt.toISOString() : null,
      instructorName: n.instructorName,
      lessonType: n.lessonType,
      meta: (n.meta ?? null) as Record<string, unknown> | null,
      read: n.readAt != null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/**
 * Notifica in-app "Richiesta guida" per il CONSORZIO: un'autoscuola consorziata
 * chiede uno slot. Il click nella campanella apre l'agenda con il ghost sullo
 * slot richiesto (deep-link ?guideRequestId=…). Vedi docs/features/consorzio.md.
 */
export async function createConsortiumGuideRequestNotification(input: {
  companyId: string;
  requestId: string;
  studentName: string;
  schoolName: string;
  vehicleName: string | null;
  startsAt: Date;
}): Promise<void> {
  await prisma.autoscuolaNotification.create({
    data: {
      companyId: input.companyId,
      kind: "consortium_guide_request",
      studentName: input.studentName,
      startsAt: input.startsAt,
      meta: {
        requestId: input.requestId,
        schoolName: input.schoolName,
        vehicleName: input.vehicleName,
      },
    },
  });
}

/** Mark every currently-unread notification of a company as read (per-company). */
export async function markAutoscuolaNotificationsRead(
  companyId: string,
): Promise<void> {
  await prisma.autoscuolaNotification.updateMany({
    where: { companyId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Delete all of a company's notifications (the bell "trash" action). */
export async function deleteAutoscuolaNotifications(
  companyId: string,
): Promise<void> {
  await prisma.autoscuolaNotification.deleteMany({ where: { companyId } });
}
