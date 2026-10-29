"use client";

import dynamic from "next/dynamic";

import { useRoadGuard } from "./AutoscuoleRoadPage";
import type { ExamRouteEditorSource } from "./RoadExamRouteEditor";

// La mappa (MapLibre) vive solo nel browser.
const RoadExamRouteEditor = dynamic(
  () => import("./RoadExamRouteEditor").then((m) => ({ default: m.RoadExamRouteEditor })),
  { ssr: false, loading: () => <div className="h-[calc(100vh-230px)] min-h-[560px] w-full animate-pulse rounded-[24px] bg-[#f7f7f7]" /> },
);

const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function RoadExamRouteEditorPage(props: {
  id: string;
  session: string | null;
  fromMs: string | null;
  toMs: string | null;
}) {
  const enabled = useRoadGuard();
  if (!enabled) return <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" />;
  const source: ExamRouteEditorSource =
    props.id !== "nuovo"
      ? { kind: "edit", id: props.id }
      : props.session
        ? { kind: "session", sessionId: props.session, fromMs: num(props.fromMs), toMs: num(props.toMs) }
        : { kind: "new" };
  return <RoadExamRouteEditor source={source} />;
}
