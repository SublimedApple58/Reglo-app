"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { CreditCard, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";
import {
  getAutoscuolaStudentsList,
  generateTestPaymentReceipt,
} from "@/lib/actions/autoscuole.actions";
import { LottieLoadingOverlay } from "@/components/ui/lottie-loading-overlay";
import { PaymentsSkeleton } from "@/components/ui/page-skeleton";
import { SectionCard } from "@/components/ui/section-card";
import { StatMetric } from "@/components/ui/stat-metric";
import { FieldGroup } from "@/components/ui/field-group";
import { InlineToggle } from "@/components/ui/inline-toggle";

type PaymentOverview = {
  totalRequired: number;
  paidCount: number;
  insolutiCount: number;
  pendingPenaltyCount: number;
  partialCount: number;
};

type PaymentAppointment = {
  id: string;
  startsAt: string | Date;
  status: string;
  paymentStatus: string;
  priceAmount: number;
  penaltyAmount: number;
  paidAmount: number;
  finalAmount: number;
  dueAmount: number;
  invoiceId: string | null;
  invoiceStatus: string | null;
  student: {
    id: string;
    name: string;
    email: string;
  };
  payments: Array<{
    id: string;
    phase: string;
    status: string;
    amount: number;
    attemptCount: number;
    nextAttemptAt: string | Date | null;
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: string | Date;
    paidAt: string | Date | null;
    stripePaymentIntentId?: string | null;
    stripeChargeId?: string | null;
  }>;
};

type PaymentsBootstrapPayload = {
  settings: {
    autoPaymentsEnabled?: boolean;
    lessonCreditFlowEnabled?: boolean;
    lessonCreditsRequired?: boolean;
    lessonPrice30?: number;
    lessonPrice60?: number;
    penaltyCutoffHoursPreset?: number;
    penaltyPercentPreset?: number;
    ficVatTypeId?: string | null;
    ficPaymentMethodId?: string | null;
    paymentNotificationChannels?: Array<"push" | "email">;
  };
  overview: PaymentOverview | null;
  appointmentsPage: {
    items: PaymentAppointment[];
    nextCursor: string | null;
    limit: number;
  };
  stripeStatus: StripeConnectStatus | null;
  ficStatus: {
    connected: boolean;
    status: string | null;
    entityId: string | null;
  };
  meta: {
    cache: boolean;
    generatedAt: string;
  };
};

type SelectOption = {
  value: string;
  label: string;
};

const cutoffPresets = [1, 2, 4, 6, 12, 24, 48] as const;
const penaltyPresets = [25, 50, 75, 100] as const;

type StripeConnectStatus = {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  requirementsPastDue: string[];
  status: "not_connected" | "pending" | "restricted" | "active";
  ready: boolean;
  syncError?: string | null;
};

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMoney = (value: number) => `€ ${value.toFixed(2)}`;

const statusLabel = (value: string) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "paid") return "Pagato";
  if (normalized === "insoluto") return "Insoluto";
  if (normalized === "partial_paid") return "Parziale";
  if (normalized === "pending_penalty") return "In attesa";
  if (normalized === "waived") return "Non dovuto";
  return value;
};

const phaseLabel = (value: string) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "penalty") return "Penale";
  if (normalized === "settlement") return "Saldo";
  if (normalized === "manual_recovery") return "Recupero";
  return value;
};

const paymentAttemptStatusLabel = (value: string) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "succeeded") return "Riuscito";
  if (normalized === "failed") return "Fallito";
  if (normalized === "processing") return "In elaborazione";
  if (normalized === "pending") return "In coda";
  if (normalized === "abandoned") return "Abbandonato";
  return value;
};

export function AutoscuolePaymentsPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();
  const searchParams = useSearchParams();
  const hasHandledStripeReturn = React.useRef(false);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [stripeLoading, setStripeLoading] = React.useState(false);
  const [stripeOnboardingLoading, setStripeOnboardingLoading] = React.useState(false);
  const [overview, setOverview] = React.useState<PaymentOverview | null>(null);
  const [appointments, setAppointments] = React.useState<PaymentAppointment[]>([]);
  const [stripeStatus, setStripeStatus] = React.useState<StripeConnectStatus | null>(null);
  const [vatOptions, setVatOptions] = React.useState<SelectOption[]>([]);
  const [methodOptions, setMethodOptions] = React.useState<SelectOption[]>([]);
  const [vatLoading, setVatLoading] = React.useState(false);
  const [methodLoading, setMethodLoading] = React.useState(false);
  const [ficOptionsLoaded, setFicOptionsLoaded] = React.useState(false);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsTargetId, setDetailsTargetId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsRow, setDetailsRow] = React.useState<PaymentAppointment | null>(null);

  const [autoPaymentsEnabled, setAutoPaymentsEnabled] = React.useState(false);
  const [paymentSection, setPaymentSection] = React.useState<string | null>("pricing");
  const [lessonCreditFlowEnabled, setLessonCreditFlowEnabled] = React.useState(false);
  const [lessonCreditsRequired, setLessonCreditsRequired] = React.useState(true);
  const [lessonPrice30, setLessonPrice30] = React.useState("25");
  const [lessonPrice60, setLessonPrice60] = React.useState("50");
  const [penaltyCutoffHoursPreset, setPenaltyCutoffHoursPreset] = React.useState("24");
  const [penaltyPercentPreset, setPenaltyPercentPreset] = React.useState("50");
  const [ficVatTypeId, setFicVatTypeId] = React.useState<string>("");
  const [ficPaymentMethodId, setFicPaymentMethodId] = React.useState<string>("");
  const [pushEnabled, setPushEnabled] = React.useState(true);
  const [emailEnabled, setEmailEnabled] = React.useState(true);

  // ── Test receipt modal state
  const [testOpen, setTestOpen] = React.useState(false);
  const [testStudents, setTestStudents] = React.useState<{ id: string; name: string; email: string }[]>([]);
  const [testStudentsLoading, setTestStudentsLoading] = React.useState(false);
  const [testStudentId, setTestStudentId] = React.useState("");
  const [testAmount, setTestAmount] = React.useState("25");
  const [testLessonType, setTestLessonType] = React.useState("urbano");
  const [testGenerating, setTestGenerating] = React.useState(false);
  const [testReceiptUrl, setTestReceiptUrl] = React.useState<string | null>(null);

  const loadFicOptions = React.useCallback(async (force = false) => {
    if (ficOptionsLoaded && !force) return;
    setVatLoading(true);
    setMethodLoading(true);

    try {
      const [vatRes, methodRes] = await Promise.all([
        fetch("/api/integrations/fatture-in-cloud/vat-types", { cache: "no-store" }),
        fetch("/api/integrations/fatture-in-cloud/payment-methods", {
          cache: "no-store",
        }),
      ]);

      const vatPayload = (await vatRes.json().catch(() => null)) as
        | { success?: boolean; data?: SelectOption[]; message?: string }
        | null;
      const methodPayload = (await methodRes.json().catch(() => null)) as
        | { success?: boolean; data?: SelectOption[]; message?: string }
        | null;

      if (!vatRes.ok || !vatPayload?.success) {
        setVatOptions([]);
      } else {
        setVatOptions(
          (vatPayload.data ?? [])
            .map((option) => {
              if (!option || option.value == null) return null;
              return {
                value: String(option.value),
                label: option.label ?? String(option.value),
              };
            })
            .filter(Boolean) as SelectOption[],
        );
      }

      if (!methodRes.ok || !methodPayload?.success) {
        setMethodOptions([]);
      } else {
        setMethodOptions(
          (methodPayload.data ?? [])
            .map((option) => {
              if (!option || option.value == null) return null;
              return {
                value: String(option.value),
                label: option.label ?? String(option.value),
              };
            })
            .filter(Boolean) as SelectOption[],
        );
      }
      setFicOptionsLoaded(true);
    } finally {
      setVatLoading(false);
      setMethodLoading(false);
    }
  }, [ficOptionsLoaded]);

  const loadStripeStatus = React.useCallback(async (sync = false) => {
    setStripeLoading(true);
    try {
      const response = await fetch(
        `/api/autoscuole/payments/stripe-connect/status${sync ? "?sync=1" : ""}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: StripeConnectStatus; message?: string }
        | null;

      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.message ?? "Impossibile leggere stato Stripe Connect.");
      }

      setStripeStatus(payload.data);
    } catch (error) {
      setStripeStatus(null);
      toast.error({
        description:
          error instanceof Error
            ? error.message
            : "Errore caricamento stato Stripe Connect.",
      });
    } finally {
      setStripeLoading(false);
    }
  }, [toast]);

  const loadPage = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/autoscuole/payments/bootstrap?limit=100", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: PaymentsBootstrapPayload; message?: string }
        | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.message ?? "Impossibile caricare sezione pagamenti.");
      }

      const settings = payload.data.settings ?? {};
      setAutoPaymentsEnabled(Boolean(settings.autoPaymentsEnabled));
      setLessonCreditFlowEnabled(Boolean(settings.lessonCreditFlowEnabled));
      setLessonCreditsRequired(settings.lessonCreditsRequired !== false);
      setLessonPrice30(String(settings.lessonPrice30 ?? 25));
      setLessonPrice60(String(settings.lessonPrice60 ?? 50));
      setPenaltyCutoffHoursPreset(String(settings.penaltyCutoffHoursPreset ?? 24));
      setPenaltyPercentPreset(String(settings.penaltyPercentPreset ?? 50));
      setFicVatTypeId(settings.ficVatTypeId ?? "");
      setFicPaymentMethodId(settings.ficPaymentMethodId ?? "");

      const channels = settings.paymentNotificationChannels ?? ["push", "email"];
      setPushEnabled(channels.includes("push"));
      setEmailEnabled(channels.includes("email"));

      setOverview(payload.data.overview);
      setAppointments(payload.data.appointmentsPage?.items ?? []);
      setStripeStatus(payload.data.stripeStatus ?? null);
    } catch (error) {
      toast.error({
        description:
          error instanceof Error
            ? error.message
            : "Errore nel caricamento della sezione pagamenti.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadPage();
  }, [loadPage]);

  // If the bootstrap returned a stale syncError (last DB-persisted sync failed but
  // Stripe may be fine now), silently re-sync in the background so the error
  // banner disappears automatically without requiring a manual "aggiorna stato".
  React.useEffect(() => {
    if (!stripeStatus?.syncError) return;
    fetch("/api/autoscuole/payments/stripe-connect/status?sync=1", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ success?: boolean; data?: StripeConnectStatus }>)
      .then((payload) => {
        if (payload.success && payload.data) setStripeStatus(payload.data);
      })
      .catch(() => undefined); // stay silent — user can retry manually if still broken
  }, [stripeStatus?.syncError]);

  React.useEffect(() => {
    if (loading) return;
    const handle = setTimeout(() => {
      loadFicOptions().catch(() => undefined);
    }, 450);
    return () => clearTimeout(handle);
  }, [loading, loadFicOptions]);

  React.useEffect(() => {
    const stripeReturn = searchParams.get("stripe_return");
    const stripeRefresh = searchParams.get("stripe_refresh");

    if (!stripeReturn && !stripeRefresh) {
      hasHandledStripeReturn.current = false;
      return;
    }

    if (hasHandledStripeReturn.current) return;
    hasHandledStripeReturn.current = true;

    if (stripeReturn) {
      toast.success({
        description: "Rientro da Stripe completato. Verifico lo stato onboarding.",
      });
    }
    if (stripeRefresh) {
      toast.info({
        description: "Sessione Stripe scaduta o interrotta. Completa nuovamente l'onboarding.",
      });
    }

    loadStripeStatus(true).catch(() => undefined);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadStripeStatus, searchParams, toast]);

  const handleOpenStripeOnboarding = async () => {
    setStripeOnboardingLoading(true);
    try {
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "/en/user/autoscuole/payments";
      const returnPath = `${currentPath}?stripe_return=1`;
      const refreshPath = `${currentPath}?stripe_refresh=1`;

      const response = await fetch("/api/autoscuole/payments/stripe-connect/onboarding-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          returnPath,
          refreshPath,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: { onboardingUrl?: string }; message?: string }
        | null;

      if (!response.ok || !payload?.success || !payload.data?.onboardingUrl) {
        throw new Error(payload?.message ?? "Impossibile avviare onboarding Stripe.");
      }

      if (typeof window !== "undefined") {
        window.location.assign(payload.data.onboardingUrl);
      }
    } catch (error) {
      toast.error({
        description:
          error instanceof Error
            ? error.message
            : "Errore durante l'apertura onboarding Stripe.",
      });
    } finally {
      setStripeOnboardingLoading(false);
    }
  };

  const handleSave = async () => {
    const parsedPrice30 = Number(lessonPrice30);
    const parsedPrice60 = Number(lessonPrice60);
    const parsedCutoff = Number(penaltyCutoffHoursPreset);
    const parsedPenalty = Number(penaltyPercentPreset);

    if (!Number.isFinite(parsedPrice30) || parsedPrice30 <= 0) {
      toast.error({ description: "Prezzo 30 minuti non valido." });
      return;
    }
    if (!Number.isFinite(parsedPrice60) || parsedPrice60 <= 0) {
      toast.error({ description: "Prezzo 60 minuti non valido." });
      return;
    }
    if (!cutoffPresets.includes(parsedCutoff as (typeof cutoffPresets)[number])) {
      toast.error({ description: "Cutoff penale non valido." });
      return;
    }
    if (!penaltyPresets.includes(parsedPenalty as (typeof penaltyPresets)[number])) {
      toast.error({ description: "Percentuale penale non valida." });
      return;
    }

    const channels: Array<"push" | "email"> = [];
    if (pushEnabled) channels.push("push");
    if (emailEnabled) channels.push("email");
    if (!channels.length) {
      toast.error({ description: "Seleziona almeno un canale notifica pagamento." });
      return;
    }

    if (autoPaymentsEnabled) {
      if (!stripeStatus?.ready) {
        toast.error({
          description:
            "Completa onboarding Stripe (termini, IBAN, P.IVA e documenti) prima di attivare i pagamenti automatici.",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const res = await updateAutoscuolaSettings({
        autoPaymentsEnabled,
        lessonCreditFlowEnabled,
        lessonCreditsRequired,
        lessonPrice30: parsedPrice30,
        lessonPrice60: parsedPrice60,
        penaltyCutoffHoursPreset: parsedCutoff as 1 | 2 | 4 | 6 | 12 | 24 | 48,
        penaltyPercentPreset: parsedPenalty as 25 | 50 | 75 | 100,
        paymentNotificationChannels: channels,
        ficVatTypeId: ficVatTypeId || null,
        ficPaymentMethodId: ficPaymentMethodId || null,
      });

      if (!res.success) {
        throw new Error(res.message ?? "Impossibile salvare configurazione pagamenti.");
      }

      toast.success({ description: "Configurazione pagamenti aggiornata." });
      await loadPage();
    } catch (error) {
      toast.error({
        description:
          error instanceof Error
            ? error.message
            : "Errore durante il salvataggio dei pagamenti.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPaymentDetails = async (appointmentId: string) => {
    setDetailsLoading(true);
    setDetailsTargetId(appointmentId);
    try {
      const response = await fetch(
        `/api/autoscuole/payments/appointments/${appointmentId}/logs`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: PaymentAppointment; message?: string }
        | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.message ?? "Impossibile caricare dettagli pagamento.");
      }
      setDetailsRow(payload.data);
      setDetailsOpen(true);
    } catch (error) {
      toast.error({
        description:
          error instanceof Error
            ? error.message
            : "Errore caricando i dettagli pagamento.",
      });
    } finally {
      setDetailsLoading(false);
      setDetailsTargetId(null);
    }
  };

  // ── Test receipt handlers
  const openTestModal = async () => {
    setTestReceiptUrl(null);
    setTestStudentId("");
    setTestAmount("25");
    setTestLessonType("urbano");
    setTestOpen(true);
    if (testStudents.length === 0) {
      setTestStudentsLoading(true);
      try {
        const res = await getAutoscuolaStudentsList();
        if (res.success) setTestStudents(res.data);
      } finally {
        setTestStudentsLoading(false);
      }
    }
  };

  const handleGenerateTestReceipt = async () => {
    const amount = parseFloat(testAmount.replace(",", "."));
    if (!testStudentId) return toast.error({ description: "Seleziona un allievo." });
    if (!amount || amount <= 0) return toast.error({ description: "Inserisci un importo valido." });
    setTestGenerating(true);
    try {
      const res = await generateTestPaymentReceipt({
        studentId: testStudentId,
        amount,
        lessonType: testLessonType,
      });
      if (!res.success) throw new Error(res.message);
      setTestReceiptUrl(res.data.receiptUrl);
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : "Errore generazione ricevuta.",
      });
    } finally {
      setTestGenerating(false);
    }
  };

  const stripeReady = stripeStatus?.ready === true;
  const stripeStatusLabel = stripeReady
    ? "Attivo"
    : stripeStatus?.connected
      ? "In verifica"
      : "Non connesso";
  const stripeStatusClassName = stripeReady
    ? "text-emerald-700"
    : stripeStatus?.connected
      ? "text-amber-700"
      : "text-muted-foreground";

  const stripeConfigured = stripeStatus?.connected === true;
  const togglePaymentSection = (key: string) =>
    setPaymentSection((prev) => (prev === key ? null : key));

  return (
    <PageWrapper
      title="Pagamenti"
      subTitle="Gestisci incassi, crediti guida e fatturazione"
    >
      <div className="relative w-full space-y-5" data-testid="autoscuole-payments-page">
        <LottieLoadingOverlay visible={loading} />
        {tabs}

        {loading ? (
          <PaymentsSkeleton />
        ) : !stripeConfigured ? (
          /* ── Stripe NOT configured: empty state ── */
          <>
        <div className="rounded-2xl border border-border bg-white p-8 shadow-card">
          <div className="mx-auto flex max-w-sm flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-50">
              <CreditCard className="h-7 w-7 text-yellow-600" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">Configura Stripe per iniziare</h3>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Collega il tuo account Stripe per attivare pagamenti automatici e fatturazione.
            </p>
            <Button
              className="mt-5"
              onClick={handleOpenStripeOnboarding}
              disabled={stripeOnboardingLoading}
            >
              {stripeOnboardingLoading ? "Apertura..." : "Configura Stripe"}
            </Button>
          </div>
        </div>

        {/* Crediti guida — available without Stripe */}
        <div className="rounded-2xl border border-border bg-white p-5 shadow-card space-y-4">
          <div
            role="switch"
            tabIndex={0}
            aria-checked={lessonCreditFlowEnabled}
            onClick={() => setLessonCreditFlowEnabled((v) => !v)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLessonCreditFlowEnabled((v) => !v); } }}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors",
              lessonCreditFlowEnabled ? "border-yellow-200 bg-yellow-50" : "border-border bg-white",
            )}
          >
            <div>
              <h3 className="text-sm font-semibold text-foreground">Crediti guida e penali</h3>
              <p className="text-xs text-muted-foreground">Gestisci crediti e penali senza Stripe</p>
            </div>
            <InlineToggle checked={lessonCreditFlowEnabled} />
          </div>

          {lessonCreditFlowEnabled && (
            <div
              role="switch"
              tabIndex={0}
              aria-checked={lessonCreditsRequired}
              onClick={() => setLessonCreditsRequired((v) => !v)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLessonCreditsRequired((v) => !v); } }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors",
                lessonCreditsRequired ? "border-yellow-200 bg-yellow-50" : "border-border bg-white",
              )}
            >
              <div>
                <h3 className="text-sm font-semibold text-foreground">Crediti obbligatori per prenotare</h3>
                <p className="text-xs text-muted-foreground">Se disattivato, gli allievi possono prenotare anche senza crediti. Le guide senza credito risulteranno da pagare.</p>
              </div>
              <InlineToggle checked={lessonCreditsRequired} />
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          </div>
        </div>
          </>
        ) : (
          /* ── Stripe configured ── */
          <>
        {/* Stripe status bar */}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-white px-5 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", stripeReady ? "bg-positive" : "bg-yellow-400 animate-pulse")} />
            <span className={cn("text-sm font-semibold", stripeReady ? "text-emerald-700" : "text-amber-700")}>
              {stripeReady ? "Stripe attivo" : "Stripe in verifica"}
            </span>
            <span className="text-xs text-muted-foreground">{stripeStatus?.accountId ?? ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => loadStripeStatus(true)} disabled={stripeLoading}>
              {stripeLoading ? "Sync..." : "Aggiorna"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleOpenStripeOnboarding} disabled={stripeOnboardingLoading}>
              Gestisci Stripe
            </Button>
          </div>
        </div>

        {stripeStatus?.requirementsCurrentlyDue?.length ? (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
            <div className="text-xs font-semibold text-yellow-800">Dati/documenti richiesti da Stripe</div>
            <div className="mt-1 text-xs text-yellow-700">{stripeStatus.requirementsCurrentlyDue.slice(0, 6).join(" · ")}</div>
          </div>
        ) : null}

        {/* Settings accordion */}
        <div className="rounded-2xl border border-border bg-white shadow-card">
          {/* Crediti e prezzi */}
          <PaymentAccordion
            title="Crediti e prezzi"
            description="Tariffe guida, crediti e penali annullamento"
            expanded={paymentSection === "pricing"}
            onToggle={() => togglePaymentSection("pricing")}
            isFirst
          >
            <div className="space-y-4">
              <div
                role="switch"
                tabIndex={0}
                aria-checked={lessonCreditFlowEnabled}
                onClick={() => setLessonCreditFlowEnabled((v) => !v)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLessonCreditFlowEnabled((v) => !v); } }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors",
                  lessonCreditFlowEnabled ? "border-yellow-200 bg-yellow-50" : "border-border bg-white",
                )}
              >
                <div>
                  <span className="text-sm font-medium text-foreground">Crediti guida e penali</span>
                  <p className="text-xs text-muted-foreground">Gestisci crediti e penali per annullamenti tardivi</p>
                </div>
                <InlineToggle checked={lessonCreditFlowEnabled} />
              </div>

              {lessonCreditFlowEnabled && (
                <div
                  role="switch"
                  tabIndex={0}
                  aria-checked={lessonCreditsRequired}
                  onClick={() => setLessonCreditsRequired((v) => !v)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLessonCreditsRequired((v) => !v); } }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors",
                    lessonCreditsRequired ? "border-yellow-200 bg-yellow-50" : "border-border bg-white",
                  )}
                >
                  <div>
                    <span className="text-sm font-medium text-foreground">Crediti obbligatori per prenotare</span>
                    <p className="text-xs text-muted-foreground">Se disattivato, gli allievi possono prenotare anche senza crediti. Le guide senza credito risulteranno da pagare.</p>
                  </div>
                  <InlineToggle checked={lessonCreditsRequired} />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
                <FieldGroup label="Prezzo guida 30m">
                  <input className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-primary/40" value={lessonPrice30} onChange={(e) => setLessonPrice30(e.target.value)} inputMode="decimal" />
                </FieldGroup>
                <FieldGroup label="Prezzo guida 60m">
                  <input className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-primary/40" value={lessonPrice60} onChange={(e) => setLessonPrice60(e.target.value)} inputMode="decimal" />
                </FieldGroup>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
                <FieldGroup label="Cutoff penale">
                  <Select value={penaltyCutoffHoursPreset} onValueChange={setPenaltyCutoffHoursPreset}>
                    <SelectTrigger><SelectValue placeholder="Ore" /></SelectTrigger>
                    <SelectContent>{cutoffPresets.map((p) => (<SelectItem key={p} value={String(p)}>{p} ore</SelectItem>))}</SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Penale">
                  <Select value={penaltyPercentPreset} onValueChange={setPenaltyPercentPreset}>
                    <SelectTrigger><SelectValue placeholder="%" /></SelectTrigger>
                    <SelectContent>{penaltyPresets.map((p) => (<SelectItem key={p} value={String(p)}>{p}%</SelectItem>))}</SelectContent>
                  </Select>
                </FieldGroup>
              </div>
            </div>
          </PaymentAccordion>

          {/* Pagamenti automatici — only if Stripe ready */}
          {stripeReady && (
            <PaymentAccordion
              title="Pagamenti automatici"
              description="Addebito automatico Stripe e fatturazione FIC"
              expanded={paymentSection === "auto"}
              onToggle={() => togglePaymentSection("auto")}
            >
              <div className="space-y-4">
                <div
                  role="switch"
                  tabIndex={0}
                  aria-checked={autoPaymentsEnabled}
                  onClick={() => setAutoPaymentsEnabled((v) => !v)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAutoPaymentsEnabled((v) => !v); } }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors",
                    autoPaymentsEnabled ? "border-yellow-200 bg-yellow-50" : "border-border bg-white",
                  )}
                >
                  <div>
                    <span className="text-sm font-medium text-foreground">Abilita pagamenti automatici</span>
                    <p className="text-xs text-muted-foreground">Addebito a fine guida con fattura automatica</p>
                  </div>
                  <InlineToggle checked={autoPaymentsEnabled} />
                </div>

                {autoPaymentsEnabled && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
                      <FieldGroup label="Aliquota IVA FIC">
                        <Select value={ficVatTypeId} onValueChange={setFicVatTypeId} onOpenChange={(open) => { if (open) void loadFicOptions(); }}>
                          <SelectTrigger><SelectValue placeholder={vatLoading ? "Caricamento..." : "Seleziona aliquota"} /></SelectTrigger>
                          <SelectContent>{vatOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
                        </Select>
                      </FieldGroup>
                      <FieldGroup label="Metodo pagamento FIC">
                        <Select value={ficPaymentMethodId} onValueChange={setFicPaymentMethodId} onOpenChange={(open) => { if (open) void loadFicOptions(); }}>
                          <SelectTrigger><SelectValue placeholder={methodLoading ? "Caricamento..." : "Seleziona metodo"} /></SelectTrigger>
                          <SelectContent>{methodOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
                        </Select>
                      </FieldGroup>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fatture in Cloud resta opzionale: se non configurato, le fatture vengono marcate in attesa.
                    </p>
                  </>
                )}
              </div>
            </PaymentAccordion>
          )}

          {/* Notifiche */}
          <PaymentAccordion
            title="Notifiche pagamento"
            description="Canali di comunicazione per notifiche addebito"
            expanded={paymentSection === "notifications"}
            onToggle={() => togglePaymentSection("notifications")}
            isLast
          >
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={pushEnabled} onCheckedChange={(c) => setPushEnabled(Boolean(c))} />
                Push
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={emailEnabled} onCheckedChange={(c) => setEmailEnabled(Boolean(c))} />
                Email
              </label>
            </div>
          </PaymentAccordion>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Salvataggio..." : "Salva configurazione"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <StatMetric label="Guide con pagamento" value={overview?.totalRequired ?? 0} accent="default" />
          <StatMetric label="Pagate" value={overview?.paidCount ?? 0} accent="green" />
          <StatMetric label="Insoluti" value={overview?.insolutiCount ?? 0} accent="pink" />
          <StatMetric label="In attesa penale" value={overview?.pendingPenaltyCount ?? 0} accent="yellow" />
          <StatMetric label="Parziali" value={overview?.partialCount ?? 0} accent="default" />
        </div>

        <SectionCard
          title="Operativo pagamenti guide"
          headerRight={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openTestModal}
            >
              Prova ricevuta
            </Button>
          }
        >
          <div className="max-h-[540px] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Data</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Allievo</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Stato guida</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Stato pagamento</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Prezzo</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Penale</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Pagato</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Dovuto</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Fattura</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Ultimo tentativo</th>
                  <th className="px-3 py-2.5 ds-caption text-muted-foreground uppercase">Logs</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((row) => {
                  const latestPayment = row.payments[0];
                  return (
                    <tr key={row.id} className="border-t border-border text-foreground hover:bg-yellow-50/30 transition-colors">
                      <td className="px-3 py-2.5 tabular-nums">{formatDateTime(row.startsAt)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{row.student.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.student.email}</div>
                      </td>
                      <td className="px-3 py-2.5">{row.status}</td>
                      <td className="px-3 py-2.5">{statusLabel(row.paymentStatus)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatMoney(row.priceAmount)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatMoney(row.penaltyAmount)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatMoney(row.paidAmount)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-medium">{formatMoney(row.dueAmount)}</td>
                      <td className="px-3 py-2.5">
                        {row.invoiceId ? (
                          <span className="text-xs">{row.invoiceId}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{row.invoiceStatus ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {latestPayment ? (
                          <div>
                            <div className="ds-caption text-muted-foreground uppercase">
                              {phaseLabel(latestPayment.phase)}
                            </div>
                            <div className="text-xs">{paymentAttemptStatusLabel(latestPayment.status)}</div>
                            {latestPayment.failureMessage ? (
                              <div className="text-xs text-rose-500">{latestPayment.failureMessage}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPaymentDetails(row.id)}
                          disabled={detailsLoading}
                        >
                          {detailsLoading && detailsTargetId === row.id ? "..." : "Dettagli"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!appointments.length ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nessuna guida con pagamento automatico trovata.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
          </>
        )}
      </div>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dettagli pagamento guida</DialogTitle>
          </DialogHeader>
          {detailsRow ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Allievo</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {detailsRow.student?.name || "-"}
                  </div>
                  <div className="text-xs text-muted-foreground">{detailsRow.student?.email || "-"}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Guida</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatDateTime(detailsRow.startsAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">Stato: {detailsRow.status}</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Prezzo
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatMoney(detailsRow.priceAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Penale
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatMoney(detailsRow.penaltyAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Pagato
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatMoney(detailsRow.paidAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Dovuto
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatMoney(detailsRow.dueAmount)}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Stato fattura
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {detailsRow.invoiceId
                    ? `Emessa (${detailsRow.invoiceId})`
                    : detailsRow.invoiceStatus ?? "Nessuna"}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Tentativi pagamento</h4>
                <div className="max-h-[280px] space-y-2 overflow-auto pr-1">
                  {detailsRow.payments.length ? (
                    detailsRow.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-xl border border-border/60 bg-muted/20 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            {phaseLabel(payment.phase)}
                          </div>
                          <div className="text-xs font-medium text-foreground">
                            {paymentAttemptStatusLabel(payment.status)}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-foreground">
                          {formatMoney(payment.amount)} · Tentativo #{payment.attemptCount}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Creato: {formatDateTime(payment.createdAt)}
                          {payment.paidAt ? ` · Pagato: ${formatDateTime(payment.paidAt)}` : ""}
                        </div>
                        {payment.nextAttemptAt ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Prossimo retry: {formatDateTime(payment.nextAttemptAt)}
                          </div>
                        ) : null}
                        {payment.stripePaymentIntentId ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            PI: {payment.stripePaymentIntentId}
                          </div>
                        ) : null}
                        {payment.stripeChargeId ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Charge: {payment.stripeChargeId}
                          </div>
                        ) : null}
                        {payment.failureMessage ? (
                          <div className="mt-1 text-xs text-rose-600">{payment.failureMessage}</div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                      Nessun tentativo registrato.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-sm text-muted-foreground">Nessun dettaglio disponibile.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Test receipt modal */}
      <Dialog open={testOpen} onOpenChange={(open) => { setTestOpen(open); if (!open) setTestReceiptUrl(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prova Ricevuta Pagamento</DialogTitle>
          </DialogHeader>

          {testReceiptUrl ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-semibold text-emerald-800">
                  Ricevuta generata con successo!
                </div>
                <p className="mt-1 text-xs text-emerald-700">
                  L&apos;allievo può ora visualizzarla nell&apos;app mobile dalla sezione pagamenti.
                </p>
              </div>

              <a
                href={testReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Apri ricevuta PDF ↗
              </a>

              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                <span className="font-semibold">Nota:</span> è stato creato un appuntamento di prova
                visibile nella lista pagamenti (con nota &quot;[TEST]&quot;).
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setTestReceiptUrl(null)}
              >
                Genera un&apos;altra
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Crea una guida di prova con pagamento completato e genera la ricevuta PDF che l&apos;allievo
                vedrà nell&apos;app.
              </p>

              <FieldGroup label="Allievo" required>
                <Select
                  value={testStudentId}
                  onValueChange={setTestStudentId}
                  disabled={testStudentsLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={testStudentsLoading ? "Caricamento allievi..." : "Seleziona allievo"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {testStudents.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-medium">{s.name}</span>
                        {s.email ? <span className="ml-1 text-muted-foreground">{s.email}</span> : null}
                      </SelectItem>
                    ))}
                    {!testStudentsLoading && testStudents.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nessun allievo trovato.
                      </div>
                    ) : null}
                  </SelectContent>
                </Select>
              </FieldGroup>

              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Importo (€)" required>
                  <input
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-primary/40"
                    value={testAmount}
                    onChange={(e) => setTestAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="25.00"
                  />
                </FieldGroup>
                <FieldGroup label="Tipo guida">
                  <Select value={testLessonType} onValueChange={setTestLessonType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { value: "urbano", label: "Urbano" },
                        { value: "extraurbano", label: "Extraurbano" },
                        { value: "notturna", label: "Notturna" },
                        { value: "autostrada", label: "Autostrada" },
                        { value: "manovre", label: "Manovre" },
                        { value: "guida", label: "Guida" },
                      ].map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleGenerateTestReceipt}
                disabled={testGenerating || !testStudentId}
              >
                {testGenerating ? "Generazione in corso..." : "Genera ricevuta"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}

function PaymentAccordion({
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
