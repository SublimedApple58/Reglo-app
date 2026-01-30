import { WorkflowEditor } from "@/components/pages/Workflows/Editor/WorkflowEditor";
import { ServiceGate } from "@/components/ui/service-gate";

export default function WorkflowDetailPage() {
  return (
    <ServiceGate service="WORKFLOWS">
      <WorkflowEditor />
    </ServiceGate>
  );
}
