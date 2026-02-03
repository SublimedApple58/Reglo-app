import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleStudentsPage } from "@/components/pages/Autoscuole/AutoscuoleStudentsPage";

export default function AutoscuoleStudentsRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleStudentsPage />
    </ServiceGate>
  );
}
