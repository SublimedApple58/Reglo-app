import type { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { canSeeAll, ownInstructorId, roadContext, ROAD_ELIGIBLE_STATUSES } from "@/lib/autoscuole/road/service";
import { parseStoredPlan, type StoredPlanStop } from "@/lib/autoscuole/road/lesson-plan";

/**
 * REG-668 Reglo Road — il giro modificato di una guida futura, salvato sul
 * server (prima viveva solo nella memoria dell'app).
 *
 * - Una riga `RoadLessonPlan` per guida: le tappe nell'ordine dell'istruttore.
 * - Leggono e scrivono l'istruttore della guida e il titolare.
 * - Si scrive solo su guide ancora in programma e non ancora partite in Road.
 * - È una fotografia: se il giro suggerito cambia, resta questo finché non si
 *   torna al suggerito (DELETE). Alla partenza `startRoadSession` lo usa al
 *   posto del giro mandato dal telefono.
 */

type Result<T> = { success: true; data: T } | { success: false; message: string; code?: string };
const ok = <T>(data: T): Result<T> => ({ success: true, data });
const fail = (message: string, code?: string): Result<never> => ({ success: false, message, code });

export type SavedRoadPlanDTO = { stops: StoredPlanStop[]; minutes: number; updatedAt: string };

async function access(appointmentId: unknown) {
  const ctx = await roadContext();
  if (!ctx.roadEnabled) return { error: fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED") };
  if (typeof appointmentId !== "string" || !appointmentId) return { error: fail("Guida mancante.", "INVALID") };
  const appointment = await prisma.autoscuolaAppointment.findFirst({
    where: { id: appointmentId, companyId: ctx.companyId },
    select: {
      id: true,
      status: true,
      instructorId: true,
      roadSession: { select: { id: true } },
      roadLessonPlan: { select: { stops: true, minutes: true, updatedAt: true } },
    },
  });
  if (!appointment) return { error: fail("Guida non trovata.", "NOT_FOUND") };
  if (!canSeeAll(ctx)) {
    const instructorId = await ownInstructorId(ctx);
    if (!instructorId || appointment.instructorId !== instructorId) {
      return { error: fail("Il giro si modifica solo sulle tue guide.", "FORBIDDEN") };
    }
  }
  return { ctx, appointment };
}

function toDTO(row: { stops: unknown; minutes: number; updatedAt: Date } | null): SavedRoadPlanDTO | null {
  if (!row) return null;
  const parsed = parseStoredPlan({ stops: row.stops, minutes: row.minutes });
  return parsed ? { stops: parsed.stops, minutes: parsed.minutes, updatedAt: row.updatedAt.toISOString() } : null;
}

/** Il giro salvato della guida, o `saved: null` (vale il suggerito). */
export async function getSavedRoadPlan(input: { appointmentId?: unknown }) {
  try {
    const loaded = await access(input.appointmentId);
    if ("error" in loaded) return loaded.error!;
    return ok({ saved: toDTO(loaded.appointment.roadLessonPlan) });
  } catch (error) {
    return fail(formatError(error));
  }
}

export async function saveRoadPlan(input: { appointmentId?: unknown; stops?: unknown; minutes?: unknown }) {
  try {
    const loaded = await access(input.appointmentId);
    if ("error" in loaded) return loaded.error!;
    const { ctx, appointment } = loaded;
    if (appointment.roadSession) return fail("La guida è già partita in Road.", "STARTED");
    if (!ROAD_ELIGIBLE_STATUSES.includes(appointment.status)) return fail("Questa guida non è più in programma.", "NOT_ELIGIBLE");
    const parsed = parseStoredPlan({ stops: input.stops, minutes: input.minutes });
    if (!parsed) return fail("Tappe non valide.", "INVALID");
    const data = {
      stops: parsed.stops as unknown as Prisma.InputJsonValue,
      minutes: parsed.minutes,
      updatedById: ctx.membership.userId,
    };
    const row = await prisma.roadLessonPlan.upsert({
      where: { appointmentId: appointment.id },
      create: { appointmentId: appointment.id, companyId: ctx.companyId, ...data },
      update: data,
      select: { stops: true, minutes: true, updatedAt: true },
    });
    return ok({ saved: toDTO(row) });
  } catch (error) {
    return fail(formatError(error));
  }
}

/** «Torna al giro suggerito». */
export async function deleteSavedRoadPlan(input: { appointmentId?: unknown }) {
  try {
    const loaded = await access(input.appointmentId);
    if ("error" in loaded) return loaded.error!;
    if (loaded.appointment.roadSession) return fail("La guida è già partita in Road.", "STARTED");
    await prisma.roadLessonPlan.deleteMany({ where: { appointmentId: loaded.appointment.id } });
    return ok({ saved: null });
  } catch (error) {
    return fail(formatError(error));
  }
}
