import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleAgendaPage } from "@/components/pages/Autoscuole/AutoscuoleAgendaPage";

export default function AutoscuoleAgendaRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleAgendaPage />
    </ServiceGate>
  );
}
