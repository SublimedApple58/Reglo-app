import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { getActiveCompanyContext } from "@/lib/company-context";
import { formatError } from "@/lib/utils";

const registerPushSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]).optional(),
  deviceId: z.string().max(255).optional().nullable(),
  appVersion: z.string().max(64).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const payload = registerPushSchema.parse(await request.json());
    const { membership, activeCompanyId } = await getActiveCompanyContext();

    const token = payload.token.trim();
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Token push non valido." },
        { status: 400 },
      );
    }

    const now = new Date();
    const companyId = activeCompanyId ?? membership.companyId;

    const device = await prisma.mobilePushDevice.upsert({
      where: { token },
      update: {
        userId: membership.userId,
        companyId,
        platform: payload.platform ?? "ios",
        deviceId: payload.deviceId ?? null,
        appVersion: payload.appVersion ?? null,
        lastSeenAt: now,
        disabledAt: null,
      },
      create: {
        userId: membership.userId,
        companyId,
        token,
        platform: payload.platform ?? "ios",
        deviceId: payload.deviceId ?? null,
        appVersion: payload.appVersion ?? null,
        lastSeenAt: now,
      },
    });

    return NextResponse.json({ success: true, data: { id: device.id } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
