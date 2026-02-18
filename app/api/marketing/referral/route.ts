import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const referralSchema = z.object({
  studentName: z.string().min(2, 'Student name is required'),
  phone: z.string().min(5, 'Phone is required'),
  city: z.string().min(1, 'City is required'),
  referredSchool: z.string().min(1, 'Referred school is required'),
  role: z.enum(['allievo', 'ex_allievo']),
  studentEmail: z.string().email('Invalid email').optional(),
  schoolContact: z.string().optional(),
  notes: z.string().optional(),
  consent: z.boolean().refine((value) => value, {
    message: 'Privacy consent is required',
  }),
  source: z.enum(['home']).optional(),
});

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const slackWebhookUrl = process.env.SLACK_REFERRAL_WEBHOOK_URL ?? process.env.SLACK_WEBHOOK_URL;

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
  'https://reglo.it',
  'https://www.reglo.it',
  'https://landing.reglo.it',
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

  const parsed = referralSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.errors[0]?.message ?? 'Invalid data' },
      { status: 400, headers }
    );
  }

  const {
    studentName,
    phone,
    city,
    referredSchool,
    role,
    studentEmail,
    schoolContact,
    notes,
    source,
  } = parsed.data;

  try {
    const notesMerged = [
      notes ? `Note: ${notes}` : null,
      schoolContact ? `Contatto autoscuola: ${schoolContact}` : null,
      source ? `Source: ${source}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const primaryProperties = {
      Name: {
        title: [{ text: { content: studentName } }],
      },
      Company: {
        rich_text: [{ text: { content: referredSchool } }],
      },
      ...(studentEmail
        ? {
            Email: {
              email: studentEmail,
            },
          }
        : {}),
      Phone: {
        phone_number: phone,
      },
      ...(notesMerged
        ? {
            Need: {
              rich_text: [{ text: { content: notesMerged } }],
            },
          }
        : {}),
      'Lead Type': {
        select: { name: 'student_referral' },
      },
      'Referral Status': {
        select: { name: 'new' },
      },
      'Student Name': {
        rich_text: [{ text: { content: studentName } }],
      },
      'Student Phone': {
        phone_number: phone,
      },
      'Student City': {
        rich_text: [{ text: { content: city } }],
      },
      'Referred School': {
        rich_text: [{ text: { content: referredSchool } }],
      },
      'Reward Type': {
        select: { name: '2_guide_voucher' },
      },
    };

    let created;
    try {
      created = await notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: primaryProperties,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const hasUnknownProperty =
        /property|schema|does not exist|Could not find property|select option|validation/i.test(
          message
        );
      if (!hasUnknownProperty) {
        throw error;
      }
      created = await notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          Name: {
            title: [{ text: { content: studentName } }],
          },
          Company: {
            rich_text: [{ text: { content: referredSchool } }],
          },
          ...(studentEmail
            ? {
                Email: {
                  email: studentEmail,
                },
              }
            : {}),
          Phone: {
            phone_number: phone,
          },
          Gestionale: {
            rich_text: [{ text: { content: `Referral role: ${role}` } }],
          },
          ...(notesMerged
            ? {
                Need: {
                  rich_text: [{ text: { content: notesMerged } }],
                },
              }
            : {}),
        },
      });
    }

    const notionUrl = (created as { url?: string }).url;
    const messageLines = [
      'Nuovo referral allievi (promo 2 guide).',
      `Allievo: ${studentName}`,
      `Telefono: ${phone}`,
      `Citta: ${city}`,
      `Ruolo: ${role}`,
      `Autoscuola segnalata: ${referredSchool}`,
      `Email allievo: ${studentEmail ?? '-'}`,
      `Contatto autoscuola: ${schoolContact ?? '-'}`,
      `Note: ${notes ?? '-'}`,
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
