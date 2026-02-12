import BackofficeCompaniesPage from "@/components/pages/Backoffice/BackofficeCompaniesPage";
import { getBackofficeCompanies } from "@/lib/actions/backoffice.actions";

export default async function BackofficePage() {
  const res = await getBackofficeCompanies();
  const companies = res.success && res.data ? res.data : [];

  return (
    <div className="min-h-svh bg-background px-4 pb-10 pt-6 lg:px-6">
      <div className="mx-auto max-w-7xl">
        <BackofficeCompaniesPage companies={companies} />
      </div>
    </div>
  );
}
