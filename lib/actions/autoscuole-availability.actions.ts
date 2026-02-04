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
});

const getSlotsSchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]).optional(),
  ownerId: z.string().uuid().optional(),
  date: z.string().optional(),
});

const bookingRequestSchema = z.object({
  studentId: z.string().uuid(),
  desiredDate: z.string(),
});

const respondOfferSchema = z.object({
  offerId: z.string().uuid(),
  studentId: z.string().uuid(),
  response: z.enum(["accept", "decline"]),
});

const SLOT_MINUTES = 30;

const slotKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;

export async function createAvailabilitySlots(input: z.infer<typeof slotSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = slotSchema.parse(input);
    const start = new Date(payload.startsAt);
    const end = new Date(payload.endsAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return { success: false, message: "Intervallo non valido." };
    }

    const slots: Array<{
      companyId: string;
      ownerType: string;
      ownerId: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
    }> = [];

    for (let cursor = new Date(start); cursor < end; ) {
      const next = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000);
      if (next > end) break;
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

    if (!slots.length) {
      return { success: false, message: "Nessuno slot generato." };
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

    const dayStart = new Date(payload.desiredDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [studentSlots, instructorSlots, vehicleSlots] = await Promise.all([
      prisma.autoscuolaAvailabilitySlot.findMany({
        where: {
          companyId: membership.companyId,
          ownerType: "student",
          ownerId: payload.studentId,
          status: "open",
          startsAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.autoscuolaAvailabilitySlot.findMany({
        where: {
          companyId: membership.companyId,
          ownerType: "instructor",
          status: "open",
          startsAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.autoscuolaAvailabilitySlot.findMany({
        where: {
          companyId: membership.companyId,
          ownerType: "vehicle",
          status: "open",
          startsAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { startsAt: "asc" },
      }),
    ]);

    const instructorByKey = new Map<string, typeof instructorSlots[number]>();
    for (const slot of instructorSlots) {
      const key = slotKey(slot.startsAt);
      if (!instructorByKey.has(key)) instructorByKey.set(key, slot);
    }
    const vehicleByKey = new Map<string, typeof vehicleSlots[number]>();
    for (const slot of vehicleSlots) {
      const key = slotKey(slot.startsAt);
      if (!vehicleByKey.has(key)) vehicleByKey.set(key, slot);
    }

    let matched:
      | {
          studentSlot: typeof studentSlots[number];
          instructorSlot: typeof instructorSlots[number];
          vehicleSlot: typeof vehicleSlots[number];
        }
      | undefined;

    for (const studentSlot of studentSlots) {
      const key = slotKey(studentSlot.startsAt);
      const instructorSlot = instructorByKey.get(key);
      const vehicleSlot = vehicleByKey.get(key);
      if (instructorSlot && vehicleSlot) {
        matched = { studentSlot, instructorSlot, vehicleSlot };
        break;
      }
    }

    if (!matched) {
      const request = await prisma.autoscuolaBookingRequest.create({
        data: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          desiredDate: dayStart,
          status: "pending",
        },
      });
      return { success: true, data: { matched: false, request } };
    }

    const { studentSlot, instructorSlot, vehicleSlot } = matched;

    const appointment = await prisma.$transaction(async (tx) => {
      await tx.autoscuolaAvailabilitySlot.updateMany({
        where: { id: { in: [studentSlot.id, instructorSlot.id, vehicleSlot.id] } },
        data: { status: "booked" },
      });

      return tx.autoscuolaAppointment.create({
        data: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          type: "guida",
          startsAt: studentSlot.startsAt,
          endsAt: studentSlot.endsAt,
          status: "scheduled",
          instructorId: instructorSlot.ownerId,
          vehicleId: vehicleSlot.ownerId,
          slotId: studentSlot.id,
        },
      });
    });

    const request = await prisma.autoscuolaBookingRequest.create({
      data: {
        companyId: membership.companyId,
        studentId: payload.studentId,
        desiredDate: dayStart,
        status: "matched",
      },
    });

    return { success: true, data: { matched: true, appointment, request } };
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
