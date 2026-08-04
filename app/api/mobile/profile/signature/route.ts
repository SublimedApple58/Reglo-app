import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/db/prisma';
import { parseBearerToken, getMobileToken } from '@/lib/mobile-auth';
import { getR2Bucket, getR2Client, getSignedAssetUrl } from '@/lib/storage/r2';
import { rasterizeSignature } from '@/lib/images/portal';
import { SIGNATURE_ORIGINAL_SCALE } from '@/lib/portal-image-specs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { formatError } from '@/lib/utils';

export const runtime = 'nodejs';

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const signatureSchema = z.object({
  strokes: z
    .array(z.object({ points: z.array(pointSchema).min(1).max(2000) }))
    .min(1)
    .max(200),
  width: z.number().positive().max(4000),
  height: z.number().positive().max(4000),
  strokeWidth: z.number().positive().max(20),
});

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

    const payload = signatureSchema.parse(await request.json());

    // L'originale è la rasterizzazione fedele del tratto disegnato
    // (stesse coordinate/spessore del pad sul telefono), PNG trasparente.
    const { buffer, contentType, extension } = await rasterizeSignature({
      strokes: payload.strokes,
      width: payload.width,
      height: payload.height,
      strokeWidth: payload.strokeWidth,
      scale: SIGNATURE_ORIGINAL_SCALE,
    });

    const key = `users/${mobileToken.userId}/signature-${randomUUID()}.${extension}`;

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    await prisma.user.update({
      where: { id: mobileToken.userId },
      data: { signatureKey: key },
    });

    const url = await getSignedAssetUrl(key);

    return NextResponse.json({ success: true, data: { key, url } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 }
    );
  }
}
