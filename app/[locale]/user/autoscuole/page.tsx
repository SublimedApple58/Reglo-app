import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleTabsPage } from "@/components/pages/Autoscuole/AutoscuoleTabsPage";

export default function AutoscuolePage() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleTabsPage />
    </ServiceGate>
  );
}
