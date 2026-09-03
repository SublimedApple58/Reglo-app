"use client";

/**
 * Sezione "Fatturazione" del consorzio (?tab=fatturazione): contabilizzazione
 * mensile delle guide verso le autoscuole consorziate.
 * Vedi docs/features/consorzio.md.
 */
export function ConsorzioBillingPage() {
  return (
    <div className="w-full">
      <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
        Fatturazione
      </h1>
      <div className="mt-8 rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
        Le guide da contabilizzare compariranno qui.
      </div>
    </div>
  );
}
