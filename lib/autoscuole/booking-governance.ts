import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import {
  LICENSE_PATH_BUCKETS,
  type LicensePathBucket,
} from "@/lib/autoscuole/license";

export const APP_BOOKING_ACTOR_OPTIONS = [
  "students",
  "instructors",
  "both",
] as const;
export type AppBookingActors = (typeof APP_BOOKING_ACTOR_OPTIONS)[number];

/**
 * Per-license-path override of `appBookingActors` (REG-426). A bucket left unset
 * inherits the level default. Stored on `limits.appBookingActorsByPath` (company)
 * and on the cluster settings (`InstructorClusterSettings`).
 */
export type AppBookingActorsByPath = Partial<Record<LicensePathBucket, AppBookingActors>>;

export const INSTRUCTOR_BOOKING_MODE_OPTIONS = [
  "manual_full",
  "manual_engine",
] as const;
export type InstructorBookingMode = (typeof INSTRUCTOR_BOOKING_MODE_OPTIONS)[number];

export type BookingGovernanceSettings = {
  appBookingActors: AppBookingActors;
  instructorBookingMode: InstructorBookingMode;
};

export const DEFAULT_APP_BOOKING_ACTORS: AppBookingActors = "students";
export const DEFAULT_INSTRUCTOR_BOOKING_MODE: InstructorBookingMode = "manual_engine";

const APP_BOOKING_ACTOR_SET = new Set<string>(APP_BOOKING_ACTOR_OPTIONS);
const INSTRUCTOR_BOOKING_MODE_SET = new Set<string>(INSTRUCTOR_BOOKING_MODE_OPTIONS);

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const parseBookingGovernanceFromLimits = (
  limits: Record<string, unknown>,
): BookingGovernanceSettings => {
  const appBookingActorsRaw = normalizeString(limits.appBookingActors);
  const instructorBookingModeRaw = normalizeString(limits.instructorBookingMode);

  const appBookingActors = APP_BOOKING_ACTOR_SET.has(appBookingActorsRaw)
    ? (appBookingActorsRaw as AppBookingActors)
    : DEFAULT_APP_BOOKING_ACTORS;
  const instructorBookingMode = INSTRUCTOR_BOOKING_MODE_SET.has(
    instructorBookingModeRaw,
  )
    ? (instructorBookingModeRaw as InstructorBookingMode)
    : DEFAULT_INSTRUCTOR_BOOKING_MODE;

  return {
    appBookingActors,
    instructorBookingMode,
  };
};

/**
 * Parse the per-path override map (REG-426) from a raw JSON value (limits or
 * cluster settings). Only valid actor values in known buckets are kept.
 */
export const parseAppBookingActorsByPath = (
  raw: unknown,
): AppBookingActorsByPath => {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: AppBookingActorsByPath = {};
  for (const bucket of LICENSE_PATH_BUCKETS) {
    const v = normalizeString(obj[bucket]);
    if (APP_BOOKING_ACTOR_SET.has(v)) out[bucket] = v as AppBookingActors;
  }
  return out;
};

/**
 * Resolve the effective actors for a bucket across the cluster → company cascade
 * (REG-426). Precedence is **specificity-first**: a per-path override (at either
 * level) beats a generic default, and within the same specificity the cluster
 * beats the company. So the order is:
 *   cluster per-path → company per-path → cluster default → company default.
 *
 * This is what makes a company per-path rule (e.g. moto = "solo istruttori")
 * actually apply to a student whose autonomous cluster only has a *generic*
 * default (e.g. "entrambi"): the specific company rule wins over the cluster's
 * blanket default. A cluster that wants to override a specific path must set its
 * OWN per-path value (which then wins, being both specific and cluster-level).
 *
 * When no per-path override exists anywhere (the pre-REG-426 world), this reduces
 * to `clusterDefault ?? companyDefault` — identical to the previous behaviour.
 */
export const resolveAppBookingActorsForBucket = (input: {
  bucket: LicensePathBucket;
  clusterDefault?: AppBookingActors | null;
  clusterByPath?: AppBookingActorsByPath | null;
  companyDefault: AppBookingActors;
  companyByPath?: AppBookingActorsByPath | null;
}): AppBookingActors =>
  input.clusterByPath?.[input.bucket] ??
  input.companyByPath?.[input.bucket] ??
  input.clusterDefault ??
  input.companyDefault;

export const isStudentAppBookingEnabled = (
  governance: BookingGovernanceSettings,
) =>
  governance.appBookingActors === "students" ||
  governance.appBookingActors === "both";

export const isInstructorAppBookingEnabled = (
  governance: BookingGovernanceSettings,
) =>
  governance.appBookingActors === "instructors" ||
  governance.appBookingActors === "both";

export const getBookingGovernanceForCompany = async (
  companyId: string,
): Promise<BookingGovernanceSettings> => {
  const limits = await getCachedCompanyServiceLimits(companyId);
  return parseBookingGovernanceFromLimits(limits);
};

/**
 * Governance resolved with the cascade cluster → company for a given student
 * (via their assigned autonomous instructor). An unset cluster value inherits
 * the company default. Use this instead of `getBookingGovernanceForCompany`
 * whenever a specific student is in scope.
 */
export const getBookingGovernanceForStudent = async (
  companyId: string,
  studentId: string,
): Promise<BookingGovernanceSettings> => {
  const { resolveEffectiveBookingSettings, buildCompanyBookingDefaults } = await import(
    "@/lib/autoscuole/instructor-clusters"
  );
  const limits = await getCachedCompanyServiceLimits(companyId);
  const effective = await resolveEffectiveBookingSettings(
    companyId,
    studentId,
    buildCompanyBookingDefaults(limits),
  );
  return {
    appBookingActors: effective.appBookingActors,
    instructorBookingMode: effective.instructorBookingMode,
  };
};

/**
 * Governance resolved with the cascade cluster → company for a given instructor
 * (their own cluster). An unset cluster value inherits the company default. Use
 * this whenever a specific instructor is the actor.
 */
export const getBookingGovernanceForInstructor = async (
  companyId: string,
  instructorId: string,
): Promise<BookingGovernanceSettings> => {
  const { resolveEffectiveSettingsForInstructor, buildCompanyBookingDefaults } = await import(
    "@/lib/autoscuole/instructor-clusters"
  );
  const limits = await getCachedCompanyServiceLimits(companyId);
  const effective = await resolveEffectiveSettingsForInstructor(
    companyId,
    instructorId,
    buildCompanyBookingDefaults(limits),
  );
  return {
    appBookingActors: effective.appBookingActors,
    instructorBookingMode: effective.instructorBookingMode,
  };
};
