import { redirect } from "next/navigation";

/** La vecchia lista è confluita nella pagina unica del round. */
export default async function RoundInvestorsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scheda?: string }>;
}) {
  const [{ locale }, { scheda }] = await Promise.all([params, searchParams]);
  redirect(`/${locale}/backoffice/round${scheda ? `?scheda=${encodeURIComponent(scheda)}` : ""}`);
}
