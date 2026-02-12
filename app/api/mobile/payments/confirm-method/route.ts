import { NextResponse } from "next/server";
import { z } from "zod";

import { getMobileToken, parseBearerToken } from "@/lib/mobile-auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { formatError } from "@/lib/utils";
import { confirmStudentPaymentMethod } from "@/lib/autoscuole/payments";

const confirmSchema = z.object({
  setupIntentId: z.string().optional(),
  paymentMethodId: z.string().optional(),
});

export async function POST(request: Request) {
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

    const payload = confirmSchema.parse(await request.json());

    const data = await confirmStudentPaymentMethod({
      companyId: membership.companyId,
      studentId: mobileToken.userId,
      setupIntentId: payload.setupIntentId,
      paymentMethodId: payload.paymentMethodId,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
