import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { WorkflowRunHistory } from "@/components/pages/Workflows/WorkflowRunHistory";
import { getWorkflowById } from "@/lib/actions/workflow.actions";

export default async function WorkflowRunsPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  const workflowRes = await getWorkflowById(workflowId);
  const workflowName =
    workflowRes.success && workflowRes.data ? workflowRes.data.name : "Workflow";
  return (
    <ClientPageWrapper
      title={workflowName}
      subTitle="Run history"
      parentTitle="Workflows"
      enableBackNavigation
    >
      <WorkflowRunHistory workflowId={workflowId} />
    </ClientPageWrapper>
  );
}
