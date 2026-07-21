"use client";

import React from "react";
import { ArrowUp, Inbox, Loader2, MessageCircle } from "lucide-react";

import {
  getBackofficeSupportThread,
  getBackofficeSupportThreads,
  sendBackofficeSupportReply,
  type BackofficeSupportThreadDto,
  type SupportMessageDto,
} from "@/lib/actions/support.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";

const THREADS_POLL_MS = 30_000;
const MESSAGES_POLL_MS = 10_000;

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function threadDateLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return timeLabel(iso);
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Oggi";
  if (sameDay(date, yesterday)) return "Ieri";
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Inbox assistenza del backoffice: conversazioni con le autoscuole (thread
 * SupportThread) e risposta come "Team Reglo". Le risposte compaiono nella
 * chat del centro assistenza web dell'autoscuola (badge non-letti in shell).
 */
export function BackofficeSupportPage({
  initialThreads,
}: {
  initialThreads: BackofficeSupportThreadDto[];
}) {
  const toast = useFeedbackToast();
  const [threads, setThreads] = React.useState(initialThreads);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialThreads[0]?.id ?? null,
  );
  const [messages, setMessages] = React.useState<SupportMessageDto[]>([]);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [companyName, setCompanyName] = React.useState<string>("");
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const sendingRef = React.useRef(false);

  const refreshThreads = React.useCallback(async () => {
    const res = await getBackofficeSupportThreads();
    if (res.success && res.data) setThreads(res.data);
  }, []);

  const loadThread = React.useCallback(
    async (threadId: string, showSpinner: boolean) => {
      if (sendingRef.current) return;
      if (showSpinner) setThreadLoading(true);
      const res = await getBackofficeSupportThread(threadId);
      if (res.success && res.data && !sendingRef.current) {
        setMessages(res.data.messages);
        setCompanyName(res.data.companyName);
        // aprire il thread = letto → azzera il badge nella lista
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, unreadForAdmin: 0 } : t)),
        );
      }
      if (showSpinner) setThreadLoading(false);
    },
    [],
  );

  React.useEffect(() => {
    if (selectedId) void loadThread(selectedId, true);
  }, [selectedId, loadThread]);

  React.useEffect(() => {
    const threadsInterval = setInterval(() => void refreshThreads(), THREADS_POLL_MS);
    return () => clearInterval(threadsInterval);
  }, [refreshThreads]);

  React.useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => void loadThread(selectedId, false), MESSAGES_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedId, loadThread]);

  React.useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const body = reply.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    sendingRef.current = true;
    try {
      const res = await sendBackofficeSupportReply({ threadId: selectedId, body });
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Invio non riuscito." });
        return;
      }
      setReply("");
      setMessages((prev) => [...prev, res.data]);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === selectedId
            ? { ...t, lastMessagePreview: body, lastMessageAt: res.data.createdAt }
            : t,
        ),
      );
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const groups: Array<{ day: string; messages: SupportMessageDto[] }> = [];
  for (const message of messages) {
    const day = dayLabel(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(message);
    else groups.push({ day, messages: [message] });
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Assistenza</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conversazioni del centro assistenza: rispondi e l&apos;autoscuola vede il messaggio
          nella chat della web app.
        </p>
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-border/60 bg-white px-6 py-16 text-center">
          <Inbox className="mb-3 h-7 w-7 text-gray-300" strokeWidth={1.5} />
          <div className="text-sm font-semibold text-foreground">Nessuna conversazione</div>
          <div className="mt-1 text-sm text-muted-foreground">
            I messaggi delle autoscuole compariranno qui.
          </div>
        </div>
      ) : (
        <div className="grid h-[calc(100svh-220px)] min-h-[420px] grid-cols-1 overflow-hidden rounded-xl border border-border/60 bg-white md:grid-cols-[320px_1fr]">
          {/* ── Lista thread ── */}
          <div className="min-h-0 overflow-y-auto border-b border-border/60 md:border-b-0 md:border-r">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelectedId(thread.id)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 border-b border-border/40 px-4 py-3.5 text-left transition-colors hover:bg-gray-50",
                  selectedId === thread.id && "bg-gray-100 hover:bg-gray-100",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
                  {thread.companyName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm text-foreground",
                        thread.unreadForAdmin > 0 ? "font-bold" : "font-semibold",
                      )}
                    >
                      {thread.companyName}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                      {threadDateLabel(thread.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-[13px]",
                        thread.unreadForAdmin > 0
                          ? "font-semibold text-foreground"
                          : "font-medium text-muted-foreground",
                      )}
                    >
                      {thread.lastMessagePreview ?? "—"}
                    </span>
                    {thread.unreadForAdmin > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#c13515] px-1.5 text-[11px] font-bold text-white">
                        {thread.unreadForAdmin > 9 ? "9+" : thread.unreadForAdmin}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Conversazione ── */}
          <div className="flex min-h-0 min-w-0 flex-col">
            {!selectedId ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <MessageCircle className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.5} />
                <div className="text-sm text-muted-foreground">
                  Seleziona una conversazione
                </div>
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b border-border/60 px-5 py-3">
                  <div className="text-sm font-semibold text-foreground">
                    {companyName || "…"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Rispondi come Team Reglo
                  </div>
                </div>
                <div
                  ref={messagesRef}
                  className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-gray-50/60 px-5 py-4"
                >
                  {threadLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                    </div>
                  ) : (
                    groups.map((group) => (
                      <React.Fragment key={group.day}>
                        <div className="mt-1 text-center">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {group.day}
                          </span>
                        </div>
                        {group.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex",
                              msg.sender === "reglo" ? "justify-end" : "justify-start",
                            )}
                          >
                            <div
                              className={cn(
                                "flex max-w-[560px] flex-col",
                                msg.sender === "reglo" && "items-end",
                              )}
                            >
                              <div className="mb-0.5 px-1 text-[11px] font-semibold text-muted-foreground">
                                {msg.sender === "reglo"
                                  ? (msg.senderName ?? "Team Reglo")
                                  : (msg.senderName ?? companyName)}
                                {" · "}
                                {timeLabel(msg.createdAt)}
                              </div>
                              <div
                                className={cn(
                                  "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm font-medium leading-relaxed",
                                  msg.sender === "reglo"
                                    ? "bg-navy-900 text-white"
                                    : "border border-border/60 bg-white text-foreground",
                                )}
                              >
                                {msg.body}
                              </div>
                            </div>
                          </div>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </div>
                <div className="shrink-0 border-t border-border/60 px-4 py-3">
                  <div className="flex items-center gap-2 rounded-full border border-border bg-white py-1 pl-4 pr-1 transition-colors focus-within:border-navy-900">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void send();
                      }}
                      placeholder={`Rispondi a ${companyName || "…"}`}
                      className="min-w-0 flex-1 border-none bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={!reply.trim() || sending}
                      aria-label="Invia"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-800 disabled:cursor-default disabled:opacity-40"
                    >
                      {sending ? (
                        <LoadingDots className="scale-[0.55]" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
