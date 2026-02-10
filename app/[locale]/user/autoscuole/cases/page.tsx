import { redirect } from "next/navigation";

export default async function AutoscuoleCasesRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/user/autoscuole?tab=cases`);
}
