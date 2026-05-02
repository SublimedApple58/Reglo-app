import { prisma } from "@/db/prisma";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";

const SETTINGS_TTL_SECONDS = 300; // 5 minutes
const HOLIDAYS_TTL_SECONDS = 3600; // 1 hour

type CompanyServiceLimits = Record<string, unknown>;

export async function getCachedCompanyServiceLimits(
  companyId: string,
): Promise<CompanyServiceLimits> {
  const cacheKey = await buildAutoscuoleCacheKey({
    companyId,
    segment: AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS,
    scope: "limits",
  });

  const cached = await readAutoscuoleCache<CompanyServiceLimits>(cacheKey);
  if (cached) return cached;

  const service = await prisma.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  const limits = (service?.limits ?? {}) as CompanyServiceLimits;

  await writeAutoscuoleCache(cacheKey, limits, SETTINGS_TTL_SECONDS);
  return limits;
}

export async function getCachedHolidays(
  companyId: string,
  from: Date,
  to: Date,
): Promise<Date[]> {
  const cacheKey = await buildAutoscuoleCacheKey({
    companyId,
    segment: AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
    scope: hashCacheInput({
      action: "holidays",
      from: from.toISOString(),
      to: to.toISOString(),
    }),
  });

  const cached = await readAutoscuoleCache<string[]>(cacheKey);
  if (cached) return cached.map((d) => new Date(d));

  const holidays = await prisma.autoscuolaHoliday.findMany({
    where: {
      companyId,
      date: { gte: from, lte: to },
    },
    select: { date: true },
  });
  const dates = holidays.map((h) => h.date);

  await writeAutoscuoleCache(
    cacheKey,
    dates.map((d) => d.toISOString()),
    HOLIDAYS_TTL_SECONDS,
  );
  return dates;
}
