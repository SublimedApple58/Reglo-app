import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleCommunicationsPage } from "@/components/pages/Autoscuole/AutoscuoleCommunicationsPage";

export default function AutoscuoleCommunicationsRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleCommunicationsPage />
    </ServiceGate>
  );
}
