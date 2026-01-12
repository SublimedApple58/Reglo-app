import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { getR2Bucket, getR2Client, getSignedAssetUrl } from '@/lib/storage/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const isGlobalAdmin = session?.user?.role === 'admin';

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

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: 'User is not authorized for this company' },
        { status: 403 }
      );
    }

    if (!isGlobalAdmin && membership.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Only admins can update company logo' },
        { status: 403 }
      );
    }

    const extension = IMAGE_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { success: false, message: 'Unsupported image type.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, message: 'Image is too large. Max size is 5MB.' },
        { status: 400 }
      );
    }

    const key = `companies/${companyId}/logo-${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    await prisma.company.update({
      where: { id: companyId },
      data: { logoKey: key },
    });

    const url = await getSignedAssetUrl(key);

    return NextResponse.json({
      success: true,
      data: { key, url },
      message: 'Company logo updated successfully',
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
