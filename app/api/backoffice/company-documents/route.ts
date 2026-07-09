import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@/db/prisma";
import { validateBackofficeCookie } from "@/lib/backoffice-auth";
import { getR2Bucket, getR2Client } from "@/lib/storage/r2";
import { DOCUMENT_KINDS, type CompanyDocumentKind } from "@/lib/company-documents";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Documenti di lavoro: PDF in primis, più immagini (scansioni) e Office.
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/**
 * Upload documento autoscuola dal backoffice (multipart form: file, companyId,
 * kind, title?). kind="contract" è unico: il nuovo upload sostituisce il
 * precedente (riga + oggetto R2). Vedi docs/features/company-documents.md.
 */
export async function POST(request: Request) {
  try {
    if (!(await validateBackofficeCookie())) {
      return NextResponse.json(
        { success: false, message: "Non autorizzato." },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const companyId = formData.get("companyId");
    const kind = formData.get("kind");
    const rawTitle = formData.get("title");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "File mancante." },
        { status: 400 },
      );
    }
    if (
      typeof companyId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(companyId) ||
      typeof kind !== "string" ||
      !(DOCUMENT_KINDS as readonly string[]).includes(kind)
    ) {
      return NextResponse.json(
        { success: false, message: "Parametri non validi." },
        { status: 400 },
      );
    }

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { success: false, message: "Formato non supportato (PDF, immagini, Word, Excel)." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, message: "File troppo grande (max 20MB)." },
        { status: 400 },
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json(
        { success: false, message: "Autoscuola non trovata." },
        { status: 404 },
      );
    }

    const fileName = file.name || `documento.${extension}`;
    const title =
      typeof rawTitle === "string" && rawTitle.trim()
        ? rawTitle.trim().slice(0, 120)
        : fileName.replace(/\.[^.]+$/, "");

    const key = `companies/${companyId}/documents/${kind}-${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    // Il contratto è unico: un nuovo upload sostituisce il precedente.
    const previousContracts =
      kind === "contract"
        ? await prisma.companyDocument.findMany({
            where: { companyId, kind: "contract" },
          })
        : [];

    const created = await prisma.$transaction(async (tx) => {
      if (previousContracts.length) {
        await tx.companyDocument.deleteMany({
          where: { id: { in: previousContracts.map((d) => d.id) } },
        });
      }
      return tx.companyDocument.create({
        data: {
          companyId,
          kind: kind as CompanyDocumentKind,
          title,
          fileKey: key,
          fileName,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });
    });

    // Best-effort cleanup dei vecchi oggetti contratto su R2.
    for (const old of previousContracts) {
      try {
        await getR2Client().send(
          new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: old.fileKey }),
        );
      } catch (err) {
        console.error("[company-documents] R2 cleanup failed", err);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        kind: created.kind,
        title: created.title,
        fileName: created.fileName,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Upload non riuscito.",
      },
      { status: 500 },
    );
  }
}
