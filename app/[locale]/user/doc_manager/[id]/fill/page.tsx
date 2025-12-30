import { DocFillWrapper } from "@/components/pages/DocManager/DocFillWrapper";

type DocFillPageProps = {
  params: {
    id: string;
  };
};

export default function DocFillPage({
  params,
}: DocFillPageProps): React.ReactElement {
  return <DocFillWrapper docId={params.id} />;
}
