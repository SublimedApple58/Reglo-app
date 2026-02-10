import { redirect } from "next/navigation";

export default async function AutoscuoleCommunicationsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/user/autoscuole?tab=comunicazioni`);
}
