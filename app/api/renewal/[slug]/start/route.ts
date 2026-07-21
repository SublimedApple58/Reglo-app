import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import {
  resolveRenewalCompany,
  renewalRateLimit,
  clientIpFrom,
} from "@/lib/renewal/public";

/**
 * POST /api/renewal/[slug]/start
 * Public (no auth). Creates an anonymous renewal request (session) for the
 * autoscuola identified by `slug`, and returns its id + display name.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const company = await resolveRenewalCompany(slug);
    if (!company) {
      return NextResponse.json({ success: false, message: "NOT_FOUND" }, { status: 404 });
    }

    const ip = clientIpFrom(request.headers);
    const limit = await renewalRateLimit(`start:${company.id}:${ip}`, 10, 3600);
    if (!limit.ok) {
      return NextResponse.json({ success: false, message: "RATE_LIMITED" }, { status: 429 });
    }

    const created = await prisma.renewalRequest.create({
      data: { companyId: company.id, status: "submitted" },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: { requestId: created.id, companyName: company.name },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 500 });
  }
}
