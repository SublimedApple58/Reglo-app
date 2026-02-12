"use client";

import React from "react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAutoscuolaPaymentsAppointmentsAction,
  getAutoscuolaPaymentsOverviewAction,
} from "@/lib/actions/autoscuole.actions";
import {
  getAutoscuolaSettings,
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
  }>;
};

type SelectOption = {
  value: string;
  label: string;
};

const cutoffPresets = [1, 2, 4, 6, 12, 24, 48] as const;
const penaltyPresets = [25, 50, 75, 100] as const;

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

export function AutoscuolePaymentsPage({
  hideNav = false,
  tabs,
}: {
  hideNav?: boolean;
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [overview, setOverview] = React.useState<PaymentOverview | null>(null);
  const [appointments, setAppointments] = React.useState<PaymentAppointment[]>([]);
  const [vatOptions, setVatOptions] = React.useState<SelectOption[]>([]);
  const [methodOptions, setMethodOptions] = React.useState<SelectOption[]>([]);
  const [vatLoading, setVatLoading] = React.useState(false);
  const [methodLoading, setMethodLoading] = React.useState(false);

  const [autoPaymentsEnabled, setAutoPaymentsEnabled] = React.useState(false);
  const [lessonPrice30, setLessonPrice30] = React.useState("25");
  const [lessonPrice60, setLessonPrice60] = React.useState("50");
  const [penaltyCutoffHoursPreset, setPenaltyCutoffHoursPreset] = React.useState("24");
  const [penaltyPercentPreset, setPenaltyPercentPreset] = React.useState("50");
  const [ficVatTypeId, setFicVatTypeId] = React.useState<string>("");
  const [ficPaymentMethodId, setFicPaymentMethodId] = React.useState<string>("");
  const [pushEnabled, setPushEnabled] = React.useState(true);
  const [emailEnabled, setEmailEnabled] = React.useState(true);

  const loadFicOptions = React.useCallback(async () => {
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
        setVatOptions(vatPayload.data ?? []);
      }

      if (!methodRes.ok || !methodPayload?.success) {
        setMethodOptions([]);
      } else {
        setMethodOptions(methodPayload.data ?? []);
      }
    } finally {
      setVatLoading(false);
      setMethodLoading(false);
    }
  }, []);

  const loadPage = React.useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, overviewRes, appointmentsRes] = await Promise.all([
        getAutoscuolaSettings(),
        getAutoscuolaPaymentsOverviewAction(),
        getAutoscuolaPaymentsAppointmentsAction(100),
      ]);

      if (!settingsRes.success || !settingsRes.data) {
        throw new Error(settingsRes.message ?? "Impossibile caricare impostazioni pagamenti.");
      }

      setAutoPaymentsEnabled(Boolean(settingsRes.data.autoPaymentsEnabled));
      setLessonPrice30(String(settingsRes.data.lessonPrice30 ?? 25));
      setLessonPrice60(String(settingsRes.data.lessonPrice60 ?? 50));
      setPenaltyCutoffHoursPreset(String(settingsRes.data.penaltyCutoffHoursPreset ?? 24));
      setPenaltyPercentPreset(String(settingsRes.data.penaltyPercentPreset ?? 50));
      setFicVatTypeId(settingsRes.data.ficVatTypeId ?? "");
      setFicPaymentMethodId(settingsRes.data.ficPaymentMethodId ?? "");

      const channels = settingsRes.data.paymentNotificationChannels ?? ["push", "email"];
      setPushEnabled(channels.includes("push"));
      setEmailEnabled(channels.includes("email"));

      if (overviewRes.success && overviewRes.data) {
        setOverview(overviewRes.data as PaymentOverview);
      } else {
        setOverview(null);
      }

      if (appointmentsRes.success && appointmentsRes.data) {
        setAppointments(appointmentsRes.data as PaymentAppointment[]);
      } else {
        setAppointments([]);
      }

      await loadFicOptions();
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
  }, [loadFicOptions, toast]);

  React.useEffect(() => {
    loadPage();
  }, [loadPage]);

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
      if (!ficVatTypeId) {
        toast.error({ description: "Seleziona aliquota IVA FIC." });
        return;
      }
      if (!ficPaymentMethodId) {
        toast.error({ description: "Seleziona metodo pagamento FIC." });
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
              <Select value={ficVatTypeId} onValueChange={setFicVatTypeId}>
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
              <Select value={ficPaymentMethodId} onValueChange={setFicPaymentMethodId}>
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
                    </tr>
                  );
                })}
                {!appointments.length ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nessuna guida con pagamento automatico trovata.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ClientPageWrapper>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <input
        className="h-10 w-full rounded-xl border border-white/60 bg-white/80 px-3 text-sm text-foreground outline-none focus:border-foreground/25"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
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
