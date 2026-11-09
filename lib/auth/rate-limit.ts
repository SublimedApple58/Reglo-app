import { getRedis } from "@/lib/cache/redis";

/**
 * Limite di tentativi a finestra fissa su Redis (INCR + EXPIRE).
 *
 * Senza Redis configurato (dev locale) lascia passare: è una protezione in più,
 * non un cancello da cui dipende il funzionamento.
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const fullKey = `ratelimit:${key}`;
    const count = await redis.incr(fullKey);
    if (count === 1) await redis.expire(fullKey, windowSeconds);
    return count <= limit;
  } catch (error) {
    console.error("[rate-limit] redis non raggiungibile", error);
    return true;
  }
}

/** IP del client dietro Vercel (primo valore di x-forwarded-for). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
