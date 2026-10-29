import { NextResponse } from "next/server";

import { requireServiceAccess } from "@/lib/service-access";
import { pickStreetAddress } from "@/lib/places/nearby-address";

// REG-656: l'indirizzo più vicino a una posizione (il titolare sceglie «Usa la
// mia posizione attuale» nel foglio della sede di Road). Places API (New)
// `places:searchNearby`, stessa API e chiave dei proxy autocomplete/details
// (REG-396): niente Geocoding API da abilitare.
export const dynamic = "force-dynamic";

const PLACES_KEY =
  process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const RADIUS_M = 80;

export async function POST(request: Request) {
  try {
    await requireServiceAccess("AUTOSCUOLE");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!PLACES_KEY) return NextResponse.json({ error: "no_key" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "invalid_position" }, { status: 400 });
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": "places.formattedAddress",
      },
      body: JSON.stringify({
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: RADIUS_M } },
        rankPreference: "DISTANCE",
        maxResultCount: 10,
        languageCode: "it",
        regionCode: "IT",
      }),
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
    const data = (await res.json().catch(() => null)) as { places?: Array<{ formattedAddress?: string }> } | null;
    return NextResponse.json({ address: pickStreetAddress((data?.places ?? []).map((p) => p.formattedAddress)) });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
