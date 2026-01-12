import { PublicDocFillPage } from "@/components/pages/DocManager/PublicDocFillPage";

type PublicDocPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PublicDocPage({
  params,
}: PublicDocPageProps): Promise<React.ReactElement> {
  const { token } = await params;
  return <PublicDocFillPage token={token} />;
}
