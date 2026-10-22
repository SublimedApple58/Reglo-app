import { FinanceOverviewPage } from "@/components/pages/Backoffice/finance/FinanceOverviewPage";
import {
  getFinanceSettings,
  listFinanceCategories,
  listFinanceCompanies,
  listFinancePlans,
  listOverviewEntries,
  listRecurringExpenses,
} from "@/lib/finance/finance-data";
import { isYm, todayYmdRome } from "@/lib/finance/finance-math";
import { overviewWindow } from "@/lib/finance/finance-overview";

export default async function FinanceOverviewRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = todayYmdRome();
  const month = isYm(params.mese) ? params.mese : today.slice(0, 7);

  const [settings, companies, categories, recurring] = await Promise.all([
    getFinanceSettings(),
    listFinanceCompanies(),
    listFinanceCategories(),
    listRecurringExpenses(),
  ]);
  const window = overviewWindow(today, month, settings.openingDate);
  const [entries, plans] = await Promise.all([
    listOverviewEntries(window),
    listFinancePlans(companies.map((c) => c.id)),
  ]);

  return (
    <FinanceOverviewPage
      input={{
        today,
        month,
        entries,
        recurring,
        plans,
        companiesCount: companies.length,
        openingBalanceCents: settings.openingBalanceCents,
        openingDate: settings.openingDate,
      }}
      categories={categories}
      companies={companies}
    />
  );
}
