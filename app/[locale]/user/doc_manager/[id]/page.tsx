import { DocEditorWrapper } from "@/components/pages/DocManager/DocEditorWrapper";

type DocEditorPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocEditorPage({
  params,
}: DocEditorPageProps): Promise<React.ReactElement> {
  const { id } = await params;
  return <DocEditorWrapper docId={id} />;
}
