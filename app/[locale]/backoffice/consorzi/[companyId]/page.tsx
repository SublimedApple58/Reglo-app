import { notFound } from "next/navigation";

import BackofficeConsorzioDetailPage from "@/components/pages/Backoffice/BackofficeConsorzioDetailPage";
import { getBackofficeConsorzioDetail } from "@/lib/actions/consorzio-affiliate.actions";

export const metadata = { title: "Consorzio - Backoffice" };

export default async function BackofficeConsorzioPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const res = await getBackofficeConsorzioDetail(companyId);
  if (!res.success || !res.data) notFound();

  return <BackofficeConsorzioDetailPage detail={res.data} />;
}
