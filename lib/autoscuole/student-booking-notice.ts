/**
 * REG-742 — l'avviso all'istruttore quando un suo allievo prenota una guida.
 *
 * Richiesta di Nicola Saba (Autoscuola L. Saba): sapere subito di ogni guida
 * che gli allievi si prenotano dall'app. Va all'**istruttore della guida**, non
 * al titolare: da Saba il titolare è un account dell'autoscuola senza telefono,
 * chi lavora e ha l'app è l'istruttore.
 *
 * È una riga del catalogo canali (`student_booked`, scheda Istruttori di
 * Promemoria e notifiche), **spenta di default**: parte solo dove l'autoscuola
 * accende un canale.
 *
 * Contano solo le guide che si prende l'allievo:
 * - `student_self`: prenotazione dall'app;
 * - `slot_fill`: posto liberato accettato;
 * - `group_lesson`: iscrizione a una guida di gruppo (testo suo).
 * Lo scambio (`swap`) no: la guida c'era già, cambia solo l'allievo. Staff,
 * voce, Road, consorzio ed esami no: le crea qualcuno dell'autoscuola.
 */
import { after } from "next/server";
import { prisma } from "@/db/prisma";
import { BOOKING_SOURCE, type BookingSource } from "@/lib/autoscuole/booking-source";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import { studentBookedText } from "@/lib/autoscuole/exam-notifications";
import { effectiveMessageChannels } from "@/lib/autoscuole/message-channels";
import { EVENT_CHANNELS, notifyAutoscuolaUser } from "@/lib/autoscuole/notify";

export const STUDENT_BOOKED_KIND = "student_booked";

/** Le fonti che fanno partire l'avviso (lette anche dal recupero dell'inbox). */
export const STUDENT_BOOKED_SOURCES: readonly BookingSource[] = [
  BOOKING_SOURCE.studentSelf,
  BOOKING_SOURCE.slotFill,
  BOOKING_SOURCE.groupLesson,
];

/** La riga è accesa per quest'autoscuola? (lista canali non vuota) */
export async function studentBookedNoticeOn(companyId: string): Promise<boolean> {
  const limits = (await getCachedCompanyServiceLimits(companyId)) as Record<string, unknown>;
  return effectiveMessageChannels(limits, "student_booked").length > 0;
}

/**
 * Manda l'avviso per questa guida. Non lancia mai: la prenotazione è già fatta
 * e un avviso caduto non deve diventare un errore per l'allievo.
 */
export async function notifyInstructorOfStudentBooking(appointmentId: string): Promise<void> {
  try {
    const appointment = await prisma.autoscuolaAppointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        companyId: true,
        startsAt: true,
        status: true,
        bookingSource: true,
        groupLessonId: true,
        student: { select: { id: true, name: true } },
        instructor: { select: { userId: true } },
      },
    });
    if (!appointment) return;
    if (!STUDENT_BOOKED_SOURCES.includes(appointment.bookingSource as BookingSource)) return;
    if (appointment.status === "cancelled" || appointment.status === "proposal") return;
    const instructorUserId = appointment.instructor?.userId;
    if (!instructorUserId) return;
    // Lettura dalla cache dei limits: dove la riga è spenta (quasi ovunque)
    // non si tocca altro.
    if (!(await studentBookedNoticeOn(appointment.companyId))) return;

    const instructorUser = await prisma.user.findUnique({
      where: { id: instructorUserId },
      select: { email: true },
    });
    const studentName = appointment.student?.name?.trim() || "Un allievo";
    const isGroupLesson = Boolean(appointment.groupLessonId);
    const text = studentBookedText({
      studentName,
      startsAt: appointment.startsAt,
      isGroupLesson,
    });

    await notifyAutoscuolaUser({
      companyId: appointment.companyId,
      kind: STUDENT_BOOKED_KIND,
      audience: "instructor",
      recipient: { userId: instructorUserId, email: instructorUser?.email },
      supports: EVENT_CHANNELS,
      title: text.title,
      body: text.body,
      appointmentId: appointment.id,
      data: {
        appointmentId: appointment.id,
        startsAt: appointment.startsAt.toISOString(),
        studentId: appointment.student?.id ?? null,
        studentName,
        isGroupLesson,
      },
    });
  } catch (error) {
    console.error("[REG-742] avviso prenotazione all'istruttore non inviato", error);
  }
}

/**
 * Dopo la risposta all'allievo (`after()`), così la prenotazione non aspetta
 * push ed email. Fuori da una richiesta `after()` lancia: si manda subito.
 */
export function scheduleStudentBookingNotice(appointmentId: string): void {
  try {
    after(() => notifyInstructorOfStudentBooking(appointmentId));
  } catch {
    void notifyInstructorOfStudentBooking(appointmentId);
  }
}
