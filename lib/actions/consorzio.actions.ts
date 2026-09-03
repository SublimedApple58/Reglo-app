"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { CONSORTIUM_LICENSE_CATEGORIES } from "@/lib/autoscuole/license";
import { requireConsortium } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

// Server actions della sezione consorzio (autoscuole consorziate, codici
// contabili). Ogni action apre con requireConsortium(): company AUTOSCUOLE
// attiva E in modalità consorzio. Vedi docs/features/consorzio.md.

// ─── Schemas ────────────────────────────────────────────────

const schoolFieldsSchema = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio."),
  city: z.string().trim().optional(),
  ownerName: z.string().trim().optional(),
  address: z.string().trim().optional(),
  vatNumber: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Email non valida.").optional().or(z.literal("")),
  /** YYYY-MM (mese di ingresso nel consorzio) o ISO date. Opzionale. */
  joinedAt: z.string().trim().optional(),
});

const updateSchoolSchema = schoolFieldsSchema.partial().extend({
  schoolId: z.string().uuid(),
});

const setSchoolStatusSchema = z.object({
  schoolId: z.string().uuid(),
  status: z.enum(["active", "suspended", "removed"]),
});

const setMemberCodesSchema = z.object({
  userId: z.string().uuid(),
  codeIds: z.array(z.string().uuid()),
});

const parseJoinedAt = (value: string | undefined): Date | null => {
  if (!value) return null;
  // "YYYY-MM" → primo del mese; altrimenti prova come data ISO.
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(value);
  const date = monthMatch
    ? new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ─── Autoscuole consorziate ─────────────────────────────────

export type ConsorzioSchoolListItem = {
  id: string;
  name: string;
  city: string | null;
  ownerName: string | null;
  status: string;
  joinedAt: string | null;
  studentsCount: number;
  lastLessonAt: string | null;
  topVehicleName: string | null;
};

export async function listConsorzioSchools() {
  try {
    const { membership } = await requireConsortium();
    const companyId = membership.companyId;

    const schools = await prisma.consorzioSchool.findMany({
      where: { consorzioCompanyId: companyId, status: { not: "removed" } },
      orderBy: { createdAt: "asc" },
    });

    // Aggregazioni in blocco: membri per scuola, poi guide dei loro allievi.
    const members = await prisma.companyMember.findMany({
      where: {
        companyId,
        autoscuolaRole: "STUDENT",
        consorzioSchoolId: { not: null },
      },
      select: { userId: true, consorzioSchoolId: true },
    });
    const schoolByStudent = new Map(
      members.map((m) => [m.userId, m.consorzioSchoolId as string]),
    );

    const appointments = members.length
      ? await prisma.autoscuolaAppointment.findMany({
          where: {
            companyId,
            studentId: { in: members.map((m) => m.userId) },
            status: { not: "cancelled" },
          },
          select: {
            studentId: true,
            startsAt: true,
            vehicle: { select: { name: true } },
          },
        })
      : [];

    const statsBySchool = new Map<
      string,
      { students: Set<string>; lastLessonAt: Date | null; vehicleCounts: Map<string, number> }
    >();
    for (const member of members) {
      const schoolId = member.consorzioSchoolId as string;
      const stats =
        statsBySchool.get(schoolId) ??
        { students: new Set<string>(), lastLessonAt: null, vehicleCounts: new Map<string, number>() };
      stats.students.add(member.userId);
      statsBySchool.set(schoolId, stats);
    }
    for (const appt of appointments) {
      if (!appt.studentId) continue;
      const schoolId = schoolByStudent.get(appt.studentId);
      if (!schoolId) continue;
      const stats = statsBySchool.get(schoolId);
      if (!stats) continue;
      if (!stats.lastLessonAt || appt.startsAt > stats.lastLessonAt) {
        stats.lastLessonAt = appt.startsAt;
      }
      if (appt.vehicle?.name) {
        stats.vehicleCounts.set(
          appt.vehicle.name,
          (stats.vehicleCounts.get(appt.vehicle.name) ?? 0) + 1,
        );
      }
    }

    const items: ConsorzioSchoolListItem[] = schools.map((school) => {
      const stats = statsBySchool.get(school.id);
      let topVehicleName: string | null = null;
      let topCount = 0;
      for (const [name, count] of stats?.vehicleCounts ?? []) {
        if (count > topCount) {
          topVehicleName = name;
          topCount = count;
        }
      }
      return {
        id: school.id,
        name: school.name,
        city: school.city,
        ownerName: school.ownerName,
        status: school.status,
        joinedAt: school.joinedAt?.toISOString() ?? null,
        studentsCount: stats?.students.size ?? 0,
        lastLessonAt: stats?.lastLessonAt?.toISOString() ?? null,
        topVehicleName,
      };
    });

    const totalStudents = members.length;

    return { success: true as const, data: { schools: items, totalStudents } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export type ConsorzioSchoolStudent = {
  userId: string;
  name: string;
  licenseCategory: string | null;
  instructorName: string | null;
  lastLessonAt: string | null;
  lessonsCount: number;
  codes: Array<{ id: string; code: string }>;
};

export async function getConsorzioSchool(schoolId: string) {
  try {
    const { membership } = await requireConsortium();
    const companyId = membership.companyId;

    const school = await prisma.consorzioSchool.findFirst({
      where: { id: schoolId, consorzioCompanyId: companyId },
    });
    if (!school) {
      return { success: false as const, message: "Autoscuola non trovata." };
    }

    const members = await prisma.companyMember.findMany({
      where: { companyId, consorzioSchoolId: schoolId, autoscuolaRole: "STUDENT" },
      select: {
        userId: true,
        licenseCategory: true,
        user: { select: { name: true } },
        assignedInstructor: { select: { name: true } },
        consorzioAccountingCodes: {
          select: { code: { select: { id: true, code: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const studentIds = members.map((m) => m.userId);
    const appointments = studentIds.length
      ? await prisma.autoscuolaAppointment.findMany({
          where: {
            companyId,
            studentId: { in: studentIds },
            status: { not: "cancelled" },
          },
          select: {
            studentId: true,
            startsAt: true,
            endsAt: true,
            consorzioBilling: { select: { settledAt: true } },
          },
        })
      : [];

    const lessonStats = new Map<string, { count: number; lastAt: Date | null }>();
    let certifiedMinutes = 0;
    let toCertifyMinutes = 0;
    const now = new Date();
    for (const appt of appointments) {
      if (!appt.studentId) continue;
      const stats = lessonStats.get(appt.studentId) ?? { count: 0, lastAt: null };
      stats.count += 1;
      if (!stats.lastAt || appt.startsAt > stats.lastAt) stats.lastAt = appt.startsAt;
      lessonStats.set(appt.studentId, stats);
      // Ore certificate = guide passate con billing saldato; da certificare =
      // guide passate non ancora saldate. Le future non contano.
      if (appt.startsAt <= now && appt.endsAt) {
        const minutes = Math.max(
          0,
          Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60000),
        );
        if (appt.consorzioBilling?.settledAt) certifiedMinutes += minutes;
        else toCertifyMinutes += minutes;
      }
    }

    const students: ConsorzioSchoolStudent[] = members.map((member) => ({
      userId: member.userId,
      name: member.user.name ?? "—",
      licenseCategory: member.licenseCategory,
      instructorName: member.assignedInstructor?.name ?? null,
      lastLessonAt: lessonStats.get(member.userId)?.lastAt?.toISOString() ?? null,
      lessonsCount: lessonStats.get(member.userId)?.count ?? 0,
      codes: member.consorzioAccountingCodes.map((link) => link.code),
    }));

    return {
      success: true as const,
      data: {
        school: {
          id: school.id,
          name: school.name,
          city: school.city,
          ownerName: school.ownerName,
          address: school.address,
          vatNumber: school.vatNumber,
          phone: school.phone,
          email: school.email,
          status: school.status,
          joinedAt: school.joinedAt?.toISOString() ?? null,
        },
        stats: {
          activeStudents: members.length,
          lessonsCount: appointments.length,
          certifiedMinutes,
          toCertifyMinutes,
        },
        students,
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function createConsorzioSchool(
  input: z.infer<typeof schoolFieldsSchema>,
) {
  try {
    const { membership } = await requireConsortium();
    const payload = schoolFieldsSchema.parse(input);

    const school = await prisma.consorzioSchool.create({
      data: {
        consorzioCompanyId: membership.companyId,
        name: payload.name,
        city: payload.city || null,
        ownerName: payload.ownerName || null,
        address: payload.address || null,
        vatNumber: payload.vatNumber || null,
        phone: payload.phone || null,
        email: payload.email || null,
        joinedAt: parseJoinedAt(payload.joinedAt) ?? new Date(),
      },
    });

    return { success: true as const, data: { schoolId: school.id } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function updateConsorzioSchool(
  input: z.infer<typeof updateSchoolSchema>,
) {
  try {
    const { membership } = await requireConsortium();
    const payload = updateSchoolSchema.parse(input);

    const school = await prisma.consorzioSchool.findFirst({
      where: { id: payload.schoolId, consorzioCompanyId: membership.companyId },
      select: { id: true },
    });
    if (!school) {
      return { success: false as const, message: "Autoscuola non trovata." };
    }

    await prisma.consorzioSchool.update({
      where: { id: school.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.city !== undefined ? { city: payload.city || null } : {}),
        ...(payload.ownerName !== undefined ? { ownerName: payload.ownerName || null } : {}),
        ...(payload.address !== undefined ? { address: payload.address || null } : {}),
        ...(payload.vatNumber !== undefined ? { vatNumber: payload.vatNumber || null } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone || null } : {}),
        ...(payload.email !== undefined ? { email: payload.email || null } : {}),
        ...(payload.joinedAt !== undefined
          ? { joinedAt: parseJoinedAt(payload.joinedAt) }
          : {}),
      },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Sospende / riattiva / rimuove un'autoscuola consorziata. Mai hard delete:
 * "removed" la nasconde dalla lista ma le guide già contabilizzate restano.
 */
export async function setConsorzioSchoolStatus(
  input: z.infer<typeof setSchoolStatusSchema>,
) {
  try {
    const { membership } = await requireConsortium();
    const payload = setSchoolStatusSchema.parse(input);

    const school = await prisma.consorzioSchool.findFirst({
      where: { id: payload.schoolId, consorzioCompanyId: membership.companyId },
      select: { id: true },
    });
    if (!school) {
      return { success: false as const, message: "Autoscuola non trovata." };
    }

    await prisma.consorzioSchool.update({
      where: { id: school.id },
      data: { status: payload.status },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ─── Codici contabili ───────────────────────────────────────

export async function listConsorzioAccountingCodes() {
  try {
    const { membership } = await requireConsortium();
    const codes = await prisma.consorzioAccountingCode.findMany({
      where: { consorzioCompanyId: membership.companyId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, description: true },
    });
    return { success: true as const, data: { codes } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function createConsorzioAccountingCode(code: string, description?: string) {
  try {
    const { membership } = await requireConsortium();
    const label = code.trim().toUpperCase();
    if (!label) {
      return { success: false as const, message: "Il codice è vuoto." };
    }
    const desc = description?.trim() || null;
    const row = await prisma.consorzioAccountingCode.upsert({
      where: {
        consorzioCompanyId_code: {
          consorzioCompanyId: membership.companyId,
          code: label,
        },
      },
      create: { consorzioCompanyId: membership.companyId, code: label, description: desc },
      // Ri-creare un codice archiviato lo riattiva (e aggiorna la descrizione).
      update: { archivedAt: null, ...(desc ? { description: desc } : {}) },
    });
    return { success: true as const, data: { id: row.id, code: row.code } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function archiveConsorzioAccountingCode(codeId: string) {
  try {
    const { membership } = await requireConsortium();
    const row = await prisma.consorzioAccountingCode.findFirst({
      where: { id: codeId, consorzioCompanyId: membership.companyId },
      select: { id: true },
    });
    if (!row) {
      return { success: false as const, message: "Codice non trovato." };
    }
    await prisma.consorzioAccountingCode.update({
      where: { id: row.id },
      data: { archivedAt: new Date() },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ─── Richieste guida (flusso ricevente) ─────────────────────

const acceptGuideRequestSchema = z.object({
  requestId: z.string().uuid(),
  instructorId: z.string().uuid(),
  /** ISO dello slot scelto: quello richiesto, o un altro se il consorzio ha "spostato". */
  startsAt: z.string().datetime(),
});

export type ConsorzioGuideRequestDetail = {
  id: string;
  status: string;
  requestedStartsAt: string;
  durationMinutes: number;
  schoolName: string;
  studentUserId: string;
  studentName: string;
  vehicleId: string | null;
  vehicleName: string | null;
  note: string | null;
};

export async function getConsorzioGuideRequest(requestId: string) {
  try {
    const { membership } = await requireConsortium();
    const request = await prisma.consorzioGuideRequest.findFirst({
      where: { id: requestId, consorzioCompanyId: membership.companyId },
      include: {
        school: { select: { name: true } },
        student: { select: { id: true, name: true } },
        vehicle: { select: { id: true, name: true } },
      },
    });
    if (!request) {
      return { success: false as const, message: "Richiesta non trovata." };
    }
    const detail: ConsorzioGuideRequestDetail = {
      id: request.id,
      status: request.status,
      requestedStartsAt: request.requestedStartsAt.toISOString(),
      durationMinutes: request.durationMinutes,
      schoolName: request.school.name,
      studentUserId: request.student.id,
      studentName: request.student.name ?? "—",
      vehicleId: request.vehicle?.id ?? null,
      vehicleName: request.vehicle?.name ?? null,
      note: request.note,
    };
    return { success: true as const, data: detail };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Accetta una richiesta guida: pending → accepted + crea l'AutoscuolaAppointment
 * (bookingSource "consortium_request") sullo slot scelto con l'istruttore
 * scelto. Se lo slot differisce da quello richiesto viene tracciato in
 * `movedToStartsAt` (azione "Sposta"). Controllo conflitti su istruttore e
 * veicolo. La notifica all'autoscuola richiedente arriverà con la fase
 * affiliate (oggi nessun destinatario).
 */
export async function acceptConsorzioGuideRequest(
  input: z.infer<typeof acceptGuideRequestSchema>,
) {
  try {
    const { membership } = await requireConsortium();
    const companyId = membership.companyId;
    const payload = acceptGuideRequestSchema.parse(input);

    const request = await prisma.consorzioGuideRequest.findFirst({
      where: { id: payload.requestId, consorzioCompanyId: companyId },
    });
    if (!request) {
      return { success: false as const, message: "Richiesta non trovata." };
    }
    if (request.status !== "pending") {
      return { success: false as const, message: "Richiesta già gestita." };
    }

    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: { id: payload.instructorId, companyId, status: "active" },
      select: { id: true },
    });
    if (!instructor) {
      return { success: false as const, message: "Istruttore non valido." };
    }

    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(startsAt.getTime() + request.durationMinutes * 60000);

    // Conflitti: guida non annullata sovrapposta con lo stesso istruttore o
    // lo stesso veicolo → errore, la richiesta resta pending.
    const conflict = await prisma.autoscuolaAppointment.findFirst({
      where: {
        companyId,
        status: { not: "cancelled" },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [
          { instructorId: instructor.id },
          ...(request.vehicleId ? [{ vehicleId: request.vehicleId }] : []),
        ],
      },
      select: { id: true, instructorId: true },
    });
    if (conflict) {
      return {
        success: false as const,
        message:
          conflict.instructorId === instructor.id
            ? "L'istruttore ha già un impegno in quello slot. Sposta la richiesta o scegli un altro istruttore."
            : "Il veicolo è già impegnato in quello slot. Sposta la richiesta.",
      };
    }

    const moved = startsAt.getTime() !== request.requestedStartsAt.getTime();

    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.autoscuolaAppointment.create({
        data: {
          companyId,
          studentId: request.studentUserId,
          type: "guida",
          status: "scheduled",
          startsAt,
          endsAt,
          instructorId: instructor.id,
          vehicleId: request.vehicleId,
          bookingSource: "consortium_request",
        },
      });
      await tx.consorzioGuideRequest.update({
        where: { id: request.id },
        data: {
          status: "accepted",
          appointmentId: created.id,
          movedToStartsAt: moved ? startsAt : null,
          respondedAt: new Date(),
          respondedByUserId: membership.userId,
        },
      });
      return created;
    });

    await invalidateAutoscuoleCache({
      companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return { success: true as const, data: { appointmentId: appointment.id } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function rejectConsorzioGuideRequest(requestId: string) {
  try {
    const { membership } = await requireConsortium();
    const request = await prisma.consorzioGuideRequest.findFirst({
      where: { id: requestId, consorzioCompanyId: membership.companyId },
      select: { id: true, status: true },
    });
    if (!request) {
      return { success: false as const, message: "Richiesta non trovata." };
    }
    if (request.status !== "pending") {
      return { success: false as const, message: "Richiesta già gestita." };
    }
    await prisma.consorzioGuideRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        respondedAt: new Date(),
        respondedByUserId: membership.userId,
      },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ─── Drawer dettaglio allievo (dal dettaglio autoscuola) ────

export type ConsorzioStudentDetail = {
  userId: string;
  name: string;
  schoolName: string | null;
  schoolCity: string | null;
  licenseCategory: string | null;
  lessonsCount: number;
  certifiedMinutes: number;
  codes: Array<{ id: string; code: string; description: string | null }>;
  allCodes: Array<{ id: string; code: string; description: string | null }>;
  lessons: Array<{
    appointmentId: string;
    startsAt: string;
    durationMinutes: number;
    vehicleName: string | null;
    instructorName: string | null;
    certified: boolean;
  }>;
};

export async function getConsorzioStudentDetail(userId: string) {
  try {
    const { membership } = await requireConsortium();
    const companyId = membership.companyId;

    const member = await prisma.companyMember.findFirst({
      where: { companyId, userId, autoscuolaRole: "STUDENT" },
      select: {
        userId: true,
        licenseCategory: true,
        user: { select: { name: true } },
        consorzioSchool: { select: { name: true, city: true } },
        consorzioAccountingCodes: {
          select: { code: { select: { id: true, code: true, description: true } } },
        },
      },
    });
    if (!member) {
      return { success: false as const, message: "Allievo non trovato." };
    }

    const [appointments, allCodes] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: userId,
          status: { not: "cancelled" },
          type: { notIn: ["esame", "group_lesson"] },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          instructor: { select: { name: true } },
          vehicle: { select: { name: true } },
          consorzioBilling: { select: { settledAt: true } },
        },
        orderBy: { startsAt: "desc" },
        take: 30,
      }),
      prisma.consorzioAccountingCode.findMany({
        where: { consorzioCompanyId: companyId, archivedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, code: true, description: true },
      }),
    ]);

    let certifiedMinutes = 0;
    const lessons = appointments.map((appt) => {
      const durationMinutes = appt.endsAt
        ? Math.max(0, Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60000))
        : 60;
      const certified = Boolean(appt.consorzioBilling?.settledAt);
      if (certified) certifiedMinutes += durationMinutes;
      return {
        appointmentId: appt.id,
        startsAt: appt.startsAt.toISOString(),
        durationMinutes,
        vehicleName: appt.vehicle?.name ?? null,
        instructorName: appt.instructor?.name ?? null,
        certified,
      };
    });

    const detail: ConsorzioStudentDetail = {
      userId: member.userId,
      name: member.user.name ?? "—",
      schoolName: member.consorzioSchool?.name ?? null,
      schoolCity: member.consorzioSchool?.city ?? null,
      licenseCategory: member.licenseCategory,
      lessonsCount: appointments.length,
      certifiedMinutes,
      codes: member.consorzioAccountingCodes.map((link) => link.code),
      allCodes,
      lessons,
    };
    return { success: true as const, data: detail };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ─── Prezzi (Impostazioni → Prenotazioni e allievi → Prezzi) ─

const pricingSchema = z.object({
  hourlyByCategory: z.record(
    z.enum(CONSORTIUM_LICENSE_CATEGORIES),
    z.number().min(0).max(10000).nullable(),
  ),
  lateCancellationCutoffHours: z.number().int().min(0).max(336),
  lateCancellationPenaltyPct: z.number().int().min(0).max(100),
});

export type ConsorzioPricing = {
  hourlyByCategory: Partial<Record<string, number>>;
  lateCancellationCutoffHours: number;
  lateCancellationPenaltyPct: number;
};

const DEFAULT_CUTOFF_HOURS = 48;
const DEFAULT_PENALTY_PCT = 100;

const parsePricingFromLimits = (limits: Record<string, unknown>): ConsorzioPricing => {
  const raw = (limits.consorzioPricing ?? {}) as Record<string, unknown>;
  const hourlyRaw = (raw.hourlyByCategory ?? {}) as Record<string, unknown>;
  const hourlyByCategory: Partial<Record<string, number>> = {};
  for (const category of CONSORTIUM_LICENSE_CATEGORIES) {
    const value = hourlyRaw[category];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      hourlyByCategory[category] = value;
    }
  }
  return {
    hourlyByCategory,
    lateCancellationCutoffHours:
      typeof raw.lateCancellationCutoffHours === "number"
        ? raw.lateCancellationCutoffHours
        : DEFAULT_CUTOFF_HOURS,
    lateCancellationPenaltyPct:
      typeof raw.lateCancellationPenaltyPct === "number"
        ? raw.lateCancellationPenaltyPct
        : DEFAULT_PENALTY_PCT,
  };
};

export async function getConsorzioPricing() {
  try {
    const { company } = await requireConsortium();
    const service = company.services?.find((s) => s.serviceKey === "AUTOSCUOLE");
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    return { success: true as const, data: parsePricingFromLimits(limits) };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function updateConsorzioPricing(input: z.infer<typeof pricingSchema>) {
  try {
    const { membership } = await requireConsortium();
    const payload = pricingSchema.parse(input);

    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
    });
    if (!service) {
      return { success: false as const, message: "Servizio non trovato." };
    }

    const limits = (service.limits ?? {}) as Record<string, unknown>;
    const hourlyByCategory: Partial<Record<string, number>> = {};
    for (const category of CONSORTIUM_LICENSE_CATEGORIES) {
      const value = payload.hourlyByCategory[category];
      if (typeof value === "number") hourlyByCategory[category] = value;
    }

    await prisma.companyService.update({
      where: { id: service.id },
      data: {
        limits: {
          ...limits,
          consorzioPricing: {
            hourlyByCategory,
            lateCancellationCutoffHours: payload.lateCancellationCutoffHours,
            lateCancellationPenaltyPct: payload.lateCancellationPenaltyPct,
          },
        } as object,
      },
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ─── Fatturazione (contabilizzazione guide → autoscuole) ────

const billingMonthSchema = z.object({
  /** "YYYY-MM" */
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const setBillingFlagsSchema = z.object({
  appointmentId: z.string().uuid(),
  settled: z.boolean().optional(),
  invoiceSent: z.boolean().optional(),
});

const setAppointmentCodesSchema = z.object({
  appointmentId: z.string().uuid(),
  codeIds: z.array(z.string().uuid()),
});

export type ConsorzioBillingLesson = {
  appointmentId: string;
  startsAt: string;
  durationMinutes: number;
  studentName: string;
  licenseCategory: string | null;
  instructorName: string | null;
  vehicleName: string | null;
  codes: Array<{ id: string; code: string }>;
  price: number;
  settled: boolean;
  invoiceSent: boolean;
};

export type ConsorzioBillingSchoolGroup = {
  schoolId: string;
  schoolName: string;
  schoolCity: string | null;
  lessons: ConsorzioBillingLesson[];
  total: number;
};

const decimalToNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Vista Fatturazione di un mese: guide (non annullate) degli allievi del
 * consorzio raggruppate per autoscuola consorziata. Il prezzo di una guida è
 * lo snapshot in ConsorzioLessonBilling se esiste (creato al primo toggle
 * saldata/fatturata), altrimenti è calcolato live = durata/60 × tariffa
 * corrente della categoria dell'allievo. Così i ritocchi di tariffa si
 * riflettono sulle guide non ancora certificate, mai su quelle già saldate.
 */
export async function getConsorzioBilling(input: z.infer<typeof billingMonthSchema>) {
  try {
    const { membership, company } = await requireConsortium();
    const companyId = membership.companyId;
    const payload = billingMonthSchema.parse(input);

    const [yearStr, monthStr] = payload.month.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    const service = company.services?.find((s) => s.serviceKey === "AUTOSCUOLE");
    const pricing = parsePricingFromLimits(
      (service?.limits ?? {}) as Record<string, unknown>,
    );

    const members = await prisma.companyMember.findMany({
      where: { companyId, consorzioSchoolId: { not: null }, autoscuolaRole: "STUDENT" },
      select: {
        userId: true,
        consorzioSchoolId: true,
        licenseCategory: true,
        user: { select: { name: true } },
        consorzioAccountingCodes: {
          select: { code: { select: { id: true, code: true } } },
        },
      },
    });
    const memberByUserId = new Map(members.map((m) => [m.userId, m]));

    const appointments = members.length
      ? await prisma.autoscuolaAppointment.findMany({
          where: {
            companyId,
            studentId: { in: members.map((m) => m.userId) },
            startsAt: { gte: monthStart, lt: monthEnd },
            status: { not: "cancelled" },
            type: { notIn: ["esame", "group_lesson"] },
          },
          select: {
            id: true,
            studentId: true,
            startsAt: true,
            endsAt: true,
            instructor: { select: { name: true } },
            vehicle: { select: { name: true } },
            consorzioBilling: {
              select: { priceAmount: true, settledAt: true, invoiceSentAt: true },
            },
            consorzioAccountingCodes: {
              select: { code: { select: { id: true, code: true } } },
            },
          },
          orderBy: { startsAt: "asc" },
        })
      : [];

    const schools = await prisma.consorzioSchool.findMany({
      where: { consorzioCompanyId: companyId },
      select: { id: true, name: true, city: true, status: true },
      orderBy: { createdAt: "asc" },
    });

    const lessonsBySchool = new Map<string, ConsorzioBillingLesson[]>();
    for (const appt of appointments) {
      const member = appt.studentId ? memberByUserId.get(appt.studentId) : undefined;
      if (!member?.consorzioSchoolId) continue;
      const durationMinutes = appt.endsAt
        ? Math.max(0, Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60000))
        : 60;
      const tariff = member.licenseCategory
        ? pricing.hourlyByCategory[member.licenseCategory]
        : undefined;
      const livePrice =
        tariff !== undefined ? Math.round(((durationMinutes / 60) * tariff) * 100) / 100 : 0;
      const billing = appt.consorzioBilling;
      // Codici della guida: espliciti se presenti, altrimenti i default allievo.
      const codes = appt.consorzioAccountingCodes.length
        ? appt.consorzioAccountingCodes.map((link) => link.code)
        : member.consorzioAccountingCodes.map((link) => link.code);

      const lesson: ConsorzioBillingLesson = {
        appointmentId: appt.id,
        startsAt: appt.startsAt.toISOString(),
        durationMinutes,
        studentName: member.user.name ?? "—",
        licenseCategory: member.licenseCategory,
        instructorName: appt.instructor?.name ?? null,
        vehicleName: appt.vehicle?.name ?? null,
        codes,
        price: billing ? decimalToNumber(billing.priceAmount) : livePrice,
        settled: Boolean(billing?.settledAt),
        invoiceSent: Boolean(billing?.invoiceSentAt),
      };
      const list = lessonsBySchool.get(member.consorzioSchoolId) ?? [];
      list.push(lesson);
      lessonsBySchool.set(member.consorzioSchoolId, list);
    }

    const groups: ConsorzioBillingSchoolGroup[] = schools
      .filter((school) => school.status !== "removed" || lessonsBySchool.has(school.id))
      .map((school) => {
        const lessons = lessonsBySchool.get(school.id) ?? [];
        return {
          schoolId: school.id,
          schoolName: school.name,
          schoolCity: school.city,
          lessons,
          total: Math.round(lessons.reduce((sum, lesson) => sum + lesson.price, 0) * 100) / 100,
        };
      })
      .filter((group) => group.lessons.length > 0);

    const allLessons = groups.flatMap((group) => group.lessons);
    const total = Math.round(allLessons.reduce((sum, l) => sum + l.price, 0) * 100) / 100;
    const settledTotal =
      Math.round(
        allLessons.filter((l) => l.settled).reduce((sum, l) => sum + l.price, 0) * 100,
      ) / 100;

    const codes = await prisma.consorzioAccountingCode.findMany({
      where: { consorzioCompanyId: companyId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true },
    });

    return {
      success: true as const,
      data: {
        groups,
        totals: {
          total,
          settled: settledTotal,
          outstanding: Math.round((total - settledTotal) * 100) / 100,
        },
        codes,
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Toggle "saldata" / "fattura inviata" su una guida. Al primo toggle la riga
 * di billing viene creata congelando il prezzo corrente (durata/60 × tariffa).
 */
export async function setConsorzioLessonBillingFlags(
  input: z.infer<typeof setBillingFlagsSchema>,
) {
  try {
    const { membership, company } = await requireConsortium();
    const companyId = membership.companyId;
    const payload = setBillingFlagsSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId },
      select: {
        id: true,
        studentId: true,
        startsAt: true,
        endsAt: true,
        consorzioBilling: { select: { id: true } },
      },
    });
    if (!appointment?.studentId) {
      return { success: false as const, message: "Guida non trovata." };
    }
    const member = await prisma.companyMember.findFirst({
      where: { companyId, userId: appointment.studentId },
      select: { consorzioSchoolId: true, licenseCategory: true },
    });
    if (!member?.consorzioSchoolId) {
      return { success: false as const, message: "Guida senza autoscuola consorziata." };
    }

    const flagPatch: { settledAt?: Date | null; invoiceSentAt?: Date | null } = {};
    if (payload.settled !== undefined) flagPatch.settledAt = payload.settled ? new Date() : null;
    if (payload.invoiceSent !== undefined) {
      flagPatch.invoiceSentAt = payload.invoiceSent ? new Date() : null;
    }

    if (appointment.consorzioBilling) {
      await prisma.consorzioLessonBilling.update({
        where: { id: appointment.consorzioBilling.id },
        data: flagPatch,
      });
    } else {
      const service = company.services?.find((s) => s.serviceKey === "AUTOSCUOLE");
      const pricing = parsePricingFromLimits(
        (service?.limits ?? {}) as Record<string, unknown>,
      );
      const durationMinutes = appointment.endsAt
        ? Math.max(
            0,
            Math.round(
              (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60000,
            ),
          )
        : 60;
      const tariff = member.licenseCategory
        ? pricing.hourlyByCategory[member.licenseCategory]
        : undefined;
      const price =
        tariff !== undefined ? Math.round(((durationMinutes / 60) * tariff) * 100) / 100 : 0;
      await prisma.consorzioLessonBilling.create({
        data: {
          appointmentId: appointment.id,
          consorzioCompanyId: companyId,
          schoolId: member.consorzioSchoolId,
          priceAmount: price,
          ...flagPatch,
        },
      });
    }

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Sostituisce i codici contabili espliciti di una singola guida. */
export async function setConsorzioAppointmentAccountingCodes(
  input: z.infer<typeof setAppointmentCodesSchema>,
) {
  try {
    const { membership } = await requireConsortium();
    const companyId = membership.companyId;
    const payload = setAppointmentCodesSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId },
      select: { id: true },
    });
    if (!appointment) {
      return { success: false as const, message: "Guida non trovata." };
    }

    const validCodes = payload.codeIds.length
      ? await prisma.consorzioAccountingCode.findMany({
          where: { id: { in: payload.codeIds }, consorzioCompanyId: companyId },
          select: { id: true },
        })
      : [];

    await prisma.$transaction([
      prisma.consorzioAppointmentAccountingCode.deleteMany({
        where: { appointmentId: appointment.id },
      }),
      ...(validCodes.length
        ? [
            prisma.consorzioAppointmentAccountingCode.createMany({
              data: validCodes.map((code) => ({
                codeId: code.id,
                appointmentId: appointment.id,
              })),
            }),
          ]
        : []),
    ]);

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Sostituisce i codici contabili di default di un allievo del consorzio. */
export async function setConsorzioMemberAccountingCodes(
  input: z.infer<typeof setMemberCodesSchema>,
) {
  try {
    const { membership } = await requireConsortium();
    const payload = setMemberCodesSchema.parse(input);
    const companyId = membership.companyId;

    const member = await prisma.companyMember.findFirst({
      where: { companyId, userId: payload.userId, autoscuolaRole: "STUDENT" },
      select: { userId: true },
    });
    if (!member) {
      return { success: false as const, message: "Allievo non trovato." };
    }

    const validCodes = payload.codeIds.length
      ? await prisma.consorzioAccountingCode.findMany({
          where: { id: { in: payload.codeIds }, consorzioCompanyId: companyId },
          select: { id: true },
        })
      : [];

    await prisma.$transaction([
      prisma.consorzioMemberAccountingCode.deleteMany({
        where: { companyId, userId: payload.userId },
      }),
      ...(validCodes.length
        ? [
            prisma.consorzioMemberAccountingCode.createMany({
              data: validCodes.map((code) => ({
                codeId: code.id,
                companyId,
                userId: payload.userId,
              })),
            }),
          ]
        : []),
    ]);

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
