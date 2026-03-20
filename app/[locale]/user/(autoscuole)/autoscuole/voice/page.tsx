import { ServiceGate } from "@/components/ui/service-gate";
import { AutoscuoleVoicePage } from "@/components/pages/Autoscuole/AutoscuoleVoicePage";

export default function AutoscuoleVoiceRoute() {
  return (
    <ServiceGate service="AUTOSCUOLE">
      <AutoscuoleVoicePage />
    </ServiceGate>
  );
}
