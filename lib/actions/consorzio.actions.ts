"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
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
      select: { id: true, code: true },
    });
    return { success: true as const, data: { codes } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function createConsorzioAccountingCode(code: string) {
  try {
    const { membership } = await requireConsortium();
    const label = code.trim().toUpperCase();
    if (!label) {
      return { success: false as const, message: "Il codice è vuoto." };
    }
    const row = await prisma.consorzioAccountingCode.upsert({
      where: {
        consorzioCompanyId_code: {
          consorzioCompanyId: membership.companyId,
          code: label,
        },
      },
      create: { consorzioCompanyId: membership.companyId, code: label },
      // Ri-creare un codice archiviato lo riattiva.
      update: { archivedAt: null },
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
