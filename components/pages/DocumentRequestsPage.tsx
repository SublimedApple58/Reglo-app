"use client";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { TableDocumentRequests } from "@/components/ui/TableDocumentRequests";

export function DocumentRequestsPage(): React.ReactElement {
  return (
    <ClientPageWrapper
      title="Compilazioni"
      subTitle="Documenti in fase di compilazione o completati."
    >
      <div className="table_wrapper">
        <TableDocumentRequests />
      </div>
    </ClientPageWrapper>
  );
}
