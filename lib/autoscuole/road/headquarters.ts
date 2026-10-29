import { prisma } from "@/db/prisma";
import { getRedis } from "@/lib/cache/redis";

/**
 * REG-653 Reglo Road — la sede dove si chiude il giro.
 *
 * 1. La sede (`AutoscuolaLocation` di default, non archiviata) con le sue
 *    coordinate.
 * 2. Sede senza coordinate ma con l'indirizzo: geocodifica con Places API (New)
 *    `places:searchText`, la stessa API e la stessa chiave server del proxy
 *    Places (REG-396), così non serve abilitare la Geocoding API. Il risultato
 *    va in cache Redis (90 giorni, anche il «non trovato» per un giorno) e
 *    sulla sede, ma solo se nel frattempo l'indirizzo non è cambiato e le
 *    coordinate sono ancora vuote.
 * Niente sede, o sede senza coordinate né indirizzo trovato = `null`: la linea
 * finisce all'ultima tappa. REG-655: niente più ripieghi su un altro luogo
 * (prima il primo luogo con le coordinate): la sede è una sola, quella vera, e
 * se manca la web chiede al titolare di inserirla (REG-656).
 */

export type Pt = { lat: number; lng: number };
export type Geocode = (address: string) => Promise<Pt | null>;

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GEOCODE_TIMEOUT_MS = 6_000;
const GEOCODE_TTL_S = 60 * 60 * 24 * 90;
const GEOCODE_MISS_TTL_S = 60 * 60 * 24;
const GEOCODE_PREFIX = "road:geocode:v1:";

export const geocodeKey = (address: string) => `${GEOCODE_PREFIX}${address.trim().toLowerCase().replace(/\s+/g, " ")}`;

const validPt = (lat: unknown, lng: unknown): Pt | null =>
  typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;

/** Places API (New), Text Search: solo `places.location`, il primo risultato. */
export const geocodeWithPlaces: Geocode = async (address) => {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.location" },
    body: JSON.stringify({ textQuery: address, languageCode: "it", regionCode: "IT", pageSize: 1 }),
    signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`places:searchText ${res.status}`);
  const data = (await res.json().catch(() => null)) as {
    places?: Array<{ location?: { latitude?: number; longitude?: number } }>;
  } | null;
  const loc = data?.places?.[0]?.location;
  return validPt(loc?.latitude, loc?.longitude);
};

type CachedGeocode = Pt | { none: true };

/** Geocodifica con cache Redis; un errore di Google non va in cache (si riprova la volta dopo). */
export async function geocodeAddress(address: string, geocode: Geocode = geocodeWithPlaces): Promise<Pt | null> {
  const redis = getRedis();
  const key = geocodeKey(address);
  if (redis) {
    const hit = await redis.get<CachedGeocode>(key).catch(() => null);
    if (hit && "none" in hit) return null;
    if (hit) {
      const pt = validPt(hit.lat, hit.lng);
      if (pt) return pt;
    }
  }
  let pt: Pt | null;
  try {
    pt = await geocode(address);
  } catch (error) {
    console.warn("[road/headquarters] geocodifica non riuscita", error instanceof Error ? error.message : error);
    return null;
  }
  if (redis) {
    await redis
      .set(key, pt ?? { none: true }, { ex: pt ? GEOCODE_TTL_S : GEOCODE_MISS_TTL_S })
      .catch(() => undefined);
  }
  return pt;
}

const toPt = (lat: unknown, lng: unknown) => (lat != null && lng != null ? validPt(Number(lat), Number(lng)) : null);

export async function roadHeadquarters(companyId: string, geocode: Geocode = geocodeWithPlaces): Promise<Pt | null> {
  const hq = await prisma.autoscuolaLocation.findFirst({
    where: { companyId, isDefault: true, archivedAt: null },
    select: { id: true, address: true, latitude: true, longitude: true },
  });
  if (!hq) return null;
  const own = toPt(hq.latitude, hq.longitude);
  if (own) return own;
  const address = hq.address?.trim();
  if (!address) return null;
  const pt = await geocodeAddress(address, geocode);
  if (!pt) return null;
  await prisma.autoscuolaLocation
    .updateMany({
      where: { id: hq.id, address: hq.address, latitude: null, longitude: null },
      data: { latitude: pt.lat, longitude: pt.lng },
    })
    .catch(() => undefined);
  return pt;
}
