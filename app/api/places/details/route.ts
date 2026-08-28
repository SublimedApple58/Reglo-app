import { NextResponse } from "next/server";

import { requireServiceAccess } from "@/lib/service-access";

// Server-side proxy per il dettaglio di un place (formattedAddress + location).
// Vedi app/api/places/autocomplete/route.ts (REG-396).
export const dynamic = "force-dynamic";

const PLACES_KEY =
  process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: Request) {
  try {
    await requireServiceAccess("AUTOSCUOLE");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!PLACES_KEY) return NextResponse.json({ error: "no_key" }, { status: 500 });

  const placeId = new URL(request.url).searchParams.get("placeId");
  if (!placeId) return NextResponse.json({ error: "missing_placeId" }, { status: 400 });

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=it`,
      {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": PLACES_KEY,
          "X-Goog-FieldMask": "formattedAddress,location,displayName",
        },
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
