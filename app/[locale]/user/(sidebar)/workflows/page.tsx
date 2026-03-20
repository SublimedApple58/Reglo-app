import { WorkflowsWrapper } from "@/components/pages/Workflows/WorkflowsWrapper";
import { ServiceGate } from "@/components/ui/service-gate";


export default function WorkflowsPage(): React.ReactElement {
    return (
        <ServiceGate service="WORKFLOWS">
            <WorkflowsWrapper />
        </ServiceGate>
    );
}
