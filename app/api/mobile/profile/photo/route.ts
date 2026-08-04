import { NextResponse } from 'next/server';
import { prisma } from '@/db/prisma';
import { parseBearerToken, getMobileToken } from '@/lib/mobile-auth';
import { getR2Bucket, getR2Client, getSignedAssetUrl } from '@/lib/storage/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export async function POST(request: Request) {
  try {
    const token = parseBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token mancante.' },
        { status: 401 }
      );
    }

    const mobileToken = await getMobileToken(token);
    if (!mobileToken) {
      return NextResponse.json(
        { success: false, message: 'Token non valido.' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'File mancante.' },
        { status: 400 }
      );
    }

    const extension = IMAGE_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { success: false, message: 'Formato immagine non supportato.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, message: 'Immagine troppo grande (max 15MB).' },
        { status: 400 }
      );
    }

    // L'originale viene salvato esattamente com'è stato caricato:
    // nessun resize/compressione in upload (richiesta esplicita).
    const key = `users/${mobileToken.userId}/photo-${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    await prisma.user.update({
      where: { id: mobileToken.userId },
      data: { image: key },
    });

    const url = await getSignedAssetUrl(key);

    return NextResponse.json({ success: true, data: { key, url } });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Upload non riuscito',
      },
      { status: 500 }
    );
  }
}
