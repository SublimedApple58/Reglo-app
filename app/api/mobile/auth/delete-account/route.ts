import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteAndAnonymizeUserAccount } from "@/lib/account-deletion";
import { formatError } from "@/lib/utils";
import { getMobileToken, parseBearerToken } from "@/lib/mobile-auth";

const deleteAccountSchema = z.object({
  confirm: z.literal(true),
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

    const payload = await request.json().catch(() => ({}));
    deleteAccountSchema.parse(payload);

    await deleteAndAnonymizeUserAccount(mobileToken.userId);

    return NextResponse.json({
      success: true,
      data: {
        deleted: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
