"use client";

import * as React from "react";

import { roadApi, type RoadHotspot } from "@/lib/autoscuole/road/client";
import { haversineMeters } from "@/lib/autoscuole/road/geo";

/** Stesso periodo di default della tab Punti critici: il link apre un punto che c'è. */
const HOTSPOT_DAYS = 90;
/** Una segnalazione «cade» su un punto critico entro questa distanza (= raggio dei punti, `HOTSPOT_RADIUS_M`). */
const HOTSPOT_MATCH_M = 60;

/**
 * REG-719: i punti critici dell'autoscuola, per collegarci segnalazioni, tappe
 * del giro e punti dell'allievo. Si calcola nel browser (stessa lista della tab
 * Punti critici, in cache sul server): una segnalazione appartiene al punto
 * dello stesso tipo più vicino entro 60 m.
 */
export function useCompanyHotspots(enabled: boolean) {
  const [list, setList] = React.useState<RoadHotspot[]>([]);
  React.useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    roadApi
      .hotspots({ from: new Date(Date.now() - HOTSPOT_DAYS * 86_400_000).toISOString() }, ctrl.signal)
      .then((d) => setList(d.hotspots))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [enabled]);
  return React.useMemo(() => {
    const index = new Map(list.map((h, i) => [h.key, i + 1]));
    const find = (p: { kind?: string | null; lat: number; lng: number; key?: string }) => {
      const byKey = p.key ? list.find((h) => h.key === p.key) : undefined;
      if (byKey) return byKey;
      let best: RoadHotspot | null = null;
      let bestD = HOTSPOT_MATCH_M;
      for (const h of list) {
        if (p.kind && h.kind !== p.kind) continue;
        const d = haversineMeters(p.lat, p.lng, h.lat, h.lng);
        if (d <= bestD) [best, bestD] = [h, d];
      }
      return best;
    };
    return { find, number: (key: string) => index.get(key) ?? 0 };
  }, [list]);
}
