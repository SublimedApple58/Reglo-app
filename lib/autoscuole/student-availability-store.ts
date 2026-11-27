/**
 * Disponibilità dell'allievo a fasce (REG-802) — lettura e scrittura su DB.
 * Le regole pure (fasce, conversioni, criterio dello step) sono in
 * `student-availability.ts`.
 */

import { prisma } from "@/db/prisma";
import {
  defaultToAvailabilityRecord,
  allRangesOf,
} from "@/lib/autoscuole/availability-record";
import {
  STUDENT_AVAILABILITY_BANDS,
  rowToBandsByDay,
  snoozeUntilFrom,
  studentAvailabilityStepMode,
  weeklyRowFromBands,
  type StudentAvailabilityStepMode,
  type StudentBandsByDay,
} from "@/lib/autoscuole/student-availability";
import { buildOnboardingSteps, type StudentOnboarding } from "@/lib/autoscuole/student-onboarding";
import { isPlaceholderEmail } from "@/lib/users/placeholder-email";

export type StudentAvailabilityPayload = {
  /** Le fasce possibili, con orari: l'app non le conosce a memoria. */
  bands: Array<{ key: string; label: string; startMinutes: number; endMinutes: number }>;
  /** "0"=Dom … "6"=Sab → fasce scelte (solo i giorni con almeno una fascia). */
  days: StudentBandsByDay;
  /** Quando l'allievo le ha confermate dall'app (null = mai, anche con riga legacy). */
  confirmedAt: string | null;
  /** True se esiste una settimana tipo con almeno una fascia (anche legacy). */
  hasAvailability: boolean;
};

const bandsPayload = () => STUDENT_AVAILABILITY_BANDS.map((b) => ({ ...b }));

type WeeklyRowFromDb = Awaited<ReturnType<typeof prisma.autoscuolaWeeklyAvailability.findFirst>>;

/** True se la riga ha almeno una fascia valida su almeno un giorno. */
export const weeklyRowHasRanges = (row: WeeklyRowFromDb | null | undefined): boolean => {
  if (!row) return false;
  const record = defaultToAvailabilityRecord(row);
  if (!record.daysOfWeek.length) return false;
  return allRangesOf(record).some((r) => r.endMinutes > r.startMinutes);
};

export async function getStudentAvailability(
  companyId: string,
  userId: string,
): Promise<StudentAvailabilityPayload> {
  const [row, member] = await Promise.all([
    prisma.autoscuolaWeeklyAvailability.findFirst({
      where: { companyId, ownerType: "student", ownerId: userId },
    }),
    prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId } },
      select: { availabilityConfirmedAt: true },
    }),
  ]);
  return {
    bands: bandsPayload(),
    days: rowToBandsByDay(row),
    confirmedAt: member?.availabilityConfirmedAt?.toISOString() ?? null,
    hasAvailability: weeklyRowHasRanges(row),
  };
}

/**
 * Salva le fasce dell'allievo (riga per giorno) e segna la conferma; azzera
 * l'eventuale «Configura in seguito». Chi chiama valida prima che ci sia
 * almeno una fascia.
 */
export async function saveStudentAvailability(
  companyId: string,
  userId: string,
  days: StudentBandsByDay,
  now: Date = new Date(),
): Promise<StudentAvailabilityPayload> {
  const row = weeklyRowFromBands(days);
  if (!row) throw new Error("Scegli almeno una fascia.");
  await prisma.$transaction([
    prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: { companyId, ownerType: "student", ownerId: userId },
      },
      update: row,
      create: { companyId, ownerType: "student", ownerId: userId, ...row },
    }),
    prisma.companyMember.update({
      where: { companyId_userId: { companyId, userId } },
      data: { availabilityConfirmedAt: now, availabilityPromptSnoozedUntil: null },
    }),
  ]);
  return getStudentAvailability(companyId, userId);
}

/** «Configura in seguito»: lo step non si ripropone per qualche giorno. */
export async function snoozeStudentAvailability(
  companyId: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ snoozedUntil: string }> {
  const until = snoozeUntilFrom(now);
  await prisma.companyMember.update({
    where: { companyId_userId: { companyId, userId } },
    data: { availabilityPromptSnoozedUntil: until },
  });
  return { snoozedUntil: until.toISOString() };
}

/** Come va chiesto lo step Disponibilità a questo allievo, adesso. */
export async function getStudentAvailabilityStepMode(
  member: {
    companyId: string;
    userId: string;
    studentPhase: string | null;
    activeLicensePathId: string | null;
    availabilityPromptSnoozedUntil: Date | null;
  },
  now: Date = new Date(),
): Promise<StudentAvailabilityStepMode> {
  const [row, licensePathCount] = await Promise.all([
    prisma.autoscuolaWeeklyAvailability.findFirst({
      where: { companyId: member.companyId, ownerType: "student", ownerId: member.userId },
    }),
    prisma.autoscuolaLicensePath.count({
      where: { companyId: member.companyId, studentId: member.userId },
    }),
  ]);
  return studentAvailabilityStepMode({
    hasAvailability: weeklyRowHasRanges(row),
    studentPhase: member.studentPhase,
    activeLicensePathId: member.activeLicensePathId,
    licensePathCount,
    snoozedUntil: member.availabilityPromptSnoozedUntil,
    now,
  });
}

/**
 * Step dell'onboarding per l'allievo nell'autoscuola attiva (`/api/mobile/me`).
 * Null per chi non è allievo lì o non ha niente da completare.
 */
export async function getStudentOnboarding(
  user: { email: string; phone: string | null; profileCompletedAt: Date | null },
  member:
    | {
        companyId: string;
        userId: string;
        autoscuolaRole: string | null;
        studentPhase: string | null;
        activeLicensePathId: string | null;
        availabilityPromptSnoozedUntil: Date | null;
      }
    | null
    | undefined,
  now: Date = new Date(),
): Promise<StudentOnboarding> {
  if (!member || member.autoscuolaRole !== "STUDENT") return null;
  const availabilityMode = await getStudentAvailabilityStepMode(member, now);
  return buildOnboardingSteps({
    profileCompleted: Boolean(user.profileCompletedAt),
    hasPhone: Boolean(user.phone?.trim()),
    hasRealEmail: !isPlaceholderEmail(user.email),
    availabilityMode,
  });
}
