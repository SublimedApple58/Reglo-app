import { FinanceSchoolsPage } from "@/components/pages/Backoffice/finance/FinanceSchoolsPage";
import { listFinanceSchools, listSalesAgents } from "@/lib/finance/finance-data";
import { isYm, monthBounds, todayYmdRome } from "@/lib/finance/finance-math";

export default async function FinanceSchoolsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = todayYmdRome();
  const month = isYm(params.mese) ? params.mese : today.slice(0, 7);
  const [schools, agents] = await Promise.all([
    listFinanceSchools(monthBounds(month)),
    listSalesAgents(),
  ]);
  return <FinanceSchoolsPage month={month} today={today} schools={schools} agents={agents} />;
}
