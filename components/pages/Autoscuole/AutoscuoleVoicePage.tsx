"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { Button } from "@/components/ui/button";
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
import { LottieLoadingOverlay } from "@/components/ui/lottie-loading-overlay";
import { VoiceSkeleton } from "@/components/ui/page-skeleton";
import { SectionCard } from "@/components/ui/section-card";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { FieldGroup } from "@/components/ui/field-group";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { cn } from "@/lib/utils";
import {
  PhoneCall,
  FileText,
  RefreshCw,
  Phone,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Play,
  Square,
  HelpCircle,
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

const VOICE_OPTIONS = [
  { value: "coral", label: "Coral", description: "Femminile, calda" },
  { value: "sage", label: "Sage", description: "Femminile, professionale" },
  { value: "shimmer", label: "Shimmer", description: "Femminile, vivace" },
  { value: "ash", label: "Ash", description: "Maschile, naturale" },
  { value: "alloy", label: "Alloy", description: "Neutra, bilanciata" },
] as const;

const START_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);
const END_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);

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

// ─── Status helpers ───────────────────────────────────────────────────────────

function ProvisioningBadge({ status }: { status: VoiceProvisioningStatus }) {
  const config = {
    not_started: {
      dot: "bg-slate-400",
      text: "text-slate-600",
      bg: "bg-slate-50 border-slate-200",
      label: "Non configurato",
    },
    provisioning: {
      dot: "bg-amber-400 animate-pulse",
      text: "text-amber-700",
      bg: "bg-amber-50 border-amber-200",
      label: "In configurazione",
    },
    ready: {
      dot: "bg-emerald-400",
      text: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-200",
      label: "Operativa",
    },
    error: {
      dot: "bg-red-400",
      text: "text-red-700",
      bg: "bg-red-50 border-red-200",
      label: "Errore",
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.bg} ${config.text}`}
    >
      <span className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

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
        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition",
        checked ? "border-yellow-200 bg-yellow-50" : "border-border bg-white hover:bg-gray-50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <InlineToggle checked={checked} size="sm" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AutoscuoleVoicePage() {
  const toast = useFeedbackToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [voiceSection, setVoiceSection] = React.useState<string | null>("behavior");

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
  const [voiceAssistantVoice, setVoiceAssistantVoice] = React.useState("coral");
  const [previewPlaying, setPreviewPlaying] = React.useState(false);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Callbacks state
  const [callbackTasks, setCallbackTasks] = React.useState<CallbackTask[]>([]);
  const [loadingCallbacks, setLoadingCallbacks] = React.useState(false);
  const [markingDone, setMarkingDone] = React.useState<string | null>(null);

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
      setVoiceAssistantVoice(d.voiceAssistantVoice || "coral");
      const VALID_ACTIONS: VoiceAllowedAction[] = ["faq", "lesson_info", "booking"];
      const loaded = (d.voiceAllowedActions ?? []).filter((a): a is VoiceAllowedAction =>
        VALID_ACTIONS.includes(a as VoiceAllowedAction),
      );
      setVoiceAllowedActions(loaded.length ? loaded : ["faq", "lesson_info"]);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

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

  const handleSave = async () => {
    if (voiceFeatureEnabled && voiceAssistantEnabled) {
      if (voiceProvisioningStatus !== "ready" || !voiceLineRef) {
        toast.error({
          description: "Linea voce non pronta. Contatta il backoffice Reglo per completare il provisioning.",
        });
        return;
      }
      if (!voiceHandoffPhone?.trim()) {
        toast.error({ description: "Inserisci il numero di handoff per il trasferimento chiamata." });
        return;
      }
      if (!voiceOfficeDays.length || voiceOfficeEndMinutes <= voiceOfficeStartMinutes) {
        toast.error({ description: "Orari segreteria voce non validi." });
        return;
      }
      if (!voiceAllowedActions.length) {
        toast.error({ description: "Seleziona almeno un'azione consentita." });
        return;
      }
      if (voiceBookingEnabled && !voiceAllowedActions.includes("booking")) {
        toast.error({ description: "Per le prenotazioni voce devi abilitare l'azione 'Prenota guida'." });
        return;
      }
    }

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
    });
    setSaving(false);

    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare le impostazioni." });
      return;
    }

    const d = res.data;
    setVoiceAssistantEnabled(Boolean(d.voiceAssistantEnabled));
    setVoiceBookingEnabled(Boolean(d.voiceBookingEnabled));
    setVoiceLegalGreetingEnabled(d.voiceLegalGreetingEnabled !== false);
    setVoiceRecordingEnabled(d.voiceRecordingEnabled !== false);
    setVoiceTranscriptionEnabled(d.voiceTranscriptionEnabled !== false);
    setVoiceHandoffPhone(d.voiceHandoffPhone ?? null);
    setVoiceOfficeDays(normalizeDays(Array.from(d.voiceOfficeHours?.daysOfWeek ?? [1, 2, 3, 4, 5])));
    setVoiceOfficeStartMinutes(d.voiceOfficeHours?.startMinutes ?? 9 * 60);
    setVoiceOfficeEndMinutes(d.voiceOfficeHours?.endMinutes ?? 19 * 60);
    setVoiceInstructions(d.voiceInstructions ?? "");
    setVoiceAssistantVoice(d.voiceAssistantVoice || "coral");
    const VALID_ACTIONS: VoiceAllowedAction[] = ["faq", "lesson_info", "booking"];
    const loaded = (d.voiceAllowedActions ?? []).filter((a): a is VoiceAllowedAction =>
      VALID_ACTIONS.includes(a as VoiceAllowedAction),
    );
    setVoiceAllowedActions(loaded.length ? loaded : ["faq", "lesson_info"]);
    toast.success({ description: "Impostazioni segretaria salvate." });
  };

  const handlePreviewVoice = async () => {
    if (previewPlaying) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    setPreviewPlaying(true);
    try {
      const audio = new Audio(`/api/voice/preview?voice=${voiceAssistantVoice}`);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setPreviewPlaying(false);
        previewAudioRef.current = null;
      };
      audio.onerror = () => {
        setPreviewPlaying(false);
        previewAudioRef.current = null;
        toast.error({ description: "Impossibile riprodurre l'anteprima." });
      };
      await audio.play();
    } catch {
      setPreviewPlaying(false);
    }
  };

  const isReady = voiceProvisioningStatus === "ready";
  const toggleVoiceSection = (key: string) =>
    setVoiceSection((prev) => (prev === key ? null : key));

  return (
    <PageWrapper
      title="Segretaria Virtuale"
      subTitle="Assistente vocale AI inbound"
    >
      <div className="relative w-full space-y-5">
        <LottieLoadingOverlay visible={loading} />

        {loading ? (
          <VoiceSkeleton />
        ) : !voiceFeatureEnabled ? (
          /* ── Feature NOT enabled: empty state ── */
          <div className="rounded-2xl border border-border bg-white p-8 shadow-card">
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-50">
                <PhoneCall className="h-7 w-7 text-yellow-600" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">Segretaria Virtuale non attiva</h3>
              <p className="mt-1.5 text-xs text-muted-foreground">
                L&apos;assistente vocale AI risponde alle chiamate, informa gli allievi e gestisce prenotazioni guide.
                Contatta il team Reglo per attivarla sulla tua autoscuola.
              </p>
            </div>
          </div>
        ) : (
          /* ── Feature enabled ── */
          <>
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white px-5 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", isReady ? "bg-positive" : "bg-yellow-400 animate-pulse")} />
            <span className={cn("text-sm font-semibold", isReady ? "text-emerald-700" : "text-amber-700")}>
              {isReady ? "Linea attiva" : "Linea in configurazione"}
            </span>
            {voiceDisplayNumber && (
              <span className="font-mono text-xs text-muted-foreground">{voiceDisplayNumber}</span>
            )}
            <ProvisioningBadge status={voiceProvisioningStatus} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Assistente vocale</span>
            <InlineToggle
              checked={voiceAssistantEnabled}
              onChange={() => setVoiceAssistantEnabled((v) => !v)}
            />
          </div>
        </div>

        {!isReady && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
            <p className="text-xs text-yellow-800">
              Linea non ancora pronta. Contatta il backoffice Reglo per completare il provisioning.
            </p>
          </div>
        )}

        {/* Setup guide link */}
        {isReady && voiceDisplayNumber && (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-pink-600 hover:text-pink-700 transition-colors cursor-pointer"
              >
                <HelpCircle className="size-3.5" />
                Come collegare il numero della segretaria al tuo telefono
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Collega il numero della segretaria</DialogTitle>
              </DialogHeader>
              <VoiceSetupGuide phoneNumber={voiceDisplayNumber} />
            </DialogContent>
          </Dialog>
        )}

        {/* Settings accordion */}
        <div className="rounded-2xl border border-border bg-white shadow-card">
          {/* Comportamento e azioni */}
          <VoiceAccordion
            title="Comportamento e azioni"
            description="Azioni consentite, prenotazioni voce e greeting"
            expanded={voiceSection === "behavior"}
            onToggle={() => toggleVoiceSection("behavior")}
            isFirst
          >
            <div className="space-y-4">
              {/* Action cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                {VOICE_ALLOWED_ACTION_OPTIONS.map((option) => {
                  const active = voiceAllowedActions.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleAction(option.value)}
                      className={cn(
                        "cursor-pointer rounded-xl border px-4 py-3 text-left transition",
                        active ? "border-yellow-200 bg-yellow-50 shadow-sm" : "border-border bg-white hover:bg-gray-50",
                      )}
                    >
                      <div className={cn("text-xs font-semibold", active ? "text-yellow-700" : "text-foreground")}>
                        {option.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{option.description}</div>
                    </button>
                  );
                })}
              </div>
              {/* Toggle rows */}
              <div className="space-y-2">
                <ToggleRow label="Prenotazioni voce" description="L'assistente può prenotare guide sull'agenda" checked={voiceBookingEnabled} onCheckedChange={setVoiceBookingEnabled} />
                <ToggleRow label="Greeting legale" description="Avvisa il chiamante che la chiamata è gestita da un AI" checked={voiceLegalGreetingEnabled} onCheckedChange={setVoiceLegalGreetingEnabled} />
              </div>
            </div>
          </VoiceAccordion>

          {/* Orari e registrazione */}
          <VoiceAccordion
            title="Orari e registrazione"
            description="Orari segreteria, registrazione e trascrizione chiamate"
            expanded={voiceSection === "hours"}
            onToggle={() => toggleVoiceSection("hours")}
          >
            <div className="space-y-5">
              {/* Office hours */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-foreground">Giorni attivi</div>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <ToggleChip
                      key={`voice-day-${day.value}`}
                      active={voiceOfficeDays.includes(day.value)}
                      onClick={() =>
                        setVoiceOfficeDays((current) =>
                          current.includes(day.value)
                            ? current.filter((d) => d !== day.value)
                            : normalizeDays([...current, day.value]),
                        )
                      }
                    >
                      {day.label}
                    </ToggleChip>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-xs">
                  <FieldGroup label="Inizio">
                    <Select value={String(voiceOfficeStartMinutes)} onValueChange={(v) => setVoiceOfficeStartMinutes(Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{START_TIME_OPTIONS.map((m) => (<SelectItem key={`vs-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Fine">
                    <Select value={String(voiceOfficeEndMinutes)} onValueChange={(v) => setVoiceOfficeEndMinutes(Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{END_TIME_OPTIONS.map((m) => (<SelectItem key={`ve-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                    </Select>
                  </FieldGroup>
                </div>
              </div>
              {/* Handoff phone */}
              <FieldGroup label="Numero handoff" description="Numero a cui trasferire la chiamata fuori orario" className="max-w-xs">
                <input
                  value={voiceHandoffPhone ?? ""}
                  onChange={(e) => setVoiceHandoffPhone(e.target.value || null)}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary"
                  placeholder="+39..."
                />
              </FieldGroup>
              {/* Handoff during call */}
              <ToggleRow
                label="Trasferimento durante chiamata"
                description="Consenti alla segretaria AI di trasferire la chiamata al numero handoff in base a regole personalizzate"
                checked={voiceHandoffDuringCallEnabled}
                onCheckedChange={setVoiceHandoffDuringCallEnabled}
              />
              {voiceHandoffDuringCallEnabled && (
                <FieldGroup label="Regole di trasferimento" description="Descrivi quando la segretaria deve trasferire la chiamata. Es: &laquo;Se chiedono insistentemente i prezzi&raquo; oppure &laquo;Se vogliono parlare con una persona fisica&raquo;">
                  <textarea
                    value={voiceHandoffDuringCallInstructions}
                    onChange={(e) => setVoiceHandoffDuringCallInstructions(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary resize-none"
                    placeholder="Es: Se il chiamante chiede insistentemente di parlare con una persona, trasferisci la chiamata."
                  />
                </FieldGroup>
              )}
              {/* Recording toggles */}
              <div className="space-y-2">
                <ToggleRow label="Registra audio" description="Salva una registrazione audio della chiamata" checked={voiceRecordingEnabled} onCheckedChange={setVoiceRecordingEnabled} />
                <ToggleRow label="Trascrivi chiamate" description="Genera trascrizione testuale della conversazione" checked={voiceTranscriptionEnabled} onCheckedChange={setVoiceTranscriptionEnabled} />
              </div>
            </div>
          </VoiceAccordion>

          {/* Voce assistente */}
          <VoiceAccordion
            title="Voce assistente"
            description="Scegli la voce dell'assistente AI"
            expanded={voiceSection === "voice"}
            onToggle={() => toggleVoiceSection("voice")}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Select value={voiceAssistantVoice} onValueChange={setVoiceAssistantVoice}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Seleziona voce" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        <span className="font-medium">{v.label}</span>
                        <span className="ml-2 text-muted-foreground">{v.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={handlePreviewVoice}
                  disabled={false}
                >
                  {previewPlaying ? (
                    <><Square className="size-3.5" /> Stop</>
                  ) : (
                    <><Play className="size-3.5" /> Anteprima</>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                La voce selezionata sarà utilizzata per tutte le chiamate in entrata.
              </p>
            </div>
          </VoiceAccordion>

          {/* Istruzioni personalizzate */}
          <VoiceAccordion
            title="Istruzioni personalizzate"
            description="Policy, tono comunicativo e regole operative"
            expanded={voiceSection === "instructions"}
            onToggle={() => toggleVoiceSection("instructions")}
            isLast
          >
            <textarea
              value={voiceInstructions}
              onChange={(e) => setVoiceInstructions(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-white p-3.5 text-xs leading-relaxed outline-none transition focus:border-primary"
              placeholder="Es: Questa autoscuola offre guide a Milano. Il numero per urgenze è +39 02 123456. Usa un tono cordiale ma professionale."
            />
          </VoiceAccordion>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (<><Loader2 className="size-4 animate-spin mr-2" />Salvataggio...</>) : "Salva configurazione"}
          </Button>
        </div>

        {/* Callbacks */}
        <SectionCard
          icon={Phone}
          title="Richiamate in sospeso"
          description="Chiamanti che hanno richiesto di essere ricontattati"
          headerRight={
            <Button variant="ghost" size="sm" onClick={loadCallbacks} disabled={loadingCallbacks} className="gap-2 text-xs">
              <RefreshCw className={cn("size-3.5", loadingCallbacks && "animate-spin")} />
              Aggiorna
            </Button>
          }
        >
          {callbackTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-gray-50/50 px-4 py-8 text-center">
              <Phone className="mx-auto mb-2 size-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {loadingCallbacks ? "Caricamento..." : "Nessuna richiamata in sospeso"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {callbackTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 transition hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{task.student?.name ?? task.phoneNumber}</span>
                      {task.student?.name ? <span className="text-xs text-muted-foreground">{task.phoneNumber}</span> : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{task.reason}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{new Date(task.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleMarkDone(task.id)} disabled={markingDone === task.id} className="shrink-0 gap-1.5 text-xs">
                    {markingDone === task.id ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3 text-emerald-600" />}
                    {markingDone === task.id ? "..." : "Fatto"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
          </>
        )}
      </div>
    </PageWrapper>
  );
}

function VoiceAccordion({
  title,
  description,
  expanded,
  onToggle,
  isFirst,
  isLast,
  children,
}: {
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!isFirst && "border-t border-border")}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-gray-50/50",
          isFirst && "rounded-t-2xl",
          isLast && !expanded && "rounded-b-2xl",
        )}
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, overflow: "visible", transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className={cn("px-5 pb-5", isLast && "rounded-b-2xl")}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
        <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Da cellulare</p>
          <p className="text-xs">Digita il seguente codice e premi Chiama:</p>
          <code className="block rounded-lg bg-white border border-border px-3 py-2 font-mono text-sm select-all">
            **21*{num}#
          </code>
          <p className="text-[11px] text-muted-foreground">
            Per disattivare: <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">##21#</code>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Da telefono fisso</p>
          <p className="text-xs">Digita il seguente codice dal telefono collegato alla linea:</p>
          <code className="block rounded-lg bg-white border border-border px-3 py-2 font-mono text-sm select-all">
            *21*{num}#
          </code>
          <p className="text-[11px] text-muted-foreground">
            Per disattivare: <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">#21#</code>
          </p>
        </div>
      </section>

      {/* Per carrier */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Istruzioni per operatore</h3>

        <CarrierBlock
          name="TIM"
          type="mobile"
          code={`**21*${num}#`}
          disableCode="##21#"
          notes="Funziona subito, nessuna attivazione necessaria."
        />
        <CarrierBlock
          name="TIM"
          type="fisso"
          code={`*21*${num}#`}
          disableCode="#21#"
          notes="Il servizio potrebbe dover essere attivato chiamando il 187 (privati) o 191 (business). Attivazione in 24-48 ore. Gratuito su linee fibra, 3 EUR/mese su ADSL."
        />
        <CarrierBlock
          name="Vodafone"
          type="mobile e fisso"
          code={`**21*${num}#`}
          disableCode="##21#"
          notes="Su fisso si pu&ograve; gestire anche dal pannello Vodafone Station."
        />
        <CarrierBlock
          name="WindTre"
          type="mobile"
          code={`**21*${num}*#`}
          disableCode="##21#"
          notes={<>Attenzione alla sintassi: c&apos;&egrave; un <code className="font-mono bg-white border border-border px-1 rounded">*</code> in pi&ugrave; prima del <code className="font-mono bg-white border border-border px-1 rounded">#</code> finale.</>}
        />
        <CarrierBlock
          name="Fastweb"
          type="fisso"
          code={`*21*${num}#`}
          disableCode="#21#"
          notes="Gestibile anche dal portale MyFastweb. Costo: circa 0,05 EUR/chiamata deviata."
        />
        <CarrierBlock
          name="Iliad"
          type="mobile"
          code={`**21*+39${num.replace(/^\+39/, "")}#`}
          disableCode="##21#"
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
              Impostazioni &rarr; Telefono &rarr; Inoltro chiamate &rarr; attiva e inserisci{" "}
              <code className="font-mono bg-white border border-border px-1.5 py-0.5 rounded">{num}</code>
            </p>
          </div>
          <div>
            <p className="font-semibold">Android</p>
            <p className="text-muted-foreground">
              App Telefono &rarr; Menu (&hellip;) &rarr; Impostazioni &rarr; Deviazione chiamate &rarr; Devia sempre &rarr; inserisci{" "}
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
            <strong className="text-foreground">Deviazione condizionata:</strong> se vuoi deviare solo quando non rispondi, usa <code className="font-mono bg-white border border-border px-1 rounded">**61*{num}#</code> (cellulare) o <code className="font-mono bg-white border border-border px-1 rounded">*23*{num}#</code> (fisso TIM/Fastweb).
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
  code,
  disableCode,
  notes,
}: {
  name: string;
  type: string;
  code: string;
  disableCode: string;
  notes: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{name}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{type}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Attiva:</span>
        <code className="rounded bg-white border border-border px-2 py-0.5 font-mono text-xs select-all">{code}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Disattiva:</span>
        <code className="rounded bg-white border border-border px-2 py-0.5 font-mono text-xs">{disableCode}</code>
      </div>
      <p className="text-[11px] text-muted-foreground">{notes}</p>
    </div>
  );
}
