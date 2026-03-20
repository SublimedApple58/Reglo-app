import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleTabsPage } from "@/components/pages/Autoscuole/AutoscuoleTabsPage";
import { notFound } from "next/navigation";

const LEGACY_REMOVED_TABS = new Set(["cases", "scadenze", "documents"]);

export default async function AutoscuolePage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await props.searchParams;
  const normalizedTab = (tab ?? "").trim().toLowerCase();
  if (LEGACY_REMOVED_TABS.has(normalizedTab)) {
    notFound();
  }

  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleTabsPage />
    </ServiceGate>
  );
}
