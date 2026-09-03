"use client";

/**
 * Sezione "Autoscuole" del consorzio (?tab=scuole): elenco delle autoscuole
 * consorziate con ricerca e aggiunta. Vedi docs/features/consorzio.md.
 */
export function ConsorzioSchoolsPage() {
  return (
    <div className="w-full">
      <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
        Autoscuole
      </h1>
      <div className="mt-8 rounded-3xl border border-dashed border-neutral-200 bg-white/60 p-12 text-center text-sm font-medium text-neutral-500">
        Le autoscuole consorziate compariranno qui.
      </div>
    </div>
  );
}
