import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { generateMedicoSlots } from "@/lib/renewal/slots";
import { RENEWAL_TIMEZONE } from "@/lib/renewal/time";

/**
 * Rinnovo Patenti — slot listing + booking creation (public flow).
 * Deliberately separate from the autoscuole booking engine: no instructors,
 * vehicles, credits or slot-matcher — just a medico's weekly windows.
 */

export type BookableSlot = {
  /** Opaque token the citizen books with: `${medicoId}|${startISO}`. */
  id: string;
  medicoId: string;
  medicoName: string;
  startAt: string; // ISO
  endAt: string; // ISO
  label: string; // human, Europe/Rome
};

const slotLabelFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: RENEWAL_TIMEZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * All bookable slots for a company across its active medici, for the coming
 * `horizonDays`. Deduped by start time (first medico wins) so the citizen sees a
 * clean calendar; the winning medicoId is preserved in the slot id.
 */
export async function getBookableSlots(
  companyId: string,
  opts?: { horizonDays?: number; limit?: number },
): Promise<BookableSlot[]> {
  const medici = await prisma.renewalMedico.findMany({
    where: { companyId, status: "active" },
    include: { availabilities: true },
  });
  if (medici.length === 0) return [];

  const now = new Date();
  const horizon = opts?.horizonDays ?? 30;

  // Existing confirmed bookings per medico (future only), to exclude.
  const bookings = await prisma.renewalVisitBooking.findMany({
    where: { companyId, status: "confirmed", startAt: { gte: now } },
    select: { medicoId: true, startAt: true },
  });
  const bookedByMedico = new Map<string, Set<number>>();
  for (const b of bookings) {
    const set = bookedByMedico.get(b.medicoId) ?? new Set<number>();
    set.add(b.startAt.getTime());
    bookedByMedico.set(b.medicoId, set);
  }

  const byStart = new Map<number, BookableSlot>();
  for (const medico of medici) {
    if (medico.availabilities.length === 0) continue;
    const slots = generateMedicoSlots({
      windows: medico.availabilities.map((a) => ({
        daysOfWeek: a.daysOfWeek,
        startMinutes: a.startMinutes,
        endMinutes: a.endMinutes,
      })),
      durationMinutes: medico.visitDurationMinutes,
      bookedStartMs: bookedByMedico.get(medico.id),
      from: now,
      horizonDays: horizon,
    });
    for (const slot of slots) {
      const ms = slot.startAt.getTime();
      if (byStart.has(ms)) continue; // first medico wins this start time
      byStart.set(ms, {
        id: `${medico.id}|${slot.startAt.toISOString()}`,
        medicoId: medico.id,
        medicoName: medico.name,
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        label: slotLabelFormatter.format(slot.startAt),
      });
    }
  }

  const list = Array.from(byStart.values()).sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  return typeof opts?.limit === "number" ? list.slice(0, opts.limit) : list;
}

export type CreateBookingResult =
  | { ok: true; startAt: string; endAt: string; medicoName: string }
  | { ok: false; reason: "invalid_slot" | "slot_taken" | "medico_unavailable" };

/**
 * Book a slot for a request. Validates the slot is genuinely offered by the
 * medico (recomputed, not trusted from the client) and relies on the DB unique
 * (medicoId, startAt) to win any race.
 */
export async function createRenewalBooking(input: {
  companyId: string;
  requestId: string;
  slotId: string;
}): Promise<CreateBookingResult> {
  const [medicoId, startIso] = input.slotId.split("|");
  if (!medicoId || !startIso) return { ok: false, reason: "invalid_slot" };
  const startAt = new Date(startIso);
  if (Number.isNaN(startAt.getTime())) return { ok: false, reason: "invalid_slot" };

  const medico = await prisma.renewalMedico.findFirst({
    where: { id: medicoId, companyId: input.companyId, status: "active" },
    include: { availabilities: true },
  });
  if (!medico) return { ok: false, reason: "medico_unavailable" };

  // Recompute the medico's offered slots and confirm this start is really one.
  const booked = await prisma.renewalVisitBooking.findMany({
    where: { medicoId, status: "confirmed", startAt: { gte: new Date() } },
    select: { startAt: true },
  });
  const slots = generateMedicoSlots({
    windows: medico.availabilities.map((a) => ({
      daysOfWeek: a.daysOfWeek,
      startMinutes: a.startMinutes,
      endMinutes: a.endMinutes,
    })),
    durationMinutes: medico.visitDurationMinutes,
    bookedStartMs: new Set(booked.map((b) => b.startAt.getTime())),
    from: new Date(),
    horizonDays: 60,
  });
  const match = slots.find((s) => s.startAt.getTime() === startAt.getTime());
  if (!match) return { ok: false, reason: "invalid_slot" };

  try {
    await prisma.renewalVisitBooking.create({
      data: {
        companyId: input.companyId,
        requestId: input.requestId,
        medicoId,
        startAt: match.startAt,
        endAt: match.endAt,
        status: "confirmed",
      },
    });
  } catch (error) {
    // Unique violation: either this request already booked, or the medico slot
    // was taken between listing and booking.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "slot_taken" };
    }
    throw error;
  }

  return {
    ok: true,
    startAt: match.startAt.toISOString(),
    endAt: match.endAt.toISOString(),
    medicoName: medico.name,
  };
}
