import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { getActiveCompanyContext } from "@/lib/company-context";
import { formatError } from "@/lib/utils";

const unregisterPushSchema = z.object({
  token: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const payload = unregisterPushSchema.parse(await request.json().catch(() => ({})));
    const { membership, activeCompanyId } = await getActiveCompanyContext();
    const now = new Date();

    const whereBase = {
      userId: membership.userId,
      companyId: activeCompanyId ?? membership.companyId,
      disabledAt: null,
    };

    const result = await prisma.mobilePushDevice.updateMany({
      where: payload.token
        ? {
            ...whereBase,
            token: payload.token.trim(),
          }
        : whereBase,
      data: {
        disabledAt: now,
      },
    });

    return NextResponse.json({ success: true, data: { count: result.count } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
