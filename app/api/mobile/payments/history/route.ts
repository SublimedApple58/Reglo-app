import { NextResponse } from "next/server";

import { getActiveCompanyContext } from "@/lib/company-context";
import { getMobileToken, parseBearerToken } from "@/lib/mobile-auth";
import { getMobileStudentPaymentHistory } from "@/lib/autoscuole/payments";
import { formatError } from "@/lib/utils";

const parseLimit = (value: string | null) => {
  if (!value) return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
};

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));

    const data = await getMobileStudentPaymentHistory({
      companyId: membership.companyId,
      studentId: mobileToken.userId,
      limit,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
