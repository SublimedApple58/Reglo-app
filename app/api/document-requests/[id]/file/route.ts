import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Bucket, getR2Client } from '@/lib/storage/r2';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'User is not authenticated' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const request = await prisma.documentRequest.findFirst({
      where: { id },
      select: { companyId: true, resultUrl: true },
    });

    if (!request?.resultUrl) {
      return NextResponse.json(
        { success: false, message: 'Document not found' },
        { status: 404 }
      );
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: request.companyId },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: 'User is not authorized for this company' },
        { status: 403 }
      );
    }

    const response = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: request.resultUrl,
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
