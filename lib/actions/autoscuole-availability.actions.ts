"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { sendAutoscuolaWhatsApp } from "@/lib/autoscuole/whatsapp";

const slotSchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  weeks: z.number().int().min(1).max(12).optional(),
});

const deleteSlotsSchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  weeks: z.number().int().min(1).max(12).optional(),
});

const getSlotsSchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]).optional(),
  ownerId: z.string().uuid().optional(),
  date: z.string().optional(),
});

const bookingRequestSchema = z.object({
  studentId: z.string().uuid(),
  preferredDate: z.string(),
  durationMinutes: z.number().int().min(30).max(60),
  preferredStartTime: z.string().optional(),
  preferredEndTime: z.string().optional(),
  maxDays: z.number().int().min(0).max(7).optional(),
  selectedStartsAt: z.string().optional(),
});

const respondOfferSchema = z.object({
  offerId: z.string().uuid(),
  studentId: z.string().uuid(),
  response: z.enum(["accept", "decline"]),
});

const SLOT_MINUTES = 30;
const DEFAULT_AVAILABILITY_WEEKS = 4;
const DEFAULT_MAX_DAYS = 4;

const slotKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;

const parseTime = (value?: string) => {
  if (!value) return null;
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return { hours, minutes };
};

const parseDateOnly = (value: string) => {
  const parts = value.split("-");
  if (parts.length === 3) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return new Date(year, month - 1, day);
    }
  }
  return new Date(value);
};

const getRangeStartEnd = (date: Date, startTime?: string, endTime?: string) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  if (startTime && endTime) {
    const startTimeParsed = parseTime(startTime);
    const endTimeParsed = parseTime(endTime);
    if (!startTimeParsed || !endTimeParsed) {
      return { start, end };
    }
    start.setHours(startTimeParsed.hours, startTimeParsed.minutes, 0, 0);
    end.setHours(endTimeParsed.hours, endTimeParsed.minutes, 0, 0);
  }

  return { start, end };
};

const buildRecurringRanges = ({
  startsAt,
  endsAt,
  daysOfWeek,
  weeks,
}: {
  startsAt: Date;
  endsAt: Date;
  daysOfWeek?: number[];
  weeks: number;
}) => {
  if (!daysOfWeek || daysOfWeek.length === 0) {
    return [{ start: startsAt, end: endsAt }];
  }

  const ranges: Array<{ start: Date; end: Date }> = [];
  const anchorDate = new Date(startsAt);
  anchorDate.setHours(0, 0, 0, 0);
  const startHours = startsAt.getHours();
  const startMinutes = startsAt.getMinutes();
  const endHours = endsAt.getHours();
  const endMinutes = endsAt.getMinutes();

  for (let week = 0; week < weeks; week += 1) {
    for (const day of daysOfWeek) {
      const candidate = new Date(anchorDate);
      const offset = (day - candidate.getDay() + 7) % 7;
      candidate.setDate(candidate.getDate() + offset + week * 7);

      if (week === 0 && candidate < anchorDate) continue;

      const rangeStart = new Date(candidate);
      rangeStart.setHours(startHours, startMinutes, 0, 0);
      const rangeEnd = new Date(candidate);
      rangeEnd.setHours(endHours, endMinutes, 0, 0);
      if (rangeEnd <= rangeStart) continue;
      if (rangeStart < startsAt) continue;
      ranges.push({ start: rangeStart, end: rangeEnd });
    }
  }

  return ranges;
};

const getSlotEnd = (start: Date, durationMinutes: number) => {
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end;
};

export async function createAvailabilitySlots(input: z.infer<typeof slotSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = slotSchema.parse(input);
    const start = new Date(payload.startsAt);
    const end = new Date(payload.endsAt);
    const weeks = payload.weeks ?? DEFAULT_AVAILABILITY_WEEKS;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return { success: false, message: "Intervallo non valido." };
    }

    const ranges = buildRecurringRanges({
      startsAt: start,
      endsAt: end,
      daysOfWeek: payload.daysOfWeek,
      weeks,
    });

    if (!ranges.length) {
      return { success: false, message: "Nessuno slot generato." };
    }

    const slots: Array<{
      companyId: string;
      ownerType: string;
      ownerId: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
    }> = [];

    for (const range of ranges) {
      for (let cursor = new Date(range.start); cursor < range.end; ) {
        const next = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000);
        if (next > range.end) break;
        slots.push({
          companyId: membership.companyId,
          ownerType: payload.ownerType,
          ownerId: payload.ownerId,
          startsAt: new Date(cursor),
          endsAt: next,
          status: "open",
        });
        cursor = next;
      }
    }

    const created = await prisma.autoscuolaAvailabilitySlot.createMany({
      data: slots,
      skipDuplicates: true,
    });

    return { success: true, data: { count: created.count } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteAvailabilitySlots(input: z.infer<typeof deleteSlotsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = deleteSlotsSchema.parse(input);
    const start = new Date(payload.startsAt);
    const end = new Date(payload.endsAt);
    const weeks = payload.weeks ?? DEFAULT_AVAILABILITY_WEEKS;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return { success: false, message: "Intervallo non valido." };
    }

    const ranges = buildRecurringRanges({
      startsAt: start,
      endsAt: end,
      daysOfWeek: payload.daysOfWeek,
      weeks,
    });

    if (!ranges.length) {
      return { success: false, message: "Nessuno slot da rimuovere." };
    }

    let deletedCount = 0;
    for (const range of ranges) {
      const deleted = await prisma.autoscuolaAvailabilitySlot.deleteMany({
        where: {
          companyId: membership.companyId,
          ownerType: payload.ownerType,
          ownerId: payload.ownerId,
          status: "open",
          startsAt: { gte: range.start, lt: range.end },
        },
      });
      deletedCount += deleted.count;
    }

    return { success: true, data: { count: deletedCount } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAvailabilitySlots(input: z.infer<typeof getSlotsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getSlotsSchema.parse(input);

    const where: Record<string, unknown> = {
      companyId: membership.companyId,
    };

    if (payload.ownerType) where.ownerType = payload.ownerType;
    if (payload.ownerId) where.ownerId = payload.ownerId;

    if (payload.date) {
      const dayStart = new Date(payload.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      where.startsAt = { gte: dayStart, lt: dayEnd };
    }

    const slots = await prisma.autoscuolaAvailabilitySlot.findMany({
      where,
      orderBy: { startsAt: "asc" },
    });

    return { success: true, data: slots };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createBookingRequest(input: z.infer<typeof bookingRequestSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = bookingRequestSchema.parse(input);
    const durationSlots = payload.durationMinutes / SLOT_MINUTES;
    if (![1, 2].includes(durationSlots)) {
      return { success: false, message: "Durata non valida." };
    }

    const preferredDate = parseDateOnly(payload.preferredDate);
    preferredDate.setHours(0, 0, 0, 0);
    const preferredDayEnd = new Date(preferredDate);
    preferredDayEnd.setDate(preferredDayEnd.getDate() + 1);

    const maxDays = payload.maxDays ?? DEFAULT_MAX_DAYS;
    const [activeInstructors, activeVehicles] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
    ]);
    const activeInstructorIds = activeInstructors.map((item) => item.id);
    const activeVehicleIds = activeVehicles.map((item) => item.id);

    const buildSlotMap = <T extends { ownerId: string; startsAt: Date; id: string }>(
      slots: T[],
    ) => {
      const map = new Map<string, Map<number, T>>();
      for (const slot of slots) {
        const byOwner = map.get(slot.ownerId) ?? new Map<number, T>();
        byOwner.set(slot.startsAt.getTime(), slot);
        map.set(slot.ownerId, byOwner);
      }
      return map;
    };

    const getSpanSlots = <T extends { id: string }>(
      map: Map<number, T>,
      startMs: number,
    ) => {
      const first = map.get(startMs);
      if (!first) return null;
      if (durationSlots === 1) return [first];
      const second = map.get(startMs + SLOT_MINUTES * 60 * 1000);
      if (!second) return null;
      return [first, second];
    };

    const buildAppointmentMaps = (
      appointments: Array<{
        instructorId: string | null;
        vehicleId: string | null;
        startsAt: Date;
        endsAt: Date | null;
      }>,
    ) => {
      const starts = new Map<string, Set<number>>();
      const ends = new Map<string, Set<number>>();
      const intervals = new Map<string, Array<{ start: number; end: number }>>();

      const add = (ownerId: string, start: number, end: number) => {
        const startSet = starts.get(ownerId) ?? new Set<number>();
        const endSet = ends.get(ownerId) ?? new Set<number>();
        const list = intervals.get(ownerId) ?? [];
        startSet.add(start);
        endSet.add(end);
        list.push({ start, end });
        starts.set(ownerId, startSet);
        ends.set(ownerId, endSet);
        intervals.set(ownerId, list);
      };

      for (const appointment of appointments) {
        const start = appointment.startsAt.getTime();
        const end =
          appointment.endsAt?.getTime() ?? start + SLOT_MINUTES * 60 * 1000;
        if (appointment.instructorId) {
          add(appointment.instructorId, start, end);
        }
        if (appointment.vehicleId) {
          add(appointment.vehicleId, start, end);
        }
      }

      return { starts, ends, intervals };
    };

    const overlaps = (
      intervals: Array<{ start: number; end: number }> | undefined,
      start: number,
      end: number,
    ) => {
      if (!intervals?.length) return false;
      return intervals.some((interval) => start < interval.end && end > interval.start);
    };

    const findCandidateForRange = async (
      rangeStart: Date,
      rangeEnd: Date,
      forcedStart?: Date,
    ) => {
      if (!activeInstructorIds.length || !activeVehicleIds.length) {
        return null;
      }
      const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
      const [studentSlots, instructorSlots, vehicleSlots, appointments] =
        await Promise.all([
          prisma.autoscuolaAvailabilitySlot.findMany({
            where: {
              companyId: membership.companyId,
              ownerType: "student",
              ownerId: payload.studentId,
              status: "open",
              startsAt: { gte: rangeStart, lt: rangeEnd },
            },
            orderBy: { startsAt: "asc" },
          }),
          prisma.autoscuolaAvailabilitySlot.findMany({
            where: {
              companyId: membership.companyId,
              ownerType: "instructor",
              status: "open",
              ownerId: { in: activeInstructorIds },
              startsAt: { gte: rangeStart, lt: rangeEnd },
            },
            orderBy: { startsAt: "asc" },
          }),
          prisma.autoscuolaAvailabilitySlot.findMany({
            where: {
              companyId: membership.companyId,
              ownerType: "vehicle",
              status: "open",
              ownerId: { in: activeVehicleIds },
              startsAt: { gte: rangeStart, lt: rangeEnd },
            },
            orderBy: { startsAt: "asc" },
          }),
          prisma.autoscuolaAppointment.findMany({
            where: {
              companyId: membership.companyId,
              status: { notIn: ["cancelled"] },
              startsAt: { gte: appointmentScanStart, lt: rangeEnd },
            },
          }),
        ]);

      const studentMap = buildSlotMap(studentSlots).get(payload.studentId);
      if (!studentMap) return null;

      const instructorMap = buildSlotMap(instructorSlots);
      const vehicleMap = buildSlotMap(vehicleSlots);
      const appointmentMaps = buildAppointmentMaps(appointments);

      const candidateStarts = forcedStart
        ? [forcedStart.getTime()]
        : Array.from(studentMap.keys()).sort((a, b) => a - b);

      let best: {
        start: Date;
        end: Date;
        instructorId: string;
        vehicleId: string;
        studentSlotIds: string[];
        instructorSlotIds: string[];
        vehicleSlotIds: string[];
        score: number;
      } | null = null;

      for (const startMs of candidateStarts) {
        const startDate = new Date(startMs);
        const endDate = getSlotEnd(startDate, payload.durationMinutes);
        if (startDate < rangeStart || endDate > rangeEnd) continue;

        const studentSlotsSpan = getSpanSlots(studentMap, startMs);
        if (!studentSlotsSpan) continue;

        const availableInstructors: Array<{
          id: string;
          slotIds: string[];
          score: number;
        }> = [];
        for (const [ownerId, map] of instructorMap.entries()) {
          const spanSlots = getSpanSlots(map, startMs);
          if (!spanSlots) continue;
          const intervals = appointmentMaps.intervals.get(ownerId);
          if (overlaps(intervals, startMs, endDate.getTime())) continue;
          const score =
            (appointmentMaps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
            (appointmentMaps.starts.get(ownerId)?.has(endDate.getTime()) ? 1 : 0);
          availableInstructors.push({
            id: ownerId,
            slotIds: spanSlots.map((slot) => slot.id),
            score,
          });
        }

        const availableVehicles: Array<{
          id: string;
          slotIds: string[];
          score: number;
        }> = [];
        for (const [ownerId, map] of vehicleMap.entries()) {
          const spanSlots = getSpanSlots(map, startMs);
          if (!spanSlots) continue;
          const intervals = appointmentMaps.intervals.get(ownerId);
          if (overlaps(intervals, startMs, endDate.getTime())) continue;
          const score =
            (appointmentMaps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
            (appointmentMaps.starts.get(ownerId)?.has(endDate.getTime()) ? 1 : 0);
          availableVehicles.push({
            id: ownerId,
            slotIds: spanSlots.map((slot) => slot.id),
            score,
          });
        }

        if (!availableInstructors.length || !availableVehicles.length) {
          continue;
        }

        availableInstructors.sort((a, b) => b.score - a.score);
        availableVehicles.sort((a, b) => b.score - a.score);

        const instructorChoice = availableInstructors[0];
        const vehicleChoice = availableVehicles[0];
        const score = instructorChoice.score + vehicleChoice.score;

        if (!best || score > best.score || (score === best.score && startMs < best.start.getTime())) {
          best = {
            start: startDate,
            end: endDate,
            instructorId: instructorChoice.id,
            vehicleId: vehicleChoice.id,
            studentSlotIds: studentSlotsSpan.map((slot) => slot.id),
            instructorSlotIds: instructorChoice.slotIds,
            vehicleSlotIds: vehicleChoice.slotIds,
            score,
          };
        }
      }

      return best;
    };

    if (payload.selectedStartsAt) {
      const selectedStart = new Date(payload.selectedStartsAt);
      if (Number.isNaN(selectedStart.getTime())) {
        return { success: false, message: "Slot selezionato non valido." };
      }
      const rangeStart = new Date(selectedStart);
      const rangeEnd = getSlotEnd(rangeStart, payload.durationMinutes);
      const candidate = await findCandidateForRange(rangeStart, rangeEnd, selectedStart);
      if (!candidate) {
        return { success: false, message: "Slot non disponibile." };
      }

      const appointment = await prisma.$transaction(async (tx) => {
        await tx.autoscuolaAvailabilitySlot.updateMany({
          where: {
            id: {
              in: [
                ...candidate.studentSlotIds,
                ...candidate.instructorSlotIds,
                ...candidate.vehicleSlotIds,
              ],
            },
          },
          data: { status: "booked" },
        });

        return tx.autoscuolaAppointment.create({
          data: {
            companyId: membership.companyId,
            studentId: payload.studentId,
            type: "guida",
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "scheduled",
            instructorId: candidate.instructorId,
            vehicleId: candidate.vehicleId,
            slotId: candidate.studentSlotIds[0],
          },
        });
      });

      const request = await prisma.autoscuolaBookingRequest.create({
        data: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          desiredDate: preferredDate,
          status: "matched",
        },
      });

      return { success: true, data: { matched: true, appointment, request } };
    }

    let candidate = null as Awaited<ReturnType<typeof findCandidateForRange>> | null;
    if (payload.preferredStartTime && payload.preferredEndTime) {
      const range = getRangeStartEnd(
        preferredDate,
        payload.preferredStartTime,
        payload.preferredEndTime,
      );
      candidate = await findCandidateForRange(range.start, range.end);
    }

    if (!candidate) {
      candidate = await findCandidateForRange(preferredDate, preferredDayEnd);
    }

    if (candidate) {
      const appointment = await prisma.$transaction(async (tx) => {
        await tx.autoscuolaAvailabilitySlot.updateMany({
          where: {
            id: {
              in: [
                ...candidate.studentSlotIds,
                ...candidate.instructorSlotIds,
                ...candidate.vehicleSlotIds,
              ],
            },
          },
          data: { status: "booked" },
        });

        return tx.autoscuolaAppointment.create({
          data: {
            companyId: membership.companyId,
            studentId: payload.studentId,
            type: "guida",
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "scheduled",
            instructorId: candidate.instructorId,
            vehicleId: candidate.vehicleId,
            slotId: candidate.studentSlotIds[0],
          },
        });
      });

      const request = await prisma.autoscuolaBookingRequest.create({
        data: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          desiredDate: preferredDate,
          status: "matched",
        },
      });

      return { success: true, data: { matched: true, appointment, request } };
    }

    let suggestion: { startsAt: Date; endsAt: Date } | null = null;
    for (let offset = 1; offset <= maxDays; offset += 1) {
      const altDay = new Date(preferredDate);
      altDay.setDate(altDay.getDate() + offset);
      const altEnd = new Date(altDay);
      altEnd.setDate(altEnd.getDate() + 1);
      const altCandidate = await findCandidateForRange(altDay, altEnd);
      if (altCandidate) {
        suggestion = { startsAt: altCandidate.start, endsAt: altCandidate.end };
        break;
      }
    }

    const request = await prisma.autoscuolaBookingRequest.create({
      data: {
        companyId: membership.companyId,
        studentId: payload.studentId,
        desiredDate: preferredDate,
        status: "pending",
      },
    });

    return {
      success: true,
      data: {
        matched: false,
        request,
        suggestion,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function respondWaitlistOffer(input: z.infer<typeof respondOfferSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = respondOfferSchema.parse(input);

    const offer = await prisma.autoscuolaWaitlistOffer.findFirst({
      where: { id: payload.offerId, companyId: membership.companyId },
      include: { slot: true },
    });

    if (!offer) {
      return { success: false, message: "Offerta non trovata." };
    }

    const now = new Date();
    if (offer.status !== "broadcasted" || offer.expiresAt < now) {
      return { success: false, message: "Offerta non più valida." };
    }

    const response = await prisma.autoscuolaWaitlistResponse.create({
      data: {
        offerId: offer.id,
        studentId: payload.studentId,
        status: payload.response === "accept" ? "accepted" : "declined",
        respondedAt: now,
      },
    });

    if (payload.response === "decline") {
      return { success: true, data: { accepted: false, response } };
    }

    const slotTime = offer.slot.startsAt;
    const [instructorSlot, vehicleSlot] = await Promise.all([
      prisma.autoscuolaAvailabilitySlot.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "instructor",
          status: "open",
          startsAt: slotTime,
        },
      }),
      prisma.autoscuolaAvailabilitySlot.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "vehicle",
          status: "open",
          startsAt: slotTime,
        },
      }),
    ]);

    if (!instructorSlot || !vehicleSlot) {
      return { success: false, message: "Slot non disponibile." };
    }

    const appointment = await prisma.$transaction(async (tx) => {
      await tx.autoscuolaAvailabilitySlot.updateMany({
        where: { id: { in: [offer.slotId, instructorSlot.id, vehicleSlot.id] } },
        data: { status: "booked" },
      });

      await tx.autoscuolaWaitlistOffer.update({
        where: { id: offer.id },
        data: { status: "accepted" },
      });

      return tx.autoscuolaAppointment.create({
        data: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          type: "guida",
          startsAt: offer.slot.startsAt,
          endsAt: offer.slot.endsAt,
          status: "scheduled",
          instructorId: instructorSlot.ownerId,
          vehicleId: vehicleSlot.ownerId,
          slotId: offer.slotId,
        },
      });
    });

    return { success: true, data: { accepted: true, appointment, response } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function broadcastWaitlistOffer({
  companyId,
  slotId,
  startsAt,
  expiresAt,
}: {
  companyId: string;
  slotId: string;
  startsAt: Date;
  expiresAt: Date;
}) {
  const offer = await prisma.autoscuolaWaitlistOffer.create({
    data: {
      companyId,
      slotId,
      status: "broadcasted",
      sentAt: new Date(),
      expiresAt,
    },
  });

  const dayStart = new Date(startsAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const pending = await prisma.autoscuolaBookingRequest.findMany({
    where: {
      companyId,
      status: "pending",
      desiredDate: { gte: dayStart, lt: dayEnd },
    },
    include: { student: true },
  });

  for (const request of pending) {
    const phone = request.student.phone;
    if (!phone) continue;
    const message = `Slot disponibile il ${startsAt.toLocaleDateString("it-IT")} alle ${startsAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}. Apri Reglo per prenotare.`;
    try {
      await sendAutoscuolaWhatsApp({ to: phone, body: message });
    } catch (error) {
      console.error("Waitlist WhatsApp error", error);
    }
  }

  return offer;
}
