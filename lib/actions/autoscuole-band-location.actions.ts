"use server";

/**
 * REG-717 — cambio rapido del luogo di una fascia dall'agenda web.
 *
 * Solo titolare / istruttore titolare / admin, solo con «Disponibilità per
 * luogo» effettiva. Di default cambia quel giorno (override della data, con le
 * stesse fasce di oggi e solo quel luogo diverso); con `everyWeekday` cambia la
 * settimana tipo di quel giorno della settimana (e l'override di quel giorno, se
 * c'è). A differenza di `setDailyAvailabilityOverride` NON azzera
 * `availabilityOverrideApproved`: gli orari non cambiano.
 *
 * Restituisce un'istantanea dello stato di prima per «Annulla».
 */

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { AUTOSCUOLE_CACHE_SEGMENTS, invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";
import { AVAILABILITY_WRITE_FORBIDDEN, isAvailabilityManager } from "@/lib/autoscuole/availability-access";
import { getLocationAvailabilityState } from "@/lib/autoscuole/member-locations";
import { locatedRangeSchema, sanitizeRangeLocations } from "@/lib/autoscuole/range-locations";
import { rangesForWeekday, type TimeRange } from "@/lib/autoscuole/weekly-schedule";
import { rangesWithBandLocation, weeklyLikeFromRecord, weeklyWithBandLocation } from "@/lib/autoscuole/band-location";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutes = z.number().int().min(0).max(1440);

const setBandLocationSchema = z.object({
  instructorId: z.string().uuid(),
  date: ymd,
  startMinutes: minutes,
  endMinutes: minutes,
  locationId: z.string().uuid().nullable(),
  everyWeekday: z.boolean().default(false),
});

const weeklySnapshotSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startMinutes: minutes,
  endMinutes: minutes,
  startMinutes2: minutes.nullable(),
  endMinutes2: minutes.nullable(),
  ranges: z.array(locatedRangeSchema).nullable(),
  rangesByDay: z.record(z.array(locatedRangeSchema)).nullable(),
});

const snapshotSchema = z.object({
  instructorId: z.string().uuid(),
  date: ymd,
  /** Fasce dell'override del giorno prima del cambio; `null` = non c'era. */
  override: z.array(locatedRangeSchema).nullable(),
  /** Settimana tipo prima del cambio, solo se è stata toccata. */
  weekly: weeklySnapshotSchema.nullable(),
});

export type BandLocationSnapshot = z.infer<typeof snapshotSchema>;

const parseRanges = (raw: unknown): TimeRange[] =>
  Array.isArray(raw)
    ? raw.filter(
        (r): r is TimeRange =>
          !!r && typeof r === "object" && typeof r.startMinutes === "number" && typeof r.endMinutes === "number",
      )
    : [];

/** Contesto comune: ruolo, funzione accesa, istruttore dell'autoscuola. */
async function bandLocationContext(instructorId: string) {
  const { membership } = await requireServiceAccess("AUTOSCUOLE");
  if (!isAvailabilityManager(membership)) return { error: AVAILABILITY_WRITE_FORBIDDEN } as const;
  const companyId = membership.companyId;
  const [state, instructor] = await Promise.all([
    getLocationAvailabilityState(companyId),
    prisma.autoscuolaInstructor.findFirst({ where: { id: instructorId, companyId }, select: { id: true } }),
  ]);
  if (!state.enabled) return { error: "«Disponibilità per luogo» è spenta." } as const;
  if (!instructor) return { error: "Istruttore non trovato." } as const;
  return { companyId } as const;
}

export async function setAgendaBandLocation(input: z.input<typeof setBandLocationSchema>) {
  try {
    const payload = setBandLocationSchema.parse(input);
    const ctx = await bandLocationContext(payload.instructorId);
    if ("error" in ctx) return { success: false as const, message: ctx.error };
    const { companyId } = ctx;
    const band = { startMinutes: payload.startMinutes, endMinutes: payload.endMinutes };

    if (payload.locationId) {
      const { probe } = await sanitizeRangeLocations(companyId, "instructor", {
        probe: [{ ...band, locationId: payload.locationId }],
      });
      if (!probe[0]?.locationId) return { success: false as const, message: "Luogo non valido." };
    }

    const date = new Date(payload.date + "T00:00:00Z");
    const dayOfWeek = date.getUTCDay();
    const where = { companyId, ownerType: "instructor", ownerId: payload.instructorId };
    const [override, weekly] = await Promise.all([
      prisma.autoscuolaDailyAvailabilityOverride.findUnique({
        where: { companyId_ownerType_ownerId_date: { ...where, date } },
      }),
      prisma.autoscuolaWeeklyAvailability.findFirst({ where }),
    ]);
    const weeklyLike = weekly ? weeklyLikeFromRecord(weekly) : null;
    const dayRanges = override ? parseRanges(override.ranges) : rangesForWeekday(weeklyLike, dayOfWeek);
    const nextDay = rangesWithBandLocation(dayRanges, band, payload.locationId);
    if (!nextDay) {
      return { success: false as const, message: "La fascia è cambiata nel frattempo: ricarica l'agenda." };
    }

    const snapshot: BandLocationSnapshot = {
      instructorId: payload.instructorId,
      date: payload.date,
      override: override ? parseRanges(override.ranges) : null,
      weekly: null,
    };
    let keptOverrides = 0;

    if (payload.everyWeekday) {
      const nextWeekly = weeklyLike ? weeklyWithBandLocation(weeklyLike, dayOfWeek, band, payload.locationId) : null;
      if (!weekly || !nextWeekly) {
        return { success: false as const, message: "Questa fascia non è nella settimana tipo." };
      }
      snapshot.weekly = {
        daysOfWeek: weekly.daysOfWeek,
        startMinutes: weekly.startMinutes,
        endMinutes: weekly.endMinutes,
        startMinutes2: weekly.startMinutes2,
        endMinutes2: weekly.endMinutes2,
        // Valori grezzi, così «Annulla» rimette la riga identica (anche i null).
        ranges: weekly.ranges === null ? null : parseRanges(weekly.ranges),
        rangesByDay: weeklyLike!.rangesByDay,
      };
      // Gli altri giorni uguali con orari propri (override) restano come sono.
      const later = await prisma.autoscuolaDailyAvailabilityOverride.findMany({
        where: { ...where, date: { gt: date } },
        select: { date: true },
      });
      keptOverrides = later.filter((o) => new Date(o.date).getUTCDay() === dayOfWeek).length;

      await prisma.$transaction([
        prisma.autoscuolaWeeklyAvailability.update({
          where: { id: weekly.id },
          data: { ...nextWeekly, ranges: nextWeekly.ranges, rangesByDay: nextWeekly.rangesByDay },
        }),
        ...(override
          ? [
              prisma.autoscuolaDailyAvailabilityOverride.update({
                where: { id: override.id },
                data: { ranges: nextDay },
              }),
            ]
          : []),
      ]);
    } else {
      await prisma.autoscuolaDailyAvailabilityOverride.upsert({
        where: { companyId_ownerType_ownerId_date: { ...where, date } },
        update: { ranges: nextDay },
        create: { ...where, date, ranges: nextDay },
      });
    }

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });
    return { success: true as const, data: { snapshot, keptOverrides } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** «Annulla»: rimette override del giorno e settimana tipo com'erano. */
export async function undoAgendaBandLocation(input: BandLocationSnapshot) {
  try {
    const snapshot = snapshotSchema.parse(input);
    const ctx = await bandLocationContext(snapshot.instructorId);
    if ("error" in ctx) return { success: false as const, message: ctx.error };
    const { companyId } = ctx;
    const date = new Date(snapshot.date + "T00:00:00Z");
    const where = { companyId, ownerType: "instructor", ownerId: snapshot.instructorId };

    const byDay = snapshot.weekly?.rangesByDay ?? {};
    const groups: Record<string, TimeRange[]> = {
      override: snapshot.override ?? [],
      ranges: snapshot.weekly?.ranges ?? [],
      ...Object.fromEntries(Object.entries(byDay).map(([k, v]) => [`d${k}`, v])),
    };
    const clean: Record<string, TimeRange[]> = await sanitizeRangeLocations(companyId, "instructor", groups);

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (snapshot.override) {
      ops.push(
        prisma.autoscuolaDailyAvailabilityOverride.upsert({
          where: { companyId_ownerType_ownerId_date: { ...where, date } },
          update: { ranges: clean.override },
          create: { ...where, date, ranges: clean.override },
        }),
      );
    } else {
      ops.push(prisma.autoscuolaDailyAvailabilityOverride.deleteMany({ where: { ...where, date } }));
    }
    if (snapshot.weekly) {
      const w = snapshot.weekly;
      ops.push(
        prisma.autoscuolaWeeklyAvailability.updateMany({
          where,
          data: {
            daysOfWeek: w.daysOfWeek,
            startMinutes: w.startMinutes,
            endMinutes: w.endMinutes,
            startMinutes2: w.startMinutes2,
            endMinutes2: w.endMinutes2,
            ranges: w.ranges ? clean.ranges : Prisma.DbNull,
            rangesByDay: w.rangesByDay
              ? Object.fromEntries(Object.keys(w.rangesByDay).map((k) => [k, clean[`d${k}`]]))
              : Prisma.DbNull,
          },
        }),
      );
    }
    await prisma.$transaction(ops);

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
