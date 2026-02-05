import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { parseBearerToken, getMobileToken } from "@/lib/mobile-auth";
import { formatError } from "@/lib/utils";

const updateProfileSchema = z.object({
  name: z.string().min(3),
});

export async function PATCH(request: Request) {
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

    const payload = updateProfileSchema.parse(await request.json());
    const name = payload.name.trim();

    const user = await prisma.user.update({
      where: { id: mobileToken.userId },
      data: { name },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
