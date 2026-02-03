import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuolePaymentsPage } from "@/components/pages/Autoscuole/AutoscuolePaymentsPage";

export default function AutoscuolePaymentsRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuolePaymentsPage />
    </ServiceGate>
  );
}
