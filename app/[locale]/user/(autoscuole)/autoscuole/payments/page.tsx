import { redirect } from "next/navigation";

export default async function AutoscuolePaymentsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // REG-780: la pagina Pagamenti è ritirata; crediti e annullamenti stanno nelle Impostazioni.
  redirect(`/${locale}/user/autoscuole?tab=settings&pane=bookings&sub=crediti`);
}
