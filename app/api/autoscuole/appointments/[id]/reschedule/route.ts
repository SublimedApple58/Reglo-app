import { NextResponse } from "next/server";
import { z } from "zod";

import { rescheduleAutoscuolaAppointment } from "@/lib/actions/autoscuole.actions";

const bodySchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let payload: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    payload = bodySchema.parse(raw);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof z.ZodError
            ? "Payload non valido."
            : "Impossibile leggere il payload.",
      },
      { status: 400 },
    );
  }

  const res = await rescheduleAutoscuolaAppointment({
    appointmentId: id,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt ?? undefined,
  });

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
