"use client";

import React from "react";
import Image from "next/image";
import * as Popover from "@radix-ui/react-popover";
import { CheckCheck, Trash } from "lucide-react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";

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

/** "dom 20 lug, 15:00" for the cancelled guide. */
function formatGuida(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
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

function initialsOf(name: string | null): string {
  const t = (name ?? "").trim();
  if (!t) return "·";
  const w = t.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "·";
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

  const deleteAll = React.useCallback(async () => {
    // Optimistic: clear locally + reset the seen-set so a later arrival re-toasts.
    setItems([]);
    setUnread(0);
    seenRef.current = new Set();
    try {
      await fetch(ENDPOINT, { method: "DELETE" });
    } catch {
      void fetchNotifications();
    }
  }, [fetchNotifications]);

  if (hidden) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Notifiche"
          className="relative flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f0f0f0] transition-colors hover:bg-[#e6e6e6]"
        >
          <Image
            src="/images/menu/bell-3d.png"
            alt=""
            width={30}
            height={30}
            className="block h-[30px] w-[30px] translate-x-[1.5px] translate-y-[1px] object-contain"
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
          className="z-50 w-[400px] overflow-hidden rounded-[18px] bg-white shadow-[0_8px_28px_rgba(0,0,0,0.13),0_0_0_1px_rgba(0,0,0,0.04)]"
        >
          <div className="flex items-center justify-between px-5 pb-3.5 pt-4">
            <span className="text-[18px] font-bold tracking-[-0.3px] text-foreground">
              Notifiche
            </span>
            {items.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unread === 0}
                  title="Segna tutte come lette"
                  aria-label="Segna tutte come lette"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f0f0f0] text-[#484848] transition-colors hover:bg-[#e6e6e6] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-[#f0f0f0]"
                >
                  <CheckCheck className="h-[17px] w-[17px]" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={deleteAll}
                  title="Cancella tutte"
                  aria-label="Cancella tutte"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f0f0f0] text-[#484848] transition-colors hover:bg-[#e6e6e6]"
                >
                  <Trash className="h-[14px] w-[14px]" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-5 pb-10 pt-6 text-center">
              <Image
                src="/images/menu/bell-3d.png"
                alt=""
                width={46}
                height={46}
                className="mx-auto mb-3 block h-[46px] w-[46px] object-contain opacity-45 grayscale"
              />
              <p className="text-[15px] font-semibold text-foreground">Nessuna notifica</p>
              <p className="mt-1 text-[13px] font-medium text-[#717171]">
                Ti avvisiamo qui quando un allievo annulla una guida.
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pb-1.5">
              {items.map((n) => (
                <div key={n.id} className="relative flex items-center gap-3.5 px-5 py-3">
                  <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[13px] font-semibold text-[#484848]">
                    {initialsOf(n.studentName)}
                  </span>
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-[14.5px] leading-[1.4] text-foreground">
                        <span className="font-semibold">
                          {n.studentName ?? "Un allievo"}
                        </span>{" "}
                        ha annullato una guida
                      </p>
                      <p className="mt-0.5 text-[13px] font-medium text-[#717171]">
                        {formatGuida(n.startsAt)} · {relativeTime(n.createdAt)}
                      </p>
                    </div>
                  {!n.read && (
                    <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#c13515]" />
                  )}
                </div>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
