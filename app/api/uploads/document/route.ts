import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { getR2Bucket, getR2Client, getSignedAssetUrl } from '@/lib/storage/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const isPdfFile = (file: File) => {
  if (file.type === 'application/pdf') return true;
  return file.name?.toLowerCase().endsWith('.pdf');
};

const normalizeName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return 'Documento senza titolo';
  return trimmed.replace(/\.[^/.]+$/, '');
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'User is not authenticated' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const companyId = formData.get('companyId');

    if (typeof companyId !== 'string' || !companyId) {
      return NextResponse.json(
        { success: false, message: 'Company is required' },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'File is required' },
        { status: 400 }
      );
    }

    if (!isPdfFile(file)) {
      return NextResponse.json(
        { success: false, message: 'Only PDF files are supported.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { success: false, message: 'File is too large. Max size is 20MB.' },
        { status: 400 }
      );
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: 'User is not authorized for this company' },
        { status: 403 }
      );
    }

    const key = `companies/${companyId}/documents/${randomUUID()}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      })
    );

    const template = await prisma.documentTemplate.create({
      data: {
        companyId,
        name: normalizeName(file.name),
        sourceUrl: key,
      },
    });

    const previewUrl = await getSignedAssetUrl(key);

    return NextResponse.json({
      success: true,
      data: {
        id: template.id,
        title: template.name,
        updatedAt: template.updatedAt.toISOString(),
        previewUrl,
        sourceUrl: key,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    );
  }
}
