import { NextResponse } from 'next/server';
import { prisma } from '@/db/prisma';
import { requireServiceAccess } from '@/lib/service-access';
import { isInstructor, isOwner } from '@/lib/autoscuole/roles';
import { getR2Bucket, getR2Client } from '@/lib/storage/r2';
import {
  photoToPortalVariant,
  signatureToPortalVariant,
} from '@/lib/images/portal';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

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
