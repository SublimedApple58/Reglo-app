"use server";

import { randomUUID } from "crypto";
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
const DEFAULT_MAX_DAYS = 4;

const minutesFromDate = (date: Date) => date.getHours() * 60 + date.getMinutes();

const normalizeDays = (days: number[] | undefined) =>
  Array.from(new Set((days ?? []).filter((day) => day >= 0 && day <= 6))).sort();

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
    const daysOfWeek = normalizeDays(payload.daysOfWeek);

    if (!daysOfWeek.length) {
      return { success: false, message: "Seleziona almeno un giorno." };
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { success: false, message: "Intervallo non valido." };
    }

    const startMinutes = minutesFromDate(start);
    const endMinutes = minutesFromDate(end);
    if (endMinutes <= startMinutes) {
      return { success: false, message: "Intervallo non valido." };
    }

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId: membership.companyId,
          ownerType: payload.ownerType,
          ownerId: payload.ownerId,
        },
      },
      update: {
        daysOfWeek,
        startMinutes,
        endMinutes,
      },
      create: {
        companyId: membership.companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        daysOfWeek,
        startMinutes,
        endMinutes,
      },
    });

    return { success: true, data: { count: availability ? 1 : 0 } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteAvailabilitySlots(input: z.infer<typeof deleteSlotsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = deleteSlotsSchema.parse(input);
    const deleted = await prisma.autoscuolaWeeklyAvailability.deleteMany({
      where: {
        companyId: membership.companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
      },
    });

    return { success: true, data: { count: deleted.count } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAvailabilitySlots(input: z.infer<typeof getSlotsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getSlotsSchema.parse(input);

    if (!payload.date) {
      return { success: true, data: [] };
    }

    const dayStart = parseDateOnly(payload.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayOfWeek = dayStart.getDay();

    const availabilityWhere: Record<string, unknown> = {
      companyId: membership.companyId,
    };
    if (payload.ownerType) availabilityWhere.ownerType = payload.ownerType;
    if (payload.ownerId) availabilityWhere.ownerId = payload.ownerId;

    const availabilities = await prisma.autoscuolaWeeklyAvailability.findMany({
      where: availabilityWhere,
    });

    const slots = availabilities.flatMap((availability) => {
      if (!availability.daysOfWeek.includes(dayOfWeek)) return [];
      if (availability.endMinutes <= availability.startMinutes) return [];
      const startMinutes = Math.ceil(availability.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
      const lastStart = availability.endMinutes - SLOT_MINUTES;
      const ownerSlots: Array<{
        id: string;
        companyId: string;
        ownerType: string;
        ownerId: string;
        startsAt: Date;
        endsAt: Date;
        status: string;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (let minutes = startMinutes; minutes <= lastStart; minutes += SLOT_MINUTES) {
        const startsAt = new Date(dayStart);
        startsAt.setMinutes(minutes, 0, 0);
        const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
        ownerSlots.push({
          id: randomUUID(),
          companyId: membership.companyId,
          ownerType: availability.ownerType,
          ownerId: availability.ownerId,
          startsAt,
          endsAt,
          status: "open",
          createdAt: startsAt,
          updatedAt: startsAt,
        });
      }
      return ownerSlots;
    });

    slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

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

    const maxDays = payload.maxDays ?? DEFAULT_MAX_DAYS;
    const [activeInstructors, activeVehicles, studentAvailability] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaWeeklyAvailability.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "student",
          ownerId: payload.studentId,
        },
      }),
    ]);
    const activeInstructorIds = activeInstructors.map((item) => item.id);
    const activeVehicleIds = activeVehicles.map((item) => item.id);

    const [instructorAvailabilities, vehicleAvailabilities] = await Promise.all([
      activeInstructorIds.length
        ? prisma.autoscuolaWeeklyAvailability.findMany({
            where: {
              companyId: membership.companyId,
              ownerType: "instructor",
              ownerId: { in: activeInstructorIds },
            },
          })
        : [],
      activeVehicleIds.length
        ? prisma.autoscuolaWeeklyAvailability.findMany({
            where: {
              companyId: membership.companyId,
              ownerType: "vehicle",
              ownerId: { in: activeVehicleIds },
            },
          })
        : [],
    ]);

    const instructorAvailabilityMap = new Map(
      instructorAvailabilities.map((availability) => [
        availability.ownerId,
        availability,
      ]),
    );
    const vehicleAvailabilityMap = new Map(
      vehicleAvailabilities.map((availability) => [
        availability.ownerId,
        availability,
      ]),
    );

    const buildAppointmentMaps = (
      appointments: Array<{
        instructorId: string | null;
        vehicleId: string | null;
        studentId: string;
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
        add(appointment.studentId, start, end);
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

    const isOwnerAvailable = (
      availability:
        | { daysOfWeek: number[]; startMinutes: number; endMinutes: number }
        | null
        | undefined,
      dayOfWeek: number,
      startMinutes: number,
      endMinutes: number,
    ) => {
      if (!availability) return false;
      if (!availability.daysOfWeek.includes(dayOfWeek)) return false;
      if (availability.endMinutes <= availability.startMinutes) return false;
      return startMinutes >= availability.startMinutes && endMinutes <= availability.endMinutes;
    };

    const buildCandidateStarts = (
      dayStart: Date,
      window: { startMinutes: number; endMinutes: number },
    ) => {
      const first = Math.ceil(window.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
      const lastStart = window.endMinutes - payload.durationMinutes;
      if (lastStart < first) return [];
      const candidates: Date[] = [];
      for (let minutes = first; minutes <= lastStart; minutes += SLOT_MINUTES) {
        const start = new Date(dayStart);
        start.setHours(0, 0, 0, 0);
        start.setMinutes(minutes, 0, 0);
        candidates.push(start);
      }
      return candidates;
    };

    const findCandidateForDay = async (
      dayStart: Date,
      preferredWindow?: { startMinutes: number; endMinutes: number },
      forcedStart?: Date,
    ) => {
      if (!studentAvailability) return null;
      if (!activeInstructorIds.length || !activeVehicleIds.length) return null;

      const dayOfWeek = dayStart.getDay();
      if (!studentAvailability.daysOfWeek.includes(dayOfWeek)) {
        return null;
      }

      let startMinutes = studentAvailability.startMinutes;
      let endMinutes = studentAvailability.endMinutes;
      if (preferredWindow) {
        startMinutes = Math.max(startMinutes, preferredWindow.startMinutes);
        endMinutes = Math.min(endMinutes, preferredWindow.endMinutes);
      }
      if (endMinutes - startMinutes < payload.durationMinutes) {
        return null;
      }

      const window = { startMinutes, endMinutes };
      let candidateStarts = buildCandidateStarts(dayStart, window);
      if (forcedStart) {
        const forcedMinutes = minutesFromDate(forcedStart);
        if (forcedMinutes % SLOT_MINUTES !== 0) return null;
        if (forcedMinutes < window.startMinutes) return null;
        if (forcedMinutes + payload.durationMinutes > window.endMinutes) return null;
        candidateStarts = [forcedStart];
      }
      if (!candidateStarts.length) return null;

      const rangeStart = new Date(dayStart);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
      const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
      const appointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          status: { notIn: ["cancelled"] },
          startsAt: { gte: appointmentScanStart, lt: rangeEnd },
        },
      });

      const appointmentMaps = buildAppointmentMaps(appointments);
      const studentIntervals = appointmentMaps.intervals.get(payload.studentId);

      let best: {
        start: Date;
        end: Date;
        instructorId: string;
        vehicleId: string;
        score: number;
      } | null = null;

      for (const startDate of candidateStarts) {
        const endDate = getSlotEnd(startDate, payload.durationMinutes);
        const startMs = startDate.getTime();
        if (startDate < rangeStart || endDate > rangeEnd) continue;
        if (overlaps(studentIntervals, startMs, endDate.getTime())) continue;

        const candidateStartMinutes = minutesFromDate(startDate);
        const candidateEndMinutes = candidateStartMinutes + payload.durationMinutes;

        const availableInstructors: Array<{
          id: string;
          score: number;
        }> = [];
        for (const ownerId of activeInstructorIds) {
          const availability = instructorAvailabilityMap.get(ownerId);
          if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
            continue;
          }
          const intervals = appointmentMaps.intervals.get(ownerId);
          if (overlaps(intervals, startMs, endDate.getTime())) continue;
          const score =
            (appointmentMaps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
            (appointmentMaps.starts.get(ownerId)?.has(endDate.getTime()) ? 1 : 0);
          availableInstructors.push({
            id: ownerId,
            score,
          });
        }

        const availableVehicles: Array<{
          id: string;
          score: number;
        }> = [];
        for (const ownerId of activeVehicleIds) {
          const availability = vehicleAvailabilityMap.get(ownerId);
          if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
            continue;
          }
          const intervals = appointmentMaps.intervals.get(ownerId);
          if (overlaps(intervals, startMs, endDate.getTime())) continue;
          const score =
            (appointmentMaps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
            (appointmentMaps.starts.get(ownerId)?.has(endDate.getTime()) ? 1 : 0);
          availableVehicles.push({
            id: ownerId,
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

        if (
          !best ||
          score > best.score ||
          (score === best.score && startMs < best.start.getTime())
        ) {
          best = {
            start: startDate,
            end: endDate,
            instructorId: instructorChoice.id,
            vehicleId: vehicleChoice.id,
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
      rangeStart.setHours(0, 0, 0, 0);
      const candidate = await findCandidateForDay(rangeStart, undefined, selectedStart);
      if (!candidate) {
        return { success: false, message: "Slot non disponibile." };
      }

      const appointment = await prisma.$transaction(async (tx) => {
        const studentSlot = await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "student",
              ownerId: payload.studentId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "student",
            ownerId: payload.studentId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
        });

        await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "instructor",
              ownerId: candidate.instructorId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "instructor",
            ownerId: candidate.instructorId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
        });

        await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "vehicle",
              ownerId: candidate.vehicleId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "vehicle",
            ownerId: candidate.vehicleId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
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
            slotId: studentSlot.id,
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

    let candidate = null as Awaited<ReturnType<typeof findCandidateForDay>> | null;
    if (payload.preferredStartTime && payload.preferredEndTime) {
      const parsedStart = parseTime(payload.preferredStartTime);
      const parsedEnd = parseTime(payload.preferredEndTime);
      if (parsedStart && parsedEnd) {
        candidate = await findCandidateForDay(preferredDate, {
          startMinutes: parsedStart.hours * 60 + parsedStart.minutes,
          endMinutes: parsedEnd.hours * 60 + parsedEnd.minutes,
        });
      }
    }

    if (!candidate) {
      candidate = await findCandidateForDay(preferredDate);
    }

    if (candidate) {
      const appointment = await prisma.$transaction(async (tx) => {
        const studentSlot = await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "student",
              ownerId: payload.studentId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "student",
            ownerId: payload.studentId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
        });

        await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "instructor",
              ownerId: candidate.instructorId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "instructor",
            ownerId: candidate.instructorId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
        });

        await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "vehicle",
              ownerId: candidate.vehicleId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "vehicle",
            ownerId: candidate.vehicleId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
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
            slotId: studentSlot.id,
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
      const altCandidate = await findCandidateForDay(altDay);
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
