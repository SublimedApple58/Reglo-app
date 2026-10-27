"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { isRoadEnabled } from "@/lib/services";
import { cn } from "@/lib/utils";
import { LiveDot } from "./road-ui";
import { RoadTodayView } from "./RoadTodayView";
import { RoadHistoryView } from "./RoadHistoryView";

// La mappa (MapLibre) vive solo nel browser.
const RoadLiveView = dynamic(() => import("./RoadLiveView").then((m) => ({ default: m.RoadLiveView })), {
  ssr: false,
  loading: () => <div className="h-[calc(100vh-230px)] min-h-[560px] w-full animate-pulse rounded-[24px] bg-[#f7f7f7]" />,
});

export type RoadView = "live" | "today" | "history";

const VIEWS: Array<{ value: RoadView; label: string }> = [
  { value: "live", label: "Dal vivo" },
  { value: "today", label: "Guide di oggi" },
  { value: "history", label: "Storico" },
];

export const ROAD_VIEW_LABEL: Record<RoadView, string> = {
  live: "Dal vivo",
  today: "Guide di oggi",
  history: "Storico",
};

export function normalizeRoadView(v: string | null | undefined): RoadView {
  return v === "today" || v === "history" ? v : "live";
}

/** Guardia comune: senza modulo Road si torna all'agenda. */
export function useRoadGuard() {
  const company = useAtomValue(companyAtom);
  const router = useRouter();
  const locale = useLocale();
  const enabled = isRoadEnabled(company?.services ?? null);
  React.useEffect(() => {
    if (company && !enabled) router.replace(`/${locale}/user/autoscuole?tab=agenda`);
  }, [company, enabled, router, locale]);
  return enabled;
}

/**
 * Reglo Road (REG-638) — «Tutte le guide dell'autoscuola, dal vivo».
 * Tre viste nel segmented: Dal vivo (mappa + auto in giro), Guide di oggi,
 * Storico. La vista sta nell'URL (`?view=`) così il dettaglio sa tornare.
 */
export function AutoscuoleRoadPage() {
  const enabled = useRoadGuard();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const view = normalizeRoadView(searchParams.get("view"));
  const basePath = `/${locale}/user/autoscuole/road`;

  const setView = (next: RoadView) => {
    router.replace(next === "live" ? basePath : `${basePath}?view=${next}`, { scroll: false });
  };
  const openSession = React.useCallback(
    (sessionId: string, from: RoadView) => router.push(`${basePath}/${sessionId}?from=${from}`),
    [router, basePath],
  );

  if (!enabled) return <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" />;

  return (
    <div className="w-full lg:-mt-1.5" data-testid="autoscuole-road-page">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-[18px]">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.6px] text-[#111111]">Road</h1>
          <p className="mt-[3px] text-[14.5px] text-[#6a6a6a]">Tutte le guide dell&apos;autoscuola, dal vivo</p>
        </div>
        <div role="tablist" className="flex h-[42px] gap-0.5 rounded-[21px] bg-[#f4f4f4] p-1">
          {VIEWS.map((opt) => {
            const active = opt.value === view;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(opt.value)}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-[17px] px-[18px] text-[14.5px] transition-colors",
                  active
                    ? "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.06)]"
                    : "font-medium text-[#555555] hover:text-[#111111]",
                )}
              >
                {opt.value === "live" ? <LiveDot /> : null}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "live" ? <RoadLiveView onOpen={(id) => openSession(id, "live")} /> : null}
      {view === "today" ? <RoadTodayView onOpen={(id) => openSession(id, "today")} /> : null}
      {view === "history" ? <RoadHistoryView onOpen={(id) => openSession(id, "history")} /> : null}
    </div>
  );
}
