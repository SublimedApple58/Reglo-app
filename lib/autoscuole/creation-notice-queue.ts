/**
 * Avviso «guida fissata» (REG-758) — la coda: chi ci entra e chi la svuota.
 * Le regole stanno in `creation-notice.ts`.
 */
import { prisma as defaultPrisma } from "@/db/prisma";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import {
  CREATION_NOTICE,
  CREATION_NOTICE_ACTIVE_STATUSES,
  creationNoticeText,
  creationNoticeWhatsAppGuides,
  initialCreationNotice,
  isCreationNoticeEnabled,
  isReadyToFlush,
  type CreationNoticeState,
} from "@/lib/autoscuole/creation-notice";
import { EVENT_CHANNELS_WITH_WHATSAPP, notifyAutoscuolaUser } from "@/lib/autoscuole/notify";
import { firstNameFor } from "@/lib/autoscuole/whatsapp-delivery";

type PrismaClientLike = typeof defaultPrisma;

/**
 * Lo stato con cui creare una guida fissata dallo staff o dalla voce. Si
 * chiama **solo** dai punti di creazione non avviati dall'allievo: è il
 * chiamante a sapere chi sta prenotando.
 */
export async function creationNoticeFor({
  companyId,
  type,
  startsAt,
  now = new Date(),
}: {
  companyId: string;
  type: string | null | undefined;
  startsAt: Date;
  now?: Date;
}): Promise<CreationNoticeState | null> {
  // Esami e guide passate non leggono nemmeno l'impostazione.
  if (initialCreationNotice({ enabled: true, type, startsAt, now }) === null) return null;
  const limits = await getCachedCompanyServiceLimits(companyId);
  return initialCreationNotice({
    enabled: isCreationNoticeEnabled(limits as Record<string, unknown>),
    type,
    startsAt,
    now,
  });
}

/**
 * Svuota la coda: un messaggio per allievo con tutte le sue guide pronte.
 * Chiamata ogni minuto dal job `autoscuole-reminders`.
 */
export async function processAutoscuolaCreationNotices({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
} = {}) {
  const pending = await prisma.autoscuolaAppointment.findMany({
    where: { creationNotice: CREATION_NOTICE.pending },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true,
      companyId: true,
      studentId: true,
      type: true,
      startsAt: true,
      endsAt: true,
      status: true,
      createdAt: true,
      instructor: { select: { name: true } },
    },
  });
  if (!pending.length) return { sent: 0, skipped: 0 };

  const groups = new Map<string, typeof pending>();
  for (const row of pending) {
    const key = `${row.companyId}:${row.studentId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  // L'impostazione si rilegge fresca: chi la spegne con guide in coda non
  // deve vederle partire nei minuti dopo.
  const enabledByCompany = new Map<string, boolean>();
  const isEnabled = async (companyId: string) => {
    const known = enabledByCompany.get(companyId);
    if (known !== undefined) return known;
    const service = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const enabled = isCreationNoticeEnabled((service?.limits ?? {}) as Record<string, unknown>);
    enabledByCompany.set(companyId, enabled);
    return enabled;
  };

  const markSkipped = (ids: string[]) =>
    ids.length
      ? prisma.autoscuolaAppointment.updateMany({
          where: { id: { in: ids }, creationNotice: CREATION_NOTICE.pending },
          data: { creationNotice: CREATION_NOTICE.skipped },
        })
      : Promise.resolve({ count: 0 });

  let sent = 0;
  let skipped = 0;
  for (const rows of Array.from(groups.values())) {
    if (!isReadyToFlush(rows.map((row) => row.createdAt), now)) continue;
    const [{ companyId, studentId }] = rows;

    if (!studentId || !(await isEnabled(companyId))) {
      skipped += (await markSkipped(rows.map((row) => row.id))).count;
      continue;
    }

    const active = rows.filter(
      (row) =>
        (CREATION_NOTICE_ACTIVE_STATUSES as readonly string[]).includes(row.status) &&
        row.startsAt.getTime() > now.getTime(),
    );
    const activeIds = new Set(active.map((row) => row.id));
    skipped += (await markSkipped(rows.filter((row) => !activeIds.has(row.id)).map((row) => row.id)))
      .count;
    if (!active.length) continue;

    // Prima si prende in carico, poi si manda: due giri del job sovrapposti
    // non devono mandare lo stesso avviso due volte.
    const claimed = await prisma.autoscuolaAppointment.updateMany({
      where: { id: { in: Array.from(activeIds) }, creationNotice: CREATION_NOTICE.pending },
      data: { creationNotice: CREATION_NOTICE.sent },
    });
    // Zero = un altro giro le ha già prese tutte: l'avviso lo manda lui.
    if (claimed.count === 0) continue;

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!student) continue;

    const lessons = active.map((row) => ({
      type: row.type,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      instructorName: row.instructor?.name ?? null,
    }));
    const first = [...active].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const text = creationNoticeText(lessons);

    await notifyAutoscuolaUser({
      companyId,
      kind: "appointment_created",
      audience: "student",
      supports: EVENT_CHANNELS_WITH_WHATSAPP,
      recipient: { userId: student.id, email: student.email, phone: student.phone },
      whatsapp: {
        values: {
          nome: firstNameFor(student),
          guide: creationNoticeWhatsAppGuides(lessons),
        },
      },
      title: text.title,
      body: text.body,
      appointmentId: first.id,
      data: {
        appointmentId: first.id,
        appointmentIds: active.map((row) => row.id),
        startsAt: first.startsAt.toISOString(),
        count: active.length,
        isGroupLesson: first.type === "group_lesson",
      },
    });
    sent += 1;
  }

  return { sent, skipped };
}
