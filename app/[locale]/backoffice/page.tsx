import BackofficeCompaniesPage from "@/components/pages/Backoffice/BackofficeCompaniesPage";
import { getBackofficeCompanies } from "@/lib/actions/backoffice.actions";

export default async function BackofficePage() {
  const res = await getBackofficeCompanies();
  const companies = res.success && res.data ? res.data : [];

  return <BackofficeCompaniesPage companies={companies} />;
}
