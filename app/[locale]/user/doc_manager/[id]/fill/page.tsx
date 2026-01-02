import { DocFillWrapper } from "@/components/pages/DocManager/DocFillWrapper";

type DocFillPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocFillPage({
  params,
}: DocFillPageProps): Promise<React.ReactElement> {
  const { id } = await params;
  return <DocFillWrapper docId={id} />;
}
