import InviteAcceptWrapper from "@/components/pages/Invites/InviteAcceptWrapper";

type InvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  return <InviteAcceptWrapper token={token} />;
}
