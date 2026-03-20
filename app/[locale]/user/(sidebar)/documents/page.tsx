import { DocumentsPage } from "@/components/pages/DocumentsPage";
import { ServiceGate } from "@/components/ui/service-gate";

export default function Documents(): React.ReactElement {
    return (
        <ServiceGate service="DOC_MANAGER">
            <DocumentsPage/>
        </ServiceGate>
    );
}
