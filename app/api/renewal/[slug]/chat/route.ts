import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import {
  resolveRenewalCompany,
  renewalRateLimit,
  clientIpFrom,
} from "@/lib/renewal/public";
import { runRenewalChatTurn } from "@/lib/renewal/chat";

/**
 * POST /api/renewal/[slug]/chat
 * Public (no auth). Runs one chatbot turn for an existing request. Optional
 * image data URLs enable a light vision soft-check of uploaded documents.
 */

const bodySchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().max(2000).default(""),
  imageDataUrls: z.array(z.string().startsWith("data:image/")).max(2).optional(),
});

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
    const limit = await renewalRateLimit(`chat:${company.id}:${ip}`, 60, 600);
    if (!limit.ok) {
      return NextResponse.json({ success: false, message: "RATE_LIMITED" }, { status: 429 });
    }

    const body = bodySchema.parse(await request.json());

    // Ensure the request belongs to this company.
    const owned = await prisma.renewalRequest.findFirst({
      where: { id: body.requestId, companyId: company.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ success: false, message: "REQUEST_NOT_FOUND" }, { status: 404 });
    }

    const result = await runRenewalChatTurn({
      companyId: company.id,
      companyName: company.name,
      requestId: body.requestId,
      userText: body.message,
      imageDataUrls: body.imageDataUrls,
      anamnesticRequired: company.anamnesticRequired,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
