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
      read: n.readAt != null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
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
