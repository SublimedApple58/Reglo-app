import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleCasesPage } from "@/components/pages/Autoscuole/AutoscuoleCasesPage";

export default function AutoscuoleCasesRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleCasesPage />
    </ServiceGate>
  );
}
