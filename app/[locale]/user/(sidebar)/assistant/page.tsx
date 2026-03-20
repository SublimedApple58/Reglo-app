import type React from "react";
import AssistantPage from "@/components/pages/Assistant/AssistantPage";
import { ServiceGate } from "@/components/ui/service-gate";

export default function Assistant(): React.ReactElement {
  return (
    <ServiceGate service="AI_ASSISTANT">
      <AssistantPage />
    </ServiceGate>
  );
}
