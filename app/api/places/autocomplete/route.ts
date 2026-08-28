import { NextResponse } from "next/server";

import { requireServiceAccess } from "@/lib/service-access";

// Server-side proxy per Google Places API (New) — evita il blocco CORS delle
// chiamate client-side e non espone la chiave nel bundle (REG-396). La chiave
// vive solo lato server; il client chiama questa route con { input, sessionToken }.
export const dynamic = "force-dynamic";

const PLACES_KEY =
  process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function POST(request: Request) {
  try {
    // Solo staff autoscuola autenticato: evita che l'endpoint diventi un
    // drenaggio di quota aperto a chiunque (la chiave non è più referrer-bound).
    await requireServiceAccess("AUTOSCUOLE");
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  if (!PLACES_KEY) return NextResponse.json({ suggestions: [] });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (input.length < 3) return NextResponse.json({ suggestions: [] });

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["IT"],
        languageCode: "it",
        ...(typeof body.sessionToken === "string" ? { sessionToken: body.sessionToken } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }
}
