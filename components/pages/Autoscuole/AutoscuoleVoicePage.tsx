"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { PageHeader } from "@/components/ui/page-header";
import {
  getVoiceCallbackTasks,
  markVoiceCallbackTaskDone,
} from "@/lib/actions/autoscuole.actions";
import { getAutoscuolaSettings } from "@/lib/actions/autoscuole-settings.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { LoadingDots } from "@/components/ui/loading-dots";
import { VoiceInactiveState } from "./VoiceInactiveState";
import { cn } from "@/lib/utils";
import {
  Phone,
  RefreshCw,
  CheckCircle2,
  Info,
  Pause,
  Play,
  Settings,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type CallbackTask = {
  id: string;
  phoneNumber: string;
  reason: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  student: { id: string; name: string | null; email: string; phone: string | null } | null;
  call: {
    id: string;
    startedAt: string;
    durationSec: number | null;
    recordingUrl: string | null;
    transcriptText: string | null;
  } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** Coppie pastello per gli avatar (stile proto: sfondo tenue + iniziali scure). */
const AVATAR_STYLES = [
  { bg: "#dbeafe", fg: "#1e40af" },
  { bg: "#fce7f3", fg: "#9d174d" },
  { bg: "#dcfce7", fg: "#166534" },
  { bg: "#fef3c7", fg: "#92400e" },
  { bg: "#ede9fe", fg: "#5b21b6" },
  { bg: "#e0f2fe", fg: "#075985" },
];

const avatarStyle = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_STYLES[hash % AVATAR_STYLES.length];
};

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

function formatCallbackTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, now)) return `oggi ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `ieri ${time}`;
  return `${date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} ${time}`;
}

const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60))}`;

/** La trascrizione è accumulata come righe "[speaker] testo": rende i tag leggibili. */
const SPEAKER_LABELS: Record<string, string> = {
  caller: "Chiamante",
  user: "Chiamante",
  assistant: "Segretaria",
  agent: "Segretaria",
};

function formatTranscript(raw: string) {
  return raw
    .split("\n")
    .map((line) => {
      const match = line.match(/^\[([a-z_-]+)\]\s*(.*)$/i);
      if (!match) return line;
      const label = SPEAKER_LABELS[match[1].toLowerCase()] ?? match[1];
      return `${label}: ${match[2]}`;
    })
    .join("\n");
}

// ─── Typewriter sul saluto (una volta per sessione SPA, come il proto) ───────

let greetingTyped = false;

function useTypewriter(fullText: string) {
  const [text, setText] = React.useState(() => (greetingTyped ? fullText : ""));
  const [done, setDone] = React.useState(greetingTyped);

  React.useEffect(() => {
    if (greetingTyped || !fullText) {
      setText(fullText);
      setDone(true);
      return;
    }
    greetingTyped = true;
    let i = 0;
    let raf = 0;
    const step = () => {
      i += 2;
      setText(fullText.slice(0, i));
      if (i < fullText.length) raf = requestAnimationFrame(step);
      else setDone(true);
    };
    raf = requestAnimationFrame(step);
    // Rete di sicurezza: mai lasciare il testo a metà oltre i 5s.
    const safety = setTimeout(() => {
      cancelAnimationFrame(raf);
      setText(fullText);
      setDone(true);
    }, 5000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [fullText]);

  return { text, done };
}

// ─── Player registrazione (waveform stile proto pilotata da <audio> reale) ───

const WAVE_HEIGHTS = [
  8, 14, 20, 28, 22, 32, 26, 18, 30, 24, 14, 20, 34, 28, 22, 16, 26, 32, 20, 12,
  24, 30, 18, 26, 22, 14, 28, 20, 10, 24, 32, 18, 14, 22, 28, 16, 24, 12, 20, 14,
];

function RecordingPlayer({ url, durationSec }: { url: string; durationSec: number | null }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0); // 0..1
  const [remaining, setRemaining] = React.useState<number | null>(durationSec);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play().catch(() => setPlaying(false));
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    setProgress(audio.currentTime / audio.duration);
    setRemaining(Math.max(0, audio.duration - audio.currentTime));
  };

  const seekTo = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  };

  const litBars = Math.round(progress * WAVE_HEIGHTS.length);

  return (
    <div className="mb-6 flex items-center gap-3 rounded-[26px] bg-[#f4f4f6] py-2.5 pl-2.5 pr-4">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setRemaining(durationSec);
        }}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onTimeUpdate}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pausa" : "Riproduci"}
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-900 transition-colors hover:bg-navy-800"
      >
        {playing ? (
          <Pause className="size-4 text-white" fill="white" strokeWidth={0} />
        ) : (
          <Play className="ml-0.5 size-4 text-white" fill="white" strokeWidth={0} />
        )}
      </button>
      <div
        role="slider"
        aria-label="Posizione riproduzione"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        onClick={seekTo}
        className="flex h-9 flex-1 cursor-pointer items-center gap-0.5 overflow-hidden"
      >
        {WAVE_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="w-[3px] shrink-0 rounded-[2px] transition-colors"
            style={{ height: h, backgroundColor: i < litBars ? "#1a1a2e" : "#c7c7cc" }}
          />
        ))}
      </div>
      <div className="min-w-[34px] shrink-0 text-right text-xs font-semibold text-[#6a6a6a]">
        {remaining != null ? formatDuration(remaining) : "--:--"}
      </div>
    </div>
  );
}

// ─── Modal Info chiamata (proto openCallInfo) ────────────────────────────────

function CallInfoModal({ task, onClose }: { task: CallbackTask | null; onClose: () => void }) {
  React.useEffect(() => {
    if (!task) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  const sectionLabel = "mb-2.5 text-[11px] font-bold uppercase tracking-[0.6px] text-[#929292]";

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          key="call-info-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="relative max-h-[calc(100vh-64px)] w-[460px] max-w-[92vw] overflow-y-auto rounded-[20px] bg-white px-7 pb-[26px] pt-7 shadow-[0_16px_56px_rgba(0,0,0,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="absolute right-[18px] top-[18px] flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
            >
              <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
            </button>
            <div className="text-[19px] font-bold tracking-[-0.2px] text-foreground">
              {task.student?.name ?? task.phoneNumber}
            </div>
            <div className="mb-5 mt-0.5 text-[13px] font-medium text-[#929292]">
              Chiamata {formatCallbackTime(task.call?.startedAt ?? task.createdAt)}
            </div>

            {task.call?.recordingUrl && (
              <>
                <div className={sectionLabel}>Registrazione</div>
                <RecordingPlayer
                  url={task.call.recordingUrl}
                  durationSec={task.call.durationSec}
                />
              </>
            )}

            {task.call?.transcriptText?.trim() && (
              <>
                <div className={sectionLabel}>Trascrizione</div>
                <div className="whitespace-pre-line text-sm font-medium leading-[1.65] text-[#444444] [text-wrap:pretty]">
                  {formatTranscript(task.call.transcriptText.trim())}
                </div>
              </>
            )}

            {/* Motivo della richiamata, sempre disponibile */}
            <div className={cn(sectionLabel, task.call?.recordingUrl || task.call?.transcriptText?.trim() ? "mt-6" : undefined)}>
              Motivo della richiamata
            </div>
            <div className="text-sm font-medium leading-[1.65] text-[#444444]">{task.reason}</div>

            {!task.call?.recordingUrl && !task.call?.transcriptText?.trim() && (
              <div className="mt-4 rounded-xl bg-[#f8f8f8] px-4 py-3 text-[13px] font-medium leading-normal text-[#929292]">
                Nessuna registrazione o trascrizione disponibile per questa chiamata.
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CallbackRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-4 px-6 py-4",
            i < rows - 1 && "border-b border-[#f5f5f5]",
          )}
        >
          <Skeleton className="h-[42px] w-[42px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-2 h-4 w-40 max-w-full" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-[34px] w-[74px] rounded-[20px]" />
            <Skeleton className="h-[34px] w-[84px] rounded-[20px]" />
            <Skeleton className="h-[34px] w-[74px] rounded-[20px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function VoicePageSkeleton() {
  return (
    <>
      {/* Greeting preview */}
      <div className="rounded-2xl border border-[#dddddd] bg-white p-6">
        <Skeleton className="mb-4 h-3 w-48" />
        <Skeleton className="mb-2.5 h-4 w-full" />
        <Skeleton className="mb-2.5 h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <div className="mt-5 flex items-center justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>
      {/* Chiamate in sospeso */}
      <div className="overflow-hidden rounded-2xl border border-[#dddddd] bg-white">
        <div className="flex items-center justify-between border-b border-[#ebebeb] px-6 py-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-28 rounded-[20px]" />
        </div>
        <CallbackRowsSkeleton />
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AutoscuoleVoicePage() {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const [loading, setLoading] = React.useState(true);
  const [voiceFeatureEnabled, setVoiceFeatureEnabled] = React.useState(false);
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = React.useState(false);
  const [voiceCustomGreeting, setVoiceCustomGreeting] = React.useState("");

  const [callbackTasks, setCallbackTasks] = React.useState<CallbackTask[]>([]);
  const [callbacksLoaded, setCallbacksLoaded] = React.useState(false);
  const [loadingCallbacks, setLoadingCallbacks] = React.useState(false);
  const [markingDone, setMarkingDone] = React.useState<string | null>(null);
  const [infoTask, setInfoTask] = React.useState<CallbackTask | null>(null);

  // La pagina voice vive su /user/autoscuole/voice; le impostazioni della
  // segretaria sono il pane "voice" dell'overlay Impostazioni.
  const settingsUrl = `${pathname.replace(/\/voice\/?$/, "")}?tab=settings&pane=voice`;
  const openSettings = () => router.push(settingsUrl);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (res.success && res.data) {
        setVoiceFeatureEnabled(Boolean(res.data.voiceFeatureEnabled));
        setVoiceAssistantEnabled(Boolean(res.data.voiceAssistantEnabled));
        setVoiceCustomGreeting(res.data.voiceCustomGreeting ?? "");
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const loadCallbacks = React.useCallback(async () => {
    setLoadingCallbacks(true);
    const res = await getVoiceCallbackTasks("pending");
    if (res.success && res.data) {
      setCallbackTasks(res.data as CallbackTask[]);
    }
    setCallbacksLoaded(true);
    setLoadingCallbacks(false);
  }, []);

  React.useEffect(() => {
    loadCallbacks();
  }, [loadCallbacks]);

  const handleMarkDone = React.useCallback(async (taskId: string) => {
    setMarkingDone(taskId);
    const res = await markVoiceCallbackTaskDone(taskId);
    if (res.success) {
      setCallbackTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
    setMarkingDone(null);
  }, []);

  const greeting = voiceCustomGreeting.trim();
  const { text: typedGreeting } = useTypewriter(greeting);

  const pillClass =
    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[20px] px-4 py-[7px] text-[13px] font-semibold transition-colors";

  return (
    <PageWrapper title="Segretaria AI" subTitle="Assistente vocale AI inbound" hideHero>
      <div className="relative w-full" data-testid="autoscuole-voice-page">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* Header: rende subito, skeleton solo sotto */}
          <PageHeader
            title="Segretaria AI"
            actions={
              loading ? (
                <Skeleton className="h-10 w-[150px] rounded-3xl" />
              ) : voiceFeatureEnabled ? (
                <button
                  type="button"
                  onClick={openSettings}
                  className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-3xl border border-[#dddddd] bg-white px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-[#222222]"
                >
                  <Settings className="size-4" strokeWidth={1.8} />
                  Impostazioni
                </button>
              ) : undefined
            }
          />

          {loading ? (
            <VoicePageSkeleton />
          ) : !voiceFeatureEnabled ? (
            /* ── Feature NOT enabled: pitch + richiesta attivazione ── */
            <FadeIn>
              <VoiceInactiveState />
            </FadeIn>
          ) : (
            /* ── Feature enabled ── */
            <FadeIn className="space-y-5">
              {/* Linea spenta: rimando alle impostazioni */}
              {!voiceAssistantEnabled && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dddddd] bg-[#f8f8f8] px-6 py-4">
                  <div className="text-sm font-medium text-[#444444]">
                    La linea è spenta: la segretaria non sta rispondendo alle chiamate.
                  </div>
                  <button
                    type="button"
                    onClick={openSettings}
                    className="cursor-pointer whitespace-nowrap rounded-[20px] bg-navy-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-navy-800"
                  >
                    Attiva linea
                  </button>
                </div>
              )}

              {/* Greeting preview */}
              <div className="rounded-2xl border border-[#dddddd] bg-white p-6">
                <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.8px] text-[#929292]">
                  Letto all&apos;inizio di ogni chiamata
                </div>
                {greeting ? (
                  <>
                    <div className="min-h-[27px] text-[15px] italic leading-[1.75] text-[#444444]">
                      &ldquo;{typedGreeting}&rdquo;
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs font-medium text-[#929292]">
                        {greeting.length}/500 caratteri
                      </div>
                      <button
                        type="button"
                        onClick={openSettings}
                        className="cursor-pointer text-sm font-semibold text-foreground underline decoration-1 underline-offset-2 hover:text-navy-900"
                      >
                        Modifica
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[15px] italic leading-[1.75] text-[#929292]">
                      Nessun messaggio personalizzato: la segretaria si presenta con il saluto standard.
                    </div>
                    <div className="mt-4 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={openSettings}
                        className="cursor-pointer text-sm font-semibold text-foreground underline decoration-1 underline-offset-2 hover:text-navy-900"
                      >
                        Personalizza
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Chiamate in sospeso */}
              <div className="overflow-hidden rounded-2xl border border-[#dddddd] bg-white">
                <div className="flex items-center justify-between border-b border-[#ebebeb] px-6 py-5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base font-bold text-foreground">Chiamate in sospeso</span>
                    {callbackTasks.length > 0 && (
                      <span className="rounded-[20px] bg-navy-900 px-2 py-0.5 text-[11px] font-bold text-white">
                        {callbackTasks.length}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={loadCallbacks}
                    disabled={loadingCallbacks}
                    className="flex cursor-pointer items-center gap-2 rounded-[20px] border border-[#ebebeb] bg-[#f7f7f7] px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-[#f0f0f0] disabled:opacity-60"
                  >
                    {loadingCallbacks ? (
                      <LoadingDots className="min-h-[1.5em] scale-[0.8]" />
                    ) : (
                      <>
                        <RefreshCw className="size-3.5" strokeWidth={1.6} />
                        Aggiorna
                      </>
                    )}
                  </button>
                </div>
                {!callbacksLoaded ? (
                  <CallbackRowsSkeleton />
                ) : callbackTasks.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <Phone className="mx-auto mb-2 size-6 text-[#c1c1c1]" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-[#929292]">Nessuna chiamata in sospeso</p>
                  </div>
                ) : (
                  <div>
                    {callbackTasks.map((task, index) => {
                      const displayName = task.student?.name ?? task.phoneNumber;
                      const avatar = avatarStyle(task.student?.id ?? task.phoneNumber);
                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[#fafafa]",
                            index < callbackTasks.length - 1 && "border-b border-[#f5f5f5]",
                          )}
                        >
                          <div
                            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: avatar.bg }}
                          >
                            <span className="text-sm font-bold" style={{ color: avatar.fg }}>
                              {initialsFromName(displayName)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">{displayName}</span>
                              <span className="text-xs font-medium text-[#929292]">
                                &bull; {formatCallbackTime(task.createdAt)}
                              </span>
                              {task.student?.name ? (
                                <span className="hidden text-xs font-medium text-[#929292] sm:inline">
                                  {task.phoneNumber}
                                </span>
                              ) : null}
                            </div>
                            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-[#6a6a6a]">
                              {task.reason}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setInfoTask(task)}
                              className={cn(
                                pillClass,
                                "border border-[#dddddd] bg-white text-foreground hover:bg-[#f2f2f2]",
                              )}
                            >
                              <Info className="size-[13px]" strokeWidth={1.8} />
                              Info
                            </button>
                            <a
                              href={`tel:${task.phoneNumber.replace(/\s/g, "")}`}
                              className={cn(pillClass, "bg-navy-900 text-white hover:bg-navy-800")}
                            >
                              Chiama
                            </a>
                            <button
                              type="button"
                              onClick={() => handleMarkDone(task.id)}
                              disabled={markingDone === task.id}
                              className={cn(
                                pillClass,
                                "border border-[#ebebeb] bg-[#f7f7f7] text-foreground hover:bg-[#ececec] disabled:opacity-60",
                              )}
                            >
                              {markingDone === task.id ? (
                                <LoadingDots className="min-h-[1.5em] scale-[0.7]" />
                              ) : (
                                <>
                                  <CheckCircle2 className="size-3 text-[#1a7f50]" />
                                  Fatto
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </FadeIn>
          )}
        </div>

        {/* ── Modal Info chiamata ── */}
        <CallInfoModal task={infoTask} onClose={() => setInfoTask(null)} />
      </div>
    </PageWrapper>
  );
}
