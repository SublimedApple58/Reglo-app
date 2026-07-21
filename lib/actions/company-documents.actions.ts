"use server";

import { z } from "zod";
import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { requireServiceAccess } from "@/lib/service-access";
import { getR2Bucket, getR2Client } from "@/lib/storage/r2";
import {
  DOCUMENT_KINDS,
  type CompanyDocumentDto,
  type CompanyDocumentKind,
} from "@/lib/company-documents";

/**
 * Documenti dell'autoscuola (vedi docs/features/company-documents.md).
 * Il team Reglo li carica dal backoffice (contratto di servizio, fatture,
 * altri documenti); il titolare li vede e scarica in Area personale →
 * "Contratto e fattura". Download SEMPRE con URL firmato a scadenza
 * (mai R2_PUBLIC_BASE_URL: sono documenti riservati).
 */

const DOWNLOAD_URL_TTL_SECONDS = 300;

function toDto(doc: {
  id: string;
  kind: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): CompanyDocumentDto {
  return {
    id: doc.id,
    kind: (DOCUMENT_KINDS as readonly string[]).includes(doc.kind)
      ? (doc.kind as CompanyDocumentKind)
      : "other",
    title: doc.title,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt.toISOString(),
  };
}

// URL firmato con Content-Disposition: il browser scarica col nome originale.
async function signedDownloadUrl(fileKey: string, fileName: string) {
  const safeName = fileName.replace(/["\\\r\n]/g, "_");
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: fileKey,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

// I documenti sono riservati alla proprietà: titolare o istruttore-titolare.
async function requireCompanyOwner() {
  const context = await requireServiceAccess("AUTOSCUOLE");
  const role = context.membership.autoscuolaRole;
  if (role !== "OWNER" && role !== "INSTRUCTOR_OWNER") {
    throw new Error("Sezione riservata al titolare dell'autoscuola.");
  }
  return context;
}

// ── Lato company (Area personale) ────────────────────────────────────────────

export async function getCompanyDocuments() {
  try {
    const { membership } = await requireCompanyOwner();
    const docs = await prisma.companyDocument.findMany({
      where: { companyId: membership.companyId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: docs.map(toDto) };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getCompanyDocumentDownloadUrl(documentId: string) {
  try {
    const { membership } = await requireCompanyOwner();
    const id = z.string().uuid().parse(documentId);
    const doc = await prisma.companyDocument.findFirst({
      where: { id, companyId: membership.companyId },
    });
    if (!doc) return { success: false, message: "Documento non trovato." };
    return { success: true, data: { url: await signedDownloadUrl(doc.fileKey, doc.fileName) } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Lato backoffice ──────────────────────────────────────────────────────────

export async function getBackofficeCompanyDocuments(companyId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(companyId);
    const docs = await prisma.companyDocument.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: docs.map(toDto) };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getBackofficeDocumentDownloadUrl(documentId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(documentId);
    const doc = await prisma.companyDocument.findUnique({ where: { id } });
    if (!doc) return { success: false, message: "Documento non trovato." };
    return { success: true, data: { url: await signedDownloadUrl(doc.fileKey, doc.fileName) } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteBackofficeCompanyDocument(documentId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(documentId);
    const doc = await prisma.companyDocument.findUnique({ where: { id } });
    if (!doc) return { success: false, message: "Documento non trovato." };

    await prisma.companyDocument.delete({ where: { id } });
    // Best-effort: la riga DB è la fonte di verità, un orfano su R2 non è grave.
    try {
      await getR2Client().send(
        new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: doc.fileKey }),
      );
    } catch (err) {
      console.error("[company-documents] R2 delete failed", err);
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
