import { prisma } from "@/db/prisma";

export const AUTOSCUOLA_TIMEZONE = "Europe/Rome";

export const LESSON_POLICY_TYPES = [
  "manovre",
  "urbano",
  "extraurbano",
  "notturna",
  "autostrada",
  "parcheggio",
  "altro",
] as const;

export const LESSON_ALL_ALLOWED_TYPES = [...LESSON_POLICY_TYPES, "guida", "esame"] as const;

export type LessonPolicyType = (typeof LESSON_POLICY_TYPES)[number];

export type LessonTypeConstraint = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
};

export type LessonTypeConstraintsMap = Partial<
  Record<LessonPolicyType, LessonTypeConstraint | null>
>;

export type LessonPolicyConfig = {
  lessonPolicyEnabled: boolean;
  lessonRequiredTypesEnabled: boolean;
  lessonRequiredTypes: LessonPolicyType[];
  lessonTypeConstraints: LessonTypeConstraintsMap;
};

export const BOOKING_SLOT_DURATION_OPTIONS = [30, 60, 90, 120] as const;
type BookingSlotDuration = (typeof BOOKING_SLOT_DURATION_OPTIONS)[number];
const BOOKING_SLOT_DURATION_SET = new Set<number>(BOOKING_SLOT_DURATION_OPTIONS);

const LESSON_POLICY_TYPE_SET = new Set<string>(LESSON_POLICY_TYPES);
const LESSON_ALL_ALLOWED_TYPE_SET = new Set<string>(LESSON_ALL_ALLOWED_TYPES);
const EXCLUDED_DRIVING_LESSON_TYPES = new Set<string>(["esame"]);

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AUTOSCUOLA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const normalizeDays = (days: number[]) =>
  Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort(
    (left, right) => left - right,
  );

const normalizeConstraint = (value: unknown): LessonTypeConstraint | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    daysOfWeek?: unknown;
    startMinutes?: unknown;
    endMinutes?: unknown;
  };

  if (!Array.isArray(raw.daysOfWeek)) return null;
  const daysOfWeek = normalizeDays(raw.daysOfWeek as number[]);
  if (!daysOfWeek.length) return null;

  if (
    typeof raw.startMinutes !== "number" ||
    !Number.isInteger(raw.startMinutes) ||
    typeof raw.endMinutes !== "number" ||
    !Number.isInteger(raw.endMinutes)
  ) {
    return null;
  }

  const startMinutes = raw.startMinutes;
  const endMinutes = raw.endMinutes;
  const isMultipleOfHalfHour = (valueToCheck: number) => valueToCheck % 30 === 0;
  if (
    startMinutes < 0 ||
    startMinutes > 1410 ||
    endMinutes < 30 ||
    endMinutes > 1440 ||
    endMinutes <= startMinutes ||
    !isMultipleOfHalfHour(startMinutes) ||
    !isMultipleOfHalfHour(endMinutes)
  ) {
    return null;
  }

  return {
    daysOfWeek,
    startMinutes,
    endMinutes,
  };
};

const getZonedParts = (date: Date) => {
  const parts = zonedFormatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(readPart("year")),
    month: Number(readPart("month")),
    day: Number(readPart("day")),
    weekday: readPart("weekday"),
    hour: Number(readPart("hour")),
    minute: Number(readPart("minute")),
  };
};

export const normalizeLessonType = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

export const isLessonPolicyType = (value: string | null | undefined): value is LessonPolicyType =>
  LESSON_POLICY_TYPE_SET.has(normalizeLessonType(value));

export const isLessonAllowedType = (value: string | null | undefined) =>
  LESSON_ALL_ALLOWED_TYPE_SET.has(normalizeLessonType(value));

const isActiveCaseStatus = (status: string | null | undefined) => {
  const normalized = (status ?? "").trim().toLowerCase();
  return ![
    "archived",
    "closed",
    "chiusa",
    "completed",
    "completata",
    "cancelled",
    "annullata",
  ].includes(normalized);
};

const isDrivingLessonType = (value: string | null | undefined) => {
  const normalized = normalizeLessonType(value);
  if (!normalized) return false;
  return !EXCLUDED_DRIVING_LESSON_TYPES.has(normalized);
};

export const parseLessonPolicyFromLimits = (
  limits: Record<string, unknown>,
): LessonPolicyConfig => {
  const lessonPolicyEnabled = typeof limits.lessonPolicyEnabled === "boolean"
    ? limits.lessonPolicyEnabled
    : false;
  const lessonRequiredTypesEnabled =
    typeof limits.lessonRequiredTypesEnabled === "boolean"
      ? limits.lessonRequiredTypesEnabled
      : false;

  const rawRequiredTypes = Array.isArray(limits.lessonRequiredTypes)
    ? limits.lessonRequiredTypes
    : [];
  const lessonRequiredTypes = Array.from(
    new Set(
      rawRequiredTypes
        .map((value) => normalizeLessonType(typeof value === "string" ? value : ""))
        .filter((value): value is LessonPolicyType => LESSON_POLICY_TYPE_SET.has(value)),
    ),
  ) as LessonPolicyType[];

  const rawConstraints =
    limits.lessonTypeConstraints && typeof limits.lessonTypeConstraints === "object"
      ? (limits.lessonTypeConstraints as Record<string, unknown>)
      : {};

  const lessonTypeConstraints: LessonTypeConstraintsMap = {};
  for (const type of LESSON_POLICY_TYPES) {
    const normalized = normalizeConstraint(rawConstraints[type]);
    lessonTypeConstraints[type] = normalized;
  }

  return {
    lessonPolicyEnabled,
    lessonRequiredTypesEnabled,
    lessonRequiredTypes,
    lessonTypeConstraints,
  };
};

export const normalizeBookingSlotDurations = (
  value: unknown,
  fallback: readonly BookingSlotDuration[] = [30, 60],
) => {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((item) => (typeof item === "number" ? Math.trunc(item) : Number.NaN))
    .filter((item): item is BookingSlotDuration => BOOKING_SLOT_DURATION_SET.has(item))
    .sort((left, right) => left - right);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : [...fallback];
};

export const getLessonPolicyConstraint = (
  policy: LessonPolicyConfig,
  lessonType: string | null | undefined,
) => {
  const normalized = normalizeLessonType(lessonType);
  if (!LESSON_POLICY_TYPE_SET.has(normalized)) return null;
  return policy.lessonTypeConstraints[normalized as LessonPolicyType] ?? null;
};

const getDayAndMinutes = (date: Date) => {
  const parts = getZonedParts(date);
  const dayOfWeek = WEEKDAY_TO_INDEX[parts.weekday] ?? date.getUTCDay();
  const minutes = parts.hour * 60 + parts.minute;
  return { dayOfWeek, minutes };
};

export const isLessonTypeAllowedForInterval = ({
  policy,
  lessonType,
  startsAt,
  endsAt,
}: {
  policy: LessonPolicyConfig;
  lessonType: string | null | undefined;
  startsAt: Date;
  endsAt: Date;
}) => {
  if (!policy.lessonPolicyEnabled) return true;
  const constraint = getLessonPolicyConstraint(policy, lessonType);
  if (!constraint) return true;

  const start = getDayAndMinutes(startsAt);
  const end = getDayAndMinutes(endsAt);
  if (start.dayOfWeek !== end.dayOfWeek) return false;
  if (!constraint.daysOfWeek.includes(start.dayOfWeek)) return false;
  return (
    start.minutes >= constraint.startMinutes &&
    end.minutes <= constraint.endMinutes &&
    end.minutes > start.minutes
  );
};

export const getCompatibleLessonTypesForInterval = ({
  policy,
  startsAt,
  endsAt,
  candidateTypes,
}: {
  policy: LessonPolicyConfig;
  startsAt: Date;
  endsAt: Date;
  candidateTypes: string[];
}) => {
  const uniqueTypes = Array.from(
    new Set(
      candidateTypes
        .map((item) => normalizeLessonType(item))
        .filter((item): item is LessonPolicyType => LESSON_POLICY_TYPE_SET.has(item)),
    ),
  );

  return uniqueTypes.filter((type) =>
    isLessonTypeAllowedForInterval({
      policy,
      lessonType: type,
      startsAt,
      endsAt,
    }),
  );
};

export const getLessonPolicyTypeLabel = (type: string) => {
  const normalized = normalizeLessonType(type);
  const labels: Record<string, string> = {
    manovre: "Manovre",
    urbano: "Urbano",
    extraurbano: "Extraurbano",
    notturna: "Notturna",
    autostrada: "Autostrada",
    parcheggio: "Parcheggio",
    altro: "Altro",
    guida: "Guida",
    esame: "Esame",
  };
  return labels[normalized] ?? type;
};

export const getStudentLessonPolicyCoverage = async ({
  companyId,
  studentId,
  policy,
}: {
  companyId: string;
  studentId: string;
  policy: LessonPolicyConfig;
}) => {
  if (
    !policy.lessonPolicyEnabled ||
    !policy.lessonRequiredTypesEnabled ||
    !policy.lessonRequiredTypes.length
  ) {
    return {
      activeCaseId: null as string | null,
      completedTypes: new Set<LessonPolicyType>(),
      missingRequiredTypes: [] as LessonPolicyType[],
    };
  }

  const cases = await prisma.autoscuolaCase.findMany({
    where: { companyId, studentId },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
  });

  const activeCase =
    [...cases]
      .filter((item) => isActiveCaseStatus(item.status))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;

  const completedLessons = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId,
      status: "completed",
      ...(activeCase ? { caseId: activeCase.id } : {}),
    },
    select: {
      type: true,
    },
  });

  const completedTypes = new Set<LessonPolicyType>();
  for (const lesson of completedLessons) {
    if (!isDrivingLessonType(lesson.type)) continue;
    const normalized = normalizeLessonType(lesson.type);
    if (LESSON_POLICY_TYPE_SET.has(normalized)) {
      completedTypes.add(normalized as LessonPolicyType);
    }
  }

  const missingRequiredTypes = policy.lessonRequiredTypes.filter(
    (type) => !completedTypes.has(type),
  );

  return {
    activeCaseId: activeCase?.id ?? null,
    completedTypes,
    missingRequiredTypes,
  };
};
