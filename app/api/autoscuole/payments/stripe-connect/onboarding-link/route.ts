import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageAutoscuolaStripeConnect,
  createAutoscuolaStripeConnectOnboardingLink,
} from "@/lib/autoscuole/stripe-connect";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

const payloadSchema = z.object({
  returnPath: z.string().trim().optional().nullable(),
  refreshPath: z.string().trim().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");

    if (!canManageAutoscuolaStripeConnect(membership.role, membership.autoscuolaRole)) {
      return NextResponse.json(
        {
          success: false,
          message: "Operazione non consentita.",
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const payload = payloadSchema.parse(body ?? {});

    const data = await createAutoscuolaStripeConnectOnboardingLink({
      companyId: membership.companyId,
      returnPath: payload.returnPath,
      refreshPath: payload.refreshPath,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: formatError(error),
      },
      { status: 400 },
    );
  }
}
