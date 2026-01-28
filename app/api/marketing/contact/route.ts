import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const contactSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  company: z.string().min(1, 'Company is required'),
  phone: z.string().optional(),
  managementSoftware: z.string().optional(),
  process: z.string().optional(),
  source: z.enum(['home', 'demo']).optional(),
});

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

const postToSlack = async (payload: { text: string }) => {
  if (!slackWebhookUrl) return;
  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore Slack errors to avoid blocking form submission
  }
};

const fallbackOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://reglo-landing.netlify.app',
];

const allowedOrigins = process.env.MARKETING_ALLOWED_ORIGINS
  ? process.env.MARKETING_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : fallbackOrigins;

const createCorsHeaders = (origin: string | null) => {
  const headers = new Headers();
  const isAllowed = origin ? allowedOrigins.includes(origin) : true;
  if (origin && isAllowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return { headers, isAllowed };
};

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  const { headers, isAllowed } = createCorsHeaders(origin);
  if (!isAllowed) {
    return NextResponse.json(
      { success: false, message: 'Origin not allowed' },
      { status: 403, headers }
    );
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const { headers, isAllowed } = createCorsHeaders(origin);

  if (!isAllowed) {
    return NextResponse.json(
      { success: false, message: 'Origin not allowed' },
      { status: 403, headers }
    );
  }

  if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
    return NextResponse.json(
      { success: false, message: 'Notion is not configured' },
      { status: 500, headers }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid JSON payload' },
      { status: 400, headers }
    );
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.errors[0]?.message ?? 'Invalid data' },
      { status: 400, headers }
    );
  }

  const {
    fullName,
    email,
    company,
    phone,
    managementSoftware,
    process: need,
  } = parsed.data;

  try {
    const created = await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        Name: {
          title: [{ text: { content: fullName } }],
        },
        Company: {
          rich_text: [{ text: { content: company } }],
        },
        Email: {
          email,
        },
        ...(phone
          ? {
              Phone: {
                phone_number: phone,
              },
            }
          : {}),
        ...(managementSoftware
          ? {
              Gestionale: {
                rich_text: [{ text: { content: managementSoftware } }],
              },
            }
          : {}),
        ...(need
          ? {
              Need: {
                rich_text: [{ text: { content: need } }],
              },
            }
          : {}),
      },
    });

    const notionUrl = (created as { url?: string }).url;
    const messageLines = [
      `Hey, ${fullName} ha chiesto una demo.`,
      `Email: ${email}`,
      `Azienda: ${company}`,
      `Telefono: ${phone ?? '-'}`,
      `Gestionale: ${managementSoftware ?? '-'}`,
      `Need: ${need ?? '-'}`,
      notionUrl ? `Notion: ${notionUrl}` : null,
    ].filter(Boolean);

    await postToSlack({ text: messageLines.join('\n') });

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Notion request failed',
      },
      { status: 500, headers }
    );
  }
}
