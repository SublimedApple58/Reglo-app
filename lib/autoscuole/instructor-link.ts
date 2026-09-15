import { prisma } from "@/db/prisma";

/**
 * REG-451 — QR istruttore → associazione allievo.
 *
 * La card QR stampata dall'autoscuola codifica `<origin>/i/<CODICE>`, dove il
 * codice è `AutoscuolaInstructor.inviteCode` (lo stesso della registrazione).
 * Letto dalla fotocamera del telefono apre la pagina pubblica `/i/[code]`
 * (fallback web + deep link verso l'app); letto dall'app, porta al flusso di
 * conferma che imposta `CompanyMember.assignedInstructorId`.
 *
 * A differenza del signup (solo istruttori autonomi), l'associazione vale per
 * ogni istruttore ATTIVO della stessa autoscuola: è la stessa assegnazione che
 * il personale può già fare a mano dalla scheda allievo.
 */

export {
  INSTRUCTOR_LINK_PATH,
  instructorInitials,
  instructorLinkUrl,
  normalizeInstructorCode,
} from "@/lib/autoscuole/instructor-initials";
import { instructorInitials, normalizeInstructorCode } from "@/lib/autoscuole/instructor-initials";

export type ResolvedInstructorCode = {
  code: string;
  instructorId: string;
  instructorName: string;
  companyId: string;
  companyName: string;
};

/** Istruttore attivo col codice dato (qualsiasi autoscuola), o null. */
export async function resolveInstructorCode(
  rawCode: string | null | undefined,
): Promise<ResolvedInstructorCode | null> {
  const code = normalizeInstructorCode(rawCode);
  if (!code) return null;
  const instructor = await prisma.autoscuolaInstructor.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      name: true,
      status: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });
  if (!instructor || instructor.status === "inactive") return null;
  return {
    code,
    instructorId: instructor.id,
    instructorName: instructor.name,
    companyId: instructor.companyId,
    companyName: instructor.company.name,
  };
}

export type InstructorLinkPreview =
  | { status: "invalid"; code: string | null }
  | {
      status: "ok";
      code: string;
      instructor: { id: string; name: string; initials: string };
      companyName: string;
      /** Istruttore attuale (null se nessuno o se è già questo). */
      currentInstructor: { id: string; name: string; initials: string } | null;
      alreadyLinked: boolean;
    };

type StudentRef = { companyId: string; userId: string };

async function loadStudentMember({ companyId, userId }: StudentRef) {
  return prisma.companyMember.findFirst({
    where: { companyId, userId, autoscuolaRole: "STUDENT" },
    select: {
      assignedInstructorId: true,
      assignedInstructor: { select: { id: true, name: true, status: true } },
    },
  });
}

/**
 * Anteprima per la schermata di conferma: valida il codice rispetto
 * all'autoscuola dell'allievo e dice se ha già un istruttore.
 */
export async function previewInstructorLink(
  student: StudentRef,
  rawCode: string | null | undefined,
): Promise<InstructorLinkPreview> {
  const resolved = await resolveInstructorCode(rawCode);
  const normalized = normalizeInstructorCode(rawCode);
  if (!resolved || resolved.companyId !== student.companyId) {
    return { status: "invalid", code: normalized ?? rawCode?.trim().toUpperCase().slice(0, 12) ?? null };
  }
  const member = await loadStudentMember(student);
  if (!member) return { status: "invalid", code: resolved.code };

  const current =
    member.assignedInstructor && member.assignedInstructor.status !== "inactive"
      ? member.assignedInstructor
      : null;
  const alreadyLinked = current?.id === resolved.instructorId;

  return {
    status: "ok",
    code: resolved.code,
    instructor: {
      id: resolved.instructorId,
      name: resolved.instructorName,
      initials: instructorInitials(resolved.instructorName),
    },
    companyName: resolved.companyName,
    currentInstructor:
      current && !alreadyLinked
        ? { id: current.id, name: current.name, initials: instructorInitials(current.name) }
        : null,
    alreadyLinked,
  };
}

export type InstructorLinkResult =
  | { status: "invalid" }
  | { status: "linked"; instructor: { id: string; name: string; initials: string }; companyName: string };

/** Imposta l'istruttore di riferimento dell'allievo (idempotente). */
export async function linkStudentToInstructor(
  student: StudentRef,
  rawCode: string | null | undefined,
): Promise<InstructorLinkResult> {
  const resolved = await resolveInstructorCode(rawCode);
  if (!resolved || resolved.companyId !== student.companyId) return { status: "invalid" };
  const member = await loadStudentMember(student);
  if (!member) return { status: "invalid" };

  if (member.assignedInstructorId !== resolved.instructorId) {
    await prisma.companyMember.update({
      where: { companyId_userId: { companyId: student.companyId, userId: student.userId } },
      data: { assignedInstructorId: resolved.instructorId },
    });
  }
  return {
    status: "linked",
    instructor: {
      id: resolved.instructorId,
      name: resolved.instructorName,
      initials: instructorInitials(resolved.instructorName),
    },
    companyName: resolved.companyName,
  };
}
