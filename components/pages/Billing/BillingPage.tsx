"use client";

import React, { useMemo } from "react";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import {
  computePlanUsage,
  formatCurrency,
  type PlanKey,
} from "@/lib/plan-usage";
import { Badge } from "@/components/ui/badge";

const planKey: PlanKey = "growth";
const usageSnapshot = {
  documentsUsed: 612,
  workflowsUsed: 46,
};

export function BillingPage(): React.ReactElement {
  const summary = useMemo(
    () => computePlanUsage(planKey, usageSnapshot),
    [],
  );

  const extraDocs = summary.docs.extraBlocks * summary.plan.extraFee;
  const extraWorkflows =
    summary.workflows.extraBlocks * summary.plan.extraFee;
  const hasExtras = summary.extrasTotal > 0;

  return (
    <ClientPageWrapper
      title="Billing"
      subTitle="Anteprima del prossimo addebito mensile."
    >
      <div className="space-y-4">
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Piano attuale
              </p>
              <h2 className="text-xl font-semibold text-foreground">
                {summary.plan.label} plan
              </h2>
              <p className="text-sm text-muted-foreground">
                Prezzo base {formatCurrency(summary.plan.basePrice)} / mese
              </p>
            </div>
            <Badge variant={hasExtras ? "default" : "secondary"}>
              {hasExtras ? "Extra attivi" : "Solo base"}
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-semibold text-foreground">Documenti</p>
              <p className="text-muted-foreground">
                Usati {summary.docs.used} su {summary.docs.currentLimit}
              </p>
              <p className="text-muted-foreground">
                Extra attivi: {summary.docs.extraBlocks} ·{" "}
                {extraDocs ? formatCurrency(extraDocs) : "Nessun extra"}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-semibold text-foreground">Workflow</p>
              <p className="text-muted-foreground">
                Usati {summary.workflows.used} su {summary.workflows.currentLimit}
              </p>
              <p className="text-muted-foreground">
                Extra attivi: {summary.workflows.extraBlocks} ·{" "}
                {extraWorkflows
                  ? formatCurrency(extraWorkflows)
                  : "Nessun extra"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Prossimo addebito stimato
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold text-foreground">
                {formatCurrency(summary.nextChargeTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                Include base + extra attivi del periodo.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Extra totali:{" "}
              {summary.extrasTotal
                ? formatCurrency(summary.extrasTotal)
                : "Nessun extra"}
            </div>
          </div>
        </section>
      </div>
    </ClientPageWrapper>
  );
}

export default BillingPage;
