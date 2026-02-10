import { redirect } from "next/navigation";

export default async function AutoscuoleDisponibilitaRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/user/autoscuole?tab=disponibilita`);
}
