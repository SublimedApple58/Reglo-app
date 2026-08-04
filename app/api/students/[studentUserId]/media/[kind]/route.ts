import { NextResponse } from 'next/server';
import { prisma } from '@/db/prisma';
import { requireServiceAccess } from '@/lib/service-access';
import { isInstructor, isOwner } from '@/lib/autoscuole/roles';
import { getR2Bucket, getR2Client } from '@/lib/storage/r2';
import {
  photoToPortalVariant,
  signatureToPortalVariant,
} from '@/lib/images/portal';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getSignedAssetUrl } from '@/lib/storage/r2';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const UPLOAD_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

type Kind = 'photo' | 'signature';
type Variant = 'original' | 'portale';

const KIND_LABEL: Record<Kind, string> = {
  photo: 'foto',
  signature: 'firma',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentUserId: string; kind: string }> }
) {
  try {
    const { studentUserId, kind } = await params;
    const { searchParams } = new URL(request.url);
    const variant = (searchParams.get('variant') ?? 'original') as Variant;

    if (kind !== 'photo' && kind !== 'signature') {
      return NextResponse.json(
        { success: false, message: 'Tipo non valido.' },
        { status: 400 }
      );
    }
    if (variant !== 'original' && variant !== 'portale') {
      return NextResponse.json(
        { success: false, message: 'Variante non valida.' },
        { status: 400 }
      );
    }

    const { membership } = await requireServiceAccess('AUTOSCUOLE');
    const isStaff =
      membership.role === 'admin' ||
      isOwner(membership.autoscuolaRole) ||
      isInstructor(membership.autoscuolaRole);
    if (!isStaff) {
      return NextResponse.json(
        { success: false, message: 'Non autorizzato.' },
        { status: 403 }
      );
    }

    // L'allievo deve appartenere all'autoscuola attiva dello staff.
    const student = await prisma.user.findFirst({
      where: {
        id: studentUserId,
        companyMembers: { some: { companyId: membership.companyId } },
      },
      select: { name: true, image: true, signatureKey: true },
    });
    if (!student) {
      return NextResponse.json(
        { success: false, message: 'Allievo non trovato.' },
        { status: 404 }
      );
    }

    const key = kind === 'photo' ? student.image : student.signatureKey;
    if (!key) {
      return NextResponse.json(
        { success: false, message: `Nessuna ${KIND_LABEL[kind]} caricata.` },
        { status: 404 }
      );
    }

    const object = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: key })
    );
    const original = Buffer.from(
      await (object.Body as { transformToByteArray(): Promise<Uint8Array> })
        .transformToByteArray()
    );

    let body: Buffer;
    let contentType: string;
    let extension: string;

    if (variant === 'portale') {
      const processed =
        kind === 'photo'
          ? await photoToPortalVariant(original)
          : await signatureToPortalVariant(original);
      body = processed.buffer;
      contentType = processed.contentType;
      extension = processed.extension;
    } else {
      body = original;
      contentType = object.ContentType ?? 'application/octet-stream';
      extension = key.split('.').pop() ?? 'bin';
    }

    const slug = (student.name ?? 'allievo')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const suffix = variant === 'portale' ? 'portale-automobilista' : 'originale';
    const filename = `${KIND_LABEL[kind]}-${slug}-${suffix}.${extension}`;

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Download non riuscito',
      },
      { status: 500 }
    );
  }
}

/**
 * Upload della foto profilo da parte dello staff, al posto dell'allievo.
 * Stessa semantica dell'upload mobile: originale salvato com'è su `User.image`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentUserId: string; kind: string }> }
) {
  try {
    const { studentUserId, kind } = await params;
    if (kind !== 'photo') {
      return NextResponse.json(
        { success: false, message: 'Upload non supportato per questo tipo.' },
        { status: 400 }
      );
    }

    const { membership } = await requireServiceAccess('AUTOSCUOLE');
    const isStaff =
      membership.role === 'admin' ||
      isOwner(membership.autoscuolaRole) ||
      isInstructor(membership.autoscuolaRole);
    if (!isStaff) {
      return NextResponse.json(
        { success: false, message: 'Non autorizzato.' },
        { status: 403 }
      );
    }

    const student = await prisma.user.findFirst({
      where: {
        id: studentUserId,
        companyMembers: { some: { companyId: membership.companyId } },
      },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json(
        { success: false, message: 'Allievo non trovato.' },
        { status: 404 }
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
    const extension = UPLOAD_IMAGE_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { success: false, message: 'Formato immagine non supportato.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, message: 'Immagine troppo grande (max 15MB).' },
        { status: 400 }
      );
    }

    const key = `users/${studentUserId}/photo-${randomUUID()}.${extension}`;
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      })
    );
    await prisma.user.update({
      where: { id: studentUserId },
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
