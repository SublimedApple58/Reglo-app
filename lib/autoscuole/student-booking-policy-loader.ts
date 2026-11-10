/**
 * Caricamento in blocco della policy di prenotazione allievo (vedi
 * `student-booking-policy.ts`). Una query sui membri + i limiti in cache: da
 * usare per filtrare i destinatari delle notifiche che invitano a prenotare
 * (slot liberato, guide di gruppo, scambi, nuove disponibilità, ultimo minuto).
 *
 * La riconciliazione del blocco per insoluti NON avviene qui (costa una query
 * per allievo): si usa il blocco salvato, come già facevano i broadcast. Il
 * controllo all'accettazione (`ensureStudentCanBookFromApp`) riconcilia.
 */
import { prisma } from "@/db/prisma";
import { resolveAppBookingActorsForBucket } from "@/lib/autoscuole/booking-governance";
import { isBookingBlockActive } from "@/lib/autoscuole/booking-block";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import {
  buildCompanyBookingDefaults,
  parseInstructorSettings,
  type CompanyBookingDefaults,
} from "@/lib/autoscuole/instructor-clusters";
import { licensePathBucket } from "@/lib/autoscuole/license";
import {
  buildStudentBookingPolicy,
  canStudentUseBookingChannel,
  resolveStudentBookingExceptionsForBucket,
  resolveStudentBookingHold,
  type StudentBookingChannel,
  type StudentBookingPolicy,
} from "@/lib/autoscuole/student-booking-policy";

export async function loadStudentBookingPolicies(
  companyId: string,
  studentIds?: string[],
): Promise<Map<string, StudentBookingPolicy>> {
  const out = new Map<string, StudentBookingPolicy>();
  if (studentIds && !studentIds.length) return out;

  const [limits, members] = await Promise.all([
    getCachedCompanyServiceLimits(companyId),
    prisma.companyMember.findMany({
      where: {
        companyId,
        autoscuolaRole: "STUDENT",
        ...(studentIds ? { userId: { in: studentIds } } : {}),
      },
      select: STUDENT_BOOKING_POLICY_MEMBER_SELECT,
    }),
  ]);
  const defaults = buildCompanyBookingDefaults(limits);
  const now = new Date();
  for (const member of members) {
    out.set(member.userId, studentBookingPolicyForMember(defaults, member, now));
  }
  return out;
}

/** Campi del membro che servono a `studentBookingPolicyForMember`. */
export const STUDENT_BOOKING_POLICY_MEMBER_SELECT = {
  userId: true,
  licenseCategory: true,
  bookingBlocked: true,
  bookingBlockUntil: true,
  studentPhase: true,
  selfRegistered: true,
  assignedInstructor: {
    select: { autonomousMode: true, status: true, settings: true },
  },
} as const;

export type StudentBookingPolicyMemberRow = {
  licenseCategory: string | null;
  bookingBlocked: boolean;
  bookingBlockUntil: Date | null;
  studentPhase: string | null;
  selfRegistered: boolean | null;
  assignedInstructor: {
    autonomousMode: boolean;
    status: string;
    settings: unknown;
  } | null;
};

/** Policy di un membro già letto (puro; per chi ha il suo client Prisma). */
export function studentBookingPolicyForMember(
  defaults: CompanyBookingDefaults,
  member: StudentBookingPolicyMemberRow,
  now: Date = new Date(),
): StudentBookingPolicy {
  const bucket = licensePathBucket(member.licenseCategory ?? null);
  const instructor = member.assignedInstructor;
  const cluster =
    instructor && instructor.status !== "inactive" && instructor.autonomousMode
      ? parseInstructorSettings(instructor.settings)
      : null;
  const appBookingActors = resolveAppBookingActorsForBucket({
    bucket,
    clusterDefault: cluster?.appBookingActors,
    clusterByPath: cluster?.appBookingActorsByPath,
    companyDefault: defaults.appBookingActors,
    companyByPath: defaults.appBookingActorsByPath,
  });
  const exceptions = resolveStudentBookingExceptionsForBucket({
    bucket,
    clusterDefault: cluster?.studentBookingExceptions,
    clusterByPath: cluster?.studentBookingExceptionsByPath,
    companyDefault: defaults.studentBookingExceptions,
    companyByPath: defaults.studentBookingExceptionsByPath,
  });
  return buildStudentBookingPolicy({
    appBookingActors,
    exceptions,
    hold: resolveStudentBookingHold({
      blocked: isBookingBlockActive(member, now),
      studentPhase: member.studentPhase,
      selfRegistered: member.selfRegistered,
      licenseCategory: member.licenseCategory,
    }),
  });
}

/** Sottoinsieme di `studentIds` che può usare il canale. */
export async function filterStudentsByBookingChannel(
  companyId: string,
  studentIds: string[],
  channel: StudentBookingChannel,
): Promise<Set<string>> {
  const policies = await loadStudentBookingPolicies(companyId, studentIds);
  const allowed = new Set<string>();
  for (const [studentId, policy] of policies) {
    if (canStudentUseBookingChannel(policy, channel)) allowed.add(studentId);
  }
  return allowed;
}
