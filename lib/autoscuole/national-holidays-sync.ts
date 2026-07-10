import type { PrismaClient } from "@prisma/client";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  NATIONAL_HOLIDAYS,
  nationalHolidayDate,
  parseNationalHolidaySettings,
} from "@/lib/autoscuole/national-holidays";

/** Sync server-side delle festività nazionali materializzate (vedi
 *  national-holidays.ts per preset e semantica). Separata dal modulo puro
 *  perché importa la cache Redis (server-only). */

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

type PrismaClientLike = Pick<PrismaClient, "autoscuolaHoliday" | "companyService">;

/**
 * Allinea le righe AutoscuolaHoliday del preset allo stato dei limits:
 * crea le date attive mancanti (anno corrente + successivo, da oggi in poi)
 * e rimuove le righe preset future non più attive. Idempotente.
 */
export async function syncCompanyNationalHolidays({
  prisma,
  companyId,
  limits,
  now = new Date(),
}: {
  prisma: PrismaClientLike;
  companyId: string;
  limits: Record<string, unknown>;
  now?: Date;
}) {
  const { enabled, disabled } = parseNationalHolidaySettings(limits);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Date target: preset attivi, anno corrente + prossimo, solo da oggi in poi.
  const target = new Map<string, { presetId: string; label: string }>();
  if (enabled) {
    for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      for (const holiday of NATIONAL_HOLIDAYS) {
        if (disabled.includes(holiday.id)) continue;
        const dateStr = nationalHolidayDate(holiday, year);
        if (new Date(`${dateStr}T00:00:00.000Z`) >= today) {
          target.set(dateStr, { presetId: holiday.id, label: holiday.label });
        }
      }
    }
  }

  const existing = await prisma.autoscuolaHoliday.findMany({
    where: { companyId, presetId: { not: null }, date: { gte: today } },
    select: { id: true, date: true },
  });
  const dateKey = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

  const toDelete = existing.filter((row) => !target.has(dateKey(row.date)));
  const existingDates = new Set(existing.map((row) => dateKey(row.date)));
  const toCreate = [...target.entries()].filter(([dateStr]) => !existingDates.has(dateStr));

  if (!toDelete.length && !toCreate.length) return { created: 0, removed: 0 };

  if (toDelete.length) {
    await prisma.autoscuolaHoliday.deleteMany({
      where: { id: { in: toDelete.map((row) => row.id) } },
    });
  }
  if (toCreate.length) {
    // skipDuplicates: se il titolare ha già dichiarato manualmente un festivo
    // sulla stessa data (unique companyId+date), la riga manuale resta sua.
    await prisma.autoscuolaHoliday.createMany({
      data: toCreate.map(([dateStr, meta]) => ({
        companyId,
        date: new Date(`${dateStr}T00:00:00.000Z`),
        label: meta.label,
        presetId: meta.presetId,
      })),
      skipDuplicates: true,
    });
  }

  await invalidateAutoscuoleCache({
    companyId,
    segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
  });

  return { created: toCreate.length, removed: toDelete.length };
}

/** Sync giornaliera per tutte le autoscuole col preset attivo (cron). */
export async function processNationalHolidaysSync({
  prisma,
  now = new Date(),
}: {
  prisma: PrismaClientLike;
  now?: Date;
}) {
  const services = await prisma.companyService.findMany({
    where: { serviceKey: "AUTOSCUOLE", status: "ACTIVE" },
    select: { companyId: true, limits: true },
  });
  let created = 0;
  let removed = 0;
  for (const service of services) {
    const limits = (service.limits ?? {}) as Record<string, unknown>;
    if (limits.nationalHolidaysEnabled !== true) continue;
    const result = await syncCompanyNationalHolidays({
      prisma,
      companyId: service.companyId,
      limits,
      now,
    });
    created += result.created;
    removed += result.removed;
  }
  return { companies: services.length, created, removed };
}
