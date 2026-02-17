import { NextResponse } from "next/server";

import { getActiveCompanyContext } from "@/lib/company-context";
import { getMobileAppointmentPaymentDocument } from "@/lib/autoscuole/payments";
import { getMobileToken, parseBearerToken } from "@/lib/mobile-auth";
import { formatError } from "@/lib/utils";

export async function GET(
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

    const { id } = await params;
    const data = await getMobileAppointmentPaymentDocument({
      companyId: membership.companyId,
      studentId: mobileToken.userId,
      appointmentId: id,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = formatError(error);
    const status = message.toLowerCase().includes("non trovato") ? 404 : 400;
    return NextResponse.json(
      { success: false, message },
      { status },
    );
  }
}
