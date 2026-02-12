"use client";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";

export function AutoscuoleDocumentsPage({
  hideNav = false,
  tabs,
}: {
  hideNav?: boolean;
  tabs?: React.ReactNode;
} = {}) {
  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Documenti e modulistica digitale."
      hideHero
      contentWidthClassName="max-w-[1600px]"
    >
      <div className="w-full space-y-5">
        {tabs}
        {!hideNav ? <AutoscuoleNav /> : null}
        <div className="glass-panel glass-strong p-6 text-sm text-muted-foreground">
          La gestione documenti dedicata alle autoscuole arriverà a breve. Nel frattempo
          puoi usare il Doc Manager per archiviare e precompilare moduli.
        </div>
      </div>
    </ClientPageWrapper>
  );
}
