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
import type { ConsorzioBillingMode } from "@/lib/consorzio/pricing";
import { cn } from "@/lib/utils";

/**
 * Sub-tab "Prezzi" di Prenotazioni e allievi (solo consorzio) — misure 1:1 dal
 * prototipo Consorzi.html (computed styles): titoli sezione 15/600, descrizioni
 * 14/500 #929292, label campo 14/500 #444, select 49px radius 12 bordo #E6E6E6,
 * badge categoria 30px #EEF0F6 bordo #DCDCE6, input tariffa 230×46 con suffisso
 * "€ / ora" interno. Prezzo guida = durata/60 × tariffa oraria.
 * REG-462: per ogni patente il criterio è "A ore" o "Percorso" (prezzo unico
 * per il percorso completo dell'allievo, guide incluse). Le due cifre sono
 * salvate entrambe, il segmented sceglie quale vale.
 * Vedi docs/features/consorzio.md.
 */

const CUTOFF_OPTIONS = [12, 24, 48, 72] as const;
const PENALTY_OPTIONS = [25, 50, 75, 100] as const;
const MIN_LEAD_OPTIONS = [0, 2, 4, 6, 8, 12, 24, 48] as const;

type AmountField = "hourlyByCategory" | "courseByCategory";

const MODE_OPTIONS: Array<{ value: ConsorzioBillingMode; label: string }> = [
  { value: "hourly", label: "A ore" },
  { value: "course", label: "Percorso" },
];

const draftKey = (field: AmountField, category: string) => `${field}:${category}`;

const minLeadLabel = (hours: number): string =>
  hours === 0 ? "Nessun preavviso" : `${hours} ${hours === 1 ? "ora" : "ore"} prima della guida`;

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
          for (const field of ["hourlyByCategory", "courseByCategory"] as const) {
            const value = res.data[field][category];
            next[draftKey(field, category)] = value !== undefined ? String(value) : "";
          }
        }
        setDrafts(next);
      }
      setLoading(false);
    });
  }, []);

  const persist = React.useCallback(
    async (next: ConsorzioPricing) => {
      setPricing(next);
      const amounts = (field: AmountField) =>
        Object.fromEntries(
          CONSORTIUM_LICENSE_CATEGORIES.map((category) => [
            category,
            next[field][category] ?? null,
          ]),
        ) as Record<ConsortiumLicenseCategory, number | null>;
      const res = await updateConsorzioPricing({
        hourlyByCategory: amounts("hourlyByCategory"),
        courseByCategory: amounts("courseByCategory"),
        billingModeByCategory: Object.fromEntries(
          CONSORTIUM_LICENSE_CATEGORIES.map((category) => [
            category,
            next.billingModeByCategory[category] ?? "hourly",
          ]),
        ) as Record<ConsortiumLicenseCategory, ConsorzioBillingMode>,
        lateCancellationCutoffHours: next.lateCancellationCutoffHours,
        lateCancellationPenaltyPct: next.lateCancellationPenaltyPct,
        guideRequestMinLeadHours: next.guideRequestMinLeadHours,
      });
      if (!res.success) toast.error({ description: res.message });
    },
    [toast],
  );

  const commitAmount = (field: AmountField, category: ConsortiumLicenseCategory) => {
    if (!pricing) return;
    const key = draftKey(field, category);
    const raw = (drafts[key] ?? "").trim().replace(",", ".");
    const parsed = raw === "" ? undefined : Number(raw);
    const value =
      parsed !== undefined && Number.isFinite(parsed) && parsed >= 0
        ? Math.round(parsed * 100) / 100
        : undefined;
    setDrafts((prev) => ({ ...prev, [key]: value !== undefined ? String(value) : "" }));
    if (value === pricing[field][category]) return;
    const nextMap = { ...pricing[field] };
    if (value === undefined) delete nextMap[category];
    else nextMap[category] = value;
    void persist({ ...pricing, [field]: nextMap });
  };

  const setMode = (category: ConsortiumLicenseCategory, mode: ConsorzioBillingMode) => {
    if (!pricing) return;
    if ((pricing.billingModeByCategory[category] ?? "hourly") === mode) return;
    void persist({
      ...pricing,
      billingModeByCategory: { ...pricing.billingModeByCategory, [category]: mode },
    });
  };

  if (loading || !pricing) {
    return <div className="h-40 w-full animate-pulse rounded-2xl bg-muted/40" />;
  }

  return (
    <div className="divide-y divide-[#ebebeb]">
      {/* Richieste di guida */}
      <div className="pb-6 pt-1">
        <div className="text-[15px] font-semibold text-[#222222]">Richieste di guida</div>
        <p className="mt-[3px] max-w-2xl text-sm font-medium leading-[1.45] text-[#929292]">
          Quanto anticipo deve avere una richiesta di guida che arriva da un&apos;autoscuola
          consorziata. Vale anche sull&apos;orario che proponi tu quando sposti una richiesta.
        </p>
        <div className="mt-4 grid gap-8 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium text-[#444444]">Preavviso minimo</div>
            <Select
              value={String(pricing.guideRequestMinLeadHours)}
              onValueChange={(value) =>
                void persist({ ...pricing, guideRequestMinLeadHours: Number(value) })
              }
            >
              <SelectTrigger className="h-[49px] w-full cursor-pointer rounded-[12px] border-[#e6e6e6] bg-white px-[18px] text-[15px] font-medium text-[#222222] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MIN_LEAD_OPTIONS.map((hours) => (
                  <SelectItem key={hours} value={String(hours)} className="cursor-pointer">
                    {minLeadLabel(hours)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Cancellazioni tardive */}
      <div className="py-6">
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
              <SelectTrigger className="h-[49px] w-full cursor-pointer rounded-[12px] border-[#e6e6e6] bg-white px-[18px] text-[15px] font-medium text-[#222222] shadow-none">
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
              <SelectTrigger className="h-[49px] w-full cursor-pointer rounded-[12px] border-[#e6e6e6] bg-white px-[18px] text-[15px] font-medium text-[#222222] shadow-none">
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

      {/* Tariffe per patente: criterio (a ore / percorso) + importo */}
      <div className="pt-6">
        <div className="text-[15px] font-semibold text-[#222222]">Tariffe per patente</div>
        <p className="mt-[3px] max-w-2xl text-sm font-medium leading-[1.45] text-[#929292]">
          Per ogni patente scegli come fatturarla alle autoscuole consorziate:{" "}
          <span className="text-[#6a6a6a]">a ore</span>, dove uno slot da 90 minuti costa una
          volta e mezza la tariffa, oppure con un{" "}
          <span className="text-[#6a6a6a]">prezzo unico per il percorso</span> completo
          dell&apos;allievo, con le guide già incluse.
        </p>
        <div className="mt-3 divide-y divide-[#f0f0f0]">
          {CONSORTIUM_LICENSE_CATEGORIES.map((category) => {
            const info = CONSORTIUM_LICENSE_INFO[category];
            const mode = pricing.billingModeByCategory[category] ?? "hourly";
            const field: AmountField = mode === "course" ? "courseByCategory" : "hourlyByCategory";
            const key = draftKey(field, category);
            return (
              <div
                key={category}
                data-testid={`tariff-row-${category}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3"
              >
                <span
                  className="flex h-[30px] min-w-[46px] shrink-0 items-center justify-center rounded-[9px] px-2.5 text-[13px] font-bold"
                  style={{ background: "#EEF0F6", border: "1px solid #DCDCE6", color: "#1A1A2E" }}
                >
                  {category}
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[15px] font-semibold text-[#222222]">{info.title}</div>
                  <div className="text-sm font-medium text-[#929292]">
                    {mode === "course"
                      ? "Prezzo unico per l'intero percorso, guide incluse."
                      : info.description}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2.5">
                  <div
                    role="radiogroup"
                    aria-label={`Criterio di fatturazione ${category}`}
                    className="flex h-[46px] items-center gap-1 rounded-[12px] bg-[#f0f0f2] p-1"
                  >
                    {MODE_OPTIONS.map((option) => {
                      const selected = option.value === mode;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          data-testid={`tariff-mode-${category}-${option.value}`}
                          onClick={() => setMode(category, option.value)}
                          className={cn(
                            "h-full cursor-pointer select-none rounded-[9px] px-3 text-[13px] leading-none transition-all duration-150",
                            selected
                              ? "bg-white font-semibold text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                              : "font-medium text-[#6a6a6a] hover:text-[#222222]",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="relative w-[190px]">
                    <input
                      inputMode="decimal"
                      aria-label={
                        mode === "course"
                          ? `Prezzo percorso ${category}`
                          : `Tariffa oraria ${category}`
                      }
                      data-testid={`tariff-amount-${category}`}
                      value={drafts[key] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                      onBlur={() => commitAmount(field, category)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="—"
                      className="h-[46px] w-full rounded-[12px] border-[1.5px] border-[#e2e2e2] bg-white pl-4 pr-[84px] text-[15px] font-semibold text-[#222222] outline-none transition-colors focus:border-[#222222]"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[#a0a0a0]">
                      {mode === "course" ? "€ totali" : "€ / ora"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
