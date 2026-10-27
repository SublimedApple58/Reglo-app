"use client";

import { normalizeRoadView, useRoadGuard } from "./AutoscuoleRoadPage";
import { RoadSessionDetail } from "./RoadSessionDetail";

export function RoadSessionDetailPage({ sessionId, from }: { sessionId: string; from: string | null }) {
  const enabled = useRoadGuard();
  if (!enabled) return <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" />;
  return <RoadSessionDetail sessionId={sessionId} from={normalizeRoadView(from)} />;
}
