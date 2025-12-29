"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, PenLine } from "lucide-react";
import { PdfViewer } from "@/components/pages/DocManager/PdfViewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type DocItem = {
  id: string;
  title: string;
  updatedAt: string;
  owner: string;
};

type ToolId = "input" | "sign" | "textarea";

type FillField = {
  id: string;
  type: ToolId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const documents: DocItem[] = [
  {
    id: "doc-1",
    title: "Contratto fornitore 2025",
    updatedAt: "Aggiornato 2h fa",
    owner: "Tiziano",
  },
  {
    id: "doc-2",
    title: "Linee guida onboarding",
    updatedAt: "Aggiornato ieri",
    owner: "Ops team",
  },
  {
    id: "doc-3",
    title: "Report trimestrale",
    updatedAt: "Aggiornato 3gg fa",
    owner: "Finance",
  },
  {
    id: "doc-4",
    title: "Checklist ISO",
    updatedAt: "Aggiornato 1 settimana fa",
    owner: "Compliance",
  },
];

const mockFields: FillField[] = [
  {
    id: "field-1",
    type: "input",
    label: "Ragione sociale",
    x: 100,
    y: 280,
    width: 220,
    height: 20,
  },
  {
    id: "field-2",
    type: "textarea",
    label: "Note aggiuntive",
    x: 100,
    y: 630,
    width: 280,
    height: 110,
  },
  {
    id: "field-3",
    type: "sign",
    label: "Firma",
    x: 650,
    y: 870,
    width: 200,
    height: 44,
  },
];

const userProfile = {
  firstName: "Tiziano",
  lastName: "Di Felice",
};

const pdfSource = "/file/pdf_example.pdf";

export default function DocFillPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const doc = documents.find((item) => item.id === params?.id);
  const resolvedDoc = doc ?? {
    id: params?.id ?? "doc",
    title: "Documento mock",
    updatedAt: "Aggiornato ora",
    owner: "Reglo",
  };
  const fullName = `${userProfile.firstName} ${userProfile.lastName}`;
  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    mockFields.forEach((field) => {
      initial[field.id] = "";
    });
    return initial;
  });
  const [signatureDialogOpen, setSignatureDialogOpen] = React.useState(false);
  const [activeSignatureFieldId, setActiveSignatureFieldId] = React.useState<
    string | null
  >(null);
  const [isSaving, setIsSaving] = React.useState(false);

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

      mockFields.forEach((field) => {
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
      const blob = new Blob([outputBytes], { type: "application/pdf" });
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
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/user/doc_manager"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            BACK
          </Link>
          <div>
            <p className="text-xs text-muted-foreground">Compila documento</p>
            <h1 className="text-lg font-semibold text-foreground">
              {resolvedDoc.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {resolvedDoc.updatedAt} - {resolvedDoc.owner}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
            {isSaving ? "Salvataggio..." : "Salva bozza"}
          </Button>
          <Button>Invia</Button>
        </div>
      </header>

      <div className="flex-1 rounded-2xl bg-muted/40 p-6">
        <div className="mx-auto w-full max-w-4xl">
          <div
            ref={pageRef}
            className="relative mx-auto w-full overflow-hidden rounded-lg bg-white shadow-sm"
            style={{ aspectRatio: "8.5 / 11" }}
          >
            <PdfViewer />
            <div className="pointer-events-none absolute inset-0 z-10">
              {mockFields.map((field) => {
                const value = values[field.id] ?? "";
                const isSigned = field.type === "sign" && value.trim().length > 0;
                return (
                  <div
                    key={field.id}
                    className={cn(
                      "pointer-events-auto absolute rounded-md border border-primary/40 bg-white/90 text-[11px] text-foreground shadow-sm",
                      field.type === "sign" && "bg-primary/10",
                    )}
                    style={{
                      left: field.x,
                      top: field.y,
                      width: field.width,
                      height: field.height,
                    }}
                  >
                    {field.type === "input" ? (
                      <Input
                        value={value}
                        onChange={(event) =>
                          setValues((prev) => ({
                            ...prev,
                            [field.id]: event.target.value,
                          }))
                        }
                        placeholder={field.label}
                        className="h-full w-full border-0 bg-transparent px-2 py-0 text-[11px] font-medium shadow-none focus-visible:ring-0"
                      />
                    ) : null}
                    {field.type === "textarea" ? (
                      <Textarea
                        value={value}
                        onChange={(event) =>
                          setValues((prev) => ({
                            ...prev,
                            [field.id]: event.target.value,
                          }))
                        }
                        placeholder={field.label}
                        className="h-full w-full resize-none border-0 bg-transparent px-2 py-1 text-[11px] font-medium shadow-none focus-visible:ring-0"
                      />
                    ) : null}
                    {field.type === "sign" ? (
                      <button
                        type="button"
                        onClick={() => handleSignatureOpen(field.id)}
                        className="flex h-full w-full items-center justify-center gap-2 rounded-md px-2 text-[11px] font-semibold text-muted-foreground"
                      >
                        <PenLine className="h-3.5 w-3.5" />
                        {isSigned ? (
                          <span
                            className="text-lg"
                            style={{
                              fontFamily: '"Times New Roman", Times, serif',
                              fontStyle: "italic",
                              color: "#2e3359",
                            }}
                          >
                            {value}
                          </span>
                        ) : (
                          field.label
                        )}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={signatureDialogOpen}
        onOpenChange={(open) => {
          setSignatureDialogOpen(open);
          if (!open) {
            setActiveSignatureFieldId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Firma documento</DialogTitle>
            <DialogDescription>
              Usa il nome dell&apos;utente per generare la firma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Nome e cognome
              </p>
              <Input value={fullName} disabled />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Anteprima firma
              </p>
              <div className="rounded-md border border-dashed border-primary/40 bg-muted/40 px-4 py-3">
                <span
                  className="text-2xl"
                  style={{
                    fontFamily: '"Times New Roman", Times, serif',
                    fontStyle: "italic",
                    color: "#2e3359",
                  }}
                >
                  {fullName}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSignatureApply}>Inserisci firma</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
