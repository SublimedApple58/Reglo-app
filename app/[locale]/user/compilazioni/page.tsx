import { DocumentRequestsPage } from "@/components/pages/DocumentRequestsPage";
import { ServiceGate } from "@/components/ui/service-gate";

export default function DocumentRequests(): React.ReactElement {
  return (
    <ServiceGate service="DOC_MANAGER">
      <DocumentRequestsPage />
    </ServiceGate>
  );
}
