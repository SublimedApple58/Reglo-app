"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
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
  hideNav = false,
  tabs,
}: {
  hideNav?: boolean;
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
  const [lessonPrice30, setLessonPrice30] = React.useState("25");
  const [lessonPrice60, setLessonPrice60] = React.useState("50");
  const [penaltyCutoffHoursPreset, setPenaltyCutoffHoursPreset] = React.useState("24");
  const [penaltyPercentPreset, setPenaltyPercentPreset] = React.useState("50");
  const [ficVatTypeId, setFicVatTypeId] = React.useState<string>("");
  const [ficPaymentMethodId, setFicPaymentMethodId] = React.useState<string>("");
  const [pushEnabled, setPushEnabled] = React.useState(true);
  const [emailEnabled, setEmailEnabled] = React.useState(true);

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

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Pagamenti automatici guide e fatturazione FIC"
      hideHero
      contentWidthClassName="max-w-[1600px]"
    >
      <div className="w-full space-y-5">
        {tabs}
        {!hideNav ? <AutoscuoleNav /> : null}

        <div className="glass-panel glass-strong space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Stripe incassi autoscuola</h3>
              <p className="text-xs text-muted-foreground">
                Reglo ti guida nella procedura Stripe: termini, IBAN, P.IVA e documenti.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadStripeStatus(true)}
                disabled={stripeOnboardingLoading || stripeLoading}
              >
                {stripeLoading ? "Sync..." : "Aggiorna stato"}
              </Button>
              <Button
                onClick={handleOpenStripeOnboarding}
                disabled={stripeOnboardingLoading || stripeLoading}
              >
                {stripeOnboardingLoading
                  ? "Apertura..."
                  : stripeStatus?.ready
                    ? "Gestisci Stripe"
                    : stripeStatus?.connected
                    ? "Completa onboarding Stripe"
                    : "Configura Stripe"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/60 bg-white/75 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Stato</div>
              <div className={`mt-1 text-sm font-semibold ${stripeStatusClassName}`}>
                {stripeLoading ? "Caricamento..." : stripeStatusLabel}
              </div>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/75 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Account
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {stripeStatus?.accountId ?? "-"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/75 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Capacita
              </div>
              <div className="mt-1 text-sm text-foreground">
                Pagamenti: {stripeStatus?.chargesEnabled ? "OK" : "NO"} · Payout:{" "}
                {stripeStatus?.payoutsEnabled ? "OK" : "NO"}
              </div>
            </div>
          </div>

          {stripeStatus?.requirementsCurrentlyDue?.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
              <div className="text-xs font-semibold text-amber-800">
                Dati/documenti richiesti da Stripe
              </div>
              <div className="mt-1 text-xs text-amber-700">
                {stripeStatus.requirementsCurrentlyDue.slice(0, 6).join(" · ")}
              </div>
            </div>
          ) : null}

          {stripeStatus?.syncError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-700">
              Ultimo sync Stripe: {stripeStatus.syncError}
            </div>
          ) : null}
        </div>

        <div className="glass-panel glass-strong space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Pagamenti automatici</h3>
              <p className="text-xs text-muted-foreground">
                Prenotazione gratuita, penale al cutoff e saldo automatico a fine guida.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={autoPaymentsEnabled}
                onCheckedChange={(checked) => setAutoPaymentsEnabled(Boolean(checked))}
              />
              Abilitato
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field
              label="Prezzo guida 30m"
              value={lessonPrice30}
              onChange={setLessonPrice30}
            />
            <Field
              label="Prezzo guida 60m"
              value={lessonPrice60}
              onChange={setLessonPrice60}
            />
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Cutoff penale</div>
              <Select value={penaltyCutoffHoursPreset} onValueChange={setPenaltyCutoffHoursPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Ore" />
                </SelectTrigger>
                <SelectContent>
                  {cutoffPresets.map((preset) => (
                    <SelectItem key={preset} value={String(preset)}>
                      {preset} ore
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Penale</div>
              <Select value={penaltyPercentPreset} onValueChange={setPenaltyPercentPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Percentuale" />
                </SelectTrigger>
                <SelectContent>
                  {penaltyPresets.map((preset) => (
                    <SelectItem key={preset} value={String(preset)}>
                      {preset}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Aliquota IVA FIC</div>
              <Select
                value={ficVatTypeId}
                onValueChange={setFicVatTypeId}
                onOpenChange={(open) => {
                  if (open) void loadFicOptions();
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={vatLoading ? "Caricamento IVA..." : "Seleziona aliquota"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {vatOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Metodo pagamento FIC
              </div>
              <Select
                value={ficPaymentMethodId}
                onValueChange={setFicPaymentMethodId}
                onOpenChange={(open) => {
                  if (open) void loadFicOptions();
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      methodLoading ? "Caricamento metodi..." : "Seleziona metodo pagamento"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {methodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-2xl border border-white/60 bg-white/75 p-3">
              <div className="text-xs font-medium text-muted-foreground">Notifiche pagamento</div>
              <label className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span>Push</span>
                <Checkbox
                  checked={pushEnabled}
                  onCheckedChange={(checked) => setPushEnabled(Boolean(checked))}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span>Email</span>
                <Checkbox
                  checked={emailEnabled}
                  onCheckedChange={(checked) => setEmailEnabled(Boolean(checked))}
                />
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Fatture in Cloud resta opzionale all&apos;attivazione: se non configurato, le fatture
            vengono marcate in attesa e completate appena disponibile.
          </p>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "Salvataggio..." : "Salva configurazione"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <StatCard label="Guide con pagamento" value={overview?.totalRequired ?? 0} />
          <StatCard label="Pagate" value={overview?.paidCount ?? 0} />
          <StatCard label="Insoluti" value={overview?.insolutiCount ?? 0} />
          <StatCard label="In attesa penale" value={overview?.pendingPenaltyCount ?? 0} />
          <StatCard label="Parziali" value={overview?.partialCount ?? 0} />
        </div>

        <div className="glass-panel glass-strong space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Operativo pagamenti guide</h3>
            {loading ? <span className="text-xs text-muted-foreground">Caricamento...</span> : null}
          </div>

          <div className="max-h-[540px] overflow-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur">
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Allievo</th>
                  <th className="px-3 py-2">Stato guida</th>
                  <th className="px-3 py-2">Stato pagamento</th>
                  <th className="px-3 py-2">Prezzo</th>
                  <th className="px-3 py-2">Penale</th>
                  <th className="px-3 py-2">Pagato</th>
                  <th className="px-3 py-2">Dovuto</th>
                  <th className="px-3 py-2">Fattura</th>
                  <th className="px-3 py-2">Ultimo tentativo</th>
                  <th className="px-3 py-2">Logs</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((row) => {
                  const latestPayment = row.payments[0];
                  return (
                    <tr key={row.id} className="border-t border-white/40 text-foreground">
                      <td className="px-3 py-2">{formatDateTime(row.startsAt)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.student.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.student.email}</div>
                      </td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{statusLabel(row.paymentStatus)}</td>
                      <td className="px-3 py-2">{formatMoney(row.priceAmount)}</td>
                      <td className="px-3 py-2">{formatMoney(row.penaltyAmount)}</td>
                      <td className="px-3 py-2">{formatMoney(row.paidAmount)}</td>
                      <td className="px-3 py-2">{formatMoney(row.dueAmount)}</td>
                      <td className="px-3 py-2">
                        {row.invoiceId ? (
                          <span>{row.invoiceId}</span>
                        ) : (
                          <span className="text-muted-foreground">{row.invoiceStatus ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {latestPayment ? (
                          <div>
                            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                              {latestPayment.phase}
                            </div>
                            <div>{latestPayment.status}</div>
                            {latestPayment.failureMessage ? (
                              <div className="text-xs text-rose-500">{latestPayment.failureMessage}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPaymentDetails(row.id)}
                          disabled={detailsLoading}
                        >
                          {detailsLoading && detailsTargetId === row.id ? "Caricamento..." : "Dettagli"}
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
        </div>
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
    </ClientPageWrapper>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode = "decimal",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <input
        className="h-10 w-full rounded-xl border border-white/60 bg-white/80 px-3 text-sm text-foreground outline-none focus:border-foreground/25"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-panel glass-strong rounded-2xl p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
