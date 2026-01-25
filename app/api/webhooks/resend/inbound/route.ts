import { NextRequest, NextResponse } from "next/server";
import { normalizeInboundPayload, triggerEmailInboundWorkflows } from "@/lib/workflows/email-inbound";

const parseBody = async (req: NextRequest) => {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return req.json();
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const data: Record<string, unknown> = {};
    const textKeys = new Set([
      "text",
      "text_body",
      "text_plain",
      "plain",
      "body",
      "body_plain",
      "stripped_text",
      "html",
      "html_body",
      "body_html",
      "stripped_html",
      "content",
    ]);
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        data[key] = value;
        continue;
      }
      const isTextLike =
        textKeys.has(key) ||
        value.type.startsWith("text/") ||
        value.type.includes("html");
      if (isTextLike) {
        try {
          data[key] = await value.text();
        } catch {
          data[key] = "";
        }
        continue;
      }
      data[key] = {
        filename: value.name,
        type: value.type,
        size: value.size,
      };
    }
    return data;
  }
  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, message: "RESEND_INBOUND_WEBHOOK_SECRET missing." },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token !== secret) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const payload = await parseBody(req);
  const normalized = normalizeInboundPayload(payload);
  if (!normalized || normalized.to.length === 0) {
    return NextResponse.json({ success: true, message: "No recipient." });
  }

  await triggerEmailInboundWorkflows({ inbound: normalized });

  return NextResponse.json({ success: true });
}
