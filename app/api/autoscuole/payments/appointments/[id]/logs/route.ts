import { getAutoscuolaPaymentAppointmentLogsAction } from "@/lib/actions/autoscuole.actions";
import { withPerfJson } from "@/lib/perf";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withPerfJson(
    "/api/autoscuole/payments/appointments/:id/logs",
    async ({ measure }) => {
      const { id } = await context.params;
      const res = await measure("action", () =>
        getAutoscuolaPaymentAppointmentLogsAction(id),
      );
      return {
        status: res.success ? 200 : 404,
        body: res,
      };
    },
  );
}
