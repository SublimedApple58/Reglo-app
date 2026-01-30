import { DocManagerWrapper } from "@/components/pages/DocManager/DocManagerWrapper";
import { ServiceGate } from "@/components/ui/service-gate";

export default function DocManagerPage(): React.ReactElement {
  return (
    <ServiceGate service="DOC_MANAGER">
      <DocManagerWrapper />
    </ServiceGate>
  );
}
