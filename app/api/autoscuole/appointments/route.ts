import {
  getAutoscuolaAppointments,
  getAutoscuolaAppointmentsFiltered,
  createAutoscuolaAppointment,
} from "@/lib/actions/autoscuole.actions";
import { withPerfJson } from "@/lib/perf";

export async function GET(request: Request) {
  return withPerfJson("/api/autoscuole/appointments", async ({ measure }) => {
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get("limit");
    const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
    const limit =
      typeof parsedLimit === "number" && Number.isFinite(parsedLimit)
        ? parsedLimit
        : undefined;

    const hasFilters = [
      searchParams.get("from"),
      searchParams.get("to"),
      searchParams.get("studentId"),
      searchParams.get("instructorId"),
      searchParams.get("status"),
      searchParams.get("type"),
      rawLimit,
    ].some((value) => value !== null && value !== "");

    const res = await measure("action", () =>
      hasFilters
        ? getAutoscuolaAppointmentsFiltered({
            from: searchParams.get("from"),
            to: searchParams.get("to"),
            studentId: searchParams.get("studentId"),
            instructorId: searchParams.get("instructorId"),
            status: searchParams.get("status"),
            type: searchParams.get("type"),
            limit,
          })
        : getAutoscuolaAppointments(),
    );

    return {
      status: res.success ? 200 : 400,
      body: res,
    };
  });
}

export async function POST(request: Request) {
  return withPerfJson("/api/autoscuole/appointments#POST", async ({ measure }) => {
    const payload = await request.json();
    const res = await measure("action", () => createAutoscuolaAppointment(payload));
    return {
      status: res.success ? 200 : 400,
      body: res,
    };
  });
}
