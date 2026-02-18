import { getAutoscuolaPaymentsAppointmentsAction } from "@/lib/actions/autoscuole.actions";
import { withPerfJson } from "@/lib/perf";

export async function GET(request: Request) {
  return withPerfJson("/api/autoscuole/payments/appointments", async ({ measure }) => {
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get("limit");
    const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
    const limit =
      typeof parsedLimit === "number" && Number.isFinite(parsedLimit)
        ? parsedLimit
        : undefined;

    const rawAttemptsLimit = searchParams.get("paymentAttemptsLimit");
    const parsedAttemptsLimit = rawAttemptsLimit ? Number(rawAttemptsLimit) : undefined;
    const paymentAttemptsLimit =
      typeof parsedAttemptsLimit === "number" && Number.isFinite(parsedAttemptsLimit)
        ? parsedAttemptsLimit
        : undefined;

    const res = await measure("action", () =>
      getAutoscuolaPaymentsAppointmentsAction({
        limit,
        cursor: searchParams.get("cursor"),
        paymentAttemptsLimit,
      }),
    );

    return {
      status: res.success ? 200 : 400,
      body: res,
    };
  });
}
