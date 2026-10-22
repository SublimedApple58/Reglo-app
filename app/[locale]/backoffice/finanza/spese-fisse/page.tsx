import { FinanceRecurringPage } from "@/components/pages/Backoffice/finance/FinanceRecurringPage";
import { listFinanceCategories, listRecurringExpenses } from "@/lib/finance/finance-data";
import { todayYmdRome } from "@/lib/finance/finance-math";

export default async function FinanceRecurringRoute() {
  const [expenses, categories] = await Promise.all([
    listRecurringExpenses(),
    listFinanceCategories(),
  ]);
  return (
    <FinanceRecurringPage
      today={todayYmdRome()}
      expenses={expenses}
      categories={categories.filter((c) => c.direction === "out")}
    />
  );
}
