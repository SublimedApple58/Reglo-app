"use client";

import React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  deleteBackofficeCompanyPlan,
  getBackofficeCompanyPlan,
  saveBackofficeCompanyPlan,
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
  teoriaEnabled: boolean;
  teoriaSeats: string;
  teoriaPrice: string;
  voiceEnabled: boolean;
  voicePrice: string;
};

const EMPTY_FORM: FormState = {
  billingPeriod: "annual",
  renewsAt: "",
  instructorSeats: "1",
  instructorSeatPrice: "0,00",
  teoriaEnabled: false,
  teoriaSeats: "100",
  teoriaPrice: "0,00",
  voiceEnabled: false,
  voicePrice: "0,00",
};

/**
 * Assegnazione del piano commerciale di una autoscuola dal backoffice: periodo
 * (mensile/annuale), rinnovo, posti istruttore × prezzo, licenza formazione
 * (teoria) con posti, Segretaria AI. Il titolare lo vede in Area personale →
 * Abbonamento. NB: qui si definisce solo la composizione/prezzo — l'attivazione
 * operativa di teoria/voce resta nel drawer "Gestisci".
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
  const [hasPlan, setHasPlan] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const companyId = company?.id ?? null;

  React.useEffect(() => {
    if (!companyId) return;
    let active = true;
    setLoading(true);
    setForm(EMPTY_FORM);
    setHasPlan(false);
    getBackofficeCompanyPlan(companyId).then((res) => {
      if (!active) return;
      if (res.success && res.data?.plan) {
        const plan = res.data.plan;
        setHasPlan(true);
        setForm({
          billingPeriod: plan.billingPeriod,
          renewsAt: plan.renewsAt ? plan.renewsAt.slice(0, 10) : "",
          instructorSeats: String(plan.instructorSeats),
          instructorSeatPrice: centsToEuroInput(plan.instructorSeatPriceCents),
          teoriaEnabled: plan.teoriaEnabled,
          teoriaSeats: String(plan.teoriaSeats),
          teoriaPrice: centsToEuroInput(plan.teoriaPriceCents),
          voiceEnabled: plan.voiceEnabled,
          voicePrice: centsToEuroInput(plan.voicePriceCents),
        });
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
    const teoriaSeats = Number(form.teoriaSeats || "0");
    const teoriaPriceCents = parseEuroToCents(form.teoriaPrice);
    const voicePriceCents = parseEuroToCents(form.voicePrice);
    const valid =
      Number.isInteger(instructorSeats) &&
      instructorSeats >= 0 &&
      instructorSeatPriceCents !== null &&
      (!form.teoriaEnabled || (Number.isInteger(teoriaSeats) && teoriaSeats >= 0 && teoriaPriceCents !== null)) &&
      (!form.voiceEnabled || voicePriceCents !== null);
    const totalCents = valid
      ? instructorSeats * (instructorSeatPriceCents ?? 0) +
        (form.teoriaEnabled ? (teoriaPriceCents ?? 0) : 0) +
        (form.voiceEnabled ? (voicePriceCents ?? 0) : 0)
      : null;
    return {
      valid,
      totalCents,
      instructorSeats,
      instructorSeatPriceCents: instructorSeatPriceCents ?? 0,
      teoriaSeats: Number.isInteger(teoriaSeats) && teoriaSeats >= 0 ? teoriaSeats : 0,
      teoriaPriceCents: teoriaPriceCents ?? 0,
      voicePriceCents: voicePriceCents ?? 0,
    };
  }, [form]);

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
        teoriaEnabled: form.teoriaEnabled,
        teoriaSeats: parsed.teoriaSeats,
        teoriaPriceCents: parsed.teoriaPriceCents,
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
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, billingPeriod: v as "monthly" | "annual" }))
                  }
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
                <Label htmlFor="plan-renews">Si rinnova il</Label>
                <Input
                  id="plan-renews"
                  type="date"
                  value={form.renewsAt}
                  onChange={(e) => setForm((p) => ({ ...p, renewsAt: e.target.value }))}
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

            {/* Licenza formazione (teoria) */}
            <div className="rounded-lg border border-border/60 p-4">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={form.teoriaEnabled}
                  onCheckedChange={(checked) =>
                    setForm((p) => ({ ...p, teoriaEnabled: checked === true }))
                  }
                />
                <span className="text-sm font-semibold text-foreground">
                  Licenza formazione (teoria)
                </span>
              </label>
              {form.teoriaEnabled && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="plan-teoria-seats">Allievi attivi</Label>
                    <Input
                      id="plan-teoria-seats"
                      inputMode="numeric"
                      value={form.teoriaSeats}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          teoriaSeats: e.target.value.replace(/\D/g, "").slice(0, 6),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-teoria-price">Prezzo (€)</Label>
                    <Input
                      id="plan-teoria-price"
                      inputMode="decimal"
                      placeholder="200,00"
                      value={form.teoriaPrice}
                      onChange={(e) => setForm((p) => ({ ...p, teoriaPrice: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Segretaria AI */}
            <div className="rounded-lg border border-border/60 p-4">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={form.voiceEnabled}
                  onCheckedChange={(checked) =>
                    setForm((p) => ({ ...p, voiceEnabled: checked === true }))
                  }
                />
                <span className="text-sm font-semibold text-foreground">Segretaria AI</span>
              </label>
              {form.voiceEnabled && (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="plan-voice-price">Prezzo (€)</Label>
                  <Input
                    id="plan-voice-price"
                    inputMode="decimal"
                    placeholder="354,80"
                    value={form.voicePrice}
                    onChange={(e) => setForm((p) => ({ ...p, voicePrice: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Totale + azioni */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Totale</span>
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
                  {removing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Rimuovi piano
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={() => void save()} disabled={!parsed.valid || saving || removing}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {hasPlan ? "Salva piano" : "Assegna piano"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
