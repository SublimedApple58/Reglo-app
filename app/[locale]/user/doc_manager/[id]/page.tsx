import { DocEditorWrapper } from "@/components/pages/DocManager/DocEditorWrapper";
import { ServiceGate } from "@/components/ui/service-gate";

type DocEditorPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocEditorPage({
  params,
}: DocEditorPageProps): Promise<React.ReactElement> {
  const { id } = await params;
  return (
    <ServiceGate service="DOC_MANAGER">
      <DocEditorWrapper docId={id} />
    </ServiceGate>
  );
}
