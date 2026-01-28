import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { WorkflowRunHistory } from "@/components/pages/Workflows/WorkflowRunHistory";

export default async function WorkflowRunsPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  return (
    <ClientPageWrapper
      title="Run history"
      parentTitle="Workflows"
      enableBackNavigation
    >
      <WorkflowRunHistory workflowId={workflowId} />
    </ClientPageWrapper>
  );
}
