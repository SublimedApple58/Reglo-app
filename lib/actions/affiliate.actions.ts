"use server";

/**
 * Cosa può fare un'autoscuola consorziata **senza Reglo** (REG-429).
 *
 * È la lista bianca: tutto il resto dell'app resta chiuso da
 * `requireServiceAccess`, che su servizio DISABLED rifiuta. Qui passano solo
 * le anagrafiche dei suoi allievi — l'unica cosa che la vista ridotta permette
 * di fare davvero (decisione di Tiziano, 26/09), perché senza un allievo in
 * anagrafica non si può nemmeno chiedere una guida al consorzio.
 *
 * **Gli allievi non nascono nella company della scuola**: nascono nella
 * company del CONSORZIO, taggati con `consorzioSchoolId`. È lì che vivono gli
 * allievi del consorzio da sempre (vedi docs/features/consorzio.md), è lì che
 * il consorzio li vede, ed è lì che la richiesta di guida andrà a cercarli.
 *
 * Ogni action passa da `requireAffiliateSchool`, che rilegge `ConsorzioSchool`
 * e restituisce lo `schoolId`: tutte le query restano filtrate su QUELLA
 * scuola, così due consorziate dello stesso consorzio non si vedono fra loro.
 */

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { requireAffiliateSchool } from "@/lib/service-access";
import { buildPlaceholderEmail, displayEmail } from "@/lib/users/placeholder-email";
import { isLicenseCategory, isTransmission } from "@/lib/autoscuole/license";
import { formatError } from "@/lib/utils";
import crypto from "crypto";

export type AffiliateStudent = {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  licenseCategory: string | null;
  transmission: string | null;
  createdAt: string;
  /** Guide già fatte col consorzio: la scuola vede il proprio storico. */
  lessonsCount: number;
};

const createSchema = z.object({
  firstName: z.string().trim().min(1, "Il nome è obbligatorio."),
  lastName: z.string().trim().min(1, "Il cognome è obbligatorio."),
  phone: z
    .string()
    .trim()
    .min(5, "Il telefono è obbligatorio.")
    .regex(/^[+()\-\s\d]{5,25}$/, "Numero di telefono non valido."),
  licenseCategory: z.string().trim().optional(),
  transmission: z.string().trim().optional(),
});

export async function listAffiliateStudents() {
  try {
    const { consorzioCompanyId, schoolId, schoolName } = await requireAffiliateSchool();

    const members = await prisma.companyMember.findMany({
      where: {
        companyId: consorzioCompanyId,
        consorzioSchoolId: schoolId,
        autoscuolaRole: "STUDENT",
      },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        licenseCategory: true,
        transmission: true,
        createdAt: true,
        user: { select: { name: true, email: true, phone: true } },
      },
    });

    const lessons = members.length
      ? await prisma.autoscuolaAppointment.groupBy({
          by: ["studentId"],
          where: {
            companyId: consorzioCompanyId,
            studentId: { in: members.map((member) => member.userId) },
            status: { not: "cancelled" },
          },
          _count: { _all: true },
        })
      : [];
    const lessonsByStudent = new Map(lessons.map((row) => [row.studentId, row._count._all]));

    return {
      success: true as const,
      data: {
        schoolName,
        students: members.map((member) => ({
          userId: member.userId,
          name: member.user.name ?? "—",
          phone: member.user.phone,
          email: displayEmail(member.user.email),
          licenseCategory: member.licenseCategory,
          transmission: member.transmission,
          createdAt: member.createdAt.toISOString(),
          lessonsCount: lessonsByStudent.get(member.userId) ?? 0,
        })) satisfies AffiliateStudent[],
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Anagrafica minima: nome, cognome, telefono. Niente email e niente password
 * — questi allievi non entrano in app (stesso trattamento degli allievi creati
 * dal consorzio, REG-464): l'account nasce con un'email segnaposto e
 * `password: null`, quindi non può accedere.
 */
export async function createAffiliateStudent(input: z.infer<typeof createSchema>) {
  try {
    const { consorzioCompanyId, schoolId, schoolSuspended } = await requireAffiliateSchool();
    if (schoolSuspended) {
      throw new Error("Autoscuola sospesa dal consorzio: contatta il consorzio.");
    }
    const payload = createSchema.parse(input);

    const school = await prisma.consorzioSchool.findUnique({
      where: { id: schoolId },
      select: { accountingCodeId: true },
    });

    const service = await prisma.companyService.findFirst({
      where: { companyId: consorzioCompanyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const licenseCategory = isLicenseCategory(payload.licenseCategory)
      ? payload.licenseCategory
      : typeof limits.defaultLicenseCategory === "string"
        ? limits.defaultLicenseCategory
        : "B";
    const transmission = isTransmission(payload.transmission)
      ? payload.transmission
      : typeof limits.defaultTransmission === "string"
        ? limits.defaultTransmission
        : "manual";

    const name = `${payload.firstName} ${payload.lastName}`.replace(/\s+/g, " ").trim();

    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: buildPlaceholderEmail(crypto.randomUUID()),
          password: null,
          phone: payload.phone,
          role: "user",
        },
        select: { id: true },
      });

      await tx.companyMember.create({
        data: {
          companyId: consorzioCompanyId,
          userId: user.id,
          role: "member",
          autoscuolaRole: "STUDENT",
          licenseCategory,
          transmission,
          consorzioSchoolId: schoolId,
        },
      });

      // Il codice contabile dell'autoscuola si propaga ai suoi allievi, come
      // fa `createCompanyUser` per quelli creati dal consorzio.
      if (school?.accountingCodeId) {
        await tx.consorzioMemberAccountingCode.create({
          data: {
            codeId: school.accountingCodeId,
            companyId: consorzioCompanyId,
            userId: user.id,
          },
        });
      }

      return user.id;
    });

    return { success: true as const, data: { userId } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updatePhoneSchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().trim().regex(/^[+()\-\s\d]{5,25}$/, "Numero di telefono non valido."),
});

export async function updateAffiliateStudentPhone(
  input: z.infer<typeof updatePhoneSchema>,
) {
  try {
    const { consorzioCompanyId, schoolId } = await requireAffiliateSchool();
    const payload = updatePhoneSchema.parse(input);

    // L'allievo deve essere di QUESTA scuola: senza questo controllo un
    // titolare potrebbe correggere il telefono di un allievo altrui.
    const member = await prisma.companyMember.findFirst({
      where: {
        companyId: consorzioCompanyId,
        userId: payload.userId,
        consorzioSchoolId: schoolId,
        autoscuolaRole: "STUDENT",
      },
      select: { userId: true },
    });
    if (!member) throw new Error("Allievo non trovato.");

    await prisma.user.update({
      where: { id: payload.userId },
      data: { phone: payload.phone },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
