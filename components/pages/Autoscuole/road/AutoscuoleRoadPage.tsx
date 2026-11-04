"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";
import { Settings } from "lucide-react";

import { companyAtom } from "@/atoms/company.store";
import { isRoadEnabled } from "@/lib/services";
import { LiveDot } from "./road-ui";
import { RoadTodayView } from "./RoadTodayView";
import { RoadHistoryView } from "./RoadHistoryView";
import { RoadExamRoutesSection } from "./RoadExamRoutesSection";
import { RoadTabs } from "./road-nav-ui";
import {
  normalizeRoadView,
  rememberList,
  rememberPrev,
  ROAD_VIEWS,
  roadViewHref,
  sessionHref,
} from "./road-nav";

export { normalizeRoadView, type RoadView } from "./road-nav";

// La mappa (MapLibre) vive solo nel browser.
const RoadLiveView = dynamic(() => import("./RoadLiveView").then((m) => ({ default: m.RoadLiveView })), {
  ssr: false,
  loading: () => <div className="h-[calc(100vh-230px)] min-h-[560px] w-full animate-pulse rounded-[24px] bg-[#f7f7f7]" />,
});

// Mappa dei punti critici (REG-644): anche lei solo nel browser.
const RoadHotspotsView = dynamic(
  () => import("./RoadHotspotsView").then((m) => ({ default: m.RoadHotspotsView })),
  {
    ssr: false,
    loading: () => <div className="h-[calc(100vh-230px)] min-h-[560px] w-full animate-pulse rounded-[24px] bg-[#f7f7f7]" />,
  },
);

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
 * Reglo Road (REG-638) — sezione a tab (REG-716): Dal vivo, Oggi, Storico,
 * Punti critici, Percorsi d'esame. La tab sta nell'URL (`?view=`) insieme al
 * suo stato (filtri dello Storico, punto critico aperto), così il dettaglio sa
 * tornare esattamente lì. A destra la rotella apre Impostazioni › Reglo Road.
 */
export function AutoscuoleRoadPage() {
  const enabled = useRoadGuard();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const view = normalizeRoadView(searchParams.get("view"));
  const meta = ROAD_VIEWS.find((v) => v.value === view)!;
  const settingsHref = `/${locale}/user/autoscuole?tab=settings&pane=road`;

  const openSession = React.useCallback(
    (sessionId: string, list?: string[]) => {
      rememberList(list ?? []);
      rememberPrev();
      router.push(sessionHref(locale, sessionId, view));
    },
    [router, locale, view],
  );

  if (!enabled) return <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" />;

  return (
    <div className="w-full lg:-mt-1.5" data-testid="autoscuole-road-page">
      <div className="border-b border-[#ebebeb]">
        <div className="flex items-start justify-between gap-4 pb-2 sm:items-end">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.6px] text-[#111111]">Road</h1>
            <p key={view} className="road-sub mt-[3px] text-[14.5px] text-[#6a6a6a]" data-testid="road-subtitle">
              {meta.subtitle}
            </p>
          </div>
          <Link
            href={settingsHref}
            aria-label="Impostazioni di Road"
            data-testid="road-settings-link"
            className="grid size-11 shrink-0 place-items-center rounded-full text-[#111111] transition-colors duration-200 hover:bg-[#f4f4f4] sm:flex sm:h-10 sm:w-auto sm:gap-2 sm:bg-[#f4f4f4] sm:px-4 sm:text-[14px] sm:font-semibold sm:hover:bg-[#ebebeb]"
          >
            <Settings className="size-[18px]" strokeWidth={1.9} />
            <span className="hidden sm:inline">Impostazioni</span>
          </Link>
        </div>
        <RoadTabs
          items={ROAD_VIEWS}
          value={view}
          hrefFor={(v) => roadViewHref(locale, v)}
          render={(it) => (
            <>
              {it.value === "live" ? <LiveDot /> : null}
              {it.label}
            </>
          )}
        />
      </div>
      <style>{`.road-sub{animation:road-sub-in 220ms cubic-bezier(0.2,0,0,1)}@keyframes road-sub-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}`}</style>

      <div className="pt-5" key={view}>
        {view === "live" ? <RoadLiveView onOpen={(id) => openSession(id)} /> : null}
        {view === "today" ? <RoadTodayView onOpen={openSession} /> : null}
        {view === "history" ? <RoadHistoryView onOpen={openSession} /> : null}
        {view === "hotspots" ? <RoadHotspotsView onOpen={openSession} /> : null}
        {view === "routes" ? <RoadExamRoutesSection /> : null}
      </div>
    </div>
  );
}

