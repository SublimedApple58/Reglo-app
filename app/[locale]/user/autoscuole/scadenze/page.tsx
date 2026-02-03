import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleDeadlinesPage } from "@/components/pages/Autoscuole/AutoscuoleDeadlinesPage";

export default function AutoscuoleDeadlinesRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleDeadlinesPage />
    </ServiceGate>
  );
}
