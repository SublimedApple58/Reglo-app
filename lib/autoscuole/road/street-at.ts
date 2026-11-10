import { getRedis } from "@/lib/cache/redis";
import { pickStreetAddress, streetFromAddress } from "@/lib/places/nearby-address";

/**
 * Road novembre R3 — nome della via di un punto, per le segnalazioni spostate
 * dal web (l'app manda già la via presa dal telefono). Places API (New)
 * `places:searchNearby`, la stessa del proxy «Usa la mia posizione attuale»
 * (REG-656): niente Geocoding API da abilitare. Cache Redis per ~11 m (4
 * decimali), 90 giorni; un errore di Google dà null e non va in cache.
 */
const PREFIX = "road:street:v1:";
const TTL_S = 60 * 60 * 24 * 90;
const RADIUS_M = 40;

type Fetcher = (lat: number, lng: number) => Promise<string | null>;

const searchNearby: Fetcher = async (lat, lng) => {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.formattedAddress" },
    body: JSON.stringify({
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: RADIUS_M } },
      rankPreference: "DISTANCE",
      maxResultCount: 10,
      languageCode: "it",
      regionCode: "IT",
    }),
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`places:searchNearby ${res.status}`);
  const data = (await res.json().catch(() => null)) as { places?: Array<{ formattedAddress?: string }> } | null;
  return streetFromAddress(pickStreetAddress((data?.places ?? []).map((p) => p.formattedAddress)));
};

export async function streetAt(lat: number, lng: number, fetcher: Fetcher = searchNearby): Promise<string | null> {
  const redis = getRedis();
  const key = `${PREFIX}${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (redis) {
    const hit = await redis.get<{ street: string | null }>(key).catch(() => null);
    if (hit) return hit.street;
  }
  let street: string | null;
  try {
    street = await fetcher(lat, lng);
  } catch (error) {
    console.warn("[road/street-at] via non trovata", error instanceof Error ? error.message : error);
    return null;
  }
  if (redis) await redis.set(key, { street }, { ex: TTL_S }).catch(() => undefined);
  return street;
}
