import { NextResponse } from 'next/server';
import { prisma } from '@/db/prisma';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const request = await prisma.documentRequest.findFirst({
      where: { publicToken: token },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            sourceUrl: true,
            fields: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!request) {
      return NextResponse.json(
        { success: false, message: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: request.id,
        name: request.name,
        status: request.status,
        completedAt: request.completedAt?.toISOString() ?? null,
        completedByName: request.completedByName ?? null,
        template: {
          id: request.template.id,
          name: request.template.name,
          sourceUrl: request.template.sourceUrl
            ? `/api/public/document-requests/${token}/file`
            : null,
        },
        fields: request.template.fields,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch data',
      },
      { status: 500 }
    );
  }
}
