import { DocFillWrapper } from "@/components/pages/DocManager/DocFillWrapper";
import { ServiceGate } from "@/components/ui/service-gate";

type DocFillPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocFillPage({
  params,
}: DocFillPageProps): Promise<React.ReactElement> {
  const { id } = await params;
  return (
    <ServiceGate service="DOC_MANAGER">
      <DocFillWrapper docId={id} />
    </ServiceGate>
  );
}
