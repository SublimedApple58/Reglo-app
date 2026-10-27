"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { roadApi, type RoadTodayItem } from "@/lib/autoscuole/road/client";
import { cn } from "@/lib/utils";
import {
  Car3D,
  hhmm,
  initials,
  instructorTint,
  km,
  MarkerPill,
  RoadStatusChip,
  type RoadStatusKind,
} from "./road-ui";

const POLL_MS = 30_000;

export function todayStatus(item: RoadTodayItem, now: number): RoadStatusKind {
  if (item.road?.status === "active") return "live";
  if (item.road?.status === "completed") return "done";
  if (item.road?.status === "abandoned") return "auto";
  return new Date(item.endsAt).getTime() < now ? "missed" : "todo";
}

/**
 * «Guide di oggi»: le guide singole in auto di oggi con lo stato Road di
 * ciascuna. Stesso linguaggio visivo delle righe «In giro adesso».
 */
export function RoadTodayView({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const [items, setItems] = React.useState<RoadTodayItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await roadApi.today();
        if (!alive) return;
        setItems(data);
        setNow(Date.now());
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Impossibile caricare le guide di oggi.");
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const done = items?.filter((i) => i.road).length ?? 0;

  return (
    <div className="rounded-[24px] border border-[#ebebeb] px-4 pb-3 pt-5 leading-[1.25]" data-testid="road-today">
      <div className="flex items-baseline justify-between px-1.5 pb-3">
        <b className="text-lg font-semibold tracking-[-0.3px] text-[#111111]">Guide di oggi</b>
        {items ? (
          <span className="text-[13px] text-[#6a6a6a]">
            {items.length === 1 ? "1 guida" : `${items.length} guide`} · {done} con Road
          </span>
        ) : null}
      </div>

      {!items && !error ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[20px] bg-[#f7f7f7]" />
          ))}
        </div>
      ) : null}
      {error && !items ? <p className="px-1.5 pb-3 text-[13.5px] text-[#6a6a6a]">{error}</p> : null}
      {items && items.length === 0 ? (
        <p className="px-1.5 pb-4 text-[14px] text-[#6a6a6a]">Oggi non ci sono guide singole in auto.</p>
      ) : null}

      {items && items.length ? (
        <div className="grid">
          {items.map((it) => {
            const status = todayStatus(it, now);
            const clickable = Boolean(it.road);
            const tint = instructorTint(it.instructor);
            const Row = clickable ? "button" : "div";
            return (
              <Row
                key={it.appointmentId}
                {...(clickable ? { type: "button" as const, onClick: () => onOpen(it.road!.id) } : {})}
                data-testid="road-today-row"
                className={cn(
                  "grid grid-cols-[80px_64px_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] py-3 pl-2.5 pr-3.5 text-left md:grid-cols-[80px_64px_minmax(0,1fr)_150px_140px_20px]",
                  clickable ? "cursor-pointer transition-colors hover:bg-[#fafafa]" : "",
                )}
              >
                <div className="text-sm font-semibold tabular-nums text-[#111111]">
                  {hhmm(it.startsAt)}
                  <span className="block text-[12.5px] font-normal text-[#6a6a6a]">{hhmm(it.endsAt)}</span>
                </div>
                <Car3D color={it.carColor} tint={tint} label={initials(it.instructor?.name)} />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold tracking-[-0.2px] text-[#111111]">
                    {it.student?.name ?? "Allievo"}
                  </div>
                  <div className="mt-px truncate text-[13.5px] text-[#444444]">
                    {[`con ${it.instructor?.name ?? "istruttore"}`, it.vehicle?.name].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="hidden md:block">
                  <RoadStatusChip kind={status} />
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="md:hidden">
                    <RoadStatusChip kind={status} />
                  </span>
                  {it.road ? (
                    <>
                      <span className="text-sm font-semibold tabular-nums text-[#111111]">
                        {km(it.road.distanceMeters)} km
                      </span>
                      <MarkerPill count={it.road.markerCount} kinds={it.road.markerKinds} />
                    </>
                  ) : null}
                </div>
                <div className="hidden md:block">
                  {clickable ? <ChevronRight className="size-4 text-[#b0b0b0]" strokeWidth={2} /> : null}
                </div>
              </Row>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
