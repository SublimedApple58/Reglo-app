"use client";

import React from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DocumentCanvas } from "@/components/pages/DocManager/DocumentCanvas";
import { DocumentHeader } from "@/components/pages/DocManager/DocumentHeader";
import { pdfSource } from "@/components/pages/DocManager/doc-manager.data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useSession } from "next-auth/react";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { getCurrentCompany } from "@/lib/actions/company.actions";
import { getDocumentConfig } from "@/lib/actions/document.actions";
import { createDocumentRequest } from "@/lib/actions/document-requests.actions";
import { useLocale } from "next-intl";
import type { FillField } from "@/components/pages/DocManager/doc-manager.types";

type DocFillWrapperProps = {
  docId?: string;
};

export function DocFillWrapper({ docId }: DocFillWrapperProps): React.ReactElement {
  const toast = useFeedbackToast();
  const { data: session } = useSession();
  const locale = useLocale();
  const [doc, setDoc] = React.useState<{
    id: string;
    title: string;
    updatedAt: string;
    owner: string;
  } | null>(null);
  const [pdfFile, setPdfFile] = React.useState<string>(pdfSource);
  const [fields, setFields] = React.useState<FillField[]>([]);
  const fullName = session?.user?.name?.trim() || "Reglo User";
  const overlayRefs = React.useRef<Record<number, React.RefObject<HTMLDivElement>>>(
    {},
  );
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [signatureDialogOpen, setSignatureDialogOpen] = React.useState(false);
  const [activeSignatureFieldId, setActiveSignatureFieldId] = React.useState<
    string | null
  >(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
  const [requestName, setRequestName] = React.useState("");
  const [generatedLink, setGeneratedLink] = React.useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = React.useState(false);
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const loadRef = React.useRef<string | null>(null);

  const getOverlayRef = React.useCallback(
    (page: number) => {
      if (!overlayRefs.current[page]) {
        overlayRefs.current[page] = React.createRef<HTMLDivElement>();
      }
      return overlayRefs.current[page];
    },
    [],
  );

  const formatUpdatedAt = React.useCallback((iso: string) => {
    const updated = new Date(iso);
    const diffMs = Date.now() - updated.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (Number.isNaN(diffMinutes)) return "Aggiornato ora";
    if (diffMinutes < 1) return "Aggiornato ora";
    if (diffMinutes < 60) return `Aggiornato ${diffMinutes}m fa`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Aggiornato ${diffHours}h fa`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Aggiornato ${diffDays}gg fa`;
    return `Aggiornato il ${updated.toLocaleDateString("it-IT")}`;
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    const loadDocument = async () => {
      if (!docId) return;
      if (loadRef.current === docId) return;
      const companyRes = await getCurrentCompany();
      if (!companyRes.success || !companyRes.data) {
        if (isMounted) {
          toast.error({ description: companyRes.message ?? "Company non trovata." });
        }
        return;
      }
      setCompanyId(companyRes.data.id);

      const configRes = await getDocumentConfig({
        companyId: companyRes.data.id,
        templateId: docId,
      });

      if (!configRes.success || !configRes.data) {
        toast.error({ description: configRes.message ?? "Documento non trovato." });
        return;
      }

      const ownerName = session?.user?.name ?? companyRes.data.name ?? "Reglo";
      setDoc({
        id: configRes.data.id,
        title: configRes.data.name,
        updatedAt: formatUpdatedAt(configRes.data.updatedAt.toString()),
        owner: ownerName,
      });
      setPdfFile(configRes.data.sourceUrl ?? pdfSource);
      const loadedFields = configRes.data.fields.map((field) => ({
        id: field.id,
        type: field.type as FillField["type"],
        label:
          field.bindingKey ??
          field.label ??
          (field.type === "input"
            ? "Input"
            : field.type === "sign"
              ? "Sign"
              : "Text area"),
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        meta: (field.meta as { unit?: "ratio" } | null) ?? null,
      }));
      setFields(loadedFields);
      setValues(
        Object.fromEntries(loadedFields.map((field) => [field.id, ""]))
      );
      loadRef.current = docId;
    };

    loadDocument();
    return () => {
      isMounted = false;
    };
  }, [docId, formatUpdatedAt, session?.user?.name, toast]);

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
    if (isSaving) return;
    setIsSaving(true);

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
      const blob = new Blob([new Uint8Array(outputBytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${docId ?? "documento"}-bozza.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Errore salvataggio PDF:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!docId || !companyId || isGeneratingLink) return;
    const trimmed = requestName.trim();
    if (!trimmed) {
      toast.error({ description: "Inserisci un nome per la compilazione." });
      return;
    }

    setIsGeneratingLink(true);
    const res = await createDocumentRequest({
      companyId,
      templateId: docId,
      name: trimmed,
    });
    setIsGeneratingLink(false);

    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Errore generazione link." });
      return;
    }

    const origin = window.location.origin;
    const url = `${origin}/${locale}${res.data.path}`;
    setGeneratedLink(url);
    toast.success({ description: "Link generato." });
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      toast.success({ description: "Link copiato negli appunti." });
    } catch (error) {
      toast.error({ description: "Impossibile copiare il link." });
    }
  };

  const resolvedDoc = doc ?? {
    id: docId ?? "doc",
    title: "Documento",
    updatedAt: "Aggiornato ora",
    owner: "Reglo",
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

      <DocumentCanvas
        pdfFile={pdfFile}
        renderOverlay={(pageNumber, _pageRef) => (
          <DocFillOverlay
            key={`fill-overlay-${pageNumber}`}
            pageNumber={pageNumber}
            fields={fields}
            values={values}
            overlayRef={getOverlayRef(pageNumber)}
            onChangeValue={(fieldId, value) =>
              setValues((prev) => ({ ...prev, [fieldId]: value }))
            }
            onSign={handleSignatureOpen}
          />
        )}
      />

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
              Scegli come inviare il documento. Il link crea una compilazione pubblica.
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
              onClick={() => {
                setShareDialogOpen(false);
                setLinkDialogOpen(true);
              }}
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

      <Dialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open);
          if (!open) {
            setRequestName("");
            setGeneratedLink(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Genera link di compilazione</DialogTitle>
            <DialogDescription>
              Dai un nome al documento compilato. Il link sarà pubblico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              placeholder="Es. Contratto Rossi"
              value={requestName}
              onChange={(event) => setRequestName(event.target.value)}
            />
            {generatedLink ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-foreground break-all">
                {generatedLink}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Chiudi
            </Button>
            {generatedLink ? (
              <Button onClick={handleCopyLink}>Copia link</Button>
            ) : (
              <Button onClick={handleGenerateLink} disabled={isGeneratingLink}>
                {isGeneratingLink ? "Generazione..." : "Genera link"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
