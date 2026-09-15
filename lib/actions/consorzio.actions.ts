"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { CONSORTIUM_LICENSE_CATEGORIES } from "@/lib/autoscuole/license";
import { guideRequestLeadTimeError } from "@/lib/consorzio/guide-request-lead";
import {
  CONSORZIO_BILLING_MODES,
  billingModeFor,
  billingMonthOf,
  coursePrice,
  examPrice,
  guidePrice,
  parseConsorzioPricing,
  roundMoney,
  type ConsorzioBillingMode,
  type ConsorzioPricing,
} from "@/lib/consorzio/pricing";
import { resolveConsortiumGuideRequestNotification } from "@/lib/autoscuole/notifications";
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
  /** Codice contabile dell'autoscuola (uno solo): si propaga ai suoi allievi. */
  accountingCode: z.string().trim().max(40, "Codice troppo lungo.").optional(),
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

/**
 * Applica il codice contabile all'autoscuola e lo propaga a TUTTI i suoi
 * allievi: il vecchio codice della scuola viene staccato dai membri, il nuovo
 * agganciato (i codici messi a mano sul singolo allievo restano). Stringa
 * vuota = nessun codice. Il codice viene creato al volo se non esiste ancora
 * (sono ~40 etichette, una per autoscuola).
 */
const syncSchoolAccountingCode = async (
  companyId: string,
  schoolId: string,
  rawCode: string,
): Promise<void> => {
  const code = rawCode.trim().toUpperCase();

  const school = await prisma.consorzioSchool.findFirst({
    where: { id: schoolId, consorzioCompanyId: companyId },
    select: { accountingCodeId: true },
  });
  const previousCodeId = school?.accountingCodeId ?? null;

  let nextCodeId: string | null = null;
  if (code) {
    const row = await prisma.consorzioAccountingCode.upsert({
      where: { consorzioCompanyId_code: { consorzioCompanyId: companyId, code } },
      update: { archivedAt: null },
      create: { consorzioCompanyId: companyId, code },
      select: { id: true },
    });
    nextCodeId = row.id;
  }
  if (nextCodeId === previousCodeId) return;

  await prisma.consorzioSchool.update({
    where: { id: schoolId },
    data: { accountingCodeId: nextCodeId },
  });

  const memberIds = (
    await prisma.companyMember.findMany({
      where: { companyId, consorzioSchoolId: schoolId },
      select: { userId: true },
    })
  ).map((member) => member.userId);
  if (memberIds.length === 0) return;

  if (previousCodeId) {
    await prisma.consorzioMemberAccountingCode.deleteMany({
      where: { companyId, codeId: previousCodeId, userId: { in: memberIds } },
    });
  }
  if (nextCodeId) {
    await prisma.consorzioMemberAccountingCode.createMany({
      data: memberIds.map((userId) => ({ companyId, userId, codeId: nextCodeId })),
      skipDuplicates: true,
    });
  }
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
  accountingCode: string | null;
};

export async function listConsorzioSchools() {
  try {
    const { membership } = await requireConsortium();
    const companyId = membership.companyId;

    const schools = await prisma.consorzioSchool.findMany({
      where: { consorzioCompanyId: companyId, status: { not: "removed" } },
      orderBy: { createdAt: "asc" },
      include: { accountingCode: { select: { code: true } } },
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
        accountingCode: school.accountingCode?.code ?? null,
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
      include: { accountingCode: { select: { code: true } } },
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
          accountingCode: school.accountingCode?.code ?? null,
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

    if (payload.accountingCode !== undefined) {
      await syncSchoolAccountingCode(
        membership.companyId,
        school.id,
        payload.accountingCode,
      );
    }

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

    if (payload.accountingCode !== undefined) {
      await syncSchoolAccountingCode(
        membership.companyId,
        school.id,
        payload.accountingCode,
      );
    }

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

// ─── Richieste guida (flusso ricevente) ─────────────────────

const acceptGuideRequestSchema = z.object({
  requestId: z.string().uuid(),
  instructorId: z.string().uuid(),
  /** ISO dello slot scelto: quello richiesto, o un altro se il consorzio ha "spostato". */
  startsAt: z.string().datetime(),
  /** Durata scelta nel dialog "Proponi un altro orario"; default = quella richiesta. */
  durationMinutes: z.number().int().min(15).max(600).optional(),
  /** Veicolo scelto nel dialog; undefined = quello richiesto, null = "Da assegnare". */
  vehicleId: z.string().uuid().nullable().optional(),
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
  /** Controproposta già inviata ("Proponi un altro orario"), se presente. */
  proposedStartsAt: string | null;
  proposedDurationMinutes: number | null;
  proposedVehicleId: string | null;
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
      proposedStartsAt: request.proposedStartsAt?.toISOString() ?? null,
      proposedDurationMinutes: request.proposedDurationMinutes,
      proposedVehicleId: request.proposedVehicleId,
    };
    return { success: true as const, data: detail };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const proposeGuideRequestSlotSchema = z.object({
  requestId: z.string().uuid(),
  /** ISO dello slot proposto all'autoscuola. */
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(600),
  /** Veicolo del consorzio proposto; null = "Da assegnare". */
  vehicleId: z.string().uuid().nullable(),
});

/**
 * "Proponi un altro orario" (prototipo): il consorzio invia all'autoscuola una
 * controproposta di slot/durata/mezzo. La richiesta resta `pending` (il
 * consorzio può comunque accettare/rifiutare); la conferma dell'autoscuola
 * arriverà con la fase affiliate — oggi la notifica alla scuola è un no-op
 * (nessun destinatario). Il ghost tratteggiato in agenda segue la proposta.
 */
export async function proposeConsorzioGuideRequestSlot(
  input: z.infer<typeof proposeGuideRequestSlotSchema>,
) {
  try {
    const { membership } = await requireConsortium();
    const companyId = membership.companyId;
    const payload = proposeGuideRequestSlotSchema.parse(input);

    const request = await prisma.consorzioGuideRequest.findFirst({
      where: { id: payload.requestId, consorzioCompanyId: companyId },
      select: { id: true, status: true },
    });
    if (!request) {
      return { success: false as const, message: "Richiesta non trovata." };
    }
    if (request.status !== "pending") {
      return { success: false as const, message: "Richiesta già gestita." };
    }

    const leadError = guideRequestLeadTimeError(
      new Date(payload.startsAt),
      await readMinLeadHours(companyId),
    );
    if (leadError) {
      return { success: false as const, message: leadError };
    }

    if (payload.vehicleId) {
      const vehicle = await prisma.autoscuolaVehicle.findFirst({
        where: { id: payload.vehicleId, companyId },
        select: { id: true },
      });
      if (!vehicle) {
        return { success: false as const, message: "Veicolo non valido." };
      }
    }

    await prisma.consorzioGuideRequest.update({
      where: { id: request.id },
      data: {
        proposedStartsAt: new Date(payload.startsAt),
        proposedDurationMinutes: payload.durationMinutes,
        proposedVehicleId: payload.vehicleId,
        proposedAt: new Date(),
        proposedByUserId: membership.userId,
      },
    });
    // Hook notifica all'autoscuola richiedente: no-op fino alla fase affiliate.

    return { success: true as const };
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

    const durationMinutes = payload.durationMinutes ?? request.durationMinutes;
    // Veicolo effettivo: quello scelto nel dialog Sposta (null = da assegnare),
    // altrimenti quello della richiesta originale.
    const vehicleId =
      payload.vehicleId !== undefined ? payload.vehicleId : request.vehicleId;
    if (vehicleId && vehicleId !== request.vehicleId) {
      const vehicle = await prisma.autoscuolaVehicle.findFirst({
        where: { id: vehicleId, companyId },
        select: { id: true },
      });
      if (!vehicle) {
        return { success: false as const, message: "Veicolo non valido." };
      }
    }
    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);

    // Preavviso minimo: vale sugli slot SCELTI dal consorzio (Sposta/proposta).
    // Accettare lo slot chiesto dall'autoscuola non viene mai bloccato: il
    // preavviso era già stato verificato quando la richiesta è stata inviata.
    if (startsAt.getTime() !== request.requestedStartsAt.getTime()) {
      const leadError = guideRequestLeadTimeError(
        startsAt,
        await readMinLeadHours(companyId),
      );
      if (leadError) {
        return { success: false as const, message: leadError };
      }
    }

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
          ...(vehicleId ? [{ vehicleId }] : []),
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
          vehicleId,
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

    // La notifica in campanella diventa "Guida accettata" (icona verde),
    // allineata allo slot effettivo se la richiesta è stata spostata.
    await resolveConsortiumGuideRequestNotification({
      companyId,
      requestId: request.id,
      outcome: "accepted",
      startsAt,
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
    // La notifica in campanella diventa "Guida rifiutata" (icona rossa).
    await resolveConsortiumGuideRequestNotification({
      companyId: membership.companyId,
      requestId: request.id,
      outcome: "rejected",
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
  /** Esami non annullati dell'allievo, voce distinta dalle guide (REG-459). */
  exams: Array<{
    appointmentId: string;
    startsAt: string;
    vehicleName: string | null;
    instructorName: string | null;
    price: number;
    settled: boolean;
  }>;
  /** Riepilogo costi verso l'autoscuola (stessa semantica prezzi della Fatturazione). */
  costs: {
    guides: { count: number; amount: number; includedInCourse: boolean };
    course: { category: string; amount: number; settled: boolean } | null;
    exams: { count: number; amount: number };
    total: number;
  };
};

export async function getConsorzioStudentDetail(userId: string) {
  try {
    const { membership, company } = await requireConsortium();
    const companyId = membership.companyId;
    const pricing = readPricing(company);

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

    const [appointments, allCodes, courseRows] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: userId,
          status: { not: "cancelled" },
          type: { not: "group_lesson" },
        },
        select: {
          id: true,
          type: true,
          startsAt: true,
          endsAt: true,
          instructor: { select: { name: true } },
          vehicle: { select: { name: true } },
          consorzioBilling: { select: { settledAt: true, priceAmount: true } },
        },
        orderBy: { startsAt: "desc" },
      }),
      prisma.consorzioAccountingCode.findMany({
        where: { consorzioCompanyId: companyId, archivedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, code: true, description: true },
      }),
      prisma.consorzioCourseBilling.findMany({
        where: { consorzioCompanyId: companyId, studentUserId: userId },
        select: { licenseCategory: true, priceAmount: true, settledAt: true },
      }),
    ]);

    const guideAppointments = appointments.filter((appt) => appt.type !== "esame");
    const examAppointments = appointments.filter((appt) => appt.type === "esame");

    let certifiedMinutes = 0;
    let guidesAmount = 0;
    const allLessons = guideAppointments.map((appt) => {
      const durationMinutes = lessonMinutes(appt.startsAt, appt.endsAt);
      const certified = Boolean(appt.consorzioBilling?.settledAt);
      if (certified) certifiedMinutes += durationMinutes;
      guidesAmount += appt.consorzioBilling
        ? decimalToNumber(appt.consorzioBilling.priceAmount)
        : guidePrice(pricing, member.licenseCategory, durationMinutes);
      return {
        appointmentId: appt.id,
        startsAt: appt.startsAt.toISOString(),
        durationMinutes,
        vehicleName: appt.vehicle?.name ?? null,
        instructorName: appt.instructor?.name ?? null,
        certified,
      };
    });

    const exams = examAppointments.map((appt) => ({
      appointmentId: appt.id,
      startsAt: appt.startsAt.toISOString(),
      vehicleName: appt.vehicle?.name ?? null,
      instructorName: appt.instructor?.name ?? null,
      price: appt.consorzioBilling
        ? decimalToNumber(appt.consorzioBilling.priceAmount)
        : examPrice(pricing),
      settled: Boolean(appt.consorzioBilling?.settledAt),
    }));
    const examsAmount = exams.reduce((sum, exam) => sum + exam.price, 0);

    // Percorso: la voce congelata della patente attuale, altrimenti il prezzo
    // unico live se la patente è a percorso.
    const frozenCourse = courseRows.find((row) => row.licenseCategory === member.licenseCategory);
    const liveCourse = coursePrice(pricing, member.licenseCategory);
    const course =
      member.licenseCategory && (frozenCourse || liveCourse !== null)
        ? {
            category: member.licenseCategory,
            amount: frozenCourse ? decimalToNumber(frozenCourse.priceAmount) : (liveCourse ?? 0),
            settled: Boolean(frozenCourse?.settledAt),
          }
        : null;

    const detail: ConsorzioStudentDetail = {
      userId: member.userId,
      name: member.user.name ?? "—",
      schoolName: member.consorzioSchool?.name ?? null,
      schoolCity: member.consorzioSchool?.city ?? null,
      licenseCategory: member.licenseCategory,
      lessonsCount: guideAppointments.length,
      certifiedMinutes,
      codes: member.consorzioAccountingCodes.map((link) => link.code),
      allCodes,
      lessons: allLessons.slice(0, 30),
      exams,
      costs: {
        guides: {
          count: guideAppointments.length,
          amount: roundMoney(guidesAmount),
          includedInCourse: billingModeFor(pricing, member.licenseCategory) === "course",
        },
        course,
        exams: { count: exams.length, amount: roundMoney(examsAmount) },
        total: roundMoney(guidesAmount + examsAmount + (course?.amount ?? 0)),
      },
    };
    return { success: true as const, data: detail };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ─── Prezzi (Impostazioni → Prenotazioni e allievi → Prezzi) ─

const amountByCategorySchema = z.record(
  z.enum(CONSORTIUM_LICENSE_CATEGORIES),
  z.number().min(0).max(1_000_000).nullable(),
);

const pricingSchema = z.object({
  hourlyByCategory: amountByCategorySchema,
  billingModeByCategory: z.record(
    z.enum(CONSORTIUM_LICENSE_CATEGORIES),
    z.enum(CONSORZIO_BILLING_MODES),
  ),
  courseByCategory: amountByCategorySchema,
  examFee: z.number().min(0).max(1_000_000).nullable(),
  lateCancellationCutoffHours: z.number().int().min(0).max(336),
  lateCancellationPenaltyPct: z.number().int().min(0).max(100),
  guideRequestMinLeadHours: z.number().int().min(0).max(336),
});

export type { ConsorzioPricing };

const readPricing = (
  company: { services?: Array<{ serviceKey: string; limits: unknown }> | null },
): ConsorzioPricing => {
  const service = company.services?.find((s) => s.serviceKey === "AUTOSCUOLE");
  return parseConsorzioPricing((service?.limits ?? {}) as Record<string, unknown>);
};

/** Ore di preavviso minimo configurate per la company consorzio. */
const readMinLeadHours = async (companyId: string): Promise<number> => {
  const service = await prisma.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  const limits = (service?.limits ?? {}) as Record<string, unknown>;
  return parseConsorzioPricing(limits).guideRequestMinLeadHours;
};

export async function getConsorzioPricing() {
  try {
    const { company } = await requireConsortium();
    return { success: true as const, data: readPricing(company) };
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
    const courseByCategory: Partial<Record<string, number>> = {};
    const billingModeByCategory: Partial<Record<string, ConsorzioBillingMode>> = {};
    for (const category of CONSORTIUM_LICENSE_CATEGORIES) {
      const hourly = payload.hourlyByCategory[category];
      if (typeof hourly === "number") hourlyByCategory[category] = hourly;
      const course = payload.courseByCategory[category];
      if (typeof course === "number") courseByCategory[category] = course;
      if (payload.billingModeByCategory[category] === "course") {
        billingModeByCategory[category] = "course";
      }
    }

    await prisma.companyService.update({
      where: { id: service.id },
      data: {
        limits: {
          ...limits,
          consorzioPricing: {
            hourlyByCategory,
            billingModeByCategory,
            courseByCategory,
            examFee: payload.examFee,
            lateCancellationCutoffHours: payload.lateCancellationCutoffHours,
            lateCancellationPenaltyPct: payload.lateCancellationPenaltyPct,
            guideRequestMinLeadHours: payload.guideRequestMinLeadHours,
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

const setCourseBillingFlagsSchema = z.object({
  studentUserId: z.string().uuid(),
  licenseCategory: z.enum(CONSORTIUM_LICENSE_CATEGORIES),
  /** Mese in cui la voce è mostrata: viene congelato al primo toggle. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  settled: z.boolean().optional(),
  invoiceSent: z.boolean().optional(),
});

const setAppointmentCodesSchema = z.object({
  appointmentId: z.string().uuid(),
  codeIds: z.array(z.string().uuid()),
});

/**
 * Una voce di Fatturazione:
 * - "guide": guida individuale (a ore, o inclusa se la patente è a percorso);
 * - "exam": esame prenotato all'allievo, a tariffa esame (REG-459);
 * - "course": prezzo unico del percorso completo di un allievo (REG-462).
 */
export type ConsorzioBillingLineKind = "guide" | "exam" | "course";

export type ConsorzioBillingLesson = {
  /** Chiave stabile della riga (appuntamento o percorso allievo+patente). */
  lineId: string;
  kind: ConsorzioBillingLineKind;
  /** null per le voci percorso. */
  appointmentId: string | null;
  studentUserId: string;
  startsAt: string;
  durationMinutes: number;
  studentName: string;
  licenseCategory: string | null;
  instructorName: string | null;
  vehicleName: string | null;
  codes: Array<{ id: string; code: string }>;
  price: number;
  /** Guida di una patente a percorso: il prezzo è già nella voce percorso. */
  includedInCourse: boolean;
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

const lessonMinutes = (startsAt: Date, endsAt: Date | null): number =>
  endsAt ? Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000)) : 60;

/**
 * Vista Fatturazione di un mese: guide (non annullate) degli allievi del
 * consorzio raggruppate per autoscuola consorziata. Il prezzo di una guida è
 * lo snapshot in ConsorzioLessonBilling se esiste (creato al primo toggle
 * saldata/fatturata), altrimenti è calcolato live col listino corrente
 * (`guidePrice`). Così i ritocchi di tariffa si riflettono sulle guide non
 * ancora certificate, mai su quelle già saldate.
 *
 * Esami (REG-459): ogni esame non annullato dell'allievo è una voce "Esame"
 * a tariffa esame, distinta dalle guide.
 *
 * Patenti a percorso (REG-462): le guide valgono 0 ("incluse") e il percorso
 * compare come voce propria nel mese della PRIMA guida dell'allievo — oppure,
 * se è già stato toccato, nel mese congelato in ConsorzioCourseBilling.
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

    const pricing = readPricing(company);

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
            type: { not: "group_lesson" },
          },
          select: {
            id: true,
            type: true,
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
    const pushLine = (schoolId: string, line: ConsorzioBillingLesson) => {
      const list = lessonsBySchool.get(schoolId) ?? [];
      list.push(line);
      lessonsBySchool.set(schoolId, list);
    };

    for (const appt of appointments) {
      const member = appt.studentId ? memberByUserId.get(appt.studentId) : undefined;
      if (!member?.consorzioSchoolId) continue;
      const durationMinutes = lessonMinutes(appt.startsAt, appt.endsAt);
      const isExam = appt.type === "esame";
      const includedInCourse =
        !isExam && billingModeFor(pricing, member.licenseCategory) === "course";
      const billing = appt.consorzioBilling;
      // Codici della guida: espliciti se presenti, altrimenti i default allievo.
      const codes = appt.consorzioAccountingCodes.length
        ? appt.consorzioAccountingCodes.map((link) => link.code)
        : member.consorzioAccountingCodes.map((link) => link.code);

      pushLine(member.consorzioSchoolId, {
        lineId: `appt:${appt.id}`,
        kind: isExam ? "exam" : "guide",
        appointmentId: appt.id,
        studentUserId: member.userId,
        startsAt: appt.startsAt.toISOString(),
        durationMinutes,
        studentName: member.user.name ?? "—",
        licenseCategory: member.licenseCategory,
        instructorName: appt.instructor?.name ?? null,
        vehicleName: appt.vehicle?.name ?? null,
        codes,
        price: billing
          ? decimalToNumber(billing.priceAmount)
          : isExam
            ? examPrice(pricing)
            : guidePrice(pricing, member.licenseCategory, durationMinutes),
        includedInCourse,
        settled: Boolean(billing?.settledAt),
        invoiceSent: Boolean(billing?.invoiceSentAt),
      });
    }

    // ── Voci percorso ──
    // 1) già congelate (toccate almeno una volta): stanno nel loro mese.
    const frozenCourses = await prisma.consorzioCourseBilling.findMany({
      where: { consorzioCompanyId: companyId },
      select: {
        schoolId: true,
        studentUserId: true,
        licenseCategory: true,
        priceAmount: true,
        billingMonth: true,
        settledAt: true,
        invoiceSentAt: true,
      },
    });
    const frozenKeys = new Set(
      frozenCourses.map((row) => `${row.studentUserId}:${row.licenseCategory}`),
    );

    // 2) live: allievi con patente a percorso non ancora congelati → mese
    //    della loro prima guida (non annullata, non esame/gruppo).
    const liveCourseMembers = members.filter(
      (m) =>
        m.licenseCategory &&
        billingModeFor(pricing, m.licenseCategory) === "course" &&
        !frozenKeys.has(`${m.userId}:${m.licenseCategory}`),
    );
    const courseUserIds = [
      ...new Set([
        ...liveCourseMembers.map((m) => m.userId),
        ...frozenCourses
          .filter((row) => row.billingMonth === payload.month)
          .map((row) => row.studentUserId),
      ]),
    ];
    const firstGuides = courseUserIds.length
      ? await prisma.autoscuolaAppointment.groupBy({
          by: ["studentId"],
          where: {
            companyId,
            studentId: { in: courseUserIds },
            status: { not: "cancelled" },
            type: { notIn: ["esame", "group_lesson"] },
          },
          _min: { startsAt: true },
        })
      : [];
    const firstGuideByUser = new Map(
      firstGuides.map((row) => [row.studentId as string, row._min.startsAt]),
    );

    const courseLine = (
      member: (typeof members)[number],
      category: string,
      startsAt: Date,
      price: number,
      settled: boolean,
      invoiceSent: boolean,
    ): ConsorzioBillingLesson => ({
      lineId: `course:${member.userId}:${category}`,
      kind: "course",
      appointmentId: null,
      studentUserId: member.userId,
      startsAt: startsAt.toISOString(),
      durationMinutes: 0,
      studentName: member.user.name ?? "—",
      licenseCategory: category,
      instructorName: null,
      vehicleName: null,
      codes: member.consorzioAccountingCodes.map((link) => link.code),
      price,
      includedInCourse: false,
      settled,
      invoiceSent,
    });

    for (const row of frozenCourses) {
      if (row.billingMonth !== payload.month) continue;
      const member = memberByUserId.get(row.studentUserId);
      if (!member) continue;
      pushLine(
        row.schoolId,
        courseLine(
          member,
          row.licenseCategory,
          firstGuideByUser.get(member.userId) ?? monthStart,
          decimalToNumber(row.priceAmount),
          Boolean(row.settledAt),
          Boolean(row.invoiceSentAt),
        ),
      );
    }
    for (const member of liveCourseMembers) {
      const first = firstGuideByUser.get(member.userId);
      if (!first || !member.consorzioSchoolId || !member.licenseCategory) continue;
      if (billingMonthOf(first) !== payload.month) continue;
      pushLine(
        member.consorzioSchoolId,
        courseLine(
          member,
          member.licenseCategory,
          first,
          coursePrice(pricing, member.licenseCategory) ?? 0,
          false,
          false,
        ),
      );
    }

    const groups: ConsorzioBillingSchoolGroup[] = schools
      .filter((school) => school.status !== "removed" || lessonsBySchool.has(school.id))
      .map((school) => {
        const lessons = (lessonsBySchool.get(school.id) ?? []).sort((a, b) =>
          a.startsAt === b.startsAt
            ? a.kind === "course"
              ? -1
              : 1
            : a.startsAt.localeCompare(b.startsAt),
        );
        return {
          schoolId: school.id,
          schoolName: school.name,
          schoolCity: school.city,
          lessons,
          total: roundMoney(lessons.reduce((sum, lesson) => sum + lesson.price, 0)),
        };
      })
      .filter((group) => group.lessons.length > 0);

    const allLessons = groups.flatMap((group) => group.lessons);
    const total = roundMoney(allLessons.reduce((sum, l) => sum + l.price, 0));
    const settledTotal = roundMoney(
      allLessons.filter((l) => l.settled).reduce((sum, l) => sum + l.price, 0),
    );

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
          outstanding: roundMoney(total - settledTotal),
        },
        codes,
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Toggle "saldata" / "fattura inviata" su una guida o un esame. Al primo toggle la riga
 * di billing viene creata congelando il prezzo corrente del listino.
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
        type: true,
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
      const pricing = readPricing(company);
      const price =
        appointment.type === "esame"
          ? examPrice(pricing)
          : guidePrice(
              pricing,
              member.licenseCategory,
              lessonMinutes(appointment.startsAt, appointment.endsAt),
            );
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

/**
 * Toggle "saldata" / "fattura inviata" sulla voce percorso di un allievo
 * (REG-462). Al primo toggle nasce ConsorzioCourseBilling congelando prezzo
 * unico corrente e mese di Fatturazione.
 */
export async function setConsorzioCourseBillingFlags(
  input: z.infer<typeof setCourseBillingFlagsSchema>,
) {
  try {
    const { membership, company } = await requireConsortium();
    const companyId = membership.companyId;
    const payload = setCourseBillingFlagsSchema.parse(input);

    const flagPatch: { settledAt?: Date | null; invoiceSentAt?: Date | null } = {};
    if (payload.settled !== undefined) flagPatch.settledAt = payload.settled ? new Date() : null;
    if (payload.invoiceSent !== undefined) {
      flagPatch.invoiceSentAt = payload.invoiceSent ? new Date() : null;
    }

    const existing = await prisma.consorzioCourseBilling.findUnique({
      where: {
        consorzioCompanyId_studentUserId_licenseCategory: {
          consorzioCompanyId: companyId,
          studentUserId: payload.studentUserId,
          licenseCategory: payload.licenseCategory,
        },
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.consorzioCourseBilling.update({
        where: { id: existing.id },
        data: flagPatch,
      });
      return { success: true as const };
    }

    const member = await prisma.companyMember.findFirst({
      where: { companyId, userId: payload.studentUserId, autoscuolaRole: "STUDENT" },
      select: { consorzioSchoolId: true },
    });
    if (!member?.consorzioSchoolId) {
      return { success: false as const, message: "Allievo senza autoscuola consorziata." };
    }
    const price = coursePrice(readPricing(company), payload.licenseCategory);
    if (price === null) {
      return {
        success: false as const,
        message: "Questa patente non è più fatturata a percorso: ricarica la pagina.",
      };
    }

    await prisma.consorzioCourseBilling.create({
      data: {
        consorzioCompanyId: companyId,
        schoolId: member.consorzioSchoolId,
        studentUserId: payload.studentUserId,
        licenseCategory: payload.licenseCategory,
        priceAmount: price,
        billingMonth: payload.month,
        ...flagPatch,
      },
    });

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
