import { redirect } from "next/navigation";

export default async function AutoscuoleDocumentsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/user/autoscuole?tab=documents`);
}
