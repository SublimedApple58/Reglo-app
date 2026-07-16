"use client";

import React from "react";
import Image from "next/image";
import * as Popover from "@radix-ui/react-popover";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  kind: string;
  studentName: string | null;
  startsAt: string | null;
  instructorName: string | null;
  lessonType: string | null;
  read: boolean;
  createdAt: string;
};

const POLL_MS = 25_000;
const ENDPOINT = "/api/autoscuole/owner-notifications";

const dayFmt = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "dom 20 lug · 15:00" for the cancelled guide. */
function formatGuida(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dayFmt.format(d)} · ${timeFmt.format(d)}`;
}

/** Compact relative time in Italian: "adesso", "3 ore fa", "ieri", "3 giorni fa". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ieri";
  return `${days} giorni fa`;
}

/** Day bucket for grouping: 0 = today, 1 = this week, 2 = earlier. */
function bucketOf(iso: string): 0 | 1 | 2 {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return 0;
  const days = (Date.now() - d.getTime()) / 86_400_000;
  return days <= 7 ? 1 : 2;
}
const BUCKET_LABEL = ["Oggi", "Questa settimana", "Prima"] as const;

function initialsOf(name: string | null): string {
  const t = (name ?? "").trim();
  if (!t) return "·";
  const w = t.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "·";
}

function lessonLabel(type: string | null): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === "guida" || t === "esame") return null; // generic — no chip
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function OwnerNotificationsBell() {
  const toast = useFeedbackToast();
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  // Hidden for non-owners (endpoint replies 403) — the bell is titolare-only.
  const [hidden, setHidden] = React.useState(false);
  // Seen notification ids, to toast only genuinely new arrivals (skip first load).
  const seenRef = React.useRef<Set<string> | null>(null);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (res.status === 403) {
        setHidden(true);
        return;
      }
      const payload = await res.json().catch(() => null);
      if (!payload?.success || !payload.data) return;
      const next: NotificationItem[] = payload.data.items ?? [];
      setItems(next);
      setUnread(payload.data.unreadCount ?? 0);

      // Toast on new arrivals (only after the first successful load).
      if (seenRef.current === null) {
        seenRef.current = new Set(next.map((n) => n.id));
      } else {
        const fresh = next.filter(
          (n) => !n.read && !seenRef.current!.has(n.id),
        );
        for (const n of next) seenRef.current.add(n.id);
        if (fresh.length) {
          const top = fresh[0];
          toast.info({
            title: "Nuovo annullamento",
            description: `${top.studentName ?? "Un allievo"} ha annullato la guida di ${formatGuida(top.startsAt)}`,
          });
        }
      }
    } catch {
      // silent — non-blocking
    }
  }, [toast]);

  React.useEffect(() => {
    void fetchNotifications();
    const id = setInterval(() => void fetchNotifications(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  const markAllRead = React.useCallback(async () => {
    if (unread === 0) return;
    // Optimistic: clear locally, then persist.
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await fetch(ENDPOINT, { method: "POST" });
    } catch {
      void fetchNotifications();
    }
  }, [unread, fetchNotifications]);

  if (hidden) return null;

  const groups = ([0, 1, 2] as const)
    .map((b) => ({
      label: BUCKET_LABEL[b],
      rows: items.filter((n) => bucketOf(n.createdAt) === b),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Notifiche"
          className="relative flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-white transition-colors hover:bg-[#f0f0f2]"
        >
          <Image
            src="/images/menu/bell-gold.png"
            alt=""
            width={28}
            height={28}
            className="block h-[27px] w-[27px] object-contain"
          />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#f7f7f7] bg-[#c13515] px-1 text-[10px] font-bold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="z-50 w-[392px] overflow-hidden rounded-2xl border border-border bg-white shadow-dropdown"
        >
          <div className="flex items-center justify-between border-b border-[#f4f4f5] px-4 pb-3 pt-3.5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-foreground">Notifiche</span>
              {unread > 0 && (
                <span className="rounded-full border border-[#dbe7fb] bg-[#f4f8ff] px-2 py-px text-[11px] font-bold text-[#2563eb]">
                  {unread} nuov{unread === 1 ? "a" : "e"}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="cursor-pointer text-[12px] font-semibold text-navy-900 underline underline-offset-2 hover:opacity-80"
              >
                Segna tutte lette
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-5 py-9 text-center">
              <Image
                src="/images/menu/bell-gold.png"
                alt=""
                width={44}
                height={44}
                className="mx-auto mb-2.5 block h-[44px] w-[44px] object-contain opacity-50 grayscale"
              />
              <p className="text-[14px] font-semibold text-foreground">Nessuna notifica</p>
              <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">
                Ti avvisiamo qui quando un allievo annulla una guida.
              </p>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="sticky top-0 bg-white px-4 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#a4a4ab]">
                    {g.label}
                  </div>
                  {g.rows.map((n) => {
                    const chip = lessonLabel(n.lessonType);
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          "flex items-start gap-3 border-l-2 px-4 py-2.5",
                          n.read
                            ? "border-transparent"
                            : "border-[#2563eb] bg-[#f4f8ff]",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef0f4] text-[12.5px] font-bold text-navy-900">
                          {initialsOf(n.studentName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-[1.5] text-[#33333a]">
                            <span className="font-semibold text-foreground">
                              {n.studentName ?? "Un allievo"}
                            </span>{" "}
                            ha annullato la guida di{" "}
                            <span className="font-semibold text-foreground">
                              {formatGuida(n.startsAt)}
                            </span>
                            .
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] font-semibold text-[#929292]">
                            <span>{relativeTime(n.createdAt)}</span>
                            {n.instructorName && (
                              <>
                                <span className="text-[#cfcfd6]">·</span>
                                <span>{n.instructorName}</span>
                              </>
                            )}
                            {chip && (
                              <>
                                <span className="text-[#cfcfd6]">·</span>
                                <span>{chip}</span>
                              </>
                            )}
                          </p>
                        </div>
                        {!n.read && (
                          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2563eb]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
