"use client";

import React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  CONSORTIUM_LICENSE_CATEGORIES,
  CONSORTIUM_LICENSE_INFO,
  type ConsortiumLicenseCategory,
} from "@/lib/autoscuole/license";
import {
  getConsorzioPricing,
  updateConsorzioPricing,
  type ConsorzioPricing,
} from "@/lib/actions/consorzio.actions";

/**
 * Sub-tab "Prezzi" di Prenotazioni e allievi (solo consorzio, dal prototipo):
 * cancellazioni tardive (cutoff + penale) e tariffa oraria per patente.
 * Il prezzo di una guida = durata/60 × tariffa oraria della categoria.
 * Vedi docs/features/consorzio.md.
 */

const CUTOFF_OPTIONS = [12, 24, 48, 72] as const;
const PENALTY_OPTIONS = [25, 50, 75, 100] as const;

export function ConsorzioPrezziPane() {
  const toast = useFeedbackToast();
  const [loading, setLoading] = React.useState(true);
  const [pricing, setPricing] = React.useState<ConsorzioPricing | null>(null);
  // Draft testuale degli input tariffa (consente campo vuoto durante l'editing).
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    getConsorzioPricing().then((res) => {
      if (res.success) {
        setPricing(res.data);
        const next: Record<string, string> = {};
        for (const category of CONSORTIUM_LICENSE_CATEGORIES) {
          const value = res.data.hourlyByCategory[category];
          next[category] = value !== undefined ? String(value) : "";
        }
        setDrafts(next);
      }
      setLoading(false);
    });
  }, []);

  const persist = React.useCallback(
    async (next: ConsorzioPricing) => {
      setPricing(next);
      const res = await updateConsorzioPricing({
        hourlyByCategory: Object.fromEntries(
          CONSORTIUM_LICENSE_CATEGORIES.map((category) => [
            category,
            next.hourlyByCategory[category] ?? null,
          ]),
        ) as Record<ConsortiumLicenseCategory, number | null>,
        lateCancellationCutoffHours: next.lateCancellationCutoffHours,
        lateCancellationPenaltyPct: next.lateCancellationPenaltyPct,
      });
      if (!res.success) toast.error({ description: res.message });
    },
    [toast],
  );

  const commitTariff = (category: ConsortiumLicenseCategory) => {
    if (!pricing) return;
    const raw = (drafts[category] ?? "").trim().replace(",", ".");
    const parsed = raw === "" ? undefined : Number(raw);
    const value =
      parsed !== undefined && Number.isFinite(parsed) && parsed >= 0
        ? Math.round(parsed * 100) / 100
        : undefined;
    const nextMap = { ...pricing.hourlyByCategory };
    if (value === undefined) delete nextMap[category];
    else nextMap[category] = value;
    setDrafts((prev) => ({ ...prev, [category]: value !== undefined ? String(value) : "" }));
    void persist({ ...pricing, hourlyByCategory: nextMap });
  };

  if (loading || !pricing) {
    return <div className="h-40 w-full animate-pulse rounded-2xl bg-muted/40" />;
  }

  return (
    <div className="divide-y divide-[#ebebeb]">
      {/* Cancellazioni tardive */}
      <div className="py-6 first:pt-2">
        <div className="text-[15px] font-semibold text-foreground">Cancellazioni tardive</div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Se l&apos;allievo annulla oltre il cutoff, sulla guida viene applicata la penale.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[13px] font-semibold text-foreground">
              Cutoff annullamento
            </div>
            <Select
              value={String(pricing.lateCancellationCutoffHours)}
              onValueChange={(value) =>
                void persist({ ...pricing, lateCancellationCutoffHours: Number(value) })
              }
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUTOFF_OPTIONS.map((hours) => (
                  <SelectItem key={hours} value={String(hours)} className="cursor-pointer">
                    {hours} ore prima della guida
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-2 text-[13px] font-semibold text-foreground">Penale</div>
            <Select
              value={String(pricing.lateCancellationPenaltyPct)}
              onValueChange={(value) =>
                void persist({ ...pricing, lateCancellationPenaltyPct: Number(value) })
              }
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PENALTY_OPTIONS.map((pct) => (
                  <SelectItem key={pct} value={String(pct)} className="cursor-pointer">
                    {pct}% del prezzo della guida
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tariffa oraria per patente */}
      <div className="py-6">
        <div className="text-[15px] font-semibold text-foreground">
          Tariffa oraria per patente
        </div>
        <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">
          Il costo di un&apos;ora di guida per ogni tipo di patente: è il valore che le
          autoscuole consorziate vedono in fattura. Uno slot da 90 minuti costa una
          volta e mezza la tariffa.
        </p>
        <div className="mt-4 divide-y divide-[#f0f0f0]">
          {CONSORTIUM_LICENSE_CATEGORIES.map((category) => {
            const info = CONSORTIUM_LICENSE_INFO[category];
            return (
              <div key={category} className="flex items-center gap-4 py-4">
                <span className="inline-flex w-11 shrink-0 justify-center rounded-lg bg-muted px-2 py-1 text-xs font-bold text-foreground">
                  {category}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{info.title}</div>
                  <div className="text-[13px] text-muted-foreground">{info.description}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={drafts[category] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [category]: e.target.value }))
                    }
                    onBlur={() => commitTariff(category)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    placeholder="—"
                    className="h-10 w-20 rounded-xl border border-border bg-white px-3 text-right text-sm font-semibold text-foreground outline-none focus:border-foreground"
                  />
                  <span className="text-[13px] font-medium text-muted-foreground">€ / ora</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
