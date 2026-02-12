import { NextResponse } from "next/server";

import { getMobileToken, parseBearerToken } from "@/lib/mobile-auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { formatError } from "@/lib/utils";
import { createStudentSetupIntent } from "@/lib/autoscuole/payments";

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

    const data = await createStudentSetupIntent({
      companyId: membership.companyId,
      studentId: mobileToken.userId,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
