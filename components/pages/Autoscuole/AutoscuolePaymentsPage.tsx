"use client";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";

export function AutoscuolePaymentsPage() {
  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Pagamenti e rateizzazioni."
      hideHero
    >
      <div className="space-y-5">
        <AutoscuoleNav />
        <div className="glass-panel glass-strong p-6 text-sm text-muted-foreground">
          Qui potrai gestire piani rateali e fatture elettroniche con Fatture in Cloud.
        </div>
      </div>
    </ClientPageWrapper>
  );
}
