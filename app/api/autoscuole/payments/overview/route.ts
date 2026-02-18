import { getAutoscuolaPaymentsOverviewAction } from "@/lib/actions/autoscuole.actions";
import { withPerfJson } from "@/lib/perf";

export async function GET() {
  return withPerfJson("/api/autoscuole/payments/overview", async ({ measure }) => {
    const res = await measure("action", () => getAutoscuolaPaymentsOverviewAction());
    return {
      status: res.success ? 200 : 400,
      body: res,
    };
  });
}
