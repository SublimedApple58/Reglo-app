import { RoundOverviewPage } from "@/components/pages/Backoffice/round/RoundOverviewPage";
import { RoundMissing } from "@/components/pages/Backoffice/round/RoundMissing";
import { todayYmdRome } from "@/lib/finance/finance-math";
import { getActiveRound, listRecentInteractions, listRoundInvestors } from "@/lib/round/round-data";

export default async function RoundOverviewRoute() {
  const round = await getActiveRound();
  if (!round) return <RoundMissing />;
  const [investors, recent] = await Promise.all([listRoundInvestors(round.id), listRecentInteractions(round.id)]);
  return <RoundOverviewPage round={round} investors={investors} recent={recent} today={todayYmdRome()} />;
}
