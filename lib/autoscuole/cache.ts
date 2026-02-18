import { createHash } from "crypto";
import { getRedis } from "@/lib/cache/redis";

const AGENDA_SEGMENT = "agenda";
const PAYMENTS_SEGMENT = "payments";
const STRIPE_SEGMENT = "stripe";
const FIC_SEGMENT = "fic";
const CACHE_NAMESPACE = "autoscuole:v1";

export const AUTOSCUOLE_CACHE_SEGMENTS = {
  AGENDA: AGENDA_SEGMENT,
  PAYMENTS: PAYMENTS_SEGMENT,
  STRIPE: STRIPE_SEGMENT,
  FIC: FIC_SEGMENT,
} as const;

export type AutoscuoleCacheSegment =
  (typeof AUTOSCUOLE_CACHE_SEGMENTS)[keyof typeof AUTOSCUOLE_CACHE_SEGMENTS];

const versionKey = (companyId: string, segment: AutoscuoleCacheSegment) =>
  `${CACHE_NAMESPACE}:${companyId}:${segment}:version`;

const normalizeString = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export const hashCacheInput = (input: Record<string, unknown>) =>
  createHash("sha1")
    .update(
      JSON.stringify(
        Object.entries(input)
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .map(
            ([key, value]): [string, unknown] => [
              key,
              typeof value === "string" ? normalizeString(value) : value,
            ],
          )
          .sort((left, right) => left[0].localeCompare(right[0])),
      ),
    )
    .digest("hex");

const getSegmentVersion = async (
  companyId: string,
  segment: AutoscuoleCacheSegment,
) => {
  const redis = getRedis();
  if (!redis) return 1;
  const cached = await redis.get<number>(versionKey(companyId, segment));
  return typeof cached === "number" && Number.isFinite(cached) && cached > 0
    ? Math.trunc(cached)
    : 1;
};

export const buildAutoscuoleCacheKey = async ({
  companyId,
  segment,
  scope,
}: {
  companyId: string;
  segment: AutoscuoleCacheSegment;
  scope: string;
}) => {
  const version = await getSegmentVersion(companyId, segment);
  return `${CACHE_NAMESPACE}:${companyId}:${segment}:v${version}:${scope}`;
};

export const readAutoscuoleCache = async <T>(key: string) => {
  const redis = getRedis();
  if (!redis) return null;
  const payload = await redis.get<T>(key);
  return payload ?? null;
};

export const writeAutoscuoleCache = async <T>(
  key: string,
  payload: T,
  ttlSeconds: number,
) => {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, payload, { ex: ttlSeconds });
};

export const invalidateAutoscuoleCache = async ({
  companyId,
  segments,
}: {
  companyId: string;
  segments: AutoscuoleCacheSegment[];
}) => {
  const redis = getRedis();
  if (!redis) return;
  if (!segments.length) return;

  await Promise.all(
    Array.from(new Set(segments)).map(async (segment) => {
      await redis.incr(versionKey(companyId, segment));
    }),
  );
};
