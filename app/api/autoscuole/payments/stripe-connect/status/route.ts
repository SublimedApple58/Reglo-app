import { NextResponse } from "next/server";

import {
  canManageAutoscuolaStripeConnect,
  getAutoscuolaStripeConnectStatus,
} from "@/lib/autoscuole/stripe-connect";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

export async function GET() {
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

    const data = await getAutoscuolaStripeConnectStatus({
      companyId: membership.companyId,
      sync: true,
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
