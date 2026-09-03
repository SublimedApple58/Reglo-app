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
 * Sub-tab "Prezzi" di Prenotazioni e allievi (solo consorzio) — misure 1:1 dal
 * prototipo Consorzi.html (computed styles): titoli sezione 15/600, descrizioni
 * 14/500 #929292, label campo 14/500 #444, select 49px radius 12 bordo #E6E6E6,
 * badge categoria 30px #EEF0F6 bordo #DCDCE6, input tariffa 230×46 con suffisso
 * "€ / ora" interno. Prezzo guida = durata/60 × tariffa oraria.
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
      <div className="pb-6 pt-1">
        <div className="text-[15px] font-semibold text-[#222222]">Cancellazioni tardive</div>
        <p className="mt-[3px] text-sm font-medium leading-[1.45] text-[#929292]">
          Se l&apos;allievo annulla oltre il cutoff, sulla guida viene applicata la penale.
        </p>
        <div className="mt-4 grid gap-8 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium text-[#444444]">Cutoff annullamento</div>
            <Select
              value={String(pricing.lateCancellationCutoffHours)}
              onValueChange={(value) =>
                void persist({ ...pricing, lateCancellationCutoffHours: Number(value) })
              }
            >
              <SelectTrigger className="h-[49px] w-full cursor-pointer rounded-xl border-[#e6e6e6] bg-white px-[18px] text-[15px] font-medium text-[#222222] shadow-none">
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
            <div className="mb-2 text-sm font-medium text-[#444444]">Penale</div>
            <Select
              value={String(pricing.lateCancellationPenaltyPct)}
              onValueChange={(value) =>
                void persist({ ...pricing, lateCancellationPenaltyPct: Number(value) })
              }
            >
              <SelectTrigger className="h-[49px] w-full cursor-pointer rounded-xl border-[#e6e6e6] bg-white px-[18px] text-[15px] font-medium text-[#222222] shadow-none">
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
      <div className="pt-6">
        <div className="text-[15px] font-semibold text-[#222222]">
          Tariffa oraria per patente
        </div>
        <p className="mt-[3px] max-w-2xl text-sm font-medium leading-[1.45] text-[#929292]">
          Il costo di un&apos;ora di guida per ogni tipo di patente: è il valore che le
          autoscuole consorziate vedono in fattura. Uno slot da 90 minuti costa una
          volta e mezza la tariffa.
        </p>
        <div className="mt-3 divide-y divide-[#f0f0f0]">
          {CONSORTIUM_LICENSE_CATEGORIES.map((category) => {
            const info = CONSORTIUM_LICENSE_INFO[category];
            return (
              <div key={category} className="flex items-center gap-4 py-3">
                <span
                  className="flex h-[30px] min-w-[46px] shrink-0 items-center justify-center rounded-[9px] px-2.5 text-[13px] font-bold"
                  style={{ background: "#EEF0F6", border: "1px solid #DCDCE6", color: "#1A1A2E" }}
                >
                  {category}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-[#222222]">{info.title}</div>
                  <div className="text-sm font-medium text-[#929292]">{info.description}</div>
                </div>
                <div className="relative w-[230px] shrink-0">
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
                    className="h-[46px] w-full rounded-xl border-[1.5px] border-[#e2e2e2] bg-white pl-4 pr-[70px] text-[15px] font-semibold text-[#222222] outline-none transition-colors focus:border-[#222222]"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[#a0a0a0]">
                    € / ora
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
