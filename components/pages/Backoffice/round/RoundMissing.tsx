import { Rocket } from "lucide-react";

import { FinCard, FinEmpty } from "@/components/pages/Backoffice/finance/finance-ui";

export function RoundMissing() {
  return (
    <FinCard>
      <FinEmpty
        icon={<Rocket className="h-5 w-5" />}
        title="Il round non è ancora stato importato"
        body="I contatti arrivano dallo script scripts/seed-round-preseed.ts: va lanciato una volta sull'ambiente."
      />
    </FinCard>
  );
}
