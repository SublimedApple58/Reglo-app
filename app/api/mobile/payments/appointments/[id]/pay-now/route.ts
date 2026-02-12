import { NextResponse } from "next/server";
import { z } from "zod";

import { getMobileToken, parseBearerToken } from "@/lib/mobile-auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { formatError } from "@/lib/utils";
import {
  createManualRecoveryIntent,
  finalizeManualRecoveryIntent,
} from "@/lib/autoscuole/payments";

const payloadSchema = z.object({
  paymentIntentId: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Token mancante." },
        { status: 401 },
      );
    }

    const mobileToken = await getMobileToken(token);
    if (!mobileToken) {
      return NextResponse.json(
        { success: false, message: "Token non valido." },
        { status: 401 },
      );
    }

    const { membership } = await getActiveCompanyContext();
    if (membership.userId !== mobileToken.userId) {
      return NextResponse.json(
        { success: false, message: "Sessione non valida." },
        { status: 403 },
      );
    }

    const payload = payloadSchema.parse(await request.json().catch(() => ({})));
    const { id } = await params;

    if (payload.paymentIntentId) {
      const data = await finalizeManualRecoveryIntent({
        companyId: membership.companyId,
        studentId: mobileToken.userId,
        appointmentId: id,
        paymentIntentId: payload.paymentIntentId,
      });
      return NextResponse.json({ success: true, data });
    }

    const data = await createManualRecoveryIntent({
      companyId: membership.companyId,
      studentId: mobileToken.userId,
      appointmentId: id,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
