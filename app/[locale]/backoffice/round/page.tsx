import { RoundMissing } from "@/components/pages/Backoffice/round/RoundMissing";
import { RoundPage } from "@/components/pages/Backoffice/round/RoundPage";
import { todayYmdRome } from "@/lib/finance/finance-math";
import { getActiveRound, listRoundInvestors } from "@/lib/round/round-data";

export default async function RoundRoute() {
  const round = await getActiveRound();
  if (!round) return <RoundMissing />;
  const investors = await listRoundInvestors(round.id);
  return <RoundPage round={round} investors={investors} today={todayYmdRome()} />;
}
