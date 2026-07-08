"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPanel } from "@/components/ui/detail-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getVoiceCallbackTasks,
  markVoiceCallbackTaskDone,
} from "@/lib/actions/autoscuole.actions";
import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { VoiceSkeleton } from "@/components/ui/page-skeleton";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { cn } from "@/lib/utils";
import {
  PhoneCall,
  Phone,
  RefreshCw,
  CheckCircle2,
  Loader2,
  ChevronDown,
  HelpCircle,
  Settings,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ─── Types ───────────────────────────────────────────────────────────────────

type VoiceProvisioningStatus = "not_started" | "provisioning" | "ready" | "error";
type VoiceAllowedAction = "faq" | "lesson_info" | "booking";

/** Sotto-insieme voice dei settings, comune a get e update. */
type VoiceSettingsData = {
  voiceAssistantEnabled?: boolean | null;
  voiceBookingEnabled?: boolean | null;
  voiceLegalGreetingEnabled?: boolean | null;
  voiceRecordingEnabled?: boolean | null;
  voiceTranscriptionEnabled?: boolean | null;
  voiceHandoffPhone?: string | null;
  voiceHandoffDuringCallEnabled?: boolean | null;
  voiceHandoffDuringCallInstructions?: string | null;
  voiceOfficeHours?: { daysOfWeek: number[]; startMinutes: number; endMinutes: number } | null;
  voiceInstructions?: string | null;
  voiceAssistantVoice?: string | null;
  voiceCustomGreeting?: string | null;
  voiceAllowedActions?: string[] | null;
};

type CallbackTask = {
  id: string;
  phoneNumber: string;
  reason: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  student: { id: string; name: string | null; email: string; phone: string | null } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
] as const;

const VOICE_ALLOWED_ACTION_OPTIONS = [
  { value: "faq" as const, label: "FAQ autoscuola", description: "Risponde a domande frequenti" },
  { value: "lesson_info" as const, label: "Info lezioni", description: "Dettagli su corsi e lezioni" },
  { value: "booking" as const, label: "Prenota guida", description: "Prenotazione diretta sull'agenda" },
];

const START_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);
const END_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);

const AVATAR_COLORS = ["#222222", "#3f3f3f", "#6a6a6a", "#460479", "#428bff", "#1a7f50", "#c13515", "#b45309"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const formatMinutes = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad(h)}:${pad(m)}`;
};

const normalizeDays = (days: number[]) =>
  Array.from(new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort(
    (a, b) => a - b,
  );

/** "Lun – Ven", "Lun – Mer, Sab", "Tutti i giorni" (ordine Lun→Dom). */
function formatDaysSummary(days: number[]) {
  const order = WEEKDAY_OPTIONS.map((d) => d.value);
  const active = order.filter((v) => days.includes(v));
  if (!active.length) return "Nessun giorno";
  if (active.length === 7) return "Tutti i giorni";
  const labelOf = (v: number) => WEEKDAY_OPTIONS.find((d) => d.value === v)?.label ?? "";
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= active.length; i++) {
    const contiguous =
      i < active.length && order.indexOf(active[i]) === order.indexOf(active[i - 1]) + 1;
    if (!contiguous) {
      const from = active[start];
      const to = active[i - 1];
      runs.push(from === to ? labelOf(from) : `${labelOf(from)} – ${labelOf(to)}`);
      start = i;
    }
  }
  return runs.join(", ");
}

const avatarColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
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

// ─── Small primitives (stile proto) ──────────────────────────────────────────

const sectionLabelClass =
  "text-[11px] font-bold uppercase tracking-[0.6px] text-[#929292]";

const inputClass =
  "w-full rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none transition focus:border-[#222222]";

const textareaClass =
  "w-full resize-y rounded-[12px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-3 text-sm font-medium leading-relaxed text-foreground outline-none transition focus:border-[#222222]";

function ProvisioningBadge({ status }: { status: VoiceProvisioningStatus }) {
  const config = {
    not_started: { className: "bg-[#f2f2f2] text-[#6a6a6a]", label: "Non configurata" },
    provisioning: { className: "bg-[#fef3c7] text-[#b45309]", label: "In configurazione" },
    ready: { className: "bg-[#dcfce7] text-[#16a34a]", label: "Operativa" },
    error: { className: "bg-[#fee2e2] text-[#dc2626]", label: "Errore" },
  }[status];

  return (
    <span className={cn("rounded-[20px] px-3 py-1 text-xs font-semibold", config.className)}>
      {config.label}
    </span>
  );
}

/** Riga con toggle: attiva → sfondo #eeeef4 come il proto. */
function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      onClick={() => !disabled && onCheckedChange(!checked)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!disabled) onCheckedChange(!checked); } }}
      className={cn(
        "flex w-full cursor-pointer items-start justify-between gap-4 rounded-[12px] px-4 py-3.5 text-left transition-colors",
        checked ? "bg-[#eeeef4]" : "bg-transparent hover:bg-[#fafafa]",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {description ? (
          <div className="mt-0.5 text-xs font-medium leading-normal text-[#929292]">{description}</div>
        ) : null}
      </div>
      <div className="mt-0.5 shrink-0">
        <InlineToggle checked={checked} size="lg" />
      </div>
    </div>
  );
}

/** Accordion del pannello impostazioni (stile proto: hairline, chevron). */
function SegAccordion({
  title,
  description,
  expanded,
  onToggle,
  isLast,
  children,
}: {
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!isLast && "border-b border-[#ebebeb]")}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-6 py-5 transition-colors hover:bg-[#fafafa]"
      >
        <div>
          <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[13px] font-medium text-[#929292]">{description}</p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[#929292] transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="px-6 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AutoscuoleVoicePage() {
  const toast = useFeedbackToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [segAccordion, setSegAccordion] = React.useState<string | null>("behavior");
  const [togglingAssistant, setTogglingAssistant] = React.useState(false);

  // Voice state
  const [voiceFeatureEnabled, setVoiceFeatureEnabled] = React.useState(false);
  const [voiceProvisioningStatus, setVoiceProvisioningStatus] =
    React.useState<VoiceProvisioningStatus>("not_started");
  const [voiceLineRef, setVoiceLineRef] = React.useState<string | null>(null);
  const [voiceDisplayNumber, setVoiceDisplayNumber] = React.useState<string | null>(null);
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = React.useState(false);
  const [voiceBookingEnabled, setVoiceBookingEnabled] = React.useState(false);
  const [voiceLegalGreetingEnabled, setVoiceLegalGreetingEnabled] = React.useState(true);
  const [voiceRecordingEnabled, setVoiceRecordingEnabled] = React.useState(true);
  const [voiceTranscriptionEnabled, setVoiceTranscriptionEnabled] = React.useState(true);
  const [voiceHandoffPhone, setVoiceHandoffPhone] = React.useState<string | null>(null);
  const [voiceHandoffDuringCallEnabled, setVoiceHandoffDuringCallEnabled] = React.useState(false);
  const [voiceHandoffDuringCallInstructions, setVoiceHandoffDuringCallInstructions] = React.useState("");
  const [voiceOfficeDays, setVoiceOfficeDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [voiceOfficeStartMinutes, setVoiceOfficeStartMinutes] = React.useState(9 * 60);
  const [voiceOfficeEndMinutes, setVoiceOfficeEndMinutes] = React.useState(19 * 60);
  const [voiceAllowedActions, setVoiceAllowedActions] = React.useState<VoiceAllowedAction[]>([
    "faq",
    "lesson_info",
  ]);
  const [voiceInstructions, setVoiceInstructions] = React.useState("");
  const [voiceAssistantVoice, setVoiceAssistantVoice] = React.useState("Minimax.speech-2.8-turbo.Wandering_Sorcerer");
  const [voiceCustomGreetingEnabled, setVoiceCustomGreetingEnabled] = React.useState(false);
  const [voiceCustomGreeting, setVoiceCustomGreeting] = React.useState("");

  // Callbacks state
  const [callbackTasks, setCallbackTasks] = React.useState<CallbackTask[]>([]);
  const [loadingCallbacks, setLoadingCallbacks] = React.useState(false);
  const [markingDone, setMarkingDone] = React.useState<string | null>(null);

  const applySettings = React.useCallback((d: VoiceSettingsData | null | undefined) => {
    if (!d) return;
    setVoiceAssistantEnabled(Boolean(d.voiceAssistantEnabled));
    setVoiceBookingEnabled(Boolean(d.voiceBookingEnabled));
    setVoiceLegalGreetingEnabled(d.voiceLegalGreetingEnabled !== false);
    setVoiceRecordingEnabled(d.voiceRecordingEnabled !== false);
    setVoiceTranscriptionEnabled(d.voiceTranscriptionEnabled !== false);
    setVoiceHandoffPhone(d.voiceHandoffPhone ?? null);
    setVoiceHandoffDuringCallEnabled(d.voiceHandoffDuringCallEnabled ?? false);
    setVoiceHandoffDuringCallInstructions(d.voiceHandoffDuringCallInstructions ?? "");
    setVoiceOfficeDays(normalizeDays(Array.from(d.voiceOfficeHours?.daysOfWeek ?? [1, 2, 3, 4, 5])));
    setVoiceOfficeStartMinutes(d.voiceOfficeHours?.startMinutes ?? 9 * 60);
    setVoiceOfficeEndMinutes(d.voiceOfficeHours?.endMinutes ?? 19 * 60);
    setVoiceInstructions(d.voiceInstructions ?? "");
    setVoiceAssistantVoice(d.voiceAssistantVoice || "Minimax.speech-2.8-turbo.Wandering_Sorcerer");
    setVoiceCustomGreeting(d.voiceCustomGreeting ?? "");
    setVoiceCustomGreetingEnabled(Boolean(d.voiceCustomGreeting));
    const VALID_ACTIONS: VoiceAllowedAction[] = ["faq", "lesson_info", "booking"];
    const loaded = (d.voiceAllowedActions ?? []).filter((a): a is VoiceAllowedAction =>
      VALID_ACTIONS.includes(a as VoiceAllowedAction),
    );
    setVoiceAllowedActions(loaded.length ? loaded : ["faq", "lesson_info"]);
  }, []);

  // Load settings on mount
  React.useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (!res.success || !res.data) {
        setLoading(false);
        return;
      }
      const d = res.data;
      setVoiceFeatureEnabled(Boolean(d.voiceFeatureEnabled));
      setVoiceProvisioningStatus(
        (d.voiceProvisioningStatus as VoiceProvisioningStatus) ?? "not_started",
      );
      setVoiceLineRef(d.voiceLineRef ?? null);
      setVoiceDisplayNumber(d.voiceDisplayNumber ?? null);
      applySettings(d);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [applySettings]);

  const loadCallbacks = React.useCallback(async () => {
    setLoadingCallbacks(true);
    const res = await getVoiceCallbackTasks("pending");
    if (res.success && res.data) {
      setCallbackTasks(res.data as CallbackTask[]);
    }
    setLoadingCallbacks(false);
  }, []);

  const handleMarkDone = React.useCallback(async (taskId: string) => {
    setMarkingDone(taskId);
    const res = await markVoiceCallbackTaskDone(taskId);
    if (res.success) {
      setCallbackTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
    setMarkingDone(null);
  }, []);

  React.useEffect(() => {
    loadCallbacks();
  }, [loadCallbacks]);

  const toggleAction = (action: VoiceAllowedAction) => {
    setVoiceAllowedActions((current) =>
      current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action],
    );
  };

  const validateForEnable = React.useCallback(() => {
    if (voiceProvisioningStatus !== "ready" || !voiceLineRef) {
      toast.error({
        description: "Linea voce non pronta. Contatta il backoffice Reglo per completare il provisioning.",
      });
      return false;
    }
    if (!voiceHandoffPhone?.trim()) {
      toast.error({ description: "Inserisci il numero di handoff per il trasferimento chiamata." });
      return false;
    }
    if (!voiceOfficeDays.length || voiceOfficeEndMinutes <= voiceOfficeStartMinutes) {
      toast.error({ description: "Orari segreteria voce non validi." });
      return false;
    }
    if (!voiceAllowedActions.length) {
      toast.error({ description: "Seleziona almeno un'azione consentita." });
      return false;
    }
    if (voiceBookingEnabled && !voiceAllowedActions.includes("booking")) {
      toast.error({ description: "Per le prenotazioni voce devi abilitare l'azione 'Prenota guida'." });
      return false;
    }
    return true;
  }, [voiceProvisioningStatus, voiceLineRef, voiceHandoffPhone, voiceOfficeDays, voiceOfficeEndMinutes, voiceOfficeStartMinutes, voiceAllowedActions, voiceBookingEnabled, toast]);

  /** Toggle nella status bar: salva subito (solo il flag). */
  const handleToggleAssistant = async () => {
    const next = !voiceAssistantEnabled;
    if (next && !validateForEnable()) return;
    setTogglingAssistant(true);
    const res = await updateAutoscuolaSettings({ voiceAssistantEnabled: next });
    setTogglingAssistant(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile aggiornare l'assistente vocale." });
      return;
    }
    setVoiceAssistantEnabled(Boolean(res.data.voiceAssistantEnabled));
    toast.success({
      description: next ? "Assistente vocale attivato." : "Assistente vocale disattivato.",
    });
  };

  const handleSave = async () => {
    if (voiceFeatureEnabled && voiceAssistantEnabled && !validateForEnable()) return;

    setSaving(true);
    const res = await updateAutoscuolaSettings({
      voiceAssistantEnabled,
      voiceBookingEnabled,
      voiceLanguage: "it-IT",
      voiceLegalGreetingEnabled,
      voiceOfficeHours: {
        daysOfWeek: normalizeDays(voiceOfficeDays),
        startMinutes: voiceOfficeStartMinutes,
        endMinutes: voiceOfficeEndMinutes,
      },
      voiceHandoffPhone: voiceHandoffPhone?.trim() || null,
      voiceHandoffDuringCallEnabled,
      voiceHandoffDuringCallInstructions,
      voiceFallbackMode: "transfer_or_callback",
      voiceRecordingEnabled,
      voiceTranscriptionEnabled,
      voiceRetentionDays: 90,
      voiceInstructions,
      voiceAllowedActions,
      voiceAssistantVoice,
      voiceCustomGreeting: voiceCustomGreetingEnabled ? voiceCustomGreeting.trim() || null : null,
    });
    setSaving(false);

    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare le impostazioni." });
      return;
    }

    applySettings(res.data);
    setSettingsOpen(false);
    toast.success({ description: "Impostazioni segretaria salvate." });
  };

  const isReady = voiceProvisioningStatus === "ready";
  const toggleSegAccordion = (key: string) =>
    setSegAccordion((prev) => (prev === key ? null : key));

  const openSettings = (accordion?: string) => {
    if (accordion) setSegAccordion(accordion);
    setSettingsOpen(true);
  };

  const activeActionLabels = VOICE_ALLOWED_ACTION_OPTIONS
    .filter((o) => voiceAllowedActions.includes(o.value))
    .map((o) => o.label);

  return (
    <PageWrapper title="Segretaria AI" subTitle="Assistente vocale AI inbound" hideHero>
      <div className="relative w-full" data-testid="autoscuole-voice-page">
        <div className="mx-auto max-w-7xl space-y-5">
          {loading ? (
            <VoiceSkeleton />
          ) : !voiceFeatureEnabled ? (
            /* ── Feature NOT enabled: empty state ── */
            <>
              <PageHeader title="Segretaria AI" subtitle="Assistente vocale AI inbound" />
              <div className="rounded-2xl border border-[#dddddd] bg-white p-10">
                <div className="mx-auto flex max-w-md flex-col items-center text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eef0f6]">
                    <PhoneCall className="h-7 w-7 text-navy-900" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-foreground">Segretaria AI non attiva</h3>
                  <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#6a6a6a]">
                    L&apos;assistente vocale AI risponde alle chiamate, informa gli allievi e gestisce prenotazioni guide.
                    Contatta il team Reglo per attivarla sulla tua autoscuola.
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* ── Feature enabled ── */
            <>
              <PageHeader
                title="Segretaria AI"
                subtitle="Assistente vocale AI inbound"
                actions={
                  <button
                    type="button"
                    onClick={() => openSettings()}
                    className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-3xl border border-[#dddddd] bg-white px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-[#222222]"
                  >
                    <Settings className="size-4" strokeWidth={1.8} />
                    Impostazioni
                  </button>
                }
              />

              {/* Status bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dddddd] bg-white px-6 py-[18px]">
                <div className="flex flex-wrap items-center gap-3.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        isReady ? "bg-[#22c55e]" : "animate-pulse bg-[#f59e0b]",
                      )}
                    />
                    <span className="text-[15px] font-bold text-foreground">
                      {isReady ? "Linea attiva" : "Linea in configurazione"}
                    </span>
                  </div>
                  {voiceDisplayNumber && (
                    <span className="text-[15px] font-medium text-[#6a6a6a]">{voiceDisplayNumber}</span>
                  )}
                  <ProvisioningBadge status={voiceProvisioningStatus} />
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="text-[13px] font-medium text-[#6a6a6a]">Assistente vocale</span>
                  {togglingAssistant ? (
                    <Loader2 className="size-5 animate-spin text-[#929292]" />
                  ) : (
                    <InlineToggle checked={voiceAssistantEnabled} size="lg" onChange={handleToggleAssistant} />
                  )}
                </div>
              </div>

              {!isReady && (
                <div className="rounded-[10px] border border-[#f0e060] bg-[#fffce0] px-4 py-3">
                  <p className="text-xs font-medium text-[#7a6a00]">
                    Linea non ancora pronta. Contatta il backoffice Reglo per completare il provisioning.
                  </p>
                </div>
              )}

              {/* Help link */}
              {isReady && voiceDisplayNumber && (
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-1.5 pl-0.5 text-[13px] font-medium text-navy-900 transition-colors hover:underline"
                    >
                      <HelpCircle className="size-3.5" strokeWidth={1.8} />
                      Come collegare il numero della segretaria al tuo telefono
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Collega il numero della segretaria</DialogTitle>
                    </DialogHeader>
                    <VoiceSetupGuide phoneNumber={voiceDisplayNumber} />
                  </DialogContent>
                </Dialog>
              )}

              {/* Two-column: greeting preview + quick info */}
              <div className="grid items-start gap-5 lg:grid-cols-[1fr_288px]">
                {/* Greeting preview */}
                <div className="rounded-2xl border border-[#dddddd] bg-white p-6">
                  <div className={cn(sectionLabelClass, "mb-3.5 tracking-[0.8px]")}>
                    Letto all&apos;inizio di ogni chiamata
                  </div>
                  {voiceCustomGreetingEnabled && voiceCustomGreeting.trim() ? (
                    <>
                      <div className="text-[15px] italic leading-[1.75] text-[#444444]">
                        &ldquo;{voiceCustomGreeting.trim()}&rdquo;
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-xs font-medium text-[#929292]">
                          {voiceCustomGreeting.length}/500 caratteri
                        </div>
                        <button
                          type="button"
                          onClick={() => openSettings("behavior")}
                          className="cursor-pointer text-xs font-semibold text-navy-900 hover:underline"
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
                          onClick={() => openSettings("behavior")}
                          className="cursor-pointer text-xs font-semibold text-navy-900 hover:underline"
                        >
                          Personalizza
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Quick info card */}
                <div className="flex flex-col gap-[18px] rounded-2xl border border-[#dddddd] bg-white p-[22px]">
                  <div>
                    <div className={cn(sectionLabelClass, "mb-2 tracking-[0.8px]")}>Orario attivo</div>
                    <div className="text-sm font-bold text-foreground">
                      {formatDaysSummary(voiceOfficeDays)}
                    </div>
                    <div className="mt-0.5 text-[13px] font-medium text-[#6a6a6a]">
                      {formatMinutes(voiceOfficeStartMinutes)} &rarr; {formatMinutes(voiceOfficeEndMinutes)}
                    </div>
                  </div>
                  <div className="border-t border-[#f0f0f0] pt-4">
                    <div className={cn(sectionLabelClass, "mb-2 tracking-[0.8px]")}>Handoff</div>
                    <div className="text-[13px] font-semibold text-foreground">
                      {voiceHandoffPhone?.trim() || "—"}
                    </div>
                  </div>
                  <div className="border-t border-[#f0f0f0] pt-4">
                    <div className={cn(sectionLabelClass, "mb-2 tracking-[0.8px]")}>Azioni attive</div>
                    {activeActionLabels.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {activeActionLabels.map((label) => (
                          <span
                            key={label}
                            className="rounded-[20px] bg-[#eeeef4] px-2.5 py-1 text-xs font-semibold text-navy-900"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[13px] font-medium text-[#929292]">Nessuna azione attiva</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Richiamate in sospeso */}
              <div className="overflow-hidden rounded-2xl border border-[#dddddd] bg-white">
                <div className="flex items-center justify-between border-b border-[#ebebeb] px-6 py-5">
                  <div className="flex items-center gap-2.5">
                    <Phone className="size-[18px] text-foreground" strokeWidth={1.6} />
                    <span className="text-base font-bold text-foreground">Richiamate in sospeso</span>
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
                    <RefreshCw className={cn("size-3.5", loadingCallbacks && "animate-spin")} strokeWidth={1.6} />
                    Aggiorna
                  </button>
                </div>
                {callbackTasks.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <Phone className="mx-auto mb-2 size-6 text-[#c1c1c1]" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-[#929292]">
                      {loadingCallbacks ? "Caricamento..." : "Nessuna richiamata in sospeso"}
                    </p>
                  </div>
                ) : (
                  <div>
                    {callbackTasks.map((task, index) => {
                      const displayName = task.student?.name ?? task.phoneNumber;
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
                            style={{ backgroundColor: avatarColor(task.student?.id ?? task.phoneNumber) }}
                          >
                            <span className="text-sm font-bold text-white">{initialsFromName(displayName)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">{displayName}</span>
                              <span className="text-xs font-medium text-[#929292]">
                                • {formatCallbackTime(task.createdAt)}
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
                              onClick={() => handleMarkDone(task.id)}
                              disabled={markingDone === task.id}
                              className="flex cursor-pointer items-center gap-1.5 rounded-[20px] border border-[#ebebeb] bg-[#f7f7f7] px-4 py-[7px] text-[13px] font-semibold text-foreground transition-colors hover:bg-[#f0f0f0] disabled:opacity-60"
                            >
                              {markingDone === task.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="size-3 text-[#1a7f50]" />
                              )}
                              Fatto
                            </button>
                            <a
                              href={`tel:${task.phoneNumber.replace(/\s/g, "")}`}
                              className="cursor-pointer rounded-[20px] bg-[#222222] px-4 py-[7px] text-[13px] font-semibold text-white transition-colors hover:bg-[#3a3a3a]"
                            >
                              Chiama
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Pannello Impostazioni segretaria ── */}
        <DetailPanel
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          testId="voice-settings-panel"
          className="flex w-[min(520px,92vw)] flex-col overflow-hidden p-0"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[#dddddd] bg-white px-6 py-5">
            <span className="text-[17px] font-bold tracking-[-0.2px] text-foreground">
              Impostazioni segretaria
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Chiudi"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
            >
              <X className="size-3.5 text-[#6a6a6a]" strokeWidth={1.8} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Accordion 1: Comportamento e azioni */}
            <SegAccordion
              title="Comportamento e azioni"
              description="Azioni consentite, prenotazioni voce e greeting"
              expanded={segAccordion === "behavior"}
              onToggle={() => toggleSegAccordion("behavior")}
            >
              <div className={cn(sectionLabelClass, "mb-2.5")}>Azioni consentite</div>
              <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {VOICE_ALLOWED_ACTION_OPTIONS.map((option) => {
                  const active = voiceAllowedActions.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleAction(option.value)}
                      className={cn(
                        "cursor-pointer rounded-[12px] border-[1.5px] px-3.5 py-3 text-left transition-all",
                        active
                          ? "border-navy-900 bg-[#eeeef4]"
                          : "border-[#dddddd] bg-white hover:border-[#c1c1c1]",
                      )}
                    >
                      <div className={cn("mb-0.5 text-[13px] font-bold", active ? "text-navy-900" : "text-foreground")}>
                        {option.label}
                      </div>
                      <div className="text-[11px] font-medium text-[#929292]">{option.description}</div>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                <ToggleRow
                  label="Prenotazioni voce"
                  description="L'assistente può prenotare guide sull'agenda"
                  checked={voiceBookingEnabled}
                  onCheckedChange={setVoiceBookingEnabled}
                />
                <ToggleRow
                  label="Greeting legale"
                  description="Avvisa il chiamante che la chiamata è gestita da un AI"
                  checked={voiceLegalGreetingEnabled}
                  onCheckedChange={setVoiceLegalGreetingEnabled}
                />
                <ToggleRow
                  label="Greeting personalizzato"
                  description="Messaggio iniziale personalizzato prima della conversazione"
                  checked={voiceCustomGreetingEnabled}
                  onCheckedChange={(checked) => {
                    setVoiceCustomGreetingEnabled(checked);
                    if (!checked) setVoiceCustomGreeting("");
                  }}
                />
              </div>
              {voiceCustomGreetingEnabled && (
                <div className="mt-3 px-0.5">
                  <div className="mb-2 text-[13px] font-semibold text-foreground">Testo del greeting</div>
                  <textarea
                    value={voiceCustomGreeting}
                    onChange={(e) => setVoiceCustomGreeting(e.target.value)}
                    maxLength={500}
                    rows={4}
                    className={cn(textareaClass, "min-h-[120px]")}
                    placeholder="Es: Benvenuto all'autoscuola Rossi. Sono la segretaria virtuale, come posso aiutarti?"
                  />
                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    <div className="shrink-0 text-xs font-medium text-[#929292]">
                      {voiceCustomGreeting.length}/500 caratteri
                    </div>
                    <div className="text-right text-[11px] font-medium leading-normal text-[#b2b2b2]">
                      La segretaria leggerà questo messaggio all&apos;inizio di ogni chiamata, dopo il greeting legale (se attivo).
                    </div>
                  </div>
                </div>
              )}
            </SegAccordion>

            {/* Accordion 2: Orari e registrazione */}
            <SegAccordion
              title="Orari e registrazione"
              description="Orari segreteria, registrazione e trascrizione chiamate"
              expanded={segAccordion === "hours"}
              onToggle={() => toggleSegAccordion("hours")}
            >
              <div className={cn(sectionLabelClass, "mb-2.5")}>Giorni attivi</div>
              <div className="mb-5 flex flex-wrap gap-1.5">
                {WEEKDAY_OPTIONS.map((day) => {
                  const active = voiceOfficeDays.includes(day.value);
                  return (
                    <button
                      key={`voice-day-${day.value}`}
                      type="button"
                      onClick={() =>
                        setVoiceOfficeDays((current) =>
                          current.includes(day.value)
                            ? current.filter((d) => d !== day.value)
                            : normalizeDays([...current, day.value]),
                        )
                      }
                      className={cn(
                        "cursor-pointer rounded-[20px] border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition-all",
                        active
                          ? "border-[#222222] bg-[#222222] text-white"
                          : "border-[#dddddd] bg-white text-foreground hover:border-[#c1c1c1]",
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <div className="mb-5 grid grid-cols-2 gap-3">
                <div>
                  <div className={cn(sectionLabelClass, "mb-2")}>Inizio</div>
                  <Select
                    value={String(voiceOfficeStartMinutes)}
                    onValueChange={(v) => setVoiceOfficeStartMinutes(Number(v))}
                  >
                    <SelectTrigger className="h-10 w-full rounded-[10px] border-[1.5px] border-[#dddddd] text-sm font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {START_TIME_OPTIONS.map((m) => (
                        <SelectItem key={`vs-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className={cn(sectionLabelClass, "mb-2")}>Fine</div>
                  <Select
                    value={String(voiceOfficeEndMinutes)}
                    onValueChange={(v) => setVoiceOfficeEndMinutes(Number(v))}
                  >
                    <SelectTrigger className="h-10 w-full rounded-[10px] border-[1.5px] border-[#dddddd] text-sm font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {END_TIME_OPTIONS.map((m) => (
                        <SelectItem key={`ve-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mb-5">
                <div className={cn(sectionLabelClass, "mb-2")}>Numero handoff</div>
                <input
                  type="tel"
                  value={voiceHandoffPhone ?? ""}
                  onChange={(e) => setVoiceHandoffPhone(e.target.value || null)}
                  className={inputClass}
                  placeholder="+39..."
                />
                <div className="mt-1.5 text-xs font-medium text-[#929292]">
                  Numero a cui trasferire la chiamata fuori orario
                </div>
              </div>
              <ToggleRow
                label="Trasferimento durante chiamata"
                description="Consenti alla segretaria AI di trasferire la chiamata al numero handoff in base a regole personalizzate"
                checked={voiceHandoffDuringCallEnabled}
                onCheckedChange={setVoiceHandoffDuringCallEnabled}
              />
              {voiceHandoffDuringCallEnabled && (
                <div className="mt-3 px-0.5">
                  <div className="mb-2 text-[13px] font-semibold text-foreground">Regole di trasferimento</div>
                  <textarea
                    value={voiceHandoffDuringCallInstructions}
                    onChange={(e) => setVoiceHandoffDuringCallInstructions(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className={cn(textareaClass, "min-h-[80px]")}
                    placeholder="Es: Se il chiamante chiede insistentemente di parlare con una persona, trasferisci la chiamata."
                  />
                  <div className="mt-1.5 text-[11px] font-medium leading-normal text-[#b2b2b2]">
                    Es: &laquo;Se chiedono insistentemente i prezzi&raquo; oppure &laquo;Se vogliono parlare con una persona fisica&raquo;
                  </div>
                </div>
              )}
              <div className="mt-2 space-y-2">
                <ToggleRow
                  label="Registra audio"
                  description="Salva una registrazione audio della chiamata"
                  checked={voiceRecordingEnabled}
                  onCheckedChange={setVoiceRecordingEnabled}
                />
                <ToggleRow
                  label="Trascrivi chiamate"
                  description="Genera trascrizione testuale della conversazione"
                  checked={voiceTranscriptionEnabled}
                  onCheckedChange={setVoiceTranscriptionEnabled}
                />
              </div>
            </SegAccordion>

            {/* Accordion 3: Istruzioni personalizzate */}
            <SegAccordion
              title="Istruzioni personalizzate"
              description="Policy, tono comunicativo e regole operative"
              expanded={segAccordion === "instructions"}
              onToggle={() => toggleSegAccordion("instructions")}
              isLast
            >
              <textarea
                value={voiceInstructions}
                onChange={(e) => setVoiceInstructions(e.target.value)}
                rows={8}
                className={cn(textareaClass, "min-h-[200px] leading-[1.7]")}
                placeholder="Es: Questa autoscuola offre guide a Milano. Il numero per urgenze è +39 02 123456. Usa un tono cordiale ma professionale."
              />
            </SegAccordion>
          </div>

          <div className="shrink-0 border-t border-[#dddddd] bg-white px-6 py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-navy-900 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                "Salva configurazione"
              )}
            </button>
          </div>
        </DetailPanel>
      </div>
    </PageWrapper>
  );
}

// ─── Voice Setup Guide (modal content) ───────────────────────────────────────

function VoiceSetupGuide({ phoneNumber }: { phoneNumber: string }) {
  const num = phoneNumber.replace(/\s/g, "");

  return (
    <div className="space-y-6 text-sm text-foreground">
      <p className="text-muted-foreground">
        Per far arrivare le chiamate alla segretaria AI, devi impostare la <strong>deviazione di chiamata</strong> dal
        tuo numero aziendale verso il numero della segretaria: <strong className="font-mono">{phoneNumber}</strong>
      </p>

      {/* Quick start */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Metodo rapido</h3>
        <p className="text-xs text-muted-foreground">
          Scegli una delle due modalità in base alle tue esigenze:
        </p>
        <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Deviazione sempre (consigliata)</p>
          <p className="text-xs">Tutte le chiamate vanno alla segretaria AI. Il telefono non squilla mai.</p>
          <code className="block rounded-lg bg-white border border-border px-3 py-2 font-mono text-sm select-all">
            **21*{num}#
          </code>
          <p className="text-[11px] text-muted-foreground">
            Per disattivare: <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">##21#</code>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Deviazione su mancata risposta</p>
          <p className="text-xs">Il telefono squilla per il tempo scelto. Se non rispondi, parte la segretaria AI.</p>
          <code className="block rounded-lg bg-white border border-border px-3 py-2 font-mono text-sm select-all">
            **61*{num}*5#
          </code>
          <p className="text-[11px] text-muted-foreground">
            Per disattivare: <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">##61#</code>
          </p>
          <div className="border-t border-border pt-2 space-y-1.5">
            <p className="text-[11px] font-medium text-foreground">Quanto tempo impostare?</p>
            <p className="text-[11px] text-muted-foreground">
              Il numero finale nel codice indica i secondi di squillo prima che parta l&apos;AI. Valori possibili: 5, 10, 15, 20, 25, 30.
            </p>
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              <div className="rounded-lg bg-white border border-border px-2 py-1.5 text-center">
                <span className="font-mono font-semibold">*5#</span>
                <p className="text-muted-foreground">~1 squillo</p>
              </div>
              <div className="rounded-lg bg-white border border-border px-2 py-1.5 text-center">
                <span className="font-mono font-semibold">*10#</span>
                <p className="text-muted-foreground">~2 squilli</p>
              </div>
              <div className="rounded-lg bg-white border border-border px-2 py-1.5 text-center">
                <span className="font-mono font-semibold">*15#</span>
                <p className="text-muted-foreground">~3 squilli</p>
              </div>
              <div className="rounded-lg bg-white border border-border px-2 py-1.5 text-center">
                <span className="font-mono font-semibold">*20#</span>
                <p className="text-muted-foreground">~4 squilli</p>
              </div>
              <div className="rounded-lg bg-white border border-border px-2 py-1.5 text-center">
                <span className="font-mono font-semibold">*25#</span>
                <p className="text-muted-foreground">~5 squilli</p>
              </div>
              <div className="rounded-lg bg-white border border-border px-2 py-1.5 text-center">
                <span className="font-mono font-semibold">*30#</span>
                <p className="text-muted-foreground">~6 squilli</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <strong className="text-foreground">Consiglio:</strong> usa <strong>5 secondi</strong> se vuoi che l&apos;AI risponda quasi subito con il minimo disturbo. Usa <strong>15-20 secondi</strong> se vuoi avere il tempo di rispondere di persona quando sei in ufficio e far intervenire l&apos;AI solo quando non ci sei.
            </p>
          </div>
        </div>
      </section>

      {/* Per carrier */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Istruzioni per operatore</h3>

        <CarrierBlock
          name="TIM"
          type="mobile"
          unconditional={{ code: `**21*${num}#`, disableCode: "##21#" }}
          noAnswer={{ code: `**61*${num}*5#`, disableCode: "##61#" }}
          notes="Funziona subito, nessuna attivazione necessaria."
        />
        <CarrierBlock
          name="TIM"
          type="fisso"
          unconditional={{ code: `*21*${num}#`, disableCode: "#21#" }}
          noAnswer={{ code: `*61*${num}#`, disableCode: "#61#" }}
          notes="Il servizio potrebbe dover essere attivato chiamando il 187 (privati) o 191 (business). Attivazione in 24-48 ore. Gratuito su linee fibra, 3 EUR/mese su ADSL. Su fisso il timeout non è configurabile da codice, contattare il 187."
        />
        <CarrierBlock
          name="Vodafone"
          type="mobile e fisso"
          unconditional={{ code: `**21*${num}#`, disableCode: "##21#" }}
          noAnswer={{ code: `**61*${num}*5#`, disableCode: "##61#" }}
          notes="Su fisso si può gestire anche dal pannello Vodafone Station."
        />
        <CarrierBlock
          name="WindTre"
          type="mobile"
          unconditional={{ code: `**21*${num}*#`, disableCode: "##21#" }}
          noAnswer={{ code: `**61*${num}*5#`, disableCode: "##61#" }}
          notes={<>Per la deviazione sempre: attenzione alla sintassi, c&apos;&egrave; un <code className="font-mono bg-white border border-border px-1 rounded">*</code> in più prima del <code className="font-mono bg-white border border-border px-1 rounded">#</code> finale.</>}
        />
        <CarrierBlock
          name="Fastweb"
          type="fisso"
          unconditional={{ code: `*21*${num}#`, disableCode: "#21#" }}
          noAnswer={{ code: `*61*${num}#`, disableCode: "#61#" }}
          notes="Gestibile anche dal portale MyFastweb e dal pannello Fritz!Box. Con Fritz!Box è possibile configurare regole avanzate per numero chiamante. Costo: circa 0,05 EUR/chiamata deviata."
        />
        <CarrierBlock
          name="Iliad"
          type="mobile"
          unconditional={{ code: `**21*+39${num.replace(/^\+39/, "")}#`, disableCode: "##21#" }}
          noAnswer={{ code: `**61*+39${num.replace(/^\+39/, "")}*5#`, disableCode: "##61#" }}
          notes="Iliad richiede il prefisso +39. Costo: 0,05 EUR/min per le chiamate deviate."
        />
      </section>

      {/* Alternative: smartphone settings */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">In alternativa: dalle impostazioni del telefono</h3>
        <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-3 text-xs">
          <div>
            <p className="font-semibold">iPhone</p>
            <p className="text-muted-foreground">
              <strong>Devia sempre:</strong> Impostazioni &rarr; Telefono &rarr; Inoltro chiamate &rarr; attiva e inserisci{" "}
              <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">{num}</code>
            </p>
            <p className="text-muted-foreground mt-1">
              <strong>Su mancata risposta:</strong> non configurabile da interfaccia, usa il codice <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">**61*{num}*5#</code>
            </p>
          </div>
          <div>
            <p className="font-semibold">Android</p>
            <p className="text-muted-foreground">
              App Telefono &rarr; Menu (&hellip;) &rarr; Impostazioni &rarr; Deviazione chiamate &rarr; scegli &ldquo;Devia sempre&rdquo; oppure &ldquo;Devia se non rispondo&rdquo; &rarr; inserisci{" "}
              <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">{num}</code>
            </p>
          </div>
        </div>
      </section>

      {/* Tips */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Consigli utili</h3>
        <ul className="list-disc pl-4 space-y-1.5 text-xs text-muted-foreground">
          <li>
            <strong className="text-foreground">Testa subito:</strong> dopo aver attivato la deviazione, chiama il tuo numero da un altro telefono per verificare che risponda la segretaria AI.
          </li>
          <li>
            <strong className="text-foreground">Quale modalità scegliere?</strong> Con la deviazione &ldquo;sempre&rdquo; il telefono non squilla mai e tutte le chiamate vanno all&apos;AI. Se hai attivato il trasferimento a segreteria durante la chiamata, il numero di trasferimento <strong>deve essere diverso</strong> dal numero deviato (es. il tuo cellulare personale), altrimenti si crea un loop. Con la deviazione &ldquo;su mancata risposta&rdquo; il telefono squilla brevemente per ogni chiamata (~5 sec), ma la segretaria AI può ritrasferire allo stesso numero senza problemi.
          </li>
          <li>
            <strong className="text-foreground">Disattiva la segreteria telefonica</strong> del tuo operatore prima di impostare la deviazione, altrimenti potrebbe intercettare le chiamate prima del trasferimento.
          </li>
          <li>
            <strong className="text-foreground">Centralino (PBX):</strong> se la tua autoscuola usa un centralino, la deviazione va configurata direttamente sul centralino dal tecnico.
          </li>
          <li>
            <strong className="text-foreground">Per annullare tutto:</strong> digita <code className="font-mono bg-white border border-border px-1 rounded">##002#</code> dal cellulare per rimuovere tutte le deviazioni attive.
          </li>
        </ul>
      </section>
    </div>
  );
}

function CarrierBlock({
  name,
  type,
  unconditional,
  noAnswer,
  notes,
}: {
  name: string;
  type: string;
  unconditional: { code: string; disableCode: string };
  noAnswer: { code: string; disableCode: string };
  notes: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{name}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{type}</span>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-foreground">Deviazione sempre (tutte le chiamate)</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Attiva:</span>
          <code className="rounded bg-white border border-border px-2 py-0.5 font-mono text-xs select-all">{unconditional.code}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Disattiva:</span>
          <code className="rounded bg-white border border-border px-2 py-0.5 font-mono text-xs">{unconditional.disableCode}</code>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-foreground">Deviazione su mancata risposta (dopo ~5 sec)</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Attiva:</span>
          <code className="rounded bg-white border border-border px-2 py-0.5 font-mono text-xs select-all">{noAnswer.code}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Disattiva:</span>
          <code className="rounded bg-white border border-border px-2 py-0.5 font-mono text-xs">{noAnswer.disableCode}</code>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{notes}</p>
    </div>
  );
}
