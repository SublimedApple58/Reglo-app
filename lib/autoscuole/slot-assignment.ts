import { prisma } from "@/db/prisma";
import {
  loadLocationAssignmentContext,
  locationOfCoveringRange,
  scopeAvailabilityRecord,
  violatesLocationChangeBuffer,
  type LocationAssignmentContext,
} from "@/lib/autoscuole/location-booking";
import {
  buildVehicleResolutionMaps,
  pickBestInstructorVehicleSet,
  resolveVehiclesForInstructor,
  type VehicleResolutionMaps,
} from "@/lib/autoscuole/vehicle-resolution";
import { vehicleServesLicense } from "@/lib/autoscuole/license";
import {
  FOLLOW_CAR_CATEGORY,
  isFollowCarVehicle,
  parseFollowCarRulesFromLimits,
  requiresFollowCar,
  type FollowCarRules,
} from "@/lib/autoscuole/follow-car";
import {
  APPOINTMENT_BUSY_SELECT,
  appointmentBusyOwnerIds,
} from "@/lib/autoscuole/appointment-busy";
import {
  addGroupLessonBusyIntervals,
  fetchGroupLessonBusyRows,
} from "@/lib/autoscuole/group-lesson-busy";

/**
 * Slot assignment — the ONE way to answer "can this student take a lesson at
 * [startsAt, endsAt), and with which instructor + vehicle set?" using the SAME
 * rules as the booking engine (createBookingRequest / getAllAvailableSlots):
 * license category + transmission via vehicleServesLicense, exclusive/pool/open
 * usage modes, follow car (auto al seguito) for moto categories, busy intervals
 * from appointments (primary vehicle AND the appointmentVehicles join, so extra
 * motos and follow cars block), instructor blocks, group-lesson containers
 * (fleet + shared follow car), publication mode and maintenance/inactive
 * exclusion.
 *
 * Born to fix the waitlist accept path (respondWaitlistOffer), which used the
 * legacy AutoscuolaAvailabilitySlot rows and bypassed all of the above
 * (pool/exclusive, follow car, vehicle status, real overlaps). Build the
 * context once per range, then evaluate any number of (student, interval)
 * pairs in memory — broadcast/visibility filters reuse the same context.
 *
 * NOT covered on purpose (matches the historical slot-fill semantics): weekly
 * booking limit (documented bypass for bookingSource=slot_fill), booking
 * cutoff, and the student's cluster instructor lock.
 */

const AUTOSCUOLA_TIMEZONE = "Europe/Rome";

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AUTOSCUOLA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const zonedParts = (date: Date) => {
  const parts = zonedFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: WEEKDAY_TO_INDEX[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
};

type AvailabilityLike = {
  daysOfWeek: number[];
  ranges: Array<{ startMinutes: number; endMinutes: number }>;
  rangesByDay?: Record<string, Array<{ startMinutes: number; endMinutes: number }>>;
};

type Resolver = {
  resolve: (ownerId: string, date: Date) => AvailabilityLike | null;
};

type PubFilter = (instructorId: string, date: Date) => boolean;

export type SlotAssignmentContext = {
  vehiclesEnabled: boolean;
  activeInstructorIds: string[];
  activeVehicles: Array<{
    id: string;
    licenseCategory: string | null;
    transmission: string | null;
  }>;
  activeVehicleIds: string[];
  maps: VehicleResolutionMaps;
  followCarRules: FollowCarRules;
  instructorResolver: Resolver;
  vehicleResolver: Resolver;
  pubFilter: PubFilter;
  /** ownerId (student/instructor/vehicle) → busy intervals in epoch ms. */
  intervals: Map<string, Array<{ start: number; end: number }>>;
  /** REG-705d: luoghi degli allievi e pausa tra luoghi (assente/spento = nessun vincolo). */
  location?: LocationAssignmentContext;
};

const rangesFor = (availability: AvailabilityLike, dayOfWeek: number) => {
  const byDay = availability.rangesByDay?.[String(dayOfWeek)];
  if (byDay) return byDay;
  return availability.daysOfWeek.includes(dayOfWeek) ? availability.ranges : [];
};

const isOwnerAvailable = (
  availability: AvailabilityLike | null,
  dayOfWeek: number,
  startMin: number,
  endMin: number,
) => {
  if (!availability) return false;
  return rangesFor(availability, dayOfWeek).some(
    (r) => r.endMinutes > r.startMinutes && startMin >= r.startMinutes && endMin <= r.endMinutes,
  );
};

const overlaps = (
  ownerIntervals: Array<{ start: number; end: number }> | undefined,
  start: number,
  end: number,
) => {
  if (!ownerIntervals?.length) return false;
  return ownerIntervals.some((i) => start < i.end && end > i.start);
};

export async function buildSlotAssignmentContext(args: {
  companyId: string;
  rangeStart: Date;
  rangeEnd: Date;
  /** REG-705d: allievi per cui si risolverà, per caricarne i luoghi in un colpo. */
  studentIds?: readonly string[];
}): Promise<SlotAssignmentContext> {
  const { companyId, rangeStart, rangeEnd } = args;
  // Dynamic import: this module is imported BY the availability actions file,
  // so a static import back into it would create a load-time cycle.
  const { buildAvailabilityResolver, getPublicationModeFilter } = await import(
    "@/lib/actions/autoscuole-availability.actions"
  );

  const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
  const [service, activeInstructors, activeVehicles, poolMembers, preferred] =
    await Promise.all([
      prisma.companyService.findFirst({
        where: { companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
      prisma.autoscuolaInstructor.findMany({
        where: { companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId, status: "active" },
        select: {
          id: true,
          assignedInstructorId: true,
          followsInstructorAvailability: true,
          licenseCategory: true,
          transmission: true,
        },
      }),
      prisma.autoscuolaVehiclePoolMember.findMany({
        where: { vehicle: { companyId } },
        select: { vehicleId: true, instructorId: true },
      }),
      prisma.autoscuolaInstructorPreferredVehicle.findMany({
        where: { instructor: { companyId } },
        select: { instructorId: true, licenseCategory: true, vehicleId: true },
      }),
    ]);

  const limits = (service?.limits ?? {}) as Record<string, unknown>;
  const vehiclesEnabled = limits.vehiclesEnabled !== false;
  const activeInstructorIds = activeInstructors.map((i) => i.id);
  const activeVehicleIds = vehiclesEnabled ? activeVehicles.map((v) => v.id) : [];

  const [instructorResolver, vehicleResolver, pubFilter, appointments, blocks, groupBusy] =
    await Promise.all([
      buildAvailabilityResolver(companyId, "instructor", activeInstructorIds, rangeStart, rangeEnd),
      buildAvailabilityResolver(companyId, "vehicle", activeVehicleIds, rangeStart, rangeEnd),
      getPublicationModeFilter(companyId, activeInstructorIds, rangeStart, rangeEnd),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          status: { notIn: ["cancelled"] },
          startsAt: { gte: appointmentScanStart, lt: rangeEnd },
        },
        select: APPOINTMENT_BUSY_SELECT,
      }),
      prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId,
          instructorId: { in: activeInstructorIds },
          endsAt: { gt: rangeStart },
          startsAt: { lt: rangeEnd },
        },
        select: { instructorId: true, startsAt: true, endsAt: true },
      }),
      fetchGroupLessonBusyRows(companyId, rangeStart, rangeEnd),
    ]);

  const intervals = new Map<string, Array<{ start: number; end: number }>>();
  const add = (ownerId: string, start: number, end: number) => {
    const list = intervals.get(ownerId) ?? [];
    list.push({ start, end });
    intervals.set(ownerId, list);
  };
  for (const appt of appointments) {
    const start = appt.startsAt.getTime();
    const end = appt.endsAt?.getTime() ?? start + 30 * 60 * 1000;
    // Allievo, istruttore, CO-ISTRUTTORI e veicoli (REG-591).
    for (const ownerId of appointmentBusyOwnerIds(appt)) add(ownerId, start, end);
  }
  for (const block of blocks) {
    add(block.instructorId, block.startsAt.getTime(), block.endsAt.getTime());
  }
  addGroupLessonBusyIntervals(intervals, groupBusy);

  return {
    vehiclesEnabled,
    activeInstructorIds,
    activeVehicles,
    activeVehicleIds,
    maps: buildVehicleResolutionMaps({ vehicles: activeVehicles, poolMembers, preferred }),
    followCarRules: parseFollowCarRulesFromLimits(limits),
    instructorResolver,
    vehicleResolver,
    pubFilter,
    intervals,
    location: await loadLocationAssignmentContext({
      companyId: args.companyId,
      studentIds: args.studentIds ?? [],
      instructorIds: activeInstructorIds,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    }),
  };
}

export type SlotAssignment = {
  instructorId: string;
  vehicleId: string | null;
  followVehicleId: string | null;
  /** REG-705d: luogo della fascia (null = senza luogo, si usa la precedenza). */
  locationId: string | null;
};

/**
 * Resolve the (instructor, vehicle, follow car) set for a student at an exact
 * interval, or null when no rule-respecting pairing exists. Pure in-memory —
 * safe to call per student/offer on a shared context. Student's OWN conflicts
 * are the caller's responsibility (they usually have better day-scoped data).
 */
export function resolveSlotAssignmentForStudent(
  ctx: SlotAssignmentContext,
  args: {
    licenseCategory: string | null;
    transmission: string | null;
    startsAt: Date;
    endsAt: Date;
    /** REG-705d: per filtrare le fasce per i luoghi dell'allievo. */
    studentId?: string | null;
  },
): SlotAssignment | null {
  const { startsAt, endsAt } = args;
  const startMs = startsAt.getTime();
  const endMs = endsAt.getTime();
  const { weekday: dayOfWeek, minutes: startMin } = zonedParts(startsAt);
  const endMin = startMin + Math.round((endMs - startMs) / 60_000);

  const loc: LocationAssignmentContext = ctx.location ?? {
    enabled: false,
    bufferMinutes: 0,
    defaultLocationId: null,
    locatedBusy: new Map(),
    students: new Map(),
  };
  const studentLoc = loc.enabled && args.studentId ? loc.students.get(args.studentId) : undefined;
  const scope = studentLoc?.scope ?? null;
  const availableInstructors: Array<{ id: string; score: number }> = [];
  const rangeLocationByInstructor = new Map<string, string | null>();
  for (const instructorId of ctx.activeInstructorIds) {
    if (!ctx.pubFilter(instructorId, startsAt)) continue;
    const availability = scopeAvailabilityRecord(ctx.instructorResolver.resolve(instructorId, startsAt), scope);
    if (!isOwnerAvailable(availability, dayOfWeek, startMin, endMin)) continue;
    if (overlaps(ctx.intervals.get(instructorId), startMs, endMs)) continue;
    const rangeLocationId = loc.enabled
      ? locationOfCoveringRange(rangesFor(availability!, dayOfWeek), startMin, endMin)
      : null;
    if (
      loc.bufferMinutes > 0 &&
      violatesLocationChangeBuffer({
        startsAt,
        endsAt,
        locationId: rangeLocationId ?? studentLoc?.fallbackLocationId ?? loc.defaultLocationId,
        busy: loc.locatedBusy.get(instructorId) ?? [],
        bufferMinutes: loc.bufferMinutes,
        defaultLocationId: loc.defaultLocationId,
      })
    ) {
      continue;
    }
    rangeLocationByInstructor.set(instructorId, rangeLocationId);
    availableInstructors.push({ id: instructorId, score: 0 });
  }
  if (!availableInstructors.length) return null;

  const student = {
    licenseCategory: args.licenseCategory,
    transmission: args.transmission,
  };
  const vehicleById = new Map(ctx.activeVehicles.map((v) => [v.id, v]));
  const matchesLicenseCategory = (vehicleId: string) => {
    const vehicle = vehicleById.get(vehicleId);
    return vehicle ? vehicleServesLicense(vehicle, student) : false;
  };
  const matchesFollowCar = (vehicleId: string) => {
    const vehicle = vehicleById.get(vehicleId);
    return vehicle ? isFollowCarVehicle(vehicle) : false;
  };
  const requireFollowCar =
    ctx.vehiclesEnabled && requiresFollowCar(ctx.followCarRules, args.licenseCategory);

  const pair = pickBestInstructorVehicleSet({
    availableInstructors,
    vehiclesEnabled: ctx.vehiclesEnabled,
    resolveVehicles: (instructorId) =>
      resolveVehiclesForInstructor({
        instructorId,
        studentCategory: args.licenseCategory,
        activeVehicleIds: ctx.activeVehicleIds,
        maps: ctx.maps,
        isVehicleAvailable: (vehicleId) =>
          isOwnerAvailable(
            ctx.vehicleResolver.resolve(vehicleId, startsAt),
            dayOfWeek,
            startMin,
            endMin,
          ),
        hasOverlap: (vehicleId) => overlaps(ctx.intervals.get(vehicleId), startMs, endMs),
        scoreVehicle: () => 0,
        matchesLicenseCategory,
        requireFollowCar,
        matchesFollowCar,
        followCarCategory: FOLLOW_CAR_CATEGORY,
      }),
  });
  if (!pair) return null;
  return {
    instructorId: pair.instructorId,
    vehicleId: pair.vehicleId,
    followVehicleId: pair.followVehicleId,
    locationId: rangeLocationByInstructor.get(pair.instructorId) ?? null,
  };
}
