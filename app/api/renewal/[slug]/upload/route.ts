import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import {
  resolveRenewalCompany,
  renewalRateLimit,
  clientIpFrom,
} from "@/lib/renewal/public";
import { putRenewalDocument } from "@/lib/renewal/storage";
import {
  RENEWAL_DOCUMENT_TYPES,
  RENEWAL_UPLOAD_ACCEPT,
  RENEWAL_UPLOAD_MAX_BYTES,
} from "@/lib/renewal/constants";

/**
 * POST /api/renewal/[slug]/upload  (multipart/form-data)
 * Public (no auth). Fields: requestId, type, file. Stores the document on R2 and
 * records a RenewalDocument row. Flips the request to "under_review".
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
    const limit = await renewalRateLimit(`upload:${company.id}:${ip}`, 30, 3600);
    if (!limit.ok) {
      return NextResponse.json({ success: false, message: "RATE_LIMITED" }, { status: 429 });
    }

    const form = await request.formData();
    const requestId = String(form.get("requestId") ?? "");
    const type = String(form.get("type") ?? "");
    const file = form.get("file");

    if (!RENEWAL_DOCUMENT_TYPES.includes(type as (typeof RENEWAL_DOCUMENT_TYPES)[number])) {
      return NextResponse.json({ success: false, message: "INVALID_TYPE" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "NO_FILE" }, { status: 400 });
    }
    if (!RENEWAL_UPLOAD_ACCEPT.includes(file.type)) {
      return NextResponse.json({ success: false, message: "UNSUPPORTED_FORMAT" }, { status: 400 });
    }
    if (file.size > RENEWAL_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ success: false, message: "FILE_TOO_LARGE" }, { status: 400 });
    }

    const owned = await prisma.renewalRequest.findFirst({
      where: { id: requestId, companyId: company.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ success: false, message: "REQUEST_NOT_FOUND" }, { status: 404 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const key = await putRenewalDocument({
      companyId: company.id,
      requestId,
      type,
      bytes,
      contentType: file.type,
    });

    await prisma.$transaction([
      prisma.renewalDocument.create({
        data: { requestId, type, fileKey: key, contentType: file.type, status: "uploaded" },
      }),
      prisma.renewalRequest.updateMany({
        where: { id: requestId, status: "submitted" },
        data: { status: "under_review" },
      }),
    ]);

    return NextResponse.json({ success: true, data: { type } });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 500 });
  }
}
