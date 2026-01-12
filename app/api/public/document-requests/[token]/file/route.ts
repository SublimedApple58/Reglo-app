import { NextResponse } from 'next/server';
import { prisma } from '@/db/prisma';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Bucket, getR2Client } from '@/lib/storage/r2';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const request = await prisma.documentRequest.findFirst({
      where: { publicToken: token },
      select: {
        template: { select: { sourceUrl: true } },
      },
    });

    if (!request?.template.sourceUrl) {
      return NextResponse.json(
        { success: false, message: 'Document not found' },
        { status: 404 }
      );
    }

    const response = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: request.template.sourceUrl,
      })
    );

    if (!response.Body) {
      return NextResponse.json(
        { success: false, message: 'File not available' },
        { status: 404 }
      );
    }

    return new Response(response.Body as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch file',
      },
      { status: 500 }
    );
  }
}
