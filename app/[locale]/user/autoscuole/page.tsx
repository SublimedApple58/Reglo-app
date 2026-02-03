import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleDashboardPage } from "@/components/pages/Autoscuole/AutoscuoleDashboardPage";

export default function AutoscuolePage() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleDashboardPage />
    </ServiceGate>
  );
}
