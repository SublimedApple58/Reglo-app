import { NextResponse } from 'next/server';
import { prisma } from '@/db/prisma';
import { getR2Bucket, getR2Client } from '@/lib/storage/r2';
import { triggerDocumentCompletionWorkflows } from '@/lib/workflows/trigger';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const formData = await request.formData();
    const file = formData.get('file');
    const fullName = formData.get('fullName');
    const payloadRaw = formData.get('payload');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'Missing PDF file' },
        { status: 400 }
      );
    }

    if (typeof fullName !== 'string' || !fullName.trim()) {
      return NextResponse.json(
        { success: false, message: 'Full name is required' },
        { status: 400 }
      );
    }

    const docRequest = await prisma.documentRequest.findFirst({
      where: { publicToken: token },
      select: {
        id: true,
        status: true,
        companyId: true,
        templateId: true,
        publicToken: true,
      },
    });

    if (!docRequest) {
      return NextResponse.json(
        { success: false, message: 'Document not found' },
        { status: 404 }
      );
    }

    if (docRequest.status === 'completed') {
      return NextResponse.json(
        { success: false, message: 'Document already completed' },
        { status: 400 }
      );
    }

    const key = `document-requests/${docRequest.id}/completed-${randomUUID()}.pdf`;
    const buffer = new Uint8Array(await file.arrayBuffer());

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      })
    );

    let payload: unknown = null;
    if (typeof payloadRaw === 'string' && payloadRaw.trim()) {
      try {
        payload = JSON.parse(payloadRaw);
      } catch {
        payload = null;
      }
    }

    const completedAt = new Date();
    await prisma.documentRequest.update({
      where: { id: docRequest.id },
      data: {
        status: 'completed',
        resultUrl: key,
        completedAt,
        completedByName: fullName.trim(),
        payload: payload ?? undefined,
      },
    });

    const fieldPayload =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

    await triggerDocumentCompletionWorkflows({
      companyId: docRequest.companyId,
      templateId: docRequest.templateId,
      triggerPayload: {
        ...fieldPayload,
        __meta: {
          templateId: docRequest.templateId,
          requestId: docRequest.id,
          publicToken: docRequest.publicToken,
          resultUrl: key,
          completedAt: completedAt.toISOString(),
          completedByName: fullName.trim(),
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to complete',
      },
      { status: 500 }
    );
  }
}
