import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserCompanies } from "@/lib/actions/company.actions";
import { CompanySelectPage } from "@/components/pages/CompanySelect/CompanySelectPage";

export default async function SelectCompanyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/sign-in`);
  }

  const res = await getUserCompanies();
  if (!res.success || !res.data) {
    redirect(`/${locale}/sign-in`);
  }

  return (
    <CompanySelectPage
      companies={res.data.companies}
      activeCompanyId={res.data.activeCompanyId}
      locale={locale}
    />
  );
}
