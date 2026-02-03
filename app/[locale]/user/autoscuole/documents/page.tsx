import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleDocumentsPage } from "@/components/pages/Autoscuole/AutoscuoleDocumentsPage";

export default function AutoscuoleDocumentsRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleDocumentsPage />
    </ServiceGate>
  );
}
