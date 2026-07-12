"use client";

import React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  addBackofficeLicensePurchase,
  deleteBackofficeCompanyPlan,
  deleteBackofficeLicensePurchase,
  getBackofficeCompanyPlan,
  saveBackofficeCompanyPlan,
  type LicensePurchaseDto,
} from "@/lib/actions/company-plan.actions";
import {
  BILLING_PERIOD_LABELS,
  BILLING_PERIOD_SUFFIX,
  centsToEuroInput,
  formatEuroCents,
  parseEuroToCents,
} from "@/lib/company-plan";

type FormState = {
  billingPeriod: "monthly" | "annual";
  renewsAt: string; // yyyy-mm-dd | ""
  instructorSeats: string;
  instructorSeatPrice: string;
  voiceEnabled: boolean;
  voicePrice: string;
};

const EMPTY_FORM: FormState = {
  billingPeriod: "annual",
  renewsAt: "",
  instructorSeats: "1",
  instructorSeatPrice: "0,00",
  voiceEnabled: false,
  voicePrice: "0,00",
};

// Listino Segretaria AI: precompilato all'attivazione / cambio periodo
// (annuale 350 € + consumi, mensile 39 €/mese) — resta modificabile.
const VOICE_DEFAULT_PRICE: Record<"monthly" | "annual", string> = {
  annual: "350,00",
  monthly: "39,00",
};

function todayLocal() {
  const now = new Date();
  const pad = (v: number) => v.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function purchaseDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Assegnazione del piano commerciale di una autoscuola dal backoffice:
 * periodo (mensile/annuale), rinnovo, posti istruttore × prezzo, Segretaria
 * AI. Sotto, il REGISTRO degli acquisti una tantum di licenze formazione:
 * ogni acquisto (anche futuri riacquisti) è una riga con data, licenze e
 * prezzo per licenza — il titolare li vede in Area personale → Abbonamento.
 * NB: qui si definisce solo la composizione/prezzo — l'attivazione operativa
 * dei servizi resta nel drawer "Gestisci".
 */
export function BackofficeCompanyPlanDialog({
  company,
  onOpenChange,
}: {
  company: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useFeedbackToast();
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [purchases, setPurchases] = React.useState<LicensePurchaseDto[]>([]);
  const [hasPlan, setHasPlan] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  // form nuovo acquisto licenze
  const [purchaseSeats, setPurchaseSeats] = React.useState("100");
  const [purchaseSeatPrice, setPurchaseSeatPrice] = React.useState("2,50");
  const [purchaseDate, setPurchaseDate] = React.useState(todayLocal());
  const [addingPurchase, setAddingPurchase] = React.useState(false);
  const [deletingPurchaseId, setDeletingPurchaseId] = React.useState<string | null>(null);

  const companyId = company?.id ?? null;

  React.useEffect(() => {
    if (!companyId) return;
    let active = true;
    setLoading(true);
    setForm(EMPTY_FORM);
    setPurchases([]);
    setHasPlan(false);
    setPurchaseSeats("100");
    setPurchaseSeatPrice("2,50");
    setPurchaseDate(todayLocal());
    getBackofficeCompanyPlan(companyId).then((res) => {
      if (!active) return;
      if (res.success && res.data) {
        setPurchases(res.data.licensePurchases);
        if (res.data.plan) {
          const plan = res.data.plan;
          setHasPlan(true);
          setForm({
            billingPeriod: plan.billingPeriod,
            renewsAt: plan.renewsAt ? plan.renewsAt.slice(0, 10) : "",
            instructorSeats: String(plan.instructorSeats),
            instructorSeatPrice: centsToEuroInput(plan.instructorSeatPriceCents),
            voiceEnabled: plan.voiceEnabled,
            voicePrice: centsToEuroInput(plan.voicePriceCents),
          });
        }
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  const parsed = React.useMemo(() => {
    const instructorSeats = Number(form.instructorSeats);
    const instructorSeatPriceCents = parseEuroToCents(form.instructorSeatPrice);
    const voicePriceCents = parseEuroToCents(form.voicePrice);
    const valid =
      Number.isInteger(instructorSeats) &&
      instructorSeats >= 0 &&
      instructorSeatPriceCents !== null &&
      (!form.voiceEnabled || voicePriceCents !== null);
    const totalCents = valid
      ? instructorSeats * (instructorSeatPriceCents ?? 0) +
        (form.voiceEnabled ? (voicePriceCents ?? 0) : 0)
      : null;
    return {
      valid,
      totalCents,
      instructorSeats,
      instructorSeatPriceCents: instructorSeatPriceCents ?? 0,
      voicePriceCents: voicePriceCents ?? 0,
    };
  }, [form]);

  const parsedPurchase = React.useMemo(() => {
    const seats = Number(purchaseSeats);
    const seatPriceCents = parseEuroToCents(purchaseSeatPrice);
    const valid =
      Number.isInteger(seats) && seats > 0 && seatPriceCents !== null && Boolean(purchaseDate);
    return {
      valid,
      seats,
      seatPriceCents: seatPriceCents ?? 0,
      totalCents: valid ? seats * (seatPriceCents ?? 0) : null,
    };
  }, [purchaseSeats, purchaseSeatPrice, purchaseDate]);

  const setPeriod = (period: "monthly" | "annual") => {
    setForm((p) => ({
      ...p,
      billingPeriod: period,
      // se il prezzo Segretaria è ancora il listino dell'altro periodo, aggiornalo
      voicePrice:
        p.voiceEnabled && p.voicePrice === VOICE_DEFAULT_PRICE[p.billingPeriod]
          ? VOICE_DEFAULT_PRICE[period]
          : p.voicePrice,
    }));
  };

  const toggleVoice = () => {
    setForm((p) => ({
      ...p,
      voiceEnabled: !p.voiceEnabled,
      // all'attivazione precompila il listino se il campo è vuoto/zero
      voicePrice:
        !p.voiceEnabled && (!p.voicePrice || p.voicePrice === "0,00")
          ? VOICE_DEFAULT_PRICE[p.billingPeriod]
          : p.voicePrice,
    }));
  };

  const save = async () => {
    if (!companyId || !parsed.valid || saving) return;
    setSaving(true);
    try {
      const res = await saveBackofficeCompanyPlan({
        companyId,
        billingPeriod: form.billingPeriod,
        renewsAt: form.renewsAt || null,
        instructorSeats: parsed.instructorSeats,
        instructorSeatPriceCents: parsed.instructorSeatPriceCents,
        voiceEnabled: form.voiceEnabled,
        voicePriceCents: parsed.voicePriceCents,
      });
      if (!res.success) {
        toast.error({ description: res.message ?? "Salvataggio non riuscito." });
        return;
      }
      setHasPlan(true);
      toast.success({ description: "Piano assegnato." });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!companyId || removing) return;
    setRemoving(true);
    try {
      const res = await deleteBackofficeCompanyPlan(companyId);
      if (!res.success) {
        toast.error({ description: res.message ?? "Rimozione non riuscita." });
        return;
      }
      toast.success({ description: "Piano rimosso." });
      onOpenChange(false);
    } finally {
      setRemoving(false);
    }
  };

  const addPurchase = async () => {
    if (!companyId || !parsedPurchase.valid || addingPurchase) return;
    setAddingPurchase(true);
    try {
      const res = await addBackofficeLicensePurchase({
        companyId,
        seats: parsedPurchase.seats,
        seatPriceCents: parsedPurchase.seatPriceCents,
        purchasedAt: purchaseDate,
      });
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Registrazione non riuscita." });
        return;
      }
      setPurchases((prev) =>
        [res.data.purchase, ...prev].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
      );
      toast.success({ description: "Acquisto registrato." });
    } finally {
      setAddingPurchase(false);
    }
  };

  const removePurchase = async (purchaseId: string) => {
    setDeletingPurchaseId(purchaseId);
    try {
      const res = await deleteBackofficeLicensePurchase(purchaseId);
      if (!res.success) {
        toast.error({ description: res.message ?? "Eliminazione non riuscita." });
        return;
      }
      setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
    } finally {
      setDeletingPurchaseId(null);
    }
  };

  return (
    <Dialog open={Boolean(company)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Piano — {company?.name}</DialogTitle>
          <DialogDescription>
            La composizione del piano che il titolare vede in Area personale → Abbonamento.
            L&apos;attivazione operativa dei servizi resta in &quot;Gestisci&quot;.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Periodo</Label>
                <Select
                  value={form.billingPeriod}
                  onValueChange={(v) => setPeriod(v as "monthly" | "annual")}
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">{BILLING_PERIOD_LABELS.annual}</SelectItem>
                    <SelectItem value="monthly">{BILLING_PERIOD_LABELS.monthly}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Si rinnova il</Label>
                <DatePickerInput
                  value={form.renewsAt}
                  onChange={(value) => setForm((p) => ({ ...p, renewsAt: value }))}
                  placeholder="Seleziona data"
                />
              </div>
            </div>

            {/* Posti istruttore */}
            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">Posti istruttore</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="plan-seats">Posti</Label>
                  <Input
                    id="plan-seats"
                    inputMode="numeric"
                    value={form.instructorSeats}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        instructorSeats: e.target.value.replace(/\D/g, "").slice(0, 2),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-seat-price">Prezzo per posto (€)</Label>
                  <Input
                    id="plan-seat-price"
                    inputMode="decimal"
                    placeholder="264,00"
                    value={form.instructorSeatPrice}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, instructorSeatPrice: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Segretaria AI */}
            <div className="rounded-lg border border-border/60 p-4">
              <button
                type="button"
                onClick={toggleVoice}
                className="flex cursor-pointer items-center gap-2.5"
              >
                <Checkbox checked={form.voiceEnabled} className="pointer-events-none" />
                <span className="text-sm font-semibold text-foreground">Segretaria AI</span>
              </button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Listino: 350,00 €/anno (+ consumi) · 39,00 €/mese. Precompilato, modificabile.
              </p>
              {form.voiceEnabled && (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="plan-voice-price">
                    Prezzo ({form.billingPeriod === "annual" ? "€/anno" : "€/mese"})
                  </Label>
                  <Input
                    id="plan-voice-price"
                    inputMode="decimal"
                    placeholder={VOICE_DEFAULT_PRICE[form.billingPeriod]}
                    value={form.voicePrice}
                    onChange={(e) => setForm((p) => ({ ...p, voicePrice: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Totale ricorrente + azioni piano */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Totale ricorrente</span>
              <span className="text-base font-bold tabular-nums text-foreground">
                {parsed.totalCents !== null
                  ? `${formatEuroCents(parsed.totalCents)}${BILLING_PERIOD_SUFFIX[form.billingPeriod]}`
                  : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              {hasPlan ? (
                <Button
                  variant="outline"
                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => void remove()}
                  disabled={removing || saving}
                >
                  {removing ? <LoadingDots /> : "Rimuovi piano"}
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={() => void save()} disabled={!parsed.valid || saving || removing}>
                {saving ? <LoadingDots /> : hasPlan ? "Salva piano" : "Assegna piano"}
              </Button>
            </div>

            {/* ── Registro acquisti una tantum: licenze formazione ── */}
            <div className="border-t border-border/60 pt-5">
              <div className="text-sm font-semibold text-foreground">
                Licenze formazione — acquisti una tantum
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Ogni acquisto è registrato a parte con la sua data (fuori dal totale
                ricorrente): quando l&apos;autoscuola ricompra licenze, registralo qui e il
                titolare lo vede in Area personale.
              </p>

              {purchases.length > 0 && (
                <div className="mt-3 space-y-2">
                  {purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 bg-white px-3.5 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground">
                          {purchase.seats} licenze × {formatEuroCents(purchase.seatPriceCents)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {purchaseDateLabel(purchase.purchasedAt)}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {formatEuroCents(purchase.totalCents)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removePurchase(purchase.id)}
                        disabled={deletingPurchaseId === purchase.id}
                        title="Elimina acquisto"
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {deletingPurchaseId === purchase.id ? (
                          <LoadingDots className="scale-[0.6]" />
                        ) : (
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Nuovo acquisto */}
              <div className="mt-3 rounded-lg border border-dashed border-border/80 p-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="purchase-seats">Licenze</Label>
                    <Input
                      id="purchase-seats"
                      inputMode="numeric"
                      value={purchaseSeats}
                      onChange={(e) =>
                        setPurchaseSeats(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchase-price">Prezzo per licenza (€)</Label>
                    <Input
                      id="purchase-price"
                      inputMode="decimal"
                      placeholder="2,50"
                      value={purchaseSeatPrice}
                      onChange={(e) => setPurchaseSeatPrice(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 items-end gap-3">
                  <div className="space-y-2">
                    <Label>Data acquisto</Label>
                    <DatePickerInput value={purchaseDate} onChange={setPurchaseDate} />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void addPurchase()}
                    disabled={!parsedPurchase.valid || addingPurchase}
                  >
                    {addingPurchase ? (
                      <LoadingDots />
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        Registra acquisto
                        {parsedPurchase.totalCents !== null &&
                          ` · ${formatEuroCents(parsedPurchase.totalCents)}`}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
