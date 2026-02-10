"use client";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";

export function AutoscuoleDocumentsPage({
  hideNav = false,
}: {
  hideNav?: boolean;
} = {}) {
  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Documenti e modulistica digitale."
      hideHero
    >
      <div className="space-y-5">
        {!hideNav ? <AutoscuoleNav /> : null}
        <div className="glass-panel glass-strong p-6 text-sm text-muted-foreground">
          La gestione documenti dedicata alle autoscuole arriverà a breve. Nel frattempo
          puoi usare il Doc Manager per archiviare e precompilare moduli.
        </div>
      </div>
    </ClientPageWrapper>
  );
}
