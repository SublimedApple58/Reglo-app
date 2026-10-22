import { redirect } from "next/navigation";

// La Panoramica arriva con la fase 2: fino ad allora si entra dai movimenti.
export default async function FinanceRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/backoffice/finanza/movimenti`);
}
