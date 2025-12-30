import { DocEditorWrapper } from "@/components/pages/DocManager/DocEditorWrapper";

type DocEditorPageProps = {
  params: {
    id: string;
  };
};

export default function DocEditorPage({
  params,
}: DocEditorPageProps): React.ReactElement {
  return <DocEditorWrapper docId={params.id} />;
}
