"use client";

import React from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DocumentCanvas } from "@/components/pages/DocManager/DocumentCanvas";
import { DocumentHeader } from "@/components/pages/DocManager/DocumentHeader";
import {
  documents,
  fillFields,
  pdfSource,
  userProfile,
} from "@/components/pages/DocManager/doc-manager.data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocFillOverlay } from "@/components/pages/DocManager/doc-fill/DocFillOverlay";
import { SignatureDialog } from "@/components/pages/DocManager/doc-fill/SignatureDialog";
import { Link2, Mail, MessageSquareText } from "lucide-react";

type DocFillWrapperProps = {
  docId?: string;
};

export function DocFillWrapper({ docId }: DocFillWrapperProps): React.ReactElement {
  const doc = documents.find((item) => item.id === docId);
  const resolvedDoc = doc ?? {
    id: docId ?? "doc",
    title: "Documento mock",
    updatedAt: "Aggiornato ora",
    owner: "Reglo",
  };
  const fullName = `${userProfile.firstName} ${userProfile.lastName}`;
  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fillFields.forEach((field) => {
      initial[field.id] = "";
    });
    return initial;
  });
  const [signatureDialogOpen, setSignatureDialogOpen] = React.useState(false);
  const [activeSignatureFieldId, setActiveSignatureFieldId] = React.useState<
    string | null
  >(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);

  const handleSignatureOpen = (fieldId: string) => {
    setActiveSignatureFieldId(fieldId);
    setSignatureDialogOpen(true);
  };

  const handleSignatureApply = () => {
    if (!activeSignatureFieldId) return;
    setValues((prev) => ({
      ...prev,
      [activeSignatureFieldId]: fullName,
    }));
    setSignatureDialogOpen(false);
    setActiveSignatureFieldId(null);
  };

  const handleSaveDraft = async () => {
    if (!pageRef.current || isSaving) return;
    setIsSaving(true);

    try {
      const response = await fetch(pdfSource);
      const pdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const [page] = pdfDoc.getPages();
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const bounds = pageRef.current.getBoundingClientRect();
      const scaleX = pageWidth / bounds.width;
      const scaleY = pageHeight / bounds.height;
      const textFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const signatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

      const wrapText = (
        text: string,
        fontSize: number,
        maxWidth: number,
      ): string[] => {
        const paragraphs = text.split(/\r?\n/);
        const lines: string[] = [];

        paragraphs.forEach((paragraph, index) => {
          const words = paragraph.split(/\s+/).filter(Boolean);
          let line = "";

          words.forEach((word) => {
            const testLine = line ? `${line} ${word}` : word;
            const lineWidth = textFont.widthOfTextAtSize(testLine, fontSize);
            if (lineWidth > maxWidth && line) {
              lines.push(line);
              line = word;
            } else {
              line = testLine;
            }
          });

          if (line) {
            lines.push(line);
          }

          if (index < paragraphs.length - 1) {
            lines.push("");
          }
        });

        return lines;
      };

      fillFields.forEach((field) => {
        const value = values[field.id]?.trim();
        if (!value) return;

        const x = field.x * scaleX;
        const y = pageHeight - field.y * scaleY - field.height * scaleY;
        const width = field.width * scaleX;
        const height = field.height * scaleY;
        const paddingX = 4 * scaleX;
        const paddingY = 3 * scaleY;

        if (field.type === "input") {
          const fontSize = Math.min(14, Math.max(9, height * 0.85));
          const textY = y + (height - fontSize) / 2 + paddingY;
          page.drawText(value, {
            x: x + paddingX,
            y: textY,
            size: fontSize,
            font: textFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          return;
        }

        if (field.type === "textarea") {
          const fontSize = Math.min(11, Math.max(8, height * 0.18));
          const lineHeight = fontSize * 1.2;
          const maxLines = Math.floor((height - paddingY * 2) / lineHeight);
          const lines = wrapText(value, fontSize, width - paddingX * 2);
          lines.slice(0, maxLines).forEach((line, index) => {
            const textY = y + height - paddingY - lineHeight * (index + 1);
            page.drawText(line, {
              x: x + paddingX,
              y: textY,
              size: fontSize,
              font: textFont,
              color: rgb(0.1, 0.1, 0.1),
            });
          });
          return;
        }

        if (field.type === "sign") {
          const fontSize = Math.min(20, Math.max(11, height * 0.65));
          const textWidth = signatureFont.widthOfTextAtSize(value, fontSize);
          const textX = x + (width - textWidth) / 2;
          const textY = y + (height - fontSize) / 2 + paddingY;
          page.drawText(value, {
            x: textX,
            y: textY,
            size: fontSize,
            font: signatureFont,
            color: rgb(0.18, 0.2, 0.35),
          });
        }
      });

      const outputBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(outputBytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${resolvedDoc.id}-bozza.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Errore salvataggio PDF:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-160px)] w-full flex-col gap-6 p-6">
      <DocumentHeader
        title={resolvedDoc.title}
        subtitle="Compila documento"
        meta={`${resolvedDoc.updatedAt} - ${resolvedDoc.owner}`}
        backHref="/user/doc_manager"
        actions={
          <>
            <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
              {isSaving ? "Salvataggio..." : "Salva bozza"}
            </Button>
            <Button onClick={() => setShareDialogOpen(true)}>Invia</Button>
          </>
        }
      />

      <DocumentCanvas containerRef={pageRef} pdfFile={pdfSource}>
        <DocFillOverlay
          fields={fillFields}
          values={values}
          onChangeValue={(fieldId, value) =>
            setValues((prev) => ({ ...prev, [fieldId]: value }))
          }
          onSign={handleSignatureOpen}
        />
      </DocumentCanvas>

      <SignatureDialog
        open={signatureDialogOpen}
        fullName={fullName}
        onOpenChange={(open) => {
          setSignatureDialogOpen(open);
          if (!open) {
            setActiveSignatureFieldId(null);
          }
        }}
        onConfirm={handleSignatureApply}
      />

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Condividi documento</DialogTitle>
            <DialogDescription>
              Scegli come inviare il documento compilato. (Mock)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">Email</p>
                <p className="text-xs text-muted-foreground">
                  Invia tramite email al destinatario.
                </p>
              </div>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <MessageSquareText className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">Slack</p>
                <p className="text-xs text-muted-foreground">
                  Condividi in un canale o via DM.
                </p>
              </div>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Link2 className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">Link condiviso</p>
                <p className="text-xs text-muted-foreground">
                  Genera un link sicuro per la condivisione.
                </p>
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
