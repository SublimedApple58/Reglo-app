"use client";

import React from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DocumentCanvas } from "@/components/pages/DocManager/DocumentCanvas";
import { DocFillOverlay } from "@/components/pages/DocManager/doc-fill/DocFillOverlay";
import type { FillField } from "@/components/pages/DocManager/doc-manager.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

type PublicDocFillPageProps = {
  token: string;
};

type RequestData = {
  id: string;
  name: string;
  status: string;
  completedAt?: string | null;
  completedByName?: string | null;
  template: {
    id: string;
    name: string;
    sourceUrl?: string | null;
  };
  fields: Array<{
    id: string;
    type: string;
    label?: string | null;
    bindingKey?: string | null;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    meta?: {
      unit?: "ratio";
    } | null;
  }>;
};

const mapFieldLabel = (field: RequestData["fields"][number]) =>
  field.bindingKey ??
  field.label ??
  (field.type === "input"
    ? "Input"
    : field.type === "sign"
      ? "Sign"
      : "Text area");

export function PublicDocFillPage({
  token,
}: PublicDocFillPageProps): React.ReactElement {
  const toast = useFeedbackToast();
  const [request, setRequest] = React.useState<RequestData | null>(null);
  const [pdfFile, setPdfFile] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<FillField[]>([]);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const overlayRefs = React.useRef<Record<number, React.RefObject<HTMLDivElement>>>(
    {},
  );

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const isCompleted = request?.status === "completed";

  const getOverlayRef = React.useCallback(
    (page: number) => {
      if (!overlayRefs.current[page]) {
        overlayRefs.current[page] = React.createRef<HTMLDivElement>();
      }
      return overlayRefs.current[page];
    },
    [],
  );

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/public/document-requests/${token}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message ?? "Impossibile caricare il documento.");
        }
        if (!isMounted) return;
        const payload = data.data as RequestData;
        setRequest(payload);
        setPdfFile(payload.template.sourceUrl ?? null);
        const mappedFields: FillField[] = payload.fields.map((field) => ({
          id: field.id,
          type: field.type as FillField["type"],
          label: mapFieldLabel(field),
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          meta: field.meta ?? null,
        }));
        setFields(mappedFields);
        setValues(Object.fromEntries(mappedFields.map((field) => [field.id, ""])));
      } catch (error) {
        if (isMounted) {
          toast.error({
            description:
              error instanceof Error ? error.message : "Errore inatteso.",
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [token, toast]);

  const handleSign = (fieldId: string) => {
    if (isCompleted) return;
    if (!fullName) {
      toast.error({ description: "Inserisci nome e cognome per firmare." });
      return;
    }
    setValues((prev) => ({ ...prev, [fieldId]: fullName }));
  };

  const handleComplete = async () => {
    if (isSubmitting || isCompleted) return;
    if (!fullName) {
      toast.error({ description: "Inserisci nome e cognome." });
      return;
    }
    if (!pdfFile) {
      toast.error({ description: "Documento non disponibile." });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(pdfFile);
      const pdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const textFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const signatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      const pageMetrics = new Map<
        number,
        {
          page: (typeof pages)[number];
          scaleX: number;
          scaleY: number;
          height: number;
          bounds: DOMRect;
        }
      >();

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

      const getMetricsForPage = (pageNumber: number) => {
        if (pageMetrics.has(pageNumber)) {
          return pageMetrics.get(pageNumber) ?? null;
        }
        const page = pages[pageNumber - 1];
        if (!page) return null;
        const bounds =
          overlayRefs.current[pageNumber]?.current?.getBoundingClientRect();
        if (!bounds) return null;
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const scaleX = pageWidth / bounds.width;
        const scaleY = pageHeight / bounds.height;
        const metrics = { page, scaleX, scaleY, height: pageHeight, bounds };
        pageMetrics.set(pageNumber, metrics);
        return metrics;
      };

      fields.forEach((field) => {
        const value = values[field.id]?.trim();
        if (!value) return;
        const metrics = getMetricsForPage(field.page);
        if (!metrics) return;

        const resolved = field.meta?.unit === "ratio"
          ? {
              x: field.x * metrics.bounds.width,
              y: field.y * metrics.bounds.height,
              width: field.width * metrics.bounds.width,
              height: field.height * metrics.bounds.height,
            }
          : {
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height,
            };

        const x = resolved.x * metrics.scaleX;
        const y =
          metrics.height -
          resolved.y * metrics.scaleY -
          resolved.height * metrics.scaleY;
        const width = resolved.width * metrics.scaleX;
        const height = resolved.height * metrics.scaleY;
        const paddingX = 4 * metrics.scaleX;
        const paddingY = 3 * metrics.scaleY;

        if (field.type === "input") {
          const fontSize = Math.min(14, Math.max(9, height * 0.85));
          const textY = y + (height - fontSize) / 2 + paddingY;
          metrics.page.drawText(value, {
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
            metrics.page.drawText(line, {
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
          metrics.page.drawText(value, {
            x: textX,
            y: textY,
            size: fontSize,
            font: signatureFont,
            color: rgb(0.18, 0.2, 0.35),
          });
        }
      });

      const outputBytes = await pdfDoc.save();
      const fileBlob = new Blob([new Uint8Array(outputBytes)], {
        type: "application/pdf",
      });

      const formData = new FormData();
      formData.append("file", fileBlob, "documento.pdf");
      formData.append("fullName", fullName);
      formData.append("payload", JSON.stringify(values));

      const result = await fetch(
        `/api/public/document-requests/${token}/complete`,
        {
          method: "POST",
          body: formData,
        },
      );
      const resultJson = await result.json();
      if (!result.ok || !resultJson.success) {
        throw new Error(resultJson.message ?? "Errore salvataggio documento.");
      }

      setRequest((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              completedByName: fullName,
            }
          : prev,
      );
      toast.success({
        title: "Documento completato",
        description: "Grazie! La compilazione è stata inviata.",
      });
    } catch (error) {
      toast.error({
        description:
          error instanceof Error
            ? error.message
            : "Errore durante la compilazione.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Caricamento documento...</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Documento non disponibile.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-24 sm:pb-0">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-10">
        <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {request.template.name}
              </p>
              <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                {request.name}
              </h1>
              <p className="mt-2 hidden text-sm text-muted-foreground sm:block">
                Inserisci nome e cognome, poi compila il documento.
              </p>
              <p className="mt-2 text-xs text-muted-foreground sm:hidden">
                Compila il documento dal telefono e firma in pochi passi.
              </p>
            </div>
            <div className="hidden gap-3 sm:grid sm:grid-cols-2">
              <Input
                placeholder="Nome"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={isCompleted}
              />
              <Input
                placeholder="Cognome"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={isCompleted}
              />
            </div>
            {isCompleted ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Documento completato da {request.completedByName ?? "utente"}.
              </div>
            ) : null}
          </div>
        </div>

        <div className="-mx-4 sm:mx-0">
          <DocumentCanvas
            className="rounded-none bg-transparent p-0 sm:rounded-2xl sm:bg-muted/40 sm:p-6"
            scrollClassName="pb-24 sm:pb-0"
            pdfFile={pdfFile ?? undefined}
            renderOverlay={(pageNumber, _pageRef) => (
              <DocFillOverlay
                key={`public-fill-${pageNumber}`}
                pageNumber={pageNumber}
                fields={fields}
                values={values}
                overlayRef={getOverlayRef(pageNumber)}
                onChangeValue={(fieldId, value) => {
                  if (isCompleted) return;
                  setValues((prev) => ({ ...prev, [fieldId]: value }));
                }}
                onSign={handleSign}
              />
            )}
          />
        </div>

        <div className="hidden justify-end sm:flex">
          <Button
            onClick={handleComplete}
            disabled={isSubmitting || isCompleted}
          >
            {isCompleted
              ? "Completato"
              : isSubmitting
                ? "Invio in corso..."
                : "Completa documento"}
          </Button>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3">
          {isCompleted ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Documento completato da {request.completedByName ?? "utente"}.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Nome"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={isCompleted}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Cognome"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={isCompleted}
                  className="h-9 text-sm"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleComplete}
                disabled={isSubmitting || isCompleted}
              >
                {isSubmitting ? "Invio in corso..." : "Completa documento"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
