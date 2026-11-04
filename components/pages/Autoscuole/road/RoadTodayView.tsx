"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
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
  romeYmd,
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
export function RoadTodayView({ onOpen }: { onOpen: (sessionId: string, list: string[]) => void }) {
  const locale = useLocale();
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
  const ids = (items ?? []).flatMap((i) => (i.road ? [i.road.id] : []));
  const agendaHref = `/${locale}/user/autoscuole?tab=agenda&date=${romeYmd(new Date())}`;

  return (
    <div className="leading-[1.25]" data-testid="road-today">
      {items && items.length ? (
        <p className="pb-3 text-[13.5px] tabular-nums text-[#6a6a6a]">
          {items.length === 1 ? "1 guida singola in auto" : `${items.length} guide singole in auto`}
          {done ? ` · ${done} registrate con Road` : ""}
        </p>
      ) : null}

      {!items && !error ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[20px] bg-[#f7f7f7]" />
          ))}
        </div>
      ) : null}
      {error && !items ? <p className="px-1.5 pb-3 text-[13.5px] text-[#6a6a6a]">{error}</p> : null}
      {items && items.length === 0 ? (
        <div className="max-w-[520px] py-6" data-testid="road-today-empty">
          <b className="block text-[16px] font-semibold text-[#111111]">Oggi non ci sono guide singole in auto</b>
          <p className="mt-1 text-[14px] leading-[1.5] text-[#6a6a6a]">
            Qui compaiono le guide in auto di oggi, con lo stato di Road di ciascuna. Le guide di gruppo, in moto e gli
            esami non passano da Road.
          </p>
          <Link
            href={agendaHref}
            className="mt-4 inline-flex h-10 items-center rounded-[20px] bg-[#f4f4f4] px-4 text-[14px] font-semibold text-[#111111] transition-colors duration-200 hover:bg-[#ebebeb]"
          >
            Apri l&apos;agenda di oggi
          </Link>
        </div>
      ) : null}

      {items && items.length ? (
        <div className="grid border-t border-[#ebebeb]">
          {items.map((it) => {
            const status = todayStatus(it, now);
            const clickable = Boolean(it.road);
            const tint = instructorTint(it.instructor);
            const Row = clickable ? "button" : "div";
            return (
              <Row
                key={it.appointmentId}
                {...(clickable ? { type: "button" as const, onClick: () => onOpen(it.road!.id, ids) } : {})}
                data-testid="road-today-row"
                className={cn(
                  "grid grid-cols-[48px_64px_minmax(0,1fr)] items-center gap-3 border-b border-[#f0f0f0] py-3.5 pl-1 pr-1 text-left md:grid-cols-[80px_64px_minmax(0,1fr)_150px_140px_20px] md:gap-4 md:rounded-[16px] md:border-b-0 md:py-3 md:pl-2.5 md:pr-3.5",
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
                <div className="col-start-3 -mt-1 flex min-w-0 items-center gap-3 md:col-start-auto md:mt-0 md:justify-end">
                  <span className="md:hidden">
                    <RoadStatusChip kind={status} />
                  </span>
                  {it.road ? (
                    <>
                      <span className="text-sm font-semibold tabular-nums text-[#111111]">
                        {km(it.road.distanceMeters)} km
                      </span>
                      <MarkerPill count={it.road.markerCount} kinds={it.road.markerKinds} good={it.road.markerGood} bad={it.road.markerBad} />
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
