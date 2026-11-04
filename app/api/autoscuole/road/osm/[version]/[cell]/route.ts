import { NextResponse } from "next/server";

import { roadContext } from "@/lib/autoscuole/road/service";
import { OSM_CELLS_VERSION } from "@/lib/autoscuole/road/osm-cells";
import { loadOsmCell } from "@/lib/autoscuole/road/osm-store";

/**
 * REG-722: una cella OSM della calamita (`v1/<iy>_<ix>`, formato in `osm-cells.ts`),
 * per la mobile in guida e per «Dal vivo» sul web. 404 = zona non coperta.
 * Il contenuto cambia solo con la versione (nel percorso), quindi si tiene in
 * cache a lungo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ version: string; cell: string }> }) {
  const { version, cell } = await params;
  if (version !== `v${OSM_CELLS_VERSION}`) return new NextResponse(null, { status: 404 });
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return NextResponse.json({ success: false, message: "Road non attivo." }, { status: 403 });
    const bytes = await loadOsmCell(cell);
    if (!bytes) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=2592000, immutable" },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Non autorizzato." }, { status: 401 });
  }
}
