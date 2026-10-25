import { RoundInvestorsPage } from "@/components/pages/Backoffice/round/RoundInvestorsPage";
import { RoundMissing } from "@/components/pages/Backoffice/round/RoundMissing";
import { todayYmdRome } from "@/lib/finance/finance-math";
import { getActiveRound, listRoundInvestors } from "@/lib/round/round-data";

export default async function RoundInvestorsRoute() {
  const round = await getActiveRound();
  if (!round) return <RoundMissing />;
  const investors = await listRoundInvestors(round.id);
  return <RoundInvestorsPage investors={investors} today={todayYmdRome()} />;
}
