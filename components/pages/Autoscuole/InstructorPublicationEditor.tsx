"use client";

import React from "react";
import { Check, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { TimePickerInput } from "@/components/ui/time-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import {
  getDailyAvailabilityOverrides,
  getInstructorPublishedWeeks,
  publishInstructorWeek,
  setDailyAvailabilityOverride,
  unpublishInstructorWeek,
} from "@/lib/actions/autoscuole-availability.actions";

type TimeRange = { startMinutes: number; endMinutes: number };
type BaseAvailability = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  ranges?: TimeRange[];
  /** Per-weekday map — authoritative over the flat ranges when present. */
  rangesByDay?: Record<string, TimeRange[]>;
} | null;

type DayState = {
  /** YYYY-MM-DD (UTC) */
  date: string;
  on: boolean;
  ranges: TimeRange[];
  /** true = not persisted yet, projected from last published week / base */
  isTemplate: boolean;
};

const WEEK_COUNT = 8;
const DAY_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const DEFAULT_RANGE: TimeRange = { startMinutes: 9 * 60, endMinutes: 18 * 60 };

const pad = (n: number) => String(n).padStart(2, "0");
const fmtMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const labelToMin = (label: string) => {
  const [h, m] = label.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDaysUTC = (d: Date, days: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
const mondayOf = (date: Date) => {
  const dow = date.getUTCDay();
  return addDaysUTC(date, -(dow === 0 ? 6 : dow - 1));
};
const positive = (ranges: unknown): TimeRange[] =>
  Array.isArray(ranges)
    ? (ranges as TimeRange[]).filter((r) => r && r.endMinutes > r.startMinutes)
    : [];

function weekLabel(weekYmd: string) {
  const a = new Date(weekYmd + "T00:00:00Z");
  const b = addDaysUTC(a, 6);
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

export function InstructorPublicationEditor({
  instructorId,
  base,
  onChanged,
}: {
  instructorId: string;
  base: BaseAvailability;
  /** Called after publish/unpublish/day-save so the parent can refresh the agenda. */
  onChanged?: () => void;
}) {
  const toast = useFeedbackToast();
  const mondays = React.useMemo(() => {
    const first = mondayOf(new Date());
    return Array.from({ length: WEEK_COUNT }, (_, i) => ymd(addDaysUTC(first, i * 7)));
  }, []);

  const [published, setPublished] = React.useState<Set<string>>(new Set());
  const [selWeek, setSelWeek] = React.useState(mondays[0]);
  const [days, setDays] = React.useState<DayState[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionPending, setActionPending] = React.useState(false);
  const [editIdx, setEditIdx] = React.useState<number | null>(null);
  const [draftOn, setDraftOn] = React.useState(true);
  const [draftRanges, setDraftRanges] = React.useState<TimeRange[]>([DEFAULT_RANGE]);
  const [savingDay, setSavingDay] = React.useState(false);

  const loadPublished = React.useCallback(async () => {
    const res = await getInstructorPublishedWeeks({
      instructorId,
      from: mondays[0],
      to: ymd(addDaysUTC(new Date(mondays[WEEK_COUNT - 1] + "T00:00:00Z"), 6)),
    });
    if (res.success && res.data) {
      setPublished(new Set(res.data.map((w) => ymd(new Date(w.weekStart)))));
    }
  }, [instructorId, mondays]);

  const loadWeek = React.useCallback(
    async (weekYmd: string) => {
      setLoading(true);
      setEditIdx(null);
      try {
        const from = weekYmd;
        const to = ymd(addDaysUTC(new Date(weekYmd + "T00:00:00Z"), 6));
        const res = await getDailyAvailabilityOverrides({
          ownerType: "instructor",
          ownerId: instructorId,
          from,
          to,
        });
        const byDate = new Map<string, TimeRange[]>();
        if (res.success && res.data) {
          for (const o of res.data) byDate.set(ymd(new Date(o.date)), positive(o.ranges));
        }

        // Fallback template for days without an override: the last published
        // week's same weekday, else the base weekly availability — the SAME
        // chain publishInstructorWeek uses to materialize missing days.
        const templateByDow = new Map<number, TimeRange[]>();
        const pastPublished = Array.from(published)
          .filter((w) => w !== weekYmd)
          .sort()
          .reverse();
        const lastPublished = pastPublished.find((w) => w < weekYmd) ?? pastPublished[0];
        if (lastPublished && byDate.size < 7) {
          const tmpl = await getDailyAvailabilityOverrides({
            ownerType: "instructor",
            ownerId: instructorId,
            from: lastPublished,
            to: ymd(addDaysUTC(new Date(lastPublished + "T00:00:00Z"), 6)),
          });
          if (tmpl.success && tmpl.data) {
            for (const o of tmpl.data) {
              templateByDow.set(new Date(o.date).getUTCDay(), positive(o.ranges));
            }
          }
        }
        if (!templateByDow.size && base) {
          if (base.rangesByDay) {
            for (const [dow, ranges] of Object.entries(base.rangesByDay)) {
              templateByDow.set(Number(dow), positive(ranges));
            }
          } else {
            const baseRanges = base.ranges?.length
              ? base.ranges
              : [{ startMinutes: base.startMinutes, endMinutes: base.endMinutes }];
            for (const dow of base.daysOfWeek) templateByDow.set(dow, baseRanges);
          }
        }

        const start = new Date(weekYmd + "T00:00:00Z");
        setDays(
          Array.from({ length: 7 }, (_, i) => {
            const date = ymd(addDaysUTC(start, i));
            const dow = addDaysUTC(start, i).getUTCDay();
            const override = byDate.get(date);
            const ranges = override ?? templateByDow.get(dow) ?? [];
            return { date, on: ranges.length > 0, ranges, isTemplate: override === undefined };
          }),
        );
      } finally {
        setLoading(false);
      }
    },
    [instructorId, base, published],
  );

  React.useEffect(() => {
    loadPublished();
  }, [loadPublished]);
  React.useEffect(() => {
    loadWeek(selWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on week/publish-set change only
  }, [selWeek, published, instructorId]);

  const isPublished = published.has(selWeek);

  const handlePublishToggle = async () => {
    setActionPending(true);
    const res = isPublished
      ? await unpublishInstructorWeek({ weekStart: selWeek, instructorId })
      : await publishInstructorWeek({ weekStart: selWeek, instructorId });
    setActionPending(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Operazione non riuscita." });
      return;
    }
    toast.success({
      description: isPublished ? "Pubblicazione ritirata." : "Settimana pubblicata.",
    });
    await loadPublished();
    onChanged?.();
  };

  const openDayEditor = (idx: number) => {
    if (!days) return;
    const d = days[idx];
    setDraftOn(d.on);
    setDraftRanges(d.ranges.length ? d.ranges.map((r) => ({ ...r })) : [{ ...DEFAULT_RANGE }]);
    setEditIdx(editIdx === idx ? null : idx);
  };

  const handleSaveDay = async () => {
    if (editIdx === null || !days) return;
    if (draftOn && draftRanges.some((r) => r.endMinutes <= r.startMinutes)) {
      toast.error({ description: "Una o più fasce orarie non sono valide." });
      return;
    }
    setSavingDay(true);
    const res = await setDailyAvailabilityOverride({
      ownerType: "instructor",
      ownerId: instructorId,
      date: days[editIdx].date,
      ranges: draftOn ? draftRanges : [],
    });
    setSavingDay(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Errore salvataggio." });
      return;
    }
    toast.success({ description: "Giornata salvata." });
    setEditIdx(null);
    await loadWeek(selWeek);
    onChanged?.();
  };

  return (
    <div className="space-y-3.5">
      {/* Week rail */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {mondays.map((w, i) => {
          const pub = published.has(w);
          const sel = w === selWeek;
          return (
            <button
              key={w}
              type="button"
              onClick={() => setSelWeek(w)}
              className={cn(
                "shrink-0 rounded-2xl border px-3 py-2 text-left transition-colors",
                sel
                  ? "border-[#1A1A2E] bg-[#1A1A2E]"
                  : pub
                    ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "border-border bg-gray-100 hover:bg-gray-200/70",
              )}
            >
              <span className={cn("block text-[9px] font-semibold uppercase tracking-[0.08em]", sel ? "text-gray-400" : "text-muted-foreground")}>
                {i === 0 ? "Settimana corrente" : `Settimana +${i}`}
              </span>
              <span className={cn("mt-0.5 flex items-center gap-1 text-xs font-semibold tabular-nums", sel ? "text-white" : pub ? "text-emerald-700" : "text-foreground")}>
                {pub && (
                  <span className={cn("flex size-3.5 items-center justify-center rounded-full", sel ? "bg-white/25" : "bg-emerald-500")}>
                    <Check className="size-2 text-white" strokeWidth={3.5} />
                  </span>
                )}
                {weekLabel(w)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          {isPublished ? (
            <span className="flex size-[18px] items-center justify-center rounded-full bg-emerald-500">
              <Check className="size-2.5 text-white" strokeWidth={3.5} />
            </span>
          ) : (
            <span className="size-[18px] rounded-full border-2 border-gray-300" />
          )}
          <div>
            <div className="text-xs font-semibold text-foreground">{isPublished ? "Pubblicata" : "Da pubblicare"}</div>
            <div className="text-[10.5px] text-muted-foreground">
              {isPublished ? "Gli allievi possono prenotare" : "Non visibile agli allievi"}
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={isPublished ? "outline" : "default"}
          className={cn("rounded-full", !isPublished && "bg-[#1A1A2E] text-white hover:bg-black")}
          disabled={actionPending || loading}
          onClick={handlePublishToggle}
        >
          {actionPending ? "Attendi..." : isPublished ? "Ritira" : "Pubblica"}
        </Button>
      </div>

      {/* Day rows */}
      <div className="overflow-hidden rounded-xl border border-border">
        {loading || !days ? (
          <div className="space-y-2 p-3.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          days.map((d, i) => {
            const dateObj = new Date(d.date + "T00:00:00Z");
            const open = editIdx === i;
            return (
              <div key={d.date} className={cn("border-b border-border/50 last:border-b-0")}>
                <button
                  type="button"
                  onClick={() => openDayEditor(i)}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="w-[86px] text-xs font-semibold text-foreground">
                    {DAY_LABELS[dateObj.getUTCDay()]}
                    <span className="block text-[10px] font-medium text-muted-foreground">
                      {dateObj.getUTCDate()} {MONTHS[dateObj.getUTCMonth()]}
                    </span>
                  </span>
                  {d.on && d.ranges.length ? (
                    <span className="ml-auto flex flex-wrap justify-end gap-1">
                      {d.ranges.map((r, ri) => (
                        <span key={ri} className="rounded-full border border-border bg-white px-2 py-0.5 text-[10.5px] font-semibold tabular-nums">
                          {fmtMin(r.startMinutes)}–{fmtMin(r.endMinutes)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="ml-auto text-[11.5px] text-muted-foreground/70">Riposo</span>
                  )}
                  <ChevronRight className={cn("size-3.5 shrink-0 text-gray-300 transition-transform", open && "rotate-90")} />
                </button>
                {open && (
                  <div className="border-t border-dashed border-border bg-gray-50/70 px-3.5 pb-3 pt-2.5">
                    <div className="flex items-center justify-between pb-2.5">
                      <span className="text-xs font-semibold">Disponibile</span>
                      <InlineToggle checked={draftOn} size="sm" onChange={() => setDraftOn((v) => !v)} />
                    </div>
                    {draftOn && (
                      <div className="space-y-1.5">
                        {draftRanges.map((r, ri) => (
                          <div key={ri} className="flex items-center gap-2">
                            <TimePickerInput
                              value={fmtMin(r.startMinutes)}
                              onChange={(v) => setDraftRanges((prev) => prev.map((x, xi) => (xi === ri ? { ...x, startMinutes: labelToMin(v) } : x)))}
                              minTime="00:00"
                              maxTime="23:30"
                              minuteStep={30}
                              className="h-8 w-[96px] justify-between px-2.5 py-1 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">–</span>
                            <TimePickerInput
                              value={r.endMinutes === 1440 ? "24:00" : fmtMin(r.endMinutes)}
                              onChange={(v) => setDraftRanges((prev) => prev.map((x, xi) => (xi === ri ? { ...x, endMinutes: labelToMin(v) } : x)))}
                              minTime="00:30"
                              maxTime="24:00"
                              minuteStep={30}
                              className="h-8 w-[96px] justify-between px-2.5 py-1 text-xs"
                            />
                            {draftRanges.length > 1 && (
                              <button type="button" aria-label="Rimuovi fascia" onClick={() => setDraftRanges((prev) => prev.filter((_, xi) => xi !== ri))} className="flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500">
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => setDraftRanges((prev) => [...prev, { startMinutes: 14 * 60, endMinutes: 18 * 60 }])} className="flex items-center gap-1 py-1 text-[11.5px] font-semibold text-foreground hover:underline">
                          <Plus className="size-3" /> Aggiungi fascia
                        </button>
                      </div>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => setEditIdx(null)} disabled={savingDay}>
                        Annulla
                      </Button>
                      <Button type="button" size="sm" className="h-7 rounded-full bg-foreground text-xs text-white hover:bg-black" onClick={handleSaveDay} disabled={savingDay}>
                        {savingDay ? "Salvataggio..." : "Salva giorno"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-muted-foreground">
        <span className="mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full border border-gray-300 text-[8px] text-gray-400">i</span>
        Le settimane nuove partono dall&apos;ultima settimana pubblicata. Gli allievi possono prenotare solo le settimane pubblicate.
      </p>
    </div>
  );
}
