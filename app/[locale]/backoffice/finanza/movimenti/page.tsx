import { FinanceMovementsPage } from "@/components/pages/Backoffice/finance/FinanceMovementsPage";
import {
  listFinanceCategories,
  listFinanceCompanies,
  listFinanceEntries,
} from "@/lib/finance/finance-data";
import { isYm, monthBounds, todayYmdRome } from "@/lib/finance/finance-math";

export default async function FinanceMovementsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = todayYmdRome();
  const month = isYm(params.mese) ? params.mese : today.slice(0, 7);
  const { from, to } = monthBounds(month);

  const [entries, categories, companies] = await Promise.all([
    listFinanceEntries({ from, to }),
    listFinanceCategories(),
    listFinanceCompanies(),
  ]);

  return (
    <FinanceMovementsPage
      month={month}
      today={today}
      entries={entries}
      categories={categories}
      companies={companies}
    />
  );
}
