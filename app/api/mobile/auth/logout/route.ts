import { NextResponse } from "next/server";
import { parseBearerToken, revokeMobileToken } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Token mancante." },
      { status: 401 },
    );
  }

  await revokeMobileToken(token);
  return NextResponse.json({ success: true });
}
