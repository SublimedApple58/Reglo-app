import { FinanceSalesPage } from "@/components/pages/Backoffice/finance/FinanceSalesPage";
import {
  listFinanceCompanies,
  listFinancePlans,
  listFixedPayments,
  listSalesAgents,
  listSalesDeals,
} from "@/lib/finance/finance-data";
import { isYm, todayYmdRome } from "@/lib/finance/finance-math";

export default async function FinanceSalesRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = todayYmdRome();
  const month = isYm(params.mese) ? params.mese : today.slice(0, 7);
  const [agents, deals, fixedPayments, companies] = await Promise.all([
    listSalesAgents(),
    listSalesDeals(),
    listFixedPayments(),
    listFinanceCompanies(),
  ]);
  const plans = await listFinancePlans(companies.map((c) => c.id));
  const annualBy = new Map(
    plans.map((p) => [p.companyId, p.billingPeriod === "monthly" ? p.periodCents * 12 : p.periodCents]),
  );

  return (
    <FinanceSalesPage
      month={month}
      today={today}
      agents={agents}
      deals={deals}
      fixedPayments={fixedPayments}
      companies={companies.map((c) => ({ ...c, planAnnualCents: annualBy.get(c.id) || null }))}
    />
  );
}
