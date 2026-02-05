import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleResourcesPage } from "@/components/pages/Autoscuole/AutoscuoleResourcesPage";

export default function AutoscuoleDisponibilitaRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleResourcesPage />
    </ServiceGate>
  );
}
