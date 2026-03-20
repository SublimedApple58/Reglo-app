"use client";

import { PageWrapper } from "@/components/Layout/PageWrapper";
export function AutoscuoleDocumentsPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  return (
    <PageWrapper
      title="Autoscuole"
      subTitle="Documenti e modulistica digitale."
    >
      <div className="w-full space-y-5">
        {tabs}
        <div className="glass-panel glass-strong p-6 text-sm text-muted-foreground">
          La gestione documenti dedicata alle autoscuole arriverà a breve. Nel frattempo
          puoi usare il Doc Manager per archiviare e precompilare moduli.
        </div>
      </div>
    </PageWrapper>
  );
}
