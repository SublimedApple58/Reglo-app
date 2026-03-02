import { getAutoscuolaLatestStudentAppointmentNote } from "@/lib/actions/autoscuole.actions";
import { withPerfJson } from "@/lib/perf";

export async function GET(request: Request) {
  return withPerfJson("/api/autoscuole/appointments/latest-note", async ({ measure }) => {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const before = searchParams.get("before");

    const res = await measure("action", () =>
      getAutoscuolaLatestStudentAppointmentNote({
        studentId,
        before,
      }),
    );

    return {
      status: res.success ? 200 : 400,
      body: res,
    };
  });
}
